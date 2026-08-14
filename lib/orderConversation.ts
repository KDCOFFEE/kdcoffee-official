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
