import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { DEFAULT_WEBSITE_VISUAL_STYLE } from "../lib/pageBuilderVisualStyle.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { readWorksPageAdminState, saveWorksPageAdminState } from "../lib/worksPageAdminStore.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveWorksPageCms, resolveWorksPagePreviewMedia, type WorksPageCmsConfig } from "../lib/worksPageCms.ts";

let passed = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const originalDataDir = process.env.KD_DATA_DIR;
const root = await mkdtemp(path.join(os.tmpdir(), "kd-j1e1-works-media-preview-"));
const storeDir = path.join(root, "store");
await mkdir(storeDir, { recursive: true });
process.env.KD_DATA_DIR = root;

const files = {
  pages: path.join(storeDir, "pages.json"),
  website: path.join(storeDir, "website-data.json"),
  homepage: path.join(storeDir, "homepage.json"),
  assets: path.join(storeDir, "assets.json"),
  monthly: path.join(storeDir, "monthly-menus.json"),
};
const protectedSources = {
  works: path.join(process.cwd(), "app", "works", "page.tsx"),
  website: path.join(process.cwd(), "public", "data", "website-data.json"),
  pages: path.join(process.cwd(), "public", "data", "pages.json"),
  homepage: path.join(process.cwd(), "public", "data", "homepage.json"),
  assets: path.join(process.cwd(), "public", "data", "assets.json"),
  monthly: path.join(process.cwd(), "public", "data", "monthly-menus.json"),
};
const protectedBefore = Object.fromEntries(await Promise.all(Object.entries(protectedSources).map(async ([key, file]) => [key, hash(await readFile(file))])));

const localDesktop = { media: { type: "image" as const, provider: "local" as const, url: "/uploads/assets/page-builder/desktop.webp" }, alt: "" };
const localReplacement = { media: { type: "image" as const, provider: "local" as const, url: "/uploads/assets/page-builder/replacement.webp" }, alt: "替換素材" };
const cloudinaryDesktop = { media: { type: "image" as const, provider: "cloudinary" as const, url: "https://res.cloudinary.com/demo/image/upload/works-hero.webp", publicId: "kd-coffee/images/works-hero" }, alt: "Cloudinary Hero" };
const mobileVideo = { media: { type: "video" as const, provider: "cloudinary" as const, url: "https://res.cloudinary.com/demo/video/upload/works-mobile.mp4", posterUrl: "https://res.cloudinary.com/demo/video/upload/works-mobile.jpg", publicId: "kd-coffee/videos/works-mobile" }, alt: "手機 Hero 影片" };
const assetLibrary = { version: 4, updatedAt: "2026-09-02T00:00:00.000Z", assets: [{ id: "asset-desktop", category: "page-builder", name: "Desktop Hero", usage: "Hero", path: localDesktop.media.url, recommendedSize: "1600x900", displaySize: "1600x900", format: "webp", alt: "Desktop Hero", seoStem: "desktop-hero", status: "active" }] };
const product = { slug: "coffee-one", name: "咖啡一號", price: 500, stock: 9, listAsset: { path: "/products/coffee-one.webp" } };

try {
  await writeFile(files.pages, `${JSON.stringify({ version: 41, updatedAt: "2026-09-02T00:00:00.000Z", pages: [], visualStyle: DEFAULT_WEBSITE_VISUAL_STYLE, systemPages: { future: { retained: true } } }, null, 2)}\n`);
  await writeFile(files.website, `${JSON.stringify({ menu: { monthLabel: "九月精選", intro: "九月介紹", products: [product] } }, null, 2)}\n`);
  await writeFile(files.homepage, "{\"homepage\":\"keep\"}\n");
  await writeFile(files.assets, `${JSON.stringify(assetLibrary, null, 2)}\n`);
  await writeFile(files.monthly, "{\"monthly\":\"keep\"}\n");

  const noMedia = resolveWorksPageCms(undefined, { monthLabel: "九月精選", intro: "九月介紹" });
  check("no media retains the gradient/default preview", !resolveWorksPagePreviewMedia(noMedia.hero, "desktop") && noMedia.hero.overlayPreset === "current-gradient");
  check("desktop local persistent image resolves to its browser URL", resolveWorksPagePreviewMedia({ desktopMedia: localDesktop }, "desktop")?.media.url === localDesktop.media.url);
  check("Cloudinary image preserves its canonical delivery URL", resolveWorksPagePreviewMedia({ desktopMedia: cloudinaryDesktop }, "desktop")?.media.url === cloudinaryDesktop.media.url);
  check("unfinished unsaved image alt does not hide the draft media preview", resolveWorksPagePreviewMedia({ desktopMedia: localDesktop }, "desktop")?.alt === "");
  check("mobile preview uses the mobile override", resolveWorksPagePreviewMedia({ desktopMedia: localDesktop, mobileMedia: mobileVideo }, "mobile")?.media.url === mobileVideo.media.url);
  check("mobile preview falls back to desktop media", resolveWorksPagePreviewMedia({ desktopMedia: localDesktop }, "mobile")?.media.url === localDesktop.media.url);
  check("image and video discrimination remains canonical", resolveWorksPagePreviewMedia({ desktopMedia: cloudinaryDesktop }, "desktop")?.media.type === "image" && resolveWorksPagePreviewMedia({ desktopMedia: localDesktop, mobileMedia: mobileVideo }, "mobile")?.media.type === "video");
  check("replacing draft media changes preview without Save", resolveWorksPagePreviewMedia({ desktopMedia: localReplacement }, "desktop")?.media.url !== resolveWorksPagePreviewMedia({ desktopMedia: localDesktop }, "desktop")?.media.url);
  check("removing a draft media reference returns to fallback", resolveWorksPagePreviewMedia({}, "desktop") === undefined);

  const savedConfig: WorksPageCmsConfig = { schemaVersion: 1, hero: { desktopMedia: { ...localDesktop, alt: "已儲存桌機 Hero" }, mobileMedia: mobileVideo } };
  const assetsBeforeSave = hash(await readFile(files.assets));
  await saveWorksPageAdminState({ version: 41, works: savedConfig, now: new Date("2026-09-02T01:00:00.000Z") });
  const pagesBeforeGet = hash(await readFile(files.pages));
  const afterRefresh = await readWorksPageAdminState();
  check("saved GET state reconstructs desktop preview media", resolveWorksPagePreviewMedia(afterRefresh.savedConfig?.hero, "desktop")?.media.url === localDesktop.media.url);
  check("saved GET state reconstructs mobile preview media", resolveWorksPagePreviewMedia(afterRefresh.savedConfig?.hero, "mobile")?.media.url === mobileVideo.media.url);
  check("GET after Save remains write-free", hash(await readFile(files.pages)) === pagesBeforeGet);
  check("Asset Library records are neither deleted nor rewritten", hash(await readFile(files.assets)) === assetsBeforeSave && JSON.parse(await readFile(files.assets, "utf8")).assets.length === 1);
  check("Product media and commerce data remain unchanged", JSON.stringify(JSON.parse(await readFile(files.website, "utf8")).menu.products[0]) === JSON.stringify(product));

  const managerSource = await readFile(path.join(process.cwd(), "components", "admin", "WorksPageManager.tsx"), "utf8");
  const previewSource = await readFile(path.join(process.cwd(), "components", "admin", "WorksPagePreview.tsx"), "utf8");
  check("Admin preview receives the current unsaved hero draft", managerSource.includes("draftHero={draft.hero}"));
  check("Admin preview uses canonical KdMedia rendering", previewSource.includes("<KdMedia") && previewSource.includes("backgroundVideo") && previewSource.includes("resolveWorksPagePreviewMedia"));

  const protectedAfter = Object.fromEntries(await Promise.all(Object.entries(protectedSources).map(async ([key, file]) => [key, hash(await readFile(file))])));
  check("public app/works/page.tsx remains byte-identical", protectedAfter.works === protectedBefore.works);
  check("all real runtime data remains byte-identical", ["website", "pages", "homepage", "assets", "monthly"].every((key) => protectedAfter[key] === protectedBefore[key]));

  console.log(`Phase J.1E.1 Works Hero media preview: ${passed} PASS`);
} finally {
  if (originalDataDir === undefined) delete process.env.KD_DATA_DIR;
  else process.env.KD_DATA_DIR = originalDataDir;
  await rm(root, { recursive: true, force: true });
}
