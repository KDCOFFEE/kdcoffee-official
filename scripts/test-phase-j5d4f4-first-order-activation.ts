import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const testRoot = await mkdtemp(path.join(os.tmpdir(), "kd-phase-j5d4f4-"));
  process.env.KD_DATA_DIR = testRoot;
  process.env.AUTH_SESSION_SECRET = "phase-j5d4f4-isolated-test-secret";

  const commerce = await import("../lib/membershipCommerce");
  const fulfillment = await import("../lib/fulfillment");
  const identity = await import("../lib/memberIdentity");
  const rules = await import("../lib/membershipBusinessRules");
  const scheduler = await import("../lib/subscriptionOrderScheduler");
  const storage = await import("../lib/storagePaths");
  const editor = await import("../components/member/memberSubscriptionEditorModel");

  const stateFilePath = path.join(testRoot, "membership-commerce", "commerce-state.json");
  const rulesFilePath = path.join(testRoot, "membership-commerce", "business-rules.json");
  const websiteFilePath = path.join(testRoot, "website-data.json");
  const orderDir = storage.getOrdersDir();
  const completionAt = new Date("2026-09-15T04:00:00.000Z");
  let count = 0;

  function check(name: string, condition: unknown) {
    assert.ok(condition, name);
    count += 1;
    console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
  }

  const beanItem = {
    itemId: "beans:half-pound:coffee-a-01",
    skuKind: "beans" as const,
    packageWeight: "half-pound" as const,
    quantity: 4,
    roast: "淺中焙",
    components: [{
      productId: "coffee-a",
      skuId: "coffee-a-01",
      weightHalfPounds: 1 as const,
      customRoast: true,
      roastLevel: "中深焙",
    }],
    unitPrice: 700,
  };
  const dripItem = {
    itemId: "drip:coffee-b:coffee-b-02",
    skuKind: "drip" as const,
    productId: "coffee-b",
    skuId: "coffee-b-02",
    quantity: 1,
    unitPrice: 500,
  };
  const defaultItems = [beanItem, dripItem];

  async function member(subject: string) {
    return (await identity.provisionCanonicalMember({
      provider: "email",
      subject,
      persistMember: async () => undefined,
    })).member.memberId;
  }

  try {
    await mkdir(orderDir, { recursive: true });
    const initialRules = await rules.readMembershipRulesStore(rulesFilePath);
    const configuredRules = structuredClone(initialRules.versions[0].rules);
    configuredRules.subscription.preparationLeadDays = 3;
    configuredRules.subscription.modificationCutoffDays = 7;
    configuredRules.subscription.orderCreationLeadDays = 1;
    configuredRules.subscription.discountPercent = 95;
    configuredRules.subscription.customCycleEnabled = true;
    configuredRules.subscription.customCycleMinDays = 1;
    configuredRules.shipping.subscriptionFreeShipping = true;
    await rules.saveMembershipBusinessRules({
      expectedRevision: initialRules.revision,
      rules: configuredRules,
      now: new Date("2026-09-01T00:00:00.000Z"),
    }, rulesFilePath);

    await writeFile(websiteFilePath, `${JSON.stringify({
      version: 1,
      updatedAt: completionAt.toISOString(),
      menu: {
        products: [
          {
            active: true,
            status: "active",
            purchasable: true,
            slug: "coffee-a",
            name: "Coffee A",
            roast: "淺中焙",
            stock: 20,
            purchase: [{ id: "coffee-a-01", label: "半磅咖啡豆", detail: "227g", price: 700, stock: 20, enabled: true, kind: "beans" }],
            skus: [{ id: "coffee-a-01", label: "半磅咖啡豆", detail: "227g", price: 700, stock: 20, enabled: true, kind: "beans" }],
          },
          {
            active: true,
            status: "active",
            purchasable: true,
            slug: "coffee-b",
            name: "Coffee B",
            roast: "中焙",
            stock: 20,
            purchase: [{ id: "coffee-b-02", label: "耳掛咖啡", detail: "10包", price: 500, stock: 20, enabled: true, kind: "drip" }],
            skus: [{ id: "coffee-b-02", label: "耳掛咖啡", detail: "10包", price: 500, stock: 20, enabled: true, kind: "drip" }],
          },
        ],
      },
    }, null, 2)}\n`, "utf8");

    const studioMemberId = await member("j5d4f4-studio@example.test");
    const firstOrderNumber = "KD20260910-9240";
    const firstOrder = {
      orderNumber: firstOrderNumber,
      createdAt: "2026-09-10T06:26:01.492Z",
      status: "waiting_studio_pickup_confirmation",
      orderMode: "studio_pickup",
      customer: { name: "Lifecycle QA" },
      member: { memberId: studioMemberId },
      studioPickup: { preferredDate: "2026-09-15", preferredTime: "14:00" },
      items: [
        { slug: "coffee-a", optionId: "coffee-a-01", name: "Coffee A", optionLabel: "半磅咖啡豆", quantity: 4, unitPrice: 700, lineTotal: 2800 },
        { slug: "coffee-b", optionId: "coffee-b-02", name: "Coffee B", optionLabel: "耳掛咖啡", quantity: 1, unitPrice: 500, lineTotal: 500 },
      ],
      subtotal: 3300,
      shipping: 0,
      total: 3300,
      shippingSnapshot: { method: "studio_pickup", storeSelection: null },
      inventoryTransaction: { state: "inventory_committed", transactionId: "inventory-first-order" },
      fulfillmentEvents: [{ eventId: "preexisting-history", state: "order_created", occurredAt: "2026-09-10T06:26:01.492Z" }],
    };
    await writeFile(path.join(orderDir, `${firstOrderNumber}.json`), `${JSON.stringify(firstOrder, null, 2)}\n`, "utf8");
    const immutableOrderSnapshot = {
      items: structuredClone(firstOrder.items),
      subtotal: firstOrder.subtotal,
      shipping: firstOrder.shipping,
      total: firstOrder.total,
      orderMode: firstOrder.orderMode,
      studioPickup: structuredClone(firstOrder.studioPickup),
      shippingSnapshot: structuredClone(firstOrder.shippingSnapshot),
      inventoryTransaction: structuredClone(firstOrder.inventoryTransaction),
      originalFulfillmentHistory: structuredClone(firstOrder.fulfillmentEvents),
    };

    const pending = await commerce.createSubscription({
      memberId: studioMemberId,
      startedFromOrderId: firstOrderNumber,
      anchorDate: "2026-09-11",
      intervalDays: 1,
      shippingMethod: "studio_pickup",
      defaultItems,
      idempotencyKey: "create-studio-first-order",
      now: new Date("2026-09-10T06:26:01.492Z"),
      stateFilePath,
      rulesFilePath,
    });

    await fulfillment.recordAdminFulfillmentEvent({
      orderId: firstOrderNumber,
      state: "preparing",
      expectedRevision: 0,
      now: new Date("2026-09-14T04:00:00.000Z"),
    });
    await fulfillment.recordAdminFulfillmentEvent({
      orderId: firstOrderNumber,
      state: "ready_for_store_pickup",
      expectedRevision: 1,
      now: new Date("2026-09-15T03:00:00.000Z"),
    });
    await fulfillment.recordAdminFulfillmentEvent({
      orderId: firstOrderNumber,
      state: "completed",
      expectedRevision: 2,
      confirmed: true,
      now: completionAt,
    });

    let state = await commerce.readMembershipCommerceState(stateFilePath);
    const activated = state.subscriptions[pending.subscriptionId];
    let studioCycles = Object.values(state.cycles).filter((cycle) => cycle.subscriptionId === pending.subscriptionId && cycle.kind === "scheduled");
    let firstCycle = studioCycles[0];
    check("pending activation becomes active after the first order completes", activated.status === "active");
    check("activation anchor uses the Taipei completion date", activated.anchorDate === "2026-09-15");
    check("intervalDays=1 produces a first recurring plannedDate on 2026-09-16", firstCycle?.plannedDate === "2026-09-16");
    check("first recurring editable cycle is created automatically", studioCycles.length === 1 && firstCycle.status === "modifiable" && firstCycle.createdOrderId === null);
    check("first cycle uses canonical modification and order-creation dates", firstCycle.modificationDeadline === "2026-09-09" && firstCycle.orderCreationDate === "2026-09-15");
    check("editable cycle keeps pricing inputs while lock-time snapshots remain deferred", firstCycle.itemsDraft.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) === 3300 && firstCycle.itemsSnapshot === null && firstCycle.pricingSnapshot === null && firstCycle.shippingSnapshot === null);

    const dashboard = await commerce.getMemberCommerceDashboard(studioMemberId, completionAt, stateFilePath);
    const dashboardCycle = dashboard.cycles.find((cycle) => cycle.subscriptionId === pending.subscriptionId && ["scheduled", "modifiable"].includes(cycle.status));
    const preview = editor.subscriptionPrice(dashboardCycle!.itemsDraft.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), configuredRules.subscription.discountPercent);
    check("dashboard receives the recurring cycle and can calculate its NT$3,135 preview", dashboardCycle?.cycleId === firstCycle.cycleId && preview === 3135);
    check("studio pickup future settings remain unchanged", activated.shippingMethod === "studio_pickup" && activated.storeSelection === null);
    check("multi-SKU items are preserved in the first recurring cycle", firstCycle.itemsDraft.length === 2 && firstCycle.itemsDraft[0].itemId === beanItem.itemId && firstCycle.itemsDraft[1].itemId === dripItem.itemId);
    check("dedicated roast data and its soft rush warning are preserved", firstCycle.itemsDraft[0].skuKind === "beans" && firstCycle.itemsDraft[0].components[0].customRoast === true && firstCycle.itemsDraft[0].components[0].roastLevel === "中深焙" && firstCycle.dedicatedRoastRush?.warningAcknowledged === false);

    const completedOrder = JSON.parse(await readFile(path.join(orderDir, `${firstOrderNumber}.json`), "utf8"));
    check("first order reaches the normal completed fulfillment state", completedOrder.status === "completed" && (await fulfillment.readFulfillmentStore()).records[firstOrderNumber].currentState === "completed");
    check("activation preserves original order commerce and inventory snapshots", JSON.stringify({
      items: completedOrder.items,
      subtotal: completedOrder.subtotal,
      shipping: completedOrder.shipping,
      total: completedOrder.total,
      orderMode: completedOrder.orderMode,
      studioPickup: completedOrder.studioPickup,
      shippingSnapshot: completedOrder.shippingSnapshot,
      inventoryTransaction: completedOrder.inventoryTransaction,
      originalFulfillmentHistory: completedOrder.fulfillmentEvents.slice(0, 1),
    }) === JSON.stringify(immutableOrderSnapshot));

    const activationAuditCount = state.audit.filter((entry) => entry.action === "subscription-activated" && entry.entityId === pending.subscriptionId).length;
    const cycleAuditCount = state.audit.filter((entry) => entry.action === "cycle-generated" && entry.entityId === firstCycle.cycleId).length;
    await fulfillment.recordAdminFulfillmentEvent({
      orderId: firstOrderNumber,
      state: "completed",
      expectedRevision: 2,
      confirmed: true,
      now: completionAt,
    });
    state = await commerce.readMembershipCommerceState(stateFilePath);
    studioCycles = Object.values(state.cycles).filter((cycle) => cycle.subscriptionId === pending.subscriptionId && cycle.kind === "scheduled");
    check("replayed completion does not create a duplicate first cycle", studioCycles.length === 1 && studioCycles[0].cycleId === firstCycle.cycleId);
    check("replayed completion does not duplicate activation or cycle audits", state.audit.filter((entry) => entry.action === "subscription-activated" && entry.entityId === pending.subscriptionId).length === activationAuditCount && state.audit.filter((entry) => entry.action === "cycle-generated" && entry.entityId === firstCycle.cycleId).length === cycleAuditCount);

    const schedulerResult = await scheduler.runSubscriptionOrderScheduler({
      today: "2026-09-15",
      now: new Date("2026-09-15T05:00:00.000Z"),
      stateFilePath,
      rulesFilePath,
      orderDir,
      websiteFilePath,
    });
    state = await commerce.readMembershipCommerceState(stateFilePath);
    firstCycle = state.cycles[firstCycle.cycleId];
    check("existing scheduler later consumes the activation-created cycle", schedulerResult.created === 1 && firstCycle.status === "order_created" && Boolean(firstCycle.createdOrderId));
    check("scheduler lock creates canonical pricing and studio shipping snapshots", firstCycle.pricingSnapshot?.finalAmount === 3135 && firstCycle.shippingSnapshot?.method === "studio_pickup" && firstCycle.shippingSnapshot.storeSelection === null);

    const firstOrderAfterScheduler = JSON.parse(await readFile(path.join(orderDir, `${firstOrderNumber}.json`), "utf8"));
    check("scheduler does not rewrite the completed original order snapshot", JSON.stringify(firstOrderAfterScheduler.items) === JSON.stringify(immutableOrderSnapshot.items) && firstOrderAfterScheduler.total === immutableOrderSnapshot.total && firstOrderAfterScheduler.inventoryTransaction.transactionId === "inventory-first-order");

    const sevenElevenMemberId = await member("j5d4f4-711@example.test");
    const sevenElevenOrder = "KD20260910-711004";
    const sevenElevenPending = await commerce.createSubscription({
      memberId: sevenElevenMemberId,
      startedFromOrderId: sevenElevenOrder,
      anchorDate: "2026-09-11",
      intervalDays: 1,
      shippingMethod: "711_cod",
      storeSelection: { storeId: "258870", storeName: "港明" },
      defaultItems,
      idempotencyKey: "create-711-first-order",
      now: new Date("2026-09-10T06:30:00.000Z"),
      stateFilePath,
      rulesFilePath,
    });
    await commerce.handleCanonicalOrderOutcome({
      orderId: sevenElevenOrder,
      outcome: "completed",
      merchandiseAmount: 3300,
      idempotencyKey: "complete-711-first-order",
      now: completionAt,
      stateFilePath,
      rulesFilePath,
    });
    state = await commerce.readMembershipCommerceState(stateFilePath);
    const sevenElevenActive = state.subscriptions[sevenElevenPending.subscriptionId];
    const sevenElevenCycle = Object.values(state.cycles).find((cycle) => cycle.subscriptionId === sevenElevenPending.subscriptionId && cycle.kind === "scheduled")!;
    const lockedSevenEleven = await commerce.lockSubscriptionCycle({
      cycleId: sevenElevenCycle.cycleId,
      idempotencyKey: "lock-711-first-cycle",
      shipping: 0,
      now: completionAt,
      stateFilePath,
      rulesFilePath,
    });
    check("7-ELEVEN future settings survive activation", sevenElevenActive.shippingMethod === "711_cod" && sevenElevenActive.storeSelection?.storeId === "258870" && sevenElevenActive.storeSelection.storeName === "港明");
    check("7-ELEVEN shipping snapshot is created only at normal cycle lock", lockedSevenEleven.shippingSnapshot?.method === "711_cod" && lockedSevenEleven.shippingSnapshot.storeSelection?.storeId === "258870");

    const existingMemberId = await member("j5d4f4-existing@example.test");
    const existingOrder = "KD20260910-EXIST4";
    const pendingWithExistingCycle = await commerce.createSubscription({
      memberId: existingMemberId,
      startedFromOrderId: existingOrder,
      anchorDate: "2026-09-20",
      intervalDays: 30,
      shippingMethod: "studio_pickup",
      defaultItems: [dripItem],
      idempotencyKey: "create-existing-cycle-subscription",
      now: new Date("2026-09-10T07:00:00.000Z"),
      stateFilePath,
      rulesFilePath,
    });
    state = await commerce.readMembershipCommerceState(stateFilePath);
    const existingCycleId = "cycle_existing_first_recurring";
    state.cycles[existingCycleId] = {
      cycleId: existingCycleId,
      subscriptionId: pendingWithExistingCycle.subscriptionId,
      sequence: 1,
      kind: "scheduled",
      plannedDate: "2026-10-20",
      modificationDeadline: "2026-10-13",
      orderCreationDate: "2026-10-19",
      status: "modifiable",
      itemsDraft: [dripItem],
      itemsSnapshot: null,
      pricingSnapshot: null,
      giftSnapshot: null,
      shippingSnapshot: null,
      rulesSnapshot: null,
      createdOrderId: null,
      createdAt: "2026-09-10T07:00:00.000Z",
      updatedAt: "2026-09-10T07:00:00.000Z",
      revision: 0,
      modificationCount: 0,
      dedicatedRoastRush: null,
    };
    await writeFile(stateFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await commerce.handleCanonicalOrderOutcome({
      orderId: existingOrder,
      outcome: "completed",
      merchandiseAmount: 500,
      idempotencyKey: "complete-existing-cycle-subscription",
      now: completionAt,
      stateFilePath,
      rulesFilePath,
    });
    state = await commerce.readMembershipCommerceState(stateFilePath);
    const existingCycles = Object.values(state.cycles).filter((cycle) => cycle.subscriptionId === pendingWithExistingCycle.subscriptionId && cycle.kind === "scheduled");
    check("an existing first recurring cycle prevents duplicate generation", existingCycles.length === 1 && existingCycles[0].cycleId === existingCycleId && existingCycles[0].plannedDate === "2026-10-20");
    check("existing-cycle activation still refreshes the anchor to completion date", state.subscriptions[pendingWithExistingCycle.subscriptionId].status === "active" && state.subscriptions[pendingWithExistingCycle.subscriptionId].anchorDate === "2026-09-15");

    console.log(`Phase J.5D.4F-4 first-order activation lifecycle: ${count} checks PASS`);
  } finally {
    await rm(testRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
