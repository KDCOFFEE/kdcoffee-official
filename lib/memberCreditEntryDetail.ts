import type { MembershipCommerceState } from "./membershipCommerce";
import type { RewardSourceOrderItem } from "./memberRewardPresentation";

export type CreditEntrySourceState = Pick<MembershipCommerceState, "creditEntries">
  & Partial<Pick<MembershipCommerceState, "referralRewards" | "retailPromotionRewards" | "referrals" | "referralConversions">>;

/** Member-facing projection only. No source IDs, raw metadata or personal data. */
export type MemberCreditEntryDetail = {
  titleKey: string;
  titleValues: { generation?: number };
  statusKey: string;
  orderNumber: string | null;
  products: RewardSourceOrderItem[];
  rewardPoints: number | null;
  creditAmount: number;
  createdAt: string | null;
  creditedAt: string | null;
};

const safeDate = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? value : null;
const safeOrder = (value: string) => /^KD[0-9-]+$/.test(value) ? value : null;

export function selectMemberCreditEntryDetail(state: CreditEntrySourceState, memberId: string, entryId: string): MemberCreditEntryDetail | null {
  const entry = state.creditEntries[entryId];
  if (!entry || entry.creditEntryId !== entryId || entry.memberId !== memberId
    || entry.sourceReference.startsWith("admin_credit_adjustment:")) return null;
  const reference = entry.sourceReference;
  const reversed = entry.amount < 0;
  const referralPrefix = reversed ? "referral_reward_reversal:" : "referral_reward:";
  const retailPrefix = reversed ? "retail_promotion_reward_reversal:" : "retail_promotion_reward:";
  const referral = reference.startsWith(referralPrefix) ? state.referralRewards?.[reference.slice(referralPrefix.length)] : null;
  const retail = reference.startsWith(retailPrefix) ? state.retailPromotionRewards?.[reference.slice(retailPrefix.length)] : null;
  const reward = referral ?? retail;
  if (reward) {
    const prefix = referral ? referralPrefix : retailPrefix;
    if (reward.rewardId !== reference.slice(prefix.length) || reward.beneficiaryMemberId !== memberId
      || (reversed ? reward.reversalCreditEntryId : reward.rewardCreditEntryId) !== entryId
      || (reversed && entry.metadata.reversesCreditEntryId !== reward.rewardCreditEntryId)
      || (entry.metadata.rewardId !== undefined && entry.metadata.rewardId !== reward.rewardId)
      || (entry.metadata.orderId !== undefined && entry.metadata.orderId !== reward.sourceOrderNumber)) return null;
    const self = referral?.rewardType === "self_purchase";
    if (entry.sourceType !== (retail ? "promotion" : self ? "member_reward" : "referral")
      || (self && referral.sourceMemberId !== memberId)) return null;
    return {
      titleKey: retail ? "member.retailPromotion.title" : self ? "member.selfPurchase.title" : "member.referral.reward.66dad4c359",
      titleValues: referral && !self ? { generation: referral.referralLevel } : {},
      statusKey: reward.status === "reversed" ? "member.rewards.label.2c0a067be7"
        : reward.status === "released" ? "member.referral.reward.6bd122e2dd"
          : reward.status === "cancelled" ? "member.dashboard.button.a5ffdc95ee"
            : referral?.qualificationStatus === "expired" ? "credit.passbook.detail.status.expired" : "member.referral.reward.dc9160b21b",
      orderNumber: safeOrder(reward.sourceOrderNumber), products: [],
      rewardPoints: typeof reward.rewardPV === "number" && Number.isFinite(reward.rewardPV) ? reward.rewardPV : null,
      creditAmount: entry.amount, createdAt: safeDate(reward.createdAt), creditedAt: safeDate(entry.createdAt),
    };
  }
  // Exact legacy conversion + relationship + credit backlink, never amount/date matching.
  if (entry.sourceType === "referral" && entry.amount > 0 && reference.startsWith("referral_conversion:")) {
    const matches = Object.values(state.referralConversions ?? {}).filter((conversion) => conversion.rewardCreditEntryId === entryId);
    if (matches.length !== 1) return null;
    const conversion = matches[0];
    const relationship = state.referrals?.[conversion.relationshipId];
    if (!relationship || relationship.relationshipId !== conversion.relationshipId
      || relationship.referrerMemberId !== memberId || conversion.status !== "rewarded"
      || reference !== `referral_conversion:${conversion.relationshipId}:${conversion.orderId}`) return null;
    return { titleKey: "credit.passbook.referral", titleValues: {}, statusKey: "member.referral.reward.6bd122e2dd",
      orderNumber: safeOrder(conversion.orderId), products: [], rewardPoints: null, creditAmount: entry.amount,
      createdAt: safeDate(conversion.occurredAt), creditedAt: safeDate(entry.createdAt) };
  }
  // Order redemption lives in reservations, not a dedicated canonical credit row.
  // A grant's allocations or arbitrary metadata.orderId cannot create a fake order/reward detail.
  return null;
}

/** Reuse the existing member-safe product shape; omit every other order field. */
export function attachMemberCreditDetailProducts(detail: MemberCreditEntryDetail, order: unknown): MemberCreditEntryDetail {
  const raw = order && typeof order === "object" ? order as Record<string, unknown> : null;
  if (!raw || !detail.orderNumber || raw.orderNumber !== detail.orderNumber) return detail;
  const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
  const products = (Array.isArray(raw.items) ? raw.items : []).slice(0, 20).flatMap((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const name = text(item.name, 80);
    if (!name) return [];
    return [{ name, optionLabel: text(item.optionLabel, 60), optionDetail: text(item.optionDetail, 80),
      preparationLabel: text(item.preparationLabel, 60), quantity: typeof item.quantity === "number" && Number.isFinite(item.quantity)
        ? Math.max(1, Math.min(999, Math.trunc(item.quantity))) : 1 }];
  });
  return { ...detail, products };
}
