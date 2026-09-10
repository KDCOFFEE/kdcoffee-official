import {
  isBeanSubscriptionItem,
  MEMBER_SUBSCRIPTION_MAX_ITEMS,
  type PricedSubscriptionItem,
} from "@/lib/subscriptionItemTypes";

export type MemberSubscriptionSkuOption = {
  skuId: string;
  kind: "beans" | "drip";
  label: string;
  detail: string;
  price: number;
};

export type MemberSubscriptionProduct = {
  id: string;
  name: string;
  roast: string;
  options: MemberSubscriptionSkuOption[];
};

export function effectiveMemberSubscriptionItemLimit(configuredLimit?: number) {
  const validConfiguredLimit = Number.isSafeInteger(configuredLimit) && Number(configuredLimit) > 0
    ? Number(configuredLimit)
    : MEMBER_SUBSCRIPTION_MAX_ITEMS;
  return Math.min(validConfiguredLimit, MEMBER_SUBSCRIPTION_MAX_ITEMS);
}

type EditorIdentity = {
  localKey: string;
  persistedItemId?: string;
  originalKind?: "beans" | "drip";
  originalPackageWeight?: "half-pound" | "one-pound";
};

export type BeanEditorItem = EditorIdentity & {
  kind: "beans";
  packageWeight: "half-pound" | "one-pound";
  quantity: number;
  roast: string;
  components: Array<{ productId: string; skuId: string }>;
};

export type DripEditorItem = EditorIdentity & {
  kind: "drip";
  productId: string;
  skuId: string;
  quantity: number;
};

export type SubscriptionEditorItem = BeanEditorItem | DripEditorItem;

export const subscriptionPrice = (value: number, percent: number) =>
  Math.floor((value * percent + 50) / 100);

export function skuOption(
  products: MemberSubscriptionProduct[],
  productId: string,
  skuId: string,
  kind?: "beans" | "drip",
) {
  const product = products.find((entry) => entry.id === productId);
  const option = product?.options.find((entry) => entry.skuId === skuId && (!kind || entry.kind === kind));
  return product && option ? { product, option } : null;
}

function firstChoice(products: MemberSubscriptionProduct[], kind: "beans" | "drip", allowedProductIds?: Set<string>) {
  for (const product of products) {
    if (allowedProductIds && !allowedProductIds.has(product.id)) continue;
    const option = product.options.find((entry) => entry.kind === kind);
    if (option) return { productId: product.id, skuId: option.skuId };
  }
  return { productId: "", skuId: "" };
}

function componentFromStored(
  component: { productId: string; skuId?: string },
  products: MemberSubscriptionProduct[],
) {
  if (component.skuId) return { productId: component.productId, skuId: component.skuId };
  const product = products.find((entry) => entry.id === component.productId);
  const beanOptions = product?.options.filter((entry) => entry.kind === "beans") ?? [];
  return { productId: component.productId, skuId: beanOptions.length === 1 ? beanOptions[0].skuId : "" };
}

export function initializeSubscriptionEditorItems(
  items: PricedSubscriptionItem[],
  products: MemberSubscriptionProduct[],
  localKey: (itemId: string, index: number) => string = (itemId, index) => `persisted:${itemId}:${index}`,
): SubscriptionEditorItem[] {
  return items.map((item, index) => {
    const identity: EditorIdentity = {
      localKey: localKey(item.itemId, index),
      persistedItemId: item.itemId,
      originalKind: item.skuKind === "drip" ? "drip" : "beans",
      originalPackageWeight: isBeanSubscriptionItem(item) ? item.packageWeight : undefined,
    };
    if (item.skuKind === "drip") {
      return { ...identity, kind: "drip", productId: item.productId, skuId: item.skuId, quantity: item.quantity };
    }
    return {
      ...identity,
      kind: "beans",
      packageWeight: item.packageWeight,
      quantity: item.quantity,
      roast: item.roast,
      components: item.components.map((component) => componentFromStored(component, products)),
    };
  });
}

export function createSubscriptionEditorItem(
  kind: "beans" | "drip",
  products: MemberSubscriptionProduct[],
  localKey: string,
  allowedProductIds?: Set<string>,
): SubscriptionEditorItem {
  const choice = firstChoice(products, kind, allowedProductIds);
  if (kind === "drip") return { localKey, kind, productId: choice.productId, skuId: choice.skuId, quantity: 1 };
  return { localKey, kind, packageWeight: "half-pound", quantity: 1, roast: "淺中焙", components: [choice] };
}

export function changeSubscriptionEditorItemKind(
  item: SubscriptionEditorItem,
  kind: "beans" | "drip",
  products: MemberSubscriptionProduct[],
  allowedProductIds?: Set<string>,
): SubscriptionEditorItem {
  if (item.kind === kind) return item;
  const replacement = createSubscriptionEditorItem(kind, products, item.localKey, allowedProductIds);
  return {
    ...replacement,
    persistedItemId: item.persistedItemId,
    originalKind: item.originalKind,
    originalPackageWeight: item.originalPackageWeight,
    quantity: item.quantity,
  };
}

export function changeBeanPackageWeight(item: BeanEditorItem, packageWeight: "half-pound" | "one-pound") {
  if (packageWeight === item.packageWeight) return item;
  if (packageWeight === "half-pound") return { ...item, packageWeight, components: item.components.slice(0, 1) };
  const first = item.components[0] ?? { productId: "", skuId: "" };
  return { ...item, packageWeight, components: [first, item.components[1] ?? { ...first }] };
}

export function removeSubscriptionEditorItem(items: SubscriptionEditorItem[], localKey: string) {
  return items.filter((item) => item.localKey !== localKey);
}

export function subscriptionEditorItemError(item: SubscriptionEditorItem, products: MemberSubscriptionProduct[]) {
  if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 12) return "數量必須是 1 到 12。";
  if (item.kind === "drip") {
    return skuOption(products, item.productId, item.skuId, "drip") ? "" : "原耳掛商品或 SKU 已無法供應，請選擇新的耳掛規格。";
  }
  if (!item.roast) return "請選擇咖啡豆烘焙度。";
  if (item.components.length !== (item.packageWeight === "one-pound" ? 2 : 1)) return "咖啡豆組合不完整。";
  return item.components.every((component) => skuOption(products, component.productId, component.skuId, "beans"))
    ? ""
    : "原咖啡豆商品或 SKU 已無法供應，請選擇新的咖啡豆規格。";
}

export function subscriptionEditorPayload(items: SubscriptionEditorItem[]) {
  return items.map((item) => item.kind === "drip"
    ? {
        ...(item.persistedItemId ? { itemId: item.persistedItemId } : {}),
        skuKind: "drip" as const,
        productId: item.productId,
        skuId: item.skuId,
        quantity: item.quantity,
      }
    : {
        ...(item.persistedItemId ? { itemId: item.persistedItemId } : {}),
        skuKind: "beans" as const,
        packageWeight: item.packageWeight,
        quantity: item.quantity,
        roast: item.roast,
        components: item.components.map((component) => ({ ...component })),
      });
}

export function subscriptionEditorItemPrices(item: SubscriptionEditorItem, products: MemberSubscriptionProduct[], discountPercent: number) {
  const selections = item.kind === "drip"
    ? [skuOption(products, item.productId, item.skuId, "drip")]
    : item.components.map((component) => skuOption(products, component.productId, component.skuId, "beans"));
  const valid = selections.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const regularUnit = valid.length === selections.length ? valid.reduce((sum, entry) => sum + entry.option.price, 0) : null;
  return {
    selections: valid.map((entry) => ({ productName: entry.product.name, ...entry.option })),
    regularUnit,
    subscriptionUnit: regularUnit == null ? null : subscriptionPrice(regularUnit, discountPercent),
    regularLine: regularUnit == null ? null : regularUnit * item.quantity,
    subscriptionLine: regularUnit == null ? null : subscriptionPrice(regularUnit * item.quantity, discountPercent),
  };
}

export function subscriptionItemsSummary(items: PricedSubscriptionItem[], products: MemberSubscriptionProduct[]) {
  return items.map((item) => {
    if (item.skuKind === "drip") {
      const selected = skuOption(products, item.productId, item.skuId, "drip");
      return selected ? `${selected.product.name}・${selected.option.label} × ${item.quantity}` : `已無法供應的耳掛商品 × ${item.quantity}`;
    }
    const names = item.components.map((component) => skuOption(products, component.productId, component.skuId ?? "", "beans")?.product.name ?? products.find((product) => product.id === component.productId)?.name ?? "已無法供應的咖啡豆");
    return `${names.join(" + ")}・${item.packageWeight === "one-pound" ? "一磅" : "半磅"} × ${item.quantity}`;
  }).join("、");
}
