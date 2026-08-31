import { NextResponse } from "next/server";

import { readOrder, withStoredOrderUpdateLock } from "@/lib/adminOrders";
import { resolveCustomerOrderAccess } from "@/lib/customerOrderAccess";
import {
  appendOrderMessage,
  assessOrderInquiryState,
  authorizeOrderConversationAccess,
  createOrderInquiryLineAlertText,
  getOrderMessages,
  markOrderInquiryAlertClaimed,
  OrderMessageRateLimitError,
  OrderMessageValidationError,
  validateOrderMessage,
  validateOrderMessageActionId,
} from "@/lib/orderConversation";
import { orderStatusLabel } from "@/lib/orderInventoryPolicy";
import { sendInternalLineNotification } from "@/lib/internalLineNotifications";
import { buildOrderTimeline } from "@/lib/orderTimeline";
import { projectOrderFinancialBreakdown } from "@/lib/orderFinancialProjection";
import { getSafeOrderCreditReservation, type SafeOrderCreditReservation } from "@/lib/membershipCommerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validOrderNumber(value: string) {
  return /^KD[0-9-]+$/.test(value);
}

function customerOrderDto(order: Awaited<ReturnType<typeof readOrder>>, creditReservation: SafeOrderCreditReservation | null) {
  if (!order) return null;
  const financialBreakdown = projectOrderFinancialBreakdown(order);
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    status: order.status,
    statusLabel: orderStatusLabel(order.status),
    orderMode: order.orderMode,
    modeLabel: order.orderMode === "711_cod"
      ? "7-ELEVEN 門市取貨付款"
      : order.orderMode === "studio_pickup"
        ? "KD Coffee 工作室自取"
        : "企業送禮洽詢",
    financialBreakdown,
    creditReservation,
  };
}

async function authorizedOrder(orderNumber: string, guestToken?: string) {
  if (!validOrderNumber(orderNumber)) return null;
  const order = await readOrder(orderNumber);
  if (!order) return null;
  const access = await resolveCustomerOrderAccess(order, guestToken);
  return access ? { order, access } : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const { orderNumber } = await params;
  const guestToken = request.headers.get("X-Order-Access-Token") || undefined;
  const authorized = await authorizedOrder(orderNumber, guestToken);
  if (!authorized) return NextResponse.json({ error: "找不到訂單。" }, { status: 404 });
  const memberId = typeof authorized.order.member?.memberId === "string" ? authorized.order.member.memberId : "";
  const creditReservation = memberId ? await getSafeOrderCreditReservation({ orderId: orderNumber, memberId }) : null;

  return NextResponse.json({
    order: customerOrderDto(authorized.order, creditReservation),
    messages: getOrderMessages(authorized.order),
    timeline: buildOrderTimeline(authorized.order, "customer"),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const { orderNumber } = await params;
  if (!validOrderNumber(orderNumber)) {
    return NextResponse.json({ error: "找不到訂單。" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const guestToken = typeof body.token === "string" ? body.token : undefined;
    const actionId = validateOrderMessageActionId(body.actionId);
    const message = validateOrderMessage(body.message);
    const authorized = await authorizedOrder(orderNumber, guestToken);
    if (!authorized) return NextResponse.json({ error: "找不到訂單。" }, { status: 404 });

    const result = await withStoredOrderUpdateLock(
      orderNumber,
      async (latestOrder, persistOrder) => {
        const latestAccess = authorizeOrderConversationAccess(latestOrder, {
          memberId: authorized.access.memberId,
          guestToken,
        });
        if (!latestAccess) return null;
        const previousInquiry = assessOrderInquiryState(latestOrder);
        const appended = appendOrderMessage({
          order: latestOrder,
          actionId,
          authorType: "customer",
          message,
        });
        if (!appended.appended) return { ...appended, alertClaimed: false as const };

        const alertClaimed = !previousInquiry.pending;
        const updatedOrder = alertClaimed
          ? markOrderInquiryAlertClaimed(appended.order, appended.message)
          : appended.order;
        await persistOrder(updatedOrder);
        return { ...appended, order: updatedOrder, alertClaimed };
      },
    );

    if (!result) return NextResponse.json({ error: "找不到訂單。" }, { status: 404 });
    if (result.alertClaimed) {
      const alert = await sendInternalLineNotification(
        createOrderInquiryLineAlertText(orderNumber),
        { attempts: 1, timeoutMs: 8_000 },
      );
      if (!alert.sent) {
        console.warn("Order inquiry LINE alert was not sent", {
          event: "order_inquiry_line_alert_failed",
          orderNumber,
          configured: alert.reason !== "LINE environment variables are not configured",
        });
      }
    }
    return NextResponse.json({
      ok: true,
      replayed: !result.appended,
      message: result.message,
      timeline: buildOrderTimeline(result.order, "customer"),
    });
  } catch (error) {
    if (error instanceof OrderMessageValidationError || error instanceof OrderMessageRateLimitError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "留言暫時無法送出，請稍後再試。" }, { status: 500 });
  }
}
