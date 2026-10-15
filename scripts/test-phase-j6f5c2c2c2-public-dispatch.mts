import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createPublicCommerceCheckoutDispatcher, dispatchPublicCommerceCheckout,
  hasExplicitCommerceDomainMarker, PUBLIC_CHECKOUT_ATTEMPT_ACCESS_HEADER,
  type PublicCommerceCheckoutResponse } from "../lib/publicCommerceCheckoutDispatch";
import { createCommerceOrderTransactionService, commerceOrderTransactionId, CommerceOrderTransactionError } from "../lib/commerceOrderTransaction";
import { admitCommerceCheckout, type TrustedCheckoutIdentity } from "../lib/commerceCheckoutAdmission";
import { createPublicCheckoutAttemptAccess } from "../lib/publicCheckoutAttemptAccess";
import { createCheckoutAttemptAccess } from "../lib/checkoutAttemptAccess";
import { classifyPublicCheckoutRequest } from "../lib/publicCheckoutContract";
import { resolveCheckoutAttemptRecoveryAuthority } from "../lib/checkoutAttemptResolver";
import { createCommerceTransactionJournal } from "../lib/commerceTransactionJournal";
import { createStoreRepository } from "../lib/storeRepository";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } from "../lib/membershipBusinessRules";
import { guestTokenHash, verifyGuestOrderAccessToken } from "../lib/orderConversation";
import type { StoredOrder } from "../lib/adminOrders";
import { withCommerceLockPlan } from "../lib/commerceLocks";
import { orderIdempotencyResource } from "../lib/orderIdempotency";
import { inventoryHash } from "../lib/inventoryReceipts";
import { POST } from "../app/api/orders/route";

type Raw = Record<string, any>;
type Options = NonNullable<Parameters<typeof createCommerceOrderTransactionService>[0]>;
type Dependencies = NonNullable<Parameters<typeof createPublicCommerceCheckoutDispatcher>[0]>;
const timestamp = "2026-10-12T06:37:00.000Z";
let current = Date.parse(timestamp);
const now = () => new Date(current);
const suite = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f5c2c2c2-"));
const tempParent = await fs.realpath(os.tmpdir());
assert.equal(path.dirname(await fs.realpath(suite)).toLowerCase(), tempParent.toLowerCase());
const savedEnv = Object.fromEntries(["KD_DATA_DIR", "RAILWAY_VOLUME_MOUNT_PATH", "STORE_COMMERCE_ENABLED",
  "AUTH_SESSION_SECRET", "MEMBER_IDENTITY_SECRET", "GUEST_CHECKOUT_ACCESS_SECRET"].map(key => [key, process.env[key]]));
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.AUTH_SESSION_SECRET = "isolated-c2c2c2-auth-secret-more-than-32-bytes";
process.env.MEMBER_IDENTITY_SECRET = process.env.AUTH_SESSION_SECRET;
const originalFetch = globalThis.fetch;
let checks = 0, fixtures = 0, networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("Network forbidden"); };
const a = { id: "member-a", lineUserId: "LINE-A", displayName: "Fixture A" };
const b = { id: "member-b", lineUserId: "LINE-B", displayName: "Fixture B" };
const member: TrustedCheckoutIdentity = { member: a };
async function run(label: string, operation: () => unknown | Promise<unknown>) {
  try { await operation(); console.log("PASS " + (++checks) + " " + label); }
  catch (error) { console.error("FAIL case " + (checks + 1) + " " + label); throw error; }
}
async function fixture() {
  current = Date.parse(timestamp);
  process.env.STORE_COMMERCE_ENABLED = "true";
  process.env.GUEST_CHECKOUT_ACCESS_SECRET = "isolated-c2c2c2-guest-secret-more-than-32-bytes";
  const root = path.join(suite, "fixture-" + (++fixtures)); process.env.KD_DATA_DIR = root;
  const orderDir = path.join(root, "orders"); await fs.mkdir(orderDir, { recursive: true });
  await fs.mkdir(path.join(root, "store"), { recursive: true });
  const website = path.join(root, "store", "website-data.json");
  await fs.writeFile(website, JSON.stringify({ version: 1, menu: { products: [{
    id: "coffee-product", slug: "coffee-live", name: "Coffee", active: true, purchasable: true, purchase: [],
    skus: [{ id: "coffee-sku", label: "半磅咖啡豆", detail: "227g", kind: "beans", enabled: true, price: 500, stock: 20, pvEnabled: true, pvValue: 30 }],
  }] } }));
  const repository = createStoreRepository({ dataRoot: root, now });
  await repository.createSection({ id: "section", slug: "equipment", name: "Equipment", published: true });
  const product = await repository.createProduct({ id: "store-product", sectionId: "section", slug: "store-live",
    name: "Store", sku: "DISPLAY", price: 1100, inventory: 20, pvValue: 999, active: true, published: true });
  const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES);
  rules.payment.atmTransfer = { bankName: "Fixture Bank", bankCode: "999", branchName: "Fixture Branch", accountName: "Fixture Studio",
    accountNumber: "1234567890", instructions: "Fixture instructions", bankbookImageUrl: null, showBankbookImageAtCheckout: false };
  await saveMembershipBusinessRules({ expectedRevision: 0, rules, effectiveAt: timestamp, now: now() },
    path.join(root, "membership-commerce", "business-rules.json"));
  return { root, orderDir, repository, product, website, rules };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function body(mode = "studio_pickup", mixed = false): Raw {
  const store = { domain: "store", productId: "store-product", variantId: "default", quantity: 2, quotedUnitPrice: 1100 };
  const coffee = { domain: "coffee", productId: "coffee-product", variantId: "coffee-sku", quantity: 2,
    coffeeOptions: { preparation: "咖啡豆", customRoast: false }, quotedUnitPrice: 500 };
  const raw: Raw = { idempotencyKey: randomUUID(), items: mixed ? [store, coffee] : [store], orderMode: mode,
    customer: { name: "Fixture", phone: "0912345678", email: "", note: "" } };
  if (mode === "studio_pickup") raw.studioPickup = { preferredDate: "2026-10-20" };
  if (mode === "711_cod") raw.store = { id: "123456", name: "Fixture Store", address: "Fixture Address" };
  if (mode === "home_delivery") { raw.deliveryAddress = { recipientName: "Fixture", phone: "0912345678",
    postalCode: "100", city: "臺北市", district: "中正區", addressLine: "Fixture Road 1" }; raw.paymentMethod = "cash_on_delivery"; }
  return raw;
}
function dto(raw: Raw) {
  const { idempotencyKey, items, orderMode, customer, ...context } = raw;
  return { idempotencyKey, items: items.map(({ quotedUnitPrice: _q, ...item }: Raw) => item),
    orderContext: { orderMode, customer, ...context } };
}
function journal(f: Fixture, raw: Raw) { return createCommerceTransactionJournal(f.orderDir, commerceOrderTransactionId(raw.idempotencyKey)); }
function authority(f: Fixture, raw: Raw) { return resolveCheckoutAttemptRecoveryAuthority({ orderDir: f.orderDir, canonicalAttemptKey: raw.idempotencyKey }); }
async function stock(f: Fixture) { return (await f.repository.read()).products.find(p => p.id === "store-product")!.inventory; }
async function orders(f: Fixture) { return (await fs.readdir(f.orderDir)).filter(file => file.endsWith(".json")); }
async function zero(f: Fixture, raw: Raw) {
  assert.deepEqual(await journal(f, raw).read(), []); assert.deepEqual(await orders(f), []); assert.equal(await stock(f), 20);
}
async function snapshot(root: string): Promise<[string, string][]> {
  const rows: [string, string][] = [];
  async function visit(dir: string) { for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await visit(file); else { assert.ok(entry.isFile()); rows.push([path.relative(root, file), createHash("sha256").update(await fs.readFile(file)).digest("hex")]); }
  } }
  await visit(root); return rows.sort((a, b) => a[0].localeCompare(b[0]));
}
function dispatcher(session: typeof a | null = a, options: Options = {}, extra: Dependencies = {}) {
  const access = createPublicCheckoutAttemptAccess({ now });
  const trace = { sessions: 0, classify: 0, admit: 0, create: 0, recover: 0, locked: 0, codes: [] as string[] };
  const dispatch = createPublicCommerceCheckoutDispatcher({
    getCurrentMember: async () => { trace.sessions++; return session; },
    resolveFreshGuest: access.resolveIdentity,
    classify: (...args) => { trace.classify++; return classifyPublicCheckoutRequest(...args); },
    admit: (...args) => { trace.admit++; return admitCommerceCheckout(args[0], args[1], now()); },
    createTransactionService: injected => {
      const base = createCommerceOrderTransactionService({ now, ...options, ...injected,
        ...(injected?.publicFresh ? { publicFresh: { validateLocked: async input => {
          trace.locked++; await injected.publicFresh!.validateLocked(input);
        } } } : {}) });
      return {
        create: async (...args) => { trace.create++; try { return await base.create(...args); }
          catch (error) { if (error instanceof CommerceOrderTransactionError) trace.codes.push(error.code); throw error; } },
        recoverExisting: async (...args) => { trace.recover++; return base.recoverExisting(...args); },
      };
    }, ...extra,
  });
  return { dispatch, trace, access };
}
function safe(response: PublicCommerceCheckoutResponse, token?: string) {
  const encoded = JSON.stringify(response.body);
  for (const key of ["token", "tokenHash", "transactionId", "observations", "owner", "journal", "reason"]) assert.ok(!Object.hasOwn(response.body, key), key);
  if (token) assert.ok(!encoded.includes(token), "no capability echo");
  for (const code of ["PRICE_CHANGED", "FRESH_AUTHORITY_INVALID", "ATTEMPT_BECAME_DURABLE",
    "INVALID_IDENTITY", "SOURCE_UNAVAILABLE", "CROSS_PROTOCOL_DUAL_AUTHORITY"]) assert.ok(!encoded.includes(code));
}
async function dispatchStatus(raw: Raw, expected: number, session: typeof a | null = a, token?: string, extra: Dependencies = {}) {
  const response = await dispatcher(session, {}, extra).dispatch({ body: raw, guestAttemptAccessToken: token });
  assert.equal(response.status, expected); safe(response, token); return response;
}
async function prepared(f: Fixture, raw: Raw, identity = member) {
  const result = await createCommerceOrderTransactionService({ now, hook: async phase => {
    if (phase === "PREPARED") throw new Error("Fixture PREPARED interruption");
  } }).create(dto(raw), identity);
  assert.equal(result.state, "PENDING");
  const j = journal(f, raw), first = (await j.read())[0].event;
  if (first.type !== "PREPARED") throw new Error("Fixture PREPARED absent");
  return { result, j, intent: first.intent, firstFile: path.join(j.directory, "00000000.json") };
}
async function legacy(f: Fixture, raw: Raw, number = "KD20261012-9001") {
  await fs.writeFile(path.join(f.orderDir, number + ".json"), JSON.stringify({ orderNumber: number, createdAt: timestamp,
    orderMode: "studio_pickup", status: "waiting_studio_pickup_confirmation", idempotencyKey: raw.idempotencyKey.toUpperCase(),
    idempotencyRequestHash: "a".repeat(64), items: [] }));
}
function finalized(response: PublicCommerceCheckoutResponse) {
  assert.equal(response.status, 200); assert.deepEqual(Object.keys(response.body).sort(), ["orderNumber", "pending", "saved", "transactionState"]);
  assert.equal(response.body.saved, true); assert.equal(response.body.pending, false); assert.equal(response.body.transactionState, "FINALIZED"); safe(response);
}
async function pendingCheck(saved: boolean) {
  const f = await fixture(), raw = body();
  const d = dispatcher(a, saved ? { writeFinalOrder: async () => { throw new Error("Fixture final write interruption"); } }
    : { hook: async phase => { if (phase === "PREPARED") throw new Error("Fixture PREPARED interruption"); } });
  const response = await d.dispatch({ body: raw });
  assert.equal(response.status, 202); assert.deepEqual(Object.keys(response.body).sort(), ["orderNumber", "pending", "retryable", "saved", "transactionState"]);
  assert.equal(response.body.saved, saved); assert.equal(response.body.pending, true); assert.equal(response.body.retryable, true);
  assert.equal(response.body.transactionState, "PENDING"); safe(response);
  const found = await authority(f, raw); assert.ok(found.kind === "PROTOCOL_V1_MEMBER");
  if (found.kind !== "PROTOCOL_V1_MEMBER") throw new Error("Fixture authority absent");
  assert.equal(found.orderState === "ABSENT", !saved);
}
const sourceFiles = ["lib/commerceOrderTransaction.ts", "scripts/test-phase-j6f5c2c2c1-locked-fresh-admission.mts",
  "lib/publicCheckoutContract.ts", "lib/commerceCheckoutAdmission.ts", "lib/publicCheckoutAttemptAccess.ts",
  "lib/checkoutAttemptAccess.ts", "lib/checkoutAttemptResolver.ts", "lib/checkoutAttemptBinding.ts",
  "lib/commerceTransactionCoordinator.ts", "lib/commerceTransactionTypes.ts", "lib/commerceTransactionJournal.ts",
  "lib/commerceLocks.ts", "lib/commerceLockProtocol.ts", "lib/orderIdempotency.ts", "lib/orderConversation.ts",
  "lib/storeCommerceCapability.ts", "lib/memberAuth.ts", "app/api/commerce/checkout-attempt/route.ts",
  "app/checkout/page.tsx", "lib/commerceCart.ts", "components/commerce/CommerceCheckoutBoundary.tsx", "package.json", "package-lock.json", "tsconfig.json"];
const sourceHashes = new Map<string, string>();
for (const file of sourceFiles) sourceHashes.set(file, createHash("sha256").update(await fs.readFile(file)).digest("hex"));
try {
  const markerCases: [string, unknown, boolean][] = [
    ["null", null, false], ["array body", [], false], ["missing items", {}, false],
    ["non-array items", { items: {} }, false], ["legacy Coffee", { items: [{ slug: "coffee" }] }, false],
    ["corporate gift", { orderMode: "corporate_gift", items: [] }, false],
    ["Store", { items: [{ domain: "store" }] }, true], ["explicit Coffee", { items: [{ domain: "coffee" }] }, true],
    ["empty own domain", { items: [{ domain: "" }] }, true], ["unknown own domain", { items: [{ domain: "future" }] }, true],
    ["inherited domain", { items: [Object.create({ domain: "store" })] }, false],
    ["null and array items", { items: [null, [], "store"] }, false],
  ];
  for (const [label, input, expected] of markerCases)
    await run("marker: " + label, () => assert.equal(hasExplicitCommerceDomainMarker(input), expected));
  const route = await fs.readFile("app/api/orders/route.ts", "utf8");
  const headRoute = execFileSync("git", ["cat-file", "--filters", "HEAD:app/api/orders/route.ts"], { encoding: "utf8" });
  const legacyStart = "    const idempotencyKey = clean(body.idempotencyKey, 100);";
  const moduleSource = await fs.readFile("lib/publicCommerceCheckoutDispatch.ts", "utf8");
  await run("legacy continuation is byte-equivalent HEAD", () => {
    assert.equal(route.slice(route.indexOf(legacyStart)), headRoute.slice(headRoute.indexOf(legacyStart)));
  });
  await run("only dispatcher import and immediate post-json branch added", () => {
    const addedImport = 'import { dispatchPublicCommerceCheckout, hasExplicitCommerceDomainMarker, PUBLIC_CHECKOUT_ATTEMPT_ACCESS_HEADER } from "@/lib/publicCommerceCheckoutDispatch";';
    const withoutImport = route.replace(addedImport + (route.includes("\r\n") ? "\r\n" : "\n"), "");
    const start = withoutImport.indexOf("    if (hasExplicitCommerceDomainMarker(body)) {");
    const end = withoutImport.indexOf(legacyStart);
    assert.equal(withoutImport.slice(0, start) + withoutImport.slice(end), headRoute);
    assert.ok(withoutImport.indexOf("const body = await request.json();") < start);
  });
  await run("V1 branch returns before every legacy effect", () => {
    const boundary = route.indexOf(legacyStart);
    for (const effect of ["createGuestOrderAccess()", "applyCheckoutCredit(", "updateMemberProfile(", "createSubscription(",
      "registerReferralQualificationOrder(", "readRetailPromotionOrderSnapshot(", "finalizeRetailPromotionOrderSnapshot(",
      "sendInternalLineNotification(", "runInventoryOrderTransaction("]) {
      assert.ok(!route.slice(route.indexOf("const body = await request.json();"), boundary).includes(effect));
    }
    assert.ok(route.slice(0, boundary).includes("return NextResponse.json(result.body"));
  });
  await run("dispatcher is server-only with no legacy side effect imports", () => {
    assert.ok(moduleSource.startsWith('import "server-only";'));
    for (const effect of ["createGuestOrderAccess", "applyCheckoutCredit", "updateMemberProfile", "createSubscription",
      "registerReferralQualificationOrder", "RetailPromotionOrderSnapshot", "sendInternalLineNotification", "runInventoryOrderTransaction"])
      assert.ok(!moduleSource.includes(effect));
  });
  await run("header is the locked exact name", () => assert.equal(PUBLIC_CHECKOUT_ATTEMPT_ACCESS_HEADER, "X-KD-Checkout-Attempt-Access"));
  await run("uniform V1 route response has no-store and no Location", () => {
    const branch = route.slice(route.indexOf("    if (hasExplicitCommerceDomainMarker(body)) {"), route.indexOf(legacyStart));
    assert.ok(branch.includes('headers: { "Cache-Control": "no-store" }')); assert.ok(!branch.includes("Location"));
  });
  await run("transaction foundation never imports dispatcher", async () => {
    assert.ok(!(await fs.readFile("lib/commerceOrderTransaction.ts", "utf8")).includes("publicCommerceCheckoutDispatch"));
  });

  const malformed: [string, (r: Raw) => void][] = [
    ["unknown domain", r => r.items[0].domain = "unknown"], ["empty domain", r => r.items[0].domain = ""],
    ["explicit Coffee-only", r => { r.items = [body("studio_pickup", true).items[1]]; }],
    ["implicit Coffee + Store", r => r.items.push({ slug: "coffee", optionId: "sku", quantity: 1, quotedUnitPrice: 500 })],
    ["corporate gift + Store", r => r.orderMode = "corporate_gift"],
    ["bad Store variant", r => r.items[0].variantId = "other"], ["missing quote", r => delete r.items[0].quotedUnitPrice],
    ["negative quote", r => r.items[0].quotedUnitPrice = -1], ["fractional quote", r => r.items[0].quotedUnitPrice = 1.1],
    ["string quote", r => r.items[0].quotedUnitPrice = "1100"], ["unsafe quote", r => r.items[0].quotedUnitPrice = Number.MAX_SAFE_INTEGER + 1],
    ["zero quantity", r => r.items[0].quantity = 0], ["fractional quantity", r => r.items[0].quantity = 1.1],
    ["missing productId", r => delete r.items[0].productId], ["Store coffee options", r => r.items[0].coffeeOptions = {}],
    ["malformed Coffee options", r => { r.items.push(body("studio_pickup", true).items[1]); r.items[1].coffeeOptions = { preparation: "invalid" }; }],
    ["credit", r => r.requestedCredit = 1], ["subscription null presence", r => r.subscriptionIntent = null],
    ["browser memberId", r => r.memberId = "forged"], ["browser tokenHash", r => r.tokenHash = "forged"],
    ["financialSnapshot", r => r.financialSnapshot = {}], ["rulesVersion", r => r.rulesVersion = 1],
    ["admittedAt", r => r.admittedAt = timestamp], ["bad context mode", r => r.orderMode = "future"],
    ["invalid pickup calendar", r => r.studioPickup.preferredDate = "2026-02-30"],
    ["invalid customer phone", r => r.customer.phone = "123"], ["long customer name", r => r.customer.name = "x".repeat(21)],
    ["wrong mode field", r => r.store = { id: "123456", name: "Fixture", address: "Fixture" }],
    ["empty items", r => r.items = []], ["array item", r => r.items = [[]]],
  ];
  for (const [label, mutate] of malformed) await run("B1 rejects without fallback: " + label, async () => {
    const f = await fixture(), raw = body(); mutate(raw); const d = dispatcher();
    const response = await d.dispatch({ body: raw }); assert.equal(response.status, 400); safe(response);
    assert.equal(d.trace.admit, 0); assert.equal(d.trace.create, 0); await zero(f, raw);
  });
  await run("invalid K precedes session and detailed classification", async () => {
    await fixture(); const raw = body(); raw.idempotencyKey = "not-a-key"; const d = dispatcher();
    assert.equal((await d.dispatch({ body: raw })).status, 400);
    assert.equal(d.trace.sessions, 0); assert.equal(d.trace.classify, 0);
  });
  await run("unsupported home payment rejected structurally", async () => {
    const f = await fixture(), raw = body("home_delivery"); raw.paymentMethod = "card";
    await dispatchStatus(raw, 400); await zero(f, raw);
  });
  await run("invalid home address rejected structurally", async () => {
    const f = await fixture(), raw = body("home_delivery"); raw.deliveryAddress.postalCode = "bad";
    await dispatchStatus(raw, 400); await zero(f, raw);
  });

  for (const [mode, mixed, atm] of [["studio_pickup", false, false], ["711_cod", false, false],
    ["home_delivery", false, false], ["home_delivery", false, true], ["studio_pickup", true, false]] as const) {
    await run("fresh member without T1: " + mode + (atm ? " ATM" : "") + (mixed ? " mixed" : ""), async () => {
      const f = await fixture(), raw = body(mode, mixed); if (atm) raw.paymentMethod = "atm_transfer";
      const d = dispatcher(); const response = await d.dispatch({ body: raw }); finalized(response);
      assert.equal(d.trace.create, 1); assert.equal(d.trace.recover, 0); assert.equal(d.trace.locked, 1);
      const found = await authority(f, raw); assert.equal(found.kind, "PROTOCOL_V1_MEMBER");
      if (found.kind !== "PROTOCOL_V1_MEMBER") throw new Error("Missing member authority");
      const selected = classifyPublicCheckoutRequest(raw, { kind: "member", memberId: a.id });
      assert.ok(selected.family === "STORE_CONTAINING_PROTOCOL_V1");
      if (selected.family === "STORE_CONTAINING_PROTOCOL_V1") assert.equal(found.selectedFactsFingerprint, selected.fingerprint);
      assert.equal(await stock(f), 18);
    });
  }
  for (const variant of ["valid", "missing", "random", "wrong K", "signature", "expired", "future", "Store off", "secret missing", "secret short"]) {
    await run("fresh guest capability: " + variant, async () => {
      const f = await fixture(), raw = body(), d = dispatcher(null), issued = d.access.issue({ idempotencyKey: raw.idempotencyKey });
      let token: string | undefined = issued.token, expected = 401;
      if (variant === "valid") expected = 200;
      if (variant === "missing") token = undefined;
      if (variant === "random") token = "random-token";
      if (variant === "wrong K") token = d.access.issue({ idempotencyKey: randomUUID() }).token;
      if (variant === "signature") { const parts = issued.token.split("."); parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1); token = parts.join("."); }
      if (variant === "expired") current = Date.parse(issued.expiresAt);
      if (variant === "future") token = createCheckoutAttemptAccess({ secret: Buffer.from(process.env.GUEST_CHECKOUT_ACCESS_SECRET!),
        now: () => new Date(current + 60000) }).issue({ idempotencyKey: raw.idempotencyKey, ttlMs: 900000 }).token;
      if (variant === "Store off") { process.env.STORE_COMMERCE_ENABLED = "false"; expected = 403; }
      if (variant === "secret missing") { delete process.env.GUEST_CHECKOUT_ACCESS_SECRET; expected = 503; }
      if (variant === "secret short") { process.env.GUEST_CHECKOUT_ACCESS_SECRET = "short"; expected = 503; }
      const response = await d.dispatch({ body: raw, guestAttemptAccessToken: token });
      assert.equal(response.status, expected); safe(response, token);
      if (expected !== 200) { await zero(f, raw); assert.equal(d.trace.create, 0); }
      else finalized(response);
    });
  }
  await run("1100 provisional quote versus locked 1600 rejects PRICE_CHANGED before durability", async () => {
    const f = await fixture(), raw = body(); const d = dispatcher(a, { afterResolve: async resolution => {
      assert.equal(resolution.lines[0].unitPrice, 1100); await f.repository.updateProduct(f.product.id, f.product.revision, { price: 1600 });
    } });
    const response = await d.dispatch({ body: raw }); assert.equal(response.status, 409); safe(response);
    assert.deepEqual(d.trace.codes, ["PRICE_CHANGED"]); assert.equal(d.trace.locked, 1); await zero(f, raw);
  });
  await run("1600 captured quote matches authoritative locked 1600 and persists 3200", async () => {
    const f = await fixture(), raw = body(); await f.repository.updateProduct(f.product.id, f.product.revision, { price: 1600 });
    raw.items[0].quotedUnitPrice = 1600; const response = await dispatcher().dispatch({ body: raw }); finalized(response);
    const order = JSON.parse(await fs.readFile(path.join(f.orderDir, response.body.orderNumber + ".json"), "utf8"));
    assert.equal(order.subtotal, 3200); assert.equal(await stock(f), 18);
  });
  for (const mode of ["studio_pickup", "711_cod", "home_delivery"]) await run("locked gate closes: " + mode, async () => {
    const f = await fixture(), raw = body(mode); const d = dispatcher(a, { afterResolve: async () => { process.env.STORE_COMMERCE_ENABLED = "false"; } });
    const response = await d.dispatch({ body: raw }); assert.equal(response.status, 403);
    assert.deepEqual(d.trace.codes, ["STORE_COMMERCE_DISABLED"]); if (mode === "studio_pickup") assert.equal(d.trace.locked, 1);
    await zero(f, raw);
  });
  await run("guest T1 expires after admission before locked acceptance", async () => {
    const f = await fixture(), raw = body(); let expires = 0;
    const d = dispatcher(null, { afterResolve: async () => { current = expires; } });
    const issued = d.access.issue({ idempotencyKey: raw.idempotencyKey }); expires = Date.parse(issued.expiresAt);
    const response = await d.dispatch({ body: raw, guestAttemptAccessToken: issued.token });
    assert.equal(response.status, 401); safe(response, issued.token); assert.deepEqual(d.trace.codes, ["FRESH_AUTHORITY_INVALID"]); await zero(f, raw);
  });
  await run("guest signing config disappears under locks maps SOURCE_UNAVAILABLE to 503", async () => {
    const f = await fixture(), raw = body(), d = dispatcher(null, { afterResolve: async () => { delete process.env.GUEST_CHECKOUT_ACCESS_SECRET; } });
    const issued = d.access.issue({ idempotencyKey: raw.idempotencyKey });
    assert.equal((await d.dispatch({ body: raw, guestAttemptAccessToken: issued.token })).status, 503);
    assert.deepEqual(d.trace.codes, ["SOURCE_UNAVAILABLE"]); await zero(f, raw);
  });

  await run("duplicate Store lines preserve occurrence and aggregate inventory exactly", async () => {
    const f = await fixture(), raw = body(); raw.items.push({ ...raw.items[0], quantity: 1 });
    const response = await dispatcher().dispatch({ body: raw }); finalized(response); assert.equal(await stock(f), 17);
    const order = JSON.parse(await fs.readFile(path.join(f.orderDir, response.body.orderNumber + ".json"), "utf8"));
    assert.equal(order.items.length, 2); assert.deepEqual(order.items.map((i: Raw) => i.quantity).sort(), [1, 2]);
  });
  await run("identical duplicate selections do not merge quote occurrences", async () => {
    const f = await fixture(), raw = body(); raw.items.push({ ...raw.items[0] });
    const response = await dispatcher().dispatch({ body: raw }); finalized(response); assert.equal(await stock(f), 16);
    const order = JSON.parse(await fs.readFile(path.join(f.orderDir, response.body.orderNumber + ".json"), "utf8")); assert.equal(order.items.length, 2);
  });
  await run("mixed reversed selections and distinct Coffee options align with locked JSON sorting", async () => {
    const f = await fixture(), raw = body("studio_pickup", true);
    raw.items.push({ ...raw.items[1], quantity: 1, coffeeOptions: { preparation: "咖啡粉", customRoast: false } });
    raw.items.reverse(); const response = await dispatcher().dispatch({ body: raw }); finalized(response);
    const order = JSON.parse(await fs.readFile(path.join(f.orderDir, response.body.orderNumber + ".json"), "utf8"));
    assert.equal(order.items.length, 3); assert.equal(order.items.filter((i: Raw) => i.domain === "coffee").length, 2);
    assert.equal(await stock(f), 18);
  });

  for (const variant of ["original", "expired", "Store off", "secret missing", "secret changed", "logged member",
    "T2", "random", "missing", "selection conflict", "malformed"]) await run("durable guest owner-first: " + variant, async () => {
    const f = await fixture(), raw = body(), d = dispatcher(null), issued = d.access.issue({ idempotencyKey: raw.idempotencyKey });
    const identity = d.access.resolveIdentity({ token: issued.token, idempotencyKey: raw.idempotencyKey }); await prepared(f, raw, identity);
    let token: string | undefined = issued.token, expected = 200;
    if (variant === "expired") current = Date.parse(issued.expiresAt) + 1;
    if (variant === "Store off") process.env.STORE_COMMERCE_ENABLED = "false";
    if (variant === "secret missing") delete process.env.GUEST_CHECKOUT_ACCESS_SECRET;
    if (variant === "secret changed") process.env.GUEST_CHECKOUT_ACCESS_SECRET = "changed-synthetic-signing-secret-more-than-32-bytes";
    if (variant === "T2") { token = d.access.issue({ idempotencyKey: raw.idempotencyKey }).token; expected = 403; }
    if (variant === "random") { token = "unrelated-token"; expected = 403; }
    if (variant === "missing") { token = undefined; expected = 401; }
    if (variant === "selection conflict") { raw.items[0].quantity = 3; expected = 409; }
    if (variant === "malformed") { raw.items[0].quantity = 0; expected = 400; }
    const recovery = dispatcher(variant === "logged member" ? b : null);
    const before = await snapshot(f.root); const response = await recovery.dispatch({ body: raw, guestAttemptAccessToken: token });
    assert.equal(response.status, expected); safe(response, token); assert.equal(recovery.trace.admit, 0); assert.equal(recovery.trace.create, 0);
    if (expected === 200) { assert.equal(recovery.trace.recover, 1); finalized(response); }
    else { assert.equal(recovery.trace.recover, 0); assert.deepEqual(await snapshot(f.root), before); }
  });
  for (const variant of ["matching", "no session", "wrong member", "guest cannot authorize", "off expired secretless",
    "selection conflict", "malformed", "changed quote"]) await run("durable member owner-first: " + variant, async () => {
    const f = await fixture(), raw = body(); await prepared(f, raw);
    let session: typeof a | null = a, token: string | undefined, expected = 200;
    if (variant === "no session") { session = null; expected = 401; }
    if (variant === "wrong member") { session = b; expected = 403; }
    if (variant === "guest cannot authorize") { session = null; token = createPublicCheckoutAttemptAccess({ now }).issue({ idempotencyKey: raw.idempotencyKey }).token; expected = 401; }
    if (variant === "off expired secretless") { current += 3600000; process.env.STORE_COMMERCE_ENABLED = "false"; delete process.env.GUEST_CHECKOUT_ACCESS_SECRET; }
    if (variant === "selection conflict") { raw.items[0].quantity = 3; expected = 409; }
    if (variant === "malformed") { raw.items[0].quantity = 0; expected = 400; }
    if (variant === "changed quote") raw.items[0].quotedUnitPrice = 9999;
    const d = dispatcher(session); const response = await d.dispatch({ body: raw, guestAttemptAccessToken: token });
    assert.equal(response.status, expected); safe(response, token); assert.equal(d.trace.admit, 0); assert.equal(d.trace.create, 0);
    assert.equal(d.trace.recover, expected === 200 ? 1 : 0);
  });
  for (const owner of ["member", "guest"]) for (const conflicting of [false, true]) await run("unauthorized " + owner + " cannot observe " + (conflicting ? "changed" : "matching") + " selection", async () => {
    const f = await fixture(), raw = body(), d = dispatcher(null), issued = d.access.issue({ idempotencyKey: raw.idempotencyKey });
    await prepared(f, raw, owner === "member" ? member : d.access.resolveIdentity({ token: issued.token, idempotencyKey: raw.idempotencyKey }));
    if (conflicting) raw.items[0].quantity = 3;
    const other = dispatcher(b); const response = await other.dispatch({ body: raw, guestAttemptAccessToken: "wrong-possession" });
    assert.equal(response.status, 403); assert.equal(other.trace.classify, 0); safe(response);
  });

  for (const race of ["member", "guest expired", "wrong owner", "selection changed"]) await run("real NONE -> durable handoff: " + race, async () => {
    const f = await fixture(), raw = body("studio_pickup", true); let issued: ReturnType<ReturnType<typeof createPublicCheckoutAttemptAccess>["issue"]> | undefined;
    let identity: TrustedCheckoutIdentity = member;
    const d = dispatcher(race === "guest expired" ? null : a, { afterResolve: async () => {
      const winner = structuredClone(raw); if (race === "selection changed") winner.items[0].quantity = 3;
      const result = await createCommerceOrderTransactionService({ now }).create(dto(winner), race === "wrong owner" ? { member: b } : identity);
      assert.equal(result.state, "FINALIZED"); if (issued) current = Date.parse(issued.expiresAt) + 1;
    } });
    if (race === "guest expired") { issued = d.access.issue({ idempotencyKey: raw.idempotencyKey }); identity = d.access.resolveIdentity({ token: issued.token, idempotencyKey: raw.idempotencyKey }); }
    const response = await d.dispatch({ body: raw, guestAttemptAccessToken: issued?.token });
    assert.equal(response.status, race === "wrong owner" ? 403 : race === "selection changed" ? 409 : 200); safe(response, issued?.token);
    assert.deepEqual(d.trace.codes, ["ATTEMPT_BECAME_DURABLE"]); assert.equal(d.trace.create, 1); assert.equal(d.trace.locked, 0);
    assert.equal(d.trace.recover, ["member", "guest expired"].includes(race) ? 1 : 0);
    assert.equal(d.trace.classify, race === "wrong owner" ? 1 : 2);
    const entries = await journal(f, raw).read(); assert.equal(entries.filter(e => e.event.type === "PREPARED").length, 1);
    for (const domain of ["coffee", "store"]) assert.equal(entries.filter(e => e.event.type === "APPLIED" && e.event.domain === domain).length, 1);
    assert.equal((await orders(f)).length, 1);
    const found = await authority(f, raw);
    if (race === "wrong owner") { assert.equal(found.kind, "PROTOCOL_V1_MEMBER"); if (found.kind === "PROTOCOL_V1_MEMBER") assert.equal(found.owner.memberId, b.id); }
    if (issued) { assert.equal(found.kind, "PROTOCOL_V1_GUEST"); if (found.kind === "PROTOCOL_V1_GUEST") assert.equal(found.owner.tokenHash, guestTokenHash(issued.token)); }
  });
  for (const kind of ["NONE", "LEGACY_ORDER", "CONFLICT", "REVIEW_REQUIRED"] as const) await run("handoff " + kind + " fails closed without retry", async () => {
    const f = await fixture(), raw = body(); let creates = 0, resolves = 0;
    const d = dispatcher(a, {}, {
      resolveAuthority: async input => { resolves++; if (resolves === 1) return resolveCheckoutAttemptRecoveryAuthority(input);
        if (kind === "NONE") return { kind, canonicalAttemptKey: raw.idempotencyKey };
        if (kind === "LEGACY_ORDER") return { kind, canonicalAttemptKey: raw.idempotencyKey, orderNumber: "KD20261012-9001", persistedIdempotencyKey: raw.idempotencyKey };
        if (kind === "CONFLICT") return { kind, canonicalAttemptKey: raw.idempotencyKey, reason: "CROSS_PROTOCOL_DUAL_AUTHORITY",
          transactionId: "private", protocolOrderNumber: "private", legacyOrderNumber: "private" };
        return { kind, canonicalAttemptKey: raw.idempotencyKey, reason: "CORRUPT_JOURNAL" };
      },
      createTransactionService: () => ({ create: async () => { creates++; throw new CommerceOrderTransactionError("ATTEMPT_BECAME_DURABLE"); },
        recoverExisting: async () => { throw new Error("Forbidden recovery"); } }),
    });
    const response = await d.dispatch({ body: raw }); assert.equal(response.status, kind === "LEGACY_ORDER" ? 409 : 503);
    assert.equal(creates, 1); assert.equal(resolves, 2); safe(response); await zero(f, raw);
  });

  for (const kind of ["legacy", "dual", "duplicate", "corrupt", "binding"]) await run("collision/ambiguity remains generic: " + kind, async () => {
    const f = await fixture(), raw = body();
    if (kind === "legacy" || kind === "duplicate") await legacy(f, raw);
    if (kind === "duplicate") await legacy(f, raw, "KD20261012-9002");
    if (["dual", "corrupt", "binding"].includes(kind)) {
      const p = await prepared(f, raw);
      if (kind === "dual") await legacy(f, raw);
      if (kind === "corrupt") await fs.writeFile(p.firstFile, "{broken-json");
      if (kind === "binding") {
        const intent = structuredClone(p.intent); intent.order.checkoutAttemptBinding = null;
        const entry = { schemaVersion: 1, sequence: 0, previousHash: null, event: { type: "PREPARED", intent } };
        await fs.writeFile(p.firstFile, JSON.stringify({ ...entry, hash: inventoryHash(entry) }));
      }
    }
    const before = await snapshot(f.root); const d = dispatcher(), response = await d.dispatch({ body: raw });
    assert.equal(response.status, kind === "legacy" ? 409 : 503); safe(response); assert.equal(d.trace.sessions, 0); assert.equal(d.trace.classify, 0);
    assert.deepEqual(await snapshot(f.root), before);
  });

  await run("PENDING absent has exact 202 saved:false allowlist", () => pendingCheck(false));
  await run("PENDING correlated pending order has exact 202 saved:true allowlist", () => pendingCheck(true));
  await run("PENDING correlated committed order has saved:true before terminal journal event", async () => {
    const f = await fixture(), raw = body();
    const d = dispatcher(a, { hook: async phase => { if (phase === "FINALIZED") throw new Error("Fixture terminal interruption"); } });
    const response = await d.dispatch({ body: raw });
    assert.equal(response.status, 202); assert.equal(response.body.saved, true); assert.equal(response.body.pending, true);
    assert.deepEqual(Object.keys(response.body).sort(), ["orderNumber", "pending", "retryable", "saved", "transactionState"]);
    const found = await authority(f, raw); assert.ok(found.kind === "PROTOCOL_V1_MEMBER");
    if (found.kind === "PROTOCOL_V1_MEMBER") assert.equal(found.orderState, "inventory_committed");
    safe(response);
  });
  await run("durable guest recovery retains admitted price after catalog repricing", async () => {
    const f = await fixture(), raw = body(), access = createPublicCheckoutAttemptAccess({ now });
    const issued = access.issue({ idempotencyKey: raw.idempotencyKey });
    await prepared(f, raw, access.resolveIdentity({ token: issued.token, idempotencyKey: raw.idempotencyKey }));
    await f.repository.updateProduct(f.product.id, f.product.revision, { price: 1600 });
    const d = dispatcher(null), response = await d.dispatch({ body: raw, guestAttemptAccessToken: issued.token });
    finalized(response); assert.equal(d.trace.admit, 0); assert.equal(d.trace.create, 0);
    const order = JSON.parse(await fs.readFile(path.join(f.orderDir, response.body.orderNumber + ".json"), "utf8"));
    assert.equal(order.subtotal, 2200); assert.equal(order.items[0].unitPrice, 1100);
  });
  await run("durable ABORTED has terminal exact allowlist", async () => {
    const f = await fixture(), raw = body(), p = await prepared(f, raw);
    await withCommerceLockPlan([orderIdempotencyResource(f.orderDir, raw.idempotencyKey),
      { file: p.j.lockFile, rank: 0, key: p.intent.transactionId }], async () => {
      await p.j.append({ type: "ABORT", reason: "Private fixture reason" }); await p.j.append({ type: "ABORTED" });
    });
    const response = await dispatcher().dispatch({ body: raw }); assert.equal(response.status, 409);
    assert.deepEqual(Object.keys(response.body).sort(), ["error", "retryable", "transactionState"]);
    assert.equal(response.body.retryable, false); assert.equal(response.body.transactionState, "ABORTED"); safe(response);
  });
  await run("transaction REVIEW_REQUIRED exact allowlist never reveals observations", async () => {
    await fixture(); const raw = body();
    const d = dispatcher(a, {}, { createTransactionService: () => ({
      create: async () => ({ state: "REVIEW_REQUIRED", transactionId: "private", orderNumber: "private", observations: {} }),
      recoverExisting: async () => { throw new Error("Forbidden recovery"); },
    }) });
    const response = await d.dispatch({ body: raw }); assert.equal(response.status, 503);
    assert.deepEqual(Object.keys(response.body).sort(), ["error", "retryable", "transactionState"]);
    assert.equal(response.body.retryable, false); assert.equal(response.body.transactionState, "REVIEW_REQUIRED"); safe(response);
  });
  for (const mismatch of ["missing authority", "wrong transaction", "wrong order"]) await run("PENDING correlation refuses " + mismatch, async () => {
    const f = await fixture(), raw = body(), d = dispatcher(a, {}, { createTransactionService: () => ({
      create: async () => {
        if (mismatch === "missing authority") return { state: "PENDING", transactionId: "private", orderNumber: "KD20261012-9001", observations: {} };
        const p = await prepared(f, raw);
        return { ...p.result, transactionId: mismatch === "wrong transaction" ? "private" : p.result.transactionId,
          orderNumber: mismatch === "wrong order" ? "KD20261012-9002" : p.result.orderNumber };
      }, recoverExisting: async () => { throw new Error("Forbidden recovery"); },
    }) });
    const response = await d.dispatch({ body: raw }); assert.equal(response.status, 503); safe(response);
  });

  for (const [code, status] of [["INVALID_REQUEST", 400], ["INVALID_ITEM", 400], ["PAYMENT_NOT_SUPPORTED", 400],
    ["STORE_CREDIT_NOT_SUPPORTED", 400], ["STORE_SUBSCRIPTION_NOT_SUPPORTED", 400], ["INVALID_PICKUP_DATE", 400],
    ["INVALID_ADDRESS", 400], ["INVALID_IDENTITY", 403], ["STORE_COMMERCE_DISABLED", 403], ["PRICE_CHANGED", 409],
    ["OUT_OF_STOCK", 409], ["PRODUCT_UNAVAILABLE", 409], ["SOURCE_UNAVAILABLE", 503], ["ATM_NOT_CONFIGURED", 503]] as const) {
    await run("generic admission mapping: " + code, async () => {
      const f = await fixture(), raw = body();
      const response = await dispatchStatus(raw, status, a, undefined, { admit: async () => ({ kind: "REJECTED", reason: code }) });
      safe(response); await zero(f, raw);
    });
  }
  for (const code of ["STORAGE_UNAVAILABLE", "REVIEW_REQUIRED", "FRESH_AUTHORITY_INVALID", "IDEMPOTENCY_CONFLICT"] as const)
    await run("generic transaction mapping: " + code, async () => {
      const f = await fixture(), raw = body();
      await dispatchStatus(raw, code === "FRESH_AUTHORITY_INVALID" ? 401 : code === "IDEMPOTENCY_CONFLICT" ? 409 : 503,
        a, undefined, { createTransactionService: () => ({
          create: async () => { throw new CommerceOrderTransactionError(code); }, recoverExisting: async () => { throw new Error("Forbidden recovery"); },
        }) }); await zero(f, raw);
    });
  await run("B1/admission fingerprint mismatch fails before create", async () => {
    const f = await fixture(), raw = body(); const d = dispatcher(a, {}, { admit: async (input, identity) => {
      const result = await admitCommerceCheckout(input, identity, now());
      if (result.kind === "PROTOCOL_V1_ELIGIBLE") result.candidate.request.items[0].quantity = 3; return result;
    } });
    assert.equal((await d.dispatch({ body: raw })).status, 503); assert.equal(d.trace.create, 0); await zero(f, raw);
  });
  await run("admission occurrence quote mismatch fails before create", async () => {
    const f = await fixture(), raw = body(); const d = dispatcher(a, {}, { admit: async (input, identity) => {
      const result = await admitCommerceCheckout(input, identity, now());
      if (result.kind === "PROTOCOL_V1_ELIGIBLE") result.candidate.priceAssertions[0].quotedUnitPrice = 1600; return result;
    } });
    assert.equal((await d.dispatch({ body: raw })).status, 503); assert.equal(d.trace.create, 0); await zero(f, raw);
  });
  await run("unexpected server exception is generic 503 without error message", async () => {
    await fixture(); const raw = body(); const response = await dispatchStatus(raw, 503, a, undefined, {
      resolveAuthority: async () => { throw new Error("PRIVATE SERVER DETAIL"); },
    }); assert.ok(!JSON.stringify(response.body).includes("PRIVATE SERVER DETAIL"));
  });

  await run("fresh guest final order preserves original T1 hash and post-expiry detail access", async () => {
    const f = await fixture(), raw = body(), d = dispatcher(null), issued = d.access.issue({ idempotencyKey: raw.idempotencyKey });
    const response = await d.dispatch({ body: raw, guestAttemptAccessToken: issued.token }); finalized(response); safe(response, issued.token);
    const order = JSON.parse(await fs.readFile(path.join(f.orderDir, response.body.orderNumber + ".json"), "utf8"));
    assert.equal(order.guestOrderAccess.tokenHash, guestTokenHash(issued.token)); current = Date.parse(issued.expiresAt) + 1;
    assert.equal(verifyGuestOrderAccessToken(order as StoredOrder, issued.token), true);
    const encoded = JSON.stringify({ order, journal: await journal(f, raw).read() });
    for (const forbidden of [issued.token, "quotedUnitPrice", "publicFresh", "validateLocked", "financialSnapshot", PUBLIC_CHECKOUT_ATTEMPT_ACCESS_HEADER])
      assert.ok(!encoded.includes(forbidden), "ephemeral facts never persist");
  });
  await run("dispatcher does not log capabilities or internal errors", () => {
    assert.ok(!/console\.|logger\.|error\.message/.test(moduleSource)); assert.ok(!/Location|URLSearchParams/.test(moduleSource));
  });
  for (const status of [200, 400, 401, 403, 409, 503] as const) await run("actual orders route V1 no-store and safe body: " + status, async () => {
    const f = await fixture(), raw = body(); let token: string | undefined;
    if ([200, 403, 409, 503].includes(status)) token = createPublicCheckoutAttemptAccess().issue({ idempotencyKey: raw.idempotencyKey }).token;
    if (status === 400) raw.idempotencyKey = "bad";
    if (status === 403) process.env.STORE_COMMERCE_ENABLED = "false";
    if (status === 409) await legacy(f, raw);
    if (status === 503) delete process.env.GUEST_CHECKOUT_ACCESS_SECRET;
    const response = await POST(new Request("http://isolated.test/api/orders", { method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { [PUBLIC_CHECKOUT_ATTEMPT_ACCESS_HEADER]: token } : {}) },
      body: JSON.stringify(raw) }));
    assert.equal(response.status, status); assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Location"), null); safe({ status, body: await response.json() }, token);
  });
  await run("actual route durable guest remains recoverable when flag and secret disabled", async () => {
    const f = await fixture(), raw = body(), access = createPublicCheckoutAttemptAccess({ now }), issued = access.issue({ idempotencyKey: raw.idempotencyKey });
    await prepared(f, raw, access.resolveIdentity({ token: issued.token, idempotencyKey: raw.idempotencyKey }));
    current = Date.parse(issued.expiresAt) + 1; process.env.STORE_COMMERCE_ENABLED = "false"; delete process.env.GUEST_CHECKOUT_ACCESS_SECRET;
    const response = await POST(new Request("http://isolated.test/api/orders", { method: "POST",
      headers: { "Content-Type": "application/json", [PUBLIC_CHECKOUT_ATTEMPT_ACCESS_HEADER]: issued.token }, body: JSON.stringify(raw) }));
    assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store"); safe({ status: 200, body: await response.json() }, issued.token);
  });
  for (const [file, hash] of sourceHashes) await run("foundation remains unchanged: " + file, async () => {
    assert.equal(createHash("sha256").update(await fs.readFile(file)).digest("hex"), hash);
  });
  await run("C2C2C1 production hash is exact approved foundation", () => assert.equal(sourceHashes.get("lib/commerceOrderTransaction.ts"),
    "68f88d5c340f8047328856886a172241bdb933b3cdcfdb29f9493521e2dc7474"));
  await run("C2C2C1 focused test hash is exact frozen foundation", () => assert.equal(sourceHashes.get("scripts/test-phase-j6f5c2c2c1-locked-fresh-admission.mts"),
    "aefd50bf5d6165dc21bc94ebc6ff20e857c9f103fc2e9cc7a8e706e27336eba4"));
  await run("network calls remain zero", () => assert.equal(networkCalls, 0));
  assert.ok(checks >= 90, "coverage floor");
  console.log("J.6F.5C2C2C2 PASS " + checks + "/" + checks);
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  const resolved = await fs.realpath(suite);
  assert.equal(path.dirname(resolved).toLowerCase(), tempParent.toLowerCase()); assert.ok(path.basename(resolved).startsWith("kd-j6f5c2c2c2-"));
  await fs.rm(resolved, { recursive: true, force: true });
}
