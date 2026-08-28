import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { FulfillmentError, readLogisticsSettings, saveLogisticsSettings } from "@/lib/fulfillment";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  return NextResponse.json({ settings: await readLogisticsSettings() }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  try {
    const body = await request.json();
    const settings = await saveLogisticsSettings({
      expectedRevision: Number(body.expectedRevision),
      notificationEmail: String(body.notificationEmail || ""),
      automaticTrackingEnabled: body.automaticTrackingEnabled === true,
      pickupDeadlineDays: Number(body.pickupDeadlineDays),
      expiryPolicy: body.expiryPolicy,
      trackedEvents: {
        orderCreated: body.trackedEvents?.orderCreated === true,
        shipped: body.trackedEvents?.shipped === true,
        arrived: body.trackedEvents?.arrived === true,
        completed: body.trackedEvents?.completed === true,
      },
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "物流設定儲存失敗" }, { status: error instanceof FulfillmentError ? error.status : 500 });
  }
}
