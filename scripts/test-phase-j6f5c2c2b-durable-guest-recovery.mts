import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createCommerceOrderTransactionService, commerceOrderTransactionId, CommerceOrderTransactionError } from "../lib/commerceOrderTransaction";
import { commerceOrderTransactionIdForCanonicalKey } from "../lib/commerceOrderTransactionIdentity";
import { classifyPublicCheckoutRequest, createProtocolV1SelectedFactsFingerprint, type PublicCheckoutOwnerBinding } from "../lib/publicCheckoutContract";
import { resolveTrustedCheckoutOwnership, type TrustedCheckoutIdentity } from "../lib/commerceCheckoutAdmission";
import { validateCommerceOrderInput, normalizeCommerceCheckoutContext } from "../lib/commerceOrderTypes";
import { createStoreRepository } from "../lib/storeRepository";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } from "../lib/membershipBusinessRules";
import { createCommerceTransactionJournal } from "../lib/commerceTransactionJournal";
import { createIdempotencyRequestHash } from "../lib/orderIdempotency";
import { inventoryHash } from "../lib/inventoryReceipts";
import type { TransactionIntent } from "../lib/commerceTransactionTypes";

const timestamp = "2026-10-12T06:37:00.000Z";
let current = Date.parse(timestamp);
const now = () => new Date(current);
const suite = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f5c2c2b-"));
const tempParent = await fs.realpath(os.tmpdir());
assert.equal(path.dirname(await fs.realpath(suite)).toLowerCase(), tempParent.toLowerCase());
const savedEnv = Object.fromEntries(["KD_DATA_DIR", "RAILWAY_VOLUME_MOUNT_PATH", "STORE_COMMERCE_ENABLED", "AUTH_SESSION_SECRET", "MEMBER_IDENTITY_SECRET", "GUEST_CHECKOUT_ACCESS_SECRET"].map(key => [key, process.env[key]]));
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.STORE_COMMERCE_ENABLED = "true";
process.env.AUTH_SESSION_SECRET = "isolated-b3b-secret-more-than-thirty-two-characters";
process.env.MEMBER_IDENTITY_SECRET = process.env.AUTH_SESSION_SECRET;
const originalFetch = globalThis.fetch;
let checks = 0, fixtureCount = 0, networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("Network forbidden"); };
type FixtureRecord = Record<string, any>;
type InternalRequest = { idempotencyKey: string; items: FixtureRecord[]; orderContext: FixtureRecord };
const member: TrustedCheckoutIdentity = { member: { id: "member-a", lineUserId: "LINE-ORIGINAL", displayName: "Original Member" } };
const changedMember: TrustedCheckoutIdentity = { member: { id: "member-a", lineUserId: "LINE-CURRENT", displayName: "Current Member" } };
const guest: TrustedCheckoutIdentity = { guestOrderAccess: { tokenHash: createHash("sha256").update("original-cap").digest("base64url"), createdAt: timestamp } };
const changedGuest: TrustedCheckoutIdentity = { guestOrderAccess: { ...guest.guestOrderAccess!, createdAt: "2026-10-14T00:00:00.000Z" } };
const replacementGuest: TrustedCheckoutIdentity = { guestOrderAccess: { ...guest.guestOrderAccess!, tokenHash: createHash("sha256").update("replacement-cap").digest("base64url") } };
function stable(identity: TrustedCheckoutIdentity, key: string): PublicCheckoutOwnerBinding {
  const owner = resolveTrustedCheckoutOwnership(identity);
  return owner.kind === "member" ? { kind: "member", memberId: owner.member.memberId }
    : { kind: "guest", canonicalAttemptKey: key.toLowerCase(), tokenHash: owner.guestOrderAccess.tokenHash };
}
function normalized(raw: InternalRequest): InternalRequest {
  return { idempotencyKey: raw.idempotencyKey.toLowerCase(),
    items: validateCommerceOrderInput(raw.items).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0),
    orderContext: normalizeCommerceCheckoutContext(raw.orderContext) };
}
function request(mode = "studio_pickup", domain = "store", method = "cash_on_delivery"): InternalRequest {
  const coffee = { domain: "coffee", productId: "coffee-product", variantId: "coffee-sku", quantity: 4,
    coffeeOptions: { preparation: "咖啡豆", customRoast: true, roastLevel: "淺中焙", roastNote: "Original" } };
  const merchandise = { domain: "store", productId: "store-product", variantId: "default", quantity: 2 };
  const orderContext: FixtureRecord = { orderMode: mode, customer: { name: "Fixture", phone: "0912345678", email: "", note: "" } };
  if (mode === "studio_pickup") orderContext.studioPickup = { preferredDate: "2026-10-20" };
  if (mode === "711_cod") orderContext.store = { id: "ABC123", name: "Fixture Store", address: "Original store address" };
  if (mode === "home_delivery") {
    orderContext.deliveryAddress = { recipientName: "Fixture", phone: "0912345678", postalCode: "100", city: "臺北市", district: "中正區", addressLine: "Original address" };
    orderContext.paymentMethod = method;
  }
  return { idempotencyKey: randomUUID(), items: domain === "coffee" ? [coffee] : domain === "mixed" ? [coffee, merchandise] : [merchandise], orderContext };
}
async function run(label: string, operation: () => unknown | Promise<unknown>) {
  try { await operation(); console.log("PASS " + (++checks) + " " + label); }
  catch (error) { console.error("FAIL case " + (checks + 1) + " " + label); throw error; }
}
async function snapshot(root: string): Promise<[string, string][]> {
  const rows: [string, string][] = [];
  async function visit(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else { assert.ok(entry.isFile()); rows.push([path.relative(root, file), createHash("sha256").update(await fs.readFile(file)).digest("hex")]); }
    }
  }
  await visit(root); return rows.sort((a, b) => a[0].localeCompare(b[0]));
}
async function fixture() {
  const root = path.join(suite, "fixture-" + (++fixtureCount));
  process.env.KD_DATA_DIR = root;
  await fs.mkdir(path.join(root, "orders"), { recursive: true });
  await fs.mkdir(path.join(root, "store"), { recursive: true });
  const website = path.join(root, "store", "website-data.json");
  await fs.writeFile(website, JSON.stringify({ version: 1, menu: { products: [{
    id: "coffee-product", slug: "coffee-live", name: "Coffee", active: true, purchasable: true, purchase: [],
    skus: [{ id: "coffee-sku", label: "半磅咖啡豆", detail: "227g", kind: "beans", enabled: true, price: 500, stock: 20, pvEnabled: true, pvValue: 30 }],
  }] } }));
  const repository = createStoreRepository({ dataRoot: root, now });
  await repository.createSection({ id: "section", slug: "equipment", name: "Equipment", published: true });
  await repository.createProduct({ id: "store-product", sectionId: "section", slug: "store-live", name: "Store", sku: "DISPLAY", price: 50, inventory: 20, pvValue: 999, active: true, published: true });
  const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES);
  rules.payment.atmTransfer = { bankName: "Fixture Bank", bankCode: "999", branchName: "Fixture Branch", accountName: "Fixture Studio",
    accountNumber: "1234567890", instructions: "Fixture instructions", bankbookImageUrl: null, showBankbookImageAtCheckout: false };
  const rulesFile = path.join(root, "membership-commerce", "business-rules.json");
  await saveMembershipBusinessRules({ expectedRevision: 0, rules, effectiveAt: timestamp, now: now() }, rulesFile);
  return { root, repository, website, rulesFile };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function service(options: Parameters<typeof createCommerceOrderTransactionService>[0] = {}) { return createCommerceOrderTransactionService({ now, ...options }); }
async function prepared(f: Fixture, raw: InternalRequest, identity?: TrustedCheckoutIdentity, old = false) {
  process.env.KD_DATA_DIR = f.root;
  const result = await service({ hook: async phase => { if (phase === "PREPARED") throw new Error("Isolated PREPARED interruption"); } }).create(raw, identity);
  assert.equal(result.state, "PENDING");
  const journal = createCommerceTransactionJournal(path.join(f.root, "orders"), result.transactionId);
  const event = (await journal.read())[0].event;
  assert.equal(event.type, "PREPARED");
  if (event.type !== "PREPARED") throw new Error("Missing PREPARED");
  const firstFile = path.join(journal.directory, "00000000.json");
  if (old) {
    // Isolated old-format fixture only: reconstruct the source-proven historical
    // PREPARED snapshot before any order/APPLY. Never modify real durable data.
    const intent = structuredClone(event.intent);
    delete intent.order.checkoutAttemptBinding;
    const input = normalized(raw), ownership = identity ? resolveTrustedCheckoutOwnership(identity) : undefined;
    intent.requestHash = createIdempotencyRequestHash({ items: input.items, orderContext: input.orderContext, ...(ownership ? { ownership } : {}) });
    intent.order.idempotencyRequestHash = intent.requestHash;
    const record = { schemaVersion: 1, sequence: 0, previousHash: null, event: { type: "PREPARED", intent } };
    await fs.writeFile(firstFile, JSON.stringify({ ...record, hash: inventoryHash(record) }));
  }
  const first = (await journal.read())[0].event;
  if (first.type !== "PREPARED") throw new Error("Missing verified fixture PREPARED");
  return { journal, firstFile, intent: first.intent, bytes: await fs.readFile(firstFile), result };
}

import { createPublicCheckoutAttemptAccess, resolveDurableGuestCheckoutIdentity, DurableGuestCheckoutIdentityError, PublicCheckoutAttemptAccessUnavailableError } from "../lib/publicCheckoutAttemptAccess";
import { CheckoutAttemptAccessError } from "../lib/checkoutAttemptAccess";
import { resolveCheckoutAttemptEvidence, resolveCheckoutAttemptRecoveryAuthority, type CheckoutAttemptRecoveryAuthority } from "../lib/checkoutAttemptResolver";
import { guestTokenHash, verifyGuestOrderAccessToken } from "../lib/orderConversation";
import type { StoredOrder } from "../lib/adminOrders";
import { createCommerceTransactionCoordinator } from "../lib/commerceTransactionCoordinator";
import { createCoffeeInventoryParticipant, createStoreInventoryParticipant } from "../lib/inventoryParticipants";
import { withCommerceLockPlan } from "../lib/commerceLocks";
import { orderIdempotencyResource } from "../lib/orderIdempotency";

const access = createPublicCheckoutAttemptAccess({ now });
const freeze = [
  "lib/checkoutAttemptAccess.ts", "lib/checkoutAttemptBinding.ts", "lib/publicCheckoutContract.ts", "lib/commerceCheckoutAdmission.ts",
  "lib/commerceTransactionTypes.ts", "lib/commerceTransactionJournal.ts", "lib/commerceLocks.ts", "lib/commerceLockProtocol.ts",
  "lib/orderIdempotency.ts", "lib/orderConversation.ts", "app/api/orders/route.ts", "app/api/commerce/checkout-attempt/route.ts",
  "app/checkout/page.tsx", "lib/commerceCart.ts", "components/commerce/CommerceCheckoutBoundary.tsx", "package.json", "package-lock.json", "tsconfig.json",
];
const frozen = await Promise.all(freeze.map(file => fs.readFile(file)));
async function projection(f: Fixture, raw: InternalRequest) {
  return resolveCheckoutAttemptRecoveryAuthority({ orderDir: path.join(f.root, "orders"), canonicalAttemptKey: raw.idempotencyKey });
}
async function owned(f: Fixture, raw: InternalRequest) {
  const a = await projection(f, raw);
  assert.equal(a.kind, "PROTOCOL_V1_GUEST");
  if (a.kind !== "PROTOCOL_V1_GUEST") throw new Error("Expected guest authority");
  return a;
}
function possession(token: unknown, raw: InternalRequest, authority: CheckoutAttemptRecoveryAuthority) {
  return resolveDurableGuestCheckoutIdentity({ token, canonicalAttemptKey: raw.idempotencyKey, authority });
}
function expiry() { current += 900001; }
function reset() {
  current = Date.parse(timestamp); process.env.STORE_COMMERCE_ENABLED = "true";
  process.env.GUEST_CHECKOUT_ACCESS_SECRET = "isolated-c2c2b-guest-secret-more-than-32-bytes";
}
async function guestPrepared(mode = "studio_pickup", domain = "store", method = "cash_on_delivery") {
  reset();
  const f = await fixture(), raw = request(mode, domain, method), issued = access.issue({ idempotencyKey: raw.idempotencyKey });
  const identity = access.resolveIdentity({ token: issued.token, idempotencyKey: raw.idempotencyKey });
  const p = await prepared(f, raw, identity);
  return { f, raw, issued, identity, p };
}
async function denied(f: Fixture, raw: unknown, identity: TrustedCheckoutIdentity, code: string,
  options: Parameters<typeof service>[0] = {}, unchanged = true) {
  const before = await snapshot(f.root);
  await assert.rejects(async () => service(options).recoverExisting(raw, identity), (error: unknown) => {
    assert.ok(error instanceof CommerceOrderTransactionError); assert.equal(error.code, code); return true;
  });
  if (unchanged) assert.deepEqual(await snapshot(f.root), before);
}
async function replaceIntent(p: Awaited<ReturnType<typeof prepared>>, change: (intent: TransactionIntent) => void) {
  const intent = structuredClone(p.intent); change(intent);
  const record = { schemaVersion: 1, sequence: 0, previousHash: null, event: { type: "PREPARED", intent } };
  await fs.writeFile(p.firstFile, JSON.stringify({ ...record, hash: inventoryHash(record) }));
}
try {
  const seed = await guestPrepared(), { f, raw, issued, identity, p } = seed;
  const a = await owned(f, raw);
  await run("fresh C1 T1 owns isolated B3B PREPARED", () => {
    assert.equal(a.journalState, "PREPARED"); assert.equal(a.orderState, "ABSENT");
    assert.equal(a.owner.tokenHash, guestTokenHash(issued.token));
    assert.equal(p.intent.order.checkoutAttemptBinding && (p.intent.order.checkoutAttemptBinding as FixtureRecord).ownerBinding.tokenHash, a.owner.tokenHash);
  });
  await run("projection has exactly narrow fields", () => {
    assert.deepEqual(Object.keys(a).sort(), ["kind", "canonicalAttemptKey", "transactionId", "orderNumber", "requestHash", "journalState", "orderState", "selectedFactsFingerprint", "owner"].sort());
    assert.deepEqual(Object.keys(a.owner).sort(), ["kind", "canonicalAttemptKey", "tokenHash", "createdAt"].sort());
    assert.ok(Object.isFrozen(a)); assert.ok(Object.isFrozen(a.owner));
  });
  await run("projection exposes no raw capability or full customer/order", () => {
    const text = JSON.stringify(a);
    assert.ok(!text.includes(issued.token));
    for (const field of ["customer", "address", "phone", "email", "items", "order", "intent", "secret", "nonce"]) assert.ok(!Object.hasOwn(a, field));
  });
  await run("original persisted guest createdAt is exact", () => assert.equal(a.owner.createdAt, (p.intent.order.guestOrderAccess as FixtureRecord).createdAt));
  await run("generic B2 shape unchanged and has no owner fields", async () => {
    const e = await resolveCheckoutAttemptEvidence({ orderDir: path.join(f.root, "orders"), canonicalAttemptKey: raw.idempotencyKey });
    assert.deepEqual(Object.keys(e).sort(), ["kind", "canonicalAttemptKey", "transactionId", "orderNumber", "requestHash", "journalState", "orderState", "orderPresent"].sort());
    assert.equal(e.kind, "PROTOCOL_V1_ATTEMPT");
  });
  await run("valid original T1 possession returns durable identity", () => assert.deepEqual(possession(issued.token, raw, a), identity));
  expiry();
  await run("fresh verification rejects expired T1", () => assert.throws(() => access.resolveIdentity({ token: issued.token, idempotencyKey: raw.idempotencyKey }), (e: unknown) => e instanceof CheckoutAttemptAccessError && e.code === "EXPIRED"));
  await run("expired original T1 proves existing durable possession", () => assert.deepEqual(possession(issued.token, raw, a), identity));
  const t2 = access.issue({ idempotencyKey: raw.idempotencyKey });
  await run("T2 same UUID has different hash", () => assert.notEqual(t2.tokenHash, a.owner.tokenHash));
  for (const [label, token] of [["T2", t2.token], ["random", "unrelated"], ["UUID only", raw.idempotencyKey], ["hash only", a.owner.tokenHash],
    ["missing", undefined], ["empty", ""], ["whitespace", " "], ["oversize", "x".repeat(4097)]] as const) {
    await run(label + " cannot prove original ownership", () => assert.throws(() => possession(token, raw, a), DurableGuestCheckoutIdentityError));
  }
  await run("wrong canonical key rejects possession", () => assert.throws(() => possession(issued.token, { ...raw, idempotencyKey: randomUUID() }, a), DurableGuestCheckoutIdentityError));
  await run("browser cloned authority rejected", () => assert.throws(() => possession(issued.token, raw, structuredClone(a)), DurableGuestCheckoutIdentityError));
  await run("browser tokenHash cannot create trusted authority", () => assert.throws(() => possession("arbitrary", raw, { ...a, owner: { ...a.owner, tokenHash: guestTokenHash("arbitrary") } }), DurableGuestCheckoutIdentityError));
  await run("browser createdAt cannot create trusted authority", () => assert.throws(() => possession(issued.token, raw, { ...a, owner: { ...a.owner, createdAt: now().toISOString() } }), DurableGuestCheckoutIdentityError));
  await run("durable possession independent of absent current secret", () => {
    delete process.env.GUEST_CHECKOUT_ACCESS_SECRET; assert.deepEqual(possession(issued.token, raw, a), identity);
  });
  await run("durable possession independent of rotated current secret", () => {
    process.env.GUEST_CHECKOUT_ACCESS_SECRET = "different-current-signing-secret-more-than-32-bytes"; assert.deepEqual(possession(issued.token, raw, a), identity);
  });
  await run("durable possession independent of disabled Store gate", () => {
    process.env.STORE_COMMERCE_ENABLED = "false"; assert.deepEqual(possession(issued.token, raw, a), identity);
  });
  await run("fresh public guest capability rejected with disabled Store gate", async () => {
    const fresh = { ...raw, idempotencyKey: randomUUID() }; const before = await snapshot(f.root);
    process.env.STORE_COMMERCE_ENABLED = "false";
    process.env.GUEST_CHECKOUT_ACCESS_SECRET = "isolated-c2c2b-guest-secret-more-than-32-bytes";
    assert.throws(() => access.issue({ idempotencyKey: fresh.idempotencyKey }),
      (error: unknown) => error instanceof PublicCheckoutAttemptAccessUnavailableError && error.code === "DISABLED");
    assert.deepEqual(await snapshot(f.root), before);
  });
  await run("expired NONE cannot use possession or write", async () => {
    const fresh = { ...raw, idempotencyKey: randomUUID() }, before = await snapshot(f.root);
    const none = await projection(f, fresh); assert.equal(none.kind, "NONE");
    assert.throws(() => possession(issued.token, fresh, none), DurableGuestCheckoutIdentityError);
    await denied(f, fresh, identity, "REVIEW_REQUIRED"); assert.deepEqual(await snapshot(f.root), before);
  });
  await run("wrong owner precedes selection conflict", async () => {
    const changed = structuredClone(raw); changed.items[0].quantity++;
    await denied(f, changed, { guestOrderAccess: { ...identity.guestOrderAccess!, tokenHash: t2.tokenHash } }, "INVALID_IDENTITY");
  });
  await run("same owner changed selection gives conflict", async () => {
    const changed = structuredClone(raw); changed.items[0].quantity++; await denied(f, changed, identity, "IDEMPOTENCY_CONFLICT");
  });
  await run("browser createdAt in raw request is rejected", () => denied(f, { ...raw, createdAt: timestamp }, identity, "INVALID_REQUEST"));
  await run("browser tokenHash in raw request is rejected", () => denied(f, { ...raw, tokenHash: a.owner.tokenHash }, identity, "INVALID_REQUEST"));
  await run("PREPARED original expired T1 existing-only recovery works with gate OFF and missing secret", async () => {
    delete process.env.GUEST_CHECKOUT_ACCESS_SECRET;
    const result = await service({ generateOrderNumber: () => { throw new Error("Fresh order number forbidden"); } }).recoverExisting(raw, possession(issued.token, raw, a));
    assert.equal(result.state, "FINALIZED"); assert.equal(result.orderNumber, p.intent.orderNumber);
    assert.deepEqual(result.order?.guestOrderAccess, p.intent.order.guestOrderAccess);
    assert.deepEqual(await fs.readFile(p.firstFile), p.bytes);
  });
  await run("FINALIZED projection correlates original guest order", async () => {
    const final = await owned(f, raw); assert.equal(final.journalState, "FINALIZED"); assert.equal(final.orderState, "inventory_committed");
    assert.deepEqual(final.owner, a.owner);
  });
  await run("FINALIZED expired T1 replay has no writes or second APPLY", async () => {
    const before = await snapshot(f.root);
    const result = await service().recoverExisting(raw, possession(issued.token, raw, await owned(f, raw)));
    assert.equal(result.state, "FINALIZED"); assert.deepEqual(await snapshot(f.root), before);
  });
  await run("FINALIZED hash-only order access accepts original expired T1 and rejects T2", async () => {
    const order = JSON.parse(await fs.readFile(path.join(f.root, "orders", p.intent.orderNumber + ".json"), "utf8")) as StoredOrder;
    assert.ok(verifyGuestOrderAccessToken(order, issued.token)); assert.ok(!verifyGuestOrderAccessToken(order, t2.token));
  });
  const intentMutations: [string, (i: TransactionIntent) => void][] = [
    ["missing binding historical", i => { delete i.order.checkoutAttemptBinding; }],
    ["null binding", i => { i.order.checkoutAttemptBinding = null; }],
    ["bad schema", i => { (i.order.checkoutAttemptBinding as FixtureRecord).schemaVersion = 2; }],
    ["bad contract", i => { (i.order.checkoutAttemptBinding as FixtureRecord).contractVersion = 2; }],
    ["bad family", i => { (i.order.checkoutAttemptBinding as FixtureRecord).requestFamily = "LEGACY_COFFEE"; }],
    ["bad key", i => { (i.order.checkoutAttemptBinding as FixtureRecord).canonicalAttemptKey = randomUUID(); }],
    ["inner guest key mismatch", i => { (i.order.checkoutAttemptBinding as FixtureRecord).ownerBinding.canonicalAttemptKey = randomUUID(); }],
    ["binding fingerprint mismatch", i => { (i.order.checkoutAttemptBinding as FixtureRecord).selectedFactsFingerprint = "a".repeat(64); }],
    ["order request hash mismatch", i => { i.order.idempotencyRequestHash = "b".repeat(64); }],
    ["guest hash mismatch", i => { (i.order.guestOrderAccess as FixtureRecord).tokenHash = guestTokenHash("other"); }],
    ["missing createdAt", i => { delete (i.order.guestOrderAccess as FixtureRecord).createdAt; }],
    ["bad createdAt", i => { (i.order.guestOrderAccess as FixtureRecord).createdAt = "invalid"; }],
    ["guest access extra field", i => { (i.order.guestOrderAccess as FixtureRecord).token = "forbidden"; }],
    ["guest dual member ownership", i => { i.order.member = { memberId: "other-member" }; }],
  ];
  for (const [label, change] of intentMutations) await run(label + " fails closed without repairing intent", async () => {
    const x = await guestPrepared(); await replaceIntent(x.p, change);
    const before = await snapshot(x.f.root), result = await projection(x.f, x.raw);
    assert.equal(result.kind, "REVIEW_REQUIRED");
    if (label === "missing binding historical") {
      assert.ok(result.kind === "REVIEW_REQUIRED" && result.reason === "UNSUPPORTED_DURABLE_OWNER");
      const generic = await resolveCheckoutAttemptEvidence({ orderDir: path.join(x.f.root, "orders"), canonicalAttemptKey: x.raw.idempotencyKey });
      assert.equal(generic.kind, "PROTOCOL_V1_ATTEMPT");
    }
    await denied(x.f, x.raw, x.identity, "REVIEW_REQUIRED"); assert.deepEqual(await snapshot(x.f.root), before);
  });
  await run("persisted noncanonical timestamp is preserved exactly", async () => {
    const x = await guestPrepared(), original = "2026-10-12T14:37:00+08:00";
    await replaceIntent(x.p, i => { (i.order.guestOrderAccess as FixtureRecord).createdAt = original; });
    const projected = await owned(x.f, x.raw); assert.equal(projected.owner.createdAt, original);
    assert.equal(possession(x.issued.token, x.raw, projected).guestOrderAccess?.createdAt, original);
  });
  const orderChanges: [string, (o: FixtureRecord) => void][] = [
    ["guest hash", o => { o.guestOrderAccess.tokenHash = guestTokenHash("different"); }],
    ["guest createdAt", o => { o.guestOrderAccess.createdAt = "2026-10-14T00:00:00.000Z"; }],
    ["binding", o => { o.checkoutAttemptBinding.ownerBinding.tokenHash = guestTokenHash("different"); }],
    ["dual member", o => { o.member = { memberId: "different" }; }],
    ["intentHash", o => { o.inventoryTransaction.intentHash = "a".repeat(64); }],
  ];
  for (const [label, change] of orderChanges) await run("existing order " + label + " mismatch rejects recovery", async () => {
    const x = await guestPrepared(); await service().recoverExisting(x.raw, x.identity);
    const file = path.join(x.f.root, "orders", x.p.intent.orderNumber + ".json"), order = JSON.parse(await fs.readFile(file, "utf8"));
    change(order); await fs.writeFile(file, JSON.stringify(order));
    assert.equal((await projection(x.f, x.raw)).kind, "REVIEW_REQUIRED"); await denied(x.f, x.raw, x.identity, "REVIEW_REQUIRED");
  });
  await run("PENDING recovery preserves admitted price/rules/ATM after configuration change", async () => {
    const x = await guestPrepared("home_delivery", "mixed", "atm_transfer");
    const pending = await service({ writeFinalOrder: async () => { throw new Error("Isolated finalization loss"); } }).recoverExisting(x.raw, x.identity);
    assert.equal(pending.state, "PENDING"); assert.equal((await owned(x.f, x.raw)).journalState, "PENDING");
    const catalog = await x.f.repository.read(), product = catalog.products[0];
    await x.f.repository.updateProduct(product.id, product.revision, { price: 999, published: false });
    const coffee = JSON.parse(await fs.readFile(x.f.website, "utf8")); coffee.menu.products[0].skus[0].price = 999;
    await fs.writeFile(x.f.website, JSON.stringify(coffee));
    await fs.writeFile(x.f.rulesFile, "{INVALID CURRENT RULES/ATM");
    expiry(); process.env.STORE_COMMERCE_ENABLED = "false"; delete process.env.GUEST_CHECKOUT_ACCESS_SECRET;
    const result = await service().recoverExisting(x.raw, possession(x.issued.token, x.raw, await owned(x.f, x.raw)));
    assert.equal(result.state, "FINALIZED");
    for (const field of ["items", "subtotal", "shipping", "total", "atmTransferSnapshot", "checkoutRulesVersion", "guestOrderAccess"]) assert.deepEqual(result.order?.[field], x.p.intent.order[field]);
    assert.deepEqual(await fs.readFile(x.p.firstFile), x.p.bytes);
  });
  await run("committed order before FINALIZED marker safely completes recovery", async () => {
    const x = await guestPrepared(); const interrupted = await service({ hook: async phase => { if (phase === "FINALIZED") throw new Error("Marker loss"); } }).recoverExisting(x.raw, x.identity);
    assert.equal(interrupted.state, "PENDING");
    const before = await owned(x.f, x.raw); assert.equal(before.journalState, "PENDING"); assert.equal(before.orderState, "inventory_committed");
    const inventory = (await x.f.repository.read()).products[0].inventory;
    assert.equal((await service().recoverExisting(x.raw, x.identity)).state, "FINALIZED");
    assert.equal((await x.f.repository.read()).products[0].inventory, inventory);
  });
  for (const change of ["disappear", "order number", "participant demand", "owner"]) await run("under-lock authority " + change + " fails closed without fresh fallback", async () => {
    const x = await guestPrepared(); let after: [string, string][] = [];
    await denied(x.f, x.raw, x.identity, change === "owner" ? "INVALID_IDENTITY" : "REVIEW_REQUIRED", {
      generateOrderNumber: () => { throw new Error("Fresh order number forbidden"); },
      beforeRecoveryLocks: async () => {
        if (change === "disappear") await fs.unlink(x.p.firstFile);
        else await replaceIntent(x.p, i => {
          if (change === "order number") { i.orderNumber = "KD20261012-999999"; i.order.orderNumber = i.orderNumber; }
          if (change === "participant demand") i.participants[0].demands[0].quantity++;
          if (change === "owner") {
            (i.order.guestOrderAccess as FixtureRecord).tokenHash = guestTokenHash("new-owner");
            (i.order.checkoutAttemptBinding as FixtureRecord).ownerBinding.tokenHash = guestTokenHash("new-owner");
          }
        });
        after = await snapshot(x.f.root);
      },
    }, false);
    assert.deepEqual(await snapshot(x.f.root), after);
  });
  await run("ABORTED original expired T1 returns terminal with no order/apply/journal writes", async () => {
    const x = await guestPrepared();
    await withCommerceLockPlan([
      { file: x.p.journal.lockFile, rank: 0 as const, key: x.p.intent.transactionId },
    ], async () => {
      await x.p.journal.append({ type: "ABORT", reason: "Isolated terminal fixture" });
      await x.p.journal.append({ type: "ABORTED" });
    });
    const entries = await x.p.journal.read();
    assert.deepEqual(entries.map(entry => entry.event.type), ["PREPARED", "ABORT", "ABORTED"]);
    await assert.rejects(fs.stat(path.join(x.f.root, "orders", x.p.intent.orderNumber + ".json")),
      (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT");
    expiry(); const terminal = await owned(x.f, x.raw); assert.equal(terminal.journalState, "ABORTED");
    const before = await snapshot(x.f.root);
    const result = await service().recoverExisting(x.raw, possession(x.issued.token, x.raw, terminal));
    assert.equal(result.state, "ABORTED"); assert.deepEqual(await snapshot(x.f.root), before);
    await assert.rejects(fs.stat(path.join(x.f.root, "orders", x.p.intent.orderNumber + ".json")), (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT");
    const replacement = access.issue({ idempotencyKey: x.raw.idempotencyKey });
    assert.throws(() => possession(replacement.token, x.raw, terminal), DurableGuestCheckoutIdentityError);
    await denied(x.f, x.raw, { guestOrderAccess: { tokenHash: replacement.tokenHash, createdAt: replacement.issuedAt } }, "INVALID_IDENTITY");
  });
  await run("LEGACY authority cannot enter existing V1 recovery", async () => {
    reset(); const f = await fixture(), raw = request(), orderNumber = "KD20261012-123456";
    await fs.writeFile(path.join(f.root, "orders", orderNumber + ".json"), JSON.stringify({ orderNumber, idempotencyKey: raw.idempotencyKey, orderMode: "studio_pickup", status: "confirmed" }));
    assert.equal((await projection(f, raw)).kind, "LEGACY_ORDER"); await denied(f, raw, guest, "REVIEW_REQUIRED");
  });
  await run("dual cross-protocol authority fails closed", async () => {
    const x = await guestPrepared(), orderNumber = "KD20261012-123456";
    await fs.writeFile(path.join(x.f.root, "orders", orderNumber + ".json"), JSON.stringify({ orderNumber, idempotencyKey: x.raw.idempotencyKey, orderMode: "studio_pickup", status: "confirmed" }));
    assert.equal((await projection(x.f, x.raw)).kind, "CONFLICT"); await denied(x.f, x.raw, x.identity, "REVIEW_REQUIRED");
  });
  for (const corruption of ["invalid JSON", "broken hash chain", "oversize journal", "corrupt order"]) await run(corruption + " fails closed and writes nothing", async () => {
    const x = await guestPrepared();
    if (corruption === "invalid JSON") await fs.writeFile(x.p.firstFile, "{bad");
    if (corruption === "broken hash chain") { const e = JSON.parse(await fs.readFile(x.p.firstFile, "utf8")); e.hash = "a".repeat(64); await fs.writeFile(x.p.firstFile, JSON.stringify(e)); }
    if (corruption === "oversize journal") await fs.writeFile(x.p.firstFile, " ".repeat(2 * 1024 * 1024 + 1));
    if (corruption === "corrupt order") await fs.writeFile(path.join(x.f.root, "orders", "KD20261012-123456.json"), "{bad");
    assert.equal((await projection(x.f, x.raw)).kind, "REVIEW_REQUIRED"); await denied(x.f, x.raw, x.identity, "REVIEW_REQUIRED");
  });
  await run("unsafe order source junction is rejected", async () => {
    const x = await guestPrepared(), unsafe = path.join(suite, "unsafe-orders"); await fs.symlink(path.join(x.f.root, "orders"), unsafe, "junction");
    assert.equal((await resolveCheckoutAttemptRecoveryAuthority({ orderDir: unsafe, canonicalAttemptKey: x.raw.idempotencyKey })).kind, "REVIEW_REQUIRED");
    await fs.unlink(unsafe);
  });
  await run("member recovery uses stable authenticated memberId", async () => {
    reset(); const f = await fixture(), raw = request(), p = await prepared(f, raw, member), a = await projection(f, raw);
    assert.equal(a.kind, "PROTOCOL_V1_MEMBER");
    if (a.kind !== "PROTOCOL_V1_MEMBER") throw new Error("Expected member");
    assert.deepEqual(a.owner, { kind: "member", memberId: "member-a" });
    assert.throws(() => possession("anything", raw, a), DurableGuestCheckoutIdentityError);
    process.env.STORE_COMMERCE_ENABLED = "false"; delete process.env.GUEST_CHECKOUT_ACCESS_SECRET;
    const result = await service().recoverExisting(raw, changedMember);
    assert.equal(result.state, "FINALIZED"); assert.deepEqual(result.order?.member, p.intent.order.member);
    await denied(f, raw, { member: { id: "member-b" } }, "INVALID_IDENTITY");
  });
  for (const corrupt of ["memberId", "dual guest", "order memberId"]) await run("member " + corrupt + " inconsistency rejected", async () => {
    reset(); const f = await fixture(), raw = request(), p = await prepared(f, raw, member);
    if (corrupt === "order memberId") {
      await service().recoverExisting(raw, member); const file = path.join(f.root, "orders", p.intent.orderNumber + ".json"), order = JSON.parse(await fs.readFile(file, "utf8"));
      order.member.memberId = "wrong"; await fs.writeFile(file, JSON.stringify(order));
    } else await replaceIntent(p, i => { if (corrupt === "memberId") (i.order.member as FixtureRecord).memberId = "wrong"; else i.order.guestOrderAccess = guest.guestOrderAccess; });
    assert.equal((await projection(f, raw)).kind, "REVIEW_REQUIRED"); await denied(f, raw, member, "REVIEW_REQUIRED");
  });
  await run("concurrent existing recovery applies inventory once", async () => {
    const x = await guestPrepared(), result = await Promise.all([service().recoverExisting(x.raw, x.identity), service().recoverExisting(x.raw, x.identity)]);
    assert.ok(result.every(r => r.state === "FINALIZED")); assert.equal((await x.f.repository.read()).products[0].inventory, 18);
    assert.equal((await x.p.journal.read()).filter(e => e.event.type === "PREPARED").length, 1);
  });
  await run("coordinator recoverLocked cannot create PREPARED when journal disappears", async () => {
    const x = await guestPrepared(), coordinator = createCommerceTransactionCoordinator({
      orderDir: path.join(x.f.root, "orders"), participants: [createCoffeeInventoryParticipant(x.f.website, now), createStoreInventoryParticipant({ dataRoot: x.f.root, now })],
    });
    await fs.unlink(x.p.firstFile); const before = await snapshot(x.f.root);
    const result = await withCommerceLockPlan([orderIdempotencyResource(path.join(x.f.root, "orders"), x.raw.idempotencyKey), ...coordinator.resources(x.p.intent)], () => coordinator.recoverLocked(x.p.intent));
    assert.equal(result.state, "REVIEW_REQUIRED"); assert.deepEqual(await snapshot(x.f.root), before);
  });
  await run("recoverLocked requires held complete plan", async () => {
    const x = await guestPrepared(), coordinator = createCommerceTransactionCoordinator({
      orderDir: path.join(x.f.root, "orders"), participants: [createCoffeeInventoryParticipant(x.f.website, now), createStoreInventoryParticipant({ dataRoot: x.f.root, now })],
    });
    const before = await snapshot(x.f.root); await assert.rejects(async () => coordinator.recoverLocked(x.p.intent)); assert.deepEqual(await snapshot(x.f.root), before);
  });
  await run("source freeze byte-identical including schemas/crypto/UI/public routes", async () => {
    for (let i = 0; i < freeze.length; i++) assert.deepEqual(await fs.readFile(freeze[i]), frozen[i], freeze[i]);
  });
  await run("all fixtures have no second registry/rewards/notifications or raw tokens persisted", async () => {
    for (const name of await fs.readdir(suite)) {
      const root = path.join(suite, name); const files = await snapshot(root);
      assert.ok(!files.some(([file]) => /commerce-state|fulfillment|notifications|binding\.json|attempt-registry/.test(file)));
      for (const [file] of files) assert.ok(!(await fs.readFile(path.join(root, file), "utf8")).includes("gco1."), file);
    }
    assert.equal(networkCalls, 0);
  });
  console.log("J.6F.5C2C2B PASS " + checks + "/" + checks + "; isolated fixture writes only; network=" + networkCalls);
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  assert.equal(path.dirname(await fs.realpath(suite)).toLowerCase(), tempParent.toLowerCase());
  await fs.rm(suite, { recursive: true, force: true });
}
