import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const testRoot = await mkdtemp(path.join(os.tmpdir(), "kd-phase-j5d4f2h3-"));
  process.env.KD_DATA_DIR = testRoot;
  process.env.AUTH_SESSION_SECRET = "phase-j5d4f2h3-isolated-test-secret";

  const commerce = await import("../lib/membershipCommerce");
  const editor = await import("../components/member/memberSubscriptionEditorModel");
  const identity = await import("../lib/memberIdentity");
  const pricing = await import("../lib/orderPricing");
  const roastPolicy = await import("../lib/subscriptionRoastPolicy");
  const rulesModule = await import("../lib/membershipBusinessRules");
  const skuModel = await import("../lib/subscriptionSkuModel");
  const now = new Date("2026-09-10T02:00:00.000Z");
  const stateFilePath = path.join(testRoot, "membership-commerce", "commerce-state.json");
  const rulesFilePath = path.join(testRoot, "membership-commerce", "business-rules.json");
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

  const products = [
    { id: "monet", name: "莫內花語", roast: "中焙", options: [{ skuId: "monet-bean", kind: "beans" as const, label: "半磅咖啡豆", detail: "227g", price: 700 }] },
    { id: "giotto", name: "喬托・初醒", roast: "淺中焙", options: [{ skuId: "giotto-bean", kind: "beans" as const, label: "半磅咖啡豆", detail: "227g", price: 800 }, { skuId: "giotto-drip", kind: "drip" as const, label: "耳掛咖啡・10入", detail: "每包 12g", price: 500 }] },
  ];
  const website = {
    version: 1,
    updatedAt: now.toISOString(),
    campaign: {},
    menu: {
      monthLabel: "test",
      title: "test",
      intro: "test",
      products: products.map((product) => ({ active: true, status: "active", purchasable: true, slug: product.id, name: product.name, roast: product.roast, purchase: [], skus: product.options.map((option) => ({ id: option.skuId, kind: option.kind, label: option.label, detail: option.detail, price: option.price, enabled: true, stock: 40 })) })),
    },
  } as unknown as import("../data/websiteData").WebsiteData;
  const isolatedRules = structuredClone(rulesModule.DEFAULT_MEMBERSHIP_RULES);
  isolatedRules.subscription.preparationLeadDays = 1;
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: 0, rules: isolatedRules, now: new Date("2026-09-10T00:00:00.000Z") }, rulesFilePath);
  const rules = (await rulesModule.getActiveMembershipRules(now, rulesFilePath)).rules;
  const permissiveRules = { ...rules, subscription: { ...rules.subscription, allowQuantityChange: true, allowOtherSubscriptionProducts: true, allowHalfToOnePound: true, allowOneToHalfPound: true, allowMixedOnePound: true } };

  const half = (productId: string, skuId: string, quantity: number, dedicated = false) => ({ skuKind: "beans", packageWeight: "half-pound", quantity, roast: "淺焙", components: [{ productId, skuId, ...(dedicated ? { customRoast: true, roastLevel: "中深焙" } : {}) }] });
  const one = (productA: string, skuA: string, productB: string, skuB: string, quantity: number, dedicatedProduct?: string) => ({ skuKind: "beans", packageWeight: "one-pound", quantity, roast: "淺焙", components: [{ productId: productA, skuId: skuA, ...(dedicatedProduct === productA ? { customRoast: true, roastLevel: "中深焙" } : {}) }, { productId: productB, skuId: skuB, ...(dedicatedProduct === productB ? { customRoast: true, roastLevel: "中深焙" } : {}) }] });
  const drip = { skuKind: "drip", productId: "giotto", skuId: "giotto-drip", quantity: 8 };

  try {
    const totals = (items: unknown[]) => roastPolicy.subscriptionBeanHalfPoundUnitsByProduct(skuModel.resolveMemberSubscriptionItems({ items, currentItems: [], website, rules: permissiveRules }));
    check("half-pound x1 uses default roast and is not dedicated-roast eligible", (totals([half("monet", "monet-bean", 1)]).get("monet") ?? 0) === 1);
    check("half-pound x3 is not eligible", (totals([half("monet", "monet-bean", 3)]).get("monet") ?? 0) === 3);
    check("half-pound x4 of the same product is eligible", (totals([half("monet", "monet-bean", 4)]).get("monet") ?? 0) === 4);
    check("one-pound A+A quantity 1 is not eligible", (totals([one("monet", "monet-bean", "monet", "monet-bean", 1)]).get("monet") ?? 0) === 2);
    check("one-pound A+A quantity 2 is eligible", (totals([one("monet", "monet-bean", "monet", "monet-bean", 2)]).get("monet") ?? 0) === 4);
    const mixedTotals = totals([one("monet", "monet-bean", "giotto", "giotto-bean", 2)]);
    check("one-pound A+B quantity 2 leaves each product below eligibility", mixedTotals.get("monet") === 2 && mixedTotals.get("giotto") === 2);
    check("the same product across multiple rows accumulates four half-pound units", totals([half("monet", "monet-bean", 2), one("monet", "monet-bean", "monet", "monet-bean", 1)]).get("monet") === 4);
    const separateTotals = totals([half("monet", "monet-bean", 2), half("giotto", "giotto-bean", 2)]);
    check("different products are never combined for eligibility", separateTotals.get("monet") === 2 && separateTotals.get("giotto") === 2);
    check("drip never contributes dedicated-roast eligibility", totals([drip]).size === 0);

    await rejects("forged dedicated roast below two pounds is rejected server-side", () => skuModel.resolveMemberSubscriptionItems({ items: [half("monet", "monet-bean", 3, true)], currentItems: [], website, rules: permissiveRules }));
    const qualifyingDedicated = skuModel.resolveMemberSubscriptionItems({ items: [half("monet", "monet-bean", 4, true)], currentItems: [], website, rules: permissiveRules });
    check("qualifying same-product dedicated roast is accepted", qualifyingDedicated[0].skuKind === "beans" && qualifyingDedicated[0].components[0].customRoast === true && qualifyingDedicated[0].components[0].roastLevel === "中深焙");
    const splitDedicated = skuModel.resolveMemberSubscriptionItems({ items: [half("monet", "monet-bean", 2, true), one("monet", "monet-bean", "monet", "monet-bean", 1, "monet")], currentItems: [], website, rules: permissiveRules });
    const splitRequested = skuModel.subscriptionItemsToRequestedItems(splitDedicated, website);
    const splitPriced = pricing.priceOrderFromWebsiteData(website, splitRequested);
    check("canonical pricing accepts four same-product half-pound demands split across subscription rows", splitRequested.reduce((sum, item) => sum + item.quantity, 0) === 4 && splitPriced.skuDemand[0].skuId === "monet-bean" && splitPriced.skuDemand[0].required === 4 && splitPriced.priced.items.every((item) => item.customRoast && item.roastLevel === "中深焙"));
    const defaultRoast = skuModel.resolveMemberSubscriptionItems({ items: [half("monet", "monet-bean", 1)], currentItems: [], website, rules: permissiveRules });
    check("server preserves configured default roast when dedicated roast is not selected", defaultRoast[0].skuKind === "beans" && defaultRoast[0].roast === "中焙" && !defaultRoast[0].components[0].customRoast);

    check("dedicated roast with at least three days needs no warning", !roastPolicy.dedicatedRoastRushRequired({ hasDedicatedRoast: true, today: "2026-09-10", plannedDate: "2026-09-13" }));
    check("dedicated roast with fewer than three days requires a warning", roastPolicy.dedicatedRoastRushRequired({ hasDedicatedRoast: true, today: "2026-09-10", plannedDate: "2026-09-12" }));

    const memberId = (await identity.provisionCanonicalMember({ provider: "email", subject: "j5d4f2h3@example.test", persistMember: async () => undefined })).member.memberId;
    const subscription = await commerce.createSubscription({ memberId, startedFromOrderId: "first-h3", anchorDate: "2026-09-12", intervalDays: 30, shippingMethod: "studio_pickup", defaultItems: defaultRoast, idempotencyKey: "subscription-h3", now, stateFilePath, rulesFilePath });
    await commerce.activateSubscriptionFromPickup({ subscriptionId: subscription.subscriptionId, orderId: "first-h3", idempotencyKey: "activate-h3", now, stateFilePath, rulesFilePath });
    const rushItemCycle = await commerce.generateSubscriptionCycle({ subscriptionId: subscription.subscriptionId, sequence: 1, plannedDate: "2026-09-12", idempotencyKey: "cycle-rush-items", now, stateFilePath, rulesFilePath });
    await rejects("rush item update requires explicit customer acknowledgement", () => commerce.updateCycleItems({ memberId, cycleId: rushItemCycle.cycleId, expectedRevision: rushItemCycle.revision, items: qualifyingDedicated, idempotencyKey: "rush-items-no-ack", now, stateFilePath }));
    const acknowledgedItemsCycle = await commerce.updateCycleItems({ memberId, cycleId: rushItemCycle.cycleId, expectedRevision: rushItemCycle.revision, items: qualifyingDedicated, rushWarningAcknowledged: true, idempotencyKey: "rush-items-ack", now, stateFilePath });
    check("customer acknowledgement allows rush dedicated-roast submission", Boolean(acknowledgedItemsCycle.dedicatedRoastRush?.acknowledgedAt));

    const dateCycle = await commerce.generateSubscriptionCycle({ subscriptionId: subscription.subscriptionId, sequence: 2, plannedDate: "2026-09-17", idempotencyKey: "cycle-rush-date", now, stateFilePath, rulesFilePath });
    const dedicatedDateCycle = await commerce.updateCycleItems({ memberId, cycleId: dateCycle.cycleId, expectedRevision: dateCycle.revision, items: qualifyingDedicated, idempotencyKey: "date-items", now, stateFilePath });
    await rejects("general preparation hard minimum still applies before the dedicated-roast warning", () => commerce.modifyCycleDate({ memberId, cycleId: dedicatedDateCycle.cycleId, expectedRevision: dedicatedDateCycle.revision, plannedDate: "2026-09-10", recalculateAnchor: false, rushWarningAcknowledged: true, idempotencyKey: "date-general-minimum", now, stateFilePath, rulesFilePath }));
    await rejects("changing a dedicated-roast cycle from standard timing to two days triggers the same acknowledgement gate", () => commerce.modifyCycleDate({ memberId, cycleId: dedicatedDateCycle.cycleId, expectedRevision: dedicatedDateCycle.revision, plannedDate: "2026-09-12", recalculateAnchor: false, idempotencyKey: "date-rush-no-ack", now, stateFilePath, rulesFilePath }));
    const rushDateCycle = await commerce.modifyCycleDate({ memberId, cycleId: dedicatedDateCycle.cycleId, expectedRevision: dedicatedDateCycle.revision, plannedDate: "2026-09-12", recalculateAnchor: false, rushWarningAcknowledged: true, idempotencyKey: "date-rush-ack", now, stateFilePath, rulesFilePath });
    check("fewer than three days is accepted after acknowledgement instead of hard rejection", rushDateCycle.plannedDate === "2026-09-12" && rushDateCycle.dedicatedRoastRush?.standardPreparationDays === 3);

    const operationalCycle = await commerce.generateSubscriptionCycle({ subscriptionId: subscription.subscriptionId, sequence: 3, plannedDate: "2026-09-12", idempotencyKey: "cycle-rush-operational", now, stateFilePath, rulesFilePath });
    const operationalWithoutMemberAck = await commerce.updateCycleItems({ cycleId: operationalCycle.cycleId, expectedRevision: operationalCycle.revision, items: qualifyingDedicated, idempotencyKey: "rush-operational-no-member", now, stateFilePath });
    check("server-derived rush marker remains operationally visible even when no member acknowledgement applies", operationalWithoutMemberAck.dedicatedRoastRush?.warningAcknowledged === false && !operationalWithoutMemberAck.dedicatedRoastRush.acknowledgedAt);

    const operational = skuModel.subscriptionDedicatedRoastOperationalSummary(qualifyingDedicated, website, rushDateCycle.dedicatedRoastRush);
    const adminSource = await readFile(path.join(process.cwd(), "app/admin/orders/[orderNumber]/page.tsx"), "utf8");
    const schedulerSource = await readFile(path.join(process.cwd(), "lib/subscriptionOrderScheduler.ts"), "utf8");
    const memberSource = await readFile(path.join(process.cwd(), "components/member/MemberSubscriptionExperience.tsx"), "utf8");
    check("rush operational summary is explicit and visible to Admin order view", operational?.rush === true && operational.rushWarningAcknowledged === true && operational.products[0].productName === "莫內花語" && adminSource.includes("專屬烘焙・急件") && schedulerSource.includes("subscriptionDedicatedRoastOperationalSummary"));
    check("member warning dialog requires explicit acknowledgement before submission", memberSource.includes("專屬烘焙準備時間提醒") && memberSource.includes("返回修改日期") && memberSource.includes("我了解，繼續下單") && memberSource.includes("rushWarningAcknowledged"));

    const editorRows = editor.initializeSubscriptionEditorItems(qualifyingDedicated, products);
    check("eligible editor product retains dedicated roast while drip exposes none", editor.editorDedicatedRoastProducts(editorRows, products)[0]?.customRoast === true && editor.editorDedicatedRoastProducts(editor.initializeSubscriptionEditorItems(skuModel.resolveMemberSubscriptionItems({ items: [drip], currentItems: [], website, rules: permissiveRules }), products), products).length === 0);

    console.log(`Phase J.5D.4F-2H3 subscription roast: ${count} checks PASS`);
  } finally {
    await rm(testRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
