import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { readOrder, withStoredOrderUpdateLock, type StoredOrder } from "@/lib/adminOrders";
import {
  appendCustomerNotificationHistory,
  claimCustomerNotificationAction,
  createCustomerNotificationHistoryEntry,
  resolveTrustedCustomerNotificationCapability,
  type CustomerNotificationChannel,
  type CustomerNotificationResult,
} from "@/lib/customerNotifications";
import {
  sendCustomerLineNotification,
  sendCustomerOrderEmail,
} from "@/lib/customerNotificationDelivery";
import {
  appendOrderMessage,
  createOrderReplyNotificationTemplate,
  getOrderMessages,
  OrderMessageValidationError,
  validateOrderMessage,
  validateOrderMessageActionId,
} from "@/lib/orderConversation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "未授權。" }, { status: 401 });
  }
  const { orderNumber } = await params;
  if (!/^KD[0-9-]+$/.test(orderNumber)) {
    return NextResponse.json({ error: "找不到訂單。" }, { status: 404 });
  }
  const order = await readOrder(orderNumber);
  if (!order) return NextResponse.json({ error: "找不到訂單。" }, { status: 404 });
  return NextResponse.json({ messages: getOrderMessages(order) }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "未授權。" }, { status: 401 });
  }

  const { orderNumber } = await params;
  if (!/^KD[0-9-]+$/.test(orderNumber)) {
    return NextResponse.json({ error: "找不到訂單。" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const actionId = validateOrderMessageActionId(body.actionId);
    const message = validateOrderMessage(body.message);
    const notifyCustomer = body.notifyCustomer !== false;
    const requestedChannels: CustomerNotificationChannel[] = Array.isArray(body.channels)
      ? body.channels.reduce((channels: CustomerNotificationChannel[], channel: unknown) => {
          if ((channel === "line" || channel === "email") && !channels.includes(channel)) {
            channels.push(channel);
          }
          return channels;
        }, [])
      : [];

    const order = await readOrder(orderNumber);
    if (!order) return NextResponse.json({ error: "找不到訂單。" }, { status: 404 });
    const saved = await withStoredOrderUpdateLock(
      orderNumber,
      async (latestOrder, persistOrder) => {
        const capability = await resolveTrustedCustomerNotificationCapability(latestOrder);
        const channels = notifyCustomer
          ? requestedChannels.filter((channel) => capability[channel].available)
          : [];
        const appended = appendOrderMessage({
          order: latestOrder,
          actionId,
          authorType: "admin",
          message,
        });
        if (!appended.appended) {
          return { ...appended, capability, channels, notificationClaimed: false as const };
        }

        let updatedOrder: StoredOrder = appended.order;
        let notificationClaimed = false;
        if (channels.length) {
          const claim = claimCustomerNotificationAction(updatedOrder, actionId);
          if (claim.claimed) {
            updatedOrder = claim.order;
            notificationClaimed = true;
          }
        }
        await persistOrder(updatedOrder);
        return { ...appended, order: updatedOrder, capability, channels, notificationClaimed };
      },
    );

    if (!saved.appended) {
      return NextResponse.json({ ok: true, replayed: true, message: saved.message });
    }
    if (!notifyCustomer) {
      return NextResponse.json({ ok: true, saved: true, message: saved.message });
    }
    if (!saved.channels.length || !saved.notificationClaimed) {
      return NextResponse.json({
        ok: true,
        saved: true,
        message: saved.message,
        warning: "已保存回覆，但此訂單沒有可用通知方式。",
      });
    }

    const template = createOrderReplyNotificationTemplate(orderNumber);
    const results: Partial<Record<CustomerNotificationChannel, CustomerNotificationResult>> = {};
    if (saved.channels.includes("line") && saved.capability.line.userId) {
      results.line = await sendCustomerLineNotification({
        userId: saved.capability.line.userId,
        template,
      });
    }
    if (saved.channels.includes("email") && saved.capability.email.address) {
      results.email = await sendCustomerOrderEmail({
        recipientEmail: saved.capability.email.address,
        orderNumber,
        template,
        subject: template.subject,
      });
    }

    const historyEntry = createCustomerNotificationHistoryEntry({
      actionId,
      order: saved.order,
      template,
      channels: saved.channels,
      results,
    });
    await withStoredOrderUpdateLock(orderNumber, async (latestOrder, persistOrder) => {
      await persistOrder(appendCustomerNotificationHistory(latestOrder, historyEntry));
    });

    const allSent = saved.channels.every((channel) => results[channel]?.status === "sent");
    return NextResponse.json({
      ok: allSent,
      saved: true,
      message: saved.message,
      warning: allSent ? undefined : "回覆已保存，但通知客人失敗。",
    }, { status: allSent ? 200 : 502 });
  } catch (error) {
    if (error instanceof OrderMessageValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "回覆暫時無法保存，請稍後再試。" }, { status: 500 });
  }
}
