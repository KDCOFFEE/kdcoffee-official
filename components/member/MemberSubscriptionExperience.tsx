"use client";
import { CreditHelpButton } from "./CreditHelpDialog";
import SubscriptionCreditEditor from "./SubscriptionCreditEditor";
import type { SubscriptionCreditPreference } from "@/lib/subscriptionCreditPreference";


import { MemberCopyValue, MemberCopyText, useMemberCopyKey, MemberCopyElement } from "@/components/member/MemberCenterCopyProvider";

import { useEffect, useState } from "react";
import Link from "next/link";

import StoreSelector from "@/components/commerce/StoreSelector";
import { addDateOnlyDays, ALLOWED_ROAST_LEVELS, getDateOnlyInTimeZone } from "@/lib/checkoutRules";
import { resolveCreditMemberPolicy, resolveDateAvailability } from "@/lib/membershipPolicies";
import type { MembershipBusinessRules } from "@/lib/membershipRuleTypes";
import { regularShippingFee, subscriptionShippingFee } from "@/lib/shippingRules";
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
  currentSubscriptionArrangement,
  defaultSubscriptionId,
  latestCreatedOrderCycle,
  subscriptionSelectorLabel,
  subscriptionStatusLabel,
} from "@/components/member/memberSubscriptionDashboardModel";
import {
  DEDICATED_ROAST_STANDARD_PREPARATION_DAYS,
  dedicatedRoastRushRequired,
  subscriptionHasDedicatedRoast,
} from "@/lib/subscriptionRoastPolicy";
import { validateDeliveryAddress, type DeliveryAddress } from "@/lib/deliveryAddress";
import type { HomeDeliveryPaymentMethod } from "@/lib/homeDeliveryPayment";

type Subscription = {
  creditPreference?: SubscriptionCreditPreference;
  subscriptionId: string;
  status: "pending_activation" | "active" | "paused" | "terminated";
  intervalDays: number;
  shippingMethod: string;
  storeSelection: { storeId: string; storeName: string } | null;
  deliveryAddress?: DeliveryAddress | null;
  paymentMethod?: HomeDeliveryPaymentMethod | null;
  defaultItems: PricedSubscriptionItem[];
  revision: number;
  restartEligible: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type SubscriptionCycle = {
  cycleId: string;
  subscriptionId: string;
  kind: "scheduled" | "manual_replenishment";
  status: string;
  plannedDate: string;
  orderCreationDate?: string;
  modificationDeadline: string;
  itemsDraft: PricedSubscriptionItem[];
  itemsSnapshot: PricedSubscriptionItem[] | null;
  pricingSnapshot: {
    merchandiseOriginal: number;
    subscriptionDiscountPercent: number;
    subscriptionPrice: number;
    campaignPrice: number | null;
    selectedPriceSource: "subscription" | "campaign";
    creditReserved: number;
    shipping: number;
    codServiceFee?: number;
    finalAmount: number;
  } | null;
  shippingSnapshot: { method: string; storeSelection: { storeId: string; storeName: string } | null; deliveryAddress?: DeliveryAddress | null; paymentMethod?: HomeDeliveryPaymentMethod | null; codServiceFee?: number } | null;
  rulesSnapshot: { rules: Pick<MembershipBusinessRules, "shipping"> & Partial<Pick<MembershipBusinessRules, "credit">> } | null;
  createdOrderId: string | null;
  revision: number;
  modificationCount?: number;
  createdAt?: string;
};

type MemberCreditHistoryEntry = {
  creditEntryId: string;
  amount: number;
  remainingAmount: number;
  expiresAt: string;
  status: "available" | "reserved" | "consumed" | "expired";
  direction: "grant" | "deduct";
  sourceLabel: string;
  sourceCopyKey?: string;
  sourceOrderNumber: string | null;
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

type Props = Dashboard & { products: MemberSubscriptionProduct[]; rules: { intervalsDays: number[]; customCycleEnabled: boolean; customCycleMinDays: number; customCycleMaxDays: number; delayQuickOptionsDays: number[]; advanceQuickOptionsDays: number[]; preparationLeadDays: number; customRoastPreparationLeadDays: number; discountPercent: number; sevenElevenShippingFee: number; homeDeliveryShippingFee: number; homeDeliveryCodFee: number; subscriptionShippingDiscount: number; datePickerMode: "quick-and-calendar" | "calendar-only" | "suggestion-and-calendar"; maxModificationsPerCycle: number | null; allowOtherSubscriptionProducts?: boolean; allowHalfToOnePound?: boolean; allowOneToHalfPound?: boolean; allowMixedOnePound?: boolean; allowQuantityChange?: boolean; maxItems?: number } };

const money = (value: number) => `NT$ ${value.toLocaleString("zh-TW")}`;
const redemptionKey = (status: MemberCreditHistoryEntry["orderRedemptions"][number]["status"]) => status === "released" ? "member.subscription.button.b40d17356f" : status === "reserved" ? "member.subscription.label.6408880e24" : "member.subscription.label.e3e713f72e";
const displayDate = (value?: string) => value ? value.replaceAll("-", "/") : "尚未排定";

function actionSuccessMessage(action: string, plannedDate?: string, skippedDate?: string) {
  if (action === "pause") return "定期配送已暫停。";
  if (action === "resume") return `定期配送已恢復。下一次配送日期：${displayDate(plannedDate)}。`;
  if (action === "restart") return `定期配送已重新啟動。下一次配送日期：${displayDate(plannedDate)}。`;
  if (action === "skip") {
    const skippedCopy = skippedDate
      ? `已跳過 ${displayDate(skippedDate)} 本次配送。`
      : "已跳過本次配送。";
    return plannedDate
      ? `${skippedCopy}下一次配送日期：${displayDate(plannedDate)}。`
      : `${skippedCopy}下一次配送安排尚待確認。`;
  }
  if (["advance", "delay", "change-date"].includes(action)) return `下一次配送日期已更新。新的配送日期：${displayDate(plannedDate)}。`;
  if (["change-shipping", "change-store"].includes(action)) return "未來定期配送的取貨方式已更新。";
  if (action === "replenish") return `補貨安排已建立。預計配送日期：${displayDate(plannedDate)}。`;
  if (action === "terminate") return "定期配送已取消／停止；目前已建立的訂單不會自動取消。";
  if (action === "hide-terminated") return "已從我的定期配送移除。歷史訂單與紀錄仍會保留。";
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
      <span>{selection.productName}・<MemberCopyValue value={selection.label} />{selection.detail ? `・${selection.detail}` : ""}</span>
      <small><MemberCopyValue value={"一般價 "} /><del>{money(selection.price)}</del><MemberCopyValue value={"　定期購價 "} /><b>{money(subscriptionPrice(selection.price, discountPercent))}</b></small>
    </div>)}
    {item.kind === "beans" && item.packageWeight === "one-pound" && <div className="member-subscription-combined-price"><span><MemberCopyValue value={"一磅組合"} /></span><strong><MemberCopyValue value={"一般價 "} /><del>{money(prices.regularUnit)}</del><MemberCopyValue value={"　定期購價 "} />{money(prices.subscriptionUnit!)}</strong></div>}
    {item.quantity > 1 && <div className="member-subscription-line-price"><span><MemberCopyValue value={"本商品 × "} />{item.quantity}</span><strong><MemberCopyValue value={"一般價 "} /><del>{money(prices.regularLine!)}</del><MemberCopyValue value={"　定期購價 "} />{money(prices.subscriptionLine!)}</strong></div>}
  </div>;
}

export default function MemberSubscriptionExperience(initial: Props) {
  const initialSubscriptionId = defaultSubscriptionId(initial.subscriptions);
  const initialEditorSubscription = initial.subscriptions.find((item) => item.subscriptionId === initialSubscriptionId) ?? initial.subscriptions[0];
  const initialEditorCycle = initialEditorSubscription ? initial.cycles.find((item) => item.subscriptionId === initialEditorSubscription.subscriptionId && ["scheduled", "modifiable"].includes(item.status)) : undefined;
  const initialEditorSource = initialEditorCycle?.itemsDraft ?? initialEditorSubscription?.defaultItems ?? [];
  const copy = useMemberCopyKey();
  const [dashboard, setDashboard] = useState<Dashboard>(initial);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState(initialSubscriptionId);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [resumeDate, setResumeDate] = useState("");
  const initialResumeInterval =
    initialEditorSubscription?.intervalDays ??
    initial.rules.intervalsDays[0] ??
    30;
  const [resumeInterval, setResumeInterval] = useState(initialResumeInterval);
  const [resumeIntervalMode, setResumeIntervalMode] = useState<"preset" | "custom">(
    initial.rules.intervalsDays.includes(initialResumeInterval)
      ? "preset"
      : "custom",
  );
  const [restartPanelSubscriptionId, setRestartPanelSubscriptionId] = useState("");
  const [restartDate, setRestartDate] = useState("");
  const [restartInterval, setRestartInterval] = useState(initialResumeInterval);
  const [restartIntervalMode, setRestartIntervalMode] = useState<"preset" | "custom">(
    initial.rules.intervalsDays.includes(initialResumeInterval)
      ? "preset"
      : "custom",
  );
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationOtherReason, setCancellationOtherReason] = useState("");
  const [replacementDate, setReplacementDate] = useState("");
  const [showPriceDetails, setShowPriceDetails] = useState(false);
  const [rushConfirmation, setRushConfirmation] = useState<PendingRushConfirmation | null>(null);
  const [shippingMethodDraft, setShippingMethodDraft] = useState<"studio_pickup" | "711_cod" | "home_delivery">(initialEditorSubscription?.shippingMethod === "711_cod" ? "711_cod" : initialEditorSubscription?.shippingMethod === "home_delivery" ? "home_delivery" : "studio_pickup");
  const [deliveryAddressDraft, setDeliveryAddressDraft] = useState<DeliveryAddress>(initialEditorSubscription?.deliveryAddress ?? { recipientName: "", phone: "", postalCode: "", city: "", district: "", addressLine: "" });
  const [terminateConfirmationId, setTerminateConfirmationId] = useState("");
  const [hideTerminatedConfirmationId, setHideTerminatedConfirmationId] = useState("");
  const [editorItems, setEditorItems] = useState(() => initializeSubscriptionEditorItems(initialEditorSource, initial.products));
  const allowOtherSubscriptionProducts = initial.rules.allowOtherSubscriptionProducts === true;
  const allowHalfToOnePound = initial.rules.allowHalfToOnePound === true;
  const allowOneToHalfPound = initial.rules.allowOneToHalfPound === true;
  const allowMixedOnePound = initial.rules.allowMixedOnePound === true;
  const allowQuantityChange = initial.rules.allowQuantityChange === true;
  const maxEditorItems = effectiveMemberSubscriptionItemLimit(initial.rules.maxItems);

  const subscriptionDiscountLabel =
    initial.rules.discountPercent >= 100
      ? "目前定期購價格"
      : initial.rules.discountPercent % 10 === 0
        ? `${initial.rules.discountPercent / 10} 折`
        : `${initial.rules.discountPercent} 折`;

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
      setMessage(action === "change-credit" ? copy("credit.subscription.saved") : actionSuccessMessage(action, result.actionResult?.plannedDate, result.actionResult?.skippedDate));
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

  const subscription = dashboard.subscriptions.find((item) => item.subscriptionId === selectedSubscriptionId)
    ?? dashboard.subscriptions.find((item) => item.subscriptionId === defaultSubscriptionId(dashboard.subscriptions))
    ?? dashboard.subscriptions[0];
  const nextCycle = subscription ? dashboard.cycles.find((item) => item.subscriptionId === subscription.subscriptionId && ["scheduled", "modifiable"].includes(item.status)) : undefined;
  const lockedCycle = subscription ? dashboard.cycles.find((item) => item.subscriptionId === subscription.subscriptionId && item.status === "locked") : undefined;
  const pricingCycle = lockedCycle ?? nextCycle;
  const currentOrderCycle = subscription ? latestCreatedOrderCycle(dashboard.cycles, subscription.subscriptionId) : undefined;
  const currentArrangement = subscription ? currentSubscriptionArrangement(dashboard.cycles, subscription.subscriptionId) : undefined;
  const otherSubscription = subscription ? dashboard.subscriptions.find((item) => item.subscriptionId !== subscription.subscriptionId) : undefined;

  const terminationTarget = dashboard.subscriptions.find(
    (item) =>
      item.subscriptionId === terminateConfirmationId,
  );

  const availableCredit = dashboard.credits.filter((item) => item.status === "available").reduce((sum, item) => sum + item.remainingAmount, 0);
  const nextItems = pricingCycle?.itemsSnapshot ?? pricingCycle?.itemsDraft ?? subscription?.defaultItems ?? [];
  const originalProductIds = new Set(nextItems.flatMap((item) => item.skuKind === "drip" ? [item.productId] : item.components.map((component) => component.productId)));
  const nextSubtotal = nextItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const expectedPayment = subscriptionPrice(
    nextSubtotal,
    initial.rules.discountPercent,
  );

  const lockedPricing = pricingCycle?.pricingSnapshot ?? null;
  const displayedOriginal = lockedPricing?.merchandiseOriginal ?? nextSubtotal;
  const displayedSubscriptionPrice =
    lockedPricing?.subscriptionPrice ?? expectedPayment;
  const subscriptionSaving = Math.max(
    0,
    displayedOriginal - displayedSubscriptionPrice,
  );
  const terminationTargetHasCurrentOrder = terminationTarget
    ? Boolean(latestCreatedOrderCycle(dashboard.cycles, terminationTarget.subscriptionId))
    : false;

  const shippingMethod = lockedPricing
    ? pricingCycle?.shippingSnapshot?.method
    : subscription?.shippingMethod;
  const displayedStoreSelection = lockedPricing
    ? pricingCycle?.shippingSnapshot?.storeSelection
    : subscription?.storeSelection;
  const supportedShippingMethod = shippingMethod === "711_cod" ? "711_cod" : shippingMethod === "home_delivery" ? "home_delivery" : "studio_pickup";
  const displayedDeliveryAddress = lockedPricing ? pricingCycle?.shippingSnapshot?.deliveryAddress : subscription?.deliveryAddress;
  const displayedPaymentMethod = lockedPricing ? pricingCycle?.shippingSnapshot?.paymentMethod : supportedShippingMethod === "home_delivery" ? "cash_on_delivery" : null;
  const displayedCodServiceFee = lockedPricing ? lockedPricing.codServiceFee ?? pricingCycle?.shippingSnapshot?.codServiceFee ?? 0 : supportedShippingMethod === "home_delivery" && displayedPaymentMethod === "cash_on_delivery" ? initial.rules.homeDeliveryCodFee : 0;
  const currentShippingRules = { shipping: initial.rules };
  const lockedShippingRules = pricingCycle?.rulesSnapshot?.rules;
  const regularShipping = lockedPricing
    ? pricingCycle?.shippingSnapshot && lockedShippingRules &&
      typeof lockedShippingRules.shipping.sevenElevenShippingFee === "number" &&
      typeof lockedShippingRules.shipping.homeDeliveryShippingFee === "number"
      ? regularShippingFee(supportedShippingMethod, lockedShippingRules)
      : lockedPricing.shipping
    : regularShippingFee(supportedShippingMethod, currentShippingRules);
  const displayedSubscriptionShipping = lockedPricing?.shipping ??
    subscriptionShippingFee(supportedShippingMethod, currentShippingRules);
  const subscriptionShippingSaving = Math.max(
    0,
    regularShipping - displayedSubscriptionShipping,
  );
  const [creditPreview, setCreditPreview] = useState<number | null>(null);
  const preferenceMode = subscription?.creditPreference?.mode ?? "off";
  const fixedCreditAmount = subscription?.creditPreference?.mode === "fixed" ? subscription.creditPreference.amount : 0;
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (lockedPricing || preferenceMode === "off") { setCreditPreview(0); return; }
      setCreditPreview(null);
      fetch(`/api/member/credit/quote?subtotal=${displayedSubscriptionPrice}&shipping=${displayedSubscriptionShipping}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()).then((quote) => {
        if (active) setCreditPreview(preferenceMode === "maximum" ? quote.maximumUsable : Math.min(fixedCreditAmount, quote.maximumUsable));
      }).catch(() => { if (active) setCreditPreview(null); });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("kd-credit-help-open", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); window.removeEventListener("kd-credit-help-open", refresh); };
  }, [lockedPricing, preferenceMode, fixedCreditAmount, displayedSubscriptionPrice, displayedSubscriptionShipping]);
  const displayedCredit = lockedPricing?.creditReserved ?? creditPreview ?? 0;
  const displayedFinal = lockedPricing?.finalAmount ??
    displayedSubscriptionPrice + displayedSubscriptionShipping + displayedCodServiceFee - displayedCredit;

  const regularPurchaseTotal =
    displayedOriginal + regularShipping + displayedCodServiceFee;

  const totalSubscriptionSaving =
    subscriptionSaving + subscriptionShippingSaving;

  const today = getDateOnlyInTimeZone(new Date());
  const earliestDate = addDateOnlyDays(today, initial.rules.preparationLeadDays);
  const resumeHasDedicatedRoast = subscriptionHasDedicatedRoast(subscription?.defaultItems ?? []);
  const restartHasDedicatedRoast = subscriptionHasDedicatedRoast(subscription?.defaultItems ?? []);
  const canonicalSubscriptionMinimum = (customRoast: boolean, currentToday = today) => resolveDateAvailability({
    requestedDate: currentToday,
    today: currentToday,
    leadDays: customRoast
      ? initial.rules.customRoastPreparationLeadDays
      : initial.rules.preparationLeadDays,
  }).earliestDate;
  const resumeEarliestDate = canonicalSubscriptionMinimum(resumeHasDedicatedRoast);
  const restartEarliestDate = canonicalSubscriptionMinimum(restartHasDedicatedRoast);
  const restartProductSummary = subscription
    ? subscriptionItemsSummary(subscription.defaultItems, initial.products) || "尚未選擇"
    : "尚未選擇";
  const restartShippingSummary = subscription?.shippingMethod === "711_cod"
    ? `7-ELEVEN ${subscription.storeSelection?.storeName ?? "取貨"}`
    : subscription?.shippingMethod === "home_delivery"
      ? "宅配"
      : "工作室自取";
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

  function selectSubscription(subscriptionId: string) {
    const selected = dashboard.subscriptions.find((item) => item.subscriptionId === subscriptionId);
    if (!selected) return;
    const editableCycle = dashboard.cycles.find((item) => item.subscriptionId === selected.subscriptionId && ["scheduled", "modifiable"].includes(item.status));
    const editorSource = editableCycle?.itemsDraft ?? selected.defaultItems;
    setSelectedSubscriptionId(selected.subscriptionId);
    setShippingMethodDraft(selected.shippingMethod === "711_cod" ? "711_cod" : selected.shippingMethod === "home_delivery" ? "home_delivery" : "studio_pickup");
    setDeliveryAddressDraft(selected.deliveryAddress ?? { recipientName: "", phone: "", postalCode: "", city: "", district: "", addressLine: "" });
    setResumeInterval(selected.intervalDays);
    setResumeIntervalMode(initial.rules.intervalsDays.includes(selected.intervalDays) ? "preset" : "custom");
    setRestartPanelSubscriptionId("");
    setRestartDate("");
    setEditorItems(initializeSubscriptionEditorItems(editorSource, initial.products));
    setMessage("");
    setShowPriceDetails(false);
    setRushConfirmation(null);
    setTerminateConfirmationId("");
    setHideTerminatedConfirmationId("");
  }

  function openRestartPanel() {
    if (!subscription?.restartEligible || subscription.status !== "terminated") return;
    const currentToday = getDateOnlyInTimeZone(new Date());
    const currentMinimum = canonicalSubscriptionMinimum(restartHasDedicatedRoast, currentToday);
    const currentIntervalAllowed = initial.rules.intervalsDays.includes(subscription.intervalDays) || (
      initial.rules.customCycleEnabled &&
      subscription.intervalDays >= initial.rules.customCycleMinDays &&
      subscription.intervalDays <= initial.rules.customCycleMaxDays
    );
    const interval = currentIntervalAllowed
      ? subscription.intervalDays
      : initial.rules.intervalsDays[0] ?? initial.rules.customCycleMinDays;
    setRestartPanelSubscriptionId(subscription.subscriptionId);
    setRestartDate(currentMinimum);
    setRestartInterval(interval);
    setRestartIntervalMode(initial.rules.intervalsDays.includes(interval) ? "preset" : "custom");
  }

  async function confirmRestart() {
    if (
      !subscription ||
      subscription.status !== "terminated" ||
      !subscription.restartEligible ||
      restartPanelSubscriptionId !== subscription.subscriptionId ||
      !restartDate
    ) return;
    const currentMinimum = canonicalSubscriptionMinimum(
      restartHasDedicatedRoast,
      getDateOnlyInTimeZone(new Date()),
    );
    if (restartDate < currentMinimum) {
      setRestartDate(currentMinimum);
      setMessage(`下一次配送日期已更新為目前最早可選的 ${displayDate(currentMinimum)}。`);
      return;
    }
    const result = await mutate("restart", {
      subscriptionId: subscription.subscriptionId,
      expectedRevision: subscription.revision,
      resumeDate: restartDate,
      intervalDays: restartInterval,
    });
    if (!result) return;
    setSelectedSubscriptionId(subscription.subscriptionId);
    setRestartPanelSubscriptionId("");
    setRestartDate("");
  }

  async function confirmResume() {
    if (!subscription || subscription.status !== "paused" || !resumeDate) return;
    const currentMinimum = canonicalSubscriptionMinimum(
      resumeHasDedicatedRoast,
      getDateOnlyInTimeZone(new Date()),
    );
    if (resumeDate < currentMinimum) {
      setResumeDate(currentMinimum);
      setMessage(`下一次配送日期已更新為目前最早可選的 ${displayDate(currentMinimum)}。`);
      return;
    }
    await mutate("resume", {
      subscriptionId: subscription.subscriptionId,
      expectedRevision: subscription.revision,
      resumeDate,
      intervalDays: resumeInterval,
    });
  }

  async function confirmTermination() {
    const target = dashboard.subscriptions.find((item) => item.subscriptionId === terminateConfirmationId);
    if (!target) return;
    const result = await mutate("terminate", { subscriptionId: target.subscriptionId, expectedRevision: target.revision });
    if (!result) return;
    setSelectedSubscriptionId(target.subscriptionId);
    setTerminateConfirmationId("");
  }

  async function confirmHideTerminatedSubscription() {
    const target = dashboard.subscriptions.find(
      (item) =>
        item.subscriptionId === hideTerminatedConfirmationId,
    );

    if (!target || target.status !== "terminated") {
      setHideTerminatedConfirmationId("");
      return;
    }

    const result = await mutate("hide-terminated", {
      subscriptionId: target.subscriptionId,
      expectedRevision: target.revision,
    });

    if (!result) return;

    setSelectedSubscriptionId(
      defaultSubscriptionId(result.subscriptions ?? []),
    );

    setHideTerminatedConfirmationId("");
  }

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

      let finalMessage = result.result === "cancelled" || result.result === "already_cancelled"
        ? "取消處理已送出；請以重新整理後的訂單狀態為準。"
        : String(result.customerMessage || "取消處理已送出；請以重新整理後的訂單狀態為準。");
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
    <section className="member-commerce-section">
      <div className="member-section-head">
        <div>
          <p className="eyebrow dark"><MemberCopyValue value={"SUBSCRIPTION"} /></p>
          <h2><MemberCopyValue value={"我的定期配送"} /></h2>
          <CreditHelpButton lockedPolicy={pricingCycle?.rulesSnapshot?.rules.credit ? resolveCreditMemberPolicy({ credit: pricingCycle.rulesSnapshot.rules.credit }) : undefined} />
        </div>
        {subscription && (
          <div className="member-subscription-status-wrap">
            <span className={`member-subscription-status ${subscription.status}`}>
              <MemberCopyValue value={subscriptionStatusLabel(subscription.status)} />
            </span>

            {subscription.status === "pending_activation" && (
              <small><MemberCopyValue value={"首次取貨完成後，啟動定期配送"} /></small>
            )}

            {subscription.status === "active" && (
              <small><MemberCopyValue value={"下次配送日期"} />{" "}
                <MemberCopyValue value={pricingCycle?.plannedDate
                  ? displayDate(pricingCycle.plannedDate).slice(5)
                  : "尚未排定"} />
              </small>
            )}
          </div>
        )}
      </div>
      {message && <p className="member-notice" role="status"><MemberCopyValue value={message} /></p>}
      {!subscription ? <div className="member-commerce-empty"><strong><MemberCopyValue value={"還沒有定期配送"} /></strong><p><MemberCopyValue value={"第一次購買時可勾選加入。首筆仍是原價，成功取貨後才會開始定期配送並享有優惠。"} /></p><Link href="/works"><MemberCopyValue value={"挑選咖啡作品"} /></Link></div> : <div className="member-subscription-grid">
        {dashboard.subscriptions.length > 1 && <div className="member-subscription-selector"><label htmlFor="member-subscription-selector"><MemberCopyValue value={"選擇定期配送"} /><select id="member-subscription-selector" value={subscription.subscriptionId} onChange={(event) => selectSubscription(event.target.value)}>{dashboard.subscriptions.map((item) => <option value={item.subscriptionId} key={item.subscriptionId}><MemberCopyValue value={subscriptionSelectorLabel(item, initial.products)} /></option>)}</select></label><small><MemberCopyValue value={"每筆定期配送分開保存；切換後可查看各自狀態與安排。"} /></small></div>}
        <article className="member-subscription-summary">
          <div><small><MemberCopyValue value={"配送週期"} /></small><strong><MemberCopyValue value={"每 "} />{subscription.intervalDays}<MemberCopyValue value={" 天"} /></strong></div>
          <div><small><MemberCopyValue value={"下次安排"} /></small><strong><MemberCopyValue value={pricingCycle?.plannedDate ?? (subscription.status === "pending_activation" ? "首筆取貨後安排" : "尚未排定")} /></strong></div>
          <div><small><MemberCopyValue value={"配送方式"} /></small><strong><MemberCopyValue value={shippingMethod === "711_cod" ? `7-ELEVEN・${displayedStoreSelection?.storeName || "尚未選擇門市"}` : shippingMethod === "home_delivery" ? `宅配・${displayedDeliveryAddress ? `${displayedDeliveryAddress.postalCode} ${displayedDeliveryAddress.city}${displayedDeliveryAddress.district}${displayedDeliveryAddress.addressLine}` : "地址待確認"}・${displayedPaymentMethod === "cash_on_delivery" ? "貨到付款" : "ATM 轉帳"}` : "工作室自取"} /></strong></div>
          <div><small><MemberCopyValue value={"下一次商品"} /></small><strong><MemberCopyValue value={subscriptionItemsSummary(nextItems, initial.products) || "尚未選擇"} /></strong></div>
          <div><small><MemberCopyValue value={"修改截止"} /></small><strong><MemberCopyValue value={pricingCycle?.modificationDeadline ?? "啟動後顯示"} /></strong></div>
          <div>
  <small><MemberCopyValue value={lockedPricing ? "本期應付" : "預估應付"} /></small>
  <strong><MemberCopyValue value={pricingCycle ? money(displayedFinal) : "啟動後計算"} /></strong>
  {pricingCycle && (
    <>
      <span><MemberCopyValue value={"一般購買 "} />{money(regularPurchaseTotal)}<MemberCopyValue value={" → 定期購預估"} />{" "}
        {money(displayedFinal)}
      </span>

      <span><MemberCopyValue value={"商品優惠省 "} />{money(subscriptionSaving)}
        <MemberCopyValue value={subscriptionShippingSaving > 0
          ? ` ＋ 配送優惠省 ${money(subscriptionShippingSaving)}`
          : ""} />
        {" "}<MemberCopyValue value={"＝ 本期共省 "} />{money(totalSubscriptionSaving)}
      </span>
      <button
        type="button"
        className="member-price-detail-button"
        onClick={() => setShowPriceDetails(true)}
      ><MemberCopyValue value={"查看金額明細"} /></button>
    </>
  )}
</div>
        </article>

        {currentArrangement && <div className="member-commerce-callout member-current-arrangement"><strong><MemberCopyValue value={"目前配送安排"} /></strong><p><MemberCopyValue value={currentArrangement.kind === "manual_replenishment" ? "立即補貨" : "定期配送"} />：{displayDate(currentArrangement.plannedDate)}</p>{currentArrangement.createdOrderId ? <p><MemberCopyValue value={"訂單："} />{currentArrangement.createdOrderId}</p> : <><p><MemberCopyValue value={"狀態：等待建立訂單"} /></p>{currentArrangement.orderCreationDate && <p><MemberCopyValue value={"預計建立訂單："} />{displayDate(currentArrangement.orderCreationDate)}</p>}</>}</div>}

        {subscription.status === "pending_activation" ? (
          <div className="member-commerce-callout">
            <strong><MemberCopyValue value={"目前不會自動建立下一張訂單"} /></strong>

            <p><MemberCopyValue value={"等首筆原價訂單成功取貨後，才會正式啟動。 啟動後第一次定期配送起享"} /><b> {subscriptionDiscountLabel}</b><MemberCopyValue value={"定期購優惠。"} /></p>

            <p><MemberCopyValue value={"如果您已經不需要定期配送，可以現在取消。 取消不會影響目前這張首筆訂單。"} /></p>

            <button
              type="button"
              className="member-danger-soft"
              disabled={Boolean(busy)}
              onClick={() =>
                setTerminateConfirmationId(
                  subscription.subscriptionId,
                )
              }
            ><MemberCopyValue value={"取消這個定期配送設定"} /></button>
          </div>
        ) : subscription.status === "terminated" ? (
          <div
            className="member-subscription-termination-receipt"
            role="status"
          >
            <strong><MemberCopyValue value={"此定期配送已停止"} /></strong>
            {subscription.restartEligible && (
              <p><MemberCopyValue value={"想繼續配送嗎？選擇下一次配送日期後即可重新啟動。"} /></p>
            )}

            {subscription.restartEligible && restartPanelSubscriptionId !== subscription.subscriptionId && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={openRestartPanel}
              ><MemberCopyValue value={"重新啟動定期配送"} /></button>
            )}

            {subscription.restartEligible && restartPanelSubscriptionId === subscription.subscriptionId && (
              <div className="member-action-panel">
                <strong><MemberCopyValue value={"重新啟動定期配送"} /></strong>
                <label><MemberCopyValue value={"下一次配送日期"} /><input
                    type="date"
                    min={restartEarliestDate}
                    value={restartDate}
                    onChange={(event) => setRestartDate(event.target.value)}
                    onFocus={() => {
                      const currentMinimum = canonicalSubscriptionMinimum(
                        restartHasDedicatedRoast,
                        getDateOnlyInTimeZone(new Date()),
                      );
                      setRestartDate((current) => current >= currentMinimum ? current : currentMinimum);
                    }}
                  />
                  <small><MemberCopyValue value={"最早可選："} />{displayDate(restartEarliestDate)}</small>
                </label>
                <label><MemberCopyValue value={"配送週期"} /><select
                    value={restartIntervalMode === "custom" ? "custom" : restartInterval}
                    onChange={(event) => {
                      if (event.target.value === "custom") {
                        setRestartIntervalMode("custom");
                        setRestartInterval(initial.rules.customCycleMinDays);
                        return;
                      }
                      setRestartIntervalMode("preset");
                      setRestartInterval(Number(event.target.value));
                    }}
                  >
                    {initial.rules.intervalsDays.map((days) => <option key={days} value={days}><MemberCopyValue value={"每 "} />{days}<MemberCopyValue value={" 天"} /></option>)}
                    {initial.rules.customCycleEnabled && <option value="custom"><MemberCopyValue value={"自訂天數"} /></option>}
                  </select>
                </label>
                {initial.rules.customCycleEnabled && restartIntervalMode === "custom" && (
                  <label><MemberCopyValue value={"自訂配送週期"} /><input
                      type="number"
                      min={initial.rules.customCycleMinDays}
                      max={initial.rules.customCycleMaxDays}
                      value={restartInterval}
                      onChange={(event) => setRestartInterval(Number(event.target.value))}
                    />
                    <small><MemberCopyValue value={"可設定 "} />{initial.rules.customCycleMinDays}～{initial.rules.customCycleMaxDays}<MemberCopyValue value={" 天"} /></small>
                  </label>
                )}
                <div className="subscription-enrollment-summary">
                  <span><MemberCopyValue value={"商品："} />{restartProductSummary}</span>
                  <span><MemberCopyValue value={"配送方式："} />{restartShippingSummary}</span>
                </div>
                <div className="member-action-buttons">
                  <button
                    type="button"
                    className="member-danger-soft"
                    disabled={Boolean(busy)}
                    onClick={() => setRestartPanelSubscriptionId("")}
                  ><MemberCopyValue value={"返回"} /></button>
                  <button
                    type="button"
                    disabled={Boolean(busy) || !restartDate}
                    onClick={() => void confirmRestart()}
                  >
                    <MemberCopyValue value={busy === "restart" ? "處理中…" : "確認重新啟動"} />
                  </button>
                </div>
              </div>
            )}

            <div className="member-action-buttons">
              {otherSubscription && (
                <button
                  type="button"
                  onClick={() =>
                    selectSubscription(
                      otherSubscription.subscriptionId,
                    )
                  }
                ><MemberCopyValue value={"查看其他定期配送"} /></button>
              )}

              <button
                type="button"
                className="member-danger-soft"
                disabled={Boolean(busy)}
                onClick={() =>
                  setHideTerminatedConfirmationId(
                    subscription.subscriptionId,
                  )
                }
              ><MemberCopyValue value={"刪除這筆已停止的定期配送"} /></button>
            </div>
          </div>
        ) : <div className="member-subscription-actions">
          {currentOrderCycle && <details><summary><MemberCopyValue value={"取消本次配送"} /></summary><div className="member-action-panel"><p><MemberCopyValue value={"取消本次配送與停止未來定期配送是兩件不同的事。請明確選擇要處理的範圍。"} /></p><label><MemberCopyValue value={"取消原因"} /><select required value={cancellationReason} onChange={(event) => { setCancellationReason(event.target.value); if (event.target.value !== "其他") setCancellationOtherReason(""); }}><option value="" disabled><MemberCopyValue value={"請選擇取消原因"} /></option><option value="單純想取消"><MemberCopyValue value={"單純想取消"} /></option><option value="行程／取貨時間不方便"><MemberCopyValue value={"行程／取貨時間不方便"} /></option><option value="咖啡還沒喝完，暫時不需要"><MemberCopyValue value={"咖啡還沒喝完，暫時不需要"} /></option><option value="想更換咖啡／數量／烘焙度"><MemberCopyValue value={"想更換咖啡／數量／烘焙度"} /></option><option value="重複下單或誤操作"><MemberCopyValue value={"重複下單或誤操作"} /></option><option value="預算考量"><MemberCopyValue value={"預算考量"} /></option><option value="其他"><MemberCopyValue value={"其他"} /></option></select></label>{cancellationReason === "其他" && <label><MemberCopyValue value={"其他取消原因"} /><MemberCopyElement as="textarea" maxLength={197} required value={cancellationOtherReason} onChange={(event) => setCancellationOtherReason(event.target.value)} placeholder="請簡單告訴我們取消原因" /></label>}<div className="member-action-buttons"><button className="member-danger-soft" disabled={Boolean(busy) || !resolvedCancellationReason} onClick={() => void cancelCurrentDelivery("current")}><MemberCopyValue value={"只取消本次配送"} /></button><button className="member-danger-soft" disabled={Boolean(busy) || !resolvedCancellationReason} onClick={() => void cancelCurrentDelivery("current-and-stop")}><MemberCopyValue value={"取消本次配送，並停止之後的定期配送"} /></button></div>{nextCycle && <><label><MemberCopyValue value={"保留定期配送時的下一次配送日期"} /><input type="date" min={nextDateMinimum} value={replacementDate || nextCycle.plannedDate} onChange={(event) => setReplacementDate(event.target.value)} /></label><button disabled={Boolean(busy) || !resolvedCancellationReason} onClick={() => void cancelCurrentDelivery("current-and-reschedule")}><MemberCopyValue value={"取消本次配送，保留定期配送並更新下次日期"} /></button></>}<small><MemberCopyValue value={"若此訂單已建立 7-ELEVEN 寄件資訊，送出後只是取消申請；KD Coffee 確認寄件單作廢前，訂單不會顯示為已取消，也不會回補庫存。"} /></small></div></details>}
          {nextCycle && <details><summary><MemberCopyValue value={"調整下一次日期"} /></summary><div className="member-action-panel"><p><MemberCopyValue value={nextCycleHasDedicatedRoast ? `本期含專屬烘焙；距配送不足 ${DEDICATED_ROAST_STANDARD_PREPARATION_DAYS} 天時會先顯示提醒，但仍可確認送出。` : `最早可配送日為 ${earliestDate}。`} /><MemberCopyValue value={" 選好日期後，請決定只套用本次，或讓之後的定期購也從新日期重新計算。"} /><MemberCopyValue value={remainingChanges === null ? "" : ` 本期還可修改 ${remainingChanges} 次。`} /></p><label><MemberCopyValue value={"新的配送日期"} /><input type="date" id="member-next-date" min={nextDateMinimum} defaultValue={nextCycle.plannedDate} /></label><div className="subscription-enrollment-summary"><span><MemberCopyValue value={"新建立訂單日與修改截止日會在確認後依目前營運規則重新計算。"} /></span></div><div className="member-action-buttons"><button disabled={Boolean(busy) || remainingChanges === 0} onClick={() => { const plannedDate = (document.getElementById("member-next-date") as HTMLInputElement).value; void requestDateMutation("change-date", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate, recalculateAnchor: false }); }}><MemberCopyValue value={"只套用這一次"} /></button><button disabled={Boolean(busy) || remainingChanges === 0} onClick={() => { const plannedDate = (document.getElementById("member-next-date") as HTMLInputElement).value; void requestDateMutation("change-date", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate, recalculateAnchor: true }); }}><MemberCopyValue value={"之後也從新日期重新計算"} /></button></div>{initial.rules.datePickerMode !== "calendar-only" && <div className="member-quick-delays">{initial.rules.advanceQuickOptionsDays.map((days) => <button key={`advance-${days}`} type="button" disabled={Boolean(busy) || remainingChanges === 0} onClick={() => void requestDateMutation("advance", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate: addDateOnlyDays(nextCycle.plannedDate, -days), recalculateAnchor: false })}><MemberCopyValue value={"提前 "} />{days}<MemberCopyValue value={" 天"} /></button>)}{initial.rules.delayQuickOptionsDays.map((days) => <button key={`delay-${days}`} type="button" disabled={Boolean(busy) || remainingChanges === 0} onClick={() => void requestDateMutation("delay", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision, plannedDate: addDateOnlyDays(nextCycle.plannedDate, days), recalculateAnchor: false })}><MemberCopyValue value={"延後 "} />{days}<MemberCopyValue value={" 天"} /></button>)}</div>}</div></details>}
          {nextCycle && <details><summary><MemberCopyValue value={"跳過這一次"} /></summary><div className="member-action-panel"><p><MemberCopyValue value={"只跳過 "} />{displayDate(nextCycle.plannedDate)}<MemberCopyValue value={" 這一次。"} /></p><button className="member-danger-soft" disabled={Boolean(busy)} onClick={() => void mutate("skip", { cycleId: nextCycle.cycleId, expectedRevision: nextCycle.revision })}><MemberCopyValue value={"確認跳過"} /></button></div></details>}
          {nextCycle && <details><summary><MemberCopyValue value={"調整下一次配送商品"} /></summary><form className="member-action-panel member-subscription-items-editor" onSubmit={(event) => { event.preventDefault(); void saveEditorItems(); }}>
            <p><MemberCopyValue value={"可調整下一次配送的商品、數量與咖啡豆烘焙設定。變更只套用目前這一期，除非現有產品流程明確另有規則。"} /></p>
            {editorModificationLocked && <p className="member-subscription-editor-warning"><MemberCopyValue value={"本期已達修改次數上限，無法再調整商品。"} /></p>}
            <div className="member-subscription-item-list">
              {editorItems.map((item, index) => {
                const itemError = editorErrors[index];
                const selectedDripProduct = item.kind === "drip" ? initial.products.find((product) => product.id === item.productId) : null;
                const availableDripSkus = selectedDripProduct?.options.filter((option) => option.kind === "drip") ?? [];
                return <article className="member-subscription-item-card" key={item.localKey}>
                  <header><div><small><MemberCopyValue value={"SUBSCRIPTION ITEM"} /></small><strong><MemberCopyValue value={"商品 "} />{index + 1}</strong></div>{editorItems.length > 1 && <MemberCopyElement as="button" type="button" className="member-subscription-remove-item" disabled={Boolean(busy) || editorModificationLocked || !allowQuantityChange} title={!allowQuantityChange ? "目前規則未開放增減商品數量" : undefined} onClick={() => setEditorItems((items) => removeSubscriptionEditorItem(items, item.localKey))}><MemberCopyValue value={"移除此商品"} /></MemberCopyElement>}</header>
                  <div className="member-subscription-item-fields">
                    <label><MemberCopyValue value={"商品類型"} /><select value={item.kind} disabled={Boolean(busy) || editorModificationLocked} onChange={(event) => updateEditorItem(item.localKey, (current) => changeSubscriptionEditorItemKind(current, event.target.value === "drip" ? "drip" : "beans", initial.products, allowedProductIds))}><option value="beans" disabled={!beanChoices.length}><MemberCopyValue value={"咖啡豆"} /></option><option value="drip" disabled={!dripProducts.length}><MemberCopyValue value={"耳掛咖啡"} /></option></select></label>
                    {item.kind === "beans" ? <>
                      <label><MemberCopyValue value={"規格"} /><select value={item.packageWeight} disabled={Boolean(busy) || editorModificationLocked} onChange={(event) => updateEditorItem(item.localKey, (current) => current.kind === "beans" ? changeBeanPackageWeight(current, event.target.value === "one-pound" ? "one-pound" : "half-pound") : current)}><option value="half-pound" disabled={item.originalPackageWeight === "one-pound" && !allowOneToHalfPound}><MemberCopyValue value={"半磅"} /></option><option value="one-pound" disabled={item.originalPackageWeight === "half-pound" && !allowHalfToOnePound}><MemberCopyValue value={"一磅（兩個半磅組合）"} /></option></select></label>
                      {item.components.map((component, componentIndex) => {
                        const choices = componentIndex === 1 && !allowMixedOnePound ? beanChoices.filter(({ product }) => product.id === item.components[0]?.productId) : beanChoices;
                        const value = skuChoiceValue(component.productId, component.skuId);
                        const available = choices.some(({ product, option }) => value === skuChoiceValue(product.id, option.skuId));
                        const selectedBeanProduct = initial.products.find((product) => product.id === component.productId);
                        return <label className="member-subscription-component-field" key={`${item.localKey}:component:${componentIndex}`}><MemberCopyValue value={item.packageWeight === "one-pound" ? componentIndex === 0 ? "第一款半磅咖啡" : "第二款半磅咖啡" : "半磅咖啡"} /><select value={value} disabled={Boolean(busy) || editorModificationLocked} onChange={(event) => {
                          const selected = readSkuChoice(event.target.value);
                          updateEditorItem(item.localKey, (current) => {
                            if (current.kind !== "beans") return current;
                            const components = current.components.map((entry, selectedIndex) => selectedIndex === componentIndex ? selected : entry);
                            if (componentIndex === 0 && current.packageWeight === "one-pound" && !allowMixedOnePound) components[1] = { ...selected };
                            const selectedProduct = initial.products.find((product) => product.id === selected.productId);
                            return { ...current, roast: componentIndex === 0 ? selectedProduct?.roast || "工作室建議" : current.roast, components };
                          });
                        }}>{!available && <option value={value} disabled><MemberCopyValue value={"原咖啡豆 SKU 已無法供應，請重新選擇"} /></option>}{choices.map(({ product, option }) => <option value={skuChoiceValue(product.id, option.skuId)} key={`${product.id}:${option.skuId}`}>{product.name}・<MemberCopyValue value={option.label} />{option.detail ? `・${option.detail}` : ""}</option>)}</select><small><MemberCopyValue value={"預設烘焙："} /><MemberCopyValue value={selectedBeanProduct?.roast || "工作室建議"} /></small></label>;
                      })}
                    </> : <>
                      <label><MemberCopyValue value={"咖啡作品"} /><select value={item.productId} disabled={Boolean(busy) || editorModificationLocked} onChange={(event) => {
                        const product = initial.products.find((entry) => entry.id === event.target.value);
                        const option = product?.options.find((entry) => entry.kind === "drip");
                        updateEditorItem(item.localKey, (current) => current.kind === "drip" ? { ...current, productId: product?.id ?? "", skuId: option?.skuId ?? "" } : current);
                      }}>{!dripProducts.some((product) => product.id === item.productId) && <option value={item.productId} disabled><MemberCopyValue value={"原耳掛商品已無法供應，請重新選擇"} /></option>}{dripProducts.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
                      <label><MemberCopyValue value={"耳掛規格"} /><select value={item.skuId} disabled={Boolean(busy) || editorModificationLocked || !selectedDripProduct} onChange={(event) => updateEditorItem(item.localKey, (current) => current.kind === "drip" ? { ...current, skuId: event.target.value } : current)}>{!skuOption(initial.products, item.productId, item.skuId, "drip") && <option value={item.skuId} disabled><MemberCopyValue value={"原耳掛 SKU 已無法供應，請重新選擇"} /></option>}{availableDripSkus.map((option) => <option value={option.skuId} key={option.skuId}><MemberCopyValue value={option.label} />{option.detail ? `・${option.detail}` : ""}</option>)}</select></label>
                    </>}
                    <label><MemberCopyValue value={"數量"} /><input type="number" min={1} max={12} value={item.quantity} disabled={Boolean(busy) || editorModificationLocked || (!allowQuantityChange && Boolean(item.persistedItemId))} onChange={(event) => updateEditorItem(item.localKey, (current) => ({ ...current, quantity: Number(event.target.value) }))} /></label>
                  </div>
                  <ItemPricePreview item={item} products={initial.products} discountPercent={initial.rules.discountPercent} />
                  {itemError && <p className="member-subscription-editor-warning" role="alert">{itemError}</p>}
                </article>;
              })}
            </div>
            {dedicatedRoastProducts.length > 0 && <section className="member-subscription-dedicated-roast"><div><strong><MemberCopyValue value={"專屬烘焙"} /></strong><p><MemberCopyValue value={"同一款咖啡累積達 2 磅，可選擇專屬烘焙；不同咖啡不合併計算。"} /></p></div>{dedicatedRoastProducts.map(({ product, halfPoundUnits, customRoast, roastLevel }) => <div className="member-subscription-dedicated-roast-option" key={product.id}><label className="member-subscription-dedicated-roast-switch"><input type="checkbox" checked={customRoast} disabled={Boolean(busy) || editorModificationLocked} onChange={(event) => setEditorItems((items) => setSubscriptionEditorDedicatedRoast(items, product.id, event.target.checked, event.target.checked ? initialDedicatedRoastLevel(product.roast) : undefined))} /><span><MemberCopyValue value={"使用專屬烘焙｜"} />{product.name}（{halfPoundUnits / 2}<MemberCopyValue value={" 磅）"} /></span></label>{customRoast && <label><MemberCopyValue value={"指定烘焙度"} /><select value={roastLevel} disabled={Boolean(busy) || editorModificationLocked} onChange={(event) => setEditorItems((items) => setSubscriptionEditorDedicatedRoast(items, product.id, true, event.target.value))}>{ALLOWED_ROAST_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>}</div>)}<small><MemberCopyValue value={"專屬烘焙標準排程需要至少 "} />{DEDICATED_ROAST_STANDARD_PREPARATION_DAYS}<MemberCopyValue value={" 天準備時間。"} /></small></section>}
            <div className="member-subscription-editor-actions"><button type="button" className="member-subscription-add-item" disabled={Boolean(busy) || editorModificationLocked || editorAtLimit || !allowQuantityChange || (!beanChoices.length && !dripProducts.length)} onClick={() => {
              const kind = beanChoices.length ? "beans" : "drip";
              setEditorItems((items) => [...items, createSubscriptionEditorItem(kind, initial.products, `new:${crypto.randomUUID()}`, allowedProductIds)]);
            }}><MemberCopyValue value={"＋ 新增商品"} /></button><small>{editorItems.length} / {maxEditorItems}<MemberCopyValue value={" 項"} /></small></div>
            <button className="member-subscription-save-items" disabled={Boolean(busy) || editorModificationLocked || editorHasError || !editorItems.length} type="submit"><MemberCopyValue value={"儲存下一次配送商品"} /></button>
          </form></details>}
          <details><summary><MemberCopyValue value={"變更配送方式"} /></summary><form className="member-action-panel" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            let address: DeliveryAddress | null = null;
            if (shippingMethodDraft === "home_delivery") {
              try { address = validateDeliveryAddress(deliveryAddressDraft); }
              catch (error) { setMessage(error instanceof Error ? error.message : "請填寫完整宅配地址"); return; }
            }
            void mutate("change-shipping", { subscriptionId: subscription.subscriptionId, expectedRevision: subscription.revision, shippingMethod: shippingMethodDraft, storeId: shippingMethodDraft === "711_cod" ? form.get("storeId") : null, storeName: shippingMethodDraft === "711_cod" ? form.get("storeName") : null, deliveryAddress: address, paymentMethod: shippingMethodDraft === "home_delivery" ? "cash_on_delivery" : null });
          }}><fieldset className="member-shipping-method-options"><legend><MemberCopyValue value={"未來定期配送方式"} /></legend><label><input type="radio" name="shippingMethodChoice" value="studio_pickup" checked={shippingMethodDraft === "studio_pickup"} onChange={() => setShippingMethodDraft("studio_pickup")} /><MemberCopyValue value={"工作室自取"} /></label><label><input type="radio" name="shippingMethodChoice" value="711_cod" checked={shippingMethodDraft === "711_cod"} onChange={() => setShippingMethodDraft("711_cod")} /><MemberCopyValue value={"7-ELEVEN 取貨"} /></label><label><input type="radio" name="shippingMethodChoice" value="home_delivery" checked={shippingMethodDraft === "home_delivery"} onChange={() => setShippingMethodDraft("home_delivery")} /><MemberCopyValue value={"宅配"} /></label></fieldset>
          {shippingMethodDraft === "711_cod" && <StoreSelector key={`${subscription.subscriptionId}:${subscription.storeSelection?.storeId ?? "new"}`} initialStore={subscription.storeSelection ? { id: subscription.storeSelection.storeId, name: subscription.storeSelection.storeName, address: "" } : undefined} />}
          {shippingMethodDraft === "home_delivery" && <><div className="store-selector-grid">{([
            ["recipientName", "收件人姓名", 40], ["phone", "手機／聯絡電話", 20], ["postalCode", "郵遞區號", 6], ["city", "縣市", 20], ["district", "區／鄉鎮市", 30], ["addressLine", "詳細地址", 120],
          ] as const).map(([key, label, maxLength]) => <label key={key}><MemberCopyValue value={label} /><input name={key} value={deliveryAddressDraft[key]} onChange={(event) => setDeliveryAddressDraft((current) => ({ ...current, [key]: event.target.value }))} maxLength={maxLength} required /></label>)}</div><div className="delivery-notice"><strong><MemberCopyValue value={"宅配定期配送付款方式：貨到付款"} /></strong><p><MemberCopyValue value={"貨到付款手續費 NT$ "} />{initial.rules.homeDeliveryCodFee.toLocaleString("zh-TW")}<MemberCopyValue value={"／次；實際金額以每期鎖定時的設定為準。"} /></p></div></>}
          <small><MemberCopyValue value={"此變更只套用未來配送；已鎖定期次與已建立的訂單保留原快照。"} /></small><button disabled={Boolean(busy)} type="submit"><MemberCopyValue value={"儲存配送方式"} /></button></form></details>
          <details onToggle={(event) => {
            if (!event.currentTarget.open || subscription.status !== "paused") return;
            const currentMinimum = canonicalSubscriptionMinimum(
              resumeHasDedicatedRoast,
              getDateOnlyInTimeZone(new Date()),
            );
            setResumeDate((current) => current >= currentMinimum ? current : currentMinimum);
          }}><summary><MemberCopyValue value={subscription.status === "active" ? "暫停定期配送" : "恢復或停止定期配送"} /></summary><div className="member-action-panel"><p><MemberCopyValue value={subscription.status === "active" ? "暫停後不會安排新的定期配送，之後可再選擇下一次配送日期恢復。" : "可選擇下一次配送日期恢復，或停止這筆定期配送。"} /></p>{subscription.status === "active" && <button disabled={Boolean(busy)} onClick={() => void mutate("pause", { subscriptionId: subscription.subscriptionId, expectedRevision: subscription.revision })}><MemberCopyValue value={"暫停未來定期配送"} /></button>}{subscription.status === "paused" && <><label><MemberCopyValue value={"下一次配送日期"} /><input type="date" min={resumeEarliestDate} value={resumeDate} onChange={(event) => setResumeDate(event.target.value)} onFocus={() => {
  const currentMinimum = canonicalSubscriptionMinimum(
    resumeHasDedicatedRoast,
    getDateOnlyInTimeZone(new Date()),
  );
  setResumeDate((current) => current >= currentMinimum ? current : currentMinimum);
}} /><small><MemberCopyValue value={"最早可選："} />{displayDate(resumeEarliestDate)}</small></label><label><MemberCopyValue value={"新的配送週期"} /><select
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
{initial.rules.intervalsDays.map((days) => <option key={days} value={days}><MemberCopyValue value={"每 "} />{days}<MemberCopyValue value={" 天"} /></option>)}
{initial.rules.customCycleEnabled && <option value="custom"><MemberCopyValue value={"自訂天數"} /></option>}
</select>
</label>
{initial.rules.customCycleEnabled && resumeIntervalMode === "custom" && (
  <label><MemberCopyValue value={"自訂配送週期"} /><input
      type="number"
      min={initial.rules.customCycleMinDays}
      max={initial.rules.customCycleMaxDays}
      value={resumeInterval}
      onChange={(event) =>
        setResumeInterval(Number(event.target.value))
      }
    />
    <small><MemberCopyValue value={"可設定 "} />{initial.rules.customCycleMinDays}～{initial.rules.customCycleMaxDays}<MemberCopyValue value={" 天"} /></small>
  </label>
)}
<button disabled={Boolean(busy) || !resumeDate} onClick={() => void confirmResume()}><MemberCopyValue value={"確認恢復"} /></button><button className="member-danger-soft" disabled={Boolean(busy)} onClick={() => setTerminateConfirmationId(subscription.subscriptionId)}><MemberCopyValue value={"停止這筆定期配送"} /></button></>}</div></details>
          {["pending_activation", "active", "paused"].includes(subscription.status) && <SubscriptionCreditEditor key={`${subscription.subscriptionId}:${subscription.revision}`} initial={subscription.creditPreference} disabled={Boolean(busy)} onSave={(creditPreference) => mutate("change-credit", { subscriptionId: subscription.subscriptionId, expectedRevision: subscription.revision, creditPreference })} />}
          {subscription.status === "active" && <button className="member-replenish-button" disabled={Boolean(busy)} onClick={() => void mutate("replenish", { subscriptionId: subscription.subscriptionId })}><MemberCopyValue value={"立即補貨（不改下次日期）"} /></button>}
        </div>}
      </div>}
    </section>

    {hideTerminatedConfirmationId && (
      <div
        className="member-price-modal-backdrop"
        role="presentation"
        onClick={() => {
          if (!busy) {
            setHideTerminatedConfirmationId("");
          }
        }}
      >
        <div
          className="member-price-modal member-terminate-confirmation-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-hide-terminated-title"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="eyebrow dark"><MemberCopyValue value={"SUBSCRIPTION"} /></p>

          <h2 id="member-hide-terminated-title"><MemberCopyValue value={"刪除這筆已停止的定期配送？"} /></h2>

          <p><MemberCopyValue value={"刪除後，這筆已停止的定期配送會從會員中心移除。"} /><br /><MemberCopyValue value={"歷史訂單、取貨紀錄與回饋資料仍會保留，不會被刪除。"} /><br /><MemberCopyValue value={"刪除後將不再享有這筆定期配送的"} /><b> {subscriptionDiscountLabel}</b><MemberCopyValue value={"優惠；如果之後需要，必須重新建立定期配送。"} /></p>

          <div className="member-rush-warning-actions">
            <button
              type="button"
              className="member-danger-soft"
              disabled={Boolean(busy)}
              onClick={() =>
                setHideTerminatedConfirmationId("")
              }
            ><MemberCopyValue value={"返回"} /></button>

            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                void confirmHideTerminatedSubscription()
              }
            >
              <MemberCopyValue value={busy === "hide-terminated"
                ? "處理中…"
                : "確認刪除"} />
            </button>
          </div>
        </div>
      </div>
    )}

    {terminateConfirmationId && (
      <div className="member-price-modal-backdrop" role="presentation" onClick={() => { if (!busy) setTerminateConfirmationId(""); }}>
        <div className="member-price-modal member-terminate-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="member-terminate-confirmation-title" onClick={(event) => event.stopPropagation()}>
          <p className="eyebrow dark"><MemberCopyValue value={"SUBSCRIPTION"} /></p>
          <h2 id="member-terminate-confirmation-title">
            <MemberCopyValue value={terminationTarget?.status === "pending_activation"
              ? "取消這個定期配送設定？"
              : "確定停止定期配送嗎？"} />
          </h2>

          {terminationTarget?.status === "pending_activation" ? (
            <p><MemberCopyValue value={"取消後，目前這張首筆原價訂單仍會照常處理。"} /><br /><MemberCopyValue value={"即使本次成功取貨，也不會再啟動定期配送。"} /><br /><MemberCopyValue value={"您也不會再享有後續"} /><b> {subscriptionDiscountLabel}</b><MemberCopyValue value={"定期購優惠。"} /></p>
          ) : (
            <p><MemberCopyValue value={"停止後，之後不再安排新的定期配送。"} />{terminationTargetHasCurrentOrder && <>
                <br /><MemberCopyValue value={"這次已成立的訂單會照原安排處理。"} /></>}
            </p>
          )}

          <div className="member-rush-warning-actions">
            <button
              type="button"
              className="member-danger-soft"
              disabled={Boolean(busy)}
              onClick={() => setTerminateConfirmationId("")}
            ><MemberCopyValue value={"先不要"} /></button>

            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void confirmTermination()}
            >
              <MemberCopyValue value={busy === "terminate"
                ? "處理中…"
                : terminationTarget?.status === "pending_activation"
                  ? "確認取消定期配送"
                  : "確認停止定期配送"} />
            </button>
          </div>
        </div>
      </div>
    )}

    {rushConfirmation && (
      <div className="member-price-modal-backdrop" role="presentation" onClick={() => setRushConfirmation(null)}>
        <div className="member-price-modal member-rush-warning-modal" role="dialog" aria-modal="true" aria-labelledby="member-rush-warning-title" onClick={(event) => event.stopPropagation()}>
          <p className="eyebrow dark"><MemberCopyValue value={"DEDICATED ROAST"} /></p>
          <h2 id="member-rush-warning-title"><MemberCopyValue value={"專屬烘焙準備時間提醒"} /></h2>
          <p><MemberCopyValue value={"專屬烘焙標準排程需要至少 "} />{DEDICATED_ROAST_STANDARD_PREPARATION_DAYS}<MemberCopyValue value={" 天準備時間。"} /><br /><MemberCopyValue value={"您目前選擇的配送日期較近，我們仍會接受這次訂單並盡力安排，但實際配送時間可能因此延後。"} /></p>
          <div className="member-rush-warning-actions"><button type="button" className="member-danger-soft" onClick={() => setRushConfirmation(null)}><MemberCopyValue value={"返回修改日期"} /></button><button type="button" disabled={Boolean(busy)} onClick={() => void continueRushAction()}><MemberCopyValue value={"我了解，繼續下單"} /></button></div>
        </div>
      </div>
    )}

    {showPriceDetails && pricingCycle && (
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
              <small><MemberCopyValue value={"SUBSCRIPTION PRICE"} /></small>
              <h3 id="member-price-detail-title"><MemberCopyValue value={"本期金額明細"} /></h3>
            </div>
            <MemberCopyElement as="button"
              type="button"
              aria-label="關閉"
              onClick={() => setShowPriceDetails(false)}
            >
              ×
            </MemberCopyElement>
          </div>

          <div className="member-price-breakdown">
            <div>
              <span><MemberCopyValue value={"商品原價"} /></span>
              <strong>{money(displayedOriginal)}</strong>
            </div>

            {regularShipping > 0 && (
              <div>
                <span><MemberCopyValue value={"一般配送運費"} /></span>
                <strong>{money(regularShipping)}</strong>
              </div>
            )}

            {regularShipping > 0 && (
              <div>
                <span><MemberCopyValue value={"一般購買合計"} /></span>
                <strong>{money(regularPurchaseTotal)}</strong>
              </div>
            )}

            <div>
              <span><MemberCopyValue value={"定期購優惠（"} />{lockedPricing?.subscriptionDiscountPercent ??
                  initial.rules.discountPercent}<MemberCopyValue value={"折）"} /></span>
              <strong>− {money(subscriptionSaving)}</strong>
            </div>

            {subscriptionShippingSaving > 0 && (
              <div>
                <span><MemberCopyValue value={"定期購配送優惠"} /></span>
                <strong>
                  − {money(subscriptionShippingSaving)}
                </strong>
              </div>
            )}

            <div>
              <span><MemberCopyValue value={"定期購價格"} /></span>
              <strong>{money(displayedSubscriptionPrice)}</strong>
            </div>

            {lockedPricing?.campaignPrice != null && (
              <div>
                <span><MemberCopyValue value={"活動價格"} /></span>
                <strong>{money(lockedPricing.campaignPrice)}</strong>
              </div>
            )}

            <div>
              <span><MemberCopyValue value={"本期採用"} /></span>
              <strong>
                <MemberCopyValue value={lockedPricing
                  ? lockedPricing.selectedPriceSource === "campaign"
                    ? "活動優惠價"
                    : "定期購優惠價"
                  : "鎖定本期時自動比較較優惠價格"} />
              </strong>
            </div>

            <div>
              <span><MemberCopyValue value={"本期配送費"} /></span>
              <strong>
                {money(displayedSubscriptionShipping)}
              </strong>
            </div>
            {supportedShippingMethod === "home_delivery" && <div><span><MemberCopyValue value={"貨到付款手續費"} /></span><strong>{money(displayedCodServiceFee)}</strong></div>}

            {(lockedPricing || preferenceMode !== "off") && (
              <div>
                <span><MemberCopyText copyKey="member.rewards.storeCredit.title" /></span>
                <strong>
                  {creditPreview === null && !lockedPricing ? <MemberCopyText copyKey="credit.help.loading" /> : <>− {money(displayedCredit)}</>}
                </strong>
              </div>
            )}

            {(subscriptionSaving > 0 ||
              subscriptionShippingSaving > 0) && (
              <div className="member-price-saving-total">
                <span><MemberCopyValue value={"本期優惠合計"} /></span>
                <strong><MemberCopyValue value={"省 "} />{money(totalSubscriptionSaving)}
                </strong>
              </div>
            )}
          </div>

          <div className="member-price-modal-total">
            <span>
              <MemberCopyValue value={lockedPricing ? "本期應付" : "目前預估應付"} />
            </span>
            <strong>{money(displayedFinal)}</strong>
          </div>

          {lockedPricing && !pricingCycle?.createdOrderId && <p className="member-price-modal-note"><MemberCopyText copyKey="credit.subscription.lockedHint" /></p>}
          {!lockedPricing && (
            <p className="member-price-modal-note"><MemberCopyText copyKey="member.subscription.description.e63e884dab" /></p>
          )}

          <button
            type="button"
            className="member-price-modal-close"
            onClick={() => setShowPriceDetails(false)}
          ><MemberCopyValue value={"我知道了"} /></button>
        </div>
      </div>
    )}
    <section className="member-commerce-section" id="credit"><div className="member-section-head"><div><p className="eyebrow dark"><MemberCopyValue value={"CREDIT"} /></p><h2><MemberCopyText copyKey="member.subscription.label.a519a98b2f" /></h2></div><strong>{money(availableCredit)}</strong></div><div className="member-credit-summary"><div><small><MemberCopyValue value={"現在可用"} /></small><strong>{money(availableCredit)}</strong><span><MemberCopyValue value={"僅顯示已正式入帳、可於結帳使用的折抵額。"} /></span></div></div>{dashboard.credits.length ? <div className="member-credit-history">{dashboard.credits.map((entry) => <article key={entry.creditEntryId}><div><strong>{entry.direction === "deduct" ? "−" : "+"} {money(Math.abs(entry.amount))}</strong><small>{entry.sourceCopyKey ? <MemberCopyText copyKey={entry.sourceCopyKey} /> : entry.sourceLabel}</small>{entry.sourceOrderNumber ? <span className="member-credit-redemption"><b><MemberCopyValue value={"回饋來源訂單"} /></b><Link href={`/orders/${encodeURIComponent(entry.sourceOrderNumber)}`}><MemberCopyValue value={"訂單 "} />{entry.sourceOrderNumber}</Link></span> : null}{entry.orderRedemptions.map((redemption) => <span className={`member-credit-redemption ${redemption.status}`} key={`${entry.creditEntryId}-${redemption.orderNumber}`}><b><MemberCopyText copyKey={redemptionKey(redemption.status)} /> {money(redemption.amount)}</b><Link href={`/orders/${encodeURIComponent(redemption.orderNumber)}`}><MemberCopyValue value={"訂單 "} />{redemption.orderNumber}</Link></span>)}</div><div><span><MemberCopyValue value={"餘額 "} />{money(entry.remainingAmount)}</span>{entry.amount > 0 ? <small><MemberCopyValue value={"到期 "} />{entry.expiresAt.slice(0, 10)}</small> : null}</div></article>)}</div> : <div className="member-commerce-empty compact"><strong><MemberCopyText copyKey="member.subscription.emptyState.193dab97b4" /></strong><p><MemberCopyText copyKey="member.subscription.description.4b6e30e9c5" /></p></div>}</section>

    <section className="member-commerce-section" id="referral-summary"><div className="member-section-head"><div><p className="eyebrow dark"><MemberCopyValue value={"REFERRAL"} /></p><h2><MemberCopyValue value={"推薦紀錄摘要"} /></h2></div><span>{dashboard.referrals.length}<MemberCopyValue value={" 位"} /></span></div>{dashboard.referrals.length ? <div className="member-referral-list">{dashboard.referrals.map((item) => <article key={item.memberNumberReference}><div><strong><MemberCopyValue value={item.safeDisplayName || "KD Coffee 會員"} /></strong><small><MemberCopyValue value={"已加入會員"} /></small></div><div><span><MemberCopyValue value={"符合消費 "} />{item.qualifiedPurchases}<MemberCopyValue value={" 次"} /></span></div></article>)}</div> : <div className="member-commerce-empty compact"><strong><MemberCopyValue value={"還沒有推薦紀錄"} /></strong><p><MemberCopyValue value={"這裡只會顯示安全的會員稱呼、是否加入與回饋進度，不會顯示對方的聯絡資料。"} /></p></div>}</section>
  </>;
}
