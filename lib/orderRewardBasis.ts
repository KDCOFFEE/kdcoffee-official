import "server-only";

type Item = Record<string, unknown>;
export type OrderRewardBasisStatus = "resolved" | "mixed_credit_allocation_unresolved" | "unknown_domain" | "invalid_mixed_snapshot";
export type OrderRewardBasis = {
  coffeeItems: Item[]; hasStore: boolean; coffeeEligible: boolean;
  coffeeEligibleQuantity: number; coffeeBasePV: number; coffeeEffectivePV: number;
  coffeeValidConsumptionPV: number; coffeeMerchandiseSubtotal: number | null;
  rewardMerchandiseAmount: number | null; creditApplied: number;
  monetaryBasisStatus: OrderRewardBasisStatus;
};

/** Read-only classification. Missing legacy domain means Coffee; explicit unknown values never do. */
export function resolveOrderRewardBasis(order: Record<string, unknown>): OrderRewardBasis {
  const items = Array.isArray(order.items) ? order.items : [];
  const coffeeItems: Item[] = [];
  let hasStore = false, unknown = false;
  for (const raw of items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { unknown = true; continue; }
    const item = raw as Item;
    if (item.domain === undefined || item.domain === "coffee") coffeeItems.push(item);
    else if (item.domain === "store") hasStore = true;
    else unknown = true;
  }
  const credit = order.credit && typeof order.credit === "object" ? order.credit as Item : undefined;
  const creditApplied = Math.max(0, Number(credit?.appliedAmount || 0));
  const result: OrderRewardBasis = {
    coffeeItems, hasStore, coffeeEligible: !unknown && (!hasStore || coffeeItems.length > 0),
    coffeeEligibleQuantity: coffeeItems.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0),
    coffeeBasePV: coffeeItems.reduce((sum, item) => sum + Math.max(0, Number(item.basePV || 0)) * Math.max(1, Number(item.quantity || 1)), 0),
    // Preserve the distinct, existing fulfillment and qualification zero-PV semantics.
    coffeeEffectivePV: coffeeItems.reduce((sum, item) => sum + Math.max(0, Number(item.effectivePV || item.basePV || 0)) * Math.max(1, Number(item.quantity || 1)), 0),
    coffeeValidConsumptionPV: coffeeItems.reduce((sum, item) => sum + Math.max(0, Number(item.effectivePV ?? item.basePV ?? 0)) * Math.max(1, Number(item.quantity || 1)), 0),
    coffeeMerchandiseSubtotal: 0, rewardMerchandiseAmount: 0, creditApplied,
    monetaryBasisStatus: "resolved",
  };
  if (unknown) return { ...result, coffeeEligible: false, coffeeEligibleQuantity: 0, coffeeBasePV: 0,
    coffeeEffectivePV: 0, coffeeValidConsumptionPV: 0, coffeeMerchandiseSubtotal: null,
    rewardMerchandiseAmount: null, monetaryBasisStatus: "unknown_domain" };
  if (!hasStore) {
    result.coffeeMerchandiseSubtotal = Math.max(0, Number(order.subtotal || 0));
    result.rewardMerchandiseAmount = Math.max(0, Number(order.subtotal || 0) - creditApplied);
    return result;
  }
  if (!coffeeItems.length) return result;
  let coffeeSubtotal = 0, allSubtotal = 0;
  for (const raw of items) {
    const item = raw as Item, amount = item.lineTotal;
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
      return { ...result, coffeeEligible: false, coffeeMerchandiseSubtotal: null, rewardMerchandiseAmount: null, monetaryBasisStatus: "invalid_mixed_snapshot" };
    }
    allSubtotal += amount;
    if (item.domain === undefined || item.domain === "coffee") coffeeSubtotal += amount;
  }
  if (!Number.isSafeInteger(allSubtotal) || !Number.isSafeInteger(coffeeSubtotal)
    || allSubtotal !== order.subtotal || !Number.isSafeInteger(creditApplied)) {
    return { ...result, coffeeEligible: false, coffeeMerchandiseSubtotal: null, rewardMerchandiseAmount: null, monetaryBasisStatus: "invalid_mixed_snapshot" };
  }
  result.coffeeMerchandiseSubtotal = coffeeSubtotal;
  if (creditApplied > 0) return { ...result, rewardMerchandiseAmount: null, monetaryBasisStatus: "mixed_credit_allocation_unresolved" };
  result.rewardMerchandiseAmount = coffeeSubtotal;
  return result;
}
