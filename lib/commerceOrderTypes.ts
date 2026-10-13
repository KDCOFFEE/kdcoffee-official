import { validateDeliveryAddress, type DeliveryAddress } from "./deliveryAddress";
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


/** User selections only. Derived financial facts and ownership are never request fields. */
export type CommerceCheckoutCustomer = { name: string; phone: string; email: string; note: string };
type CheckoutContextBase = { customer: CommerceCheckoutCustomer; creditApplied?: 0; subscriptionIntent?: never };
export type CommerceCheckoutOrderContext = CheckoutContextBase & (
  | { orderMode: "studio_pickup"; studioPickup: { preferredDate: string }; payment?: "pickup_confirmation";
      store?: never; deliveryAddress?: never; paymentMethod?: never }
  | { orderMode: "711_cod"; store: { id: string; name: string; address: string }; payment: "cash_on_delivery";
      studioPickup?: never; deliveryAddress?: never; paymentMethod?: never }
  | { orderMode: "home_delivery"; deliveryAddress: DeliveryAddress; paymentMethod: "atm_transfer" | "cash_on_delivery";
      studioPickup?: never; store?: never; payment?: never }
);
export type CheckoutContextReason = "INVALID_REQUEST" | "INVALID_PICKUP_DATE" | "INVALID_STORE"
  | "INVALID_ADDRESS" | "PAYMENT_NOT_SUPPORTED";
export class CheckoutContextValidationError extends Error {
  readonly reason: CheckoutContextReason;
  constructor(reason: CheckoutContextReason) { super(reason); this.reason = reason; }
}
function contextFail(reason: CheckoutContextReason): never { throw new CheckoutContextValidationError(reason); }
function contextFields(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!isCartRecord(value) || Reflect.ownKeys(value).some(key => typeof key !== "string" || !allowed.includes(key))) contextFail("INVALID_REQUEST");
  return value;
}
function contextText(value: unknown, maximum: number, empty = false): string {
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) contextFail("INVALID_REQUEST");
  const result = value.trim();
  if (!empty && !result) contextFail("INVALID_REQUEST");
  return result;
}
/** The public route's existing 4–10 alphanumeric store-ID rule and snapshot limits.
 * Pure selection validation; no store lookup, shipping policy or public route dependency.
 */
export function validateCommerceStoreSelection(value: unknown) {
  try {
    const store = contextFields(value, ["id", "name", "address"]);
    const id = contextText(store.id, 10), name = contextText(store.name, 30), address = contextText(store.address, 100);
    if (!/^[0-9A-Za-z]{4,10}$/.test(id)) contextFail("INVALID_STORE");
    return { id, name, address };
  } catch { return contextFail("INVALID_STORE"); }
}
/** Shared mode-safe parser; existing Coffee studio normalization is preserved. */
export function normalizeCommerceCheckoutContext(raw: unknown): CommerceCheckoutOrderContext {
  if (!isCartRecord(raw)) contextFail("INVALID_REQUEST");
  const mode = raw.orderMode;
  const allowed = mode === "studio_pickup" ? ["orderMode", "customer", "studioPickup", "creditApplied", "payment"]
    : mode === "711_cod" ? ["orderMode", "customer", "store", "creditApplied", "payment", "paymentMethod"]
    : mode === "home_delivery" ? ["orderMode", "customer", "deliveryAddress", "paymentMethod", "creditApplied"]
    : contextFail("INVALID_REQUEST");
  const context = contextFields(raw, allowed);
  if (context.creditApplied !== undefined && context.creditApplied !== 0) contextFail("INVALID_REQUEST");
  const customer = contextFields(context.customer, ["name", "phone", "email", "note"]);
  const normalized = { name: contextText(customer.name, 40), phone: contextText(customer.phone, 20),
    email: contextText(customer.email, 120, true), note: contextText(customer.note, 200, true) };
  if (!/^09\d{8}$/.test(normalized.phone) || (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email))) contextFail("INVALID_REQUEST");
  if (mode === "studio_pickup") {
    if (context.payment !== undefined && context.payment !== "pickup_confirmation") contextFail("PAYMENT_NOT_SUPPORTED");
    const pickup = contextFields(context.studioPickup, ["preferredDate"]);
    const preferredDate = pickup.preferredDate;
    if (typeof preferredDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)
      || !Number.isFinite(Date.parse(preferredDate)) || new Date(preferredDate).toISOString().slice(0, 10) !== preferredDate) contextFail("INVALID_PICKUP_DATE");
    return { orderMode: "studio_pickup", customer: normalized, studioPickup: { preferredDate }, creditApplied: 0 };
  }
  if (mode === "711_cod") {
    if ((context.payment !== undefined && context.payment !== "cash_on_delivery")
      || (context.paymentMethod !== undefined && context.paymentMethod !== "cash_on_delivery")) contextFail("PAYMENT_NOT_SUPPORTED");
    return { orderMode: "711_cod", customer: normalized, store: validateCommerceStoreSelection(context.store),
      payment: "cash_on_delivery", creditApplied: 0 };
  }
  if (context.paymentMethod !== "atm_transfer" && context.paymentMethod !== "cash_on_delivery") contextFail("PAYMENT_NOT_SUPPORTED");
  let address: DeliveryAddress;
  try {
    const selected = contextFields(context.deliveryAddress, ["recipientName", "phone", "postalCode", "city", "district", "addressLine"]);
    address = validateDeliveryAddress(selected);
  } catch { return contextFail("INVALID_ADDRESS"); }
  return { orderMode: "home_delivery", customer: normalized, deliveryAddress: address,
    paymentMethod: context.paymentMethod, creditApplied: 0 };
}
