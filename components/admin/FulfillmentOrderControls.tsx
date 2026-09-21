"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { fulfillmentStateLabels, type FulfillmentRecord, type FulfillmentState } from "@/lib/fulfillmentTypes";
import { MAX_CANCELLATION_REASON_LENGTH } from "@/lib/orderInventoryPolicy";

type FlowStep = { state: FulfillmentState; label: string; automatic?: boolean };

const studioSteps: FlowStep[] = [
  { state: "order_created", label: "收到訂單" },
  { state: "preparing", label: "準備中" },
  { state: "ready_for_store_pickup", label: "可以取貨" },
  { state: "completed", label: "已完成取貨" },
];

const sevenElevenSteps: FlowStep[] = [
  { state: "order_created", label: "收到訂單" },
  { state: "preparing", label: "準備中" },
  { state: "shipped", label: "已寄件", automatic: true },
  { state: "arrived_at_pickup_store", label: "已到店", automatic: true },
  { state: "completed", label: "已完成取貨", automatic: true },
];

function normalizedStepIndex(steps: FlowStep[], state: FulfillmentState) {
  const direct = steps.findIndex((step) => step.state === state);
  if (direct >= 0) return direct;
  if (state === "in_transit") return Math.max(0, steps.findIndex((step) => step.state === "shipped"));
  if (state === "suspected_uncollected" || state === "uncollected") {
    return Math.max(0, steps.findIndex((step) => step.state === "arrived_at_pickup_store"));
  }
  return 0;
}

export default function FulfillmentOrderControls({
  orderId,
  orderMode,
  initial,
  initialOrderStatus,
  cancellationAllowed,
  cancellationBlockedMessage = "",
  initialPickupDate = "",
  initialStore,
}: {
  orderId: string;
  orderMode: string;
  initial: FulfillmentRecord;
  initialOrderStatus: string;
  cancellationAllowed: boolean;
  cancellationBlockedMessage?: string;
  initialPickupDate?: string;
  initialStore?: { id: string; name: string; address: string };
}) {
  const router = useRouter();
  const [record, setRecord] = useState(initial);
  const [externalOrderId, setExternalOrderId] = useState(initial.externalOrderId || "");
  const [externalShipmentId, setExternalShipmentId] = useState(initial.externalShipmentId || "");
  const [message, setMessage] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationOtherReason, setCancellationOtherReason] = useState("");
  const [uncollectedReason, setUncollectedReason] = useState("");
  const [uncollectedNote, setUncollectedNote] = useState("");
  const [overrideDate, setOverrideDate] = useState(initialPickupDate);
  const [overrideStore, setOverrideStore] = useState(initialStore ?? { id: "", name: "", address: "" });
  const [overrideReason, setOverrideReason] = useState("");
  const [busy, setBusy] = useState(false);

  const isSevenEleven = orderMode === "711_cod";
  const steps = useMemo(() => (isSevenEleven ? sevenElevenSteps : studioSteps), [isSevenEleven]);
  const activeIndex = normalizedStepIndex(steps, record.currentState);
  const orderCancelled = initialOrderStatus === "cancelled";
  const terminal = orderCancelled || ["completed", "cancelled", "uncollected"].includes(record.currentState);
  const resolvedCancellationReason =
    cancellationReason === "其他"
      ? cancellationOtherReason.trim()
        ? `其他：${cancellationOtherReason.trim()}`
        : ""
      : cancellationReason.trim();

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/fulfillment/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, expectedRevision: record.revision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "更新失敗");
      setRecord(result.record);
      setMessage("履約狀態已更新");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新失敗");
    } finally {
      setBusy(false);
    }
  }

  function transition(state: FulfillmentState, terminalAction = false) {
    if (
      terminalAction &&
      !window.confirm(
        state === "completed"
          ? "確定將此訂單標記為已完成取貨？"
          : "確定將此訂單標記為未取貨？此結果將交由會員規則處理。",
      )
    ) return;

    void send({
      action: "transition",
      state,
      confirmed: terminalAction,
      ...(state === "uncollected" ? { reason: uncollectedReason, note: uncollectedNote } : {}),
    });
  }

  async function cancelOrder() {
    if (!cancellationAllowed) {
      setMessage(cancellationBlockedMessage || "此訂單目前不能使用一般取消操作。");
      return;
    }
    if (!resolvedCancellationReason) {
      setMessage(cancellationReason === "其他" ? "請填寫其他取消原因。" : "請選擇取消訂單的原因。");
      return;
    }
    if (resolvedCancellationReason.length > MAX_CANCELLATION_REASON_LENGTH) {
      setMessage(`取消原因最多 ${MAX_CANCELLATION_REASON_LENGTH} 個字。`);
      return;
    }
    if (!window.confirm("確定取消此訂單？系統會依既有安全流程回補已扣庫存，並同步處理會員抵用金與相關權益。")) {
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "cancelled",
          trackingNumber: "",
          cancellationReason: resolvedCancellationReason,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || result.warning || "取消訂單失敗");
      setMessage(result.warning ? `訂單已取消，但後續處理有警告：${result.warning}` : "訂單已取消");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "取消訂單失敗");
    } finally {
      setBusy(false);
    }
  }

  async function associate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await send({ action: "associate", externalOrderId, externalShipmentId });
  }

  const primaryAction = !terminal && !isSevenEleven
    ? record.currentState === "order_created"
      ? { label: "開始準備", state: "preparing" as FulfillmentState }
      : record.currentState === "preparing"
        ? { label: "標記為可以取貨", state: "ready_for_store_pickup" as FulfillmentState }
        : record.currentState === "ready_for_store_pickup"
          ? { label: "確認客人已取貨", state: "completed" as FulfillmentState, terminal: true }
          : null
    : !terminal && isSevenEleven && record.currentState === "order_created"
      ? { label: "開始準備", state: "preparing" as FulfillmentState }
      : null;

  const automationMessage = isSevenEleven && !terminal
    ? record.currentState === "preparing"
      ? "下一步由 Gmail 自動追蹤：收到 7-ELEVEN「賣家完成寄貨」通知後，系統會自動標記為已寄件。"
      : ["shipped", "in_transit"].includes(record.currentState)
        ? "已寄件。系統會繼續等待 7-ELEVEN 到店通知並自動更新。"
        : record.currentState === "arrived_at_pickup_store"
          ? "已到店。系統會等待買家完成取貨通知，收到後自動完成此訂單。"
          : null
    : null;

  return (
    <div className="fulfillment-order-controls guided-fulfillment">
      <div className="guided-fulfillment-head">
        <div>
          <small>{isSevenEleven ? "7-ELEVEN 履約流程" : "工作室自取流程"}</small>
          <strong>{orderCancelled ? "已取消" : fulfillmentStateLabels[record.currentState]}</strong>
        </div>
        <span className={`fulfillment-state-chip state-${record.currentState}`}>
          {isSevenEleven ? "7-ELEVEN" : "工作室自取"}
        </span>
      </div>

      <ol className="guided-fulfillment-timeline" aria-label={isSevenEleven ? "7-ELEVEN 訂單處理進度" : "工作室自取訂單處理進度"}>
        {steps.map((step, index) => {
          const complete = index < activeIndex || record.currentState === "completed";
          const current = index === activeIndex && record.currentState !== "completed";
          return (
            <li className={`${complete ? "is-complete" : ""}${current ? " is-current" : ""}`} key={step.state}>
              <span className="guided-step-dot">{complete ? "✓" : index + 1}</span>
              <div>
                <strong>{step.label}</strong>
                {step.automatic ? <small>Gmail 自動</small> : <small>{index === 0 ? "系統" : "人工操作"}</small>}
              </div>
            </li>
          );
        })}
      </ol>

      {primaryAction ? (
        <div className="guided-next-action">
          <small>下一步</small>
          <button type="button" className="primary" disabled={busy} onClick={() => transition(primaryAction.state, Boolean(primaryAction.terminal))}>
            {busy ? "更新中…" : primaryAction.label}
          </button>
        </div>
      ) : null}

      {automationMessage ? (
        <div className="guided-automation-note" role="status">
          <span>自動處理</span>
          <p>{automationMessage}</p>
        </div>
      ) : null}

      {terminal ? (
        <div className="guided-complete-note">
          <strong>{orderCancelled ? "這張訂單已取消" : record.currentState === "completed" ? "這張訂單已完成" : fulfillmentStateLabels[record.currentState]}</strong>
          <span>日常履約流程已結束；如需特殊處理請使用下方進階操作。</span>
        </div>
      ) : null}

      {isSevenEleven ? (
        <details className="guided-secondary-panel">
          <summary>7-ELEVEN 物流編號與人工例外處理</summary>
          <div className="guided-secondary-content">
            <form onSubmit={associate}>
              <label>賣貨便訂單編號<input value={externalOrderId} onChange={(event) => setExternalOrderId(event.target.value.toUpperCase())} placeholder="CM…" required /></label>
              <label>交貨便單號<input value={externalShipmentId} onChange={(event) => setExternalShipmentId(event.target.value.toUpperCase())} placeholder="E…（選填）" /></label>
              <button disabled={busy}>儲存物流編號</button>
            </form>
            <p className="guided-secondary-help">正常情況由 Gmail 自動更新「已寄件／已到店／完成取貨」。只有自動通知異常時才需要人工處理。</p>
            <div className="fulfillment-action-grid compact">
              <button type="button" disabled={busy} onClick={() => transition("shipped")}>人工標記已寄件</button>
              <button type="button" disabled={busy} onClick={() => transition("arrived_at_pickup_store")}>人工標記已到店</button>
              <button type="button" disabled={busy} onClick={() => transition("completed", true)}>人工確認已取貨</button>
              <button type="button" disabled={busy} onClick={() => void send({ action: "recheck" })}>重新檢查</button>
            </div>
          </div>
        </details>
      ) : (
        <details className="guided-secondary-panel">
          <summary>例外與進階處理</summary>
          <div className="guided-secondary-content">
            <button type="button" disabled={busy} onClick={() => void send({ action: "recheck" })}>重新檢查</button>
          </div>
        </details>
      )}

      <details className="guided-secondary-panel">
        <summary>取消訂單／未取貨／安全調整</summary>
        <div className="guided-secondary-content">
          {!terminal ? (
            <div className="gmail-connection-box">
              <span>取消訂單</span>
              <p>「取消訂單」與「未取貨」不同。取消訂單會走既有安全取消流程；未取貨則代表商品已進入履約，但客人最後沒有完成取貨。</p>
              {cancellationAllowed ? (
                <>
                  <label>
                    取消原因
                    <select
                      value={cancellationReason}
                      onChange={(event) => {
                        setCancellationReason(event.target.value);
                        if (event.target.value !== "其他") setCancellationOtherReason("");
                      }}
                    >
                      <option value="" disabled>請選擇取消原因</option>
                      <option value="單純想取消">單純想取消</option>
                      <option value="行程／取貨時間不方便">行程／取貨時間不方便</option>
                      <option value="咖啡還沒喝完，暫時不需要">咖啡還沒喝完，暫時不需要</option>
                      <option value="想更換咖啡／數量／烘焙度">想更換咖啡／數量／烘焙度</option>
                      <option value="重複下單或誤操作">重複下單或誤操作</option>
                      <option value="預算考量">預算考量</option>
                      <option value="其他">其他</option>
                    </select>
                  </label>
                  {cancellationReason === "其他" ? (
                    <label>
                      其他取消原因
                      <textarea
                        value={cancellationOtherReason}
                        onChange={(event) => setCancellationOtherReason(event.target.value)}
                        maxLength={197}
                        rows={3}
                        placeholder="請簡單記錄取消原因"
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className="danger"
                    disabled={busy || !resolvedCancellationReason}
                    onClick={() => void cancelOrder()}
                  >
                    {busy ? "處理中…" : "確認取消訂單"}
                  </button>
                </>
              ) : (
                <p className="guided-secondary-help">
                  {cancellationBlockedMessage || "此訂單目前不能使用一般取消操作。"}
                </p>
              )}
            </div>
          ) : null}

          <div className="fulfillment-settings-grid">
            <label>人工確認未取貨原因<select value={uncollectedReason} onChange={(event) => setUncollectedReason(event.target.value)}><option value="">請先選擇</option><option>門市確認逾期未取</option><option>顧客確認不取貨</option><option>物流退回確認</option><option>其他人工確認</option></select></label>
            <label>補充說明（選填）<input value={uncollectedNote} maxLength={200} onChange={(event) => setUncollectedNote(event.target.value)} placeholder="留下可追溯的確認依據" /></label>
          </div>
          <button type="button" className="danger" disabled={busy || !uncollectedReason} onClick={() => transition("uncollected", true)}>確認未取貨</button>

          {["order_created", "preparing"].includes(record.currentState) ? (
            <div className="gmail-connection-box">
              <span>Owner 安全調整</span>
              <p>只調整尚未進入不可逆物流階段的日期或門市，不會重算價格、折扣、抵用金或贈品快照。</p>
              <label>調整原因<input value={overrideReason} maxLength={200} onChange={(event) => setOverrideReason(event.target.value)} placeholder="例如：客人來電要求調整" /></label>
              {orderMode === "studio_pickup" ? (
                <label>新自取日期<input type="date" value={overrideDate} onChange={(event) => setOverrideDate(event.target.value)} /></label>
              ) : (
                <div className="fulfillment-settings-grid">
                  <label>門市店號<input value={overrideStore.id} onChange={(event) => setOverrideStore({ ...overrideStore, id: event.target.value.toUpperCase() })} /></label>
                  <label>門市名稱<input value={overrideStore.name} onChange={(event) => setOverrideStore({ ...overrideStore, name: event.target.value })} /></label>
                  <label>門市地址<input value={overrideStore.address} onChange={(event) => setOverrideStore({ ...overrideStore, address: event.target.value })} /></label>
                </div>
              )}
              <button type="button" disabled={busy || !overrideReason || (orderMode === "studio_pickup" ? !overrideDate : !overrideStore.id || !overrideStore.name)} onClick={() => void send({ action: "override", overrideAction: orderMode === "studio_pickup" ? "change-date" : "change-store", idempotencyKey: crypto.randomUUID(), reason: overrideReason, date: overrideDate, store: overrideStore })}>
                儲存安全調整
              </button>
            </div>
          ) : null}
        </div>
      </details>

      {message ? <p role="status" className="fulfillment-action-message">{message}</p> : null}
    </div>
  );
}
