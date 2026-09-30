import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { deliverPendingMembershipNotifications } from "@/lib/memberNotificationAutomation";
import { runReferralRewardReleaseScheduler } from "@/lib/membershipCommerce";

export const dynamic = "force-dynamic";

function validCronSecret(request: Request) {
  const expected = process.env.REWARD_RELEASE_CRON_SECRET?.trim();
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();

  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  return (
    expectedBuffer.length === providedBuffer.length
    && timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export async function POST(request: Request) {
  if (!validCronSecret(request)) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    const releases = await runReferralRewardReleaseScheduler();
    const deliveries = await deliverPendingMembershipNotifications({ limit: 100 });
    const releaseSummary = {
      processed: releases.length,
      released: releases.filter((item) => item.status === "released").length,
      expired: releases.filter((item) => item.status === "expired").length,
      capBlocked: releases.filter((item) => item.status === "cap_blocked").length,
      failed: releases.filter((item) => item.status === "failed").length,
    };
    const notificationSummary = {
      processed: deliveries.length,
      delivered: deliveries.filter((item) => item.status === "delivered").length,
      pending: deliveries.filter((item) => item.status === "pending").length,
      failed: deliveries.filter((item) => item.status === "failed").length,
    };
    const accountingOk = releaseSummary.failed === 0;
    const notificationOk = notificationSummary.pending === 0 && notificationSummary.failed === 0;
    const notificationWarning = notificationOk
      ? null
      : {
          code: "notification_delivery_incomplete",
          message: "回饋入帳已完成，但部分通知尚未送達",
          pending: notificationSummary.pending,
          failed: notificationSummary.failed,
        };

    return NextResponse.json(
      {
        ok: accountingOk,
        notificationOk,
        notificationWarning,
        release: releaseSummary,
        notifications: notificationSummary,
      },
      { status: accountingOk ? 200 : 500 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "每日回饋發放工作失敗" },
      { status: 500 },
    );
  }
}
