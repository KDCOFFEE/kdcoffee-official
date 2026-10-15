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

const timestamp = "2026-10-12T06:37:00.000Z", now = () => new Date(timestamp);
const suite = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f5c2b3b-"));
const tempParent = await fs.realpath(os.tmpdir());
assert.equal(path.dirname(await fs.realpath(suite)).toLowerCase(), tempParent.toLowerCase());
const savedEnv = Object.fromEntries(["KD_DATA_DIR", "RAILWAY_VOLUME_MOUNT_PATH", "STORE_COMMERCE_ENABLED", "AUTH_SESSION_SECRET", "MEMBER_IDENTITY_SECRET"].map(key => [key, process.env[key]]));
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
function publicInput(raw: InternalRequest, quote = 50): FixtureRecord {
  const context = raw.orderContext;
  return { idempotencyKey: raw.idempotencyKey, items: raw.items.map(line => ({ ...line, quotedUnitPrice: quote })),
    orderMode: context.orderMode, customer: context.customer,
    ...(context.orderMode === "studio_pickup" ? { studioPickup: context.studioPickup }
      : context.orderMode === "711_cod" ? { store: context.store }
      : { deliveryAddress: context.deliveryAddress, paymentMethod: context.paymentMethod }) };
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
async function rejectUnchanged(f: Fixture, raw: InternalRequest, identity: TrustedCheckoutIdentity, code: string) {
  const before = await snapshot(f.root);
  await assert.rejects(async () => service().create(raw, identity), error => {
    assert.ok(error instanceof CommerceOrderTransactionError);
    assert.equal(error.code, code); assert.equal(error.message, code);
    return true;
  });
  assert.deepEqual(await snapshot(f.root), before);
}
async function finalized(f: Fixture, raw: InternalRequest, identity: TrustedCheckoutIdentity, old = false) {
  const original = await prepared(f, raw, identity, old);
  const current = identity.member ? changedMember : changedGuest;
  const result = await service().create(raw, current);
  assert.equal(result.state, "FINALIZED"); assert.equal(result.orderNumber, original.result.orderNumber);
  assert.ok(result.order);
  assert.deepEqual(await fs.readFile(original.firstFile), original.bytes, "Original PREPARED bytes must not change");
  assert.deepEqual(result.order.member, original.intent.order.member);
  assert.deepEqual(result.order.guestOrderAccess, original.intent.order.guestOrderAccess);
  const before = await snapshot(f.root);
  assert.equal((await service().create(raw, current)).state, "FINALIZED");
  assert.deepEqual(await snapshot(f.root), before, "Finalized replay performs no writes or second APPLY");
  return original;
}
const checkoutSourceBefore = await fs.readFile("app/checkout/page.tsx");
try {
  for (const key of ["abcdef01-2345-4678-89ab-cdef01234567", "ABCDEF01-2345-4678-89AB-CDEF01234567", randomUUID()]) {
    await run("transaction ID historical parity " + key, () => {
      const old = "commerce-order:" + createHash("sha256").update(key.toLowerCase()).digest("hex");
      assert.equal(commerceOrderTransactionId(key), old);
      assert.equal(commerceOrderTransactionIdForCanonicalKey(key.toLowerCase()), old);
    });
  }
  await run("transaction ID invalid input keeps existing typed error", () => assert.throws(() => commerceOrderTransactionId("invalid"), error => error instanceof CommerceOrderTransactionError && error.code === "INVALID_REQUEST"));
  for (const [mode, domain, payment] of [["studio_pickup", "store", "cash_on_delivery"], ["711_cod", "store", "cash_on_delivery"],
    ["home_delivery", "store", "atm_transfer"], ["home_delivery", "store", "cash_on_delivery"], ["studio_pickup", "mixed", "cash_on_delivery"]] as const) {
    await run("B1/internal exact fingerprint parity " + mode + "/" + domain + "/" + payment, () => {
      const raw = request(mode, domain, payment), owner = stable(member, raw.idempotencyKey), input = normalized(raw);
      const publicResult = classifyPublicCheckoutRequest(publicInput(raw), owner);
      assert.ok(publicResult.family === "STORE_CONTAINING_PROTOCOL_V1");
      const shared = createProtocolV1SelectedFactsFingerprint({ canonicalAttemptKey: input.idempotencyKey, ownerBinding: owner, items: input.items, orderContext: input.orderContext });
      assert.deepEqual(shared.selectedFacts, publicResult.selectedFacts); assert.equal(shared.fingerprint, publicResult.fingerprint);
      const variation = { ...raw, idempotencyKey: raw.idempotencyKey.toUpperCase(), items: [...raw.items].reverse() };
      const alias = classifyPublicCheckoutRequest(publicInput(variation, 999), owner);
      assert.ok(alias.family === "STORE_CONTAINING_PROTOCOL_V1"); assert.equal(alias.fingerprint, shared.fingerprint);
      assert.equal(createProtocolV1SelectedFactsFingerprint({ canonicalAttemptKey: raw.idempotencyKey, ownerBinding: stable(changedMember, raw.idempotencyKey), items: input.items, orderContext: input.orderContext }).fingerprint, shared.fingerprint);
    });
  }
  for (const identity of [member, guest]) await run("new durable versioned " + (identity.member ? "member" : "guest") + " binding / original snapshot frozen on retry", async () => {
    const f = await fixture(), raw = request(), original = await finalized(f, raw, identity);
    const binding = original.intent.order.checkoutAttemptBinding as FixtureRecord;
    assert.deepEqual(binding, { schemaVersion: 1, contractVersion: 1, requestFamily: "STORE_CONTAINING_PROTOCOL_V1", canonicalAttemptKey: raw.idempotencyKey,
      ownerBinding: stable(identity, raw.idempotencyKey), selectedFactsFingerprint: createProtocolV1SelectedFactsFingerprint({
        canonicalAttemptKey: raw.idempotencyKey, ownerBinding: stable(identity, raw.idempotencyKey), items: raw.items, orderContext: raw.orderContext }).fingerprint });
    assert.equal(original.intent.requestHash, binding.selectedFactsFingerprint);
    assert.equal(original.intent.order.idempotencyRequestHash, original.intent.requestHash);
    for (const field of ["createdAt", "lineUserId", "lineDisplayName"]) assert.ok(!Object.hasOwn(binding.ownerBinding, field));
  });
  for (const old of [false, true]) {
    for (const identity of [member, guest]) await run((old ? "old" : "new") + " owner replacement rejected without side effects " + (identity.member ? "member" : "guest"), async () => {
      const f = await fixture(), raw = request(); await prepared(f, raw, identity, old);
      await rejectUnchanged(f, raw, identity.member ? { member: { id: "member-b" } } : replacementGuest, "INVALID_IDENTITY");
      await rejectUnchanged(f, raw, identity.member ? guest : member, "INVALID_IDENTITY");
    });
    for (const identity of [member, guest]) if (old) await run("old historical " + (identity.member ? "member" : "guest") + " mutable current snapshot matches without rewrite", async () => {
      const original = await finalized(await fixture(), request("home_delivery", "mixed", "atm_transfer"), identity, true);
      assert.ok(!Object.hasOwn(original.intent.order, "checkoutAttemptBinding"));
    });
    const changes = [
      ["quantity", (r: InternalRequest) => { r.items[0].quantity++; }],
      ["product", (r: InternalRequest) => { r.items[0].productId = "another-product"; }],
      ["Coffee options", (r: InternalRequest) => { r.items[0].coffeeOptions.roastLevel = "中焙"; }],
      ["customer", (r: InternalRequest) => { r.orderContext.customer.note = "Changed"; }],
      ["studio date", (r: InternalRequest) => { r.orderContext.studioPickup.preferredDate = "2026-10-21"; }],
      ["orderMode", (r: InternalRequest) => { r.orderContext = request("711_cod").orderContext; }],
    ] as const;
    for (const [label, change] of changes) await run((old ? "old" : "new") + " material selection conflict " + label, async () => {
      const f = await fixture(), raw = request("studio_pickup", "mixed"); await prepared(f, raw, member, old);
      const changed = structuredClone(raw); change(changed);
      await rejectUnchanged(f, changed, member, "IDEMPOTENCY_CONFLICT");
    });
    for (const [mode, label] of [["711_cod", "store"], ["home_delivery", "address"], ["home_delivery", "payment"]] as const) await run((old ? "old" : "new") + " material selection conflict " + label, async () => {
      const f = await fixture(), raw = request(mode); await prepared(f, raw, guest, old);
      const changed = structuredClone(raw);
      if (label === "store") changed.orderContext.store.id = "NEW123";
      if (label === "address") changed.orderContext.deliveryAddress.addressLine = "New address";
      if (label === "payment") changed.orderContext.paymentMethod = "atm_transfer";
      await rejectUnchanged(f, changed, guest, "IDEMPOTENCY_CONFLICT");
    });
  }
  const corruptions = [
    ["schema", (b: FixtureRecord, _i: TransactionIntent) => { b.schemaVersion = 2; }],
    ["contract", (b: FixtureRecord, _i: TransactionIntent) => { b.contractVersion = 2; }],
    ["family", (b: FixtureRecord, _i: TransactionIntent) => { b.requestFamily = "LEGACY_COFFEE"; }],
    ["key", (b: FixtureRecord, _i: TransactionIntent) => { b.canonicalAttemptKey = "bad"; }],
    ["uppercase stored key", (b: FixtureRecord, _i: TransactionIntent) => { b.canonicalAttemptKey = b.canonicalAttemptKey.toUpperCase(); }],
    ["owner", (b: FixtureRecord, _i: TransactionIntent) => { b.ownerBinding = {}; }],
    ["guest inner/outer key", (b: FixtureRecord, _i: TransactionIntent) => { b.ownerBinding.canonicalAttemptKey = randomUUID(); }],
    ["fingerprint", (b: FixtureRecord, _i: TransactionIntent) => { b.selectedFactsFingerprint = "bad"; }],
    ["binding/intent hash", (b: FixtureRecord, _i: TransactionIntent) => { b.selectedFactsFingerprint = "a".repeat(64); }],
    ["order/intent hash", (_b: FixtureRecord, i: TransactionIntent) => { i.order.idempotencyRequestHash = "b".repeat(64); }],
    ["null claims new format", (_b: FixtureRecord, i: TransactionIntent) => { i.order.checkoutAttemptBinding = null; }],
  ] as const;
  for (const [label, change] of corruptions) await run("malformed new durable evidence requires review " + label, async () => {
    const f = await fixture(), raw = request(), p = await prepared(f, raw, guest), intent = structuredClone(p.intent);
    change(intent.order.checkoutAttemptBinding as FixtureRecord, intent);
    const record = { schemaVersion: 1, sequence: 0, previousHash: null, event: { type: "PREPARED", intent } };
    await fs.writeFile(p.firstFile, JSON.stringify({ ...record, hash: inventoryHash(record) }));
    await rejectUnchanged(f, raw, guest, "REVIEW_REQUIRED");
  });
  await run("old ownerless F3 PREPARED cannot be seized through bound path", async () => {
    const f = await fixture(), raw = request(); await prepared(f, raw);
    await rejectUnchanged(f, raw, member, "REVIEW_REQUIRED");
  });
  for (const old of [false, true]) await run((old ? "old" : "new") + " durable recovery precedes disabled Store/current price/publishing/rules/ATM", async () => {
    const f = await fixture(), raw = request("home_delivery", "mixed", "atm_transfer");
    let p;
    if (old) { p = await prepared(f, raw, guest, true); }
    const pending = await service({ writeFinalOrder: async () => { throw new Error("Isolated finalization interruption"); } }).create(raw, guest);
    assert.equal(pending.state, "PENDING");
    const journal = createCommerceTransactionJournal(path.join(f.root, "orders"), pending.transactionId);
    const event = (await journal.read())[0].event;
    if (event.type !== "PREPARED") throw new Error("Missing intent");
    const firstFile = path.join(journal.directory, "00000000.json"), beforeBytes = await fs.readFile(firstFile);
    const catalog = await f.repository.read(), product = catalog.products[0];
    await f.repository.updateProduct(product.id, product.revision, { price: 999, published: false });
    const coffee = JSON.parse(await fs.readFile(f.website, "utf8")); coffee.menu.products[0].skus[0].price = 999;
    await fs.writeFile(f.website, JSON.stringify(coffee));
    await fs.writeFile(f.rulesFile, "{INVALID CURRENT RULES");
    process.env.STORE_COMMERCE_ENABLED = "false";
    try {
      const recovered = await service().create(raw, changedGuest);
      assert.equal(recovered.state, "FINALIZED"); assert.equal(recovered.orderNumber, pending.orderNumber); assert.ok(recovered.order);
      for (const field of ["items", "subtotal", "shipping", "total", "atmTransferSnapshot", "guestOrderAccess", "checkoutRulesVersion"]) assert.deepEqual(recovered.order[field], event.intent.order[field]);
      assert.deepEqual(await fs.readFile(firstFile), beforeBytes);
      const fresh = { ...raw, idempotencyKey: randomUUID() };
      await assert.rejects(async () => service().create(fresh, guest));
      assert.equal((await createCommerceTransactionJournal(path.join(f.root, "orders"), commerceOrderTransactionId(fresh.idempotencyKey)).read()).length, 0);
    } finally { process.env.STORE_COMMERCE_ENABLED = "true"; }
    if (p) assert.deepEqual(await fs.readFile(p.firstFile), p.bytes);
  });
  await run("new NONE request keeps Store capability validation before PREPARED", async () => {
    const f = await fixture(), raw = request("711_cod");
    process.env.STORE_COMMERCE_ENABLED = "false";
    try { await rejectUnchanged(f, raw, guest, "STORE_COMMERCE_DISABLED"); }
    finally { process.env.STORE_COMMERCE_ENABLED = "true"; }
  });
  await run("new NONE request keeps ATM configuration validation", async () => {
    const f = await fixture(), raw = request("home_delivery", "store", "atm_transfer");
    const rules = JSON.parse(await fs.readFile(f.rulesFile, "utf8")); rules.versions.at(-1).rules.payment.atmTransfer = structuredClone(DEFAULT_MEMBERSHIP_RULES.payment.atmTransfer);
    await fs.writeFile(f.rulesFile, JSON.stringify(rules));
    await rejectUnchanged(f, raw, member, "ATM_NOT_CONFIGURED");
  });
  await run("new locked snapshot uses re-resolved price rather than pre-lock price", async () => {
    const f = await fixture(), raw = request();
    const result = await service({ afterResolve: async () => {
      const current = await f.repository.read(), product = current.products[0];
      await f.repository.updateProduct(product.id, product.revision, { price: 75 });
    } }).create(raw, member);
    assert.equal(result.state, "FINALIZED"); assert.equal(result.order?.subtotal, 150);
  });
  for (const [domain, identity] of [["coffee", member], ["store", undefined], ["mixed", undefined]] as const) await run(domain + " unbound path retains exact historical hash and no binding", async () => {
    const f = await fixture(), raw = request("studio_pickup", domain), input = normalized(raw);
    const expected = createIdempotencyRequestHash({ items: input.items, orderContext: input.orderContext, ...(identity ? { ownership: resolveTrustedCheckoutOwnership(identity) } : {}) });
    const result = await service().create(raw, identity);
    assert.equal(result.state, "FINALIZED"); assert.ok(result.order); assert.equal(result.order.idempotencyRequestHash, expected);
    assert.ok(!Object.hasOwn(result.order, "checkoutAttemptBinding"));
  });
  await run("B3B protected non-successor-owned sources unchanged; no runtime import cycle", async () => {
    const { execFileSync } = await import("node:child_process");
    for (const file of ["lib/commerceTransactionJournal.ts", "lib/commerceTransactionTypes.ts",
      "lib/commerceLocks.ts", "lib/commerceLockProtocol.ts", "lib/commerceCheckoutAdmission.ts"]) {
      const baseline = execFileSync("git", ["show", "HEAD:" + file], { encoding: "utf8", windowsHide: true });
      assert.equal((await fs.readFile(file, "utf8")).replaceAll("\r\n", "\n"), baseline.replaceAll("\r\n", "\n"), file);
    }
    assert.deepEqual(await fs.readFile("app/checkout/page.tsx"), checkoutSourceBefore, "app/checkout/page.tsx");
    const binding = await fs.readFile("lib/checkoutAttemptBinding.ts", "utf8");
    assert.ok(!binding.includes('from "./commerceOrderTransaction"'));
    const neutral = await fs.readFile("lib/commerceOrderTransactionIdentity.ts", "utf8");
    assert.ok(!/fs|storagePaths|Journal|Locks|process\.env|CommerceOrderTransactionError/.test(neutral));
  });
  await run("no reward/credit/subscription/fulfillment/notification state or network effects", async () => {
    for (const name of await fs.readdir(suite)) {
      const root = path.join(suite, name);
      const files = await snapshot(root);
      assert.ok(!files.some(([file]) => /commerce-state|fulfillment|notifications|binding\.json|attempt-registry/.test(file)));
    }
    assert.equal(networkCalls, 0);
  });
  console.log("J.6F.5C2B3B PASS " + checks + "/" + checks + "; isolated internal V1 only; network=" + networkCalls);
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  assert.equal(path.dirname(await fs.realpath(suite)).toLowerCase(), tempParent.toLowerCase());
  await fs.rm(suite, { recursive: true, force: true });
}
