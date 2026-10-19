import { AdminAuthorizationError, requireAdminAuthenticated } from "@/lib/adminAuthorization";
import {
  readWorksArtworkOwnerModel,
  worksArtworkOwnerReadFailure,
  type WorksArtworkOwnerReadErrorCode,
} from "@/lib/worksArtworkOwnerReadService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
const statuses: Record<WorksArtworkOwnerReadErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_ARTWORK_REFERENCE: 400,
  ARTWORK_NOT_FOUND: 404,
  ARTWORK_SOURCE_INVALID: 500,
  OWNER_READ_MODEL_FAILED: 500,
  INTERNAL_ERROR: 500,
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const session = await requireAdminAuthenticated();
    // Same Owner-role policy as the existing Store/LINE Owner workspaces.
    // Reuse signed Admin authentication; no new permission/session mechanism.
    if (session.role !== "owner") throw new AdminAuthorizationError(403);
    const { slug } = await context.params;
    const result = await readWorksArtworkOwnerModel(slug);
    return Response.json(result, { status: result.ok ? 200 : statuses[result.error.code], headers });
  } catch (error) {
    const code = error instanceof AdminAuthorizationError
      ? error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN"
      : "INTERNAL_ERROR";
    return Response.json(worksArtworkOwnerReadFailure(code), { status: statuses[code], headers });
  }
}
