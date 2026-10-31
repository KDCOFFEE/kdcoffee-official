import "server-only";
import { readStoreOrderPV } from "./commerceOrderTypes";
import { createHash } from "node:crypto";
import type { ReturnLineEvidenceResult } from "./orderCompletion";

type Item = Record<string, unknown>;
export type OrderRewardBasisStatus = "resolved" | "mixed_credit_allocation_unresolved" | "unknown_domain" | "invalid_mixed_snapshot" | "invalid_pv_snapshot";
export type OrderRewardBasis = {
  coffeeItems: Item[]; hasStore: boolean; coffeeEligible: boolean;
  /** Common PV authority; Coffee-specific facts and monetary allocation remain independent. */
  rewardEligible: boolean; storeEligiblePV: number;
  totalBasePV: number; totalEffectivePV: number; totalValidConsumptionPV: number;
  coffeeEligibleQuantity: number; coffeeBasePV: number; coffeeEffectivePV: number;
  coffeeValidConsumptionPV: number; coffeeMerchandiseSubtotal: number | null;
  rewardMerchandiseAmount: number | null; creditApplied: number;
  monetaryBasisStatus: OrderRewardBasisStatus;
};

/** Read-only classification. Missing legacy domain means Coffee; explicit unknown values never do. */
export function resolveOrderRewardBasis(order: Record<string, unknown>): OrderRewardBasis {
  const items = Array.isArray(order.items) ? order.items : [];
  const coffeeItems: Item[] = [];
  let hasStore = false, unknown = false, invalidPV = false, storeEligiblePV = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { unknown = true; continue; }
    const item = raw as Item;
    if (item.domain === undefined || item.domain === "coffee") coffeeItems.push(item);
    else if (item.domain === "store") {
      hasStore = true;
      try {
        const pv = readStoreOrderPV(item.pvValue);
        if (typeof item.quantity !== "number" || !Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new Error("Invalid Store quantity");
        storeEligiblePV += pv * item.quantity;
        if (!Number.isFinite(storeEligiblePV)) invalidPV = true;
      } catch { invalidPV = true; }
    }
    else unknown = true;
  }
  const credit = order.credit && typeof order.credit === "object" ? order.credit as Item : undefined;
  const creditApplied = Math.max(0, Number(credit?.appliedAmount || 0));
  const result: OrderRewardBasis = {
    rewardEligible: false, storeEligiblePV, totalBasePV: 0, totalEffectivePV: 0, totalValidConsumptionPV: 0,
    coffeeItems, hasStore, coffeeEligible: !unknown && (!hasStore || coffeeItems.length > 0),
    coffeeEligibleQuantity: coffeeItems.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0),
    coffeeBasePV: coffeeItems.reduce((sum, item) => sum + Math.max(0, Number(item.basePV || 0)) * Math.max(1, Number(item.quantity || 1)), 0),
    // Preserve the distinct, existing fulfillment and qualification zero-PV semantics.
    coffeeEffectivePV: coffeeItems.reduce((sum, item) => sum + Math.max(0, Number(item.effectivePV || item.basePV || 0)) * Math.max(1, Number(item.quantity || 1)), 0),
    coffeeValidConsumptionPV: coffeeItems.reduce((sum, item) => sum + Math.max(0, Number(item.effectivePV ?? item.basePV ?? 0)) * Math.max(1, Number(item.quantity || 1)), 0),
    coffeeMerchandiseSubtotal: 0, rewardMerchandiseAmount: 0, creditApplied,
    monetaryBasisStatus: "resolved",
  };
  if (unknown || invalidPV) return { ...result, rewardEligible: false, storeEligiblePV: 0, coffeeEligible: false, coffeeEligibleQuantity: 0, coffeeBasePV: 0,
    coffeeEffectivePV: 0, coffeeValidConsumptionPV: 0, coffeeMerchandiseSubtotal: null,
    rewardMerchandiseAmount: null, monetaryBasisStatus: unknown ? "unknown_domain" : "invalid_pv_snapshot" };
  result.totalBasePV = result.coffeeBasePV + storeEligiblePV;
  result.totalEffectivePV = result.coffeeEffectivePV + storeEligiblePV;
  result.totalValidConsumptionPV = result.coffeeValidConsumptionPV + storeEligiblePV;
  if (hasStore && ![result.totalBasePV, result.totalEffectivePV, result.totalValidConsumptionPV].every(Number.isFinite)) {
    return { ...result, totalBasePV: 0, totalEffectivePV: 0, totalValidConsumptionPV: 0, rewardEligible: false, monetaryBasisStatus: "invalid_pv_snapshot" };
  }
  result.rewardEligible = result.coffeeEligible || storeEligiblePV > 0;
  if (!hasStore) {
    result.coffeeMerchandiseSubtotal = Math.max(0, Number(order.subtotal || 0));
    result.rewardMerchandiseAmount = Math.max(0, Number(order.subtotal || 0) - creditApplied);
    return result;
  }
  // Legacy Store-only lines remain zero-PV. Positive snapshots must also prove
  // coherent order money/credit evidence before entering existing reward paths.
  if (!coffeeItems.length && storeEligiblePV === 0) return result;
  let coffeeSubtotal = 0, allSubtotal = 0;
  for (const raw of items) {
    const item = raw as Item, amount = item.lineTotal;
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
      return { ...result, rewardEligible: false, coffeeEligible: false, coffeeMerchandiseSubtotal: null, rewardMerchandiseAmount: null, monetaryBasisStatus: "invalid_mixed_snapshot" };
    }
    allSubtotal += amount;
    if (item.domain === undefined || item.domain === "coffee") coffeeSubtotal += amount;
  }
  if (!Number.isSafeInteger(allSubtotal) || !Number.isSafeInteger(coffeeSubtotal)
    || allSubtotal !== order.subtotal || !Number.isSafeInteger(creditApplied)) {
    return { ...result, rewardEligible: false, coffeeEligible: false, coffeeMerchandiseSubtotal: null, rewardMerchandiseAmount: null, monetaryBasisStatus: "invalid_mixed_snapshot" };
  }
  result.coffeeMerchandiseSubtotal = coffeeSubtotal;
  if (creditApplied > 0) return { ...result, rewardEligible: false, rewardMerchandiseAmount: null, monetaryBasisStatus: "mixed_credit_allocation_unresolved" };
  result.rewardMerchandiseAmount = coffeeSubtotal;
  return result;
}

/** Frozen Owner policy. This allocates existing totals; it never calculates an entitlement,
 * checkout maximum, refund, reward rate, PV value, or credit restoration. */
export const ORIGINAL_ECONOMIC_ALLOCATION_POLICY = "original-proportional-ntd-v1" as const;
export const ORIGINAL_QUANTITY_ALLOCATION_POLICY = "cumulative-front-remainder-v1" as const;
export type OriginalRedemptionScope = {
  appliesToShipping: "no";
  /** The version used for the ORIGINAL credit decision, never today's version. */
  rulesVersion: number;
};
export type OrderEconomicAllocationResult =
  | { status: "manual_review_required"; schemaVersion: 1; reason: string }
  | { status: "resolved"; schemaVersion: 1; orderNumber: string;
      rewardAllocationPolicyVersion: typeof ORIGINAL_ECONOMIC_ALLOCATION_POLICY;
      redemptionAllocationPolicyVersion: typeof ORIGINAL_ECONOMIC_ALLOCATION_POLICY;
      quantityAllocationPolicyVersion: typeof ORIGINAL_QUANTITY_ALLOCATION_POLICY;
      sourceFingerprint: string; allocationFingerprint: string;
      redemptionScope: OriginalRedemptionScope | null;
      /** Maps directly to original order.credit.appliedAmount, not an eligibility cap. */
      actualRedemptionUsed: number; creditReservationId: string | null;
      merchandiseSubtotal: number; remainingPaidMerchandiseTotal: number;
      rewardBasis: { status: "resolved"; authority: "orderRewardBasis"; total: number }
        | { status: "not_applicable" } | { status: "manual_review_required"; reason: string };
      lines: Array<{ returnLineRef: string; originalQuantity: number; originalTransactionBasis: number;
        redemptionEligibleBasis: number; allocatedActualRedemption: number; remainingPaidContribution: number;
        rewardEligibleBasis: number; rewardEconomicContribution: number | null }> };
export type ResolvedOrderEconomicAllocation = Extract<OrderEconomicAllocationResult, { status: "resolved" }>;

function economicJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(economicJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => [key, economicJson(item)]));
  return value;
}
export function originalEconomicFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(economicJson(value))).digest("hex");
}
function money(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function exactMoneySum(values: number[]) {
  const total = values.reduce((sum, value) => sum + BigInt(value), BigInt(0));
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("unsafe_money_total");
  return Number(total);
}

/** Largest rational remainders, then UTF-16 returnLineRef order; no floating products. */
function apportionOriginalMoney(total: number, pool: Array<{ returnLineRef: string; basis: number }>, capacities?: Map<string, number>) {
  if (!money(total) || pool.some(line => !money(line.basis))
    || new Set(pool.map(line => line.returnLineRef)).size !== pool.length) throw new Error("invalid_allocation_pool");
  const denominator = BigInt(exactMoneySum(pool.map(line => line.basis)));
  if (!denominator && total) throw new Error("missing_eligible_basis");
  const shares = pool.map(line => {
    const numerator = BigInt(total) * BigInt(line.basis);
    return { ...line, amount: denominator ? Number(numerator / denominator) : 0,
      remainder: denominator ? numerator % denominator : BigInt(0) };
  });
  const ranked = [...shares].sort((a, b) => a.remainder > b.remainder ? -1 : a.remainder < b.remainder ? 1
    : a.returnLineRef < b.returnLineRef ? -1 : a.returnLineRef > b.returnLineRef ? 1 : 0);
  const remaining = total - exactMoneySum(shares.map(line => line.amount));
  // A proven order discount may have rounded a line's merchandise capacity down.
  // Skip an exhausted line rather than allocating more credit than it transacted.
  const available = ranked.filter(line => !capacities || line.amount < capacities.get(line.returnLineRef)!);
  if (remaining > available.length) throw new Error("inconsistent_allocation_capacity");
  for (let index = 0; index < remaining; index++) available[index].amount++;
  return new Map(shares.map(line => [line.returnLineRef, line.amount]));
}

/** Only preserved transaction snapshots are accepted here. No IO, clock or active rules.
 * A recognized subscription pricing snapshot proves an order discount; an unexplained
 * line/subtotal difference is not silently treated as a discount. */
export function snapshotOrderEconomicAllocation(
  evidence: ReturnLineEvidenceResult, originalScope: OriginalRedemptionScope | null = null,
): OrderEconomicAllocationResult {
  const manual = (reason: string): OrderEconomicAllocationResult => ({ status: "manual_review_required", schemaVersion: 1, reason });
  if (evidence.status !== "resolved") return manual("missing_original_line_evidence");
  try {
    const order = evidence.transactionSnapshot;
    if (!money(order.subtotal) || !money(order.shipping) || !money(order.total)
      || (order.codServiceFee !== undefined && !money(order.codServiceFee))) return manual("missing_original_transaction_totals");
    const rawCredit = order.credit as Record<string, unknown> | undefined;
    const pricing = order.pricingSnapshot as Record<string, unknown> | undefined;
    if (rawCredit !== undefined && (!rawCredit || typeof rawCredit !== "object" || Array.isArray(rawCredit)
      || !money(rawCredit.appliedAmount))) return manual("missing_actual_redemption");
    const actualRedemptionUsed = rawCredit ? rawCredit.appliedAmount as number : 0;
    const beforeCredit = exactMoneySum([order.subtotal, order.shipping, (order.codServiceFee ?? 0) as number]);
    if (beforeCredit - actualRedemptionUsed !== order.total
      || (order.totalBeforeCredit !== undefined && order.totalBeforeCredit !== beforeCredit)
      || (pricing?.creditReserved !== undefined && pricing.creditReserved !== actualRedemptionUsed)
      || (pricing?.finalAmount !== undefined && pricing.finalAmount !== order.total)
      || (rawCredit?.status === "released" && actualRedemptionUsed > 0)) return manual("inconsistent_actual_redemption");
    // Missing credit is a provable zero only when the original totals agree without it.
    if (actualRedemptionUsed > order.subtotal) return manual("redemption_non_merchandise_scope");
    let redemptionScope: OriginalRedemptionScope | null = null;
    if (actualRedemptionUsed && order.shipping > 0) {
      if (!originalScope || originalScope.appliesToShipping !== "no" || !Number.isSafeInteger(originalScope.rulesVersion)
        || originalScope.rulesVersion < 1 || rawCredit?.rulesVersion !== originalScope.rulesVersion) return manual("unproven_original_redemption_scope");
      redemptionScope = structuredClone(originalScope);
    }
    const gross = evidence.lines.map(line => {
      const value = line.snapshot.lineTotal ?? Number(line.snapshot.unitPrice) * line.originalQuantity;
      if (!money(value) || !money(line.snapshot.unitPrice) || !Number.isSafeInteger(line.originalQuantity)
        || line.originalQuantity < 1) throw new Error("invalid_integer_transaction_basis");
      return { returnLineRef: line.returnLineRef, basis: value };
    });
    const grossTotal = exactMoneySum(gross.map(line => line.basis));
    if (grossTotal !== order.subtotal) {
      const selected = pricing?.selectedPriceSource === "subscription" ? pricing.subscriptionPrice
        : pricing?.selectedPriceSource === "campaign" ? pricing.campaignPrice : undefined;
      if (!pricing || pricing.currency !== "TWD" || pricing.merchandiseOriginal !== grossTotal
        || selected !== order.subtotal || order.subtotal > grossTotal) return manual("ambiguous_original_adjustment");
    }
    const merchandise = apportionOriginalMoney(order.subtotal, gross);
    const redemption = apportionOriginalMoney(actualRedemptionUsed, gross, merchandise);
    const basis = resolveOrderRewardBasis({ ...order, items: evidence.lines.map(line => line.snapshot) });
    const rewardBasis: ResolvedOrderEconomicAllocation["rewardBasis"] = basis.monetaryBasisStatus !== "resolved"
      ? { status: "manual_review_required", reason: basis.monetaryBasisStatus }
      : !basis.rewardEligible ? { status: "not_applicable" }
      : money(basis.rewardMerchandiseAmount) ? { status: "resolved", authority: "orderRewardBasis", total: basis.rewardMerchandiseAmount }
      : { status: "manual_review_required", reason: "invalid_original_reward_basis" };
    const eligible = new Set(evidence.lines.filter(line => line.snapshot.domain === undefined || line.snapshot.domain === "coffee")
      .map(line => line.returnLineRef));
    const pool = gross.map(line => ({ ...line, basis: eligible.has(line.returnLineRef) ? line.basis : 0 }));
    const paid = new Map(gross.map(line => [line.returnLineRef, merchandise.get(line.returnLineRef)! - redemption.get(line.returnLineRef)!]));
    // Complementary rounding preserves transaction = redemption + paid for every line.
    // When the authority is precisely this paid pool, reuse its conserved allocation.
    const reward = rewardBasis.status === "resolved"
      ? rewardBasis.total === exactMoneySum(pool.map(line => eligible.has(line.returnLineRef) ? paid.get(line.returnLineRef)! : 0))
        ? new Map(pool.map(line => [line.returnLineRef, eligible.has(line.returnLineRef) ? paid.get(line.returnLineRef)! : 0]))
        : apportionOriginalMoney(rewardBasis.total, pool)
      : null;
    const payload = {
      status: "resolved" as const, schemaVersion: 1 as const, orderNumber: evidence.orderNumber,
      rewardAllocationPolicyVersion: ORIGINAL_ECONOMIC_ALLOCATION_POLICY,
      redemptionAllocationPolicyVersion: ORIGINAL_ECONOMIC_ALLOCATION_POLICY,
      quantityAllocationPolicyVersion: ORIGINAL_QUANTITY_ALLOCATION_POLICY,
      sourceFingerprint: originalEconomicFingerprint(evidence), redemptionScope,
      actualRedemptionUsed, creditReservationId: typeof rawCredit?.reservationId === "string" ? rawCredit.reservationId : null,
      merchandiseSubtotal: order.subtotal, remainingPaidMerchandiseTotal: order.subtotal - actualRedemptionUsed, rewardBasis,
      lines: evidence.lines.map((line, index) => ({ returnLineRef: line.returnLineRef, originalQuantity: line.originalQuantity,
        originalTransactionBasis: gross[index].basis, redemptionEligibleBasis: merchandise.get(line.returnLineRef)!,
        allocatedActualRedemption: redemption.get(line.returnLineRef)!, remainingPaidContribution: paid.get(line.returnLineRef)!,
        rewardEligibleBasis: pool[index].basis, rewardEconomicContribution: reward?.get(line.returnLineRef) ?? null })),
    };
    return { ...payload, allocationFingerprint: originalEconomicFingerprint(payload) };
  } catch (error) { return manual(error instanceof Error ? error.message : "invalid_original_economic_evidence"); }
}

/** Allocate an existing monetary snapshot total over the already-proven reward pool.
 * Callers must identify the existing authority; this is not a reward calculator. */
export function allocatePreservedRewardMoney(evidence: ResolvedOrderEconomicAllocation, total: number) {
  if (evidence.rewardBasis.status === "manual_review_required" || !money(total)) throw new Error("unproven_reward_money_authority");
  if (evidence.rewardBasis.status === "not_applicable" && total !== 0) throw new Error("ineligible_reward_money_authority");
  const paidTotal = exactMoneySum(evidence.lines.filter(line => line.rewardEligibleBasis > 0).map(line => line.remainingPaidContribution));
  const allocated = total === paidTotal
    ? new Map(evidence.lines.map(line => [line.returnLineRef, line.rewardEligibleBasis > 0 ? line.remainingPaidContribution : 0]))
    : apportionOriginalMoney(total, evidence.lines.map(line => ({ returnLineRef: line.returnLineRef, basis: line.rewardEligibleBasis })));
  return evidence.lines.map(line => ({ returnLineRef: line.returnLineRef, originalQuantity: line.originalQuantity,
    rewardEconomicContribution: allocated.get(line.returnLineRef)! }));
}

/** Unit ordinals are fixed, never request-local. The first remainder units receive
 * NT$1. Differences of these cumulative values are retry-stable attributable input,
 * not an execution ledger and not permission to issue a refund or reversal. */
export function cumulativeOriginalLineContribution(total: number, originalQuantity: number, cumulativeQuantity: number) {
  if (!money(total) || !Number.isSafeInteger(originalQuantity) || originalQuantity < 1
    || !Number.isSafeInteger(cumulativeQuantity) || cumulativeQuantity < 0 || cumulativeQuantity > originalQuantity) throw new Error("invalid_cumulative_quantity");
  const amount = BigInt(total), quantity = BigInt(originalQuantity), returned = BigInt(cumulativeQuantity);
  const remainder = amount % quantity;
  return Number((amount / quantity) * returned + (returned < remainder ? returned : remainder));
}
export function incrementalOriginalLineContribution(total: number, originalQuantity: number, previousQuantity: number, newQuantity: number) {
  if (newQuantity < previousQuantity) throw new Error("decreasing_cumulative_quantity");
  return cumulativeOriginalLineContribution(total, originalQuantity, newQuantity)
    - cumulativeOriginalLineContribution(total, originalQuantity, previousQuantity);
}
