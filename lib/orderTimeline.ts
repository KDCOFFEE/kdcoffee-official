import type { StoredOrder } from "@/lib/adminOrders";

export type OrderTimelineAudience = "customer" | "admin";

export type OrderTimelineEntryType =
  | "order_created"
  | "status_change"
  | "customer_notification"
  | "customer_message"
  | "admin_message"
  | "cancellation"
  | "inventory_warning"
  | "inventory_return"
  | "fulfillment";

export type OrderTimelineEntry = {
  id: string;
  type: OrderTimelineEntryType;
  createdAt: string;
  timestampValid: boolean;
  title: string;
  description?: string;
  actor: "customer" | "admin" | "system";
  photoUrl?: string;
  tone?: "default" | "warning" | "error";
};

type PositionedEntry = {
  entry: OrderTimelineEntry;
  position: number;
};

const STATUS_LABELS: Record<string, string> = {
  new_order: "新訂單",
  confirmed: "已確認",
  waiting_merchant_create_cod_shipment: "待建立 7-ELEVEN 寄件單",
  waiting_studio_pickup_confirmation: "待確認自取時間",
  shipment_created: "寄件單已建立",
  shipped: "已寄件",
  ready_for_pickup: "等待取貨",
  completed: "已完成",
  cancelled: "已取消",
  inventory_pending: "庫存交易待確認",
  inventory_failed: "庫存交易失敗",
  inventory_write_failed: "庫存寫入失敗",
  corporate_gift_inquiry: "企業送禮洽詢",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function timestamp(value: unknown) {
  const createdAt = cleanText(value, 80);
  return {
    createdAt,
    timestampValid: createdAt.length > 0 && Number.isFinite(Date.parse(createdAt)),
  };
}

function statusLabel(value: unknown) {
  const status = cleanText(value, 80);
  return STATUS_LABELS[status] || "訂單狀態已更新";
}

function customerStatusTitle(orderMode: unknown, value: unknown) {
  const status = cleanText(value, 80);
  if (orderMode === "711_cod") {
    return {
      new_order: "訂單已建立",
      confirmed: "訂單已確認",
      waiting_merchant_create_cod_shipment: "準備寄件",
      shipment_created: "7-ELEVEN 寄件資訊已建立",
      shipped: "訂單已寄出",
      ready_for_pickup: "已進入門市取貨階段",
      completed: "訂單完成",
      cancelled: "訂單已取消",
    }[status] || "訂單進度已更新";
  }
  if (orderMode === "studio_pickup") {
    return {
      new_order: "訂單已建立",
      waiting_studio_pickup_confirmation: "等待工作室確認",
      confirmed: "工作室已確認",
      ready_for_pickup: "咖啡已準備完成",
      completed: "訂單完成",
      cancelled: "訂單已取消",
    }[status] || "訂單進度已更新";
  }
  if (status === "corporate_gift_inquiry") return "企業送禮洽詢已收到";
  if (status === "cancelled") return "訂單已取消";
  return status === "completed" ? "訂單完成" : "訂單進度已更新";
}

function notificationChannels(value: unknown) {
  if (!Array.isArray(value)) return [];
  const channels: string[] = [];
  for (const channel of value) {
    if (channel === "line" && !channels.includes("LINE")) channels.push("LINE");
    if (channel === "email" && !channels.includes("Email")) channels.push("Email");
  }
  return channels;
}

function safeNotificationPhotoUrl(value: unknown) {
  const url = cleanText(value, 240);
  return /^\/uploads\/order-notifications\/[0-9a-f-]+\.webp$/i.test(url)
    ? url
    : undefined;
}

function notificationOutcome(notification: Record<string, unknown>) {
  const channels = Array.isArray(notification.channels) ? notification.channels : [];
  const results = isRecord(notification.results) ? notification.results : {};
  const states = channels
    .filter((channel): channel is "line" | "email" => channel === "line" || channel === "email")
    .map((channel) => isRecord(results[channel]) ? cleanText(results[channel].status, 40) : "");
  if (states.length > 0 && states.every((state) => state === "sent")) return "sent";
  if (states.some((state) => state === "sent" || state === "partial")) return "partial";
  return "failed";
}

function inventoryTransactionWarning(order: Record<string, unknown>) {
  if (order.status === "inventory_pending") {
    return { title: "庫存交易待確認", tone: "warning" as const };
  }
  if (order.status === "inventory_failed") {
    return { title: "庫存扣除失敗", tone: "error" as const };
  }
  if (order.inventoryTransaction === undefined || order.inventoryTransaction === null) return null;
  if (!isRecord(order.inventoryTransaction)) {
    return { title: "庫存交易狀態異常", tone: "error" as const };
  }
  const state = cleanText(order.inventoryTransaction.state, 60);
  if (state === "inventory_committed") return null;
  if (state === "inventory_pending" || state === "pending") {
    return { title: "庫存交易待確認", tone: "warning" as const };
  }
  if (["inventory_write_failed", "inventory_failed", "write_failed", "failed"].includes(state)) {
    return { title: "庫存扣除失敗", tone: "error" as const };
  }
  return { title: "庫存交易狀態異常", tone: "error" as const };
}

function compareEntries(left: PositionedEntry, right: PositionedEntry) {
  const leftTime = Date.parse(left.entry.createdAt);
  const rightTime = Date.parse(right.entry.createdAt);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return left.position - right.position;
}

export function buildOrderTimeline(
  source: StoredOrder | Record<string, unknown>,
  audience: OrderTimelineAudience,
): OrderTimelineEntry[] {
  const order = isRecord(source) ? source : {};
  const entries: PositionedEntry[] = [];
  let position = 0;
  const add = (entry: Omit<OrderTimelineEntry, "createdAt" | "timestampValid">, value: unknown) => {
    entries.push({ entry: { ...entry, ...timestamp(value) }, position });
    position += 1;
  };

  add({
    id: "order-created",
    type: "order_created",
    title: "訂單成立",
    description: "KD Coffee 已收到您的訂單。",
    actor: "system",
  }, order.createdAt);

  const statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  statusHistory.forEach((value, index) => {
    if (!isRecord(value)) return;
    if (value.source === "fulfillment") return;
    const from = statusLabel(value.from);
    const to = statusLabel(value.to);
    add({
      id: `status-${index}`,
      type: "status_change",
      title: audience === "customer"
        ? customerStatusTitle(order.orderMode, value.to)
        : statusLabel(value.to),
      ...(audience === "admin" ? { description: `訂單狀態由「${from}」更新為「${to}」。` } : {}),
      actor: "admin",
    }, value.at);
  });

  const fulfillmentEvents = Array.isArray(order.fulfillmentEvents) ? order.fulfillmentEvents : [];
  fulfillmentEvents.forEach((value, index) => {
    if (!isRecord(value)) return;
    const state = cleanText(value.state, 80);
    const labels: Record<string,string> = { order_created:"訂單成立",preparing:"準備中",shipped:"已交寄",in_transit:"配送中",arrived_at_pickup_store:"商品已到 7-ELEVEN",ready_for_store_pickup:"咖啡已準備完成，可以取貨",completed:"已完成取貨",suspected_uncollected:"取貨狀態待工作室確認",uncollected:"未完成取貨",cancelled:"已取消",exception_requires_review:"取貨狀態待確認" };
    const source = cleanText(value.source, 80);
    add({
      id: `fulfillment-${cleanText(value.eventId,100)||index}`,
      type: "fulfillment",
      title: labels[state] || "訂單進度已更新",
      ...(audience === "admin" ? { description: source === "admin" ? "人工確認" : source === "seven_eleven_email" ? "7-ELEVEN 通知" : "系統紀錄" } : {}),
      actor: source === "admin" ? "admin" : "system",
      tone: ["suspected_uncollected","exception_requires_review"].includes(state) ? "warning" : state === "uncollected" ? "error" : "default",
    }, value.occurredAt);
  });

  const notifications = Array.isArray(order.customerNotifications)
    ? order.customerNotifications
    : [];
  notifications.forEach((value, index) => {
    if (!isRecord(value)) return;
    const channels = notificationChannels(value.channels);
    const channelText = channels.join("、") || "指定方式";
    const outcome = notificationOutcome(value);
    const customerTitle = outcome === "sent"
      ? `KD Coffee 已透過 ${channelText} 通知您`
      : outcome === "partial"
        ? `KD Coffee 已透過部分指定方式通知您`
        : "KD Coffee 已更新訂單通知紀錄";
    const adminTitle = outcome === "sent"
      ? `已透過 ${channelText} 通知客人`
      : outcome === "partial"
        ? `顧客通知部分失敗（${channelText}）`
        : `顧客通知失敗（${channelText}）`;
    const photo = isRecord(value.photo) ? safeNotificationPhotoUrl(value.photo.url) : undefined;
    add({
      id: `notification-${cleanText(value.id || value.actionId, 100) || index}`,
      type: "customer_notification",
      title: audience === "customer" ? customerTitle : adminTitle,
      ...(audience === "admin" && outcome !== "sent"
        ? { description: "通知未全部送達；請至顧客通知紀錄確認後續處理。" }
        : {}),
      actor: "admin",
      ...(photo ? { photoUrl: photo } : {}),
      tone: audience === "admin" && outcome !== "sent"
        ? outcome === "partial" ? "warning" : "error"
        : "default",
    }, value.createdAt);
  });

  const messages = Array.isArray(order.orderMessages) ? order.orderMessages : [];
  messages.forEach((value, index) => {
    if (!isRecord(value)) return;
    if (value.authorType !== "customer" && value.authorType !== "admin") return;
    const authorType = value.authorType;
    const message = cleanText(value.message);
    if (!message) return;
    add({
      id: `message-${cleanText(value.id, 100) || index}`,
      type: authorType === "customer" ? "customer_message" : "admin_message",
      title: authorType === "customer"
        ? audience === "customer" ? "您詢問了訂單問題" : "客人詢問了訂單問題"
        : audience === "customer" ? "KD Coffee 回覆了您的詢問" : "KD Coffee 已回覆客人",
      description: message,
      actor: authorType,
    }, value.createdAt);
  });

  const cancelledAt = cleanText(order.cancelledAt, 80);
  if (order.status === "cancelled" || cancelledAt) {
    const reason = cleanText(order.cancellationReason, 200);
    add({
      id: "cancellation",
      type: "cancellation",
      title: "訂單已取消",
      ...(audience === "admin" && reason ? { description: `取消原因：${reason}` } : {}),
      actor: order.cancelledBy === "admin" ? "admin" : "system",
      tone: "warning",
    }, cancelledAt || order.updatedAt);
  }

  if (audience === "admin") {
    const inventoryReturn = isRecord(order.inventoryReturn) ? order.inventoryReturn : null;
    if (inventoryReturn?.state === "returned") {
      add({
        id: "inventory-return",
        type: "inventory_return",
        title: "取消訂單後庫存已回補",
        actor: "system",
      }, inventoryReturn.returnedAt || inventoryReturn.startedAt);
    } else if (inventoryReturn?.state === "return_pending" || inventoryReturn?.state === "return_failed") {
      add({
        id: "inventory-return-warning",
        type: "inventory_warning",
        title: inventoryReturn.state === "return_pending"
          ? "庫存回補狀態待確認"
          : "庫存回補失敗",
        description: "請依現有庫存安全流程人工確認。",
        actor: "system",
        tone: inventoryReturn.state === "return_pending" ? "warning" : "error",
      }, inventoryReturn.failedAt || inventoryReturn.startedAt || order.updatedAt);
    }

    const warning = inventoryTransactionWarning(order);
    if (warning) {
      const transaction = isRecord(order.inventoryTransaction) ? order.inventoryTransaction : {};
      add({
        id: "inventory-transaction-warning",
        type: "inventory_warning",
        title: warning.title,
        description: "請勿進入正常履約流程，並依既有庫存安全機制人工確認。",
        actor: "system",
        tone: warning.tone,
      }, transaction.failedAt || transaction.startedAt || order.updatedAt || order.createdAt);
    }
  }

  return entries.sort(compareEntries).map(({ entry }) => entry);
}
