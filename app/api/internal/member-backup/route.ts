import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { createMemberBackup, pruneMemberBackups } from "@/lib/memberBackup";

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
    const result = await createMemberBackup({ source: "railway_cron" });
    const retention = await pruneMemberBackups();
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
      counts: manifest.counts,
      retention,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "會員背景備份失敗" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
