import { promises as fs } from "fs";
import path from "path";

import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import {
  MEMBERSHIP_RULES_SCHEMA_VERSION,
  membershipNotificationEventTypes,
  OWNER_DECISION_REQUIRED,
  type MembershipBusinessRules,
  type MembershipRulesStore,
} from "./membershipRuleTypes";
import { getMembershipRulesFile } from "./storagePaths";

export { MEMBERSHIP_RULES_SCHEMA_VERSION, OWNER_DECISION_REQUIRED } from "./membershipRuleTypes";
export type { MembershipBusinessRules, MembershipRulesStore, MoneyRoundingMode, RulesVersion } from "./membershipRuleTypes";

export class MembershipRulesValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MembershipRulesValidationError";
  }
}

export class MembershipRulesVersionConflictError extends Error {
  constructor() {
    super("設定已在其他視窗更新，請重新整理後再儲存。");
    this.name = "MembershipRulesVersionConflictError";
  }
}

export const DEFAULT_MEMBERSHIP_RULES: MembershipBusinessRules = {
  membership: {
    openingYearFreeShipping: {
      enabled: true,
      startDate: "",
      endDate: "",
      shippingMethods: ["711_cod"],
    },
  },
  shipping: { subscriptionFreeShipping: true, subscriptionShippingFee: 60 },
  subscription: {
    discountPercent: 95,
    intervalsDays: [30, 45, 60, 75, 90],
    intervalOptions: [30, 45, 60, 75, 90].map((days) => ({ days, enabled: true })),
    customCycleEnabled: true,
    customCycleMinDays: 20,
    customCycleMaxDays: 120,
    modificationCutoffDays: 7,
    orderCreationLeadDays: 3,
    preparationLeadDays: 3,
    customRoastPreparationLeadDays: 7,
    delayQuickOptionsDays: [7, 14, 30],
    advanceQuickOptionsDays: [3, 5, 7],
    maxModificationsPerCycle: null,
    datePickerMode: "quick-and-calendar",
    uncollectedTerminationCount: 1,
    allowOtherSubscriptionProducts: true,
    allowHalfToOnePound: true,
    allowOneToHalfPound: true,
    allowMixedOnePound: true,
    allowQuantityChange: true,
    pauseResumeAnchorPolicy: "member-selects-date",
  },
  pickup: {
    preparationLeadDays: 0,
    customRoastPreparationLeadDays: 3,
    blockedDates: [],
    datePickerMode: "calendar",
  },
  gift: {
    startsAtFulfillment: 3,
    repeatEveryFulfillments: 1,
    halfPoundQuantity: 1,
    onePoundQuantity: 2,
    pool: [],
  },
  referral: {
    programEnabled: true,
    referralMaxRewardDepth: 5,
    levels: [
      { level: 1, enabled: true, newReferralRewardRate: 5, subscriptionRewardRate: 5 },
      { level: 2, enabled: true, newReferralRewardRate: 2, subscriptionRewardRate: 2 },
      { level: 3, enabled: true, newReferralRewardRate: 1, subscriptionRewardRate: 1 },
      { level: 4, enabled: true, newReferralRewardRate: 0.5, subscriptionRewardRate: 0.5 },
      { level: 5, enabled: true, newReferralRewardRate: 0.5, subscriptionRewardRate: 0.5 },
    ],
    referralRewardCalculationMode: "paid_amount",
    referralRewardQualificationWindowDays: 30,
    referralRewardBaseWaitingDays: 7,
    referralRewardReturnProtectionDays: 3,
    referralTotalRewardCap: 10,
    referralMonthlyCreditCap: 0,
    pvRewardMoneyValue: 1,
    showProductPV: false,
    reversalPolicy: "cancel-pending-and-reverse-released",
    referrerEligibility: { mode: "none" },
    reward: { mode: "percentage", percent: 5, repeatedRewards: true },
  },
  credit: {
    expiryCalendarMonths: 3,
    expiryReminderDays: 7,
    expiryMonthEndPolicy: "clamp-to-last-day",
    redemption: { mode: "unlimited" },
    appliesToShipping: "yes",
    allowZeroTotal: true,
    uiMode: "amount-and-maximum",
  },
  campaign: { eligiblePricingMode: "best-price" },
  notification: {
    channels: ["member_center", "email", "line", "admin"],
    retryCount: 2,
    emailFallback: false,
    nextCycleReminderDays: 14,
    modificationCutoffReminderDays: 1,
    events: Object.fromEntries(membershipNotificationEventTypes.map((eventType) => [eventType, {
      enabled: true,
      channels: eventType === "unclaimed_risk" ? ["member_center", "line", "admin"] : ["member_center", "line"],
    }])) as MembershipBusinessRules["notification"]["events"],
  },
  fulfillment: { arrivalReminderAfterDays: 5, unknownEmailRequiresReview: true, gmailScanLookbackDays: 14 },
  ownerExceptions: { canUnlockDate: true, canUnlockStore: true, canUnlockQuantity: false },
  money: { unit: "TWD", integerOnly: true, roundingMode: "round-half-up" },
  dateTime: { timeZone: "Asia/Taipei", dateOnlyPolicy: "taipei-calendar-date" },
};

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Backward-compatible resolver: missing Phase I.3 fields inherit safe defaults; supplied invalid values still fail validation. */
export function normalizeMembershipBusinessRules(value: unknown): MembershipBusinessRules {
  if (!object(value)) throw new MembershipRulesValidationError("會員商務設定格式不完整");
  const source = value as Record<string, unknown>;
  const nested = (key: string) => object(source[key]) ? source[key] as Record<string, unknown> : {};
  const membership = nested("membership");
  const opening = object(membership.openingYearFreeShipping) ? membership.openingYearFreeShipping : {};
  const notification = nested("notification");
  const sourceEvents = object(notification.events) ? notification.events : {};
  const events = Object.fromEntries(membershipNotificationEventTypes.map((eventType) => {
    const policy = object(sourceEvents[eventType]) ? sourceEvents[eventType] : {};
    return [eventType, { ...DEFAULT_MEMBERSHIP_RULES.notification.events[eventType], ...policy }];
  }));
  return {
    ...structuredClone(DEFAULT_MEMBERSHIP_RULES),
    ...source,
    membership: { ...DEFAULT_MEMBERSHIP_RULES.membership, ...membership, openingYearFreeShipping: { ...DEFAULT_MEMBERSHIP_RULES.membership.openingYearFreeShipping, ...opening } },
    shipping: { ...DEFAULT_MEMBERSHIP_RULES.shipping, ...nested("shipping") },
    subscription: (() => {
      const supplied = nested("subscription");
      const intervals = Array.isArray(supplied.intervalsDays) ? supplied.intervalsDays : DEFAULT_MEMBERSHIP_RULES.subscription.intervalsDays;
      return { ...DEFAULT_MEMBERSHIP_RULES.subscription, ...supplied, intervalOptions: Array.isArray(supplied.intervalOptions) ? supplied.intervalOptions : intervals.map((days) => ({ days, enabled: true })) };
    })(),
    pickup: { ...DEFAULT_MEMBERSHIP_RULES.pickup, ...nested("pickup") },
    gift: { ...DEFAULT_MEMBERSHIP_RULES.gift, ...nested("gift") },
    referral: (() => {
      const supplied = nested("referral");
      const legacyBaseWaitingDays = supplied.referralNewRewardReleaseDelayDays;
      return {
        ...DEFAULT_MEMBERSHIP_RULES.referral,
        ...supplied,
        referralRewardBaseWaitingDays: supplied.referralRewardBaseWaitingDays ?? legacyBaseWaitingDays ?? DEFAULT_MEMBERSHIP_RULES.referral.referralRewardBaseWaitingDays,
        referralRewardReturnProtectionDays: supplied.referralRewardReturnProtectionDays ?? DEFAULT_MEMBERSHIP_RULES.referral.referralRewardReturnProtectionDays,
        levels: Array.isArray(supplied.levels) ? supplied.levels : DEFAULT_MEMBERSHIP_RULES.referral.levels,
      };
    })(),
    credit: { ...DEFAULT_MEMBERSHIP_RULES.credit, ...nested("credit") },
    campaign: { ...DEFAULT_MEMBERSHIP_RULES.campaign, ...nested("campaign") },
    notification: { ...DEFAULT_MEMBERSHIP_RULES.notification, ...notification, events } as MembershipBusinessRules["notification"],
    fulfillment: { ...DEFAULT_MEMBERSHIP_RULES.fulfillment, ...nested("fulfillment") },
    ownerExceptions: { ...DEFAULT_MEMBERSHIP_RULES.ownerExceptions, ...nested("ownerExceptions") },
    money: { ...DEFAULT_MEMBERSHIP_RULES.money, ...nested("money") },
    dateTime: { ...DEFAULT_MEMBERSHIP_RULES.dateTime, ...nested("dateTime") },
  } as MembershipBusinessRules;
}

function integer(value: unknown, min: number, max: number, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    throw new MembershipRulesValidationError(`${label}設定不正確`);
  }
}

function percent(value: unknown, label: string) {
  integer(value, 0, 100, label);
}

function dateOnly(value: unknown, allowEmpty = false) {
  if (allowEmpty && value === "") return true;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function validateOwnerChoice<T extends string>(value: unknown, allowed: readonly T[], label: string): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new MembershipRulesValidationError(`${label}設定不正確`);
  }
}

export function validateMembershipBusinessRules(value: unknown): MembershipBusinessRules {
  const rules = normalizeMembershipBusinessRules(value);
  if (!object(rules.membership) || !object(rules.membership.openingYearFreeShipping)) throw new MembershipRulesValidationError("會員免運設定不完整");
  const opening = rules.membership.openingYearFreeShipping;
  if (typeof opening.enabled !== "boolean" || !dateOnly(opening.startDate, true) || !dateOnly(opening.endDate, true) || !Array.isArray(opening.shippingMethods) || opening.shippingMethods.some((method) => typeof method !== "string" || !method)) throw new MembershipRulesValidationError("開站會員免運設定不正確");
  if ((opening.startDate || opening.endDate) && (!opening.startDate || !opening.endDate || opening.startDate > opening.endDate)) throw new MembershipRulesValidationError("會員免運的開始與結束日期不正確");

  if (!object(rules.shipping) || typeof rules.shipping.subscriptionFreeShipping !== "boolean") throw new MembershipRulesValidationError("定期購運費設定不正確");
  integer(rules.shipping.subscriptionShippingFee, 0, 10_000, "定期購運費");
  if (!object(rules.subscription)) throw new MembershipRulesValidationError("定期購設定不完整");
  percent(rules.subscription.discountPercent, "定期購價格");
  if (!Array.isArray(rules.subscription.intervalsDays) || rules.subscription.intervalsDays.length > 20 || (rules.subscription.intervalsDays.length === 0 && !rules.subscription.customCycleEnabled)) throw new MembershipRulesValidationError("配送週期至少需要一個快捷或自訂選項");
  for (const days of rules.subscription.intervalsDays) integer(days, 1, 365, "配送週期");
  if (new Set(rules.subscription.intervalsDays).size !== rules.subscription.intervalsDays.length) throw new MembershipRulesValidationError("配送週期不可重複");
  if (!Array.isArray(rules.subscription.intervalOptions) || !rules.subscription.intervalOptions.length || rules.subscription.intervalOptions.length > 20) throw new MembershipRulesValidationError("快捷週期設定不完整");
  for (const option of rules.subscription.intervalOptions) {
    if (!object(option) || typeof option.enabled !== "boolean") throw new MembershipRulesValidationError("快捷週期設定不正確");
    integer(option.days, 1, 365, "快捷週期");
  }
  if (new Set(rules.subscription.intervalOptions.map((item) => item.days)).size !== rules.subscription.intervalOptions.length) throw new MembershipRulesValidationError("快捷週期不可重複");
  if (typeof rules.subscription.customCycleEnabled !== "boolean") throw new MembershipRulesValidationError("自訂週期開關不正確");
  integer(rules.subscription.customCycleMinDays, 1, 365, "自訂週期下限");
  integer(rules.subscription.customCycleMaxDays, 1, 365, "自訂週期上限");
  if (rules.subscription.customCycleMinDays > rules.subscription.customCycleMaxDays) throw new MembershipRulesValidationError("自訂週期下限不可大於上限");
  integer(rules.subscription.modificationCutoffDays, 0, 60, "修改期限");
  integer(rules.subscription.orderCreationLeadDays, 0, 60, "建立訂單時間");
  if (rules.subscription.orderCreationLeadDays > rules.subscription.modificationCutoffDays) throw new MembershipRulesValidationError("建立訂單時間不可早於會員修改截止時間");
  integer(rules.subscription.uncollectedTerminationCount, 1, 10, "未取貨停止次數");
  integer(rules.subscription.preparationLeadDays, 0, 60, "一般備貨時間");
  integer(rules.subscription.customRoastPreparationLeadDays, rules.subscription.preparationLeadDays, 90, "專屬烘焙備貨時間");
  if (!Array.isArray(rules.subscription.delayQuickOptionsDays) || !rules.subscription.delayQuickOptionsDays.length) throw new MembershipRulesValidationError("延後快捷選項不完整");
  for (const days of rules.subscription.delayQuickOptionsDays) integer(days, 1, 180, "延後快捷選項");
  if (!Array.isArray(rules.subscription.advanceQuickOptionsDays) || !rules.subscription.advanceQuickOptionsDays.length) throw new MembershipRulesValidationError("提前快捷選項不完整");
  for (const days of rules.subscription.advanceQuickOptionsDays) integer(days, 1, 180, "提前快捷選項");
  if (rules.subscription.maxModificationsPerCycle !== null) integer(rules.subscription.maxModificationsPerCycle, 0, 99, "每期修改次數");
  validateOwnerChoice(rules.subscription.datePickerMode, ["quick-and-calendar", "calendar-only", "suggestion-and-calendar"], "配送日期選擇方式");
  for (const key of ["allowOtherSubscriptionProducts", "allowHalfToOnePound", "allowOneToHalfPound", "allowMixedOnePound", "allowQuantityChange"] as const) if (typeof rules.subscription[key] !== "boolean") throw new MembershipRulesValidationError("商品更換設定不正確");
  validateOwnerChoice(rules.subscription.pauseResumeAnchorPolicy, [OWNER_DECISION_REQUIRED, "keep-original", "resume-date", "member-selects-date"], "恢復配送日期");

  if (!object(rules.pickup)) throw new MembershipRulesValidationError("工作室自取設定不完整");
  integer(rules.pickup.preparationLeadDays, 0, 60, "自取備貨時間");
  integer(rules.pickup.customRoastPreparationLeadDays, rules.pickup.preparationLeadDays, 90, "自取專屬烘焙備貨時間");
  if (!Array.isArray(rules.pickup.blockedDates) || rules.pickup.blockedDates.some((date) => !dateOnly(date)) || new Set(rules.pickup.blockedDates).size !== rules.pickup.blockedDates.length) throw new MembershipRulesValidationError("不可自取日期設定不正確");
  validateOwnerChoice(rules.pickup.datePickerMode, ["calendar", "suggestion-and-calendar"], "自取日期選擇方式");

  if (!object(rules.gift)) throw new MembershipRulesValidationError("續訂贈品設定不完整");
  integer(rules.gift.startsAtFulfillment, 1, 100, "贈品開始次數");
  integer(rules.gift.repeatEveryFulfillments, 1, 100, "贈品贈送頻率");
  integer(rules.gift.halfPoundQuantity, 0, 20, "半磅贈品數量");
  integer(rules.gift.onePoundQuantity, 0, 20, "一磅贈品數量");
  if (!Array.isArray(rules.gift.pool)) throw new MembershipRulesValidationError("贈品候選清單不正確");
  const priorities = new Set<number>();
  for (const item of rules.gift.pool) {
    if (!object(item) || typeof item.productId !== "string" || !item.productId || typeof item.enabled !== "boolean") throw new MembershipRulesValidationError("贈品候選項目不正確");
    integer(item.priority, 1, 999, "贈品優先順序");
    if (priorities.has(item.priority)) throw new MembershipRulesValidationError("贈品優先順序不可重複");
    priorities.add(item.priority);
  }

  if (!object(rules.referral) || !object(rules.referral.referrerEligibility) || !object(rules.referral.reward)) throw new MembershipRulesValidationError("推薦獎勵設定不完整");
  if (typeof rules.referral.programEnabled !== "boolean" || typeof rules.referral.showProductPV !== "boolean") throw new MembershipRulesValidationError("推薦制度開關不正確");
  integer(rules.referral.referralMaxRewardDepth, 1, 10, "推薦獎勵代數");
  if (!Array.isArray(rules.referral.levels) || rules.referral.levels.length < rules.referral.referralMaxRewardDepth) throw new MembershipRulesValidationError("各代推薦獎勵設定不完整");
  const referralLevels = new Set<number>();
  for (const level of rules.referral.levels) {
    if (!object(level) || typeof level.enabled !== "boolean") throw new MembershipRulesValidationError("各代推薦獎勵設定不正確");
    integer(level.level, 1, 10, "推薦代數");
    if (referralLevels.has(level.level)) throw new MembershipRulesValidationError("推薦代數不可重複");
    referralLevels.add(level.level);
    if (typeof level.newReferralRewardRate !== "number" || level.newReferralRewardRate < 0 || level.newReferralRewardRate > 100) throw new MembershipRulesValidationError("新推薦獎勵率不正確");
    if (typeof level.subscriptionRewardRate !== "number" || level.subscriptionRewardRate < 0 || level.subscriptionRewardRate > 100) throw new MembershipRulesValidationError("定期購獎勵率不正確");
  }
  validateOwnerChoice(rules.referral.referralRewardCalculationMode, ["paid_amount", "pv"], "推薦獎勵計算方式");
  integer(rules.referral.referralRewardQualificationWindowDays, 1, 3650, "推薦獎勵領取資格期限");
  integer(rules.referral.referralRewardBaseWaitingDays, 0, 365, "推薦獎勵基礎等待天數");
  integer(rules.referral.referralRewardReturnProtectionDays, 0, 365, "推薦獎勵退貨保護天數");
  if (typeof rules.referral.referralTotalRewardCap !== "number" || rules.referral.referralTotalRewardCap < 0 || rules.referral.referralTotalRewardCap > 100) throw new MembershipRulesValidationError("全組織獎勵上限不正確");
  integer(rules.referral.referralMonthlyCreditCap, 0, 100_000_000, "每月推薦抵用金上限");
  if (typeof rules.referral.pvRewardMoneyValue !== "number" || !Number.isFinite(rules.referral.pvRewardMoneyValue) || rules.referral.pvRewardMoneyValue < 0 || rules.referral.pvRewardMoneyValue > 100_000) throw new MembershipRulesValidationError("PV 抵用金換算不正確");
  validateOwnerChoice(rules.referral.reversalPolicy, ["cancel-pending-and-reverse-released", "cancel-pending-only"], "推薦獎勵取消政策");
  validateOwnerChoice(rules.referral.referrerEligibility.mode, [OWNER_DECISION_REQUIRED, "active-subscription", "none", "completed-orders", "lifetime-spend", "recent-valid-purchase"], "推薦人領取資格");
  if (rules.referral.referrerEligibility.mode === "completed-orders") integer(rules.referral.referrerEligibility.minimumOrders, 1, 999, "最低完成訂單");
  if (rules.referral.referrerEligibility.mode === "lifetime-spend") integer(rules.referral.referrerEligibility.minimumAmount, 1, 100_000_000, "最低累積消費");
  if (rules.referral.referrerEligibility.mode === "recent-valid-purchase") integer(rules.referral.referrerEligibility.withinDays, 1, 3650, "有效購買天數");
  validateOwnerChoice(rules.referral.reward.mode, [OWNER_DECISION_REQUIRED, "fixed", "percentage", "per-eligible-item"], "推薦獎勵");
  if (typeof rules.referral.reward.repeatedRewards !== "boolean") throw new MembershipRulesValidationError("推薦重複獎勵設定不正確");
  if (rules.referral.reward.mode === "fixed") integer(rules.referral.reward.amount, 1, 1_000_000, "推薦獎勵金額");
  if (rules.referral.reward.mode === "percentage") percent(rules.referral.reward.percent, "推薦獎勵比例");
  if (rules.referral.reward.mode === "per-eligible-item") integer(rules.referral.reward.amount, 1, 1_000_000, "每件推薦獎勵");

  if (!object(rules.credit) || !object(rules.credit.redemption)) throw new MembershipRulesValidationError("抵用金設定不完整");
  integer(rules.credit.expiryCalendarMonths, 1, 120, "抵用金期限");
  integer(rules.credit.expiryReminderDays, 0, 365, "抵用金到期提醒");
  if (rules.credit.expiryMonthEndPolicy !== "clamp-to-last-day") throw new MembershipRulesValidationError("抵用金月底到期規則不正確");
  validateOwnerChoice(rules.credit.redemption.mode, ["unlimited", "maximum-fixed", "minimum-payable", "maximum-percentage"], "每筆最高折抵");
  if (rules.credit.redemption.mode === "maximum-fixed") integer(rules.credit.redemption.amount, 0, 100_000_000, "最高折抵金額");
  if (rules.credit.redemption.mode === "minimum-payable") integer(rules.credit.redemption.amount, 0, 100_000_000, "最低應付金額");
  if (rules.credit.redemption.mode === "maximum-percentage") percent(rules.credit.redemption.percent, "最高折抵比例");
  validateOwnerChoice(rules.credit.appliesToShipping, [OWNER_DECISION_REQUIRED, "yes", "no"], "抵用金運費範圍");
  if (typeof rules.credit.allowZeroTotal !== "boolean") throw new MembershipRulesValidationError("零元訂單設定不正確");
  validateOwnerChoice(rules.credit.uiMode, ["amount-and-maximum", "use-or-not", "automatic-maximum", "custom-amount"], "抵用金操作方式");

  if (!object(rules.campaign)) throw new MembershipRulesValidationError("活動價格設定不完整");
  validateOwnerChoice(rules.campaign.eligiblePricingMode, [OWNER_DECISION_REQUIRED, "best-price", "campaign-replaces-subscription", "subscription-plus-benefit", "campaign-defined"], "活動定期購價格");
  if (!object(rules.notification) || !Array.isArray(rules.notification.channels) || rules.notification.channels.some((channel) => !["member_center", "email", "line", "admin"].includes(channel))) throw new MembershipRulesValidationError("通知方式設定不正確");
  integer(rules.notification.nextCycleReminderDays, 0, 365, "下一期提醒");
  integer(rules.notification.modificationCutoffReminderDays, 0, 60, "修改截止提醒");
  integer(rules.notification.retryCount, 0, 10, "通知重試次數");
  if (typeof rules.notification.emailFallback !== "boolean" || !object(rules.notification.events)) throw new MembershipRulesValidationError("通知備援設定不正確");
  for (const eventType of membershipNotificationEventTypes) {
    const policy = rules.notification.events[eventType];
    if (!object(policy) || typeof policy.enabled !== "boolean" || !Array.isArray(policy.channels) || policy.channels.some((channel) => !["member_center", "email", "line", "admin"].includes(channel))) throw new MembershipRulesValidationError("通知事件設定不正確");
  }
  if (!object(rules.fulfillment) || rules.fulfillment.unknownEmailRequiresReview !== true) throw new MembershipRulesValidationError("履約安全設定不正確");
  integer(rules.fulfillment.arrivalReminderAfterDays, 0, 30, "到店提醒天數");
  integer(rules.fulfillment.gmailScanLookbackDays, 1, 90, "Gmail 掃描天數");
  if (!object(rules.ownerExceptions) || [rules.ownerExceptions.canUnlockDate, rules.ownerExceptions.canUnlockStore, rules.ownerExceptions.canUnlockQuantity].some((item) => typeof item !== "boolean")) throw new MembershipRulesValidationError("Owner 例外權限設定不正確");
  if (!object(rules.money) || rules.money.unit !== "TWD" || rules.money.integerOnly !== true) throw new MembershipRulesValidationError("金額單位設定不正確");
  validateOwnerChoice(rules.money.roundingMode, [OWNER_DECISION_REQUIRED, "round-half-up", "round-down", "round-up"], "金額尾數處理");
  if (!object(rules.dateTime) || rules.dateTime.timeZone !== "Asia/Taipei" || rules.dateTime.dateOnlyPolicy !== "taipei-calendar-date") throw new MembershipRulesValidationError("營運日期設定不正確");
  return rules;
}

function cloneRules(rules: MembershipBusinessRules) {
  return structuredClone(rules);
}

function emptyStore(now = new Date()): MembershipRulesStore {
  const timestamp = now.toISOString();
  return {
    schemaVersion: MEMBERSHIP_RULES_SCHEMA_VERSION,
    revision: 0,
    activeRulesVersion: 1,
    versions: [{ rulesVersion: 1, effectiveAt: timestamp, createdAt: timestamp, createdBy: "system", rules: cloneRules(DEFAULT_MEMBERSHIP_RULES) }],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function validateMembershipRulesStore(value: unknown): MembershipRulesStore {
  if (!object(value) || value.schemaVersion !== MEMBERSHIP_RULES_SCHEMA_VERSION || !Number.isSafeInteger(value.revision) || !Number.isSafeInteger(value.activeRulesVersion) || !Array.isArray(value.versions) || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") throw new MembershipRulesValidationError("會員商務設定檔格式不正確");
  let lastVersion = 0;
  for (const version of value.versions) {
    if (!object(version) || !Number.isSafeInteger(version.rulesVersion) || version.rulesVersion !== lastVersion + 1 || typeof version.effectiveAt !== "string" || !Number.isFinite(Date.parse(version.effectiveAt)) || typeof version.createdAt !== "string" || !["owner", "system"].includes(String(version.createdBy))) throw new MembershipRulesValidationError("會員商務設定版本不正確");
    version.rules = validateMembershipBusinessRules(version.rules);
    lastVersion = version.rulesVersion;
  }
  if (!value.versions.length || value.activeRulesVersion !== lastVersion) throw new MembershipRulesValidationError("目前使用的設定版本不正確");
  return value as MembershipRulesStore;
}

export async function readMembershipRulesStore(filePath = getMembershipRulesFile()) {
  try {
    return validateMembershipRulesStore(JSON.parse(await fs.readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw error;
  }
}

export async function getActiveMembershipRules(at = new Date(), filePath = getMembershipRulesFile()) {
  const store = await readMembershipRulesStore(filePath);
  const eligible = store.versions.filter((version) => Date.parse(version.effectiveAt) <= at.getTime());
  return eligible.at(-1) ?? store.versions[0];
}

export async function saveMembershipBusinessRules(input: { expectedRevision: number; rules: unknown; effectiveAt?: string; now?: Date }, filePath = getMembershipRulesFile()) {
  const validated = cloneRules(validateMembershipBusinessRules(input.rules));
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const effectiveAt = input.effectiveAt || timestamp;
  if (!Number.isFinite(Date.parse(effectiveAt))) throw new MembershipRulesValidationError("設定生效時間不正確");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  return withFileLock(filePath, async () => {
    const store = await readMembershipRulesStore(filePath);
    if (store.revision !== input.expectedRevision) throw new MembershipRulesVersionConflictError();
    const rulesVersion = store.activeRulesVersion + 1;
    store.versions.push({ rulesVersion, effectiveAt, createdAt: timestamp, createdBy: "owner", rules: validated });
    store.activeRulesVersion = rulesVersion;
    store.revision += 1;
    store.updatedAt = timestamp;
    validateMembershipRulesStore(store);
    await atomicWriteJson(filePath, store);
    return store;
  });
}
