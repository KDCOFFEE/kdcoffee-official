import {
  ALLOWED_BEAN_PREPARATIONS,
  ALLOWED_ROAST_LEVELS,
  isCustomRoastSku, isCustomRoastLineEligible, CUSTOM_ROAST_MIN_QUANTITY,
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

/** URLs are display destinations, never identity authority. */
export function cartProductHref(item: UnifiedCartItem): string {
  const valid = validateUnifiedCartItem(item);
  return (valid.domain === "coffee" ? "/works/" : "/store/") + encodeURIComponent(valid.slug);
}
export type CoffeeCheckoutItem = {
  slug: string; name: string; optionId: string; optionLabel: string; optionDetail: string;
  preparationLabel?: CoffeePreparation; customRoast: boolean;
  roastLevel?: CoffeeRoastLevel; roastNote?: string;
  unitPrice: number; quantity: number; stock?: number;
};
/** Whole-cart adapter. Never filters Store lines or submits a coffee subset. */
export function coffeeCheckoutItems(items: readonly UnifiedCartItem[]): CoffeeCheckoutItem[] {
  const checked = items.map(validateUnifiedCartItem);
  if (checked.some(item => item.domain !== "coffee")) throw new CommerceCartValidationError("Store checkout is not enabled");
  return checked.map(item => {
    if (item.domain !== "coffee" || !item.optionLabel) throw new CommerceCartValidationError("Invalid coffee checkout item");
    return {
      slug: item.slug, name: item.name, optionId: item.variantId,
      optionLabel: item.optionLabel, optionDetail: item.optionDetail ?? "",
      ...(item.coffeeOptions.preparation ? { preparationLabel: item.coffeeOptions.preparation } : {}),
      customRoast: item.coffeeOptions.customRoast,
      ...(item.coffeeOptions.roastLevel ? { roastLevel: item.coffeeOptions.roastLevel } : {}),
      ...(item.coffeeOptions.roastNote !== undefined ? { roastNote: item.coffeeOptions.roastNote } : {}),
      unitPrice: item.unitPrice, quantity: item.quantity,
      ...(item.quantityLimit !== undefined ? { stock: item.quantityLimit } : {}),
    };
  });
}
export function cartInventoryDemand(items: readonly UnifiedCartItem[], target: UnifiedCartItem): number {
  const key = cartInventoryKey(target);
  return items.reduce((sum, item) => sum + (cartInventoryKey(item) === key ? item.quantity : 0), 0);
}
export function cartInventoryLimit(items: readonly UnifiedCartItem[], target: UnifiedCartItem): number {
  const key = cartInventoryKey(target);
  return Math.min(99, target.quantityLimit ?? 99, ...items
    .filter(item => cartInventoryKey(item) === key).map(item => item.quantityLimit ?? 99));
}
export function mergeCartLines(items: readonly UnifiedCartItem[]): UnifiedCartItem[] {
  const lines = new Map<string, UnifiedCartItem>();
  for (const raw of items) {
    const item = validateUnifiedCartItem(raw), key = cartLineKey(item);
    const existing = lines.get(key);
    if (existing) lines.set(key, validateUnifiedCartItem({
      ...item, quantity: cartQuantity(existing.quantity + item.quantity),
      quantityLimit: Math.min(existing.quantityLimit ?? 99, item.quantityLimit ?? 99),
    }));
    else lines.set(key, item);
  }
  if (lines.size > MAX_CART_ITEMS) throw new CommerceCartValidationError("Too many cart lines");
  return [...lines.values()];
}
export type CartMigrationState = "PENDING" | "READY" | "FAILED";
export type StoreCheckoutAvailability = "NOT_REQUIRED" | "CHECKING" | "AVAILABLE" | "UNAVAILABLE";
export type CheckoutEligibility = "ELIGIBLE" | "EMPTY" | "MIGRATION_PENDING" | "MIGRATION_FAILED"
  | "UNRESOLVED_LEGACY_ITEMS" | "STORE_CHECKOUT_CHECKING" | "STORE_CHECKOUT_NOT_ENABLED" | "PERSISTENCE_FAILED" | "CART_UNAVAILABLE";
export function cartCheckoutEligibility(
  items: readonly UnifiedCartItem[], migration: CartMigrationState,
  unresolved: readonly MigrationIssue[], persistenceWarning = false,
  storeAvailability: StoreCheckoutAvailability = "UNAVAILABLE",
): CheckoutEligibility {
  if (migration === "PENDING") return "MIGRATION_PENDING";
  if (migration === "FAILED") return "MIGRATION_FAILED";
  if (unresolved.length) return "UNRESOLVED_LEGACY_ITEMS";
  const hasStore = items.some(item => item.domain === "store");
  if (hasStore && storeAvailability === "CHECKING") return "STORE_CHECKOUT_CHECKING";
  if (hasStore && storeAvailability !== "AVAILABLE") return "STORE_CHECKOUT_NOT_ENABLED";
  if (persistenceWarning) return "PERSISTENCE_FAILED";
  if (!items.length) return "EMPTY";
  try {
    if (!hasStore) coffeeCheckoutItems(items); // Preserve the legacy whole-cart projection.
    const checked = hasStore ? items.map(validateUnifiedCartItem) : items;
    if (checked.some(item => cartInventoryDemand(checked, item) > cartInventoryLimit(checked, item))) return "CART_UNAVAILABLE";
    for (const canonical of checked) {
      if (canonical.domain !== "coffee" || !canonical.coffeeOptions.customRoast) continue;
      const total = checked.reduce((sum, entry) => sum + (
        entry.domain === "coffee" && entry.productId === canonical.productId && entry.coffeeOptions.customRoast
          ? entry.quantity : 0), 0);
      if (!isCoffeeRoastSku(canonical) || total < CUSTOM_ROAST_MIN_QUANTITY) return "CART_UNAVAILABLE";
    }
    return "ELIGIBLE";
  } catch { return "CART_UNAVAILABLE"; }
}
export function isCoffeeRoastSku(item: UnifiedCartItem): boolean {
  return item.domain === "coffee" && isCustomRoastSku({ optionLabel: item.optionLabel, optionDetail: item.optionDetail });
}
export function coffeeRoastEligible(item: UnifiedCartItem): boolean {
  return item.domain === "coffee" && isCustomRoastLineEligible({
    optionLabel: item.optionLabel, optionDetail: item.optionDetail, quantity: item.quantity,
  });
}
export function cartSpecification(item: UnifiedCartItem): string {
  return [item.optionLabel, item.optionDetail,
    ...(item.domain === "coffee" ? [
      item.coffeeOptions.preparation,
      item.coffeeOptions.customRoast ? item.coffeeOptions.roastLevel : undefined,
    ] : []),
  ].filter(Boolean).join(" · ");
}
export function checkoutEligibilityMessage(status: CheckoutEligibility): string {
  switch (status) {
    case "MIGRATION_PENDING": return "購物車資料正在更新，請稍候。";
    case "MIGRATION_FAILED": return "購物車資料正在更新，暫時無法完成載入。";
    case "UNRESOLVED_LEGACY_ITEMS": return "部分舊購物項目已無法辨識，需要重新選購。";
    case "STORE_CHECKOUT_CHECKING": return "正在確認商店商品是否可結帳…";
    case "STORE_CHECKOUT_NOT_ENABLED": return "商店結帳目前尚未開放，或商品資訊已更新，請重新整理或重新加入商品。";
    case "PERSISTENCE_FAILED": return "購物車尚未成功儲存，請重試後再結帳。";
    case "CART_UNAVAILABLE": return "部分商品數量或專屬烘焙需求需要確認，請返回購物車調整。";
    case "EMPTY": return "購物車目前是空的";
    case "ELIGIBLE": return "";
  }
}
