import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const testRoot = await mkdtemp(path.join(os.tmpdir(), "kd-phase-j5d4f3-"));
  process.env.KD_DATA_DIR = testRoot;
  process.env.AUTH_SESSION_SECRET = "phase-j5d4f3-isolated-test-secret";

  const commerce = await import("../lib/membershipCommerce");
  const dashboardModel = await import("../components/member/memberSubscriptionDashboardModel");
  const editor = await import("../components/member/memberSubscriptionEditorModel");
  const identity = await import("../lib/memberIdentity");
  const stateFilePath = path.join(testRoot, "membership-commerce", "commerce-state.json");
  const rulesFilePath = path.join(testRoot, "membership-commerce", "business-rules.json");
  const t0 = new Date("2026-09-15T01:00:00.000Z");
  const t1 = new Date("2026-09-15T01:01:00.000Z");
  const t2 = new Date("2026-09-15T01:02:00.000Z");
  const t3 = new Date("2026-09-15T01:03:00.000Z");
  const t4 = new Date("2026-09-15T01:04:00.000Z");
  const t5 = new Date("2026-09-15T01:05:00.000Z");
  let count = 0;

  function check(name: string, condition: unknown) {
    assert.ok(condition, name);
    count += 1;
    console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
  }

  async function rejects(name: string, operation: () => Promise<unknown>) {
    await assert.rejects(operation, name);
    count += 1;
    console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
  }

  const products = [{
    id: "giotto",
    name: "喬托・初醒",
    roast: "淺中焙",
    options: [{ skuId: "giotto-bean", kind: "beans" as const, label: "半磅咖啡豆", detail: "227g", price: 700 }],
  }];
  const dedicatedItem = {
    itemId: "giotto-half",
    skuKind: "beans" as const,
    packageWeight: "half-pound" as const,
    quantity: 4,
    roast: "淺中焙",
    components: [{ productId: "giotto", skuId: "giotto-bean", weightHalfPounds: 1 as const, customRoast: true, roastLevel: "中深焙" }],
    unitPrice: 700,
  };

  try {
    const memberId = (await identity.provisionCanonicalMember({
      provider: "email",
      subject: "j5d4f3@example.test",
      persistMember: async () => undefined,
    })).member.memberId;

    const subscription = await commerce.createSubscription({
      memberId,
      startedFromOrderId: "first-j5d4f3",
      anchorDate: "2026-09-20",
      intervalDays: 30,
      shippingMethod: "studio_pickup",
      defaultItems: [dedicatedItem],
      idempotencyKey: "create-j5d4f3",
      now: t0,
      stateFilePath,
      rulesFilePath,
    });
    const active = await commerce.activateSubscriptionFromPickup({
      subscriptionId: subscription.subscriptionId,
      orderId: "first-j5d4f3",
      idempotencyKey: "activate-j5d4f3",
      now: t1,
      stateFilePath,
      rulesFilePath,
    });
    const manual = await commerce.generateSubscriptionCycle({
      subscriptionId: active.subscriptionId,
      sequence: 101,
      plannedDate: "2026-09-20",
      kind: "manual_replenishment",
      idempotencyKey: "manual-j5d4f3",
      now: t2,
      stateFilePath,
      rulesFilePath,
    });
    const locked = await commerce.lockSubscriptionCycle({
      cycleId: manual.cycleId,
      shipping: 0,
      idempotencyKey: "lock-j5d4f3",
      now: t2,
      stateFilePath,
      rulesFilePath,
    });

    const pendingArrangement = dashboardModel.currentSubscriptionArrangement([locked], active.subscriptionId);
    check("pending manual replenishment is visible before createdOrderId", pendingArrangement?.cycleId === locked.cycleId && pendingArrangement.createdOrderId === null && pendingArrangement.orderCreationDate === locked.orderCreationDate);

    const created = await commerce.createOrderFromCycle({
      cycleId: locked.cycleId,
      orderId: "KD20260915-TEST01",
      idempotencyKey: "order-j5d4f3",
      now: t3,
      stateFilePath,
      rulesFilePath,
    });
    const orderedArrangement = dashboardModel.currentSubscriptionArrangement([created], active.subscriptionId);
    check("manual replenishment becomes an order display after cron links createdOrderId", orderedArrangement?.createdOrderId === "KD20260915-TEST01" && orderedArrangement.status === "order_created");

    await rejects("7-ELEVEN future shipping rejects a missing store server-side", () => commerce.updateSubscriptionPreferences({
      memberId,
      subscriptionId: active.subscriptionId,
      expectedRevision: active.revision,
      shippingMethod: "711_cod",
      storeSelection: { storeId: "", storeName: "" },
      idempotencyKey: "shipping-invalid-j5d4f3",
      now: t3,
      stateFilePath,
    }));

    const to711 = await commerce.updateSubscriptionPreferences({
      memberId,
      subscriptionId: active.subscriptionId,
      expectedRevision: active.revision,
      shippingMethod: "711_cod",
      storeSelection: { storeId: "123456", storeName: "港明" },
      idempotencyKey: "shipping-711-j5d4f3",
      now: t3,
      stateFilePath,
    });
    check("studio pickup switches to 7-ELEVEN with a valid store", to711.shippingMethod === "711_cod" && to711.storeSelection?.storeName === "港明");

    const toStudio = await commerce.updateSubscriptionPreferences({
      memberId,
      subscriptionId: to711.subscriptionId,
      expectedRevision: to711.revision,
      shippingMethod: "studio_pickup",
      storeSelection: null,
      idempotencyKey: "shipping-studio-j5d4f3",
      now: t4,
      stateFilePath,
    });
    check("7-ELEVEN switches back to studio pickup and clears future storeSelection", toStudio.shippingMethod === "studio_pickup" && toStudio.storeSelection === null);

    const afterShippingChanges = await commerce.readMembershipCommerceState(stateFilePath);
    const existingOrderCycle = afterShippingChanges.cycles[created.cycleId];
    check("future shipping changes do not alter an already-created order shipping snapshot", existingOrderCycle.createdOrderId === "KD20260915-TEST01" && existingOrderCycle.shippingSnapshot?.method === "studio_pickup" && existingOrderCycle.shippingSnapshot.storeSelection === null);

    const dedicatedSummary = editor.subscriptionItemsSummary([dedicatedItem], products);
    const defaultSummary = editor.subscriptionItemsSummary([{ ...dedicatedItem, components: [{ productId: "giotto", skuId: "giotto-bean", weightHalfPounds: 1 as const }] }], products);
    check("saved dedicated roast is exposed in the next-item summary", dedicatedSummary.includes("專屬烘焙：中深焙"));
    check("default roast remains distinct from dedicated roast", !defaultSummary.includes("專屬烘焙"));

    const pendingOther = await commerce.createSubscription({
      memberId,
      startedFromOrderId: "other-first-j5d4f3",
      anchorDate: "2026-10-01",
      intervalDays: 45,
      shippingMethod: "711_cod",
      storeSelection: { storeId: "654321", storeName: "另一門市" },
      defaultItems: [dedicatedItem],
      idempotencyKey: "other-subscription-j5d4f3",
      now: t4,
      stateFilePath,
      rulesFilePath,
    });
    const terminated = await commerce.setSubscriptionStatus({
      memberId,
      subscriptionId: toStudio.subscriptionId,
      expectedRevision: toStudio.revision,
      status: "terminated",
      reason: "focused dashboard test",
      idempotencyKey: "terminate-j5d4f3",
      now: t5,
      stateFilePath,
      rulesFilePath,
    });
    const postTerminate = await commerce.readMembershipCommerceState(stateFilePath);
    check("existing current order remains intact after terminate", postTerminate.cycles[created.cycleId].createdOrderId === "KD20260915-TEST01" && postTerminate.cycles[created.cycleId].status === "order_created" && postTerminate.cycles[created.cycleId].shippingSnapshot?.method === "studio_pickup");
    check("terminated subscription remains the default view instead of silently transforming into pending subscription", dashboardModel.defaultSubscriptionId([terminated, pendingOther]) === terminated.subscriptionId);
    const selectorText = dashboardModel.subscriptionSelectorLabel(pendingOther, products);
    check("multiple-subscription selector label identifies status, product, interval, and shipping", selectorText.includes("等待首筆訂單取貨") && selectorText.includes("喬托・初醒") && selectorText.includes("每 45 天") && selectorText.includes("7-ELEVEN 另一門市"));

    const componentSource = await readFile(path.join(process.cwd(), "components/member/MemberSubscriptionExperience.tsx"), "utf8");
    const routeSource = await readFile(path.join(process.cwd(), "app/api/member/subscription/route.ts"), "utf8");
    check("terminate entry only opens confirmation and does not mutate immediately", componentSource.includes('onClick={() => setTerminateConfirmationId(subscription.subscriptionId)}') && !componentSource.includes('onClick={() => void mutate("terminate", { subscriptionId: subscription.subscriptionId'));
    check("explicit terminate confirmation performs the mutation", componentSource.includes("async function confirmTermination()") && componentSource.includes('await mutate("terminate"') && componentSource.includes("確認停止未來定期配送"));
    check("terminate completion receipt and other-subscription control are present", componentSource.includes("此定期配送已停止") && componentSource.includes("已建立的本次配送仍照常") && componentSource.includes("查看其他定期配送"));
    check("multiple subscriptions render a visible selector", componentSource.includes("member-subscription-selector") && componentSource.includes("選擇定期配送"));
    check("bidirectional shipping API accepts studio and 7-ELEVEN while requiring a 7-ELEVEN store", routeSource.includes('"change-shipping"') && routeSource.includes('"studio_pickup", "711_cod"') && routeSource.includes("請先選擇有效的 7-ELEVEN 取貨門市"));
    check("cancellation immediate feedback is explicitly intermediate", componentSource.includes("取消處理已送出；請以重新整理後的訂單狀態為準。"));

    console.log(`Phase J.5D.4F-3 subscription dashboard: ${count} checks PASS`);
  } finally {
    await rm(testRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
