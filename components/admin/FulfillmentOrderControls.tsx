"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { FulfillmentRecord, FulfillmentState } from "@/lib/fulfillmentTypes";

export default function FulfillmentOrderControls({ orderId, orderMode, initial }: { orderId: string; orderMode: string; initial: FulfillmentRecord }) {
  const router = useRouter();
  const [record, setRecord] = useState(initial);
  const [externalOrderId, setExternalOrderId] = useState(initial.externalOrderId || "");
  const [externalShipmentId, setExternalShipmentId] = useState(initial.externalShipmentId || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(payload: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/fulfillment/orders/${encodeURIComponent(orderId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, expectedRevision: record.revision }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "更新失敗");
      setRecord(result.record); setMessage("履約狀態已更新"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "更新失敗"); }
    finally { setBusy(false); }
  }
  function transition(state: FulfillmentState, terminal = false) {
    if (terminal && !window.confirm(state === "completed" ? "確定將此訂單標記為已完成取貨？" : "確定將此訂單標記為未取貨？此結果將交由會員規則處理。")) return;
    void send({ action: "transition", state, confirmed: terminal });
  }
  async function associate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await send({ action: "associate", externalOrderId, externalShipmentId }); }
  return <div className="fulfillment-order-controls">
    <p>目前：<strong>{record.currentState === "completed" ? "已完成取貨" : record.currentState === "uncollected" ? "未取貨" : record.currentState === "suspected_uncollected" ? "需要人工確認" : record.currentState === "arrived_at_pickup_store" ? "已到店" : record.currentState === "ready_for_store_pickup" ? "可以取貨" : record.currentState === "shipped" ? "已交寄" : record.currentState === "preparing" ? "準備中" : "訂單成立"}</strong></p>
    {orderMode === "711_cod" ? <form onSubmit={associate}><label>賣貨便訂單編號<input value={externalOrderId} onChange={(event)=>setExternalOrderId(event.target.value.toUpperCase())} placeholder="CM…" required /></label><label>交貨便單號<input value={externalShipmentId} onChange={(event)=>setExternalShipmentId(event.target.value.toUpperCase())} placeholder="E…（選填）" /></label><button disabled={busy}>儲存物流編號</button></form> : null}
    <div className="fulfillment-action-grid">
      <button type="button" disabled={busy} onClick={()=>transition("preparing")}>標記準備中</button>
      {orderMode === "711_cod" ? <><button type="button" disabled={busy} onClick={()=>transition("shipped")}>標記已交寄</button><button type="button" disabled={busy} onClick={()=>transition("arrived_at_pickup_store")}>標記已到店</button></> : <button type="button" disabled={busy} onClick={()=>transition("ready_for_store_pickup")}>通知可以取貨</button>}
      <button type="button" className="primary" disabled={busy} onClick={()=>transition("completed",true)}>確認已取貨</button>
      <button type="button" className="danger" disabled={busy} onClick={()=>transition("uncollected",true)}>確認未取貨</button>
      <button type="button" disabled={busy} onClick={()=>void send({action:"recheck"})}>重新檢查</button>
    </div>
    {message ? <p role="status" className="fulfillment-action-message">{message}</p> : null}
  </div>;
}
