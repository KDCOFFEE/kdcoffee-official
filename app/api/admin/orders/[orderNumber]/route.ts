import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  assertOrderStatusTransition,
  orderStatuses,
  orderStatusLabel,
  OrderCancellationReasonError,
  OrderStatusTransitionError,
  withStoredOrderUpdateLock,
  type OrderStatus,
  type StoredOrder,
} from "@/lib/adminOrders";
import { sendInternalLineNotification } from "@/lib/internalLineNotifications";
import { cancelOrderCanonically } from "@/lib/orderCancellation";
import { OrderFileNotFoundError } from "@/lib/orderFiles";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const { orderNumber } = await params;
  if (!/^KD[0-9-]+$/.test(orderNumber)) {
    return NextResponse.json({ error: "找不到訂單" }, { status: 404 });
  }

  const body = await request.json();
  const status = String(body.status || "");
  if (!(orderStatuses as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "訂單狀態不正確" }, { status: 400 });
  }

  try {
    const requestedStatus = status as OrderStatus;

    if (requestedStatus === "cancelled") {
      const result = await cancelOrderCanonically({
        orderNumber,
        cancellationReason: body.cancellationReason,
        cancelledBy: "admin",
        idempotencyKey: `admin-cancel:${orderNumber}`,
        trackingNumber: body.trackingNumber,
        confirmedExternalShipmentVoid: body.confirmedExternalShipmentVoid === true,
      });
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, saved: true, error: result.warning, warning: result.warning, order: result.order },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true, order: result.order });
    }

    const result = await withStoredOrderUpdateLock(
      orderNumber,
      async (latestOrder, persistOrder) => {
        assertOrderStatusTransition(latestOrder, requestedStatus);
        const previous = latestOrder.status;
        const updatedAt = new Date().toISOString();
        let order: StoredOrder = {
          ...latestOrder,
          status: requestedStatus,
          trackingNumber: String(body.trackingNumber || "").trim().slice(0, 80),
          updatedAt,
          statusHistory: [
            ...(Array.isArray(latestOrder.statusHistory) ? latestOrder.statusHistory : []),
            { from: previous, to: requestedStatus, at: updatedAt },
          ],
        };
        await persistOrder(order);

        if (previous !== requestedStatus) {
          const { sent } = await sendInternalLineNotification(
            `【KD Coffee 訂單狀態更新】\n\n訂單編號：${order.orderNumber}\n客戶：${order.customer?.name || "未填"}\n狀態：${orderStatusLabel(requestedStatus)}\n物流編號：${order.trackingNumber || "尚未填寫"}`,
            { attempts: 1, timeoutMs: 5_000 },
          );
          order = { ...order, adminLineNotification: { sent, checkedAt: new Date().toISOString() } };
          await persistOrder(order);
        }
        return { ok: true as const, order };
      },
    );

    return NextResponse.json({ ok: true, order: result.order });
  } catch (error) {
    const statusCode = error instanceof OrderFileNotFoundError
      ? 404
      : error instanceof OrderCancellationReasonError
        ? error.status
        : error instanceof OrderStatusTransitionError
          ? error.status
          : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "訂單狀態更新失敗" },
      { status: statusCode },
    );
  }
}
