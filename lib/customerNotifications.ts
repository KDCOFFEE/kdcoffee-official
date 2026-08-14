import { randomUUID } from "crypto";

import type { StoredOrder } from "@/lib/adminOrders";
import { isValidEmail, normalizeEmail, readMember } from "@/lib/memberAuth";

export type CustomerNotificationChannel = "line" | "email";

export type CustomerNotificationCapability = {
  line: { available: boolean; userId?: string };
  email: { available: boolean; address?: string };
};

export type CustomerNotificationPhoto = {
  url: string;
  mimeType: "image/webp";
  bytes: number;
  width: number;
  height: number;
};

export type CustomerNotificationResult = {
  status: "sent" | "failed" | "not_configured";
  error?: string;
};

export type CustomerNotificationHistoryEntry = {
  id: string;
  actionId: string;
  createdAt: string;
  eventType: string;
  orderStatus: string;
  channels: CustomerNotificationChannel[];
  photo?: CustomerNotificationPhoto;
  results: Partial<Record<CustomerNotificationChannel, CustomerNotificationResult>>;
};

export type CustomerNotificationAction = {
  actionId: string;
  createdAt: string;
  state: "processing" | "completed";
  historyId?: string;
  completedAt?: string;
};

const LINE_USER_ID_PATTERN = /^U[0-9a-f]{32}$/i;

function clean(value: unknown, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

export function isTrustedLineUserId(value: unknown) {
  return typeof value === "string" && LINE_USER_ID_PATTERN.test(value.trim());
}

export function resolveCustomerNotificationCapability(
  order: StoredOrder,
  member?: { lineUserId?: string; email?: string } | null,
): CustomerNotificationCapability {
  const snapshotLineUserId = order.member?.lineUserId;
  const memberLineUserId = member?.lineUserId;
  const lineUserId = isTrustedLineUserId(snapshotLineUserId)
    ? snapshotLineUserId.trim()
    : isTrustedLineUserId(memberLineUserId)
      ? memberLineUserId!.trim()
      : undefined;

  const snapshotEmail = normalizeEmail(clean(order.customer?.email, 120));
  const memberEmail = normalizeEmail(clean(member?.email, 120));
  const emailAddress = isValidEmail(snapshotEmail)
    ? snapshotEmail
    : isValidEmail(memberEmail)
      ? memberEmail
      : undefined;

  return {
    line: lineUserId
      ? { available: true, userId: lineUserId }
      : { available: false },
    email: emailAddress
      ? { available: true, address: emailAddress }
      : { available: false },
  };
}

export async function resolveTrustedCustomerNotificationCapability(
  order: StoredOrder,
) {
  const memberId = clean(order.member?.memberId, 80);
  const member = memberId ? await readMember(memberId) : null;
  return resolveCustomerNotificationCapability(order, member);
}

export function suggestedCustomerNotificationStatuses(orderMode: unknown) {
  return orderMode === "studio_pickup"
    ? ["confirmed", "ready_for_pickup", "completed"]
    : orderMode === "711_cod"
      ? ["shipment_created", "shipped", "ready_for_pickup", "completed"]
      : [];
}

export function isSuggestedCustomerNotificationStatus(
  orderMode: unknown,
  status: unknown,
) {
  return suggestedCustomerNotificationStatuses(orderMode).includes(String(status));
}

export type CustomerNotificationTemplate = {
  eventType: string;
  subject: string;
  text: string;
};

export function createCustomerNotificationTemplate(
  order: StoredOrder,
): CustomerNotificationTemplate {
  const orderNumber = clean(order.orderNumber, 40);
  const status = clean(order.status, 50);
  const tracking = clean(order.trackingNumber, 80);
  const storeName = clean(order.store?.name, 80);
  const storeAddress = clean(order.store?.address, 160);
  const pickupDate = clean(order.studioPickup?.preferredDate, 20);
  const pickupTime = clean(order.studioPickup?.preferredTime, 20);

  if (status === "confirmed") {
    return {
      eventType: "order_confirmed",
      subject: "KD Coffee｜訂單已確認",
      text: `KD Coffee｜訂單已確認\n\n訂單：${orderNumber}\n\n我們已收到並確認您的訂單，\n會依訂單內容為您準備。`,
    };
  }

  if (order.orderMode === "studio_pickup" && status === "ready_for_pickup") {
    return {
      eventType: "studio_ready_for_pickup",
      subject: "KD Coffee｜您的咖啡已準備完成",
      text: `KD Coffee｜您的咖啡已準備完成\n\n訂單：${orderNumber}\n\n您的咖啡已完成準備，\n可以依預約時間前來工作室取貨。\n\n取貨日期：${pickupDate || "請依工作室確認"}\n取貨時間：${pickupTime || "請依工作室確認"}`,
    };
  }

  if (order.orderMode === "711_cod" && status === "shipment_created") {
    return {
      eventType: "shipment_created",
      subject: "KD Coffee｜寄件資訊已建立",
      text: `KD Coffee｜寄件資訊已建立\n\n訂單：${orderNumber}\n\n您的訂單已建立寄件資訊，工作室將依流程完成寄送。${tracking ? `\n\n寄件／追蹤資訊：${tracking}` : ""}`,
    };
  }

  if (order.orderMode === "711_cod" && status === "shipped") {
    return {
      eventType: "order_shipped",
      subject: "KD Coffee｜您的訂單已寄出",
      text: `KD Coffee｜您的訂單已寄出\n\n訂單：${orderNumber}\n\n您的咖啡已完成寄件。\n\n取貨門市：\n${storeName || "請依訂單資訊"}\n${storeAddress || ""}${tracking ? `\n\n寄件／追蹤資訊：${tracking}` : ""}`,
    };
  }

  if (order.orderMode === "711_cod" && status === "ready_for_pickup") {
    return {
      eventType: "seven_eleven_ready_for_pickup",
      subject: "KD Coffee｜訂單已進入取貨階段",
      text: `KD Coffee｜訂單已進入取貨階段\n\n訂單：${orderNumber}\n\n您的包裹已進入 7-ELEVEN 取貨流程，\n請依物流／門市通知前往取貨。`,
    };
  }

  if (status === "completed") {
    return {
      eventType: "order_completed",
      subject: "KD Coffee｜訂單已完成",
      text: `KD Coffee｜訂單已完成\n\n訂單：${orderNumber}\n\n感謝您選擇 KD Coffee，本次訂單已完成。`,
    };
  }

  throw new Error("此訂單狀態目前沒有可用的顧客通知範本。");
}

export function createCustomerNotificationHistoryEntry(input: {
  actionId: string;
  order: StoredOrder;
  template: CustomerNotificationTemplate;
  channels: CustomerNotificationChannel[];
  photo?: CustomerNotificationPhoto;
  results: CustomerNotificationHistoryEntry["results"];
  now?: Date;
}): CustomerNotificationHistoryEntry {
  return {
    id: randomUUID(),
    actionId: input.actionId,
    createdAt: (input.now ?? new Date()).toISOString(),
    eventType: input.template.eventType,
    orderStatus: String(input.order.status || ""),
    channels: [...input.channels],
    ...(input.photo ? { photo: input.photo } : {}),
    results: input.results,
  };
}

export function customerNotificationHistory(order: StoredOrder) {
  return Array.isArray(order.customerNotifications)
    ? order.customerNotifications as CustomerNotificationHistoryEntry[]
    : [];
}

export function customerNotificationActions(order: StoredOrder) {
  return Array.isArray(order.customerNotificationActions)
    ? order.customerNotificationActions as CustomerNotificationAction[]
    : [];
}

export function claimCustomerNotificationAction(
  order: StoredOrder,
  actionId: string,
  now = new Date(),
) {
  const existingAction = customerNotificationActions(order).find(
    (entry) => entry.actionId === actionId,
  );
  if (existingAction) {
    return {
      claimed: false as const,
      history: customerNotificationHistory(order).find(
        (entry) => entry.actionId === actionId,
      ),
    };
  }

  return {
    claimed: true as const,
    order: {
      ...order,
      customerNotificationActions: [
        ...customerNotificationActions(order),
        { actionId, createdAt: now.toISOString(), state: "processing" as const },
      ],
    },
  };
}

export function appendCustomerNotificationHistory(
  order: StoredOrder,
  entry: CustomerNotificationHistoryEntry,
) {
  return {
    ...order,
    customerNotifications: [...customerNotificationHistory(order), entry],
    customerNotificationActions: customerNotificationActions(order).map(
      (action) => action.actionId === entry.actionId
        ? {
            ...action,
            state: "completed" as const,
            historyId: entry.id,
            completedAt: entry.createdAt,
          }
        : action,
    ),
  };
}
