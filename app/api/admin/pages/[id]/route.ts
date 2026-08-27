import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { atomicWriteJson, withFileLock } from "@/lib/jsonFileStore";
import { pageReferenceCount, publishedPageRegistry, validatePageDraft, type PageDraft } from "@/lib/pageBuilder";
import { validateWebsiteVisualStyle, type WebsiteVisualStyle } from "@/lib/pageBuilderVisualStyle";
import { readPageStore } from "@/lib/pageBuilderStore";
import { getHomepageDataFile, getPagesDataFile, getWebsiteDataFile } from "@/lib/storagePaths";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
class VersionConflict extends Error {}

async function productSlugs() {
  const website = JSON.parse(await fs.readFile(getWebsiteDataFile(), "utf8")) as { menu?: { products?: Array<{ slug?: string }> } };
  return new Set((website.menu?.products || []).map((item) => item.slug || "").filter(Boolean));
}

export async function PUT(request: Request, context: Context) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "尚未登入管理後台。" }, { status: 401 });
  const { id } = await context.params;
  try {
    const body = await request.json() as { version?: number; operation?: "save" | "publish" | "unpublish" | "saveVisualStyle"; draft?: PageDraft; visualStyle?: WebsiteVisualStyle };
    const result = await withFileLock(getPagesDataFile(), async () => {
      const store = await readPageStore();
      if (Number(body.version) !== store.version) throw new VersionConflict();
      const page = store.pages.find((item) => item.id === id);
      if (!page) throw new Error("找不到頁面。");
      if (body.operation === "saveVisualStyle") {
        store.visualStyle = validateWebsiteVisualStyle(body.visualStyle);
        const now = new Date().toISOString();
        store.version += 1; store.updatedAt = now;
        await atomicWriteJson(getPagesDataFile(), store);
        return { page, visualStyle: store.visualStyle, version: store.version, publishedPages: publishedPageRegistry(store) };
      }
      const publishedVisualStyle = body.operation === "publish" && body.visualStyle !== undefined
        ? validateWebsiteVisualStyle(body.visualStyle)
        : undefined;
      if (body.draft) { validatePageDraft(body.draft, await productSlugs()); page.draft = structuredClone(body.draft); }
      const now = new Date().toISOString();
      if (body.operation === "publish") { validatePageDraft(page.draft, await productSlugs()); if (publishedVisualStyle) store.visualStyle = publishedVisualStyle; page.publishedSnapshot = structuredClone(page.draft); page.status = "published"; page.publishedAt = now; }
      if (body.operation === "unpublish") page.status = "unpublished";
      page.updatedAt = now; store.version += 1; store.updatedAt = now;
      await atomicWriteJson(getPagesDataFile(), store);
      return { page, visualStyle: store.visualStyle, version: store.version, publishedPages: publishedPageRegistry(store) };
    });
    return NextResponse.json(result);
  } catch (error) {
    const conflict = error instanceof VersionConflict;
    return NextResponse.json({ error: conflict ? "頁面已在其他視窗更新，請重新整理後再儲存。" : error instanceof Error ? error.message : "儲存失敗。" }, { status: conflict ? 409 : 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "尚未登入管理後台。" }, { status: 401 });
  const { id } = await context.params;
  const url = new URL(request.url); const force = url.searchParams.get("force") === "true"; const expectedVersion = Number(url.searchParams.get("version"));
  try {
    const result = await withFileLock(getPagesDataFile(), async () => {
      const store = await readPageStore();
      if (expectedVersion !== store.version) throw new VersionConflict();
      const page = store.pages.find((item) => item.id === id); if (!page) throw new Error("找不到頁面。");
      const homepage = JSON.parse(await fs.readFile(getHomepageDataFile(), "utf8"));
      const references = pageReferenceCount(homepage, id) + pageReferenceCount(store.pages.filter((item) => item.id !== id), id);
      if (references > 0 && !force) return { warning: "目前有按鈕連結到這個頁面。刪除後連結會顯示為失效。", references, version: store.version };
      store.pages = store.pages.filter((item) => item.id !== id); store.version += 1; store.updatedAt = new Date().toISOString();
      await atomicWriteJson(getPagesDataFile(), store); return { ok: true, version: store.version };
    });
    return NextResponse.json(result, { status: "warning" in result ? 409 : 200 });
  } catch (error) {
    const conflict = error instanceof VersionConflict;
    return NextResponse.json({ error: conflict ? "頁面已在其他視窗更新，請重新整理。" : error instanceof Error ? error.message : "刪除失敗。" }, { status: conflict ? 409 : 400 });
  }
}
