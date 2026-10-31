import { validateSubscriptionCreditPreference, type SubscriptionCreditPreference } from "./subscriptionCreditPreference";
import { collectProtectedCreditEvidenceReferences, retainProtectedCreditEvidence } from "./returnCreditCleanupProtection";
import { createHash, randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { isDeepStrictEqual } from "node:util";
import { allocateApprovedReturnPayment } from "./returnPaymentAllocation";
import { planApprovedReturnSettlement, projectReturnSettlements, assertSettlementPrefix, appendSettlementEvent, returnCreditSettlementSummary, type SettlementEvent } from "./returnSettlementLedger";
import { approvedReturnCreditSelection } from "./returnCreditSelection";
import { originalReturnCreditSources, buildReturnConfirmationPreview, signReturnPreview, verifyReturnPreviewToken, ReturnWorkflowError } from "./returnCreditPreview";

import { listOrders, readOrder, withStoredOrderUpdateLock } from "./adminOrders";
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
import type {
  RewardCalculationBasis,
  SelfPurchaseRewardTierRules,
} from "./membershipRuleTypes";
import {
  calculateSelfPurchaseTierReward,
  type SelfPurchaseTierRewardResult,
} from "./selfPurchaseRewardTiers";
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
import { allocatePreservedRewardMoney, cumulativeOriginalLineContribution, originalEconomicFingerprint, resolveOrderRewardBasis, type OrderRewardBasis } from "./orderRewardBasis";

async function persistedOrderRewardBasis(orderId: string) {
  const order = await readOrder(orderId);
  return order ? resolveOrderRewardBasis(order) : null;
}
function currentRewardsAllowed(basis: OrderRewardBasis | null) {
  return !basis || (basis.rewardEligible && basis.monetaryBasisStatus === "resolved");
}
function isolatePaidRewardInput<T extends { paidAmountBasis: number; basePV?: number; effectivePV?: number; discountRatio?: number }>(input: T, basis: OrderRewardBasis | null): T {
  if (!basis?.hasStore) return input;
  return { ...input, paidAmountBasis: basis.rewardMerchandiseAmount!,
    basePV: basis.totalBasePV, effectivePV: basis.totalEffectivePV,
    discountRatio: basis.totalBasePV > 0 ? Math.min(1, basis.totalEffectivePV / basis.totalBasePV) : 1 };
}
import { hasOrderCompletion, resolveOrderEconomicAllocation, resolveReturnLineEvidence, returnDeadlineAtTaipeiDayEnd } from "./orderCompletion";
import {
  approvedReturnLines, assertReturnEventsPreserved, normalizeReturnCommand, preservedReturnCompletion, projectOrderReturns,
  returnCommandConflict, returnEvidenceText, validateReturnEventLog,
  type ReturnActor, type ReturnCommand, type ReturnCommandResult, type ReturnDomainEvent, type ReturnRequestStatus,
} from "./orderReturns";
import {
  buildRewardWaitingExplanation,
  buildSafeRewardSourceOrderSummary,
  resolveEffectiveRewardDisplayStatus,
  selectHistoricalRewardWaitingRule,
  summarizePendingRewards,
  type RewardWaitingRuleSnapshot,
} from "./memberRewardPresentation";
import { createHomeDeliveryPaymentSnapshot, type HomeDeliveryPaymentMethod } from "./homeDeliveryPayment";
import { validateDeliveryAddress, type DeliveryAddress } from "./deliveryAddress";
import { subscriptionShippingFee, type KdShippingMethod } from "./shippingRules";
import { getMembershipCommerceStateFile } from "./storagePaths";
import {
  DEDICATED_ROAST_STANDARD_PREPARATION_DAYS,
  dedicatedRoastRushRequired,
  subscriptionHasDedicatedRoast,
} from "./subscriptionRoastPolicy";
import type { RetailPromotionOrderSnapshot } from "./retailPromotionAttribution";

export const MEMBERSHIP_COMMERCE_SCHEMA_VERSION = 1 as const;

export type SubscriptionStatus = "pending_activation" | "active" | "paused" | "terminated";
export type CycleStatus = "scheduled" | "modifiable" | "locked" | "order_created" | "shipped" | "ready_for_pickup" | "completed" | "skipped" | "blocked_stock" | "cancelled" | "uncollected";
export type CycleKind = "scheduled" | "manual_replenishment";

export type SubscriptionDefaultItem = SubscriptionItem & { unitPrice: number };

export type Subscription = {
  creditPreference?: SubscriptionCreditPreference;
  subscriptionId: string;
  memberId: string;
  status: SubscriptionStatus;
  startedFromOrderId: string;
  anchorDate: string;
  intervalDays: number;
  shippingMethod: string;
  storeSelection: { storeId: string; storeName: string } | null;
  deliveryAddress?: DeliveryAddress | null;
  paymentMethod?: HomeDeliveryPaymentMethod | null;
  defaultItems: SubscriptionDefaultItem[];
  rulesVersion: number;
  statusReason: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  memberHiddenAt?: string | null;
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
  codServiceFee?: number;
  finalAmount: number;
  currency: "TWD";
  roundingMode: string;
};

export type SubscriptionCycle = {
  creditPreferenceSnapshot?: SubscriptionCreditPreference;
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
  shippingSnapshot: { method: string; storeSelection: { storeId: string; storeName: string } | null; deliveryAddress?: DeliveryAddress | null; paymentMethod?: HomeDeliveryPaymentMethod | null; codServiceFee?: number; freeShipping: boolean } | null;
  paymentSnapshot?: { method: HomeDeliveryPaymentMethod } | null;
  rulesSnapshot: RulesVersion | null;
  createdOrderId: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
  modificationCount?: number;
  dedicatedRoastRush?: { warningAcknowledged: boolean; acknowledgedAt?: string; plannedDate: string; standardPreparationDays: number } | null;
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
  /** New conversion evidence only; missing legacy evidence is never backfilled. */
  originalCalculation?: { rulesVersion: number; merchandiseAmount: number; eligibleItemCount: number;
    calculatedRewardAmount: number; referrerEligibleAtCreation: boolean; repeatedAllowedAtCreation: boolean };
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
  validConsumptionPV?: number;
  includeCreditDiscount: boolean;
  includeShipping: boolean;
  activeSubscriptionAtCompletion: boolean;
  rulesVersion: number;
  qualificationRulesSnapshot: MembershipBusinessRules["referral"]["payoutQualification"];
  idempotencyKey: string;
  /** Missing on historical events means the completed consumption remains valid. */
  reversedAt?: string | null;
  reversalOutcome?: "cancelled" | "uncollected" | "refunded" | "returned";
};

export type QualificationPathEvaluation = {
  windowDays: number;
  windowStartedAt: string;
  windowEndedAt: string;
  qualificationBasis?: MembershipBusinessRules["referral"]["payoutQualification"]["qualificationBasis"];
  threshold: number;
  cumulativeAmount: number;
  eligibleEventIds: string[];
  activeSubscriptionRequired: boolean;
  activeSubscriptionSatisfied: boolean;
  passed: boolean;
};

export type MemberReferralQualificationEvidence = {
  eventId: string;
  orderNumber: string;
  finalizedAt: string;
  amount: number;
  remainingAmount: number;
  activeSubscriptionAtCompletion: boolean;
};

export type MemberReferralQualificationPath = {
  path: "general" | "subscription";
  windowDays: number;
  windowStartedAt: string;
  windowEndedAt: string;
  threshold: number;
  cumulativeAmount: number;
  remainingToThreshold: number;
  progressPercent: number;
  activeSubscriptionRequired: boolean;
  activeSubscriptionSatisfied: boolean;
  passed: boolean;
  evidence: MemberReferralQualificationEvidence[];
};

export type MemberReferralQualificationCoverageEvidence = {
  eventId: string;
  orderNumber: string;
  finalizedAt: string;
  eventAmount: number;
  allocatedAmount: number;
  cumulativeAllocatedAmount: number;
  triggeredQualification: boolean;
  activeSubscriptionAtCompletion: boolean;
};

export type MemberReferralQualificationProgress = {
  mode: MembershipBusinessRules["referral"]["payoutQualification"]["mode"];
  qualificationBasis: MembershipBusinessRules["referral"]["payoutQualification"]["qualificationBasis"];
  pointDisplayName: string;
  activeSubscriptionNow: boolean;
  isQualifiedNow: boolean;
  progressConditionsPassed: boolean;
  status: "qualified" | "ready_on_next_completion" | "in_progress";
  activeCoverage: {
    roundId: string;
    qualifiedAt: string;
    coverageStartsAt: string;
    coverageEndsAt: string;
    selectedPaths: Array<"general" | "subscription">;
    rulesVersion: number;
    qualificationBasis: "money" | "pv";
    consumedAmount: number;
    availableAmountBefore: number;
    remainingAmountAfter: number;
    sourceEvidence: MemberReferralQualificationCoverageEvidence[];
  } | null;
  general: MemberReferralQualificationPath;
  subscription: MemberReferralQualificationPath;
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
  qualificationBasis?: MembershipBusinessRules["referral"]["payoutQualification"]["qualificationBasis"];
  generalPath: QualificationPathEvaluation;
  subscriptionPath: QualificationPathEvaluation;
  finalQualified: true;
  selectedAccountingPaths: Array<"general" | "subscription">;
  excessConsumptionMode: MembershipBusinessRules["referral"]["payoutQualification"]["excessConsumptionMode"];
  consumptionAccounting: {
    basis?: MembershipBusinessRules["referral"]["payoutQualification"]["qualificationBasis"];
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

export type ReferralRewardQualificationAuthority =
  | "legacy_order"
  | "qualification_coverage"
  | "self_purchase_direct";

export type SelfPurchaseTierEvidenceSnapshot = {
  validConsumptionEventId: string | null;
  sourceOrderId: string;
  finalizedAt: string;
  thresholdAmount: number;
  role: "prior" | "current";
};

export type SelfPurchaseTierRewardSnapshot = {
  featureEnabled: true;
  rules: Omit<SelfPurchaseRewardTierRules, "enabled">;
  payout: {
    calculationMode: "paid_amount" | "pv";
    pvRewardMoneyValue: number;
    moneyRoundingMode: MembershipBusinessRules["money"]["roundingMode"];
  };
  windowStartedAt: string;
  windowEndedAt: string;
  initialEvidence: SelfPurchaseTierEvidenceSnapshot[];
  latestEvidence: SelfPurchaseTierEvidenceSnapshot[];
  initialResult: SelfPurchaseTierRewardResult;
  latestResult: SelfPurchaseTierRewardResult;
};

export type ReferralReward = {
  rewardId: string;
  sourceOrderNumber: string;
  sourceMemberId: string;
  beneficiaryMemberId: string;
  referralLevel: number;
  rewardType: "new_referral" | "repeat_purchase" | "subscription" | "self_purchase";
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
  /** Present only for rewards created by the dynamic B3 own-purchase tier engine. */
  selfPurchaseTierSnapshot?: SelfPurchaseTierRewardSnapshot;
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

export type RetailPromotionReward = {
  rewardId: string;
  sourceOrderNumber: string;
  beneficiaryMemberId: string;
  referralCode: string;
  attributedAt: string;
  attributionExpiresAt: string;
  attributionSource: "member-share-link";
  eligibleMerchandiseAmount: number;
  calculationBasis?: RewardCalculationBasis;
  calculationBaseValue?: number;
  rewardRate: number;
  rewardPV?: number;
  pvRewardMoneyValue?: number;
  calculatedCreditAmount: number;
  ruleVersion: number;
  roundingModeSnapshot: MembershipBusinessRules["money"]["roundingMode"];
  baseWaitingDaysSnapshot: number;
  returnProtectionDaysSnapshot: number;
  totalWaitingDaysSnapshot: number;
  reversalPolicySnapshot: MembershipBusinessRules["referral"]["reversalPolicy"];
  successfulCompletionAt: string;
  successfulPickupBusinessDate: string;
  releaseEligibleBusinessDate: string;
  createdAt: string;
  releasedAt: string | null;
  reversedAt?: string | null;
  sourceOrderFinalState: "completed" | "cancelled" | "uncollected" | "refunded" | "returned";
  status: "scheduled" | "released" | "cancelled" | "reversed";
  cancellationReason?: string | null;
  rewardCreditEntryId: string | null;
  reversalCreditEntryId: string | null;
  idempotencyKey: string;
};

export type CreditEntry = {
  creditEntryId: string;
  memberId: string;
  sourceType: "referral" | "member_reward" | "manual" | "promotion" | "compensation";
  sourceReference: string;
  /** Historical custom display labels are preserved, never inferred or renamed. */
  sourceLabel?: string;
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
  rulesVersion?: number;
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
  sourceCopyKey?: string;
  sourceLabel: string;
  sourceOrderNumber: string | null;
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
  retailPromotionRewards: Record<string, RetailPromotionReward>;
  validConsumptionEvents: Record<string, ValidConsumptionEvent>;
  qualificationRounds: Record<string, QualificationRound>;
  referralRewardCoverages: Record<string, ReferralRewardCoverage>;
  referralRewardMaturations: Record<string, ReferralRewardMaturation>;
  creditEntries: Record<string, CreditEntry>;
  creditReservations: Record<string, CreditReservation>;
  events: CommerceEvent[];
  /** Absent in historical state. Immutable facts; statuses/quantities are replayed, never stored separately. */
  returnEvents?: ReturnDomainEvent[];
  returnSettlementEvents?: SettlementEvent[];
  notifications: NotificationEvent[];
  audit: AuditRecord[];
  idempotency: Record<string, { resultId: string; occurredAt: string }>;
};

export type OriginalRewardOrderEvidence = {
  orderId: string;
  /** Original creation time, never completion, reward generation or later review time. */
  orderCreatedAt: string;
  timeSource: "completion_snapshot" | "persisted_order" | "legacy_qualification_attempt";
  completedAt: string | null;
  consumptionEventId: string | null;
};
export type RewardDependencyEvidenceResult =
  | { status: "manual_review_required"; reason: "reward_not_found" | "missing_original_order_evidence"
      | "inconsistent_dependency_evidence" | "missing_qualification_evidence" }
  | { status: "resolved"; schemaVersion: 1; program: "referral" | "retail_promotion";
      rewardId: string; rewardType: ReferralReward["rewardType"] | "retail_promotion";
      authority: ReferralRewardQualificationAuthority | null;
      sourceOrder: OriginalRewardOrderEvidence; qualificationOrders: OriginalRewardOrderEvidence[];
      /** Preserved policy and monetary evidence, not a new eligibility/payout decision. */
      reward: ReferralReward | RetailPromotionReward;
      consumptions: ValidConsumptionEvent[]; qualificationRound: QualificationRound | null;
      coverage: ReferralRewardCoverage | null; maturation: ReferralRewardMaturation | null;
      creditEntry: CreditEntry | null; sourceReferences: string[]; idempotencyKeys: string[] };

/** Read-only dependency evidence for future return logic. No clock, rules lookup, role
 * requirement, qualification creation, scheduler, payout or reversal is invoked here.
 * Callers must supply one consistent state snapshot; orders are read once per identity.
 * A resolved result preserves evidence; it does NOT assert present reward eligibility. */
export async function resolveRewardDependencyEvidence(input: {
  program: "referral" | "retail_promotion";
  rewardId: string;
  state: MembershipCommerceState;
  readSourceOrder?: (orderId: string) => Promise<Record<string, unknown> | null>;
}): Promise<RewardDependencyEvidenceResult> {
  const state = structuredClone(input.state);
  const retail = input.program === "retail_promotion";
  const reward = retail ? state.retailPromotionRewards[input.rewardId] : state.referralRewards[input.rewardId];
  const manual = (reason: Extract<RewardDependencyEvidenceResult, { status: "manual_review_required" }>["reason"]): RewardDependencyEvidenceResult => ({ status: "manual_review_required", reason });
  if (!reward) return manual("reward_not_found");
  if (reward.rewardId !== input.rewardId) return manual("inconsistent_dependency_evidence");
  const referral = retail ? null : reward as ReferralReward;
  if (referral?.qualificationAuthority !== undefined
    && !["legacy_order", "qualification_coverage", "self_purchase_direct"].includes(referral.qualificationAuthority)) return manual("inconsistent_dependency_evidence");
  const authority = referral ? referralRewardQualificationAuthority(referral) : null;
  const read = input.readSourceOrder ?? readOrder;
  const orders = new Map<string, Record<string, unknown> | null>();
  const validTime = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
  const sameTime = (left: string, right: string) => Date.parse(left) === Date.parse(right);
  const consumptions = new Map<string, ValidConsumptionEvent>();
  const sourceConsumptions = Object.values(state.validConsumptionEvents).filter(item => item.sourceOrderId === reward.sourceOrderNumber);
  if (sourceConsumptions.length > 1) return manual("inconsistent_dependency_evidence");
  for (const consumption of sourceConsumptions) {
    if (state.validConsumptionEvents[consumption.eventId] !== consumption
      || (referral && consumption.memberId !== referral.sourceMemberId)) return manual("inconsistent_dependency_evidence");
    consumptions.set(consumption.eventId, consumption);
  }

  async function originalOrder(orderId: string, consumption?: ValidConsumptionEvent,
    legacy?: { orderCreatedAt: string; finalizedAt: string | null }): Promise<OriginalRewardOrderEvidence | null> {
    if (!orders.has(orderId)) {
      try { orders.set(orderId, await read(orderId)); }
      catch { return null; }
    }
    const order = orders.get(orderId);
    if (consumption && (consumption.sourceOrderId !== orderId
      || consumption.sourceReference !== `completed-order:${orderId}` || !validTime(consumption.finalizedAt))) return null;
    if (order && order.orderNumber !== orderId) return null;
    const lines = order ? resolveReturnLineEvidence(order) : null;
    if (lines?.status === "manual_review_required" && lines.reason === "invalid_saved_evidence") return null;
    const preservedTime = lines?.status === "resolved" ? lines.orderCreatedAt : null;
    const orderTime = order?.createdAt;
    if (preservedTime && validTime(orderTime) && !sameTime(preservedTime, orderTime)) return null;
    const createdAt = preservedTime ?? (validTime(orderTime) ? orderTime : legacy?.orderCreatedAt);
    if (!validTime(createdAt)) return null;
    if (legacy && (!validTime(legacy.orderCreatedAt) || !sameTime(createdAt, legacy.orderCreatedAt))) return null;
    // Successful consumption / completed legacy attempt are also preserved completion evidence.
    if (!(order && hasOrderCompletion(order)) && !consumption && !validTime(legacy?.finalizedAt)) return null;
    const completion = order?.completion as Record<string, unknown> | undefined;
    const history = Array.isArray(order?.statusHistory) ? order.statusHistory as Record<string, unknown>[] : [];
    const events = Array.isArray(order?.fulfillmentEvents) ? order.fulfillmentEvents as Record<string, unknown>[] : [];
    const completedAt = [completion?.completedAt, order?.completedAt,
      events.find(event => event.state === "completed")?.occurredAt,
      history.find(event => event.to === "completed")?.at, consumption?.finalizedAt, legacy?.finalizedAt].find(validTime) ?? null;
    if (completedAt && Date.parse(createdAt) > Date.parse(completedAt)) return null;
    return { orderId, orderCreatedAt: createdAt,
      timeSource: preservedTime ? "completion_snapshot" : validTime(orderTime) ? "persisted_order" : "legacy_qualification_attempt",
      completedAt, consumptionEventId: consumption?.eventId ?? null };
  }

  const sourceOrder = await originalOrder(reward.sourceOrderNumber, sourceConsumptions[0]);
  if (!sourceOrder) return manual("missing_original_order_evidence");
  const qualificationOrders: OriginalRewardOrderEvidence[] = [];
  let qualificationRound: QualificationRound | null = null;
  let coverage: ReferralRewardCoverage | null = null;
  let maturation: ReferralRewardMaturation | null = null;
  if (authority === "qualification_coverage" && referral) {
    const coverages = Object.values(state.referralRewardCoverages).filter(item => item.referralRewardId === reward.rewardId);
    const maturations = Object.values(state.referralRewardMaturations).filter(item => item.referralRewardId === reward.rewardId);
    if (coverages.length !== 1 || maturations.length > 1) return manual("missing_qualification_evidence");
    // Reuse the existing evidence-chain validator, without its payout/scheduler consumers.
    let chain: ReturnType<typeof qualificationCoverageProjectionEvidence>;
    try { chain = qualificationCoverageProjectionEvidence(state, referral); }
    catch { return manual("inconsistent_dependency_evidence"); }
    if (!chain) return manual("inconsistent_dependency_evidence");
    ({ round: qualificationRound, coverage, maturation } = chain);
    const ids = [...new Set([qualificationRound.triggeringValidConsumptionEventId,
      ...qualificationRound.consumptionAccounting.allocations.map(item => item.validConsumptionEventId)])].sort();
    for (const eventId of ids) {
      const consumption = state.validConsumptionEvents[eventId];
      if (!consumption || consumption.eventId !== eventId || consumption.memberId !== reward.beneficiaryMemberId
        || (eventId === qualificationRound.triggeringValidConsumptionEventId
          && consumption.sourceOrderId !== qualificationRound.triggeringSourceOrderId)) return manual("inconsistent_dependency_evidence");
      const original = await originalOrder(consumption.sourceOrderId, consumption);
      if (!original) return manual("missing_original_order_evidence");
      consumptions.set(eventId, consumption);
      qualificationOrders.push(original);
    }
  } else if (authority === "legacy_order" && referral) {
    const attempts = (referral.qualificationAttempts ?? []).filter(item => item.orderNumber === referral.qualificationOrderNumber);
    const attempt = attempts.find(item => item.status === "completed" && item.finalState === "completed");
    const pointer = referral.qualificationOrderNumber && referral.qualificationOrderFinalState === "completed"
      && validTime(referral.qualificationOrderCreatedAt) && validTime(referral.qualificationQualifiedAt)
      ? { orderCreatedAt: referral.qualificationOrderCreatedAt, finalizedAt: referral.qualificationQualifiedAt } : null;
    if (attempts.length > 1 || (attempt && pointer && !sameTime(attempt.orderCreatedAt, pointer.orderCreatedAt))) return manual("inconsistent_dependency_evidence");
    const legacy = attempt ?? pointer;
    if (legacy && referral.qualificationOrderNumber) {
      const original = await originalOrder(referral.qualificationOrderNumber, undefined, legacy);
      if (!original) return manual("missing_original_order_evidence");
      qualificationOrders.push(original);
    } else if (referral.qualificationStatus === "qualified") return manual("missing_qualification_evidence");
  } else if (authority === "self_purchase_direct") {
    if (referral?.rewardType !== "self_purchase") return manual("inconsistent_dependency_evidence");
    qualificationOrders.push(sourceOrder);
  }
  if (referral?.selfPurchaseTierSnapshot) {
    const tierEvidence = [...referral.selfPurchaseTierSnapshot.initialEvidence, ...referral.selfPurchaseTierSnapshot.latestEvidence];
    for (const evidence of tierEvidence) {
      if (evidence.role === "current" && evidence.sourceOrderId !== reward.sourceOrderNumber) return manual("inconsistent_dependency_evidence");
      const consumption = evidence.validConsumptionEventId ? state.validConsumptionEvents[evidence.validConsumptionEventId] : undefined;
      if (evidence.validConsumptionEventId && (!consumption || consumption.eventId !== evidence.validConsumptionEventId
        || consumption.memberId !== reward.beneficiaryMemberId || consumption.sourceOrderId !== evidence.sourceOrderId
        || !sameTime(consumption.finalizedAt, evidence.finalizedAt))) return manual("inconsistent_dependency_evidence");
      const original = await originalOrder(evidence.sourceOrderId, consumption);
      if (!original) return manual("missing_original_order_evidence");
      if (consumption) consumptions.set(consumption.eventId, consumption);
      if (!qualificationOrders.some(item => item.orderId === original.orderId)) qualificationOrders.push(original);
    }
  }
  const creditEntry = reward.rewardCreditEntryId ? state.creditEntries[reward.rewardCreditEntryId] : null;
  if (reward.rewardCreditEntryId && (!creditEntry || creditEntry.creditEntryId !== reward.rewardCreditEntryId
    || creditEntry.memberId !== reward.beneficiaryMemberId
    || creditEntry.sourceReference !== `${retail ? "retail_promotion_reward" : "referral_reward"}:${reward.rewardId}`)) return manual("inconsistent_dependency_evidence");
  const dependencies = [...consumptions.values()].sort((left, right) => left.eventId.localeCompare(right.eventId));
  return { status: "resolved", schemaVersion: 1, program: input.program, rewardId: reward.rewardId,
    rewardType: referral?.rewardType ?? "retail_promotion", authority, sourceOrder,
    qualificationOrders: qualificationOrders.sort((left, right) => left.orderId.localeCompare(right.orderId)),
    reward, consumptions: dependencies, qualificationRound, coverage, maturation, creditEntry: creditEntry ?? null,
    sourceReferences: [...new Set([...dependencies.map(item => item.sourceReference),
      coverage?.sourceReference, maturation?.sourceReference, creditEntry?.sourceReference].filter((item): item is string => typeof item === "string"))].sort(),
    idempotencyKeys: [...new Set([reward.idempotencyKey, ...dependencies.map(item => item.idempotencyKey),
      qualificationRound?.idempotencyKey, coverage?.idempotencyKey, maturation?.idempotencyKey]
      .filter((item): item is string => typeof item === "string"))].sort() };
}

export type ReturnRewardReference = { program: "referral" | "retail_promotion" | "referral_conversion"; id: string };

/** D0 read-only bridge from existing commerce snapshots to the shared NTD allocator.
 * These are calculation inputs and source links, never consequence/settlement records.
 * Coverage and tier policies remain in their original objects, identified by fingerprint. */
export function resolveOriginalCommerceEconomicEvidence(input: { order: Record<string, unknown>; state: MembershipCommerceState }) {
  const allocation = resolveOrderEconomicAllocation(input.order);
  if (allocation.status !== "resolved") return allocation;
  const { state } = input, orderId = allocation.orderNumber;
  const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  type MonetaryEvidence = { kind: string; authorityId: string; authorityFingerprint: string; sourceOrderId: string;
    status: "resolved"; authoritativeTotal: number; unit: "NTD";
    lines: ReturnType<typeof allocatePreservedRewardMoney> }
    | { kind: string; authorityId: string; authorityFingerprint: string; sourceOrderId: string;
        status: "manual_review_required"; reason: string };
  const monetaryAuthorities: MonetaryEvidence[] = [];
  const append = (kind: string, authorityId: string, original: unknown, total: number, reason?: string) => {
    const common = { kind, authorityId, authorityFingerprint: originalEconomicFingerprint(original), sourceOrderId: orderId };
    try {
      if (reason) throw new Error(reason);
      const poolTotal = allocation.lines.reduce((sum, line) => sum + (line.rewardEligibleBasis > 0 ? line.redemptionEligibleBasis : 0), 0);
      if (!Number.isSafeInteger(total) || total < 0 || total > poolTotal) throw new Error("unproven_original_monetary_authority");
      monetaryAuthorities.push({ ...common, status: "resolved", authoritativeTotal: total, unit: "NTD",
        lines: allocatePreservedRewardMoney(allocation, total) });
    } catch (error) {
      monetaryAuthorities.push({ ...common, status: "manual_review_required", reason: error instanceof Error ? error.message : "invalid_authority" });
    }
  };
  const eligibleSubtotal = allocation.lines.reduce((sum, line) => sum + (line.rewardEligibleBasis > 0 ? line.redemptionEligibleBasis : 0), 0);
  for (const [key, consumption] of Object.entries(state.validConsumptionEvents)) {
    if (consumption.sourceOrderId !== orderId) continue;
    const invalid = key !== consumption.eventId || consumption.sourceReference !== `completed-order:${orderId}`
      || consumption.merchandiseSubtotal !== eligibleSubtotal || consumption.appliedCreditAmount !== allocation.actualRedemptionUsed
      || typeof consumption.includeCreditDiscount !== "boolean" || typeof consumption.includeShipping !== "boolean"
      || consumption.includeCreditDiscount !== consumption.qualificationRulesSnapshot?.validConsumption?.includeCreditDiscount
      || consumption.includeShipping !== consumption.qualificationRulesSnapshot?.validConsumption?.includeShipping;
    const expected = Math.max(0, consumption.merchandiseSubtotal - (consumption.includeCreditDiscount ? 0 : consumption.appliedCreditAmount)
      + (consumption.includeShipping ? consumption.shippingAmount : 0));
    const reason = invalid || expected !== consumption.validConsumptionAmount ? "inconsistent_original_consumption"
      : consumption.includeShipping && consumption.shippingAmount !== 0 ? "non_merchandise_consumption_requires_separate_authority" : undefined;
    append("valid_consumption", consumption.eventId, consumption, consumption.validConsumptionAmount, reason);
    // Self-purchase paid tiers use their own EXISTING subtotal-credit authority,
    // independently of qualification's includeCreditDiscount/includeShipping flags.
    append("self_purchase_paid_consumption", consumption.eventId, consumption,
      Math.max(0, consumption.merchandiseSubtotal - consumption.appliedCreditAmount), invalid ? "inconsistent_original_consumption" : undefined);
  }
  for (const [key, reward] of Object.entries(state.referralRewards)) {
    if (reward.sourceOrderNumber !== orderId) continue;
    append("referral_paid_basis", reward.rewardId, reward, reward.paidAmountBasis,
      key !== reward.rewardId ? "inconsistent_original_reward" : undefined);
  }
  for (const [key, reward] of Object.entries(state.retailPromotionRewards)) {
    if (reward.sourceOrderNumber !== orderId) continue;
    const invalid = key !== reward.rewardId ? "inconsistent_original_reward" : undefined;
    append("retail_promotion_eligible_merchandise", reward.rewardId, reward, reward.eligibleMerchandiseAmount, invalid);
    if (reward.calculationBasis !== "pv") append("retail_promotion_calculation", reward.rewardId, reward,
      reward.calculationBaseValue ?? reward.eligibleMerchandiseAmount, invalid);
    // PV remains in the original reward/line snapshots. Never reinterpret it as NTD.
  }
  const consumptionIds = new Set(Object.values(state.validConsumptionEvents).filter(item => item.sourceOrderId === orderId).map(item => item.eventId));
  const rounds = Object.values(state.qualificationRounds).filter(round => consumptionIds.has(round.triggeringValidConsumptionEventId)
    || round.consumptionAccounting.allocations.some(item => consumptionIds.has(item.validConsumptionEventId)))
    .sort((a, b) => compareId(a.roundId, b.roundId));
  const roundIds = new Set(rounds.map(round => round.roundId));
  const coverages = Object.values(state.referralRewardCoverages).filter(item => roundIds.has(item.qualificationRoundId))
    .sort((a, b) => compareId(a.coverageId, b.coverageId));
  const tierRewards = Object.values(state.referralRewards).filter(reward => reward.selfPurchaseTierSnapshot
    && [...reward.selfPurchaseTierSnapshot.initialEvidence, ...reward.selfPurchaseTierSnapshot.latestEvidence].some(item => item.sourceOrderId === orderId))
    .sort((a, b) => compareId(a.rewardId, b.rewardId));
  const reservation = allocation.creditReservationId ? state.creditReservations[allocation.creditReservationId] : null;
  const redemptionLinkage = allocation.actualRedemptionUsed === 0 ? { status: "not_applicable" as const }
    : !reservation || reservation.reservationId !== allocation.creditReservationId || reservation.orderId !== orderId
      || reservation.amount !== allocation.actualRedemptionUsed || reservation.status === "released"
      || reservation.allocations.some(item => !Number.isSafeInteger(item.amount) || item.amount < 0)
      || reservation.allocations.reduce((sum, item) => sum + item.amount, 0) !== reservation.amount
      || reservation.allocations.some(item => !state.creditEntries[item.creditEntryId]
        || state.creditEntries[item.creditEntryId].memberId !== reservation.memberId)
      ? { status: "manual_review_required" as const, reason: "missing_original_credit_consumption_links" }
      : { status: "resolved" as const, reservationId: reservation.reservationId, statusAtRead: reservation.status,
          allocations: reservation.allocations.map(item => ({ ...item, expiresAt: state.creditEntries[item.creditEntryId].expiresAt })) };
  monetaryAuthorities.sort((a, b) => compareId(a.kind, b.kind) || compareId(a.authorityId, b.authorityId));
  return { status: "resolved" as const, schemaVersion: 1 as const, allocation, monetaryAuthorities, redemptionLinkage,
    dependencyLinks: {
      consumptions: [...consumptionIds].sort(),
      rounds: rounds.map(item => ({ roundId: item.roundId, fingerprint: originalEconomicFingerprint(item) })),
      coverages: coverages.map(item => ({ coverageId: item.coverageId, fingerprint: originalEconomicFingerprint(item) })),
      maturations: Object.values(state.referralRewardMaturations).filter(item => coverages.some(coverage => coverage.coverageId === item.coverageId))
        .sort((a, b) => compareId(a.maturationId, b.maturationId))
        .map(item => ({ maturationId: item.maturationId, fingerprint: originalEconomicFingerprint(item) })),
      selfPurchaseTiers: tierRewards.map(item => ({ rewardId: item.rewardId, fingerprint: originalEconomicFingerprint(item.selfPurchaseTierSnapshot) })),
    } };
}
export const RETURN_CONSUMPTION_UNWIND_POLICY = "carry-first-latest-round-first-v1" as const;
/** Owner contract for future D orchestration, NOT a new release policy or timer:
 * pending -> HOLD if a return exists -> adjust/restore pending entitlement ->
 * release through the existing scheduler only after original safety waits AND the
 * source order's preserved return-protection exposure (returnDeadline) have safely
 * ended and no blocking return dependency remains. No calculated pending reward
 * becomes spendable merely because it exists. Never restart a wait from review/
 * resolution time. Future D must record original/adjusted pending amounts, their
 * delta, source order/request, structured reason and adjustment time before release.
 * Released-reward reversal remains exceptional legacy/defensive compatibility.
 * Future member explanations belong to /admin/member-center/copy; no copy here. */
export const RETURN_REWARD_SAFETY_WAIT_CONTRACT = "pending-before-safe-release-v1" as const;
const RETURN_CONSUMPTION_REDUCTION_ACTION = "RETURN_CONSUMPTION_REDUCTION_RECORDED";
export type ReturnConsumptionReduction = {
  schemaVersion: 1; reductionId: string; idempotencyKey: string;
  unwindPolicyVersion: typeof RETURN_CONSUMPTION_UNWIND_POLICY;
  rewardSafetyWaitContractVersion: typeof RETURN_REWARD_SAFETY_WAIT_CONTRACT;
  consumptionEventId: string; sourceOrderId: string; returnRequestId: string;
  requestedReturnEventId: string; approvedReturnEventId: string;
  occurredAt: string; recordedAt: string; unit: "NTD";
  originalConsumptionAmount: number; consumptionFingerprint: string;
  previousCumulativeApprovedReduction: number; incrementalEconomicReduction: number;
  cumulativeApprovedReturnReduction: number;
  d0AllocationFingerprint: string; d0AuthorityFingerprint: string;
  originalAllocationRefs: Array<{ roundId: string; fingerprint: string }>;
  sourceOrderCreatedAt: string | null; completionEventId: string; consumptionSourceReference: string;
  reasonCode: "partial_return_approved" | "full_return_approved";
  lines: Array<{ returnLineRef: string; originalQuantity: number; approvedQuantity: number;
    previousApprovedQuantity: number; cumulativeApprovedQuantity: number;
    originalLineConsumptionContribution: number; previousCumulativeContribution: number;
    cumulativeContribution: number; incrementalContribution: number }>;
  evidenceFingerprint: string;
};
type ReductionCore = Omit<ReturnConsumptionReduction, "recordedAt" | "evidenceFingerprint">;
type ConsumptionProjectionFailure = { status: "manual_review_required"; consumptionEventId: string; reason: string };
export type EffectiveReturnConsumption = {
  status: "resolved"; consumptionEventId: string; sourceOrderId: string; unit: "NTD";
  unwindPolicyVersion: typeof RETURN_CONSUMPTION_UNWIND_POLICY;
  originalConsumptionAmount: number; cumulativeApprovedReturnReduction: number;
  originalAllocatedAmount: number; originalUnallocatedCarry: number;
  effectiveConsumptionAmount: number; effectiveCarry: number;
  /** Oldest first by persisted createdAt, then qualifiedAt, then roundId (UTF-16).
   * Unwind traverses this order backwards; object/array insertion order is irrelevant. */
  effectiveAllocationByRound: Array<{ roundId: string; qualifiedAt: string; createdAt: string;
    originalAllocation: number; approvedReturnReduction: number; effectiveAllocation: number }>;
  /** NTD is never subtracted from PV. These original allocations remain a separate unit. */
  separatePVAllocationRoundIds: string[];
  reductionIds: string[];
};
function consumptionReductionAudit(state: MembershipCommerceState) {
  return state.audit.filter(item => item.action === RETURN_CONSUMPTION_REDUCTION_ACTION);
}
function originalConsumptionFingerprint(event: ValidConsumptionEvent) {
  // Legacy whole-order invalidation flags are mutable in the existing engine;
  // the original economic/qualification facts used by D1 are not those flags.
  const { reversedAt: _reversedAt, reversalOutcome: _reversalOutcome, ...original } = event;
  void _reversedAt; void _reversalOutcome;
  return originalEconomicFingerprint(original);
}
function reductionMoney(value: number) { return Number.isSafeInteger(value) && value >= 0; }
function reductionSum(values: number[]) {
  if (!values.every(reductionMoney)) throw new MembershipCommerceError("退貨消費減少金額必須為非負整數");
  const sum = values.reduce((total, value) => total + BigInt(value), BigInt(0));
  if (sum > BigInt(Number.MAX_SAFE_INTEGER)) throw new MembershipCommerceError("退貨消費減少金額超出安全範圍");
  return Number(sum);
}

/** Reconstruct ONLY D0-authorized economic cores from original requested completion
 * evidence and the authoritative B event sequence. No order/catalog/rules IO.
 * The restriction set lets legacy reads validate recorded evidence without trying
 * to resolve unrelated historical approvals that have no D1 record yet. */
function approvedConsumptionReductionCores(state: MembershipCommerceState, restriction?: Set<string>):
  { status: "resolved"; cores: ReductionCore[] } | ConsumptionProjectionFailure {
  const cores: ReductionCore[] = [];
  const requested = new Map<string, RequestedReturn>();
  const quantities = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  const proofCache = new Map<string, ReturnType<typeof resolveOriginalCommerceEconomicEvidence>>();
  for (const event of state.returnEvents ?? []) {
    if (event.type === "RETURN_REQUESTED") { requested.set(event.returnRequestId, event); continue; }
    if (event.type !== "RETURN_APPROVED") continue;
    const request = requested.get(event.returnRequestId);
    if (!request) throw new MembershipCommerceError("核准退貨缺少原申請證據");
    const previous = quantities.get(event.orderId) ?? new Map<string, number>();
    const next = new Map(previous);
    for (const line of approvedReturnLines(request, event)) next.set(line.returnLineRef, (next.get(line.returnLineRef) ?? 0) + line.quantity);
    quantities.set(event.orderId, next);
    const consumptions = Object.entries(state.validConsumptionEvents).filter(([, item]) => item.sourceOrderId === event.orderId);
    if (!consumptions.some(([, item]) => !restriction || restriction.has(item.eventId))) continue;
    if (consumptions.length !== 1 || consumptions[0][0] !== consumptions[0][1].eventId) return {
      status: "manual_review_required", consumptionEventId: consumptions[0]?.[1].eventId ?? "", reason: "ambiguous_source_consumption" };
    const consumption = consumptions[0][1];
    let proof = proofCache.get(event.orderId);
    if (!proof) {
      const originalConsumption = { ...consumption };
      delete originalConsumption.reversedAt; delete originalConsumption.reversalOutcome;
      const originalState = { ...state, validConsumptionEvents: { ...state.validConsumptionEvents, [consumption.eventId]: originalConsumption } };
      proof = resolveOriginalCommerceEconomicEvidence({ state: originalState, order: { orderNumber: event.orderId,
        status: "completed", completion: request.completion } });
      proofCache.set(event.orderId, proof);
    }
    if (proof.status !== "resolved") return { ...proof, consumptionEventId: consumption.eventId };
    const authority = proof.monetaryAuthorities.find(item => item.kind === "valid_consumption" && item.authorityId === consumption.eventId);
    if (!authority || authority.status !== "resolved") return { status: "manual_review_required", consumptionEventId: consumption.eventId,
      reason: authority?.status === "manual_review_required" ? authority.reason : "missing_d0_consumption_authority" };
    const lines: ReturnConsumptionReduction["lines"] = [];
    for (const line of approvedReturnLines(request, event)) {
      const original = authority.lines.find(item => item.returnLineRef === line.returnLineRef);
      if (!original || original.originalQuantity !== line.originalQuantity) return { status: "manual_review_required",
        consumptionEventId: consumption.eventId, reason: "inconsistent_d0_line_authority" };
      const oldQuantity = previous.get(line.returnLineRef) ?? 0, newQuantity = next.get(line.returnLineRef)!;
      const before = cumulativeOriginalLineContribution(original.rewardEconomicContribution, original.originalQuantity, oldQuantity);
      const after = cumulativeOriginalLineContribution(original.rewardEconomicContribution, original.originalQuantity, newQuantity);
      lines.push({ returnLineRef: line.returnLineRef, originalQuantity: original.originalQuantity, approvedQuantity: line.quantity,
        previousApprovedQuantity: oldQuantity, cumulativeApprovedQuantity: newQuantity,
        originalLineConsumptionContribution: original.rewardEconomicContribution, previousCumulativeContribution: before,
        cumulativeContribution: after, incrementalContribution: after - before });
    }
    const incrementalEconomicReduction = reductionSum(lines.map(line => line.incrementalContribution));
    const previousTotal = totals.get(consumption.eventId) ?? 0;
    const cumulative = reductionSum([previousTotal, incrementalEconomicReduction]);
    if (cumulative > consumption.validConsumptionAmount) return { status: "manual_review_required", consumptionEventId: consumption.eventId,
      reason: "approved_reduction_exceeds_original_consumption" };
    totals.set(consumption.eventId, cumulative);
    const reductionId = deterministicId("return_consumption_reduction", JSON.stringify([event.returnRequestId, event.eventId, consumption.eventId]));
    cores.push({ schemaVersion: 1, reductionId, idempotencyKey: `return-domain:consumption-reduction:${reductionId}`,
      unwindPolicyVersion: RETURN_CONSUMPTION_UNWIND_POLICY, rewardSafetyWaitContractVersion: RETURN_REWARD_SAFETY_WAIT_CONTRACT,
      consumptionEventId: consumption.eventId, sourceOrderId: event.orderId, returnRequestId: event.returnRequestId,
      requestedReturnEventId: request.eventId, approvedReturnEventId: event.eventId, occurredAt: event.occurredAt, unit: "NTD",
      originalConsumptionAmount: consumption.validConsumptionAmount, consumptionFingerprint: originalConsumptionFingerprint(consumption),
      previousCumulativeApprovedReduction: previousTotal, incrementalEconomicReduction,
      cumulativeApprovedReturnReduction: cumulative, d0AllocationFingerprint: proof.allocation.allocationFingerprint,
      d0AuthorityFingerprint: authority.authorityFingerprint,
      originalAllocationRefs: Object.values(state.qualificationRounds)
        .filter(round => round.consumptionAccounting.allocations.some(item => item.validConsumptionEventId === consumption.eventId))
        .sort((a, b) => a.roundId < b.roundId ? -1 : a.roundId > b.roundId ? 1 : 0)
        .map(round => ({ roundId: round.roundId, fingerprint: originalEconomicFingerprint(round) })),
      sourceOrderCreatedAt: request.completion.returnLines?.status === "resolved" ? request.completion.returnLines.orderCreatedAt : null,
      completionEventId: request.completion.eventId, consumptionSourceReference: consumption.sourceReference,
      reasonCode: proof.allocation.lines.every(line => (next.get(line.returnLineRef) ?? 0) === line.originalQuantity)
        ? "full_return_approved" : "partial_return_approved", lines });
  }
  return { status: "resolved", cores };
}

/** Existing audit collection only. Audit envelope, deterministic identity, D0 values,
 * cumulative quantity chain and idempotency backlinks are all verified on replay. */
export function readReturnConsumptionReductions(state: MembershipCommerceState): ReturnConsumptionReduction[] {
  const audits = consumptionReductionAudit(state);
  const records: ReturnConsumptionReduction[] = audits.map(record => {
    try { return JSON.parse(String(record.after.evidence)); }
    catch { throw new MembershipCommerceError("退貨消費減少證據無法讀取"); }
  });
  if (!records.length) {
    if (Object.keys(state.idempotency).some(key => key.startsWith("return-domain:consumption-reduction:"))) throw new MembershipCommerceError("退貨消費減少證據遺失");
    return [];
  }
  const ids = new Set<string>(), restriction = new Set(records.map(item => item?.consumptionEventId));
  const rebuilt = approvedConsumptionReductionCores(state, restriction);
  if (rebuilt.status !== "resolved") throw new MembershipCommerceError(`退貨消費減少原始證據不一致: ${rebuilt.reason}`);
  const byId = new Map(rebuilt.cores.map(item => [item.reductionId, item]));
  const cumulative = new Map<string, number>();
  const positions = new Map<string, number>();
  const approvedOrder = new Map((state.returnEvents ?? []).filter(item => item.type === "RETURN_APPROVED").map((item, index) => [item.eventId, index]));
  const recordedCounts = new Map<string, number>();
  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== "object") throw new MembershipCommerceError("退貨消費減少證據格式不正確");
    const { recordedAt, evidenceFingerprint, ...core } = record, envelope = audits[index];
    const expected = byId.get(record.reductionId);
    const { originalAllocationRefs, ...originalCore } = core;
    const expectedCore = expected ? Object.fromEntries(Object.entries(expected).filter(([key]) => key !== "originalAllocationRefs")) : null;
    const consumption = state.validConsumptionEvents[record.consumptionEventId];
    const approved = state.returnEvents?.find(item => item.eventId === record.approvedReturnEventId);
    const request = state.returnEvents?.find((item): item is RequestedReturn => item.type === "RETURN_REQUESTED" && item.eventId === record.requestedReturnEventId);
    const identity = deterministicId("return_consumption_reduction", JSON.stringify([record.returnRequestId, record.approvedReturnEventId, record.consumptionEventId]));
    const position = approvedOrder.get(record.approvedReturnEventId) ?? -1;
    const count = recordedCounts.get(record.consumptionEventId) ?? 0;
    const expectedNext = rebuilt.cores.filter(item => item.consumptionEventId === record.consumptionEventId)[count];
    if ((consumption && (!expected || !isDeepStrictEqual(originalCore, expectedCore))) || ids.has(record.reductionId)
      || position <= (positions.get(record.consumptionEventId) ?? -1)
      || (consumption && expectedNext?.reductionId !== record.reductionId)
      || record.reductionId !== identity || record.idempotencyKey !== `return-domain:consumption-reduction:${identity}`
      || record.schemaVersion !== 1 || record.unit !== "NTD" || record.unwindPolicyVersion !== RETURN_CONSUMPTION_UNWIND_POLICY
      || record.rewardSafetyWaitContractVersion !== RETURN_REWARD_SAFETY_WAIT_CONTRACT
      || approved?.type !== "RETURN_APPROVED" || approved.returnRequestId !== record.returnRequestId || approved.orderId !== record.sourceOrderId
      || approved.occurredAt !== record.occurredAt || !request || request.returnRequestId !== record.returnRequestId
      || request.orderId !== record.sourceOrderId || request.completion.eventId !== record.completionEventId
      || !Array.isArray(originalAllocationRefs) || new Set(originalAllocationRefs.map(item => item.roundId)).size !== originalAllocationRefs.length
      || (consumption && originalAllocationRefs.some(item => !state.qualificationRounds[item.roundId]
        || originalEconomicFingerprint(state.qualificationRounds[item.roundId]) !== item.fingerprint))
      || !reductionMoney(record.originalConsumptionAmount) || !reductionMoney(record.previousCumulativeApprovedReduction)
      || !reductionMoney(record.incrementalEconomicReduction) || !reductionMoney(record.cumulativeApprovedReturnReduction)
      || record.previousCumulativeApprovedReduction + record.incrementalEconomicReduction !== record.cumulativeApprovedReturnReduction
      || record.cumulativeApprovedReturnReduction > record.originalConsumptionAmount
      || !Array.isArray(record.lines) || record.lines.length !== approvedReturnLines(request, approved).length
      || record.lines.some((line, offset) => {
        const selected = approvedReturnLines(request, approved)[offset];
        return line.returnLineRef !== selected.returnLineRef || line.originalQuantity !== selected.originalQuantity
          || line.approvedQuantity !== selected.quantity || line.previousApprovedQuantity + line.approvedQuantity !== line.cumulativeApprovedQuantity
          || cumulativeOriginalLineContribution(line.originalLineConsumptionContribution, line.originalQuantity, line.previousApprovedQuantity) !== line.previousCumulativeContribution
          || cumulativeOriginalLineContribution(line.originalLineConsumptionContribution, line.originalQuantity, line.cumulativeApprovedQuantity) !== line.cumulativeContribution
          || line.cumulativeContribution - line.previousCumulativeContribution !== line.incrementalContribution;
      })
      || reductionSum(record.lines.map(line => line.incrementalContribution)) !== record.incrementalEconomicReduction
      || !Number.isFinite(Date.parse(recordedAt)) || Date.parse(recordedAt) < Date.parse(record.occurredAt)
      || originalEconomicFingerprint({ ...core, recordedAt }) !== evidenceFingerprint
      || (cumulative.get(record.consumptionEventId) ?? 0) !== record.previousCumulativeApprovedReduction
      || envelope.actor !== "system" || envelope.entityType !== "return_request" || envelope.entityId !== record.returnRequestId
      || envelope.sourceEvent !== record.approvedReturnEventId || envelope.timestamp !== recordedAt
      || envelope.after.reductionId !== record.reductionId
      || state.idempotency[record.idempotencyKey]?.resultId !== record.reductionId) throw new MembershipCommerceError("退貨消費減少證據關聯不一致");
    ids.add(record.reductionId); cumulative.set(record.consumptionEventId, record.cumulativeApprovedReturnReduction);
    positions.set(record.consumptionEventId, position); recordedCounts.set(record.consumptionEventId, count + 1);
  }
  for (const [key, identity] of Object.entries(state.idempotency)) if (key.startsWith("return-domain:consumption-reduction:")
    && (!ids.has(identity.resultId) || key !== `return-domain:consumption-reduction:${identity.resultId}`)) throw new MembershipCommerceError("退貨消費減少操作識別不一致");
  return structuredClone(records);
}

/** Derives effective NTD consumption without rewriting any consumption/round/coverage.
 * No cross-consumption replacement and no qualification or reward status decision.
 * PV allocations are explicitly returned separately, never mixed with NTD amounts. */
export function projectEffectiveReturnConsumption(state: MembershipCommerceState, consumptionEventId: string):
  EffectiveReturnConsumption | ConsumptionProjectionFailure {
  return projectReturnConsumptionWithRecords(state, consumptionEventId, readReturnConsumptionReductions(state));
}
/** The D1 unwind policy in exact units. NTD and preserved PV use DIFFERENT
 * unit pools; this shared arithmetic never converts money into points. */
function unwindOriginalAllocationUnits(original: bigint, removed: bigint, allocationsOldestFirst: bigint[]) {
  const allocated = allocationsOldestFirst.reduce((sum, value) => sum + value, BigInt(0));
  if (original < BigInt(0) || removed < BigInt(0) || removed > original || allocated > original
    || allocationsOldestFirst.some(value => value < BigInt(0))) throw new MembershipCommerceError("原始消費配置超出可減少範圍");
  const carry = original - allocated;
  const effectiveCarry = carry > removed ? carry - removed : BigInt(0);
  let unwind = removed > carry ? removed - carry : BigInt(0);
  const effective = [...allocationsOldestFirst];
  for (let index = effective.length - 1; index >= 0; index--) {
    const delta = effective[index] < unwind ? effective[index] : unwind;
    effective[index] -= delta; unwind -= delta;
  }
  if (unwind !== BigInt(0) || effectiveCarry + effective.reduce((sum, value) => sum + value, BigInt(0)) !== original - removed) throw new MembershipCommerceError("消費配置不守恆");
  return { carry, effectiveCarry, effective };
}
function originalAllocationChronology(a: { createdAt: string; qualifiedAt: string; roundId: string }, b: { createdAt: string; qualifiedAt: string; roundId: string }) {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt) || Date.parse(a.qualifiedAt) - Date.parse(b.qualifiedAt)
    || (a.roundId < b.roundId ? -1 : a.roundId > b.roundId ? 1 : 0);
}
function projectReturnConsumptionWithRecords(state: MembershipCommerceState, consumptionEventId: string, records: ReturnConsumptionReduction[]):
  EffectiveReturnConsumption | ConsumptionProjectionFailure {
  const manual = (reason: string): ConsumptionProjectionFailure => ({ status: "manual_review_required", consumptionEventId, reason });
  const consumption = state.validConsumptionEvents[consumptionEventId];
  if (!consumption || consumption.eventId !== consumptionEventId || !reductionMoney(consumption.validConsumptionAmount)) return manual("missing_original_consumption");
  const effectiveAllocationByRound: EffectiveReturnConsumption["effectiveAllocationByRound"] = [];
  const separatePVAllocationRoundIds: string[] = [];
  try {
    for (const [key, round] of Object.entries(state.qualificationRounds)) {
      const allocations = round.consumptionAccounting.allocations.filter(item => item.validConsumptionEventId === consumptionEventId);
      if (!allocations.length) continue;
      if (key !== round.roundId || round.memberId !== consumption.memberId) return manual("inconsistent_original_allocation_identity");
      const basis = qualificationBasisFromRound(round);
      if (round.consumptionAccounting.basis !== undefined && round.consumptionAccounting.basis !== basis) return manual("inconsistent_allocation_unit");
      if (basis === "pv") { separatePVAllocationRoundIds.push(round.roundId); continue; }
      if (!Number.isFinite(Date.parse(round.createdAt)) || !Number.isFinite(Date.parse(round.qualifiedAt))
        || Date.parse(round.createdAt) < Date.parse(round.qualifiedAt)
        || Date.parse(round.qualifiedAt) < Date.parse(consumption.finalizedAt)) return manual("unproven_allocation_chronology");
      const amount = reductionSum(allocations.map(item => item.amount));
      effectiveAllocationByRound.push({ roundId: round.roundId, createdAt: round.createdAt, qualifiedAt: round.qualifiedAt,
        originalAllocation: amount, approvedReturnReduction: 0, effectiveAllocation: amount });
    }
    effectiveAllocationByRound.sort(originalAllocationChronology);
    const originalAllocatedAmount = reductionSum(effectiveAllocationByRound.map(item => item.originalAllocation));
    if (originalAllocatedAmount > consumption.validConsumptionAmount) return manual("original_allocations_exceed_consumption");
    const relevant = records.filter(item => item.consumptionEventId === consumptionEventId);
    const cumulativeApprovedReturnReduction = reductionSum(relevant.map(item => item.incrementalEconomicReduction));
    if (cumulativeApprovedReturnReduction > consumption.validConsumptionAmount) return manual("approved_reduction_exceeds_original_consumption");
    const projected = unwindOriginalAllocationUnits(BigInt(consumption.validConsumptionAmount), BigInt(cumulativeApprovedReturnReduction), effectiveAllocationByRound.map(item => BigInt(item.originalAllocation)));
    const originalUnallocatedCarry = Number(projected.carry), effectiveCarry = Number(projected.effectiveCarry);
    for (const [index, allocation] of effectiveAllocationByRound.entries()) {
      allocation.effectiveAllocation = Number(projected.effective[index]);
      allocation.approvedReturnReduction = allocation.originalAllocation - allocation.effectiveAllocation;
    }
    const effectiveConsumptionAmount = consumption.validConsumptionAmount - cumulativeApprovedReturnReduction;
    if (reductionSum([effectiveCarry, ...effectiveAllocationByRound.map(item => item.effectiveAllocation)]) !== effectiveConsumptionAmount) return manual("consumption_conservation_failed");
    return { status: "resolved", consumptionEventId, sourceOrderId: consumption.sourceOrderId, unit: "NTD",
      unwindPolicyVersion: RETURN_CONSUMPTION_UNWIND_POLICY, originalConsumptionAmount: consumption.validConsumptionAmount,
      cumulativeApprovedReturnReduction, originalAllocatedAmount, originalUnallocatedCarry, effectiveConsumptionAmount, effectiveCarry,
      effectiveAllocationByRound, separatePVAllocationRoundIds: separatePVAllocationRoundIds.sort(), reductionIds: relevant.map(item => item.reductionId) };
  } catch { return manual("invalid_original_allocation_amount"); }
}

/** Explicit internal evidence reconciliation for future D orchestration. It does NOT
 * resolve HOLD, recalculate entitlement, release rewards, reverse credit, or call
 * cancellation/fulfillment. No public API. All approvals are processed in B log order.
 * Late original consumption may be reconciled without backfilling the source order. */
export async function reconcileApprovedReturnConsumptionReductions(input: { now?: Date; stateFilePath?: string } = {}) {
  return transaction((state, now) => appendApprovedReturnConsumptionReductions(state, now), { now: input.now, filePath: input.stateFilePath });
}
function appendApprovedReturnConsumptionReductions(state: MembershipCommerceState, now: Date, restriction?: Set<string>) {
    const existing = readReturnConsumptionReductions(state);
    const expected = approvedConsumptionReductionCores(state, restriction);
    if (expected.status !== "resolved") return expected;
    const ids = new Set(existing.map(item => item.reductionId));
    const additions = expected.cores.filter(core => !ids.has(core.reductionId)).map(core => {
      const payload = { ...core, recordedAt: new Date(Math.max(now.getTime(), Date.parse(core.occurredAt))).toISOString() };
      return { ...payload, evidenceFingerprint: originalEconomicFingerprint(payload) };
    });
    const all = [...existing, ...additions];
    const eventIds = [...(restriction ?? new Set(all.map(item => item.consumptionEventId)))].sort();
    const projections = eventIds.map(eventId => projectReturnConsumptionWithRecords(state, eventId, all));
    const invalid = projections.find(item => item.status !== "resolved");
    if (invalid) return invalid;
    for (const record of additions) {
      if (state.idempotency[record.idempotencyKey]) throw new MembershipCommerceError("退貨消費減少操作識別衝突");
      audit(state, { actor: "system", action: RETURN_CONSUMPTION_REDUCTION_ACTION, entityType: "return_request",
        entityId: record.returnRequestId, before: {}, after: { reductionId: record.reductionId, evidence: JSON.stringify(record) },
        reason: record.reasonCode, sourceEvent: record.approvedReturnEventId }, new Date(record.recordedAt));
      remember(state, record.idempotencyKey, record.reductionId, new Date(record.recordedAt));
    }
    return { status: "resolved" as const, createdCount: additions.length, reductions: structuredClone(all), projections };
}

type ReturnRewardLinks = {
  reasons: Array<"source_order" | "qualification_order" | "qualification_consumption" | "self_purchase_tier">;
  consumptionEventIds: string[]; roundIds: string[]; coverageIds: string[];
};
/** Typed evidence stored in existing audit.after.evidence (JSON), never on the reward/return event. */
export type ReturnRewardHoldDependency = {
  schemaVersion: 1; holdDependencyId: string; returnRequestId: string; returnRequestedEventId: string;
  returnOrderId: string; reward: ReturnRewardReference; rewardSourceOrderId: string;
  authority: ReferralRewardQualificationAuthority | null; rewardStatusAtCreation: string;
  createdAt: string; idempotencyKey: string;
  returnLines: Array<{ returnLineRef: string; quantity: number; originalQuantity: number }>;
  links: ReturnRewardLinks;
  evidence: {
    status: "resolved" | "manual_review_required"; reason: string | null;
    sourceOrder: OriginalRewardOrderEvidence | null; qualificationOrders: OriginalRewardOrderEvidence[];
    consumptionEventIds: string[]; roundId: string | null; coverageId: string | null; maturationId: string | null;
    creditEntryId: string | null; rulesVersion: number | null; sourceReferences: string[]; idempotencyKeys: string[];
    policyEvidenceFingerprint: string;
  };
};
export type ReturnRewardHoldProjection = {
  reward: ReturnRewardReference; blocked: boolean; activeHoldDependencyCount: number;
  resolutionRequiredDependencyCount: number;
  dependencies: Array<{ holdDependencyId: string; returnRequestId: string; returnOrderId: string;
    returnStatus: ReturnRequestStatus; state: "active" | "resolution_required" | "resolved"; persisted: boolean }>;
};
const RETURN_REWARD_HOLD_ACTION = "RETURN_REWARD_HOLD_CREATED";
type RequestedReturn = Extract<ReturnDomainEvent, { type: "RETURN_REQUESTED" }>;
type ReturnRewardCandidate = { reference: ReturnRewardReference; sourceOrderId: string; status: string;
  authority: ReferralRewardQualificationAuthority | null; creditId: string | null; rulesVersion: number | null;
  links: ReturnRewardLinks; policy: unknown };
function returnHoldIdentity(requestId: string, reference: ReturnRewardReference) {
  return deterministicId("return_reward_hold", JSON.stringify([requestId, reference.program, reference.id]));
}
function returnHoldAudit(state: MembershipCommerceState) {
  return state.audit.filter(item => item.action === RETURN_REWARD_HOLD_ACTION);
}
function returnHoldCandidates(state: MembershipCommerceState, orderId: string): ReturnRewardCandidate[] {
  const candidates: ReturnRewardCandidate[] = [];
  const sorted = (values: string[]) => [...new Set(values)].sort();
  for (const reward of Object.values(state.referralRewards)) {
    if (!["scheduled", "released"].includes(reward.status)) continue;
    const authority = referralRewardQualificationAuthority(reward);
    const links: ReturnRewardLinks = { reasons: [], consumptionEventIds: [], roundIds: [], coverageIds: [] };
    if (reward.sourceOrderNumber === orderId) links.reasons.push("source_order");
    if (authority === "legacy_order" && (reward.qualificationOrderNumber === orderId
      || (reward.qualificationStatus !== "qualified" && reward.qualificationAttempts?.some(attempt => attempt.orderNumber === orderId && attempt.status !== "failed")))) links.reasons.push("qualification_order");
    for (const coverage of Object.values(state.referralRewardCoverages).filter(item => item.referralRewardId === reward.rewardId && authority === "qualification_coverage")) {
      const round = state.qualificationRounds[coverage.qualificationRoundId];
      if (!round) continue;
      const ids = sorted([round.triggeringValidConsumptionEventId, ...round.consumptionAccounting.allocations.map(item => item.validConsumptionEventId)]);
      const affected = ids.filter(eventId => state.validConsumptionEvents[eventId]?.sourceOrderId === orderId);
      if (round.triggeringSourceOrderId === orderId || affected.length) {
        links.reasons.push("qualification_consumption"); links.consumptionEventIds.push(...affected);
        links.roundIds.push(round.roundId); links.coverageIds.push(coverage.coverageId);
      }
    }
    if (reward.rewardType === "self_purchase" && reward.selfPurchaseTierSnapshot) {
      const affected = [...reward.selfPurchaseTierSnapshot.initialEvidence, ...reward.selfPurchaseTierSnapshot.latestEvidence]
        .filter(item => item.sourceOrderId === orderId || (item.validConsumptionEventId && state.validConsumptionEvents[item.validConsumptionEventId]?.sourceOrderId === orderId));
      if (affected.length) {
        links.reasons.push("self_purchase_tier");
        links.consumptionEventIds.push(...affected.flatMap(item => item.validConsumptionEventId ? [item.validConsumptionEventId] : []));
      }
    }
    if (!links.reasons.length) continue;
    links.reasons = [...new Set(links.reasons)].sort(); links.consumptionEventIds = sorted(links.consumptionEventIds);
    links.roundIds = sorted(links.roundIds); links.coverageIds = sorted(links.coverageIds);
    candidates.push({ reference: { program: "referral", id: reward.rewardId }, sourceOrderId: reward.sourceOrderNumber,
      status: reward.status, authority, creditId: reward.rewardCreditEntryId, rulesVersion: reward.ruleVersion, links,
      policy: { ruleVersion: reward.ruleVersion, reversalPolicy: reward.reversalPolicySnapshot,
        baseWaitingDays: reward.baseWaitingDaysSnapshot, returnProtectionDays: reward.returnProtectionDaysSnapshot,
        selfPurchaseTierSnapshot: reward.selfPurchaseTierSnapshot } });
  }
  for (const reward of Object.values(state.retailPromotionRewards)) {
    if (reward.sourceOrderNumber !== orderId || !["scheduled", "released"].includes(reward.status)) continue;
    candidates.push({ reference: { program: "retail_promotion", id: reward.rewardId }, sourceOrderId: orderId,
      status: reward.status, authority: null, creditId: reward.rewardCreditEntryId, rulesVersion: reward.ruleVersion,
      links: { reasons: ["source_order"], consumptionEventIds: [], roundIds: [], coverageIds: [] },
      policy: { ruleVersion: reward.ruleVersion, reversalPolicy: reward.reversalPolicySnapshot,
        baseWaitingDays: reward.baseWaitingDaysSnapshot, returnProtectionDays: reward.returnProtectionDaysSnapshot } });
  }
  for (const conversion of Object.values(state.referralConversions)) {
    if (conversion.orderId !== orderId || !["pending", "rewarded"].includes(conversion.status)) continue;
    candidates.push({ reference: { program: "referral_conversion", id: conversion.conversionId }, sourceOrderId: orderId,
      status: conversion.status, authority: null, creditId: conversion.rewardCreditEntryId, rulesVersion: null,
      links: { reasons: ["source_order"], consumptionEventIds: [], roundIds: [], coverageIds: [] },
      policy: { relationshipId: conversion.relationshipId, occurredAt: conversion.occurredAt } });
  }
  return candidates.sort((left, right) => JSON.stringify(left.reference).localeCompare(JSON.stringify(right.reference)));
}

export function readReturnRewardHoldDependencies(state: MembershipCommerceState): ReturnRewardHoldDependency[] {
  const ids = new Set<string>();
  return returnHoldAudit(state).map(record => {
    let hold: ReturnRewardHoldDependency;
    try { hold = JSON.parse(String(record.after.evidence)); }
    catch { throw new MembershipCommerceError("退貨 HOLD 證據無法讀取"); }
    const request = state.returnEvents?.find((item): item is RequestedReturn => item.type === "RETURN_REQUESTED" && item.eventId === hold.returnRequestedEventId);
    const originalTimeValid = (value: OriginalRewardOrderEvidence | null) => value === null || (value
      && returnEvidenceText(value.orderId, 200) && Number.isFinite(Date.parse(value.orderCreatedAt))
      && (value.completedAt === null || Number.isFinite(Date.parse(value.completedAt)))
      && ["completion_snapshot", "persisted_order", "legacy_qualification_attempt"].includes(value.timeSource));
    if (!request || hold.schemaVersion !== 1 || !hold.reward || !["referral", "retail_promotion", "referral_conversion"].includes(hold.reward.program)
      || !returnEvidenceText(hold.reward.id, 200) || hold.returnRequestId !== request.returnRequestId || hold.returnOrderId !== request.orderId
      || hold.holdDependencyId !== returnHoldIdentity(hold.returnRequestId, hold.reward)
      || hold.idempotencyKey !== `return-domain:reward-hold:${hold.holdDependencyId}`
      || record.entityType !== "return_request" || record.entityId !== hold.returnRequestId || record.sourceEvent !== request.eventId
      || record.timestamp !== hold.createdAt || !Number.isFinite(Date.parse(hold.createdAt))
      || Date.parse(hold.createdAt) < Date.parse(request.occurredAt)
      || record.after.holdDependencyId !== hold.holdDependencyId || ids.has(hold.holdDependencyId)
      || !isDeepStrictEqual(hold.returnLines, request.lines) || !hold.evidence || !["resolved", "manual_review_required"].includes(hold.evidence.status)
      || !originalTimeValid(hold.evidence.sourceOrder) || !Array.isArray(hold.evidence.qualificationOrders)
      || !hold.evidence.qualificationOrders.every(originalTimeValid)
      || (state.idempotency[hold.idempotencyKey] && state.idempotency[hold.idempotencyKey].resultId !== hold.holdDependencyId)
      || !/^[a-f0-9]{64}$/u.test(hold.evidence.policyEvidenceFingerprint)) throw new MembershipCommerceError("退貨 HOLD 關聯證據不一致");
    ids.add(hold.holdDependencyId); return hold;
  });
}

/** A terminal fact stays a blocking handoff until its explicit D resolution is persisted. */
export function projectReturnRewardHolds(state: MembershipCommerceState, reference: ReturnRewardReference): ReturnRewardHoldProjection {
  const dependencies: ReturnRewardHoldProjection["dependencies"] = [];
  if (!state.returnEvents?.length) return { reward: { ...reference }, blocked: false,
    activeHoldDependencyCount: 0, resolutionRequiredDependencyCount: 0, dependencies };
  const persisted = new Set(readReturnRewardHoldDependencies(state)
    .filter(hold => hold.reward.program === reference.program && hold.reward.id === reference.id).map(hold => hold.holdDependencyId));
  const resolved = new Map(readPendingReturnRewardResolutions(state).map(item => [item.holdDependencyId, item.terminalReturnEventId]));
  for (const request of (state.returnEvents ?? []).filter((item): item is RequestedReturn => item.type === "RETURN_REQUESTED")) {
    const holdDependencyId = returnHoldIdentity(request.returnRequestId, reference);
    if (!persisted.has(holdDependencyId) && !returnHoldCandidates(state, request.orderId)
      .some(candidate => candidate.reference.program === reference.program && candidate.reference.id === reference.id)) continue;
    const last = (state.returnEvents ?? []).filter(event => event.returnRequestId === request.returnRequestId && event.orderId === request.orderId).at(-1)!;
    const returnStatus: ReturnRequestStatus = last.type === "RETURN_REQUESTED" ? "pending" : last.type === "RETURN_PROCESSING_LOCKED" ? "processing"
      : last.type === "RETURN_APPROVED" ? "approved" : last.type === "RETURN_REJECTED" ? "rejected" : "withdrawn";
    dependencies.push({ holdDependencyId, returnRequestId: request.returnRequestId, returnOrderId: request.orderId, returnStatus,
      state: returnStatus === "pending" || returnStatus === "processing" ? "active"
        : resolved.get(holdDependencyId) === last.eventId ? "resolved" : "resolution_required", persisted: persisted.has(holdDependencyId) });
  }
  dependencies.sort((left, right) => left.holdDependencyId.localeCompare(right.holdDependencyId));
  return { reward: { ...reference }, blocked: dependencies.some(item => item.state !== "resolved"),
    activeHoldDependencyCount: dependencies.filter(item => item.state === "active").length,
    resolutionRequiredDependencyCount: dependencies.filter(item => item.state === "resolution_required").length, dependencies };
}

/** Reconcile late-created rewards/Coverage as well as requests. Creation is atomic with
 * the existing commerce transaction; the synchronous release gate also derives missing links. */
async function appendReturnRewardHolds(state: MembershipCommerceState, now: Date) {
  if (!state.returnEvents?.length) return;
  const existing = new Set(readReturnRewardHoldDependencies(state).map(hold => hold.holdDependencyId));
  const evidenceCache = new Map<string, RewardDependencyEvidenceResult>();
  for (const request of state.returnEvents.filter((item): item is RequestedReturn => item.type === "RETURN_REQUESTED")) {
    for (const candidate of returnHoldCandidates(state, request.orderId)) {
      const holdDependencyId = returnHoldIdentity(request.returnRequestId, candidate.reference);
      if (existing.has(holdDependencyId)) continue;
      const readSourceOrder = async (orderId: string): Promise<Record<string, unknown> | null> => {
        const order = await readOrder(orderId);
        if (order || orderId !== request.orderId) return order;
        return { orderNumber: orderId, status: "completed", completion: request.completion };
      };
      let proof: RewardDependencyEvidenceResult;
      if (candidate.reference.program === "referral_conversion") {
        proof = { status: "manual_review_required", reason: "missing_qualification_evidence" };
      } else {
        const key = JSON.stringify(candidate.reference);
        proof = evidenceCache.get(key) ?? await resolveRewardDependencyEvidence({ program: candidate.reference.program,
          rewardId: candidate.reference.id, state, readSourceOrder });
        evidenceCache.set(key, proof);
      }
      const ownTime = request.completion.returnLines?.status === "resolved" ? request.completion.returnLines.orderCreatedAt : null;
      const requestOriginal: OriginalRewardOrderEvidence | null = ownTime
        ? { orderId: request.orderId, orderCreatedAt: ownTime, timeSource: "completion_snapshot",
            completedAt: request.completion.completedAt, consumptionEventId: null } : null;
      const hold: ReturnRewardHoldDependency = { schemaVersion: 1, holdDependencyId, returnRequestId: request.returnRequestId,
        returnRequestedEventId: request.eventId, returnOrderId: request.orderId, reward: candidate.reference,
        rewardSourceOrderId: candidate.sourceOrderId, authority: candidate.authority, rewardStatusAtCreation: candidate.status,
        createdAt: new Date(Math.max(now.getTime(), Date.parse(request.occurredAt))).toISOString(),
        idempotencyKey: `return-domain:reward-hold:${holdDependencyId}`, returnLines: structuredClone(request.lines), links: candidate.links,
        evidence: { status: proof.status, reason: proof.status === "resolved" ? null : proof.reason,
          sourceOrder: proof.status === "resolved" ? proof.sourceOrder : candidate.sourceOrderId === request.orderId ? requestOriginal : null,
          qualificationOrders: proof.status === "resolved" ? proof.qualificationOrders : requestOriginal && candidate.sourceOrderId !== request.orderId ? [requestOriginal] : [],
          consumptionEventIds: proof.status === "resolved" ? proof.consumptions.map(item => item.eventId) : candidate.links.consumptionEventIds,
          roundId: proof.status === "resolved" ? proof.qualificationRound?.roundId ?? null : candidate.links.roundIds[0] ?? null,
          coverageId: proof.status === "resolved" ? proof.coverage?.coverageId ?? null : candidate.links.coverageIds[0] ?? null,
          maturationId: proof.status === "resolved" ? proof.maturation?.maturationId ?? null : null,
          creditEntryId: candidate.creditId, rulesVersion: candidate.rulesVersion,
          sourceReferences: proof.status === "resolved" ? proof.sourceReferences : [],
          idempotencyKeys: proof.status === "resolved" ? proof.idempotencyKeys : [],
          policyEvidenceFingerprint: createHash("sha256").update(JSON.stringify(candidate.policy)).digest("hex") } };
      audit(state, { actor: "system", action: RETURN_REWARD_HOLD_ACTION, entityType: "return_request",
        entityId: request.returnRequestId, before: {}, after: { holdDependencyId, evidence: JSON.stringify(hold) },
        reason: "Return-dependent reward deferred; final outcome requires explicit resolution", sourceEvent: request.eventId }, new Date(hold.createdAt));
      remember(state, hold.idempotencyKey, holdDependencyId, new Date(hold.createdAt));
      existing.add(holdDependencyId);
    }
  }
}

const RETURN_PENDING_RESOLUTION_PREFIX = "RETURN_REWARD_HOLD_RESOLVED_";
const RETURN_DEFENSIVE_REVIEW_ACTION = "RETURN_REWARD_DEFENSIVE_REVIEW_REQUIRED";
export type PendingReturnRewardResolution = {
  schemaVersion: 1; resolutionId: string; idempotencyKey: string; holdDependencyId: string;
  reward: ReturnRewardReference; rewardSourceOrderId: string; beneficiaryMemberId: string;
  returnRequestId: string; terminalReturnEventId: string; returnOrderId: string;
  result: "withdrawn" | "rejected" | "approved"; occurredAt: string; recordedAt: string;
  originalPendingRewardAmount: number; previousEffectivePendingAmount: number; remainingEffectivePendingRewardAmount: number;
  incrementalAdjustment: number; cumulativeAdjustment: number;
  reasonCode: "reward_restored_after_return_withdrawn" | "reward_restored_after_return_rejected"
    | "pending_reward_adjusted_due_to_partial_return" | "pending_reward_cancelled_due_to_return" | "pending_reward_unchanged_after_approved_return";
  originalPolicyFingerprint: string; releaseSafetyDeadline: string | null;
  originalQualification: { sourceOrder: OriginalRewardOrderEvidence | null; qualificationOrders: OriginalRewardOrderEvidence[];
    qualificationRoundId: string | null; coverageId: string | null; maturationId: string | null };
  d0Evidence: Array<{ orderId: string; allocationFingerprint: string }>;
  d1ReductionIds: string[]; calculation: Record<string, unknown>; evidenceFingerprint: string;
};
function pendingResolutionAudit(state: MembershipCommerceState) {
  return state.audit.filter(item => item.action.startsWith(RETURN_PENDING_RESOLUTION_PREFIX) || item.action === RETURN_DEFENSIVE_REVIEW_ACTION);
}
export function readPendingReturnRewardResolutions(state: MembershipCommerceState): PendingReturnRewardResolution[] {
  const audits = pendingResolutionAudit(state).filter(item => item.action.startsWith(RETURN_PENDING_RESOLUTION_PREFIX));
  if (!audits.length) {
    if (Object.keys(state.idempotency).some(key => key.startsWith("return-domain:pending-resolution:"))) throw new MembershipCommerceError("退貨待發獎勵結案證據遺失");
    return [];
  }
  const holds = new Map(readReturnRewardHoldDependencies(state).map(item => [item.holdDependencyId, item]));
  const records: PendingReturnRewardResolution[] = [];
  const ids = new Set<string>(), holdIds = new Set<string>(), previous = new Map<string, PendingReturnRewardResolution>();
  const reductionIds = new Set(readReturnConsumptionReductions(state).map(item => item.reductionId));
  for (const audit of audits) {
    let record: PendingReturnRewardResolution;
    try { record = JSON.parse(String(audit.after.evidence)); } catch { throw new MembershipCommerceError("退貨待發獎勵結案證據無法讀取"); }
    if (!record || !record.reward) throw new MembershipCommerceError("退貨待發獎勵結案證據格式不正確");
    const hold = holds.get(record.holdDependencyId), terminal = state.returnEvents?.find(item => item.eventId === record.terminalReturnEventId);
    const identity = deterministicId("return_reward_resolution", JSON.stringify([record.holdDependencyId, record.terminalReturnEventId]));
    const rewardKey = JSON.stringify(record.reward), prior = previous.get(rewardKey);
    const { evidenceFingerprint, ...payload } = record;
    if (!hold || record.schemaVersion !== 1 || record.resolutionId !== identity || ids.has(identity) || holdIds.has(record.holdDependencyId)
      || record.idempotencyKey !== `return-domain:pending-resolution:${identity}`
      || !isDeepStrictEqual(hold.reward, record.reward) || hold.rewardSourceOrderId !== record.rewardSourceOrderId
      || !terminal || !["RETURN_WITHDRAWN", "RETURN_REJECTED", "RETURN_APPROVED"].includes(terminal.type)
      || terminal.type !== `RETURN_${record.result.toUpperCase()}` || terminal.returnRequestId !== hold.returnRequestId
      || record.returnRequestId !== hold.returnRequestId || record.returnOrderId !== hold.returnOrderId || terminal.orderId !== record.returnOrderId
      || record.occurredAt !== terminal.occurredAt || !Number.isFinite(Date.parse(record.recordedAt))
      || Date.parse(record.recordedAt) < Date.parse(record.occurredAt)
      || ![record.originalPendingRewardAmount, record.previousEffectivePendingAmount, record.remainingEffectivePendingRewardAmount].every(reductionMoney)
      || record.previousEffectivePendingAmount !== (prior?.remainingEffectivePendingRewardAmount ?? record.originalPendingRewardAmount)
      || (prior && (prior.originalPendingRewardAmount !== record.originalPendingRewardAmount || prior.originalPolicyFingerprint !== record.originalPolicyFingerprint))
      || record.remainingEffectivePendingRewardAmount > record.previousEffectivePendingAmount
      || record.incrementalAdjustment !== record.remainingEffectivePendingRewardAmount - record.previousEffectivePendingAmount
      || record.cumulativeAdjustment !== record.remainingEffectivePendingRewardAmount - record.originalPendingRewardAmount
      || !returnEvidenceText(record.beneficiaryMemberId, 200) || !/^[a-f0-9]{64}$/u.test(record.originalPolicyFingerprint)
      || record.reasonCode !== (record.result === "withdrawn" ? "reward_restored_after_return_withdrawn" : record.result === "rejected" ? "reward_restored_after_return_rejected"
        : record.remainingEffectivePendingRewardAmount === 0 ? "pending_reward_cancelled_due_to_return"
          : record.incrementalAdjustment === 0 ? "pending_reward_unchanged_after_approved_return" : "pending_reward_adjusted_due_to_partial_return")
      || (record.result !== "approved" && record.incrementalAdjustment !== 0)
      || !Array.isArray(record.d1ReductionIds) || record.d1ReductionIds.some(id => !reductionIds.has(id))
      || !Array.isArray(record.d0Evidence) || record.d0Evidence.some(item => !returnEvidenceText(item.orderId, 200) || !/^[a-f0-9]{64}$/u.test(item.allocationFingerprint))
      || !record.originalQualification || (record.originalQualification.sourceOrder !== null
        && (record.originalQualification.sourceOrder.orderId !== record.rewardSourceOrderId
          || !Number.isFinite(Date.parse(record.originalQualification.sourceOrder.orderCreatedAt))))
      || (hold.evidence.sourceOrder && record.originalQualification.sourceOrder
        && hold.evidence.sourceOrder.orderCreatedAt !== record.originalQualification.sourceOrder.orderCreatedAt)
      || (record.releaseSafetyDeadline !== null && !Number.isFinite(Date.parse(record.releaseSafetyDeadline)))
      || originalEconomicFingerprint(payload) !== evidenceFingerprint
      || audit.action !== `${RETURN_PENDING_RESOLUTION_PREFIX}${record.result.toUpperCase()}`
      || audit.actor !== "system" || audit.entityType !== "return_request" || audit.entityId !== record.returnRequestId
      || audit.sourceEvent !== record.terminalReturnEventId || audit.timestamp !== record.recordedAt || audit.after.resolutionId !== identity
      || state.idempotency[record.idempotencyKey]?.resultId !== identity) throw new MembershipCommerceError("退貨待發獎勵結案證據關聯不一致");
    ids.add(identity); holdIds.add(record.holdDependencyId); records.push(record); previous.set(rewardKey, record);
  }
  for (const [key, entry] of Object.entries(state.idempotency)) if (key.startsWith("return-domain:pending-resolution:")
    && (!ids.has(entry.resultId) || key !== `return-domain:pending-resolution:${entry.resultId}`)) throw new MembershipCommerceError("退貨待發獎勵結案操作識別不一致");
  return structuredClone(records);
}
export function projectPendingReturnRewardEntitlement(state: MembershipCommerceState, reward: ReturnRewardReference) {
  const resolutions = readPendingReturnRewardResolutions(state).filter(item => item.reward.program === reward.program && item.reward.id === reward.id);
  const latest = resolutions.at(-1);
  const original = reward.program === "referral" ? state.referralRewards[reward.id]?.projectedCreditAmount ?? state.referralRewards[reward.id]?.calculatedCreditAmount
    : reward.program === "retail_promotion" ? state.retailPromotionRewards[reward.id]?.calculatedCreditAmount : state.referralConversions[reward.id]?.pendingRewardAmount;
  const amount = latest?.originalPendingRewardAmount ?? original ?? 0;
  return { reward: { ...reward }, originalPendingRewardAmount: amount,
    remainingEffectivePendingRewardAmount: latest?.remainingEffectivePendingRewardAmount ?? amount,
    cumulativeApprovedReturnConsequence: amount - (latest?.remainingEffectivePendingRewardAmount ?? amount),
    cancelledBeforeRelease: Boolean(latest && latest.remainingEffectivePendingRewardAmount === 0), resolutions };
}

const pendingReturnSafety = new WeakMap<MembershipCommerceState, Map<string, string | null>>();
const pendingReturnSafetyReviews = new WeakMap<MembershipCommerceState, Map<string, string>>();
const conversionReleaseEligibility = new WeakMap<MembershipCommerceState, Set<string>>();
function creditRewardReference(state: MembershipCommerceState, sourceReference: string): ReturnRewardReference | null {
  if (sourceReference.startsWith("referral_reward:")) return { program: "referral", id: sourceReference.slice("referral_reward:".length) };
  if (sourceReference.startsWith("retail_promotion_reward:")) return { program: "retail_promotion", id: sourceReference.slice("retail_promotion_reward:".length) };
  const conversion = Object.values(state.referralConversions).find(item => sourceReference === `referral_conversion:${item.relationshipId}:${item.orderId}`);
  return conversion ? { program: "referral_conversion", id: conversion.conversionId } : null;
}
/** Prime a transaction-local read-only gate from ORIGINAL completion snapshots.
 * No state migration, active business-rule lookup, order write, or pricing lookup.
 * Historical records without canonical completion retain existing legacy conditions;
 * known return exposure is never bypassed, including the final deadline millisecond. */
async function primePendingReturnSafety(state: MembershipCommerceState, references?: ReturnRewardReference[]) {
  const map = pendingReturnSafety.get(state) ?? new Map<string, string | null>();
  const reviews = pendingReturnSafetyReviews.get(state) ?? new Map<string, string>();
  const orderCache = new Map<string, Record<string, unknown> | null>();
  const refs = references ?? [
    ...Object.values(state.referralRewards).filter(item => item.status === "scheduled").map(item => ({ program: "referral" as const, id: item.rewardId })),
    ...Object.values(state.retailPromotionRewards).filter(item => item.status === "scheduled").map(item => ({ program: "retail_promotion" as const, id: item.rewardId })),
    ...Object.values(state.referralConversions).filter(item => item.status === "pending").map(item => ({ program: "referral_conversion" as const, id: item.conversionId })),
  ];
  const resolutions = readPendingReturnRewardResolutions(state);
  for (const reference of refs) {
    const key = JSON.stringify(reference);
    reviews.delete(key);
    try {
    const referral = reference.program === "referral" ? state.referralRewards[reference.id] : null;
    const retail = reference.program === "retail_promotion" ? state.retailPromotionRewards[reference.id] : null;
    const conversion = reference.program === "referral_conversion" ? state.referralConversions[reference.id] : null;
    const sourceOrderId = referral?.sourceOrderNumber ?? retail?.sourceOrderNumber ?? conversion?.orderId;
    if (!sourceOrderId) continue;
    const orderIds = new Set([sourceOrderId]);
    if (referral?.qualificationOrderNumber) orderIds.add(referral.qualificationOrderNumber);
    if (referral?.selfPurchaseTierSnapshot) for (const evidence of referral.selfPurchaseTierSnapshot.latestEvidence) orderIds.add(evidence.sourceOrderId);
    if (referral && referralRewardQualificationAuthority(referral) === "qualification_coverage") {
      const coverage = Object.values(state.referralRewardCoverages).find(item => item.referralRewardId === referral.rewardId);
      const round = coverage ? state.qualificationRounds[coverage.qualificationRoundId] : null;
      for (const allocation of round?.consumptionAccounting.allocations ?? []) {
        const consumption = state.validConsumptionEvents[allocation.validConsumptionEventId]; if (consumption) orderIds.add(consumption.sourceOrderId);
      }
    }
    const deadlines = resolutions.filter(item => item.reward.program === reference.program && item.reward.id === reference.id)
      .flatMap(item => item.releaseSafetyDeadline ? [item.releaseSafetyDeadline] : []);
    for (const orderId of orderIds) {
      if (!orderCache.has(orderId)) {
        const request = state.returnEvents?.find((item): item is RequestedReturn => item.type === "RETURN_REQUESTED" && item.orderId === orderId);
        orderCache.set(orderId, request ? { completion: request.completion } : await readOrder(orderId));
      }
      const order = orderCache.get(orderId), completion = order?.completion as { returnDeadline?: string } | undefined;
      if (completion) {
        if (!completion.returnDeadline || !Number.isFinite(Date.parse(completion.returnDeadline))) throw new MembershipCommerceError("來源訂單退貨保護證據不完整");
        deadlines.push(completion.returnDeadline);
      }
    }
    const snapshot = referral ?? retail;
    if (snapshot?.successfulPickupBusinessDate && Number.isSafeInteger(snapshot.returnProtectionDaysSnapshot)) {
      deadlines.push(returnDeadlineAtTaipeiDayEnd(`${snapshot.successfulPickupBusinessDate}T00:00:00+08:00`, snapshot.returnProtectionDaysSnapshot!));
    }
    map.set(key, deadlines.sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? null);
    } catch (error) {
      map.delete(key); reviews.set(key, error instanceof Error ? error.message : "source_return_safety_evidence_requires_review");
    }
  }
  pendingReturnSafety.set(state, map);
  pendingReturnSafetyReviews.set(state, reviews);
}
function pendingRewardSafetyReview(state: MembershipCommerceState, reference: ReturnRewardReference) {
  return pendingReturnSafetyReviews.get(state)?.get(JSON.stringify(reference)) ?? null;
}
function pendingRewardSafetyDeadline(state: MembershipCommerceState, reference: ReturnRewardReference) {
  return pendingReturnSafety.get(state)?.get(JSON.stringify(reference))
    ?? projectPendingReturnRewardEntitlement(state, reference).resolutions.map(item => item.releaseSafetyDeadline)
      .filter((item): item is string => Boolean(item)).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? null;
}

/** Only immutable reward calculation inputs, never current status/release cap usage. */
function pendingRewardOriginalPolicy(state: MembershipCommerceState, reference: ReturnRewardReference) {
  if (reference.program === "referral_conversion") {
    const conversion = state.referralConversions[reference.id];
    return { conversionId: conversion.conversionId, relationshipId: conversion.relationshipId, orderId: conversion.orderId,
      occurredAt: conversion.occurredAt, originalCalculation: conversion.originalCalculation };
  }
  if (reference.program === "retail_promotion") {
    const reward = state.retailPromotionRewards[reference.id];
    return { rewardId: reward.rewardId, sourceOrderNumber: reward.sourceOrderNumber, rate: reward.rewardRate,
      eligibleMerchandiseAmount: reward.eligibleMerchandiseAmount, calculationBasis: reward.calculationBasis,
      calculationBaseValue: reward.calculationBaseValue, pvRewardMoneyValue: reward.pvRewardMoneyValue,
      rounding: reward.roundingModeSnapshot, ruleVersion: reward.ruleVersion };
  }
  const reward = state.referralRewards[reference.id];
  return { rewardId: reward.rewardId, sourceOrderNumber: reward.sourceOrderNumber, rate: reward.rewardRate,
    paidAmountBasis: reward.paidAmountBasis, effectivePV: reward.effectivePV, calculationMode: reward.calculationMode,
    pvRewardMoneyValue: reward.pvRewardMoneyValue, ruleVersion: reward.ruleVersion,
    tierSnapshot: reward.selfPurchaseTierSnapshot, organizationCapPercent: reward.organizationCapPercentSnapshot,
    organizationCapAmount: reward.organizationCapAmountSnapshot, authority: referralRewardQualificationAuthority(reward) };
}

/** Preserve the exact decimal values already stored by the PV authority. This is
 * arithmetic normalization only: no PV rounding, money conversion or new PV rule. */
function preservedDecimalUnits(values: Array<number | string>) {
  const parts = values.map(value => {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) throw new MembershipCommerceError("原始點數證據不完整");
    const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/iu.exec(String(value));
    if (!match) throw new MembershipCommerceError("原始點數證據格式不正確");
    const decimals = match[2] ?? "", exponent = Number(match[3] ?? 0);
    const power = decimals.length - exponent;
    const digits = BigInt(match[1] + decimals);
    return power < 0 ? { units: digits * (BigInt(10) ** BigInt(-power)), power: 0 } : { units: digits, power };
  });
  const power = Math.max(0, ...parts.map(part => part.power));
  return { power, units: parts.map(part => part.units * (BigInt(10) ** BigInt(power - part.power))) };
}
function preservedDecimalText(units: bigint, power: number) {
  if (power === 0) return units.toString();
  const digits = units.toString().padStart(power + 1, "0");
  return `${digits.slice(0, -power)}.${digits.slice(-power)}`;
}

/** D0 quantities/economics and D1 reductions are viewed at an authoritative B log prefix.
 * No current pricing/role/credit-cap lookup. Original archived versions supply only
 * the original money rounding or legacy conversion policy absent on old snapshots. */
async function calculatePendingReturnReward(input: { state: MembershipCommerceState; reference: ReturnRewardReference;
  terminal: ReturnDomainEvent; versions: RulesVersion[]; readOriginal: (id: string) => Promise<Record<string, unknown> | null> }) {
  const { state, reference, terminal, versions, readOriginal } = input;
  const index = state.returnEvents!.findIndex(item => item.eventId === terminal.eventId);
  const prefix = state.returnEvents!.slice(0, index + 1);
  const quantities = new Map<string, Map<string, number>>();
  const requested = new Map<string, RequestedReturn>();
  const approvedIds = new Set<string>();
  for (const event of prefix) {
    if (event.type === "RETURN_REQUESTED") requested.set(event.returnRequestId, event);
    if (event.type !== "RETURN_APPROVED") continue;
    approvedIds.add(event.eventId);
    const request = requested.get(event.returnRequestId)!;
    const map = quantities.get(event.orderId) ?? new Map<string, number>();
    for (const line of approvedReturnLines(request, event)) map.set(line.returnLineRef, (map.get(line.returnLineRef) ?? 0) + line.quantity);
    quantities.set(event.orderId, map);
  }
  const reductions = readReturnConsumptionReductions(state).filter(item => approvedIds.has(item.approvedReturnEventId));
  const d0Evidence = new Map<string, string>();
  const usedConsumptionIds = new Set<string>();
  const calculation: Record<string, unknown> = { method: "original-program-recalculation-v1" };
  const fail = (message: string): never => { throw new MembershipCommerceError(message); };
  async function frozenLines(orderId: string) {
    const order = await readOriginal(orderId); if (!order) return fail("missing_original_order");
    const lines = resolveReturnLineEvidence(order); if (lines.status !== "resolved") return fail("missing_original_line_evidence");
    return { order, lines };
  }
  async function remainingMoney(orderId: string, total: number, authorityKind?: string, authorityId?: string) {
    const map = quantities.get(orderId); if (!map?.size) return total;
    const { order } = await frozenLines(orderId);
    for (const consumption of Object.values(state.validConsumptionEvents)) if (consumption.sourceOrderId === orderId) usedConsumptionIds.add(consumption.eventId);
    const proof = resolveOriginalCommerceEconomicEvidence({ state, order });
    if (proof.status !== "resolved") return fail(`d0_${proof.reason}`);
    const authority = authorityKind ? proof.monetaryAuthorities.find(item => item.kind === authorityKind && item.authorityId === authorityId) : null;
    if (authorityKind && (!authority || authority.status !== "resolved" || authority.authoritativeTotal !== total)) return fail("unproven_original_reward_basis");
    const lines = authority?.status === "resolved" ? authority.lines : allocatePreservedRewardMoney(proof.allocation, total);
    const removed = reductionSum(lines.map(line => cumulativeOriginalLineContribution(line.rewardEconomicContribution, line.originalQuantity, map.get(line.returnLineRef) ?? 0)));
    d0Evidence.set(orderId, proof.allocation.allocationFingerprint);
    if (removed > total) return fail("return_economic_reduction_exceeds_basis");
    return total - removed;
  }
  async function remainingPV(orderId: string, originalTotal: number, kind: "effective" | "consumption" = "effective") {
    const map = quantities.get(orderId); if (!map?.size) return originalTotal;
    const { order, lines } = await frozenLines(orderId);
    const original = resolveOrderRewardBasis({ ...lines.transactionSnapshot, items: lines.lines.map(item => item.snapshot) });
    const base = kind === "consumption" ? original.totalValidConsumptionPV : original.totalEffectivePV;
    if (base !== originalTotal || ["unknown_domain", "invalid_pv_snapshot"].includes(original.monetaryBasisStatus)) return fail("unproven_original_pv_authority");
    const retained = lines.lines.flatMap(line => {
      const quantity = line.originalQuantity - (map.get(line.returnLineRef) ?? 0);
      return quantity > 0 ? [{ ...line.snapshot, quantity }] : [];
    });
    // PV is classified by the SAME existing snapshot reader, independently of NTD.
    const basis = resolveOrderRewardBasis({ ...order, items: retained });
    const value = kind === "consumption" ? basis.totalValidConsumptionPV : basis.totalEffectivePV;
    if (!Number.isFinite(value) || value < 0 || value > base) return fail("invalid_remaining_pv");
    calculation.pvAuthority = "preserved-line-pv-via-orderRewardBasis";
    return value;
  }
  async function hasRetainedLine(orderId: string) {
    const map = quantities.get(orderId); if (!map?.size) return true;
    const { lines } = await frozenLines(orderId);
    return lines.lines.some(line => line.originalQuantity > (map.get(line.returnLineRef) ?? 0));
  }
  let entitlement = 0;
  if (reference.program === "referral_conversion") {
    const conversion = state.referralConversions[reference.id];
    const version = conversion.originalCalculation ? versions.find(item => item.rulesVersion === conversion.originalCalculation!.rulesVersion)
      : versions.filter(item => Date.parse(item.effectiveAt) <= Date.parse(conversion.occurredAt)).at(-1);
    if (!version) return fail("missing_original_conversion_policy");
    const { lines } = await frozenLines(conversion.orderId);
    const basis = resolveOrderRewardBasis({ ...lines.transactionSnapshot, items: lines.lines.map(item => item.snapshot) });
    if (basis.monetaryBasisStatus !== "resolved" || basis.rewardMerchandiseAmount === null) return fail("unproven_original_conversion_basis");
    const original = referralRewardForMerchandise({ merchandiseAfterDiscounts: basis.rewardMerchandiseAmount, eligibleItemCount: basis.coffeeEligibleQuantity, rules: version.rules });
    const baseline = projectPendingReturnRewardEntitlement(state, reference).originalPendingRewardAmount;
    if (original !== baseline) return fail("inconsistent_original_conversion_calculation");
    if (conversion.originalCalculation && (conversion.originalCalculation.calculatedRewardAmount !== original
      || conversion.originalCalculation.merchandiseAmount !== basis.rewardMerchandiseAmount)) return fail("inconsistent_original_conversion_snapshot");
    if (!conversion.originalCalculation && (version.rules.referral.referrerEligibility.mode !== "none" || !version.rules.referral.reward.repeatedRewards)) return fail("legacy_conversion_qualification_evidence_requires_review");
    const remaining = await remainingMoney(conversion.orderId, basis.rewardMerchandiseAmount);
    const counts = quantities.get(conversion.orderId) ?? new Map<string, number>();
    const remainingCount = lines.lines.filter(line => line.snapshot.domain === undefined || line.snapshot.domain === "coffee")
      .reduce((sum, line) => sum + line.originalQuantity - (counts.get(line.returnLineRef) ?? 0), 0);
    entitlement = await hasRetainedLine(conversion.orderId) ? referralRewardForMerchandise({ merchandiseAfterDiscounts: remaining, eligibleItemCount: remainingCount, rules: version.rules }) : 0;
    calculation.legacyPolicy = { rulesVersion: version.rulesVersion, reward: version.rules.referral.reward, rounding: version.rules.money.roundingMode, remainingBasis: remaining };
    calculation.originalEligibility = conversion.originalCalculation?.referrerEligibleAtCreation ?? true;
  } else if (reference.program === "retail_promotion") {
    const reward = state.retailPromotionRewards[reference.id], basis = reward.calculationBasis ?? "paid_amount";
    const originalBase = reward.calculationBaseValue ?? reward.eligibleMerchandiseAmount;
    const remaining = basis === "pv" ? await remainingPV(reward.sourceOrderNumber, originalBase)
      : await remainingMoney(reward.sourceOrderNumber, originalBase, "retail_promotion_calculation", reward.rewardId);
    const originalPayout = percentageRewardPayout({ calculationBasis: basis, calculationBaseValue: originalBase, rewardRate: reward.rewardRate,
      pvRewardMoneyValue: reward.pvRewardMoneyValue ?? 0, roundingMode: reward.roundingModeSnapshot }).calculatedCreditAmount;
    if (originalPayout !== projectPendingReturnRewardEntitlement(state, reference).originalPendingRewardAmount) return fail("inconsistent_original_retail_calculation");
    entitlement = percentageRewardPayout({ calculationBasis: basis, calculationBaseValue: remaining, rewardRate: reward.rewardRate,
      pvRewardMoneyValue: reward.pvRewardMoneyValue ?? 0, roundingMode: reward.roundingModeSnapshot }).calculatedCreditAmount;
    calculation.linear = { basis, originalBase, remaining, rate: reward.rewardRate, pvRewardMoneyValue: reward.pvRewardMoneyValue ?? 0,
      rounding: reward.roundingModeSnapshot, originalRuleVersion: reward.ruleVersion };
  } else {
    const reward = state.referralRewards[reference.id];
    const version = versions.find(item => item.rulesVersion === reward.ruleVersion);
    const rounding = reward.selfPurchaseTierSnapshot?.payout.moneyRoundingMode ?? version?.rules.money.roundingMode;
    if (!rounding || rounding === OWNER_DECISION_REQUIRED) return fail("missing_original_reward_rounding");
    const paid = await remainingMoney(reward.sourceOrderNumber, reward.paidAmountBasis, "referral_paid_basis", reward.rewardId);
    const pv = reward.calculationMode === "pv" ? await remainingPV(reward.sourceOrderNumber, reward.effectivePV) : reward.effectivePV;
    if (reward.selfPurchaseTierSnapshot) {
      const snapshot = reward.selfPurchaseTierSnapshot;
      const originalPayout = selfPurchaseTierPayout({ result: snapshot.latestResult, paidAmountBasis: reward.paidAmountBasis,
        effectivePV: reward.effectivePV, snapshot }).calculatedCreditAmount;
      if (originalPayout !== projectPendingReturnRewardEntitlement(state, reference).originalPendingRewardAmount) return fail("inconsistent_original_tier_calculation");
      const seen = new Set<string>();
      let prior = 0, current: number | null = null;
      for (const evidence of snapshot.latestEvidence) {
        if (seen.has(evidence.sourceOrderId)) return fail("duplicate_original_tier_evidence"); seen.add(evidence.sourceOrderId);
        const consumption = evidence.validConsumptionEventId ? state.validConsumptionEvents[evidence.validConsumptionEventId] : null;
        if (evidence.validConsumptionEventId && (!consumption || consumption.sourceOrderId !== evidence.sourceOrderId)) return fail("missing_original_tier_consumption");
        if (consumption) {
          usedConsumptionIds.add(consumption.eventId);
          const d1 = projectReturnConsumptionWithRecords(state, consumption.eventId, reductions);
          if (d1.status !== "resolved") return fail(`d1_${d1.reason}`);
        }
        const amount = snapshot.rules.thresholdBasis === "pv" ? await remainingPV(evidence.sourceOrderId, evidence.thresholdAmount, "consumption")
          : await remainingMoney(evidence.sourceOrderId, evidence.thresholdAmount,
            consumption ? "self_purchase_paid_consumption" : undefined, consumption?.eventId);
        if (evidence.role === "current") { if (evidence.sourceOrderId !== reward.sourceOrderNumber) return fail("inconsistent_current_tier_order"); current = amount; }
        else prior += amount;
      }
      if (current === null) return fail("missing_current_tier_evidence");
      const result = calculateSelfPurchaseTierReward({ priorAmount: prior, currentAmount: current,
        calculationMethod: snapshot.rules.calculationMethod, tiers: snapshot.rules.tiers });
      entitlement = selfPurchaseTierPayout({ result, paidAmountBasis: paid, effectivePV: pv, snapshot }).calculatedCreditAmount;
      calculation.tier = { rulesFingerprint: originalEconomicFingerprint(snapshot.rules), prior, current, result, payout: snapshot.payout };
    } else {
      const base = reward.calculationMode === "pv" ? pv * reward.pvRewardMoneyValue : paid;
      entitlement = rewardRound(base * reward.rewardRate / 100, rounding);
      const originalBase = reward.calculationMode === "pv" ? reward.effectivePV * reward.pvRewardMoneyValue : reward.paidAmountBasis;
      let originalEntitlement = rewardRound(originalBase * reward.rewardRate / 100, rounding);
      if (reward.rewardType !== "self_purchase" && reward.organizationCapPercentSnapshot !== undefined) {
        let available = rewardRound(base * reward.organizationCapPercentSnapshot / 100, rounding);
        let originalAvailable = rewardRound(originalBase * reward.organizationCapPercentSnapshot / 100, rounding);
        const peers = Object.values(state.referralRewards).filter(item => item.sourceOrderNumber === reward.sourceOrderNumber
          && item.rewardType === reward.rewardType).sort((a, b) => a.referralLevel - b.referralLevel || a.rewardId.localeCompare(b.rewardId));
        for (const peer of peers) {
          if (peer.paidAmountBasis !== reward.paidAmountBasis || peer.calculationMode !== reward.calculationMode
            || peer.effectivePV !== reward.effectivePV || peer.pvRewardMoneyValue !== reward.pvRewardMoneyValue) return fail("inconsistent_original_cap_group");
          const portion = Math.max(0, Math.min(rewardRound(base * peer.rewardRate / 100, rounding), available));
          const originalPortion = Math.max(0, Math.min(rewardRound(originalBase * peer.rewardRate / 100, rounding), originalAvailable));
          available -= portion; originalAvailable -= originalPortion;
          if (peer.rewardId === reward.rewardId) { entitlement = portion; originalEntitlement = originalPortion; break; }
        }
      }
      if (originalEntitlement !== projectPendingReturnRewardEntitlement(state, reference).originalPendingRewardAmount) return fail("inconsistent_original_linear_calculation");
      calculation.linear = { mode: reward.calculationMode, remainingPaid: paid, remainingPV: pv, rate: reward.rewardRate,
        pvRewardMoneyValue: reward.pvRewardMoneyValue, rounding, originalRuleVersion: reward.ruleVersion };
    }
    const authority = referralRewardQualificationAuthority(reward);
    if (authority === "qualification_coverage") {
      const chain = qualificationCoverageProjectionEvidence(state, reward);
      if (!chain) return fail("missing_original_coverage_chain");
      const effective = new Map<string, number | string>();
      const allocationEvidence: Array<Record<string, unknown>> = [];
      for (const allocation of chain.round.consumptionAccounting.allocations) {
        const consumption = state.validConsumptionEvents[allocation.validConsumptionEventId];
        if (!consumption) return fail("missing_original_coverage_consumption");
        usedConsumptionIds.add(consumption.eventId);
        let value: number | string = allocation.amount;
        if (quantities.has(consumption.sourceOrderId)) {
          if (qualificationBasisFromRound(chain.round) === "pv") {
            if (consumption.validConsumptionPV === undefined) return fail("missing_original_pv_consumption");
            const remaining = await remainingPV(consumption.sourceOrderId, consumption.validConsumptionPV, "consumption");
            const rounds = Object.values(state.qualificationRounds).filter(round => qualificationBasisFromRound(round) === "pv"
              && round.consumptionAccounting.allocations.some(item => item.validConsumptionEventId === consumption.eventId)).sort(originalAllocationChronology);
            if (rounds.some(round => round.memberId !== consumption.memberId || !Number.isFinite(Date.parse(round.createdAt))
              || !Number.isFinite(Date.parse(round.qualifiedAt)) || Date.parse(round.createdAt) < Date.parse(round.qualifiedAt)
              || Date.parse(round.qualifiedAt) < Date.parse(consumption.finalizedAt))) return fail("unproven_original_pv_allocation_chronology");
            const amounts = rounds.map(round => reductionSum(round.consumptionAccounting.allocations
              .filter(item => item.validConsumptionEventId === consumption.eventId).map(item => item.amount)));
            const decimal = preservedDecimalUnits([consumption.validConsumptionPV, remaining, ...amounts]);
            const original = decimal.units[0], retained = decimal.units[1];
            const projected = unwindOriginalAllocationUnits(original, original - retained, decimal.units.slice(2));
            const ordinal = rounds.findIndex(round => round.roundId === chain.round.roundId);
            if (ordinal < 0) return fail("missing_original_pv_allocation");
            value = preservedDecimalText(projected.effective[ordinal], decimal.power);
            calculation.pvCoveragePolicy = { unwindPolicy: RETURN_CONSUMPTION_UNWIND_POLICY, unit: "pv",
              originalPV: String(consumption.validConsumptionPV), remainingPV: String(remaining), originalCarry: preservedDecimalText(projected.carry, decimal.power),
              effectiveCarry: preservedDecimalText(projected.effectiveCarry, decimal.power) };
          } else {
            const d1 = projectReturnConsumptionWithRecords(state, consumption.eventId, reductions);
            if (d1.status !== "resolved") return fail(`d1_${d1.reason}`);
            value = d1.effectiveAllocationByRound.find(item => item.roundId === chain.round.roundId)?.effectiveAllocation ?? 0;
          }
        }
        effective.set(consumption.eventId, value);
        allocationEvidence.push({ consumptionEventId: consumption.eventId, originalAllocation: allocation.amount, effectiveAllocation: value });
      }
      const pathSupported = (path: QualificationPathEvaluation) => {
        if (!path.passed || (path.activeSubscriptionRequired && !path.activeSubscriptionSatisfied)) return false;
        const values = preservedDecimalUnits([path.threshold, ...path.eligibleEventIds.map(eventId => effective.get(eventId) ?? 0)]).units;
        return values.slice(1).reduce((sum, amount) => sum + amount, BigInt(0)) >= values[0];
      };
      const g = pathSupported(chain.round.generalPath), s = pathSupported(chain.round.subscriptionPath), mode = chain.round.qualificationMode;
      const supported = mode === "general" ? g : mode === "subscription" ? s : mode === "both" ? g && s : g || s;
      if (!supported) entitlement = 0;
      calculation.coverage = { roundId: chain.round.roundId, coverageId: chain.coverage.coverageId,
        maturationId: chain.maturation?.maturationId ?? null, qualifiedAt: chain.round.qualifiedAt, supported, allocationEvidence };
    } else if (authority === "legacy_order" && reward.qualificationOrderNumber && !(await hasRetainedLine(reward.qualificationOrderNumber))) {
      entitlement = 0; calculation.legacyQualification = "original_qualification_order_fully_returned";
    }
  }
  if (!reductionMoney(entitlement)) return fail("invalid_remaining_pending_entitlement");
  return { entitlement, calculation, d0Evidence: [...d0Evidence].map(([orderId, allocationFingerprint]) => ({ orderId, allocationFingerprint })),
    d1ReductionIds: reductions.filter(item => usedConsumptionIds.has(item.consumptionEventId)).map(item => item.reductionId) };
}

/** Explicit D worker after B terminal facts, in the SAME commerce lock as D1 and
 * audit/idempotency writes. The normal scheduler never resolves an unprocessed fact
 * by itself: resolution_required remains a blocking handoff until this succeeds.
 * New UI/API orchestration can call this without exposing caller-supplied amounts. */
export async function resolveTerminalReturnRewardDependencies(input: { now?: Date; stateFilePath?: string; rulesFilePath?: string } = {}) {
  const rulesStore = await readMembershipRulesStore(input.rulesFilePath);
  return transaction(async (state, now) => {
    await appendReturnRewardHolds(state, now);
    // Review each affected consumption independently. Incomplete legacy evidence
    // for one order must not prevent another request/reward from resolving.
    const approvedOrderIds = new Set((state.returnEvents ?? []).filter(item => item.type === "RETURN_APPROVED").map(item => item.orderId));
    const consumptionReviews: ConsumptionProjectionFailure[] = [];
    for (const consumption of Object.values(state.validConsumptionEvents).filter(item => approvedOrderIds.has(item.sourceOrderId))) {
      const d1 = appendApprovedReturnConsumptionReductions(state, now, new Set([consumption.eventId]));
      if (d1.status !== "resolved") consumptionReviews.push(d1);
    }
    const resolutions = readPendingReturnRewardResolutions(state), resolvedIds = new Set(resolutions.map(item => item.holdDependencyId));
    const holds = readReturnRewardHoldDependencies(state);
    const orders = new Map<string, Record<string, unknown> | null>();
    const readOriginal = async (orderId: string) => {
      if (!orders.has(orderId)) {
        const request = state.returnEvents?.find((item): item is RequestedReturn => item.type === "RETURN_REQUESTED" && item.orderId === orderId);
        orders.set(orderId, request ? { orderNumber: orderId, status: "completed", completion: request.completion,
          createdAt: request.completion.returnLines?.status === "resolved" ? request.completion.returnLines.orderCreatedAt : undefined } : await readOrder(orderId));
      }
      return orders.get(orderId)!;
    };
    const issues: Array<{ holdDependencyId: string; reward: ReturnRewardReference; reason: string; compatibility?: "released_reward_defensive_review" }> = [];
    let resolvedCount = 0;
    for (const terminal of state.returnEvents ?? []) {
      if (!["RETURN_WITHDRAWN", "RETURN_REJECTED", "RETURN_APPROVED"].includes(terminal.type)) continue;
      for (const hold of holds.filter(item => item.returnRequestId === terminal.returnRequestId && !resolvedIds.has(item.holdDependencyId))) {
        const reference = hold.reward;
        const referral = reference.program === "referral" ? state.referralRewards[reference.id] : null;
        const retail = reference.program === "retail_promotion" ? state.retailPromotionRewards[reference.id] : null;
        const conversion = reference.program === "referral_conversion" ? state.referralConversions[reference.id] : null;
        const reward = referral ?? retail ?? conversion;
        if (!reward) { issues.push({ holdDependencyId: hold.holdDependencyId, reward: reference, reason: "missing_original_reward" }); continue; }
        if (reward.status === "released" || reward.status === "rewarded" || reward.rewardCreditEntryId) {
          const key = `return-domain:defensive-review:${hold.holdDependencyId}`;
          if (!state.idempotency[key]) {
            audit(state, { actor: "system", action: RETURN_DEFENSIVE_REVIEW_ACTION, entityType: "return_request", entityId: hold.returnRequestId,
              before: {}, after: { holdDependencyId: hold.holdDependencyId, rewardId: reference.id, positiveCreditEntryId: reward.rewardCreditEntryId ?? "" },
              reason: "already_released_reward_requires_existing_defensive_compatibility", sourceEvent: terminal.eventId }, now);
            remember(state, key, hold.holdDependencyId, now);
          }
          issues.push({ holdDependencyId: hold.holdDependencyId, reward: reference, reason: "already_released_reward_requires_defensive_review", compatibility: "released_reward_defensive_review" }); continue;
        }
        try {
          if (terminal.type === "RETURN_APPROVED" && consumptionReviews.some(item => hold.evidence.consumptionEventIds.includes(item.consumptionEventId)
            || state.validConsumptionEvents[item.consumptionEventId]?.sourceOrderId === hold.returnOrderId)) throw new MembershipCommerceError("related_consumption_evidence_requires_review");
          const previous = projectPendingReturnRewardEntitlement(state, reference);
          const beneficiaryMemberId = referral?.beneficiaryMemberId ?? retail?.beneficiaryMemberId ?? state.referrals[conversion!.relationshipId]?.referrerMemberId;
          if (!beneficiaryMemberId || (conversion && !hold.evidence.sourceOrder)) throw new MembershipCommerceError("missing_original_reward_beneficiary_or_order_evidence");
          if (conversion && !conversion.originalCalculation) {
            const originalVersion = rulesStore.versions.filter(item => Date.parse(item.effectiveAt) <= Date.parse(conversion.occurredAt)).at(-1);
            if (!originalVersion || originalVersion.rules.referral.referrerEligibility.mode !== "none" || !originalVersion.rules.referral.reward.repeatedRewards)
              throw new MembershipCommerceError("legacy_conversion_qualification_evidence_requires_review");
          }
          const policy = originalEconomicFingerprint(pendingRewardOriginalPolicy(state, reference));
          if (previous.resolutions.some(item => item.originalPolicyFingerprint !== policy)) throw new MembershipCommerceError("original_reward_policy_changed");
          let proof: RewardDependencyEvidenceResult | null = null;
          if (reference.program !== "referral_conversion") {
            proof = await resolveRewardDependencyEvidence({ state, program: reference.program, rewardId: reference.id, readSourceOrder: readOriginal });
            if (proof.status !== "resolved") throw new MembershipCommerceError(proof.reason);
          }
          if (referral && referralRewardQualificationAuthority(referral) === "legacy_order"
            && !(proof?.status === "resolved" && proof.qualificationOrders.length)) {
            const originalVersion = rulesStore.versions.find(item => item.rulesVersion === referral.ruleVersion);
            if (originalVersion?.rules.referral.referrerEligibility.mode !== "none") throw new MembershipCommerceError("missing_original_legacy_qualification_evidence");
          }
          const result = terminal.type === "RETURN_APPROVED" ? "approved" : terminal.type === "RETURN_REJECTED" ? "rejected" : "withdrawn";
          const computed = result === "approved" ? await calculatePendingReturnReward({ state, reference, terminal, versions: rulesStore.versions, readOriginal })
            : { entitlement: previous.remainingEffectivePendingRewardAmount, calculation: { method: "original-entitlement-restored-without-requalification",
              ...(conversion ? { originalEligibility: conversion.originalCalculation?.referrerEligibleAtCreation ?? true } : {}) }, d0Evidence: [], d1ReductionIds: [] };
          if (referral && referralRewardQualificationAuthority(referral) === "legacy_order") (computed.calculation as Record<string, unknown>).originalEligibility = true;
          const amount = Math.min(previous.remainingEffectivePendingRewardAmount, computed.entitlement);
          const deadlines: string[] = [];
          for (const orderId of [...new Set([hold.rewardSourceOrderId, hold.returnOrderId, ...(proof?.status === "resolved" ? proof.qualificationOrders.map(item => item.orderId) : [])])]) {
            const order = await readOriginal(orderId), completion = order?.completion as { returnDeadline?: string } | undefined;
            if (completion?.returnDeadline && Number.isFinite(Date.parse(completion.returnDeadline))) deadlines.push(completion.returnDeadline);
          }
          const resolutionId = deterministicId("return_reward_resolution", JSON.stringify([hold.holdDependencyId, terminal.eventId]));
          const payload: Omit<PendingReturnRewardResolution, "evidenceFingerprint"> = {
            schemaVersion: 1, resolutionId, idempotencyKey: `return-domain:pending-resolution:${resolutionId}`, holdDependencyId: hold.holdDependencyId,
            reward: { ...reference }, rewardSourceOrderId: hold.rewardSourceOrderId,
            beneficiaryMemberId,
            returnRequestId: hold.returnRequestId, terminalReturnEventId: terminal.eventId, returnOrderId: hold.returnOrderId, result,
            occurredAt: terminal.occurredAt, recordedAt: new Date(Math.max(now.getTime(), Date.parse(terminal.occurredAt))).toISOString(),
            originalPendingRewardAmount: previous.originalPendingRewardAmount, previousEffectivePendingAmount: previous.remainingEffectivePendingRewardAmount,
            remainingEffectivePendingRewardAmount: amount, incrementalAdjustment: amount - previous.remainingEffectivePendingRewardAmount,
            cumulativeAdjustment: amount - previous.originalPendingRewardAmount,
            reasonCode: result === "withdrawn" ? "reward_restored_after_return_withdrawn" : result === "rejected" ? "reward_restored_after_return_rejected"
              : amount === 0 ? "pending_reward_cancelled_due_to_return" : amount === previous.remainingEffectivePendingRewardAmount
                ? "pending_reward_unchanged_after_approved_return" : "pending_reward_adjusted_due_to_partial_return",
            originalPolicyFingerprint: policy, releaseSafetyDeadline: deadlines.sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? null,
            originalQualification: { sourceOrder: proof?.status === "resolved" ? proof.sourceOrder : hold.evidence.sourceOrder,
              qualificationOrders: proof?.status === "resolved" ? proof.qualificationOrders : hold.evidence.qualificationOrders,
              qualificationRoundId: proof?.status === "resolved" ? proof.qualificationRound?.roundId ?? null : hold.evidence.roundId,
              coverageId: proof?.status === "resolved" ? proof.coverage?.coverageId ?? null : hold.evidence.coverageId,
              maturationId: proof?.status === "resolved" ? proof.maturation?.maturationId ?? null : hold.evidence.maturationId },
            calculation: computed.calculation, d0Evidence: computed.d0Evidence, d1ReductionIds: computed.d1ReductionIds,
          };
          const record = { ...payload, evidenceFingerprint: originalEconomicFingerprint(payload) };
          audit(state, { actor: "system", action: `${RETURN_PENDING_RESOLUTION_PREFIX}${result.toUpperCase()}`, entityType: "return_request",
            entityId: hold.returnRequestId, before: {}, after: { resolutionId, evidence: JSON.stringify(record) }, reason: payload.reasonCode, sourceEvent: terminal.eventId }, new Date(payload.recordedAt));
          remember(state, payload.idempotencyKey, resolutionId, new Date(payload.recordedAt)); resolvedIds.add(hold.holdDependencyId); resolvedCount++;
        } catch (error) { issues.push({ holdDependencyId: hold.holdDependencyId, reward: reference, reason: error instanceof Error ? error.message : "pending_reward_evidence_requires_review" }); }
      }
    }
    return { status: issues.some(item => !item.compatibility) ? "manual_review_required" as const : "resolved" as const,
      resolvedCount, issues, consumptionReviews, resolutions: readPendingReturnRewardResolutions(state) };
  }, { now: input.now, filePath: input.stateFilePath });
}

export class ReturnRewardHeldError extends Error {
  readonly hold: ReturnRewardHoldProjection;
  constructor(hold: ReturnRewardHoldProjection) {
    super("Reward deferred by unresolved return dependencies"); this.name = "ReturnRewardHeldError"; this.hold = hold;
  }
}

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
  return { schemaVersion: 1, revision: 0, createdAt: timestamp, updatedAt: timestamp, subscriptions: {}, cycles: {}, referrals: {}, referralConversions: {}, referralRewards: {}, retailPromotionRewards: {}, validConsumptionEvents: {}, qualificationRounds: {}, referralRewardCoverages: {}, referralRewardMaturations: {}, creditEntries: {}, creditReservations: {}, events: [], returnEvents: [], notifications: [], audit: [], idempotency: {} };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateMembershipCommerceState(value: unknown): MembershipCommerceState {
  if (!isObject(value) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") throw new MembershipCommerceError("會員商務資料格式不正確");
  if (value.returnEvents === undefined) value.returnEvents = [];
  validateReturnEventLog(value.returnEvents);
  projectReturnSettlements(value as MembershipCommerceState);
  if (!isObject(value.referralRewards)) value.referralRewards = {};
  if (!isObject(value.retailPromotionRewards)) value.retailPromotionRewards = {};
  if (!isObject(value.validConsumptionEvents)) value.validConsumptionEvents = {};
  if (!isObject(value.qualificationRounds)) value.qualificationRounds = {};
  if (!isObject(value.referralRewardCoverages)) value.referralRewardCoverages = {};
  if (!isObject(value.referralRewardMaturations)) value.referralRewardMaturations = {};
  for (const field of ["subscriptions", "cycles", "referrals", "referralConversions", "referralRewards", "retailPromotionRewards", "validConsumptionEvents", "qualificationRounds", "referralRewardCoverages", "referralRewardMaturations", "creditEntries", "creditReservations", "idempotency"] as const) if (!isObject(value[field])) throw new MembershipCommerceError("會員商務資料集合不完整");
  for (const field of ["events", "notifications", "audit"] as const) if (!Array.isArray(value[field])) throw new MembershipCommerceError("會員商務事件集合不完整");
  readReturnRewardHoldDependencies(value as MembershipCommerceState);
  readReturnConsumptionReductions(value as MembershipCommerceState);
  readPendingReturnRewardResolutions(value as MembershipCommerceState);
  for (const conversion of Object.values(value.referralConversions as Record<string, ReferralConversion>)) {
    const original = conversion.originalCalculation;
    if (original !== undefined && (!isObject(original) || !Number.isSafeInteger(original.rulesVersion) || original.rulesVersion < 1
      || ![original.merchandiseAmount, original.eligibleItemCount, original.calculatedRewardAmount].every(reductionMoney)
      || typeof original.referrerEligibleAtCreation !== "boolean" || typeof original.repeatedAllowedAtCreation !== "boolean")) throw new MembershipCommerceError("推薦轉換原始計算快照不正確");
  }
  for (const reward of Object.values(value.referralRewards as Record<string, ReferralReward>)) {
    if (
      reward.qualificationAuthority !== undefined
      && reward.qualificationAuthority !== "legacy_order"
      && reward.qualificationAuthority !== "qualification_coverage"
      && reward.qualificationAuthority !== "self_purchase_direct"
    ) throw new MembershipCommerceError("推薦獎勵資格權限格式不正確");
    if (
      reward.qualificationAuthority === "self_purchase_direct"
      && (
        reward.rewardType !== "self_purchase"
        || reward.qualificationStatus !== "qualified"
      )
    ) throw new MembershipCommerceError("本人消費回饋直接發放資格格式不正確");
    if (reward.selfPurchaseTierSnapshot !== undefined) {
      const snapshot = reward.selfPurchaseTierSnapshot;
      if (
        reward.rewardType !== "self_purchase"
        || !isObject(snapshot)
        || snapshot.featureEnabled !== true
        || !isObject(snapshot.rules)
        || !isObject(snapshot.payout)
        || !Array.isArray(snapshot.initialEvidence)
        || !Array.isArray(snapshot.latestEvidence)
        || !isObject(snapshot.initialResult)
        || !isObject(snapshot.latestResult)
        || !Number.isFinite(Date.parse(snapshot.windowStartedAt))
        || !Number.isFinite(Date.parse(snapshot.windowEndedAt))
      ) throw new MembershipCommerceError("本人消費動態級距快照格式不正確");
    }
  }
  for (const reward of Object.values(value.retailPromotionRewards as Record<string, RetailPromotionReward>)) {
    if (!reward || typeof reward.rewardId !== "string" || typeof reward.sourceOrderNumber !== "string" || typeof reward.beneficiaryMemberId !== "string" || typeof reward.referralCode !== "string" || reward.attributionSource !== "member-share-link" || !Number.isFinite(Date.parse(reward.attributedAt)) || !Number.isFinite(Date.parse(reward.attributionExpiresAt)) || !Number.isSafeInteger(reward.ruleVersion) || !Number.isFinite(Date.parse(reward.successfulCompletionAt)) || !Number.isFinite(Date.parse(reward.releaseEligibleBusinessDate))) throw new MembershipCommerceError("推廣零售獎金格式不正確");
    assertIntegerMoney(reward.eligibleMerchandiseAmount, "推廣零售有效業績");
    assertIntegerMoney(reward.calculatedCreditAmount, "推廣零售獎金");
    if (reward.calculationBasis !== undefined) {
      if (!["paid_amount", "pv"].includes(reward.calculationBasis) || typeof reward.calculationBaseValue !== "number" || !Number.isFinite(reward.calculationBaseValue) || reward.calculationBaseValue < 0) throw new MembershipCommerceError("推廣零售計算基礎快照不正確");
      if (typeof reward.rewardPV !== "number" || !Number.isFinite(reward.rewardPV) || reward.rewardPV < 0 || typeof reward.pvRewardMoneyValue !== "number" || !Number.isFinite(reward.pvRewardMoneyValue) || reward.pvRewardMoneyValue < 0) throw new MembershipCommerceError("推廣零售 PV 換算快照不正確");
    }
    if (typeof reward.rewardRate !== "number" || !Number.isFinite(reward.rewardRate) || reward.rewardRate < 0 || reward.rewardRate > 100) throw new MembershipCommerceError("推廣零售獎金比例不正確");
    if (!["scheduled", "released", "cancelled", "reversed"].includes(reward.status)) throw new MembershipCommerceError("推廣零售獎金狀態不正確");
  }
  for (const consumption of Object.values(value.validConsumptionEvents as Record<string, ValidConsumptionEvent>)) {
    if (!consumption || typeof consumption.eventId !== "string" || typeof consumption.memberId !== "string" || typeof consumption.sourceOrderId !== "string" || typeof consumption.finalizedAt !== "string" || !Number.isFinite(Date.parse(consumption.finalizedAt)) || typeof consumption.createdAt !== "string" || !Number.isSafeInteger(consumption.rulesVersion)) throw new MembershipCommerceError("有效消費事件格式不正確");
    for (const amount of [consumption.merchandiseSubtotal, consumption.appliedCreditAmount, consumption.shippingAmount, consumption.validConsumptionAmount]) assertIntegerMoney(amount, "有效消費事件金額");
    if (
      consumption.validConsumptionPV !== undefined
      && (
        typeof consumption.validConsumptionPV !== "number"
        || !Number.isFinite(consumption.validConsumptionPV)
        || consumption.validConsumptionPV < 0
        || consumption.validConsumptionPV > 100_000_000
      )
    ) throw new MembershipCommerceError("有效消費事件 KD點格式不正確");
    if (
      consumption.reversedAt !== undefined
      && consumption.reversedAt !== null
      && !Number.isFinite(Date.parse(consumption.reversedAt))
    ) throw new MembershipCommerceError("有效消費事件失效時間格式不正確");
    if (
      consumption.reversalOutcome !== undefined
      && !["cancelled", "uncollected", "refunded", "returned"].includes(consumption.reversalOutcome)
    ) throw new MembershipCommerceError("有效消費事件失效結果格式不正確");
    if (typeof consumption.includeCreditDiscount !== "boolean" || typeof consumption.includeShipping !== "boolean" || typeof consumption.activeSubscriptionAtCompletion !== "boolean" || !isObject(consumption.qualificationRulesSnapshot)) throw new MembershipCommerceError("有效消費事件快照不完整");
  }
  for (const round of Object.values(value.qualificationRounds as Record<string, QualificationRound>)) {
    if (!round || typeof round.roundId !== "string" || typeof round.memberId !== "string" || typeof round.triggeringValidConsumptionEventId !== "string" || round.finalQualified !== true || !Number.isSafeInteger(round.rulesVersion) || !isObject(round.generalPath) || !isObject(round.subscriptionPath) || !isObject(round.consumptionAccounting)) throw new MembershipCommerceError("推薦資格輪次格式不正確");
    if (round.rewardSafetyRuleSnapshot && (!Number.isSafeInteger(round.rewardSafetyRuleSnapshot.baseWaitingDays) || round.rewardSafetyRuleSnapshot.baseWaitingDays < 0 || !Number.isSafeInteger(round.rewardSafetyRuleSnapshot.returnProtectionDays) || round.rewardSafetyRuleSnapshot.returnProtectionDays < 0)) throw new MembershipCommerceError("推薦資格輪次安全等待快照不正確");
    if (!Array.isArray(round.consumptionAccounting.allocations) || !Number.isSafeInteger(round.consumptionAccounting.availableAmountBefore) || !Number.isSafeInteger(round.consumptionAccounting.consumedAmount) || !Number.isSafeInteger(round.consumptionAccounting.remainingAmountAfter)) throw new MembershipCommerceError("推薦資格輪次消費配置不正確");
    for (const allocation of round.consumptionAccounting.allocations) if (!allocation || typeof allocation.validConsumptionEventId !== "string" || !Number.isSafeInteger(allocation.amount) || allocation.amount < 0) throw new MembershipCommerceError("推薦資格輪次配置項目不正確");
  }
  for (const subscription of Object.values(value.subscriptions as Record<string, Subscription>)) validateSubscriptionCreditPreference(subscription.creditPreference);
  for (const cycle of Object.values(value.cycles as Record<string, SubscriptionCycle>)) validateSubscriptionCreditPreference(cycle.creditPreferenceSnapshot);
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
    const isNegativeLedgerEntry = entry.sourceReference.startsWith("referral_reward_reversal:") || entry.sourceReference.startsWith("retail_promotion_reward_reversal:") || entry.sourceReference.startsWith("admin_credit_adjustment:deduct:");
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
    const originalReturnEvents = structuredClone(state.returnEvents ?? []);
    const originalSettlements = structuredClone(state.returnSettlementEvents ?? []);
    const originalHolds = structuredClone(returnHoldAudit(state));
    const originalReductions = structuredClone(consumptionReductionAudit(state));
    const originalResolutions = structuredClone(pendingResolutionAudit(state));
    const result = await operation(state, now);
    await appendReturnRewardHolds(state, now);
    assertReturnEventsPreserved(originalReturnEvents, state.returnEvents ?? []);
    assertSettlementPrefix(originalSettlements, state.returnSettlementEvents ?? []);
    if (!isDeepStrictEqual(originalHolds, returnHoldAudit(state).slice(0, originalHolds.length))) throw new MembershipCommerceError("退貨 HOLD 歷史不可刪改");
    if (!isDeepStrictEqual(originalReductions, consumptionReductionAudit(state).slice(0, originalReductions.length))) throw new MembershipCommerceError("退貨消費減少歷史不可刪改");
    if (!isDeepStrictEqual(originalResolutions, pendingResolutionAudit(state).slice(0, originalResolutions.length))) throw new MembershipCommerceError("退貨獎勵結案歷史不可刪改");
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

/** Internal-only return command boundary. A future API must derive the actor/capability
 * from its authenticated session and supply ownership authorization, never trust body roles.
 * Order gate -> order file lock -> existing commerce state lock. No order persist is called.
 * Not exposed by any route until the separate reward-HOLD phase supplies its release gate. */
export async function executeOrderReturnCommand(input: {
  orderNumber: string; actor: ReturnActor; command: ReturnCommand; reason: string; idempotencyKey: string;
  authorizeOrder: (order: Readonly<Record<string, unknown>>, actor: ReturnActor) => void | Promise<void>;
  now?: Date; stateFilePath?: string;
  /** E-only server confirmation. Omitted by the accepted internal B/C/D commands. */
  confirmation?: { token: string; memberId: string; quantityAcknowledged: true; supportingPhotos?: import("./customerNotifications").CustomerNotificationPhoto[]; prepareSupportingPhotos?: (previous?: readonly import("./customerNotifications").CustomerNotificationPhoto[]) => Promise<import("./customerNotifications").CustomerNotificationPhoto[]>; refundRequest?: import("./returnRefundSettings").ReturnRefundRequest };
}): Promise<ReturnCommandResult> {
  const command = normalizeReturnCommand(input.command, input.actor, input.reason);
  if (!command || !/^KD[0-9-]+$/u.test(input.orderNumber) || !returnEvidenceText(input.idempotencyKey, 120)) {
    return { status: "conflict", reason: "invalid_input" };
  }
  if (input.now && !Number.isFinite(input.now.getTime())) return { status: "conflict", reason: "invalid_clock" };
  if (typeof input.authorizeOrder !== "function") return { status: "conflict", reason: "not_authorized" };
  const key = "return-domain:" + JSON.stringify([input.orderNumber, command.actor.actorId, input.idempotencyKey]);
  const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  return withStoredOrderUpdateLock(input.orderNumber, async order => {
    try { await input.authorizeOrder(structuredClone(order), structuredClone(command.actor)); }
    catch { return { status: "conflict", reason: "not_authorized" }; }
    return transaction<ReturnCommandResult>(async (state) => {
      const events = state.returnEvents ?? [];
      const prior = events.find(item => item.idempotencyKey === key);
      const rememberedId = remembered(state, key);
      if (rememberedId && rememberedId !== prior?.eventId) throw new MembershipCommerceError("退貨操作識別與事件不一致");
      if (prior && prior.commandFingerprint !== fingerprint) return { status: "conflict", reason: "idempotency_conflict" };
      const projection = projectOrderReturns(order, events);
      if (projection.status !== "resolved") return projection;
      if (prior) {
        if (input.confirmation && (prior.type !== "RETURN_REQUESTED" || prior.confirmation?.tokenDigest !== originalEconomicFingerprint(input.confirmation.token))) throw new ReturnWorkflowError("idempotency_conflict");
        if (input.confirmation && prior.type === "RETURN_REQUESTED" && !isDeepStrictEqual(prior.confirmation?.refundRequest, input.confirmation.refundRequest)) throw new ReturnWorkflowError("idempotency_conflict");
        if (input.confirmation && prior.type === "RETURN_REQUESTED") {
          const photos = input.confirmation.prepareSupportingPhotos ? await input.confirmation.prepareSupportingPhotos(prior.confirmation?.supportingPhotos ?? []) : input.confirmation.supportingPhotos ?? [];
          if (!isDeepStrictEqual(prior.confirmation?.supportingPhotos ?? [], photos)) throw new ReturnWorkflowError("idempotency_conflict");
        }
        return { status: "applied", replayed: true, event: structuredClone(prior), projection };
      }
      const proof = preservedReturnCompletion(order);
      if (proof.status !== "resolved") return proof;
      // Evaluate acceptance at the locked boundary, not before waiting for the lock.
      const now = input.now ?? new Date();
      if (!Number.isFinite(now.getTime())) return { status: "conflict", reason: "invalid_clock" };
      const timestamp = nowIso(now);
      const conflict = returnCommandConflict(command, projection, timestamp, proof.completion.completedAt);
      if (conflict === "return_deadline_expired") return { status: "not_eligible", reason: conflict };
      if (conflict) return { status: "conflict", reason: conflict };
      const confirmationInput = input.confirmation;
      const confirmation = confirmationInput ? await (async () => {
        const saved = verifyReturnPreviewToken(confirmationInput.token, now);
        const current = buildReturnConfirmationPreview({ order, state, command, memberId: confirmationInput.memberId,
          now, generatedAt: saved.generatedAt, warningDays: saved.expiryWarning?.days ?? 7, rewardHoldExpected: returnHoldCandidates(state, order.orderNumber).length > 0 });
        if (saved.actorId !== command.actor.actorId || saved.sourceOrderId !== order.orderNumber
          || saved.confirmationFingerprint !== current.confirmationFingerprint) throw new ReturnWorkflowError("stale_confirmation");
        // Auth, ownership, eligibility and token are verified under these same locks.
        const supportingPhotos = confirmationInput.prepareSupportingPhotos ? await confirmationInput.prepareSupportingPhotos() : confirmationInput.supportingPhotos;
        return { ...(confirmationInput.refundRequest ? {refundRequest:structuredClone(confirmationInput.refundRequest)} : {}), preview: current, tokenDigest: originalEconomicFingerprint(confirmationInput.token), confirmedAt: timestamp, quantityAcknowledged: true as const,
          ...(supportingPhotos?.length ? { supportingPhotos: structuredClone(supportingPhotos) } : {}) };
      })() : undefined;
      const returnRequestId = command.type === "RETURN_REQUESTED"
        ? deterministicId("return_request", key) : command.returnRequestId;
      const eventId = deterministicId("return_event", key);
      const base = { schemaVersion: 1 as const, eventId, returnRequestId, orderId: order.orderNumber,
        actor: command.actor, source: "return_service" as const, occurredAt: timestamp, recordedAt: timestamp,
        idempotencyKey: key, commandFingerprint: fingerprint, reason: command.reason,
        previousEventId: projection.requests.find(item => item.returnRequestId === returnRequestId)?.lastEventId ?? null };
      const appended: ReturnDomainEvent = command.type === "RETURN_REQUESTED"
        ? { ...base, type: command.type, completion: proof.completion, conditionAcknowledgement: command.conditionAcknowledgement,
            ...(confirmation ? { confirmation } : {}),
            lines: command.lines.map(line => ({ ...line, originalQuantity: projection.lines.find(item => item.returnLineRef === line.returnLineRef)!.originalQuantity })) }
        : { ...base, type: command.type, ...(command.type === "RETURN_APPROVED" && command.approvedLines ? { approvedLines: command.approvedLines } : {}) };
      state.returnEvents = [...events, appended];
      if (appended.type === "RETURN_APPROVED") planApprovedReturnSettlement(state, appended);
      const next = projectOrderReturns(order, state.returnEvents);
      if (next.status !== "resolved") throw new MembershipCommerceError("退貨證據投影不一致");
      remember(state, key, eventId, now);
      audit(state, { actor: command.actor.authority === "customer" ? "member" : "admin", action: command.type,
        entityType: "return_request", entityId: returnRequestId, before: {}, after: { eventId, orderId: order.orderNumber },
        reason: command.reason, sourceEvent: eventId }, now);
      return { status: "applied", replayed: false, event: structuredClone(appended), projection: next };
    }, { filePath: input.stateFilePath, now: input.now });
  });
}

/** Read-only preview under the same order -> commerce lock order as creation. */
export async function previewOrderReturn(input: {
  orderNumber: string; memberId: string; command: ReturnCommand; reason: string;
  authorizeOrder: (order: Readonly<Record<string, unknown>>, actor: ReturnActor) => void | Promise<void>;
  now?: Date; stateFilePath?: string; rulesFilePath?: string;
}) {
  const actor: ReturnActor = { actorId: input.memberId, authority: "customer" };
  const command = normalizeReturnCommand(input.command, actor, input.reason);
  if (!command || command.type !== "RETURN_REQUESTED" || input.reason.length > 200) throw new ReturnWorkflowError("invalid_input", 400);
  return withStoredOrderUpdateLock(input.orderNumber, async order => {
    await input.authorizeOrder(structuredClone(order), actor);
    const filePath = input.stateFilePath ?? getMembershipCommerceStateFile();
    return withFileLock(filePath, async () => {
      const state = await readMembershipCommerceState(filePath);
      const version = await getActiveMembershipRules(input.now ?? new Date(), input.rulesFilePath);
      const preview = buildReturnConfirmationPreview({ order, state, command, memberId: input.memberId, warningDays: version.rules.credit.returnCreditExpiryWarningDays ?? 7,
        now: input.now ?? new Date(), rewardHoldExpected: returnHoldCandidates(state, order.orderNumber).length > 0 });
      return { preview, confirmationToken: signReturnPreview(preview) };
    });
  });
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

function createSubscriptionCycleRecord(input: {
  state: MembershipCommerceState;
  subscription: Subscription;
  sequence: number;
  plannedDate: string;
  kind: CycleKind;
  version: RulesVersion;
  now: Date;
  reason: string;
  sourceEvent: string;
  dedicatedRoastReferenceDate?: string;
}) {
  const duplicate = Object.values(input.state.cycles).find((cycle) =>
    cycle.subscriptionId === input.subscription.subscriptionId &&
    cycle.sequence === input.sequence &&
    cycle.kind === input.kind
  );
  if (duplicate) return { cycle: duplicate, created: false as const };

  const dates = cycleDates(
    input.plannedDate,
    input.version.rules.subscription.modificationCutoffDays,
    input.version.rules.subscription.orderCreationLeadDays,
  );
  const cycleId = id("cycle");
  const timestamp = nowIso(input.now);
  const hasDedicatedRoast = subscriptionHasDedicatedRoast(input.subscription.defaultItems);
  const dedicatedRoastRush = input.dedicatedRoastReferenceDate && dedicatedRoastRushRequired({
    hasDedicatedRoast,
    plannedDate: input.plannedDate,
    today: input.dedicatedRoastReferenceDate,
  })
    ? {
        warningAcknowledged: false,
        plannedDate: input.plannedDate,
        standardPreparationDays: DEDICATED_ROAST_STANDARD_PREPARATION_DAYS,
      }
    : null;
  const cycle: SubscriptionCycle = {
    cycleId,
    subscriptionId: input.subscription.subscriptionId,
    sequence: input.sequence,
    kind: input.kind,
    ...dates,
    status: "modifiable",
    itemsDraft: cloneItems(input.subscription.defaultItems),
    itemsSnapshot: null,
    pricingSnapshot: null,
    giftSnapshot: null,
    shippingSnapshot: null,
    rulesSnapshot: null,
    createdOrderId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 0,
    modificationCount: 0,
    dedicatedRoastRush,
  };
  input.state.cycles[cycleId] = cycle;
  audit(input.state, {
    actor: "system",
    action: "cycle-generated",
    entityType: "cycle",
    entityId: cycleId,
    before: {},
    after: { status: cycle.status, sequence: cycle.sequence },
    reason: input.reason,
    sourceEvent: input.sourceEvent,
  }, input.now);
  return { cycle, created: true as const };
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

function subscriptionDeliveryPreference(input: { shippingMethod: string; storeSelection?: Subscription["storeSelection"]; deliveryAddress?: DeliveryAddress | null; paymentMethod?: HomeDeliveryPaymentMethod | null }, requireStore = false) {
  if (input.shippingMethod === "studio_pickup") return { storeSelection: null, deliveryAddress: null, paymentMethod: null };
  if (input.shippingMethod === "711_cod") {
    if (requireStore && (!input.storeSelection?.storeId?.trim() || !input.storeSelection.storeName?.trim())) throw new MembershipCommerceError("請先選擇有效的 7-ELEVEN 取貨門市");
    return { storeSelection: input.storeSelection ? structuredClone(input.storeSelection) : null, deliveryAddress: null, paymentMethod: null };
  }
  if (input.shippingMethod === "home_delivery") {
    return { storeSelection: null, deliveryAddress: validateDeliveryAddress(input.deliveryAddress), paymentMethod: "cash_on_delivery" as const };
  }
  throw new MembershipCommerceError("不支援的取貨方式");
}

export async function createSubscription(input: { memberId: string; startedFromOrderId: string; anchorDate: string; intervalDays: number; shippingMethod: string; storeSelection?: Subscription["storeSelection"]; deliveryAddress?: DeliveryAddress | null; paymentMethod?: HomeDeliveryPaymentMethod | null; creditPreference?: SubscriptionCreditPreference; defaultItems: SubscriptionDefaultItem[]; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  await assertCanonicalMember(input.memberId);
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  if (!resolveSubscriptionInterval(input.intervalDays, version.rules).allowed) throw new MembershipCommerceError("此配送週期目前未開放");
  const items = cloneItems(input.defaultItems);
  const delivery = subscriptionDeliveryPreference(input);
  const creditPreference = validateSubscriptionCreditPreference(input.creditPreference);
  const key = `subscription:create:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const existingId = remembered(state, key);
    if (existingId) return state.subscriptions[existingId];
    if (Object.values(state.subscriptions).some((subscription) => subscription.startedFromOrderId === input.startedFromOrderId)) throw new MembershipCommerceError("此首筆訂單已建立定期購");
    const subscriptionId = id("sub");
    const timestamp = nowIso(now);
    const subscription: Subscription = { creditPreference, subscriptionId, memberId: input.memberId, status: "pending_activation", startedFromOrderId: input.startedFromOrderId, anchorDate: input.anchorDate, intervalDays: input.intervalDays, shippingMethod: input.shippingMethod, ...delivery, defaultItems: items, rulesVersion: version.rulesVersion, statusReason: "等待首筆原價訂單成功取貨", createdAt: timestamp, updatedAt: timestamp, revision: 0 };
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

async function activateSubscriptionFromCompletedFirstOrder(input: {
  subscriptionId: string;
  orderId: string;
  idempotencyKey: string;
  now?: Date;
  stateFilePath?: string;
  rulesFilePath?: string;
}) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `subscription:activate-first-cycle:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const subscription = state.subscriptions[input.subscriptionId];
    if (!subscription) throw new MembershipCommerceError("找不到定期購");
    if (subscription.startedFromOrderId !== input.orderId) throw new MembershipCommerceError("首筆訂單與定期購不一致");

    const existingScheduledCycle = Object.values(state.cycles)
      .filter((cycle) => cycle.subscriptionId === subscription.subscriptionId && cycle.kind === "scheduled")
      .sort((a, b) => a.sequence - b.sequence)[0];
    const rememberedCycleId = remembered(state, key);
    if (rememberedCycleId) {
      return {
        subscription,
        cycle: state.cycles[rememberedCycleId] ?? existingScheduledCycle ?? null,
      };
    }

    if (subscription.status !== "pending_activation" && subscription.status !== "active") {
      throw new MembershipCommerceError("只有等待首筆取貨的定期購可以啟動");
    }

    const completionDate = getDateOnlyInTimeZone(now);
    if (subscription.status === "pending_activation") {
      const previousAnchorDate = subscription.anchorDate;
      subscription.status = "active";
      subscription.statusReason = "首筆原價訂單成功取貨";
      subscription.anchorDate = completionDate;
      touch(subscription, now);
      const fulfillment = event(state, "qualifying_fulfillment", { fulfillmentNumber: 1, originalPriceOrder: true }, now, { memberId: subscription.memberId, subscriptionId: subscription.subscriptionId, orderId: input.orderId });
      audit(state, {
        actor: "system",
        action: "subscription-activated",
        entityType: "subscription",
        entityId: subscription.subscriptionId,
        before: { status: "pending_activation", anchorDate: previousAnchorDate },
        after: { status: "active", anchorDate: completionDate, giftProgress: 1 },
        reason: "首筆原價訂單成功取貨",
        sourceEvent: fulfillment.eventId,
      }, now);
      if (giftEligibleAt(1, version.rules)) notify(state, version.rules, "gift_eligible", fulfillment.eventId, now, { memberId: subscription.memberId, safeData: { fulfillmentNumber: 1 } });
    }

    let firstCycle = existingScheduledCycle;
    if (!firstCycle) {
      firstCycle = createSubscriptionCycleRecord({
        state,
        subscription,
        sequence: 1,
        plannedDate: nextScheduledDate(completionDate, subscription.intervalDays, 1),
        kind: "scheduled",
        version,
        now,
        reason: "首筆原價訂單完成後建立首期定期配送",
        sourceEvent: input.orderId,
        dedicatedRoastReferenceDate: completionDate,
      }).cycle;
    }

    remember(state, key, firstCycle.cycleId, now);
    return { subscription, cycle: firstCycle };
  }, { now: input.now, filePath: input.stateFilePath });
}

/** One membership entry point for canonical order outcomes. */
export async function handleCanonicalOrderOutcome(input: { orderId: string; outcome: "completed" | "uncollected"; memberId?: string; retailPromotionAttribution?: RetailPromotionOrderSnapshot | null; merchandiseAmount: number; basePV?: number; effectivePV?: number; discountRatio?: number; eligibleItemCount?: number; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const basis = await persistedOrderRewardBasis(input.orderId);
  const rewardsAllowed = currentRewardsAllowed(basis);
  const coffeeSubscriptionAllowed = rewardsAllowed && !basis?.hasStore;
  if (basis?.hasStore && rewardsAllowed) input = { ...input,
    merchandiseAmount: basis.rewardMerchandiseAmount!, basePV: basis.totalBasePV,
    effectivePV: basis.totalEffectivePV, eligibleItemCount: basis.coffeeEligibleQuantity,
    discountRatio: basis.totalBasePV > 0 ? Math.min(1, basis.totalEffectivePV / basis.totalBasePV) : 1 };
  const snapshot = await readMembershipCommerceState(input.stateFilePath);
  const subscription = Object.values(snapshot.subscriptions).find((item) => item.startedFromOrderId === input.orderId);
  const cycle = Object.values(snapshot.cycles).find((item) => item.createdOrderId === input.orderId);
  const relationship = input.memberId
    ? Object.values(snapshot.referrals).find((item) => item.referredMemberId === input.memberId && item.status !== "inactive")
    : undefined;

  if (input.outcome === "completed") {
    if (coffeeSubscriptionAllowed && subscription?.status === "pending_activation") {
      await activateSubscriptionFromCompletedFirstOrder({ subscriptionId: subscription.subscriptionId, orderId: input.orderId, idempotencyKey: `${input.idempotencyKey}:activate`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
    }
    if (coffeeSubscriptionAllowed && cycle) {
      await recordCycleFulfillment({ cycleId: cycle.cycleId, orderId: input.orderId, idempotencyKey: `${input.idempotencyKey}:cycle`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
    }
    if (rewardsAllowed && input.memberId) {
      await recordValidConsumptionFromCompletedOrder({ memberId: input.memberId, orderId: input.orderId, idempotencyKey: `${input.idempotencyKey}:valid-consumption`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
    }
  } else if (subscription || cycle) {
    const linkedSubscription = subscription ?? snapshot.subscriptions[cycle!.subscriptionId];
    await markUncollected({ subscriptionId: linkedSubscription.subscriptionId, cycleId: cycle?.cycleId, orderId: input.orderId, idempotencyKey: `${input.idempotencyKey}:uncollected`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
  }

  if (input.memberId && (input.outcome !== "completed" || rewardsAllowed)) {
    await handleReferralQualificationOrderOutcome({ memberId: input.memberId, orderId: input.orderId, outcome: input.outcome, idempotencyKey: `${input.idempotencyKey}:referral-qualification`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
  }

  if (rewardsAllowed && input.memberId && input.outcome === "completed") {
    const activeRules =
      await getActiveMembershipRules(
        input.now,
        input.rulesFilePath,
      );

    const hadPriorValidConsumption =
      Object.values(
        snapshot.validConsumptionEvents,
      ).some(
        (item) =>
          item.memberId === input.memberId &&
          item.sourceOrderId !== input.orderId,
      );

    const selfPurchaseEligible =
      activeRules.rules.referral
        .selfPurchaseEligibilityMode ===
        "first_completed_order" ||
      hadPriorValidConsumption;

    if (selfPurchaseEligible) {
      await createSelfPurchaseRewardFromFulfillment({
        sourceMemberId: input.memberId,
        orderId: input.orderId,
        paidAmountBasis: input.merchandiseAmount,
        basePV: input.basePV,
        effectivePV: input.effectivePV,
        discountRatio: input.discountRatio,
        idempotencyKey:
          `${input.idempotencyKey}:self-repeat-v1`,
        now: input.now,
        stateFilePath: input.stateFilePath,
        rulesFilePath: input.rulesFilePath,
      });
    }
  }

  if (relationship && input.memberId) {
    if (input.outcome === "completed" && rewardsAllowed && (!cycle || coffeeSubscriptionAllowed)) {
      const alreadyHadFirstReferralPurchase = snapshot.events.some((item) => item.type === "referral_new_qualified" && item.memberId === input.memberId);
      const rewardType: ReferralReward["rewardType"] = cycle ? "subscription" : alreadyHadFirstReferralPurchase ? "repeat_purchase" : "new_referral";
      await createReferralRewardsFromFulfillment({ sourceMemberId: input.memberId, orderId: input.orderId, rewardType, paidAmountBasis: input.merchandiseAmount, basePV: input.basePV, effectivePV: input.effectivePV, discountRatio: input.discountRatio, idempotencyKey: `${input.idempotencyKey}:referral-v2`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
    } else if (input.outcome !== "completed") {
      await cancelOrReverseReferralRewards({ orderId: input.orderId, outcome: input.outcome, idempotencyKey: `${input.idempotencyKey}:referral-reversal`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
    }
  } else if (input.memberId && input.outcome !== "completed") {
    await cancelOrReverseReferralRewards({ orderId: input.orderId, outcome: input.outcome, idempotencyKey: `${input.idempotencyKey}:self-reward-reversal`, now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });
  }

  // Absolute identity precedence: authenticated/member orders can never enter
  // the guest retail-promotion domain, even if a forged snapshot is supplied.
  if (!input.memberId && input.retailPromotionAttribution) {
    if (input.outcome === "completed" && rewardsAllowed) {
      await createRetailPromotionRewardFromFulfillment({
        orderId: input.orderId,
        attribution: input.retailPromotionAttribution,
        eligibleMerchandiseAmount: input.merchandiseAmount,
        idempotencyKey: `${input.idempotencyKey}:retail-promotion-v1`,
        now: input.now,
        stateFilePath: input.stateFilePath,
      });
    } else if (input.outcome !== "completed") {
      await cancelOrReverseRetailPromotionRewards({
        orderId: input.orderId,
        outcome: input.outcome,
        idempotencyKey: `${input.idempotencyKey}:retail-promotion-reversal`,
        now: input.now,
        stateFilePath: input.stateFilePath,
        rulesFilePath: input.rulesFilePath,
      });
    }
  }

  if (input.outcome === "completed" && rewardsAllowed) await runReferralRewardReleaseScheduler({ now: input.now, stateFilePath: input.stateFilePath, rulesFilePath: input.rulesFilePath });

  await settleCreditReservationForOrder({ orderId: input.orderId, action: input.outcome === "completed" ? "consume" : "release", idempotencyKey: `${input.idempotencyKey}:credit`, reason: input.outcome === "completed" ? "訂單成功取貨" : "訂單未取貨，釋放抵用金", now: input.now, stateFilePath: input.stateFilePath });

  return { subscriptionHandled: coffeeSubscriptionAllowed && Boolean(subscription || cycle), referralEvaluated: rewardsAllowed && Boolean(relationship), retailPromotionEvaluated: rewardsAllowed && Boolean(!input.memberId && input.retailPromotionAttribution), rewardBasisStatus: basis?.monetaryBasisStatus ?? "resolved" };
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
    const cycle = createSubscriptionCycleRecord({
      state,
      subscription,
      sequence: input.sequence,
      plannedDate: input.plannedDate,
      kind,
      version,
      now,
      reason: kind === "scheduled" ? "依配送週期建立" : "會員立即補貨",
      sourceEvent: input.idempotencyKey,
    }).cycle;
    remember(state, key, cycle.cycleId, now);
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function modifyCycleDate(input: { cycleId: string; plannedDate: string; recalculateAnchor: boolean; idempotencyKey: string; memberId?: string; expectedRevision?: number; rushWarningAcknowledged?: boolean; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
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
    const hasDedicatedRoast = subscriptionHasDedicatedRoast(cycle.itemsDraft);
    const rushRequired = dedicatedRoastRushRequired({ hasDedicatedRoast, plannedDate: input.plannedDate, today });
    if (input.memberId) {
      if (today > cycle.modificationDeadline) throw new MembershipCommerceError("本期已超過修改截止日");
      if (maximum !== null && modificationCount >= maximum) throw new MembershipCommerceError(`本期最多可修改 ${maximum} 次`);
      const availability = resolveSubscriptionDateAvailability({ requestedDate: input.plannedDate, today, customRoast: false, rules: version.rules });
      if (!availability.allowed) throw new MembershipCommerceError(`最早可選擇 ${availability.earliestDate} 配送`);
      if (rushRequired && input.rushWarningAcknowledged !== true) throw new MembershipCommerceError("專屬烘焙配送日期少於標準 3 天準備時間，請先確認急件提醒");
    }
    const before = cycle.plannedDate;
    Object.assign(cycle, cycleDates(input.plannedDate, version.rules.subscription.modificationCutoffDays, version.rules.subscription.orderCreationLeadDays));
    cycle.dedicatedRoastRush = rushRequired
      ? { warningAcknowledged: input.rushWarningAcknowledged === true, ...(input.rushWarningAcknowledged === true ? { acknowledgedAt: nowIso(now) } : {}), plannedDate: input.plannedDate, standardPreparationDays: DEDICATED_ROAST_STANDARD_PREPARATION_DAYS }
      : null;
    cycle.modificationCount = modificationCount + 1;
    if (input.recalculateAnchor) {
      subscription.anchorDate = input.plannedDate;
      for (const future of Object.values(state.cycles)) {
        if (future.cycleId === cycle.cycleId || future.subscriptionId !== subscription.subscriptionId || future.sequence <= cycle.sequence || !["scheduled", "modifiable"].includes(future.status)) continue;
        const futureDate = addTaipeiCalendarDays(input.plannedDate, subscription.intervalDays * (future.sequence - cycle.sequence));
        Object.assign(future, cycleDates(futureDate, version.rules.subscription.modificationCutoffDays, version.rules.subscription.orderCreationLeadDays));
        future.dedicatedRoastRush = null;
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

export async function updateCycleItems(input: { cycleId: string; items: SubscriptionDefaultItem[]; idempotencyKey: string; memberId?: string; expectedRevision?: number; rushWarningAcknowledged?: boolean; now?: Date; stateFilePath?: string }) {
  const items = cloneItems(input.items);
  const key = `cycle:items:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return cycle;
    if (!["scheduled", "modifiable"].includes(cycle.status)) throw new MembershipCommerceError("本期已截止修改");
    assertMemberOwns(state.subscriptions[cycle.subscriptionId], input.memberId);
    assertRevision(cycle, input.expectedRevision);
    const today = nowIso(now).slice(0, 10);
    const rushRequired = dedicatedRoastRushRequired({ hasDedicatedRoast: subscriptionHasDedicatedRoast(items), plannedDate: cycle.plannedDate, today });
    if (input.memberId && rushRequired && input.rushWarningAcknowledged !== true) throw new MembershipCommerceError("專屬烘焙配送日期少於標準 3 天準備時間，請先確認急件提醒");
    cycle.itemsDraft = items;
    cycle.dedicatedRoastRush = rushRequired
      ? { warningAcknowledged: input.rushWarningAcknowledged === true, ...(input.rushWarningAcknowledged === true ? { acknowledgedAt: nowIso(now) } : {}), plannedDate: cycle.plannedDate, standardPreparationDays: DEDICATED_ROAST_STANDARD_PREPARATION_DAYS }
      : null;
    touch(cycle, now);
    remember(state, key, cycle.cycleId, now);
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function lockSubscriptionCycle(input: { cycleId: string; idempotencyKey: string; /** @deprecated Shipping is calculated from active rules at lock time. */ shipping?: number; campaign?: PricingSnapshot["campaign"]; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:lock:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return cycle;
    if (!["scheduled", "modifiable"].includes(cycle.status)) throw new MembershipCommerceError("本期無法鎖定");
    const subscription = state.subscriptions[cycle.subscriptionId];
    const delivery = subscriptionDeliveryPreference(subscription);
    const items = cloneItems(cycle.itemsDraft);
    const original = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const subscriptionPrice = applyPercentage(original, version.rules.subscription.discountPercent, version.rules.money.roundingMode);
    const campaign = input.campaign ?? null;
    if (campaign?.subscriptionEligible && version.rules.campaign.eligiblePricingMode === OWNER_DECISION_REQUIRED) throw new MembershipCommerceError("活動適用定期購時的價格方式尚待 Owner 決定");
    const campaignAdjustment = campaign?.subscriptionEligible ? assertIntegerMoney(campaign.adjustment, "活動調整") : 0;
    const campaignPrice = campaign?.subscriptionEligible ? Math.max(0, original - campaignAdjustment) : null;
    const useCampaign = campaignPrice != null && (version.rules.campaign.eligiblePricingMode === "campaign-replaces-subscription" || version.rules.campaign.eligiblePricingMode === "campaign-defined" || (version.rules.campaign.eligiblePricingMode === "best-price" && campaignPrice < subscriptionPrice));
    const merchandisePrice = useCampaign ? campaignPrice : subscriptionPrice;
    const shipping = subscriptionShippingFee(subscription.shippingMethod as KdShippingMethod, version.rules);
    const payment = subscription.shippingMethod === "home_delivery"
      ? createHomeDeliveryPaymentSnapshot(delivery.paymentMethod as "atm_transfer" | "cash_on_delivery", version.rules)
      : null;
    const codServiceFee = payment?.codServiceFee ?? 0;
    const progress = giftProgress(state, subscription.subscriptionId);
    const fulfillmentNumber = progress + 1;
    const giftEligible = giftEligibleAt(fulfillmentNumber, version.rules);
    cycle.creditPreferenceSnapshot = validateSubscriptionCreditPreference(subscription.creditPreference);
    cycle.status = "locked";
    cycle.itemsSnapshot = items;
    cycle.rulesSnapshot = structuredClone(version);
    cycle.pricingSnapshot = { merchandiseOriginal: original, subscriptionDiscountPercent: version.rules.subscription.discountPercent, subscriptionPrice, campaignPrice, selectedPriceSource: useCampaign ? "campaign" : "subscription", campaign, creditReserved: 0, shipping, codServiceFee, finalAmount: Math.max(0, merchandisePrice + shipping + codServiceFee), currency: "TWD", roundingMode: version.rules.money.roundingMode };
    cycle.giftSnapshot = { eligible: giftEligible, quantity: giftEligible ? giftQuantityForItems(items, version.rules) : 0, selectedProductId: null, packingLockedAt: null };
    cycle.shippingSnapshot = { method: subscription.shippingMethod, storeSelection: delivery.storeSelection, deliveryAddress: delivery.deliveryAddress, paymentMethod: delivery.paymentMethod, codServiceFee, freeShipping: shipping === 0 };
    cycle.paymentSnapshot = payment ? { method: payment.paymentDetails.method } : null;
    touch(cycle, now);
    remember(state, key, cycle.cycleId, now);
    audit(state, { actor: "system", action: "cycle-locked", entityType: "cycle", entityId: cycle.cycleId, before: { status: "modifiable" }, after: { status: "locked", rulesVersion: version.rulesVersion, finalAmount: cycle.pricingSnapshot.finalAmount }, reason: "會員修改期限截止", sourceEvent: input.idempotencyKey }, now);
    return cycle;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function createOrderFromCycle(input: { cycleId: string; orderId: string; creditSnapshot?: { reservationId?: string; appliedAmount: number; total: number; terminalStatus?: "cancelled" | "completed" }; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:order:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    if (remembered(state, key)) return cycle;
    if (cycle.status !== "locked" || !cycle.pricingSnapshot) throw new MembershipCommerceError("本期尚未完成鎖定");
    if (Object.values(state.cycles).some((other) => other.createdOrderId === input.orderId)) throw new MembershipCommerceError("訂單已連結其他配送期次");
    if (input.creditSnapshot) {
      const reservation = input.creditSnapshot.reservationId ? state.creditReservations[input.creditSnapshot.reservationId] : null;
      // A scheduler replay can encounter an order settled before its cycle link was saved.
      const allowedStatuses = input.creditSnapshot.terminalStatus === "cancelled" ? ["reserved", "released"] : input.creditSnapshot.terminalStatus === "completed" ? ["reserved", "consumed"] : ["reserved"];
      if (input.creditSnapshot.appliedAmount > 0 && (!reservation || reservation.orderId !== input.orderId || reservation.amount !== input.creditSnapshot.appliedAmount || !allowedStatuses.includes(reservation.status))) throw new MembershipCommerceError("本期保留狀態不一致");
      cycle.pricingSnapshot.creditReserved = input.creditSnapshot.appliedAmount;
      cycle.pricingSnapshot.finalAmount = input.creditSnapshot.total;
    }
    cycle.status = input.creditSnapshot?.terminalStatus === "cancelled" ? "cancelled" : "order_created";
    cycle.createdOrderId = input.orderId;
    touch(cycle, now);
    remember(state, key, cycle.cycleId, now);
    const source = event(state, cycle.status === "cancelled" ? "cycle_cancelled" : "order_created", { cycleSequence: cycle.sequence }, now, { subscriptionId: cycle.subscriptionId, orderId: input.orderId });
    if (cycle.status !== "cancelled") notify(state, version.rules, "order_created", source.eventId, now, { memberId: state.subscriptions[cycle.subscriptionId].memberId });
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

/** Synchronizes a canonically cancelled order with its linked subscription cycle. */
export async function cancelSubscriptionCycleForOrder(input: { orderId: string; memberId?: string; reason: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const state = await readMembershipCommerceState(input.stateFilePath);
  const cycle = Object.values(state.cycles).find((item) => item.createdOrderId === input.orderId);
  if (!cycle) return null;
  const subscription = state.subscriptions[cycle.subscriptionId];
  if (!subscription) throw new MembershipCommerceError("配送期次缺少定期購資料");
  if (input.memberId && subscription.memberId !== input.memberId) throw new MembershipCommerceError("配送期次會員與訂單會員不一致");
  if (cycle.status === "cancelled") return cycle;
  if (cycle.status !== "order_created") throw new MembershipCommerceError(`已取消訂單的配送期次仍為 ${cycle.status}，無法安全同步`);
  return transitionCycle({
    cycleId: cycle.cycleId,
    to: "cancelled",
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
    now: input.now,
    stateFilePath: input.stateFilePath,
    rulesFilePath: input.rulesFilePath,
  });
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

const NEXT_SUBSCRIPTION_ARRANGEMENT_STATUSES: CycleStatus[] = [
  "scheduled",
  "modifiable",
  "locked",
  "order_created",
  "shipped",
  "ready_for_pickup",
  "blocked_stock",
];

function nextSubscriptionCadenceDate(
  state: MembershipCommerceState,
  subscription: Subscription,
  skippedCycle: SubscriptionCycle,
  nextSequence: number,
) {
  const cadenceAnchorCycle = Object.values(state.cycles)
    .filter((candidate) =>
      candidate.subscriptionId === subscription.subscriptionId &&
      candidate.kind === "scheduled" &&
      candidate.sequence < nextSequence &&
      candidate.plannedDate === subscription.anchorDate
    )
    .sort((left, right) => right.sequence - left.sequence)[0];
  const anchorSequence = cadenceAnchorCycle?.sequence ?? 0;
  if (anchorSequence > skippedCycle.sequence) throw new MembershipCommerceError("定期配送基準資料不一致");
  return addTaipeiCalendarDays(
    subscription.anchorDate,
    subscription.intervalDays * (nextSequence - anchorSequence),
  );
}

export async function memberSkipCycle(input: { memberId: string; cycleId: string; expectedRevision: number; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `cycle:member-skip:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const cycle = state.cycles[input.cycleId];
    if (!cycle) throw new MembershipCommerceError("找不到配送期次");
    const subscription = state.subscriptions[cycle.subscriptionId];
    if (!subscription) throw new MembershipCommerceError("找不到定期購");
    assertMemberOwns(subscription, input.memberId);
    const rememberedId = remembered(state, key);
    if (rememberedId) {
      const rememberedEvent = state.events.find((record) => record.eventId === rememberedId);
      const nextCycleId = String(rememberedEvent?.safeData.nextCycleId ?? "");
      const nextCycle = nextCycleId ? state.cycles[nextCycleId] ?? null : null;
      return {
        ...cycle,
        skippedCycle: cycle,
        nextCycle,
        skippedDate: String(rememberedEvent?.safeData.skippedDate ?? cycle.plannedDate),
        plannedDate: nextCycle?.plannedDate ?? (rememberedEvent?.safeData.plannedDate ? String(rememberedEvent.safeData.plannedDate) : null),
        nextCycleAction: String(rememberedEvent?.safeData.nextCycleAction ?? (nextCycle ? "reused" : "unavailable")) as "created" | "reused" | "unavailable",
      };
    }
    assertRevision(cycle, input.expectedRevision);
    if (!["scheduled", "modifiable"].includes(cycle.status)) throw new MembershipCommerceError("本期已截止修改");
    if (subscription.status !== "active") throw new MembershipCommerceError("目前定期配送無法跳過本次安排");
    const before = cycle.status;
    const skippedDate = cycle.plannedDate;
    cycle.status = "skipped";
    touch(cycle, now);
    const source = event(state, "cycle_skipped", { sequence: cycle.sequence, skippedDate }, now, { memberId: input.memberId, subscriptionId: cycle.subscriptionId });

    const laterArrangements = Object.values(state.cycles)
      .filter((candidate) =>
        candidate.cycleId !== cycle.cycleId &&
        candidate.subscriptionId === subscription.subscriptionId &&
        candidate.kind === "scheduled" &&
        candidate.sequence > cycle.sequence &&
        NEXT_SUBSCRIPTION_ARRANGEMENT_STATUSES.includes(candidate.status)
      )
      .sort((left, right) => left.sequence - right.sequence || left.plannedDate.localeCompare(right.plannedDate));
    const laterArrangement = laterArrangements.find((candidate) => candidate.plannedDate > skippedDate);

    let nextCycle = laterArrangement ?? null;
    let nextCycleAction: "created" | "reused" | "unavailable" = laterArrangement ? "reused" : "unavailable";
    if (!nextCycle && laterArrangements.length === 0) {
      let nextSequence = Object.values(state.cycles)
        .filter((candidate) => candidate.subscriptionId === subscription.subscriptionId && candidate.kind === "scheduled")
        .reduce((maximum, candidate) => Math.max(maximum, candidate.sequence), 0) + 1;
      let plannedDate = nextSubscriptionCadenceDate(state, subscription, cycle, nextSequence);
      while (plannedDate <= skippedDate) {
        nextSequence += 1;
        if (nextSequence - cycle.sequence > 1_000) throw new MembershipCommerceError("無法安全計算下一次配送日期");
        plannedDate = nextSubscriptionCadenceDate(state, subscription, cycle, nextSequence);
      }
      nextCycle = createSubscriptionCycleRecord({
        state,
        subscription,
        sequence: nextSequence,
        plannedDate,
        kind: "scheduled",
        version,
        now,
        reason: "會員跳過本次後延續下一期定期配送",
        sourceEvent: source.eventId,
        dedicatedRoastReferenceDate: getDateOnlyInTimeZone(now),
      }).cycle;
      nextCycleAction = "created";
    }

    source.safeData.nextCycleId = nextCycle?.cycleId ?? "";
    source.safeData.plannedDate = nextCycle?.plannedDate ?? "";
    source.safeData.nextCycleAction = nextCycleAction;
    remember(state, key, source.eventId, now);
    notify(state, version.rules, "cycle_skipped", source.eventId, now, { memberId: input.memberId });
    audit(state, { actor: "member", action: "cycle-skipped", entityType: "cycle", entityId: cycle.cycleId, before: { status: before, plannedDate: skippedDate }, after: { status: "skipped", nextPlannedDate: nextCycle?.plannedDate ?? "" }, reason: "會員跳過本次", sourceEvent: source.eventId }, now);
    return {
      ...cycle,
      skippedCycle: cycle,
      nextCycle,
      skippedDate,
      plannedDate: nextCycle?.plannedDate ?? null,
      nextCycleAction,
    };
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function updateSubscriptionPreferences(input: { memberId: string; subscriptionId: string; expectedRevision: number; idempotencyKey: string; shippingMethod?: string; storeSelection?: Subscription["storeSelection"]; deliveryAddress?: DeliveryAddress | null; paymentMethod?: HomeDeliveryPaymentMethod | null; creditPreference?: SubscriptionCreditPreference; defaultItems?: SubscriptionDefaultItem[]; now?: Date; stateFilePath?: string }) {
  const items = input.defaultItems ? cloneItems(input.defaultItems) : null;
  const key = `subscription:preferences:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const subscription = state.subscriptions[input.subscriptionId];
    if (!subscription) throw new MembershipCommerceError("找不到定期購");
    if (remembered(state, key)) return subscription;
    assertMemberOwns(subscription, input.memberId);
    assertRevision(subscription, input.expectedRevision);
    if (!["active", "paused"].includes(subscription.status) && !(subscription.status === "pending_activation" && input.creditPreference !== undefined && input.shippingMethod === undefined && input.storeSelection === undefined && input.deliveryAddress === undefined && input.paymentMethod === undefined && input.defaultItems === undefined)) throw new MembershipCommerceError("目前無法修改定期購內容");
    const beforeShippingMethod = subscription.shippingMethod;
    const beforeStore = subscription.storeSelection?.storeId ?? "none";
    if (input.shippingMethod !== undefined || input.storeSelection !== undefined || input.deliveryAddress !== undefined || input.paymentMethod !== undefined) {
      const shippingMethod = input.shippingMethod ?? subscription.shippingMethod;
      const delivery = subscriptionDeliveryPreference({
        shippingMethod,
        storeSelection: input.storeSelection !== undefined ? input.storeSelection : subscription.storeSelection,
        deliveryAddress: input.deliveryAddress !== undefined ? input.deliveryAddress : subscription.deliveryAddress,
        paymentMethod: input.paymentMethod !== undefined ? input.paymentMethod : subscription.paymentMethod,
      }, true);
      subscription.shippingMethod = shippingMethod;
      subscription.storeSelection = delivery.storeSelection;
      subscription.deliveryAddress = delivery.deliveryAddress;
      subscription.paymentMethod = delivery.paymentMethod;
    }
    if (input.creditPreference !== undefined) subscription.creditPreference = validateSubscriptionCreditPreference(input.creditPreference);
    if (items) subscription.defaultItems = items;
    touch(subscription, now);
    remember(state, key, subscription.subscriptionId, now);
    const source = event(state, "subscription_preferences_changed", { shippingMethodChanged: beforeShippingMethod !== subscription.shippingMethod, storeChanged: beforeStore !== (subscription.storeSelection?.storeId ?? "none"), itemsChanged: Boolean(items) }, now, { memberId: input.memberId, subscriptionId: subscription.subscriptionId });
    audit(state, { actor: "member", action: "subscription-preferences-changed", entityType: "subscription", entityId: subscription.subscriptionId, before: { shippingMethod: beforeShippingMethod, storeId: beforeStore }, after: { shippingMethod: subscription.shippingMethod, storeId: subscription.storeSelection?.storeId ?? "none" }, reason: "會員修改後續配送設定", sourceEvent: source.eventId }, now);
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
    const allowed =
      (before === "pending_activation" &&
        input.status === "terminated") ||
      (before === "active" &&
        ["paused", "terminated"].includes(input.status)) ||
      (before === "paused" &&
        ["active", "terminated"].includes(input.status));
    if (!allowed) throw new MembershipCommerceError("定期購狀態無法進行這項變更");
    if (before === "paused" && input.status === "active") {
      if (version.rules.subscription.pauseResumeAnchorPolicy === OWNER_DECISION_REQUIRED) throw new MembershipCommerceError("恢復配送後的基準日期尚待 Owner 決定");
      if (version.rules.subscription.pauseResumeAnchorPolicy === "member-selects-date") {
        if (!input.resumeDate || !input.intervalDays || !resolveSubscriptionInterval(input.intervalDays, version.rules).allowed) throw new MembershipCommerceError("請選擇恢復配送日期與週期");
        const availability = resolveSubscriptionDateAvailability({
          requestedDate: input.resumeDate,
          today: getDateOnlyInTimeZone(now),
          customRoast: subscriptionHasDedicatedRoast(subscription.defaultItems),
          rules: version.rules,
        });
        if (!availability.allowed) throw new MembershipCommerceError(`最早可從 ${availability.earliestDate} 恢復配送`);
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

function canRestartTerminatedSubscription(
  state: MembershipCommerceState,
  subscription: Subscription,
) {
  if (subscription.status !== "terminated") return false;

  const terminationAudit = [...state.audit].reverse().find(
    (record) =>
      record.entityType === "subscription" &&
      record.entityId === subscription.subscriptionId &&
      record.after.status === "terminated",
  );

  if (
    !terminationAudit ||
    terminationAudit.actor !== "member" ||
    terminationAudit.action !== "subscription-terminated" ||
    !["active", "paused"].includes(String(terminationAudit.before.status))
  ) return false;

  const terminationEvent = state.events.find(
    (record) =>
      record.eventId === terminationAudit.sourceEvent &&
      record.subscriptionId === subscription.subscriptionId &&
      record.type === "subscription_terminated",
  );

  if (!terminationEvent) return false;

  return state.events.some(
    (record) =>
      record.subscriptionId === subscription.subscriptionId &&
      record.type === "qualifying_fulfillment" &&
      record.occurredAt <= terminationAudit.timestamp,
  );
}

export async function restartTerminatedSubscription(input: {
  memberId: string;
  subscriptionId: string;
  expectedRevision: number;
  resumeDate: string;
  intervalDays: number;
  idempotencyKey: string;
  now?: Date;
  stateFilePath?: string;
  rulesFilePath?: string;
}) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `subscription:restart:${input.idempotencyKey}`;

  return transaction((state, now) => {
    const subscription = state.subscriptions[input.subscriptionId];
    if (!subscription) throw new MembershipCommerceError("找不到定期購");
    assertMemberOwns(subscription, input.memberId);

    const rememberedEventId = remembered(state, key);
    if (rememberedEventId) {
      const restartEvent = state.events.find((record) => record.eventId === rememberedEventId);
      const cycleId = String(restartEvent?.safeData.cycleId ?? "");
      return {
        subscription,
        cycle: cycleId ? state.cycles[cycleId] ?? null : null,
        plannedDate: String(restartEvent?.safeData.plannedDate ?? subscription.anchorDate),
        cycleAction: String(restartEvent?.safeData.cycleAction ?? "deferred") as "reused" | "created" | "deferred",
      };
    }

    assertRevision(subscription, input.expectedRevision);
    if (subscription.status !== "terminated") throw new MembershipCommerceError("只有已停止的定期配送可以重新啟動");
    if (!canRestartTerminatedSubscription(state, subscription)) throw new MembershipCommerceError("這筆定期配送無法從會員中心重新啟動");
    if (!resolveSubscriptionInterval(input.intervalDays, version.rules).allowed) throw new MembershipCommerceError("此配送週期目前未開放");

    const today = getDateOnlyInTimeZone(now);
    const availability = resolveSubscriptionDateAvailability({
      requestedDate: input.resumeDate,
      today,
      customRoast: subscriptionHasDedicatedRoast(subscription.defaultItems),
      rules: version.rules,
    });
    if (!availability.allowed) throw new MembershipCommerceError(`最早可從 ${availability.earliestDate} 重新啟動配送`);

    const previousAnchorDate = subscription.anchorDate;
    const previousIntervalDays = subscription.intervalDays;
    const scheduledCycles = Object.values(state.cycles)
      .filter((cycle) => cycle.subscriptionId === subscription.subscriptionId && cycle.kind === "scheduled");
    const editableCycle = scheduledCycles
      .filter((cycle) => ["scheduled", "modifiable"].includes(cycle.status))
      .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate) || left.sequence - right.sequence)[0];
    const hasCommittedCycle = scheduledCycles.some((cycle) =>
      ["locked", "order_created", "shipped", "ready_for_pickup", "blocked_stock"].includes(cycle.status),
    );

    subscription.status = "active";
    subscription.anchorDate = input.resumeDate;
    subscription.intervalDays = input.intervalDays;
    subscription.statusReason = "會員重新啟動定期配送";
    touch(subscription, now);

    let cycle: SubscriptionCycle | null = null;
    let cycleAction: "reused" | "created" | "deferred" = "deferred";

    if (editableCycle) {
      const previousPlannedDate = editableCycle.plannedDate;
      Object.assign(editableCycle, cycleDates(
        input.resumeDate,
        version.rules.subscription.modificationCutoffDays,
        version.rules.subscription.orderCreationLeadDays,
      ));
      editableCycle.dedicatedRoastRush = null;
      touch(editableCycle, now);
      cycle = editableCycle;
      cycleAction = "reused";
      audit(state, {
        actor: "member",
        action: "cycle-reused-for-subscription-restart",
        entityType: "cycle",
        entityId: editableCycle.cycleId,
        before: { plannedDate: previousPlannedDate, status: editableCycle.status },
        after: { plannedDate: editableCycle.plannedDate, status: editableCycle.status },
        reason: "會員重新啟動定期配送並更新下一次配送日期",
        sourceEvent: input.idempotencyKey,
      }, now);
    } else if (!hasCommittedCycle) {
      const nextSequence = scheduledCycles.reduce(
        (maximum, current) => Math.max(maximum, current.sequence),
        0,
      ) + 1;
      cycle = createSubscriptionCycleRecord({
        state,
        subscription,
        sequence: nextSequence,
        plannedDate: input.resumeDate,
        kind: "scheduled",
        version,
        now,
        reason: "會員重新啟動定期配送後建立下一期",
        sourceEvent: input.idempotencyKey,
        dedicatedRoastReferenceDate: today,
      }).cycle;
      cycleAction = "created";
    }

    const source = event(state, "subscription_restarted", {
      plannedDate: input.resumeDate,
      intervalDays: input.intervalDays,
      cycleAction,
      cycleId: cycle?.cycleId ?? "",
    }, now, { memberId: subscription.memberId, subscriptionId: subscription.subscriptionId });
    remember(state, key, source.eventId, now);
    notify(state, version.rules, "subscription_resumed", source.eventId, now, { memberId: subscription.memberId });
    audit(state, {
      actor: "member",
      action: "subscription-restarted",
      entityType: "subscription",
      entityId: subscription.subscriptionId,
      before: { status: "terminated", anchorDate: previousAnchorDate, intervalDays: previousIntervalDays },
      after: { status: "active", anchorDate: subscription.anchorDate, intervalDays: subscription.intervalDays, cycleAction },
      reason: "會員重新啟動定期配送",
      sourceEvent: source.eventId,
    }, now);

    return { subscription, cycle, plannedDate: input.resumeDate, cycleAction };
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function hideTerminatedSubscriptionFromMember(input: {
  subscriptionId: string;
  memberId: string;
  expectedRevision?: number;
  idempotencyKey: string;
  now?: Date;
  stateFilePath?: string;
}) {
  const key = `subscription:member-hide:${input.idempotencyKey}`;

  return transaction((state, now) => {
    const subscription = state.subscriptions[input.subscriptionId];

    if (!subscription) {
      throw new MembershipCommerceError("找不到定期配送");
    }

    const rememberedId = remembered(state, key);

    if (rememberedId) {
      return subscription;
    }

    assertMemberOwns(subscription, input.memberId);
    assertRevision(subscription, input.expectedRevision);

    if (subscription.status !== "terminated") {
      throw new MembershipCommerceError(
        "只有已停止的定期配送才能從會員中心刪除",
      );
    }

    if (subscription.memberHiddenAt) {
      remember(state, key, subscription.subscriptionId, now);
      return subscription;
    }

    const hiddenAt = nowIso(now);

    subscription.memberHiddenAt = hiddenAt;
    touch(subscription, now);

    remember(state, key, subscription.subscriptionId, now);

    const source = event(
      state,
      "subscription_hidden_from_member",
      {
        hiddenAt,
        reason: "會員刪除已停止的定期配送顯示",
      },
      now,
      {
        memberId: subscription.memberId,
        subscriptionId: subscription.subscriptionId,
      },
    );

    audit(
      state,
      {
        actor: "member",
        action: "subscription-hidden-from-member",
        entityType: "subscription",
        entityId: subscription.subscriptionId,
        before: {
          status: subscription.status,
          memberHiddenAt: subscription.memberHiddenAt ?? "",
        },
        after: {
          status: subscription.status,
          memberHiddenAt: hiddenAt,
        },
        reason: "會員刪除已停止的定期配送顯示",
        sourceEvent: source.eventId,
      },
      now,
    );

    return subscription;
  }, {
    now: input.now,
    filePath: input.stateFilePath,
  });
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

export function percentageRewardPayout(input: {
  calculationBasis: RewardCalculationBasis;
  calculationBaseValue: number;
  rewardRate: number;
  pvRewardMoneyValue: number;
  roundingMode: MembershipBusinessRules["money"]["roundingMode"];
}) {
  const rewardPV = input.calculationBasis === "pv"
    ? input.calculationBaseValue * input.rewardRate / 100
    : 0;
  const rawCredit = input.calculationBasis === "pv"
    ? rewardPV * input.pvRewardMoneyValue
    : input.calculationBaseValue * input.rewardRate / 100;
  return {
    rewardPV,
    calculatedCreditAmount: Math.max(0, rewardRound(rawCredit, input.roundingMode)),
  };
}

function validForSelfPurchaseTier(consumption: ValidConsumptionEvent) {
  return !consumption.reversedAt && !consumption.reversalOutcome;
}

function selfPurchaseTierThresholdAmount(
  consumption: ValidConsumptionEvent,
  thresholdBasis: SelfPurchaseRewardTierRules["thresholdBasis"],
) {
  if (thresholdBasis === "pv") {
    const value = Number(consumption.validConsumptionPV ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  // The trusted fulfillment path defines paid merchandise as subtotal minus
  // applied credit. Do not reuse referral qualification's configurable
  // validConsumptionAmount, which may include shipping or consumed credit.
  return Math.max(
    0,
    consumption.merchandiseSubtotal - consumption.appliedCreditAmount,
  );
}

function createSelfPurchaseTierSnapshot(input: {
  state: MembershipCommerceState;
  sourceMemberId: string;
  orderId: string;
  paidAmountBasis: number;
  effectivePV: number;
  completedAt: Date;
  tierRules: SelfPurchaseRewardTierRules;
  calculationMode: "paid_amount" | "pv";
  pvRewardMoneyValue: number;
  moneyRoundingMode: MembershipBusinessRules["money"]["roundingMode"];
}): SelfPurchaseTierRewardSnapshot {
  const anchorMilliseconds = input.completedAt.getTime();
  const windowStartedAt = new Date(
    anchorMilliseconds - input.tierRules.rollingWindowDays * QUALIFICATION_DAY_MS,
  ).toISOString();
  const windowEndedAt = input.completedAt.toISOString();
  const currentAmount = input.tierRules.thresholdBasis === "pv"
    ? input.effectivePV
    : input.paidAmountBasis;
  const currentConsumption = Object.values(input.state.validConsumptionEvents)
    .find((consumption) =>
      consumption.memberId === input.sourceMemberId
      && consumption.sourceOrderId === input.orderId
      && validForSelfPurchaseTier(consumption));
  const priorEvidence: SelfPurchaseTierEvidenceSnapshot[] =
    input.tierRules.accumulationBasis === "rolling_period"
      ? Object.values(input.state.validConsumptionEvents)
        .filter((consumption) => {
          const finalizedAt = Date.parse(consumption.finalizedAt);
          return (
            consumption.memberId === input.sourceMemberId
            && consumption.sourceOrderId !== input.orderId
            && validForSelfPurchaseTier(consumption)
            && finalizedAt >= Date.parse(windowStartedAt)
            && finalizedAt <= anchorMilliseconds
          );
        })
        .sort((left, right) =>
          Date.parse(left.finalizedAt) - Date.parse(right.finalizedAt)
          || left.eventId.localeCompare(right.eventId))
        .map((consumption) => ({
          validConsumptionEventId: consumption.eventId,
          sourceOrderId: consumption.sourceOrderId,
          finalizedAt: consumption.finalizedAt,
          thresholdAmount: selfPurchaseTierThresholdAmount(
            consumption,
            input.tierRules.thresholdBasis,
          ),
          role: "prior" as const,
        }))
      : [];
  const currentEvidence: SelfPurchaseTierEvidenceSnapshot = {
    validConsumptionEventId: currentConsumption?.eventId ?? null,
    sourceOrderId: input.orderId,
    finalizedAt: currentConsumption?.finalizedAt ?? windowEndedAt,
    thresholdAmount: currentAmount,
    role: "current",
  };
  const initialEvidence = [...priorEvidence, currentEvidence];
  const initialResult = calculateSelfPurchaseTierReward({
    priorAmount: priorEvidence.reduce((sum, evidence) => sum + evidence.thresholdAmount, 0),
    currentAmount,
    calculationMethod: input.tierRules.calculationMethod,
    tiers: input.tierRules.tiers,
  });

  return {
    featureEnabled: true,
    rules: {
      thresholdBasis: input.tierRules.thresholdBasis,
      accumulationBasis: input.tierRules.accumulationBasis,
      calculationMethod: input.tierRules.calculationMethod,
      rollingWindowDays: input.tierRules.rollingWindowDays,
      tiers: structuredClone(input.tierRules.tiers),
    },
    payout: {
      calculationMode: input.calculationMode,
      pvRewardMoneyValue: input.pvRewardMoneyValue,
      moneyRoundingMode: input.moneyRoundingMode,
    },
    windowStartedAt,
    windowEndedAt,
    initialEvidence: structuredClone(initialEvidence),
    latestEvidence: structuredClone(initialEvidence),
    initialResult: structuredClone(initialResult),
    latestResult: structuredClone(initialResult),
  };
}

export function selfPurchaseTierPayout(input: {
  result: SelfPurchaseTierRewardResult;
  paidAmountBasis: number;
  effectivePV: number;
  snapshot: SelfPurchaseTierRewardSnapshot;
}) {
  const payoutRate = input.result.currentAmount > 0
    ? input.result.rawReward / input.result.currentAmount * 100
    : 0;
  const rewardPV = input.snapshot.payout.calculationMode === "pv"
    ? input.effectivePV * payoutRate / 100
    : 0;
  const rawCredit = input.snapshot.payout.calculationMode === "pv"
    ? rewardPV * input.snapshot.payout.pvRewardMoneyValue
    : input.paidAmountBasis * payoutRate / 100;

  return {
    rewardRate: input.result.effectiveRewardRate,
    rewardPV,
    calculatedCreditAmount: Math.max(
      0,
      rewardRound(rawCredit, input.snapshot.payout.moneyRoundingMode),
    ),
  };
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

type QualificationBasis = MembershipBusinessRules["referral"]["payoutQualification"]["qualificationBasis"];

function qualificationBasisFromRules(
  rules: MembershipBusinessRules["referral"]["payoutQualification"] | undefined,
): QualificationBasis {
  return rules?.qualificationBasis === "pv" ? "pv" : "money";
}

function qualificationBasisFromRound(round: QualificationRound): QualificationBasis {
  return round.qualificationBasis === "pv" ? "pv" : "money";
}

function qualificationBasisValue(
  consumption: ValidConsumptionEvent,
  basis: QualificationBasis,
) {
  if (basis === "pv") {
    const value = Number(consumption.validConsumptionPV ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  return Math.max(0, consumption.validConsumptionAmount);
}

function remainingConsumptionByEvent(
  state: MembershipCommerceState,
  basis: QualificationBasis,
) {
  const consumed = new Map<string, number>();

  for (const round of Object.values(state.qualificationRounds)) {
    if (qualificationBasisFromRound(round) !== basis) continue;

    for (const allocation of round.consumptionAccounting.allocations) {
      consumed.set(
        allocation.validConsumptionEventId,
        (consumed.get(allocation.validConsumptionEventId) ?? 0) + allocation.amount,
      );
    }
  }

  const remaining = new Map<string, number>();

  for (const consumption of Object.values(state.validConsumptionEvents)) {
    const available = qualificationBasisValue(consumption, basis);

    remaining.set(
      consumption.eventId,
      Math.max(0, available - (consumed.get(consumption.eventId) ?? 0)),
    );
  }

  return remaining;
}

function evaluateQualificationPath(input: {
  state: MembershipCommerceState;
  memberId: string;
  finalizedAt: Date;
  windowDays: number;
  basis: QualificationBasis;
  threshold: number;
  remaining: Map<string, number>;
  activeSubscriptionRequired: boolean;
  activeSubscriptionSatisfied: boolean;
}): QualificationPathEvaluation {
  const windowStartedAt = new Date(
    input.finalizedAt.getTime() - input.windowDays * QUALIFICATION_DAY_MS,
  );

  const eligible = Object.values(input.state.validConsumptionEvents)
    .filter((consumption) => {
      const occurredAt = Date.parse(consumption.finalizedAt);

      return (
        consumption.memberId === input.memberId
        && occurredAt >= windowStartedAt.getTime()
        && occurredAt <= input.finalizedAt.getTime()
        && (input.remaining.get(consumption.eventId) ?? 0) > 0
      );
    })
    .sort(
      (left, right) =>
        Date.parse(left.finalizedAt) - Date.parse(right.finalizedAt)
        || left.eventId.localeCompare(right.eventId),
    );

  const cumulativeAmount = eligible.reduce(
    (sum, consumption) =>
      sum + (input.remaining.get(consumption.eventId) ?? 0),
    0,
  );

  return {
    windowDays: input.windowDays,
    windowStartedAt: windowStartedAt.toISOString(),
    windowEndedAt: input.finalizedAt.toISOString(),
    qualificationBasis: input.basis,
    threshold: input.threshold,
    cumulativeAmount,
    eligibleEventIds: eligible.map((consumption) => consumption.eventId),
    activeSubscriptionRequired: input.activeSubscriptionRequired,
    activeSubscriptionSatisfied: input.activeSubscriptionSatisfied,
    passed:
      cumulativeAmount >= input.threshold
      && (!input.activeSubscriptionRequired || input.activeSubscriptionSatisfied),
  };
}

function allocateAvailableConsumption(input: {
  selectedPaths: Array<{
    path: "general" | "subscription";
    evaluation: QualificationPathEvaluation;
  }>;
  remaining: Map<string, number>;
  basis: QualificationBasis;
  mode: MembershipBusinessRules["referral"]["payoutQualification"]["excessConsumptionMode"];
}) {
  const union = new Set(
    input.selectedPaths.flatMap(({ evaluation }) => evaluation.eligibleEventIds),
  );

  const availableAmountBefore = [...union].reduce(
    (sum, eventId) => sum + (input.remaining.get(eventId) ?? 0),
    0,
  );

  const allocated = new Map<string, number>();

  const take = (eventId: string, requested: number) => {
    const available =
      (input.remaining.get(eventId) ?? 0)
      - (allocated.get(eventId) ?? 0);

    const amount = Math.min(available, requested);

    if (amount > 0) {
      allocated.set(
        eventId,
        (allocated.get(eventId) ?? 0) + amount,
      );
    }

    return amount;
  };

  if (input.mode === "reset") {
    for (const eventId of union) {
      take(eventId, Number.MAX_SAFE_INTEGER);
    }
  } else {
    for (const { evaluation } of input.selectedPaths) {
      const alreadyCounted = evaluation.eligibleEventIds.reduce(
        (sum, eventId) => sum + (allocated.get(eventId) ?? 0),
        0,
      );

      let required = Math.max(0, evaluation.threshold - alreadyCounted);

      for (const eventId of evaluation.eligibleEventIds) {
        required -= take(eventId, required);
        if (required === 0) break;
      }

      if (required !== 0) {
        throw new MembershipCommerceError("推薦資格消費配置不足");
      }
    }
  }

  const allocations = [...allocated].map(
    ([validConsumptionEventId, amount]) => ({
      validConsumptionEventId,
      amount,
    }),
  );

  const consumedAmount = allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0,
  );

  return {
    basis: input.basis,
    availableAmountBefore,
    consumedAmount,
    remainingAmountAfter: availableAmountBefore - consumedAmount,
    allocations,
  };
}

/** Records one immutable event and, at most, one successful qualification round for a completed canonical order. */
export async function recordValidConsumptionFromCompletedOrder(input: { memberId: string; orderId: string; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const finalizedAt = input.now ?? new Date();
  const order = await readOrder(input.orderId);
  if (!order || order.status !== "completed") return null;
  const orderMemberId = typeof order.member?.memberId === "string" ? order.member.memberId : typeof order.memberId === "string" ? order.memberId : null;
  if (orderMemberId && orderMemberId !== input.memberId) throw new MembershipCommerceError("有效消費訂單會員不一致");

  const basis = resolveOrderRewardBasis(order);
  if (!currentRewardsAllowed(basis)) return null;
  const financial = projectOrderFinancialBreakdown(order);
  if (!Number.isSafeInteger(order.subtotal) || order.subtotal < 0 || !Number.isSafeInteger(order.shipping) || order.shipping < 0) throw new MembershipCommerceError("有效消費訂單金額證據不完整");
  const rawCredit = order.credit && typeof order.credit === "object" ? order.credit.appliedAmount : undefined;
  const appliedCreditAmount = rawCredit == null ? 0 : assertIntegerMoney(rawCredit, "有效消費抵用金");
  if (appliedCreditAmount > 0 && (financial.creditEvidence !== "order-snapshot" || financial.creditApplied !== appliedCreditAmount)) throw new MembershipCommerceError("有效消費抵用金證據不一致");

  const version = await getActiveMembershipRules(finalizedAt, input.rulesFilePath);
  const qualificationRules = structuredClone(version.rules.referral.payoutQualification);
  const coffeeSubtotal = basis.coffeeMerchandiseSubtotal!;
  // Shared mixed-order shipping has no Coffee allocation evidence; never allocate it by guess.
  const coffeeShipping = basis.hasStore ? 0 : financial.shipping;
  const validConsumptionAmount = Math.max(0, coffeeSubtotal - (qualificationRules.validConsumption.includeCreditDiscount ? 0 : appliedCreditAmount) + (qualificationRules.validConsumption.includeShipping ? coffeeShipping : 0));
  const validConsumptionPV = basis.totalValidConsumptionPV;

  if (!Number.isFinite(validConsumptionPV) || validConsumptionPV < 0) {
    throw new MembershipCommerceError("有效消費訂單 KD點證據不完整");
  }

  const qualificationBasis = qualificationBasisFromRules(qualificationRules);
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
      merchandiseSubtotal: coffeeSubtotal,
      appliedCreditAmount,
      shippingAmount: coffeeShipping,
      validConsumptionAmount,
      validConsumptionPV,
      includeCreditDiscount: qualificationRules.validConsumption.includeCreditDiscount,
      includeShipping: qualificationRules.validConsumption.includeShipping,
      activeSubscriptionAtCompletion: hasActiveSubscription(state, input.memberId),
      rulesVersion: version.rulesVersion,
      qualificationRulesSnapshot: qualificationRules,
      idempotencyKey: input.idempotencyKey,
    };
    state.validConsumptionEvents[eventId] = consumption;

    const remaining = remainingConsumptionByEvent(state, qualificationBasis);

    const generalThreshold =
      qualificationBasis === "pv"
        ? qualificationRules.generalMember.cumulativeValidPVThreshold
        : qualificationRules.generalMember.cumulativeValidConsumptionThreshold;

    const subscriptionThreshold =
      qualificationBasis === "pv"
        ? qualificationRules.activeSubscriptionMember.cumulativeValidPVThreshold
        : qualificationRules.activeSubscriptionMember.cumulativeValidConsumptionThreshold;

    const generalPath = evaluateQualificationPath({
      state,
      memberId: input.memberId,
      finalizedAt,
      windowDays: qualificationRules.generalMember.rollingWindowDays,
      basis: qualificationBasis,
      threshold: generalThreshold,
      remaining,
      activeSubscriptionRequired: false,
      activeSubscriptionSatisfied: true,
    });

    const subscriptionPath = evaluateQualificationPath({
      state,
      memberId: input.memberId,
      finalizedAt,
      windowDays: qualificationRules.activeSubscriptionMember.rollingWindowDays,
      basis: qualificationBasis,
      threshold: subscriptionThreshold,
      remaining,
      activeSubscriptionRequired: true,
      activeSubscriptionSatisfied: consumption.activeSubscriptionAtCompletion,
    });
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
      const accounting = allocateAvailableConsumption({
        selectedPaths,
        remaining,
        basis: qualificationBasis,
        mode: qualificationRules.excessConsumptionMode,
      });
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
        qualificationBasis,
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

export function buildMemberReferralQualificationProgress(input: {
  state: MembershipCommerceState;
  rulesVersion: RulesVersion;
  memberId: string;
  now?: Date;
}): MemberReferralQualificationProgress {
  const now = input.now ?? new Date();

  const qualificationRules =
    input.rulesVersion.rules.referral.payoutQualification;

  const basis =
    qualificationBasisFromRules(qualificationRules);

  const remaining =
    remainingConsumptionByEvent(
      input.state,
      basis,
    );

  const activeSubscriptionNow =
    hasActiveSubscription(
      input.state,
      input.memberId,
    );

  const generalThreshold =
    basis === "pv"
      ? qualificationRules.generalMember
          .cumulativeValidPVThreshold
      : qualificationRules.generalMember
          .cumulativeValidConsumptionThreshold;

  const subscriptionThreshold =
    basis === "pv"
      ? qualificationRules.activeSubscriptionMember
          .cumulativeValidPVThreshold
      : qualificationRules.activeSubscriptionMember
          .cumulativeValidConsumptionThreshold;

  const generalEvaluation =
    evaluateQualificationPath({
      state: input.state,
      memberId: input.memberId,
      finalizedAt: now,
      windowDays:
        qualificationRules.generalMember
          .rollingWindowDays,
      basis,
      threshold: generalThreshold,
      remaining,
      activeSubscriptionRequired: false,
      activeSubscriptionSatisfied: true,
    });

  const subscriptionEvaluation =
    evaluateQualificationPath({
      state: input.state,
      memberId: input.memberId,
      finalizedAt: now,
      windowDays:
        qualificationRules.activeSubscriptionMember
          .rollingWindowDays,
      basis,
      threshold: subscriptionThreshold,
      remaining,
      activeSubscriptionRequired: true,
      activeSubscriptionSatisfied:
        activeSubscriptionNow,
    });

  const evidenceFor = (
    evaluation: QualificationPathEvaluation,
  ): MemberReferralQualificationEvidence[] =>
    evaluation.eligibleEventIds
      .map((eventId) => {
        const event =
          input.state.validConsumptionEvents[
            eventId
          ];

        if (!event) return null;

        return {
          eventId,
          orderNumber: event.sourceOrderId,
          finalizedAt: event.finalizedAt,
          amount:
            qualificationBasisValue(
              event,
              basis,
            ),
          remainingAmount:
            remaining.get(eventId) ?? 0,
          activeSubscriptionAtCompletion:
            event.activeSubscriptionAtCompletion,
        };
      })
      .filter(
        (
          item,
        ): item is MemberReferralQualificationEvidence =>
          Boolean(item),
      );

  const pathView = (
    path: "general" | "subscription",
    evaluation: QualificationPathEvaluation,
  ): MemberReferralQualificationPath => ({
    path,
    windowDays: evaluation.windowDays,
    windowStartedAt:
      evaluation.windowStartedAt,
    windowEndedAt:
      evaluation.windowEndedAt,
    threshold: evaluation.threshold,
    cumulativeAmount:
      evaluation.cumulativeAmount,
    remainingToThreshold: Math.max(
      0,
      evaluation.threshold -
        evaluation.cumulativeAmount,
    ),
    progressPercent:
      evaluation.threshold <= 0
        ? 100
        : Math.max(
            0,
            Math.min(
              100,
              (
                evaluation.cumulativeAmount /
                evaluation.threshold
              ) * 100,
            ),
          ),
    activeSubscriptionRequired:
      evaluation.activeSubscriptionRequired,
    activeSubscriptionSatisfied:
      evaluation.activeSubscriptionSatisfied,
    passed: evaluation.passed,
    evidence: evidenceFor(evaluation),
  });

  const progressConditionsPassed =
    qualificationRules.mode === "general"
      ? generalEvaluation.passed
      : qualificationRules.mode ===
          "subscription"
        ? subscriptionEvaluation.passed
        : qualificationRules.mode ===
            "either"
          ? generalEvaluation.passed ||
            subscriptionEvaluation.passed
          : generalEvaluation.passed &&
            subscriptionEvaluation.passed;

  const activeCoverage =
    Object.values(
      input.state.qualificationRounds,
    )
      .filter((round) => {
        if (
          round.memberId !== input.memberId
        ) {
          return false;
        }

        const interval =
          qualificationCoverageInterval(
            round,
          );

        return (
          now.getTime() >=
            interval.startsAtMs &&
          now.getTime() <=
            interval.endsAtMs
        );
      })
      .sort(
        (left, right) =>
          Date.parse(right.qualifiedAt) -
            Date.parse(left.qualifiedAt) ||
          right.roundId.localeCompare(
            left.roundId,
          ),
      )
      .map((round) => {
        const interval =
          qualificationCoverageInterval(
            round,
          );

        const roundBasis =
          qualificationBasisFromRound(
            round,
          );

        let cumulativeAllocatedAmount = 0;

        const sourceEvidence =
          round.consumptionAccounting.allocations
            .map((allocation) => {
              const event =
                input.state.validConsumptionEvents[
                  allocation.validConsumptionEventId
                ];

              if (!event) {
                return null;
              }

              cumulativeAllocatedAmount +=
                allocation.amount;

              return {
                eventId: event.eventId,
                orderNumber:
                  event.sourceOrderId,
                finalizedAt:
                  event.finalizedAt,
                eventAmount:
                  qualificationBasisValue(
                    event,
                    roundBasis,
                  ),
                allocatedAmount:
                  allocation.amount,
                cumulativeAllocatedAmount,
                triggeredQualification:
                  event.eventId ===
                  round.triggeringValidConsumptionEventId,
                activeSubscriptionAtCompletion:
                  event.activeSubscriptionAtCompletion,
              };
            })
            .filter(
              (
                item,
              ): item is MemberReferralQualificationCoverageEvidence =>
                Boolean(item),
            );

        return {
          roundId: round.roundId,
          qualifiedAt: round.qualifiedAt,
          coverageStartsAt:
            interval.startsAt,
          coverageEndsAt:
            interval.endsAt,
          selectedPaths: [
            ...round.selectedAccountingPaths,
          ],
          rulesVersion:
            round.rulesVersion,
          qualificationBasis:
            roundBasis,
          consumedAmount:
            round.consumptionAccounting
              .consumedAmount,
          availableAmountBefore:
            round.consumptionAccounting
              .availableAmountBefore,
          remainingAmountAfter:
            round.consumptionAccounting
              .remainingAmountAfter,
          sourceEvidence,
        };
      })[0] ?? null;

  const isQualifiedNow =
    activeCoverage !== null;

  return {
    mode: qualificationRules.mode,
    qualificationBasis: basis,
    pointDisplayName:
      input.rulesVersion.rules.referral
        .pointDisplayName || "KD點",
    activeSubscriptionNow,
    isQualifiedNow,
    progressConditionsPassed,
    status: isQualifiedNow
      ? "qualified"
      : progressConditionsPassed
        ? "ready_on_next_completion"
        : "in_progress",
    activeCoverage,
    general: pathView(
      "general",
      generalEvaluation,
    ),
    subscription: pathView(
      "subscription",
      subscriptionEvaluation,
    ),
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

function appendDueReferralRewardMaturations(
  state: MembershipCommerceState,
  now: Date,
  ruleVersions: RulesVersion[],
) {
  const matured: ReferralRewardMaturation[] = [];
  for (const coverage of Object.values(state.referralRewardCoverages).sort((left, right) => left.coverageId.localeCompare(right.coverageId))) {
    if (Object.values(state.referralRewardMaturations).some((item) => item.referralRewardId === coverage.referralRewardId || item.coverageId === coverage.coverageId)) continue;
    const reward = state.referralRewards[coverage.referralRewardId];
    const round = state.qualificationRounds[coverage.qualificationRoundId];
    if (!reward || !round || referralRewardQualificationAuthority(reward) !== "qualification_coverage") continue;
    if (projectReturnRewardHolds(state, { program: "referral", id: reward.rewardId }).blocked
      || projectPendingReturnRewardEntitlement(state, { program: "referral", id: reward.rewardId }).cancelledBeforeRelease) continue;
    const safety = historicalRoundSafetySnapshot(round, ruleVersions);
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
}

/** Appends due maturation facts only; payout, caps, credit, reward state, and notifications are untouched. */
export async function processReferralRewardMaturations(input: { now?: Date; stateFilePath?: string; rulesFilePath?: string } = {}) {
  const rulesStore = await readMembershipRulesStore(input.rulesFilePath);
  return transaction(
    (state, now) => appendDueReferralRewardMaturations(state, now, rulesStore.versions),
    { now: input.now, filePath: input.stateFilePath },
  );
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
  const basis = await persistedOrderRewardBasis(input.orderId);
  if (!currentRewardsAllowed(basis) || (input.orderType === "subscription" && basis?.hasStore)) return [];
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
  state.creditEntries[reversalId] = { creditEntryId: reversalId, memberId: reward.beneficiaryMemberId, sourceType: reward.rewardType === "self_purchase" ? "member_reward" : "referral", sourceReference: `referral_reward_reversal:${reward.rewardId}`, amount: -reward.calculatedCreditAmount, remainingAmount: 0, issuedAt: nowIso(now), expiresAt: nowIso(now), status: "consumed", createdAt: nowIso(now), metadata: { rewardId: reward.rewardId, reversalAmount: reward.calculatedCreditAmount, reversesCreditEntryId: reward.rewardCreditEntryId ?? "", reason: "qualification_order_failed" } };
  reward.status = "reversed";
  reward.reversedAt = nowIso(now);
  reward.reversalCreditEntryId = reversalId;
}

/** Applies trusted outcomes to qualification attempts; source reward cancellation remains a separate flow. */
export async function handleReferralQualificationOrderOutcome(input: { memberId: string; orderId: string; outcome: "completed" | "cancelled" | "uncollected" | "refunded" | "returned"; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  if (input.outcome === "completed" && !currentRewardsAllowed(await persistedOrderRewardBasis(input.orderId))) return [];
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
export async function createReferralRewardsFromFulfillment(input: { sourceMemberId: string; orderId: string; rewardType: "new_referral" | "repeat_purchase" | "subscription"; paidAmountBasis: number; basePV?: number; discountRatio?: number; effectivePV?: number; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const basis = await persistedOrderRewardBasis(input.orderId);
  if (!currentRewardsAllowed(basis) || (input.rewardType === "subscription" && basis?.hasStore)) return [];
  input = isolatePaidRewardInput(input, basis);
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
    const successfulPickupBusinessDate = getDateOnlyInTimeZone(now);
    const releaseEligibleBusinessDate = referralReleaseEligibleBusinessDate(
      successfulPickupBusinessDate,
      baseWaitingDaysSnapshot,
      returnProtectionDaysSnapshot,
    );
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
      const rewardRate = input.rewardType === "new_referral" ? levelRule.newReferralRewardRate : input.rewardType === "repeat_purchase" ? levelRule.repeatPurchaseRewardRate : levelRule.subscriptionRewardRate;
      const rewardPV = rules.referralRewardCalculationMode === "pv" ? effectivePV * rewardRate / 100 : 0;
      const rawCredit = rules.referralRewardCalculationMode === "pv" ? rewardPV * rules.pvRewardMoneyValue : paidAmountBasis * rewardRate / 100;
      const calculatedCreditAmount = Math.max(0, Math.min(rewardRound(rawCredit, version.rules.money.roundingMode), totalCap - allocated));
      if (calculatedCreditAmount < 1) continue;
      allocated += calculatedCreditAmount;
      const rewardId = deterministicId("reward", `${input.orderId}:${input.rewardType}:${level}:${beneficiaryMemberId}`);
      const reward: ReferralReward = { rewardId, sourceOrderNumber: input.orderId, sourceMemberId: input.sourceMemberId, beneficiaryMemberId, referralLevel: level, rewardType: input.rewardType, calculationMode: rules.referralRewardCalculationMode, paidAmountBasis, basePV, discountRatio, effectivePV, rewardRate, rewardPV, pvRewardMoneyValue: rules.pvRewardMoneyValue, calculatedCreditAmount, projectedCreditAmount: calculatedCreditAmount, ruleVersion: version.rulesVersion, ancestrySnapshot: [...ancestry], organizationCapPercentSnapshot: rules.referralTotalRewardCap, organizationCapAmountSnapshot: totalCap, monthlyCapAmountSnapshot: rules.referralMonthlyCreditCap, monthlyCapPeriodSnapshot, monthlyCapUsageAtRelease: null, monthlyCapLimitedAmount: null, reversalPolicySnapshot: rules.reversalPolicy, baseWaitingDaysSnapshot, returnProtectionDaysSnapshot, totalWaitingDaysSnapshot, releasePolicyVersion: "taipei-business-date-v1", successfulPickupBusinessDate, releaseEligibleBusinessDate, sourceOrderFinalState: "completed", cancellationReason: null, qualificationWindowDays, qualificationStartedAt, qualificationExpiresAt: qualificationExpiry, qualificationStatus: "awaiting_order", qualificationOrderNumber: null, qualificationOrderCreatedAt: null, qualificationOrderFinalState: null, qualificationQualifiedAt: null, qualificationAttempts: [], qualificationAuthority: "qualification_coverage", createdAt: nowIso(now), eligibleAt: nowIso(now), scheduledReleaseAt: `${releaseEligibleBusinessDate}T00:00:00+08:00`, releasedAt: null, status: "scheduled", reversalCreditEntryId: null, rewardCreditEntryId: null, idempotencyKey: `${input.idempotencyKey}:${level}` };
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

/** Creates a member's own completed-order reward after the caller applies the configured eligibility start mode. */
export async function createSelfPurchaseRewardFromFulfillment(input: { sourceMemberId: string; orderId: string; paidAmountBasis: number; basePV?: number; discountRatio?: number; effectivePV?: number; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const basis = await persistedOrderRewardBasis(input.orderId);
  if (!currentRewardsAllowed(basis)) return [];
  input = isolatePaidRewardInput(input, basis);
  const key = `self-purchase-reward:create:${input.idempotencyKey}`;
  return transaction((state, now) => {
    if (remembered(state, key)) return Object.values(state.referralRewards).filter((item) => item.sourceOrderNumber === input.orderId && item.rewardType === "self_purchase");
    const rules = version.rules.referral;
    const dynamicTiersEnabled = rules.selfPurchaseRewardTiers.enabled;
    if (!rules.programEnabled || (!dynamicTiersEnabled && rules.selfPurchaseRewardRate <= 0)) { remember(state, key, "none", now); return []; }
    const paidAmountBasis = assertIntegerMoney(input.paidAmountBasis, "會員續購實付商品金額");
    const basePV = Math.max(0, Number(input.basePV ?? 0));
    const discountRatio = Math.max(0, Math.min(1, Number(input.discountRatio ?? 1)));
    const effectivePV = Math.max(0, Number(input.effectivePV ?? basePV * discountRatio));
    if (
      (rules.referralRewardCalculationMode === "pv"
        || (dynamicTiersEnabled && rules.selfPurchaseRewardTiers.thresholdBasis === "pv"))
      && !Number.isFinite(effectivePV)
    ) throw new MembershipCommerceError("訂單有效 PV 不完整");
    const selfPurchaseTierSnapshot = dynamicTiersEnabled
      ? createSelfPurchaseTierSnapshot({
          state,
          sourceMemberId: input.sourceMemberId,
          orderId: input.orderId,
          paidAmountBasis,
          effectivePV,
          completedAt: now,
          tierRules: rules.selfPurchaseRewardTiers,
          calculationMode: rules.referralRewardCalculationMode,
          pvRewardMoneyValue: rules.pvRewardMoneyValue,
          moneyRoundingMode: version.rules.money.roundingMode,
        })
      : undefined;
    const tierPayout = selfPurchaseTierSnapshot
      ? selfPurchaseTierPayout({
          result: selfPurchaseTierSnapshot.initialResult,
          paidAmountBasis,
          effectivePV,
          snapshot: selfPurchaseTierSnapshot,
        })
      : null;
    const rewardRate = tierPayout?.rewardRate ?? rules.selfPurchaseRewardRate;
    const rewardPV = tierPayout?.rewardPV
      ?? (rules.referralRewardCalculationMode === "pv" ? effectivePV * rewardRate / 100 : 0);
    const rawCredit = rules.referralRewardCalculationMode === "pv"
      ? rewardPV * rules.pvRewardMoneyValue
      : paidAmountBasis * rewardRate / 100;
    const calculatedCreditAmount = tierPayout?.calculatedCreditAmount
      ?? Math.max(0, rewardRound(rawCredit, version.rules.money.roundingMode));
    if (calculatedCreditAmount < 1) { remember(state, key, "none", now); return []; }
    const qualificationWindowDays = rules.referralRewardQualificationWindowDays;
    const qualificationStartedAt = nowIso(now);
    const qualificationExpiry = qualificationExpiresAt(now, qualificationWindowDays);
    const baseWaitingDaysSnapshot = rules.referralRewardBaseWaitingDays;
    const returnProtectionDaysSnapshot = rules.referralRewardReturnProtectionDays;
    const totalWaitingDaysSnapshot = baseWaitingDaysSnapshot + returnProtectionDaysSnapshot;
    const requiresReferralQualification =
      rules.selfPurchaseRequiresReferralQualification;
    const successfulPickupBusinessDate =
      requiresReferralQualification
        ? null
        : getDateOnlyInTimeZone(now);
    const releaseEligibleBusinessDate =
      successfulPickupBusinessDate
        ? referralReleaseEligibleBusinessDate(
            successfulPickupBusinessDate,
            baseWaitingDaysSnapshot,
            returnProtectionDaysSnapshot,
          )
        : null;
    const rewardId = deterministicId("reward", `${input.orderId}:self_purchase:0:${input.sourceMemberId}`);
    const reward: ReferralReward = { rewardId, sourceOrderNumber: input.orderId, sourceMemberId: input.sourceMemberId, beneficiaryMemberId: input.sourceMemberId, referralLevel: 0, rewardType: "self_purchase", calculationMode: rules.referralRewardCalculationMode, paidAmountBasis, basePV, discountRatio, effectivePV, rewardRate, rewardPV, pvRewardMoneyValue: rules.pvRewardMoneyValue, calculatedCreditAmount, projectedCreditAmount: calculatedCreditAmount, selfPurchaseTierSnapshot, ruleVersion: version.rulesVersion, ancestrySnapshot: [], organizationCapPercentSnapshot: 0, organizationCapAmountSnapshot: 0, monthlyCapAmountSnapshot: 0, monthlyCapPeriodSnapshot: nowIso(now).slice(0, 7), monthlyCapUsageAtRelease: null, monthlyCapLimitedAmount: null, reversalPolicySnapshot: rules.reversalPolicy, baseWaitingDaysSnapshot, returnProtectionDaysSnapshot, totalWaitingDaysSnapshot, releasePolicyVersion: "taipei-business-date-v1", successfulPickupBusinessDate, releaseEligibleBusinessDate, sourceOrderFinalState: "completed", cancellationReason: null, qualificationWindowDays: requiresReferralQualification ? qualificationWindowDays : undefined, qualificationStartedAt: requiresReferralQualification ? qualificationStartedAt : undefined, qualificationExpiresAt: requiresReferralQualification ? qualificationExpiry : undefined, qualificationStatus: requiresReferralQualification ? "awaiting_order" : "qualified", qualificationOrderNumber: null, qualificationOrderCreatedAt: null, qualificationOrderFinalState: null, qualificationQualifiedAt: requiresReferralQualification ? null : nowIso(now), qualificationAttempts: [], qualificationAuthority: requiresReferralQualification ? "qualification_coverage" : "self_purchase_direct", createdAt: nowIso(now), eligibleAt: nowIso(now), scheduledReleaseAt: releaseEligibleBusinessDate ? `${releaseEligibleBusinessDate}T00:00:00+08:00` : "", releasedAt: null, status: "scheduled", reversalCreditEntryId: null, rewardCreditEntryId: null, idempotencyKey: input.idempotencyKey };
    state.referralRewards[rewardId] = reward;
    if (requiresReferralQualification) {
      coverRewardFromEarliestQualificationRound(
        state,
        reward,
        now,
      );
    }
    const source = event(state, "referral_reward_scheduled", { amount: calculatedCreditAmount, level: 0, rewardType: "self_purchase" }, now, { memberId: input.sourceMemberId, orderId: input.orderId });
    notify(state, version.rules, "referral_conversion", source.eventId, now, { memberId: input.sourceMemberId, safeData: { rewardAmount: calculatedCreditAmount, rewardType: "self_purchase" } });
    remember(state, key, rewardId, now);
    return [reward];
  }, { now: input.now, filePath: input.stateFilePath });
}

/** Creates one direct, guest-only retail promotion reward from an order snapshot. */
export async function createRetailPromotionRewardFromFulfillment(input: {
  orderId: string;
  attribution: RetailPromotionOrderSnapshot;
  eligibleMerchandiseAmount: number;
  idempotencyKey: string;
  now?: Date;
  stateFilePath?: string;
}) {
  const basis = await persistedOrderRewardBasis(input.orderId);
  if (!currentRewardsAllowed(basis)) return null;
  if (basis?.hasStore) input = { ...input, eligibleMerchandiseAmount: basis.rewardMerchandiseAmount!,
    attribution: { ...input.attribution, calculationBaseValue: input.attribution.calculationBasis === "pv"
      ? basis.totalEffectivePV : basis.rewardMerchandiseAmount! } };
  if (referralCodeForMember(input.attribution.referrerMemberId) !== input.attribution.referralCode) {
    throw new MembershipCommerceError("推廣零售訂單快照與分享會員不一致");
  }
  const key = `retail-promotion-reward:create:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const existingId = remembered(state, key);
    if (existingId) return existingId === "none" ? null : state.retailPromotionRewards[existingId] ?? null;
    const attribution = input.attribution;
    if (attribution.version !== 1 || attribution.source !== "member-share-link" || !Number.isSafeInteger(attribution.ruleVersionId) || attribution.rewardRate < 0 || attribution.rewardRate > 100) throw new MembershipCommerceError("推廣零售訂單快照不完整");
    const eligibleMerchandiseAmount = assertIntegerMoney(input.eligibleMerchandiseAmount, "推廣零售有效業績");
    const calculationBasis: RewardCalculationBasis = attribution.calculationBasis === "pv" ? "pv" : "paid_amount";
    const calculationBaseValue = attribution.calculationBaseValue === undefined && calculationBasis === "paid_amount"
      ? eligibleMerchandiseAmount
      : Number(attribution.calculationBaseValue);
    if (!Number.isFinite(calculationBaseValue) || calculationBaseValue < 0) throw new MembershipCommerceError("推廣零售訂單計算基礎快照不完整");
    const pvRewardMoneyValue = Number(attribution.pvRewardMoneyValue ?? 0);
    if (!Number.isFinite(pvRewardMoneyValue) || pvRewardMoneyValue < 0 || (calculationBasis === "pv" && attribution.pvRewardMoneyValue === undefined)) throw new MembershipCommerceError("推廣零售 PV 換算快照不完整");
    const payout = percentageRewardPayout({ calculationBasis, calculationBaseValue, rewardRate: attribution.rewardRate, pvRewardMoneyValue, roundingMode: attribution.roundingMode });
    const { rewardPV, calculatedCreditAmount } = payout;
    if (calculatedCreditAmount < 1) {
      remember(state, key, "none", now);
      return null;
    }
    const successfulPickupBusinessDate = getDateOnlyInTimeZone(now);
    const releaseEligibleBusinessDate = referralReleaseEligibleBusinessDate(successfulPickupBusinessDate, attribution.baseWaitingDays, attribution.returnProtectionDays);
    const rewardId = deterministicId("retail_reward", `${input.orderId}:${attribution.referrerMemberId}`);
    const reward: RetailPromotionReward = {
      rewardId,
      sourceOrderNumber: input.orderId,
      beneficiaryMemberId: attribution.referrerMemberId,
      referralCode: attribution.referralCode,
      attributedAt: attribution.attributedAt,
      attributionExpiresAt: attribution.expiresAt,
      attributionSource: attribution.source,
      eligibleMerchandiseAmount,
      calculationBasis,
      calculationBaseValue,
      rewardRate: attribution.rewardRate,
      rewardPV,
      pvRewardMoneyValue,
      calculatedCreditAmount,
      ruleVersion: attribution.ruleVersionId,
      roundingModeSnapshot: attribution.roundingMode,
      baseWaitingDaysSnapshot: attribution.baseWaitingDays,
      returnProtectionDaysSnapshot: attribution.returnProtectionDays,
      totalWaitingDaysSnapshot: attribution.baseWaitingDays + attribution.returnProtectionDays,
      reversalPolicySnapshot: attribution.reversalPolicy,
      successfulCompletionAt: nowIso(now),
      successfulPickupBusinessDate,
      releaseEligibleBusinessDate,
      createdAt: nowIso(now),
      releasedAt: null,
      reversedAt: null,
      sourceOrderFinalState: "completed",
      status: "scheduled",
      cancellationReason: null,
      rewardCreditEntryId: null,
      reversalCreditEntryId: null,
      idempotencyKey: input.idempotencyKey,
    };
    state.retailPromotionRewards[rewardId] = reward;
    event(state, "retail_promotion_reward_scheduled", { rewardId, eligibleMerchandiseAmount, calculationBasis, calculationBaseValue, rewardRate: attribution.rewardRate, rewardPV, rewardAmount: calculatedCreditAmount }, now, { memberId: attribution.referrerMemberId, orderId: input.orderId });
    remember(state, key, rewardId, now);
    return reward;
  }, { now: input.now, filePath: input.stateFilePath });
}

/**
 * New-model rewards may only be paid from the immutable Coverage → Maturation
 * chain.  The legacy qualification-order fields intentionally do not
 * participate in this path.
 */
function qualificationCoverageProjectionEvidence(state: MembershipCommerceState, reward: ReferralReward) {
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
  const safety = round.rewardSafetyRuleSnapshot;
  if (!safety || !Number.isSafeInteger(safety.baseWaitingDays) || safety.baseWaitingDays < 0 || !Number.isSafeInteger(safety.returnProtectionDays) || safety.returnProtectionDays < 0) return null;
  const expectedMaturesAt = Date.parse(round.qualifiedAt) + (safety.baseWaitingDays + safety.returnProtectionDays) * QUALIFICATION_DAY_MS;
  if (!Number.isFinite(expectedMaturesAt)) return null;
  const maturation = Object.values(state.referralRewardMaturations).find((item) => item.referralRewardId === reward.rewardId) ?? null;
  if (maturation) {
    if (maturation.memberId !== reward.beneficiaryMemberId || maturation.coverageId !== coverage.coverageId || maturation.qualificationRoundId !== round.roundId || maturation.qualificationAt !== round.qualifiedAt || maturation.rulesVersion !== round.rulesVersion) return null;
    if (maturation.baseWaitingDays !== safety.baseWaitingDays || maturation.returnProtectionDays !== safety.returnProtectionDays) return null;
    if (Date.parse(maturation.maturesAt) !== expectedMaturesAt || Date.parse(maturation.maturedAt) < expectedMaturesAt) return null;
  }
  return { coverage, round, maturation, expectedMaturesAt };
}

function validRewardReleaseBusinessDate(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null;
}

function referralRewardSourceSafetyBusinessDate(reward: ReferralReward) {
  const persisted = validRewardReleaseBusinessDate(
    reward.releaseEligibleBusinessDate ?? reward.scheduledReleaseAt?.slice(0, 10) ?? null,
  );
  if (persisted) return persisted;
  if (referralRewardQualificationAuthority(reward) !== "qualification_coverage") return null;
  if (!Number.isSafeInteger(reward.baseWaitingDaysSnapshot) || reward.baseWaitingDaysSnapshot! < 0) return null;
  if (!Number.isSafeInteger(reward.returnProtectionDaysSnapshot) || reward.returnProtectionDaysSnapshot! < 0) return null;

  const sourceBusinessDate = validRewardReleaseBusinessDate(reward.successfulPickupBusinessDate)
    ?? (Number.isFinite(Date.parse(reward.createdAt))
      ? getDateOnlyInTimeZone(new Date(reward.createdAt))
      : null);
  if (!sourceBusinessDate) return null;

  return referralReleaseEligibleBusinessDate(
    sourceBusinessDate,
    reward.baseWaitingDaysSnapshot!,
    reward.returnProtectionDaysSnapshot!,
  );
}

/**
 * Canonical qualification-coverage payout date: both immutable gates must be due.
 * The source-order safety date uses the reward snapshot captured at fulfillment;
 * the qualification maturation date uses the covered Qualification Round snapshot.
 * The later Taipei business date wins, and current Admin rules are never consulted.
 */
function referralRewardProjectedReleaseBusinessDate(state: MembershipCommerceState, reward: ReferralReward) {
  const sourceSafetyDate = referralRewardSourceSafetyBusinessDate(reward);
  if (referralRewardQualificationAuthority(reward) !== "qualification_coverage") return sourceSafetyDate;

  const qualificationEvidence = qualificationCoverageProjectionEvidence(state, reward);
  const qualificationMaturationDate = qualificationEvidence
    ? getDateOnlyInTimeZone(new Date(qualificationEvidence.expectedMaturesAt))
    : null;

  if (sourceSafetyDate && qualificationMaturationDate) {
    return sourceSafetyDate >= qualificationMaturationDate
      ? sourceSafetyDate
      : qualificationMaturationDate;
  }
  return sourceSafetyDate ?? qualificationMaturationDate;
}

function validQualificationCoverageMaturation(state: MembershipCommerceState, reward: ReferralReward) {
  const evidence = qualificationCoverageProjectionEvidence(state, reward);
  if (!evidence?.maturation) return null;
  return { coverage: evidence.coverage, round: evidence.round, maturation: evidence.maturation };
}

export async function runReferralRewardReleaseScheduler(input: { now?: Date; stateFilePath?: string; rulesFilePath?: string } = {}) {
  const [version, rulesStore] = await Promise.all([
    getActiveMembershipRules(input.now, input.rulesFilePath),
    readMembershipRulesStore(input.rulesFilePath),
  ]);
  return transaction(async (state, now) => {
    await primePendingReturnSafety(state);
    appendDueReferralRewardMaturations(state, now, rulesStore.versions);
    const results: Array<{ rewardId: string; status: "released" | "failed" | "expired" | "cap_blocked" | "held" | "safety_wait" | "return_cancelled";
      error?: string; holdDependencyIds?: string[]; activeHoldDependencyCount?: number; resolutionRequiredDependencyCount?: number }> = [];
    const held = new Set<string>();
    for (const [program, rewards] of [["referral", state.referralRewards], ["retail_promotion", state.retailPromotionRewards]] as const) {
      for (const reward of Object.values(rewards).filter(item => item.status === "scheduled").sort((left, right) => left.rewardId.localeCompare(right.rewardId))) {
        const hold = projectReturnRewardHolds(state, { program, id: reward.rewardId });
        const safetyReview = pendingRewardSafetyReview(state, { program, id: reward.rewardId });
        if (safetyReview) { held.add(JSON.stringify([program, reward.rewardId])); results.push({ rewardId: reward.rewardId, status: "failed", error: safetyReview }); continue; }
        const entitlement = projectPendingReturnRewardEntitlement(state, { program, id: reward.rewardId });
        const deadline = pendingRewardSafetyDeadline(state, { program, id: reward.rewardId });
        if (!hold.blocked && !entitlement.cancelledBeforeRelease && (!deadline || now.getTime() > Date.parse(deadline))) continue;
        held.add(JSON.stringify([program, reward.rewardId]));
        // Preserve the scheduler's existing quiet behavior before its original due
        // date. Report the new safety gate only when it actually defers a due payout.
        if (!hold.blocked && !entitlement.cancelledBeforeRelease) {
          const dueDate = program === "referral" ? referralRewardProjectedReleaseBusinessDate(state, reward as ReferralReward)
            : (reward as RetailPromotionReward).releaseEligibleBusinessDate;
          if (!dueDate || !isReferralReleaseBusinessDateDue(getDateOnlyInTimeZone(now), dueDate)) continue;
        }
        results.push({ rewardId: reward.rewardId, status: hold.blocked ? "held" : entitlement.cancelledBeforeRelease ? "return_cancelled" : "safety_wait",
          holdDependencyIds: hold.dependencies.filter(item => item.state !== "resolved").map(item => item.holdDependencyId),
          activeHoldDependencyCount: hold.activeHoldDependencyCount, resolutionRequiredDependencyCount: hold.resolutionRequiredDependencyCount });
      }
    }
    const referralHeld = (reward: ReferralReward) => held.has(JSON.stringify(["referral", reward.rewardId]));
    const today = getDateOnlyInTimeZone(now);
    for (const reward of Object.values(state.referralRewards).filter((item) => !referralHeld(item) && referralRewardQualificationAuthority(item) === "legacy_order" && item.status === "scheduled" && item.qualificationStatus === "awaiting_order" && typeof item.qualificationExpiresAt === "string" && Date.parse(item.qualificationExpiresAt) < now.getTime())) {
      reward.qualificationStatus = "expired";
      const source = event(state, "referral_qualification_expired", { rewardId: reward.rewardId, amount: reward.calculatedCreditAmount }, now, { memberId: reward.beneficiaryMemberId, orderId: reward.sourceOrderNumber });
      notify(state, version.rules, "referral_conversion", source.eventId, now, { memberId: reward.beneficiaryMemberId, safeData: { rewardAmount: reward.calculatedCreditAmount, qualificationStatus: "expired" } });
      results.push({ rewardId: reward.rewardId, status: "expired" });
    }
    const dueRewards = Object.values(state.referralRewards).filter((item) => {
      const authority =
        referralRewardQualificationAuthority(item);

      if (item.status !== "scheduled" || referralHeld(item)) return false;

      if (authority === "qualification_coverage") {
        return false;
      }

      if (
        authority === "self_purchase_direct"
        && item.rewardType !== "self_purchase"
      ) {
        return false;
      }

      if (
        authority === "legacy_order"
        && hasQualificationSnapshot(item)
        && item.qualificationStatus !== "qualified"
      ) {
        return false;
      }

      const eligibleDate =
        item.releaseEligibleBusinessDate
        ?? item.scheduledReleaseAt?.slice(0, 10);

      return Boolean(
        eligibleDate
        && isReferralReleaseBusinessDateDue(
          today,
          eligibleDate,
        ),
      );
    }).sort((a, b) => (a.releaseEligibleBusinessDate ?? a.scheduledReleaseAt).localeCompare(b.releaseEligibleBusinessDate ?? b.scheduledReleaseAt) || a.createdAt.localeCompare(b.createdAt) || a.rewardId.localeCompare(b.rewardId));
    for (const reward of dueRewards) {
      try {
        const authority =
          referralRewardQualificationAuthority(reward);

        if (
          authority === "legacy_order"
          && !hasQualificationSnapshot(reward)
          && !projectPendingReturnRewardEntitlement(state, { program: "referral", id: reward.rewardId }).resolutions
            .some(item => item.calculation.originalEligibility === true || item.originalQualification.qualificationOrders.length > 0)
          && version.rules.referral.referrerEligibility.mode === "active-subscription"
          && !hasActiveSubscription(
            state,
            reward.beneficiaryMemberId,
          )
        ) throw new MembershipCommerceError("舊版推薦 reward：推薦人目前沒有啟用中的定期購");

        if (
          reward.sourceOrderFinalState
          && reward.sourceOrderFinalState !== "completed"
        ) throw new MembershipCommerceError("來源交易最新狀態不允許發放");

        if (
          authority === "legacy_order"
          && reward.qualificationOrderFinalState
          && reward.qualificationOrderFinalState !== "completed"
        ) throw new MembershipCommerceError("資格交易最新狀態不允許發放");
        const cap = reward.monthlyCapAmountSnapshot ?? version.rules.referral.referralMonthlyCreditCap;
        const capPeriod = reward.monthlyCapPeriodSnapshot ?? reward.createdAt.slice(0, 7);
        const monthUsed = reward.rewardType === "self_purchase" ? 0 : Object.values(state.referralRewards).filter((item) => item.rewardId !== reward.rewardId && item.rewardType !== "self_purchase" && item.beneficiaryMemberId === reward.beneficiaryMemberId && item.status === "released" && (item.monthlyCapPeriodSnapshot ?? item.createdAt.slice(0, 7)) === capPeriod).reduce((sum, item) => sum + item.calculatedCreditAmount, 0);
        const projectedAmount = projectPendingReturnRewardEntitlement(state, { program: "referral", id: reward.rewardId }).remainingEffectivePendingRewardAmount;
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
        const credit = issueCreditInState(state, version.rules, { memberId: reward.beneficiaryMemberId, sourceType: reward.rewardType === "self_purchase" ? "member_reward" : "referral", sourceReference: `referral_reward:${reward.rewardId}`, amount: releaseAmount, metadata: { rewardId: reward.rewardId, orderId: reward.sourceOrderNumber, referralLevel: reward.referralLevel, monthlyCapPeriod: capPeriod, monthlyCapUsageBeforeRelease: monthUsed, monthlyCapLimitedAmount: reward.monthlyCapLimitedAmount } }, now);
        reward.status = "released"; reward.releasedAt = nowIso(now); reward.rewardCreditEntryId = credit.creditEntryId;
        const source = event(state, "referral_reward_released", { amount: credit.amount, level: reward.referralLevel }, now, { memberId: reward.beneficiaryMemberId, orderId: reward.sourceOrderNumber });
        notify(state, version.rules, "credit_issued", source.eventId, now, { memberId: reward.beneficiaryMemberId, safeData: { amount: credit.amount } });
        results.push({ rewardId: reward.rewardId, status: "released" });
      } catch (error) { results.push({ rewardId: reward.rewardId, status: "failed", error: error instanceof Error ? error.message : "發放失敗" }); }
    }
    const maturedCoverageRewards = Object.values(state.referralRewards).filter((item) => {
      if (item.status !== "scheduled" || referralHeld(item)) return false;
      const evidence = validQualificationCoverageMaturation(state, item);
      const projectedReleaseDate = referralRewardProjectedReleaseBusinessDate(state, item);
      return Boolean(
        evidence
        && Date.parse(evidence.maturation.maturedAt) <= now.getTime()
        && projectedReleaseDate
        && isReferralReleaseBusinessDateDue(today, projectedReleaseDate)
      );
    }).sort((left, right) => {
      const leftDate = referralRewardProjectedReleaseBusinessDate(state, left) ?? left.createdAt;
      const rightDate = referralRewardProjectedReleaseBusinessDate(state, right) ?? right.createdAt;
      return leftDate.localeCompare(rightDate) || left.createdAt.localeCompare(right.createdAt) || left.rewardId.localeCompare(right.rewardId);
    });
    for (const reward of maturedCoverageRewards) {
      try {
        // Re-read the complete evidence chain inside this transaction before every monetary mutation.
        const evidence = validQualificationCoverageMaturation(state, reward);
        if (!evidence || Date.parse(evidence.maturation.maturedAt) > now.getTime()) throw new MembershipCommerceError("推薦獎勵缺少有效的資格成熟證據");
        if (reward.sourceOrderFinalState && reward.sourceOrderFinalState !== "completed") throw new MembershipCommerceError("來源交易最新狀態不允許發放");
        const cap = reward.monthlyCapAmountSnapshot ?? version.rules.referral.referralMonthlyCreditCap;
        const capPeriod = reward.monthlyCapPeriodSnapshot ?? reward.createdAt.slice(0, 7);
        const monthUsed = reward.rewardType === "self_purchase" ? 0 : Object.values(state.referralRewards).filter((item) => item.rewardId !== reward.rewardId && item.rewardType !== "self_purchase" && item.beneficiaryMemberId === reward.beneficiaryMemberId && item.status === "released" && (item.monthlyCapPeriodSnapshot ?? item.createdAt.slice(0, 7)) === capPeriod).reduce((sum, item) => sum + item.calculatedCreditAmount, 0);
        const projectedAmount = projectPendingReturnRewardEntitlement(state, { program: "referral", id: reward.rewardId }).remainingEffectivePendingRewardAmount;
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
        const credit = issueCreditInState(state, version.rules, { memberId: reward.beneficiaryMemberId, sourceType: reward.rewardType === "self_purchase" ? "member_reward" : "referral", sourceReference: `referral_reward:${reward.rewardId}`, amount: releaseAmount, metadata: { rewardId: reward.rewardId, orderId: reward.sourceOrderNumber, referralLevel: reward.referralLevel, monthlyCapPeriod: capPeriod, monthlyCapUsageBeforeRelease: monthUsed, monthlyCapLimitedAmount: reward.monthlyCapLimitedAmount, qualificationAuthority: "qualification_coverage", qualificationRoundId: evidence.round.roundId, coverageId: evidence.coverage.coverageId, maturationId: evidence.maturation.maturationId } }, now);
        reward.status = "released"; reward.releasedAt = nowIso(now); reward.rewardCreditEntryId = credit.creditEntryId;
        const source = event(state, "referral_reward_released", { amount: credit.amount, level: reward.referralLevel }, now, { memberId: reward.beneficiaryMemberId, orderId: reward.sourceOrderNumber });
        // Durable outbox evidence is committed with the already-final payout; delivery is performed separately after commit.
        notify(state, version.rules, "credit_issued", source.eventId, now, { memberId: reward.beneficiaryMemberId, safeData: { amount: credit.amount, referralPayout: true } });
        results.push({ rewardId: reward.rewardId, status: "released" });
      } catch (error) { results.push({ rewardId: reward.rewardId, status: "failed", error: error instanceof Error ? error.message : "發放失敗" }); }
    }
    const dueRetailPromotionRewards = Object.values(state.retailPromotionRewards)
      .filter((reward) => !held.has(JSON.stringify(["retail_promotion", reward.rewardId])) && reward.status === "scheduled" && reward.sourceOrderFinalState === "completed" && isReferralReleaseBusinessDateDue(today, reward.releaseEligibleBusinessDate))
      .sort((left, right) => left.releaseEligibleBusinessDate.localeCompare(right.releaseEligibleBusinessDate) || left.createdAt.localeCompare(right.createdAt) || left.rewardId.localeCompare(right.rewardId));
    for (const reward of dueRetailPromotionRewards) {
      try {
        const credit = issueCreditInState(state, version.rules, {
          memberId: reward.beneficiaryMemberId,
          sourceType: "promotion",
          sourceReference: `retail_promotion_reward:${reward.rewardId}`,
          amount: projectPendingReturnRewardEntitlement(state, { program: "retail_promotion", id: reward.rewardId }).remainingEffectivePendingRewardAmount,
          metadata: {
            rewardId: reward.rewardId,
            orderId: reward.sourceOrderNumber,
            rewardType: "retail_promotion",
            ruleVersion: reward.ruleVersion,
          },
        }, now);
        reward.status = "released";
        reward.calculatedCreditAmount = credit.amount;
        reward.releasedAt = nowIso(now);
        reward.rewardCreditEntryId = credit.creditEntryId;
        const source = event(state, "retail_promotion_reward_released", { amount: credit.amount, rewardType: "retail_promotion" }, now, { memberId: reward.beneficiaryMemberId, orderId: reward.sourceOrderNumber });
        notify(state, version.rules, "credit_issued", source.eventId, now, { memberId: reward.beneficiaryMemberId, safeData: { amount: credit.amount, retailPromotion: true } });
        results.push({ rewardId: reward.rewardId, status: "released" });
      } catch (error) {
        results.push({ rewardId: reward.rewardId, status: "failed", error: error instanceof Error ? error.message : "推廣零售獎金發放失敗" });
      }
    }
    return results;
  }, { now: input.now, filePath: input.stateFilePath });
}

function refreshScheduledSelfPurchaseTierRewardsForReversedConsumption(
  state: MembershipCommerceState,
  reversedConsumptions: ValidConsumptionEvent[],
  now: Date,
) {
  const reversedEventIds = new Set(
    reversedConsumptions.map((consumption) => consumption.eventId),
  );
  const reversedOrderIds = new Set(
    reversedConsumptions.map((consumption) => consumption.sourceOrderId),
  );
  const reversedMemberIds = new Set(
    reversedConsumptions.map((consumption) => consumption.memberId),
  );
  const changed: ReferralReward[] = [];

  for (const reward of Object.values(state.referralRewards)) {
    const snapshot = reward.selfPurchaseTierSnapshot;
    if (
      reward.rewardType !== "self_purchase"
      || reward.status !== "scheduled"
      || !snapshot
      || snapshot.rules.accumulationBasis !== "rolling_period"
      || reversedOrderIds.has(reward.sourceOrderNumber)
      || !reversedMemberIds.has(reward.beneficiaryMemberId)
      || !snapshot.initialEvidence.some((evidence) =>
        evidence.role === "prior"
        && evidence.validConsumptionEventId !== null
        && reversedEventIds.has(evidence.validConsumptionEventId))
    ) continue;

    const latestEvidence = snapshot.initialEvidence.filter((evidence) => {
      if (evidence.role === "current" || evidence.validConsumptionEventId === null) return true;
      const consumption = state.validConsumptionEvents[evidence.validConsumptionEventId];
      return Boolean(consumption && validForSelfPurchaseTier(consumption));
    });
    const currentEvidence = latestEvidence.find((evidence) => evidence.role === "current");
    if (!currentEvidence) throw new MembershipCommerceError("本人消費動態級距缺少本次訂單證據");
    const latestResult = calculateSelfPurchaseTierReward({
      priorAmount: latestEvidence
        .filter((evidence) => evidence.role === "prior")
        .reduce((sum, evidence) => sum + evidence.thresholdAmount, 0),
      currentAmount: currentEvidence.thresholdAmount,
      calculationMethod: snapshot.rules.calculationMethod,
      tiers: snapshot.rules.tiers,
    });
    const payout = selfPurchaseTierPayout({
      result: latestResult,
      paidAmountBasis: reward.paidAmountBasis,
      effectivePV: reward.effectivePV,
      snapshot,
    });
    const evidenceChanged = JSON.stringify(snapshot.latestEvidence) !== JSON.stringify(latestEvidence);
    const resultChanged = JSON.stringify(snapshot.latestResult) !== JSON.stringify(latestResult);
    const amountChanged = reward.projectedCreditAmount !== payout.calculatedCreditAmount;
    if (!evidenceChanged && !resultChanged && !amountChanged) continue;

    snapshot.latestEvidence = structuredClone(latestEvidence);
    snapshot.latestResult = structuredClone(latestResult);
    reward.rewardRate = payout.rewardRate;
    reward.rewardPV = payout.rewardPV;
    reward.projectedCreditAmount = payout.calculatedCreditAmount;
    if (payout.calculatedCreditAmount < 1) {
      reward.status = "cancelled";
      reward.cancellationReason = "self_purchase_tier_below_minimum_after_reversal";
    }
    event(
      state,
      "self_purchase_tier_reward_refreshed",
      {
        rewardId: reward.rewardId,
        projectedCreditAmount: payout.calculatedCreditAmount,
        excludedEvidenceCount: snapshot.initialEvidence.length - latestEvidence.length,
      },
      now,
      { memberId: reward.beneficiaryMemberId, orderId: reward.sourceOrderNumber },
    );
    changed.push(reward);
  }

  return changed;
}

export async function cancelOrReverseRetailPromotionRewards(input: { orderId: string; outcome?: "cancelled" | "uncollected" | "refunded" | "returned"; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  return transaction((state, now) => {
    const key = `retail-promotion-rewards:reverse:${input.idempotencyKey}`;
    if (remembered(state, key)) return [];
    const changed: RetailPromotionReward[] = [];
    const outcome = input.outcome ?? "cancelled";
    for (const reward of Object.values(state.retailPromotionRewards).filter((item) => item.sourceOrderNumber === input.orderId)) {
      reward.sourceOrderFinalState = outcome;
      if (reward.status === "scheduled") {
        reward.status = "cancelled";
        reward.cancellationReason = "source_transaction_reversed_before_release";
        event(state, "retail_promotion_reward_cancelled", { amount: reward.calculatedCreditAmount, outcome }, now, { memberId: reward.beneficiaryMemberId, orderId: reward.sourceOrderNumber });
        changed.push(reward);
        continue;
      }
      if (reward.status !== "released" || reward.reversalPolicySnapshot !== "cancel-pending-and-reverse-released") continue;
      const original = reward.rewardCreditEntryId ? state.creditEntries[reward.rewardCreditEntryId] : undefined;
      if (original) {
        original.remainingAmount = Math.max(0, original.remainingAmount - reward.calculatedCreditAmount);
        if (original.remainingAmount === 0) original.status = "consumed";
      }
      const reversalId = deterministicId("credit_reversal", `retail-promotion:${reward.rewardId}`);
      state.creditEntries[reversalId] = {
        creditEntryId: reversalId,
        memberId: reward.beneficiaryMemberId,
        sourceType: "promotion",
        sourceReference: `retail_promotion_reward_reversal:${reward.rewardId}`,
        amount: -reward.calculatedCreditAmount,
        remainingAmount: 0,
        issuedAt: nowIso(now),
        expiresAt: nowIso(now),
        status: "consumed",
        createdAt: nowIso(now),
        metadata: { rewardId: reward.rewardId, reversalAmount: reward.calculatedCreditAmount, reversesCreditEntryId: reward.rewardCreditEntryId ?? "", outcome },
      };
      reward.status = "reversed";
      reward.reversedAt = nowIso(now);
      reward.reversalCreditEntryId = reversalId;
      const source = event(state, "retail_promotion_reward_reversed", { amount: reward.calculatedCreditAmount, outcome }, now, { memberId: reward.beneficiaryMemberId, orderId: reward.sourceOrderNumber });
      notify(state, version.rules, "referral_conversion", source.eventId, now, { memberId: reward.beneficiaryMemberId, safeData: { rewardAmount: 0, retailPromotion: true } });
      changed.push(reward);
    }
    remember(state, key, changed[0]?.rewardId ?? "none", now);
    return changed;
  }, { now: input.now, filePath: input.stateFilePath });
}

export async function cancelOrReverseReferralRewards(input: { orderId: string; outcome?: "cancelled" | "uncollected" | "refunded" | "returned"; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  return transaction((state, now) => {
    const key = `referral-rewards:reverse:${input.idempotencyKey}`;
    if (remembered(state, key)) return [];
    const changed: ReferralReward[] = [];
    const reversalOutcome = input.outcome ?? "cancelled";
    const reversedConsumptions = Object.values(state.validConsumptionEvents)
      .filter((consumption) => consumption.sourceOrderId === input.orderId)
      .filter((consumption) => {
        if (!validForSelfPurchaseTier(consumption)) return false;
        consumption.reversedAt = nowIso(now);
        consumption.reversalOutcome = reversalOutcome;
        return true;
      });
    for (const reward of Object.values(state.referralRewards).filter((item) => item.sourceOrderNumber === input.orderId)) {
      reward.sourceOrderFinalState = reversalOutcome;
      if (reward.status === "scheduled") { reward.status = "cancelled"; reward.cancellationReason = "source_transaction_reversed_before_release"; changed.push(reward); const source=event(state,"referral_reward_cancelled",{amount:reward.calculatedCreditAmount},now,{memberId:reward.beneficiaryMemberId,orderId:reward.sourceOrderNumber}); notify(state,version.rules,"referral_conversion",source.eventId,now,{memberId:reward.beneficiaryMemberId,safeData:{rewardAmount:0}}); continue; }
      if (reward.status !== "released" || (reward.reversalPolicySnapshot ?? version.rules.referral.reversalPolicy) !== "cancel-pending-and-reverse-released") continue;
      const original = reward.rewardCreditEntryId ? state.creditEntries[reward.rewardCreditEntryId] : undefined;
      if (original) { original.remainingAmount = Math.max(0, original.remainingAmount - reward.calculatedCreditAmount); if (original.remainingAmount === 0) original.status = "consumed"; }
      const reversalId = id("credit_reversal");
      state.creditEntries[reversalId] = { creditEntryId: reversalId, memberId: reward.beneficiaryMemberId, sourceType: reward.rewardType === "self_purchase" ? "member_reward" : "referral", sourceReference: `referral_reward_reversal:${reward.rewardId}`, amount: -reward.calculatedCreditAmount, remainingAmount: 0, issuedAt: nowIso(now), expiresAt: nowIso(now), status: "consumed", createdAt: nowIso(now), metadata: { rewardId: reward.rewardId, reversalAmount: reward.calculatedCreditAmount, reversesCreditEntryId: reward.rewardCreditEntryId ?? "" } };
      reward.status = "reversed"; reward.reversedAt = nowIso(now); reward.reversalCreditEntryId = reversalId; changed.push(reward); const source=event(state,"referral_reward_reversed",{amount:reward.calculatedCreditAmount},now,{memberId:reward.beneficiaryMemberId,orderId:reward.sourceOrderNumber}); notify(state,version.rules,"referral_conversion",source.eventId,now,{memberId:reward.beneficiaryMemberId,safeData:{rewardAmount:0}});
    }
    changed.push(
      ...refreshScheduledSelfPurchaseTierRewardsForReversedConsumption(
        state,
        reversedConsumptions,
        now,
      ),
    );
    remember(state, key, changed[0]?.rewardId ?? "none", now); return changed;
  }, { now: input.now, filePath: input.stateFilePath });
}

function issueCreditInState(state: MembershipCommerceState, rules: MembershipBusinessRules, input: { memberId: string; sourceType: CreditEntry["sourceType"]; sourceReference: string; amount: number; metadata?: CreditEntry["metadata"] }, now: Date, originalExpiry?: string) {
  if (originalExpiry !== undefined && (!Number.isFinite(Date.parse(originalExpiry)) || Date.parse(originalExpiry) <= now.getTime())) throw new MembershipCommerceError("原始額度已到期");
  const duplicate = Object.values(state.creditEntries).find((entry) => entry.sourceType === input.sourceType && entry.sourceReference === input.sourceReference);
  if (duplicate) return duplicate;
  // Shared last monetary boundary, including direct issueCredit callers using reserved reward references.
  const reference = creditRewardReference(state, input.sourceReference);
  if (reference) {
    const hold = projectReturnRewardHolds(state, reference);
    if (hold.blocked) throw new ReturnRewardHeldError(hold);
    const safetyReview = pendingRewardSafetyReview(state, reference);
    if (safetyReview) throw new MembershipCommerceError(safetyReview);
    const deadline = pendingRewardSafetyDeadline(state, reference);
    if (deadline && now.getTime() <= Date.parse(deadline)) throw new MembershipCommerceError("原始退貨保護期間尚未安全結束");
    const entitlement = projectPendingReturnRewardEntitlement(state, reference);
    const referral = reference.program === "referral" ? state.referralRewards[reference.id] : null;
    const retail = reference.program === "retail_promotion" ? state.retailPromotionRewards[reference.id] : null;
    const conversion = reference.program === "referral_conversion" ? state.referralConversions[reference.id] : null;
    const reward = referral ?? retail ?? conversion;
    if (!reward && entitlement.resolutions.length) throw new MembershipCommerceError("退貨獎勵原始紀錄不存在，不可發放");
    if (reward) {
      const expectedMember = referral?.beneficiaryMemberId ?? retail?.beneficiaryMemberId ?? state.referrals[conversion!.relationshipId]?.referrerMemberId;
      const expectedType = retail ? "promotion" : referral?.rewardType === "self_purchase" ? "member_reward" : "referral";
      if (!["scheduled", "pending"].includes(reward.status) || input.memberId !== expectedMember || input.sourceType !== expectedType) throw new MembershipCommerceError("獎勵發放狀態、來源類型或受益會員不一致");
      if (referral || retail) {
        const dueDate = referral ? referralRewardProjectedReleaseBusinessDate(state, referral) : retail!.releaseEligibleBusinessDate;
        if (!dueDate || !isReferralReleaseBusinessDateDue(getDateOnlyInTimeZone(now), dueDate)) throw new MembershipCommerceError("原始獎勵安全等待期間尚未完成");
        if ((referral?.sourceOrderFinalState && referral.sourceOrderFinalState !== "completed")
          || (retail && retail.sourceOrderFinalState !== "completed")) throw new MembershipCommerceError("來源交易狀態不允許獎勵發放");
        if (referral && referralRewardQualificationAuthority(referral) === "qualification_coverage") {
          const chain = validQualificationCoverageMaturation(state, referral);
          if (!chain || Date.parse(chain.maturation.maturedAt) > now.getTime()) throw new MembershipCommerceError("獎勵缺少原始資格成熟證據");
        }
        if (referral && referralRewardQualificationAuthority(referral) === "legacy_order" && hasQualificationSnapshot(referral)
          && referral.qualificationStatus !== "qualified") throw new MembershipCommerceError("原始獎勵資格尚未成立");
        if (referral && referralRewardQualificationAuthority(referral) === "legacy_order" && referral.qualificationOrderFinalState
          && referral.qualificationOrderFinalState !== "completed") throw new MembershipCommerceError("原始資格交易狀態不允許發放");
      }
      if (conversion) {
        const originallyEligible = conversion.originalCalculation?.referrerEligibleAtCreation && conversion.originalCalculation.repeatedAllowedAtCreation;
        if (!originallyEligible && !entitlement.resolutions.some(item => item.calculation.originalEligibility === true)
          && !conversionReleaseEligibility.get(state)?.has(conversion.conversionId)) throw new MembershipCommerceError("推薦轉換資格尚未由原始制度確認");
      }
    }
    if (entitlement.resolutions.length && (input.amount > entitlement.remainingEffectivePendingRewardAmount
      || input.memberId !== entitlement.resolutions.at(-1)!.beneficiaryMemberId)) throw new MembershipCommerceError("獎勵抵用金超過退貨後有效待發額度或來源會員不一致");
  }
  const amount = assertIntegerMoney(input.amount, "抵用金");
  if (amount < 1) throw new MembershipCommerceError("抵用金必須大於零");
  const issuedDate = nowIso(now).slice(0, 10);
  const expiryDate = addTaipeiCalendarMonths(issuedDate, rules.credit.expiryCalendarMonths);
  const creditEntryId = id("credit");
  const entry: CreditEntry = { creditEntryId, memberId: input.memberId, sourceType: input.sourceType, sourceReference: input.sourceReference, amount, remainingAmount: amount, issuedAt: nowIso(now), expiresAt: originalExpiry ?? `${addTaipeiCalendarDays(expiryDate, 1)}T00:00:00+08:00`, status: "available", createdAt: nowIso(now), metadata: input.metadata ?? {} };
  state.creditEntries[creditEntryId] = entry;
  return entry;
}

export async function issueCredit(input: { memberId: string; sourceType: CreditEntry["sourceType"]; sourceReference: string; amount: number; metadata?: CreditEntry["metadata"]; idempotencyKey: string; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  if (input.sourceReference.startsWith("return_credit_restore:")) throw new MembershipCommerceError("退貨額度僅可由結算執行");
  await assertCanonicalMember(input.memberId);
  const version = await getActiveMembershipRules(input.now, input.rulesFilePath);
  const key = `credit:issue:${input.idempotencyKey}`;
  return transaction(async (state, now) => {
    const existingId = remembered(state, key);
    if (existingId) return state.creditEntries[existingId];
    const reference = creditRewardReference(state, input.sourceReference);
    if (reference) await primePendingReturnSafety(state, [reference]);
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
  const basis = await persistedOrderRewardBasis(input.orderId);
  if (input.outcome === "completed" && !currentRewardsAllowed(basis)) return null;
  if (basis?.hasStore && input.outcome === "completed") input = { ...input,
    orderMerchandiseAmount: basis.rewardMerchandiseAmount!, eligibleItemCount: basis.coffeeEligibleQuantity };
  const key = `referral:conversion:${input.idempotencyKey}`;
  return transaction(async (state, now) => {
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
    const conversionId = id("conversion");
    const pendingRewardAmount = input.outcome === "completed" && !eligible && calculatedReward ? calculatedReward : 0;
    const conversion: ReferralConversion = { conversionId, relationshipId: relationship.relationshipId, orderId: input.orderId,
      status: input.outcome === "uncollected" ? "uncollected" : rewardAmount || pendingRewardAmount ? "pending" : "ineligible",
      rewardCreditEntryId: null, pendingRewardAmount: rewardAmount ?? pendingRewardAmount, occurredAt: nowIso(now),
      originalCalculation: { rulesVersion: version.rulesVersion, merchandiseAmount: input.orderMerchandiseAmount,
        eligibleItemCount: input.eligibleItemCount ?? 0, calculatedRewardAmount: calculatedReward ?? 0,
        referrerEligibleAtCreation: eligible, repeatedAllowedAtCreation: repeatedAllowed } };
    state.referralConversions[conversionId] = conversion;
    const reference: ReturnRewardReference = { program: "referral_conversion", id: conversionId };
    await primePendingReturnSafety(state, [reference]);
    const hold = projectReturnRewardHolds(state, reference), deadline = pendingRewardSafetyDeadline(state, reference);
    const credit = rewardAmount && !hold.blocked && !pendingRewardSafetyReview(state, reference) && (!deadline || now.getTime() > Date.parse(deadline))
      ? issueCreditInState(state, version.rules, { memberId: relationship.referrerMemberId, sourceType: "referral", sourceReference, amount: rewardAmount, metadata: { relationshipId: relationship.relationshipId } }, now) : null;
    if (credit) { conversion.status = "rewarded"; conversion.rewardCreditEntryId = credit.creditEntryId; conversion.pendingRewardAmount = 0; }
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
  const [version, rulesStore] = await Promise.all([getActiveMembershipRules(input.now, input.rulesFilePath), readMembershipRulesStore(input.rulesFilePath)]);
  const key = `referral:release-pending:${input.idempotencyKey}`;
  return transaction(async (state, now) => {
    if (remembered(state, key)) return [];
    await primePendingReturnSafety(state);
    const eligibility = version.rules.referral.referrerEligibility;
    const eligible = eligibility.mode === "none" || (eligibility.mode === "active-subscription" && ((input.completedOrders ?? 0) >= 1 || hasActiveSubscription(state, input.referrerMemberId))) || (eligibility.mode === "completed-orders" && (input.completedOrders ?? 0) >= eligibility.minimumOrders) || (eligibility.mode === "lifetime-spend" && (input.lifetimeSpend ?? 0) >= eligibility.minimumAmount) || (eligibility.mode === "recent-valid-purchase" && Date.parse(input.lastValidPurchaseAt ?? "") >= now.getTime() - eligibility.withinDays * 86_400_000);
    const relationshipIds = new Set(Object.values(state.referrals).filter((item) => item.referrerMemberId === input.referrerMemberId).map((item) => item.relationshipId));
    const released: CreditEntry[] = [];
    let deferred = false;
    for (const conversion of Object.values(state.referralConversions).filter((item) => relationshipIds.has(item.relationshipId) && item.status === "pending" && item.pendingRewardAmount > 0)) {
      const reference: ReturnRewardReference = { program: "referral_conversion", id: conversion.conversionId };
      const entitlement = projectPendingReturnRewardEntitlement(state, reference), deadline = pendingRewardSafetyDeadline(state, reference);
      const snapshot = conversion.originalCalculation;
      if (snapshot && !snapshot.repeatedAllowedAtCreation) continue;
      const originallyEligible = (snapshot?.referrerEligibleAtCreation && snapshot.repeatedAllowedAtCreation)
        || entitlement.resolutions.some(item => item.calculation.originalEligibility === true);
      let eligibleForOriginalPolicy = eligible;
      if (snapshot && !originallyEligible) {
        const original = rulesStore.versions.find(item => item.rulesVersion === snapshot.rulesVersion)?.rules.referral.referrerEligibility;
        if (!original) { deferred = true; continue; }
        eligibleForOriginalPolicy = original.mode === "none"
          || (original.mode === "active-subscription" && ((input.completedOrders ?? 0) >= 1 || hasActiveSubscription(state, input.referrerMemberId)))
          || (original.mode === "completed-orders" && (input.completedOrders ?? 0) >= original.minimumOrders)
          || (original.mode === "lifetime-spend" && (input.lifetimeSpend ?? 0) >= original.minimumAmount)
          || (original.mode === "recent-valid-purchase" && Date.parse(input.lastValidPurchaseAt ?? "") >= now.getTime() - original.withinDays * 86_400_000);
      }
      if (!eligibleForOriginalPolicy && !originallyEligible) continue;
      if (projectReturnRewardHolds(state, reference).blocked || pendingRewardSafetyReview(state, reference) || (deadline && now.getTime() <= Date.parse(deadline))) { deferred = true; continue; }
      if (entitlement.remainingEffectivePendingRewardAmount === 0) continue;
      const checked = conversionReleaseEligibility.get(state) ?? new Set<string>();
      checked.add(conversion.conversionId); conversionReleaseEligibility.set(state, checked);
      const credit = issueCreditInState(state, version.rules, { memberId: input.referrerMemberId, sourceType: "referral", sourceReference: `referral_conversion:${conversion.relationshipId}:${conversion.orderId}`, amount: entitlement.remainingEffectivePendingRewardAmount }, now);
      conversion.status = "rewarded";
      conversion.rewardCreditEntryId = credit.creditEntryId;
      conversion.pendingRewardAmount = 0;
      released.push(credit);
    }
    if (!deferred) remember(state, key, released[0]?.creditEntryId ?? "none", now);
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
  const reservation = Object.values(state.creditReservations).filter((item) => item.orderId === input.orderId && item.memberId === input.memberId).sort(compareCreditReservations)[0];
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

export async function reserveCredit(input: { memberId: string; orderId: string; requestedAmount: number; merchandiseSubtotal: number; shipping: number; idempotencyKey: string; rulesVersionSnapshot?: RulesVersion; clampToAvailable?: boolean; recoverForOrder?: boolean; now?: Date; stateFilePath?: string; rulesFilePath?: string }) {
  await assertCanonicalMember(input.memberId);
  const version = input.rulesVersionSnapshot ?? await getActiveMembershipRules(input.now, input.rulesFilePath);
  const maximum = maximumCreditRedemption({ merchandiseSubtotal: input.merchandiseSubtotal, shipping: input.shipping, rules: version.rules });
  const requested = Math.min(assertIntegerMoney(input.requestedAmount, "要求折抵金額"), maximum);
  const key = `credit:reserve:${input.idempotencyKey}`;
  return transaction((state, now) => {
    const existingId = remembered(state, key);
    if (existingId && !(input.recoverForOrder && state.creditReservations[existingId]?.status === "released")) return state.creditReservations[existingId];
    const duplicateOrder = Object.values(state.creditReservations).find((reservation) => reservation.orderId === input.orderId && reservation.status === "reserved");
    if (duplicateOrder) {
      if (input.recoverForOrder && duplicateOrder.memberId === input.memberId) return duplicateOrder;
      throw new MembershipCommerceError("此訂單已有抵用金保留");
    }
    const entries = Object.values(state.creditEntries).filter((entry) => {
      refreshExpiry(entry, now);
      return entry.memberId === input.memberId && entry.status === "available" && entry.remainingAmount > 0;
    }).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.issuedAt.localeCompare(b.issuedAt) || a.creditEntryId.localeCompare(b.creditEntryId));
    const available = entries.reduce((sum, entry) => sum + effectiveCreditRemaining(state, entry, now), 0);
    if (requested > available && !input.clampToAvailable) throw new MembershipCommerceError("可用抵用金不足");
    const approved = input.clampToAvailable ? Math.min(requested, available) : requested;
    let remaining = approved;
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
    const reservation: CreditReservation = { rulesVersion: version.rulesVersion, reservationId, memberId: input.memberId, orderId: input.orderId, requestedAmount: input.requestedAmount, amount: approved, allocations, status: "reserved", createdAt: timestamp, updatedAt: timestamp };
    state.creditReservations[reservationId] = reservation;
    remember(state, key, reservationId, now);
    audit(state, { actor: "member", action: "credit-reserved", entityType: "credit-reservation", entityId: reservationId, before: {}, after: { amount: approved }, reason: "會員選擇使用抵用金", sourceEvent: input.orderId }, now);
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

function compareCreditReservations(a: CreditReservation, b: CreditReservation) {
  const priority = { reserved: 0, consumed: 1, released: 2 };
  return priority[a.status] - priority[b.status] || b.createdAt.localeCompare(a.createdAt);
}

export async function settleCreditReservationForOrder(input: { orderId: string; action: "consume" | "release"; idempotencyKey: string; reason: string; now?: Date; stateFilePath?: string }) {
  const state = await readMembershipCommerceState(input.stateFilePath);
  const reservation = Object.values(state.creditReservations).filter((item) => item.orderId === input.orderId).sort(compareCreditReservations)[0];
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

function safeMemberOrderNumber(value: unknown) {
  return typeof value === "string" && /^KD[0-9-]+$/u.test(value)
    ? value
    : null;
}

export function referralRewardWaitingRuleSnapshot(
  state: Pick<MembershipCommerceState, "qualificationRounds" | "referralRewardCoverages" | "referralRewardMaturations">,
  reward: ReferralReward,
): RewardWaitingRuleSnapshot | null {
  const coverage = Object.values(state.referralRewardCoverages)
    .find((item) => item.referralRewardId === reward.rewardId) ?? null;
  const round = coverage ? state.qualificationRounds[coverage.qualificationRoundId] ?? null : null;
  const maturation = Object.values(state.referralRewardMaturations)
    .find((item) => item.referralRewardId === reward.rewardId) ?? null;
  return selectHistoricalRewardWaitingRule({
    qualificationAuthority: referralRewardQualificationAuthority(reward),
    rewardSnapshot: reward.baseWaitingDaysSnapshot != null && reward.returnProtectionDaysSnapshot != null
      ? { baseWaitingDays: reward.baseWaitingDaysSnapshot, returnProtectionDays: reward.returnProtectionDaysSnapshot }
      : null,
    qualificationRoundSnapshot: round?.rewardSafetyRuleSnapshot ?? null,
    maturationSnapshot: maturation
      ? { baseWaitingDays: maturation.baseWaitingDays, returnProtectionDays: maturation.returnProtectionDays }
      : null,
  });
}

export async function getMemberCommerceDashboard(memberId: string, now = new Date(), filePath = getMembershipCommerceStateFile()) {
  const state = await readMembershipCommerceState(filePath);
  const todayDate = getDateOnlyInTimeZone(now);
  const memberReferralRewards = Object.values(state.referralRewards)
    .filter((reward) => reward.beneficiaryMemberId === memberId);
  const memberRetailRewards = Object.values(state.retailPromotionRewards)
    .filter((reward) => reward.beneficiaryMemberId === memberId);
  const dashboardOrderNumbers = [...new Set([
    ...memberReferralRewards.map((reward) => reward.sourceOrderNumber),
    ...memberRetailRewards.map((reward) => reward.sourceOrderNumber),
  ].filter(Boolean))];
  const dashboardOrderPairs = await Promise.all(
    dashboardOrderNumbers.map(async (orderNumber) => [orderNumber, await readOrder(orderNumber)] as const),
  );
  const dashboardOrders = new Map(dashboardOrderPairs);
  const dashboardCoverageByRewardId = new Map(
    Object.values(state.referralRewardCoverages).map((coverage) => [coverage.referralRewardId, coverage]),
  );
  const dashboardMaturationByRewardId = new Map(
    Object.values(state.referralRewardMaturations).map((maturation) => [maturation.referralRewardId, maturation]),
  );
  const referralSourceSummary = (
    reward: ReferralReward,
    actualCreditAmount: number | null = null,
    availableCreditAmount: number | null = null,
  ) => buildSafeRewardSourceOrderSummary({
    currentMemberId: memberId,
    rewardBeneficiaryMemberId: reward.beneficiaryMemberId,
    sourceOrderNumber: reward.sourceOrderNumber,
    order: dashboardOrders.get(reward.sourceOrderNumber),
    referralLevel: reward.referralLevel,
    calculationBasis: "pv",
    effectivePV: reward.effectivePV,
    rewardRate: reward.rewardRate,
    rewardPV: reward.rewardPV,
    projectedCreditAmount: reward.projectedCreditAmount ?? reward.calculatedCreditAmount,
    actualCreditAmount,
    availableCreditAmount,
    releaseEligibleBusinessDate: referralRewardProjectedReleaseBusinessDate(state, reward),
    releasedAt: reward.releasedAt,
    reversedAt: reward.reversedAt,
    waitingRuleSnapshot: referralRewardWaitingRuleSnapshot(state, reward),
    rewardStatus: reward.status,
    qualificationStatus: reward.qualificationStatus,
    qualificationAuthority: referralRewardQualificationAuthority(reward),
    qualificationCoverage: dashboardCoverageByRewardId.get(reward.rewardId) ?? null,
    qualificationMaturation: dashboardMaturationByRewardId.get(reward.rewardId) ?? null,
    successfulCompletionAt: reward.successfulPickupBusinessDate,
    todayDate,
  });
  const retailSourceSummary = (
    reward: RetailPromotionReward,
    actualCreditAmount: number | null = null,
    availableCreditAmount: number | null = null,
  ) => buildSafeRewardSourceOrderSummary({
    currentMemberId: memberId,
    rewardBeneficiaryMemberId: reward.beneficiaryMemberId,
    sourceOrderNumber: reward.sourceOrderNumber,
    order: dashboardOrders.get(reward.sourceOrderNumber),
    referralLevel: null,
    calculationBasis: reward.calculationBasis === "pv" ? "pv" : "paid_amount",
    effectivePV: typeof reward.calculationBaseValue === "number" ? reward.calculationBaseValue : reward.eligibleMerchandiseAmount,
    rewardRate: reward.rewardRate,
    rewardPV: reward.calculationBasis === "pv" && typeof reward.rewardPV === "number" ? reward.rewardPV : null,
    projectedCreditAmount: reward.calculatedCreditAmount,
    actualCreditAmount,
    availableCreditAmount,
    releaseEligibleBusinessDate: reward.releaseEligibleBusinessDate,
    releasedAt: reward.releasedAt,
    reversedAt: reward.reversedAt,
    waitingRuleSnapshot: {
      baseWaitingDays: reward.baseWaitingDaysSnapshot,
      returnProtectionDays: reward.returnProtectionDaysSnapshot,
    },
    rewardStatus: reward.status,
    qualificationStatus: "qualified",
    qualificationAuthority: "legacy_order",
    successfulCompletionAt: reward.successfulCompletionAt,
    todayDate,
  });
  const subscriptions = Object.values(state.subscriptions)
    .filter(
      (item) =>
        item.memberId === memberId &&
        !item.memberHiddenAt,
    )
    .map((item) => ({
      ...structuredClone(item),
      restartEligible: canRestartTerminatedSubscription(state, item),
    }));
  const subscriptionIds = new Set(subscriptions.map((item) => item.subscriptionId));
  const cycles = Object.values(state.cycles).filter((item) => subscriptionIds.has(item.subscriptionId)).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  const credits: MemberCreditHistoryEntry[] = Object.values(state.creditEntries).filter((item) => item.memberId === memberId).map((item) => {
    const remainingAmount = effectiveCreditRemaining(state, item, now);
    const status = Date.parse(item.expiresAt) <= now.getTime() && item.amount > 0 ? "expired" as const : remainingAmount === 0 && item.status === "available" ? "consumed" as const : item.status;
    const direction = item.amount < 0 ? "deduct" as const : "grant" as const;
    const customSourceLabel = typeof item.sourceLabel === "string" ? item.sourceLabel : undefined;
    const sourceLabel = customSourceLabel ?? (item.sourceType === "member_reward"
      ? "會員續購回饋" as const
      : item.sourceType === "referral"
        ? "推薦回饋" as const
      : item.sourceReference.startsWith("retail_promotion_reward:")
        ? "推廣零售獎金" as const
      : item.sourceReference.startsWith("admin_credit_adjustment:grant:")
        ? "KD Coffee 贈送" as const
        : direction === "deduct"
          ? "抵用金調整" as const
          : "會員抵用金" as const);
    const referralRewardId = item.sourceReference.startsWith("referral_reward:")
      ? item.sourceReference.slice("referral_reward:".length)
      : null;
    const retailPromotionRewardId = item.sourceReference.startsWith("retail_promotion_reward:")
      ? item.sourceReference.slice("retail_promotion_reward:".length)
      : null;
    const sourceOrderNumber = safeMemberOrderNumber(item.metadata.orderId)
      ?? safeMemberOrderNumber(
        referralRewardId
          ? state.referralRewards[referralRewardId]?.sourceOrderNumber
          : retailPromotionRewardId
            ? state.retailPromotionRewards[retailPromotionRewardId]?.sourceOrderNumber
            : null,
      );
    const orderRedemptions = Object.values(state.creditReservations)
      .filter((reservation) => reservation.memberId === memberId)
      .flatMap((reservation) => reservation.allocations
        .filter((allocation) => allocation.creditEntryId === item.creditEntryId && allocation.amount > 0)
        .map((allocation) => ({ orderNumber: reservation.orderId, amount: allocation.amount, status: reservation.status })));
    return { creditEntryId: item.creditEntryId, amount: item.amount, remainingAmount, issuedAt: item.issuedAt, expiresAt: item.expiresAt, status, direction, sourceLabel, sourceCopyKey: item.sourceReference.startsWith("return_credit_restore:") ? "member.returns.creditPassbookSource" : customSourceLabel !== undefined ? undefined : sourceLabel === "抵用金調整" ? "credit.source.adjustment" : sourceLabel === "會員抵用金" ? "credit.source.default" : undefined, sourceOrderNumber, orderRedemptions };
  });
  const rewardCreditSources = Object.values(state.creditEntries)
    .filter((item) =>
      item.memberId === memberId
      && item.amount > 0
      && (
        item.sourceType === "member_reward"
        || item.sourceType === "referral"
        || item.sourceReference.startsWith("retail_promotion_reward:")
      ),
    )
    .map((item) => {
      const referralRewardId = item.sourceReference.startsWith("referral_reward:")
        ? item.sourceReference.slice("referral_reward:".length)
        : null;
      const retailPromotionRewardId = item.sourceReference.startsWith("retail_promotion_reward:")
        ? item.sourceReference.slice("retail_promotion_reward:".length)
        : null;
      const referralReward = referralRewardId ? state.referralRewards[referralRewardId] : null;
      const retailPromotionReward = retailPromotionRewardId ? state.retailPromotionRewards[retailPromotionRewardId] : null;
      const sourceOrderNumber = safeMemberOrderNumber(item.metadata.orderId)
        ?? safeMemberOrderNumber(
          referralReward
            ? referralReward.sourceOrderNumber
            : retailPromotionReward
              ? retailPromotionReward.sourceOrderNumber
              : null,
        );
      const sourceCategory = retailPromotionRewardId
        ? "retail_promotion" as const
        : item.sourceType === "member_reward"
          ? "self_purchase" as const
          : "referral" as const;

      const availableAmount = effectiveCreditRemaining(state, item, now);
      return {
        sourceCategory,
        sourceLabel: sourceCategory === "retail_promotion"
          ? "推廣零售" as const
          : sourceCategory === "self_purchase"
            ? "自己的消費" as const
            : "推薦回饋" as const,
        sourceOrderNumber,
        creditedAmount: item.amount,
        availableAmount,
        issuedAt: item.issuedAt,
        sourceOrderSummary: referralReward
          ? referralSourceSummary(referralReward, item.amount, availableAmount)
          : retailPromotionReward
            ? retailSourceSummary(retailPromotionReward, item.amount, availableAmount)
            : null,
      };
    })
    .sort((left, right) => right.issuedAt.localeCompare(left.issuedAt));
  const pendingRetailPromotionRewards = Object.values(state.retailPromotionRewards)
    .filter((reward) => reward.beneficiaryMemberId === memberId && reward.status === "scheduled")
    .map((reward) => {
      const sourceOrderSummary = retailSourceSummary(reward);
      const displayStatus = sourceOrderSummary?.displayStatus ?? resolveEffectiveRewardDisplayStatus({
        status: reward.status,
        qualificationStatus: "qualified",
        qualificationAuthority: "legacy_order",
        releaseEligibleBusinessDate: reward.releaseEligibleBusinessDate,
        releasedAt: reward.releasedAt,
        sourceCompleted: true,
      }, todayDate);
      return {
        sourceLabel: "推廣零售" as const,
        sourceOrderNumber: safeMemberOrderNumber(reward.sourceOrderNumber),
        rewardPV: reward.calculationBasis === "pv" && typeof reward.rewardPV === "number" && Number.isFinite(reward.rewardPV) ? reward.rewardPV : null,
        projectedCreditAmount: reward.calculatedCreditAmount,
        releaseEligibleBusinessDate: reward.releaseEligibleBusinessDate,
        displayStatus,
        waitingExplanation: sourceOrderSummary?.waitingExplanation ?? buildRewardWaitingExplanation({
          rewardStatus: reward.status,
          displayStatus,
          sourceCompleted: true,
          completedAt: reward.successfulCompletionAt,
          releaseEligibleBusinessDate: reward.releaseEligibleBusinessDate,
          releasedAt: reward.releasedAt,
          reversedAt: reward.reversedAt,
          waitingRuleSnapshot: {
            baseWaitingDays: reward.baseWaitingDaysSnapshot,
            returnProtectionDays: reward.returnProtectionDaysSnapshot,
          },
        }),
        sourceOrderSummary,
      };
    })
    .sort((left, right) => left.releaseEligibleBusinessDate.localeCompare(right.releaseEligibleBusinessDate));
  const pendingReferralRewards = memberReferralRewards.filter(
    (reward) => reward.status === "scheduled" && reward.qualificationStatus !== "expired",
  );
  const pendingRetailRewards = memberRetailRewards.filter((reward) => reward.status === "scheduled");
  const pendingRewardSummary = summarizePendingRewards([
    ...pendingReferralRewards.map((reward) => ({
      rewardPV: reward.rewardPV,
      projectedCreditAmount: reward.projectedCreditAmount ?? reward.calculatedCreditAmount,
    })),
    ...pendingRetailRewards.map((reward) => ({
      rewardPV: reward.calculationBasis === "pv" && typeof reward.rewardPV === "number" && Number.isFinite(reward.rewardPV) ? reward.rewardPV : null,
      projectedCreditAmount: reward.calculatedCreditAmount,
    })),
  ]);
  const pendingCredit = pendingRewardSummary.projectedCreditAmount;
  return {
    subscriptions,
    cycles: structuredClone(cycles),
    credits: structuredClone(credits),
    rewardCreditSources: structuredClone(rewardCreditSources),
    pendingRetailPromotionRewards: structuredClone(pendingRetailPromotionRewards),
    pendingRewardSummary,
    pendingCredit,
    referrals: safeReferralMemberView(state, memberId),
  };
}

export async function getMemberRetailPromotionCenter(memberId: string, options: { filePath?: string; rulesFilePath?: string } = {}) {
  const [state, version, orders] = await Promise.all([
    readMembershipCommerceState(options.filePath),
    getActiveMembershipRules(new Date(), options.rulesFilePath),
    listOrders(),
  ]);
  const rewards = Object.values(state.retailPromotionRewards)
    .filter((reward) => reward.beneficiaryMemberId === memberId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const retailOrdersByNumber = new Map(orders.map((order) => [order.orderNumber, order]));
  const todayDate = getDateOnlyInTimeZone(new Date());
  const active = rewards.filter((reward) => reward.status === "scheduled" || reward.status === "released");
  const maskOrderNumber = (orderNumber: string) => {
    const suffix = orderNumber.slice(-4);
    return `KD••••-${suffix}`;
  };
  const rewardedOrders = new Set(rewards.map((reward) => reward.sourceOrderNumber));
  const pendingOrders = orders.flatMap((order) => {
    const attribution = order.retailPromotionAttribution as Partial<RetailPromotionOrderSnapshot> | undefined;
    if (
      !attribution ||
      attribution.version !== 1 ||
      attribution.source !== "member-share-link" ||
      attribution.referrerMemberId !== memberId ||
      attribution.referralCode !== referralCodeForMember(memberId) ||
      order.member?.memberId ||
      order.orderMode === "corporate_gift" ||
      ["completed", "cancelled", "uncollected"].includes(order.status) ||
      rewardedOrders.has(order.orderNumber)
    ) return [];
    const basis = resolveOrderRewardBasis(order);
    if (!currentRewardsAllowed(basis)) return [];
    const subtotal = Number(order.subtotal);
    const appliedCredit = Number(order.credit?.appliedAmount ?? 0);
    if (!Number.isSafeInteger(subtotal) || subtotal < 0 || !Number.isSafeInteger(appliedCredit) || appliedCredit < 0) return [];
    const eligibleSales = basis.hasStore ? basis.rewardMerchandiseAmount! : Math.max(0, subtotal - appliedCredit);
    const rewardRate = Number(attribution.rewardRate);
    if (!Number.isFinite(rewardRate) || rewardRate < 0 || rewardRate > 100 || !Number.isSafeInteger(attribution.ruleVersionId)) return [];
    const calculationBasis: RewardCalculationBasis = attribution.calculationBasis === "pv" ? "pv" : "paid_amount";
    const calculationBaseValue = basis.hasStore
      ? (calculationBasis === "pv" ? basis.totalEffectivePV : basis.rewardMerchandiseAmount!)
      : typeof attribution.calculationBaseValue === "number" && Number.isFinite(attribution.calculationBaseValue) && attribution.calculationBaseValue >= 0
      ? attribution.calculationBaseValue
      : calculationBasis === "paid_amount"
        ? eligibleSales
        : NaN;
    const pvRewardMoneyValue = Number(attribution.pvRewardMoneyValue ?? 0);
    if (!Number.isFinite(calculationBaseValue) || !Number.isFinite(pvRewardMoneyValue) || pvRewardMoneyValue < 0) return [];
    const payout = percentageRewardPayout({ calculationBasis, calculationBaseValue, rewardRate, pvRewardMoneyValue, roundingMode: attribution.roundingMode! });
    return [{
      date: order.createdAt,
      orderReference: maskOrderNumber(order.orderNumber),
      eligibleSales,
      calculationBasis,
      calculationBaseValue,
      rewardRate,
      rewardPV: payout.rewardPV,
      pvRewardMoneyValue,
      rewardAmount: payout.calculatedCreditAmount,
      status: "pending_completion" as const,
      releaseEligibleBusinessDate: "",
      releasedAt: null,
      ruleVersion: attribution.ruleVersionId,
    }];
  });
  const rewardHistory = rewards.map((reward) => {
    const creditEntry = reward.rewardCreditEntryId ? state.creditEntries[reward.rewardCreditEntryId] : null;
    const sourceOrderSummary = buildSafeRewardSourceOrderSummary({
      currentMemberId: memberId,
      rewardBeneficiaryMemberId: reward.beneficiaryMemberId,
      sourceOrderNumber: reward.sourceOrderNumber,
      order: retailOrdersByNumber.get(reward.sourceOrderNumber),
      referralLevel: null,
      calculationBasis: reward.calculationBasis === "pv" ? "pv" : "paid_amount",
      effectivePV: typeof reward.calculationBaseValue === "number" ? reward.calculationBaseValue : reward.eligibleMerchandiseAmount,
      rewardRate: reward.rewardRate,
      rewardPV: reward.calculationBasis === "pv" && typeof reward.rewardPV === "number" ? reward.rewardPV : null,
      projectedCreditAmount: reward.calculatedCreditAmount,
      actualCreditAmount: creditEntry?.amount ?? null,
      availableCreditAmount: creditEntry ? effectiveCreditRemaining(state, creditEntry, new Date()) : null,
      releaseEligibleBusinessDate: reward.releaseEligibleBusinessDate,
      releasedAt: reward.releasedAt,
      reversedAt: reward.reversedAt,
      waitingRuleSnapshot: {
        baseWaitingDays: reward.baseWaitingDaysSnapshot,
        returnProtectionDays: reward.returnProtectionDaysSnapshot,
      },
      rewardStatus: reward.status,
      qualificationStatus: "qualified",
      qualificationAuthority: "legacy_order",
      successfulCompletionAt: reward.successfulCompletionAt,
      todayDate,
    });
    const displayStatus = sourceOrderSummary?.displayStatus ?? resolveEffectiveRewardDisplayStatus({
      status: reward.status,
      qualificationStatus: "qualified",
      qualificationAuthority: "legacy_order",
      releaseEligibleBusinessDate: reward.releaseEligibleBusinessDate,
      releasedAt: reward.releasedAt,
      sourceCompleted: true,
    }, todayDate);
    return {
      date: reward.successfulCompletionAt,
      orderReference: maskOrderNumber(reward.sourceOrderNumber),
      eligibleSales: reward.eligibleMerchandiseAmount,
      calculationBasis: reward.calculationBasis === "pv" ? "pv" as const : "paid_amount" as const,
      calculationBaseValue: typeof reward.calculationBaseValue === "number" ? reward.calculationBaseValue : reward.eligibleMerchandiseAmount,
      rewardRate: reward.rewardRate,
      rewardPV: typeof reward.rewardPV === "number" ? reward.rewardPV : 0,
      pvRewardMoneyValue: typeof reward.pvRewardMoneyValue === "number" ? reward.pvRewardMoneyValue : 0,
      rewardAmount: reward.calculatedCreditAmount,
      status: reward.status,
      releaseEligibleBusinessDate: reward.releaseEligibleBusinessDate,
      releasedAt: reward.releasedAt,
      ruleVersion: reward.ruleVersion,
      displayStatus,
      waitingExplanation: sourceOrderSummary?.waitingExplanation ?? buildRewardWaitingExplanation({
        rewardStatus: reward.status,
        displayStatus,
        sourceCompleted: true,
        completedAt: reward.successfulCompletionAt,
        releaseEligibleBusinessDate: reward.releaseEligibleBusinessDate,
        releasedAt: reward.releasedAt,
        reversedAt: reward.reversedAt,
        waitingRuleSnapshot: {
          baseWaitingDays: reward.baseWaitingDaysSnapshot,
          returnProtectionDays: reward.returnProtectionDaysSnapshot,
        },
      }),
      sourceOrderSummary,
    };
  });
  return {
    referralCode: referralCodeForMember(memberId),
    settings: {
      enabled: version.rules.retailPromotion.enabled,
      rewardRate: version.rules.retailPromotion.rewardRate,
      calculationBasis: version.rules.retailPromotion.calculationBasis,
      attributionWindowDays: version.rules.retailPromotion.attributionWindowDays,
      pointDisplayName: version.rules.referral.pointDisplayName || "KD點",
      pvRewardMoneyValue: version.rules.referral.pvRewardMoneyValue,
    },
    summary: {
      promotionSales: active.reduce((sum, reward) => sum + reward.eligibleMerchandiseAmount, 0),
      pendingPromotionSales: pendingOrders.reduce((sum, order) => sum + order.eligibleSales, 0),
      promotionReward: active.reduce((sum, reward) => sum + reward.calculatedCreditAmount, 0),
      pendingReward: rewards.filter((reward) => reward.status === "scheduled").reduce((sum, reward) => sum + reward.calculatedCreditAmount, 0),
      releasedReward: rewards.filter((reward) => reward.status === "released").reduce((sum, reward) => sum + reward.calculatedCreditAmount, 0),
      performanceByBasis: {
        paidAmount: {
          completed: rewardHistory.filter((item) => item.calculationBasis === "paid_amount" && ["scheduled", "released"].includes(item.status)).reduce((sum, item) => sum + item.calculationBaseValue, 0),
          pending: pendingOrders.filter((item) => item.calculationBasis === "paid_amount").reduce((sum, item) => sum + item.calculationBaseValue, 0),
        },
        pv: {
          completed: rewardHistory.filter((item) => item.calculationBasis === "pv" && ["scheduled", "released"].includes(item.status)).reduce((sum, item) => sum + item.calculationBaseValue, 0),
          pending: pendingOrders.filter((item) => item.calculationBasis === "pv").reduce((sum, item) => sum + item.calculationBaseValue, 0),
        },
      },
    },
    history: [...pendingOrders, ...rewardHistory].sort((left, right) => right.date.localeCompare(left.date)),
  };
}

export async function getMemberReferralCenter(memberId: string, options: { baseUrl?: string; depth?: number; filePath?: string; rulesFilePath?: string } = {}) {
  await assertCanonicalMember(memberId);
  const [state, version, registry] = await Promise.all([readMembershipCommerceState(options.filePath), getActiveMembershipRules(new Date(), options.rulesFilePath), getIdentityRegistrySnapshot()]);
  const todayDate = getDateOnlyInTimeZone(new Date());
  const qualificationCoverageByRewardId = new Map(
    Object.values(state.referralRewardCoverages).map((coverage) => [coverage.referralRewardId, coverage]),
  );
  const qualificationMaturationByRewardId = new Map(
    Object.values(state.referralRewardMaturations).map((maturation) => [maturation.referralRewardId, maturation]),
  );
  const depth = Math.max(1, Math.min(options.depth ?? version.rules.referral.referralMaxRewardDepth, version.rules.referral.referralMaxRewardDepth, 10));
  const traversedNodes: Array<{ memberId: string; memberNumber: string; level: number; parentMemberId: string; parentMemberNumber: string }> = [];
  let frontier = [memberId];
  const visited = new Set([memberId]);
  for (let level = 1; level <= depth && frontier.length; level += 1) {
    const next: string[] = [];
    for (const parentId of frontier) {
      for (const relation of Object.values(state.referrals).filter((item) => item.referrerMemberId === parentId && item.status !== "inactive").slice(0, 200)) {
        if (visited.has(relation.referredMemberId)) continue;
        visited.add(relation.referredMemberId); next.push(relation.referredMemberId);
        traversedNodes.push({
          memberId: relation.referredMemberId,
          memberNumber: registry.members[relation.referredMemberId]?.memberNumber ?? "KD-會員",
          level,
          parentMemberId: parentId,
          parentMemberNumber: registry.members[parentId]?.memberNumber ?? "KD-會員",
        });
      }
    }
    frontier = next;
  }
  const directCountByMemberId = new Map<string, number>();
  for (const node of traversedNodes) {
    directCountByMemberId.set(node.parentMemberId, (directCountByMemberId.get(node.parentMemberId) ?? 0) + 1);
  }
  const descendantCount = (memberNodeId: string) => {
    let total = 0;
    let descendantFrontier = [memberNodeId];
    const descendantVisited = new Set([memberNodeId]);
    while (descendantFrontier.length) {
      const next: string[] = [];
      for (const parentId of descendantFrontier) {
        for (const node of traversedNodes) {
          if (node.parentMemberId !== parentId || descendantVisited.has(node.memberId)) continue;
          descendantVisited.add(node.memberId);
          next.push(node.memberId);
          total += 1;
        }
      }
      descendantFrontier = next;
    }
    return total;
  };
  const nodes = traversedNodes.map((node) => ({
    memberNumber: node.memberNumber,
    level: node.level,
    parentMemberNumber: node.parentMemberNumber,
    directReferralCount: directCountByMemberId.get(node.memberId) ?? 0,
    teamCount: descendantCount(node.memberId),
  }));

  // Organization chart is a navigation view, not a reward-depth rule. Keep a wider
  // read-only ancestry window so a downline can become the new root and still show
  // the next three generations without changing the production reward depth.
  const orgDepth = 10;
  const orgTraversedNodes: Array<{ memberId: string; memberNumber: string; level: number; parentMemberId: string; parentMemberNumber: string }> = [];
  let orgFrontier = [memberId];
  const orgVisited = new Set([memberId]);
  for (let level = 1; level <= orgDepth && orgFrontier.length; level += 1) {
    const next: string[] = [];
    for (const parentId of orgFrontier) {
      const relations = Object.values(state.referrals).filter((item) => item.referrerMemberId === parentId && item.status !== "inactive").slice(0, 200);
      for (const relation of relations) {
        if (orgVisited.has(relation.referredMemberId)) continue;
        orgVisited.add(relation.referredMemberId);
        next.push(relation.referredMemberId);
        orgTraversedNodes.push({
          memberId: relation.referredMemberId,
          memberNumber: registry.members[relation.referredMemberId]?.memberNumber ?? "KD-會員",
          level,
          parentMemberId: parentId,
          parentMemberNumber: registry.members[parentId]?.memberNumber ?? "KD-會員",
        });
      }
    }
    orgFrontier = next;
  }

  const orgDirectCountByMemberId = new Map<string, number>();
  for (const relation of Object.values(state.referrals)) {
    if (relation.status === "inactive") continue;
    if (!orgVisited.has(relation.referrerMemberId)) continue;
    orgDirectCountByMemberId.set(relation.referrerMemberId, (orgDirectCountByMemberId.get(relation.referrerMemberId) ?? 0) + 1);
  }
  const orgDescendantCount = (rootId: string) => {
    let total = 0;
    let current = [rootId];
    const seen = new Set([rootId]);
    while (current.length) {
      const next: string[] = [];
      for (const parentId of current) {
        for (const node of orgTraversedNodes) {
          if (node.parentMemberId !== parentId || seen.has(node.memberId)) continue;
          seen.add(node.memberId);
          next.push(node.memberId);
          total += 1;
        }
      }
      current = next;
    }
    return total;
  };

  const orgMemberIds = new Set([memberId, ...orgTraversedNodes.map((node) => node.memberId)]);
  const orgSourceRewards = Object.values(state.referralRewards).filter(
    (reward) => orgMemberIds.has(reward.sourceMemberId) && reward.beneficiaryMemberId === memberId,
  );
  const orgOrderSourceMember = new Map<string, string>();
  for (const reward of orgSourceRewards) {
    if (reward.sourceOrderNumber && !orgOrderSourceMember.has(reward.sourceOrderNumber)) orgOrderSourceMember.set(reward.sourceOrderNumber, reward.sourceMemberId);
  }
  const orgOrderPairs = await Promise.all([...orgOrderSourceMember.keys()].map(async (orderNumber) => [orderNumber, await readOrder(orderNumber)] as const));
  const orgOrders = new Map(orgOrderPairs);
  const recentOrderCutoff = Date.now() - 30 * 86_400_000;
  const currentPeriodKey = getDateOnlyInTimeZone(new Date()).slice(0, 7);
  const periodLabel = `${currentPeriodKey.replace("-", "/")} 本月`;

  const metricsForSourceMember = (sourceMemberId: string) => {
    const sourceOrderNumbers = [...orgOrderSourceMember.entries()].filter(([, sourceId]) => sourceId === sourceMemberId).map(([orderNumber]) => orderNumber);
    const sourceRewardsForCurrentMember = orgSourceRewards.filter((reward) => reward.sourceMemberId === sourceMemberId);
    const recentOrders = sourceOrderNumbers
      .map((orderNumber) => {
        const sourceOrder = orgOrders.get(orderNumber);
        const createdAt = sourceOrder?.createdAt ?? null;
        if (!createdAt || Date.parse(createdAt) < recentOrderCutoff) return null;
        const reward = sourceRewardsForCurrentMember.find((item) => item.sourceOrderNumber === orderNumber) ?? null;
        if (!reward) return null;
        const creditEntry = reward.rewardCreditEntryId ? state.creditEntries[reward.rewardCreditEntryId] : null;
        return buildSafeRewardSourceOrderSummary({
          currentMemberId: memberId,
          rewardBeneficiaryMemberId: reward.beneficiaryMemberId,
          sourceOrderNumber: reward.sourceOrderNumber,
          order: sourceOrder,
          referralLevel: reward.referralLevel,
          effectivePV: reward.effectivePV,
          rewardRate: reward.rewardRate,
          rewardPV: reward.rewardPV,
          projectedCreditAmount: reward.projectedCreditAmount ?? reward.calculatedCreditAmount,
          actualCreditAmount: creditEntry?.amount ?? null,
          availableCreditAmount: creditEntry ? effectiveCreditRemaining(state, creditEntry, new Date()) : null,
          releaseEligibleBusinessDate: referralRewardProjectedReleaseBusinessDate(state, reward),
          releasedAt: reward.releasedAt,
          reversedAt: reward.reversedAt,
          waitingRuleSnapshot: referralRewardWaitingRuleSnapshot(state, reward),
          rewardStatus: reward.status,
          qualificationStatus: reward.qualificationStatus,
          qualificationAuthority: referralRewardQualificationAuthority(reward),
          qualificationCoverage: qualificationCoverageByRewardId.get(reward.rewardId) ?? null,
          qualificationMaturation: qualificationMaturationByRewardId.get(reward.rewardId) ?? null,
          successfulCompletionAt: reward.successfulPickupBusinessDate,
          todayDate,
        });
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
    const recentOrderCount = recentOrders.length;
    const pendingCredit = sourceRewardsForCurrentMember
      .filter((reward) => reward.status === "scheduled" && reward.qualificationStatus !== "expired")
      .reduce((sum, reward) => sum + (reward.projectedCreditAmount ?? reward.calculatedCreditAmount), 0);
    const currentPeriodCredit = sourceRewardsForCurrentMember
      .filter((reward) => reward.status === "released" && reward.releasedAt && getDateOnlyInTimeZone(new Date(reward.releasedAt)).slice(0, 7) === currentPeriodKey)
      .reduce((sum, reward) => sum + reward.calculatedCreditAmount, 0);
    return { recentOrderCount, pendingCredit, currentPeriodCredit, recentOrders };
  };

  const orgNodes = orgTraversedNodes.map((node) => ({
    memberId: node.memberId,
    memberNumber: node.memberNumber,
    parentMemberId: node.parentMemberId,
    parentMemberNumber: node.parentMemberNumber,
    level: node.level,
    directReferralCount: orgDirectCountByMemberId.get(node.memberId) ?? 0,
    teamCount: orgDescendantCount(node.memberId),
    ...metricsForSourceMember(node.memberId),
  }));
  const rootMetrics = metricsForSourceMember(memberId);
  const orgChart = {
    periodLabel,
    pointDisplayName: version.rules.referral.pointDisplayName,
    stats: {
      teamMembers: orgTraversedNodes.length,
      newOrders: [...orgOrderSourceMember.keys()].filter((orderNumber) => {
        const createdAt = orgOrders.get(orderNumber)?.createdAt;
        return Boolean(createdAt && Date.parse(createdAt) >= recentOrderCutoff);
      }).length,
      pendingCredit: Object.values(state.referralRewards)
        .filter((reward) => reward.beneficiaryMemberId === memberId && reward.status === "scheduled" && reward.qualificationStatus !== "expired")
        .reduce((sum, reward) => sum + (reward.projectedCreditAmount ?? reward.calculatedCreditAmount), 0),
      currentPeriodCredit: Object.values(state.referralRewards)
        .filter((reward) => reward.beneficiaryMemberId === memberId && reward.status === "released" && reward.releasedAt && getDateOnlyInTimeZone(new Date(reward.releasedAt)).slice(0, 7) === currentPeriodKey)
        .reduce((sum, reward) => sum + reward.calculatedCreditAmount, 0),
    },
    root: {
      memberId,
      memberNumber: registry.members[memberId]?.memberNumber ?? "KD-會員",
      parentMemberId: null,
      parentMemberNumber: null,
      level: 0,
      directReferralCount: orgDirectCountByMemberId.get(memberId) ?? 0,
      teamCount: orgTraversedNodes.length,
      ...rootMetrics,
    },
    nodes: orgNodes,
  };

  const rewards = Object.values(state.referralRewards).filter((item) => item.beneficiaryMemberId === memberId);
  const summaries = Array.from({ length: depth }, (_, index) => {
    const level = index + 1;
    const levelRewards = rewards.filter((item) => item.referralLevel === level);
    return { level, members: nodes.filter((item) => item.level === level).length, pendingCredit: levelRewards.filter((item) => item.status === "scheduled" && item.qualificationStatus !== "expired").reduce((sum, item) => sum + item.calculatedCreditAmount, 0), releasedCredit: levelRewards.filter((item) => item.status === "released").reduce((sum, item) => sum + item.calculatedCreditAmount, 0), aggregateEligibleSpend: levelRewards.reduce((sum, item) => sum + item.paidAmountBasis, 0) };
  });
  const referringRelationship = Object.values(state.referrals).find(
    (item) => item.referredMemberId === memberId && item.status !== "inactive",
  );
  const referrerMemberNumber = referringRelationship
    ? registry.members[referringRelationship.referrerMemberId]?.memberNumber ?? null
    : null;
  const referralCode = referralCodeForMember(memberId);
  const referralUrl = `${(options.baseUrl ?? "").replace(/\/$/, "")}/member?ref=${encodeURIComponent(referralCode)}`;
  const uniqueOrderNumbers = [...new Set(rewards.map((item) => item.sourceOrderNumber).filter(Boolean))];
  const orderPairs = await Promise.all(uniqueOrderNumbers.map(async (orderNumber) => [orderNumber, await readOrder(orderNumber)] as const));
  const sourceOrders = new Map(orderPairs);

  const safeOrderItems = (order: Awaited<ReturnType<typeof readOrder>>) => Array.isArray(order?.items)
    ? order.items.slice(0, 20).map((raw: unknown) => {
        const item = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
        return {
          name: String(item.name || "KD Coffee 商品").slice(0, 80),
          optionLabel: String(item.optionLabel || "").slice(0, 60),
          optionDetail: String(item.optionDetail || "").slice(0, 80),
          preparationLabel: String(item.preparationLabel || "").slice(0, 60),
          quantity: Math.max(1, Math.min(999, Number(item.quantity) || 1)),
        };
      })
    : [];
  const pointDisplayName = version.rules.referral.pointDisplayName || "KD點";

  const qualificationProgress =
    buildMemberReferralQualificationProgress({
      state,
      rulesVersion: version,
      memberId,
      now: new Date(),
    });

  return { referralCode, referralUrl, referrerMemberNumber, mode: version.rules.referral.referralRewardCalculationMode, pointDisplayName, qualificationProgress, pvDisclosure: version.rules.referral.referralRewardCalculationMode === "pv" ? `本制度以 ${pointDisplayName} 計算，非商品售價百分比。${pointDisplayName} 是商品回饋計算單位，不是貨幣或可交易資產。` : null, maxDepth: depth, summaries, nodes, orgChart, rewards: rewards.map((item) => {
    const sourceOrder = sourceOrders.get(item.sourceOrderNumber);

    const qualificationCoverage =
      qualificationCoverageByRewardId.get(
        item.rewardId,
      ) ?? null;

    const creditEntry = item.rewardCreditEntryId ? state.creditEntries[item.rewardCreditEntryId] : null;
    const sourceOrderSummary = buildSafeRewardSourceOrderSummary({
      currentMemberId: memberId,
      rewardBeneficiaryMemberId: item.beneficiaryMemberId,
      sourceOrderNumber: item.sourceOrderNumber,
      order: sourceOrder,
      referralLevel: item.referralLevel,
      calculationBasis: "pv",
      effectivePV: item.effectivePV,
      rewardRate: item.rewardRate,
      rewardPV: item.rewardPV,
      projectedCreditAmount: item.projectedCreditAmount ?? item.calculatedCreditAmount,
      actualCreditAmount: creditEntry?.amount ?? null,
      availableCreditAmount: creditEntry ? effectiveCreditRemaining(state, creditEntry, new Date()) : null,
      releaseEligibleBusinessDate: referralRewardProjectedReleaseBusinessDate(state, item),
      releasedAt: item.releasedAt,
      reversedAt: item.reversedAt,
      waitingRuleSnapshot: referralRewardWaitingRuleSnapshot(state, item),
      rewardStatus: item.status,
      qualificationStatus: item.qualificationStatus,
      qualificationAuthority: referralRewardQualificationAuthority(item),
      qualificationCoverage,
      qualificationMaturation: qualificationMaturationByRewardId.get(item.rewardId) ?? null,
      successfulCompletionAt: item.successfulPickupBusinessDate,
      todayDate,
    });
    const displayStatus = sourceOrderSummary?.displayStatus ?? resolveEffectiveRewardDisplayStatus({
      status: item.status,
      qualificationStatus: item.qualificationStatus,
      qualificationAuthority: referralRewardQualificationAuthority(item),
      qualificationCoverage,
      qualificationMaturation: qualificationMaturationByRewardId.get(item.rewardId) ?? null,
      releaseEligibleBusinessDate: referralRewardProjectedReleaseBusinessDate(state, item),
      releasedAt: item.releasedAt,
      sourceCompleted: Boolean(item.successfulPickupBusinessDate),
    }, todayDate);
    const waitingRuleSnapshot = referralRewardWaitingRuleSnapshot(state, item);
    const waitingExplanation = sourceOrderSummary?.waitingExplanation ?? buildRewardWaitingExplanation({
      rewardStatus: item.status,
      displayStatus,
      sourceCompleted: Boolean(sourceOrderSummary?.completedAt || item.successfulPickupBusinessDate),
      completedAt: sourceOrderSummary?.completedAt ?? item.successfulPickupBusinessDate,
      releaseEligibleBusinessDate: referralRewardProjectedReleaseBusinessDate(state, item),
      releasedAt: item.releasedAt,
      reversedAt: item.reversedAt,
      waitingRuleSnapshot,
    });

    return { sourceOrderNumber: item.sourceOrderNumber, sourceOrderCreatedAt: sourceOrder?.createdAt ?? null, sourceMemberNumber: registry.members[item.sourceMemberId]?.memberNumber ?? "KD-會員", sourceItems: safeOrderItems(sourceOrder ?? null), sourceOrderSummary, displayStatus, waitingExplanation, referralLevel: item.referralLevel, rewardType: item.rewardType, calculationMode: item.calculationMode, effectivePV: item.effectivePV, rewardRate: item.rewardRate, rewardPV: item.rewardPV, creditAmount: creditEntry?.amount ?? item.calculatedCreditAmount, projectedCreditAmount: item.projectedCreditAmount ?? item.calculatedCreditAmount, selfPurchaseTierSnapshot: item.selfPurchaseTierSnapshot ?? null, status: item.status, cancellationReason: item.cancellationReason ?? null, qualificationStatus: item.qualificationStatus ?? "legacy", qualificationAuthority: referralRewardQualificationAuthority(item), qualificationCoverage: qualificationCoverage ? { coverageEndsAt: qualificationCoverage.coverageEndsAt } : null, qualificationExpiresAt: item.qualificationExpiresAt ?? null, qualificationOrderNumber: item.qualificationOrderNumber ?? null, qualificationOrderCreatedAt: item.qualificationOrderCreatedAt ?? null, qualificationOrderFinalState: item.qualificationOrderFinalState ?? null, qualificationQualifiedAt: item.qualificationQualifiedAt ?? null, successfulPickupBusinessDate: item.successfulPickupBusinessDate ?? null, releaseEligibleBusinessDate: referralRewardProjectedReleaseBusinessDate(state, item), releasedAt: item.releasedAt, reversedAt: item.reversedAt ?? null };
  }) };
}

export async function getAdminReferralOverview(input: { query?: string; from?: string; to?: string; filePath?: string } = {}) {
  const [state, registry] = await Promise.all([readMembershipCommerceState(input.filePath), getIdentityRegistrySnapshot()]);
  const query = input.query?.trim().toLowerCase() ?? "";
  const relationships = Object.values(state.referrals).map((item) => ({ ...item, referrerNumber: registry.members[item.referrerMemberId]?.memberNumber ?? "—", referredNumber: registry.members[item.referredMemberId]?.memberNumber ?? "—" })).filter((item) => !query || item.referrerNumber.toLowerCase().includes(query) || item.referredNumber.toLowerCase().includes(query) || item.safeDisplayName.toLowerCase().includes(query));
  const rewards = Object.values(state.referralRewards).filter((item) => (!input.from || item.createdAt.slice(0, 10) >= input.from) && (!input.to || item.createdAt.slice(0, 10) <= input.to));
  const retailPromotionRewards = Object.values(state.retailPromotionRewards).filter((item) => (!input.from || item.createdAt.slice(0, 10) >= input.from) && (!input.to || item.createdAt.slice(0, 10) <= input.to));
  const sum = (status?: ReferralReward["status"], type?: ReferralReward["rewardType"], mode?: ReferralReward["calculationMode"]) => rewards.filter((item) => (!status || item.status === status) && (!type || item.rewardType === type) && (!mode || item.calculationMode === mode)).reduce((total, item) => total + item.calculatedCreditAmount, 0);
  const retailSum = (status?: RetailPromotionReward["status"]) => retailPromotionRewards.filter((item) => !status || item.status === status).reduce((total, item) => total + item.calculatedCreditAmount, 0);
  return { relationships, rewards, retailPromotionRewards, statistics: { newReferralRewards: sum(undefined, "new_referral"), repeatPurchaseRewards: sum(undefined, "repeat_purchase"), subscriptionRewards: sum(undefined, "subscription"), selfPurchaseRewards: sum(undefined, "self_purchase"), retailPromotionRewards: retailSum(), retailPromotionSales: retailPromotionRewards.reduce((total, item) => total + item.eligibleMerchandiseAmount, 0), pendingAmount: rewards.filter((item) => item.status === "scheduled" && item.qualificationStatus !== "expired").reduce((total, item) => total + item.calculatedCreditAmount, 0) + retailSum("scheduled"), expiredAmount: rewards.filter((item) => item.qualificationStatus === "expired").reduce((total, item) => total + item.calculatedCreditAmount, 0), releasedAmount: sum("released") + retailSum("released"), reversedAmount: sum("reversed") + retailSum("reversed"), paidAmountModeRewards: sum(undefined, undefined, "paid_amount"), pvModeRewards: sum(undefined, undefined, "pv"), totalRewardCost: sum("released") + retailSum("released") } };
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
    for (const notice of state.notifications) {
      if (notice.status !== "pending") continue;
      const maximum = notice.deliveryPolicy?.maxAttempts ?? 1;
      if ((notice.attempts ?? 0) >= maximum) {
        notice.status = "failed";
        continue;
      }
      notice.status = "processing";
      notice.attempts = (notice.attempts ?? 0) + 1;
      notice.lastAttemptAt = nowIso(now);
      return structuredClone(notice);
    }
    return null;
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

/** Owner test-data maintenance. Cascades membership/referral state without touching order records. */
export async function purgeMembershipCommerceForMembers(memberIds?: string[]) {
  const filePath = getMembershipCommerceStateFile();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  return withFileLock(filePath, async () => {
    const original = await readMembershipCommerceState(filePath);
    const protectedRefs = collectProtectedCreditEvidenceReferences(original);
    const current = structuredClone(original);
    if (!memberIds?.length) {
      const cleared = emptyState();
      // Return facts survive this existing membership maintenance path as well.
      cleared.returnEvents = structuredClone(current.returnEvents ?? []);
      cleared.returnSettlementEvents = structuredClone(current.returnSettlementEvents ?? []);
      cleared.idempotency = Object.fromEntries(Object.entries(current.idempotency).filter(([key]) => key.startsWith("return-domain:")));
      cleared.audit = current.audit.filter(item => item.entityType === "return_request");
      cleared.revision = current.revision + 1;
      cleared.createdAt = current.createdAt;
      cleared.updatedAt = new Date().toISOString();
      retainProtectedCreditEvidence(original, cleared, protectedRefs);
      assertReturnEventsPreserved(current.returnEvents ?? [], cleared.returnEvents);
      assertSettlementPrefix(current.returnSettlementEvents ?? [], cleared.returnSettlementEvents ?? []);
      validateMembershipCommerceState(cleared);
      await atomicWriteJson(filePath, cleared);
      return { clearedAll: true };
    }

    const targets = new Set(memberIds);
    const subscriptionIds = new Set(Object.values(current.subscriptions).filter((item) => targets.has(item.memberId)).map((item) => item.subscriptionId));
    const relationshipIds = new Set(Object.values(current.referrals).filter((item) => targets.has(item.referrerMemberId) || targets.has(item.referredMemberId)).map((item) => item.relationshipId));
    const rewardIds = new Set(Object.values(current.referralRewards).filter((item) => targets.has(item.sourceMemberId) || targets.has(item.beneficiaryMemberId) || item.ancestrySnapshot.some((id) => targets.has(id))).map((item) => item.rewardId));
    const creditEntryIds = new Set(Object.values(current.creditEntries).filter((item) => targets.has(item.memberId) || [...rewardIds].some((rewardId) => item.sourceReference.includes(rewardId))).map((item) => item.creditEntryId));
    const roundIds = new Set(Object.values(current.qualificationRounds).filter((item) => targets.has(item.memberId)).map((item) => item.roundId));
    const coverageIds = new Set(Object.values(current.referralRewardCoverages).filter((item) => targets.has(item.memberId) || rewardIds.has(item.referralRewardId) || roundIds.has(item.qualificationRoundId)).map((item) => item.coverageId));

    for (const [id, item] of Object.entries(current.subscriptions)) if (targets.has(item.memberId)) delete current.subscriptions[id];
    for (const [id, item] of Object.entries(current.cycles)) if (subscriptionIds.has(item.subscriptionId)) delete current.cycles[id];
    for (const [id] of Object.entries(current.referrals)) if (relationshipIds.has(id)) delete current.referrals[id];
    for (const [id, item] of Object.entries(current.referralConversions)) if (relationshipIds.has(item.relationshipId)) delete current.referralConversions[id];
    for (const [id] of Object.entries(current.referralRewards)) if (rewardIds.has(id)) delete current.referralRewards[id];
    for (const [id, item] of Object.entries(current.validConsumptionEvents)) if (targets.has(item.memberId)) delete current.validConsumptionEvents[id];
    for (const [id] of Object.entries(current.qualificationRounds)) if (roundIds.has(id)) delete current.qualificationRounds[id];
    for (const [id, item] of Object.entries(current.referralRewardCoverages)) if (coverageIds.has(id)) delete current.referralRewardCoverages[id];
    for (const [id, item] of Object.entries(current.referralRewardMaturations)) if (targets.has(item.memberId) || rewardIds.has(item.referralRewardId) || coverageIds.has(item.coverageId) || roundIds.has(item.qualificationRoundId)) delete current.referralRewardMaturations[id];
    for (const [id] of Object.entries(current.creditEntries)) if (creditEntryIds.has(id)) delete current.creditEntries[id];
    for (const [id, item] of Object.entries(current.creditReservations)) if (targets.has(item.memberId) || item.allocations.some((allocation) => creditEntryIds.has(allocation.creditEntryId))) delete current.creditReservations[id];
    current.events = current.events.filter((item) => !item.memberId || !targets.has(item.memberId));
    current.notifications = current.notifications.filter((item) => !item.memberId || !targets.has(item.memberId));
    current.audit = current.audit.filter((item) => item.entityType === "return_request" || (!targets.has(item.entityId) && ![...targets].some((memberId) => item.sourceEvent.includes(memberId))));
    current.idempotency = Object.fromEntries(Object.entries(current.idempotency).filter(([key]) => key.startsWith("return-domain:")));
    retainProtectedCreditEvidence(original, current, protectedRefs);
    current.revision += 1;
    current.updatedAt = new Date().toISOString();
    validateMembershipCommerceState(current);
    await atomicWriteJson(filePath, current);
    return { clearedAll: false, memberIds: [...targets] };
  });
}

/** Credit entries, durable idempotency and APPLIED evidence commit in ONE existing commerce write.
 * Inventory has its own receipt and is deliberately not repeated or compensated here. */
export async function applyApprovedReturnCredit(orderNumber:string, returnRequestId:string, input:{now?:Date;stateFilePath?:string;rulesFilePath?:string;hook?:(phase:"BEFORE_CREDIT_COMMIT")=>void|Promise<void>}={}) {
  return withStoredOrderUpdateLock(orderNumber,async order=>{
    const run=async()=>transaction(async state=>{
      const now=input.now ?? new Date();
      if(!Number.isFinite(now.getTime()))throw new MembershipCommerceError("Invalid settlement clock");
      const approval=state.returnEvents?.find(item=>item.orderId === orderNumber && item.returnRequestId === returnRequestId && item.type === "RETURN_APPROVED");
      if(approval?.type !== "RETURN_APPROVED")throw new MembershipCommerceError("Return is not approved");
      planApprovedReturnSettlement(state,approval,now.toISOString());
      const effect=projectReturnSettlements(state).find(item=>item.approvedEventId === approval.eventId && item.effectType === "member_credit_restore")!;
      if(effect.status === "applied" || effect.status === "manual_review_required")return returnCreditSettlementSummary(state,returnRequestId);
      const request=state.returnEvents?.find(item=>item.type === "RETURN_REQUESTED" && item.returnRequestId === returnRequestId);
      const allocation=resolveOrderEconomicAllocation(order);
      if(request?.type !== "RETURN_REQUESTED" || allocation.status !== "resolved")throw new ReturnWorkflowError("original_credit_requires_review");
      const memberId=String(order.member?.memberId ?? "");
      if(!memberId)throw new ReturnWorkflowError("original_credit_member_requires_review");
      const sources=originalReturnCreditSources(orderNumber,memberId,allocation,state);
      let selected;
      try { selected=approvedReturnCreditSelection(request,approval,allocation.actualRedemptionUsed === 0); }
      catch { throw new ReturnWorkflowError("selected_credit_requires_review"); }
      // Every approved/pending request keeps its exact source budget, including expired amounts.
      const projection=projectOrderReturns(order,state.returnEvents ?? []);
      if(projection.status !== "resolved")throw new ReturnWorkflowError("original_credit_requires_review");
      const occupied=new Map<string,number>();
      for(const item of projection.requests.filter(item=>["pending","processing","approved"].includes(item.status))) {
        const original=state.returnEvents!.find(event=>event.eventId === item.requestedEventId)!;
        if(original.type !== "RETURN_REQUESTED")throw new ReturnWorkflowError("original_credit_requires_review");
        const decision=state.returnEvents!.find(event=>event.type === "RETURN_APPROVED" && event.returnRequestId === item.returnRequestId);
        let entries;
        try { entries=decision?.type === "RETURN_APPROVED" ? approvedReturnCreditSelection(original,decision,allocation.actualRedemptionUsed === 0) : original.confirmation?.preview.entries ?? []; }
        catch {throw new ReturnWorkflowError("selected_credit_requires_review");}
        if(!original.confirmation && allocation.actualRedemptionUsed > 0)throw new ReturnWorkflowError("selected_credit_requires_review");
        for(const source of entries)occupied.set(source.creditEntryId,(occupied.get(source.creditEntryId) ?? 0)+source.amount);
      }
      for(const [creditId,amount] of occupied)if(amount > (sources.find(item=>item.creditEntryId === creditId)?.amount ?? -1))throw new ReturnWorkflowError("credit_source_budget_requires_review");
      const version=await getActiveMembershipRules(now,input.rulesFilePath);
      const entries=selected.map(source=>{
        const original=sources.find(item=>item.creditEntryId === source.creditEntryId);
        if(!original || original.expiresAt !== source.expiresAt || source.amount > original.amount)throw new ReturnWorkflowError("original_credit_requires_review");
        const expired=Date.parse(source.expiresAt) <= now.getTime();
        let restoredCreditEntryId:string|null=null;
        if(!expired) {
          const sourceReference="return_credit_restore:"+effect.effectId+":"+source.creditEntryId;
          const entry=issueCreditInState(state,version.rules,{memberId,sourceType:"compensation",sourceReference,amount:source.amount,
            metadata:{orderId:orderNumber,returnRequestId,approvedEventId:approval.eventId,settlementEffectId:effect.effectId,originalCreditEntryId:source.creditEntryId,originalExpiresAt:source.expiresAt}},now,source.expiresAt);
          restoredCreditEntryId=entry.creditEntryId;
          remember(state,"credit:issue:"+sourceReference,entry.creditEntryId,now);
          event(state,"credit_issued",{amount:entry.amount,sourceType:entry.sourceType},now,{memberId,orderId:orderNumber});
        }
        return {creditEntryId:source.creditEntryId,amount:source.amount,expiresAt:source.expiresAt,restoredAmount:expired?0:source.amount,expiredAmount:expired?source.amount:0,restoredCreditEntryId};
      });
      const result={memberId,selectedAmount:entries.reduce((sum,item)=>sum+item.amount,0),restoredAmount:entries.reduce((sum,item)=>sum+item.restoredAmount,0),expiredAmount:entries.reduce((sum,item)=>sum+item.expiredAmount,0),settledAt:now.toISOString(),entries};
      appendSettlementEvent(state,{effectId:effect.effectId,type:"APPLIED",recordedAt:now.toISOString(),creditResult:result});
      audit(state,{actor:"system",action:"return_credit_restored",entityType:"return_request",entityId:returnRequestId,before:{},after:{restoredAmount:result.restoredAmount,expiredAmount:result.expiredAmount},reason:"Approved return original credit expiry revalidation",sourceEvent:approval.eventId},now);
      await input.hook?.("BEFORE_CREDIT_COMMIT");
      return returnCreditSettlementSummary(state,returnRequestId);
    },{filePath:input.stateFilePath,now:input.now});
    try {return await run();}
    catch(error) {
      await transaction(state=>{
        const effect=projectReturnSettlements(state).find(item=>item.orderId === orderNumber && item.returnRequestId === returnRequestId && item.effectType === "member_credit_restore");
        if(effect && !["applied","manual_review_required"].includes(effect.status))appendSettlementEvent(state,{effectId:effect.effectId,type:error instanceof ReturnWorkflowError?"MANUAL_REVIEW_REQUIRED":"FAILED",recordedAt:(input.now ?? new Date()).toISOString(),reason:error instanceof ReturnWorkflowError?error.code:"credit_commit_failed"});
      },{filePath:input.stateFilePath,now:input.now});
      throw error;
    }
  });
}

/** Records an already-performed manual payment; never calls a payment gateway. */
export async function confirmManualReturnPayment(orderNumber:string,requestId:string,adminId:string,input:{note?:string;proof?:import("./customerNotifications").CustomerNotificationPhoto[];prepareProof?:()=>Promise<import("./customerNotifications").CustomerNotificationPhoto[]>;now?:Date;stateFilePath?:string}={}) {
 return withStoredOrderUpdateLock(orderNumber,async order=>transaction(async state=>{
  const effect=projectReturnSettlements(state).find(e=>e.orderId===orderNumber&&e.returnRequestId===requestId&&e.effectType==="payment_refund");
  if(!effect)throw new ReturnWorkflowError("return_not_approved");
  if(effect.status==="applied")return {replayed:true,additionalRefund:0,result:effect.paymentResult!};
  const request=state.returnEvents?.find(e=>e.orderId===orderNumber&&e.returnRequestId===requestId&&e.type==="RETURN_REQUESTED");
  const saved=request?.type==="RETURN_REQUESTED"?request.confirmation?.refundRequest:undefined;
  const allocation=allocateApprovedReturnPayment(order,state.returnEvents??[],requestId);
  if(allocation.status!=="resolved"||allocation.method==="manual_review_required"||!saved||saved.method!==allocation.method||saved.originalPayment!==order.payment|| (saved.method==="manual_bank_transfer"&&!saved.bank))throw new ReturnWorkflowError("refund_manual_review_required");
  if(allocation.otherShippingReviewRequired)throw new ReturnWorkflowError("refund_unknown_fee_requires_review");
  const note=input.note??"";if(note.length>200||!adminId)throw new ReturnWorkflowError("invalid_input",400);
  // Exact approved effect, supported route and request limits precede any decoder.
  const proof=input.prepareProof?await input.prepareProof():input.proof??[];
  const result={amount:allocation.amount,merchandisePaidTotal:allocation.merchandisePaidTotal,originalPaidTotal:allocation.originalPaidTotal,method:allocation.method,originalPayment:saved.originalPayment,confirmedBy:adminId,confirmedAt:(input.now??new Date()).toISOString(),proof,note,allocationFingerprint:allocation.evidenceFingerprint};
  appendSettlementEvent(state,{effectId:effect.effectId,type:"APPLIED",recordedAt:result.confirmedAt,paymentResult:result});
  return {replayed:false,additionalRefund:result.amount,result};
 },{filePath:input.stateFilePath,now:input.now}));
}
export async function recordReturnRefundNotification(orderNumber:string,requestId:string,status:"sent"|"failed"|"disabled",input:{stateFilePath?:string;now?:Date}={}) {
 return transaction(state=>{const effect=projectReturnSettlements(state).find(e=>e.orderId===orderNumber&&e.returnRequestId===requestId&&e.effectType==="payment_refund");if(!effect||effect.status!=="applied")throw new ReturnWorkflowError("refund_not_completed");appendSettlementEvent(state,{effectId:effect.effectId,type:"NOTIFIED",notification:status,recordedAt:(input.now??new Date()).toISOString()});},{filePath:input.stateFilePath,now:input.now});
}
