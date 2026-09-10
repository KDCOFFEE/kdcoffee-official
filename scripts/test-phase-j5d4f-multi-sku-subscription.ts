import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const testRoot = await mkdtemp(path.join(os.tmpdir(), "kd-phase-j5d4f-"));
  process.env.KD_DATA_DIR = testRoot;
  process.env.AUTH_SESSION_SECRET = "phase-j5d4f-isolated-test-secret";

  const policies = await import("../lib/membershipPolicies");
  const skuModel = await import("../lib/subscriptionSkuModel");
  const commerce = await import("../lib/membershipCommerce");
  const identity = await import("../lib/memberIdentity");
  const scheduler = await import("../lib/subscriptionOrderScheduler");
  const storage = await import("../lib/storagePaths");
  const rulesModule = await import("../lib/membershipBusinessRules");

  const now = new Date("2026-08-28T02:00:00.000Z");
  const stateFilePath = path.join(testRoot, "membership-commerce", "commerce-state.json");
  const rulesFilePath = path.join(testRoot, "membership-commerce", "business-rules.json");
  const websiteFilePath = path.join(testRoot, "website-data.json");
  const orderDir = storage.getOrdersDir();
  let count = 0;

  function check(name: string, condition: unknown) {
    assert.ok(condition, name);
    count += 1;
    console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
  }

  async function rejects(name: string, operation: () => unknown | Promise<unknown>) {
    await assert.rejects(async () => operation(), name);
    count += 1;
    console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
  }

  const website = {
    version: 1,
    updatedAt: now.toISOString(),
    campaign: { enabled: false, eyebrow: "", title: "", description: "", details: [], ctaLabel: "", ctaHref: "", secondaryLabel: "", secondaryHref: "", note: "" },
    menu: {
      monthLabel: "test",
      title: "test",
      intro: "test",
      products: [
        {
          active: true, status: "active", purchasable: true, slug: "coffee-a", name: "Coffee A", stock: 60,
          purchase: [],
          skus: [
            { id: "bean-a", label: "A 半磅咖啡豆", detail: "227g", price: 700, stock: 30, enabled: true, kind: "beans" },
            { id: "drip-a", label: "A 耳掛咖啡", detail: "10 包", price: 500, stock: 30, enabled: true, kind: "drip" },
          ],
        },
        {
          active: true, status: "active", purchasable: true, slug: "coffee-b", name: "Coffee B", stock: 60,
          purchase: [],
          skus: [
            { id: "bean-b", label: "B 半磅咖啡豆", detail: "227g", price: 800, stock: 30, enabled: true, kind: "beans" },
            { id: "drip-b", label: "B 耳掛咖啡", detail: "10 包", price: 550, stock: 30, enabled: true, kind: "drip" },
          ],
        },
      ],
    },
  } as unknown as import("../data/websiteData").WebsiteData;

  const legacyHalf = { itemId: "legacy-half", packageWeight: "half-pound" as const, quantity: 1, roast: "淺中焙", components: [{ productId: "coffee-a", weightHalfPounds: 1 as const }], unitPrice: 700 };
  const legacyOne = { itemId: "legacy-one", packageWeight: "one-pound" as const, quantity: 2, roast: "淺中焙", components: [{ productId: "coffee-a", weightHalfPounds: 1 as const }, { productId: "coffee-b", weightHalfPounds: 1 as const }], unitPrice: 1500 };
  const beanHalf = { itemId: "bean-half", skuKind: "beans" as const, packageWeight: "half-pound" as const, quantity: 1, roast: "淺中焙", components: [{ productId: "coffee-a", skuId: "bean-a", weightHalfPounds: 1 as const }], unitPrice: 700 };
  const beanAA = { itemId: "bean-aa", skuKind: "beans" as const, packageWeight: "one-pound" as const, quantity: 2, roast: "淺中焙", components: [{ productId: "coffee-a", skuId: "bean-a", weightHalfPounds: 1 as const }, { productId: "coffee-a", skuId: "bean-a", weightHalfPounds: 1 as const }], unitPrice: 1400 };
  const beanAB = { itemId: "bean-ab", skuKind: "beans" as const, packageWeight: "one-pound" as const, quantity: 3, roast: "淺中焙", components: [{ productId: "coffee-a", skuId: "bean-a", weightHalfPounds: 1 as const }, { productId: "coffee-b", skuId: "bean-b", weightHalfPounds: 1 as const }], unitPrice: 1500 };
  const drip = { itemId: "drip-a", skuKind: "drip" as const, productId: "coffee-a", skuId: "drip-a", quantity: 4, unitPrice: 500 };

  try {
    await mkdir(orderDir, { recursive: true });
    await writeFile(websiteFilePath, JSON.stringify(website, null, 2), "utf8");
    const rules = (await rulesModule.getActiveMembershipRules(now, rulesFilePath)).rules;

    check("legacy half-pound item validates as beans", policies.isBeanSubscriptionItem(policies.validateSubscriptionItem(legacyHalf)));
    check("legacy one-pound item validates as beans", policies.validateSubscriptionItem(legacyOne).components.length === 2);
    check("new beans item with component skuId validates", policies.validateSubscriptionItem(beanHalf).components[0].skuId === "bean-a");
    check("drip item validates without bean fields", policies.validateSubscriptionItem(drip).skuKind === "drip");
    await rejects("drip without skuId is rejected", () => policies.validateSubscriptionItem({ itemId: "bad-drip", skuKind: "drip", productId: "coffee-a", skuId: "", quantity: 1 }));
    check("drip contributes zero bean gift quantity", policies.giftQuantityForItems([drip], rules) === 0);
    check("half-pound bean gift quantity is unchanged", policies.giftQuantityForItems([legacyHalf], rules) === rules.gift.halfPoundQuantity);
    check("one-pound bean gift quantity is unchanged", policies.giftQuantityForItems([legacyOne], rules) === legacyOne.quantity * rules.gift.onePoundQuantity);

    const checkoutItems = skuModel.subscriptionItemsFromStoredOrderItems([
      { slug: "coffee-a", optionId: "bean-a", optionLabel: "偽造耳掛標籤", unitPrice: 700, quantity: 1, preparationLabel: "咖啡豆" },
      { slug: "coffee-b", optionId: "drip-b", optionLabel: "偽造半磅標籤", unitPrice: 550, quantity: 2 },
    ], website);
    check("checkout conversion preserves actual beans SKU kind", checkoutItems[0].skuKind === "beans" && policies.isBeanSubscriptionItem(checkoutItems[0]) && checkoutItems[0].components[0].skuId === "bean-a");
    check("checkout conversion preserves actual drip SKU kind", checkoutItems[1].skuKind === "drip" && checkoutItems[1].skuId === "drip-b");

    const halfDemand = skuModel.subscriptionItemsToRequestedItems([beanHalf], website);
    check("scheduler converts half-pound to exact bean SKU", halfDemand.length === 1 && halfDemand[0].optionId === "bean-a" && halfDemand[0].quantity === 1);
    const aaDemand = skuModel.subscriptionItemsToRequestedItems([beanAA], website);
    check("scheduler converts one-pound A+A with quantity on both components", aaDemand.length === 2 && aaDemand.every((item) => item.optionId === "bean-a" && item.quantity === 2));
    const abDemand = skuModel.subscriptionItemsToRequestedItems([beanAB], website);
    check("scheduler converts one-pound A+B to both exact bean SKUs", abDemand.map((item) => item.optionId).join("+") === "bean-a+bean-b" && abDemand.every((item) => item.quantity === 3));
    const dripDemand = skuModel.subscriptionItemsToRequestedItems([drip], website);
    check("scheduler converts drip to exact drip SKU demand", dripDemand.length === 1 && dripDemand[0].optionId === "drip-a" && dripDemand[0].quantity === 4);
    const mixedDemand = skuModel.subscriptionItemsToRequestedItems([beanHalf, beanAB, drip], website);
    check("mixed beans and drip delivery produces all component demands", mixedDemand.length === 4);
    check("drip scheduler path never selects a bean SKU", dripDemand.every((item) => item.optionId === "drip-a"));
    const legacyDemand = skuModel.subscriptionItemsToRequestedItems([legacyHalf], website);
    check("legacy beans without component skuId use unique enabled bean fallback", legacyDemand[0].optionId === "bean-a");

    const memberItems = skuModel.resolveMemberSubscriptionItems({
      items: [
        { skuKind: "beans", packageWeight: "half-pound", quantity: 2, roast: "淺中焙", components: [{ productId: "coffee-b", skuId: "bean-b" }] },
        { skuKind: "drip", productId: "coffee-a", skuId: "drip-a", quantity: 3, unitPrice: 1 },
      ],
      currentItems: [beanHalf],
      website,
      rules,
    });
    check("member items contract accepts multiple explicit SKU kinds", memberItems.length === 2 && memberItems[0].skuKind === "beans" && memberItems[1].skuKind === "drip");
    check("member item prices come from live SKUs, not client price", memberItems[0].unitPrice === 800 && memberItems[1].unitPrice === 500);

    const memberId = (await identity.provisionCanonicalMember({ provider: "email", subject: "j5d4f@example.test", persistMember: async () => undefined })).member.memberId;
    const subscription = await commerce.createSubscription({
      memberId,
      startedFromOrderId: "first-j5d4f",
      anchorDate: "2026-08-31",
      intervalDays: 30,
      shippingMethod: "studio_pickup",
      defaultItems: [beanHalf, beanAA, beanAB, drip],
      idempotencyKey: "sub-j5d4f",
      now,
      stateFilePath,
      rulesFilePath,
    });
    await commerce.activateSubscriptionFromPickup({ subscriptionId: subscription.subscriptionId, orderId: "first-j5d4f", idempotencyKey: "activate-j5d4f", now, stateFilePath, rulesFilePath });
    const cycle = await commerce.generateSubscriptionCycle({ subscriptionId: subscription.subscriptionId, sequence: 1, plannedDate: "2026-08-31", idempotencyKey: "cycle-j5d4f", now, stateFilePath, rulesFilePath });
    const result = await scheduler.runSubscriptionOrderScheduler({ today: "2026-08-28", now, stateFilePath, rulesFilePath, orderDir, websiteFilePath });
    check("mixed delivery creates one scheduled order", result.created === 1 && result.failed === 0);

    const orderFiles = (await readdir(orderDir)).filter((file) => file.endsWith(".json"));
    const order = JSON.parse(await readFile(path.join(orderDir, orderFiles[0]), "utf8"));
    const demandBySku = new Map(order.inventoryTransaction.changes.map((change: { skuId: string; demand: number }) => [change.skuId, change.demand]));
    check("inventory transaction aggregates exact bean component quantities", demandBySku.get("bean-a") === 8 && demandBySku.get("bean-b") === 3);
    check("inventory transaction uses exact drip SKU quantity", demandBySku.get("drip-a") === 4 && !demandBySku.has("drip-b"));
    check("scheduled drip display is not encoded as fake beans", order.items.some((item: Record<string, unknown>) => item.skuKind === "drip" && item.name === "Coffee A" && item.optionId === "drip-a" && !("components" in item)));
    const lockedState = await commerce.readMembershipCommerceState(stateFilePath);
    const expectedOriginal = [beanHalf, beanAA, beanAB, drip].reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    check("pricing subtotal remains unitPrice multiplied by quantity", lockedState.cycles[cycle.cycleId].pricingSnapshot?.merchandiseOriginal === expectedOriginal);
    check("runInventoryOrderTransaction metadata is the stock mutation record", order.inventoryTransaction.state === "inventory_committed" && order.inventoryTransaction.changes.length === 3);

    const invalidSubscription = await commerce.createSubscription({
      memberId,
      startedFromOrderId: "first-invalid-sku",
      anchorDate: "2026-08-31",
      intervalDays: 30,
      shippingMethod: "studio_pickup",
      defaultItems: [{ itemId: "missing-live-sku", skuKind: "drip", productId: "coffee-a", skuId: "missing-drip", quantity: 1, unitPrice: 500 }],
      idempotencyKey: "sub-invalid-sku",
      now,
      stateFilePath,
      rulesFilePath,
    });
    await commerce.activateSubscriptionFromPickup({ subscriptionId: invalidSubscription.subscriptionId, orderId: "first-invalid-sku", idempotencyKey: "activate-invalid-sku", now, stateFilePath, rulesFilePath });
    await commerce.generateSubscriptionCycle({ subscriptionId: invalidSubscription.subscriptionId, sequence: 1, plannedDate: "2026-08-31", idempotencyKey: "cycle-invalid-sku", now, stateFilePath, rulesFilePath });
    const beforeInvalidFiles = (await readdir(orderDir)).filter((file) => file.endsWith(".json")).length;
    const invalidResult = await scheduler.runSubscriptionOrderScheduler({ today: "2026-08-28", now, stateFilePath, rulesFilePath, orderDir, websiteFilePath });
    const afterInvalidFiles = (await readdir(orderDir)).filter((file) => file.endsWith(".json")).length;
    check("missing live SKU fails safely without order creation", invalidResult.failed === 1 && beforeInvalidFiles === afterInvalidFiles);

    console.log(`Phase J.5D.4F multi-SKU subscription: ${count} checks PASS`);
  } finally {
    await rm(testRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
