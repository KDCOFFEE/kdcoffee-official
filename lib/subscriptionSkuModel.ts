import type { PurchaseOption, WebsiteData } from "../data/websiteData";
import { isAllowedRoastLevel } from "./checkoutRules";
import type { MembershipBusinessRules } from "./membershipBusinessRules";
import {
  isBeanSubscriptionItem,
  validateSubscriptionItem,
  type BeanSubscriptionItem,
  type CompositionComponent,
  type SubscriptionItem,
} from "./membershipPolicies";
import type { RequestedItem } from "./orderPricing";
import { MEMBER_SUBSCRIPTION_MAX_ITEMS } from "./subscriptionItemTypes";
import {
  DEDICATED_ROAST_MIN_HALF_POUND_UNITS,
  DEDICATED_ROAST_STANDARD_PREPARATION_DAYS,
  subscriptionBeanHalfPoundUnitsByProduct,
} from "./subscriptionRoastPolicy";

export { MEMBER_SUBSCRIPTION_MAX_ITEMS } from "./subscriptionItemTypes";

export type PricedSubscriptionItem = SubscriptionItem & { unitPrice: number };

type Product = WebsiteData["menu"]["products"][number];
type ResolvedSku = { product: Product; sku: PurchaseOption & { id: string } };

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function productSkuSource(product: Product) {
  return Array.isArray(product.skus) && product.skus.length ? product.skus : product.purchase;
}

function activeProduct(website: WebsiteData, productId: string) {
  const product = website.menu.products.find((entry) =>
    entry.slug === productId &&
    entry.active !== false &&
    entry.purchasable !== false &&
    !["hidden", "sold_out", "discontinued", "coming_soon"].includes(String(entry.status || "active")),
  );
  if (!product) throw new Error(`找不到可用的定期購商品：${productId}`);
  return product;
}

function hasUsableStock(sku: PurchaseOption) {
  return sku.stock == null || (Number.isInteger(sku.stock) && sku.stock > 0);
}

export function resolveSubscriptionSku(input: {
  website: WebsiteData;
  productId: string;
  skuId?: string;
  kind: "beans" | "drip";
  requireStock?: boolean;
}): ResolvedSku {
  const product = activeProduct(input.website, input.productId);
  const candidates = productSkuSource(product).filter((sku) =>
    sku.enabled !== false &&
    sku.kind === input.kind &&
    typeof sku.id === "string" &&
    sku.id.trim() &&
    (!input.requireStock || hasUsableStock(sku)),
  ) as Array<PurchaseOption & { id: string }>;

  if (input.skuId) {
    const sku = candidates.find((entry) => entry.id === input.skuId);
    if (!sku) throw new Error(`${product.name} 找不到指定的 ${input.kind === "drip" ? "耳掛" : "咖啡豆"} SKU：${input.skuId}`);
    return { product, sku };
  }

  if (candidates.length !== 1) {
    throw new Error(`${product.name} 找不到唯一可用的${input.kind === "drip" ? "耳掛" : "半磅咖啡豆"} SKU`);
  }
  return { product, sku: candidates[0] };
}

function resolveStoredOrderSku(website: WebsiteData, item: Record<string, unknown>) {
  const productId = String(item.slug || "").trim();
  const product = activeProduct(website, productId);
  const source = productSkuSource(product).filter((sku) => sku.enabled !== false);
  const optionId = String(item.optionId || "").trim();
  const optionLabel = String(item.optionLabel || "").trim();
  const matches = optionId
    ? source.filter((sku) => sku.id === optionId)
    : source.filter((sku) => sku.label === optionLabel);
  const sku = matches.length === 1 ? matches[0] : undefined;
  if (!sku || typeof sku.id !== "string" || !sku.id.trim() || (sku.kind !== "beans" && sku.kind !== "drip")) {
    throw new Error(`${product.name} 的訂單 SKU 無法安全轉為定期購`);
  }
  return { product, sku: sku as PurchaseOption & { id: string; kind: "beans" | "drip" } };
}

function positiveIntegerMoney(value: unknown, label: string) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`${label}不正確`);
  return amount;
}

/** Converts already-priced stored order lines without trusting their display labels for SKU kind. */
export function subscriptionItemsFromStoredOrderItems(
  storedItems: Array<Record<string, unknown>>,
  website: WebsiteData,
): PricedSubscriptionItem[] {
  if (!storedItems.length) throw new Error("訂單沒有可建立定期購的商品");
  return storedItems.map((item, index) => {
    const { product, sku } = resolveStoredOrderSku(website, item);
    const quantity = Number(item.quantity);
    const unitPrice = positiveIntegerMoney(item.unitPrice, "訂單商品價格");
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) throw new Error("訂單商品數量不正確");

    if (sku.kind === "drip") {
      return {
        ...validateSubscriptionItem({
          itemId: `drip:${product.slug}:${sku.id}:${index}`,
          skuKind: "drip",
          productId: product.slug,
          skuId: sku.id,
          quantity,
        }),
        unitPrice,
      };
    }

    const structuredComponents = Array.isArray(item.subscriptionComponents)
      ? item.subscriptionComponents.map(record)
      : [];
    const onePound = item.packageWeight === "one-pound" && structuredComponents.length === 2;
    const components: CompositionComponent[] = onePound
      ? structuredComponents.map((component) => {
          const resolved = resolveSubscriptionSku({
            website,
            productId: String(component.productId || ""),
            skuId: String(component.skuId || "") || undefined,
            kind: "beans",
          });
          return {
            productId: resolved.product.slug,
            skuId: resolved.sku.id,
            weightHalfPounds: 1,
            ...(item.customRoast === true ? { customRoast: true as const, roastLevel: String(item.roastLevel || "").trim() } : {}),
          };
        })
      : [{
          productId: product.slug,
          skuId: sku.id,
          weightHalfPounds: 1,
          ...(item.customRoast === true ? { customRoast: true as const, roastLevel: String(item.roastLevel || "").trim() } : {}),
        }];
    const packageWeight = onePound ? "one-pound" as const : "half-pound" as const;
    const componentProducts = components.map((component) => activeProduct(website, component.productId));
    const configuredRoasts = [...new Map(componentProducts.map((entry) => [entry.slug, {
      productName: entry.name,
      roast: String(entry.roast || "工作室建議").trim() || "工作室建議",
    }])).values()];
    return {
      ...validateSubscriptionItem({
        itemId: `beans:${packageWeight}:${components.map((component) => component.skuId).join("+")}:${index}`,
        skuKind: "beans",
        packageWeight,
        quantity,
        roast: configuredRoasts.length === 1
          ? configuredRoasts[0].roast
          : configuredRoasts.map((entry) => `${entry.productName}：${entry.roast}`).join("／"),
        components,
      }),
      unitPrice,
    };
  });
}

function beanProductIds(item: BeanSubscriptionItem) {
  return item.components.map((component) => component.productId);
}

export function subscriptionItemProductIds(item: SubscriptionItem) {
  return isBeanSubscriptionItem(item) ? beanProductIds(item) : [item.productId];
}

type AllocateSubscriptionItemId = (baseId: string) => string;

function resolveMemberBeanItem(rawItem: Record<string, unknown>, website: WebsiteData, persistedItemId: string | undefined, allocateItemId: AllocateSubscriptionItemId) {
  if (rawItem.customRoast != null || rawItem.roastLevel != null || rawItem.roastNote != null) throw new Error("專屬烘焙必須依咖啡品項設定");
  const packageWeight = rawItem.packageWeight === "one-pound" ? "one-pound" as const : rawItem.packageWeight === "half-pound" ? "half-pound" as const : null;
  if (!packageWeight) throw new Error("咖啡豆份量設定不正確");
  const rawComponents = Array.isArray(rawItem.components) ? rawItem.components.map(record) : [];
  const requiredComponents = packageWeight === "one-pound" ? 2 : 1;
  if (rawComponents.length !== requiredComponents) throw new Error(packageWeight === "one-pound" ? "一磅必須由兩個半磅作品組成" : "半磅必須包含一個半磅作品");
  const resolved = rawComponents.map((component) => resolveSubscriptionSku({
    website,
    productId: String(component.productId || "").trim(),
    skuId: String(component.skuId || "").trim() || undefined,
    kind: "beans",
    requireStock: true,
  }));
  const components = resolved.map(({ product, sku }, componentIndex) => {
    const requested = rawComponents[componentIndex];
    if ((requested.customRoast != null && typeof requested.customRoast !== "boolean") || (requested.customRoast !== true && requested.roastLevel != null)) throw new Error("專屬烘焙設定不正確");
    return {
      productId: product.slug,
      skuId: sku.id,
      weightHalfPounds: 1 as const,
      ...(requested.customRoast === true ? { customRoast: true as const, roastLevel: String(requested.roastLevel || "").trim() } : {}),
    };
  });
  const configuredRoasts = [...new Map(resolved.map(({ product }) => [product.slug, {
    productName: product.name,
    roast: String(product.roast || "工作室建議").trim() || "工作室建議",
  }])).values()];
  const roast = configuredRoasts.length === 1
    ? configuredRoasts[0].roast
    : configuredRoasts.map((entry) => `${entry.productName}：${entry.roast}`).join("／");
  const quantity = Number(rawItem.quantity);
  const itemId = persistedItemId ?? allocateItemId(`beans:${packageWeight}:${components.map((component) => component.skuId).join("+")}`);
  const item = validateSubscriptionItem({
    itemId,
    skuKind: "beans",
    packageWeight,
    quantity,
    roast,
    components,
  });
  return { ...item, unitPrice: resolved.reduce((sum, entry) => sum + positiveIntegerMoney(entry.sku.price, "SKU 價格"), 0) };
}

function resolveMemberDripItem(rawItem: Record<string, unknown>, website: WebsiteData, persistedItemId: string | undefined, allocateItemId: AllocateSubscriptionItemId) {
  if (rawItem.customRoast != null || rawItem.roastLevel != null || rawItem.roastNote != null) throw new Error("耳掛咖啡不可使用專屬烘焙");
  const productId = String(rawItem.productId || "").trim();
  const skuId = String(rawItem.skuId || "").trim();
  if (!skuId) throw new Error("耳掛定期購商品必須指定 SKU");
  const { product, sku } = resolveSubscriptionSku({ website, productId, skuId, kind: "drip", requireStock: true });
  const itemId = persistedItemId ?? allocateItemId(`drip:${product.slug}:${sku.id}`);
  const item = validateSubscriptionItem({
    itemId,
    skuKind: "drip",
    productId: product.slug,
    skuId: sku.id,
    quantity: Number(rawItem.quantity),
  });
  return { ...item, unitPrice: positiveIntegerMoney(sku.price, "SKU 價格") };
}

export function resolveMemberSubscriptionItems(input: {
  items: unknown;
  currentItems: PricedSubscriptionItem[];
  website: WebsiteData;
  rules: MembershipBusinessRules;
  legacyPositionalMatching?: boolean;
}) {
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > MEMBER_SUBSCRIPTION_MAX_ITEMS) throw new Error("定期購商品清單不正確");
  const rawItems = input.items.map(record);
  const currentById = new Map(input.currentItems.map((item) => [item.itemId, item]));
  const submittedExistingIds = new Set<string>();
  const reservedItemIds = new Set([
    ...input.currentItems.map((item) => item.itemId),
    ...rawItems.map((item) => String(item.itemId || "").trim()).filter(Boolean),
  ]);
  const allocateItemId: AllocateSubscriptionItemId = (baseId) => {
    let itemId = baseId;
    let suffix = 2;
    while (reservedItemIds.has(itemId)) {
      itemId = `${baseId}:${suffix}`;
      suffix += 1;
    }
    reservedItemIds.add(itemId);
    return itemId;
  };
  const currentMatches = rawItems.map((rawItem, index) => {
    const requestedItemId = String(rawItem.itemId || "").trim();
    if (requestedItemId && currentById.has(requestedItemId)) return currentById.get(requestedItemId);
    return input.legacyPositionalMatching === true && !requestedItemId ? input.currentItems[index] : undefined;
  });
  const items = rawItems.map((rawItem, index) => {
    const requestedItemId = String(rawItem.itemId || "").trim();
    const persistedItemId = currentById.has(requestedItemId)
      ? requestedItemId
      : input.legacyPositionalMatching === true && !requestedItemId
        ? currentMatches[index]?.itemId
        : undefined;
    if (persistedItemId && submittedExistingIds.has(persistedItemId)) throw new Error("定期購商品識別重複");
    if (persistedItemId) submittedExistingIds.add(persistedItemId);
    if (rawItem.skuKind === "beans") return resolveMemberBeanItem(rawItem, input.website, persistedItemId, allocateItemId);
    if (rawItem.skuKind === "drip") return resolveMemberDripItem(rawItem, input.website, persistedItemId, allocateItemId);
    throw new Error("每個定期購商品都必須指定 beans 或 drip");
  });
  if (new Set(items.map((item) => item.itemId)).size !== items.length) throw new Error("定期購商品識別重複");
  if (items.some((item) => item.quantity > 12)) throw new Error("數量設定不正確");
  const halfPoundUnits = subscriptionBeanHalfPoundUnitsByProduct(items);
  const componentsByProduct = new Map<string, CompositionComponent[]>();
  for (const item of items) {
    if (!isBeanSubscriptionItem(item)) continue;
    for (const component of item.components) componentsByProduct.set(component.productId, [...(componentsByProduct.get(component.productId) ?? []), component]);
  }
  for (const [productId, components] of componentsByProduct) {
    const dedicated = components.filter((component) => component.customRoast === true);
    if (!dedicated.length) continue;
    if ((halfPoundUnits.get(productId) ?? 0) < DEDICATED_ROAST_MIN_HALF_POUND_UNITS) throw new Error("同一款咖啡需累積至少 2 磅才可使用專屬烘焙");
    if (dedicated.length !== components.length) throw new Error("同一款咖啡的專屬烘焙設定必須一致");
    const roastLevels = new Set(dedicated.map((component) => component.roastLevel));
    if (roastLevels.size !== 1 || !isAllowedRoastLevel(dedicated[0].roastLevel)) throw new Error("請選擇正確的專屬烘焙度");
  }

  if (!input.rules.subscription.allowQuantityChange && (
    items.length !== input.currentItems.length ||
    items.some((item, index) => item.quantity !== currentMatches[index]?.quantity)
  )) throw new Error("目前未開放修改數量");

  if (!input.rules.subscription.allowOtherSubscriptionProducts) {
    const currentProductIds = new Set(input.currentItems.flatMap(subscriptionItemProductIds));
    if (items.some((item) => subscriptionItemProductIds(item).some((productId) => !currentProductIds.has(productId)))) {
      throw new Error("目前未開放更換其他定期購作品");
    }
  }

  items.forEach((item, index) => {
    if (isBeanSubscriptionItem(item) && item.packageWeight === "one-pound" && item.components[0].productId !== item.components[1].productId && !input.rules.subscription.allowMixedOnePound) throw new Error("目前一磅只開放同款組合");
    const current = currentMatches[index];
    if (!current || !isBeanSubscriptionItem(current) || !isBeanSubscriptionItem(item)) return;
    if (current.packageWeight === "half-pound" && item.packageWeight === "one-pound" && !input.rules.subscription.allowHalfToOnePound) throw new Error("目前未開放半磅改為一磅");
    if (current.packageWeight === "one-pound" && item.packageWeight === "half-pound" && !input.rules.subscription.allowOneToHalfPound) throw new Error("目前未開放一磅改為半磅");
  });

  return items;
}

export function subscriptionItemsToRequestedItems(items: PricedSubscriptionItem[], website: WebsiteData): RequestedItem[] {
  return items.flatMap((item) => {
    if (item.skuKind === "drip") {
      const { product, sku } = resolveSubscriptionSku({ website, productId: item.productId, skuId: item.skuId, kind: "drip" });
      return [{ slug: product.slug, optionId: sku.id, optionLabel: sku.label, quotedUnitPrice: sku.price, quantity: item.quantity }];
    }
    return item.components.map((component) => {
      const { product, sku } = resolveSubscriptionSku({ website, productId: component.productId, skuId: component.skuId, kind: "beans" });
      return { slug: product.slug, optionId: sku.id, optionLabel: sku.label, quotedUnitPrice: sku.price, quantity: item.quantity, ...(component.customRoast === true ? { customRoast: true, roastLevel: component.roastLevel } : {}) };
    });
  });
}

export function subscriptionOrderDisplayItems(items: PricedSubscriptionItem[], website: WebsiteData) {
  return items.map((item) => {
    if (item.skuKind === "drip") {
      const { product, sku } = resolveSubscriptionSku({ website, productId: item.productId, skuId: item.skuId, kind: "drip" });
      return { ...item, slug: product.slug, name: product.name, optionId: sku.id, optionLabel: sku.label, optionDetail: sku.detail, lineTotal: item.unitPrice * item.quantity };
    }
    const products = item.components.map((component) => activeProduct(website, component.productId));
    const dedicated = item.components.filter((component) => component.customRoast === true);
    return { ...item, slug: products[0].slug, name: products.map((product) => product.name).join(" + "), optionLabel: item.packageWeight === "one-pound" ? "一磅咖啡豆組合" : "半磅咖啡豆", preparationLabel: item.roast, customRoast: dedicated.length > 0, roastLevel: [...new Set(dedicated.map((component) => component.roastLevel).filter(Boolean))].join("／") || undefined, lineTotal: item.unitPrice * item.quantity };
  });
}

export function subscriptionDedicatedRoastOperationalSummary(
  items: PricedSubscriptionItem[],
  website: WebsiteData,
  rushAcknowledgement?: { warningAcknowledged: boolean; acknowledgedAt?: string; plannedDate: string; standardPreparationDays: number } | null,
) {
  const selections = new Map<string, string>();
  for (const item of items) {
    if (!isBeanSubscriptionItem(item)) continue;
    for (const component of item.components) {
      if (component.customRoast === true && component.roastLevel) selections.set(component.productId, component.roastLevel);
    }
  }
  if (!selections.size) return null;
  return {
    enabled: true as const,
    products: [...selections].map(([productId, roastLevel]) => ({ productId, productName: activeProduct(website, productId).name, roastLevel })),
    standardPreparationDays: DEDICATED_ROAST_STANDARD_PREPARATION_DAYS,
    rush: Boolean(rushAcknowledgement),
    rushWarningAcknowledged: rushAcknowledgement?.warningAcknowledged === true,
    rushWarningAcknowledgedAt: rushAcknowledgement?.acknowledgedAt,
    plannedDate: rushAcknowledgement?.plannedDate,
  };
}
