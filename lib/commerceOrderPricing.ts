import { CommerceOrderResolutionError, type ResolvedCommerceOrderLine } from "./commerceOrderTypes";

/** Integer TWD contract: reject fractions/overflow; never silently round or coerce. */
export function commerceOrderMoney(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new CommerceOrderResolutionError("PRICE_RESOLUTION_FAILED");
  }
  return value;
}
export function commerceOrderLineTotal(unitPrice: number, quantity: number): number {
  commerceOrderMoney(unitPrice);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new CommerceOrderResolutionError("INVALID_ITEM");
  }
  return commerceOrderMoney(unitPrice * quantity);
}
/** Server-resolved lines only. No shipping, credit, coupon, reward or inventory side effects. */
export function priceResolvedCommerceOrderItems(lines: readonly ResolvedCommerceOrderLine[]): {
  itemsSubtotal: number;
} {
  let itemsSubtotal = 0;
  for (const line of lines) {
    const amount = commerceOrderLineTotal(line.unitPrice, line.quantity);
    if (line.lineTotal !== amount) throw new CommerceOrderResolutionError("PRICE_RESOLUTION_FAILED");
    itemsSubtotal = commerceOrderMoney(itemsSubtotal + amount);
  }
  return { itemsSubtotal };
}
