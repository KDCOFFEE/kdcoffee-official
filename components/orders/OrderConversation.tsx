"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import type { OrderMessage } from "@/lib/orderConversation";

type CustomerOrderSummary = {
  orderNumber: string;
  createdAt: string;
  statusLabel: string;
  modeLabel: string;
  total: number;
};

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
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const token = useRef("");
  const actionId = useRef("");

  useEffect(() => {
    token.current = tokenFromBrowser(orderNumber);
    fetch(`/api/orders/${encodeURIComponent(orderNumber)}/messages`, {
      cache: "no-store",
      headers: token.current ? { "X-Order-Access-Token": token.current } : undefined,
    })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "無法讀取訂單。");
        setOrder(result.order);
        setMessages(Array.isArray(result.messages) ? result.messages : []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "無法讀取訂單。"))
      .finally(() => setLoading(false));
  }, [orderNumber]);

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
        <div><b>{order.statusLabel}</b><strong>NT$ {order.total.toLocaleString("zh-TW")}</strong></div>
      </header>

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
