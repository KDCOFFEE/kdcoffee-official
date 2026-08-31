"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { FulfillmentRecord, FulfillmentState } from "@/lib/fulfillmentTypes";

export default function FulfillmentOrderControls({ orderId, orderMode, initial, initialPickupDate = "", initialStore }: { orderId: string; orderMode: string; initial: FulfillmentRecord; initialPickupDate?: string; initialStore?: { id: string; name: string; address: string } }) {
  const router = useRouter();
  const [record, setRecord] = useState(initial);
  const [externalOrderId, setExternalOrderId] = useState(initial.externalOrderId || "");
  const [externalShipmentId, setExternalShipmentId] = useState(initial.externalShipmentId || "");
  const [message, setMessage] = useState("");
  const [uncollectedReason, setUncollectedReason] = useState("");
  const [uncollectedNote, setUncollectedNote] = useState("");
  const [overrideDate, setOverrideDate] = useState(initialPickupDate);
  const [overrideStore, setOverrideStore] = useState(initialStore ?? { id: "", name: "", address: "" });
  const [overrideReason, setOverrideReason] = useState("");
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
    void send({ action: "transition", state, confirmed: terminal, ...(state === "uncollected" ? { reason: uncollectedReason, note: uncollectedNote } : {}) });
  }
  async function associate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await send({ action: "associate", externalOrderId, externalShipmentId }); }
  return <div className="fulfillment-order-controls">
    <p>目前：<strong>{record.currentState === "completed" ? "已完成取貨" : record.currentState === "uncollected" ? "未取貨" : record.currentState === "suspected_uncollected" ? "需要人工確認" : record.currentState === "arrived_at_pickup_store" ? "已到店" : record.currentState === "ready_for_store_pickup" ? "可以取貨" : record.currentState === "shipped" ? "已交寄" : record.currentState === "preparing" ? "準備中" : "訂單成立"}</strong></p>
    {orderMode === "711_cod" ? <form onSubmit={associate}><label>賣貨便訂單編號<input value={externalOrderId} onChange={(event)=>setExternalOrderId(event.target.value.toUpperCase())} placeholder="CM…" required /></label><label>交貨便單號<input value={externalShipmentId} onChange={(event)=>setExternalShipmentId(event.target.value.toUpperCase())} placeholder="E…（選填）" /></label><button disabled={busy}>儲存物流編號</button></form> : null}
    <div className="fulfillment-action-grid">
      <button type="button" disabled={busy} onClick={()=>transition("preparing")}>標記準備中</button>
      {orderMode === "711_cod" ? <><button type="button" disabled={busy} onClick={()=>transition("shipped")}>標記已交寄</button><button type="button" disabled={busy} onClick={()=>transition("arrived_at_pickup_store")}>標記已到店</button></> : <button type="button" disabled={busy} onClick={()=>transition("ready_for_store_pickup")}>通知可以取貨</button>}
      <button type="button" className="primary" disabled={busy} onClick={()=>transition("completed",true)}>確認已取貨</button>
      <button type="button" className="danger" disabled={busy || !uncollectedReason} onClick={()=>transition("uncollected",true)}>確認未取貨</button>
      <button type="button" disabled={busy} onClick={()=>void send({action:"recheck"})}>重新檢查</button>
    </div>
    <div className="fulfillment-settings-grid"><label>人工確認未取貨原因<select value={uncollectedReason} onChange={(event)=>setUncollectedReason(event.target.value)}><option value="">請先選擇</option><option>門市確認逾期未取</option><option>顧客確認不取貨</option><option>物流退回確認</option><option>其他人工確認</option></select></label><label>補充說明（選填）<input value={uncollectedNote} maxLength={200} onChange={(event)=>setUncollectedNote(event.target.value)} placeholder="留下可追溯的確認依據" /></label></div>
    {['order_created','preparing'].includes(record.currentState) && <div className="gmail-connection-box"><span>Owner 安全調整</span><p>只調整尚未進入不可逆物流階段的日期或門市，不會重算價格、折扣、抵用金或贈品快照。</p><label>調整原因<input value={overrideReason} maxLength={200} onChange={(event)=>setOverrideReason(event.target.value)} placeholder="例如：客人來電要求調整" /></label>{orderMode === "studio_pickup" ? <label>新自取日期<input type="date" value={overrideDate} onChange={(event)=>setOverrideDate(event.target.value)} /></label> : <div className="fulfillment-settings-grid"><label>門市店號<input value={overrideStore.id} onChange={(event)=>setOverrideStore({...overrideStore,id:event.target.value.toUpperCase()})} /></label><label>門市名稱<input value={overrideStore.name} onChange={(event)=>setOverrideStore({...overrideStore,name:event.target.value})} /></label><label>門市地址<input value={overrideStore.address} onChange={(event)=>setOverrideStore({...overrideStore,address:event.target.value})} /></label></div>}<button type="button" disabled={busy || !overrideReason || (orderMode === "studio_pickup" ? !overrideDate : !overrideStore.id || !overrideStore.name)} onClick={()=>void send({ action:"override", overrideAction:orderMode === "studio_pickup" ? "change-date" : "change-store", idempotencyKey:crypto.randomUUID(), reason:overrideReason, date:overrideDate, store:overrideStore })}>儲存安全調整</button></div>}
    {message ? <p role="status" className="fulfillment-action-message">{message}</p> : null}
  </div>;
}
