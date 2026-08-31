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

export type MembershipBusinessRules = {
  membership: { openingYearFreeShipping: { enabled: boolean; startDate: string; endDate: string; shippingMethods: string[] } };
  shipping: { subscriptionFreeShipping: boolean; subscriptionShippingFee: number };
  subscription: { discountPercent: number; intervalsDays: number[]; intervalOptions: Array<{ days: number; enabled: boolean }>; customCycleEnabled: boolean; customCycleMinDays: number; customCycleMaxDays: number; modificationCutoffDays: number; orderCreationLeadDays: number; preparationLeadDays: number; customRoastPreparationLeadDays: number; delayQuickOptionsDays: number[]; advanceQuickOptionsDays: number[]; maxModificationsPerCycle: number | null; datePickerMode: "quick-and-calendar" | "calendar-only" | "suggestion-and-calendar"; uncollectedTerminationCount: number; allowOtherSubscriptionProducts: boolean; allowHalfToOnePound: boolean; allowOneToHalfPound: boolean; allowMixedOnePound: boolean; allowQuantityChange: boolean; pauseResumeAnchorPolicy: typeof OWNER_DECISION_REQUIRED | "keep-original" | "resume-date" | "member-selects-date" };
  pickup: { preparationLeadDays: number; customRoastPreparationLeadDays: number; blockedDates: string[]; datePickerMode: "calendar" | "suggestion-and-calendar" };
  gift: { startsAtFulfillment: number; repeatEveryFulfillments: number; halfPoundQuantity: number; onePoundQuantity: number; pool: Array<{ productId: string; priority: number; enabled: boolean }> };
  referral: {
    programEnabled: boolean;
    referralMaxRewardDepth: number;
    levels: Array<{ level: number; enabled: boolean; newReferralRewardRate: number; subscriptionRewardRate: number }>;
    referralRewardCalculationMode: "paid_amount" | "pv";
    referralRewardQualificationWindowDays: number;
    referralRewardBaseWaitingDays: number;
    referralRewardReturnProtectionDays: number;
    referralTotalRewardCap: number;
    referralMonthlyCreditCap: number;
    pvRewardMoneyValue: number;
    showProductPV: boolean;
    reversalPolicy: "cancel-pending-and-reverse-released" | "cancel-pending-only";
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
