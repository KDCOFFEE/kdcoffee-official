import { addDateOnlyDays } from "./checkoutRules";
import { isBeanSubscriptionItem, type SubscriptionItem } from "./subscriptionItemTypes";

export const DEDICATED_ROAST_MIN_HALF_POUND_UNITS = 4;
export const DEDICATED_ROAST_STANDARD_PREPARATION_DAYS = 3;

export type BeanCompositionQuantity = {
  quantity: number;
  components: ReadonlyArray<{ productId: string; weightHalfPounds?: number }>;
};

export function beanHalfPoundUnitsByProduct(items: ReadonlyArray<BeanCompositionQuantity>) {
  const totals = new Map<string, number>();
  for (const item of items) {
    for (const component of item.components) {
      const productId = String(component.productId || "").trim();
      if (!productId) continue;
      const halfPoundUnits = Number(component.weightHalfPounds ?? 1) * Number(item.quantity);
      totals.set(productId, (totals.get(productId) ?? 0) + halfPoundUnits);
    }
  }
  return totals;
}

export function subscriptionBeanHalfPoundUnitsByProduct(items: ReadonlyArray<SubscriptionItem>) {
  return beanHalfPoundUnitsByProduct(items.filter(isBeanSubscriptionItem));
}

export function subscriptionHasDedicatedRoast(items: ReadonlyArray<SubscriptionItem>) {
  return items.some((item) => isBeanSubscriptionItem(item) && item.components.some((component) => component.customRoast === true));
}

export function dedicatedRoastRushRequired(input: { hasDedicatedRoast: boolean; plannedDate: string; today: string }) {
  return input.hasDedicatedRoast
    && input.plannedDate < addDateOnlyDays(input.today, DEDICATED_ROAST_STANDARD_PREPARATION_DAYS);
}
