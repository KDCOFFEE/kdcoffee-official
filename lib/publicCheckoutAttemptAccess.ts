import "server-only";
import { createCheckoutAttemptAccess } from "./checkoutAttemptAccess";
import { timingSafeEqual } from "node:crypto";
import { canonicalPublicCheckoutAttemptKey } from "./publicCheckoutContract";
import { isValidatedCheckoutAttemptRecoveryAuthority, type CheckoutAttemptRecoveryAuthority } from "./checkoutAttemptResolver";
import { guestTokenHash } from "./orderConversation";
import { isStoreCommerceEnabled } from "./storeCommerceCapability";
import type { TrustedCheckoutIdentity } from "./commerceCheckoutAdmission";

const TTL_MS = 900000;
export class PublicCheckoutAttemptAccessUnavailableError extends Error {
  readonly code: "DISABLED" | "UNAVAILABLE";
  readonly status: 403 | 503;
  constructor(code: "DISABLED" | "UNAVAILABLE") {
    super("結帳授權服務暫時無法使用。");
    this.name = "PublicCheckoutAttemptAccessUnavailableError";
    this.code = code;
    this.status = code === "DISABLED" ? 403 : 503;
  }
}
function dedicatedSecret(): Buffer {
  const value = process.env.GUEST_CHECKOUT_ACCESS_SECRET;
  if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value, "utf8") < 32) {
    throw new PublicCheckoutAttemptAccessUnavailableError("UNAVAILABLE");
  }
  return Buffer.from(value, "utf8");
}

/** Trusted server/test clock only. No browser policy, persistence, or order dispatch. */
export function createPublicCheckoutAttemptAccess(dependencies: { now?: () => Date } = {}) {
  function authority() {
    if (!isStoreCommerceEnabled()) throw new PublicCheckoutAttemptAccessUnavailableError("DISABLED");
    return createCheckoutAttemptAccess({ secret: dedicatedSecret(), now: dependencies.now });
  }
  function issue(input: { idempotencyKey: unknown }) {
    const issued = authority().issue({ idempotencyKey: input.idempotencyKey, ttlMs: TTL_MS });
    return {
      token: issued.token, tokenHash: issued.tokenHash, idempotencyKey: issued.idempotencyKey,
      issuedAt: issued.issuedAt, expiresAt: issued.expiresAt,
    };
  }
  function resolveIdentity(input: { token: unknown; idempotencyKey: unknown }) {
    const claims = authority().verify(input);
    // verify has established that token is a valid string before hashing it.
    return { guestOrderAccess: {
      tokenHash: guestTokenHash(input.token as string), createdAt: claims.issuedAt,
    } } satisfies TrustedCheckoutIdentity;
  }
  return { issue, resolveIdentity };
}
export function issuePublicGuestCheckoutAttemptAccess(input: { idempotencyKey: unknown }) {
  return createPublicCheckoutAttemptAccess().issue(input);
}
export function resolveGuestCheckoutIdentityFromAttemptAccess(input: { token: unknown; idempotencyKey: unknown }) {
  return createPublicCheckoutAttemptAccess().resolveIdentity(input);
}

export class DurableGuestCheckoutIdentityError extends Error {
  readonly code = "INVALID_IDENTITY";
  constructor() { super("INVALID_IDENTITY"); this.name = "DurableGuestCheckoutIdentityError"; }
}
/** Existing-attempt possession only. Never verifies fresh capability, reads
 * current secret/gate, issues a token, or creates durable authority.
 */
export function resolveDurableGuestCheckoutIdentity(input: {
  token: unknown; canonicalAttemptKey: unknown; authority: CheckoutAttemptRecoveryAuthority;
}): TrustedCheckoutIdentity {
  const invalid = (): never => { throw new DurableGuestCheckoutIdentityError(); };
  const authority = input.authority;
  if (!isValidatedCheckoutAttemptRecoveryAuthority(authority) || authority.kind !== "PROTOCOL_V1_GUEST"
    || typeof input.token !== "string" || !input.token.trim() || Buffer.byteLength(input.token, "utf8") > 4096) return invalid();
  let key: string;
  try { key = canonicalPublicCheckoutAttemptKey(input.canonicalAttemptKey); } catch { return invalid(); }
  if (key !== authority.canonicalAttemptKey || key !== authority.owner.canonicalAttemptKey) return invalid();
  const expected = Buffer.from(authority.owner.tokenHash, "base64url"), actual = Buffer.from(guestTokenHash(input.token), "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return invalid();
  return { guestOrderAccess: { tokenHash: authority.owner.tokenHash, createdAt: authority.owner.createdAt } };
}
