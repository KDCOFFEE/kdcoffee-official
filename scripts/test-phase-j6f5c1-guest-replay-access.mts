import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  createCheckoutAttemptAccess, normalizeCheckoutAttemptKey,
  CheckoutAttemptAccessError, GUEST_CHECKOUT_ACCESS_PURPOSE,
  type CheckoutAttemptAccessErrorCode,
} from "../lib/checkoutAttemptAccess";
import { guestTokenHash, createGuestOrderAccess, verifyGuestOrderAccessToken, authorizeOrderConversationAccess } from "../lib/orderConversation";
import { verifySessionToken } from "../lib/memberAuth";

const secret = randomBytes(32), key = "abcdef01-2345-4678-89ab-cdef01234567";
const otherKey = "abcdef02-2345-4678-89ab-cdef01234567";
const instant = Date.parse("2026-10-13T14:00:00.000Z"), ttlMs = 60_000;
let current = instant, checks = 0, networkCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error("Network forbidden in C1"); };
const service = createCheckoutAttemptAccess({ secret, now: () => new Date(current) });
function check(label: string, operation: () => void) {
  try { operation(); console.log("PASS " + (++checks) + " " + label); }
  catch (error) { console.error("FAIL case " + (checks + 1) + " " + label); throw error; }
}
function rejects(operation: () => unknown, code?: CheckoutAttemptAccessErrorCode) {
  assert.throws(operation, (error: unknown) => error instanceof CheckoutAttemptAccessError && (!code || error.code === code));
}
function verify(token: unknown, attempt: unknown = key) { return service.verify({ token, idempotencyKey: attempt }); }
const issued = service.issue({ idempotencyKey: key, ttlMs });
const claims = service.verify({ token: issued.token, idempotencyKey: key });
function signed(value: unknown, prefix = "gco1") {
  const payload = Buffer.from(typeof value === "string" ? value : JSON.stringify(value), "utf8").toString("base64url");
  const mac = createHmac("sha256", secret).update("guest-checkout-order-access:v1:").update(payload).digest("base64url");
  return prefix + "." + payload + "." + mac;
}
try {
  check("server-issued v1 capability verifies", () => {
    assert.deepEqual(claims, { version: 1, purpose: GUEST_CHECKOUT_ACCESS_PURPOSE, idempotencyKey: key,
      nonce: issued.nonce, issuedAt: "2026-10-13T14:00:00.000Z", expiresAt: "2026-10-13T14:01:00.000Z" });
    assert.equal(issued.token.split(".")[0], "gco1");
  });
  check("same raw token gives stable canonical SHA256 base64url hash", () => {
    assert.equal(issued.tokenHash, guestTokenHash(issued.token));
    assert.equal(guestTokenHash(issued.token), guestTokenHash(issued.token));
    assert.equal(issued.tokenHash, createHash("sha256").update(issued.token).digest("base64url"));
    assert.match(issued.tokenHash, /^[A-Za-z0-9_-]{43}$/);
  });
  const fakeOrder = { orderNumber: "KD20261013-000001", createdAt: issued.issuedAt, orderMode: "711_cod",
    status: "inventory_committed", member: null, guestOrderAccess: { tokenHash: issued.tokenHash, createdAt: issued.issuedAt } };
  check("canonical existing guest authorization accepts capability hash", () => {
    assert.equal(verifyGuestOrderAccessToken(fakeOrder, issued.token), true);
    assert.equal(authorizeOrderConversationAccess(fakeOrder, { guestToken: issued.token }), "guest");
  });
  const replacement = service.issue({ idempotencyKey: key, ttlMs });
  check("separate same-attempt issuance has different CSPRNG nonce/token", () => {
    assert.notEqual(replacement.nonce, issued.nonce); assert.notEqual(replacement.token, issued.token);
    assert.equal(Buffer.from(issued.nonce, "base64url").length, 32);
  });
  check("separate issuance has different hash", () => assert.notEqual(replacement.tokenHash, issued.tokenHash));
  check("minimal claims contain no secret or customer/business claims", () => {
    assert.deepEqual(Object.keys(claims).sort(), ["version", "purpose", "idempotencyKey", "nonce", "issuedAt", "expiresAt"].sort());
    assert.ok(!JSON.stringify(issued).includes(secret.toString("hex")));
    assert.ok(!JSON.stringify(issued).includes(secret.toString("base64url")));
  });
  for (const token of [null, undefined, 12, {}, "", "gco1", "gco1..", "a.b.c.d", issued.token + ".extra",
    issued.token + "=", "gco2." + issued.token.split(".").slice(1).join("."), " ".repeat(2049)]) {
    check("malformed/unsupported token rejected " + String(token).slice(0, 15), () => rejects(() => verify(token)));
  }
  check("unsigned payload tampering fails MAC", () => {
    const payload = Buffer.from(JSON.stringify({ ...claims, idempotencyKey: otherKey })).toString("base64url");
    rejects(() => verify("gco1." + payload + "." + issued.token.split(".")[2]), "INVALID_SIGNATURE");
  });
  check("signature tampering fails constant-time MAC verification", () => {
    const parts = issued.token.split(".");
    const mac = Buffer.from(parts[2], "base64url"); mac[0] ^= 1;
    rejects(() => verify(parts[0] + "." + parts[1] + "." + mac.toString("base64url")), "INVALID_SIGNATURE");
  });
  check("wrong signing secret rejected", () => rejects(() =>
    createCheckoutAttemptAccess({ secret: randomBytes(32), now: () => new Date(current) }).verify({ token: issued.token, idempotencyKey: key }), "INVALID_SIGNATURE"));
  check("wrong UUID rejected", () => rejects(() => verify(issued.token, otherKey), "ATTEMPT_MISMATCH"));
  check("UUID case normalizes for issue and verify without legacy rewrite", () => {
    const upper = service.issue({ idempotencyKey: key.toUpperCase(), ttlMs });
    assert.equal(upper.idempotencyKey, key);
    assert.equal(verify(upper.token, key.toUpperCase()).idempotencyKey, key);
    assert.deepEqual(verify(issued.token, key.toUpperCase()), claims);
  });
  for (const badKey of ["", " " + key, key + " ", "KD20261013-000001", "not-a-uuid", null]) {
    check("invalid attempt key rejected " + String(badKey), () => rejects(() => normalizeCheckoutAttemptKey(badKey), "INVALID_KEY"));
  }
  check("correctly signed wrong purpose rejected", () => rejects(() => verify(signed({ ...claims, purpose: "member_session" })), "INVALID_CLAIMS"));
  check("correctly signed unsupported claims version rejected", () => rejects(() => verify(signed({ ...claims, version: 2 })), "INVALID_CLAIMS"));
  for (const field of ["member", "memberId", "lineUserId", "rewardOwner", "creditOwner", "subscriptionOwner", "orderNumber", "customer", "price"]) {
    check("even signed forbidden ownership/business claim rejected: " + field, () =>
      rejects(() => verify(signed({ ...claims, [field]: "forged" })), "INVALID_CLAIMS"));
  }
  check("missing required claim rejected", () => {
    const { nonce: _nonce, ...missing } = claims;
    rejects(() => verify(signed(missing)), "INVALID_CLAIMS");
  });
  check("short signed nonce rejected", () => rejects(() => verify(signed({ ...claims, nonce: "A" })), "INVALID_CLAIMS"));
  check("invalid signed timestamps rejected", () => rejects(() => verify(signed({ ...claims, issuedAt: "invalid" })), "INVALID_CLAIMS"));
  check("nonpositive signed lifetime rejected", () => rejects(() => verify(signed({ ...claims, expiresAt: claims.issuedAt })), "INVALID_CLAIMS"));
  check("signed duplicate JSON claim rejected", () => rejects(() =>
    verify(signed(JSON.stringify(claims).replace('"version":1', '"version":1,"version":1'))), "INVALID_CLAIMS"));
  check("signed noncanonical JSON rejected", () => rejects(() => verify(signed(JSON.stringify(claims, null, 2))), "INVALID_CLAIMS"));
  check("issued time inclusive", () => assert.deepEqual(verify(issued.token), claims));
  check("before issuedAt rejected", () => {
    current = instant - 1;
    try { rejects(() => verify(issued.token), "NOT_YET_VALID"); } finally { current = instant; }
  });
  check("last millisecond before expiry accepted", () => {
    current = instant + ttlMs - 1;
    try { assert.deepEqual(verify(issued.token), claims); } finally { current = instant; }
  });
  check("expiry instant and later rejected for new binding", () => {
    try { for (const time of [instant + ttlMs, instant + ttlMs + 1]) { current = time; rejects(() => verify(issued.token), "EXPIRED"); } }
    finally { current = instant; }
  });
  check("issue/verify do not mutate caller input, Date or secret", () => {
    const request = Object.freeze({ idempotencyKey: key.toUpperCase(), ttlMs }), beforeSecret = Buffer.from(secret);
    const time = new Date(instant), immutable = createCheckoutAttemptAccess({ secret, now: () => time });
    const value = immutable.issue(request), verification = Object.freeze({ token: value.token, idempotencyKey: key });
    const beforeRequest = structuredClone(request), beforeVerify = structuredClone(verification);
    immutable.verify(verification);
    assert.deepEqual(request, beforeRequest); assert.deepEqual(verification, beforeVerify);
    assert.deepEqual(secret, beforeSecret); assert.equal(time.getTime(), instant);
  });
  check("injected key is copied and service is independent of caller mutation", () => {
    const mutable = randomBytes(32), frozenKey = Buffer.from(mutable);
    const access = createCheckoutAttemptAccess({ secret: mutable, now: () => new Date(instant) });
    const token = access.issue({ idempotencyKey: key, ttlMs });
    mutable.fill(0);
    const verifier = createCheckoutAttemptAccess({ secret: frozenKey, now: () => new Date(instant) });
    assert.deepEqual(access.verify({ token: token.token, idempotencyKey: key }), verifier.verify({ token: token.token, idempotencyKey: key }));
  });
  for (const ttl of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    check("invalid supplied TTL rejected " + ttl, () => rejects(() => service.issue({ idempotencyKey: key, ttlMs: ttl }), "INVALID_TTL"));
  }
  check("weak injected secret rejected without environment fallback", () =>
    rejects(() => createCheckoutAttemptAccess({ secret: new Uint8Array(31) }), "INVALID_SECRET"));
  check("invalid injected clock rejected", () =>
    rejects(() => createCheckoutAttemptAccess({ secret, now: () => new Date(NaN) }).issue({ idempotencyKey: key, ttlMs }), "INVALID_TIME"));
  check("invalid nonce dependency rejected", () =>
    rejects(() => createCheckoutAttemptAccess({ secret, nonceBytes: () => new Uint8Array(31) }).issue({ idempotencyKey: key, ttlMs }), "INVALID_NONCE"));
  check("injected nonce source is requested for 256 bits", () => {
    let size = 0;
    const access = createCheckoutAttemptAccess({ secret, now: () => new Date(instant), nonceBytes: n => { size = n; return randomBytes(n); } });
    access.issue({ idempotencyKey: key, ttlMs }); assert.equal(size, 32);
  });
  check("response-loss: retained capability replays and authorizes original hash", () => {
    const browser = { capability: issued.token, idempotencyKey: key };
    const stored = JSON.parse(JSON.stringify(fakeOrder));
    // Hypothetical first order response is discarded. Browser held capability before POST.
    assert.equal(browser.capability, issued.token);
    assert.deepEqual(verify(browser.capability, browser.idempotencyKey), claims);
    assert.equal(authorizeOrderConversationAccess(stored, { guestToken: browser.capability }), "guest");
    assert.equal(verifyGuestOrderAccessToken(stored, replacement.token), false);
    assert.equal(authorizeOrderConversationAccess(stored, { guestToken: replacement.token }), null);
    assert.ok(!JSON.stringify(stored).includes(browser.capability));
    assert.deepEqual(Object.keys(stored.guestOrderAccess).sort(), ["createdAt", "tokenHash"]);
  });
  check("issuance expiry does not expire established hash-based guest detail access", () => {
    current = instant + ttlMs + 1;
    try { rejects(() => verify(issued.token), "EXPIRED"); assert.equal(verifyGuestOrderAccessToken(fakeOrder, issued.token), true); }
    finally { current = instant; }
  });
  check("guest capability cannot authenticate member session or own a member order", () => {
    assert.equal(verifySessionToken(issued.token), null);
    const memberOrder = { ...fakeOrder, member: { memberId: "owner-member" } };
    assert.equal(authorizeOrderConversationAccess(memberOrder, { guestToken: issued.token }), null);
    assert.equal(authorizeOrderConversationAccess(memberOrder, { memberId: "other-member", guestToken: issued.token }), null);
    assert.equal(authorizeOrderConversationAccess(memberOrder, { memberId: "owner-member" }), "member");
    assert.ok(!("member" in claims) && !("memberId" in claims));
  });
  check("historical random guest token remains exactly compatible", () => {
    const old = createGuestOrderAccess(), historical = { ...fakeOrder, guestOrderAccess: { tokenHash: old.tokenHash, createdAt: "2020-01-01T00:00:00.000Z" } };
    assert.equal(Buffer.from(old.token, "base64url").length, 32);
    assert.equal(verifyGuestOrderAccessToken(historical, old.token), true);
    assert.equal(authorizeOrderConversationAccess(historical, { guestToken: old.token }), "guest");
    assert.equal(verifyGuestOrderAccessToken(historical, issued.token), false);
    assert.equal(verifyGuestOrderAccessToken(historical, ""), false);
    assert.equal(authorizeOrderConversationAccess({ ...historical, member: { memberId: "member" } }, { guestToken: old.token }), null);
  });
  check("zero network calls; fake order unchanged", () => {
    assert.equal(networkCalls, 0);
    assert.deepEqual(fakeOrder.guestOrderAccess, { tokenHash: issued.tokenHash, createdAt: issued.issuedAt });
  });
  console.log("J.6F.5C1 PASS " + checks + "/" + checks + "; capability primitives and in-memory fake orders only; network=0");
} finally { globalThis.fetch = originalFetch; }
