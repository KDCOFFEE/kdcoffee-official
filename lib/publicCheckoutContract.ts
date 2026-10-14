import "server-only";
import { createHash } from "node:crypto";
import { normalizeCheckoutAttemptKey } from "./checkoutAttemptAccess";
import { isCartRecord, cartIdentifier } from "./commerceCart";
import {
  validateCommerceOrderInput, normalizeCommerceCheckoutContext,
  type CommerceOrderInputItem, type CommerceCheckoutOrderContext,
} from "./commerceOrderTypes";

export type PublicCheckoutOwnerBinding =
  | { kind: "member"; memberId: string }
  | { kind: "guest"; canonicalAttemptKey: string; tokenHash: string };
export type PublicCheckoutContractReason = "INVALID_REQUEST" | "INVALID_ATTEMPT_KEY"
  | "UNKNOWN_DOMAIN" | "INVALID_LEGACY_ITEM" | "EXPLICIT_COFFEE_NOT_SUPPORTED"
  | "MIXED_SERIALIZATION_REQUIRED" | "GIFT_MERCHANDISE_CONFLICT" | "INVALID_ITEM"
  | "INVALID_QUOTE" | "INVALID_CONTEXT" | "INVALID_OWNER" | "OWNER_ATTEMPT_MISMATCH"
  | "CREDIT_NOT_SUPPORTED" | "SUBSCRIPTION_NOT_SUPPORTED";
export class PublicCheckoutContractError extends Error {
  readonly reason: PublicCheckoutContractReason;
  constructor(reason: PublicCheckoutContractReason) {
    super(reason); this.name = "PublicCheckoutContractError"; this.reason = reason;
  }
}
type QuotedItem = CommerceOrderInputItem & { quotedUnitPrice: number };
export type PublicCheckoutSelectedFacts = {
  contractVersion: 1; canonicalAttemptKey: string;
  requestFamily: "STORE_CONTAINING_PROTOCOL_V1"; ownerBinding: PublicCheckoutOwnerBinding;
  items: CommerceOrderInputItem[]; orderMode: CommerceCheckoutOrderContext["orderMode"];
  customer: CommerceCheckoutOrderContext["customer"];
  store: { id: string; name: string; address: string } | null;
  studioPickup: { preferredDate: string } | null;
  deliveryAddress: Extract<CommerceCheckoutOrderContext, { orderMode: "home_delivery" }>["deliveryAddress"] | null;
  paymentMethod: "pickup_confirmation" | "cash_on_delivery" | "atm_transfer";
  creditIntent: { requestedCredit: 0 }; subscriptionIntent: { presence: "absent" };
};
type AttemptIdentity = { suppliedIdempotencyKey: string; canonicalAttemptKey: string };
export type PublicCheckoutFamilyResult =
  | (AttemptIdentity & { family: "CORPORATE_GIFT" | "LEGACY_COFFEE" })
  | (AttemptIdentity & { family: "STORE_CONTAINING_PROTOCOL_V1";
      selectedFacts: PublicCheckoutSelectedFacts; fingerprint: string;
      /** Structural quotes only, in input order. Live admission must check current prices later. */
      admissionItems: QuotedItem[] })
  | { family: "REJECTED"; reason: PublicCheckoutContractReason };

function fail(reason: PublicCheckoutContractReason): never { throw new PublicCheckoutContractError(reason); }
function fields(value: unknown, allowed: readonly string[], reason: PublicCheckoutContractReason = "INVALID_REQUEST") {
  if (!isCartRecord(value) || Reflect.ownKeys(value).some(key => typeof key !== "string" || !allowed.includes(key))) return fail(reason);
  return value;
}
/** New attempt identity only; no historical key rewrite or lock selection. */
export function canonicalPublicCheckoutAttemptKey(value: unknown): string {
  try { return normalizeCheckoutAttemptKey(value); }
  catch { return fail("INVALID_ATTEMPT_KEY"); }
}
/** Trusted caller supplies ONLY an already-authenticated/verified stable descriptor.
 * This function neither authenticates a member nor verifies a raw capability.
 */
function ownerBinding(value: unknown, attempt: string): PublicCheckoutOwnerBinding {
  if (!isCartRecord(value)) return fail("INVALID_OWNER");
  if (value.kind === "member") {
    const member = fields(value, ["kind", "memberId"], "INVALID_OWNER");
    try { return { kind: "member", memberId: cartIdentifier(member.memberId, "memberId") }; }
    catch { return fail("INVALID_OWNER"); }
  }
  if (value.kind === "guest") {
    const guest = fields(value, ["kind", "canonicalAttemptKey", "tokenHash"], "INVALID_OWNER");
    const key = canonicalPublicCheckoutAttemptKey(guest.canonicalAttemptKey);
    if (key !== attempt) return fail("OWNER_ATTEMPT_MISMATCH");
    if (typeof guest.tokenHash !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(guest.tokenHash)) return fail("INVALID_OWNER");
    return { kind: "guest", canonicalAttemptKey: key, tokenHash: guest.tokenHash };
  }
  return fail("INVALID_OWNER");
}
const legacyFields = ["slug", "optionId", "optionLabel", "quotedUnitPrice", "quantity",
  "preparationLabel", "customRoast", "roastLevel", "roastNote"];
/** Shape recognition only. Existing pricing, preparation/SKU, roast eligibility and
 * quantity aggregation remain exclusively the legacy route's responsibility.
 * No legacy request/item is returned rewritten or converted into a V1 item.
 */
function isLegacyCoffeeItem(value: unknown): boolean {
  if (!isCartRecord(value) || Reflect.ownKeys(value).some(key => typeof key !== "string" || !legacyFields.includes(key))) return false;
  if (typeof value.slug !== "string" || !value.slug.trim()
    || typeof value.quotedUnitPrice !== "number" || !Number.isFinite(value.quotedUnitPrice) || value.quotedUnitPrice < 0) return false;
  if (value.optionId !== undefined && typeof value.optionId !== "string") return false;
  if (value.optionLabel !== undefined && typeof value.optionLabel !== "string") return false;
  if (!(typeof value.optionId === "string" && value.optionId.trim())
    && !(typeof value.optionLabel === "string" && value.optionLabel.trim())) return false;
  if (typeof value.quantity !== "number" && typeof value.quantity !== "string") return false;
  const quantity = Number(value.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return false;
  if (value.customRoast !== undefined && typeof value.customRoast !== "boolean") return false;
  return ["preparationLabel", "roastLevel", "roastNote"].every(key => value[key] === undefined || typeof value[key] === "string");
}
function storeItems(raw: unknown[]): { items: CommerceOrderInputItem[]; admissionItems: QuotedItem[] } {
  const quotes: number[] = [], selections: Record<string, unknown>[] = [];
  for (const rawLine of raw) {
    if (!isCartRecord(rawLine) || !Object.hasOwn(rawLine, "domain")) return fail("MIXED_SERIALIZATION_REQUIRED");
    const allowed = rawLine.domain === "coffee"
      ? ["domain", "productId", "variantId", "quantity", "coffeeOptions", "quotedUnitPrice"]
      : ["domain", "productId", "variantId", "quantity", "quotedUnitPrice"];
    const line = fields(rawLine, allowed, "INVALID_ITEM");
    if (typeof line.quotedUnitPrice !== "number" || !Number.isSafeInteger(line.quotedUnitPrice) || line.quotedUnitPrice < 0) return fail("INVALID_QUOTE");
    quotes.push(line.quotedUnitPrice);
    const { quotedUnitPrice: _quote, ...selection } = line;
    selections.push(selection);
  }
  let items: CommerceOrderInputItem[];
  try { items = validateCommerceOrderInput(selections); }
  catch { return fail("INVALID_ITEM"); }
  const admissionItems = items.map((item, index) => ({ ...item, quotedUnitPrice: quotes[index] }));
  // Preserve every line, including duplicates and distinct Coffee options.
  const sorted = [...items].sort((a, b) => {
    const left = JSON.stringify(a), right = JSON.stringify(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return { items: sorted, admissionItems };
}
function storeContext(input: Record<string, unknown>): CommerceCheckoutOrderContext {
  const mode = input.orderMode;
  const common = ["idempotencyKey", "orderMode", "customer", "items", "requestedCredit"];
  const modeFields = mode === "studio_pickup" ? ["studioPickup"]
    : mode === "711_cod" ? ["store"]
    : mode === "home_delivery" ? ["deliveryAddress", "paymentMethod"] : fail("INVALID_CONTEXT");
  if (Object.hasOwn(input, "subscriptionIntent")) return fail("SUBSCRIPTION_NOT_SUPPORTED");
  if (Object.hasOwn(input, "requestedCredit") && input.requestedCredit !== 0) return fail("CREDIT_NOT_SUPPORTED");
  fields(input, [...common, ...modeFields]);
  const customer = fields(input.customer, ["name", "phone", "email", "note"], "INVALID_CONTEXT");
  // Match public admission's 20/10 limits, with the shared strict context parser
  // validating strings, controls, email/phone, note <= 200 and mode selections.
  if (typeof customer.name !== "string" || customer.name.length > 20
    || typeof customer.phone !== "string" || customer.phone.length > 10) return fail("INVALID_CONTEXT");
  const selected: Record<string, unknown> = {
    orderMode: mode,
    customer: { name: customer.name, phone: customer.phone,
      email: Object.hasOwn(customer, "email") ? customer.email : "",
      note: Object.hasOwn(customer, "note") ? customer.note : "" },
  };
  for (const key of modeFields) selected[key] = input[key];
  try { return normalizeCommerceCheckoutContext(selected); }
  catch { return fail("INVALID_CONTEXT"); }
}
/** Pure contract foundation, NOT admission or dispatch. No catalog/capability,
 * environment, filesystem, network, locks or durable writes. Browser ownership
 * and derived facts are rejected; trusted snapshots are deliberately not inputs.
 */
export function classifyPublicCheckoutRequest(raw: unknown, trustedOwner?: unknown): PublicCheckoutFamilyResult {
  try {
    if (!isCartRecord(raw)) return fail("INVALID_REQUEST");
    const canonicalAttemptKey = canonicalPublicCheckoutAttemptKey(raw.idempotencyKey);
    const identity = { suppliedIdempotencyKey: raw.idempotencyKey as string, canonicalAttemptKey };
    if (raw.items !== undefined && raw.items !== null && !Array.isArray(raw.items)) return fail("INVALID_REQUEST");
    const lines: unknown[] = Array.isArray(raw.items) ? raw.items : [];
    for (const line of lines) {
      if (!isCartRecord(line)) return fail("INVALID_ITEM");
      if (Object.hasOwn(line, "domain") && line.domain !== "coffee" && line.domain !== "store") return fail("UNKNOWN_DOMAIN");
    }
    const hasStore = lines.some(line => isCartRecord(line) && line.domain === "store");
    if (raw.orderMode === "corporate_gift") {
      if (hasStore) return fail("GIFT_MERCHANDISE_CONFLICT");
      if (lines.some(line => !isLegacyCoffeeItem(line))) return fail("GIFT_MERCHANDISE_CONFLICT");
      // Inquiry validation stays in the original route. No merchandise selected facts.
      return { family: "CORPORATE_GIFT", ...identity };
    }
    if (!hasStore) {
      if (lines.some(line => isCartRecord(line) && Object.hasOwn(line, "domain"))) return fail("EXPLICIT_COFFEE_NOT_SUPPORTED");
      if (!lines.length || lines.some(line => !isLegacyCoffeeItem(line))) return fail("INVALID_LEGACY_ITEM");
      if (raw.orderMode !== undefined && raw.orderMode !== null && raw.orderMode !== ""
        && !["studio_pickup", "711_cod", "home_delivery"].includes(String(raw.orderMode))) return fail("INVALID_CONTEXT");
      return { family: "LEGACY_COFFEE", ...identity };
    }
    const normalized = storeItems(lines), context = storeContext(raw);
    const selectedFacts: PublicCheckoutSelectedFacts = {
      contractVersion: 1, canonicalAttemptKey, requestFamily: "STORE_CONTAINING_PROTOCOL_V1",
      ownerBinding: ownerBinding(trustedOwner, canonicalAttemptKey), items: normalized.items,
      orderMode: context.orderMode, customer: context.customer,
      store: context.orderMode === "711_cod" ? context.store : null,
      studioPickup: context.orderMode === "studio_pickup" ? context.studioPickup : null,
      deliveryAddress: context.orderMode === "home_delivery" ? context.deliveryAddress : null,
      paymentMethod: context.orderMode === "studio_pickup" ? "pickup_confirmation"
        : context.orderMode === "711_cod" ? "cash_on_delivery" : context.paymentMethod,
      creditIntent: { requestedCredit: 0 }, subscriptionIntent: { presence: "absent" },
    };
    const fingerprint = createHash("sha256").update(JSON.stringify(selectedFacts)).digest("hex");
    return { family: "STORE_CONTAINING_PROTOCOL_V1", ...identity,
      selectedFacts, fingerprint, admissionItems: normalized.admissionItems };
  } catch (error) {
    if (error instanceof PublicCheckoutContractError) return { family: "REJECTED", reason: error.reason };
    throw error;
  }
}
