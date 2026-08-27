import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getAssetLibrary } from "@/lib/assets";
import { atomicWriteJson, withFileLock } from "@/lib/jsonFileStore";
import { createPage, duplicatePage, publishedPageRegistry } from "@/lib/pageBuilder";
import { readPageStore } from "@/lib/pageBuilderStore";
import { getPagesDataFile, getWebsiteDataFile } from "@/lib/storagePaths";

export const dynamic = "force-dynamic";

async function products() {
  const website = JSON.parse(await fs.readFile(getWebsiteDataFile(), "utf8")) as { menu?: { products?: Array<Record<string, unknown>> } };
  return (website.menu?.products || []).map((product) => ({ slug: String(product.slug || ""), name: String(product.name || ""), active: product.active === false ? false : undefined, status: typeof product.status === "string" ? product.status : undefined })).filter((product) => product.slug && product.name);
}

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "尚未登入管理後台。" }, { status: 401 });
  const [store, productList, assetLibrary] = await Promise.all([readPageStore(), products(), getAssetLibrary()]);
  const assets = assetLibrary.assets.filter((asset) => asset.status === "active" && Boolean(asset.path));
  return NextResponse.json({ store, products: productList, publishedPages: publishedPageRegistry(store), assets });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "尚未登入管理後台。" }, { status: 401 });
  try {
    const body = await request.json() as { title?: string; sourceId?: string; version?: number };
    const result = await withFileLock(getPagesDataFile(), async () => {
      const store = await readPageStore();
      if (body.version !== undefined && Number(body.version) !== store.version) throw new Error("VERSION_CONFLICT");
      const source = body.sourceId ? store.pages.find((page) => page.id === body.sourceId) : undefined;
      if (body.sourceId && !source) throw new Error("找不到要複製的頁面。");
      const page = source ? duplicatePage(source, store.pages) : createPage(body.title || "", store.pages);
      store.pages.push(page); store.version += 1; store.updatedAt = new Date().toISOString();
      await atomicWriteJson(getPagesDataFile(), store);
      return { page, version: store.version };
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "建立頁面失敗。";
    return NextResponse.json({ error: message === "VERSION_CONFLICT" ? "頁面資料已在其他視窗更新，請重新整理。" : message }, { status: message === "VERSION_CONFLICT" ? 409 : 400 });
  }
}
