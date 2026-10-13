import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { admitCommerceCheckout, type TrustedCheckoutIdentity } from "../lib/commerceCheckoutAdmission";
import { createCommerceOrderTransactionService, CommerceOrderTransactionError } from "../lib/commerceOrderTransaction";
import { validateCommerceOrderInput, normalizeCommerceCheckoutContext } from "../lib/commerceOrderTypes";
import { createStoreRepository } from "../lib/storeRepository";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules, readMembershipRulesStore } from "../lib/membershipBusinessRules";
import { readMembershipCommerceState } from "../lib/membershipCommerce";
import { readFulfillmentStore } from "../lib/fulfillment";
import { readInventoryReceipts, inventoryHash } from "../lib/inventoryReceipts";
import { createCommerceTransactionJournal } from "../lib/commerceTransactionJournal";
import { cancelOrderCanonically } from "../lib/orderCancellation";

const timestamp = "2026-10-12T06:37:00.000Z", now = () => new Date(timestamp);
const suite = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f5b-"));
const tempParent = await fs.realpath(os.tmpdir());
assert.equal(path.dirname(await fs.realpath(suite)).toLowerCase(), tempParent.toLowerCase());
const savedEnv = Object.fromEntries(["KD_DATA_DIR", "RAILWAY_VOLUME_MOUNT_PATH", "STORE_COMMERCE_ENABLED", "AUTH_SESSION_SECRET", "MEMBER_IDENTITY_SECRET"].map(key => [key, process.env[key]]));
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.STORE_COMMERCE_ENABLED = "true";
process.env.AUTH_SESSION_SECRET = "isolated-j6f5b-test-secret-more-than-32-characters";
process.env.MEMBER_IDENTITY_SECRET = process.env.AUTH_SESSION_SECRET;
const originalFetch = globalThis.fetch;
let networkCalls = 0, checks = 0, fixtureCount = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("External effects forbidden"); };
type Mode = "studio_pickup" | "711_cod" | "home_delivery";
type Domain = "coffee" | "store" | "mixed";
type Input = Record<string, unknown> & { items: Record<string, unknown>[] };
type Stored = Record<string, any>;
const member: TrustedCheckoutIdentity = { member: { id: "trusted-member", displayName: "Fixture member", lineUserId: "fixture-line" } };
const guest: TrustedCheckoutIdentity = { member: null, guestOrderAccess: {
  tokenHash: createHash("sha256").update("isolated-existing-guest-access").digest("base64url"), createdAt: timestamp } };
const address = { recipientName: "Fixture recipient", phone: "0912345678", postalCode: "100",
  city: "臺北市", district: "中正區", addressLine: "Fixture address 1" };
const store = { id: "ABC123", name: "Fixture store", address: "Fixture store address" };
const atm = { bankName: "Fixture Bank", bankCode: "999", branchName: "Fixture Branch", accountName: "Fixture Studio",
  accountNumber: "1234567890", instructions: "Fixture transfer instructions", bankbookImageUrl: null, showBankbookImageAtCheckout: false };
type Fixture = { root: string; coffeePrice: number; storePrice: number; quantity: number; rulesFile: string; websiteFile: string; stateFile: string; fulfillmentFile: string };
async function run(label: string, operation: () => unknown | Promise<unknown>) {
  try { await operation(); console.log("PASS " + (++checks) + " " + label); }
  catch (error) { console.error("FAIL case " + (checks + 1) + " " + label); throw error; }
}
async function snapshot(root: string): Promise<[string, string][]> {
  const entries: [string, string][] = [];
  async function visit(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else { assert.ok(entry.isFile()); entries.push([path.relative(root, file), createHash("sha256").update(await fs.readFile(file)).digest("hex")]); }
    }
  }
  await visit(root);
  return entries.sort((a, b) => a[0].localeCompare(b[0]));
}
async function fixture(options: { coffeePrice?: number; storePrice?: number; quantity?: number; campaign?: boolean; shipping?: number; cod?: number; configuredAtm?: boolean } = {}): Promise<Fixture> {
  const root = path.join(suite, "fixture-" + (++fixtureCount));
  await fs.mkdir(path.join(root, "store"), { recursive: true });
  await fs.mkdir(path.join(root, "orders"), { recursive: true });
  process.env.KD_DATA_DIR = root;
  const coffeePrice = options.coffeePrice ?? 500, storePrice = options.storePrice ?? 50, quantity = options.quantity ?? 2;
  const websiteFile = path.join(root, "store", "website-data.json");
  await fs.writeFile(websiteFile, JSON.stringify({ version: 1, menu: { products: [{
    id: "coffee-product", slug: "coffee-live", name: "Coffee", active: true, purchasable: true, purchase: [],
    skus: [{ id: "coffee-sku", label: "半磅咖啡豆", detail: "227g", kind: "beans", enabled: true,
      price: coffeePrice, stock: 20, pvEnabled: true, pvValue: 30 }] }] } }));
  const repo = createStoreRepository({ dataRoot: root, now });
  await repo.createSection({ id: "section", slug: "equipment", name: "Equipment", published: true });
  await repo.createProduct({ id: "store-product", sectionId: "section", slug: "store-live", name: "Store",
    sku: "DISPLAY", price: storePrice, inventory: 20, pvValue: 999, active: true, published: true });
  const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES);
  rules.shipping.homeDeliveryShippingFee = options.shipping ?? 100;
  rules.shipping.homeDeliveryCodFee = options.cod ?? 50;
  rules.membership.openingYearFreeShipping = { enabled: options.campaign ?? true,
    startDate: "2026-01-01", endDate: "2026-12-31", shippingMethods: ["home_delivery"] };
  rules.payment.atmTransfer = options.configuredAtm === false ? structuredClone(DEFAULT_MEMBERSHIP_RULES.payment.atmTransfer) : structuredClone(atm);
  const rulesFile = path.join(root, "membership-commerce", "business-rules.json");
  await saveMembershipBusinessRules({ expectedRevision: 0, rules, effectiveAt: timestamp, now: now() }, rulesFile);
  const stateFile = path.join(root, "membership-commerce", "commerce-state.json");
  await fs.writeFile(stateFile, JSON.stringify(await readMembershipCommerceState(stateFile)));
  const fulfillmentFile = path.join(root, "fulfillment", "state.json");
  await fs.mkdir(path.dirname(fulfillmentFile), { recursive: true });
  await fs.writeFile(fulfillmentFile, JSON.stringify(await readFulfillmentStore(fulfillmentFile)));
  return { root, coffeePrice, storePrice, quantity, rulesFile, websiteFile, stateFile, fulfillmentFile };
}
function input(f: Fixture, domain: Domain = "mixed", mode: Mode = "711_cod", method = "cash_on_delivery"): Input {
  const coffee = { domain: "coffee", productId: "coffee-product", variantId: "coffee-sku", quantity: f.quantity,
    coffeeOptions: { preparation: "咖啡豆", customRoast: false }, quotedUnitPrice: f.coffeePrice };
  const merchandise = { domain: "store", productId: "store-product", variantId: "default", quantity: f.quantity, quotedUnitPrice: f.storePrice };
  return { idempotencyKey: randomUUID(), items: domain === "coffee" ? [coffee] : domain === "store" ? [merchandise] : [coffee, merchandise],
    orderMode: mode, customer: { name: "Fixture", phone: "0912345678", email: "", note: "" }, requestedCredit: 0, creditApplied: 0,
    ...(mode === "711_cod" ? { store: structuredClone(store), payment: "cash_on_delivery" }
      : mode === "home_delivery" ? { deliveryAddress: structuredClone(address), paymentMethod: method }
      : { studioPickup: { preferredDate: "2026-10-20" }, payment: "pickup_confirmation" }) };
}
async function admission(f: Fixture, raw: Input, identity = guest) {
  process.env.KD_DATA_DIR = f.root;
  const before = await snapshot(f.root), original = structuredClone(raw), originalIdentity = structuredClone(identity);
  const result = await admitCommerceCheckout(raw, identity, now());
  assert.deepEqual(await snapshot(f.root), before, "Admission-only full storage/order/ledger/inventory unchanged");
  assert.deepEqual(raw, original); assert.deepEqual(identity, originalIdentity); assert.equal(networkCalls, 0);
  return result;
}
async function candidate(f: Fixture, raw: Input, identity = guest) {
  const result = await admission(f, raw, identity);
  assert.ok(result.kind === "PROTOCOL_V1_ELIGIBLE", JSON.stringify(result));
  return result.candidate;
}
async function stocks(f: Fixture) {
  const coffee = JSON.parse(await fs.readFile(f.websiteFile, "utf8"));
  const catalog = await createStoreRepository({ dataRoot: f.root }).read();
  return [coffee.menu.products[0].skus[0].stock, catalog.products[0].inventory];
}
async function receipts(f: Fixture) {
  const coffee = JSON.parse(await fs.readFile(f.websiteFile, "utf8"));
  return { coffee: readInventoryReceipts(coffee), store: readInventoryReceipts(await createStoreRepository({ dataRoot: f.root }).read()) };
}
async function protectedBusiness(f: Fixture) {
  return Promise.all([f.stateFile, f.fulfillmentFile].map(file => fs.readFile(file, "utf8")));
}
async function order(f: Fixture, number: string): Promise<Stored> {
  return JSON.parse(await fs.readFile(path.join(f.root, "orders", number + ".json"), "utf8"));
}
async function create(f: Fixture, raw: Input, identity = guest,
  options: Parameters<typeof createCommerceOrderTransactionService>[0] = {}) {
  const admitted = await candidate(f, raw, identity), before = await protectedBusiness(f);
  const result = await createCommerceOrderTransactionService({ now, ...options }).create(admitted.request, identity);
  assert.deepEqual(await protectedBusiness(f), before, "Creation must not write credit/reward/subscription/fulfillment");
  assert.equal(networkCalls, 0);
  return { admitted, result };
}
async function success(domain: Domain, mode: Mode, method: string, identity: TrustedCheckoutIdentity,
  options: Parameters<typeof fixture>[0], expectedShipping: number, expectedCod: number) {
  const f = await fixture(options), raw = input(f, domain, mode, method);
  const { admitted, result } = await create(f, raw, identity);
  assert.equal(result.state, "FINALIZED"); assert.ok(result.order);
  const stored = await order(f, result.orderNumber), subtotal = raw.items.reduce((sum, line) => sum + Number(line.quotedUnitPrice) * Number(line.quantity), 0);
  assert.equal(stored.orderMode, mode);
  assert.equal(stored.status, mode === "studio_pickup" ? "waiting_studio_pickup_confirmation" : mode === "711_cod" ? "waiting_merchant_create_cod_shipment" : "new_order");
  assert.equal(stored.subtotal, subtotal); assert.equal(stored.shipping, expectedShipping); assert.equal(stored.codServiceFee, expectedCod);
  assert.equal(stored.totalBeforeCredit, subtotal + expectedShipping + expectedCod); assert.equal(stored.total, stored.totalBeforeCredit);
  assert.equal(stored.creditApplied, 0); assert.ok(!Object.hasOwn(stored, "subscriptionIntent"));
  assert.equal(stored.checkoutRulesVersion, 2); assert.equal(stored.checkoutBusinessDate, "2026-10-12");
  assert.deepEqual(stored.lineNotification, { sent: false, status: "pending" });
  if (identity.member) { assert.equal(stored.member.memberId, identity.member.id); assert.ok(!stored.guestOrderAccess); }
  else { assert.equal(stored.member, null); assert.deepEqual(stored.guestOrderAccess, identity.guestOrderAccess); }
  if (mode === "711_cod") { assert.deepEqual(stored.store, store); assert.equal(stored.deliveryAddress, null); assert.equal(stored.payment, "cash_on_delivery"); }
  if (mode === "home_delivery") {
    assert.deepEqual(stored.deliveryAddress, address); assert.ok(!Object.hasOwn(stored, "store"));
    assert.equal(stored.payment, method); assert.deepEqual(stored.paymentDetails, { method, status: "pending", paidAt: null });
    if (method === "atm_transfer") assert.deepEqual(stored.atmTransferSnapshot, {
      bankName: atm.bankName, bankCode: atm.bankCode, branchName: atm.branchName, accountName: atm.accountName,
      accountNumber: atm.accountNumber, instructions: atm.instructions, bankbookImageUrl: null, showBankbookImage: false });
    else assert.equal(stored.atmTransferSnapshot, null);
  }
  assert.equal(stored.inventoryTransaction.protocolVersion, 1);
  assert.equal(stored.inventoryTransaction.state, "inventory_committed");
  assert.equal(stored.inventoryTransaction.participantReceipts.length, domain === "mixed" ? 2 : 1);
  const lines = stored.items as Stored[];
  for (const line of lines) {
    assert.ok(line.productId && line.variantId);
    for (const field of ["unitPrice", "lineTotal", "quantity"]) assert.ok(Number.isSafeInteger(line[field]));
    if (line.domain === "store") { assert.equal(line.variantId, "default"); for (const key of ["coffeeOptions", "basePV", "effectivePV", "customRoast", "optionId"]) assert.ok(!Object.hasOwn(line, key)); }
  }
  assert.deepEqual(await stocks(f), [domain === "store" ? 20 : 20 - f.quantity, domain === "coffee" ? 20 : 20 - f.quantity]);
  const firstReceipts = await receipts(f);
  for (const current of ["coffee", "store"] as const) assert.equal(Object.values(firstReceipts[current]).length, domain === "mixed" || domain === current ? 1 : 0);
  const beforeReplay = await snapshot(f.root);
  const replay = await createCommerceOrderTransactionService({ now }).create(admitted.request, identity);
  assert.equal(replay.state, "FINALIZED"); assert.equal(replay.orderNumber, result.orderNumber);
  assert.deepEqual(await snapshot(f.root), beforeReplay, "Replay cannot rewrite financial facts or double-APPLY");
  assert.equal((await fs.readdir(path.join(f.root, "orders"))).filter(name => /^KD.*\.json$/.test(name)).length, 1);
  assert.equal(networkCalls, 0);
}
async function reject(label: string, mutate: (raw: Input) => void, mode: Mode = "711_cod", domain: Domain = "mixed", reason = "INVALID_REQUEST") {
  await run(label, async () => {
    const f = await fixture(), raw = input(f, domain, mode);
    mutate(raw);
    const result = await admission(f, raw);
    assert.deepEqual(result.kind === "REJECTED" ? { kind: result.kind, reason: result.reason } : result, { kind: "REJECTED", reason });
  });
}
async function changeRules(f: Fixture, change: (rules: typeof DEFAULT_MEMBERSHIP_RULES) => void) {
  const current = await readMembershipRulesStore(f.rulesFile), rules = structuredClone(current.versions.at(-1)!.rules);
  change(rules);
  await saveMembershipBusinessRules({ expectedRevision: current.revision, rules, effectiveAt: timestamp, now: now() }, f.rulesFile);
}
try {
  for (const [domain, price, shipping] of [["store", 50, 60], ["store", 750, 0], ["store", 800, 0], ["mixed", 50, 60], ["mixed", 250, 0], ["mixed", 300, 0]] as const)
    await run(domain + " 711 server threshold / one order / APPLY once price=" + price, () => success(domain, "711_cod", "cash_on_delivery", guest, { storePrice: price }, shipping, 0));
  for (const domain of ["store", "mixed"] as const) {
    await run(domain + " home COD guest canonical shipping/fee", () => success(domain, "home_delivery", "cash_on_delivery", guest, {}, 100, 50));
    await run(domain + " home COD member whole-order campaign", () => success(domain, "home_delivery", "cash_on_delivery", member, {}, 0, 50));
    await run(domain + " home ATM guest server bank snapshot", () => success(domain, "home_delivery", "atm_transfer", guest, {}, 100, 0));
    await run(domain + " home ATM member campaign snapshot", () => success(domain, "home_delivery", "atm_transfer", member, {}, 0, 0));
  }
  await run("member outside existing campaign pays shipping", () => success("mixed", "home_delivery", "cash_on_delivery", member, { campaign: false }, 100, 50));
  await run("zero shipping and zero COD fee valid", () => success("store", "home_delivery", "cash_on_delivery", guest, { shipping: 0, cod: 0 }, 0, 0));
  await run("studio candidate and owner-compatible DTO preserved", () => success("mixed", "studio_pickup", "pickup_confirmation", guest, {}, 0, 0));
  for (const mode of ["711_cod", "home_delivery"] as const) await run("Coffee " + mode + " remains legacy despite internal coverage", async () => {
    const f = await fixture(), result = await admission(f, input(f, "coffee", mode));
    assert.deepEqual(result, { kind: "LEGACY_COFFEE_REQUIRED", reason: "COFFEE_DELIVERY_MODE" });
  });
  for (const domain of ["store", "mixed"] as const) for (const mode of ["711_cod", "home_delivery"] as const) {
    for (const field of ["requestedCredit", "creditApplied"]) await reject(domain + " " + mode + " positive " + field, raw => { raw[field] = 1; }, mode, domain, "STORE_CREDIT_NOT_SUPPORTED");
    await reject(domain + " " + mode + " subscription fails closed", raw => { raw.subscriptionIntent = { consent: true, intervalDays: 30 }; }, mode, domain, "STORE_SUBSCRIPTION_NOT_SUPPORTED");
    await run(domain + " " + mode + " capability disabled", async () => {
      const f = await fixture(), raw = input(f, domain, mode);
      process.env.STORE_COMMERCE_ENABLED = "false";
      try { const result = await admission(f, raw); assert.ok(result.kind === "REJECTED"); assert.equal(result.reason, "STORE_COMMERCE_DISABLED"); }
      finally { process.env.STORE_COMMERCE_ENABLED = "true"; }
    });
  }
  await reject("invalid store id", raw => { raw.store = { ...store, id: "!" }; }, "711_cod", "mixed", "INVALID_STORE");
  await reject("missing store name", raw => { raw.store = { ...store, name: "" }; }, "711_cod", "mixed", "INVALID_STORE");
  await reject("missing store address", raw => { raw.store = { ...store, address: "" }; }, "711_cod", "mixed", "INVALID_STORE");
  await reject("store extra fields not accepted", raw => { raw.store = { ...store, shipping: 0 }; }, "711_cod", "mixed", "INVALID_STORE");
  await reject("711 ATM incompatible", raw => { raw.payment = "atm_transfer"; }, "711_cod", "mixed", "PAYMENT_NOT_SUPPORTED");
  await reject("711 home address incompatible", raw => { raw.deliveryAddress = address; });
  await reject("home store incompatible", raw => { raw.store = store; }, "home_delivery");
  await reject("home studio selection incompatible", raw => { raw.studioPickup = { preferredDate: "2026-10-20" }; }, "home_delivery");
  await reject("invalid home address uses canonical validator", raw => { raw.deliveryAddress = { ...address, postalCode: "bad" }; }, "home_delivery", "mixed", "INVALID_ADDRESS");
  await reject("extra home address fields rejected", raw => { raw.deliveryAddress = { ...address, member: true }; }, "home_delivery", "mixed", "INVALID_ADDRESS");
  for (const method of ["credit_card", "pickup_confirmation", "unknown"]) await reject("home unsupported payment " + method, raw => { raw.paymentMethod = method; }, "home_delivery", "mixed", "PAYMENT_NOT_SUPPORTED");
  for (const field of ["shipping", "codServiceFee", "total", "totalBeforeCredit", "atmTransferSnapshot", "rulesVersion", "member", "memberId", "guestOrderAccess"])
    await reject("client cannot assert " + field, raw => { raw[field] = field === "shipping" ? 0 : { forged: true }; }, "home_delivery");
  await run("exclusive trusted identity required", async () => {
    const f = await fixture(), raw = input(f);
    for (const identity of [{}, { member: member.member, guestOrderAccess: guest.guestOrderAccess }]) {
      const result = await admission(f, raw, identity);
      assert.ok(result.kind === "REJECTED"); assert.equal(result.reason, "INVALID_IDENTITY");
    }
  });
  await reject("unknown explicit domain", raw => { raw.items[1].domain = "cookie"; }, "711_cod", "mixed", "UNKNOWN_DOMAIN");
  await reject("stale quote rejects full mixed cart", raw => { raw.items[1].quotedUnitPrice = 49; }, "home_delivery", "mixed", "PRICE_CHANGED");
  await reject("fractional quote cannot be rounded", raw => { raw.items[1].quotedUnitPrice = 50.5; }, "home_delivery", "mixed", "INVALID_MONEY");
  for (const field of ["homeDeliveryShippingFee", "homeDeliveryCodFee"] as const) await run("fractional " + field + " fails closed before any order/APPLY", async () => {
    const f = await fixture(), rules = JSON.parse(await fs.readFile(f.rulesFile, "utf8"));
    rules.versions.at(-1).rules.shipping[field] = 0.5;
    await fs.writeFile(f.rulesFile, JSON.stringify(rules));
    const result = await admission(f, input(f, "mixed", "home_delivery"));
    assert.ok(result.kind === "REJECTED"); assert.equal(result.reason, "SOURCE_UNAVAILABLE");
    assert.equal((await fs.readdir(path.join(f.root, "orders"))).length, 0);
  });
  await run("unsafe integer financial addition rejected", async () => {
    const f = await fixture({ storePrice: Number.MAX_SAFE_INTEGER, quantity: 1 });
    const result = await admission(f, input(f, "store", "home_delivery"));
    assert.ok(result.kind === "REJECTED"); assert.equal(result.reason, "INVALID_MONEY");
  });
  await run("ATM missing config rejects admission and direct transaction before PREPARED/APPLY", async () => {
    const f = await fixture({ configuredAtm: false }), raw = input(f, "mixed", "home_delivery", "atm_transfer");
    const result = await admission(f, raw); assert.ok(result.kind === "REJECTED"); assert.equal(result.reason, "ATM_NOT_CONFIGURED");
    const before = await snapshot(f.root);
    const selections = validateCommerceOrderInput(raw.items.map(({ quotedUnitPrice: _q, ...line }) => line));
    await assert.rejects(async () => createCommerceOrderTransactionService({ now }).create({
      idempotencyKey: raw.idempotencyKey, items: selections,
      orderContext: normalizeCommerceCheckoutContext({ orderMode: "home_delivery", customer: raw.customer, deliveryAddress: address, paymentMethod: "atm_transfer", creditApplied: 0 }) }, guest),
      error => error instanceof CommerceOrderTransactionError && error.code === "ATM_NOT_CONFIGURED");
    assert.deepEqual(await snapshot(f.root), before);
  });
  await run("transaction rejects client financial authority and missing trusted ownership", async () => {
    const f = await fixture(), admitted = await candidate(f, input(f)), before = await snapshot(f.root);
    for (const forged of [{ ...admitted.request, shipping: 0 }, { ...admitted.request, orderContext: { ...admitted.request.orderContext, shipping: 0 } }])
      await assert.rejects(async () => createCommerceOrderTransactionService({ now }).create(forged, guest),
        error => error instanceof CommerceOrderTransactionError && error.code === "INVALID_REQUEST");
    await assert.rejects(async () => createCommerceOrderTransactionService({ now }).create(admitted.request),
      error => error instanceof CommerceOrderTransactionError && error.code === "INVALID_IDENTITY");
    assert.deepEqual(await snapshot(f.root), before);
  });
  for (const mode of ["711_cod", "home_delivery"] as const) await run("same key changed " + mode + " selection conflicts without mutations", async () => {
    const f = await fixture(), raw = input(f, "mixed", mode), { admitted, result } = await create(f, raw);
    assert.equal(result.state, "FINALIZED");
    const before = await snapshot(f.root);
    const variants = mode === "711_cod"
      ? [{ ...admitted.request.orderContext, store: { ...store, id: "NEW123" } }]
      : [{ ...admitted.request.orderContext, paymentMethod: "atm_transfer" }, { ...admitted.request.orderContext, deliveryAddress: { ...address, addressLine: "Different address" } }];
    for (const context of variants) await assert.rejects(async () => createCommerceOrderTransactionService({ now }).create({ ...admitted.request, orderContext: context }, guest),
      error => error instanceof CommerceOrderTransactionError && error.code === "IDEMPOTENCY_CONFLICT");
    assert.deepEqual(await snapshot(f.root), before);
  });
  await run("before PREPARED current server rules used", async () => {
    const f = await fixture(), raw = input(f, "mixed", "home_delivery");
    const admitted = await candidate(f, raw); assert.equal(admitted.financialSnapshot.shipping, 100);
    await changeRules(f, rules => { rules.shipping.homeDeliveryShippingFee = 200; rules.shipping.homeDeliveryCodFee = 25; });
    const before = await protectedBusiness(f), result = await createCommerceOrderTransactionService({ now }).create(admitted.request, guest);
    assert.equal(result.state, "FINALIZED"); const stored = await order(f, result.orderNumber);
    assert.equal(stored.shipping, 200); assert.equal(stored.codServiceFee, 25); assert.equal(stored.total, 1325); assert.equal(stored.checkoutRulesVersion, 3);
    assert.deepEqual(await protectedBusiness(f), before);
  });
  for (const mode of ["711_cod", "home_delivery"] as const) for (const method of mode === "711_cod" ? ["cash_on_delivery"] : ["cash_on_delivery", "atm_transfer"]) await run(mode + " " + method + " post-PREPARED rules/ATM/capability changes preserve durable snapshot", async () => {
    const f = await fixture(), raw = input(f, "mixed", mode, method), admitted = await candidate(f, raw);
    const pending = await createCommerceOrderTransactionService({ now, writeFinalOrder: async () => { throw new Error("Isolated finalization interruption"); } }).create(admitted.request, guest);
    assert.equal(pending.state, "PENDING");
    const original = await order(f, pending.orderNumber), firstReceipts = inventoryHash(await receipts(f));
    const journal = await createCommerceTransactionJournal(path.join(f.root, "orders"), pending.transactionId).read();
    assert.equal(journal[0].event.type, "PREPARED");
    await changeRules(f, rules => { rules.shipping.homeDeliveryShippingFee = 333; rules.shipping.homeDeliveryCodFee = 25;
      rules.membership.openingYearFreeShipping.enabled = false; rules.payment.atmTransfer.bankName = "Changed Bank"; rules.payment.atmTransfer.accountNumber = "999999999"; });
    const before = await protectedBusiness(f);
    process.env.STORE_COMMERCE_ENABLED = "false";
    let recovered;
    try { recovered = await createCommerceOrderTransactionService({ now }).create(admitted.request, guest); }
    finally { process.env.STORE_COMMERCE_ENABLED = "true"; }
    assert.equal(recovered.state, "FINALIZED"); assert.equal(recovered.orderNumber, pending.orderNumber);
    const final = await order(f, pending.orderNumber);
    for (const key of ["subtotal", "shipping", "codServiceFee", "totalBeforeCredit", "total", "checkoutRulesVersion", "payment", "paymentDetails", "atmTransferSnapshot", "member", "guestOrderAccess"]) assert.deepEqual(final[key], original[key], key);
    assert.equal(inventoryHash(await receipts(f)), firstReceipts); assert.deepEqual(await stocks(f), [18, 18]);
    assert.deepEqual(await protectedBusiness(f), before);
  });
  await run("mixed 711 price race re-resolves under locks and recomputes whole-order shipping", async () => {
    const f = await fixture(), raw = input(f), admitted = await candidate(f, raw);
    assert.equal(admitted.merchandiseSubtotal, 1100); assert.equal(admitted.financialSnapshot.shipping, 60);
    const result = await createCommerceOrderTransactionService({ now, afterResolve: async () => {
      const document = JSON.parse(await fs.readFile(f.websiteFile, "utf8"));
      document.menu.products[0].skus[0].price = 750; await fs.writeFile(f.websiteFile, JSON.stringify(document));
    } }).create(admitted.request, guest);
    assert.equal(result.state, "FINALIZED"); const stored = await order(f, result.orderNumber);
    assert.equal(stored.subtotal, 1600); assert.equal(stored.shipping, 0); assert.equal(stored.total, 1600);
    assert.equal(stored.items.find((line: Stored) => line.domain === "coffee").unitPrice, 750);
    assert.deepEqual(await stocks(f), [18, 18]); assert.equal(networkCalls, 0);
  });
  for (const [domain, mode] of [["mixed", "711_cod"], ["store", "home_delivery"]] as const) await run(domain + " " + mode + " canonical cancellation RESTORE once compatible", async () => {
    const f = await fixture(), { result } = await create(f, input(f, domain, mode));
    assert.equal(result.state, "FINALIZED");
    const cancelInput = { orderNumber: result.orderNumber, cancelledBy: "admin" as const, cancellationReason: "Isolated compatibility",
      idempotencyKey: "j6f5b-cancel:" + result.orderNumber, now, sendNotification: async () => ({ sent: false }) };
    const cancelled = await cancelOrderCanonically(cancelInput); assert.equal(cancelled.ok, true);
    assert.deepEqual(await stocks(f), [20, 20]);
    const first = inventoryHash(await receipts(f));
    const allReceipts = await receipts(f);
    for (const current of ["coffee", "store"] as const) assert.equal(Object.values(allReceipts[current]).filter(receipt => receipt.kind === "RESTORE").length, domain === "mixed" || domain === current ? 1 : 0);
    const stored = await order(f, result.orderNumber);
    assert.equal(stored.status, "cancelled"); assert.equal(stored.inventoryReturn.protocolVersion, 1);
    assert.equal(stored.inventoryReturn.state, "returned");
    assert.equal((await cancelOrderCanonically(cancelInput)).ok, true);
    assert.equal(inventoryHash(await receipts(f)), first); assert.deepEqual(await stocks(f), [20, 20]); assert.equal(networkCalls, 0);
    const state = await readMembershipCommerceState(f.stateFile);
    for (const collection of [state.creditEntries, state.creditReservations, state.referralRewards, state.retailPromotionRewards, state.subscriptions, state.cycles]) assert.equal(Object.keys(collection).length, 0);
  });
  console.log("J.6F.5B PASS " + checks + "/" + checks + "; isolated shipping/payment snapshots, APPLY/replay/recovery/RESTORE and no external effects");
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  assert.equal(path.dirname(await fs.realpath(suite)).toLowerCase(), tempParent.toLowerCase());
  await fs.rm(suite, { recursive: true, force: true });
}
