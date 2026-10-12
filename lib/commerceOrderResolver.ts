import "server-only";
import { getLiveWebsiteData, type CoffeeArtwork, type PurchaseOption } from "../data/websiteData";
import { isCartRecord, type CoffeePreparation, type CoffeeRoastLevel } from "./commerceCart";
import { priceOrderFromWebsiteData, type RequestedItem } from "./orderPricing";
import { resolveSkuOption } from "./orderStockValidation";
import { createStoreRepository } from "./storeRepository";
import { findPublicStoreProductBySlug } from "./storePublicSelectors";
import {
  CommerceOrderResolutionError, commerceOrderInventoryKey, validateCommerceOrderInput,
  type CommerceOrderInputItem, type CoffeeOrderInputItem, type ResolvedCoffeeOrderLine,
  type ResolvedCommerceOrderLine, type PersistableCommerceOrderLine,
} from "./commerceOrderTypes";
import { commerceOrderMoney, commerceOrderLineTotal, priceResolvedCommerceOrderItems } from "./commerceOrderPricing";

function fail(code: ConstructorParameters<typeof CommerceOrderResolutionError>[0]): never {
  throw new CommerceOrderResolutionError(code);
}
function options(product: CoffeeArtwork): PurchaseOption[] {
  const source = Array.isArray(product.skus) && product.skus.length ? product.skus : product.purchase;
  if (!Array.isArray(source) || source.some(option => !isCartRecord(option))) return fail("PRICE_RESOLUTION_FAILED");
  return source;
}
function validStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return fail("OUT_OF_STOCK");
  return value;
}
export type CommerceOrderResolution = {
  lines: ResolvedCommerceOrderLine[];
  itemsSubtotal: number;
  inventoryDemand: { inventoryKey: string; domain: "coffee" | "store";
    productId: string; variantId: string; quantity: number }[];
};
/**
 * READ / VALIDATE / PRICE only. Not connected to checkout/order POST.
 * Each call reads current Coffee/Store data; no cart/offer authority or writes.
 */
export async function resolveCommerceOrderItems(value: unknown): Promise<CommerceOrderResolution> {
  const items = validateCommerceOrderInput(value);
  const demands = new Map<string, { item: CommerceOrderInputItem; quantity: number; stock: number }>();
  const addDemand = (item: CommerceOrderInputItem, stock: number) => {
    const key = commerceOrderInventoryKey(item), prior = demands.get(key);
    const quantity = (prior?.quantity ?? 0) + item.quantity;
    if (!Number.isSafeInteger(quantity) || (prior && prior.stock !== stock)) return fail("OUT_OF_STOCK");
    demands.set(key, { item, quantity, stock });
  };
  const coffeeInputs = items.filter((item): item is CoffeeOrderInputItem => item.domain === "coffee");
  let coffeeLines: ResolvedCoffeeOrderLine[] = [];
  if (coffeeInputs.length) {
    const live = await getLiveWebsiteData().catch(() => fail("PRICE_RESOLUTION_FAILED"));
    if (!isCartRecord(live) || !isCartRecord(live.menu) || !Array.isArray(live.menu.products)
      || live.menu.products.some(product => !isCartRecord(product))) return fail("PRICE_RESOLUTION_FAILED");
    const requested: RequestedItem[] = coffeeInputs.map(item => {
      const matches = live.menu.products.filter(product => product.id === item.productId);
      if (!matches.length) return fail("PRODUCT_NOT_FOUND");
      if (matches.length !== 1) return fail("PRICE_RESOLUTION_FAILED");
      const product = matches[0];
      if (product.active === false || product.status === "hidden" || product.status === "sold_out"
        || product.purchasable === false) return fail("PRODUCT_UNAVAILABLE");
      if (typeof product.slug !== "string" || !product.slug || typeof product.name !== "string"
        || !product.name || live.menu.products.filter(entry => entry.slug === product.slug).length !== 1) {
        return fail("PRICE_RESOLUTION_FAILED");
      }
      const source = options(product);
      const variants = source.filter(option => option.id === item.variantId);
      if (!variants.length) return fail("VARIANT_NOT_FOUND");
      // Existing Coffee stock is globally keyed by persisted SKU ID. Ambiguity fails closed.
      if (variants.length !== 1 || live.menu.products.reduce((count, entry) =>
        count + options(entry).filter(option => option.id === item.variantId).length, 0) !== 1) {
        return fail("PRICE_RESOLUTION_FAILED");
      }
      const option = resolveSkuOption(source, item.variantId, "");
      if (!option) return fail("VARIANT_NOT_FOUND");
      if (option.enabled === false) return fail("PRODUCT_UNAVAILABLE");
      if (typeof option.label !== "string" || typeof option.detail !== "string") return fail("PRICE_RESOLUTION_FAILED");
      const unitPrice = commerceOrderMoney(option.price);
      addDemand(item, validStock(option.stock));
      const selection = item.coffeeOptions;
      return { slug: product.slug, optionId: item.variantId, optionLabel: option.label,
        quotedUnitPrice: unitPrice, quantity: item.quantity, preparationLabel: selection.preparation,
        customRoast: selection.customRoast, roastLevel: selection.roastLevel, roastNote: selection.roastNote };
    });
    for (const demand of demands.values()) if (demand.quantity > demand.stock) return fail("OUT_OF_STOCK");
    // Reuse production preparation, custom-roast aggregation, pricing and SKU-demand rules.
    let priced: ReturnType<typeof priceOrderFromWebsiteData>;
    try { priced = priceOrderFromWebsiteData(live, requested); }
    catch { return fail("INVALID_COFFEE_OPTIONS"); }
    coffeeLines = priced.priced.items.map((line, index) => ({
      domain: "coffee", productId: coffeeInputs[index].productId, variantId: coffeeInputs[index].variantId,
      slug: line.slug, name: line.name, optionId: coffeeInputs[index].variantId,
      optionLabel: line.optionLabel, optionDetail: line.optionDetail,
      preparationLabel: line.preparationLabel as CoffeePreparation | "", customRoast: line.customRoast,
      ...(line.roastLevel !== undefined ? { roastLevel: line.roastLevel as CoffeeRoastLevel } : {}),
      ...(line.roastNote !== undefined ? { roastNote: line.roastNote } : {}),
      unitPrice: commerceOrderMoney(line.unitPrice), quantity: line.quantity,
      lineTotal: commerceOrderLineTotal(line.unitPrice, line.quantity),
      pvEnabled: line.pvEnabled, basePV: line.basePV, discountRatio: line.discountRatio, effectivePV: line.effectivePV,
    }));
  }
  const catalog = items.some(item => item.domain === "store")
    ? await createStoreRepository().read().catch(() => fail("PRICE_RESOLUTION_FAILED")) : undefined;
  let coffeeIndex = 0;
  const lines: ResolvedCommerceOrderLine[] = items.map(item => {
    if (item.domain === "coffee") return coffeeLines[coffeeIndex++];
    if (!catalog) return fail("PRICE_RESOLUTION_FAILED");
    const product = catalog.products.find(product => product.id === item.productId);
    if (!product) return fail("PRODUCT_NOT_FOUND");
    // ID is authority. Current server slug is used only to reuse the public visibility graph.
    if (!findPublicStoreProductBySlug(catalog, product.slug)) return fail("PRODUCT_UNAVAILABLE");
    addDemand(item, validStock(product.inventory));
    const unitPrice = commerceOrderMoney(product.salePrice !== undefined && product.salePrice < product.price
      ? product.salePrice : product.price);
    return { domain: "store", productId: product.id, variantId: "default", slug: product.slug,
      name: product.name, sku: product.sku, unitPrice, quantity: item.quantity,
      lineTotal: commerceOrderLineTotal(unitPrice, item.quantity) };
  });
  for (const demand of demands.values()) if (demand.quantity > demand.stock) return fail("OUT_OF_STOCK");
  return { lines, ...priceResolvedCommerceOrderItems(lines),
    inventoryDemand: [...demands].map(([inventoryKey, demand]) => ({
      inventoryKey, domain: demand.item.domain, productId: demand.item.productId,
      variantId: demand.item.variantId, quantity: demand.quantity,
    })) };
}
/** Future persisted DTO; no order storage and no inventory/reward metadata synthesis. */
export function toPersistableCommerceOrderLines(lines: readonly ResolvedCommerceOrderLine[]): PersistableCommerceOrderLine[] {
  priceResolvedCommerceOrderItems(lines);
  return lines.map(line => line.domain === "store"
    ? { domain: "store", productId: line.productId, variantId: "default", slug: line.slug, name: line.name,
      sku: line.sku, unitPrice: line.unitPrice, quantity: line.quantity, lineTotal: line.lineTotal }
    : { domain: "coffee", productId: line.productId, variantId: line.variantId, slug: line.slug, name: line.name,
      optionId: line.optionId, optionLabel: line.optionLabel, optionDetail: line.optionDetail,
      preparationLabel: line.preparationLabel, customRoast: line.customRoast,
      ...(line.roastLevel !== undefined ? { roastLevel: line.roastLevel } : {}),
      ...(line.roastNote !== undefined ? { roastNote: line.roastNote } : {}),
      unitPrice: line.unitPrice, quantity: line.quantity, lineTotal: line.lineTotal,
      pvEnabled: line.pvEnabled, basePV: line.basePV, discountRatio: line.discountRatio, effectivePV: line.effectivePV });
}
