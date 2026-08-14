"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import type { OrderMessage } from "@/lib/orderConversation";

function mergeMessage(messages: OrderMessage[], message: OrderMessage) {
  return messages.some((entry) => entry.id === message.id) ? messages : [...messages, message];
}

export default function AdminOrderConversation({
  orderNumber,
  lineAvailable,
  emailAvailable,
}: {
  orderNumber: string;
  lineAvailable: boolean;
  emailAvailable: boolean;
}) {
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [reply, setReply] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [lineSelected, setLineSelected] = useState(lineAvailable);
  const [emailSelected, setEmailSelected] = useState(!lineAvailable && emailAvailable);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const actionId = useRef("");
  const customerWaiting = messages.at(-1)?.authorType === "customer";

  useEffect(() => {
    fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/messages`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "無法讀取訂單對話。");
        setMessages(Array.isArray(result.messages) ? result.messages : []);
      })
      .catch(() => {
        setFailed(true);
        setFeedback("目前無法讀取訂單對話。");
      });
  }, [orderNumber]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionId.current) actionId.current = crypto.randomUUID();
    setSubmitting(true);
    setFeedback("");
    setFailed(false);
    try {
      const channels = [lineSelected ? "line" : "", emailSelected ? "email" : ""].filter(Boolean);
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: actionId.current,
          message: reply,
          notifyCustomer,
          channels,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok && !result.saved) throw new Error(result.error || "回覆暫時無法保存。");
      if (result.message) setMessages((current) => mergeMessage(current, result.message));
      setReply("");
      actionId.current = "";
      setFailed(!response.ok || Boolean(result.warning));
      setFeedback(result.warning || (result.replayed ? "此回覆已處理。" : "回覆已保存。"));
    } catch (reason) {
      setFailed(true);
      setFeedback(reason instanceof Error ? reason.message : "回覆暫時無法保存。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-order-conversation">
      <div className="admin-conversation-head">
        <div><p className="eyebrow dark">ORDER CONVERSATION</p><h2>訂單對話</h2></div>
        {customerWaiting ? <b>客人有新詢問</b> : null}
      </div>
      <div className="admin-conversation-thread">
        {messages.length ? messages.map((entry) => (
          <article className={`order-message ${entry.authorType}`} key={entry.id}>
            <div><strong>{entry.authorType === "admin" ? "KD Coffee" : "客人"}</strong><time>{new Date(entry.createdAt).toLocaleString("zh-TW")}</time></div>
            <p>{entry.message}</p>
          </article>
        )) : <p className="admin-empty">目前沒有訂單留言。</p>}
      </div>
      <form className="admin-conversation-form" onSubmit={submit}>
        <label htmlFor="admin-order-reply">回覆客人</label>
        <textarea id="admin-order-reply" value={reply} onChange={(event) => setReply(event.target.value)} maxLength={1000} rows={5} required disabled={submitting} />
        <small>{reply.length} / 1000</small>
        <label className="admin-conversation-notify"><input type="checkbox" checked={notifyCustomer} onChange={(event) => setNotifyCustomer(event.target.checked)} />同時通知客人有新回覆</label>
        {notifyCustomer ? (
          lineAvailable || emailAvailable ? <div className="admin-conversation-channels">
            {lineAvailable ? <label><input type="checkbox" checked={lineSelected} onChange={(event) => setLineSelected(event.target.checked)} />LINE</label> : null}
            {emailAvailable ? <label><input type="checkbox" checked={emailSelected} onChange={(event) => setEmailSelected(event.target.checked)} />Email</label> : null}
          </div> : <p className="admin-notification-unavailable">此訂單沒有可用通知方式；回覆仍會正常保存。</p>
        ) : null}
        {feedback ? <p className={failed ? "form-error" : "admin-save-message"} role="status">{feedback}</p> : null}
        <button className="admin-primary-button" type="submit" disabled={submitting || !reply.trim()}>{submitting ? "保存中…" : "保存回覆"}</button>
      </form>
    </div>
  );
}
