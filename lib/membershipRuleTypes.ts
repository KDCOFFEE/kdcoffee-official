export const MEMBERSHIP_RULES_SCHEMA_VERSION = 1 as const;
export const OWNER_DECISION_REQUIRED = "owner-decision-required" as const;

export type MoneyRoundingMode = typeof OWNER_DECISION_REQUIRED | "round-half-up" | "round-down" | "round-up";

export type MembershipBusinessRules = {
  membership: { openingYearFreeShipping: { enabled: boolean; startDate: string; endDate: string; shippingMethods: string[] } };
  shipping: { subscriptionFreeShipping: boolean };
  subscription: { discountPercent: number; intervalsDays: number[]; modificationCutoffDays: number; orderCreationLeadDays: number; preparationLeadDays: number; customRoastPreparationLeadDays: number; delayQuickOptionsDays: number[]; uncollectedTerminationCount: number; allowOtherSubscriptionProducts: boolean; allowHalfToOnePound: boolean; allowOneToHalfPound: boolean; allowMixedOnePound: boolean; allowQuantityChange: boolean; pauseResumeAnchorPolicy: typeof OWNER_DECISION_REQUIRED | "keep-original" | "resume-date" | "member-selects-date" };
  gift: { startsAtFulfillment: number; repeatEveryFulfillments: number; halfPoundQuantity: number; onePoundQuantity: number; pool: Array<{ productId: string; priority: number; enabled: boolean }> };
  referral: {
    referrerEligibility: { mode: typeof OWNER_DECISION_REQUIRED } | { mode: "none" } | { mode: "completed-orders"; minimumOrders: number } | { mode: "lifetime-spend"; minimumAmount: number } | { mode: "recent-valid-purchase"; withinDays: number };
    reward: ({ mode: typeof OWNER_DECISION_REQUIRED } | { mode: "fixed"; amount: number } | { mode: "percentage"; percent: number } | { mode: "per-eligible-item"; amount: number }) & { repeatedRewards: boolean };
  };
  credit: {
    expiryCalendarMonths: number;
    expiryMonthEndPolicy: "clamp-to-last-day";
    redemption: { mode: "unlimited" } | { mode: "maximum-fixed"; amount: number } | { mode: "minimum-payable"; amount: number } | { mode: "maximum-percentage"; percent: number };
    appliesToShipping: typeof OWNER_DECISION_REQUIRED | "yes" | "no";
  };
  campaign: { eligiblePricingMode: typeof OWNER_DECISION_REQUIRED | "best-price" | "campaign-replaces-subscription" | "subscription-plus-benefit" | "campaign-defined" };
  notification: { channels: Array<"member_center" | "email" | "line" | "admin"> };
  money: { unit: "TWD"; integerOnly: true; roundingMode: MoneyRoundingMode };
  dateTime: { timeZone: "Asia/Taipei"; dateOnlyPolicy: "taipei-calendar-date" };
};

export type RulesVersion = { rulesVersion: number; effectiveAt: string; createdAt: string; createdBy: "owner" | "system"; rules: MembershipBusinessRules };
export type MembershipRulesStore = { schemaVersion: typeof MEMBERSHIP_RULES_SCHEMA_VERSION; revision: number; activeRulesVersion: number; versions: RulesVersion[]; createdAt: string; updatedAt: string };
