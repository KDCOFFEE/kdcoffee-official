import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readAdminSession } from "./adminAuth";
import { isSameOriginRequest } from "./requestSecurity";
import { createStoreRepository, StoreEntityNotFoundError, StoreRepositoryIntegrityError, StoreRevisionConflictError } from "./storeRepository";
import { STORE_CATEGORY_FIELDS, STORE_PRODUCT_FIELDS, STORE_SECTION_FIELDS, StoreValidationError, storeInputRecord } from "./storeValidation";

type Kind = "sections" | "categories" | "products";
const headers = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 512 * 1024;
class RequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireStoreOwner() {
  const session = await readAdminSession();
  if (!session) throw new RequestError(401, "請先登入後台。");
  if (session.role !== "owner") throw new RequestError(403, "此工作區限 Owner 使用。");
}
async function body(request: Request) {
  if (!isSameOriginRequest(request)) throw new RequestError(403, "無法確認操作來源。");
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new RequestError(415, "請使用 JSON 格式。");
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) throw new RequestError(413, "資料內容過大。");
  if (!request.body) throw new RequestError(400, "缺少資料內容。");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new RequestError(413, "資料內容過大。"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new RequestError(400, "JSON 格式不正確。"); }
}
function failure(error: unknown) {
  const status = error instanceof RequestError ? error.status : error instanceof StoreRepositoryIntegrityError ? 500 : error instanceof StoreRevisionConflictError ? 409 : error instanceof StoreEntityNotFoundError ? 404 : error instanceof StoreValidationError ? 400 : 500;
  const message = status === 409 ? "資料已被其他操作更新，請重新載入後再儲存。" : status === 500 ? "Store 資料暫時無法讀取或儲存，請稍後再試。" : error instanceof Error ? error.message : "操作失敗。";
  return NextResponse.json({ error: message }, { status, headers });
}
export async function getStoreAdminCatalog() {
  try { await requireStoreOwner(); return NextResponse.json(await createStoreRepository().read(), { headers }); }
  catch (error) { return failure(error); }
}
export function storeAdminHandlers(kind: Kind) {
  const fields = kind === "sections" ? STORE_SECTION_FIELDS : kind === "categories" ? STORE_CATEGORY_FIELDS : STORE_PRODUCT_FIELDS;
  return {
    async POST(request: Request) {
      try {
        await requireStoreOwner();
        const input = storeInputRecord(await body(request), kind === "products" ? [...fields, "subscriptionEligible"] : fields, `${kind}.create`);
        const repository = createStoreRepository();
        const values = { ...input, id: `store-${kind.slice(0, -1)}-${randomUUID()}` };
        const result = kind === "sections" ? await repository.createSection(values) : kind === "categories" ? await repository.createCategory(values) : await repository.createProduct(values);
        return NextResponse.json(result, { status: 201, headers });
      } catch (error) { return failure(error); }
    },
    async PATCH(request: Request) {
      try {
        await requireStoreOwner();
        const envelope = storeInputRecord(await body(request), ["id", "expectedRevision", "action", "changes"], `${kind}.operation`);
        if (typeof envelope.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(envelope.id)) throw new StoreValidationError("有效的資料 ID 為必填。");
        if (typeof envelope.expectedRevision !== "number" || !Number.isSafeInteger(envelope.expectedRevision) || envelope.expectedRevision < 1) throw new StoreValidationError("請提供有效的資料版本。");
        const repository = createStoreRepository();
        const id = envelope.id, revision = envelope.expectedRevision;
        let result;
        if (envelope.action === "archive") {
          if ("changes" in envelope) throw new StoreValidationError("封存操作不可同時修改欄位。");
          result = kind === "sections" ? await repository.archiveSection(id, revision) : kind === "categories" ? await repository.archiveCategory(id, revision) : await repository.archiveProduct(id, revision);
        } else if (envelope.action === "update") {
          const changes = storeInputRecord(envelope.changes, fields, `${kind}.changes`);
          result = kind === "sections" ? await repository.updateSection(id, revision, changes) : kind === "categories" ? await repository.updateCategory(id, revision, changes) : await repository.updateProduct(id, revision, changes);
        } else throw new StoreValidationError("不支援此操作。");
        return NextResponse.json(result, { headers });
      } catch (error) { return failure(error); }
    },
  };
}
