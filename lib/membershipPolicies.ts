import type { MembershipBusinessRules, MoneyRoundingMode } from "./membershipBusinessRules";
import { OWNER_DECISION_REQUIRED } from "./membershipBusinessRules";

export const TAIPEI_BUSINESS_TIME_ZONE = "Asia/Taipei" as const;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export class MembershipPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MembershipPolicyError";
  }
}

function parseDateOnly(value: string) {
  const match = DATE_ONLY.exec(value);
  if (!match) throw new MembershipPolicyError("日期必須使用 YYYY-MM-DD 格式");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new MembershipPolicyError("日期不存在");
  return date;
}

function formatDateOnly(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function addTaipeiCalendarDays(dateOnly: string, days: number) {
  if (!Number.isSafeInteger(days)) throw new MembershipPolicyError("天數必須是整數");
  const date = parseDateOnly(dateOnly);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

/** Canonical reward release policy: Taipei business dates only; time-of-day is never compared. */
export function referralReleaseEligibleBusinessDate(successfulPickupBusinessDate: string, baseWaitingDays: number, returnProtectionDays: number) {
  if (!Number.isSafeInteger(baseWaitingDays) || baseWaitingDays < 0 || !Number.isSafeInteger(returnProtectionDays) || returnProtectionDays < 0) {
    throw new MembershipPolicyError("推薦獎勵等待天數必須是非負整數");
  }
  return addTaipeiCalendarDays(successfulPickupBusinessDate, baseWaitingDays + returnProtectionDays);
}

export function isReferralReleaseBusinessDateDue(currentTaipeiBusinessDate: string, releaseEligibleBusinessDate: string) {
  parseDateOnly(currentTaipeiBusinessDate);
  parseDateOnly(releaseEligibleBusinessDate);
  return currentTaipeiBusinessDate >= releaseEligibleBusinessDate;
}

export function addTaipeiCalendarMonths(dateOnly: string, months: number) {
  if (!Number.isSafeInteger(months)) throw new MembershipPolicyError("月份必須是整數");
  const source = parseDateOnly(dateOnly);
  const sourceDay = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(sourceDay, lastDay));
  return formatDateOnly(target);
}

export function cycleDates(plannedDate: string, modificationCutoffDays: number, orderCreationLeadDays: number) {
  parseDateOnly(plannedDate);
  if (orderCreationLeadDays > modificationCutoffDays) throw new MembershipPolicyError("建立訂單日期不可早於修改截止日期");
  return {
    plannedDate,
    modificationDeadline: addTaipeiCalendarDays(plannedDate, -modificationCutoffDays),
    orderCreationDate: addTaipeiCalendarDays(plannedDate, -orderCreationLeadDays),
  };
}

export type DateAvailability = {
  requestedDate: string;
  earliestDate: string;
  allowed: boolean;
  reason: "available" | "before-lead-time" | "blocked-date";
};

export function resolveDateAvailability(input: { requestedDate: string; today: string; leadDays: number; blockedDates?: string[] }) {
  parseDateOnly(input.requestedDate);
  parseDateOnly(input.today);
  if (!Number.isSafeInteger(input.leadDays) || input.leadDays < 0) throw new MembershipPolicyError("備貨天數設定不正確");
  const earliestDate = addTaipeiCalendarDays(input.today, input.leadDays);
  const blocked = new Set((input.blockedDates ?? []).map((date) => formatDateOnly(parseDateOnly(date))));
  const reason: DateAvailability["reason"] = input.requestedDate < earliestDate
    ? "before-lead-time"
    : blocked.has(input.requestedDate)
      ? "blocked-date"
      : "available";
  return { requestedDate: input.requestedDate, earliestDate, allowed: reason === "available", reason } satisfies DateAvailability;
}

export function resolvePickupDateAvailability(input: { requestedDate: string; today: string; customRoast: boolean; rules: MembershipBusinessRules }) {
  return resolveDateAvailability({
    requestedDate: input.requestedDate,
    today: input.today,
    leadDays: input.customRoast ? input.rules.pickup.customRoastPreparationLeadDays : input.rules.pickup.preparationLeadDays,
    blockedDates: input.rules.pickup.blockedDates,
  });
}

export function resolveSubscriptionDateAvailability(input: { requestedDate: string; today: string; customRoast: boolean; rules: MembershipBusinessRules }) {
  return resolveDateAvailability({
    requestedDate: input.requestedDate,
    today: input.today,
    leadDays: input.customRoast ? input.rules.subscription.customRoastPreparationLeadDays : input.rules.subscription.preparationLeadDays,
  });
}

export function assertIntegerMoney(value: number, label = "金額") {
  if (!Number.isSafeInteger(value) || value < 0) throw new MembershipPolicyError(`${label}必須是非負整數新台幣`);
  return value;
}

export function applyPercentage(amount: number, percent: number, mode: MoneyRoundingMode) {
  assertIntegerMoney(amount);
  if (!Number.isSafeInteger(percent) || percent < 0 || percent > 100) throw new MembershipPolicyError("百分比必須是 0 到 100 的整數");
  const numerator = amount * percent;
  if (!Number.isSafeInteger(numerator)) throw new MembershipPolicyError("金額超出安全範圍");
  if (numerator % 100 === 0) return numerator / 100;
  if (mode === OWNER_DECISION_REQUIRED) throw new MembershipPolicyError("金額尾數處理方式尚待 Owner 決定");
  if (mode === "round-down") return Math.floor(numerator / 100);
  if (mode === "round-up") return Math.ceil(numerator / 100);
  return Math.floor((numerator + 50) / 100);
}

export function maximumCreditRedemption(input: { merchandiseSubtotal: number; shipping: number; rules: MembershipBusinessRules }) {
  const merchandise = assertIntegerMoney(input.merchandiseSubtotal, "商品小計");
  const shipping = assertIntegerMoney(input.shipping, "運費");
  const shippingScope = input.rules.credit.appliesToShipping;
  if (shippingScope === OWNER_DECISION_REQUIRED) throw new MembershipPolicyError("抵用金是否可折抵運費尚待 Owner 決定");
  const eligible = merchandise + (shippingScope === "yes" ? shipping : 0);
  const policy = input.rules.credit.redemption;
  let maximum = eligible;
  if (policy.mode === "maximum-fixed") maximum = Math.min(eligible, policy.amount);
  if (policy.mode === "minimum-payable") maximum = Math.max(0, eligible - policy.amount);
  if (policy.mode === "maximum-percentage") maximum = applyPercentage(merchandise, policy.percent, input.rules.money.roundingMode);
  return input.rules.credit.allowZeroTotal ? maximum : Math.min(maximum, Math.max(0, merchandise + shipping - 1));
}

export function resolveCreditMemberPolicy(rules: MembershipBusinessRules) {
  return {
    uiMode: rules.credit.uiMode,
    showAmountInput: ["amount-and-maximum", "custom-amount"].includes(rules.credit.uiMode),
    showMaximumButton: rules.credit.uiMode === "amount-and-maximum",
    automaticallyUseMaximum: rules.credit.uiMode === "automatic-maximum",
    allowZeroTotal: rules.credit.allowZeroTotal,
    appliesToShipping: rules.credit.appliesToShipping === "yes",
  };
}

export type MembershipPricePreview = {
  productSubtotal: number;
  subscriptionPrice: number;
  campaignPrice: number | null;
  selectedMerchandisePrice: number;
  selectedPriceSource: "subscription" | "campaign";
  creditApplied: number;
  shipping: number;
  finalAmount: number;
};

export function previewMembershipPrice(input: { productSubtotal: number; campaignPrice?: number | null; requestedCredit?: number; shipping: number; rules: MembershipBusinessRules }) {
  const productSubtotal = assertIntegerMoney(input.productSubtotal, "商品小計");
  const shipping = input.rules.shipping.subscriptionFreeShipping ? 0 : assertIntegerMoney(input.shipping, "運費");
  const subscriptionPrice = applyPercentage(productSubtotal, input.rules.subscription.discountPercent, input.rules.money.roundingMode);
  const campaignPrice = input.campaignPrice == null ? null : assertIntegerMoney(input.campaignPrice, "活動價");
  let selectedMerchandisePrice = subscriptionPrice;
  let selectedPriceSource: MembershipPricePreview["selectedPriceSource"] = "subscription";
  if (campaignPrice != null && input.rules.campaign.eligiblePricingMode === "best-price" && campaignPrice < subscriptionPrice) {
    selectedMerchandisePrice = campaignPrice;
    selectedPriceSource = "campaign";
  } else if (campaignPrice != null && ["campaign-replaces-subscription", "campaign-defined"].includes(input.rules.campaign.eligiblePricingMode)) {
    selectedMerchandisePrice = campaignPrice;
    selectedPriceSource = "campaign";
  }
  const maximum = maximumCreditRedemption({ merchandiseSubtotal: selectedMerchandisePrice, shipping, rules: input.rules });
  const creditApplied = Math.min(assertIntegerMoney(input.requestedCredit ?? 0, "抵用金"), maximum);
  return { productSubtotal, subscriptionPrice, campaignPrice, selectedMerchandisePrice, selectedPriceSource, creditApplied, shipping, finalAmount: Math.max(0, selectedMerchandisePrice + shipping - creditApplied) } satisfies MembershipPricePreview;
}

export function referralRewardForMerchandise(input: { merchandiseAfterDiscounts: number; eligibleItemCount?: number; rules: MembershipBusinessRules }) {
  const base = assertIntegerMoney(input.merchandiseAfterDiscounts, "推薦獎勵商品金額");
  const reward = input.rules.referral.reward;
  if (reward.mode === OWNER_DECISION_REQUIRED) throw new MembershipPolicyError("推薦獎勵方式尚待 Owner 決定");
  if (reward.mode === "fixed") return reward.amount;
  if (reward.mode === "per-eligible-item") return reward.amount * Math.max(0, input.eligibleItemCount ?? 0);
  return applyPercentage(base, reward.percent, input.rules.money.roundingMode);
}

export type CompositionComponent = {
  productId: string;
  weightHalfPounds: 1;
};

export type SubscriptionItem = {
  itemId: string;
  packageWeight: "half-pound" | "one-pound";
  quantity: number;
  roast: string;
  components: CompositionComponent[];
};

export function validateSubscriptionItem(item: SubscriptionItem) {
  if (!item.itemId || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || !item.roast.trim()) throw new MembershipPolicyError("定期購商品設定不正確");
  const requiredComponents = item.packageWeight === "half-pound" ? 1 : item.packageWeight === "one-pound" ? 2 : 0;
  if (!requiredComponents || item.components.length !== requiredComponents || item.components.some((component) => !component.productId || component.weightHalfPounds !== 1)) throw new MembershipPolicyError(item.packageWeight === "one-pound" ? "一磅必須由兩個半磅作品組成" : "半磅必須包含一個半磅作品");
  return structuredClone(item);
}

export function giftQuantityForItems(items: SubscriptionItem[], rules: MembershipBusinessRules) {
  return items.reduce((total, item) => total + item.quantity * (item.packageWeight === "one-pound" ? rules.gift.onePoundQuantity : rules.gift.halfPoundQuantity), 0);
}

export function giftEligibleAt(fulfillmentNumber: number, rules: MembershipBusinessRules) {
  const start = rules.gift.startsAtFulfillment;
  return fulfillmentNumber >= start && (fulfillmentNumber - start) % rules.gift.repeatEveryFulfillments === 0;
}

/** Server-authoritative subscription interval validation for presets and member custom cycles. */
export function resolveSubscriptionInterval(days: number, rules: MembershipBusinessRules) {
  if (!Number.isSafeInteger(days)) return { allowed: false, kind: "invalid" as const };
  const preset = rules.subscription.intervalOptions.find((option) => option.days === days);
  if (preset?.enabled) return { allowed: true, kind: "preset" as const };
  const allowed = rules.subscription.customCycleEnabled
    && days >= rules.subscription.customCycleMinDays
    && days <= rules.subscription.customCycleMaxDays;
  return { allowed, kind: allowed ? "custom" as const : "invalid" as const };
}

export function openingYearMemberShippingIsFree(input: { date: string; shippingMethod: string; rules: MembershipBusinessRules }) {
  parseDateOnly(input.date);
  const policy = input.rules.membership.openingYearFreeShipping;
  return policy.enabled && Boolean(policy.startDate) && Boolean(policy.endDate) && input.date >= policy.startDate && input.date <= policy.endDate && policy.shippingMethods.includes(input.shippingMethod);
}
