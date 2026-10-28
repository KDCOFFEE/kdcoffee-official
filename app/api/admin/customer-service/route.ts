import { AdminAuthorizationError, requireAdminAuthenticated } from "@/lib/adminAuthorization";
import { isSameOriginRequest } from "@/lib/requestSecurity";
import { ServiceValidationError } from "@/lib/customerServiceContent";
import { readCustomerServiceState, saveCustomerServiceState, ServiceConflictError } from "@/lib/customerServiceStore";
import { uploadWebsiteImageAsset } from "@/lib/assetImageUploads";
import { ImageSafetyError } from "@/lib/websiteImages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Origin" };
class BodyError extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function boundedBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new BodyError(415, "請使用 JSON 格式。");
  const reader = request.body?.getReader();
  if (!reader) throw new BodyError(400, "沒有儲存內容。");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > 1024 * 1024) { void reader.cancel().catch(() => undefined); throw new BodyError(413, "單次儲存內容過大。"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size))); }
  catch { throw new BodyError(400, "儲存內容格式不正確。"); }
}
async function handle(request: Request) {
  try {
    const session = await requireAdminAuthenticated();
    if (session.role !== "owner") throw new AdminAuthorizationError(403);
    if (request.method === "GET") return Response.json(await readCustomerServiceState(), { headers });
    const origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
    if (!origin || (site !== null && site !== "same-origin") || !isSameOriginRequest(request)) throw new BodyError(403, "無法確認操作來源，請重新整理後再試。");
    if (request.method === "POST") {
      const form = await request.formData(), file = form.get("file");
      if (!(file instanceof File)) throw new BodyError(400, "沒有選擇圖片。");
      if (form.has("assetId")) throw new BodyError(400, "此操作只建立新素材，不會覆寫既有素材。");
      // This surface owns access policy; all validation/processing/persistence is shared.
      return Response.json({ ok: true, ...await uploadWebsiteImageAsset(file, { validateSafety: true }) }, { status: 201, headers });
    }
    const value = await boundedBody(request);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 2 || !("revision" in value) || !("document" in value)) throw new ServiceValidationError("儲存欄位不正確。");
    const body = value as { revision: number; document: unknown };
    return Response.json(await saveCustomerServiceState(body), { headers });
  } catch (error) {
    const status = error instanceof AdminAuthorizationError ? error.status : error instanceof BodyError ? error.status : error instanceof ImageSafetyError ? error.status : error instanceof ServiceValidationError ? 400 : error instanceof ServiceConflictError ? 409 : 500;
    const message = error instanceof BodyError || error instanceof ServiceValidationError || error instanceof ImageSafetyError ? error.message : status === 401 ? "請先登入後台。" : status === 403 ? "此設定限 Owner 管理。" : status === 409 ? "內容已由另一個視窗更新。草稿已保留，請重新載入後再編輯。" : "客服內容無法儲存或讀取，請稍後再試。";
    return Response.json({ error: message }, { status, headers });
  }
}
export const GET = handle;
export const PUT = handle;
export const POST = handle;
