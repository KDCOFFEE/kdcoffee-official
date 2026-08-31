import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { associateExternalFulfillment, evaluatePickupDeadlines, FulfillmentError, fulfillmentRecordForOrder, readFulfillmentStore, recordAdminFulfillmentEvent } from "@/lib/fulfillment";
import { readOrder } from "@/lib/adminOrders";
import type { FulfillmentState } from "@/lib/fulfillmentTypes";
import { applyOwnerOrderException } from "@/lib/ownerOrderExceptions";

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
    if (body.action === "override") {
      const order = await applyOwnerOrderException({ orderId: orderNumber, action: body.overrideAction === "change-store" ? "change-store" : "change-date", expectedFulfillmentRevision: Number(body.expectedRevision), idempotencyKey: String(body.idempotencyKey || ""), reason: String(body.reason || ""), date: body.date ? String(body.date) : undefined, store: body.store ? { id: String(body.store.id || ""), name: String(body.store.name || ""), address: String(body.store.address || "") } : undefined });
      record = fulfillmentRecordForOrder(await readFulfillmentStore(), order);
    } else if (body.action === "associate") record = await associateExternalFulfillment({ orderId: orderNumber, externalOrderId: String(body.externalOrderId || ""), externalShipmentId: String(body.externalShipmentId || "") || undefined, expectedRevision: Number(body.expectedRevision) });
    else if (body.action === "recheck") {
      await evaluatePickupDeadlines();
      const order = await readOrder(orderNumber);
      if (!order) throw new FulfillmentError("找不到訂單",404);
      record = fulfillmentRecordForOrder(await readFulfillmentStore(),order);
    } else {
      const state = String(body.state || "") as FulfillmentState;
      const reason = String(body.reason || "").trim();
      if (state === "uncollected" && !["門市確認逾期未取", "顧客確認不取貨", "物流退回確認", "其他人工確認"].includes(reason)) throw new FulfillmentError("請選擇人工確認未取貨的原因");
      const note = [reason, String(body.note || "").trim()].filter(Boolean).join("｜");
      record = (await recordAdminFulfillmentEvent({ orderId: orderNumber, state, expectedRevision: Number(body.expectedRevision), confirmed: body.confirmed === true, note, actor: "後台管理員" })).record;
    }
    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "履約狀態更新失敗" }, { status: error instanceof FulfillmentError ? error.status : 500 });
  }
}
