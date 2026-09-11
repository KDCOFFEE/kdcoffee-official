"use client";

import { useState } from "react";
import Link from "next/link";

import StoreSelector from "@/components/commerce/StoreSelector";
import { addDateOnlyDays, ALLOWED_ROAST_LEVELS, getDateOnlyInTimeZone } from "@/lib/checkoutRules";
import type { PricedSubscriptionItem } from "@/lib/subscriptionItemTypes";
import {
  changeBeanPackageWeight,
  changeSubscriptionEditorItemKind,
  createSubscriptionEditorItem,
  editorDedicatedRoastProducts,
  effectiveMemberSubscriptionItemLimit,
  initializeSubscriptionEditorItems,
  normalizeSubscriptionEditorDedicatedRoasts,
  removeSubscriptionEditorItem,
  setSubscriptionEditorDedicatedRoast,
  skuOption,
  subscriptionEditorItemError,
  subscriptionEditorItemPrices,
  subscriptionEditorHasDedicatedRoast,
  subscriptionEditorPayload,
  subscriptionItemsSummary,
  subscriptionPrice,
  type MemberSubscriptionProduct,
  type SubscriptionEditorItem,
} from "@/components/member/memberSubscriptionEditorModel";
import {
  DEDICATED_ROAST_STANDARD_PREPARATION_DAYS,
  dedicatedRoastRushRequired,
  subscriptionHasDedicatedRoast,
} from "@/lib/subscriptionRoastPolicy";

type Subscription = {
  subscriptionId: string;
  status: "pending_activation" | "active" | "paused" | "terminated";
  intervalDays: number;
  storeSelection: { storeId: string; storeName: string } | null;
  defaultItems: PricedSubscriptionItem[];
  revision: number;
};

type SubscriptionCycle = {
  cycleId: string;
  subscriptionId: string;
  kind: "scheduled" | "manual_replenishment";
  status: string;
  plannedDate: string;
  modificationDeadline: string;
  itemsDraft: PricedSubscriptionItem[];
  pricingSnapshot: {
    merchandiseOriginal: number;
    subscriptionDiscountPercent: number;
    subscriptionPrice: number;
    campaignPrice: number | null;
    selectedPriceSource: "subscription" | "campaign";
    creditReserved: number;
    shipping: number;
    finalAmount: number;
  } | null;
  createdOrderId: string | null;
  revision: number;
  modificationCount?: number;
};

type MemberCreditHistoryEntry = {
  creditEntryId: string;
  amount: number;
  remainingAmount: number;
  expiresAt: string;
  status: "available" | "reserved" | "consumed" | "expired";
  direction: "grant" | "deduct";
  sourceLabel: string;
  orderRedemptions: Array<{ orderNumber: string; amount: number; status: "reserved" | "consumed" | "released" }>;
};

type Dashboard = {
  subscriptions: Subscription[];
  cycles: SubscriptionCycle[];
  credits: MemberCreditHistoryEntry[];
  pendingCredit: number;
  referrals: Array<{ memberNumberReference: string; safeDisplayName: string; joined: boolean; qualifiedPurchases: number; rewards: number; status: string }>;
};

type PendingRushConfirmation =
  | { kind: "items" }
  | { kind: "date"; action: "advance" | "delay" | "change-date"; payload: Record<string, unknown> }
  | { kind: "cancel-reschedule" };

type Props = Dashboard & { products: MemberSubscriptionProduct[]; rules: { intervalsDays: number[]; customCycleEnabled: boolean; customCycleMinDays: number; customCycleMaxDays: number; delayQuickOptionsDays: number[]; advanceQuickOptionsDays: number[]; preparationLeadDays: number; discountPercent: number; datePickerMode: "quick-and-calendar" | "calendar-only" | "suggestion-and-calendar"; maxModificationsPerCycle: number | null; allowOtherSubscriptionProducts?: boolean; allowHalfToOnePound?: boolean; allowOneToHalfPound?: boolean; allowMixedOnePound?: boolean; allowQuantityChange?: boolean; maxItems?: number } };

const money = (value: number) => `NT$ ${value.toLocaleString("zh-TW")}`;
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

const skuChoiceValue = (productId: string, skuId: string) => JSON.stringify([productId, skuId]);

function readSkuChoice(value: string) {
  try {
    const [productId, skuId] = JSON.parse(value) as unknown[];
    return { productId: String(productId || ""), skuId: String(skuId || "") };
  } catch {
    return { productId: "", skuId: "" };
  }
}

function initialDedicatedRoastLevel(configuredRoast: string) {
  return ALLOWED_ROAST_LEVELS.find((level) => level === configuredRoast) ?? ALLOWED_ROAST_LEVELS[0];
}

function ItemPricePreview({ item, products, discountPercent }: { item: SubscriptionEditorItem; products: MemberSubscriptionProduct[]; discountPercent: number }) {
  const prices = subscriptionEditorItemPrices(item, products, discountPercent);
  if (prices.regularUnit == null) return null;
  return <div className="member-subscription-item-prices">
    {prices.selections.map((selection, index) => <div className="member-subscription-component-price" key={`${selection.skuId}-${index}`}>
      <span>{selection.productName}・{selection.label}{selection.detail ? `・${selection.detail}` : ""}</span>
      <small>一般價 <del>{money(selection.price)}</del>　定期購價 <b>{money(subscriptionPrice(selection.price, discountPercent))}</b></small>
    </div>)}
    {item.kind === "beans" && item.packageWeight === "one-pound" && <div className="member-subscription-combined-price"><span>一磅組合</span><strong>一般價 <del>{money(prices.regularUnit)}</del>　定期購價 {money(prices.subscriptionUnit!)}</strong></div>}
    {item.quantity > 1 && <div className="member-subscription-line-price"><span>本商品 × {item.quantity}</span><strong>一般價 <del>{money(prices.regularLine!)}</del>　定期購價 {money(prices.subscriptionLine!)}</strong></div>}
  </div>;
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
  const [rushConfirmation, setRushConfirmation] = useState<PendingRushConfirmation | null>(null);
  const initialEditorSubscription = initial.subscriptions.find((item) => item.status !== "terminated") ?? initial.subscriptions[0];
  const initialEditorCycle = initialEditorSubscription ? initial.cycles.find((item) => item.subscriptionId === initialEditorSubscription.subscriptionId && ["scheduled", "modifiable"].includes(item.status)) : undefined;
  const initialEditorSource = initialEditorCycle?.itemsDraft ?? initialEditorSubscription?.defaultItems ?? [];
  const [editorItems, setEditorItems] = useState(() => initializeSubscriptionEditorItems(initialEditorSource, initial.products));
  const [originalProductIds] = useState(() => new Set(initialEditorSource.flatMap((item) => item.skuKind === "drip" ? [item.productId] : item.components.map((component) => component.productId))));
  const allowOtherSubscriptionProducts = initial.rules.allowOtherSubscriptionProducts === true;
  const allowHalfToOnePound = initial.rules.allowHalfToOnePound === true;
  const allowOneToHalfPound = initial.rules.allowOneToHalfPound === true;
  const allowMixedOnePound = initial.rules.allowMixedOnePound === true;
  const allowQuantityChange = initial.rules.allowQuantityChange === true;
  const maxEditorItems = effectiveMemberSubscriptionItemLimit(initial.rules.maxItems);
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
  const nextItems = nextCycle?.itemsDraft ?? subscription?.defaultItems ?? [];
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

  const today = getDateOnlyInTimeZone(new Date());
  const earliestDate = addDateOnlyDays(today, initial.rules.preparationLeadDays);
  const nextCycleHasDedicatedRoast = subscriptionHasDedicatedRoast(nextItems);
  const nextDateMinimum = nextCycleHasDedicatedRoast ? today : earliestDate;
  const remainingChanges = nextCycle && initial.rules.maxModificationsPerCycle !== null ? Math.max(0, initial.rules.maxModificationsPerCycle - (nextCycle.modificationCount ?? 0)) : null;
  const allowedProductIds = allowOtherSubscriptionProducts ? undefined : originalProductIds;
  const beanChoices = initial.products.flatMap((product) => allowedProductIds && !allowedProductIds.has(product.id) ? [] : product.options.filter((option) => option.kind === "beans").map((option) => ({ product, option })));
  const dripProducts = initial.products.filter((product) => (!allowedProductIds || allowedProductIds.has(product.id)) && product.options.some((option) => option.kind === "drip"));
  const editorErrors = editorItems.map((item) => subscriptionEditorItemError(item, initial.products) || (item.kind === "beans" && item.packageWeight === "one-pound" && !allowMixedOnePound && item.components[0]?.productId !== item.components[1]?.productId ? "目前一磅只開放同款 A+A 組合，請重新選擇第二款咖啡。" : ""));
  const editorHasError = editorErrors.some(Boolean);
  const editorAtLimit = editorItems.length >= maxEditorItems;
  const editorModificationLocked = remainingChanges === 0;
  const dedicatedRoastProducts = editorDedicatedRoastProducts(editorItems, initial.products);

  function updateEditorItem(localKey: string, update: (item: SubscriptionEditorItem) => SubscriptionEditorItem) {
    setEditorItems((items) => normalizeSubscriptionEditorDedicatedRoasts(items.map((item) => item.localKey === localKey ? update(item) : item)));
  }

  async function saveEditorItems(rushWarningAcknowledged = false) {
    if (!nextCycle || editorHasError || !editorItems.length || editorModificationLocked) return;
    const rushRequired = dedicatedRoastRushRequired({ hasDedicatedRoast: subscriptionEditorHasDedicatedRoast(editorItems), plannedDate: nextCycle.plannedDate, today });
    if (rushRequired && !rushWarningAcknowledged) {
      setRushConfirmation({ kind: "items" });
      return;
    }
    const result = await mutate("change-items", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, items: subscriptionEditorPayload(editorItems), rushWarningAcknowledged });
    const savedCycle = result?.cycles?.find((cycle: SubscriptionCycle) => cycle.cycleId === nextCycle.cycleId);
    if (savedCycle?.itemsDraft) setEditorItems(initializeSubscriptionEditorItems(savedCycle.itemsDraft, initial.products));
  }

  async function requestDateMutation(action: "advance" | "delay" | "change-date", payload: Record<string, unknown>, rushWarningAcknowledged = false) {
    const plannedDate = String(payload.plannedDate || "");
    const rushRequired = dedicatedRoastRushRequired({ hasDedicatedRoast: nextCycleHasDedicatedRoast, plannedDate, today });
    if (rushRequired && !rushWarningAcknowledged) {
      setRushConfirmation({ kind: "date", action, payload });
      return;
    }
    await mutate(action, { ...payload, rushWarningAcknowledged });
  }

  async function continueRushAction() {
    const pending = rushConfirmation;
    if (!pending) return;
    setRushConfirmation(null);
    if (pending.kind === "items") await saveEditorItems(true);
    else if (pending.kind === "cancel-reschedule") await cancelCurrentDelivery("current-and-reschedule", true);
    else await requestDateMutation(pending.action, pending.payload, true);
  }

  async function cancelCurrentDelivery(choice: "current" | "current-and-stop" | "current-and-reschedule", rushWarningAcknowledged = false) {
    if (!currentOrderCycle?.createdOrderId) return;
    if (!resolvedCancellationReason) {
      setMessage(cancellationReason === "其他" ? "請填寫其他取消原因。" : "請選擇取消本次配送的原因。");
      return;
    }
    if (choice === "current-and-reschedule" && nextCycle && dedicatedRoastRushRequired({ hasDedicatedRoast: nextCycleHasDedicatedRoast, plannedDate: replacementDate || nextCycle.plannedDate, today }) && !rushWarningAcknowledged) {
      setRushConfirmation({ kind: "cancel-reschedule" });
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
          const changed = await mutate("change-date", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate: replacementDate || nextCycle.plannedDate, recalculateAnchor: false, rushWarningAcknowledged }, { rethrow: true });
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
          <div><small>下一次商品</small><strong>{subscriptionItemsSummary(nextItems, initial.products) || "尚未選擇"}</strong></div>
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
          {currentOrderCycle && <details><summary>取消本次配送</summary><div className="member-action-panel"><p>取消本次配送與停止未來定期配送是兩件不同的事。請明確選擇要處理的範圍。</p><label>取消原因<select required value={cancellationReason} onChange={(event) => { setCancellationReason(event.target.value); if (event.target.value !== "其他") setCancellationOtherReason(""); }}><option value="" disabled>請選擇取消原因</option><option value="單純想取消">單純想取消</option><option value="行程／取貨時間不方便">行程／取貨時間不方便</option><option value="咖啡還沒喝完，暫時不需要">咖啡還沒喝完，暫時不需要</option><option value="想更換咖啡／數量／烘焙度">想更換咖啡／數量／烘焙度</option><option value="重複下單或誤操作">重複下單或誤操作</option><option value="預算考量">預算考量</option><option value="其他">其他</option></select></label>{cancellationReason === "其他" && <label>其他取消原因<textarea maxLength={197} required value={cancellationOtherReason} onChange={(event) => setCancellationOtherReason(event.target.value)} placeholder="請簡單告訴我們取消原因" /></label>}<div className="member-action-buttons"><button className="member-danger-soft" disabled={Boolean(busy) || !resolvedCancellationReason} onClick={() => void cancelCurrentDelivery("current")}>只取消本次配送</button><button className="member-danger-soft" disabled={Boolean(busy) || !resolvedCancellationReason} onClick={() => void cancelCurrentDelivery("current-and-stop")}>取消本次配送，並停止之後的定期配送</button></div>{nextCycle && <><label>保留定期配送時的下一次配送日期<input type="date" min={nextDateMinimum} value={replacementDate || nextCycle.plannedDate} onChange={(event) => setReplacementDate(event.target.value)} /></label><button disabled={Boolean(busy) || !resolvedCancellationReason} onClick={() => void cancelCurrentDelivery("current-and-reschedule")}>取消本次配送，保留定期配送並更新下次日期</button></>}<small>若此訂單已建立 7-ELEVEN 寄件資訊，送出後只是取消申請；KD Coffee 確認寄件單作廢前，訂單不會顯示為已取消，也不會回補庫存。</small></div></details>}
          {nextCycle && <details><summary>調整下一次日期</summary><div className="member-action-panel"><p>{nextCycleHasDedicatedRoast ? `本期含專屬烘焙；距配送不足 ${DEDICATED_ROAST_STANDARD_PREPARATION_DAYS} 天時會先顯示提醒，但仍可確認送出。` : `最早可配送日為 ${earliestDate}。`} 選好日期後，請決定只套用本次，或讓之後的定期購也從新日期重新計算。{remainingChanges === null ? "" : ` 本期還可修改 ${remainingChanges} 次。`}</p><label>新的配送日期<input type="date" id="member-next-date" min={nextDateMinimum} defaultValue={nextCycle.plannedDate} /></label><div className="subscription-enrollment-summary"><span>新建立訂單日與修改截止日會在確認後依目前營運規則重新計算。</span></div><div className="member-action-buttons"><button disabled={Boolean(busy) || remainingChanges === 0} onClick={() => { const plannedDate = (document.getElementById("member-next-date") as HTMLInputElement).value; void requestDateMutation("change-date", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate, recalculateAnchor: false }); }}>只套用這一次</button><button disabled={Boolean(busy) || remainingChanges === 0} onClick={() => { const plannedDate = (document.getElementById("member-next-date") as HTMLInputElement).value; void requestDateMutation("change-date", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate, recalculateAnchor: true }); }}>之後也從新日期重新計算</button></div>{initial.rules.datePickerMode !== "calendar-only" && <div className="member-quick-delays">{initial.rules.advanceQuickOptionsDays.map((days) => <button key={`advance-${days}`} type="button" disabled={Boolean(busy) || remainingChanges === 0} onClick={() => void requestDateMutation("advance", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate: addDateOnlyDays(nextCycle.plannedDate, -days), recalculateAnchor: false })}>提前 {days} 天</button>)}{initial.rules.delayQuickOptionsDays.map((days) => <button key={`delay-${days}`} type="button" disabled={Boolean(busy) || remainingChanges === 0} onClick={() => void requestDateMutation("delay", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate: addDateOnlyDays(nextCycle.plannedDate, days), recalculateAnchor: false })}>延後 {days} 天</button>)}</div>}</div></details>}
          {nextCycle && <details><summary>跳過這一次</summary><div className="member-action-panel"><p>只跳過 {nextCycle.plannedDate} 這一次，不會改變後續配送週期。</p><button className="member-danger-soft" disabled={Boolean(busy)} onClick={() => void mutate("skip", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision })}>確認跳過</button></div></details>}
          {nextCycle && <details><summary>調整下一次配送商品</summary><form className="member-action-panel member-subscription-items-editor" onSubmit={(event) => { event.preventDefault(); void saveEditorItems(); }}>
            <p>可調整下一次配送的商品、數量與咖啡豆烘焙設定。變更只套用目前這一期，除非現有產品流程明確另有規則。</p>
            {editorModificationLocked && <p className="member-subscription-editor-warning">本期已達修改次數上限，無法再調整商品。</p>}
            <div className="member-subscription-item-list">
              {editorItems.map((item, index) => {
                const itemError = editorErrors[index];
                const selectedDripProduct = item.kind === "drip" ? initial.products.find((product) => product.id === item.productId) : null;
                const availableDripSkus = selectedDripProduct?.options.filter((option) => option.kind === "drip") ?? [];
                return <article className="member-subscription-item-card" key={item.localKey}>
                  <header><div><small>SUBSCRIPTION ITEM</small><strong>商品 {index + 1}</strong></div>{editorItems.length > 1 && <button type="button" className="member-subscription-remove-item" disabled={Boolean(busy) || editorModificationLocked || !allowQuantityChange} title={!allowQuantityChange ? "目前規則未開放增減商品數量" : undefined} onClick={() => setEditorItems((items) => removeSubscriptionEditorItem(items, item.localKey))}>移除此商品</button>}</header>
                  <div className="member-subscription-item-fields">
                    <label>商品類型<select value={item.kind} disabled={Boolean(busy) || editorModificationLocked} onChange={(event) => updateEditorItem(item.localKey, (current) => changeSubscriptionEditorItemKind(current, event.target.value === "drip" ? "drip" : "beans", initial.products, allowedProductIds))}><option value="beans" disabled={!beanChoices.length}>咖啡豆</option><option value="drip" disabled={!dripProducts.length}>耳掛咖啡</option></select></label>
                    {item.kind === "beans" ? <>
                      <label>規格<select value={item.packageWeight} disabled={Boolean(busy) || editorModificationLocked} onChange={(event) => updateEditorItem(item.localKey, (current) => current.kind === "beans" ? changeBeanPackageWeight(current, event.target.value === "one-pound" ? "one-pound" : "half-pound") : current)}><option value="half-pound" disabled={item.originalPackageWeight === "one-pound" && !allowOneToHalfPound}>半磅</option><option value="one-pound" disabled={item.originalPackageWeight === "half-pound" && !allowHalfToOnePound}>一磅（兩個半磅組合）</option></select></label>
                      {item.components.map((component, componentIndex) => {
                        const choices = componentIndex === 1 && !allowMixedOnePound ? beanChoices.filter(({ product }) => product.id === item.components[0]?.productId) : beanChoices;
                        const value = skuChoiceValue(component.productId, component.skuId);
                        const available = choices.some(({ product, option }) => value === skuChoiceValue(product.id, option.skuId));
                        const selectedBeanProduct = initial.products.find((product) => product.id === component.productId);
                        return <label className="member-subscription-component-field" key={`${item.localKey}:component:${componentIndex}`}>{item.packageWeight === "one-pound" ? componentIndex === 0 ? "第一款半磅咖啡" : "第二款半磅咖啡" : "半磅咖啡"}<select value={value} disabled={Boolean(busy) || editorModificationLocked} onChange={(event) => {
                          const selected = readSkuChoice(event.target.value);
                          updateEditorItem(item.localKey, (current) => {
                            if (current.kind !== "beans") return current;
                            const components = current.components.map((entry, selectedIndex) => selectedIndex === componentIndex ? selected : entry);
                            if (componentIndex === 0 && current.packageWeight === "one-pound" && !allowMixedOnePound) components[1] = { ...selected };
                            const selectedProduct = initial.products.find((product) => product.id === selected.productId);
                            return { ...current, roast: componentIndex === 0 ? selectedProduct?.roast || "工作室建議" : current.roast, components };
                          });
                        }}>{!available && <option value={value} disabled>原咖啡豆 SKU 已無法供應，請重新選擇</option>}{choices.map(({ product, option }) => <option value={skuChoiceValue(product.id, option.skuId)} key={`${product.id}:${option.skuId}`}>{product.name}・{option.label}{option.detail ? `・${option.detail}` : ""}</option>)}</select><small>預設烘焙：{selectedBeanProduct?.roast || "工作室建議"}</small></label>;
                      })}
                    </> : <>
                      <label>咖啡作品<select value={item.productId} disabled={Boolean(busy) || editorModificationLocked} onChange={(event) => {
                        const product = initial.products.find((entry) => entry.id === event.target.value);
                        const option = product?.options.find((entry) => entry.kind === "drip");
                        updateEditorItem(item.localKey, (current) => current.kind === "drip" ? { ...current, productId: product?.id ?? "", skuId: option?.skuId ?? "" } : current);
                      }}>{!dripProducts.some((product) => product.id === item.productId) && <option value={item.productId} disabled>原耳掛商品已無法供應，請重新選擇</option>}{dripProducts.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
                      <label>耳掛規格<select value={item.skuId} disabled={Boolean(busy) || editorModificationLocked || !selectedDripProduct} onChange={(event) => updateEditorItem(item.localKey, (current) => current.kind === "drip" ? { ...current, skuId: event.target.value } : current)}>{!skuOption(initial.products, item.productId, item.skuId, "drip") && <option value={item.skuId} disabled>原耳掛 SKU 已無法供應，請重新選擇</option>}{availableDripSkus.map((option) => <option value={option.skuId} key={option.skuId}>{option.label}{option.detail ? `・${option.detail}` : ""}</option>)}</select></label>
                    </>}
                    <label>數量<input type="number" min={1} max={12} value={item.quantity} disabled={Boolean(busy) || editorModificationLocked || (!allowQuantityChange && Boolean(item.persistedItemId))} onChange={(event) => updateEditorItem(item.localKey, (current) => ({ ...current, quantity: Number(event.target.value) }))} /></label>
                  </div>
                  <ItemPricePreview item={item} products={initial.products} discountPercent={initial.rules.discountPercent} />
                  {itemError && <p className="member-subscription-editor-warning" role="alert">{itemError}</p>}
                </article>;
              })}
            </div>
            {dedicatedRoastProducts.length > 0 && <section className="member-subscription-dedicated-roast"><div><strong>專屬烘焙</strong><p>同一款咖啡累積達 2 磅，可選擇專屬烘焙；不同咖啡不合併計算。</p></div>{dedicatedRoastProducts.map(({ product, halfPoundUnits, customRoast, roastLevel }) => <div className="member-subscription-dedicated-roast-option" key={product.id}><label className="member-subscription-dedicated-roast-switch"><input type="checkbox" checked={customRoast} disabled={Boolean(busy) || editorModificationLocked} onChange={(event) => setEditorItems((items) => setSubscriptionEditorDedicatedRoast(items, product.id, event.target.checked, event.target.checked ? initialDedicatedRoastLevel(product.roast) : undefined))} /><span>使用專屬烘焙｜{product.name}（{halfPoundUnits / 2} 磅）</span></label>{customRoast && <label>指定烘焙度<select value={roastLevel} disabled={Boolean(busy) || editorModificationLocked} onChange={(event) => setEditorItems((items) => setSubscriptionEditorDedicatedRoast(items, product.id, true, event.target.value))}>{ALLOWED_ROAST_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>}</div>)}<small>專屬烘焙標準排程需要至少 {DEDICATED_ROAST_STANDARD_PREPARATION_DAYS} 天準備時間。</small></section>}
            <div className="member-subscription-editor-actions"><button type="button" className="member-subscription-add-item" disabled={Boolean(busy) || editorModificationLocked || editorAtLimit || !allowQuantityChange || (!beanChoices.length && !dripProducts.length)} onClick={() => {
              const kind = beanChoices.length ? "beans" : "drip";
              setEditorItems((items) => [...items, createSubscriptionEditorItem(kind, initial.products, `new:${crypto.randomUUID()}`, allowedProductIds)]);
            }}>＋ 新增商品</button><small>{editorItems.length} / {maxEditorItems} 項</small></div>
            <button className="member-subscription-save-items" disabled={Boolean(busy) || editorModificationLocked || editorHasError || !editorItems.length} type="submit">儲存下一次配送商品</button>
          </form></details>}
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

    {rushConfirmation && (
      <div className="member-price-modal-backdrop" role="presentation" onClick={() => setRushConfirmation(null)}>
        <div className="member-price-modal member-rush-warning-modal" role="dialog" aria-modal="true" aria-labelledby="member-rush-warning-title" onClick={(event) => event.stopPropagation()}>
          <p className="eyebrow dark">DEDICATED ROAST</p>
          <h2 id="member-rush-warning-title">專屬烘焙準備時間提醒</h2>
          <p>專屬烘焙標準排程需要至少 {DEDICATED_ROAST_STANDARD_PREPARATION_DAYS} 天準備時間。<br />您目前選擇的配送日期較近，我們仍會接受這次訂單並盡力安排，但實際配送時間可能因此延後。</p>
          <div className="member-rush-warning-actions"><button type="button" className="member-danger-soft" onClick={() => setRushConfirmation(null)}>返回修改日期</button><button type="button" disabled={Boolean(busy)} onClick={() => void continueRushAction()}>我了解，繼續下單</button></div>
        </div>
      </div>
    )}

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
