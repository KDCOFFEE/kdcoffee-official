import {
  ALLOWED_BEAN_PREPARATIONS,
  ALLOWED_ROAST_LEVELS,
} from "./checkoutRules";

export type CommerceDomain = "coffee" | "store";
export type CoffeePreparation = (typeof ALLOWED_BEAN_PREPARATIONS)[number];
export type CoffeeRoastLevel = (typeof ALLOWED_ROAST_LEVELS)[number];

export type CartBase = {
  productId: string;
  variantId: string;
  slug: string;
  name: string;
  sku?: string;
  unitPrice: number;
  quantity: number;
  /** Bounded client UX snapshot, never authoritative inventory. */
  quantityLimit?: number;
  optionLabel?: string;
  optionDetail?: string;
};
export type CoffeeCartItem = CartBase & {
  domain: "coffee";
  coffeeOptions: {
    preparation?: CoffeePreparation;
    customRoast: boolean;
    roastLevel?: CoffeeRoastLevel;
    roastNote?: string;
  };
};
export type StoreCartItem = CartBase & {
  domain: "store";
  variantId: "default";
  coffeeOptions?: never;
};
export type UnifiedCartItem = CoffeeCartItem | StoreCartItem;

export const MIGRATION_REASONS = [
  "INVALID_LEGACY_ITEM", "INVALID_QUANTITY", "PRODUCT_NOT_FOUND",
  "PRODUCT_AMBIGUOUS", "PRODUCT_ID_MISSING", "PRODUCT_ID_AMBIGUOUS",
  "PRODUCT_UNAVAILABLE", "SKU_NOT_FOUND", "SKU_ID_MISSING",
  "SKU_ID_AMBIGUOUS", "OPTION_AMBIGUOUS", "OPTION_DISABLED",
  "INVALID_COFFEE_SELECTION", "QUANTITY_LIMIT_EXCEEDED",
] as const;
export type MigrationIssue = {
  sourceIndex: number;
  reason: (typeof MIGRATION_REASONS)[number];
  slug?: string;
  name?: string;
  optionLabel?: string;
  requestedQuantity?: number;
  totalRequestedQuantity?: number;
  quantityLimit?: number;
};
export type MigrationNotice = {
  sourceIndex: number;
  reason: "PRICE_CHANGED";
  previousUnitPrice: number;
  currentUnitPrice: number;
};
export const MAX_CART_ITEMS = 50;

export class CommerceCartValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommerceCartValidationError";
  }
}
export function isCartRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function assertCartFields(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) {
    throw new CommerceCartValidationError("Unexpected cart field");
  }
}
function fail(field: string): never {
  throw new CommerceCartValidationError("Invalid cart " + field);
}
export function cartIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !value || value.length > 200
    || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) return fail(field);
  return value; // Stable IDs are never rewritten, lowercased or synthesized.
}
export function cartSnapshot(value: unknown, field: string, maximum = 200, empty = false): string {
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) return fail(field);
  const result = value.trim();
  if (!empty && !result) return fail(field);
  return result;
}
export function cartQuantity(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 99) return fail("quantity");
  return value;
}
export function cartQuantityLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 99) return fail("quantityLimit");
  return value;
}
export function cartPrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return fail("unitPrice");
  return value;
}
/** Trim edges only: internal spaces, line breaks, Unicode and case remain meaningful. */
export function normalizeRoastNote(value: unknown): string {
  if (typeof value !== "string") return fail("roastNote");
  const note = value.trim();
  if (note.length > 160 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(note)) return fail("roastNote");
  return note;
}
export function validateCoffeeOptions(value: unknown): CoffeeCartItem["coffeeOptions"] {
  if (!isCartRecord(value)) return fail("coffeeOptions");
  assertCartFields(value, ["preparation", "customRoast", "roastLevel", "roastNote"]);
  if (typeof value.customRoast !== "boolean") return fail("customRoast");
  let preparation: CoffeePreparation | undefined;
  if (value.preparation !== undefined) {
    if (typeof value.preparation !== "string") return fail("preparation");
    const candidate = value.preparation.trim();
    if (!(ALLOWED_BEAN_PREPARATIONS as readonly string[]).includes(candidate)) return fail("preparation");
    preparation = candidate as CoffeePreparation;
  }
  if (!value.customRoast) {
    if (value.roastLevel !== undefined || value.roastNote !== undefined) return fail("inactive roast selection");
    return { ...(preparation ? { preparation } : {}), customRoast: false };
  }
  if (typeof value.roastLevel !== "string") return fail("roastLevel");
  const roastLevel = value.roastLevel.trim();
  if (!(ALLOWED_ROAST_LEVELS as readonly string[]).includes(roastLevel)) return fail("roastLevel");
  return {
    ...(preparation ? { preparation } : {}),
    customRoast: true,
    roastLevel: roastLevel as CoffeeRoastLevel,
    ...(value.roastNote !== undefined ? { roastNote: normalizeRoastNote(value.roastNote) } : {}),
  };
}
/** Strict projection: unknown fields, including reward/repository metadata, are rejected. */
export function validateUnifiedCartItem(value: unknown): UnifiedCartItem {
  if (!isCartRecord(value)) return fail("item");
  assertCartFields(value, ["domain", "productId", "variantId", "slug", "name", "sku",
    "unitPrice", "quantity", "quantityLimit", "optionLabel", "optionDetail", "coffeeOptions"]);
  if (value.domain !== "coffee" && value.domain !== "store") return fail("domain");
  const slug = cartSnapshot(value.slug, "slug", 160);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) return fail("slug");
  const base: CartBase = {
    productId: cartIdentifier(value.productId, "productId"),
    variantId: cartIdentifier(value.variantId, "variantId"),
    slug, name: cartSnapshot(value.name, "name"),
    unitPrice: cartPrice(value.unitPrice), quantity: cartQuantity(value.quantity),
    ...(value.sku !== undefined ? { sku: cartSnapshot(value.sku, "sku") } : {}),
    ...(value.quantityLimit !== undefined ? { quantityLimit: cartQuantityLimit(value.quantityLimit) } : {}),
    ...(value.optionLabel !== undefined ? { optionLabel: cartSnapshot(value.optionLabel, "optionLabel") } : {}),
    ...(value.optionDetail !== undefined ? { optionDetail: cartSnapshot(value.optionDetail, "optionDetail", 500, true) } : {}),
  };
  if (value.domain === "store") {
    if (base.variantId !== "default" || Object.hasOwn(value, "coffeeOptions")) return fail("Store selection");
    return { ...base, domain: "store", variantId: "default" };
  }
  return { ...base, domain: "coffee", coffeeOptions: validateCoffeeOptions(value.coffeeOptions) };
}
export function cartInventoryKey(item: UnifiedCartItem): string {
  const valid = validateUnifiedCartItem(item);
  return JSON.stringify([valid.domain, valid.productId, valid.variantId]);
}
export function cartLineKey(item: UnifiedCartItem): string {
  const valid = validateUnifiedCartItem(item);
  if (valid.domain === "store") return JSON.stringify(["store", valid.productId, "default"]);
  const selection = valid.coffeeOptions;
  return JSON.stringify(["coffee", valid.productId, valid.variantId,
    selection.preparation ?? "", selection.customRoast ? "custom" : "standard",
    selection.roastLevel ?? "", selection.roastNote ?? ""]);
}
