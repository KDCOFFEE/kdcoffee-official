"use client";

import { useState } from "react";
import Link from "next/link";

import StoreSelector from "@/components/commerce/StoreSelector";
import type { MemberCreditHistoryEntry, Subscription, SubscriptionCycle } from "@/lib/membershipCommerce";
import { addDateOnlyDays, ALLOWED_ROAST_LEVELS, getDateOnlyInTimeZone } from "@/lib/checkoutRules";
import { isBeanSubscriptionItem } from "@/lib/membershipPolicies";
import { subscriptionItemProductIds } from "@/lib/subscriptionSkuModel";

type Dashboard = {
  subscriptions: Subscription[];
  cycles: SubscriptionCycle[];
  credits: MemberCreditHistoryEntry[];
  pendingCredit: number;
  referrals: Array<{ memberNumberReference: string; safeDisplayName: string; joined: boolean; qualifiedPurchases: number; rewards: number; status: string }>;
};

type Props = Dashboard & { products: Array<{ id: string; name: string; price: number; roast: string }>; rules: { intervalsDays: number[]; customCycleEnabled: boolean; customCycleMinDays: number; customCycleMaxDays: number; delayQuickOptionsDays: number[]; advanceQuickOptionsDays: number[]; preparationLeadDays: number; discountPercent: number; datePickerMode: "quick-and-calendar" | "calendar-only" | "suggestion-and-calendar"; maxModificationsPerCycle: number | null } };

const money = (value: number) => `NT$ ${value.toLocaleString("zh-TW")}`;
const subscriptionPrice = (value: number, percent: number) =>
  Math.floor((value * percent + 50) / 100);
const statusLabel = (value: Subscription["status"]) => ({ pending_activation: "等待首筆訂單取貨", active: "配送中", paused: "已暫停", terminated: "已停止" })[value];
const redemptionLabel = (status: MemberCreditHistoryEntry["orderRedemptions"][number]["status"]) => status === "released" ? "訂單取消，抵用金已返還" : status === "reserved" ? "本筆已保留折抵" : "本筆已使用";
const displayDate = (value?: string) => value ? value.replaceAll("-", "/") : "尚未排定";

function actionSuccessMessage(action: string, plannedDate?: string) {
  if (action === "pause") return "定期配送已暫停。";
  if (action === "resume") return `定期配送已恢復。下一次配送日期：${displayDate(plannedDate)}。`;
  if (action === "skip") return plannedDate
    ? `已跳過本次配送。下一次配送日期：${displayDate(plannedDate)}，原配送週期維持不變。`
    : "已跳過本次配送。原配送週期維持不變。";
  if (["advance", "delay", "change-date"].includes(action)) return `下一次配送日期已更新。新的配送日期：${displayDate(plannedDate)}。`;
  if (action === "change-store") return "7-ELEVEN 取貨門市已更新。";
  if (action === "replenish") return `補貨安排已建立。預計配送日期：${displayDate(plannedDate)}。`;
  if (action === "terminate") return "未來定期配送已停止；已建立的本次配送不會自動取消。";
  if (action === "change-items") return "下一次配送內容已更新。";
  return "定期配送安排已更新。";
}

export default function MemberSubscriptionExperience(initial: Props) {
  const [dashboard, setDashboard] = useState<Dashboard>(initial);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [resumeDate, setResumeDate] = useState("");
  const initialResumeInterval =
    initial.subscriptions[0]?.intervalDays ??
    initial.rules.intervalsDays[0] ??
    30;
  const [resumeInterval, setResumeInterval] = useState(initialResumeInterval);
  const [resumeIntervalMode, setResumeIntervalMode] = useState<"preset" | "custom">(
    initial.rules.intervalsDays.includes(initialResumeInterval)
      ? "preset"
      : "custom",
  );
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationOtherReason, setCancellationOtherReason] = useState("");
  const [replacementDate, setReplacementDate] = useState("");
  const [showPriceDetails, setShowPriceDetails] = useState(false);
  const [selectedProductA, setSelectedProductA] = useState("");
  const [selectedProductB, setSelectedProductB] = useState("");
  const resolvedCancellationReason = cancellationReason === "其他"
    ? cancellationOtherReason.trim()
      ? `其他：${cancellationOtherReason.trim()}`
      : ""
    : cancellationReason.trim();

  async function mutate(action: string, payload: Record<string, unknown>, options: { rethrow?: boolean } = {}) {
    setBusy(action);
    setMessage("");
    try {
      const response = await fetch("/api/member/subscription", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload, idempotencyKey: `${action}-${crypto.randomUUID()}` }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "操作未完成");
      setDashboard({ subscriptions: result.subscriptions, cycles: result.cycles, credits: result.credits, pendingCredit: result.pendingCredit, referrals: result.referrals });
      setMessage(actionSuccessMessage(action, result.actionResult?.plannedDate));
      return result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "操作未完成，請再試一次。";
      if (options.rethrow) throw new Error(detail);
      setMessage(detail);
      return null;
    } finally {
      setBusy("");
    }
  }

  async function refreshDashboard() {
    const response = await fetch("/api/member/subscription", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "無法更新最新配送安排");
    setDashboard({ subscriptions: result.subscriptions, cycles: result.cycles, credits: result.credits, pendingCredit: result.pendingCredit, referrals: result.referrals });
    return result as Dashboard;
  }

  const subscription = dashboard.subscriptions.find((item) => item.status !== "terminated") ?? dashboard.subscriptions[0];
  const nextCycle = subscription ? dashboard.cycles.find((item) => item.subscriptionId === subscription.subscriptionId && ["scheduled", "modifiable"].includes(item.status)) : undefined;
  const currentOrderCycle = subscription ? dashboard.cycles.find((item) => item.subscriptionId === subscription.subscriptionId && item.status === "order_created" && Boolean(item.createdOrderId)) : undefined;
  const manualArrangement = subscription ? dashboard.cycles.find((item) => item.subscriptionId === subscription.subscriptionId && item.kind === "manual_replenishment" && ["locked", "order_created"].includes(item.status)) : undefined;
  const currentArrangement = currentOrderCycle ?? manualArrangement;
  const availableCredit = dashboard.credits.filter((item) => item.status === "available").reduce((sum, item) => sum + item.remainingAmount, 0);
  const productName = (id: string) => initial.products.find((product) => product.id === id)?.name ?? id;
  const nextItems = nextCycle?.itemsDraft ?? subscription?.defaultItems ?? [];
  const editableBeanItem = nextItems.length === 1 && isBeanSubscriptionItem(nextItems[0]) ? nextItems[0] : null;
  const nextSubtotal = nextItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const expectedPayment = subscriptionPrice(
    nextSubtotal,
    initial.rules.discountPercent,
  );

  const lockedPricing = nextCycle?.pricingSnapshot ?? null;
  const displayedOriginal = lockedPricing?.merchandiseOriginal ?? nextSubtotal;
  const displayedSubscriptionPrice =
    lockedPricing?.subscriptionPrice ?? expectedPayment;
  const displayedFinal =
    lockedPricing?.finalAmount ?? displayedSubscriptionPrice;
  const subscriptionSaving = Math.max(
    0,
    displayedOriginal - displayedSubscriptionPrice,
  );

  const selectedProductAInfo = initial.products.find(
    (product) =>
      product.id ===
      (selectedProductA ||
        editableBeanItem?.components[0]?.productId),
  );

  const selectedProductBInfo = initial.products.find(
    (product) =>
      product.id ===
      (selectedProductB ||
        editableBeanItem?.components[1]?.productId ||
        editableBeanItem?.components[0]?.productId),
  );
  const earliestDate = addDateOnlyDays(getDateOnlyInTimeZone(new Date()), initial.rules.preparationLeadDays);
  const remainingChanges = nextCycle && initial.rules.maxModificationsPerCycle !== null ? Math.max(0, initial.rules.maxModificationsPerCycle - (nextCycle.modificationCount ?? 0)) : null;

  async function cancelCurrentDelivery(choice: "current" | "current-and-stop" | "current-and-reschedule") {
    if (!currentOrderCycle?.createdOrderId) return;
    if (!resolvedCancellationReason) {
      setMessage(cancellationReason === "其他" ? "請填寫其他取消原因。" : "請選擇取消本次配送的原因。");
      return;
    }
    setBusy("cancel-current");
    setMessage("");
    let currentCancellationCompleted = false;
    try {
      const response = await fetch(`/api/member/orders/${encodeURIComponent(currentOrderCycle.createdOrderId)}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancellationReason: resolvedCancellationReason, idempotencyKey: `member-cancel-${crypto.randomUUID()}` }),
      });
      const result = await response.json();
      if (!response.ok && result.result !== "customer_service_required") throw new Error(result.error || "取消申請未完成");
      if (result.result === "customer_service_required") {
        setMessage(result.customerMessage || result.error);
        return;
      }
      currentCancellationCompleted = result.result === "cancelled" || result.result === "already_cancelled";

      let finalMessage = String(result.customerMessage || "取消申請已處理。");
      if (choice === "current-and-stop") {
        await mutate("terminate", { subscriptionId: subscription!.subscriptionId, expectedRevision: subscription!.revision }, { rethrow: true });
        finalMessage = result.result === "requires_manual_shipment_void"
          ? `${finalMessage} 未來定期配送已停止；本次配送仍需等待物流單作廢確認。`
          : "本次配送已取消，未來定期配送也已停止。";
      } else if (choice === "current-and-reschedule") {
        if (result.result === "requires_manual_shipment_void") {
          finalMessage = `${finalMessage} 物流單作廢確認前，尚未變更下一次配送日期。`;
        } else if (nextCycle) {
          const changed = await mutate("change-date", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate: replacementDate || nextCycle.plannedDate, recalculateAnchor: false }, { rethrow: true });
          finalMessage = `本次配送已取消，定期配送保留。下一次配送日期：${displayDate(changed.actionResult?.plannedDate)}。`;
        }
      } else {
        await refreshDashboard();
      }
      setMessage(finalMessage);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "操作未完成，請再試一次。";
      if (currentCancellationCompleted) {
        await refreshDashboard().catch(() => undefined);
        setMessage(choice === "current-and-reschedule"
          ? `本次配送已成功取消，但下一次配送日期未能更新：${detail}。請重新選擇下一次配送日期。`
          : choice === "current-and-stop"
            ? `本次配送已成功取消，但未來定期配送未能停止：${detail}。請再試一次。`
            : `本次配送已成功取消，但最新畫面未能更新：${detail}。請重新整理頁面。`);
      } else {
        setMessage(detail);
      }
    } finally {
      setBusy("");
    }
  }

  return <>
    <section className="member-commerce-section" id="subscription">
      <div className="member-section-head"><div><p className="eyebrow dark">SUBSCRIPTION</p><h2>我的定期配送</h2></div>{subscription && <span className={`member-subscription-status ${subscription.status}`}>{statusLabel(subscription.status)}</span>}</div>
      {message && <p className="member-notice" role="status">{message}</p>}
      {!subscription ? <div className="member-commerce-empty"><strong>還沒有定期配送</strong><p>第一次購買時可勾選加入。首筆仍是原價，成功取貨後才會開始定期配送與續訂優惠。</p><Link href="/works">挑選咖啡作品</Link></div> : <div className="member-subscription-grid">
        <article className="member-subscription-summary">
          <div><small>配送週期</small><strong>每 {subscription.intervalDays} 天</strong></div>
          <div><small>下次安排</small><strong>{nextCycle?.plannedDate ?? (subscription.status === "pending_activation" ? "首筆取貨後安排" : "尚未排定")}</strong></div>
          <div><small>取貨門市</small><strong>{subscription.storeSelection?.storeName ?? "工作室自取"}</strong></div>
          <div><small>下一次咖啡</small><strong>{nextItems.flatMap(subscriptionItemProductIds).map(productName).join(" + ") || "尚未選擇"}</strong></div>
          <div><small>修改截止</small><strong>{nextCycle?.modificationDeadline ?? "啟動後顯示"}</strong></div>
          <div>
  <small>預估應付</small>
  <strong>{nextCycle ? money(displayedFinal) : "啟動後計算"}</strong>
  {nextCycle && (
    <>
      <span>
        原價 {money(displayedOriginal)} → 定期購
        {lockedPricing?.subscriptionDiscountPercent ??
          initial.rules.discountPercent}
        折 {money(displayedSubscriptionPrice)}
      </span>
      <button
        type="button"
        className="member-price-detail-button"
        onClick={() => setShowPriceDetails(true)}
      >
        查看金額明細
      </button>
    </>
  )}
</div>
        </article>

        {currentArrangement && <div className="member-commerce-callout"><strong>目前配送安排</strong><p>{currentArrangement.kind === "manual_replenishment" ? "立即補貨" : "定期配送"}：{displayDate(currentArrangement.plannedDate)}{currentArrangement.createdOrderId ? `（訂單 ${currentArrangement.createdOrderId}）` : "（尚未建立訂單）"}</p></div>}

        {subscription.status === "pending_activation" ? <div className="member-commerce-callout"><strong>目前不會自動建立下一張訂單</strong><p>等首筆原價訂單成功取貨後，才會正式啟動。您可以先在這裡確認內容。</p></div> : <div className="member-subscription-actions">
          {currentOrderCycle && <details><summary>取消本次配送</summary><div className="member-action-panel"><p>取消本次配送與停止未來定期配送是兩件不同的事。請明確選擇要處理的範圍。</p><label>取消原因<select required value={cancellationReason} onChange={(event) => { setCancellationReason(event.target.value); if (event.target.value !== "其他") setCancellationOtherReason(""); }}><option value="" disabled>請選擇取消原因</option><option value="單純想取消">單純想取消</option><option value="行程／取貨時間不方便">行程／取貨時間不方便</option><option value="咖啡還沒喝完，暫時不需要">咖啡還沒喝完，暫時不需要</option><option value="想更換咖啡／數量／烘焙度">想更換咖啡／數量／烘焙度</option><option value="重複下單或誤操作">重複下單或誤操作</option><option value="預算考量">預算考量</option><option value="其他">其他</option></select></label>{cancellationReason === "其他" && <label>其他取消原因<textarea maxLength={197} required value={cancellationOtherReason} onChange={(event) => setCancellationOtherReason(event.target.value)} placeholder="請簡單告訴我們取消原因" /></label>}<div className="member-action-buttons"><button className="member-danger-soft" disabled={Boolean(busy) || !resolvedCancellationReason} onClick={() => void cancelCurrentDelivery("current")}>只取消本次配送</button><button className="member-danger-soft" disabled={Boolean(busy) || !resolvedCancellationReason} onClick={() => void cancelCurrentDelivery("current-and-stop")}>取消本次配送，並停止之後的定期配送</button></div>{nextCycle && <><label>保留定期配送時的下一次配送日期<input type="date" min={earliestDate} value={replacementDate || nextCycle.plannedDate} onChange={(event) => setReplacementDate(event.target.value)} /></label><button disabled={Boolean(busy) || !resolvedCancellationReason} onClick={() => void cancelCurrentDelivery("current-and-reschedule")}>取消本次配送，保留定期配送並更新下次日期</button></>}<small>若此訂單已建立 7-ELEVEN 寄件資訊，送出後只是取消申請；KD Coffee 確認寄件單作廢前，訂單不會顯示為已取消，也不會回補庫存。</small></div></details>}
          {nextCycle && <details><summary>調整下一次日期</summary><div className="member-action-panel"><p>最早可配送日為 {earliestDate}。選好日期後，請決定只套用本次，或讓之後的定期購也從新日期重新計算。{remainingChanges === null ? "" : ` 本期還可修改 ${remainingChanges} 次。`}</p><label>新的配送日期<input type="date" id="member-next-date" min={earliestDate} defaultValue={nextCycle.plannedDate} /></label><div className="subscription-enrollment-summary"><span>新建立訂單日與修改截止日會在確認後依目前營運規則重新計算。</span></div><div className="member-action-buttons"><button disabled={Boolean(busy) || remainingChanges === 0} onClick={() => { const plannedDate = (document.getElementById("member-next-date") as HTMLInputElement).value; void mutate("change-date", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate, recalculateAnchor: false }); }}>只套用這一次</button><button disabled={Boolean(busy) || remainingChanges === 0} onClick={() => { const plannedDate = (document.getElementById("member-next-date") as HTMLInputElement).value; void mutate("change-date", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate, recalculateAnchor: true }); }}>之後也從新日期重新計算</button></div>{initial.rules.datePickerMode !== "calendar-only" && <div className="member-quick-delays">{initial.rules.advanceQuickOptionsDays.map((days) => <button key={`advance-${days}`} type="button" disabled={Boolean(busy) || remainingChanges === 0} onClick={() => void mutate("advance", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate: addDateOnlyDays(nextCycle.plannedDate, -days), recalculateAnchor: false })}>提前 {days} 天</button>)}{initial.rules.delayQuickOptionsDays.map((days) => <button key={`delay-${days}`} type="button" disabled={Boolean(busy) || remainingChanges === 0} onClick={() => void mutate("delay", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate: addDateOnlyDays(nextCycle.plannedDate, days), recalculateAnchor: false })}>延後 {days} 天</button>)}</div>}</div></details>}
          {nextCycle && <details><summary>跳過這一次</summary><div className="member-action-panel"><p>只跳過 {nextCycle.plannedDate} 這一次，不會改變後續配送週期。</p><button className="member-danger-soft" disabled={Boolean(busy)} onClick={() => void mutate("skip", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision })}>確認跳過</button></div></details>}
          {nextCycle && editableBeanItem && initial.products.length > 0 && <details><summary>更換咖啡、份量或烘焙度</summary><form className="member-action-panel" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void mutate("change-items", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, packageWeight: form.get("packageWeight"), productA: form.get("productA"), productB: form.get("productB"), quantity: form.get("quantity"), roast: form.get("roast") }); }}><p>這裡只調整下一次配送。一磅可選同款 A+A，或兩款 A+B。</p><label>份量<select name="packageWeight" defaultValue={editableBeanItem.packageWeight}><option value="half-pound">半磅</option><option value="one-pound">一磅（兩個半磅組合）</option></select></label><label>
  第一款咖啡
  <select
    name="productA"
    defaultValue={editableBeanItem.components[0]?.productId}
    onChange={(event) => setSelectedProductA(event.target.value)}
  >
    {initial.products.map((product) => (
      <option key={product.id} value={product.id}>
        {product.name}・半磅 {money(product.price)}
      </option>
    ))}
  </select>
  {selectedProductAInfo && (
    <span className="member-subscription-price-preview">
      一般價 <del>{money(selectedProductAInfo.price)}</del>
      <b>
        定期購價{" "}
        {money(
          subscriptionPrice(
            selectedProductAInfo.price,
            initial.rules.discountPercent,
          ),
        )}
      </b>
    </span>
  )}
</label><label>
  第二款咖啡（一磅使用）
  <select
    name="productB"
    defaultValue={
      editableBeanItem.components[1]?.productId ??
      editableBeanItem.components[0]?.productId
    }
    onChange={(event) => setSelectedProductB(event.target.value)}
  >
    {initial.products.map((product) => (
      <option key={product.id} value={product.id}>
        {product.name}・半磅 {money(product.price)}
      </option>
    ))}
  </select>
  {selectedProductBInfo && (
    <span className="member-subscription-price-preview">
      一般價 <del>{money(selectedProductBInfo.price)}</del>
      <b>
        定期購價{" "}
        {money(
          subscriptionPrice(
            selectedProductBInfo.price,
            initial.rules.discountPercent,
          ),
        )}
      </b>
    </span>
  )}
</label><label>數量<input name="quantity" type="number" min={1} max={12} defaultValue={editableBeanItem.quantity} /></label><label>烘焙度<select name="roast" defaultValue={editableBeanItem.roast}>{ALLOWED_ROAST_LEVELS.map((roast) => <option key={roast} value={roast}>{roast}</option>)}</select></label><button disabled={Boolean(busy)} type="submit">儲存下一次內容</button></form></details>}
          <details><summary>更換 7-ELEVEN 門市</summary><form className="member-action-panel" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void mutate("change-store", { subscriptionId: subscription.subscriptionId, expectedRevision: subscription.revision, storeId: form.get("storeId"), storeName: form.get("storeName") }); }}><StoreSelector initialStore={subscription.storeSelection ? { id: subscription.storeSelection.storeId, name: subscription.storeSelection.storeName, address: "" } : undefined} /><button disabled={Boolean(busy)} type="submit">儲存門市</button></form></details>
          <details><summary>暫停、恢復或停止未來定期配送</summary><div className="member-action-panel"><p>這裡只管理未來的定期配送；停止定期配送不會取消已建立的本次訂單。</p>{subscription.status === "active" && <button disabled={Boolean(busy)} onClick={() => void mutate("pause", { subscriptionId: subscription.subscriptionId, expectedRevision: subscription.revision })}>暫停未來定期配送</button>}{subscription.status === "paused" && <><label>恢復日期<input type="date" value={resumeDate} onChange={(event) => setResumeDate(event.target.value)} /></label><label>新的配送週期<select
  value={resumeIntervalMode === "custom" ? "custom" : resumeInterval}
  onChange={(event) => {
    if (event.target.value === "custom") {
      setResumeIntervalMode("custom");
      setResumeInterval(initial.rules.customCycleMinDays);
      return;
    }
    setResumeIntervalMode("preset");
    setResumeInterval(Number(event.target.value));
  }}
>
{initial.rules.intervalsDays.map((days) => <option key={days} value={days}>每 {days} 天</option>)}
{initial.rules.customCycleEnabled && <option value="custom">自訂天數</option>}
</select>
</label>
{initial.rules.customCycleEnabled && resumeIntervalMode === "custom" && (
  <label>
    自訂配送週期
    <input
      type="number"
      min={initial.rules.customCycleMinDays}
      max={initial.rules.customCycleMaxDays}
      value={resumeInterval}
      onChange={(event) =>
        setResumeInterval(Number(event.target.value))
      }
    />
    <small>
      可設定 {initial.rules.customCycleMinDays}～{initial.rules.customCycleMaxDays} 天
    </small>
  </label>
)}
<button disabled={Boolean(busy) || !resumeDate} onClick={() => void mutate("resume", { subscriptionId: subscription.subscriptionId, expectedRevision: subscription.revision, resumeDate, intervalDays: resumeInterval })}>確認恢復</button></>}<button className="member-danger-soft" disabled={Boolean(busy)} onClick={() => void mutate("terminate", { subscriptionId: subscription.subscriptionId, expectedRevision: subscription.revision })}>只停止之後的定期配送，本次配送照常</button></div></details>
          {subscription.status === "active" && <button className="member-replenish-button" disabled={Boolean(busy)} onClick={() => void mutate("replenish", { subscriptionId: subscription.subscriptionId })}>立即補貨（不改下次日期）</button>}
        </div>}
      </div>}
    </section>

    {showPriceDetails && nextCycle && (
      <div
        className="member-price-modal-backdrop"
        role="presentation"
        onClick={() => setShowPriceDetails(false)}
      >
        <div
          className="member-price-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-price-detail-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="member-price-modal-head">
            <div>
              <small>SUBSCRIPTION PRICE</small>
              <h3 id="member-price-detail-title">本期金額明細</h3>
            </div>
            <button
              type="button"
              aria-label="關閉"
              onClick={() => setShowPriceDetails(false)}
            >
              ×
            </button>
          </div>

          <div className="member-price-breakdown">
            <div>
              <span>商品原價</span>
              <strong>{money(displayedOriginal)}</strong>
            </div>

            <div>
              <span>
                定期購優惠（
                {lockedPricing?.subscriptionDiscountPercent ??
                  initial.rules.discountPercent}
                折）
              </span>
              <strong>− {money(subscriptionSaving)}</strong>
            </div>

            <div>
              <span>定期購價格</span>
              <strong>{money(displayedSubscriptionPrice)}</strong>
            </div>

            {lockedPricing?.campaignPrice != null && (
              <div>
                <span>活動價格</span>
                <strong>{money(lockedPricing.campaignPrice)}</strong>
              </div>
            )}

            <div>
              <span>本期採用</span>
              <strong>
                {lockedPricing
                  ? lockedPricing.selectedPriceSource === "campaign"
                    ? "活動優惠價"
                    : "定期購優惠價"
                  : "鎖定本期時自動比較較優惠價格"}
              </strong>
            </div>

            {lockedPricing && (
              <>
                <div>
                  <span>配送費</span>
                  <strong>{money(lockedPricing.shipping)}</strong>
                </div>

                <div>
                  <span>抵用金</span>
                  <strong>
                    − {money(lockedPricing.creditReserved)}
                  </strong>
                </div>
              </>
            )}
          </div>

          <div className="member-price-modal-total">
            <span>
              {lockedPricing ? "本期應付" : "目前預估應付"}
            </span>
            <strong>{money(displayedFinal)}</strong>
          </div>

          {!lockedPricing && (
            <p className="member-price-modal-note">
              此期尚未鎖定。活動優惠、配送費與抵用金會在本期鎖定時依正式規則重新計算，系統會自動採用較優惠的商品價格。
            </p>
          )}

          <button
            type="button"
            className="member-price-modal-close"
            onClick={() => setShowPriceDetails(false)}
          >
            我知道了
          </button>
        </div>
      </div>
    )}
    <section className="member-commerce-section" id="credit"><div className="member-section-head"><div><p className="eyebrow dark">CREDIT</p><h2>我的抵用金</h2></div><strong>{money(availableCredit)}</strong></div><div className="member-credit-summary"><div><small>現在可用</small><strong>{money(availableCredit)}</strong></div><div><small>待符合資格</small><strong>{money(dashboard.pendingCredit)}</strong></div></div>{dashboard.credits.length ? <div className="member-credit-history">{dashboard.credits.map((entry) => <article key={entry.creditEntryId}><div><strong>{entry.direction === "deduct" ? "−" : "+"} {money(Math.abs(entry.amount))}</strong><small>{entry.sourceLabel}</small>{entry.orderRedemptions.map((redemption) => <span className={`member-credit-redemption ${redemption.status}`} key={`${entry.creditEntryId}-${redemption.orderNumber}`}><b>{redemptionLabel(redemption.status)} {money(redemption.amount)}</b><Link href={`/orders/${encodeURIComponent(redemption.orderNumber)}`}>訂單 {redemption.orderNumber}</Link></span>)}</div><div><span>餘額 {money(entry.remainingAmount)}</span>{entry.amount > 0 ? <small>到期 {entry.expiresAt.slice(0, 10)}</small> : null}</div></article>)}</div> : <div className="member-commerce-empty compact"><strong>目前沒有抵用金紀錄</strong><p>有抵用金時，結帳會讓您自行選擇是否使用，並優先使用最快到期的額度。</p></div>}</section>

    <section className="member-commerce-section" id="referral-summary"><div className="member-section-head"><div><p className="eyebrow dark">REFERRAL</p><h2>推薦紀錄摘要</h2></div><span>{dashboard.referrals.length} 位</span></div>{dashboard.referrals.length ? <div className="member-referral-list">{dashboard.referrals.map((item) => <article key={item.memberNumberReference}><div><strong>{item.safeDisplayName || "KD Coffee 會員"}</strong><small>已加入會員</small></div><div><span>符合 {item.qualifiedPurchases} 次</span><strong>{money(item.rewards)}</strong></div></article>)}</div> : <div className="member-commerce-empty compact"><strong>還沒有推薦紀錄</strong><p>這裡只會顯示安全的會員稱呼、是否加入與回饋進度，不會顯示對方的聯絡資料。</p></div>}</section>
  </>;
}
