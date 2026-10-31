import { percentageRewardPayout, selfPurchaseTierPayout, type MembershipCommerceState, type ReturnRewardReference,
  type PendingReturnRewardResolution } from "./membershipCommerce";
import { resolveOrderRewardBasis } from "./orderRewardBasis";

const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Presentation only. D entitlements are rounded CREDIT, never a point ledger.
 * Point values come from original rewardPV and D's original-program calculation
 * evidence. Never invert rounded credit, use today's conversion, or infer PV
 * from money. Unprovable historical point consequences remain explicitly unknown. */
export function projectReturnRewardUnits(state: MembershipCommerceState, reference: ReturnRewardReference, amount: {
  originalPendingRewardAmount: number; remainingEffectivePendingRewardAmount: number; resolutions: PendingReturnRewardResolution[];
}) {
  const referral = reference.program === "referral" ? state.referralRewards[reference.id] : undefined;
  const retail = reference.program === "retail_promotion" ? state.retailPromotionRewards[reference.id] : undefined;
  const points = referral?.calculationMode === "pv" || retail?.calculationBasis === "pv";
  const savedPoints = referral?.rewardPV ?? retail?.rewardPV;
  const originalPoints: number | null = points && valid(savedPoints) ? savedPoints : null;
  const conversionValue = points ? referral?.pvRewardMoneyValue ?? retail?.pvRewardMoneyValue : null;
  const originalBasis = points ? referral?.effectivePV ?? retail?.calculationBaseValue ?? null : null;
  let effectivePoints = originalPoints;
  let pointEvidenceStatus: "resolved" | "manual_review_required" = originalPoints === null && points ? "manual_review_required" : "resolved";
  for (const resolution of amount.resolutions) {
    if (!points || resolution.result !== "approved") continue;
    const calculation = resolution.calculation, linear = record(calculation.linear), tier = record(calculation.tier);
    let next: number | null = null;
    if (valid(linear.remainingPV) && valid(linear.rate) && linear.mode === "pv" && valid(linear.pvRewardMoneyValue)) {
      next = percentageRewardPayout({ calculationBasis: "pv", calculationBaseValue: linear.remainingPV, rewardRate: linear.rate,
        pvRewardMoneyValue: linear.pvRewardMoneyValue, roundingMode: linear.rounding as "round-down" | "round-up" | "round-half-up" }).rewardPV;
    } else if (retail && linear.basis === "pv" && valid(linear.remaining) && valid(linear.rate) && valid(linear.pvRewardMoneyValue)) {
      next = percentageRewardPayout({ calculationBasis: "pv", calculationBaseValue: linear.remaining, rewardRate: linear.rate,
        pvRewardMoneyValue: linear.pvRewardMoneyValue, roundingMode: linear.rounding as "round-down" | "round-up" | "round-half-up" }).rewardPV;
    } else if (referral?.selfPurchaseTierSnapshot && tier.result) {
      const terminalIndex = state.returnEvents?.findIndex(event => event.eventId === resolution.terminalReturnEventId) ?? -1;
      const prefix = state.returnEvents?.slice(0, terminalIndex + 1) ?? [];
      const approved = new Set(prefix.filter(event => event.type === "RETURN_APPROVED").map(event => event.returnRequestId));
      const requests = prefix.filter(event => event.type === "RETURN_REQUESTED" && event.orderId === referral.sourceOrderNumber);
      const selected = new Map<string, number>();
      for (const event of requests) if (event.type === "RETURN_REQUESTED" && approved.has(event.returnRequestId)) {
        for (const line of event.lines) selected.set(line.returnLineRef, (selected.get(line.returnLineRef) ?? 0) + line.quantity);
      }
      let pv: number | null = referral.effectivePV;
      if (selected.size) {
        const evidence = requests[0];
        const lines = evidence?.type === "RETURN_REQUESTED" ? evidence.completion.returnLines : null;
        if (lines?.status !== "resolved") pv = null;
        else {
          const original = resolveOrderRewardBasis({ ...lines.transactionSnapshot, items: lines.lines.map(line => line.snapshot) });
          const remaining = resolveOrderRewardBasis({ ...lines.transactionSnapshot, items: lines.lines.flatMap(line => {
            const quantity = line.originalQuantity - (selected.get(line.returnLineRef) ?? 0);
            return quantity > 0 ? [{ ...line.snapshot, quantity }] : [];
          }) });
          pv = original.totalEffectivePV === referral.effectivePV && remaining.totalEffectivePV <= original.totalEffectivePV ? remaining.totalEffectivePV : null;
        }
      }
      if (pv !== null) next = selfPurchaseTierPayout({ result: tier.result as Parameters<typeof selfPurchaseTierPayout>[0]["result"],
        paidAmountBasis: 0, effectivePV: pv, snapshot: referral.selfPurchaseTierSnapshot }).rewardPV;
    }
    if (record(calculation.coverage).supported === false || calculation.legacyQualification === "original_qualification_order_fully_returned") next = 0;
    if (next === null || !valid(next) || originalPoints === null || next > originalPoints || (effectivePoints !== null && next > effectivePoints)) { effectivePoints = null; pointEvidenceStatus = "manual_review_required"; }
    else if (pointEvidenceStatus === "resolved") effectivePoints = next;
  }
  return { unit: points ? "points" as const : "credit" as const,
    original: points ? originalPoints : amount.originalPendingRewardAmount,
    effective: points ? effectivePoints : amount.remainingEffectivePendingRewardAmount,
    delta: points ? originalPoints !== null && effectivePoints !== null ? effectivePoints - originalPoints : null : amount.remainingEffectivePendingRewardAmount - amount.originalPendingRewardAmount,
    originalBasis, rewardRate: referral?.rewardRate ?? retail?.rewardRate ?? null,
    conversionValue: valid(conversionValue) ? conversionValue : null,
    originalCredit: amount.originalPendingRewardAmount, effectiveCredit: amount.remainingEffectivePendingRewardAmount,
    pointEvidenceStatus };
}
