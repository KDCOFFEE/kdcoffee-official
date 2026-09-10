import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(os.tmpdir(), "kd-phase-j5d4a-"));
process.env.KD_DATA_DIR = root;
process.env.AUTH_SESSION_SECRET = "phase-j5d4a-test-secret-longer-than-thirty-two-characters";

const identity = await import("../lib/memberIdentity");
const rulesModule = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const cancellation = await import("../lib/orderCancellation");
const security = await import("../lib/requestSecurity");

let count = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  count += 1;
  console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
}

const ordersDir = path.join(root, "orders");
const websiteFile = path.join(root, "store", "website-data.json");
const stateFilePath = path.join(root, "membership-commerce", "commerce-state.json");
const rulesFilePath = path.join(root, "membership-commerce", "business-rules.json");
const now = () => new Date("2026-09-10T04:00:00.000Z");
const silentNotification = async () => ({ sent: false });
const item = { itemId: "coffee-half", packageWeight: "half-pound" as const, quantity: 1, roast: "淺中焙", unitPrice: 1000, components: [{ productId: "coffee", weightHalfPounds: 1 as const }] };
const readOrder = async (orderNumber: string) => JSON.parse(await readFile(path.join(ordersDir, `${orderNumber}.json`), "utf8"));
const writeOrder = async (order: Record<string, unknown>) => writeFile(path.join(ordersDir, `${order.orderNumber}.json`), `${JSON.stringify(order, null, 2)}\n`, "utf8");

try {
  await mkdir(ordersDir, { recursive: true });
  await mkdir(path.dirname(websiteFile), { recursive: true });
  await writeFile(websiteFile, `${JSON.stringify({ version: 1, menu: { products: [{ slug: "coffee", stock: 7, skus: [{ id: "coffee-sku", kind: "beans", enabled: true, stock: 7, price: 1000 }] }] } }, null, 2)}\n`, "utf8");
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: 0, rules: structuredClone(rulesModule.DEFAULT_MEMBERSHIP_RULES), now: new Date("2026-09-01T00:00:00.000Z") }, rulesFilePath);
  const memberA = (await identity.provisionCanonicalMember({ provider: "email", subject: "j5d4a-a@example.test", persistMember: async () => undefined })).member.memberId;
  const memberB = (await identity.provisionCanonicalMember({ provider: "email", subject: "j5d4a-b@example.test", persistMember: async () => undefined })).member.memberId;

  const subscription = await commerce.createSubscription({ memberId: memberA, startedFromOrderId: "KD20260901-000001", anchorDate: "2026-09-13", intervalDays: 30, shippingMethod: "711_cod", storeSelection: { storeId: "123456", storeName: "測試門市" }, defaultItems: [item], idempotencyKey: "create-sub", now: new Date("2026-09-01T01:00:00.000Z"), stateFilePath, rulesFilePath });
  const active = await commerce.activateSubscriptionFromPickup({ subscriptionId: subscription.subscriptionId, orderId: subscription.startedFromOrderId, idempotencyKey: "activate-sub", now: new Date("2026-09-02T01:00:00.000Z"), stateFilePath, rulesFilePath });
  const cycle = await commerce.generateSubscriptionCycle({ subscriptionId: active.subscriptionId, sequence: 1, plannedDate: "2026-09-13", kind: "manual_replenishment", idempotencyKey: "cycle", now: new Date("2026-09-03T01:00:00.000Z"), stateFilePath, rulesFilePath });
  const locked = await commerce.lockSubscriptionCycle({ cycleId: cycle.cycleId, shipping: 0, idempotencyKey: "cycle-lock", now: new Date("2026-09-04T01:00:00.000Z"), stateFilePath, rulesFilePath });
  const orderNumber = "KD20260910-000001";
  await commerce.createOrderFromCycle({ cycleId: locked.cycleId, orderId: orderNumber, idempotencyKey: "cycle-order", now: new Date("2026-09-05T01:00:00.000Z"), stateFilePath, rulesFilePath });

  await commerce.assignReferralRelationship({ referrerMemberId: memberA, referredMemberId: memberB, idempotencyKey: "referral", now: new Date("2026-09-01T02:00:00.000Z"), stateFilePath }, { assertMember: async () => undefined });
  const rewards = await commerce.createReferralRewardsFromFulfillment({ sourceMemberId: memberB, orderId: "KD20260902-000009", rewardType: "subscription", paidAmountBasis: 1000, basePV: 100, effectivePV: 100, discountRatio: 1, idempotencyKey: "reward-source", now: new Date("2026-09-02T02:00:00.000Z"), stateFilePath, rulesFilePath });
  const reward = rewards.find((entry) => entry.beneficiaryMemberId === memberA);
  assert.ok(reward);
  // Isolated legacy-order fixture: the existing cancellation consequence only
  // applies to rewards whose snapshotted authority is the legacy order flow.
  const referralFixture = JSON.parse(await readFile(stateFilePath, "utf8"));
  referralFixture.referralRewards[reward.rewardId].qualificationAuthority = "legacy_order";
  await writeFile(stateFilePath, `${JSON.stringify(referralFixture, null, 2)}\n`, "utf8");
  await commerce.registerReferralQualificationOrder({ memberId: memberA, orderId: orderNumber, orderCreatedAt: "2026-09-05T02:00:00.000Z", orderType: "subscription", idempotencyKey: "qualification-order", now: new Date("2026-09-05T02:00:00.000Z"), stateFilePath, rulesFilePath });

  const credit = await commerce.adjustMemberCreditByAdmin({ memberId: memberA, direction: "grant", amount: 100, reason: "test", idempotencyKey: "credit-grant", now: new Date("2026-09-01T03:00:00.000Z"), stateFilePath });
  const reservation = await commerce.reserveCredit({ memberId: memberA, orderId: orderNumber, requestedAmount: 100, merchandiseSubtotal: 1000, shipping: 0, idempotencyKey: "credit-reserve", now: new Date("2026-09-05T03:00:00.000Z"), stateFilePath, rulesFilePath });
  await writeOrder({
    orderNumber,
    createdAt: "2026-09-05T02:00:00.000Z",
    status: "waiting_merchant_create_cod_shipment",
    orderMode: "711_cod",
    member: { memberId: memberA },
    customer: { name: "會員 A" },
    inventoryTransaction: { state: "inventory_committed", changes: [{ skuId: "coffee-sku", productSlug: "coffee", productName: "Coffee", demand: 1 }] },
    credit: { reservationId: reservation.reservationId, appliedAmount: 100, status: "reserved" },
  });

  await commerce.setSubscriptionStatus({ memberId: memberA, subscriptionId: active.subscriptionId, expectedRevision: active.revision, status: "terminated", reason: "只停止未來", idempotencyKey: "terminate-only", now: new Date("2026-09-09T01:00:00.000Z"), stateFilePath, rulesFilePath });
  check("terminate subscription alone leaves current order untouched", (await readOrder(orderNumber)).status === "waiting_merchant_create_cod_shipment");

  const first = await cancellation.requestMemberOrderCancellation({ orderNumber, memberId: memberA, cancellationReason: "本次不需要配送", idempotencyKey: "member-cancel-1", now, websiteFile, membershipStateFilePath: stateFilePath, membershipRulesFilePath: rulesFilePath, sendNotification: silentNotification });
  const cancelledOrder = await readOrder(orderNumber);
  const websiteAfterFirst = JSON.parse(await readFile(websiteFile, "utf8"));
  const stateAfterFirst = await commerce.readMembershipCommerceState(stateFilePath);
  check("member cancels own pre-shipment order", first.result === "cancelled" && cancelledOrder.status === "cancelled" && cancelledOrder.cancelledBy === "member");
  check("inventory return occurs once", websiteAfterFirst.menu.products[0].skus[0].stock === 8 && cancelledOrder.inventoryReturn.state === "returned");
  check("credit reservation is released", stateAfterFirst.creditReservations[reservation.reservationId].status === "released" && stateAfterFirst.creditEntries[credit.entry.creditEntryId].remainingAmount === 100);
  check("referral qualification cancellation consequence is preserved", stateAfterFirst.referralRewards[reward.rewardId].qualificationAttempts?.find((entry) => entry.orderNumber === orderNumber)?.finalState === "cancelled");
  check("linked subscription cycle becomes cancelled", stateAfterFirst.cycles[cycle.cycleId].status === "cancelled");

  const repeated = await cancellation.requestMemberOrderCancellation({ orderNumber, memberId: memberA, cancellationReason: "重複送出", idempotencyKey: "member-cancel-2", now, websiteFile, membershipStateFilePath: stateFilePath, membershipRulesFilePath: rulesFilePath, sendNotification: silentNotification });
  const websiteAfterRetry = JSON.parse(await readFile(websiteFile, "utf8"));
  const stateAfterRetry = await commerce.readMembershipCommerceState(stateFilePath);
  check("repeated cancellation is idempotent", repeated.result === "already_cancelled" && websiteAfterRetry.menu.products[0].skus[0].stock === 8);
  check("repeated cancellation does not double-release credit or duplicate cycle transition", stateAfterRetry.creditEntries[credit.entry.creditEntryId].remainingAmount === 100 && stateAfterRetry.events.filter((entry) => entry.type === "cycle_cancelled" && entry.orderId === orderNumber).length === 1);

  const shipmentCreated = "KD20260910-000002";
  await writeOrder({ orderNumber: shipmentCreated, createdAt: now().toISOString(), status: "shipment_created", orderMode: "711_cod", member: { memberId: memberA }, fulfillmentSummary: { externalOrderId: "CM123", externalShipmentId: "SHIP123" } });
  const manual = await cancellation.requestMemberOrderCancellation({ orderNumber: shipmentCreated, memberId: memberA, cancellationReason: "請停止交寄", idempotencyKey: "manual-void", now, websiteFile, membershipStateFilePath: stateFilePath, membershipRulesFilePath: rulesFilePath, sendNotification: silentNotification });
  const manualOrder = await readOrder(shipmentCreated);
  check("shipment_created is not finally cancelled", manual.result === "requires_manual_shipment_void" && manualOrder.status === "shipment_created" && !manualOrder.cancelledAt);
  check("shipment_created records auditable manual-void request", manualOrder.memberCancellationRequest.state === "requires_manual_shipment_void" && manualOrder.memberCancellationRequest.externalOrderId === "CM123" && manualOrder.memberCancellationRequest.reason === "請停止交寄");
  check("manual-void request does not return inventory", JSON.parse(await readFile(websiteFile, "utf8")).menu.products[0].skus[0].stock === 8 && !manualOrder.inventoryReturn);
  const manualRetry = await cancellation.requestMemberOrderCancellation({ orderNumber: shipmentCreated, memberId: memberA, cancellationReason: "重複", idempotencyKey: "manual-void-retry", now, websiteFile, membershipStateFilePath: stateFilePath, membershipRulesFilePath: rulesFilePath, sendNotification: silentNotification });
  assert.equal(manual.result, "requires_manual_shipment_void");
  assert.equal(manualRetry.result, "requires_manual_shipment_void");
  check("manual-void request is idempotent", manualRetry.result === "requires_manual_shipment_void" && manualRetry.requestedAt === manual.requestedAt);

  const h1Subscription = await commerce.createSubscription({ memberId: memberB, startedFromOrderId: "KD20260901-000002", anchorDate: "2026-09-20", intervalDays: 30, shippingMethod: "711_cod", storeSelection: { storeId: "654321", storeName: "H1 測試門市" }, defaultItems: [item], idempotencyKey: "h1-create-sub", now: new Date("2026-09-01T05:00:00.000Z"), stateFilePath, rulesFilePath });
  const h1Active = await commerce.activateSubscriptionFromPickup({ subscriptionId: h1Subscription.subscriptionId, orderId: h1Subscription.startedFromOrderId, idempotencyKey: "h1-activate-sub", now: new Date("2026-09-02T05:00:00.000Z"), stateFilePath, rulesFilePath });
  const h1Cycle = await commerce.generateSubscriptionCycle({ subscriptionId: h1Active.subscriptionId, sequence: 1, plannedDate: "2026-09-20", idempotencyKey: "h1-cycle", now: new Date("2026-09-03T05:00:00.000Z"), stateFilePath, rulesFilePath });
  const h1Locked = await commerce.lockSubscriptionCycle({ cycleId: h1Cycle.cycleId, shipping: 0, idempotencyKey: "h1-cycle-lock", now: new Date("2026-09-04T05:00:00.000Z"), stateFilePath, rulesFilePath });
  const h1OrderNumber = "KD20260910-000006";
  await commerce.createOrderFromCycle({ cycleId: h1Locked.cycleId, orderId: h1OrderNumber, idempotencyKey: "h1-cycle-order", now: new Date("2026-09-05T05:00:00.000Z"), stateFilePath, rulesFilePath });
  await writeOrder({ orderNumber: h1OrderNumber, createdAt: now().toISOString(), status: "shipment_created", orderMode: "711_cod", member: { memberId: memberB }, inventoryTransaction: { state: "inventory_committed", changes: [{ skuId: "coffee-sku", productSlug: "coffee", productName: "Coffee", demand: 2 }] }, fulfillmentSummary: { externalOrderId: "CM-H1", externalShipmentId: "SHIP-H1" } });

  await assert.rejects(cancellation.cancelOrderCanonically({ orderNumber: h1OrderNumber, cancellationReason: "Admin 一般取消", cancelledBy: "admin", idempotencyKey: "h1-no-request", now, websiteFile, membershipStateFilePath: stateFilePath, membershipRulesFilePath: rulesFilePath, sendNotification: silentNotification }));
  await assert.rejects(cancellation.cancelOrderCanonically({ orderNumber: h1OrderNumber, cancellationReason: "Admin 嘗試繞過", cancelledBy: "admin", idempotencyKey: "h1-forged-confirmation", confirmedExternalShipmentVoid: true, now, websiteFile, membershipStateFilePath: stateFilePath, membershipRulesFilePath: rulesFilePath, sendNotification: silentNotification }));
  check("shipment_created without member request remains blocked for Admin", (await readOrder(h1OrderNumber)).status === "shipment_created");

  const forgedMemberInput = { orderNumber: h1OrderNumber, memberId: memberB, cancellationReason: "會員偽造物流作廢確認", idempotencyKey: "h1-member-forge", confirmedExternalShipmentVoid: true, now, websiteFile, membershipStateFilePath: stateFilePath, membershipRulesFilePath: rulesFilePath, sendNotification: silentNotification };
  const forgedMemberResult = await cancellation.requestMemberOrderCancellation(forgedMemberInput);
  check("member cannot forge the trusted shipment-void override", forgedMemberResult.result === "requires_manual_shipment_void" && (await readOrder(h1OrderNumber)).status === "shipment_created");

  await assert.rejects(cancellation.cancelOrderCanonically({ orderNumber: h1OrderNumber, cancellationReason: "尚未確認物流作廢", cancelledBy: "admin", idempotencyKey: "h1-no-confirmation", now, websiteFile, membershipStateFilePath: stateFilePath, membershipRulesFilePath: rulesFilePath, sendNotification: silentNotification }));
  check("pending manual-void request without explicit Admin confirmation remains blocked", (await readOrder(h1OrderNumber)).memberCancellationRequest.state === "requires_manual_shipment_void" && (await readOrder(h1OrderNumber)).status === "shipment_created");

  const h1Completed = await cancellation.cancelOrderCanonically({ orderNumber: h1OrderNumber, cancellationReason: "已確認外部寄件單作廢", cancelledBy: "admin", idempotencyKey: "h1-complete", confirmedExternalShipmentVoid: true, now, websiteFile, membershipStateFilePath: stateFilePath, membershipRulesFilePath: rulesFilePath, sendNotification: silentNotification });
  const h1CompletedOrder = await readOrder(h1OrderNumber);
  const h1State = await commerce.readMembershipCommerceState(stateFilePath);
  check("Admin-confirmed manual shipment void completes cancellation", h1Completed.ok && h1CompletedOrder.status === "cancelled");
  check("manual shipment void completion returns inventory exactly once", JSON.parse(await readFile(websiteFile, "utf8")).menu.products[0].skus[0].stock === 10 && h1CompletedOrder.inventoryReturn.state === "returned");
  check("manual cancellation request becomes completed with completedAt", h1CompletedOrder.memberCancellationRequest.state === "completed" && Boolean(h1CompletedOrder.memberCancellationRequest.completedAt));
  check("manual shipment void completion cancels linked order_created cycle", h1State.cycles[h1Cycle.cycleId].status === "cancelled");
  const h1Repeated = await cancellation.cancelOrderCanonically({ orderNumber: h1OrderNumber, cancellationReason: "重複完成", cancelledBy: "admin", idempotencyKey: "h1-complete-retry", confirmedExternalShipmentVoid: true, now, websiteFile, membershipStateFilePath: stateFilePath, membershipRulesFilePath: rulesFilePath, sendNotification: silentNotification });
  check("repeated manual shipment void completion is idempotent", h1Repeated.alreadyCancelled && JSON.parse(await readFile(websiteFile, "utf8")).menu.products[0].skus[0].stock === 10 && (await commerce.readMembershipCommerceState(stateFilePath)).events.filter((entry) => entry.type === "cycle_cancelled" && entry.orderId === h1OrderNumber).length === 1);

  const shipped = "KD20260910-000003";
  await writeOrder({ orderNumber: shipped, createdAt: now().toISOString(), status: "shipped", orderMode: "711_cod", member: { memberId: memberA } });
  const shippedResult = await cancellation.requestMemberOrderCancellation({ orderNumber: shipped, memberId: memberA, cancellationReason: "想取消", idempotencyKey: "shipped", now, websiteFile, membershipStateFilePath: stateFilePath, membershipRulesFilePath: rulesFilePath, sendNotification: silentNotification });
  check("shipped order requires customer service and is unchanged", shippedResult.result === "customer_service_required" && (await readOrder(shipped)).status === "shipped");

  const otherOrder = "KD20260910-000004";
  await writeOrder({ orderNumber: otherOrder, createdAt: now().toISOString(), status: "waiting_merchant_create_cod_shipment", orderMode: "711_cod", member: { memberId: memberB } });
  await assert.rejects(cancellation.requestMemberOrderCancellation({ orderNumber: otherOrder, memberId: memberA, cancellationReason: "越權", idempotencyKey: "other", now, websiteFile, membershipStateFilePath: stateFilePath, membershipRulesFilePath: rulesFilePath, sendNotification: silentNotification }), (error: unknown) => error instanceof cancellation.MemberOrderCancellationError && error.status === 404);
  check("another member cannot cancel the order", (await readOrder(otherOrder)).status === "waiting_merchant_create_cod_shipment");

  const guestOrder = "KD20260910-000005";
  await writeOrder({ orderNumber: guestOrder, createdAt: now().toISOString(), status: "waiting_merchant_create_cod_shipment", orderMode: "711_cod" });
  await assert.rejects(cancellation.requestMemberOrderCancellation({ orderNumber: guestOrder, memberId: memberA, cancellationReason: "接管訪客訂單", idempotencyKey: "guest", now, websiteFile, membershipStateFilePath: stateFilePath, membershipRulesFilePath: rulesFilePath, sendNotification: silentNotification }), (error: unknown) => error instanceof cancellation.MemberOrderCancellationError && error.status === 404);
  check("guest order cannot be taken over", (await readOrder(guestOrder)).status === "waiting_merchant_create_cod_shipment");

  const direct = new Request("https://internal.local/api/member/subscription", { headers: { origin: "https://coffee.example", host: "internal.local", "x-forwarded-host": "coffee.example", "x-forwarded-proto": "https" } });
  const forged = new Request("https://internal.local/api/member/subscription", { headers: { origin: "https://evil.example", host: "internal.local", "x-forwarded-host": "coffee.example", "x-forwarded-proto": "https" } });
  check("proxy-safe same-origin validation accepts trusted public origin", security.isSameOriginRequest(direct));
  check("same-origin validation rejects forged origin", !security.isSameOriginRequest(forged));

  const routeSource = await readFile(path.join(process.cwd(), "app", "api", "member", "orders", "[orderNumber]", "cancel", "route.ts"), "utf8");
  check("member route requires authentication", routeSource.includes("await getCurrentMember()") && routeSource.includes("status: 401"));
  check("member route never accepts client memberId as authority", !routeSource.includes("values.memberId") && routeSource.includes("memberId: member.id"));
  check("member route rejects malformed order numbers and requires idempotency", routeSource.includes("/^KD[0-9-]+$/") && routeSource.includes("idempotencyKey"));
  const memberUiSource = await readFile(path.join(process.cwd(), "components", "member", "MemberSubscriptionExperience.tsx"), "utf8");
  const subscriptionRouteSource = await readFile(path.join(process.cwd(), "app", "api", "member", "subscription", "route.ts"), "utf8");
  const adminSource = await readFile(path.join(process.cwd(), "app", "admin", "orders", "[orderNumber]", "page.tsx"), "utf8");
  const adminFormSource = await readFile(path.join(process.cwd(), "components", "admin", "OrderStatusForm.tsx"), "utf8");
  const adminRouteSource = await readFile(path.join(process.cwd(), "app", "api", "admin", "orders", "[orderNumber]", "route.ts"), "utf8");
  const commerceSource = await readFile(path.join(process.cwd(), "lib", "membershipCommerce.ts"), "utf8");
  check("subscription UI uses action-specific success messages", ["定期配送已暫停。", "定期配送已恢復。下一次配送日期", "已跳過本次配送。下一次配送日期", "下一次配送日期已更新。新的配送日期", "7-ELEVEN 取貨門市已更新。", "補貨安排已建立。預計配送日期"].every((text) => memberUiSource.includes(text)) && !memberUiSource.includes("已完成，最新安排已更新。"));
  check("subscription success dates come from server action results", subscriptionRouteSource.includes("actionResult.plannedDate") && memberUiSource.includes("result.actionResult?.plannedDate"));
  check("member UI separates current cancellation from future termination", ["只取消本次配送", "取消本次配送，並停止之後的定期配送", "取消本次配送，保留定期配送並更新下次日期", "只停止之後的定期配送，本次配送照常"].every((text) => memberUiSource.includes(text)));
  check("Admin sees manual-void evidence and explicit warning", adminSource.includes("會員要求取消本次配送") && adminSource.includes("請先至賣貨便／交貨便確認寄件單已作廢，再完成正式取消。") && adminSource.includes("externalShipmentId"));
  check("Admin completion UI requires explicit shipment-void confirmation", adminFormSource.includes("我已確認賣貨便／交貨便寄件單已作廢") && adminFormSource.includes("確認物流單已作廢並完成取消") && adminSource.includes("manualShipmentVoidCompletionAvailable"));
  check("only authenticated Admin route forwards trusted void confirmation", adminRouteSource.includes("confirmedExternalShipmentVoid: body.confirmedExternalShipmentVoid === true") && !routeSource.includes("confirmedExternalShipmentVoid"));
  check("cycle synchronization delegates to canonical transitionCycle", commerceSource.includes("export async function cancelSubscriptionCycleForOrder") && commerceSource.includes("return transitionCycle({"));
  check("cancel-and-reschedule has explicit partial-success UX", memberUiSource.includes("本次配送已成功取消，但下一次配送日期未能更新") && memberUiSource.includes("請重新選擇下一次配送日期") && memberUiSource.includes("currentCancellationCompleted"));
  console.log(`\nPhase J.5D.4A member cancellation safety: ${count} checks PASS`);
} finally {
  await rm(root, { recursive: true, force: true });
}
