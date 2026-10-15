import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createCommerceOrderTransactionService, commerceOrderTransactionId, CommerceOrderTransactionError,
  type CommerceOrderTransactionErrorCode } from "../lib/commerceOrderTransaction";
import type { TrustedCheckoutIdentity } from "../lib/commerceCheckoutAdmission";
import type { TransactionIntent } from "../lib/commerceTransactionTypes";
import { createStoreRepository } from "../lib/storeRepository";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } from "../lib/membershipBusinessRules";
import { createCommerceTransactionJournal } from "../lib/commerceTransactionJournal";
import { createCommerceTransactionCoordinator } from "../lib/commerceTransactionCoordinator";
import { createCoffeeInventoryParticipant, createStoreInventoryParticipant } from "../lib/inventoryParticipants";
import { orderIdempotencyResource } from "../lib/orderIdempotency";
import { assertCommerceLockHeld, CommerceLockOrderError } from "../lib/commerceLockProtocol";
import { withCommerceLockPlan } from "../lib/commerceLocks";
import { createPublicCheckoutAttemptAccess } from "../lib/publicCheckoutAttemptAccess";
import { CheckoutAttemptAccessError } from "../lib/checkoutAttemptAccess";
import { resolveCheckoutAttemptEvidence } from "../lib/checkoutAttemptResolver";
import { inventoryHash } from "../lib/inventoryReceipts";
import { isStoreCommerceEnabled } from "../lib/storeCommerceCapability";

const timestamp = "2026-10-12T06:37:00.000Z";
let current = Date.parse(timestamp);
const now = () => new Date(current);
const suite = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f5c2c2c1-"));
const tempParent = await fs.realpath(os.tmpdir());
assert.equal(path.dirname(await fs.realpath(suite)).toLowerCase(), tempParent.toLowerCase());
const savedEnv = Object.fromEntries(["KD_DATA_DIR", "RAILWAY_VOLUME_MOUNT_PATH", "STORE_COMMERCE_ENABLED",
  "AUTH_SESSION_SECRET", "MEMBER_IDENTITY_SECRET", "GUEST_CHECKOUT_ACCESS_SECRET"].map(key => [key, process.env[key]]));
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.AUTH_SESSION_SECRET = "isolated-c2c2c1-auth-secret-more-than-32-bytes";
process.env.MEMBER_IDENTITY_SECRET = process.env.AUTH_SESSION_SECRET;
const originalFetch = globalThis.fetch;
let checks = 0, fixtures = 0, networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("Network forbidden"); };
type RawRequest = { idempotencyKey: string; items: Record<string, unknown>[]; orderContext: Record<string, unknown> };
type Options = NonNullable<Parameters<typeof createCommerceOrderTransactionService>[0]>;
const member: TrustedCheckoutIdentity = { member: { id: "member-a", lineUserId: "LINE-A", displayName: "Fixture A" } };
const otherMember: TrustedCheckoutIdentity = { member: { id: "member-b", lineUserId: "LINE-B", displayName: "Fixture B" } };
function request(mixed = false): RawRequest {
  const store = { domain: "store", productId: "store-product", variantId: "default", quantity: 2 };
  const coffee = { domain: "coffee", productId: "coffee-product", variantId: "coffee-sku", quantity: 2,
    coffeeOptions: { preparation: "咖啡豆", customRoast: false } };
  return { idempotencyKey: randomUUID(), items: mixed ? [store, coffee] : [store],
    orderContext: { orderMode: "studio_pickup", customer: { name: "Fixture", phone: "0912345678", email: "", note: "" },
      studioPickup: { preferredDate: "2026-10-20" } } };
}
function service(options: Options = {}) { return createCommerceOrderTransactionService({ now, ...options }); }
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
  current = Date.parse(timestamp);
  process.env.STORE_COMMERCE_ENABLED = "true";
  process.env.GUEST_CHECKOUT_ACCESS_SECRET = "isolated-c2c2c1-guest-secret-more-than-32-bytes";
  const root = path.join(suite, "fixture-" + (++fixtures));
  process.env.KD_DATA_DIR = root;
  const orderDir = path.join(root, "orders");
  await fs.mkdir(orderDir, { recursive: true });
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
  return { root, orderDir, repository, product, website };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function journal(f: Fixture, raw: RawRequest) { return createCommerceTransactionJournal(f.orderDir, commerceOrderTransactionId(raw.idempotencyKey)); }
async function evidence(f: Fixture, raw: RawRequest) {
  return resolveCheckoutAttemptEvidence({ orderDir: f.orderDir, canonicalAttemptKey: raw.idempotencyKey });
}
async function orders(f: Fixture) { return (await fs.readdir(f.orderDir)).filter(file => file.endsWith(".json")); }
async function stock(f: Fixture) { return (await f.repository.read()).products.find(p => p.id === "store-product")!.inventory; }
async function zeroDurability(f: Fixture, raw: RawRequest) {
  assert.deepEqual(await journal(f, raw).read(), []);
  assert.deepEqual(await orders(f), []);
  assert.equal(await stock(f), 20);
}
async function expectCode(operation: () => Promise<unknown>, code: CommerceOrderTransactionErrorCode) {
  await assert.rejects(async () => operation(), (error: unknown) => {
    assert.ok(error instanceof CommerceOrderTransactionError); assert.equal(error.code, code); return true;
  });
}
async function denied(f: Fixture, raw: RawRequest, code: CommerceOrderTransactionErrorCode, options: Options, identity = member) {
  const before = await snapshot(f.root);
  await expectCode(() => service(options).create(raw, identity), code);
  assert.deepEqual(await snapshot(f.root), before);
}
async function prepared(f: Fixture, raw: RawRequest, identity = member) {
  const result = await service({ hook: async phase => { if (phase === "PREPARED") throw new Error("Isolated PREPARED interruption"); } }).create(raw, identity);
  assert.equal(result.state, "PENDING");
  const j = journal(f, raw), first = (await j.read())[0].event;
  if (first.type !== "PREPARED") throw new Error("Missing PREPARED fixture");
  return { result, j, intent: first.intent, firstFile: path.join(j.directory, "00000000.json") };
}
async function legacy(f: Fixture, raw: RawRequest, number = "KD20261012-9001") {
  await fs.writeFile(path.join(f.orderDir, number + ".json"), JSON.stringify({
    orderNumber: number, createdAt: timestamp, orderMode: "studio_pickup", status: "waiting_studio_pickup_confirmation",
    idempotencyKey: raw.idempotencyKey.toUpperCase(), idempotencyRequestHash: "a".repeat(64), items: [],
  }));
}
const frozenHashes: [string, string][] = [
  [
    "app/api/commerce/checkout-attempt/route.ts",
    "ed5604bdc1499bed55c74183f6f46a200b9cf81d9ee30d2dfbdb4e312ce65621"
  ],
  [
    "lib/publicCheckoutContract.ts",
    "f7d03d50ff4930287a2d75b10e78142474eb6759b7f2658016887e5b754dafaf"
  ],
  [
    "lib/commerceCheckoutAdmission.ts",
    "079aa623c57106e38b28603c841337d680df913e442e01006eb2db8b89cd8580"
  ],
  [
    "lib/publicCheckoutAttemptAccess.ts",
    "76e6b778279bebecac9dc631f57643c7583ec0285505c25f9fc802949c97ff39"
  ],
  [
    "lib/checkoutAttemptAccess.ts",
    "58628f9363f9d195d0ed6c76e78f77d1814116b81112507e73367dc91d51a11b"
  ],
  [
    "lib/checkoutAttemptResolver.ts",
    "5adb597938d125e8a0a08a984b0c5fe8e6aa89bb3fe39ec7099ab5226210ff99"
  ],
  [
    "lib/checkoutAttemptBinding.ts",
    "005521ab7050ae2b59ffa5d7ee3302fe92248f345e35ccd23c90c1c7a88de00d"
  ],
  [
    "lib/commerceTransactionCoordinator.ts",
    "e4902c9177b20e608bfa0e78d8a2c5b46d6de049a03c38b595b290bb61c477bc"
  ],
  [
    "lib/commerceTransactionTypes.ts",
    "3c4b6b74f189ae10e47ac09466127c98fc1b75271ec14105658c3edead660dff"
  ],
  [
    "lib/commerceTransactionJournal.ts",
    "779e8ea7eb150c346ecd340921e0b098d6cd98501c696f7c392f8f6c97a0ca0e"
  ],
  [
    "lib/commerceLocks.ts",
    "6af3e2f3c63d4431770dc0899de53bbb389524270ca3ca0bef3e5eef0a60cfd6"
  ],
  [
    "lib/commerceLockProtocol.ts",
    "4086cd46821f55a2de08194430f401ca6739948d709007182884ca5f0ea8c946"
  ],
  [
    "lib/storeCommerceCapability.ts",
    "1c7418c8429ee51c2f0757a322e7d68ac37eedb80aa90f5b52e5b79451b45146"
  ],
  [
    "lib/orderIdempotency.ts",
    "289cd112b91ba64f0c29abef80909d3975ddef1bf57de5b7267400457d7e2311"
  ],
  [
    "lib/orderConversation.ts",
    "3383bf6b0638975f078d82222ec6b63ef095356f239eccf753b98481dc8db0f4"
  ],
  [
    "lib/memberAuth.ts",
    "5ab707f8273fa34c470f652da8f1dcabd47b66dadbf59b81c57b554fb059865d"
  ],
  [
    "package.json",
    "517ce04bc56f8ea0d84ec044167894dc64b901550e2b234f30189c61478d11b3"
  ],
  [
    "package-lock.json",
    "c4b5276eb44ee04552dc4138c01c908bbf1049863e1992c2a666df0c408e9082"
  ],
  [
    "tsconfig.json",
    "fbff01604d6cb54694be707f26e7a0eb21a6ef796b888c6a1dab1839fa7c6ccc"
  ]
];

const successorOwnedSourceFiles = [
  "app/checkout/page.tsx",
  "lib/commerceCart.ts",
  "components/commerce/CommerceCheckoutBoundary.tsx",
] as const;
const successorOwnedSourceBefore = new Map(
  await Promise.all(successorOwnedSourceFiles.map(async (file) => [file, await fs.readFile(file)] as const))
);

const recoveryMarker = "  /** Existing B3B attempt only;";
const originalSource = execFileSync("git", ["show", "HEAD:lib/commerceOrderTransaction.ts"], { encoding: "utf8" });
const recoveryBody = (source: string) => source.replaceAll("\r\n", "\n").slice(source.indexOf(recoveryMarker));
try {
  await run("recoverExisting is byte-identical to HEAD", async () => {
    const source = await fs.readFile("lib/commerceOrderTransaction.ts", "utf8");
    assert.ok(source.includes(recoveryMarker)); assert.equal(recoveryBody(source), recoveryBody(originalSource));
  });
  await run("protected schemas, lock ranks, 19 predecessor hashes and 3 successor runtime source freezes match", async () => {
    for (const [file, hash] of frozenHashes) assert.equal(createHash("sha256").update(await fs.readFile(file)).digest("hex"), hash, file);
    for (const file of successorOwnedSourceFiles) assert.deepEqual(await fs.readFile(file), successorOwnedSourceBefore.get(file), file);
  });
  await run("default ownerless F3 studio succeeds with Store gate disabled", async () => {
    const f = await fixture(), raw = request(); process.env.STORE_COMMERCE_ENABLED = "false";
    const result = await service().create(raw);
    assert.equal(result.state, "FINALIZED"); assert.equal(await stock(f), 18);
    assert.equal(result.order?.member, undefined); assert.equal(result.order?.total, 2200);
  });
  await run("default owned studio retains historical disabled-Store-gate compatibility", async () => {
    const f = await fixture(), raw = request(); process.env.STORE_COMMERCE_ENABLED = "false";
    const result = await service().create(raw, member);
    assert.equal(result.state, "FINALIZED"); assert.equal(await stock(f), 18);
  });
  await run("default create continues PREPARED and retains its admitted price after repricing", async () => {
    const f = await fixture(), raw = request(), p = await prepared(f, raw);
    await f.repository.updateProduct("store-product", f.product.revision, { price: 1600 });
    const result = await service().create(raw, member);
    assert.equal(result.state, "FINALIZED"); assert.equal(result.orderNumber, p.intent.orderNumber);
    assert.equal((result.order?.items as { unitPrice: number }[])[0].unitPrice, 1100);
    assert.equal((await p.j.read()).filter(e => e.event.type === "PREPARED").length, 1);
    assert.equal((await p.j.read()).filter(e => e.event.type === "APPLIED").length, 1);
  });
  await run("default B3B retry still rejects a changed selection", async () => {
    const f = await fixture(), raw = request(); await prepared(f, raw);
    const changed = structuredClone(raw); changed.items[0].quantity = 3;
    await denied(f, changed, "IDEMPOTENCY_CONFLICT", {});
  });
  await run("default B3B retry still rejects another owner first", async () => {
    const f = await fixture(), raw = request(); await prepared(f, raw);
    const changed = structuredClone(raw); changed.items[0].quantity = 3;
    await denied(f, changed, "INVALID_IDENTITY", {}, otherMember);
  });
  await run("recoverExisting remains available without invoking publicFresh validator", async () => {
    const f = await fixture(), raw = request(), p = await prepared(f, raw); let calls = 0;
    const result = await service({ publicFresh: { validateLocked: async () => { calls++; throw new Error("Must not run"); } } }).recoverExisting(raw, member);
    assert.equal(result.state, "FINALIZED"); assert.equal(result.orderNumber, p.intent.orderNumber); assert.equal(calls, 0);
  });

  const placed = await fixture(), placedRaw = request(true);
  placedRaw.idempotencyKey = placedRaw.idempotencyKey.toUpperCase();
  const placementBefore = await snapshot(placed.root), trace: string[] = [];
  let validatorCalls = 0, candidate: TransactionIntent | undefined;
  await run("true NONE mixed attempt validates once inside complete sealed lock plan before durability", async () => {
    assert.equal((await evidence(placed, placedRaw)).kind, "NONE");
    const result = await service({
      publicFresh: { validateLocked: async ({ canonicalAttemptKey, resolution, intent }) => {
        validatorCalls++; candidate = structuredClone(intent); trace.push("VALIDATOR");
        assert.equal(canonicalAttemptKey, placedRaw.idempotencyKey.toLowerCase());
        assert.equal(intent.order.idempotencyKey, canonicalAttemptKey);
        assert.equal(resolution.lines.length, 2); assert.equal(resolution.itemsSubtotal, 3200);
        assert.equal(intent.order.subtotal, resolution.itemsSubtotal);
        assert.equal(intent.order.total, 3200); assert.equal(intent.order.shipping, 0);
        assert.equal(intent.order.checkoutBusinessDate, "2026-10-12");
        assert.ok(Number.isSafeInteger(intent.order.checkoutRulesVersion));
        assert.equal(intent.participants.length, 2);
        assert.deepEqual(Object.keys(intent).sort(), ["schemaVersion", "transactionId", "requestHash", "orderNumber", "participants", "order", "finalStatus"].sort());
        const coordinator = createCommerceTransactionCoordinator({ orderDir: placed.orderDir,
          participants: [createCoffeeInventoryParticipant(placed.website, now), createStoreInventoryParticipant({ dataRoot: placed.root, now })] });
        const resources = [orderIdempotencyResource(placed.orderDir, canonicalAttemptKey), ...coordinator.resources(intent)];
        assert.deepEqual(resources.map(r => r.rank).sort(), [0, 0, 1, 2, 2, 3]);
        for (const resource of resources) assertCommerceLockHeld(resource.file);
        await assert.rejects(async () => withCommerceLockPlan(resources, async () => undefined), CommerceLockOrderError);
        assert.deepEqual(await journal(placed, placedRaw).read(), []);
        assert.deepEqual(await orders(placed), []);
        // Only transient lock files exist here; all durable files remain identical.
        assert.deepEqual((await snapshot(placed.root)).filter(([file]) => !file.endsWith(".lock")), placementBefore);
      } },
      hook: async phase => { assert.equal(validatorCalls, 1); trace.push(phase); },
    }).create(placedRaw, member);
    assert.equal(result.state, "FINALIZED"); assert.equal(validatorCalls, 1);
    assert.equal(trace[0], "VALIDATOR"); assert.equal(trace[1], "PREPARED");
    assert.ok(trace.indexOf("APPLIED") > trace.indexOf("VALIDATOR"));
    assert.equal(await stock(placed), 18);
    const coffee = JSON.parse(await fs.readFile(placed.website, "utf8"));
    assert.equal(coffee.menu.products[0].skus[0].stock, 18);
  });
  await run("PREPARED intent is exactly the authoritative candidate shown to validator", async () => {
    const first = (await journal(placed, placedRaw).read())[0].event;
    assert.equal(first.type, "PREPARED"); if (first.type !== "PREPARED") throw new Error("Missing intent");
    assert.deepEqual(first.intent, candidate);
  });

  await run("price 1100 -> 1600 under-lock resolution rejects captured 1100 quote with zero durability", async () => {
    const f = await fixture(), raw = request(); let calls = 0, baseline: [string, string][] | undefined;
    await expectCode(() => service({
      afterResolve: async provisional => {
        assert.equal(provisional.lines[0].unitPrice, 1100);
        await f.repository.updateProduct("store-product", f.product.revision, { price: 1600 });
        baseline = await snapshot(f.root);
      },
      publicFresh: { validateLocked: async ({ resolution, intent }) => {
        calls++; assert.equal(resolution.lines[0].unitPrice, 1600); assert.equal(intent.order.subtotal, 3200);
        const capturedQuote = Number(1100);
        if (resolution.lines[0].unitPrice !== capturedQuote) throw new CommerceOrderTransactionError("PRICE_CHANGED");
      } },
    }).create(raw, member), "PRICE_CHANGED");
    assert.equal(calls, 1); assert.ok(baseline); assert.deepEqual(await snapshot(f.root), baseline);
    await zeroDurability(f, raw); assert.equal((await evidence(f, raw)).kind, "NONE");
  });
  await run("matching captured 1600 quote accepts locked 1600 and finalizes normal transaction", async () => {
    const f = await fixture(), raw = request(); let calls = 0;
    const capturedAssertions = { quotedUnitPrice: 1600, browserQuoteMarker: "EPHEMERAL-QUOTE-ONLY" };
    const result = await service({
      afterResolve: async provisional => {
        assert.equal(provisional.lines[0].unitPrice, 1100);
        await f.repository.updateProduct("store-product", f.product.revision, { price: 1600 });
      },
      publicFresh: { validateLocked: async ({ resolution, intent }) => {
        calls++; assert.equal(resolution.lines[0].unitPrice, capturedAssertions.quotedUnitPrice);
        assert.equal(intent.order.total, 3200);
      } },
    }).create(raw, member);
    assert.equal(result.state, "FINALIZED"); assert.equal(calls, 1); assert.equal(await stock(f), 18);
    const entries = await journal(f, raw).read();
    assert.equal(entries.filter(e => e.event.type === "PREPARED").length, 1);
    assert.equal(entries.filter(e => e.event.type === "APPLIED").length, 1);
    const persisted = JSON.stringify({ entries, order: result.order });
    for (const forbidden of ["publicFresh", "validateLocked", "quotedUnitPrice", "browserQuoteMarker", "EPHEMERAL-QUOTE-ONLY"])
      assert.ok(!persisted.includes(forbidden), forbidden);
  });
  await run("public studio Store gate true -> false is rejected inside callback without writes", async () => {
    const f = await fixture(), raw = request(); let calls = 0;
    assert.equal(isStoreCommerceEnabled(), true);
    await denied(f, raw, "STORE_COMMERCE_DISABLED", {
      afterResolve: async () => { process.env.STORE_COMMERCE_ENABLED = "false"; },
      publicFresh: { validateLocked: async () => {
        calls++; assert.equal(isStoreCommerceEnabled(), false);
        if (!isStoreCommerceEnabled()) throw new CommerceOrderTransactionError("STORE_COMMERCE_DISABLED");
      } },
    });
    assert.equal(calls, 1); await zeroDurability(f, raw);
  });
  await run("public studio Store gate true at locked acceptance allows execution", async () => {
    const f = await fixture(), raw = request(); let calls = 0;
    const result = await service({ publicFresh: { validateLocked: async () => {
      calls++; assert.equal(isStoreCommerceEnabled(), true);
    } } }).create(raw, member);
    assert.equal(result.state, "FINALIZED"); assert.equal(calls, 1);
  });
  await run("T1 valid provisionally expires while waiting and maps EXPIRED to FRESH_AUTHORITY_INVALID", async () => {
    const f = await fixture(), raw = request(), access = createPublicCheckoutAttemptAccess({ now });
    const issued = access.issue({ idempotencyKey: raw.idempotencyKey });
    const identity = access.resolveIdentity({ token: issued.token, idempotencyKey: raw.idempotencyKey });
    let verifiedExpired = false, calls = 0;
    await denied(f, raw, "FRESH_AUTHORITY_INVALID", {
      afterResolve: async () => { current = Date.parse(issued.expiresAt) + 1; },
      publicFresh: { validateLocked: async ({ canonicalAttemptKey }) => {
        calls++;
        try { access.resolveIdentity({ token: issued.token, idempotencyKey: canonicalAttemptKey }); }
        catch (error) {
          assert.ok(error instanceof CheckoutAttemptAccessError); assert.equal(error.code, "EXPIRED"); verifiedExpired = true;
          throw new CommerceOrderTransactionError("FRESH_AUTHORITY_INVALID");
        }
        throw new Error("Expired token unexpectedly accepted");
      } },
    }, identity);
    assert.equal(verifiedExpired, true); assert.equal(calls, 1); await zeroDurability(f, raw);
  });
  for (const code of ["PRICE_CHANGED", "STORE_COMMERCE_DISABLED", "FRESH_AUTHORITY_INVALID", "INVALID_PICKUP_DATE"] as const) {
    await run("typed validator error propagates unchanged and has zero durability: " + code, async () => {
      const f = await fixture(), raw = request(); let calls = 0;
      const expected = new CommerceOrderTransactionError(code);
      const before = await snapshot(f.root);
      await assert.rejects(async () => service({ publicFresh: { validateLocked: async () => { calls++; throw expected; } } }).create(raw, member),
        (error: unknown) => { assert.equal(error, expected); return true; });
      assert.equal(calls, 1); assert.deepEqual(await snapshot(f.root), before); await zeroDurability(f, raw);
    });
  }
  await run("unknown validator error fails closed as REVIEW_REQUIRED before durability", async () => {
    const f = await fixture(), raw = request();
    await denied(f, raw, "REVIEW_REQUIRED", { publicFresh: { validateLocked: async () => { throw new Error("Unknown callback failure"); } } });
    await zeroDurability(f, raw);
  });
  await run("callback closure, raw T1, quote object and ignored callback output never persist", async () => {
    const f = await fixture(), raw = request(), access = createPublicCheckoutAttemptAccess({ now });
    const issued = access.issue({ idempotencyKey: raw.idempotencyKey });
    const identity = access.resolveIdentity({ token: issued.token, idempotencyKey: raw.idempotencyKey });
    const captured = { quotedUnitPrice: 1100, quoteMarker: "CAPTURED-QUOTE-OBJECT" };
    // Return value is deliberately ignored; only success/throw is authoritative.
    const callbackOutput = { outputMarker: "CALLBACK-OUTPUT-ONLY" };
    const injected = { validateLocked: async ({ resolution }: Parameters<NonNullable<Options["publicFresh"]>["validateLocked"]>[0]): Promise<void> => {
      assert.equal(resolution.lines[0].unitPrice, captured.quotedUnitPrice);
      access.resolveIdentity({ token: issued.token, idempotencyKey: raw.idempotencyKey });
      return callbackOutput as unknown as void;
    } };
    const result = await service({ publicFresh: injected }).create(raw, identity);
    assert.equal(result.state, "FINALIZED");
    const persisted = JSON.stringify({ journal: await journal(f, raw).read(), order: result.order });
    for (const forbidden of ["publicFresh", "validateLocked", issued.token, "quotedUnitPrice", "CAPTURED-QUOTE-OBJECT",
      "CALLBACK-OUTPUT-ONLY", "X-KD-Checkout-Attempt-Access"])
      assert.ok(!persisted.includes(forbidden), forbidden);
    assert.equal(await stock(f), 18);
  });

  for (const finalized of [false, true]) {
    await run("NONE -> durable race hands off before owner/selection comparison, winner " + (finalized ? "FINALIZED" : "PREPARED"), async () => {
      const f = await fixture(), raw = request(), competitor = structuredClone(raw);
      competitor.items[0].quantity = 3;
      let calls = 0, baseline: [string, string][] | undefined;
      await expectCode(() => service({
        afterResolve: async () => {
          assert.equal((await evidence(f, raw)).kind, "NONE");
          if (finalized) assert.equal((await service().create(competitor, otherMember)).state, "FINALIZED");
          else await prepared(f, competitor, otherMember);
          baseline = await snapshot(f.root);
        },
        publicFresh: { validateLocked: async () => { calls++; throw new Error("Must hand off"); } },
      }).create(raw, member), "ATTEMPT_BECAME_DURABLE");
      assert.equal(calls, 0); assert.ok(baseline); assert.deepEqual(await snapshot(f.root), baseline);
      const entries = await journal(f, raw).read();
      assert.equal(entries.filter(e => e.event.type === "PREPARED").length, 1);
      assert.equal(entries.filter(e => e.event.type === "APPLIED").length, finalized ? 1 : 0);
      const first = entries[0].event;
      if (first.type !== "PREPARED") throw new Error("Missing winner");
      assert.equal((first.intent.order.items as { quantity: number }[])[0].quantity, 3);
      assert.equal((first.intent.order.checkoutAttemptBinding as { ownerBinding: { memberId: string } }).ownerBinding.memberId, "member-b");
      assert.equal((await evidence(f, raw)).kind, "PROTOCOL_V1_ATTEMPT");
      assert.equal(await stock(f), finalized ? 17 : 20);
      assert.equal((await orders(f)).length, finalized ? 1 : 0);
    });
  }
  for (const state of ["PREPARED", "FINALIZED", "ABORTED"] as const) {
    await run("pre-existing " + state + " hands off with zero validator, provisional resolution or mutation", async () => {
      const f = await fixture(), raw = request(), p = await prepared(f, raw, otherMember);
      if (state === "FINALIZED") assert.equal((await service().create(raw, otherMember)).state, "FINALIZED");
      if (state === "ABORTED") await withCommerceLockPlan([
        orderIdempotencyResource(f.orderDir, raw.idempotencyKey), { file: p.j.lockFile, rank: 0, key: p.intent.transactionId },
      ], async () => { await p.j.append({ type: "ABORT", reason: "Isolated fixture" }); await p.j.append({ type: "ABORTED" }); });
      const found = await evidence(f, raw);
      assert.equal(found.kind, "PROTOCOL_V1_ATTEMPT");
      if (found.kind !== "PROTOCOL_V1_ATTEMPT") throw new Error("Missing V1");
      assert.equal(found.journalState, state);
      const changed = structuredClone(raw); changed.items[0].quantity = 3;
      let calls = 0, resolutions = 0;
      await denied(f, changed, "ATTEMPT_BECAME_DURABLE", {
        afterResolve: async () => { resolutions++; },
        publicFresh: { validateLocked: async () => { calls++; } },
      });
      assert.equal(calls, 0); assert.equal(resolutions, 0);
      assert.equal((await p.j.read()).filter(e => e.event.type === "PREPARED").length, 1);
    });
  }
  await run("historical ownerless F3 PREPARED is valid V1 handoff without internal recovery", async () => {
    const f = await fixture(), raw = request(); let calls = 0;
    const result = await service({ hook: async phase => { if (phase === "PREPARED") throw new Error("Isolated interruption"); } }).create(raw);
    assert.equal(result.state, "PENDING");
    await denied(f, raw, "ATTEMPT_BECAME_DURABLE", { publicFresh: { validateLocked: async () => { calls++; } } });
    assert.equal(calls, 0); assert.equal(await stock(f), 20);
  });
  await run("legacy canonical collision remains IDEMPOTENCY_CONFLICT, never V1 handoff", async () => {
    const f = await fixture(), raw = request(); await legacy(f, raw);
    assert.equal((await evidence(f, raw)).kind, "LEGACY_ORDER"); let calls = 0;
    await denied(f, raw, "IDEMPOTENCY_CONFLICT", { publicFresh: { validateLocked: async () => { calls++; } } });
    assert.equal(calls, 0); assert.deepEqual(await journal(f, raw).read(), []);
  });
  await run("cross-protocol dual authority remains REVIEW_REQUIRED, no winner or handoff", async () => {
    const f = await fixture(), raw = request(); await prepared(f, raw); await legacy(f, raw);
    assert.equal((await evidence(f, raw)).kind, "CONFLICT"); let calls = 0;
    await denied(f, raw, "REVIEW_REQUIRED", { publicFresh: { validateLocked: async () => { calls++; } } });
    assert.equal(calls, 0);
  });
  await run("duplicate canonical legacy evidence remains REVIEW_REQUIRED", async () => {
    const f = await fixture(), raw = request(); await legacy(f, raw); await legacy(f, raw, "KD20261012-9002");
    assert.equal((await evidence(f, raw)).kind, "REVIEW_REQUIRED"); let calls = 0;
    await denied(f, raw, "REVIEW_REQUIRED", { publicFresh: { validateLocked: async () => { calls++; } } });
    assert.equal(calls, 0);
  });
  await run("malformed durable binding does not become a valid V1 handoff", async () => {
    const f = await fixture(), raw = request(), p = await prepared(f, raw);
    const intent = structuredClone(p.intent); intent.order.checkoutAttemptBinding = null;
    const record = { schemaVersion: 1, sequence: 0, previousHash: null, event: { type: "PREPARED", intent } };
    await fs.writeFile(p.firstFile, JSON.stringify({ ...record, hash: inventoryHash(record) }));
    let calls = 0;
    await denied(f, raw, "REVIEW_REQUIRED", { publicFresh: { validateLocked: async () => { calls++; } } });
    assert.equal(calls, 0);
  });
  await run("corrupt PREPARED journal fails closed without validator or repair", async () => {
    const f = await fixture(), raw = request(), p = await prepared(f, raw);
    await fs.writeFile(p.firstFile, "{broken-json"); let calls = 0;
    await denied(f, raw, "REVIEW_REQUIRED", { publicFresh: { validateLocked: async () => { calls++; } } });
    assert.equal(calls, 0);
  });
  for (const field of ["publicFresh", "validateLocked", "quotedUnitPrice", "financialSnapshot", "X-KD-Checkout-Attempt-Access"]) {
    await run("server-only dependency/captured assertion is forbidden in request DTO: " + field, async () => {
      const f = await fixture(), raw = request();
      const before = await snapshot(f.root); let calls = 0;
      await expectCode(() => service({ publicFresh: { validateLocked: async () => { calls++; } } }).create({ ...raw, [field]: "not-authority" }, member), "INVALID_REQUEST");
      assert.equal(calls, 0); assert.deepEqual(await snapshot(f.root), before); await zeroDurability(f, raw);
    });
  }
  await run("source freezes and recovery body remain unchanged after all dynamic scenarios", async () => {
    for (const [file, hash] of frozenHashes) assert.equal(createHash("sha256").update(await fs.readFile(file)).digest("hex"), hash, file);
    for (const file of successorOwnedSourceFiles) assert.deepEqual(await fs.readFile(file), successorOwnedSourceBefore.get(file), file);
    assert.equal(recoveryBody(await fs.readFile("lib/commerceOrderTransaction.ts", "utf8")), recoveryBody(originalSource));
    assert.equal(networkCalls, 0);
  });
  console.log("J.6F.5C2C2C1 PASS " + checks + "/" + checks);
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const resolved = await fs.realpath(suite);
  assert.equal(path.dirname(resolved).toLowerCase(), tempParent.toLowerCase());
  assert.ok(path.basename(resolved).startsWith("kd-j6f5c2c2c1-"));
  await fs.rm(resolved, { recursive: true, force: true });
}
