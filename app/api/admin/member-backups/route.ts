import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { createMemberBackup, listMemberBackups } from "@/lib/memberBackup";
import {
  ensureManualBackupStorage,
  MemberBackupStorageError,
  readMemberBackupStorageMetrics,
} from "@/lib/memberBackupRetention";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  try {
    const [backups, storage] = await Promise.all([listMemberBackups(), readMemberBackupStorageMetrics()]);
    return NextResponse.json({ ok: true, backups, storage }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "會員備份儲存狀態目前無法安全讀取" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  try {
    const storage = await ensureManualBackupStorage();
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
      storage,
      manifest,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MemberBackupStorageError) {
      return NextResponse.json({
        error: "會員手動備份因儲存空間安全門檻暫停",
        code: error.code,
        storage: error.metrics,
      }, { status: 507, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "會員備份建立失敗" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
