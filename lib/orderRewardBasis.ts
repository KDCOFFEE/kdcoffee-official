import "server-only";
import { readStoreOrderPV } from "./commerceOrderTypes";

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
