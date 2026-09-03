import { promises as fs } from "fs";

import type { CoffeeArtwork, WebsiteData } from "@/data/websiteData";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { getAssetLibrary } from "./assets";
import { publishedPageRegistry } from "./pageBuilder";
import { readPageStore } from "./pageBuilderStore";
import { resolveWorksProductListing } from "./productListing";
import { resolveListAsset } from "./productVisualAssets";
import { getPagesDataFile, getWebsiteDataFile } from "./storagePaths";
import type { WorksPageCmsConfig } from "./worksPageCms";
import { resolveWorksPageCms, validateWorksPageCms } from "./worksPageCms";

export class WorksPageVersionConflictError extends Error {
  constructor() {
    super("資料已被其他操作更新，請重新整理後再試一次。");
    this.name = "WorksPageVersionConflictError";
  }
}

async function readLiveWorksData() {
  const website = JSON.parse(await fs.readFile(getWebsiteDataFile(), "utf8")) as WebsiteData;
  const products = Array.isArray(website.menu?.products) ? website.menu.products : [];
  return {
    live: {
      monthLabel: typeof website.menu?.monthLabel === "string" ? website.menu.monthLabel : "",
      intro: typeof website.menu?.intro === "string" ? website.menu.intro : "",
    },
    products: products
      .map((product) => ({
        slug: String(product.slug || ""),
        name: String(product.name || ""),
        active: product.active === false ? false : undefined,
        status: typeof product.status === "string" ? product.status : undefined,
      }))
      .filter((product) => product.slug && product.name),
    previewProducts: resolveWorksProductListing(products).map(toWorksPreviewProduct),
  };
}

export type WorksPreviewProduct = {
  slug: string;
  name: string;
  artist: string;
  tag?: string;
  listMedia: { path: string; alt: string } | null;
};

function toWorksPreviewProduct(product: CoffeeArtwork): WorksPreviewProduct {
  const listAsset = resolveListAsset(product);
  return {
    slug: product.slug,
    name: product.name,
    artist: product.artist,
    ...(product.tag ? { tag: product.tag } : {}),
    listMedia: listAsset
      ? { path: listAsset.path, alt: listAsset.alt || `${product.name} 主視覺` }
      : null,
  };
}

export async function readWorksPageAdminState() {
  const [store, liveData, assetLibrary] = await Promise.all([readPageStore(), readLiveWorksData(), getAssetLibrary()]);
  const savedConfig = store.systemPages?.works;
  return {
    version: store.version,
    hasSavedConfig: savedConfig !== undefined,
    savedConfig: savedConfig === undefined ? null : structuredClone(savedConfig),
    resolved: resolveWorksPageCms(savedConfig, liveData.live),
    live: liveData.live,
    products: liveData.products,
    previewProducts: liveData.previewProducts,
    publishedPages: publishedPageRegistry(store),
    assets: assetLibrary.assets.filter((asset) => asset.status === "active" && Boolean(asset.path)),
  };
}

export async function saveWorksPageAdminState(input: {
  version: number;
  works: WorksPageCmsConfig;
  now?: Date;
}) {
  if (!Number.isInteger(input.version) || input.version < 0) throw new Error("頁面版本格式不正確。");
  validateWorksPageCms(input.works);
  const { live } = await readLiveWorksData();
  const pagesPath = getPagesDataFile();
  const saved = await withFileLock(pagesPath, async () => {
    const store = await readPageStore();
    if (store.version !== input.version) throw new WorksPageVersionConflictError();
    store.systemPages = {
      ...(store.systemPages || {}),
      works: structuredClone(input.works),
    };
    store.version += 1;
    store.updatedAt = (input.now || new Date()).toISOString();
    await atomicWriteJson(pagesPath, store);
    return { version: store.version, savedConfig: structuredClone(store.systemPages.works) };
  });
  return {
    ...saved,
    hasSavedConfig: true as const,
    resolved: resolveWorksPageCms(saved.savedConfig, live),
  };
}
