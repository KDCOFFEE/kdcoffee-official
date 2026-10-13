import "server-only";
import type { Member } from "./memberAuth";
import { isCartRecord } from "./commerceCart";
import { validateCommerceOrderInput, CommerceOrderResolutionError, type CommerceOrderInputItem } from "./commerceOrderTypes";
import { resolveCommerceOrderItems } from "./commerceOrderResolver";
import { commerceOrderMoney } from "./commerceOrderPricing";
import { getActiveMembershipRules } from "./membershipBusinessRules";
import { resolvePickupDateAvailability, MembershipPolicyError } from "./membershipPolicies";
import { getDateOnlyInTimeZone } from "./checkoutRules";
import { isStoreCommerceEnabled } from "./storeCommerceCapability";
import { isValidIdempotencyKey } from "./orderIdempotency";
import type { CommerceOrderTransactionRequest } from "./commerceOrderTransaction";

/** Supplied separately by a trusted server caller, never derived from checkout JSON.
 * Member uses the existing authenticated Member shape; guest uses the existing persisted hash shape.
 */
export type TrustedCheckoutIdentity = {
  member?: Pick<Member, "id" | "lineUserId" | "displayName"> | null;
  guestOrderAccess?: { tokenHash: string; createdAt: string } | null;
};
export type CheckoutOwnership =
  | { kind: "member"; member: { memberId: string; lineUserId?: string; lineDisplayName?: string } }
  | { kind: "guest"; guestOrderAccess: { tokenHash: string; createdAt: string } };
export type AdmissionReason = "INVALID_REQUEST" | "INVALID_IDENTITY" | "UNKNOWN_DOMAIN"
  | "OUTSIDE_MERCHANDISE_ADMISSION" | "INVALID_MONEY" | "STORE_COMMERCE_DISABLED"
  | "STORE_CREDIT_NOT_SUPPORTED" | "STORE_SUBSCRIPTION_NOT_SUPPORTED" | "MODE_NOT_SUPPORTED"
  | "PAYMENT_NOT_SUPPORTED" | "PRICE_CHANGED" | "INVALID_PICKUP_DATE"
  | "PICKUP_TOO_EARLY" | "PICKUP_DATE_BLOCKED" | "SOURCE_UNAVAILABLE"
  | ConstructorParameters<typeof CommerceOrderResolutionError>[0];
export type CheckoutAdmissionResult =
  | { kind: "PROTOCOL_V1_ELIGIBLE"; candidate: {
      request: CommerceOrderTransactionRequest; ownership: CheckoutOwnership;
      merchandiseSubtotal: number; rulesVersion: number; admittedAt: string;
      priceAssertions: { domain: CommerceOrderInputItem["domain"]; productId: string; variantId: string;
        quotedUnitPrice: number; currentUnitPrice: number }[];
    } }
  | { kind: "LEGACY_COFFEE_REQUIRED"; reason: "COFFEE_CREDIT" | "COFFEE_SUBSCRIPTION" | "COFFEE_DELIVERY_MODE" }
  | { kind: "REJECTED"; reason: AdmissionReason; lineIndex?: number };

class AdmissionValidationError extends Error {
  readonly reason: AdmissionReason;
  constructor(reason: AdmissionReason) { super(reason); this.reason = reason; }
}
function fail(reason: AdmissionReason): never { throw new AdmissionValidationError(reason); }
function record(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!isCartRecord(value) || Reflect.ownKeys(value).some(key => typeof key !== "string" || !allowed.includes(key))) fail("INVALID_REQUEST");
  return value;
}
function text(value: unknown, limit: number, empty = false): string {
  if (typeof value !== "string" || value.length > limit || /[\u0000-\u001f\u007f]/u.test(value)) fail("INVALID_REQUEST");
  const result = value.trim();
  if (!empty && !result) fail("INVALID_REQUEST");
  return result;
}
function money(value: unknown): number {
  try { return commerceOrderMoney(value); } catch { return fail("INVALID_MONEY"); }
}
function ownership(value: TrustedCheckoutIdentity): CheckoutOwnership {
  try {
    const identity = record(value, ["member", "guestOrderAccess"]);
    const hasMember = identity.member != null, hasGuest = identity.guestOrderAccess != null;
    if (hasMember === hasGuest) fail("INVALID_IDENTITY");
    if (hasMember) {
      const member = record(identity.member, ["id", "lineUserId", "displayName"]);
      return { kind: "member", member: { memberId: text(member.id, 200),
        ...(member.lineUserId !== undefined ? { lineUserId: text(member.lineUserId, 200) } : {}),
        ...(member.displayName !== undefined ? { lineDisplayName: text(member.displayName, 200, true) } : {}) } };
    }
    const guest = record(identity.guestOrderAccess, ["tokenHash", "createdAt"]);
    // createGuestOrderAccess uses SHA-256 base64url; no token generation/rotation here.
    if (typeof guest.tokenHash !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(guest.tokenHash)) fail("INVALID_IDENTITY");
    const createdAt = text(guest.createdAt, 40);
    if (!Number.isFinite(Date.parse(createdAt))) fail("INVALID_IDENTITY");
    return { kind: "guest", guestOrderAccess: { tokenHash: guest.tokenHash, createdAt } };
  } catch { return fail("INVALID_IDENTITY"); }
}

/** Read-only candidate classification, NOT a reservation or permission to submit an order.
 * The future bridge must repeat admission under canonical transaction locks before PREPARED/APPLY.
 * Legacy results require the original Coffee request; this function never strips lines or intent.
 * No public caller, transaction execution, reward calculation or state writes.
 */
export async function admitCommerceCheckout(
  raw: unknown, trustedIdentity: TrustedCheckoutIdentity, now = new Date(),
): Promise<CheckoutAdmissionResult> {
  try {
    const input = record(raw, ["idempotencyKey", "items", "orderMode", "customer", "studioPickup",
      "payment", "paymentMethod", "store", "deliveryAddress", "requestedCredit", "creditApplied", "subscriptionIntent"]);
    if (input.orderMode === "corporate_gift") fail("OUTSIDE_MERCHANDISE_ADMISSION");
    if (!["studio_pickup", "711_cod", "home_delivery"].includes(String(input.orderMode))
      || !isValidIdempotencyKey(input.idempotencyKey) || !Number.isFinite(now.getTime())) fail("INVALID_REQUEST");
    const owner = ownership(trustedIdentity);
    if (!Array.isArray(input.items) || !input.items.length) fail("INVALID_ITEM");
    const quotes: number[] = [];
    const selections = input.items.map(rawLine => {
      if (!isCartRecord(rawLine) || (rawLine.domain !== "coffee" && rawLine.domain !== "store")) fail("UNKNOWN_DOMAIN");
      const line = record(rawLine, rawLine.domain === "coffee"
        ? ["domain", "productId", "variantId", "quantity", "coffeeOptions", "quotedUnitPrice"]
        : ["domain", "productId", "variantId", "quantity", "quotedUnitPrice"]);
      quotes.push(money(line.quotedUnitPrice));
      const { quotedUnitPrice: _quote, ...selection } = line;
      return selection;
    });
    const items = validateCommerceOrderInput(selections);
    const hasStore = items.some(item => item.domain === "store");
    const requestedCredit = money(input.requestedCredit === undefined ? 0 : input.requestedCredit);
    const creditApplied = money(input.creditApplied === undefined ? 0 : input.creditApplied);
    // Presence is preserved, including null/undefined; only absence enters the v1 candidate contract.
    const subscriptionPresent = Object.hasOwn(input, "subscriptionIntent");
    if (hasStore && (requestedCredit > 0 || creditApplied > 0)) fail("STORE_CREDIT_NOT_SUPPORTED");
    if (hasStore && subscriptionPresent) fail("STORE_SUBSCRIPTION_NOT_SUPPORTED");
    if (hasStore && input.orderMode !== "studio_pickup") fail("MODE_NOT_SUPPORTED");
    if (hasStore && !isStoreCommerceEnabled()) fail("STORE_COMMERCE_DISABLED");

    const resolved = await resolveCommerceOrderItems(items);
    const priceAssertions = resolved.lines.map((line, index) => ({
      domain: line.domain, productId: line.productId, variantId: line.variantId,
      quotedUnitPrice: quotes[index], currentUnitPrice: money(line.unitPrice),
    }));
    const changed = priceAssertions.findIndex(line => line.quotedUnitPrice !== line.currentUnitPrice);
    if (changed !== -1) return { kind: "REJECTED", reason: "PRICE_CHANGED", lineIndex: changed };
    money(resolved.itemsSubtotal);
    if (input.orderMode !== "studio_pickup") return { kind: "LEGACY_COFFEE_REQUIRED", reason: "COFFEE_DELIVERY_MODE" };
    if (requestedCredit > 0 || creditApplied > 0) return { kind: "LEGACY_COFFEE_REQUIRED", reason: "COFFEE_CREDIT" };
    if (subscriptionPresent) return { kind: "LEGACY_COFFEE_REQUIRED", reason: "COFFEE_SUBSCRIPTION" };
    if ((input.payment !== undefined && input.payment !== "pickup_confirmation")
      || (input.paymentMethod != null && input.paymentMethod !== "pickup_confirmation")
      || input.store != null || input.deliveryAddress != null) fail("PAYMENT_NOT_SUPPORTED");
    const customer = record(input.customer, ["name", "phone", "email", "note"]);
    const normalizedCustomer = { name: text(customer.name, 20), phone: text(customer.phone, 10),
      email: text(customer.email, 120, true), note: text(customer.note, 200, true) };
    if (!/^09\d{8}$/.test(normalizedCustomer.phone)
      || (normalizedCustomer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedCustomer.email))) fail("INVALID_REQUEST");
    const pickup = record(input.studioPickup, ["preferredDate"]);
    if (typeof pickup.preferredDate !== "string") fail("INVALID_PICKUP_DATE");
    const version = await getActiveMembershipRules(now);
    let availability: ReturnType<typeof resolvePickupDateAvailability>;
    try {
      availability = resolvePickupDateAvailability({ requestedDate: pickup.preferredDate,
        today: getDateOnlyInTimeZone(now), customRoast: resolved.lines.some(line => line.domain === "coffee" && line.customRoast),
        rules: version.rules });
    } catch (error) {
      if (error instanceof MembershipPolicyError) fail("INVALID_PICKUP_DATE");
      throw error;
    }
    if (!availability.allowed) fail(availability.reason === "blocked-date" ? "PICKUP_DATE_BLOCKED" : "PICKUP_TOO_EARLY");
    return { kind: "PROTOCOL_V1_ELIGIBLE", candidate: {
      request: { idempotencyKey: input.idempotencyKey.toLowerCase(), items,
        orderContext: { orderMode: "studio_pickup", customer: normalizedCustomer,
          studioPickup: { preferredDate: availability.requestedDate }, creditApplied: 0 } },
      ownership: owner, merchandiseSubtotal: resolved.itemsSubtotal, rulesVersion: version.rulesVersion,
      admittedAt: now.toISOString(), priceAssertions,
    } };
  } catch (error) {
    if (error instanceof AdmissionValidationError) return { kind: "REJECTED", reason: error.reason };
    if (error instanceof CommerceOrderResolutionError) return { kind: "REJECTED", reason: error.code };
    return { kind: "REJECTED", reason: "SOURCE_UNAVAILABLE" };
  }
}