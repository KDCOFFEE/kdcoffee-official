import {
  cartIdentifier, cartQuantity, isCartRecord, validateCoffeeOptions,
  type CoffeeCartItem, type CoffeePreparation, type CoffeeRoastLevel,
} from "./commerceCart";

export type CommerceOrderErrorCode = "INVALID_ITEM" | "PRODUCT_NOT_FOUND" | "VARIANT_NOT_FOUND"
  | "PRODUCT_UNAVAILABLE" | "OUT_OF_STOCK" | "INVALID_COFFEE_OPTIONS" | "PRICE_RESOLUTION_FAILED";
export class CommerceOrderResolutionError extends Error {
  readonly code: CommerceOrderErrorCode;
  constructor(code: CommerceOrderErrorCode) {
    super(code);
    this.name = "CommerceOrderResolutionError";
    this.code = code;
  }
}
export type CoffeeOrderInputItem = {
  domain: "coffee"; productId: string; variantId: string; quantity: number;
  coffeeOptions: CoffeeCartItem["coffeeOptions"];
};
export type StoreOrderInputItem = {
  domain: "store"; productId: string; variantId: "default"; quantity: number;
  coffeeOptions?: never;
};
export type CommerceOrderInputItem = CoffeeOrderInputItem | StoreOrderInputItem;

type ResolvedBase = {
  productId: string; variantId: string;
  /** Display snapshots only; never inventory keys. */
  slug: string; name: string;
  unitPrice: number; quantity: number; lineTotal: number;
};
export type ResolvedCoffeeOrderLine = ResolvedBase & {
  domain: "coffee"; optionId: string; optionLabel: string; optionDetail: string;
  preparationLabel: CoffeePreparation | "";
  customRoast: boolean; roastLevel?: CoffeeRoastLevel; roastNote?: string;
  /** Preserve the existing Coffee pricing snapshots; no new reward policy. */
  pvEnabled: boolean; basePV: number; discountRatio: number; effectivePV: number;
};
export type ResolvedStoreOrderLine = ResolvedBase & {
  domain: "store"; variantId: "default"; sku: string;
  coffeeOptions?: never; optionId?: never; optionLabel?: never; optionDetail?: never;
  preparationLabel?: never; customRoast?: never; roastLevel?: never; roastNote?: never;
};
export type ResolvedCommerceOrderLine = ResolvedCoffeeOrderLine | ResolvedStoreOrderLine;
/** DTO only. Creating this value never writes an order. */
export type PersistableCommerceOrderLine = ResolvedCommerceOrderLine;

function invalid(): never { throw new CommerceOrderResolutionError("INVALID_ITEM"); }
export function validateCommerceOrderInput(value: unknown): CommerceOrderInputItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return invalid();
  return value.map(raw => {
    if (!isCartRecord(raw) || (raw.domain !== "coffee" && raw.domain !== "store")) return invalid();
    const fields = raw.domain === "coffee"
      ? ["domain", "productId", "variantId", "quantity", "coffeeOptions"]
      : ["domain", "productId", "variantId", "quantity"];
    if (Reflect.ownKeys(raw).some(key => typeof key !== "string" || !fields.includes(key))) return invalid();
    let productId: string, variantId: string, quantity: number;
    try {
      productId = cartIdentifier(raw.productId, "productId");
      variantId = cartIdentifier(raw.variantId, "variantId");
      quantity = cartQuantity(raw.quantity);
    } catch { return invalid(); }
    if (raw.domain === "store") {
      if (variantId !== "default") return invalid();
      return { domain: "store", productId, variantId, quantity };
    }
    let coffeeOptions: CoffeeCartItem["coffeeOptions"];
    try { coffeeOptions = validateCoffeeOptions(raw.coffeeOptions); }
    catch { throw new CommerceOrderResolutionError("INVALID_COFFEE_OPTIONS"); }
    return { domain: "coffee", productId, variantId, quantity, coffeeOptions };
  });
}

/** Always use the discriminant and persisted IDs, never slug/name/SKU display. */
export function commerceOrderInventoryKey(
  item: Pick<CommerceOrderInputItem, "domain" | "productId" | "variantId">,
): string {
  if (item.domain !== "coffee" && item.domain !== "store") return invalid();
  try {
    cartIdentifier(item.productId, "productId");
    cartIdentifier(item.variantId, "variantId");
  } catch { return invalid(); }
  if (item.domain === "store" && item.variantId !== "default") return invalid();
  return JSON.stringify([item.domain, item.productId, item.variantId]);
}

/** Historical Coffee remains a narrow readable snapshot, not a resolved new-order DTO. */
export type ReadableCoffeeOrderLine = Record<string, unknown> & {
  domain: "coffee"; name: string; quantity: number;
};
export type ReadableCommerceOrderLine = ReadableCoffeeOrderLine | ResolvedStoreOrderLine;
const coffeeOnlyFields = ["coffeeOptions", "optionId", "optionLabel", "optionDetail",
  "preparation", "preparationLabel", "customRoast", "roastLevel", "roastNote"];
function storedMoney(value: unknown, integer: boolean): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0
    || (integer && !Number.isSafeInteger(value))) return invalid();
  return value;
}
/** Validated, read-only projection for loose StoredOrder.items. No file backfill. */
export function readCommerceOrderLines(value: unknown): ReadableCommerceOrderLine[] {
  if (!Array.isArray(value)) return invalid();
  return value.map(raw => {
    if (!isCartRecord(raw)) return invalid();
    const missing = !Object.hasOwn(raw, "domain");
    if (!missing && raw.domain !== "coffee" && raw.domain !== "store") return invalid();
    if (typeof raw.name !== "string" || !raw.name.trim()) return invalid();
    let quantity: number;
    try { quantity = cartQuantity(raw.quantity); } catch { return invalid(); }
    if (missing || raw.domain === "coffee") {
      for (const field of ["unitPrice", "lineTotal"]) {
        if (raw[field] !== undefined) storedMoney(raw[field], false);
      }
      // Preserve historical optional fields without claiming canonical IDs exist.
      return { ...raw, domain: "coffee", name: raw.name, quantity };
    }
    if (coffeeOnlyFields.some(field => Object.hasOwn(raw, field))) return invalid();
    let productId: string;
    try { productId = cartIdentifier(raw.productId, "productId"); } catch { return invalid(); }
    if (raw.variantId !== "default" || typeof raw.slug !== "string" || !raw.slug
      || typeof raw.sku !== "string") return invalid();
    const unitPrice = storedMoney(raw.unitPrice, true), lineTotal = storedMoney(raw.lineTotal, true);
    if (!Number.isSafeInteger(unitPrice * quantity) || lineTotal !== unitPrice * quantity) return invalid();
    return { domain: "store", productId, variantId: "default", slug: raw.slug,
      name: raw.name, sku: raw.sku, quantity, unitPrice, lineTotal };
  });
}
