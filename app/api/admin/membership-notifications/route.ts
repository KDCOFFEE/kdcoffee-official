import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { deliverPendingMembershipNotifications } from "@/lib/memberNotificationAutomation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const results = await deliverPendingMembershipNotifications({ limit: Number(body.limit) || 20 });
    return NextResponse.json({ processed: results.length, results: results.map((item) => ({ notificationId: item.notificationId, status: item.status, attempts: item.attempts, deliveredChannels: item.deliveredChannels })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "會員通知處理失敗" }, { status: 500 });
  }
}
