import { AdminAuthorizationError, requireAdminAuthenticated } from "./adminAuthorization";
import { isSameOriginRequest } from "./requestSecurity";
import { readGiftCmsEditor } from "./giftCmsAdmin";
import { GiftCmsConflictError, GiftCmsNotFoundError, saveGiftCmsDocument } from "./giftCmsStore";
import { GiftCmsValidationError } from "./giftCms";
import { isStoreProductSlug } from "./storePublicMetadata";

const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Origin" };
class TransportError extends Error { readonly status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
async function boundedBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new TransportError(415, "請使用 JSON 格式。");
  const reader = request.body?.getReader(); if (!reader) throw new TransportError(400, "沒有儲存內容。");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try { while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > 1024 * 1024) { void reader.cancel().catch(() => undefined); throw new TransportError(413, "單次儲存內容過大。"); } chunks.push(next.value); } }
  finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, bytes))); } catch { throw new TransportError(400, "儲存內容格式不正確。"); }
}
export async function handleGiftCms(request: Request, scope: "landing" | "product" | "storeLanding" | "storeProduct", slug?: string) {
  try {
    const session = await requireAdminAuthenticated(); if (session.role !== "owner") throw new AdminAuthorizationError(403);
    if ((scope === "product" || scope === "storeProduct") && !isStoreProductSlug(slug)) throw new TransportError(400, "商品連結不正確。");
    if (request.method === "GET") return Response.json(await readGiftCmsEditor(slug, scope === "storeLanding" || scope === "storeProduct"), { headers });
    const origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
    if (!origin || (site !== null && site !== "same-origin") || !isSameOriginRequest(request)) throw new TransportError(403, "無法確認操作來源，請重新整理後再試。");
    const value = await boundedBody(request);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !["revision", "document"].includes(k))) throw new GiftCmsValidationError();
    const body = value as { revision: number; document: unknown };
    return Response.json(await saveGiftCmsDocument({ ...body, scope, slug }), { headers });
  } catch (error) {
    const status = error instanceof AdminAuthorizationError ? error.status : error instanceof TransportError ? error.status : error instanceof GiftCmsConflictError ? 409 : error instanceof GiftCmsNotFoundError ? 404 : error instanceof GiftCmsValidationError ? 400 : 500;
    const message = error instanceof TransportError || error instanceof GiftCmsValidationError ? error.message : status === 401 ? "請先登入後台。" : status === 403 ? "此工作區限 Owner 使用。" : status === 404 ? "找不到商店商品。" : status === 409 ? "內容已被更新，請重新載入後再編輯。" : "無法完成操作，請重新載入以確認內容。";
    return Response.json({ error: message }, { status, headers });
  }
}
