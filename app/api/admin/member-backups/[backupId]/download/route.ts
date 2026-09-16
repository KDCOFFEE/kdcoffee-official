import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  createMemberBackupZipStream,
  getVerifiedMemberBackupForDownload,
  isValidMemberBackupId,
} from "@/lib/memberBackup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ backupId: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "未授權" }, { status: 401, headers: noStore });
  }

  const { backupId } = await params;
  if (!isValidMemberBackupId(backupId)) {
    return NextResponse.json({ error: "備份編號格式不正確" }, { status: 400, headers: noStore });
  }

  try {
    const verified = await getVerifiedMemberBackupForDownload(backupId);
    const body = await createMemberBackupZipStream(verified);
    return new Response(body, {
      status: 200,
      headers: {
        ...noStore,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="KD-Member-Backup-${backupId}.zip"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "會員備份下載失敗" },
      { status: 404, headers: noStore },
    );
  }
}
