import { promises as fs } from "fs";
import path from "path";

import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import {
  MEMBERSHIP_RULES_SCHEMA_VERSION,
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
  shipping: { subscriptionFreeShipping: true },
  subscription: {
    discountPercent: 95,
    intervalsDays: [30, 45, 60],
    modificationCutoffDays: 7,
    orderCreationLeadDays: 3,
    preparationLeadDays: 3,
    customRoastPreparationLeadDays: 7,
    delayQuickOptionsDays: [7, 14, 30],
    uncollectedTerminationCount: 1,
    allowOtherSubscriptionProducts: true,
    allowHalfToOnePound: true,
    allowOneToHalfPound: true,
    allowMixedOnePound: true,
    allowQuantityChange: true,
    pauseResumeAnchorPolicy: "member-selects-date",
  },
  gift: {
    startsAtFulfillment: 3,
    repeatEveryFulfillments: 1,
    halfPoundQuantity: 1,
    onePoundQuantity: 2,
    pool: [],
  },
  referral: {
    referrerEligibility: { mode: "completed-orders", minimumOrders: 1 },
    reward: { mode: "percentage", percent: 5, repeatedRewards: true },
  },
  credit: {
    expiryCalendarMonths: 3,
    expiryMonthEndPolicy: "clamp-to-last-day",
    redemption: { mode: "unlimited" },
    appliesToShipping: "yes",
  },
  campaign: { eligiblePricingMode: "best-price" },
  notification: { channels: ["member_center", "email", "line", "admin"] },
  money: { unit: "TWD", integerOnly: true, roundingMode: "round-half-up" },
  dateTime: { timeZone: "Asia/Taipei", dateOnlyPolicy: "taipei-calendar-date" },
};

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (!object(value)) throw new MembershipRulesValidationError("會員商務設定格式不完整");
  const rules = value as unknown as MembershipBusinessRules;
  if (!object(rules.membership) || !object(rules.membership.openingYearFreeShipping)) throw new MembershipRulesValidationError("會員免運設定不完整");
  const opening = rules.membership.openingYearFreeShipping;
  if (typeof opening.enabled !== "boolean" || !dateOnly(opening.startDate, true) || !dateOnly(opening.endDate, true) || !Array.isArray(opening.shippingMethods) || opening.shippingMethods.some((method) => typeof method !== "string" || !method)) throw new MembershipRulesValidationError("開站會員免運設定不正確");
  if ((opening.startDate || opening.endDate) && (!opening.startDate || !opening.endDate || opening.startDate > opening.endDate)) throw new MembershipRulesValidationError("會員免運的開始與結束日期不正確");

  if (!object(rules.shipping) || typeof rules.shipping.subscriptionFreeShipping !== "boolean") throw new MembershipRulesValidationError("定期購運費設定不正確");
  if (!object(rules.subscription)) throw new MembershipRulesValidationError("定期購設定不完整");
  percent(rules.subscription.discountPercent, "定期購價格");
  if (!Array.isArray(rules.subscription.intervalsDays) || rules.subscription.intervalsDays.length === 0 || rules.subscription.intervalsDays.length > 12) throw new MembershipRulesValidationError("配送週期至少需要一個選項");
  for (const days of rules.subscription.intervalsDays) integer(days, 1, 365, "配送週期");
  if (new Set(rules.subscription.intervalsDays).size !== rules.subscription.intervalsDays.length) throw new MembershipRulesValidationError("配送週期不可重複");
  integer(rules.subscription.modificationCutoffDays, 0, 60, "修改期限");
  integer(rules.subscription.orderCreationLeadDays, 0, 60, "建立訂單時間");
  if (rules.subscription.orderCreationLeadDays > rules.subscription.modificationCutoffDays) throw new MembershipRulesValidationError("建立訂單時間不可早於會員修改截止時間");
  integer(rules.subscription.uncollectedTerminationCount, 1, 10, "未取貨停止次數");
  integer(rules.subscription.preparationLeadDays, 0, 60, "一般備貨時間");
  integer(rules.subscription.customRoastPreparationLeadDays, rules.subscription.preparationLeadDays, 90, "專屬烘焙備貨時間");
  if (!Array.isArray(rules.subscription.delayQuickOptionsDays) || !rules.subscription.delayQuickOptionsDays.length) throw new MembershipRulesValidationError("延後快捷選項不完整");
  for (const days of rules.subscription.delayQuickOptionsDays) integer(days, 1, 180, "延後快捷選項");
  for (const key of ["allowOtherSubscriptionProducts", "allowHalfToOnePound", "allowOneToHalfPound", "allowMixedOnePound", "allowQuantityChange"] as const) if (typeof rules.subscription[key] !== "boolean") throw new MembershipRulesValidationError("商品更換設定不正確");
  validateOwnerChoice(rules.subscription.pauseResumeAnchorPolicy, [OWNER_DECISION_REQUIRED, "keep-original", "resume-date", "member-selects-date"], "恢復配送日期");

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
  validateOwnerChoice(rules.referral.referrerEligibility.mode, [OWNER_DECISION_REQUIRED, "none", "completed-orders", "lifetime-spend", "recent-valid-purchase"], "推薦人領取資格");
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
  if (rules.credit.expiryMonthEndPolicy !== "clamp-to-last-day") throw new MembershipRulesValidationError("抵用金月底到期規則不正確");
  validateOwnerChoice(rules.credit.redemption.mode, ["unlimited", "maximum-fixed", "minimum-payable", "maximum-percentage"], "每筆最高折抵");
  if (rules.credit.redemption.mode === "maximum-fixed") integer(rules.credit.redemption.amount, 0, 100_000_000, "最高折抵金額");
  if (rules.credit.redemption.mode === "minimum-payable") integer(rules.credit.redemption.amount, 0, 100_000_000, "最低應付金額");
  if (rules.credit.redemption.mode === "maximum-percentage") percent(rules.credit.redemption.percent, "最高折抵比例");
  validateOwnerChoice(rules.credit.appliesToShipping, [OWNER_DECISION_REQUIRED, "yes", "no"], "抵用金運費範圍");

  if (!object(rules.campaign)) throw new MembershipRulesValidationError("活動價格設定不完整");
  validateOwnerChoice(rules.campaign.eligiblePricingMode, [OWNER_DECISION_REQUIRED, "best-price", "campaign-replaces-subscription", "subscription-plus-benefit", "campaign-defined"], "活動定期購價格");
  if (!object(rules.notification) || !Array.isArray(rules.notification.channels) || rules.notification.channels.some((channel) => !["member_center", "email", "line", "admin"].includes(channel))) throw new MembershipRulesValidationError("通知方式設定不正確");
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
    validateMembershipBusinessRules(version.rules);
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
