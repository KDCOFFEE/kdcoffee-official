export const MEMBER_SUBSCRIPTION_MAX_ITEMS = 20;

export type CompositionComponent = {
  productId: string;
  skuId?: string;
  weightHalfPounds: 1;
  customRoast?: boolean;
  roastLevel?: string;
};

export type BeanSubscriptionItem = {
  itemId: string;
  /** Missing skuKind is the persisted legacy bean representation. */
  skuKind?: "beans";
  packageWeight: "half-pound" | "one-pound";
  quantity: number;
  /** Configured/default roast snapshot. Dedicated roast is recorded per component. */
  roast: string;
  components: CompositionComponent[];
};

export type DripSubscriptionItem = {
  itemId: string;
  skuKind: "drip";
  productId: string;
  skuId: string;
  quantity: number;
};

export type SubscriptionItem = BeanSubscriptionItem | DripSubscriptionItem;
export type PricedSubscriptionItem = SubscriptionItem & { unitPrice: number };

export function isBeanSubscriptionItem(item: SubscriptionItem): item is BeanSubscriptionItem {
  return item.skuKind !== "drip";
}
