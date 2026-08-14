import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";

import type { StoredOrder } from "@/lib/adminOrders";

export const ORDER_MESSAGE_MAX_LENGTH = 1000;
export const ORDER_MESSAGE_RATE_LIMIT = 5;
export const ORDER_MESSAGE_RATE_WINDOW_MS = 60_000;

export type OrderMessageAuthor = "customer" | "admin";

export type OrderMessage = {
  id: string;
  actionId: string;
  createdAt: string;
  authorType: OrderMessageAuthor;
  channel: "order_page";
  message: string;
};

export type OrderConversationState = {
  resolvedThroughMessageId?: string;
  resolvedAt?: string;
  resolvedBy?: "admin";
  lastAlertedMessageId?: string;
  lastAlertedAt?: string;
};

export type OrderInquiryAssessment = {
  pending: boolean;
  latestCustomerMessage?: OrderMessage;
  latestAdminMessage?: OrderMessage;
  unresolvedCustomerMessages: number;
};

export type OrderConversationAccess = "member" | "guest";

const ACTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class OrderMessageValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "OrderMessageValidationError";
  }
}

export class OrderMessageRateLimitError extends Error {
  readonly status = 429;

  constructor() {
    super("留言送出較頻繁，請稍候一分鐘再試。");
    this.name = "OrderMessageRateLimitError";
  }
}

function guestTokenHash(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export function createGuestOrderAccess() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: guestTokenHash(token),
  };
}

export function verifyGuestOrderAccessToken(order: StoredOrder, token: unknown) {
  const storedHash = order.guestOrderAccess?.tokenHash;
  if (typeof storedHash !== "string" || typeof token !== "string" || !token) return false;

  try {
    const expected = Buffer.from(storedHash, "base64url");
    const actual = Buffer.from(guestTokenHash(token), "base64url");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function authorizeOrderConversationAccess(
  order: StoredOrder,
  input: { memberId?: string; guestToken?: string },
): OrderConversationAccess | null {
  const ownerMemberId = order.member?.memberId;
  if (
    typeof input.memberId === "string" &&
    input.memberId.length > 0 &&
    typeof ownerMemberId === "string" &&
    ownerMemberId === input.memberId
  ) {
    return "member";
  }

  if (!ownerMemberId && verifyGuestOrderAccessToken(order, input.guestToken)) {
    return "guest";
  }

  return null;
}

export function validateOrderMessageActionId(value: unknown) {
  const actionId = String(value ?? "").trim();
  if (!ACTION_ID_PATTERN.test(actionId)) {
    throw new OrderMessageValidationError("留言操作識別碼格式不正確。");
  }
  return actionId;
}

export function validateOrderMessage(value: unknown) {
  const message = String(value ?? "").trim();
  if (!message) throw new OrderMessageValidationError("請輸入留言內容。");
  if (message.length > ORDER_MESSAGE_MAX_LENGTH) {
    throw new OrderMessageValidationError(`留言最多 ${ORDER_MESSAGE_MAX_LENGTH} 個字元。`);
  }
  return message;
}

export function getOrderMessages(order: StoredOrder): OrderMessage[] {
  return Array.isArray(order.orderMessages) ? order.orderMessages as OrderMessage[] : [];
}

type PositionedMessage = {
  message: OrderMessage;
  index: number;
};

function comparePositionedMessages(left: PositionedMessage, right: PositionedMessage) {
  const leftTime = Date.parse(left.message.createdAt);
  const rightTime = Date.parse(right.message.createdAt);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return left.index - right.index;
}

function latestMessageByAuthor(messages: OrderMessage[], authorType: OrderMessageAuthor) {
  let latest: PositionedMessage | undefined;
  messages.forEach((message, index) => {
    if (message?.authorType !== authorType) return;
    const candidate = { message, index };
    if (!latest || comparePositionedMessages(candidate, latest) > 0) latest = candidate;
  });
  return latest;
}

function storedConversationState(order: StoredOrder): OrderConversationState {
  return order.orderConversationState && typeof order.orderConversationState === "object"
    ? order.orderConversationState as OrderConversationState
    : {};
}

export function assessOrderInquiryState(order: StoredOrder): OrderInquiryAssessment {
  const messages = getOrderMessages(order);
  const customers = messages
    .map((message, index) => ({ message, index }))
    .filter((entry) => entry.message?.authorType === "customer");
  const latestCustomer = latestMessageByAuthor(messages, "customer");
  const latestAdmin = latestMessageByAuthor(messages, "admin");
  const resolvedThroughMessageId = storedConversationState(order).resolvedThroughMessageId;
  const resolvedThrough = resolvedThroughMessageId
    ? messages
        .map((message, index) => ({ message, index }))
        .find((entry) => entry.message?.id === resolvedThroughMessageId)
    : undefined;

  let resolutionBoundary = latestAdmin;
  if (
    resolvedThrough &&
    (!resolutionBoundary || comparePositionedMessages(resolvedThrough, resolutionBoundary) > 0)
  ) {
    resolutionBoundary = resolvedThrough;
  }

  const unresolvedCustomerMessages = resolutionBoundary
    ? customers.filter((entry) => comparePositionedMessages(entry, resolutionBoundary) > 0).length
    : customers.length;

  return {
    pending: unresolvedCustomerMessages > 0,
    latestCustomerMessage: latestCustomer?.message,
    latestAdminMessage: latestAdmin?.message,
    unresolvedCustomerMessages,
  };
}

export function listPendingOrderInquiries(orders: StoredOrder[]) {
  return orders
    .map((order) => ({ order, inquiry: assessOrderInquiryState(order) }))
    .filter((entry) => entry.inquiry.pending && entry.inquiry.latestCustomerMessage)
    .sort((left, right) => {
      const leftTime = Date.parse(left.inquiry.latestCustomerMessage?.createdAt || "");
      const rightTime = Date.parse(right.inquiry.latestCustomerMessage?.createdAt || "");
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return rightTime - leftTime;
      }
      return 0;
    });
}

export function markOrderInquiryResolved(order: StoredOrder, now = new Date()) {
  const inquiry = assessOrderInquiryState(order);
  if (!inquiry.pending || !inquiry.latestCustomerMessage) {
    return { changed: false as const, order, inquiry };
  }

  const nextOrder: StoredOrder = {
    ...order,
    orderConversationState: {
      ...storedConversationState(order),
      resolvedThroughMessageId: inquiry.latestCustomerMessage.id,
      resolvedAt: now.toISOString(),
      resolvedBy: "admin" as const,
    },
  };
  return {
    changed: true as const,
    order: nextOrder,
    inquiry: assessOrderInquiryState(nextOrder),
  };
}

export function markOrderInquiryAlertClaimed(
  order: StoredOrder,
  message: OrderMessage,
  now = new Date(),
) {
  return {
    ...order,
    orderConversationState: {
      ...storedConversationState(order),
      lastAlertedMessageId: message.id,
      lastAlertedAt: now.toISOString(),
    },
  } as StoredOrder;
}

export function createOrderInquiryLineAlertText(orderNumber: string) {
  return `KD Coffee｜新的訂單詢問\n\n訂單：${orderNumber}\n\n客人有新的訂單問題等待回覆。\n請登入後台查看並處理。`;
}

export function appendOrderMessage(input: {
  order: StoredOrder;
  actionId: string;
  authorType: OrderMessageAuthor;
  message: string;
  now?: Date;
}) {
  const messages = getOrderMessages(input.order);
  const existing = messages.find((entry) => entry.actionId === input.actionId);
  if (existing) {
    return { appended: false as const, order: input.order, message: existing };
  }

  const now = input.now ?? new Date();
  if (input.authorType === "customer") {
    const windowStart = now.getTime() - ORDER_MESSAGE_RATE_WINDOW_MS;
    const recentCustomerMessages = messages.filter((entry) =>
      entry.authorType === "customer" &&
      Number.isFinite(Date.parse(entry.createdAt)) &&
      Date.parse(entry.createdAt) > windowStart,
    );
    if (recentCustomerMessages.length >= ORDER_MESSAGE_RATE_LIMIT) {
      throw new OrderMessageRateLimitError();
    }
  }

  const entry: OrderMessage = {
    id: randomUUID(),
    actionId: input.actionId,
    createdAt: now.toISOString(),
    authorType: input.authorType,
    channel: "order_page",
    message: input.message,
  };

  return {
    appended: true as const,
    message: entry,
    order: { ...input.order, orderMessages: [...messages, entry] },
  };
}

export function createOrderReplyNotificationTemplate(orderNumber: string) {
  return {
    eventType: "order_conversation_reply",
    subject: "KD Coffee｜訂單詢問已有新回覆",
    text: `KD Coffee｜訂單詢問已有新回覆\n\n訂單：${orderNumber}\n\nKD Coffee 已回覆您的訂單詢問。\n請回到訂單頁查看完整內容。`,
  };
}
