import { NextResponse } from "next/server";

import { adminPermissions, AdminAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { AdminMemberDirectoryError, adminMemberDirectoryErrorPayload, directoryPublicPayload, readAdminMemberDirectorySnapshot } from "@/lib/adminMemberDirectory";

export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET() {
  try {
    await requireAdminPermission(adminPermissions.membersSensitiveRead);
    const snapshot = await readAdminMemberDirectorySnapshot();
    return NextResponse.json(directoryPublicPayload(snapshot), { headers: privateHeaders });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    if (error instanceof AdminMemberDirectoryError) return NextResponse.json({ error: "會員資料快照目前無法安全讀取", ...adminMemberDirectoryErrorPayload(error) }, { status: 503, headers: privateHeaders });
    throw error;
  }
}
