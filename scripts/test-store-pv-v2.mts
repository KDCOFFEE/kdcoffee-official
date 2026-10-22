import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";

// Configure storage before importing any application module.
const suite = await fs.mkdtemp(path.join(os.tmpdir(), "kd-store-pv-v2-"));
process.env.KD_DATA_DIR = suite;
for (const key of Object.keys(process.env)) {
  if (key.startsWith("RAILWAY_") || /^(LINE_|GMAIL_)/.test(key)) delete process.env[key];
}
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("External network is forbidden in Store PV tests"); };
const storage = await import("../lib/storagePaths");
const repositoryApi = await import("../lib/storeRepository");
const transactionApi = await import("../lib/commerceOrderTransaction");
const { resolveOrderRewardBasis } = await import("../lib/orderRewardBasis");
const { readCommerceOrderLines } = await import("../lib/commerceOrderTypes");
const rulesApi = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const identity = await import("../lib/memberIdentity");
const fulfillment = await import("../lib/fulfillment");
const admin = await import("../lib/adminOrders");
const { cancelOrderCanonically } = await import("../lib/orderCancellation");

const protectedFiles = [
  "public/data/website-data.json", "public/data/homepage.json",
  "lib/membershipBusinessRules.ts", "lib/membershipRuleTypes.ts",
  "lib/selfPurchaseRewardTiers.ts", "lib/orderCancellation.ts",
  "lib/fulfillment.ts", "lib/storeTypes.ts",
];
const hashes = async () => Object.fromEntries(await Promise.all(protectedFiles.map(async file =>
  [file, createHash("sha256").update(await fs.readFile(file)).digest("hex")],
)));
const before = await hashes();
const now = new Date("2026-10-21T04:00:00.000Z");
let checks = 0, sequence = 0;
async function check(label: string, operation: () => unknown | Promise<unknown>) {
  await operation(); checks++; console.log("PASS " + String(checks).padStart(3, "0") + " " + label);
}
function assertTemp(file: string) {
  const relative = path.relative(suite, file);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Canonical resolver must remain in unique TEMP");
}

async function context(pv = 60, productType: "equipment" | "gift" = "equipment") {
  const root = path.join(suite, "case-" + (++sequence));
  process.env.KD_DATA_DIR = root;
  assertTemp(storage.getWebsiteDataFile()); assertTemp(storage.getOrdersDir());
  await fs.mkdir(path.dirname(storage.getWebsiteDataFile()), { recursive: true });
  await fs.writeFile(storage.getWebsiteDataFile(), JSON.stringify({
    version: 1, menu: { products: [{
      id: "coffee-product", slug: "pv-coffee", name: "PV Coffee", active: true, purchasable: true, purchase: [],
      skus: [{ id: "coffee-sku", label: "半磅咖啡豆", detail: "227g", kind: "beans",
        price: 500, stock: 30, enabled: true, pvEnabled: true, pvValue: 30 }],
    }] },
  }));
  const repo = repositoryApi.createStoreRepository({ dataRoot: root, now: () => now });
  await repo.createSection({ id: "pv-section", name: "TEMP PV", slug: "pv-section", published: true });
  await repo.createProduct({ id: "store-product", sectionId: "pv-section", name: "STORE PV QA PRODUCT",
    slug: "pv-store", sku: "QA-STORE-PV", price: 1000, inventory: 30, pvValue: pv, productType, published: true });
  const rules = structuredClone(rulesApi.DEFAULT_MEMBERSHIP_RULES);
  // TEMP-only mode selection; thresholds, rates, tiers and conversion are unchanged.
  rules.referral.referralRewardCalculationMode = "pv";
  rules.referral.payoutQualification.qualificationBasis = "pv";
  rules.referral.payoutQualification.mode = "general";
  rules.referral.selfPurchaseEligibilityMode = "first_completed_order";
  await rulesApi.saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-01-01T00:00:00Z") });
  const member = await identity.ensureLegacyCanonicalMember({
    memberId: "pv-member", identities: [{ provider: "email", subject: "pv@example.test" }],
  });
  return { root, repo, rules, memberId: member.memberId };
}
type Context = Awaited<ReturnType<typeof context>>;
async function order(ctx: Context, quantity = 1, mixed = false) {
  process.env.KD_DATA_DIR = ctx.root;
  const items: Parameters<ReturnType<typeof transactionApi.createCommerceOrderTransactionService>["create"]>[0] = {
    idempotencyKey: randomUUID(),
    items: [
      ...(mixed ? [{ domain: "coffee", productId: "coffee-product", variantId: "coffee-sku", quantity: 1,
        coffeeOptions: { preparation: "咖啡豆", customRoast: false } }] : []),
      { domain: "store", productId: "store-product", variantId: "default", quantity },
    ],
    orderContext: { orderMode: "studio_pickup", customer: { name: "TEMP PV", phone: "0912345678", email: "", note: "" },
      studioPickup: { preferredDate: "2026-10-28" }, creditApplied: 0 },
  };
  const result = await transactionApi.createCommerceOrderTransactionService({ now: () => now }).create(items);
  assert.equal(result.state, "FINALIZED");
  await admin.updateStoredOrderSafely(result.orderNumber, latest => ({ ...latest, member: { memberId: ctx.memberId } }));
  const persisted = await admin.readOrder(result.orderNumber); assert.ok(persisted);
  return persisted;
}
async function complete(orderNumber: string) {
  const preparing = await fulfillment.recordAdminFulfillmentEvent({ orderId: orderNumber, state: "preparing", expectedRevision: 0, now });
  const ready = await fulfillment.recordAdminFulfillmentEvent({ orderId: orderNumber, state: "ready_for_store_pickup", expectedRevision: preparing.record.revision, now });
  return fulfillment.recordAdminFulfillmentEvent({ orderId: orderNumber, state: "completed",
    expectedRevision: ready.record.revision, confirmed: true, now });
}
const eventsFor = (state: Awaited<ReturnType<typeof commerce.readMembershipCommerceState>>, id: string) =>
  Object.values(state.validConsumptionEvents).filter(event => event.sourceOrderId === id);
const remainingPV = (state: Awaited<ReturnType<typeof commerce.readMembershipCommerceState>>, id: string) =>
  eventsFor(state, id).filter(event => !event.reversedAt && !event.reversalOutcome)
    .reduce((sum, event) => sum + (event.validConsumptionPV ?? 0), 0);
const acceptance: Record<string, unknown> = {};
try {
  await check("TEMP resolver guard runs before all canonical transactions", () => assertTemp(storage.getWebsiteDataFile()));
  for (const sample of [
    { label: "Store 60", pv: 60, qty: 1, mixed: false, type: "equipment" as const, expected: 60 },
    { label: "Coffee 30 + Store 60", pv: 60, qty: 1, mixed: true, type: "equipment" as const, expected: 90 },
    { label: "Store 60 x 2", pv: 60, qty: 2, mixed: false, type: "equipment" as const, expected: 120 },
    { label: "Store zero", pv: 0, qty: 1, mixed: false, type: "equipment" as const, expected: 0 },
    { label: "Gift 250 x 4", pv: 250, qty: 4, mixed: false, type: "gift" as const, expected: 1000 },
  ]) {
    const ctx = await context(sample.pv, sample.type), saved = await order(ctx, sample.qty, sample.mixed);
    const basis = resolveOrderRewardBasis(saved);
    await check(sample.label + " persisted per-unit PV snapshot", () =>
      assert.equal(saved.items.find((item: Record<string, unknown>) => item.domain === "store")?.pvValue, sample.pv));
    await check(sample.label + " common basis and Coffee separation", () => {
      assert.equal(basis.totalEffectivePV, sample.expected);
      assert.equal(basis.totalValidConsumptionPV, sample.expected);
      assert.equal(basis.storeEligiblePV, sample.pv * sample.qty);
      assert.equal(basis.coffeeEffectivePV, sample.mixed ? 30 : 0);
    });
    await complete(saved.orderNumber);
    const state = await commerce.readMembershipCommerceState();
    await check(sample.label + " actual fulfillment records common qualification PV", () =>
      assert.equal(remainingPV(state, saved.orderNumber), sample.expected));
    await check(sample.label + " actual self-reward input uses global PV rules", () => {
      const rewards = Object.values(state.referralRewards).filter(reward => reward.sourceOrderNumber === saved.orderNumber);
      if (sample.expected === 0) assert.equal(rewards.length, 0);
      else {
        assert.equal(rewards.length, 1);
        assert.equal(rewards[0].effectivePV, sample.expected);
        assert.equal(rewards[0].pvRewardMoneyValue, ctx.rules.referral.pvRewardMoneyValue);
        assert.equal(rewards[0].rewardRate, ctx.rules.referral.selfPurchaseRewardRate);
        assert.equal(rewards[0].calculatedCreditAmount,
          Math.round(sample.expected * ctx.rules.referral.selfPurchaseRewardRate / 100 * ctx.rules.referral.pvRewardMoneyValue));
      }
    });
    await check(sample.label + " no Store subscription activation", () =>
      assert.equal(Object.keys(state.subscriptions).length, 0));
    acceptance[sample.label] = basis.totalEffectivePV;
  }
  for (const qualified of [true, false]) {
    const threshold = rulesApi.DEFAULT_MEMBERSHIP_RULES.referral.payoutQualification.generalMember.cumulativeValidPVThreshold;
    const ctx = await context(qualified ? threshold : threshold - 1, "gift");
    const saved = await order(ctx); await complete(saved.orderNumber);
    const state = await commerce.readMembershipCommerceState();
    const rounds = Object.values(state.qualificationRounds).filter(round => round.triggeringSourceOrderId === saved.orderNumber);
    await check("Store-only qualification follows existing threshold " + threshold + ", qualified=" + qualified, () => {
      assert.equal(remainingPV(state, saved.orderNumber), qualified ? threshold : threshold - 1);
      assert.equal(rounds.some(round => round.finalQualified), qualified);
    });
    if (qualified) acceptance.qualification = { threshold, totalEligiblePV: threshold, qualified };
  }
  {
    const ctx = await context(), saved = await order(ctx);
    const product = (await ctx.repo.read()).products[0];
    await ctx.repo.updateProduct(product.id, product.revision, { pvValue: 80 });
    await complete(saved.orderNumber);
    await check("Catalog 60 -> 80 never changes historical order/qualification PV", async () => {
      const historical = (await admin.readOrder(saved.orderNumber))!;
      assert.equal(resolveOrderRewardBasis(historical).totalEffectivePV, 60);
      assert.equal(remainingPV(await commerce.readMembershipCommerceState(), saved.orderNumber), 60);
      assert.equal((await ctx.repo.read()).products[0].pvValue, 80);
    });
    acceptance.historicalSnapshot = 60;
  }
  {
    const ctx = await context(), saved = await order(ctx);
    await admin.updateStoredOrderSafely(saved.orderNumber, latest => ({ ...latest, items: latest.items.map((item: Record<string, unknown>) => {
      const legacy = { ...item }; delete legacy.pvValue; return legacy;
    }) }));
    const legacy = (await admin.readOrder(saved.orderNumber))!;
    const bytes = await fs.readFile(path.join(storage.getOrdersDir(), saved.orderNumber + ".json"), "utf8");
    await check("Legacy Store line without snapshot remains readable and contributes zero", () => {
      assert.equal(readCommerceOrderLines(legacy.items).length, 1);
      assert.equal(resolveOrderRewardBasis(legacy).storeEligiblePV, 0);
      assert.equal(resolveOrderRewardBasis(legacy).totalEffectivePV, 0);
    });
    await check("Historical legacy read performs no catalog lookup or backfill", async () =>
      assert.equal(await fs.readFile(path.join(storage.getOrdersDir(), saved.orderNumber + ".json"), "utf8"), bytes));
  }
  for (const mixed of [false, true]) {
    const ctx = await context(), saved = await order(ctx, 1, mixed); await complete(saved.orderNumber);
    await check("Whole-order reversal sees full stored contribution, mixed=" + mixed, async () =>
      assert.equal(remainingPV(await commerce.readMembershipCommerceState(), saved.orderNumber), mixed ? 90 : 60));
    await commerce.cancelOrReverseReferralRewards({ orderId: saved.orderNumber, outcome: "returned",
      idempotencyKey: "pv-whole-return", now });
    await check("Existing whole-order reversal removes all valid PV, mixed=" + mixed, async () => {
      const state = await commerce.readMembershipCommerceState();
      assert.equal(remainingPV(state, saved.orderNumber), 0);
      assert.equal(eventsFor(state, saved.orderNumber)[0].validConsumptionPV, mixed ? 90 : 60);
      assert.ok(eventsFor(state, saved.orderNumber)[0].reversedAt);
      assert.ok(Object.values(state.referralRewards).filter(r => r.sourceOrderNumber === saved.orderNumber)
        .every(r => r.status === "cancelled" || r.status === "reversed"));
    });
    await commerce.cancelOrReverseReferralRewards({ orderId: saved.orderNumber, outcome: "returned",
      idempotencyKey: "pv-whole-return", now });
    await check("Whole-order reversal replay is idempotent, mixed=" + mixed, async () =>
      assert.equal(eventsFor(await commerce.readMembershipCommerceState(), saved.orderNumber).length, 1));
  }
  {
    const ctx = await context(), saved = await order(ctx);
    const cancelled = await cancelOrderCanonically({ orderNumber: saved.orderNumber, cancelledBy: "admin",
      cancellationReason: "TEMP pre-completion cancellation", idempotencyKey: randomUUID(), now: () => now,
      sendNotification: async () => ({ sent: false }) });
    await check("Canonical cancellation before completion leaves no valid Store PV", async () => {
      assert.equal(cancelled.order.status, "cancelled");
      assert.equal(remainingPV(await commerce.readMembershipCommerceState(), saved.orderNumber), 0);
      assert.equal((await ctx.repo.read()).products[0].inventory, 30);
    });
  }
  for (const pv of [null, -1, "60", {}, Infinity, NaN]) {
    await check("Invalid stored Store PV fails closed: " + String(pv), () => {
      const items = [{ domain: "store", productId: "p", variantId: "default", slug: "p", name: "p",
        sku: "S", unitPrice: 10, lineTotal: 10, quantity: 1, pvValue: pv }];
      assert.throws(() => readCommerceOrderLines(items));
      assert.equal(resolveOrderRewardBasis({ items, subtotal: 10 }).monetaryBasisStatus, "invalid_pv_snapshot");
    });
  }
  await check("Store aggregate PV overflow fails closed", () =>
    assert.equal(resolveOrderRewardBasis({ items: [{ domain: "store", quantity: 2, pvValue: Number.MAX_VALUE }] }).rewardEligible, false));
  await check("Unknown domains cannot contribute any common PV", () =>
    assert.equal(resolveOrderRewardBasis({ items: [{ domain: "unknown", quantity: 1, pvValue: 60 }] }).totalEffectivePV, 0));
  await check("Coffee effective zero retains distinct historical reward/qualification semantics", () => {
    const b = resolveOrderRewardBasis({ subtotal: 10, items: [{ quantity: 1, basePV: 10, effectivePV: 0 }] });
    assert.equal(b.totalEffectivePV, 10); assert.equal(b.totalValidConsumptionPV, 0);
  });
  await check("Mixed credit allocation remains blocked with no new money-allocation policy", () => {
    const b = resolveOrderRewardBasis({ subtotal: 1500, credit: { appliedAmount: 100 },
      items: [{ domain: "coffee", quantity: 1, lineTotal: 500, basePV: 30, effectivePV: 30 },
        { domain: "store", quantity: 1, lineTotal: 1000, pvValue: 60 }] });
    assert.equal(b.totalEffectivePV, 90);
    assert.equal(b.monetaryBasisStatus, "mixed_credit_allocation_unresolved"); assert.equal(b.rewardMerchandiseAmount, null);
  });

  {
    const ctx = await context(60);
    const referrer = await identity.ensureLegacyCanonicalMember({
      memberId: "pv-referrer", identities: [{ provider: "email", subject: "pv-referrer@example.test" }],
    });
    await commerce.assignReferralRelationship({ referrerMemberId: referrer.memberId, referredMemberId: ctx.memberId,
      idempotencyKey: "pv-referral-link", now }, { assertMember: async () => undefined });
    const saved = await order(ctx); await complete(saved.orderNumber);
    const state = await commerce.readMembershipCommerceState();
    await check("Existing referral reward receives the same common Store PV snapshot", () => {
      const rewards = Object.values(state.referralRewards).filter(r => r.sourceOrderNumber === saved.orderNumber && r.rewardType !== "self_purchase");
      assert.ok(rewards.length > 0);
      assert.ok(rewards.every(r => r.effectivePV === 60 && r.basePV === 60));
      assert.ok(rewards.every(r => r.pvRewardMoneyValue === ctx.rules.referral.pvRewardMoneyValue));
    });
  }
  {
    const ctx = await context(60), saved = await order(ctx); await complete(saved.orderNumber);
    const later = new Date("2026-11-30T04:00:00Z");
    await commerce.runReferralRewardReleaseScheduler({ now: later });
    const released = Object.values((await commerce.readMembershipCommerceState()).referralRewards)
      .find(r => r.sourceOrderNumber === saved.orderNumber && r.rewardType === "self_purchase");
    await check("Store PV uses existing safety wait/release to issue global-rule credit", () => {
      assert.ok(released); assert.equal(released.status, "released"); assert.ok(released.rewardCreditEntryId);
    });
    await commerce.cancelOrReverseReferralRewards({ orderId: saved.orderNumber, outcome: "returned",
      idempotencyKey: "pv-released-return", now: later });
    await check("Released Store reward uses existing negative-ledger whole-order reversal", async () => {
      const state = await commerce.readMembershipCommerceState();
      const reversed = state.referralRewards[released!.rewardId];
      assert.equal(reversed.status, "reversed");
      assert.equal(remainingPV(state, saved.orderNumber), 0);
      assert.equal(state.creditEntries[reversed.reversalCreditEntryId!].amount, -released!.calculatedCreditAmount);
    });
  }
  {
    const ctx = await context(1.25), saved = await order(ctx, 2);
    await check("Fractional Store PV is preserved without rounding", () =>
      assert.equal(resolveOrderRewardBasis(saved).totalEffectivePV, 2.5));
    const product = (await ctx.repo.read()).products[0];
    await ctx.repo.updateProduct(product.id, product.revision, { salePrice: 500 });
    const sale = await order(ctx);
    await check("Store sale price cannot alter independently stored per-unit PV", () => {
      assert.equal(sale.items[0].unitPrice, 500); assert.equal(sale.items[0].pvValue, 1.25);
    });
  }
  await check("Positive Store PV cannot invent missing monetary snapshot evidence", () => {
    const b = resolveOrderRewardBasis({ items: [{ domain: "store", quantity: 1, pvValue: 60 }], subtotal: 1000 });
    assert.equal(b.rewardEligible, false); assert.equal(b.monetaryBasisStatus, "invalid_mixed_snapshot");
  });
  await check("Positive Store-only PV does not bypass unresolved credit policy", () => {
    const b = resolveOrderRewardBasis({ items: [{ domain: "store", quantity: 1, pvValue: 60, lineTotal: 1000 }],
      subtotal: 1000, credit: { appliedAmount: 10 } });
    assert.equal(b.rewardEligible, false); assert.equal(b.monetaryBasisStatus, "mixed_credit_allocation_unresolved");
  });

  await check("Protected real data, thresholds, rates and cancellation/fulfillment source unchanged", async () =>
    assert.deepEqual(await hashes(), before));
  console.log("ACCEPTANCE " + JSON.stringify(acceptance));
  console.log("STORE-PV-V2: " + checks + " PASS / 0 FAIL; TEMP only; partial returns OUT OF SCOPE.");
} finally {
  globalThis.fetch = savedFetch;
  // Keep failed fixtures available for diagnosis; every path is inside unique TEMP.
  console.log("TEMP evidence root: " + suite);
}
