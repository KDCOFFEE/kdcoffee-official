import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  appendCustomerNotificationHistory,
  claimCustomerNotificationAction,
  createCustomerNotificationHistoryEntry,
  createCustomerNotificationTemplate,
  resolveTrustedCustomerNotificationCapability,
  type CustomerNotificationChannel,
  type CustomerNotificationResult,
} from "@/lib/customerNotifications";
import {
  sendCustomerLineNotification,
  sendCustomerOrderEmail,
} from "@/lib/customerNotificationDelivery";
import {
  readOrder,
  withStoredOrderUpdateLock,
} from "@/lib/adminOrders";
import {
  OrderNotificationPhotoError,
  validateAndStoreOrderNotificationPhoto,
} from "@/lib/orderNotificationPhotos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
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

  try {
    const form = await request.formData();
    const actionId = String(form.get("actionId") || "").trim();
    if (!ACTION_ID_PATTERN.test(actionId)) {
      return NextResponse.json({ error: "通知操作識別碼不正確" }, { status: 400 });
    }

    const requestedChannels = [...new Set(
      form.getAll("channels")
        .map((value) => String(value))
        .filter((value): value is CustomerNotificationChannel => value === "line" || value === "email"),
    )];
    if (!requestedChannels.length) {
      return NextResponse.json({ error: "請選擇顧客通知方式" }, { status: 400 });
    }

    const order = await readOrder(orderNumber);
    if (!order) return NextResponse.json({ error: "找不到訂單" }, { status: 404 });
    const template = createCustomerNotificationTemplate(order);
    const capability = await resolveTrustedCustomerNotificationCapability(order);
    const channels = requestedChannels.filter((channel) => capability[channel].available);
    if (!channels.length) {
      return NextResponse.json({ error: "此訂單沒有可用的顧客通知方式" }, { status: 400 });
    }

    const photoValue = form.get("photo");
    const photo = photoValue instanceof File && photoValue.size > 0
      ? await validateAndStoreOrderNotificationPhoto(photoValue, actionId)
      : undefined;

    const claim = await withStoredOrderUpdateLock(
      orderNumber,
      async (latestOrder, persistOrder) => {
        const action = claimCustomerNotificationAction(latestOrder, actionId);
        if (!action.claimed) return action;
        await persistOrder(action.order);
        return { claimed: true as const };
      },
    );

    if (!claim.claimed) {
      return NextResponse.json({
        ok: true,
        replayed: true,
        pending: !claim.history,
        notification: claim.history,
      });
    }

    const results: Partial<Record<CustomerNotificationChannel, CustomerNotificationResult>> = {};
    if (channels.includes("line") && capability.line.userId) {
      results.line = await sendCustomerLineNotification({
        userId: capability.line.userId,
        template,
        photo,
      });
    }
    if (channels.includes("email") && capability.email.address) {
      results.email = await sendCustomerOrderEmail({
        recipientEmail: capability.email.address,
        orderNumber,
        template,
        photo,
      });
    }

    const historyEntry = createCustomerNotificationHistoryEntry({
      actionId,
      order,
      template,
      channels,
      photo,
      results,
    });
    await withStoredOrderUpdateLock(orderNumber, async (latestOrder, persistOrder) => {
      await persistOrder(appendCustomerNotificationHistory(latestOrder, historyEntry));
    });

    const allSent = channels.every((channel) => results[channel]?.status === "sent");
    const lineImagePartial = results.line?.status === "partial";
    return NextResponse.json({
      ok: allSent,
      saved: true,
      notification: historyEntry,
      warning: allSent
        ? undefined
        : lineImagePartial
          ? "通知文字已送出，但圖片傳送失敗；請確認公開網址後再試。"
          : "訂單狀態已更新，但部分顧客通知發送失敗。",
    }, { status: allSent ? 200 : 502 });
  } catch (error) {
    const status = error instanceof OrderNotificationPhotoError ? error.status : 500;
    const message = error instanceof OrderNotificationPhotoError
      ? error.message
      : error instanceof Error && error.message.includes("通知範本")
        ? error.message
        : "顧客通知處理失敗";
    return NextResponse.json({ error: message }, { status });
  }
}
