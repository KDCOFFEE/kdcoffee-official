"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import OrderTimeline from "@/components/orders/OrderTimeline";
import type { OrderMessage } from "@/lib/orderConversation";
import type { OrderTimelineEntry } from "@/lib/orderTimeline";

type CustomerOrderSummary = {
  orderNumber: string;
  createdAt: string;
  status: string;
  orderMode: string;
  statusLabel: string;
  modeLabel: string;
  financialBreakdown: {
    subtotal: number;
    shipping: number;
    creditApplied: number | null;
    totalBeforeCredit: number | null;
    total: number;
  };
  creditReservation: { amount: number; status: "reserved" | "consumed" | "released" } | null;
};

const money = (value: number) => `NT$ ${value.toLocaleString("zh-TW")}`;

const DIRECT_MEMBER_CANCELLATION_STATUSES = new Set([
  "new_order",
  "confirmed",
  "waiting_merchant_create_cod_shipment",
  "waiting_studio_pickup_confirmation",
  "inventory_pending",
  "inventory_failed",
]);

const MEMBER_CANCELLATION_REASONS = [
  "單純想取消",
  "行程／取貨時間不方便",
  "咖啡還沒喝完，暫時不需要",
  "想更換咖啡／數量／烘焙度",
  "重複下單或誤操作",
  "預算考量",
  "其他",
] as const;

function cancellationPresentation(status: string, orderMode: string) {
  if (
    DIRECT_MEMBER_CANCELLATION_STATUSES.has(status) ||
    (status === "ready_for_pickup" && orderMode === "studio_pickup")
  ) {
    return {
      canSubmit: true,
      note: "目前可提出自助取消。確認後系統會依既有安全流程處理訂單、庫存與已保留的會員抵用金。",
    };
  }
  if (status === "shipment_created") {
    return {
      canSubmit: true,
      note: "此訂單已建立 7-ELEVEN 寄件資訊。送出後會先建立取消申請，KD Coffee 需確認物流單作廢後才會完成取消。",
    };
  }
  if (status === "shipped") {
    return {
      canSubmit: false,
      note: "此訂單已完成交寄，無法使用會員自助取消；如需取消或退貨，請使用下方訂單詢問聯繫 KD Coffee。",
    };
  }
  if (status === "ready_for_pickup") {
    return {
      canSubmit: false,
      note: "此訂單已進入待取貨階段，無法使用會員自助取消；如需協助，請使用下方訂單詢問聯繫 KD Coffee。",
    };
  }
  if (status === "completed") {
    return {
      canSubmit: false,
      note: "此訂單已完成取貨，不能使用一般取消；如需退貨協助，請使用下方訂單詢問聯繫 KD Coffee。",
    };
  }
  if (status === "cancelled") {
    return {
      canSubmit: false,
      note: "此訂單已取消，不需要再次操作。",
    };
  }
  return {
    canSubmit: false,
    note: "此訂單目前無法使用會員自助取消；如需協助，請使用下方訂單詢問聯繫 KD Coffee。",
  };
}

function tokenFromBrowser(orderNumber: string) {
  const hashToken = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
  if (hashToken) {
    sessionStorage.setItem(`kdcoffee-order-access:${orderNumber}`, hashToken);
    return hashToken;
  }
  return sessionStorage.getItem(`kdcoffee-order-access:${orderNumber}`) || "";
}

function mergeMessage(messages: OrderMessage[], message: OrderMessage) {
  return messages.some((entry) => entry.id === message.id) ? messages : [...messages, message];
}

export default function OrderConversation({ orderNumber }: { orderNumber: string }) {
  const [order, setOrder] = useState<CustomerOrderSummary>();
  const [access, setAccess] = useState<"member" | "guest">();
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [timeline, setTimeline] = useState<OrderTimelineEntry[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationOtherReason, setCancellationOtherReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancellationNotice, setCancellationNotice] = useState("");
  const [cancellationError, setCancellationError] = useState("");
  const token = useRef("");
  const actionId = useRef("");
  const cancellationActionId = useRef("");

  const loadOrder = useCallback(async () => {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/messages`, {
      cache: "no-store",
      headers: token.current ? { "X-Order-Access-Token": token.current } : undefined,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "無法讀取訂單。");
    setOrder(result.order);
    setAccess(result.access === "member" ? "member" : "guest");
    setMessages(Array.isArray(result.messages) ? result.messages : []);
    setTimeline(Array.isArray(result.timeline) ? result.timeline : []);
  }, [orderNumber]);

  useEffect(() => {
    token.current = tokenFromBrowser(orderNumber);
    loadOrder()
      .catch((reason) => setError(reason instanceof Error ? reason.message : "無法讀取訂單。"))
      .finally(() => setLoading(false));
  }, [loadOrder, orderNumber]);

  async function cancelOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order || access !== "member") return;

    const reason = cancellationReason === "其他"
      ? cancellationOtherReason.trim()
        ? `其他：${cancellationOtherReason.trim()}`
        : ""
      : cancellationReason.trim();

    setCancellationError("");
    setCancellationNotice("");

    if (!reason) {
      setCancellationError(cancellationReason === "其他" ? "請填寫其他取消原因。" : "請選擇取消原因。");
      return;
    }

    if (!cancellationActionId.current) cancellationActionId.current = crypto.randomUUID();
    setCancelling(true);

    try {
      const response = await fetch(`/api/member/orders/${encodeURIComponent(orderNumber)}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cancellationReason: reason,
          idempotencyKey: cancellationActionId.current,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (response.status === 409 && result.customerMessage) {
        setCancellationNotice(result.customerMessage);
        cancellationActionId.current = "";
        await loadOrder();
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || result.customerMessage || "取消申請處理失敗。");
      }

      setCancellationNotice(result.customerMessage || (response.status === 202 ? "取消申請已送出。" : "訂單已取消。"));
      setCancellationReason("");
      setCancellationOtherReason("");
      cancellationActionId.current = "";
      await loadOrder();
    } catch (reasonError) {
      setCancellationError(reasonError instanceof Error ? reasonError.message : "取消申請處理失敗。");
    } finally {
      setCancelling(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!actionId.current) actionId.current = crypto.randomUUID();
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: actionId.current,
          message,
          token: token.current || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "留言暫時無法送出。");
      setMessages((current) => mergeMessage(current, result.message));
      if (Array.isArray(result.timeline)) setTimeline(result.timeline);
      setMessage("");
      actionId.current = "";
      setNotice("詢問已送出，我們看到後會盡快回覆。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "留言暫時無法送出。");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <section className="order-conversation-card"><p>正在讀取訂單…</p></section>;
  }
  if (!order) {
    return (
      <section className="order-conversation-card order-conversation-denied">
        <h1>無法開啟此訂單</h1>
        <p>{error || "請確認您已登入正確會員帳號，或使用下單完成時提供的安全連結。"}</p>
        <Link href="/member">前往會員登入</Link>
      </section>
    );
  }

  return (
    <section className="order-conversation-card">
      <header className="customer-order-summary">
        <p className="eyebrow dark">ORDER DETAIL</p>
        <h1>{order.orderNumber}</h1>
        <span>{new Date(order.createdAt).toLocaleString("zh-TW")}・{order.modeLabel}</span>
        <div><b>{order.statusLabel}</b><strong>{money(order.financialBreakdown.total)}</strong></div>
      </header>

      <div className="customer-order-financials" aria-label="訂單金額明細">
        <span>商品小計</span><b>{money(order.financialBreakdown.subtotal)}</b>
        <span>{order.modeLabel.startsWith("7-ELEVEN") ? "7-ELEVEN 運費" : "運費"}</span><b>{order.financialBreakdown.shipping ? money(order.financialBreakdown.shipping) : "免運"}</b>
        {order.financialBreakdown.creditApplied !== null ? <><span>會員抵用金</span><b className="credit-deduction">−{money(order.financialBreakdown.creditApplied)}</b></> : null}
        {order.financialBreakdown.totalBeforeCredit !== null ? <><span>折抵前總額</span><b>{money(order.financialBreakdown.totalBeforeCredit)}</b></> : null}
        <strong>訂單總計</strong><strong>{money(order.financialBreakdown.total)}</strong>
      </div>
      {order.creditReservation?.status === "released" ? <p className="customer-credit-returned" role="status">訂單取消，{money(order.creditReservation.amount)} 抵用金已返還。</p> : null}

      <OrderTimeline entries={timeline} audience="customer" />

      {access === "member" ? (
        <section className="order-conversation-form order-cancellation-panel" aria-label="取消訂單">
          <div>
            <p className="eyebrow dark">ORDER CANCELLATION</p>
            <h2>取消訂單</h2>
          </div>

          <p>{cancellationPresentation(order.status, order.orderMode).note}</p>

          {cancellationPresentation(order.status, order.orderMode).canSubmit ? (
            <form className="order-cancellation-form" onSubmit={cancelOrder}>
              <label htmlFor="order-cancellation-reason">取消原因</label>
              <select
                id="order-cancellation-reason"
                value={cancellationReason}
                onChange={(event) => {
                  setCancellationReason(event.target.value);
                  if (event.target.value !== "其他") setCancellationOtherReason("");
                }}
                disabled={cancelling}
                required
              >
                <option value="">請選擇取消原因</option>
                {MEMBER_CANCELLATION_REASONS.map((reason) => (
                  <option value={reason} key={reason}>{reason}</option>
                ))}
              </select>

              {cancellationReason === "其他" ? (
                <>
                  <label htmlFor="order-cancellation-other">其他取消原因</label>
                  <textarea
                    id="order-cancellation-other"
                    value={cancellationOtherReason}
                    onChange={(event) => setCancellationOtherReason(event.target.value)}
                    maxLength={190}
                    rows={3}
                    disabled={cancelling}
                    required
                  />
                </>
              ) : null}

              {cancellationError ? <p className="form-error" role="alert">{cancellationError}</p> : null}
              {cancellationNotice ? <p className="form-success" role="status">{cancellationNotice}</p> : null}

              <button className="order-cancellation-submit" type="submit" disabled={cancelling || !cancellationReason}>
                {cancelling ? "處理中…" : order.status === "shipment_created" ? "送出取消申請" : "確認取消訂單"}
              </button>
            </form>
          ) : (
            <>
              {cancellationError ? <p className="form-error" role="alert">{cancellationError}</p> : null}
              {cancellationNotice ? <p className="form-success" role="status">{cancellationNotice}</p> : null}
            </>
          )}
        </section>
      ) : (
        <section className="order-conversation-form" aria-label="取消訂單說明">
          <div>
            <p className="eyebrow dark">ORDER CANCELLATION</p>
            <h2>取消訂單</h2>
          </div>
          <p>訪客訂單目前不開放安全連結直接取消。如需取消，請使用下方訂單詢問聯繫 KD Coffee。</p>
        </section>
      )}

      <div className="order-conversation-thread" aria-live="polite">
        <div className="order-conversation-heading">
          <div><p className="eyebrow dark">ORDER CONVERSATION</p><h2>訂單詢問</h2></div>
          <span>{messages.length} 則</span>
        </div>
        {messages.length ? messages.map((entry) => (
          <article className={`order-message ${entry.authorType}`} key={entry.id}>
            <div><strong>{entry.authorType === "admin" ? "KD Coffee" : "您"}</strong><time>{new Date(entry.createdAt).toLocaleString("zh-TW")}</time></div>
            <p>{entry.message}</p>
          </article>
        )) : <p className="order-conversation-empty">目前還沒有留言。</p>}
      </div>

      <form className="order-conversation-form" onSubmit={submit}>
        <label htmlFor="order-question">詢問此訂單</label>
        <p>有關這張訂單的問題，可以直接留言給 KD Coffee。我們看到後會盡快回覆。</p>
        <textarea
          id="order-question"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={1000}
          rows={5}
          required
          disabled={submitting}
        />
        <small>{message.length} / 1000</small>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {notice ? <p className="form-success" role="status">{notice}</p> : null}
        <button type="submit" disabled={submitting}>{submitting ? "送出中…" : "送出詢問"}</button>
      </form>
      <Link className="order-conversation-back" href="/member">返回會員中心</Link>
    </section>
  );
}
