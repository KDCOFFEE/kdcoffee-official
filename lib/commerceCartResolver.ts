import "server-only";
import { promises as fs } from "node:fs";
import { getWebsiteDataFile } from "./storagePaths";
import {
  CUSTOM_ROAST_MIN_QUANTITY, resolvePreparationLabel,
} from "./checkoutRules";
import {
  MAX_CART_ITEMS, CommerceCartValidationError, isCartRecord, assertCartFields,
  cartIdentifier, cartSnapshot, validateCoffeeOptions,
  validateUnifiedCartItem, cartInventoryKey, cartLineKey,
} from "./commerceCart";
import type { CoffeeCartItem, MigrationIssue, MigrationNotice } from "./commerceCart";
import type { CoffeeArtwork, PurchaseOption } from "../data/websiteData";

export type CoffeeCartProduct = Pick<CoffeeArtwork,
  "id" | "slug" | "name" | "active" | "status" | "purchasable" | "skus" | "purchase">;
export type LegacyCoffeeResolution = {
  items: CoffeeCartItem[];
  unresolved: MigrationIssue[];
  notices: MigrationNotice[];
};
export class CoffeeCartSourceIntegrityError extends Error {
  constructor() { super("Coffee cart source integrity failure"); this.name = "CoffeeCartSourceIntegrityError"; }
}
function sourceFailure(): never { throw new CoffeeCartSourceIntegrityError(); }
const sourceOptions = (product: CoffeeCartProduct) =>
  Array.isArray(product.skus) && product.skus.length ? product.skus : product.purchase;

/** Read the same live coffee file as getLiveWebsiteData; no static fallback or writes.
 * Runtime JSON is deliberately kept unknown until its narrow source shape is checked.
 */
export async function readCanonicalCoffeeCartProducts(): Promise<CoffeeCartProduct[]> {
  const data: unknown = JSON.parse(await fs.readFile(getWebsiteDataFile(), "utf8")) as unknown;
  if (!isCartRecord(data) || !isCartRecord(data.menu) || !Array.isArray(data.menu.products)) return sourceFailure();
  return data.menu.products.map((value: unknown) => {
    if (!isCartRecord(value) || typeof value.slug !== "string" || typeof value.name !== "string"
      || !Array.isArray(value.purchase) || (value.skus !== undefined && !Array.isArray(value.skus))
      || (value.id !== undefined && typeof value.id !== "string")
      || (value.active !== undefined && typeof value.active !== "boolean")
      || (value.purchasable !== undefined && typeof value.purchasable !== "boolean")
      || (value.status !== undefined && typeof value.status !== "string")) return sourceFailure();
    for (const option of [...value.purchase, ...(Array.isArray(value.skus) ? value.skus : [])]) {
      if (!isCartRecord(option)) return sourceFailure();
    }
    // Only this checked, server-local projection participates in resolution.
    return {
      ...(value.id !== undefined ? { id: value.id as string } : {}),
      slug: value.slug, name: value.name,
      ...(value.active !== undefined ? { active: value.active as boolean } : {}),
      ...(value.purchasable !== undefined ? { purchasable: value.purchasable as boolean } : {}),
      ...(value.status !== undefined ? { status: value.status as CoffeeArtwork["status"] } : {}),
      purchase: value.purchase as PurchaseOption[],
      ...(value.skus !== undefined ? { skus: value.skus as PurchaseOption[] } : {}),
    };
  });
}
function safeIssueSnapshot(value: unknown): Pick<MigrationIssue, "slug" | "name" | "optionLabel"> {
  if (!isCartRecord(value)) return {};
  const result: Pick<MigrationIssue, "slug" | "name" | "optionLabel"> = {};
  for (const field of ["slug", "name", "optionLabel"] as const) {
    if (typeof value[field] !== "string") continue;
    try { result[field] = cartSnapshot(value[field], field, field === "slug" ? 160 : 200); } catch { /* No raw malformed data retained. */ }
  }
  return result;
}
type Candidate = { sourceIndex: number; item: CoffeeCartItem; kind: PurchaseOption["kind"]; previousPrice: number };
/** Legacy coffee only. No Store lookup, checkout pricing, inventory mutation or reward projection. */
export function resolveLegacyCoffeeCart(legacy: readonly unknown[], products: readonly CoffeeCartProduct[]): LegacyCoffeeResolution {
  if (legacy.length > MAX_CART_ITEMS) throw new CommerceCartValidationError("Too many legacy cart items");
  const result: LegacyCoffeeResolution = { items: [], unresolved: [], notices: [] };
  const candidates: Candidate[] = [];
  const skuCounts = new Map<string, number>();
  const productIdCounts = new Map<string, number>();
  for (const product of products) {
    if (typeof product.id === "string" && product.id) productIdCounts.set(product.id, (productIdCounts.get(product.id) ?? 0) + 1);
    for (const option of sourceOptions(product)) {
      if (typeof option.id === "string" && option.id) skuCounts.set(option.id, (skuCounts.get(option.id) ?? 0) + 1);
    }
  }
  legacy.forEach((raw, sourceIndex) => {
    const issue = (reason: MigrationIssue["reason"], detail: Partial<Pick<MigrationIssue,
      "requestedQuantity" | "totalRequestedQuantity" | "quantityLimit">> = {}) => {
      result.unresolved.push({ sourceIndex, reason, ...safeIssueSnapshot(raw), ...detail });
    };
    if (!isCartRecord(raw)) return issue("INVALID_LEGACY_ITEM");
    // Legacy never accepts a domain/identity supplied by a unified-cart request.
    try {
      assertCartFields(raw, ["slug", "name", "optionId", "optionLabel", "optionDetail",
        "preparationLabel", "customRoast", "roastLevel", "roastNote", "unitPrice", "quantity", "stock"]);
      cartSnapshot(raw.slug, "legacy slug", 160);
      if (raw.optionId !== undefined) cartIdentifier(raw.optionId, "legacy optionId");
      if (raw.optionId === undefined) cartSnapshot(raw.optionLabel, "legacy optionLabel");
      if (typeof raw.unitPrice !== "number" || !Number.isFinite(raw.unitPrice) || raw.unitPrice < 0) throw new CommerceCartValidationError("Invalid legacy price");
    } catch { return issue("INVALID_LEGACY_ITEM"); }
    if (typeof raw.quantity !== "number" || !Number.isSafeInteger(raw.quantity) || raw.quantity < 1) return issue("INVALID_QUANTITY");
    if (raw.quantity > 99) return issue("QUANTITY_LIMIT_EXCEEDED", { requestedQuantity: raw.quantity, quantityLimit: 99 });
    const matches = products.filter(product => product.slug === raw.slug);
    if (!matches.length) return issue("PRODUCT_NOT_FOUND");
    if (matches.length !== 1) return issue("PRODUCT_AMBIGUOUS");
    const product = matches[0];
    try { cartIdentifier(product.id, "productId"); } catch { return issue("PRODUCT_ID_MISSING"); }
    if (productIdCounts.get(product.id!) !== 1) return issue("PRODUCT_ID_AMBIGUOUS");
    if (product.active === false || product.purchasable === false || product.status === "hidden" || product.status === "sold_out") return issue("PRODUCT_UNAVAILABLE");
    const options = sourceOptions(product);
    const optionMatches = raw.optionId !== undefined
      ? options.filter(option => option.id === raw.optionId)
      : options.filter(option => option.label === raw.optionLabel);
    if (!optionMatches.length) return issue("SKU_NOT_FOUND");
    if (optionMatches.length !== 1) return issue(raw.optionId !== undefined ? "SKU_ID_AMBIGUOUS" : "OPTION_AMBIGUOUS");
    const option = optionMatches[0];
    try { cartIdentifier(option.id, "variantId"); } catch { return issue("SKU_ID_MISSING"); }
    if (skuCounts.get(option.id!) !== 1) return issue("SKU_ID_AMBIGUOUS");
    if (option.enabled === false) return issue("OPTION_DISABLED");
    if (typeof option.price !== "number" || !Number.isFinite(option.price) || option.price < 0
      || typeof option.stock !== "number" || !Number.isSafeInteger(option.stock) || option.stock < 0
      || (option.enabled !== undefined && typeof option.enabled !== "boolean")
      || (option.kind !== undefined && option.kind !== "beans" && option.kind !== "drip")) return sourceFailure();
    const quantityLimit = Math.min(99, option.stock);
    if (raw.quantity > quantityLimit) return issue("QUANTITY_LIMIT_EXCEEDED", { requestedQuantity: raw.quantity, quantityLimit });
    let coffeeOptions: CoffeeCartItem["coffeeOptions"];
    try {
      if (raw.customRoast !== undefined && typeof raw.customRoast !== "boolean") throw new CommerceCartValidationError("Invalid custom roast intent");
      const preparation = resolvePreparationLabel(option, raw.preparationLabel);
      if (!preparation.valid) throw new CommerceCartValidationError("Invalid preparation");
      coffeeOptions = validateCoffeeOptions({
        ...(preparation.label ? { preparation: preparation.label } : {}),
        customRoast: raw.customRoast === true,
        ...(raw.roastLevel !== undefined ? { roastLevel: raw.roastLevel } : {}),
        ...(raw.roastNote !== undefined ? { roastNote: raw.roastNote } : {}),
      });
    } catch { return issue("INVALID_COFFEE_SELECTION"); }
    let item: CoffeeCartItem;
    try {
      const valid = validateUnifiedCartItem({
        domain: "coffee", productId: product.id, variantId: option.id,
        slug: product.slug, name: product.name,
        optionLabel: option.label, optionDetail: option.detail,
        unitPrice: option.price, quantity: raw.quantity, quantityLimit, coffeeOptions,
      });
      if (valid.domain !== "coffee") return sourceFailure();
      item = valid;
    } catch (error) {
      if (error instanceof CommerceCartValidationError) return sourceFailure();
      throw error;
    }
    candidates.push({ sourceIndex, item, kind: option.kind, previousPrice: raw.unitPrice });
  });
  const demand = new Map<string, number>();
  for (const { item } of candidates) {
    const key = cartInventoryKey(item);
    demand.set(key, (demand.get(key) ?? 0) + item.quantity);
  }
  const available = candidates.filter(candidate => {
    const total = demand.get(cartInventoryKey(candidate.item))!;
    const limit = candidate.item.quantityLimit!;
    if (total <= limit) return true;
    result.unresolved.push({ sourceIndex: candidate.sourceIndex, reason: "QUANTITY_LIMIT_EXCEEDED",
      ...safeIssueSnapshot(legacy[candidate.sourceIndex]), requestedQuantity: candidate.item.quantity,
      totalRequestedQuantity: total, quantityLimit: limit });
    return false;
  });
  // Preserve current server semantics: custom beans rows accumulate per coffee product.
  const roastDemand = new Map<string, number>();
  for (const { item, kind } of available) {
    if (item.coffeeOptions.customRoast && kind === "beans") {
      roastDemand.set(item.productId, (roastDemand.get(item.productId) ?? 0) + item.quantity);
    }
  }
  const lines = new Map<string, CoffeeCartItem>();
  for (const candidate of available) {
    const { item, sourceIndex, kind, previousPrice } = candidate;
    if (item.coffeeOptions.customRoast && (kind !== "beans" || (roastDemand.get(item.productId) ?? 0) < CUSTOM_ROAST_MIN_QUANTITY)) {
      result.unresolved.push({ sourceIndex, reason: "INVALID_COFFEE_SELECTION", ...safeIssueSnapshot(legacy[sourceIndex]) });
      continue;
    }
    const key = cartLineKey(item);
    const existing = lines.get(key);
    if (existing) existing.quantity += item.quantity;
    else lines.set(key, { ...item });
    if (previousPrice !== item.unitPrice) result.notices.push({ sourceIndex, reason: "PRICE_CHANGED", previousUnitPrice: previousPrice, currentUnitPrice: item.unitPrice });
  }
  result.items = [...lines.values()];
  result.unresolved.sort((a, b) => a.sourceIndex - b.sourceIndex);
  return result;
}
