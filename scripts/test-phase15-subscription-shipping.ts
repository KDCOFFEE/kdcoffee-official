import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "kd-phase15-shipping-"));
process.env.KD_DATA_DIR = testRoot;
process.env.AUTH_SESSION_SECRET = "phase15-shipping-isolated-test-secret";

const rulesModule = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const identity = await import("../lib/memberIdentity");
const scheduler = await import("../lib/subscriptionOrderScheduler");
const shippingRules = await import("../lib/shippingRules");

const stateFilePath = path.join(testRoot, "membership-commerce", "commerce-state.json");
const rulesFilePath = path.join(testRoot, "membership-commerce", "business-rules.json");
const orderDir = path.join(testRoot, "orders");
const websiteFilePath = path.join(testRoot, "website-data.json");
const t0 = new Date("2026-08-27T01:00:00.000Z");
const t1 = new Date("2026-08-27T02:00:00.000Z");
const t2 = new Date("2026-08-28T01:00:00.000Z");
const t3 = new Date("2026-08-28T01:30:00.000Z");
const t4 = new Date("2026-08-28T02:00:00.000Z");

async function saveShippingRules(sevenElevenShippingFee: number, subscriptionShippingDiscount: number, now: Date) {
  const store = await rulesModule.readMembershipRulesStore(rulesFilePath);
  const rules = structuredClone(store.versions.at(-1)!.rules);
  rules.shipping.sevenElevenShippingFee = sevenElevenShippingFee;
  rules.shipping.subscriptionShippingDiscount = subscriptionShippingDiscount;
  return rulesModule.saveMembershipBusinessRules({ expectedRevision: store.revision, rules, now }, rulesFilePath);
}

try {
  const rules = structuredClone(rulesModule.DEFAULT_MEMBERSHIP_RULES);
  const fee = (method: "studio_pickup" | "711_cod" | "home_delivery", regular: number, discount: number) => {
    rules.shipping.sevenElevenShippingFee = regular;
    rules.shipping.homeDeliveryShippingFee = regular;
    rules.shipping.subscriptionShippingDiscount = discount;
    return shippingRules.subscriptionShippingFee(method, rules);
  };
  assert.equal(fee("studio_pickup", 60, 60), 0);
  assert.equal(shippingRules.regularShippingFee("studio_pickup", rules), 0);
  assert.equal(fee("711_cod", 60, 60), 0);
  assert.equal(shippingRules.regularShippingFee("711_cod", rules), 60);
  assert.equal(shippingRules.subscriptionShippingSaving("711_cod", rules), 60);
  assert.equal(fee("711_cod", 60, 100), 0);
  assert.equal(fee("711_cod", 80, 60), 20);
  assert.equal(fee("home_delivery", 100, 60), 40);
  assert.equal(shippingRules.regularShippingFee("home_delivery", rules), 100);
  assert.equal(fee("home_delivery", 100, 100), 0);
  console.log("PASS shared shipping helper: pickup, 7-ELEVEN, and home-only math");

  await writeFile(websiteFilePath, JSON.stringify({
    version: 1,
    updatedAt: t0.toISOString(),
    menu: { products: [{
      active: true, status: "active", purchasable: true,
      slug: "coffee-a", name: "Coffee A", stock: 10,
      purchase: [{ id: "coffee-a-01", label: "Half-pound beans", detail: "227g", price: 700, stock: 10, enabled: true, kind: "beans" }],
      skus: [{ id: "coffee-a-01", label: "Half-pound beans", detail: "227g", price: 700, stock: 10, enabled: true, kind: "beans" }],
    }] },
  }), "utf8");

  const member = (await identity.provisionCanonicalMember({
    provider: "email", subject: "phase15@example.test", persistMember: async () => undefined,
  })).member.memberId;
  const item = {
    itemId: "coffee-a-half", packageWeight: "half-pound" as const,
    quantity: 1, roast: "medium", unitPrice: 700,
    components: [{ productId: "coffee-a", weightHalfPounds: 1 as const }],
  };
  const subscription = await commerce.createSubscription({
    memberId: member, startedFromOrderId: "phase15-first", anchorDate: "2026-08-27",
    intervalDays: 30, shippingMethod: "711_cod",
    storeSelection: { storeId: "123456", storeName: "Test store" },
    defaultItems: [item], idempotencyKey: "phase15-sub", now: t0,
    stateFilePath, rulesFilePath,
  });
  await commerce.activateSubscriptionFromPickup({
    subscriptionId: subscription.subscriptionId, orderId: "phase15-first",
    idempotencyKey: "phase15-activate", now: t0, stateFilePath, rulesFilePath,
  });

  const defaultCycle = await commerce.generateSubscriptionCycle({
    subscriptionId: subscription.subscriptionId, sequence: 1, plannedDate: "2026-09-28",
    idempotencyKey: "phase15-default-cycle", now: t0, stateFilePath, rulesFilePath,
  });
  const defaultLocked = await commerce.lockSubscriptionCycle({
    cycleId: defaultCycle.cycleId, shipping: 999, idempotencyKey: "phase15-default-lock",
    now: t0, stateFilePath, rulesFilePath,
  });
  assert.equal(defaultLocked.pricingSnapshot?.shipping, 0);
  console.log("PASS default 60/60 cycle lock ignores caller shipping");

  await saveShippingRules(80, 60, t1);
  const scheduledCycle = await commerce.generateSubscriptionCycle({
    subscriptionId: subscription.subscriptionId, sequence: 2, plannedDate: "2026-08-31",
    idempotencyKey: "phase15-scheduled-cycle", now: t2, stateFilePath, rulesFilePath,
  });
  const locked = await commerce.lockSubscriptionCycle({
    cycleId: scheduledCycle.cycleId, shipping: 999, idempotencyKey: "phase15-scheduled-lock",
    now: t2, stateFilePath, rulesFilePath,
  });
  assert.equal(locked.pricingSnapshot?.shipping, 20);
  assert.equal(locked.pricingSnapshot?.finalAmount, 685);
  assert.equal(locked.shippingSnapshot?.method, "711_cod");
  const lockedSnapshot = structuredClone(locked.pricingSnapshot);
  const shippingSnapshot = structuredClone(locked.shippingSnapshot);
  console.log("PASS lock stores 80 minus 60 as NT$20 and final amount NT$685");

  const manualCycle = await commerce.generateSubscriptionCycle({
    subscriptionId: subscription.subscriptionId, sequence: 3, plannedDate: "2026-10-01",
    kind: "manual_replenishment", idempotencyKey: "phase15-manual-cycle",
    now: t2, stateFilePath, rulesFilePath,
  });
  const manualLocked = await commerce.lockSubscriptionCycle({
    cycleId: manualCycle.cycleId, idempotencyKey: "phase15-manual-lock",
    now: t2, stateFilePath, rulesFilePath,
  });
  assert.equal(manualLocked.pricingSnapshot?.shipping, 20);
  console.log("PASS manual replenishment cycle uses the same lock rule");

  await saveShippingRules(60, 100, t3);
  const relocked = await commerce.lockSubscriptionCycle({
    cycleId: locked.cycleId, idempotencyKey: "phase15-scheduled-lock",
    now: t4, stateFilePath, rulesFilePath,
  });
  assert.deepEqual(relocked.pricingSnapshot, lockedSnapshot);
  assert.deepEqual(relocked.shippingSnapshot, shippingSnapshot);
  const futureCycle = await commerce.generateSubscriptionCycle({
    subscriptionId: subscription.subscriptionId, sequence: 4, plannedDate: "2026-11-01",
    idempotencyKey: "phase15-future-cycle", now: t4, stateFilePath, rulesFilePath,
  });
  const futureLocked = await commerce.lockSubscriptionCycle({
    cycleId: futureCycle.cycleId, idempotencyKey: "phase15-future-lock",
    now: t4, stateFilePath, rulesFilePath,
  });
  assert.equal(futureLocked.pricingSnapshot?.shipping, 0);
  console.log("PASS Admin change leaves locked cycle intact and affects next lock");

  const result = await scheduler.runSubscriptionOrderScheduler({
    today: "2026-08-28", now: t4, stateFilePath, rulesFilePath,
    orderDir, websiteFilePath,
  });
  assert.equal(result.failed, 0);
  assert.equal(result.created, 1);
  const orderNumber = result.items.find((entry) => entry.cycleId === locked.cycleId)?.orderNumber;
  assert.ok(orderNumber);
  const order = JSON.parse(await readFile(path.join(orderDir, `${orderNumber}.json`), "utf8"));
  assert.equal(order.shipping, 20);
  assert.equal(order.total, 685);
  assert.equal(order.pricingSnapshot.shipping, 20);
  assert.deepEqual(order.shippingSnapshot, shippingSnapshot);
  console.log("PASS scheduler order uses locked shipping after Admin rules change");

  const studioSubscription = await commerce.createSubscription({
    memberId: member, startedFromOrderId: "phase15-studio-first", anchorDate: "2026-08-27",
    intervalDays: 30, shippingMethod: "studio_pickup", defaultItems: [item],
    idempotencyKey: "phase15-studio-sub", now: t4, stateFilePath, rulesFilePath,
  });
  await commerce.activateSubscriptionFromPickup({
    subscriptionId: studioSubscription.subscriptionId, orderId: "phase15-studio-first",
    idempotencyKey: "phase15-studio-activate", now: t4, stateFilePath, rulesFilePath,
  });
  const studioCycle = await commerce.generateSubscriptionCycle({
    subscriptionId: studioSubscription.subscriptionId, sequence: 1, plannedDate: "2026-10-01",
    idempotencyKey: "phase15-studio-cycle", now: t4, stateFilePath, rulesFilePath,
  });
  const studioLocked = await commerce.lockSubscriptionCycle({
    cycleId: studioCycle.cycleId, shipping: 999, idempotencyKey: "phase15-studio-lock",
    now: t4, stateFilePath, rulesFilePath,
  });
  assert.equal(studioLocked.pricingSnapshot?.shipping, 0);
  console.log("PASS studio pickup lock always charges NT$0");
} finally {
  await rm(testRoot, { recursive: true, force: true });
}
