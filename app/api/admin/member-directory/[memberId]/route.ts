import { NextResponse } from "next/server";

import { adminPermissions, AdminAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { AdminMemberDirectoryError, adminMemberDirectoryErrorPayload, getAdminMemberDetail, readAdminMemberDirectorySnapshot } from "@/lib/adminMemberDirectory";

export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(_request: Request, context: { params: Promise<{ memberId: string }> }) {
  try {
    await requireAdminPermission(adminPermissions.membersSensitiveRead);
    const { memberId } = await context.params;
    const decoded = decodeURIComponent(memberId);
    if (!/^[A-Za-z0-9_-]{1,160}$/u.test(decoded)) return NextResponse.json({ error: "會員 ID 格式不正確" }, { status: 400, headers: privateHeaders });
    const snapshot = await readAdminMemberDirectorySnapshot();
    const detail = getAdminMemberDetail(snapshot, decoded);
    if (!detail) return NextResponse.json({ error: "找不到會員" }, { status: 404, headers: privateHeaders });
    return NextResponse.json(detail, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof URIError) return NextResponse.json({ error: "會員 ID 格式不正確" }, { status: 400, headers: privateHeaders });
    if (error instanceof AdminAuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    if (error instanceof AdminMemberDirectoryError) return NextResponse.json({ error: "會員詳細資料目前無法安全讀取", ...adminMemberDirectoryErrorPayload(error) }, { status: 503, headers: privateHeaders });
    throw error;
  }
}
