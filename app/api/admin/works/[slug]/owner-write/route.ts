import { AdminAuthorizationError, requireAdminAuthenticated } from "@/lib/adminAuthorization";
import { resolveAllowedRequestOrigins } from "@/lib/publicSiteOrigin";
import { worksRecord, worksReference } from "@/lib/worksArtworkContract";
import { validateWorksCommand } from "@/lib/worksArtworkValidation";
import { isWorksFirstEditField, isWorksEditorialText } from "@/lib/worksArtworkResolver";
import { writeWorksArtworkEditorialCommand, type WorksEditorialWriteResult } from "@/lib/worksArtworkEditorialWriteService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Origin" };
const MAX_BODY_BYTES = 32 * 1024;
const messages = {
  UNAUTHENTICATED: "請先登入後台。",
  FORBIDDEN: "此工作區限 Owner 使用。",
  INVALID_REFERENCE: "作品參照格式不正確。",
  INVALID_ORIGIN: "無法確認操作來源，請重新整理後再試。",
  UNSUPPORTED_MEDIA_TYPE: "請使用 JSON 格式。",
  PAYLOAD_TOO_LARGE: "儲存內容超過傳輸上限。",
  INVALID_WRITE_REQUEST: "儲存請求格式不正確。",
  INTERNAL_ERROR: "無法確認儲存結果，請重新讀取作品資料。",
} as const;
class TransportError extends Error {
  constructor(readonly status: number, readonly code: keyof typeof messages) {
    super(messages[code]);
  }
}
type ServiceErrorCode = Extract<WorksEditorialWriteResult, { ok: false }>["error"]["code"];
const serviceStatuses: Record<ServiceErrorCode, number> = {
  INVALID_REFERENCE: 400, ARTWORK_NOT_FOUND: 404, INVALID_WRITE_REQUEST: 400,
  FIELD_NOT_WRITABLE: 400, VALIDATION_FAILED: 400, REVISION_CONFLICT: 409,
  PERSISTENCE_FAILED: 500, INTERNAL_ERROR: 500,
};

function requireSameOrigin(request: Request) {
  // Reuse the Admin credit route's deployment-owned allowlist. Origin is mandatory
  // here; arbitrary Host/forwarded headers cannot authorize another public site.
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (!origin || (site !== null && site !== "same-origin")) throw new TransportError(403, "INVALID_ORIGIN");
  try {
    const source = new URL(origin);
    if ((source.protocol !== "http:" && source.protocol !== "https:") ||
      source.username || source.password || source.origin !== origin ||
      !resolveAllowedRequestOrigins(request).includes(source.origin)) {
      throw new TransportError(403, "INVALID_ORIGIN");
    }
  } catch {
    throw new TransportError(403, "INVALID_ORIGIN");
  }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new TransportError(415, "UNSUPPORTED_MEDIA_TYPE");
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && !/^\d+$/u.test(declared)) throw new TransportError(400, "INVALID_WRITE_REQUEST");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) throw new TransportError(413, "PAYLOAD_TOO_LARGE");
  if (!request.body) throw new TransportError(400, "INVALID_WRITE_REQUEST");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new TransportError(413, "PAYLOAD_TOO_LARGE");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof TransportError) throw error;
    throw new TransportError(400, "INVALID_WRITE_REQUEST");
  } finally {
    reader.releaseLock();
  }
  try {
    // Reject malformed UTF-8 rather than silently replacing Owner-entered bytes.
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size))) as unknown;
  } catch {
    throw new TransportError(400, "INVALID_WRITE_REQUEST");
  }
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const session = await requireAdminAuthenticated();
    if (session.role !== "owner") throw new AdminAuthorizationError(403);
    const { slug } = await context.params;
    if (!worksReference(slug)) throw new TransportError(400, "INVALID_REFERENCE");
    requireSameOrigin(request);
    const body = await readBoundedJson(request);
    const allowed = ["contractVersion", "expectedWorksRevision", "expectedEditToken", "requestId", "operations"];
    if (!worksRecord(body) || Object.keys(body).some(key => !allowed.includes(key))) {
      throw new TransportError(400, "INVALID_WRITE_REQUEST");
    }
    // Body cannot redirect the mutation. Only this URL slug supplies targetRef.
    const command = validateWorksCommand({ ...body, targetRef: slug });
    if (!command.ok || command.value.operations.some(operation =>
      !isWorksFirstEditField(operation.field) || operation.scope !== "updateEditorialContent" ||
      operation.state.mode !== "value" || !isWorksEditorialText(operation.state.value))) {
      throw new TransportError(400, "INVALID_WRITE_REQUEST");
    }
    // requestId is correlation only: no replay cache or exactly-once claim.
    const result = await writeWorksArtworkEditorialCommand(slug, command.value);
    return Response.json(result, { status: result.ok ? 200 : serviceStatuses[result.error.code], headers });
  } catch (error) {
    const failure = error instanceof AdminAuthorizationError
      ? { status: error.status, code: error.status === 401 ? "UNAUTHENTICATED" as const : "FORBIDDEN" as const }
      : error instanceof TransportError ? error : { status: 500, code: "INTERNAL_ERROR" as const };
    // No raw exceptions, source objects or assumed NOT_COMMITTED claim on an
    // unexpected post-service failure. The caller must reload to confirm state.
    return Response.json({ ok: false, error: { code: failure.code, message: messages[failure.code] } },
      { status: failure.status, headers });
  }
}
