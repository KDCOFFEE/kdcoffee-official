import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import * as nodeModule from "node:module";
import { orderIdempotencyResource, withOrderIdempotencyLock, findOrderByIdempotencyKey, createIdempotencyRequestHash } from "../lib/orderIdempotency";
import { createCommerceOrderTransactionService, commerceOrderTransactionId, CommerceOrderTransactionError } from "../lib/commerceOrderTransaction";
import { resolveCheckoutAttemptEvidence } from "../lib/checkoutAttemptResolver";
import { createStoreRepository } from "../lib/storeRepository";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } from "../lib/membershipBusinessRules";
import { createCommerceTransactionJournal } from "../lib/commerceTransactionJournal";
import { withCommerceLockPlan, withOrderGate } from "../lib/commerceLocks";
import { assertCommerceLockHeld, CommerceLockOrderError } from "../lib/commerceLockProtocol";
import { inventoryHash } from "../lib/inventoryReceipts";
import type { TransactionEvent } from "../lib/commerceTransactionTypes";

type RegisterHooksResolveContext = { parentURL?: string };
type RegisterHooksResolveResult = { url: string; shortCircuit?: boolean };
type RegisterHooksNextResolve = (
  specifier: string,
  context: RegisterHooksResolveContext,
) => RegisterHooksResolveResult;
type RegisterHooksCompat = (hooks: {
  resolve: (
    specifier: string,
    context: RegisterHooksResolveContext,
    nextResolve: RegisterHooksNextResolve,
  ) => RegisterHooksResolveResult;
}) => unknown;
const registerHooks = (nodeModule as unknown as { registerHooks: RegisterHooksCompat }).registerHooks;

type RecordValue = Record<string, any>;
const h: RecordValue = { member: null, root: "", referrals: [], subscriptions: [], credits: [], notifications: [], profiles: [] };
const globals = globalThis as typeof globalThis & { __b4Harness?: RecordValue };
globals.__b4Harness = h;
// Only public-route authentication/effect boundaries are recorded in memory.
// Real collision locks, resolver, inventory, pricing, order files and V1 service
// remain unmocked. No real membership effect or notification is permitted.
const stubs: Record<string, string> = {
  "@/lib/memberAuth": "export async function getCurrentMember(){return globalThis.__b4Harness.member;} export async function updateMemberProfile(...args){globalThis.__b4Harness.profiles.push(args);}",
  "@/lib/membershipCommerce": "export async function registerReferralQualificationOrder(input){globalThis.__b4Harness.referrals.push(input);} export async function createSubscription(input){globalThis.__b4Harness.subscriptions.push(input);return {};}",
  "@/lib/orderCredit": "export async function applyOrderCredit(input){const h=globalThis.__b4Harness;h.credits.push(input);const order=await h.readOrder(input.orderNumber);return {...order,credit:{appliedAmount:input.requestedAmount,reservationId:'fixture:'+input.orderNumber},total:Number(order.total)-input.requestedAmount};}",
  "@/lib/internalLineNotifications": "export async function sendInternalLineNotification(text){globalThis.__b4Harness.notifications.push(text);return {sent:true,status:'sent'};}",
  "@/lib/adminOrders": "export async function updateStoredOrderSafely(id,patch){return globalThis.__b4Harness.readOrder(id);}",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith("/app/api/orders/route.ts") && Object.hasOwn(stubs, specifier)) {
      return { url: "data:text/javascript," + encodeURIComponent(stubs[specifier]), shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { POST } = await import("../app/api/orders/route");
const timestamp = "2026-10-12T06:37:00.000Z", now = () => new Date(timestamp);
const suite = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f5c2b4-"));
const tempParent = await fs.realpath(os.tmpdir());
assert.equal(path.dirname(await fs.realpath(suite)).toLowerCase(), tempParent.toLowerCase());
const savedEnv = Object.fromEntries(["KD_DATA_DIR", "RAILWAY_VOLUME_MOUNT_PATH", "STORE_COMMERCE_ENABLED", "AUTH_SESSION_SECRET", "MEMBER_IDENTITY_SECRET"].map(key => [key, process.env[key]]));
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.STORE_COMMERCE_ENABLED = "true";
process.env.AUTH_SESSION_SECRET = "isolated-b4-test-secret-longer-than-thirty-two-characters";
process.env.MEMBER_IDENTITY_SECRET = process.env.AUTH_SESSION_SECRET;
const originalFetch = globalThis.fetch;
let networkCalls = 0, checks = 0, fixtureCount = 0, lockedResolverCalls = 0, physicalContentions = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("No external network permitted"); };
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const uuid = () => "abcdef01" + randomUUID().slice(8);
const trusted = { member: { id: "member-a", lineUserId: "fixture-line", displayName: "Fixture member" } };
function latch() {
  let resolve!: () => void, reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Deterministic barrier was not reached")), 10000); })]); }
  finally { if (timer) clearTimeout(timer); }
}
const keys = new Map<string, string>();
type Control = { entered: ReturnType<typeof latch>; release: ReturnType<typeof latch>; blocked: ReturnType<typeof latch>; hits: number };
const controls = new Map<string, Control>();
const lstatDescriptor = Object.getOwnPropertyDescriptor(fs, "lstat")!, openDescriptor = Object.getOwnPropertyDescriptor(fs, "open")!;
assert.equal(lstatDescriptor.writable, true); assert.equal(openDescriptor.writable, true);
const originalLstat = lstatDescriptor.value as (...args: unknown[]) => Promise<unknown>;
const originalOpen = openDescriptor.value as (...args: unknown[]) => Promise<unknown>;
Object.defineProperty(fs, "lstat", { ...lstatDescriptor, value: async (...args: unknown[]) => {
  const result = await originalLstat(...args);
  const directory = path.resolve(String(args[0])), key = keys.get(directory);
  if (key) {
    assertCommerceLockHeld(orderIdempotencyResource(directory, key).file);
    lockedResolverCalls++;
    const control = controls.get(directory);
    if (control && ++control.hits === 1) { control.entered.resolve(); await control.release.promise; }
  }
  return result;
} });
Object.defineProperty(fs, "open", { ...openDescriptor, value: async (...args: unknown[]) => {
  try { return await originalOpen(...args); }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      for (const [directory, key] of keys) {
        if (path.resolve(String(args[0])) === orderIdempotencyResource(directory, key).file + ".lock") {
          physicalContentions++; controls.get(directory)?.blocked.resolve();
        }
      }
    }
    throw error;
  }
} });
async function run(label: string, operation: () => unknown | Promise<unknown>) {
  try { await operation(); console.log("PASS " + (++checks) + " " + label); }
  catch (error) { console.error("FAIL case " + (checks + 1) + " " + label); throw error; }
}
async function fixture() {
  const root = path.join(suite, "fixture-" + (++fixtureCount)), orderDir = path.join(root, "orders");
  process.env.KD_DATA_DIR = root; h.root = root; h.member = null;
  h.referrals = []; h.subscriptions = []; h.credits = []; h.notifications = []; h.profiles = [];
  await fs.mkdir(orderDir, { recursive: true }); await fs.mkdir(path.join(root, "store"), { recursive: true });
  const website = path.join(root, "store", "website-data.json");
  await fs.writeFile(website, JSON.stringify({ version: 1, menu: { products: [{
    id: "coffee-product", slug: "coffee-live", name: "Coffee", active: true, purchasable: true, stock: 20, purchase: [],
    skus: [{ id: "coffee-sku", kind: "beans", label: "半磅咖啡豆", detail: "227g", enabled: true, price: 500, stock: 20, pvEnabled: true, pvValue: 30 }],
  }] } }));
  const repository = createStoreRepository({ dataRoot: root, now });
  await repository.createSection({ id: "section", name: "Equipment", slug: "equipment", published: true });
  await repository.createProduct({ id: "store-product", sectionId: "section", name: "Store", slug: "store-live", sku: "DISPLAY", price: 50, inventory: 20, pvValue: 1, published: true, active: true });
  await saveMembershipBusinessRules({ expectedRevision: 0, rules: structuredClone(DEFAULT_MEMBERSHIP_RULES), effectiveAt: timestamp, now: now() }, path.join(root, "membership-commerce", "business-rules.json"));
  h.readOrder = async (id: string) => JSON.parse(await fs.readFile(path.join(orderDir, id + ".json"), "utf8"));
  return { root, orderDir, website, repository };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function selectKey(f: Fixture, key: string) { keys.set(path.resolve(f.orderDir), key.toLowerCase()); }
function legacyBody(key: string, gift = false): RecordValue {
  return { idempotencyKey: key, orderMode: gift ? "corporate_gift" : "711_cod",
    customer: { name: "Fixture", phone: "0912345678", email: "", note: "" },
    ...(gift ? { corporateGift: { companyName: "Fixture Company", boxSize: "18", boxQuantity: 1 } }
      : { store: { id: "ABC123", name: "Fixture Store", address: "Fixture address" }, items: [{
        slug: "coffee-live", optionId: "coffee-sku", optionLabel: "半磅咖啡豆", quotedUnitPrice: 500, quantity: 2,
        preparationLabel: "咖啡豆", customRoast: false,
      }] }), requestedCredit: 0 };
}
function v1Request(key: string): RecordValue {
  return { idempotencyKey: key, items: [{ domain: "store", productId: "store-product", variantId: "default", quantity: 2 }],
    orderContext: { orderMode: "711_cod", customer: { name: "Fixture", phone: "0912345678", email: "", note: "" },
      store: { id: "ABC123", name: "Fixture Store", address: "Fixture address" } } };
}
async function legacy(f: Fixture, body: RecordValue) {
  selectKey(f, body.idempotencyKey);
  const response = await POST(new Request("http://localhost/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() as RecordValue };
}
async function v1(f: Fixture, key: string, options: Parameters<typeof createCommerceOrderTransactionService>[0] = {}) {
  selectKey(f, key); return createCommerceOrderTransactionService({ now, ...options }).create(v1Request(key), trusted);
}
async function evidence(f: Fixture, key: string) {
  selectKey(f, key); return withOrderIdempotencyLock(f.orderDir, key, () => resolveCheckoutAttemptEvidence({ orderDir: f.orderDir, canonicalAttemptKey: key }));
}
async function orders(f: Fixture): Promise<RecordValue[]> {
  const names = (await fs.readdir(f.orderDir)).filter(name => /^KD.*\.json$/.test(name));
  return Promise.all(names.map(async name => JSON.parse(await fs.readFile(path.join(f.orderDir, name), "utf8"))));
}
async function stocks(f: Fixture) {
  const coffee = JSON.parse(await fs.readFile(f.website, "utf8"));
  const store = await f.repository.read(); return [coffee.menu.products[0].skus[0].stock, store.products[0].inventory];
}
async function snapshot(root: string): Promise<[string, string][]> {
  const rows: [string, string][] = [];
  async function visit(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file); else { assert.ok(entry.isFile()); rows.push([path.relative(root, file), sha(await fs.readFile(file))]); }
    }
  }
  await visit(root); return rows.sort((a, b) => a[0].localeCompare(b[0]));
}
function legacyHash(body: RecordValue) {
  const subscriptionIntent = body.subscriptionIntent?.consent ? { consent: true, intervalDays: Number(body.subscriptionIntent.intervalDays) } : null;
  return createIdempotencyRequestHash({ orderMode: body.orderMode, customer: body.customer, store: body.store ?? null,
    studioPickup: body.studioPickup ?? null, corporateGift: body.corporateGift ?? null, items: body.items ?? null,
    ...(subscriptionIntent ? { subscriptionIntent } : {}), requestedCredit: body.requestedCredit ?? 0 });
}
async function seedLegacy(f: Fixture, body: RecordValue, number = "KD20261014-9001") {
  const order = { orderNumber: number, createdAt: timestamp, status: body.orderMode === "corporate_gift" ? "corporate_gift_inquiry" : "waiting_merchant_create_cod_shipment",
    orderMode: body.orderMode, customer: body.customer, member: null, idempotencyKey: body.idempotencyKey,
    idempotencyRequestHash: legacyHash(body), items: body.items ?? [] };
  await fs.writeFile(path.join(f.orderDir, number + ".json"), JSON.stringify(order)); return order;
}
async function blockedBoth(f: Fixture, key: string, v1Code = "REVIEW_REQUIRED") {
  const before = await snapshot(f.root), effects = [h.referrals.length, h.subscriptions.length, h.credits.length, h.notifications.length];
  const denied = await legacy(f, legacyBody(key.toUpperCase())); assert.equal(denied.status, 500);
  assert.ok(typeof denied.body.error === "string");
  assert.ok(!/KD\d{8}-|member-a|PROTOCOL_V1|tokenHash/.test(denied.body.error));
  await assert.rejects(() => v1(f, key), error => error instanceof CommerceOrderTransactionError && error.code === v1Code);
  assert.deepEqual(await snapshot(f.root), before);
  assert.deepEqual([h.referrals.length, h.subscriptions.length, h.credits.length, h.notifications.length], effects);
}
async function race(f: Fixture, key: string, first: () => Promise<unknown>, second: () => Promise<unknown>) {
  selectKey(f, key); const control: Control = { entered: latch(), release: latch(), blocked: latch(), hits: 0 };
  controls.set(path.resolve(f.orderDir), control);
  const winner = first(); winner.catch(control.entered.reject);
  let loser: Promise<unknown> | undefined, loserSettled = false;
  try {
    await bounded(control.entered.promise);
    loser = second(); loser.then(() => { loserSettled = true; }, () => { loserSettled = true; });
    await bounded(control.blocked.promise);
    assert.equal(loserSettled, false, "Competitor physically contends before winner is released");
    assert.equal(control.hits, 1, "Competitor has not reached locked B2");
    control.release.resolve();
    return await Promise.allSettled([winner, loser]);
  } finally {
    control.release.resolve(); controls.delete(path.resolve(f.orderDir));
    await Promise.allSettled([winner, ...(loser ? [loser] : [])]);
  }
}
const checkoutSourceBefore = await fs.readFile("app/checkout/page.tsx");
try {
  await run("upper/lower share one physical rank-0 resource; lowercase pre-B4 SHA path unchanged", async () => {
    const f = await fixture(), key = uuid(), lower = orderIdempotencyResource(f.orderDir, key), upper = orderIdempotencyResource(f.orderDir, key.toUpperCase());
    assert.deepEqual(lower, upper); assert.equal(lower.rank, 0);
    assert.equal(lower.file, path.join(f.orderDir, ".idempotency", sha(key)));
    await withOrderIdempotencyLock(f.orderDir, key.toUpperCase(), async () => assertCommerceLockHeld(lower.file));
  });
  await run("unused historical uppercase lock file is left untouched", async () => {
    const f = await fixture(), key = uuid(), oldFile = path.join(f.orderDir, ".idempotency", sha(key.toUpperCase()) + ".lock");
    await fs.mkdir(path.dirname(oldFile), { recursive: true }); await fs.writeFile(oldFile, "Historical unused lock");
    await withOrderIdempotencyLock(f.orderDir, key.toUpperCase(), async () => {});
    assert.equal(await fs.readFile(oldFile, "utf8"), "Historical unused lock");
  });
  await run("deterministic canonical lock contention prevents case-variant critical entry", async () => {
    const f = await fixture(), key = uuid(); selectKey(f, key);
    const control: Control = { entered: latch(), release: latch(), blocked: latch(), hits: 0 }; controls.set(path.resolve(f.orderDir), control);
    let entered = false;
    const first = withOrderIdempotencyLock(f.orderDir, key.toUpperCase(), async () => { control.entered.resolve(); await control.release.promise; return 7; });
    await bounded(control.entered.promise);
    const second = withOrderIdempotencyLock(f.orderDir, key, async () => { entered = true; return 8; });
    try { await bounded(control.blocked.promise); assert.equal(entered, false); control.release.resolve(); assert.deepEqual(await Promise.all([first, second]), [7, 8]); }
    finally { control.release.resolve(); controls.delete(path.resolve(f.orderDir)); await Promise.allSettled([first, second]); }
  });
  await run("reentrant canonical acquisition rejected without deadlock", async () => {
    const f = await fixture(), key = uuid();
    await assert.rejects(() => withOrderIdempotencyLock(f.orderDir, key, () => withOrderIdempotencyLock(f.orderDir, key.toUpperCase(), async () => {})), CommerceLockOrderError);
  });
  await run("rank-1 to canonical rank-0 reversal rejected", async () => {
    const f = await fixture(), key = uuid();
    await assert.rejects(() => withOrderGate(f.orderDir, "KD20261014-8001", () => withOrderIdempotencyLock(f.orderDir, key, async () => {})), CommerceLockOrderError);
  });
  await run("duplicate canonical plan resources rejected", async () => {
    const f = await fixture(), key = uuid();
    await assert.rejects(() => withCommerceLockPlan([orderIdempotencyResource(f.orderDir, key), orderIdempotencyResource(f.orderDir, key.toUpperCase())], async () => {}), /Duplicate commerce lock resource/);
  });
  for (const uppercase of [false, true]) await run("legacy new spelling and opposite-case replay preserved " + uppercase, async () => {
    const f = await fixture(), key = uuid(), winning = uppercase ? key.toUpperCase() : key, body = legacyBody(winning);
    const created = await legacy(f, body); assert.equal(created.status, 200); assert.equal(typeof created.body.orderAccessToken, "string");
    const stored = (await orders(f))[0], before = await snapshot(f.root), notificationCount = h.notifications.length;
    assert.equal(stored.idempotencyKey, winning);
    assert.ok(await findOrderByIdempotencyKey(f.orderDir, winning)); assert.equal(await findOrderByIdempotencyKey(f.orderDir, uppercase ? key : key.toUpperCase()), null);
    const replay = await legacy(f, { ...body, idempotencyKey: uppercase ? key : key.toUpperCase() });
    assert.equal(replay.status, 200); assert.equal(replay.body.idempotentReplay, true); assert.equal(replay.body.orderNumber, created.body.orderNumber);
    assert.deepEqual(await snapshot(f.root), before); assert.equal(h.notifications.length, notificationCount); assert.deepEqual(await stocks(f), [18, 20]);
  });
  for (const status of ["inventory_pending", "inventory_failed"]) await run("legacy " + status + " retry retains original uppercase key and decrements once", async () => {
    const f = await fixture(), key = uuid(), body = legacyBody(key.toUpperCase()), originalWebsite = await fs.readFile(f.website);
    const created = await legacy(f, body); assert.equal(created.status, 200);
    const stored = await h.readOrder(created.body.orderNumber);
    // Source-valid isolated pre-commit retry fixture: website is still the before
    // snapshot and no APPLY receipt survived. This is not production backfill.
    await fs.writeFile(f.website, originalWebsite); stored.status = status;
    stored.inventoryTransaction.state = status === "inventory_pending" ? "inventory_pending" : "inventory_write_failed";
    await fs.writeFile(path.join(f.orderDir, stored.orderNumber + ".json"), JSON.stringify(stored));
    const retried = await legacy(f, { ...body, idempotencyKey: key }); assert.equal(retried.status, 200);
    assert.equal(retried.body.orderNumber, created.body.orderNumber); assert.equal((await orders(f)).length, 1);
    assert.equal((await h.readOrder(created.body.orderNumber)).idempotencyKey, key.toUpperCase()); assert.deepEqual(await stocks(f), [18, 20]);
  });
  await run("case-variant legacy material request conflict never creates another order", async () => {
    const f = await fixture(), key = uuid(), body = legacyBody(key.toUpperCase()); assert.equal((await legacy(f, body)).status, 200);
    const before = await snapshot(f.root), changed = structuredClone(body); changed.idempotencyKey = key; changed.items[0].quantity++;
    assert.equal((await legacy(f, changed)).status, 500); assert.deepEqual(await snapshot(f.root), before);
  });
  await run("gift new/replay remains isolated and preserves uppercase key", async () => {
    const f = await fixture(), key = uuid(), body = legacyBody(key.toUpperCase(), true);
    const created = await legacy(f, body), before = await snapshot(f.root); assert.equal(created.status, 200);
    const replay = await legacy(f, { ...body, idempotencyKey: key }); assert.equal(replay.body.orderNumber, created.body.orderNumber); assert.equal(replay.body.idempotentReplay, true);
    assert.deepEqual(await snapshot(f.root), before); assert.deepEqual(await stocks(f), [20, 20]); assert.equal((await orders(f))[0].idempotencyKey, key.toUpperCase());
    assert.equal((await legacy(f, legacyBody(key))).status, 500); assert.deepEqual(await snapshot(f.root), before);
  });
  await run("Coffee authority cannot be replayed as corporate gift", async () => {
    const f = await fixture(), key = uuid(); assert.equal((await legacy(f, legacyBody(key.toUpperCase()))).status, 200);
    const before = await snapshot(f.root); assert.equal((await legacy(f, legacyBody(key, true))).status, 500); assert.deepEqual(await snapshot(f.root), before);
  });
  await run("member referral/subscription/credit replay uses durable identity, not current spelling", async () => {
    const f = await fixture(), key = uuid(), body = legacyBody(key.toUpperCase());
    h.member = { id: "member-a", displayName: "Fixture member", lineUserId: "fixture-line", email: "fixture@example.test" };
    body.requestedCredit = 25; body.subscriptionIntent = { consent: true, intervalDays: DEFAULT_MEMBERSHIP_RULES.subscription.intervalsDays[0] };
    const created = await legacy(f, body); assert.equal(created.status, 200);
    const replay = await legacy(f, { ...body, idempotencyKey: key }); assert.equal(replay.status, 200); assert.equal(replay.body.idempotentReplay, true);
    assert.equal(new Set(h.referrals.map((entry: RecordValue) => entry.idempotencyKey)).size, 1);
    assert.equal(new Set(h.subscriptions.map((entry: RecordValue) => entry.idempotencyKey)).size, 1);
    assert.ok(h.referrals.length >= 2); assert.ok(h.subscriptions.length >= 2);
    for (const entry of [...h.referrals, ...h.subscriptions]) assert.equal(entry.idempotencyKey, "checkout:" + key.toUpperCase());
    assert.equal(new Set(h.credits.map((entry: RecordValue) => entry.orderNumber)).size, 1); assert.ok(h.credits.length >= 2);
    const source = await fs.readFile("app/api/orders/route.ts", "utf8");
    assert.equal((source.match(/applyCheckoutCredit\(\{[^}]*idempotencyKey: core\.durableLegacyIdempotencyKey/g) ?? []).length, 2);
    assert.equal(h.notifications.length, 1); assert.equal((await orders(f)).length, 1);
  });
  await run("legacy vs legacy simultaneous opposite-case requests produce one persisted winner", async () => {
    const f = await fixture(), key = uuid(), outcomes = await race(f, key, () => legacy(f, legacyBody(key.toUpperCase())), () => legacy(f, legacyBody(key)));
    for (const outcome of outcomes) { assert.equal(outcome.status, "fulfilled"); if (outcome.status === "fulfilled") assert.equal((outcome.value as RecordValue).status, 200); }
    const stored = await orders(f); assert.equal(stored.length, 1); assert.equal(stored[0].idempotencyKey, key.toUpperCase()); assert.deepEqual(await stocks(f), [18, 20]);
    assert.equal(h.notifications.length, 1);
  });
  await run("historical uppercase legacy blocks new lowercase V1 PREPARED/APPLY", async () => {
    const f = await fixture(), key = uuid(); await seedLegacy(f, legacyBody(key.toUpperCase()));
    const before = await snapshot(f.root);
    await assert.rejects(() => v1(f, key), error => error instanceof CommerceOrderTransactionError && error.code === "IDEMPOTENCY_CONFLICT");
    assert.deepEqual(await snapshot(f.root), before); assert.deepEqual(await stocks(f), [20, 20]);
    assert.equal((await createCommerceTransactionJournal(f.orderDir, commerceOrderTransactionId(key)).read()).length, 0);
  });
  for (const state of ["PREPARED", "FINALIZED"]) await run("V1 " + state + " authority blocks uppercase legacy mutation/effects", async () => {
    const f = await fixture(), key = uuid();
    const result = await v1(f, key, state === "PREPARED" ? { hook: async phase => { if (phase === "PREPARED") throw new Error("Isolated interruption"); } } : {});
    assert.equal(result.state, state === "PREPARED" ? "PENDING" : "FINALIZED");
    const before = await snapshot(f.root); assert.equal((await legacy(f, legacyBody(key.toUpperCase()))).status, 500);
    assert.deepEqual(await snapshot(f.root), before); assert.equal(h.notifications.length, 0);
  });
  for (const winner of ["legacy", "v1"]) await run("simultaneous physical collision race: " + winner + " wins, exactly one durable authority", async () => {
    const f = await fixture(), key = uuid();
    const legacyStart = () => legacy(f, legacyBody(key.toUpperCase())), v1Start = () => v1(f, key);
    const outcomes = await race(f, key, winner === "legacy" ? legacyStart : v1Start, winner === "legacy" ? v1Start : legacyStart);
    const first = outcomes[0], second = outcomes[1]; assert.equal(first.status, "fulfilled");
    if (winner === "legacy") {
      assert.equal(second.status, "rejected");
      if (second.status === "rejected") { assert.ok(second.reason instanceof CommerceOrderTransactionError); assert.equal(second.reason.code, "IDEMPOTENCY_CONFLICT"); }
      assert.equal((await evidence(f, key)).kind, "LEGACY_ORDER"); assert.deepEqual(await stocks(f), [18, 20]);
      assert.equal((await createCommerceTransactionJournal(f.orderDir, commerceOrderTransactionId(key)).read()).length, 0);
    } else {
      assert.equal(second.status, "fulfilled"); if (second.status === "fulfilled") assert.equal((second.value as RecordValue).status, 500);
      assert.equal((await evidence(f, key)).kind, "PROTOCOL_V1_ATTEMPT"); assert.deepEqual(await stocks(f), [20, 18]);
    }
    assert.equal((await orders(f)).length, 1);
  });
  await run("V1 vs V1 simultaneous case variants keep one ID/journal/binding/hash/APPLY", async () => {
    const f = await fixture(), key = uuid(), outcomes = await race(f, key, () => v1(f, key.toUpperCase()), () => v1(f, key));
    for (const outcome of outcomes) { assert.equal(outcome.status, "fulfilled"); if (outcome.status === "fulfilled") assert.equal((outcome.value as RecordValue).state, "FINALIZED"); }
    const stored = await orders(f); assert.equal(stored.length, 1); assert.deepEqual(await stocks(f), [20, 18]);
    assert.equal(stored[0].idempotencyKey, key); assert.equal(stored[0].checkoutAttemptBinding.canonicalAttemptKey, key);
    assert.equal(stored[0].idempotencyRequestHash, stored[0].checkoutAttemptBinding.selectedFactsFingerprint);
    assert.equal(commerceOrderTransactionId(key.toUpperCase()), commerceOrderTransactionId(key));
    const entries = await createCommerceTransactionJournal(f.orderDir, commerceOrderTransactionId(key)).read();
    assert.equal(entries.filter(entry => entry.event.type === "PREPARED").length, 1); assert.equal(entries.filter(entry => entry.event.type === "APPLIED").length, 1);
  });
  await run("historical dual legacy/V1 authority fails closed in both callers without repair", async () => {
    const f = await fixture(), key = uuid(); await v1(f, key);
    await seedLegacy(f, legacyBody(key.toUpperCase())); const found = await evidence(f, key); assert.equal(found.kind, "CONFLICT");
    await blockedBoth(f, key);
  });
  await run("duplicate canonical uppercase legacy authorities require review", async () => {
    const f = await fixture(), key = uuid(); await seedLegacy(f, legacyBody(key.toUpperCase())); await seedLegacy(f, legacyBody(key.toUpperCase()), "KD20261014-9002");
    assert.equal((await evidence(f, key)).kind, "REVIEW_REQUIRED"); await blockedBoth(f, key);
  });
  await run("orphan V1 order fails closed before any new durable mutation", async () => {
    const f = await fixture(), key = uuid(); const order = await seedLegacy(f, legacyBody(key.toUpperCase()));
    await fs.writeFile(path.join(f.orderDir, order.orderNumber + ".json"), JSON.stringify({ ...order, inventoryTransaction: { protocolVersion: 1, transactionId: commerceOrderTransactionId(key), intentHash: "a".repeat(64), state: "inventory_committed" } }));
    assert.equal((await evidence(f, key)).kind, "REVIEW_REQUIRED"); await blockedBoth(f, key);
  });
  await run("corrupt journal fails closed without cleanup or new authority", async () => {
    const f = await fixture(), key = uuid(), journal = createCommerceTransactionJournal(f.orderDir, commerceOrderTransactionId(key));
    await fs.mkdir(journal.directory, { recursive: true }); await fs.writeFile(path.join(journal.directory, "00000000.json"), "{BROKEN");
    assert.equal((await evidence(f, key)).kind, "REVIEW_REQUIRED"); await blockedBoth(f, key);
  });
  await run("journal/order correlation mismatch fails closed", async () => {
    const f = await fixture(), key = uuid(); const result = await v1(f, key), file = path.join(f.orderDir, result.orderNumber + ".json");
    const order = JSON.parse(await fs.readFile(file, "utf8")); order.inventoryTransaction.intentHash = "b".repeat(64); await fs.writeFile(file, JSON.stringify(order));
    assert.equal((await evidence(f, key)).kind, "REVIEW_REQUIRED"); await blockedBoth(f, key);
  });
  await run("existing PREPARED recovery stays authoritative before current Store flag", async () => {
    const f = await fixture(), key = uuid(); const pending = await v1(f, key, { writeFinalOrder: async () => { throw new Error("Isolated finalization pause"); } });
    assert.equal(pending.state, "PENDING"); const journal = createCommerceTransactionJournal(f.orderDir, pending.transactionId), firstFile = path.join(journal.directory, "00000000.json"), original = await fs.readFile(firstFile);
    process.env.STORE_COMMERCE_ENABLED = "false";
    try { const recovered = await v1(f, key.toUpperCase()); assert.equal(recovered.state, "FINALIZED"); assert.equal(recovered.orderNumber, pending.orderNumber); }
    finally { process.env.STORE_COMMERCE_ENABLED = "true"; }
    assert.deepEqual(await fs.readFile(firstFile), original); assert.deepEqual(await stocks(f), [20, 18]);
  });
  await run("ABORTED V1 remains key authority and cannot be reused by legacy", async () => {
    const f = await fixture(), key = uuid(), pending = await v1(f, key, { hook: async phase => { if (phase === "PREPARED") throw new Error("Isolated before APPLY"); } });
    const journal = createCommerceTransactionJournal(f.orderDir, pending.transactionId);
    await withCommerceLockPlan([orderIdempotencyResource(f.orderDir, key), { file: journal.lockFile, rank: 0, key: pending.transactionId }], async () => {
      await journal.append({ type: "ABORT", reason: "Isolated aborted authority" }); await journal.append({ type: "ABORTED" });
    });
    const found = await evidence(f, key); assert.ok(found.kind === "PROTOCOL_V1_ATTEMPT"); assert.equal(found.journalState, "ABORTED");
    const before = await snapshot(f.root); assert.equal((await legacy(f, legacyBody(key.toUpperCase()))).status, 500); assert.deepEqual(await snapshot(f.root), before);
    assert.equal((await v1(f, key)).state, "ABORTED"); assert.equal((await orders(f)).length, 1); assert.deepEqual(await stocks(f), [20, 20]);
    assert.equal((await journal.read()).filter(entry => entry.event.type === "PREPARED").length, 1);
  });
  await run("shared physical lock, under-lock resolver, unchanged protected schemas and no second registry", async () => {
    assert.ok(physicalContentions >= 5); assert.ok(lockedResolverCalls > 20); assert.equal(networkCalls, 0);
    const { execFileSync } = await import("node:child_process");
    for (const file of ["lib/commerceLocks.ts", "lib/commerceLockProtocol.ts", "lib/commerceTransactionJournal.ts",
      "lib/commerceTransactionTypes.ts", "lib/checkoutAttemptBinding.ts", "lib/publicCheckoutContract.ts", "lib/commerceOrderTransactionIdentity.ts",
      "lib/commerceCheckoutAdmission.ts", "lib/orderInventoryTransaction.ts"]) {
      const baseline = execFileSync("git", ["show", "HEAD:" + file], { encoding: "utf8", windowsHide: true });
      assert.equal((await fs.readFile(file, "utf8")).replaceAll("\r\n", "\n"), baseline.replaceAll("\r\n", "\n"), file);
    }
    assert.deepEqual(await fs.readFile("app/checkout/page.tsx"), checkoutSourceBefore, "app/checkout/page.tsx");
    const resolver = await fs.readFile("lib/checkoutAttemptResolver.ts", "utf8");
    assert.ok(!resolver.includes('from "./commerceOrderTransaction"'));
    const route = await fs.readFile("app/api/orders/route.ts", "utf8");
    assert.ok(!/createCommerceOrderTransactionService|createCheckoutAttemptAccess/.test(route));
    for (const name of await fs.readdir(suite)) {
      const rows = await snapshot(path.join(suite, name));
      assert.ok(!rows.some(([file]) => /commerce-state|binding\.json|attempt-registry|uuid-mapping/.test(file)));
    }
  });
  console.log("J.6F.5C2B4 PASS " + checks + "/" + checks + "; locked B2 probes=" + lockedResolverCalls + "; physical contentions=" + physicalContentions + "; duplicate durable winners=0; network=" + networkCalls);
} finally {
  for (const control of controls.values()) control.release.resolve();
  Object.defineProperty(fs, "lstat", lstatDescriptor); Object.defineProperty(fs, "open", openDescriptor);
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  delete globals.__b4Harness;
  assert.equal(path.dirname(await fs.realpath(suite)).toLowerCase(), tempParent.toLowerCase());
  await fs.rm(suite, { recursive: true, force: true });
}
