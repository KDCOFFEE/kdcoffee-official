import "server-only";
import { canonicalPublicCheckoutAttemptKey, type PublicCheckoutOwnerBinding } from "./publicCheckoutContract";
import { isCartRecord, cartIdentifier } from "./commerceCart";
import { validateCommerceOrderInput, normalizeCommerceCheckoutContext } from "./commerceOrderTypes";
import { resolveTrustedCheckoutOwnership, type CheckoutOwnership } from "./commerceCheckoutAdmission";
import { commerceOrderTransactionIdForCanonicalKey as commerceOrderTransactionId } from "./commerceOrderTransactionIdentity";
import { createIdempotencyRequestHash } from "./orderIdempotency";

export type CheckoutAttemptBindingSnapshot = Readonly<{
  schemaVersion: 1; contractVersion: 1; requestFamily: "STORE_CONTAINING_PROTOCOL_V1";
  canonicalAttemptKey: string; selectedFactsFingerprint: string;
  ownerBinding: Readonly<PublicCheckoutOwnerBinding>;
}>;
export type BindingValidationReason = "INVALID_INPUT" | "INVALID_VERSION" | "INVALID_FAMILY"
  | "INVALID_KEY" | "NON_CANONICAL_KEY" | "INVALID_FINGERPRINT" | "INVALID_OWNER" | "GUEST_KEY_MISMATCH";
export class CheckoutAttemptBindingValidationError extends Error {
  readonly reason: BindingValidationReason;
  constructor(reason: BindingValidationReason) {
    super(reason); this.name = "CheckoutAttemptBindingValidationError"; this.reason = reason;
  }
}
type Review = { kind: "REVIEW_REQUIRED"; reason: BindingValidationReason | "ATTEMPT_MISMATCH"
  | "INVALID_HISTORICAL_INTENT" | "INVALID_HISTORICAL_OWNER" | "INVALID_CURRENT_REQUEST" };
export type StableOwnerComparison = { kind: "MATCH" } | { kind: "OWNER_MISMATCH" } | Review;
export type CheckoutAttemptBindingComparison = StableOwnerComparison | { kind: "SELECTION_CONFLICT" };
export type HistoricalV1BindingComparison =
  | { kind: "MATCH_LEGACY_V1" } | { kind: "OWNER_MISMATCH" } | { kind: "SELECTION_CONFLICT" }
  | { kind: "NOT_APPLICABLE" } | Review;
function fail(reason: BindingValidationReason): never { throw new CheckoutAttemptBindingValidationError(reason); }
function record(value: unknown, allowed: readonly string[], reason: BindingValidationReason = "INVALID_INPUT") {
  if (!isCartRecord(value)) return fail(reason);
  for (const field of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (typeof field !== "string" || !allowed.includes(field) || !descriptor?.enumerable
      || !Object.hasOwn(descriptor, "value")) return fail(reason);
  }
  return value;
}
function canonical(value: unknown, stored = false): string {
  let result: string;
  try { result = canonicalPublicCheckoutAttemptKey(value); } catch { return fail("INVALID_KEY"); }
  if (stored && value !== result) return fail("NON_CANONICAL_KEY");
  return result;
}
function fingerprint(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) return fail("INVALID_FINGERPRINT");
  return value;
}
function owner(value: unknown, stored = false): Readonly<PublicCheckoutOwnerBinding> {
  if (!isCartRecord(value)) return fail("INVALID_OWNER");
  if (value.kind === "member") {
    const input = record(value, ["kind", "memberId"], "INVALID_OWNER");
    let memberId: string;
    try { memberId = cartIdentifier(input.memberId, "memberId"); } catch { return fail("INVALID_OWNER"); }
    return Object.freeze({ kind: "member" as const, memberId });
  }
  if (value.kind === "guest") {
    const input = record(value, ["kind", "canonicalAttemptKey", "tokenHash"], "INVALID_OWNER");
    const canonicalAttemptKey = canonical(input.canonicalAttemptKey, stored);
    if (typeof input.tokenHash !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(input.tokenHash)) return fail("INVALID_OWNER");
    return Object.freeze({ kind: "guest" as const, canonicalAttemptKey, tokenHash: input.tokenHash });
  }
  return fail("INVALID_OWNER");
}
function ownersMatch(current: Readonly<PublicCheckoutOwnerBinding>, durable: Readonly<PublicCheckoutOwnerBinding>): boolean {
  if (current.kind === "member" && durable.kind === "member") return current.memberId === durable.memberId;
  return current.kind === "guest" && durable.kind === "guest"
    && current.canonicalAttemptKey === durable.canonicalAttemptKey && current.tokenHash === durable.tokenHash;
}
function review(error: unknown): Review {
  return { kind: "REVIEW_REQUIRED", reason: error instanceof CheckoutAttemptBindingValidationError ? error.reason : "INVALID_INPUT" };
}
function snapshot(key: string, hash: string, binding: Readonly<PublicCheckoutOwnerBinding>): CheckoutAttemptBindingSnapshot {
  if (binding.kind === "guest" && binding.canonicalAttemptKey !== key) return fail("GUEST_KEY_MISMATCH");
  return Object.freeze({ schemaVersion: 1, contractVersion: 1, requestFamily: "STORE_CONTAINING_PROTOCOL_V1",
    canonicalAttemptKey: key, selectedFactsFingerprint: hash, ownerBinding: binding });
}
/** Pure creation only: a fresh frozen JSON-safe value, never persisted or added to an intent. */
export function createCheckoutAttemptBindingSnapshot(raw: unknown): CheckoutAttemptBindingSnapshot {
  const input = record(raw, ["canonicalAttemptKey", "selectedFactsFingerprint", "ownerBinding"]);
  return snapshot(canonical(input.canonicalAttemptKey), fingerprint(input.selectedFactsFingerprint), owner(input.ownerBinding));
}
/** Durable representations are strictly canonical; validation does not repair them. */
export function validateCheckoutAttemptBindingSnapshot(raw: unknown): CheckoutAttemptBindingSnapshot {
  const input = record(raw, ["schemaVersion", "contractVersion", "requestFamily", "canonicalAttemptKey", "selectedFactsFingerprint", "ownerBinding"]);
  if (input.schemaVersion !== 1 || input.contractVersion !== 1) return fail("INVALID_VERSION");
  if (input.requestFamily !== "STORE_CONTAINING_PROTOCOL_V1") return fail("INVALID_FAMILY");
  return snapshot(canonical(input.canonicalAttemptKey, true), fingerprint(input.selectedFactsFingerprint), owner(input.ownerBinding, true));
}
/** Inputs are trusted stable descriptors, not Member/session or raw capability objects. */
export function compareStableCheckoutOwners(current: unknown, durable: unknown): StableOwnerComparison {
  try { return { kind: ownersMatch(owner(current), owner(durable)) ? "MATCH" : "OWNER_MISMATCH" }; }
  catch (error) { return review(error); }
}
export function compareCheckoutAttemptBinding(input: {
  currentCanonicalAttemptKey: unknown; currentSelectedFactsFingerprint: unknown;
  currentOwnerBinding: unknown; durableSnapshot: unknown;
}): CheckoutAttemptBindingComparison {
  try {
    const durable = validateCheckoutAttemptBindingSnapshot(input.durableSnapshot);
    const attempt = canonical(input.currentCanonicalAttemptKey);
    if (attempt !== durable.canonicalAttemptKey) return { kind: "REVIEW_REQUIRED", reason: "ATTEMPT_MISMATCH" };
    if (!ownersMatch(owner(input.currentOwnerBinding), durable.ownerBinding)) return { kind: "OWNER_MISMATCH" };
    if (fingerprint(input.currentSelectedFactsFingerprint) !== durable.selectedFactsFingerprint) return { kind: "SELECTION_CONFLICT" };
    return { kind: "MATCH" };
  } catch (error) { return review(error); }
}
function historicalOwner(order: Record<string, unknown>): CheckoutOwnership | null {
  const hasMember = order.member != null, hasGuest = order.guestOrderAccess != null;
  if (hasMember && hasGuest) return fail("INVALID_OWNER");
  if (!hasMember && !hasGuest) return null; // Unowned direct F3 is outside public-owned compatibility.
  if (hasMember) {
    const persisted = record(order.member, ["memberId", "lineUserId", "lineDisplayName"], "INVALID_OWNER");
    const trusted = { id: persisted.memberId,
      ...(Object.hasOwn(persisted, "lineUserId") ? { lineUserId: persisted.lineUserId } : {}),
      ...(Object.hasOwn(persisted, "lineDisplayName") ? { displayName: persisted.lineDisplayName } : {}) };
    // Reuse exactly the source-proven historical ownership validation/property order.
    const normalized = resolveTrustedCheckoutOwnership({ member: trusted as Parameters<typeof resolveTrustedCheckoutOwnership>[0]["member"] });
    if (normalized.kind !== "member" || Reflect.ownKeys(persisted).length !== Object.keys(normalized.member).length
      || Object.entries(persisted).some(([field, value]) => normalized.member[field as keyof typeof normalized.member] !== value)) return fail("INVALID_OWNER");
    return normalized;
  }
  const persisted = record(order.guestOrderAccess, ["tokenHash", "createdAt"], "INVALID_OWNER");
  const normalized = resolveTrustedCheckoutOwnership({
    guestOrderAccess: persisted as Parameters<typeof resolveTrustedCheckoutOwnership>[0]["guestOrderAccess"],
  });
  if (normalized.kind !== "guest" || Reflect.ownKeys(persisted).length !== 2
    || normalized.guestOrderAccess.tokenHash !== persisted.tokenHash || normalized.guestOrderAccess.createdAt !== persisted.createdAt) return fail("INVALID_OWNER");
  return normalized;
}
/** OLD OWNED PROTOCOL-V1 PREPARED ONLY. Caller must supply an intent from a trusted
 * B2/V1 evidence path; this does NOT verify the journal, authorize a session/raw
 * capability, handle legacy Coffee hashes, or execute recovery.
 * Current internal selections use precisely the existing transaction structural
 * normalization and JSON-item sorting. Hash property order remains
 * { items, orderContext, ownership }; durable original ownership alone is used.
 */
export function compareHistoricalV1CheckoutAttempt(input: {
  intent: unknown; currentRequest: unknown; currentOwnerBinding: unknown;
}): HistoricalV1BindingComparison {
  const durable = input.intent;
  if (!isCartRecord(durable) || durable.schemaVersion !== 1 || !isCartRecord(durable.order)
    || typeof durable.requestHash !== "string" || !/^[a-f0-9]{64}$/.test(durable.requestHash)) return { kind: "REVIEW_REQUIRED", reason: "INVALID_HISTORICAL_INTENT" };
  let attempt: string;
  try {
    attempt = canonical(durable.order.idempotencyKey);
    if (durable.transactionId !== commerceOrderTransactionId(attempt)
      || (durable.order.idempotencyRequestHash !== undefined && durable.order.idempotencyRequestHash !== durable.requestHash)) return { kind: "REVIEW_REQUIRED", reason: "INVALID_HISTORICAL_INTENT" };
  } catch { return { kind: "REVIEW_REQUIRED", reason: "INVALID_HISTORICAL_INTENT" }; }
  let persistedOwner: CheckoutOwnership | null;
  try { persistedOwner = historicalOwner(durable.order); }
  catch { return { kind: "REVIEW_REQUIRED", reason: "INVALID_HISTORICAL_OWNER" }; }
  if (!persistedOwner) return { kind: "NOT_APPLICABLE" };
  const stable: PublicCheckoutOwnerBinding = persistedOwner.kind === "member"
    ? { kind: "member", memberId: persistedOwner.member.memberId }
    : { kind: "guest", canonicalAttemptKey: attempt, tokenHash: persistedOwner.guestOrderAccess.tokenHash };
  let request: Record<string, unknown>;
  try {
    request = record(input.currentRequest, ["idempotencyKey", "items", "orderContext"]);
    if (canonical(request.idempotencyKey) !== attempt) return { kind: "REVIEW_REQUIRED", reason: "ATTEMPT_MISMATCH" };
  } catch { return { kind: "REVIEW_REQUIRED", reason: "INVALID_CURRENT_REQUEST" }; }
  const identity = compareStableCheckoutOwners(input.currentOwnerBinding, stable);
  if (identity.kind !== "MATCH") return identity;
  try {
    // Sparse/non-record arrays are rejected rather than silently losing lines.
    if (!Array.isArray(request.items) || [...request.items].some(item => !isCartRecord(item))) return { kind: "REVIEW_REQUIRED", reason: "INVALID_CURRENT_REQUEST" };
    const items = validateCommerceOrderInput(request.items).sort((a, b) => {
      const left = JSON.stringify(a), right = JSON.stringify(b); return left < right ? -1 : left > right ? 1 : 0;
    });
    const orderContext = normalizeCommerceCheckoutContext(request.orderContext);
    const hash = createIdempotencyRequestHash({ items, orderContext, ownership: persistedOwner });
    return { kind: hash === durable.requestHash ? "MATCH_LEGACY_V1" : "SELECTION_CONFLICT" };
  } catch { return { kind: "REVIEW_REQUIRED", reason: "INVALID_CURRENT_REQUEST" }; }
}
