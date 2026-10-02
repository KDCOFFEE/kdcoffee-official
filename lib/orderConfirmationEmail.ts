import "server-only";

import type { StoredOrder } from "./adminOrders";
import { sendCustomerOrderEmail } from "./customerNotificationDelivery";
import {
  appendCustomerNotificationHistory,
  claimCustomerNotificationAction,
  createCustomerNotificationHistoryEntry,
  type CustomerNotificationTemplate,
} from "./customerNotifications";
import { withOrderFileUpdateLock } from "./orderFiles";
import { assessOrderInventoryTransaction } from "./orderInventoryPolicy";
import { getOrdersDir } from "./storagePaths";

const EVENT = "order_confirmation_email";
const NORMAL_MODES = new Set(["studio_pickup", "711_cod", "home_delivery"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** The checkout snapshot is authoritative; account email is never a fallback. */
export function orderConfirmationRecipient(order: StoredOrder) {
  const email = text(order.customer?.email);
  return email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function siteOrigin(value: string | undefined) {
  try {
    const url = new URL(value?.trim() || "");
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function supportUrl() {
  try {
    const url = new URL(process.env.CUSTOMER_SUPPORT_LINE_URL?.trim() || "");
    if (url.protocol !== "https:" || url.username || url.password
      || !["line.me", "lin.ee"].includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function createOrderConfirmationEmail(order: StoredOrder): CustomerNotificationTemplate & { html: string } {
  const orderNumber = text(order.orderNumber);
  const origin = siteOrigin(process.env.MEMBER_SITE_URL) || siteOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  // Existing customer order page enforces member/guest access; never put a guest token in email.
  const orderUrl = origin ? new URL(`/orders/${encodeURIComponent(orderNumber)}`, origin).toString() : null;
  const contactUrl = supportUrl();
  const date = new Date(order.createdAt);
  const createdAt = Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date)
    : "請以訂單頁資訊為準";
  const money = (value: unknown) => `NT$ ${Number(value || 0).toLocaleString("zh-TW")}`;
  const items = (Array.isArray(order.items) ? order.items : []).map((item: Record<string, unknown>) => {
    const specification = [item.optionLabel, item.optionDetail, item.preparationLabel].map(text).filter(Boolean).join(" · ");
    const roast = item.customRoast ? ` · 專屬烘焙：${text(item.roastLevel)}${text(item.roastNote) ? `（${text(item.roastNote)}）` : ""}` : "";
    return `${text(item.name)}${specification ? `｜${specification}` : ""}${roast} × ${Number(item.quantity || 0)}｜${money(item.lineTotal)}`;
  });
  const method = order.orderMode === "studio_pickup" ? "工作室自取"
    : order.orderMode === "711_cod" ? "7-ELEVEN 門市取貨付款" : "宅配";
  const details = [
    `訂單編號：${orderNumber}`,
    `訂單時間：${createdAt}（台北時間）`,
    ...items,
    `訂單總額：${money(order.total ?? order.subtotal)}`,
    `配送／取貨方式：${method}`,
    ...(order.orderMode === "711_cod" && text(order.store?.name) ? [`取貨門市：${text(order.store.name)}`] : []),
    ...(order.orderMode === "studio_pickup" && text(order.studioPickup?.preferredDate) ? [`希望取貨日期：${text(order.studioPickup.preferredDate)}`] : []),
    ...(order.orderMode === "studio_pickup" && text(order.studioPickup?.preferredTime) ? [`希望取貨時段：${text(order.studioPickup.preferredTime)}`] : []),
  ];
  const greeting = text(order.customer?.name) ? `${text(order.customer.name)}，您好：` : "您好：";
  const note = "後續準備、配送或取貨安排，請以實際訂單狀態與工作室通知為準。";
  const plainText = ["KD Coffee / K. D咖啡藝術工坊", greeting, "我們已收到您的訂單", details.join("\n"), note,
    ...(orderUrl ? [`查看訂單：${orderUrl}`, "會員請登入後查看；訪客請使用下單時保存的訂單存取連結。"] : []),
    contactUrl ? `聯絡 KD Coffee：${contactUrl}` : "聯絡 KD Coffee：官方 LINE @kdcoffee",
  ].join("\n\n");
  const button = (label: string, url: string) => `<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;margin:0 10px 12px 0;background:#33271e;color:#fff;text-decoration:none;border-radius:4px">${label}</a>`;
  return {
    eventType: EVENT,
    subject: `【KD Coffee】我們已收到您的訂單 ${orderNumber}`,
    text: plainText,
    html: `<div style="background:#f7f3ec;padding:28px 16px"><div style="max-width:600px;margin:auto;background:#fffdf9;padding:32px;font-family:Arial,'Noto Sans TC',sans-serif;line-height:1.8;color:#33271e"><p style="font-size:12px;letter-spacing:2px;color:#89745d">KD COFFEE</p><p>K. D咖啡藝術工坊</p><h1 style="font-size:24px;margin:20px 0">我們已收到您的訂單</h1><p>${escapeHtml(greeting)}</p><div style="padding:20px;background:#f7f3ec">${details.map(line => `<p style="margin:6px 0">${escapeHtml(line)}</p>`).join("")}</div><p>${note}</p><p>${orderUrl ? button("查看訂單", orderUrl) : ""}${contactUrl ? button("聯絡 KD Coffee", contactUrl) : "聯絡 KD Coffee：官方 LINE @kdcoffee"}</p>${orderUrl ? '<p style="font-size:12px;color:#89745d">會員請登入後查看；訪客請使用下單時保存的訂單存取連結。</p>' : ""}</div></div>`,
  };
}

export type OrderConfirmationOutcome = { status: "sent" | "failed" | "not_configured" | "skipped" | "already_processed" };

/** At most one provider attempt. A durable claim is saved BEFORE any network call. */
export async function deliverOrderConfirmationEmail(
  orderNumber: string,
  options: { orderDir?: string; fetcher?: typeof fetch; now?: Date } = {},
): Promise<OrderConfirmationOutcome> {
  const actionId = `${EVENT}:${orderNumber}`;
  try {
    const dir = options.orderDir ?? getOrdersDir();
    const claim = await withOrderFileUpdateLock(dir, orderNumber, async (latest, persist) => {
      const order = latest as StoredOrder;
      if (!NORMAL_MODES.has(order.orderMode) || order.status === "cancelled"
        || assessOrderInventoryTransaction(order).kind !== "trusted_committed") return null;
      const recipient = orderConfirmationRecipient(order);
      if (!recipient) return null;
      const action = claimCustomerNotificationAction(order, actionId, options.now);
      if (!action.claimed) return { claimed: false as const };
      const template = createOrderConfirmationEmail(order);
      await persist(action.order);
      return { claimed: true as const, order, recipient, template };
    });
    if (!claim) return { status: "skipped" };
    if (!claim.claimed) return { status: "already_processed" };

    let result: Awaited<ReturnType<typeof sendCustomerOrderEmail>>;
    try {
      result = await sendCustomerOrderEmail({
        recipientEmail: claim.recipient, orderNumber, template: claim.template,
        subject: claim.template.subject, html: claim.template.html,
        idempotencyKey: `${EVENT}/${orderNumber}`, fetcher: options.fetcher,
      });
    } catch {
      result = { status: "failed", error: "訂單確認信寄送失敗；訂單仍已成立。" };
    }
    const history = createCustomerNotificationHistoryEntry({
      actionId, order: claim.order, template: claim.template, channels: ["email"],
      results: { email: result }, now: options.now,
    });
    await withOrderFileUpdateLock(dir, orderNumber, async (latest, persist) => {
      await persist(appendCustomerNotificationHistory(latest as StoredOrder, history));
    });
    return { status: result.status === "sent" ? "sent" : result.status === "not_configured" ? "not_configured" : "failed" };
  } catch {
    // Do not log raw provider errors, credentials, recipients, or filesystem paths.
    console.error("Order confirmation email processing failed", { orderNumber });
    return { status: "failed" };
  }
}
