import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { guestTokenHash } from "./orderConversation";
import { isValidIdempotencyKey } from "./orderIdempotency";

export const GUEST_CHECKOUT_ACCESS_PURPOSE = "guest_checkout_order_access" as const;
const FORMAT = "gco1";
const SIGNING_SCOPE = "guest-checkout-order-access:v1:";
const NONCE_BYTES = 32;
export type GuestCheckoutAccessClaims = {
  version: 1;
  purpose: typeof GUEST_CHECKOUT_ACCESS_PURPOSE;
  idempotencyKey: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
};
export type CheckoutAttemptAccessErrorCode = "INVALID_SECRET" | "INVALID_KEY" | "INVALID_TIME"
  | "INVALID_TTL" | "INVALID_NONCE" | "INVALID_TOKEN" | "INVALID_SIGNATURE" | "INVALID_CLAIMS"
  | "ATTEMPT_MISMATCH" | "NOT_YET_VALID" | "EXPIRED";
export class CheckoutAttemptAccessError extends Error {
  readonly code: CheckoutAttemptAccessErrorCode;
  constructor(code: CheckoutAttemptAccessErrorCode) {
    super(code); this.name = "CheckoutAttemptAccessError"; this.code = code;
  }
}
function fail(code: CheckoutAttemptAccessErrorCode): never { throw new CheckoutAttemptAccessError(code); }
export function normalizeCheckoutAttemptKey(value: unknown): string {
  if (!isValidIdempotencyKey(value)) return fail("INVALID_KEY");
  return value.toLowerCase();
}
function decodeCanonical(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return fail("INVALID_TOKEN");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) return fail("INVALID_TOKEN");
  return decoded;
}
function timestamp(value: unknown): number {
  if (typeof value !== "string") return fail("INVALID_CLAIMS");
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== value) return fail("INVALID_CLAIMS");
  return instant;
}
/** No environment lookup, persistence, ownership conversion, or public wiring.
 * The caller supplies a secure server secret and its issuance TTL policy.
 * Issuance verification is valid on [issuedAt, expiresAt). Established orders
 * continue using the existing hash-only authorization, independently of this TTL.
 */
export function createCheckoutAttemptAccess(dependencies: {
  secret: Uint8Array;
  now?: () => Date;
  /** Trusted server/test dependency; production default is Node CSPRNG. */
  nonceBytes?: (size: number) => Uint8Array;
}) {
  if (!(dependencies.secret instanceof Uint8Array) || dependencies.secret.byteLength < 32) return fail("INVALID_SECRET");
  // Copy the key so subsequent caller buffer mutation cannot change this service.
  const secret = Buffer.from(dependencies.secret);
  const clock = dependencies.now ?? (() => new Date());
  const nonceBytes = dependencies.nonceBytes ?? randomBytes;
  function nowMs(): number {
    const value = clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return fail("INVALID_TIME");
    return value.getTime();
  }
  function mac(payload: string): Buffer {
    return createHmac("sha256", secret).update(SIGNING_SCOPE).update(payload).digest();
  }
  function issue(input: { idempotencyKey: unknown; ttlMs: number }) {
    const idempotencyKey = normalizeCheckoutAttemptKey(input.idempotencyKey), issued = nowMs();
    const expires = issued + input.ttlMs;
    if (!Number.isSafeInteger(input.ttlMs) || input.ttlMs <= 0 || !Number.isSafeInteger(expires)
      || !Number.isFinite(new Date(expires).getTime())) return fail("INVALID_TTL");
    const nonce = nonceBytes(NONCE_BYTES);
    if (!(nonce instanceof Uint8Array) || nonce.byteLength !== NONCE_BYTES) return fail("INVALID_NONCE");
    const claims: GuestCheckoutAccessClaims = {
      version: 1, purpose: GUEST_CHECKOUT_ACCESS_PURPOSE, idempotencyKey,
      nonce: Buffer.from(nonce).toString("base64url"), issuedAt: new Date(issued).toISOString(),
      expiresAt: new Date(expires).toISOString(),
    };
    const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    const token = FORMAT + "." + payload + "." + mac(payload).toString("base64url");
    return { token, tokenHash: guestTokenHash(token), ...claims };
  }
  function verify(input: { token: unknown; idempotencyKey: unknown }): GuestCheckoutAccessClaims {
    const key = normalizeCheckoutAttemptKey(input.idempotencyKey);
    if (typeof input.token !== "string" || input.token.length > 2048) return fail("INVALID_TOKEN");
    const parts = input.token.split(".");
    if (parts.length !== 3 || parts[0] !== FORMAT) return fail("INVALID_TOKEN");
    const payload = parts[1], signature = decodeCanonical(parts[2]), bytes = decodeCanonical(payload);
    const expected = mac(payload);
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return fail("INVALID_SIGNATURE");
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.toString("utf8")); } catch { return fail("INVALID_CLAIMS"); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("INVALID_CLAIMS");
    const source = parsed as Record<string, unknown>;
    const fields = ["version", "purpose", "idempotencyKey", "nonce", "issuedAt", "expiresAt"];
    if (Object.keys(source).length !== fields.length || Object.keys(source).some(field => !fields.includes(field))
      || source.version !== 1 || source.purpose !== GUEST_CHECKOUT_ACCESS_PURPOSE
      || !isValidIdempotencyKey(source.idempotencyKey) || source.idempotencyKey !== source.idempotencyKey.toLowerCase()
      || typeof source.nonce !== "string" || source.nonce.length !== 43) return fail("INVALID_CLAIMS");
    if (decodeCanonical(source.nonce).length !== NONCE_BYTES) return fail("INVALID_CLAIMS");
    const issued = timestamp(source.issuedAt), expires = timestamp(source.expiresAt);
    if (expires <= issued) return fail("INVALID_CLAIMS");
    const claims: GuestCheckoutAccessClaims = {
      version: 1, purpose: GUEST_CHECKOUT_ACCESS_PURPOSE, idempotencyKey: source.idempotencyKey,
      nonce: source.nonce, issuedAt: source.issuedAt as string, expiresAt: source.expiresAt as string,
    };
    // Reject duplicate JSON keys, extra representations and non-canonical UTF-8.
    if (Buffer.from(JSON.stringify(claims), "utf8").toString("base64url") !== payload) return fail("INVALID_CLAIMS");
    if (claims.idempotencyKey !== key) return fail("ATTEMPT_MISMATCH");
    const current = nowMs();
    if (current < issued) return fail("NOT_YET_VALID");
    if (current >= expires) return fail("EXPIRED");
    return claims;
  }
  return { issue, verify };
}
