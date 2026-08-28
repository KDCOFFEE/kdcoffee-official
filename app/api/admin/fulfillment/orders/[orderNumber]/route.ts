import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { associateExternalFulfillment, evaluatePickupDeadlines, FulfillmentError, fulfillmentRecordForOrder, readFulfillmentStore, recordAdminFulfillmentEvent } from "@/lib/fulfillment";
import { readOrder } from "@/lib/adminOrders";
import type { FulfillmentState } from "@/lib/fulfillmentTypes";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const { orderNumber } = await params;
  const order = await readOrder(orderNumber);
  if (!order) return NextResponse.json({ error: "找不到訂單" }, { status: 404 });
  const record = fulfillmentRecordForOrder(await readFulfillmentStore(), order);
  return NextResponse.json({ record }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const { orderNumber } = await params;
  try {
    const body = await request.json();
    let record;
    if (body.action === "associate") record = await associateExternalFulfillment({ orderId: orderNumber, externalOrderId: String(body.externalOrderId || ""), externalShipmentId: String(body.externalShipmentId || "") || undefined, expectedRevision: Number(body.expectedRevision) });
    else if (body.action === "recheck") {
      await evaluatePickupDeadlines();
      const order = await readOrder(orderNumber);
      if (!order) throw new FulfillmentError("找不到訂單",404);
      record = fulfillmentRecordForOrder(await readFulfillmentStore(),order);
    } else record = (await recordAdminFulfillmentEvent({ orderId: orderNumber, state: String(body.state || "") as FulfillmentState, expectedRevision: Number(body.expectedRevision), confirmed: body.confirmed === true, note: String(body.note || ""), actor: "後台管理員" })).record;
    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "履約狀態更新失敗" }, { status: error instanceof FulfillmentError ? error.status : 500 });
  }
}
