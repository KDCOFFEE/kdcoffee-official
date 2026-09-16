import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { createMemberBackup, listMemberBackups } from "@/lib/memberBackup";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const backups = await listMemberBackups();
  return NextResponse.json({ ok: true, backups }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  try {
    const result = await createMemberBackup({ source: "manual_admin" });
    const { manifest } = result;
    return NextResponse.json({
      ok: true,
      backupId: manifest.backupId,
      status: manifest.status,
      createdAt: manifest.createdAt,
      environment: manifest.environment,
      dataRoot: manifest.dataRoot,
      gitCommit: manifest.gitCommit,
      memberCount: manifest.counts.canonicalMembers,
      activeReferralCount: manifest.counts.activeReferrals,
      totalReferralCount: manifest.counts.totalReferrals,
      backupLocation: manifest.backupLocation,
      manifest,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "會員備份建立失敗" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
