import { createHash, randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { readOrder } from "./adminOrders";
import { getDateOnlyInTimeZone } from "./checkoutRules";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { getCanonicalMemberRecord, getIdentityRegistrySnapshot } from "./memberIdentity";
import {
  getActiveMembershipRules,
  readMembershipRulesStore,
  OWNER_DECISION_REQUIRED,
  validateMembershipBusinessRules,
  type MembershipBusinessRules,
  type RulesVersion,
} from "./membershipBusinessRules";
import {
  addTaipeiCalendarDays,
  addTaipeiCalendarMonths,
  applyPercentage,
  assertIntegerMoney,
  cycleDates,
  giftEligibleAt,
  giftQuantityForItems,
  maximumCreditRedemption,
  isReferralReleaseBusinessDateDue,
  referralReleaseEligibleBusinessDate,
  referralRewardForMerchandise,
  resolveSubscriptionDateAvailability,
  resolveSubscriptionInterval,
  validateSubscriptionItem,
  type SubscriptionItem,
} from "./membershipPolicies";
import { projectOrderFinancialBreakdown } from "./orderFinancialProjection";
import { getMembershipCommerceStateFile } from "./storagePaths";

export const MEMBERSHIP_COMMERCE_SCHEMA_VERSION = 1 as const;

export type SubscriptionStatus = "pending_activation" | "active" | "paused" | "terminated";
export type CycleStatus = "scheduled" | "modifiable" | "locked" | "order_created" | "shipped" | "ready_for_pickup" | "completed" | "skipped" | "blocked_stock" | "cancelled" | "uncollected";
export type CycleKind = "scheduled" | "manual_replenishment";

export type SubscriptionDefaultItem = SubscriptionItem & { unitPrice: number };

export type Subscription = {
  subscriptionId: string;
  memberId: string;
  status: SubscriptionStatus;
  startedFromOrderId: string;
  anchorDate: string;
  intervalDays: number;
  shippingMethod: string;
  storeSelection: { storeId: string; storeName: string } | null;
  defaultItems: SubscriptionDefaultItem[];
  rulesVersion: number;
  statusReason: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

export type PricingSnapshot = {
  merchandiseOriginal: number;
  subscriptionDiscountPercent: number;
  subscriptionPrice: number;
  campaignPrice: number | null;
  selectedPriceSource: "subscription" | "campaign";
  campaign: { campaignId: string; subscriptionEligible: boolean; adjustment: number; pricingMode: string } | null;
  creditReserved: number;
  shipping: number;
  finalAmount: number;
  currency: "TWD";
  roundingMode: string;
};

export type SubscriptionCycle = {
  cycleId: string;
  subscriptionId: string;
  sequence: number;
  kind: CycleKind;
  plannedDate: string;
  modificationDeadline: string;
  orderCreationDate: string;
  status: CycleStatus;
  itemsDraft: SubscriptionDefaultItem[];
  itemsSnapshot: SubscriptionDefaultItem[] | null;
  pricingSnapshot: PricingSnapshot | null;
  giftSnapshot: { eligible: boolean; quantity: number; selectedProductId: string | null; packingLockedAt: string | null } | null;
  shippingSnapshot: { method: string; storeSelection: { storeId: string; storeName: string } | null; freeShipping: boolean } | null;
  rulesSnapshot: RulesVersion | null;
  createdOrderId: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
  modificationCount?: number;
};

export type ReferralRelationship = {
  relationshipId: string;
  referrerMemberId: string;
  referredMemberId: string;
  referralCode: string;
  safeDisplayName: string;
  status: "registered" | "qualified" | "inactive";
  createdAt: string;
  updatedAt: string;
};

export type ReferralConversion = {
  conversionId: string;
  relationshipId: string;
  orderId: string;
  status: "pending" | "rewarded" | "ineligible" | "uncollected";
  rewardCreditEntryId: string | null;
  pendingRewardAmount: number;
  occurredAt: string;
};

export type ValidConsumptionEvent = {
  eventId: string;
  memberId: string;
  sourceOrderId: string;
  sourceReference: string;
  finalizedAt: string;
  createdAt: string;
  merchandiseSubtotal: number;
  appliedCreditAmount: number;
  shippingAmount: number;
  validConsumptionAmount: number;
  includeCreditDiscount: boolean;
  includeShipping: boolean;
  activeSubscriptionAtCompletion: boolean;
  rulesVersion: number;
  qualificationRulesSnapshot: MembershipBusinessRules["referral"]["payoutQualification"];
  idempotencyKey: string;
};

export type QualificationPathEvaluation = {
  windowDays: number;
  windowStartedAt: string;
  windowEndedAt: string;
  threshold: number;
  cumulativeAmount: number;
  eligibleEventIds: string[];
  activeSubscriptionRequired: boolean;
  activeSubscriptionSatisfied: boolean;
  passed: boolean;
};

export type QualificationRound = {
  roundId: string;
  memberId: string;
  triggeringValidConsumptionEventId: string;
  triggeringSourceOrderId: string;
  qualifiedAt: string;
  createdAt: string;
  rulesVersion: number;
  qualificationMode: MembershipBusinessRules["referral"]["payoutQualification"]["mode"];
  generalPath: QualificationPathEvaluation;
  subscriptionPath: QualificationPathEvaluation;
  finalQualified: true;
  selectedAccountingPaths: Array<"general" | "subscription">;
  excessConsumptionMode: MembershipBusinessRules["referral"]["payoutQualification"]["excessConsumptionMode"];
  consumptionAccounting: {
    availableAmountBefore: number;
    consumedAmount: number;
    remainingAmountAfter: number;
    allocations: Array<{ validConsumptionEventId: string; amount: number }>;
  };
  rewardCoverageRuleSnapshot: MembershipBusinessRules["referral"]["payoutQualification"]["rewardCoverage"];
  rewardSafetyRuleSnapshot?: { baseWaitingDays: number; returnProtectionDays: number };
  idempotencyKey: string;
};

export type ReferralRewardCoverage = {
  coverageId: string;
  memberId: string;
  qualificationRoundId: string;
  referralRewardId: string;
  qualificationAt: string;
  rewardGeneratedAt: string;
  coverageStartsAt: string;
  coverageEndsAt: string;
  lookbackDays: number;
  forwardDays: number;
  rulesVersion: number;
  inclusionReason: "reward-generated-within-snapshotted-coverage-window";
  createdAt: string;
  sourceReference: string;
  idempotencyKey: string;
};

export type ReferralRewardMaturation = {
  maturationId: string;
  memberId: string;
  referralRewardId: string;
  coverageId: string;
  qualificationRoundId: string;
  qualificationAt: string;
  baseWaitingDays: number;
  returnProtectionDays: number;
  maturesAt: string;
  maturedAt: string;
  rulesVersion: number;
  createdAt: string;
  sourceReference: string;
  idempotencyKey: string;
};

export type ReferralRewardQualificationAuthority = "legacy_order" | "qualification_coverage";

export type ReferralReward = {
  rewardId: string;
  sourceOrderNumber: string;
  sourceMemberId: string;
  beneficiaryMemberId: string;
  referralLevel: number;
  rewardType: "new_referral" | "subscription";
  calculationMode: "paid_amount" | "pv";
  paidAmountBasis: number;
  basePV: number;
  discountRatio: number;
  effectivePV: number;
  rewardRate: number;
  rewardPV: number;
  pvRewardMoneyValue: number;
  calculatedCreditAmount: number;
  projectedCreditAmount?: number;
  ruleVersion: number;
  ancestrySnapshot: string[];
  organizationCapPercentSnapshot?: number;
  organizationCapAmountSnapshot?: number;
  monthlyCapAmountSnapshot?: number;
  monthlyCapPeriodSnapshot?: string;
  monthlyCapUsageAtRelease?: number | null;
  monthlyCapLimitedAmount?: number | null;
  reversalPolicySnapshot?: MembershipBusinessRules["referral"]["reversalPolicy"];
  baseWaitingDaysSnapshot?: number;
  returnProtectionDaysSnapshot?: number;
  totalWaitingDaysSnapshot?: number;
  releasePolicyVersion?: "taipei-business-date-v1";
  successfulPickupBusinessDate?: string | null;
  releaseEligibleBusinessDate?: string | null;
  sourceOrderFinalState?: "completed" | "cancelled" | "uncollected" | "refunded" | "returned";
  cancellationReason?: string | null;
  qualificationWindowDays?: number;
  qualificationStartedAt?: string;
  qualificationExpiresAt?: string;
  qualificationStatus?: "awaiting_order" | "awaiting_completion" | "qualified" | "expired";
  qualificationOrderNumber?: string | null;
  qualificationOrderCreatedAt?: string | null;
  qualificationOrderFinalState?: "pending" | "completed" | "cancelled" | "uncollected" | "refunded" | "returned" | null;
  qualificationQualifiedAt?: string | null;
  qualificationAttempts?: Array<{
    orderNumber: string;
    orderCreatedAt: string;
    orderType: "normal" | "subscription";
    status: "pending" | "completed" | "failed";
    finalState: "pending" | "completed" | "cancelled" | "uncollected" | "refunded" | "returned";
    finalizedAt: string | null;
  }>;
  /** Missing on historical rewards and therefore normalized behaviorally as legacy_order. */
  qualificationAuthority?: ReferralRewardQualificationAuthority;
  createdAt: string;
  eligibleAt: string;
  scheduledReleaseAt: string;
  releasedAt: string | null;
  reversedAt?: string | null;
  status: "scheduled" | "released" | "cancelled" | "reversed";
  reversalCreditEntryId: string | null;
  rewardCreditEntryId: string | null;
  idempotencyKey: string;
};

export type CreditEntry = {
  creditEntryId: string;
  memberId: string;
  sourceType: "referral" | "manual" | "promotion" | "compensation";
  sourceReference: string;
  amount: number;
  remainingAmount: number;
  issuedAt: string;
  expiresAt: string;
  status: "available" | "reserved" | "consumed" | "expired";
  createdAt: string;
  metadata: Record<string, string | number | boolean>;
  /** Owner debit allocations are immutable references to the positive entries they reduce. */
  adjustmentAllocations?: Array<{ creditEntryId: string; amount: number }>;
};

export type CreditReservation = {
  reservationId: string;
  memberId: string;
  orderId: string;
  requestedAmount: number;
  amount: number;
  allocations: Array<{ creditEntryId: string; amount: number }>;
  status: "reserved" | "consumed" | "released";
  createdAt: string;
  updatedAt: string;
};

export type MemberCreditHistoryEntry = {
  creditEntryId: string;
  amount: number;
  remainingAmount: number;
  issuedAt: string;
  expiresAt: string;
  status: CreditEntry["status"];
  direction: "grant" | "deduct";
  sourceLabel: "推薦回饋" | "KD Coffee 贈送" | "會員抵用金" | "抵用金調整";
  orderRedemptions: Array<{
    orderNumber: string;
    amount: number;
    status: "reserved" | "consumed" | "released";
  }>;
};

export type SafeOrderCreditReservation = {
  orderNumber: string;
  amount: number;
  status: "reserved" | "consumed" | "released";
};

export type CommerceEvent = {
  eventId: string;
  type: string;
  memberId?: string;
  subscriptionId?: string;
  orderId?: string;
  occurredAt: string;
  safeData: Record<string, string | number | boolean>;
};

export type NotificationEvent = {
  notificationId: string;
  eventType: "modification_window" | "deadline_tomorrow" | "order_created" | "shipped" | "ready_for_pickup" | "uncollected_terminated" | "gift_eligible" | "stock_blocked" | "subscription_paused" | "subscription_resumed" | "subscription_terminated" | "cycle_skipped" | "referral_conversion" | "credit_issued" | "credit_expiring";
  memberId?: string;
  channels: Array<"member_center" | "email" | "line" | "admin">;
  status: "pending" | "processing" | "delivered" | "failed";
  deliveryPolicy?: { maxAttempts: number; emailFallback: boolean };
  attempts?: number;
  lastAttemptAt?: string;
  deliveredChannels?: Array<"member_center" | "email" | "line" | "admin">;
  lastError?: string;
  sourceEvent: string;
  createdAt: string;
  safeData: Record<string, string | number | boolean>;
};

export type AuditRecord = {
  auditId: string;
  actor: "member" | "admin" | "system";
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  before: Record<string, string | number | boolean>;
  after: Record<string, string | number | boolean>;
  reason: string;
  sourceEvent: string;
};

export type MembershipCommerceState = {
  schemaVersion: typeof MEMBERSHIP_COMMERCE_SCHEMA_VERSION;
  revision: number;
  createdAt: string;
  updatedAt: string;
  subscriptions: Record<string, Subscription>;
  cycles: Record<string, SubscriptionCycle>;
  referrals: Record<string, ReferralRelationship>;
  referralConversions: Record<string, ReferralConversion>;
  referralRewards: Record<string, ReferralReward>;
  validConsumptionEvents: Record<string, ValidConsumptionEvent>;
  qualificationRounds: Record<string, QualificationRound>;
  referralRewardCoverages: Record<string, ReferralRewardCoverage>;
  referralRewardMaturations: Record<string, ReferralRewardMaturation>;
  creditEntries: Record<string, CreditEntry>;
  creditReservations: Record<string, CreditReservation>;
  events: CommerceEvent[];
  notifications: NotificationEvent[];
  audit: AuditRecord[];
  idempotency: Record<string, { resultId: string; occurredAt: string }>;
};

export class MembershipCommerceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MembershipCommerceError";
  }
}

export class MembershipRevisionConflictError extends MembershipCommerceError {
  constructor() {
    super("資料已在其他視窗更新，請重新整理後再試一次。");
    this.name = "MembershipRevisionConflictError";
  }
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

function deterministicId(prefix: string, source: string) {
  return `${prefix}_${createHash("sha256").update(source).digest("hex").slice(0, 24)}`;
}

function nowIso(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new MembershipCommerceError("時間格式不正確");
  return now.toISOString();
}

function emptyState(now = new Date()): MembershipCommerceState {
  const timestamp = nowIso(now);
  return { schemaVersion: 1, revision: 0, createdAt: timestamp, updatedAt: timestamp, subscriptions: {}, cycles: {}, referrals: {}, referralConversions: {}, referralRewards: {}, validConsumptionEvents: {}, qualificationRounds: {}, referralRewardCoverages: {}, referralRewardMaturations: {}, creditEntries: {}, creditReservations: {}, events: [], notifications: [], audit: [], idempotency: {} };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateMembershipCommerceState(value: unknown): MembershipCommerceState {
  if (!isObject(value) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") throw new MembershipCommerceError("會員商務資料格式不正確");
  if (!isObject(value.referralRewards)) value.referralRewards = {};
  if (!isObject(value.validConsumptionEvents)) value.validConsumptionEvents = {};
  if (!isObject(value.qualificationRounds)) value.qualificationRounds = {};
  if (!isObject(value.referralRewardCoverages)) value.referralRewardCoverages = {};
  if (!isObject(value.referralRewardMaturations)) value.referralRewardMaturations = {};
  for (const field of ["subscriptions", "cycles", "referrals", "referralConversions", "referralRewards", "validConsumptionEvents", "qualificationRounds", "referralRewardCoverages", "referralRewardMaturations", "creditEntries", "creditReservations", "idempotency"] as const) if (!isObject(value[field])) throw new MembershipCommerceError("會員商務資料集合不完整");
  for (const field of ["events", "notifications", "audit"] as const) if (!Array.isArray(value[field])) throw new MembershipCommerceError("會員商務事件集合不完整");
  for (const reward of Object.values(value.referralRewards as Record<string, ReferralReward>)) {
    if (reward.qualificationAuthority !== undefined && reward.qualificationAuthority !== "legacy_order" && reward.qualificationAuthority !== "qualification_coverage") throw new MembershipCommerceError("推薦獎勵資格權限格式不正確");
  }
  for (const consumption of Object.values(value.validConsumptionEvents as Record<string, ValidConsumptionEvent>)) {
    if (!consumption || typeof consumption.eventId !== "string" || typeof consumption.memberId !== "string" || typeof consumption.sourceOrderId !== "string" || typeof consumption.finalizedAt !== "string" || !Number.isFinite(Date.parse(consumption.finalizedAt)) || typeof consumption.createdAt !== "string" || !Number.isSafeInteger(consumption.rulesVersion)) throw new MembershipCommerceError("有效消費事件格式不正確");
    for (const amount of [consumption.merchandiseSubtotal, consumption.appliedCreditAmount, consumption.shippingAmount, consumption.validConsumptionAmount]) assertIntegerMoney(amount, "有效消費事件金額");
    if (typeof consumption.includeCreditDiscount !== "boolean" || typeof consumption.includeShipping !== "boolean" || typeof consumption.activeSubscriptionAtCompletion !== "boolean" || !isObject(consumption.qualificationRulesSnapshot)) throw new MembershipCommerceError("有效消費事件快照不完整");
  }
  for (const round of Object.values(value.qualificationRounds as Record<string, QualificationRound>)) {
    if (!round || typeof round.roundId !== "string" || typeof round.memberId !== "string" || typeof round.triggeringValidConsumptionEventId !== "string" || round.finalQualified !== true || !Number.isSafeInteger(round.rulesVersion) || !isObject(round.generalPath) || !isObject(round.subscriptionPath) || !isObject(round.consumptionAccounting)) throw new MembershipCommerceError("推薦資格輪次格式不正確");
    if (round.rewardSafetyRuleSnapshot && (!Number.isSafeInteger(round.rewardSafetyRuleSnapshot.baseWaitingDays) || round.rewardSafetyRuleSnapshot.baseWaitingDays < 0 || !Number.isSafeInteger(round.rewardSafetyRuleSnapshot.returnProtectionDays) || round.rewardSafetyRuleSnapshot.returnProtectionDays < 0)) throw new MembershipCommerceError("推薦資格輪次安全等待快照不正確");
    if (!Array.isArray(round.consumptionAccounting.allocations) || !Number.isSafeInteger(round.consumptionAccounting.availableAmountBefore) || !Number.isSafeInteger(round.consumptionAccounting.consumedAmount) || !Number.isSafeInteger(round.consumptionAccounting.remainingAmountAfter)) throw new MembershipCommerceError("推薦資格輪次消費配置不正確");
    for (const allocation of round.consumptionAccounting.allocations) if (!allocation || typeof allocation.validConsumptionEventId !== "string" || !Number.isSafeInteger(allocation.amount) || allocation.amount < 0) throw new MembershipCommerceError("推薦資格輪次配置項目不正確");
  }
  const coveredRewardIds = new Set<string>();
  for (const coverage of Object.values(value.referralRewardCoverages as Record<string, ReferralRewardCoverage>)) {
    if (!coverage || typeof coverage.coverageId !== "string" || typeof coverage.memberId !== "string" || typeof coverage.qualificationRoundId !== "string" || typeof coverage.referralRewardId !== "string" || !Number.isFinite(Date.parse(coverage.qualificationAt)) || !Number.isFinite(Date.parse(coverage.rewardGeneratedAt)) || !Number.isFinite(Date.parse(coverage.coverageStartsAt)) || !Number.isFinite(Date.parse(coverage.coverageEndsAt)) || !Number.isSafeInteger(coverage.lookbackDays) || coverage.lookbackDays < 0 || !Number.isSafeInteger(coverage.forwardDays) || coverage.forwardDays < 0 || !Number.isSafeInteger(coverage.rulesVersion) || coverage.inclusionReason !== "reward-generated-within-snapshotted-coverage-window" || typeof coverage.createdAt !== "string" || typeof coverage.sourceReference !== "string" || typeof coverage.idempotencyKey !== "string") throw new MembershipCommerceError("推薦獎勵資格涵蓋紀錄格式不正確");
    if (coveredRewardIds.has(coverage.referralRewardId)) throw new MembershipCommerceError("同一推薦獎勵不可有重複資格涵蓋紀錄");
    coveredRewardIds.add(coverage.referralRewardId);
    const generatedAt = Date.parse(coverage.rewardGeneratedAt);
    if (generatedAt < Date.parse(coverage.coverageStartsAt) || generatedAt > Date.parse(coverage.coverageEndsAt)) throw new MembershipCommerceError("推薦獎勵不在資格涵蓋期間內");
  }
  const maturedRewardIds = new Set<string>();
  const maturedCoverageIds = new Set<string>();
  for (const maturation of Object.values(value.referralRewardMaturations as Record<string, ReferralRewardMaturation>)) {
    if (!maturation || typeof maturation.maturationId !== "string" || typeof maturation.memberId !== "string" || typeof maturation.referralRewardId !== "string" || typeof maturation.coverageId !== "string" || typeof maturation.qualificationRoundId !== "string" || !Number.isFinite(Date.parse(maturation.qualificationAt)) || !Number.isSafeInteger(maturation.baseWaitingDays) || maturation.baseWaitingDays < 0 || !Number.isSafeInteger(maturation.returnProtectionDays) || maturation.returnProtectionDays < 0 || !Number.isFinite(Date.parse(maturation.maturesAt)) || !Number.isFinite(Date.parse(maturation.maturedAt)) || !Number.isSafeInteger(maturation.rulesVersion) || typeof maturation.createdAt !== "string" || typeof maturation.sourceReference !== "string" || typeof maturation.idempotencyKey !== "string") throw new MembershipCommerceError("推薦獎勵成熟紀錄格式不正確");
    if (Date.parse(maturation.maturedAt) < Date.parse(maturation.maturesAt)) throw new MembershipCommerceError("推薦獎勵不可在安全等待完成前成熟");
    if (maturedRewardIds.has(maturation.referralRewardId) || maturedCoverageIds.has(maturation.coverageId)) throw new MembershipCommerceError("同一推薦獎勵不可有重複成熟紀錄");
    maturedRewardIds.add(maturation.referralRewardId);
    maturedCoverageIds.add(maturation.coverageId);
  }
  for (const entry of Object.values(value.creditEntries as Record<string, CreditEntry>)) {
    const isNegativeLedgerEntry = entry.sourceReference.startsWith("referral_reward_reversal:") || entry.sourceReference.startsWith("admin_credit_adjustment:deduct:");
    if (isNegativeLedgerEntry) {
      if (!Number.isSafeInteger(entry.amount) || entry.amount >= 0) throw new MembershipCommerceError("推薦獎勵沖回金額不正確");
    } else assertIntegerMoney(entry.amount, "抵用金");
    assertIntegerMoney(entry.remainingAmount, "抵用金餘額");
    if (!isNegativeLedgerEntry && entry.remainingAmount > entry.amount) throw new MembershipCommerceError("抵用金餘額超過發放金額");
    if (entry.sourceReference.startsWith("admin_credit_adjustment:deduct:")) {
      if (entry.remainingAmount !== 0 || entry.status !== "consumed" || !Array.isArray(entry.adjustmentAllocations)) throw new MembershipCommerceError("人工扣除抵用金紀錄不完整");
      const allocated = entry.adjustmentAllocations.reduce((sum, allocation) => {
        if (!allocation || typeof allocation.creditEntryId !== "string" || !Number.isSafeInteger(allocation.amount) || allocation.amount < 1) throw new MembershipCommerceError("人工扣除抵用金配置不正確");
        return sum + allocation.amount;
      }, 0);
      if (allocated !== Math.abs(entry.amount)) throw new MembershipCommerceError("人工扣除抵用金配置總額不正確");
    }
  }
  return value as MembershipCommerceState;
}

export async function readMembershipCommerceState(filePath = getMembershipCommerceStateFile()) {
  try {
    return validateMembershipCommerceState(JSON.parse(await fs.readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

async function transaction<T>(operation: (state: MembershipCommerceState, now: Date) => Promise<T> | T, options: { now?: Date; filePath?: string } = {}) {
  const filePath = options.filePath ?? getMembershipCommerceStateFile();
  const now = options.now ?? new Date();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  return withFileLock(filePath, async () => {
    const state = await readMembershipCommerceState(filePath);
    const result = await operation(state, now);
    state.revision += 1;
    state.updatedAt = nowIso(now);
    validateMembershipCommerceState(state);
    await atomicWriteJson(filePath, state);
    return result;
  });
}

function remember(state: MembershipCommerceState, key: string, resultId: string, now: Date) {
  state.idempotency[key] = { resultId, occurredAt: nowIso(now) };
}

function remembered(state: MembershipCommerceState, key: string) {
  return state.idempotency[key]?.resultId;
}

function audit(state: MembershipCommerceState, input: Omit<AuditRecord, "auditId" | "timestamp">, now: Date) {
  state.audit.push({ auditId: id("audit"), timestamp: nowIso(now), ...input });
}

function event(state: MembershipCommerceState, type: string, safeData: CommerceEvent["safeData"], now: Date, refs: Pick<CommerceEvent, "memberId" | "subscriptionId" | "orderId"> = {}) {
  const record: CommerceEvent = { eventId: id("event"), type, occurredAt: nowIso(now), safeData, ...refs };
  state.events.push(record);
  return record;
}

function notify(state: MembershipCommerceState, rules: MembershipBusinessRules, eventType: NotificationEvent["eventType"], sourceEvent: string, now: Date, input: { memberId?: string; safeData?: NotificationEvent["safeData"]; adminOnly?: boolean } = {}) {
  const policyMap: Partial<Record<NotificationEvent["eventType"], keyof MembershipBusinessRules["notification"]["events"]>> = {
    modification_window: "next_cycle_upcoming",
    deadline_tomorrow: "modification_cutoff_reminder",
    order_created: "subscription_order_created",
    shipped: "shipped",
    ready_for_pickup: "arrived_at_store",
    uncollected_terminated: "unclaimed_risk",
    gift_eligible: "gift_milestone",
    referral_conversion: "referral_reward",
    credit_issued: "credit_reward",
    credit_expiring: "credit_expiry",
  };
  const policyKey = policyMap[eventType];
  const policy = policyKey ? rules.notification.events[policyKey] : undefined;
  if (!input.adminOnly && policy && !policy.enabled) return null;
  const channels = input.adminOnly ? ["admin" as const] : [...(policy?.channels ?? rules.notification.channels)];
  if (!channels.includes("member_center") && input.memberId) channels.unshift("member_center");
  const notice: NotificationEvent = { notificationId: id("notice"), eventType, memberId: input.memberId, channels, status: "pending", deliveryPolicy: { maxAttempts: rules.notification.retryCount + 1, emailFallback: rules.notification.emailFallback }, sourceEvent, createdAt: nowIso(now), safeData: input.safeData ?? {} };
  state.notifications.push(notice);
  return notice;
}

async function assertCanonicalMember(memberId: string) {
  const member = await getCanonicalMemberRecord(memberId);
  if (!member || member.memberId !== memberId || member.status === "merged-tombstone") throw new MembershipCommerceError("定期購必須使用 I.0A 正式會員身份");
}

function cloneItems(items: SubscriptionDefaultItem[]) {
  return items.map((item) => ({ ...validateSubscriptionItem(item), unitPrice: assertIntegerMoney(item.unitPrice, "商品原價") }));
}

function assertMemberOwns(subscription: Subscription, memberId?: string) {
  if (memberId && subscription.memberId !== memberId) throw new MembershipCommerceError("無法存取其他會員的定期購");
}

function assertRevision(record: { revision: number }, expectedRevision?: number) {
  if (expectedRevision != null && record.revision !== expectedRevision) throw new MembershipRevisionConflictError();
}

function touch(record: { revision: number; updatedAt: string }, now: Date) {
  record.revision += 1;
  record.updatedAt = nowIso(now);
}

export async function createSubscription(input: { memberId: string; startedFromOrderId: string; anchorDate: string; intervalDays: number; shippingMethod: string; storeSelection?: Subscription["storeSelection"]; defaultItems: SubscriptionDefaultItem[]; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  await assertCanonicalMember(input.memberId);
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  if (!resolveSubscriptionInterval(input.intervalDays, version.rules).allowed) throw new MembershipCommerceError("此配送週期目前未開放");
  const items = cloneItems(input.defaultItems);
  const key = `subscription:create:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const existingId = remembered(state, key);
    if (existingId) return state.subscriptions[existingId];
    if (Object.values(state.subscriptions).some((subscription) => subscription.startedFromOrderId === input.startedFromOrderId)) throw new MembershipCommerceError("此首筆訂單已建立定期購");
    const subscriptionId = id("sub");
    const timestamp = nowIso(now);
    const subscription: Subscription = { subscriptionId, memberId: input.memberId, status: "pending_activation", startedFromOrderId: input.startedFromOrderId, anchorDate: input.anchorDate, intervalDays: input.intervalDays, shippingMethod: input.shippingMethod, storeSelection: input.storeSelection ?? null, defaultItems: items, rulesVersion: version.rulesVersion, statusReason: "等待首筆原價訂單成功取貨", createdAt: timestamp, updatedAt: timestamp, revision: 0 };
    state.subscriptions[subscriptionId] = subscription;
    remember(state, key, subscriptionId, now);
    audit(state, { actor: "member", action: "subscription-created", entityType: "subscription", entityId: subscriptionId, before: {}, after: { status: subscription.status }, reason: "首筆原價訂單建立定期購", sourceEvent: input.startedFromOrderId }, now);
    return subscription;
  }, { now: input.now, filePath: input.stateFilePath });
}

function giftProgress(state: MembershipCommerceState, subscriptionId: string) {
  let count = 0;
  for (const item of state.events) {
    if (item.subscriptionId !== subscriptionId) continue;
    if (item.type === "gift_progress_reset") count = 0;
    if (item.type === "qualifying_fulfillment") count += 1;
  }
  return count;
}

export async function activateSubscriptionFromPickup(input: { subscriptionId: string; orderId: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `subscription:activate:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const subscription = state.subscriptions[input.subscriptionId];
    if (!subscription) throw new MembershipCommerceError("找不到定期購");
    if (remembered(state, key)) return subscription;
    if (subscription.status !== "pending_activation") throw new MembershipCommerceError("只有等待首筆取貨的定期購可以啟動");
    subscription.status = "active";
    subscription.statusReason = "首筆原價訂單成功取貨";
    touch(subscription, now);
    const fulfillment = event(state, "qualifying_fulfillment", { fulfillmentNumber: 1, originalPriceOrder: true }, now, { memberId: subscription.memberId, subscriptionId: subscription.subscriptionId, orderId: input.orderId });
    remember(state, key, subscription.subscriptionId, now);
    audit(state, { actor: "system", action: "subscription-activated", entityType: "subscription", entityId: subscription.subscriptionId, before: { status: "pending_activation" }, after: { status: "active", giftProgress: 1 }, reason: "首筆原價訂單成功取貨", sourceEvent: fulfillment.eventId }, now);
    if (giftEligibleAt(1, version.rules)) notify(state, version.rules, "gift_eligible", fulfillment.eventId, now, { memberId: subscription.memberId, safeData: { fulfillmentNumber: 1 } });
    return subscription;
  }, { now: input.now, filePath: input.stateFilePath });
}

/** One membership entry point for canonical order outcomes. */
export async function handleCanonicalOrderOutcome(input: { orderId: string; outcome: "completed" | "uncollected"; memberId?: string; merchandiseAmount: number; basePV?: number; effectivePV?: number; discountRatio?: number; eligibleItemCount?: number; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const snapshot = await readMembershipCommerceState(input.stateFilePath);
  const subscription = Object.values(snapshot.subscriptions).find((item) => item.startedFromOrderId === input.orderId);
  const cycle = Object.values(snapshot.cycles).find((item) => item.createdOrderId === input.orderId);
  const relationship = input.memberId
    ? Object.values(snapshot.referrals).find((item) => item.referredMemberId === input.memberId && item.status !== "inactive")
    : undefined;

  if (input.outcome === "completed") {
    if (subscription?.status === "pending_activation") {
      await activateSubscriptionFromPickup({ subscriptionId: subscription.subscriptionId, orderId: input.orderId, idempotencyKey: `${input.idempotencyKey}:activate`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
    }
    if (cycle) {
      await recordCycleFulfillment({ cycleId: cycle.cycleId, orderId: input.orderId, idempotencyKey: `${input.idempotencyKey}:cycle`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
    }
    if (input.memberId) {
      await recordValidConsumptionFromCompletedOrder({ memberId: input.memberId, orderId: input.orderId, idempotencyKey: `${input.idempotencyKey}:valid-consumption`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
    }
  } else if (subscription || cycle) {
    const linkedSubscription = subscription ?? snapshot.subscriptions[cycle!.subscriptionId];
    await markUncollected({ subscriptionId: linkedSubscription.subscriptionId, cycleId: cycle?.cycleId, orderId: input.orderId, idempotencyKey: `${input.idempotencyKey}:uncollected`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
  }

  if (input.memberId) {
    await handleReferralQualificationOrderOutcome({ memberId: input.memberId, orderId: input.orderId, outcome: input.outcome, idempotencyKey: `${input.idempotencyKey}:referral-qualification`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
  }

  if (relationship && input.memberId) {
    if (input.outcome === "completed") {
      await createReferralRewardsFromFulfillment({ sourceMemberId: input.memberId, orderId: input.orderId, rewardType: cycle ? "subscription" : "new_referral", paidAmountBasis: input.merchandiseAmount, basePV: input.basePV, effectivePV: input.effectivePV, discountRatio: input.discountRatio, idempotencyKey: `${input.idempotencyKey}:referral-v2`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
    } else {
      await cancelOrReverseReferralRewards({ orderId: input.orderId, outcome: input.outcome, idempotencyKey: `${input.idempotencyKey}:referral-reversal`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
    }
  }

  if (input.outcome === "completed") await runReferralRewardReleaseScheduler({ now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });

  await settleCreditReservationForOrder({ orderId: input.orderId, action: input.outcome === "completed" ? "consume" : "release", idempotencyKey: `${input.idempotencyKey}:credit`, reason: input.outcome === "completed" ? "訂單成功取貨" : "訂單未取貨，釋放抵用金", now: input.now, stateFilePath: input.stateFilePath });

  return { subscriptionHandled: Boolean(subscription || cycle), referralEvaluated: Boolean(relationship) };
}

export async function generateSubscriptionCycle(input: { subscriptionId: string; sequence: number; plannedDate: string; kind?: CycleKind; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:generate:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const existingId = remembered(state, key);
    if (existingId) return state.cycles[existingId];
    const subscription = state.subscriptions[input.subscriptionId];
    if (!subscription) throw new MembershipCommerceError("找不到定期購");
    if (subscription.status !== "active") throw new MembershipCommerceError("目前定期購不會建立新一期");
    const kind = input.kind ?? "scheduled";
    const duplicate = Object.values(state.cycles).find((cycle) => cycle.subscriptionId === input.subscriptionId && cycle.sequence === input.sequence && cycle.kind === kind);
    if (duplicate) { remember(state, key, duplicate.cycleId, now); return duplicate; }
    const dates = cycleDates(input.plannedDate, version.rules.subscription.modificationCutoffDays, version.rules.subscription.orderCreationLeadDays);
    const cycleId = id("cycle");
    const timestamp = nowIso(now);
    const cycle: SubscriptionCycle = { cycleId, subscriptionId: subscription.subscriptionId, sequence: input.sequence, kind, ...dates, status: "modifiable", itemsDraft: cloneItems(subscription.defaultItems), itemsSnapshot: null, pricingSnapshot: null, giftSnapshot: null, shippingSnapshot: null, rulesSnapshot: null, createdOrderId: null, createdAt: timestamp, updatedAt: timestamp, revision: 0, modificationCount: 0 };
    state.cycles[cycleId] = cycle;
    remember(state, key, cycleId, now);
    audit(state, { actor: "system", action: "cycle-generated", entityType: "cycle", entityId: cycleId, before: {}, after: { status: cycle.status, sequence: cycle.sequence }, reason: kind === "scheduled" ? "依配送週期建立" : "會員立即補貨", sourceEvent: input.idempotencyKey }, now);
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function modifyCycleDate(input: { cycleId: string; plannedDate: string; recalculateAnchor: boolean; idempotencyKey: string; memberId?: string; expectedRevision?: number; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:date:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return cycle;
    if (!["scheduled", "modifiable"].includes(cycle.status)) throw new MembershipCommerceError("本期已截止修改");
    const subscription = state.subscriptions[cycle.subscriptionId];
    assertMemberOwns(subscription, input.memberId);
    assertRevision(cycle, input.expectedRevision);
    const today = nowIso(now).slice(0, 10);
    const modificationCount = cycle.modificationCount ?? 0;
    const maximum = version.rules.subscription.maxModificationsPerCycle;
    if (input.memberId) {
      if (today > cycle.modificationDeadline) throw new MembershipCommerceError("本期已超過修改截止日");
      if (maximum !== null && modificationCount >= maximum) throw new MembershipCommerceError(`本期最多可修改 ${maximum} 次`);
      const availability = resolveSubscriptionDateAvailability({ requestedDate: input.plannedDate, today, customRoast: false, rules: version.rules });
      if (!availability.allowed) throw new MembershipCommerceError(`最早可選擇 ${availability.earliestDate} 配送`);
    }
    const before = cycle.plannedDate;
    Object.assign(cycle, cycleDates(input.plannedDate, version.rules.subscription.modificationCutoffDays, version.rules.subscription.orderCreationLeadDays));
    cycle.modificationCount = modificationCount + 1;
    if (input.recalculateAnchor) {
      subscription.anchorDate = input.plannedDate;
      for (const future of Object.values(state.cycles)) {
        if (future.cycleId === cycle.cycleId || future.subscriptionId !== subscription.subscriptionId || future.sequence <= cycle.sequence || !["scheduled", "modifiable"].includes(future.status)) continue;
        const futureDate = addTaipeiCalendarDays(input.plannedDate, subscription.intervalDays * (future.sequence - cycle.sequence));
        Object.assign(future, cycleDates(futureDate, version.rules.subscription.modificationCutoffDays, version.rules.subscription.orderCreationLeadDays));
        touch(future, now);
      }
    }
    touch(cycle, now);
    if (input.recalculateAnchor) touch(subscription, now);
    remember(state, key, cycle.cycleId, now);
    audit(state, { actor: "member", action: "cycle-date-changed", entityType: "cycle", entityId: cycle.cycleId, before: { plannedDate: before }, after: { plannedDate: cycle.plannedDate, anchorChanged: input.recalculateAnchor, modificationCount: cycle.modificationCount }, reason: input.recalculateAnchor ? "從新日期重算後續週期" : "只修改本次", sourceEvent: input.idempotencyKey }, now);
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function updateCycleItems(input: { cycleId: string; items: SubscriptionDefaultItem[]; idempotencyKey: string; memberId?: string; expectedRevision?: number; now?: Date; stateFilePath?: string }) {
  const items = cloneItems(input.items);
  const key = `cycle:items:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return cycle;
    if (!["scheduled", "modifiable"].includes(cycle.status)) throw new MembershipCommerceError("本期已截止修改");
    assertMemberOwns(state.subscriptions[cycle.subscriptionId], input.memberId);
    assertRevision(cycle, input.expectedRevision);
    cycle.itemsDraft = items;
    touch(cycle, now);
    remember(state, key, cycle.cycleId, now);
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function lockSubscriptionCycle(input: { cycleId: string; idempotencyKey: string; shipping: number; campaign?: PricingSnapshot["campaign"]; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:lock:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return cycle;
    if (!["scheduled", "modifiable"].includes(cycle.status)) throw new MembershipCommerceError("本期無法鎖定");
    const subscription = state.subscriptions[cycle.subscriptionId];
    const items = cloneItems(cycle.itemsDraft);
    const original = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const subscriptionPrice = applyPercentage(original, version.rules.subscription.discountPercent, version.rules.money.roundingMode);
    const campaign = input.campaign ?? null;
    if (campaign?.subscriptionEligible && version.rules.campaign.eligiblePricingMode === OWNER_DECISION_REQUIRED) throw new MembershipCommerceError("活動適用定期購時的價格方式尚待 Owner 決定");
    const campaignAdjustment = campaign?.subscriptionEligible ? assertIntegerMoney(campaign.adjustment, "活動調整") : 0;
    const campaignPrice = campaign?.subscriptionEligible ? Math.max(0, original - campaignAdjustment) : null;
    const useCampaign = campaignPrice != null && (version.rules.campaign.eligiblePricingMode === "campaign-replaces-subscription" || version.rules.campaign.eligiblePricingMode === "campaign-defined" || (version.rules.campaign.eligiblePricingMode === "best-price" && campaignPrice < subscriptionPrice));
    const merchandisePrice = useCampaign ? campaignPrice : subscriptionPrice;
    const shipping = version.rules.shipping.subscriptionFreeShipping ? 0 : assertIntegerMoney(input.shipping, "運費");
    const progress = giftProgress(state, subscription.subscriptionId);
    const fulfillmentNumber = progress + 1;
    const giftEligible = giftEligibleAt(fulfillmentNumber, version.rules);
    cycle.status = "locked";
    cycle.itemsSnapshot = items;
    cycle.rulesSnapshot = structuredClone(version);
    cycle.pricingSnapshot = { merchandiseOriginal: original, subscriptionDiscountPercent: version.rules.subscription.discountPercent, subscriptionPrice, campaignPrice, selectedPriceSource: useCampaign ? "campaign" : "subscription", campaign, creditReserved: 0, shipping, finalAmount: Math.max(0, merchandisePrice + shipping), currency: "TWD", roundingMode: version.rules.money.roundingMode };
    cycle.giftSnapshot = { eligible: giftEligible, quantity: giftEligible ? giftQuantityForItems(items, version.rules) : 0, selectedProductId: null, packingLockedAt: null };
    cycle.shippingSnapshot = { method: subscription.shippingMethod, storeSelection: structuredClone(subscription.storeSelection), freeShipping: shipping === 0 };
    touch(cycle, now);
    remember(state, key, cycle.cycleId, now);
    audit(state, { actor: "system", action: "cycle-locked", entityType: "cycle", entityId: cycle.cycleId, before: { status: "modifiable" }, after: { status: "locked", rulesVersion: version.rulesVersion, finalAmount: cycle.pricingSnapshot.finalAmount }, reason: "會員修改期限截止", sourceEvent: input.idempotencyKey }, now);
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function createOrderFromCycle(input: { cycleId: string; orderId: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:order:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return cycle;
    if (cycle.status !== "locked" || !cycle.pricingSnapshot) throw new MembershipCommerceError("本期尚未完成鎖定");
    if (Object.values(state.cycles).some((other) => other.createdOrderId === input.orderId)) throw new MembershipCommerceError("訂單已連結其他配送期次");
    cycle.status = "order_created";
    cycle.createdOrderId = input.orderId;
    touch(cycle, now);
    remember(state, key, cycle.cycleId, now);
    const source = event(state, "order_created", { cycleSequence: cycle.sequence }, now, { subscriptionId: cycle.subscriptionId, orderId: input.orderId });
    notify(state, version.rules, "order_created", source.eventId, now, { memberId: state.subscriptions[cycle.subscriptionId].memberId });
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

const TRANSITIONS: Record<CycleStatus, CycleStatus[]> = {
  scheduled: ["modifiable", "skipped", "cancelled", "blocked_stock"],
  modifiable: ["locked", "skipped", "cancelled", "blocked_stock"],
  locked: ["order_created", "blocked_stock", "cancelled"],
  order_created: ["shipped", "cancelled", "uncollected"],
  shipped: ["ready_for_pickup", "uncollected"],
  ready_for_pickup: ["completed", "uncollected"],
  blocked_stock: ["modifiable", "skipped", "cancelled"],
  completed: [], skipped: [], cancelled: [], uncollected: [],
};

export async function transitionCycle(input: { cycleId: string; to: CycleStatus; reason: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:transition:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return cycle;
    if (!TRANSITIONS[cycle.status].includes(input.to)) throw new MembershipCommerceError(`配送狀態不可由 ${cycle.status} 變更為 ${input.to}`);
    const before = cycle.status;
    cycle.status = input.to;
    touch(cycle, now);
    remember(state, key, cycle.cycleId, now);
    const source = event(state, `cycle_${input.to}`, { from: before, reason: input.reason }, now, { subscriptionId: cycle.subscriptionId, orderId: cycle.createdOrderId ?? undefined });
    const memberId = state.subscriptions[cycle.subscriptionId].memberId;
    if (input.to === "blocked_stock") notify(state, version.rules, "stock_blocked", source.eventId, now, { memberId });
    if (input.to === "shipped") notify(state, version.rules, "shipped", source.eventId, now, { memberId });
    if (input.to === "ready_for_pickup") notify(state, version.rules, "ready_for_pickup", source.eventId, now, { memberId });
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function handleCycleProductAvailability(input: { cycleId: string; availability: "out-of-stock" | "discontinued"; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const target: CycleStatus = input.availability === "out-of-stock" ? "blocked_stock" : "cancelled";
  return transitionCycle({ ...input, to: target, reason: input.availability === "out-of-stock" ? "定期購作品暫時缺貨，等待會員選擇" : "定期購作品已停售，停止此作品續訂" });
}

export async function lockCycleGiftSelection(input: { cycleId: string; availableProductIds: string[]; idempotencyKey: string; now?: Date; stateFilePath?: string }) {
  const key = `cycle:gift:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle?.giftSnapshot || !cycle.rulesSnapshot) throw new MembershipCommerceError("本期尚未建立贈品快照");
    if (remembered(state, key)) return cycle.giftSnapshot;
    if (!["locked", "order_created"].includes(cycle.status)) throw new MembershipCommerceError("本期贈品已不可變更");
    const available = new Set(input.availableProductIds);
    const selected = cycle.rulesSnapshot.rules.gift.pool.filter((item) => item.enabled && available.has(item.productId)).sort((a, b) => a.priority - b.priority)[0];
    cycle.giftSnapshot.selectedProductId = cycle.giftSnapshot.eligible ? selected?.productId ?? null : null;
    cycle.giftSnapshot.packingLockedAt = nowIso(now);
    cycle.updatedAt = nowIso(now);
    remember(state, key, cycle.cycleId, now);
    audit(state, { actor: "system", action: "gift-packing-locked", entityType: "cycle", entityId: cycle.cycleId, before: {}, after: { eligible: cycle.giftSnapshot.eligible, selected: cycle.giftSnapshot.selectedProductId ?? "none", mainOrderBlocked: false }, reason: selected ? "依贈品候選順序選擇" : "無可用贈品，主商品照常出貨", sourceEvent: input.idempotencyKey }, now);
    return cycle.giftSnapshot;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function skipCycle(input: { cycleId: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  return transitionCycle({ ...input, to: "skipped", reason: "會員跳過本次" });
}

export async function memberSkipCycle(input: { memberId: string; cycleId: string; expectedRevision: number; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:member-skip:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return cycle;
    assertMemberOwns(state.subscriptions[cycle.subscriptionId], input.memberId);
    assertRevision(cycle, input.expectedRevision);
    if (!["scheduled", "modifiable"].includes(cycle.status)) throw new MembershipCommerceError("本期已截止修改");
    const before = cycle.status;
    cycle.status = "skipped";
    touch(cycle, now);
    remember(state, key, cycle.cycleId, now);
    const source = event(state, "cycle_skipped", { sequence: cycle.sequence }, now, { memberId: input.memberId, subscriptionId: cycle.subscriptionId });
    notify(state, version.rules, "cycle_skipped", source.eventId, now, { memberId: input.memberId });
    audit(state, { actor: "member", action: "cycle-skipped", entityType: "cycle", entityId: cycle.cycleId, before: { status: before }, after: { status: "skipped" }, reason: "會員跳過本次", sourceEvent: source.eventId }, now);
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function updateSubscriptionPreferences(input: { memberId: string; subscriptionId: string; expectedRevision: number; idempotencyKey: string; shippingMethod?: string; storeSelection?: Subscription["storeSelection"]; defaultItems?: SubscriptionDefaultItem[]; now?: Date; stateFilePath?: string }) {
  const items = input.defaultItems ? cloneItems(input.defaultItems) : null;
  const key = `subscription:preferences:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const subscription = state.subscriptions[input.subscriptionId];
    if (!subscription) throw new MembershipCommerceError("找不到定期購");
    if (remembered(state, key)) return subscription;
    assertMemberOwns(subscription, input.memberId);
    assertRevision(subscription, input.expectedRevision);
    if (!["active", "paused"].includes(subscription.status)) throw new MembershipCommerceError("目前無法修改定期購內容");
    const beforeStore = subscription.storeSelection?.storeId ?? "none";
    if (input.shippingMethod) subscription.shippingMethod = input.shippingMethod;
    if (input.storeSelection !== undefined) subscription.storeSelection = structuredClone(input.storeSelection);
    if (items) subscription.defaultItems = items;
    touch(subscription, now);
    remember(state, key, subscription.subscriptionId, now);
    const source = event(state, "subscription_preferences_changed", { storeChanged: beforeStore !== (subscription.storeSelection?.storeId ?? "none"), itemsChanged: Boolean(items) }, now, { memberId: input.memberId, subscriptionId: subscription.subscriptionId });
    audit(state, { actor: "member", action: "subscription-preferences-changed", entityType: "subscription", entityId: subscription.subscriptionId, before: { storeId: beforeStore }, after: { storeId: subscription.storeSelection?.storeId ?? "none" }, reason: "會員修改後續配送設定", sourceEvent: source.eventId }, now);
    return subscription;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function setSubscriptionStatus(input: { subscriptionId: string; status: "paused" | "active" | "terminated"; reason: string; idempotencyKey: string; memberId?: string; expectedRevision?: number; resumeDate?: string; intervalDays?: number; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `subscription:status:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const subscription = state.subscriptions[input.subscriptionId];
    if (!subscription) throw new MembershipCommerceError("找不到定期購");
    if (remembered(state, key)) return subscription;
    assertMemberOwns(subscription, input.memberId);
    assertRevision(subscription, input.expectedRevision);
    const before = subscription.status;
    const allowed = (before === "active" && ["paused", "terminated"].includes(input.status)) || (before === "paused" && ["active", "terminated"].includes(input.status));
    if (!allowed) throw new MembershipCommerceError("定期購狀態無法進行這項變更");
    if (before === "paused" && input.status === "active") {
      if (version.rules.subscription.pauseResumeAnchorPolicy === OWNER_DECISION_REQUIRED) throw new MembershipCommerceError("恢復配送後的基準日期尚待 Owner 決定");
      if (version.rules.subscription.pauseResumeAnchorPolicy === "member-selects-date") {
        if (!input.resumeDate || !input.intervalDays || !resolveSubscriptionInterval(input.intervalDays, version.rules).allowed) throw new MembershipCommerceError("請選擇恢復配送日期與週期");
        const earliest = addTaipeiCalendarDays(nowIso(now).slice(0, 10), version.rules.subscription.preparationLeadDays);
        if (input.resumeDate < earliest) throw new MembershipCommerceError(`最早可從 ${earliest} 恢復配送`);
        subscription.anchorDate = input.resumeDate;
        subscription.intervalDays = input.intervalDays;
      }
    }
    subscription.status = input.status;
    subscription.statusReason = input.reason;
    touch(subscription, now);
    remember(state, key, subscription.subscriptionId, now);
    const source = event(state, `subscription_${input.status}`, { reason: input.reason }, now, { memberId: subscription.memberId, subscriptionId: subscription.subscriptionId });
    const notificationType = input.status === "paused" ? "subscription_paused" : input.status === "active" ? "subscription_resumed" : "subscription_terminated";
    notify(state, version.rules, notificationType, source.eventId, now, { memberId: subscription.memberId });
    audit(state, { actor: "member", action: `subscription-${input.status}`, entityType: "subscription", entityId: subscription.subscriptionId, before: { status: before }, after: { status: input.status }, reason: input.reason, sourceEvent: source.eventId }, now);
    return subscription;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function markUncollected(input: { subscriptionId: string; cycleId?: string; orderId: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `subscription:uncollected:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const subscription = state.subscriptions[input.subscriptionId];
    if (!subscription) throw new MembershipCommerceError("找不到定期購");
    if (remembered(state, key)) return subscription;
    const beforeProgress = giftProgress(state, subscription.subscriptionId);
    subscription.status = "terminated";
    subscription.statusReason = "首次未取貨，停止定期配送";
    subscription.updatedAt = nowIso(now);
    if (input.cycleId && state.cycles[input.cycleId] && !["completed", "cancelled", "skipped"].includes(state.cycles[input.cycleId].status)) state.cycles[input.cycleId].status = "uncollected";
    for (const cycle of Object.values(state.cycles)) if (cycle.subscriptionId === subscription.subscriptionId && ["scheduled", "modifiable", "blocked_stock"].includes(cycle.status)) cycle.status = "cancelled";
    const uncollected = event(state, "uncollected_order", { orderId: input.orderId }, now, { memberId: subscription.memberId, subscriptionId: subscription.subscriptionId, orderId: input.orderId });
    event(state, "gift_progress_reset", { previousProgress: beforeProgress, reason: "uncollected_order" }, now, { memberId: subscription.memberId, subscriptionId: subscription.subscriptionId, orderId: input.orderId });
    remember(state, key, subscription.subscriptionId, now);
    notify(state, version.rules, "uncollected_terminated", uncollected.eventId, now, { memberId: subscription.memberId });
    notify(state, version.rules, "uncollected_terminated", uncollected.eventId, now, { adminOnly: true, safeData: { subscriptionId: subscription.subscriptionId } });
    audit(state, { actor: "system", action: "uncollected-terminated", entityType: "subscription", entityId: subscription.subscriptionId, before: { giftProgress: beforeProgress }, after: { status: "terminated", giftProgress: 0 }, reason: "首次未取貨", sourceEvent: uncollected.eventId }, now);
    return subscription;
  }, { now: input.now, filePath: input.stateFilePath });
}

export type ReferralMemberIdentityAdapter = { assertMember: (memberId: string) => Promise<void> };

const canonicalReferralMemberIdentityAdapter: ReferralMemberIdentityAdapter = { assertMember: assertCanonicalMember };

export async function assignReferralRelationship(input: { referrerMemberId: string; referredMemberId: string; safeDisplayName?: string; referralCode?: string; idempotencyKey: string; now?: Date; stateFilePath?: string }, identityAdapter: ReferralMemberIdentityAdapter = canonicalReferralMemberIdentityAdapter) {
  if (input.referrerMemberId === input.referredMemberId) throw new MembershipCommerceError("不可推薦自己");
  await Promise.all([identityAdapter.assertMember(input.referrerMemberId), identityAdapter.assertMember(input.referredMemberId)]);
  const key = `referral:assign:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const existingId = remembered(state, key);
    if (existingId) return state.referrals[existingId];
    const existing = Object.values(state.referrals).find((relationship) => relationship.referredMemberId === input.referredMemberId && relationship.status !== "inactive");
    if (existing) {
      if (existing.referrerMemberId !== input.referrerMemberId) throw new MembershipCommerceError("此會員已有推薦關係");
      remember(state, key, existing.relationshipId, now);
      return existing;
    }
    const visited = new Set<string>([input.referredMemberId]);
    let ancestor: string | undefined = input.referrerMemberId;
    for (let depth = 0; ancestor && depth < 100; depth += 1) {
      if (visited.has(ancestor)) throw new MembershipCommerceError("推薦關係不可形成循環");
      visited.add(ancestor);
      ancestor = Object.values(state.referrals).find((item) => item.referredMemberId === ancestor && item.status !== "inactive")?.referrerMemberId;
    }
    if (ancestor) throw new MembershipCommerceError("推薦關係深度異常，無法建立");
    const relationshipId = id("refrel");
    const timestamp = nowIso(now);
    const relationship: ReferralRelationship = { relationshipId, referrerMemberId: input.referrerMemberId, referredMemberId: input.referredMemberId, referralCode: input.referralCode || deterministicId("KD", relationshipId).toUpperCase(), safeDisplayName: String(input.safeDisplayName || "").slice(0, 40), status: "registered", createdAt: timestamp, updatedAt: timestamp };
    state.referrals[relationshipId] = relationship;
    remember(state, key, relationshipId, now);
    audit(state, { actor: "system", action: "referral-assigned", entityType: "referral", entityId: relationshipId, before: {}, after: { status: "registered" }, reason: "推薦碼完成歸屬", sourceEvent: input.idempotencyKey }, now);
    return relationship;
  }, { now: input.now, filePath: input.stateFilePath });
}

export function referralCodeForMember(memberId: string) {
  return `KD${createHash("sha256").update(`kd-referral:${memberId}`).digest("hex").slice(0, 10)}`.toUpperCase();
}

export async function assignReferralByCode(input: { referralCode: string; referredMemberId: string; safeDisplayName?: string; idempotencyKey: string; now?: Date; stateFilePath?: string }) {
  const registry = await getIdentityRegistrySnapshot();
  const normalized = input.referralCode.trim().toUpperCase();
  const candidates = new Set(Object.keys(registry.members));
  const referrerMemberId = [...candidates].find((memberId) => referralCodeForMember(memberId) === normalized);
  if (!referrerMemberId) throw new MembershipCommerceError("推薦碼不存在或尚未啟用");
  return assignReferralRelationship({ ...input, referrerMemberId, referralCode: normalized });
}

function rewardRound(value: number, mode: MembershipBusinessRules["money"]["roundingMode"]) {
  if (!Number.isFinite(value) || value < 0) throw new MembershipCommerceError("推薦獎勵計算結果不正確");
  if (mode === OWNER_DECISION_REQUIRED) throw new MembershipCommerceError("金額尾數處理方式尚待 Owner 決定");
  return mode === "round-down" ? Math.floor(value) : mode === "round-up" ? Math.ceil(value) : Math.floor(value + 0.5);
}

function ancestryFor(state: MembershipCommerceState, memberId: string, maximum: number) {
  const result: string[] = [];
  const visited = new Set([memberId]);
  let current = memberId;
  for (let level = 0; level < Math.min(maximum, 10); level += 1) {
    const parent = Object.values(state.referrals).find((item) => item.referredMemberId === current && item.status !== "inactive")?.referrerMemberId;
    if (!parent) break;
    if (visited.has(parent)) throw new MembershipCommerceError("推薦資料存在循環，已停止獎勵計算");
    visited.add(parent); result.push(parent); current = parent;
  }
  return result;
}

function hasActiveSubscription(state: MembershipCommerceState, memberId: string) {
  return Object.values(state.subscriptions).some((item) => item.memberId === memberId && item.status === "active");
}

const QUALIFICATION_DAY_MS = 86_400_000;

function remainingConsumptionByEvent(state: MembershipCommerceState) {
  const consumed = new Map<string, number>();
  for (const round of Object.values(state.qualificationRounds)) {
    for (const allocation of round.consumptionAccounting.allocations) consumed.set(allocation.validConsumptionEventId, (consumed.get(allocation.validConsumptionEventId) ?? 0) + allocation.amount);
  }
  const remaining = new Map<string, number>();
  for (const consumption of Object.values(state.validConsumptionEvents)) remaining.set(consumption.eventId, Math.max(0, consumption.validConsumptionAmount - (consumed.get(consumption.eventId) ?? 0)));
  return remaining;
}

function evaluateQualificationPath(input: { state: MembershipCommerceState; memberId: string; finalizedAt: Date; windowDays: number; threshold: number; remaining: Map<string, number>; activeSubscriptionRequired: boolean; activeSubscriptionSatisfied: boolean }): QualificationPathEvaluation {
  const windowStartedAt = new Date(input.finalizedAt.getTime() - input.windowDays * QUALIFICATION_DAY_MS);
  const eligible = Object.values(input.state.validConsumptionEvents)
    .filter((consumption) => {
      const occurredAt = Date.parse(consumption.finalizedAt);
      return consumption.memberId === input.memberId && occurredAt >= windowStartedAt.getTime() && occurredAt <= input.finalizedAt.getTime() && (input.remaining.get(consumption.eventId) ?? 0) > 0;
    })
    .sort((left, right) => Date.parse(left.finalizedAt) - Date.parse(right.finalizedAt) || left.eventId.localeCompare(right.eventId));
  const cumulativeAmount = eligible.reduce((sum, consumption) => sum + (input.remaining.get(consumption.eventId) ?? 0), 0);
  return {
    windowDays: input.windowDays,
    windowStartedAt: windowStartedAt.toISOString(),
    windowEndedAt: input.finalizedAt.toISOString(),
    threshold: input.threshold,
    cumulativeAmount,
    eligibleEventIds: eligible.map((consumption) => consumption.eventId),
    activeSubscriptionRequired: input.activeSubscriptionRequired,
    activeSubscriptionSatisfied: input.activeSubscriptionSatisfied,
    passed: cumulativeAmount >= input.threshold && (!input.activeSubscriptionRequired || input.activeSubscriptionSatisfied),
  };
}

function allocateAvailableConsumption(input: { selectedPaths: Array<{ path: "general" | "subscription"; evaluation: QualificationPathEvaluation }>; remaining: Map<string, number>; mode: MembershipBusinessRules["referral"]["payoutQualification"]["excessConsumptionMode"] }) {
  const union = new Set(input.selectedPaths.flatMap(({ evaluation }) => evaluation.eligibleEventIds));
  const availableAmountBefore = [...union].reduce((sum, eventId) => sum + (input.remaining.get(eventId) ?? 0), 0);
  const allocated = new Map<string, number>();
  const take = (eventId: string, requested: number) => {
    const available = (input.remaining.get(eventId) ?? 0) - (allocated.get(eventId) ?? 0);
    const amount = Math.min(available, requested);
    if (amount > 0) allocated.set(eventId, (allocated.get(eventId) ?? 0) + amount);
    return amount;
  };
  if (input.mode === "reset") {
    for (const eventId of union) take(eventId, Number.MAX_SAFE_INTEGER);
  } else {
    for (const { evaluation } of input.selectedPaths) {
      const alreadyCounted = evaluation.eligibleEventIds.reduce((sum, eventId) => sum + (allocated.get(eventId) ?? 0), 0);
      let required = Math.max(0, evaluation.threshold - alreadyCounted);
      for (const eventId of evaluation.eligibleEventIds) {
        required -= take(eventId, required);
        if (required === 0) break;
      }
      if (required !== 0) throw new MembershipCommerceError("推薦資格消費配置不足");
    }
  }
  const allocations = [...allocated].map(([validConsumptionEventId, amount]) => ({ validConsumptionEventId, amount }));
  const consumedAmount = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  return { availableAmountBefore, consumedAmount, remainingAmountAfter: availableAmountBefore - consumedAmount, allocations };
}

/** Records one immutable event and, at most, one successful qualification round for a completed canonical order. */
export async function recordValidConsumptionFromCompletedOrder(input: { memberId: string; orderId: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const finalizedAt = input.now ?? new Date();
  const order = await readOrder(input.orderId);
  if (!order || order.status !== "completed") return null;
  const orderMemberId = typeof order.member?.memberId === "string" ? order.member.memberId : typeof order.memberId === "string" ? order.memberId : null;
  if (orderMemberId && orderMemberId !== input.memberId) throw new MembershipCommerceError("有效消費訂單會員不一致");

  const financial = projectOrderFinancialBreakdown(order);
  if (!Number.isSafeInteger(order.subtotal) || order.subtotal < 0 || !Number.isSafeInteger(order.shipping) || order.shipping < 0) throw new MembershipCommerceError("有效消費訂單金額證據不完整");
  const rawCredit = order.credit && typeof order.credit === "object" ? order.credit.appliedAmount : undefined;
  const appliedCreditAmount = rawCredit == null ? 0 : assertIntegerMoney(rawCredit, "有效消費抵用金");
  if (appliedCreditAmount > 0 && (financial.creditEvidence !== "order-snapshot" || financial.creditApplied !== appliedCreditAmount)) throw new MembershipCommerceError("有效消費抵用金證據不一致");

  const version = await getActiveMembershipRules(finalizedAt, input.rulesFilePath);
  const qualificationRules = structuredClone(version.rules.referral.payoutQualification);
  const validConsumptionAmount = Math.max(0, financial.subtotal - (qualificationRules.validConsumption.includeCreditDiscount ? 0 : appliedCreditAmount) + (qualificationRules.validConsumption.includeShipping ? financial.shipping : 0));
  const sourceReference = `completed-order:${input.orderId}`;

  return transaction((state, now) => {
    const existing = Object.values(state.validConsumptionEvents).find((consumption) => consumption.sourceReference === sourceReference);
    if (existing) {
      if (existing.memberId !== input.memberId) throw new MembershipCommerceError("有效消費訂單已屬於其他會員");
      return { event: existing, qualificationRound: Object.values(state.qualificationRounds).find((round) => round.triggeringValidConsumptionEventId === existing.eventId) ?? null, created: false };
    }

    const eventId = id("consumption");
    const consumption: ValidConsumptionEvent = {
      eventId,
      memberId: input.memberId,
      sourceOrderId: input.orderId,
      sourceReference,
      finalizedAt: finalizedAt.toISOString(),
      createdAt: nowIso(now),
      merchandiseSubtotal: financial.subtotal,
      appliedCreditAmount,
      shippingAmount: financial.shipping,
      validConsumptionAmount,
      includeCreditDiscount: qualificationRules.validConsumption.includeCreditDiscount,
      includeShipping: qualificationRules.validConsumption.includeShipping,
      activeSubscriptionAtCompletion: hasActiveSubscription(state, input.memberId),
      rulesVersion: version.rulesVersion,
      qualificationRulesSnapshot: qualificationRules,
      idempotencyKey: input.idempotencyKey,
    };
    state.validConsumptionEvents[eventId] = consumption;

    const remaining = remainingConsumptionByEvent(state);
    const generalPath = evaluateQualificationPath({ state, memberId: input.memberId, finalizedAt, windowDays: qualificationRules.generalMember.rollingWindowDays, threshold: qualificationRules.generalMember.cumulativeValidConsumptionThreshold, remaining, activeSubscriptionRequired: false, activeSubscriptionSatisfied: true });
    const subscriptionPath = evaluateQualificationPath({ state, memberId: input.memberId, finalizedAt, windowDays: qualificationRules.activeSubscriptionMember.rollingWindowDays, threshold: qualificationRules.activeSubscriptionMember.cumulativeValidConsumptionThreshold, remaining, activeSubscriptionRequired: true, activeSubscriptionSatisfied: consumption.activeSubscriptionAtCompletion });
    const mode = qualificationRules.mode;
    const qualified = mode === "general" ? generalPath.passed : mode === "subscription" ? subscriptionPath.passed : mode === "either" ? generalPath.passed || subscriptionPath.passed : generalPath.passed && subscriptionPath.passed;
    let qualificationRound: QualificationRound | null = null;
    if (qualified) {
      const selectedPaths: Array<{ path: "general" | "subscription"; evaluation: QualificationPathEvaluation }> = mode === "general"
        ? [{ path: "general", evaluation: generalPath }]
        : mode === "subscription"
          ? [{ path: "subscription", evaluation: subscriptionPath }]
          : mode === "both"
            ? [{ path: "general", evaluation: generalPath }, { path: "subscription", evaluation: subscriptionPath }]
            : subscriptionPath.passed
              ? [{ path: "subscription", evaluation: subscriptionPath }]
              : [{ path: "general", evaluation: generalPath }];
      const accounting = allocateAvailableConsumption({ selectedPaths, remaining, mode: qualificationRules.excessConsumptionMode });
      const roundId = id("qualification");
      qualificationRound = {
        roundId,
        memberId: input.memberId,
        triggeringValidConsumptionEventId: eventId,
        triggeringSourceOrderId: input.orderId,
        qualifiedAt: finalizedAt.toISOString(),
        createdAt: nowIso(now),
        rulesVersion: version.rulesVersion,
        qualificationMode: mode,
        generalPath,
        subscriptionPath,
        finalQualified: true,
        selectedAccountingPaths: selectedPaths.map(({ path: selectedPath }) => selectedPath),
        excessConsumptionMode: qualificationRules.excessConsumptionMode,
        consumptionAccounting: accounting,
        rewardCoverageRuleSnapshot: structuredClone(qualificationRules.rewardCoverage),
        rewardSafetyRuleSnapshot: { baseWaitingDays: version.rules.referral.referralRewardBaseWaitingDays, returnProtectionDays: version.rules.referral.referralRewardReturnProtectionDays },
        idempotencyKey: input.idempotencyKey,
      };
      state.qualificationRounds[roundId] = qualificationRound;
      coverExistingRewardsForQualificationRound(state, qualificationRound, now);
    }
    remember(state, `valid-consumption:${sourceReference}`, eventId, now);
    return { event: consumption, qualificationRound, created: true };
  }, { now: finalizedAt, filePath: input.stateFilePath });
}

function qualificationExpiresAt(now: Date, days: number) {
  const lastDate = addTaipeiCalendarDays(getDateOnlyInTimeZone(now), days - 1);
  return `${lastDate}T23:59:59.999+08:00`;
}

function hasQualificationSnapshot(reward: ReferralReward) {
  return typeof reward.qualificationWindowDays === "number" && typeof reward.qualificationStartedAt === "string" && typeof reward.qualificationExpiresAt === "string" && typeof reward.qualificationStatus === "string";
}

export function referralRewardQualificationAuthority(reward: Pick<ReferralReward, "qualificationAuthority">): ReferralRewardQualificationAuthority {
  return reward.qualificationAuthority ?? "legacy_order";
}

function qualificationCoverageInterval(round: QualificationRound) {
  const qualificationTime = Date.parse(round.qualifiedAt);
  const lookbackDays = round.rewardCoverageRuleSnapshot.lookbackDays;
  const forwardDays = round.rewardCoverageRuleSnapshot.forwardDays;
  return {
    startsAtMs: qualificationTime - lookbackDays * QUALIFICATION_DAY_MS,
    endsAtMs: qualificationTime + forwardDays * QUALIFICATION_DAY_MS,
    startsAt: new Date(qualificationTime - lookbackDays * QUALIFICATION_DAY_MS).toISOString(),
    endsAt: new Date(qualificationTime + forwardDays * QUALIFICATION_DAY_MS).toISOString(),
    lookbackDays,
    forwardDays,
  };
}

function roundCoversReward(round: QualificationRound, reward: ReferralReward) {
  if (round.memberId !== reward.beneficiaryMemberId || referralRewardQualificationAuthority(reward) !== "qualification_coverage") return false;
  const generatedAt = Date.parse(reward.createdAt);
  const interval = qualificationCoverageInterval(round);
  return Number.isFinite(generatedAt) && generatedAt >= interval.startsAtMs && generatedAt <= interval.endsAtMs;
}

function coverRewardFromEarliestQualificationRound(state: MembershipCommerceState, reward: ReferralReward, now: Date) {
  const existing = Object.values(state.referralRewardCoverages).find((coverage) => coverage.referralRewardId === reward.rewardId);
  if (existing || referralRewardQualificationAuthority(reward) !== "qualification_coverage") return existing ?? null;
  const round = Object.values(state.qualificationRounds)
    .filter((candidate) => roundCoversReward(candidate, reward))
    .sort((left, right) => Date.parse(left.qualifiedAt) - Date.parse(right.qualifiedAt) || left.roundId.localeCompare(right.roundId))[0];
  if (!round) return null;
  const interval = qualificationCoverageInterval(round);
  const coverageId = deterministicId("coverage", reward.rewardId);
  const sourceReference = `qualification-coverage:${round.roundId}:${reward.rewardId}`;
  const coverage: ReferralRewardCoverage = {
    coverageId,
    memberId: reward.beneficiaryMemberId,
    qualificationRoundId: round.roundId,
    referralRewardId: reward.rewardId,
    qualificationAt: round.qualifiedAt,
    rewardGeneratedAt: reward.createdAt,
    coverageStartsAt: interval.startsAt,
    coverageEndsAt: interval.endsAt,
    lookbackDays: interval.lookbackDays,
    forwardDays: interval.forwardDays,
    rulesVersion: round.rulesVersion,
    inclusionReason: "reward-generated-within-snapshotted-coverage-window",
    createdAt: nowIso(now),
    sourceReference,
    idempotencyKey: sourceReference,
  };
  state.referralRewardCoverages[coverageId] = coverage;
  return coverage;
}

function coverExistingRewardsForQualificationRound(state: MembershipCommerceState, round: QualificationRound, now: Date) {
  const coverages: ReferralRewardCoverage[] = [];
  for (const reward of Object.values(state.referralRewards).filter((candidate) => roundCoversReward(round, candidate))) {
    const coverage = coverRewardFromEarliestQualificationRound(state, reward, now);
    if (coverage) coverages.push(coverage);
  }
  return coverages;
}

/** Explicit idempotent reconciliation for retry/restart recovery; it does not create rounds or rewards. */
export async function reconcileReferralRewardCoverage(input: { qualificationRoundId?: string; referralRewardId?: string; now?: Date; stateFilePath?: string }) {
  if (!input.qualificationRoundId && !input.referralRewardId) throw new MembershipCommerceError("必須指定推薦資格輪次或推薦獎勵");
  return transaction((state, now) => {
    const results: ReferralRewardCoverage[] = [];
    if (input.qualificationRoundId) {
      const round = state.qualificationRounds[input.qualificationRoundId];
      if (!round) throw new MembershipCommerceError("找不到推薦資格輪次");
      results.push(...coverExistingRewardsForQualificationRound(state, round, now));
    }
    if (input.referralRewardId) {
      const reward = state.referralRewards[input.referralRewardId];
      if (!reward) throw new MembershipCommerceError("找不到推薦獎勵");
      const coverage = coverRewardFromEarliestQualificationRound(state, reward, now);
      if (coverage && !results.some((item) => item.coverageId === coverage.coverageId)) results.push(coverage);
    }
    return results;
  }, { now: input.now, filePath: input.stateFilePath });
}

function historicalRoundSafetySnapshot(round: QualificationRound, versions: RulesVersion[]) {
  if (round.rewardSafetyRuleSnapshot) return round.rewardSafetyRuleSnapshot;
  const historical = versions.find((version) => version.rulesVersion === round.rulesVersion);
  if (!historical) throw new MembershipCommerceError(`推薦資格輪次 ${round.roundId} 缺少可驗證的歷史安全等待規則`);
  return { baseWaitingDays: historical.rules.referral.referralRewardBaseWaitingDays, returnProtectionDays: historical.rules.referral.referralRewardReturnProtectionDays };
}

/** Appends due maturation facts only; payout, caps, credit, reward state, and notifications are untouched. */
export async function processReferralRewardMaturations(input: { now?: Date; stateFilePath?: string; rulesFilePath?: string } = {}) {
  const rulesStore = await readMembershipRulesStore(input.rulesFilePath);
  return transaction((state, now) => {
    const matured: ReferralRewardMaturation[] = [];
    for (const coverage of Object.values(state.referralRewardCoverages).sort((left, right) => left.coverageId.localeCompare(right.coverageId))) {
      if (Object.values(state.referralRewardMaturations).some((item) => item.referralRewardId === coverage.referralRewardId || item.coverageId === coverage.coverageId)) continue;
      const reward = state.referralRewards[coverage.referralRewardId];
      const round = state.qualificationRounds[coverage.qualificationRoundId];
      if (!reward || !round || referralRewardQualificationAuthority(reward) !== "qualification_coverage") continue;
      const safety = historicalRoundSafetySnapshot(round, rulesStore.versions);
      const maturesAtMs = Date.parse(round.qualifiedAt) + (safety.baseWaitingDays + safety.returnProtectionDays) * QUALIFICATION_DAY_MS;
      if (now.getTime() < maturesAtMs) continue;
      const maturationId = deterministicId("maturation", coverage.coverageId);
      const sourceReference = `reward-maturation:${coverage.coverageId}`;
      const record: ReferralRewardMaturation = {
        maturationId,
        memberId: coverage.memberId,
        referralRewardId: coverage.referralRewardId,
        coverageId: coverage.coverageId,
        qualificationRoundId: coverage.qualificationRoundId,
        qualificationAt: round.qualifiedAt,
        baseWaitingDays: safety.baseWaitingDays,
        returnProtectionDays: safety.returnProtectionDays,
        maturesAt: new Date(maturesAtMs).toISOString(),
        maturedAt: nowIso(now),
        rulesVersion: round.rulesVersion,
        createdAt: nowIso(now),
        sourceReference,
        idempotencyKey: sourceReference,
      };
      state.referralRewardMaturations[maturationId] = record;
      matured.push(record);
    }
    return matured;
  }, { now: input.now, filePath: input.stateFilePath });
}

function orderWithinQualificationWindow(reward: ReferralReward, orderCreatedAt: string) {
  if (!hasQualificationSnapshot(reward)) return false;
  const created = Date.parse(orderCreatedAt);
  return Number.isFinite(created) && created >= Date.parse(reward.qualificationStartedAt!) && created <= Date.parse(reward.qualificationExpiresAt!);
}

function syncQualificationPointer(reward: ReferralReward) {
  const attempts = reward.qualificationAttempts ?? [];
  const selected = attempts.find((attempt) => attempt.status === "completed") ?? attempts.find((attempt) => attempt.status === "pending") ?? attempts.at(-1);
  reward.qualificationOrderNumber = selected?.orderNumber ?? null;
  reward.qualificationOrderCreatedAt = selected?.orderCreatedAt ?? null;
  reward.qualificationOrderFinalState = selected?.finalState ?? null;
}

/** Associates a member's own normal or subscription order without changing price or issuing credit. */
export async function registerReferralQualificationOrder(input: { memberId: string; orderId: string; orderCreatedAt: string; orderType: "normal" | "subscription"; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `referral-qualification:order-created:${input.idempotencyKey}`;
  return transaction((state, now) => {
    if (remembered(state, key)) return Object.values(state.referralRewards).filter((reward) => reward.qualificationAttempts?.some((attempt) => attempt.orderNumber === input.orderId));
    const changed: ReferralReward[] = [];
    for (const reward of Object.values(state.referralRewards)) {
      if (referralRewardQualificationAuthority(reward) !== "legacy_order" || reward.beneficiaryMemberId !== input.memberId || reward.status !== "scheduled" || !hasQualificationSnapshot(reward) || reward.qualificationStatus === "qualified" || reward.qualificationStatus === "expired" || !orderWithinQualificationWindow(reward, input.orderCreatedAt)) continue;
      reward.qualificationAttempts ??= [];
      if (reward.qualificationAttempts.some((attempt) => attempt.orderNumber === input.orderId)) continue;
      reward.qualificationAttempts.push({ orderNumber: input.orderId, orderCreatedAt: input.orderCreatedAt, orderType: input.orderType, status: "pending", finalState: "pending", finalizedAt: null });
      reward.qualificationStatus = "awaiting_completion";
      syncQualificationPointer(reward);
      const source = event(state, "referral_qualification_order_registered", { rewardId: reward.rewardId, orderType: input.orderType }, now, { memberId: input.memberId, orderId: input.orderId });
      notify(state, version.rules, "referral_conversion", source.eventId, now, { memberId: input.memberId, safeData: { rewardAmount: reward.calculatedCreditAmount, qualificationStatus: "awaiting_completion" } });
      changed.push(reward);
    }
    remember(state, key, changed[0]?.rewardId ?? "none", now);
    return changed;
  }, { now: input.now, filePath: input.stateFilePath });
}

function reverseReleasedQualificationReward(state: MembershipCommerceState, reward: ReferralReward, now: Date) {
  if (reward.status !== "released" || reward.reversalCreditEntryId) return;
  const original = reward.rewardCreditEntryId ? state.creditEntries[reward.rewardCreditEntryId] : undefined;
  if (original) {
    original.remainingAmount = Math.max(0, original.remainingAmount - reward.calculatedCreditAmount);
    if (original.remainingAmount === 0) original.status = "consumed";
  }
  const reversalId = id("credit_reversal");
  state.creditEntries[reversalId] = { creditEntryId: reversalId, memberId: reward.beneficiaryMemberId, sourceType: "referral", sourceReference: `referral_reward_reversal:${reward.rewardId}`, amount: -reward.calculatedCreditAmount, remainingAmount: 0, issuedAt: nowIso(now), expiresAt: nowIso(now), status: "consumed", createdAt: nowIso(now), metadata: { rewardId: reward.rewardId, reversalAmount: reward.calculatedCreditAmount, reversesCreditEntryId: reward.rewardCreditEntryId ?? "", reason: "qualification_order_failed" } };
  reward.status = "reversed";
  reward.reversedAt = nowIso(now);
  reward.reversalCreditEntryId = reversalId;
}

/** Applies trusted outcomes to qualification attempts; source reward cancellation remains a separate flow. */
export async function handleReferralQualificationOrderOutcome(input: { memberId: string; orderId: string; outcome: "completed" | "cancelled" | "uncollected" | "refunded" | "returned"; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `referral-qualification:order-outcome:${input.idempotencyKey}`;
  return transaction((state, now) => {
    if (remembered(state, key)) return [];
    const changed: ReferralReward[] = [];
    for (const reward of Object.values(state.referralRewards)) {
      if (referralRewardQualificationAuthority(reward) !== "legacy_order" || reward.beneficiaryMemberId !== input.memberId || !hasQualificationSnapshot(reward)) continue;
      const attempt = reward.qualificationAttempts?.find((item) => item.orderNumber === input.orderId);
      if (!attempt || (attempt.finalState === input.outcome && attempt.finalizedAt)) continue;
      const wasQualifiedByThisOrder = reward.qualificationStatus === "qualified" && reward.qualificationOrderNumber === input.orderId;
      attempt.finalizedAt = nowIso(now);
      if (input.outcome === "completed") {
        attempt.status = "completed";
        attempt.finalState = "completed";
      } else {
        attempt.status = "failed";
        attempt.finalState = input.outcome;
      }

      const completed = reward.qualificationAttempts!.filter((item) => item.status === "completed").sort((a, b) => a.orderCreatedAt.localeCompare(b.orderCreatedAt) || a.orderNumber.localeCompare(b.orderNumber))[0];
      const pending = reward.qualificationAttempts!.filter((item) => item.status === "pending").sort((a, b) => a.orderCreatedAt.localeCompare(b.orderCreatedAt) || a.orderNumber.localeCompare(b.orderNumber))[0];
      if (completed) {
        reward.qualificationStatus = "qualified";
        reward.qualificationOrderNumber = completed.orderNumber;
        reward.qualificationOrderCreatedAt = completed.orderCreatedAt;
        reward.qualificationOrderFinalState = "completed";
        reward.qualificationQualifiedAt = completed.finalizedAt;
        reward.eligibleAt = completed.finalizedAt ?? nowIso(now);
        const pickupBusinessDate = getDateOnlyInTimeZone(new Date(completed.finalizedAt ?? now));
        const baseWaitingDays = reward.baseWaitingDaysSnapshot ?? version.rules.referral.referralRewardBaseWaitingDays;
        const returnProtectionDays = reward.returnProtectionDaysSnapshot ?? version.rules.referral.referralRewardReturnProtectionDays;
        reward.successfulPickupBusinessDate = pickupBusinessDate;
        reward.releaseEligibleBusinessDate = referralReleaseEligibleBusinessDate(pickupBusinessDate, baseWaitingDays, returnProtectionDays);
        reward.scheduledReleaseAt = `${reward.releaseEligibleBusinessDate}T00:00:00+08:00`;
      } else if (pending) {
        reward.qualificationStatus = "awaiting_completion";
        reward.qualificationOrderNumber = pending.orderNumber;
        reward.qualificationOrderCreatedAt = pending.orderCreatedAt;
        reward.qualificationOrderFinalState = "pending";
        reward.qualificationQualifiedAt = null;
      } else {
        reward.qualificationStatus = Date.parse(reward.qualificationExpiresAt!) < now.getTime() ? "expired" : "awaiting_order";
        syncQualificationPointer(reward);
        reward.qualificationQualifiedAt = null;
      }
      if (wasQualifiedByThisOrder && reward.qualificationStatus !== "qualified" && (reward.reversalPolicySnapshot ?? version.rules.referral.reversalPolicy) === "cancel-pending-and-reverse-released") reverseReleasedQualificationReward(state, reward, now);
      const source = event(state, input.outcome === "completed" ? "referral_qualification_completed" : "referral_qualification_order_failed", { rewardId: reward.rewardId, qualificationStatus: reward.qualificationStatus, outcome: input.outcome }, now, { memberId: input.memberId, orderId: input.orderId });
      notify(state, version.rules, "referral_conversion", source.eventId, now, { memberId: input.memberId, safeData: { rewardAmount: reward.calculatedCreditAmount, qualificationStatus: reward.qualificationStatus } });
      changed.push(reward);
    }
    remember(state, key, changed[0]?.rewardId ?? "none", now);
    return changed;
  }, { now: input.now, filePath: input.stateFilePath });
}

/** Creates immutable multi-generation reward snapshots from a trusted fulfillment outcome. */
export async function createReferralRewardsFromFulfillment(input: { sourceMemberId: string; orderId: string; rewardType: "new_referral" | "subscription"; paidAmountBasis: number; basePV?: number; discountRatio?: number; effectivePV?: number; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `referral-rewards:create:${input.idempotencyKey}`;
  return transaction((state, now) => {
    if (remembered(state, key)) return Object.values(state.referralRewards).filter((item) => item.sourceOrderNumber === input.orderId);
    const rules = version.rules.referral;
    if (!rules.programEnabled) { remember(state, key, "none", now); return []; }
    if (input.rewardType === "new_referral" && state.events.some((item) => item.type === "referral_new_qualified" && item.memberId === input.sourceMemberId)) { remember(state, key, "qualified", now); return []; }
    const paidAmountBasis = assertIntegerMoney(input.paidAmountBasis, "推薦實付商品金額");
    const basePV = Math.max(0, Number(input.basePV ?? 0));
    const discountRatio = Math.max(0, Math.min(1, Number(input.discountRatio ?? 1)));
    const effectivePV = Math.max(0, Number(input.effectivePV ?? basePV * discountRatio));
    if (rules.referralRewardCalculationMode === "pv" && !Number.isFinite(effectivePV)) throw new MembershipCommerceError("訂單有效 PV 不完整");
    const ancestry = ancestryFor(state, input.sourceMemberId, rules.referralMaxRewardDepth);
    if (input.rewardType === "new_referral") event(state, "referral_new_qualified", { sourceOrderNumber: input.orderId }, now, { memberId: input.sourceMemberId, orderId: input.orderId });
    const created: ReferralReward[] = [];
    const qualificationWindowDays = rules.referralRewardQualificationWindowDays;
    const qualificationStartedAt = nowIso(now);
    const qualificationExpiry = qualificationExpiresAt(now, qualificationWindowDays);
    const baseWaitingDaysSnapshot = rules.referralRewardBaseWaitingDays;
    const returnProtectionDaysSnapshot = rules.referralRewardReturnProtectionDays;
    const totalWaitingDaysSnapshot = baseWaitingDaysSnapshot + returnProtectionDaysSnapshot;
    // Preserve the existing canonical cap period definition (reward createdAt YYYY-MM).
    const monthlyCapPeriodSnapshot = nowIso(now).slice(0, 7);
    let allocated = 0;
    const capBasis = rules.referralRewardCalculationMode === "paid_amount" ? paidAmountBasis : effectivePV * rules.pvRewardMoneyValue;
    const totalCap = rewardRound(capBasis * rules.referralTotalRewardCap / 100, version.rules.money.roundingMode);
    for (let index = 0; index < ancestry.length; index += 1) {
      const beneficiaryMemberId = ancestry[index];
      const level = index + 1;
      const levelRule = rules.levels.find((item) => item.level === level);
      if (!levelRule?.enabled) continue;
      const rewardRate = input.rewardType === "new_referral" ? levelRule.newReferralRewardRate : levelRule.subscriptionRewardRate;
      const rewardPV = rules.referralRewardCalculationMode === "pv" ? effectivePV * rewardRate / 100 : 0;
      const rawCredit = rules.referralRewardCalculationMode === "pv" ? rewardPV * rules.pvRewardMoneyValue : paidAmountBasis * rewardRate / 100;
      const calculatedCreditAmount = Math.max(0, Math.min(rewardRound(rawCredit, version.rules.money.roundingMode), totalCap - allocated));
      if (calculatedCreditAmount < 1) continue;
      allocated += calculatedCreditAmount;
      const rewardId = deterministicId("reward", `${input.orderId}:${input.rewardType}:${level}:${beneficiaryMemberId}`);
      const reward: ReferralReward = { rewardId, sourceOrderNumber: input.orderId, sourceMemberId: input.sourceMemberId, beneficiaryMemberId, referralLevel: level, rewardType: input.rewardType, calculationMode: rules.referralRewardCalculationMode, paidAmountBasis, basePV, discountRatio, effectivePV, rewardRate, rewardPV, pvRewardMoneyValue: rules.pvRewardMoneyValue, calculatedCreditAmount, projectedCreditAmount: calculatedCreditAmount, ruleVersion: version.rulesVersion, ancestrySnapshot: [...ancestry], organizationCapPercentSnapshot: rules.referralTotalRewardCap, organizationCapAmountSnapshot: totalCap, monthlyCapAmountSnapshot: rules.referralMonthlyCreditCap, monthlyCapPeriodSnapshot, monthlyCapUsageAtRelease: null, monthlyCapLimitedAmount: null, reversalPolicySnapshot: rules.reversalPolicy, baseWaitingDaysSnapshot, returnProtectionDaysSnapshot, totalWaitingDaysSnapshot, releasePolicyVersion: "taipei-business-date-v1", successfulPickupBusinessDate: null, releaseEligibleBusinessDate: null, sourceOrderFinalState: "completed", cancellationReason: null, qualificationWindowDays, qualificationStartedAt, qualificationExpiresAt: qualificationExpiry, qualificationStatus: "awaiting_order", qualificationOrderNumber: null, qualificationOrderCreatedAt: null, qualificationOrderFinalState: null, qualificationQualifiedAt: null, qualificationAttempts: [], qualificationAuthority: "qualification_coverage", createdAt: nowIso(now), eligibleAt: nowIso(now), scheduledReleaseAt: "", releasedAt: null, status: "scheduled", reversalCreditEntryId: null, rewardCreditEntryId: null, idempotencyKey: `${input.idempotencyKey}:${level}` };
      state.referralRewards[rewardId] = reward; created.push(reward);
      coverRewardFromEarliestQualificationRound(state, reward, now);
      const source = event(state, "referral_reward_scheduled", { amount: calculatedCreditAmount, level }, now, { memberId: beneficiaryMemberId, orderId: input.orderId });
      notify(state, version.rules, "referral_conversion", source.eventId, now, { memberId: beneficiaryMemberId, safeData: { rewardAmount: calculatedCreditAmount } });
      if (allocated >= totalCap) break;
    }
    remember(state, key, created[0]?.rewardId ?? "none", now);
    return created;
  }, { now: input.now, filePath: input.stateFilePath });
}

/**
 * New-model rewards may only be paid from the immutable Coverage → Maturation
 * chain.  The legacy qualification-order fields intentionally do not
 * participate in this path.
 */
function validQualificationCoverageMaturation(state: MembershipCommerceState, reward: ReferralReward) {
  if (referralRewardQualificationAuthority(reward) !== "qualification_coverage") return null;
  const coverage = Object.values(state.referralRewardCoverages).find((item) => item.referralRewardId === reward.rewardId);
  if (!coverage || coverage.memberId !== reward.beneficiaryMemberId) return null;
  const round = state.qualificationRounds[coverage.qualificationRoundId];
  if (!round || round.finalQualified !== true || round.memberId !== reward.beneficiaryMemberId) return null;
  if (coverage.qualificationRoundId !== round.roundId || coverage.qualificationAt !== round.qualifiedAt || coverage.rewardGeneratedAt !== reward.createdAt || coverage.rulesVersion !== round.rulesVersion) return null;
  const interval = qualificationCoverageInterval(round);
  if (coverage.coverageStartsAt !== interval.startsAt || coverage.coverageEndsAt !== interval.endsAt || coverage.lookbackDays !== interval.lookbackDays || coverage.forwardDays !== interval.forwardDays) return null;
  const rewardGeneratedAt = Date.parse(reward.createdAt);
  if (!Number.isFinite(rewardGeneratedAt) || rewardGeneratedAt < Date.parse(coverage.coverageStartsAt) || rewardGeneratedAt > Date.parse(coverage.coverageEndsAt)) return null;
  const maturation = Object.values(state.referralRewardMaturations).find((item) => item.referralRewardId === reward.rewardId);
  if (!maturation || maturation.memberId !== reward.beneficiaryMemberId || maturation.coverageId !== coverage.coverageId || maturation.qualificationRoundId !== round.roundId || maturation.qualificationAt !== round.qualifiedAt || maturation.rulesVersion !== round.rulesVersion) return null;
  const safety = round.rewardSafetyRuleSnapshot;
  if (!safety || maturation.baseWaitingDays !== safety.baseWaitingDays || maturation.returnProtectionDays !== safety.returnProtectionDays) return null;
  const expectedMaturesAt = Date.parse(round.qualifiedAt) + (safety.baseWaitingDays + safety.returnProtectionDays) * QUALIFICATION_DAY_MS;
  if (!Number.isFinite(expectedMaturesAt) || Date.parse(maturation.maturesAt) !== expectedMaturesAt || Date.parse(maturation.maturedAt) < expectedMaturesAt) return null;
  return { coverage, round, maturation };
}

export async function runReferralRewardReleaseScheduler(input: { now?: Date; stateFilePath?: string; rulesFilePath?: string } = {}) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  return transaction((state, now) => {
    const results: Array<{ rewardId: string; status: "released" | "failed" | "expired" | "cap_blocked"; error?: string }> = [];
    const today = getDateOnlyInTimeZone(now);
    for (const reward of Object.values(state.referralRewards).filter((item) => referralRewardQualificationAuthority(item) === "legacy_order" && item.status === "scheduled" && item.qualificationStatus === "awaiting_order" && typeof item.qualificationExpiresAt === "string" && Date.parse(item.qualificationExpiresAt) < now.getTime())) {
      reward.qualificationStatus = "expired";
      const source = event(state, "referral_qualification_expired", { rewardId: reward.rewardId, amount: reward.calculatedCreditAmount }, now, { memberId: reward.beneficiaryMemberId, orderId: reward.sourceOrderNumber });
      notify(state, version.rules, "referral_conversion", source.eventId, now, { memberId: reward.beneficiaryMemberId, safeData: { rewardAmount: reward.calculatedCreditAmount, qualificationStatus: "expired" } });
      results.push({ rewardId: reward.rewardId, status: "expired" });
    }
    const dueRewards = Object.values(state.referralRewards).filter((item) => {
      if (referralRewardQualificationAuthority(item) !== "legacy_order" || item.status !== "scheduled" || (hasQualificationSnapshot(item) && item.qualificationStatus !== "qualified")) return false;
      const eligibleDate = item.releaseEligibleBusinessDate ?? item.scheduledReleaseAt?.slice(0, 10);
      return Boolean(eligibleDate && isReferralReleaseBusinessDateDue(today, eligibleDate));
    }).sort((a, b) => (a.releaseEligibleBusinessDate ?? a.scheduledReleaseAt).localeCompare(b.releaseEligibleBusinessDate ?? b.scheduledReleaseAt) || a.createdAt.localeCompare(b.createdAt) || a.rewardId.localeCompare(b.rewardId));
    for (const reward of dueRewards) {
      try {
        if (!hasQualificationSnapshot(reward) && version.rules.referral.referrerEligibility.mode === "active-subscription" && !hasActiveSubscription(state, reward.beneficiaryMemberId)) throw new MembershipCommerceError("舊版推薦 reward：推薦人目前沒有啟用中的定期購");
        if (reward.sourceOrderFinalState && reward.sourceOrderFinalState !== "completed") throw new MembershipCommerceError("來源交易最新狀態不允許發放");
        if (reward.qualificationOrderFinalState && reward.qualificationOrderFinalState !== "completed") throw new MembershipCommerceError("資格交易最新狀態不允許發放");
        const cap = reward.monthlyCapAmountSnapshot ?? version.rules.referral.referralMonthlyCreditCap;
        const capPeriod = reward.monthlyCapPeriodSnapshot ?? reward.createdAt.slice(0, 7);
        const monthUsed = Object.values(state.referralRewards).filter((item) => item.rewardId !== reward.rewardId && item.beneficiaryMemberId === reward.beneficiaryMemberId && item.status === "released" && (item.monthlyCapPeriodSnapshot ?? item.createdAt.slice(0, 7)) === capPeriod).reduce((sum, item) => sum + item.calculatedCreditAmount, 0);
        const projectedAmount = reward.projectedCreditAmount ?? reward.calculatedCreditAmount;
        const releaseAmount = cap === 0 ? projectedAmount : Math.min(projectedAmount, Math.max(0, cap - monthUsed));
        reward.monthlyCapUsageAtRelease = monthUsed;
        reward.monthlyCapLimitedAmount = projectedAmount - releaseAmount;
        if (releaseAmount < 1) {
          reward.status = "cancelled";
          reward.cancellationReason = "monthly_cap_exhausted_at_release";
          results.push({ rewardId: reward.rewardId, status: "cap_blocked", error: "本期月上限已用完" });
          continue;
        }
        reward.calculatedCreditAmount = releaseAmount;
        const credit = issueCreditInState(state, version.rules, { memberId: reward.beneficiaryMemberId, sourceType: "referral", sourceReference: `referral_reward:${reward.rewardId}`, amount: releaseAmount, metadata: { rewardId: reward.rewardId, orderId: reward.sourceOrderNumber, referralLevel: reward.referralLevel, monthlyCapPeriod: capPeriod, monthlyCapUsageBeforeRelease: monthUsed, monthlyCapLimitedAmount: reward.monthlyCapLimitedAmount } }, now);
        reward.status = "released"; reward.releasedAt = nowIso(now); reward.rewardCreditEntryId = credit.creditEntryId;
        const source = event(state, "referral_reward_released", { amount: credit.amount, level: reward.referralLevel }, now, { memberId: reward.beneficiaryMemberId, orderId: reward.sourceOrderNumber });
        notify(state, version.rules, "credit_issued", source.eventId, now, { memberId: reward.beneficiaryMemberId, safeData: { amount: credit.amount } });
        results.push({ rewardId: reward.rewardId, status: "released" });
      } catch (error) { results.push({ rewardId: reward.rewardId, status: "failed", error: error instanceof Error ? error.message : "發放失敗" }); }
    }
    const maturedCoverageRewards = Object.values(state.referralRewards).filter((item) => {
      if (item.status !== "scheduled") return false;
      const evidence = validQualificationCoverageMaturation(state, item);
      return Boolean(evidence && Date.parse(evidence.maturation.maturedAt) <= now.getTime());
    }).sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.rewardId.localeCompare(right.rewardId));
    for (const reward of maturedCoverageRewards) {
      try {
        // Re-read the complete evidence chain inside this transaction before every monetary mutation.
        const evidence = validQualificationCoverageMaturation(state, reward);
        if (!evidence || Date.parse(evidence.maturation.maturedAt) > now.getTime()) throw new MembershipCommerceError("推薦獎勵缺少有效的資格成熟證據");
        if (reward.sourceOrderFinalState && reward.sourceOrderFinalState !== "completed") throw new MembershipCommerceError("來源交易最新狀態不允許發放");
        const cap = reward.monthlyCapAmountSnapshot ?? version.rules.referral.referralMonthlyCreditCap;
        const capPeriod = reward.monthlyCapPeriodSnapshot ?? reward.createdAt.slice(0, 7);
        const monthUsed = Object.values(state.referralRewards).filter((item) => item.rewardId !== reward.rewardId && item.beneficiaryMemberId === reward.beneficiaryMemberId && item.status === "released" && (item.monthlyCapPeriodSnapshot ?? item.createdAt.slice(0, 7)) === capPeriod).reduce((sum, item) => sum + item.calculatedCreditAmount, 0);
        const projectedAmount = reward.projectedCreditAmount ?? reward.calculatedCreditAmount;
        const releaseAmount = cap === 0 ? projectedAmount : Math.min(projectedAmount, Math.max(0, cap - monthUsed));
        reward.monthlyCapUsageAtRelease = monthUsed;
        reward.monthlyCapLimitedAmount = projectedAmount - releaseAmount;
        if (releaseAmount < 1) {
          reward.status = "cancelled";
          reward.cancellationReason = "monthly_cap_exhausted_at_release";
          results.push({ rewardId: reward.rewardId, status: "cap_blocked", error: "本期月上限已用完" });
          continue;
        }
        reward.calculatedCreditAmount = releaseAmount;
        const credit = issueCreditInState(state, version.rules, { memberId: reward.beneficiaryMemberId, sourceType: "referral", sourceReference: `referral_reward:${reward.rewardId}`, amount: releaseAmount, metadata: { rewardId: reward.rewardId, orderId: reward.sourceOrderNumber, referralLevel: reward.referralLevel, monthlyCapPeriod: capPeriod, monthlyCapUsageBeforeRelease: monthUsed, monthlyCapLimitedAmount: reward.monthlyCapLimitedAmount, qualificationAuthority: "qualification_coverage", qualificationRoundId: evidence.round.roundId, coverageId: evidence.coverage.coverageId, maturationId: evidence.maturation.maturationId } }, now);
        reward.status = "released"; reward.releasedAt = nowIso(now); reward.rewardCreditEntryId = credit.creditEntryId;
        const source = event(state, "referral_reward_released", { amount: credit.amount, level: reward.referralLevel }, now, { memberId: reward.beneficiaryMemberId, orderId: reward.sourceOrderNumber });
        // Durable outbox evidence is committed with the already-final payout; delivery is performed separately after commit.
        notify(state, version.rules, "credit_issued", source.eventId, now, { memberId: reward.beneficiaryMemberId, safeData: { amount: credit.amount, referralPayout: true } });
        results.push({ rewardId: reward.rewardId, status: "released" });
      } catch (error) { results.push({ rewardId: reward.rewardId, status: "failed", error: error instanceof Error ? error.message : "發放失敗" }); }
    }
    return results;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function cancelOrReverseReferralRewards(input: { orderId: string; outcome?: "cancelled" | "uncollected" | "refunded" | "returned"; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  return transaction((state, now) => {
    const key = `referral-rewards:reverse:${input.idempotencyKey}`;
    if (remembered(state, key)) return [];
    const changed: ReferralReward[] = [];
    for (const reward of Object.values(state.referralRewards).filter((item) => item.sourceOrderNumber === input.orderId)) {
      reward.sourceOrderFinalState = input.outcome ?? "cancelled";
      if (reward.status === "scheduled") { reward.status = "cancelled"; reward.cancellationReason = "source_transaction_reversed_before_release"; changed.push(reward); const source=event(state,"referral_reward_cancelled",{amount:reward.calculatedCreditAmount},now,{memberId:reward.beneficiaryMemberId,orderId:reward.sourceOrderNumber}); notify(state,version.rules,"referral_conversion",source.eventId,now,{memberId:reward.beneficiaryMemberId,safeData:{rewardAmount:0}}); continue; }
      if (reward.status !== "released" || (reward.reversalPolicySnapshot ?? version.rules.referral.reversalPolicy) !== "cancel-pending-and-reverse-released") continue;
      const original = reward.rewardCreditEntryId ? state.creditEntries[reward.rewardCreditEntryId] : undefined;
      if (original) { original.remainingAmount = Math.max(0, original.remainingAmount - reward.calculatedCreditAmount); if (original.remainingAmount === 0) original.status = "consumed"; }
      const reversalId = id("credit_reversal");
      state.creditEntries[reversalId] = { creditEntryId: reversalId, memberId: reward.beneficiaryMemberId, sourceType: "referral", sourceReference: `referral_reward_reversal:${reward.rewardId}`, amount: -reward.calculatedCreditAmount, remainingAmount: 0, issuedAt: nowIso(now), expiresAt: nowIso(now), status: "consumed", createdAt: nowIso(now), metadata: { rewardId: reward.rewardId, reversalAmount: reward.calculatedCreditAmount, reversesCreditEntryId: reward.rewardCreditEntryId ?? "" } };
      reward.status = "reversed"; reward.reversedAt = nowIso(now); reward.reversalCreditEntryId = reversalId; changed.push(reward); const source=event(state,"referral_reward_reversed",{amount:reward.calculatedCreditAmount},now,{memberId:reward.beneficiaryMemberId,orderId:reward.sourceOrderNumber}); notify(state,version.rules,"referral_conversion",source.eventId,now,{memberId:reward.beneficiaryMemberId,safeData:{rewardAmount:0}});
    }
    remember(state, key, changed[0]?.rewardId ?? "none", now); return changed;
  }, { now: input.now, filePath: input.stateFilePath });
}

function issueCreditInState(state: MembershipCommerceState, rules: MembershipBusinessRules, input: { memberId: string; sourceType: CreditEntry["sourceType"]; sourceReference: string; amount: number; metadata?: CreditEntry["metadata"] }, now: Date) {
  const duplicate = Object.values(state.creditEntries).find((entry) => entry.sourceType === input.sourceType && entry.sourceReference === input.sourceReference);
  if (duplicate) return duplicate;
  const amount = assertIntegerMoney(input.amount, "抵用金");
  if (amount < 1) throw new MembershipCommerceError("抵用金必須大於零");
  const issuedDate = nowIso(now).slice(0, 10);
  const expiryDate = addTaipeiCalendarMonths(issuedDate, rules.credit.expiryCalendarMonths);
  const creditEntryId = id("credit");
  const entry: CreditEntry = { creditEntryId, memberId: input.memberId, sourceType: input.sourceType, sourceReference: input.sourceReference, amount, remainingAmount: amount, issuedAt: nowIso(now), expiresAt: `${addTaipeiCalendarDays(expiryDate, 1)}T00:00:00+08:00`, status: "available", createdAt: nowIso(now), metadata: input.metadata ?? {} };
  state.creditEntries[creditEntryId] = entry;
  return entry;
}

export async function issueCredit(input: { memberId: string; sourceType: CreditEntry["sourceType"]; sourceReference: string; amount: number; metadata?: CreditEntry["metadata"]; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  await assertCanonicalMember(input.memberId);
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `credit:issue:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const existingId = remembered(state, key);
    if (existingId) return state.creditEntries[existingId];
    const entry = issueCreditInState(state, version.rules, input, now);
    remember(state, key, entry.creditEntryId, now);
    const source = event(state, "credit_issued", { amount: entry.amount, sourceType: entry.sourceType }, now, { memberId: entry.memberId });
    notify(state, version.rules, "credit_issued", source.eventId, now, { memberId: entry.memberId, safeData: { amount: entry.amount } });
    return entry;
  }, { now: input.now, filePath: input.stateFilePath });
}

function referralRewardAmount(rules: MembershipBusinessRules, orderMerchandiseAmount: number, eligibleItemCount = 0) {
  if (rules.referral.reward.mode === OWNER_DECISION_REQUIRED) return null;
  return referralRewardForMerchandise({ merchandiseAfterDiscounts: orderMerchandiseAmount, eligibleItemCount, rules });
}

export async function processReferralOrderOutcome(input: { referredMemberId: string; orderId: string; outcome: "completed" | "uncollected"; orderMerchandiseAmount: number; eligibleItemCount?: number; referrerCompletedOrders?: number; referrerLifetimeSpend?: number; referrerLastValidPurchaseAt?: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `referral:conversion:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const existingId = remembered(state, key);
    if (existingId) return state.referralConversions[existingId];
    const relationship = Object.values(state.referrals).find((item) => item.referredMemberId === input.referredMemberId && item.status !== "inactive");
    if (!relationship) return null;
    const sourceReference = `referral_conversion:${relationship.relationshipId}:${input.orderId}`;
    const existing = Object.values(state.referralConversions).find((conversion) => conversion.relationshipId === relationship.relationshipId && conversion.orderId === input.orderId);
    if (existing) { remember(state, key, existing.conversionId, now); return existing; }
    const eligibility = version.rules.referral.referrerEligibility;
    const recentThreshold = eligibility.mode === "recent-valid-purchase" ? now.getTime() - eligibility.withinDays * 86_400_000 : 0;
    const eligible = eligibility.mode === "none" || (eligibility.mode === "active-subscription" && ((input.referrerCompletedOrders ?? 0) >= 1 || hasActiveSubscription(state, relationship.referrerMemberId))) || (eligibility.mode === "completed-orders" && (input.referrerCompletedOrders ?? 0) >= eligibility.minimumOrders) || (eligibility.mode === "lifetime-spend" && (input.referrerLifetimeSpend ?? 0) >= eligibility.minimumAmount) || (eligibility.mode === "recent-valid-purchase" && Date.parse(input.referrerLastValidPurchaseAt ?? "") >= recentThreshold);
    const calculatedReward = input.outcome === "completed" ? referralRewardAmount(version.rules, input.orderMerchandiseAmount, input.eligibleItemCount) : null;
    const repeatedAllowed = version.rules.referral.reward.repeatedRewards || !Object.values(state.referralConversions).some((item) => item.relationshipId === relationship.relationshipId && item.status === "rewarded");
    const rewardAmount = eligible && repeatedAllowed ? calculatedReward : null;
    const credit = rewardAmount ? issueCreditInState(state, version.rules, { memberId: relationship.referrerMemberId, sourceType: "referral", sourceReference, amount: rewardAmount, metadata: { relationshipId: relationship.relationshipId } }, now) : null;
    const conversionId = id("conversion");
    const pendingRewardAmount = input.outcome === "completed" && !eligible && calculatedReward ? calculatedReward : 0;
    const conversion: ReferralConversion = { conversionId, relationshipId: relationship.relationshipId, orderId: input.orderId, status: input.outcome === "uncollected" ? "uncollected" : credit ? "rewarded" : pendingRewardAmount ? "pending" : "ineligible", rewardCreditEntryId: credit?.creditEntryId ?? null, pendingRewardAmount, occurredAt: nowIso(now) };
    state.referralConversions[conversionId] = conversion;
    if (credit) relationship.status = "qualified";
    relationship.updatedAt = nowIso(now);
    remember(state, key, conversionId, now);
    const source = event(state, "referral_conversion", { status: conversion.status, rewardAmount: credit?.amount ?? 0 }, now, { memberId: relationship.referrerMemberId, orderId: input.orderId });
    if (credit) {
      notify(state, version.rules, "referral_conversion", source.eventId, now, { memberId: relationship.referrerMemberId, safeData: { rewardAmount: credit.amount } });
      notify(state, version.rules, "credit_issued", source.eventId, now, { memberId: relationship.referrerMemberId, safeData: { amount: credit.amount } });
    }
    return conversion;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function releasePendingReferralRewards(input: { referrerMemberId: string; completedOrders?: number; lifetimeSpend?: number; lastValidPurchaseAt?: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `referral:release-pending:${input.idempotencyKey}`;
  return transaction((state, now) => {
    if (remembered(state, key)) return [];
    const eligibility = version.rules.referral.referrerEligibility;
    const eligible = eligibility.mode === "none" || (eligibility.mode === "active-subscription" && ((input.completedOrders ?? 0) >= 1 || hasActiveSubscription(state, input.referrerMemberId))) || (eligibility.mode === "completed-orders" && (input.completedOrders ?? 0) >= eligibility.minimumOrders) || (eligibility.mode === "lifetime-spend" && (input.lifetimeSpend ?? 0) >= eligibility.minimumAmount) || (eligibility.mode === "recent-valid-purchase" && Date.parse(input.lastValidPurchaseAt ?? "") >= now.getTime() - eligibility.withinDays * 86_400_000);
    if (!eligible) return [];
    const relationshipIds = new Set(Object.values(state.referrals).filter((item) => item.referrerMemberId === input.referrerMemberId).map((item) => item.relationshipId));
    const released: CreditEntry[] = [];
    for (const conversion of Object.values(state.referralConversions).filter((item) => relationshipIds.has(item.relationshipId) && item.status === "pending" && item.pendingRewardAmount > 0)) {
      const credit = issueCreditInState(state, version.rules, { memberId: input.referrerMemberId, sourceType: "referral", sourceReference: `referral_conversion:${conversion.relationshipId}:${conversion.orderId}`, amount: conversion.pendingRewardAmount }, now);
      conversion.status = "rewarded";
      conversion.rewardCreditEntryId = credit.creditEntryId;
      conversion.pendingRewardAmount = 0;
      released.push(credit);
    }
    remember(state, key, released[0]?.creditEntryId ?? "none", now);
    return released;
  }, { now: input.now, filePath: input.stateFilePath });
}

function refreshExpiry(entry: CreditEntry, now: Date) {
  if (["available", "reserved"].includes(entry.status) && Date.parse(entry.expiresAt) <= now.getTime() && entry.remainingAmount > 0) entry.status = "expired";
}

function ownerDebitAllocated(state: MembershipCommerceState, creditEntryId: string) {
  return Object.values(state.creditEntries)
    .filter((entry) => entry.sourceReference.startsWith("admin_credit_adjustment:deduct:"))
    .flatMap((entry) => entry.adjustmentAllocations ?? [])
    .filter((allocation) => allocation.creditEntryId === creditEntryId)
    .reduce((sum, allocation) => sum + allocation.amount, 0);
}

export function effectiveCreditRemaining(state: MembershipCommerceState, entry: CreditEntry, now: Date) {
  if (entry.amount <= 0 || entry.remainingAmount <= 0 || !["available", "reserved"].includes(entry.status) || Date.parse(entry.expiresAt) <= now.getTime()) return 0;
  return Math.max(0, entry.remainingAmount - ownerDebitAllocated(state, entry.creditEntryId));
}

function availableCreditTotal(state: MembershipCommerceState, memberId: string, now: Date) {
  return Object.values(state.creditEntries)
    .filter((entry) => entry.memberId === memberId)
    .reduce((sum, entry) => sum + effectiveCreditRemaining(state, entry, now), 0);
}

export type AdminCreditAdjustmentInput = {
  memberId: string;
  direction: "grant" | "deduct";
  amount: number;
  reason: string;
  note?: string;
  idempotencyKey: string;
  now?: Date;
  stateFilePath?: string;
  rulesFilePath?: string;
};

/**
 * Appends an Owner adjustment to the canonical credit ledger under the same
 * transaction lock used by checkout. Debits reference positive entries and do
 * not rewrite their historical issuance rows.
 */
export async function adjustMemberCreditByAdmin(input: AdminCreditAdjustmentInput) {
  await assertCanonicalMember(input.memberId);
  if (!Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > 1_000_000) throw new MembershipCommerceError("調整金額必須是 1 至 1,000,000 元的整數");
  const amount = input.amount;
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(input.idempotencyKey)) throw new MembershipCommerceError("操作識別碼格式不正確");
  const reason = input.reason.trim();
  const note = input.note?.trim() ?? "";
  if (reason.length < 2 || reason.length > 80) throw new MembershipCommerceError("請填寫 2 至 80 字的調整原因");
  if (note.length > 300) throw new MembershipCommerceError("內部備註不可超過 300 字");
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `credit:admin-adjust:${input.idempotencyKey}`;

  return transaction((state, now) => {
    const existingId = remembered(state, key);
    if (existingId) {
      const existing = state.creditEntries[existingId];
      if (!existing) throw new MembershipCommerceError("找不到已完成的抵用金調整紀錄");
      return {
        entry: structuredClone(existing),
        balanceBefore: Number(existing.metadata.balanceBefore),
        balanceAfter: Number(existing.metadata.balanceAfter),
      };
    }

    const balanceBefore = availableCreditTotal(state, input.memberId, now);
    if (input.direction === "deduct" && amount > balanceBefore) throw new MembershipCommerceError("扣除金額超過目前可用抵用金");
    const balanceAfter = input.direction === "grant" ? balanceBefore + amount : balanceBefore - amount;
    const commonMetadata: CreditEntry["metadata"] = {
      adminAdjustment: true,
      direction: input.direction,
      reason,
      note,
      actor: "admin",
      balanceBefore,
      balanceAfter,
    };

    let entry: CreditEntry;
    if (input.direction === "grant") {
      entry = issueCreditInState(state, version.rules, {
        memberId: input.memberId,
        sourceType: "manual",
        sourceReference: `admin_credit_adjustment:grant:${input.idempotencyKey}`,
        amount,
        metadata: commonMetadata,
      }, now);
    } else {
      let remaining = amount;
      const allocations: NonNullable<CreditEntry["adjustmentAllocations"]> = [];
      const sources = Object.values(state.creditEntries)
        .filter((candidate) => candidate.memberId === input.memberId && effectiveCreditRemaining(state, candidate, now) > 0)
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.issuedAt.localeCompare(b.issuedAt) || a.creditEntryId.localeCompare(b.creditEntryId));
      for (const source of sources) {
        if (!remaining) break;
        const allocated = Math.min(remaining, effectiveCreditRemaining(state, source, now));
        if (!allocated) continue;
        allocations.push({ creditEntryId: source.creditEntryId, amount: allocated });
        remaining -= allocated;
      }
      if (remaining) throw new MembershipCommerceError("可用抵用金已變更，請重新整理後再試一次");
      const timestamp = nowIso(now);
      const creditEntryId = id("credit_adjustment");
      entry = {
        creditEntryId,
        memberId: input.memberId,
        sourceType: "manual",
        sourceReference: `admin_credit_adjustment:deduct:${input.idempotencyKey}`,
        amount: -amount,
        remainingAmount: 0,
        issuedAt: timestamp,
        expiresAt: timestamp,
        status: "consumed",
        createdAt: timestamp,
        metadata: commonMetadata,
        adjustmentAllocations: allocations,
      };
      state.creditEntries[creditEntryId] = entry;
    }

    remember(state, key, entry.creditEntryId, now);
    const source = event(state, "admin_credit_adjusted", { direction: input.direction, amount, balanceBefore, balanceAfter }, now, { memberId: input.memberId });
    if (input.direction === "grant") notify(state, version.rules, "credit_issued", source.eventId, now, { memberId: input.memberId, safeData: { amount } });
    audit(state, {
      actor: "admin",
      action: input.direction === "grant" ? "credit-adjustment-granted" : "credit-adjustment-deducted",
      entityType: "credit-entry",
      entityId: entry.creditEntryId,
      before: { availableCredit: balanceBefore },
      after: { availableCredit: balanceAfter, amount: input.direction === "grant" ? amount : -amount },
      reason,
      sourceEvent: source.eventId,
    }, now);
    return { entry: structuredClone(entry), balanceBefore, balanceAfter };
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function getAvailableCredit(memberId: string, now = new Date(), filePath = getMembershipCommerceStateFile()) {
  const state = await readMembershipCommerceState(filePath);
  return availableCreditTotal(state, memberId, now);
}

export async function getSafeOrderCreditReservation(input: { orderId: string; memberId: string; filePath?: string }): Promise<SafeOrderCreditReservation | null> {
  const state = await readMembershipCommerceState(input.filePath);
  const reservation = Object.values(state.creditReservations).find((item) => item.orderId === input.orderId && item.memberId === input.memberId);
  return reservation ? { orderNumber: reservation.orderId, amount: reservation.amount, status: reservation.status } : null;
}

export async function getCheckoutCreditQuote(input: { memberId: string; merchandiseSubtotal: number; shipping: number; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  await assertCanonicalMember(input.memberId);
  const [availableBalance, version] = await Promise.all([
    getAvailableCredit(input.memberId, input.now, input.stateFilePath),
    getActiveMembershipRules(input.now, input.rulesFilePath),
  ]);
  const policyMaximum = maximumCreditRedemption({ merchandiseSubtotal: input.merchandiseSubtotal, shipping: input.shipping, rules: version.rules });
  const maximumUsable = Math.min(availableBalance, policyMaximum);
  return { availableBalance, maximumUsable, payableWithoutCredit: input.merchandiseSubtotal + input.shipping, minimumPayable: input.merchandiseSubtotal + input.shipping - maximumUsable, uiMode: version.rules.credit.uiMode, rulesVersion: version.rulesVersion };
}

export async function reserveCredit(input: { memberId: string; orderId: string; requestedAmount: number; merchandiseSubtotal: number; shipping: number; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  await assertCanonicalMember(input.memberId);
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const maximum = maximumCreditRedemption({ merchandiseSubtotal: input.merchandiseSubtotal, shipping: input.shipping, rules: version.rules });
  const requested = Math.min(assertIntegerMoney(input.requestedAmount, "要求折抵金額"), maximum);
  const key = `credit:reserve:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const existingId = remembered(state, key);
    if (existingId) return state.creditReservations[existingId];
    const duplicateOrder = Object.values(state.creditReservations).find((reservation) => reservation.orderId === input.orderId && reservation.status === "reserved");
    if (duplicateOrder) throw new MembershipCommerceError("此訂單已有抵用金保留");
    const entries = Object.values(state.creditEntries).filter((entry) => {
      refreshExpiry(entry, now);
      return entry.memberId === input.memberId && entry.status === "available" && entry.remainingAmount > 0;
    }).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.issuedAt.localeCompare(b.issuedAt) || a.creditEntryId.localeCompare(b.creditEntryId));
    const available = entries.reduce((sum, entry) => sum + effectiveCreditRemaining(state, entry, now), 0);
    if (requested > available) throw new MembershipCommerceError("可用抵用金不足");
    let remaining = requested;
    const allocations: CreditReservation["allocations"] = [];
    for (const entry of entries) {
      if (!remaining) break;
      const amount = Math.min(remaining, effectiveCreditRemaining(state, entry, now));
      if (!amount) continue;
      entry.remainingAmount -= amount;
      entry.status = effectiveCreditRemaining(state, entry, now) === 0 ? "reserved" : "available";
      allocations.push({ creditEntryId: entry.creditEntryId, amount });
      remaining -= amount;
    }
    const reservationId = id("reserve");
    const timestamp = nowIso(now);
    const reservation: CreditReservation = { reservationId, memberId: input.memberId, orderId: input.orderId, requestedAmount: input.requestedAmount, amount: requested, allocations, status: "reserved", createdAt: timestamp, updatedAt: timestamp };
    state.creditReservations[reservationId] = reservation;
    remember(state, key, reservationId, now);
    audit(state, { actor: "member", action: "credit-reserved", entityType: "credit-reservation", entityId: reservationId, before: {}, after: { amount: requested }, reason: "會員選擇使用抵用金", sourceEvent: input.orderId }, now);
    return reservation;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function settleCreditReservation(input: { reservationId: string; action: "consume" | "release"; idempotencyKey: string; reason: string; now?: Date; stateFilePath?: string }) {
  const key = `credit:${input.action}:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const reservation = state.creditReservations[input.reservationId];
    if (!reservation) throw new MembershipCommerceError("找不到抵用金保留紀錄");
    if (remembered(state, key)) return reservation;
    const targetStatus = input.action === "consume" ? "consumed" : "released";
    if (reservation.status === targetStatus) { remember(state, key, reservation.reservationId, now); return reservation; }
    if (reservation.status !== "reserved") throw new MembershipCommerceError("此抵用金保留紀錄已完成處理");
    for (const allocation of reservation.allocations) {
      const entry = state.creditEntries[allocation.creditEntryId];
      if (!entry) throw new MembershipCommerceError("抵用金來源紀錄遺失");
      if (input.action === "release") {
        entry.remainingAmount += allocation.amount;
        entry.status = Date.parse(entry.expiresAt) <= now.getTime() ? "expired" : "available";
      } else if (effectiveCreditRemaining(state, entry, now) === 0) entry.status = "consumed";
    }
    reservation.status = targetStatus;
    reservation.updatedAt = nowIso(now);
    remember(state, key, reservation.reservationId, now);
    audit(state, { actor: "system", action: `credit-${input.action}d`, entityType: "credit-reservation", entityId: reservation.reservationId, before: { status: "reserved" }, after: { status: targetStatus, amount: reservation.amount }, reason: input.reason, sourceEvent: reservation.orderId }, now);
    return reservation;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function settleCreditReservationForOrder(input: { orderId: string; action: "consume" | "release"; idempotencyKey: string; reason: string; now?: Date; stateFilePath?: string }) {
  const state = await readMembershipCommerceState(input.stateFilePath);
  const reservation = Object.values(state.creditReservations).find((item) => item.orderId === input.orderId);
  if (!reservation) return null;
  return settleCreditReservation({ reservationId: reservation.reservationId, action: input.action, idempotencyKey: input.idempotencyKey, reason: input.reason, now: input.now, stateFilePath: input.stateFilePath });
}

export async function recordCycleFulfillment(input: { cycleId: string; orderId: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:complete:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return { cycle, giftProgress: giftProgress(state, cycle.subscriptionId) };
    if (!["order_created", "shipped", "ready_for_pickup"].includes(cycle.status)) throw new MembershipCommerceError("本期尚未進入可完成取貨的狀態");
    const subscription = state.subscriptions[cycle.subscriptionId];
    const nextProgress = giftProgress(state, subscription.subscriptionId) + 1;
    cycle.status = "completed";
    cycle.updatedAt = nowIso(now);
    const source = event(state, "qualifying_fulfillment", { fulfillmentNumber: nextProgress, originalPriceOrder: false }, now, { memberId: subscription.memberId, subscriptionId: subscription.subscriptionId, orderId: input.orderId });
    remember(state, key, cycle.cycleId, now);
    if (giftEligibleAt(nextProgress, cycle.rulesSnapshot?.rules ?? version.rules)) notify(state, cycle.rulesSnapshot?.rules ?? version.rules, "gift_eligible", source.eventId, now, { memberId: subscription.memberId, safeData: { fulfillmentNumber: nextProgress } });
    return { cycle, giftProgress: nextProgress };
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function getGiftProgress(subscriptionId: string, filePath = getMembershipCommerceStateFile()) {
  return giftProgress(await readMembershipCommerceState(filePath), subscriptionId);
}

export function nextScheduledDate(anchorDate: string, intervalDays: number, sequence: number) {
  if (!Number.isSafeInteger(intervalDays) || intervalDays < 1 || !Number.isSafeInteger(sequence) || sequence < 1) throw new MembershipCommerceError("配送週期資料不正確");
  return addTaipeiCalendarDays(anchorDate, intervalDays * sequence);
}

export function safeReferralMemberView(state: MembershipCommerceState, referrerMemberId: string) {
  return Object.values(state.referrals).filter((item) => item.referrerMemberId === referrerMemberId).map((item) => ({ memberNumberReference: item.referredMemberId, safeDisplayName: item.safeDisplayName, joined: true, qualifiedPurchases: Object.values(state.referralConversions).filter((conversion) => conversion.relationshipId === item.relationshipId && conversion.status === "rewarded").length, rewards: Object.values(state.referralConversions).filter((conversion) => conversion.relationshipId === item.relationshipId && conversion.status === "rewarded").reduce((sum, conversion) => sum + (conversion.rewardCreditEntryId ? state.creditEntries[conversion.rewardCreditEntryId]?.amount ?? 0 : 0), 0), status: item.status }));
}

export async function getMemberCommerceDashboard(memberId: string, now = new Date(), filePath = getMembershipCommerceStateFile()) {
  const state = await readMembershipCommerceState(filePath);
  const subscriptions = Object.values(state.subscriptions).filter((item) => item.memberId === memberId);
  const subscriptionIds = new Set(subscriptions.map((item) => item.subscriptionId));
  const cycles = Object.values(state.cycles).filter((item) => subscriptionIds.has(item.subscriptionId)).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  const credits: MemberCreditHistoryEntry[] = Object.values(state.creditEntries).filter((item) => item.memberId === memberId).map((item) => {
    const remainingAmount = effectiveCreditRemaining(state, item, now);
    const status = Date.parse(item.expiresAt) <= now.getTime() && item.amount > 0 ? "expired" as const : remainingAmount === 0 && item.status === "available" ? "consumed" as const : item.status;
    const direction = item.amount < 0 ? "deduct" as const : "grant" as const;
    const sourceLabel = item.sourceType === "referral"
      ? "推薦回饋" as const
      : item.sourceReference.startsWith("admin_credit_adjustment:grant:")
        ? "KD Coffee 贈送" as const
        : direction === "deduct"
          ? "抵用金調整" as const
          : "會員抵用金" as const;
    const orderRedemptions = Object.values(state.creditReservations)
      .filter((reservation) => reservation.memberId === memberId)
      .flatMap((reservation) => reservation.allocations
        .filter((allocation) => allocation.creditEntryId === item.creditEntryId && allocation.amount > 0)
        .map((allocation) => ({ orderNumber: reservation.orderId, amount: allocation.amount, status: reservation.status })));
    return { creditEntryId: item.creditEntryId, amount: item.amount, remainingAmount, issuedAt: item.issuedAt, expiresAt: item.expiresAt, status, direction, sourceLabel, orderRedemptions };
  });
  const pendingCredit = Object.values(state.referralConversions).filter((conversion) => conversion.status === "pending" && state.referrals[conversion.relationshipId]?.referrerMemberId === memberId).reduce((sum, item) => sum + item.pendingRewardAmount, 0);
  return { subscriptions: structuredClone(subscriptions), cycles: structuredClone(cycles), credits: structuredClone(credits), pendingCredit, referrals: safeReferralMemberView(state, memberId) };
}

export async function getMemberReferralCenter(memberId: string, options: { baseUrl?: string; depth?: number; filePath?: string; rulesFilePath?: string } = {}) {
  await assertCanonicalMember(memberId);
  const [state, version, registry] = await Promise.all([readMembershipCommerceState(options.filePath), getActiveMembershipRules(new Date(), options.rulesFilePath), getIdentityRegistrySnapshot()]);
  const depth = Math.max(1, Math.min(options.depth ?? version.rules.referral.referralMaxRewardDepth, version.rules.referral.referralMaxRewardDepth, 10));
  const nodes: Array<{ memberNumber: string; safeDisplayName: string; level: number; parentMemberNumber: string }> = [];
  let frontier = [memberId];
  const visited = new Set([memberId]);
  for (let level = 1; level <= depth && frontier.length; level += 1) {
    const next: string[] = [];
    for (const parentId of frontier) {
      for (const relation of Object.values(state.referrals).filter((item) => item.referrerMemberId === parentId && item.status !== "inactive").slice(0, 200)) {
        if (visited.has(relation.referredMemberId)) continue;
        visited.add(relation.referredMemberId); next.push(relation.referredMemberId);
        nodes.push({ memberNumber: registry.members[relation.referredMemberId]?.memberNumber ?? "KD-會員", safeDisplayName: relation.safeDisplayName || "KD Coffee 會員", level, parentMemberNumber: registry.members[parentId]?.memberNumber ?? "KD-會員" });
      }
    }
    frontier = next;
  }
  const rewards = Object.values(state.referralRewards).filter((item) => item.beneficiaryMemberId === memberId);
  const summaries = Array.from({ length: depth }, (_, index) => {
    const level = index + 1;
    const levelRewards = rewards.filter((item) => item.referralLevel === level);
    return { level, members: nodes.filter((item) => item.level === level).length, pendingCredit: levelRewards.filter((item) => item.status === "scheduled" && item.qualificationStatus !== "expired").reduce((sum, item) => sum + item.calculatedCreditAmount, 0), releasedCredit: levelRewards.filter((item) => item.status === "released").reduce((sum, item) => sum + item.calculatedCreditAmount, 0), aggregateEligibleSpend: levelRewards.reduce((sum, item) => sum + item.paidAmountBasis, 0) };
  });
  const referralCode = referralCodeForMember(memberId);
  const referralUrl = `${(options.baseUrl ?? "").replace(/\/$/, "")}/member?ref=${encodeURIComponent(referralCode)}`;
  return { referralCode, referralUrl, mode: version.rules.referral.referralRewardCalculationMode, pvDisclosure: version.rules.referral.referralRewardCalculationMode === "pv" ? "本制度以 PV 計算，非商品售價百分比。PV 是商品獎勵計算單位，不是貨幣或可交易資產。" : null, maxDepth: depth, summaries, nodes, rewards: rewards.map((item) => ({ rewardId: item.rewardId, sourceOrderNumber: item.sourceOrderNumber, referralLevel: item.referralLevel, rewardType: item.rewardType, calculationMode: item.calculationMode, effectivePV: item.effectivePV, rewardRate: item.rewardRate, rewardPV: item.rewardPV, creditAmount: item.calculatedCreditAmount, projectedCreditAmount: item.projectedCreditAmount ?? item.calculatedCreditAmount, status: item.status, cancellationReason: item.cancellationReason ?? null, qualificationStatus: item.qualificationStatus ?? "legacy", qualificationExpiresAt: item.qualificationExpiresAt ?? null, qualificationOrderNumber: item.qualificationOrderNumber ?? null, qualificationOrderCreatedAt: item.qualificationOrderCreatedAt ?? null, qualificationOrderFinalState: item.qualificationOrderFinalState ?? null, qualificationQualifiedAt: item.qualificationQualifiedAt ?? null, successfulPickupBusinessDate: item.successfulPickupBusinessDate ?? null, releaseEligibleBusinessDate: item.releaseEligibleBusinessDate ?? item.scheduledReleaseAt?.slice(0, 10) ?? null, releasedAt: item.releasedAt })) };
}

export async function getAdminReferralOverview(input: { query?: string; from?: string; to?: string; filePath?: string } = {}) {
  const [state, registry] = await Promise.all([readMembershipCommerceState(input.filePath), getIdentityRegistrySnapshot()]);
  const query = input.query?.trim().toLowerCase() ?? "";
  const relationships = Object.values(state.referrals).map((item) => ({ ...item, referrerNumber: registry.members[item.referrerMemberId]?.memberNumber ?? "—", referredNumber: registry.members[item.referredMemberId]?.memberNumber ?? "—" })).filter((item) => !query || item.referrerNumber.toLowerCase().includes(query) || item.referredNumber.toLowerCase().includes(query) || item.safeDisplayName.toLowerCase().includes(query));
  const rewards = Object.values(state.referralRewards).filter((item) => (!input.from || item.createdAt.slice(0, 10) >= input.from) && (!input.to || item.createdAt.slice(0, 10) <= input.to));
  const sum = (status?: ReferralReward["status"], type?: ReferralReward["rewardType"], mode?: ReferralReward["calculationMode"]) => rewards.filter((item) => (!status || item.status === status) && (!type || item.rewardType === type) && (!mode || item.calculationMode === mode)).reduce((total, item) => total + item.calculatedCreditAmount, 0);
  return { relationships, rewards, statistics: { newReferralRewards: sum(undefined, "new_referral"), subscriptionRewards: sum(undefined, "subscription"), pendingAmount: rewards.filter((item) => item.status === "scheduled" && item.qualificationStatus !== "expired").reduce((total, item) => total + item.calculatedCreditAmount, 0), expiredAmount: rewards.filter((item) => item.qualificationStatus === "expired").reduce((total, item) => total + item.calculatedCreditAmount, 0), releasedAmount: sum("released"), reversedAmount: sum("reversed"), paidAmountModeRewards: sum(undefined, undefined, "paid_amount"), pvModeRewards: sum(undefined, undefined, "pv"), totalRewardCost: sum("released") } };
}

export async function enqueueScheduledMembershipNotifications(input: { today: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  return transaction((state, now) => {
    let queued = 0;
    const enqueueOnce = (key: string, eventType: NotificationEvent["eventType"], memberId: string, safeData: NotificationEvent["safeData"]) => {
      if (remembered(state, key)) return;
      const notice = notify(state, version.rules, eventType, key, now, { memberId, safeData });
      if (!notice) return;
      remember(state, key, notice.notificationId, now);
      queued += 1;
    };

    for (const cycle of Object.values(state.cycles)) {
      if (!["scheduled", "modifiable"].includes(cycle.status)) continue;
      const subscription = state.subscriptions[cycle.subscriptionId];
      if (!subscription || subscription.status !== "active") continue;
      if (addTaipeiCalendarDays(cycle.plannedDate, -version.rules.notification.nextCycleReminderDays) === input.today) {
        enqueueOnce(`notification:next-cycle:${cycle.cycleId}:${input.today}`, "modification_window", subscription.memberId, { cycleId: cycle.cycleId, plannedDate: cycle.plannedDate, modificationDeadline: cycle.modificationDeadline });
      }
      if (addTaipeiCalendarDays(cycle.modificationDeadline, -version.rules.notification.modificationCutoffReminderDays) === input.today) {
        enqueueOnce(`notification:cutoff:${cycle.cycleId}:${input.today}`, "deadline_tomorrow", subscription.memberId, { cycleId: cycle.cycleId, plannedDate: cycle.plannedDate, modificationDeadline: cycle.modificationDeadline });
      }
    }

    for (const entry of Object.values(state.creditEntries)) {
      const remainingAmount = effectiveCreditRemaining(state, entry, now);
      if (remainingAmount <= 0 || !["available", "reserved"].includes(entry.status)) continue;
      const finalUsableDate = addTaipeiCalendarDays(entry.expiresAt.slice(0, 10), -1);
      if (addTaipeiCalendarDays(finalUsableDate, -version.rules.credit.expiryReminderDays) !== input.today) continue;
      enqueueOnce(`notification:credit-expiry:${entry.creditEntryId}:${input.today}`, "credit_expiring", entry.memberId, { creditEntryId: entry.creditEntryId, amount: remainingAmount, expiresOn: finalUsableDate });
    }
    return { queued };
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function previewMembershipRulesImpact(nextRules: unknown, filePath = getMembershipCommerceStateFile()) {
  const validated = validateMembershipBusinessRules(nextRules);
  const [state, active] = await Promise.all([readMembershipCommerceState(filePath), getActiveMembershipRules()]);
  const changedAreas = (["subscription", "pickup", "credit", "referral", "gift", "notification", "fulfillment", "ownerExceptions"] as const)
    .filter((key) => JSON.stringify(active.rules[key]) !== JSON.stringify(validated[key]));
  const affectedCycles = Object.values(state.cycles).filter((cycle) => ["scheduled", "modifiable"].includes(cycle.status)).length;
  const lockedCyclesPreserved = Object.values(state.cycles).filter((cycle) => Boolean(cycle.rulesSnapshot) || ["locked", "order_created", "shipped", "ready_for_pickup", "completed"].includes(cycle.status)).length;
  const activeSubscriptions = Object.values(state.subscriptions).filter((subscription) => subscription.status === "active").length;
  const pendingReferralRewardsPreserved = Object.values(state.referralRewards).filter((reward) => reward.status === "scheduled").length;
  const historicalReferralRewardsPreserved = Object.values(state.referralRewards).filter((reward) => reward.status !== "scheduled").length;
  const referralMembersAffectedByDepth = new Set(Object.values(state.referrals).flatMap((item) => [item.referrerMemberId, item.referredMemberId])).size;
  return { changedAreas, affectedCycles, activeSubscriptions, lockedCyclesPreserved, pendingReferralRewardsPreserved, historicalReferralRewardsPreserved, referralMembersAffectedByDepth, nextRulesVersion: active.rulesVersion + 1 };
}

export async function claimNextMembershipNotification(options: { now?: Date; stateFilePath?: string } = {}) {
  return transaction((state, now) => {
    const notice = state.notifications.find((item) => item.status === "pending");
    if (!notice) return null;
    const maximum = notice.deliveryPolicy?.maxAttempts ?? 1;
    if ((notice.attempts ?? 0) >= maximum) {
      notice.status = "failed";
      return null;
    }
    notice.status = "processing";
    notice.attempts = (notice.attempts ?? 0) + 1;
    notice.lastAttemptAt = nowIso(now);
    return structuredClone(notice);
  }, { now: options.now, filePath: options.stateFilePath });
}

export async function completeMembershipNotificationDelivery(input: { notificationId: string; deliveredChannels: NotificationEvent["channels"]; error?: string; now?: Date; stateFilePath?: string }) {
  return transaction((state) => {
    const notice = state.notifications.find((item) => item.notificationId === input.notificationId);
    if (!notice) throw new MembershipCommerceError("找不到會員通知工作");
    if (notice.status !== "processing") return notice;
    notice.deliveredChannels = [...new Set(input.deliveredChannels)];
    notice.lastError = input.error?.slice(0, 300);
    const requestedExternal = notice.channels.filter((channel) => channel === "line" || channel === "email");
    const deliveredExternal = requestedExternal.filter((channel) => notice.deliveredChannels?.includes(channel));
    const emailFallbackDelivered = requestedExternal.includes("line") && notice.deliveredChannels.includes("email") && notice.deliveryPolicy?.emailFallback;
    if (!requestedExternal.length || deliveredExternal.length === requestedExternal.length || emailFallbackDelivered) notice.status = "delivered";
    else notice.status = (notice.attempts ?? 0) < (notice.deliveryPolicy?.maxAttempts ?? 1) ? "pending" : "failed";
    return structuredClone(notice);
  }, { now: input.now, filePath: input.stateFilePath });
}
