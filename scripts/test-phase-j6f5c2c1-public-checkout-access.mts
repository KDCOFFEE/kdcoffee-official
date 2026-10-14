import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import {
  createPublicCheckoutAttemptAccess, issuePublicGuestCheckoutAttemptAccess,
  resolveGuestCheckoutIdentityFromAttemptAccess, PublicCheckoutAttemptAccessUnavailableError,
} from "../lib/publicCheckoutAttemptAccess";
import { createCheckoutAttemptAccess, CheckoutAttemptAccessError } from "../lib/checkoutAttemptAccess";
import { guestTokenHash, verifyGuestOrderAccessToken } from "../lib/orderConversation";
import { cartCheckoutEligibility, type StoreCartItem } from "../lib/commerceCart";
import type { StoredOrder } from "../lib/adminOrders";
import * as endpoint from "../app/api/commerce/checkout-attempt/route";

const envNames = ["STORE_COMMERCE_ENABLED", "GUEST_CHECKOUT_ACCESS_SECRET", "AUTH_SESSION_SECRET"];
const savedEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
const oldFetch = globalThis.fetch;
const key = "abcdef01-2345-4678-89ab-cdef01234567", otherKey = "abcdef02-2345-4678-89ab-cdef01234567";
const secret = "isolated-public-guest-checkout-secret-at-least-32-bytes";
let current = Date.parse("2026-10-14T12:00:00.000Z"), checks = 0, networkCalls = 0, fsCalls = 0;
const service = createPublicCheckoutAttemptAccess({ now: () => new Date(current) });
const cryptoAuthority = createCheckoutAttemptAccess({ secret: Buffer.from(secret), now: () => new Date(current) });
const protectedFiles = [
  "app/api/orders/route.ts", "app/checkout/page.tsx", "lib/commerceCart.ts",
  "components/commerce/CommerceCheckoutBoundary.tsx", "lib/checkoutAttemptAccess.ts",
  "lib/publicCheckoutContract.ts", "lib/commerceCheckoutAdmission.ts",
  "lib/commerceOrderTransaction.ts", "lib/orderIdempotency.ts",
];
const before = await Promise.all(protectedFiles.map(file => fs.readFile(file)));
const bridgeSource = await fs.readFile("lib/publicCheckoutAttemptAccess.ts", "utf8");
const routeSource = await fs.readFile("app/api/commerce/checkout-attempt/route.ts", "utf8");
const require = createRequire(import.meta.url);
const fsModule = require("node:fs") as typeof import("node:fs");
const restore: (() => void)[] = [];
async function check(label: string, operation: () => unknown | Promise<unknown>) {
  try { await operation(); console.log("PASS " + (++checks) + " " + label); }
  catch (error) { console.error("FAIL case " + (checks + 1) + " " + label); throw error; }
}
function unavailable(operation: () => unknown, code: "DISABLED" | "UNAVAILABLE") {
  assert.throws(operation, (error: unknown) => error instanceof PublicCheckoutAttemptAccessUnavailableError && error.code === code);
}
function invalid(operation: () => unknown, code: string) {
  assert.throws(operation, (error: unknown) => error instanceof CheckoutAttemptAccessError && error.code === code);
}
function configured() { process.env.STORE_COMMERCE_ENABLED = "true"; process.env.GUEST_CHECKOUT_ACCESS_SECRET = secret; }
async function post(value: unknown, extra?: { raw?: string; query?: string; headers?: Record<string, string> }) {
  return endpoint.POST(new Request("http://localhost/api/commerce/checkout-attempt" + (extra?.query ?? ""), {
    method: "POST", headers: { "Content-Type": "application/json", ...extra?.headers },
    body: extra?.raw ?? JSON.stringify(value),
  }));
}
function noStore(response: Response) {
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Set-Cookie"), null);
  assert.equal(response.headers.get("Location"), null);
}
function guard(target: object, methods: string[]) {
  for (const method of methods) {
    const descriptor = Object.getOwnPropertyDescriptor(target, method);
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function") continue;
    assert.ok(descriptor.configurable || descriptor.writable);
    Object.defineProperty(target, method, { ...descriptor, value: () => {
      fsCalls++; throw new Error("Filesystem access forbidden during public access operations");
    } });
    restore.push(() => Object.defineProperty(target, method, descriptor));
  }
}
try {
  guard(fsModule, ["writeFile", "writeFileSync", "appendFile", "appendFileSync", "mkdir", "mkdirSync", "open", "openSync",
    "rename", "renameSync", "rm", "rmSync", "unlink", "unlinkSync", "readFile", "readFileSync", "readdir", "readdirSync", "createWriteStream"]);
  guard(fs, ["writeFile", "appendFile", "mkdir", "open", "rename", "rm", "unlink", "readFile", "readdir", "stat", "lstat"]);
  globalThis.fetch = async () => { networkCalls++; throw new Error("External network forbidden"); };
  for (const value of [undefined, "false", "TRUE", " true", "true "]) {
    await check("gate fails closed for " + String(value), () => {
      if (value === undefined) delete process.env.STORE_COMMERCE_ENABLED; else process.env.STORE_COMMERCE_ENABLED = value;
      process.env.GUEST_CHECKOUT_ACCESS_SECRET = secret;
      unavailable(() => service.issue({ idempotencyKey: key }), "DISABLED");
      unavailable(() => service.resolveIdentity({ token: "ignored", idempotencyKey: key }), "DISABLED");
    });
  }
  process.env.STORE_COMMERCE_ENABLED = "true";
  for (const [label, value] of [["missing", undefined], ["empty", ""], ["whitespace", " ".repeat(40)], ["31 bytes", "x".repeat(31)], ["30 UTF-8 bytes", "界".repeat(10)]] as const) {
    await check("secret unavailable " + label, () => {
      if (value === undefined) delete process.env.GUEST_CHECKOUT_ACCESS_SECRET; else process.env.GUEST_CHECKOUT_ACCESS_SECRET = value;
      process.env.AUTH_SESSION_SECRET = secret;
      unavailable(() => service.issue({ idempotencyKey: key }), "UNAVAILABLE");
      unavailable(() => service.resolveIdentity({ token: "ignored", idempotencyKey: key }), "UNAVAILABLE");
    });
  }
  await check("UTF-8 byte strength accepts 33 bytes from 11 characters", () => {
    process.env.GUEST_CHECKOUT_ACCESS_SECRET = "界".repeat(11);
    assert.ok(service.issue({ idempotencyKey: key }).token.startsWith("gco1."));
  });
  await check("exact 32 UTF-8 bytes accepted", () => {
    process.env.GUEST_CHECKOUT_ACCESS_SECRET = "x".repeat(32);
    assert.ok(service.issue({ idempotencyKey: key }).token);
  });
  configured();
  const issued = service.issue({ idempotencyKey: key.toUpperCase() });
  const claims = cryptoAuthority.verify({ token: issued.token, idempotencyKey: key });
  await check("issue returns only internal material and canonical lowercase UUID", () => {
    assert.deepEqual(Object.keys(issued).sort(), ["token", "tokenHash", "idempotencyKey", "issuedAt", "expiresAt"].sort());
    assert.equal(issued.idempotencyKey, key); assert.ok(issued.token.startsWith("gco1."));
  });
  await check("TTL exactly 900000 ms with signed issuance time", () => {
    assert.equal(Date.parse(issued.issuedAt), current);
    assert.equal(Date.parse(issued.expiresAt) - Date.parse(issued.issuedAt), 900000);
    assert.equal(claims.issuedAt, issued.issuedAt); assert.equal(claims.expiresAt, issued.expiresAt);
  });
  await check("verify returns exactly existing trusted hashed guest shape", () => {
    const identity = service.resolveIdentity({ token: issued.token, idempotencyKey: key });
    assert.deepEqual(identity, { guestOrderAccess: { tokenHash: guestTokenHash(issued.token), createdAt: claims.issuedAt } });
    assert.ok(!JSON.stringify(identity).includes(issued.token));
  });
  await check("case variant verifies against same attempt", () => {
    assert.deepEqual(service.resolveIdentity({ token: issued.token, idempotencyKey: key.toUpperCase() }),
      service.resolveIdentity({ token: issued.token, idempotencyKey: key }));
  });
  await check("existing guest order hash authority accepts capability hash", () => {
    const identity = service.resolveIdentity({ token: issued.token, idempotencyKey: key });
    const guestOrder: StoredOrder = {
      orderNumber: "KD20261014-9001", createdAt: claims.issuedAt,
      status: "waiting_merchant_create_cod_shipment", orderMode: "711_cod",
      guestOrderAccess: identity.guestOrderAccess,
    };
    assert.equal(verifyGuestOrderAccessToken(guestOrder, issued.token), true);
  });
  await check("different attempt rejected", () => invalid(() => service.resolveIdentity({ token: issued.token, idempotencyKey: otherKey }), "ATTEMPT_MISMATCH"));
  const parts = issued.token.split(".");
  await check("payload tampering rejected", () => invalid(() => service.resolveIdentity({
    token: parts[0] + "." + Buffer.from("{}").toString("base64url") + "." + parts[2], idempotencyKey: key,
  }), "INVALID_SIGNATURE"));
  await check("signature tampering rejected", () => invalid(() => service.resolveIdentity({
    token: parts[0] + "." + parts[1] + "." + (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1), idempotencyKey: key,
  }), "INVALID_SIGNATURE"));
  await check("invalid raw token rejected", () => invalid(() => service.resolveIdentity({ token: null, idempotencyKey: key }), "INVALID_TOKEN"));
  await check("not-yet-valid rejected", () => {
    current = Date.parse(issued.issuedAt) - 1;
    invalid(() => service.resolveIdentity({ token: issued.token, idempotencyKey: key }), "NOT_YET_VALID");
  });
  await check("valid through final millisecond before expiry without rotating identity", () => {
    current = Date.parse(issued.expiresAt) - 1;
    assert.equal(service.resolveIdentity({ token: issued.token, idempotencyKey: key }).guestOrderAccess.createdAt, issued.issuedAt);
  });
  await check("exact expiry and later reject", () => {
    current = Date.parse(issued.expiresAt);
    invalid(() => service.resolveIdentity({ token: issued.token, idempotencyKey: key }), "EXPIRED");
    current++;
    invalid(() => service.resolveIdentity({ token: issued.token, idempotencyKey: key }), "EXPIRED");
  });
  current = Date.parse(issued.issuedAt);
  await check("verify never renews or reissues and no raw material leaves identity", () => {
    assert.deepEqual(service.resolveIdentity({ token: issued.token, idempotencyKey: key }), service.resolveIdentity({ token: issued.token, idempotencyKey: key }));
    assert.deepEqual(Object.keys(service.resolveIdentity({ token: issued.token, idempotencyKey: key })), ["guestOrderAccess"]);
  });
  await check("public helpers use same authority", () => {
    const actual = issuePublicGuestCheckoutAttemptAccess({ idempotencyKey: key.toUpperCase() });
    assert.deepEqual(resolveGuestCheckoutIdentityFromAttemptAccess({ token: actual.token, idempotencyKey: key }),
      { guestOrderAccess: { tokenHash: actual.tokenHash, createdAt: actual.issuedAt } });
  });
  await check("gate checked again after service creation", () => {
    process.env.STORE_COMMERCE_ENABLED = "false";
    unavailable(() => service.resolveIdentity({ token: issued.token, idempotencyKey: key }), "DISABLED");
  });
  configured();
  await check("secret checked again and changed secret rejects old signature", () => {
    delete process.env.GUEST_CHECKOUT_ACCESS_SECRET;
    unavailable(() => service.resolveIdentity({ token: issued.token, idempotencyKey: key }), "UNAVAILABLE");
    process.env.GUEST_CHECKOUT_ACCESS_SECRET = secret + "-changed";
    invalid(() => service.resolveIdentity({ token: issued.token, idempotencyKey: key }), "INVALID_SIGNATURE");
  });
  configured();
  await check("endpoint gate off 403 and generic no-store", async () => {
    process.env.STORE_COMMERCE_ENABLED = "false";
    const response = await post({ idempotencyKey: key }); noStore(response); assert.equal(response.status, 403);
    assert.ok(!JSON.stringify(await response.json()).includes("STORE_COMMERCE_ENABLED"));
  });
  configured();
  for (const [label, value] of [["missing", undefined], ["short", "short"], ["blank", " ".repeat(40)]] as const) {
    await check("endpoint secret " + label + " => 503 no-store no fallback", async () => {
      if (value === undefined) delete process.env.GUEST_CHECKOUT_ACCESS_SECRET; else process.env.GUEST_CHECKOUT_ACCESS_SECRET = value;
      const response = await post({ idempotencyKey: key }); noStore(response); assert.equal(response.status, 503);
      const body = JSON.stringify(await response.json()); assert.ok(!body.includes("GUEST_CHECKOUT_ACCESS_SECRET") && !body.includes(secret));
    });
  }
  configured();
  for (const field of ["token", "tokenHash", "owner", "memberId", "ttl", "ttlMs", "expiresAt", "nonce", "purpose", "secret", "items", "cart", "order"]) {
    await check("endpoint rejects browser authority field " + field, async () => {
      const response = await post({ idempotencyKey: key, [field]: "injected" }); noStore(response); assert.equal(response.status, 400);
    });
  }
  for (const value of [null, [], "text", 1, true, {}, { idempotencyKey: null }, { idempotencyKey: key + " " }, { idempotencyKey: "not-a-uuid" }]) {
    await check("endpoint rejects invalid request " + JSON.stringify(value), async () => {
      const response = await post(value); noStore(response); assert.equal(response.status, 400);
    });
  }
  await check("invalid JSON => 400 no-store", async () => {
    const response = await post(null, { raw: "{broken" }); noStore(response); assert.equal(response.status, 400);
  });
  await check("endpoint 200 exposes only browser capability material, no cookies/redirects", async () => {
    const response = await post({ idempotencyKey: key.toUpperCase() }); noStore(response); assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ["attemptAccessToken", "expiresAt", "canonicalAttemptKey"].sort());
    assert.equal(body.canonicalAttemptKey, key); assert.ok(body.attemptAccessToken.startsWith("gco1."));
    assert.ok(!JSON.stringify(body).includes(secret));
    const verified = createCheckoutAttemptAccess({ secret: Buffer.from(secret) }).verify({ token: body.attemptAccessToken, idempotencyKey: key });
    assert.equal(Date.parse(body.expiresAt) - Date.parse(verified.issuedAt), 900000);
  });
  await check("query/header/cookie TTL cannot override server policy", async () => {
    const response = await post({ idempotencyKey: key }, { query: "?ttl=1", headers: { "x-ttl": "1", Cookie: "ttl=1" } });
    assert.equal(response.status, 200); noStore(response);
    const body = await response.json();
    const verified = createCheckoutAttemptAccess({ secret: Buffer.from(secret) }).verify({ token: body.attemptAccessToken, idempotencyKey: key });
    assert.equal(Date.parse(verified.expiresAt) - Date.parse(verified.issuedAt), 900000);
  });
  await check("POST-only export and dedicated secret/server-only authority boundaries", () => {
    assert.equal(endpoint.runtime, "nodejs"); assert.equal(typeof endpoint.POST, "function");
    assert.deepEqual(Object.keys(endpoint).sort(), ["POST", "runtime"]);
    assert.ok(bridgeSource.startsWith('import "server-only"'));
    assert.ok(!/createHmac|randomBytes|AUTH_SESSION_SECRET|writeFile|fetch\(/.test(bridgeSource));
    assert.ok(!/createHmac|timingSafeEqual|randomBytes|base64url|AUTH_SESSION_SECRET|writeFile|fetch\(/.test(routeSource));
    assert.ok(!/commerceOrderTransaction|memberAuth|membershipCommerce|createGuestOrderAccess/.test(bridgeSource + routeSource));
  });
  await check("Store-containing Cart remains blocked", () => {
    const item: StoreCartItem = { domain: "store", productId: "store-id", variantId: "default", slug: "store-item", name: "Store", unitPrice: 1, quantity: 1 };
    assert.equal(cartCheckoutEligibility([item], "READY", []), "STORE_CHECKOUT_NOT_ENABLED");
  });
  await check("all operations made zero filesystem/order/journal/inventory and network calls", () => {
    assert.equal(fsCalls, 0); assert.equal(networkCalls, 0);
  });
} finally {
  for (const reset of restore.reverse()) reset();
  globalThis.fetch = oldFetch;
  for (const [name, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
}
const successorOwnedCommittedBoundaryFiles = new Set(["lib/commerceOrderTransaction.ts"]);
await check("protected source bytes unchanged and non-successor committed boundaries unchanged", async () => {
  for (const [index, file] of protectedFiles.entries()) {
    assert.deepEqual(await fs.readFile(file), before[index], file);
    if (successorOwnedCommittedBoundaryFiles.has(file)) continue;
    const committed = execFileSync("git", ["show", "HEAD:" + file], { encoding: "utf8", windowsHide: true });
    assert.equal((await fs.readFile(file, "utf8")).replaceAll("\r\n", "\n"), committed.replaceAll("\r\n", "\n"), file);
  }
});
await check("previous environment values restored exactly", () => {
  for (const [name, value] of Object.entries(savedEnv)) assert.equal(process.env[name], value);
});
console.log("J.6F.5C2C1 PASS " + checks + "/" + checks + "; filesystem=0 orders=0 journals=0 inventory=0 network=" + networkCalls);
