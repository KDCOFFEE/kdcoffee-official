import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { GoogleDriveMemberBackupError, runScheduledMemberBackupOffsiteWorkflow } from "@/lib/googleDriveMemberBackup";
import { MemberBackupStorageError } from "@/lib/memberBackupRetention";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.MEMBER_BACKUP_CRON_SECRET?.trim();
  if (!expected) return false;
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  const provided = authorization.slice(7).trim();
  if (!provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!process.env.MEMBER_BACKUP_CRON_SECRET?.trim()) {
    return NextResponse.json({ error: "MEMBER_BACKUP_CRON_SECRET 尚未設定" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "未授權" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const { local, offsite, preflight, retention, driveRetention, storage } = await runScheduledMemberBackupOffsiteWorkflow();
    const { manifest } = local;
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
      counts: manifest.counts,
      offsite,
      preflight,
      retention,
      driveRetention,
      storage,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MemberBackupStorageError) {
      return NextResponse.json({
        error: "會員備份因儲存空間安全門檻暫停",
        code: error.code,
        storage: error.metrics,
        eligibleCronBackupCount: error.eligibleCronBackupCount,
        backupCreated: false,
      }, { status: 507, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof GoogleDriveMemberBackupError) {
      return NextResponse.json({
        error: "會員異地備份上傳失敗；Railway verified backup 已保留",
        code: error.code,
        backupId: error.backupId ?? null,
        googleStatus: error.googleStatus ?? null,
        localBackupRetained: Boolean(error.backupId),
        retentionRun: false,
      }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "會員背景備份失敗" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
