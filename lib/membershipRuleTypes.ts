export const MEMBERSHIP_RULES_SCHEMA_VERSION = 1 as const;
export const OWNER_DECISION_REQUIRED = "owner-decision-required" as const;

export type MoneyRoundingMode = typeof OWNER_DECISION_REQUIRED | "round-half-up" | "round-down" | "round-up";

export const membershipNotificationEventTypes = [
  "next_cycle_upcoming",
  "modification_cutoff_reminder",
  "subscription_order_created",
  "shipped",
  "arrived_at_store",
  "unclaimed_risk",
  "gift_milestone",
  "referral_reward",
  "credit_reward",
  "credit_expiry",
] as const;

export type MembershipNotificationEventType = (typeof membershipNotificationEventTypes)[number];
export type NotificationEventPolicy = { enabled: boolean; channels: Array<"member_center" | "email" | "line" | "admin"> };
export type ReferralPayoutQualificationMode = "general" | "subscription" | "either" | "both";
export type ReferralExcessConsumptionMode = "reset" | "carry";
export type ReferralQualificationBasis = "money" | "pv";

export type SelfPurchaseEligibilityMode =
  | "first_completed_order"
  | "after_prior_valid_consumption";

export type SelfPurchaseRewardAccumulationBasis =
  | "single_order"
  | "rolling_period";

export type SelfPurchaseRewardTierThresholdBasis =
  | "paid_amount"
  | "pv";

export type SelfPurchaseRewardTierCalculationMethod =
  | "whole_order"
  | "marginal";

export type SelfPurchaseRewardTier = {
  threshold: number;
  rewardRate: number;
};

export type SelfPurchaseRewardTierRules = {
  enabled: boolean;

  /**
   * Unit used ONLY to determine the member's own-purchase tier.
   * This is independent from referral payout qualification.
   */
  thresholdBasis:
    SelfPurchaseRewardTierThresholdBasis;

  accumulationBasis:
    SelfPurchaseRewardAccumulationBasis;
  calculationMethod:
    SelfPurchaseRewardTierCalculationMethod;
  rollingWindowDays: number;
  tiers: SelfPurchaseRewardTier[];
};

export type ReferralPayoutQualificationRules = {
  mode: ReferralPayoutQualificationMode;
  qualificationBasis: ReferralQualificationBasis;
  generalMember: {
    rollingWindowDays: number;
    cumulativeValidConsumptionThreshold: number;
    cumulativeValidPVThreshold: number;
  };
  activeSubscriptionMember: {
    rollingWindowDays: number;
    cumulativeValidConsumptionThreshold: number;
    cumulativeValidPVThreshold: number;
  };
  validConsumption: { includeCreditDiscount: boolean; includeShipping: boolean };
  rewardCoverage: { lookbackDays: number; forwardDays: number };
  excessConsumptionMode: ReferralExcessConsumptionMode;
};

export type MembershipBusinessRules = {
  membership: { openingYearFreeShipping: { enabled: boolean; startDate: string; endDate: string; shippingMethods: string[] } };
  shipping: { subscriptionFreeShipping: boolean; subscriptionShippingFee: number; sevenElevenShippingFee: number; homeDeliveryShippingFee: number; homeDeliveryCodFee: number; subscriptionShippingDiscount: number };
  subscription: { discountPercent: number; intervalsDays: number[]; intervalOptions: Array<{ days: number; enabled: boolean }>; customCycleEnabled: boolean; customCycleMinDays: number; customCycleMaxDays: number; modificationCutoffDays: number; orderCreationLeadDays: number; preparationLeadDays: number; customRoastPreparationLeadDays: number; delayQuickOptionsDays: number[]; advanceQuickOptionsDays: number[]; maxModificationsPerCycle: number | null; datePickerMode: "quick-and-calendar" | "calendar-only" | "suggestion-and-calendar"; uncollectedTerminationCount: number; allowOtherSubscriptionProducts: boolean; allowHalfToOnePound: boolean; allowOneToHalfPound: boolean; allowMixedOnePound: boolean; allowQuantityChange: boolean; pauseResumeAnchorPolicy: typeof OWNER_DECISION_REQUIRED | "keep-original" | "resume-date" | "member-selects-date" };
  pickup: { preparationLeadDays: number; customRoastPreparationLeadDays: number; blockedDates: string[]; datePickerMode: "calendar" | "suggestion-and-calendar" };
  gift: { startsAtFulfillment: number; repeatEveryFulfillments: number; halfPoundQuantity: number; onePoundQuantity: number; pool: Array<{ productId: string; priority: number; enabled: boolean }> };
  referral: {
    programEnabled: boolean;
    /** Temporary referral attribution before first member creation. */
    referralAttributionEnabled: boolean;
    /** Last valid referral click attribution lifetime in minutes. */
    referralAttributionSessionMinutes: number;
    referralMaxRewardDepth: number;
    levels: Array<{ level: number; enabled: boolean; newReferralRewardRate: number; repeatPurchaseRewardRate: number; subscriptionRewardRate: number }>;
    referralRewardCalculationMode: "paid_amount" | "pv";
    /** Owner-editable display name for the internal PV unit. Internal data fields remain PV for compatibility. */
    pointDisplayName: string;
    /**
     * Legacy / fallback flat rate for a member's own purchases.
     * Tier rules remain disabled for historical rules unless
     * explicitly enabled by Owner.
     */
    selfPurchaseRewardRate: number;

    /**
     * Dynamic own-purchase reward tiers.
     *
     * The threshold unit is selected exclusively by
     * selfPurchaseRewardTiers.thresholdBasis and is independent from
     * referral payout qualification and referralRewardCalculationMode.
     */
    selfPurchaseRewardTiers:
      SelfPurchaseRewardTierRules;

    /**
     * Controls when the member's own completed-order reward starts.
     * Legacy rules missing this field normalize to after_prior_valid_consumption.
     */
    selfPurchaseEligibilityMode: SelfPurchaseEligibilityMode;
    /**
     * Whether a member's own-purchase reward must also satisfy
     * referral payout qualification.
     *
     * false = own-purchase reward is independent and enters
     *         safety waiting immediately after completed order.
     * true  = existing referral qualification coverage applies.
     */
    selfPurchaseRequiresReferralQualification: boolean;
    payoutQualification: ReferralPayoutQualificationRules;
    /** Legacy per-reward forward window. Do not reinterpret as payoutQualification.rewardCoverage. */
    referralRewardQualificationWindowDays: number;
    referralRewardBaseWaitingDays: number;
    referralRewardReturnProtectionDays: number;
    referralTotalRewardCap: number;
    referralMonthlyCreditCap: number;
    pvRewardMoneyValue: number;
    showProductPV: boolean;
    reversalPolicy: "cancel-pending-and-reverse-released" | "cancel-pending-only";
    /** Legacy reward-flow compatibility only; not part of the canonical payout qualification model. */
    referrerEligibility: { mode: typeof OWNER_DECISION_REQUIRED } | { mode: "active-subscription" } | { mode: "none" } | { mode: "completed-orders"; minimumOrders: number } | { mode: "lifetime-spend"; minimumAmount: number } | { mode: "recent-valid-purchase"; withinDays: number };
    reward: ({ mode: typeof OWNER_DECISION_REQUIRED } | { mode: "fixed"; amount: number } | { mode: "percentage"; percent: number } | { mode: "per-eligible-item"; amount: number }) & { repeatedRewards: boolean };
  };
  credit: {
    expiryCalendarMonths: number;
    expiryReminderDays: number;
    expiryMonthEndPolicy: "clamp-to-last-day";
    redemption: { mode: "unlimited" } | { mode: "maximum-fixed"; amount: number } | { mode: "minimum-payable"; amount: number } | { mode: "maximum-percentage"; percent: number };
    appliesToShipping: typeof OWNER_DECISION_REQUIRED | "yes" | "no";
    allowZeroTotal: boolean;
    uiMode: "amount-and-maximum" | "use-or-not" | "automatic-maximum" | "custom-amount";
  };
  campaign: { eligiblePricingMode: typeof OWNER_DECISION_REQUIRED | "best-price" | "campaign-replaces-subscription" | "subscription-plus-benefit" | "campaign-defined" };
  notification: { channels: Array<"member_center" | "email" | "line" | "admin">; retryCount: number; emailFallback: boolean; nextCycleReminderDays: number; modificationCutoffReminderDays: number; events: Record<MembershipNotificationEventType, NotificationEventPolicy> };
  fulfillment: { arrivalReminderAfterDays: number; unknownEmailRequiresReview: true; gmailScanLookbackDays: number };
  ownerExceptions: { canUnlockDate: boolean; canUnlockStore: boolean; canUnlockQuantity: boolean };
  money: { unit: "TWD"; integerOnly: true; roundingMode: MoneyRoundingMode };
  dateTime: { timeZone: "Asia/Taipei"; dateOnlyPolicy: "taipei-calendar-date" };
};

export type RulesVersion = { rulesVersion: number; effectiveAt: string; createdAt: string; createdBy: "owner" | "system"; rules: MembershipBusinessRules };
export type MembershipRulesStore = { schemaVersion: typeof MEMBERSHIP_RULES_SCHEMA_VERSION; revision: number; activeRulesVersion: number; versions: RulesVersion[]; createdAt: string; updatedAt: string };
