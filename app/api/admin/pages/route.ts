import { readAdminSession } from '@/lib/adminAuth';
import { isSameOriginRequest } from '@/lib/requestSecurity';
import { saveGalleryAtmosphere, saveGallerySeo, GalleryPageVersionConflictError } from '@/lib/galleryPageAdminStore';
import { NextResponse } from "next/server";
import { saveHomepageSeo, HomepageSeoVersionConflictError } from "@/lib/homepageSeo";
import { resolveHomepageSearchAndShare } from "@/lib/systemPageSocialMetadata";
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

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("scope") === "homepageSeo") {
    const session = await readAdminSession();
    if (!session) return NextResponse.json({ error: "尚未登入管理後台。" }, { status: 401 });
    if (session.role !== "owner" || session.legacy) return NextResponse.json({ error: "此操作限 Owner 使用。" }, { status: 403 });
    const [store, library] = await Promise.all([readPageStore(), getAssetLibrary()]);
    const seo = store.systemPages?.homepage?.seo;
    const { effective, defaults } = await resolveHomepageSearchAndShare(seo);
    const defaultImage = effective.imageIsCustom ? (await resolveHomepageSearchAndShare()).effective.image : effective.image;
    const assets = library.assets.filter(asset => asset.status === "active" && Boolean(asset.path));
    return NextResponse.json({ version: store.version, seo, effective, defaults: { ...defaults, image: defaultImage }, assets }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
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

/** Page-wide Gallery appearance uses the existing systemPages store. */
export async function PUT(request: Request) {
  const session = await readAdminSession();
  if (!session) return NextResponse.json({ error: '尚未登入管理後台。' }, { status: 401 });
  if (session.role !== 'owner' || session.legacy) return NextResponse.json({ error: '此操作限 Owner 使用。' }, { status: 403 });
  if (!request.headers.get('origin') || !isSameOriginRequest(request)) return NextResponse.json({ error: '無法確認操作來源。' }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.scope === 'homepageSeo') {
      const { scope: _, version, ...fields } = body;
      return NextResponse.json(await saveHomepageSeo(version, fields));
    }
    if (body.scope === 'galleryAtmosphere') return NextResponse.json(await saveGalleryAtmosphere(body.version, body.atmosphere));
    if (body.scope === 'gallerySeo') return NextResponse.json(await saveGallerySeo(body.version, body.seo));
    throw new Error('不支援的頁面設定範圍。');
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '儲存失敗。' }, { status: error instanceof GalleryPageVersionConflictError || error instanceof HomepageSeoVersionConflictError ? 409 : 400 });
  }
}
