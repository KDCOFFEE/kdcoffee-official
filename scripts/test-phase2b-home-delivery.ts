import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(os.tmpdir(), "kd-phase2b-home-"));
process.env.KD_DATA_DIR = root;
process.env.AUTH_SESSION_SECRET = "phase2b-isolated-secret-longer-than-thirty-two-characters";

const rulesModule = await import("../lib/membershipBusinessRules");
const payment = await import("../lib/homeDeliveryPayment");
const shippingRules = await import("../lib/shippingRules");
const financial = await import("../lib/orderFinancialProjection");
const fulfillment = await import("../lib/fulfillment");
const policy = await import("../lib/orderStatusPolicy");
const cancellation = await import("../lib/orderCancellation");
const adminOrders = await import("../lib/adminOrders");
const storage = await import("../lib/storagePaths");
const jsonStore = await import("../lib/jsonFileStore");
const commerce = await import("../lib/membershipCommerce");
const identity = await import("../lib/memberIdentity");

let checks = 0;
function check(name: string, value: unknown) {
  assert.ok(value, name);
  checks++;
  console.log(`PASS ${checks} ${name}`);
}

const orderDir = storage.getOrdersDir();
const websiteFile = storage.getWebsiteDataFile();
const rule = structuredClone(rulesModule.DEFAULT_MEMBERSHIP_RULES);
rule.money.roundingMode = "round-half-up";
rule.credit.allowZeroTotal = true;
rule.shipping.homeDeliveryCodFee = 30;

async function createHomeOrder(orderNumber: string, method: "atm_transfer" | "cash_on_delivery", status = "new_order", memberId?: string) {
  const priced = payment.quoteHomeDeliveryPayable({ merchandiseSubtotal: 1000, shipping: 100, availableCredit: 0, requestedCredit: 0, method, rules: rule });
  const order = {
    orderNumber, createdAt: "2026-09-01T00:00:00.000Z", status, orderMode: "home_delivery",
    customer: { name: "測試客人" }, member: memberId ? { memberId } : null,
    items: [{ slug: "coffee", quantity: 1, lineTotal: 1000 }],
    subtotal: 1000, shipping: 100, codServiceFee: priced.codServiceFee,
    totalBeforeCredit: priced.totalBeforeCredit, total: priced.total,
    payment: priced.payment, paymentDetails: priced.paymentDetails,
    inventoryTransaction: { state: "inventory_committed", changes: [{ skuId: "coffee-half", productSlug: "coffee", productName: "測試咖啡", demand: 1 }] },
  };
  await writeFile(path.join(orderDir, `${orderNumber}.json`), JSON.stringify(order), "utf8");
  return order;
}

try {
  await mkdir(orderDir, { recursive: true });
  await mkdir(path.dirname(websiteFile), { recursive: true });
  await writeFile(websiteFile, JSON.stringify({ version: 1, menu: { products: [{ slug: "coffee", stock: 10, skus: [{ id: "coffee-half", stock: 10, enabled: true }] }] } }), "utf8");

  for (const fee of [0, 30, 50]) {
    const candidate = structuredClone(rule);
    candidate.shipping.homeDeliveryCodFee = fee;
    check(`COD fee ${fee} accepted`, rulesModule.validateMembershipBusinessRules(candidate).shipping.homeDeliveryCodFee === fee);
  }
  for (const fee of [-1, 51, 1.5]) {
    const candidate = structuredClone(rule);
    candidate.shipping.homeDeliveryCodFee = fee;
    assert.throws(() => rulesModule.validateMembershipBusinessRules(candidate));
    check(`COD fee ${fee} rejected`, true);
  }
  const legacy = structuredClone(rule) as unknown as Record<string, any>;
  delete legacy.shipping.homeDeliveryCodFee;
  check("legacy rules normalize COD fee to zero", rulesModule.validateMembershipBusinessRules(legacy).shipping.homeDeliveryCodFee === 0);

  rule.credit.appliesToShipping = "no";
  const caseA = payment.quoteHomeDeliveryPayable({ merchandiseSubtotal: 1000, shipping: 100, availableCredit: 200, requestedCredit: 200, method: "cash_on_delivery", rules: rule });
  check("credit case A leaves shipping and COD fee payable", caseA.maximumCredit === 1000 && caseA.creditApplied === 200 && caseA.total === 930 && caseA.codServiceFee === 30);
  rule.credit.appliesToShipping = "yes";
  const caseB = payment.quoteHomeDeliveryPayable({ merchandiseSubtotal: 1000, shipping: 100, availableCredit: 200, requestedCredit: 200, method: "cash_on_delivery", rules: rule });
  check("credit case B includes shipping but excludes COD fee", caseB.maximumCredit === 1100 && caseB.creditApplied === 200 && caseB.total === 930 && caseB.codServiceFee === 30);
  const caseC = payment.quoteHomeDeliveryPayable({ merchandiseSubtotal: 1000, shipping: 100, availableCredit: 5000, requestedCredit: 5000, method: "cash_on_delivery", rules: rule });
  check("excess credit cannot reduce COD fee", caseC.creditApplied === 1100 && caseC.total === 30);
  rule.credit.appliesToShipping = "no";
  const caseCNoShipping = payment.quoteHomeDeliveryPayable({ merchandiseSubtotal: 1000, shipping: 100, availableCredit: 5000, requestedCredit: 5000, method: "cash_on_delivery", rules: rule });
  check("excess credit with no shipping eligibility leaves shipping and COD fee", caseCNoShipping.creditApplied === 1000 && caseCNoShipping.total === 130);
  const snap = payment.createHomeDeliveryPaymentSnapshot("cash_on_delivery", rule);
  rule.shipping.homeDeliveryCodFee = 50;
  rule.shipping.subscriptionShippingDiscount = 100;
  check("COD fee snapshot ignores later Admin changes and subscription shipping discount", snap.codServiceFee === 30 && shippingRules.subscriptionShippingFee("home_delivery", rule) === 0);
  check("ATM snapshot has no COD fee and remains pending", payment.createHomeDeliveryPaymentSnapshot("atm_transfer", rule).codServiceFee === 0 && payment.createHomeDeliveryPaymentSnapshot("atm_transfer", rule).paymentDetails.status === "pending");
  assert.throws(() => payment.createHomeDeliveryPaymentSnapshot("credit_card" as never, rule));
  check("future credit card cannot create a live payment snapshot", true);
  check("financial projection keeps COD fee separate", financial.projectOrderFinancialBreakdown({ subtotal: 1000, shipping: 100, codServiceFee: 30, totalBeforeCredit: 1130, total: 930, credit: { reservationId: "test", appliedAmount: 200 } }).codServiceFee === 30);
  check("historical financial snapshot without COD fee remains compatible", financial.projectOrderFinancialBreakdown({ subtotal: 1000, shipping: 60, totalBeforeCredit: 1060, total: 860, credit: { reservationId: "test", appliedAmount: 200 } }).creditApplied === 200);

  const graph = (from: string, to: string) => policy.assessOrderStatusProgression({ orderMode: "home_delivery", status: from }, to as never).allowed;
  check("home order graph permits only adjacent steps", graph("new_order", "confirmed") && graph("confirmed", "shipped") && graph("shipped", "completed") && !graph("new_order", "shipped") && !graph("new_order", "completed") && !graph("confirmed", "completed") && !graph("new_order", "waiting_studio_pickup_confirmation"));
  const rawRoute = await readFile(path.join(process.cwd(), "app/api/admin/orders/[orderNumber]/route.ts"), "utf8");
  check("raw Admin order-status route blocks home progression", rawRoute.includes('latestOrder.orderMode === "home_delivery"'));
  const checkout = await readFile(path.join(process.cwd(), "app/checkout/page.tsx"), "utf8");
  check("customer Checkout still excludes home delivery", checkout.includes('type OrderMode = "711_cod" | "studio_pickup"') && !checkout.includes('mode === "home_delivery"'));

  rule.shipping.homeDeliveryCodFee = 30;
  const atmId = "KD20260922-2001";
  await createHomeOrder(atmId, "atm_transfer");
  await assert.rejects(fulfillment.recordAdminFulfillmentEvent({ orderId: atmId, state: "preparing", expectedRevision: 0 }));
  check("ATM cannot prepare before payment", true);
  await fulfillment.confirmHomeDeliveryAtmPayment({ orderId: atmId, now: new Date("2026-09-22T01:00:00Z") });
  check("ATM Admin confirmation records payment audit", (await adminOrders.readOrder(atmId))?.paymentDetails?.status === "paid" && (await adminOrders.readOrder(atmId))?.paymentDetails?.confirmedBy === "admin");
  const atmPreparing = await fulfillment.recordAdminFulfillmentEvent({ orderId: atmId, state: "preparing", expectedRevision: 0 });
  await assert.rejects(fulfillment.recordAdminFulfillmentEvent({ orderId: atmId, state: "completed", expectedRevision: atmPreparing.record.revision, confirmed: true, delivered: true }));
  const atmShipped = await fulfillment.recordAdminFulfillmentEvent({ orderId: atmId, state: "shipped", expectedRevision: atmPreparing.record.revision });
  await adminOrders.updateStoredOrderSafely(atmId, (order) => ({ ...order, paymentDetails: { ...order.paymentDetails, status: "pending" } }));
  await assert.rejects(fulfillment.recordAdminFulfillmentEvent({ orderId: atmId, state: "completed", expectedRevision: atmShipped.record.revision, confirmed: true, delivered: true }));
  await adminOrders.updateStoredOrderSafely(atmId, (order) => ({ ...order, paymentDetails: { ...order.paymentDetails, status: "paid" } }));
  check("ATM completion rejects a payment that returned to pending", true);
  await assert.rejects(fulfillment.recordAdminFulfillmentEvent({ orderId: atmId, state: "completed", expectedRevision: atmShipped.record.revision, confirmed: true }));
  const atmCompleted = await fulfillment.recordAdminFulfillmentEvent({ orderId: atmId, state: "completed", expectedRevision: atmShipped.record.revision, confirmed: true, delivered: true });
  check("ATM completes only after paid, shipped and delivered", atmCompleted.record.currentState === "completed" && (await adminOrders.readOrder(atmId))?.status === "completed");
  const replay = await fulfillment.recordAdminFulfillmentEvent({ orderId: atmId, state: "completed", expectedRevision: atmShipped.record.revision, confirmed: true, delivered: true });
  check("canonical completion replay is idempotent", replay.replayed && (await fulfillment.readFulfillmentStore()).records[atmId].events.filter((event) => event.state === "completed").length === 1);

  const codId = "KD20260922-2002";
  await createHomeOrder(codId, "cash_on_delivery");
  const codPreparing = await fulfillment.recordAdminFulfillmentEvent({ orderId: codId, state: "preparing", expectedRevision: 0 });
  const codShipped = await fulfillment.recordAdminFulfillmentEvent({ orderId: codId, state: "shipped", expectedRevision: codPreparing.record.revision });
  await assert.rejects(fulfillment.recordAdminFulfillmentEvent({ orderId: codId, state: "completed", expectedRevision: codShipped.record.revision, confirmed: true, delivered: true }));
  check("COD cannot complete without collection confirmation", true);
  const codCompleted = await fulfillment.recordAdminFulfillmentEvent({ orderId: codId, state: "completed", expectedRevision: codShipped.record.revision, confirmed: true, delivered: true, codCollected: true });
  check("COD completion records paid status and canonical event", codCompleted.record.currentState === "completed" && (await adminOrders.readOrder(codId))?.paymentDetails?.status === "paid");
  check("home shipment creates no pickup deadline", !codCompleted.record.pickupDeadline);
  await assert.rejects(fulfillment.associateExternalFulfillment({ orderId: codId, externalOrderId: "CMTEST000002" }));
  await assert.rejects(fulfillment.recordAdminFulfillmentEvent({ orderId: codId, state: "arrived_at_pickup_store", expectedRevision: codCompleted.record.revision }));
  check("home rejects 7-ELEVEN association and arrival", true);
  const isolatedStore = await fulfillment.readFulfillmentStore();
  isolatedStore.records[codId].externalOrderId = "CMHOME000002";
  await jsonStore.atomicWriteJson(storage.getFulfillmentStateFile(), isolatedStore);
  const logistics = await fulfillment.readLogisticsSettings();
  await fulfillment.saveLogisticsSettings({ expectedRevision: logistics.revision, notificationEmail: "logistics@example.test", automaticTrackingEnabled: true, pickupDeadlineDays: 7, expiryPolicy: "manual_review", trackedEvents: { orderCreated: true, shipped: true, arrived: true, completed: true } });
  const gmailResult = await fulfillment.processSevenElevenEmail({ from: "7-ELEVEN 賣貨便 <no-reply@sp88.com>", subject: "賣貨便：賣家完成寄貨訂單通知", text: "賣貨便訂單編號 CMHOME000002 賣家已完成寄貨，交貨便單號 ETEST0002", messageId: "phase2b-home-mail", receivedAt: "2026-09-22T04:00:00Z" });
  check("even a forged external mapping cannot route Gmail into home delivery", gmailResult.mutated === false && (await fulfillment.readFulfillmentStore()).records[codId].events.filter((event) => event.source === "seven_eleven_email").length === 0);

  for (const [index, state] of ["new_order", "confirmed"].entries()) {
    const id = `KD20260922-200${index + 3}`;
    await createHomeOrder(id, "cash_on_delivery", state);
    const result = await cancellation.cancelOrderCanonically({ orderNumber: id, cancellationReason: "測試取消", cancelledBy: "admin", idempotencyKey: `test-${id}`, sendNotification: async () => ({ sent: false }) });
    const firstStock = JSON.parse(await readFile(websiteFile, "utf8")).menu.products[0].skus[0].stock;
    const replayed = await cancellation.cancelOrderCanonically({ orderNumber: id, cancellationReason: "測試取消", cancelledBy: "admin", idempotencyKey: `test-${id}`, sendNotification: async () => ({ sent: false }) });
    const secondStock = JSON.parse(await readFile(websiteFile, "utf8")).menu.products[0].skus[0].stock;
    check(`home ${state} canonical cancellation restores inventory once`, result.order.status === "cancelled" && replayed.order.status === "cancelled" && firstStock === 11 + index && secondStock === firstStock);
    await assert.rejects(fulfillment.recordAdminFulfillmentEvent({ orderId: id, state: "preparing", expectedRevision: 0 }));
    check(`cancelled home ${state} cannot re-enter fulfillment`, true);
  }
  check("home shipped and completed cancellation are blocked", !adminOrders.assessOrderCancellation((await adminOrders.readOrder(codId))!).allowed && !adminOrders.assessOrderCancellation({ orderMode: "home_delivery", status: "shipped" }).allowed);
  const invalidId = "KD20260922-2007";
  await createHomeOrder(invalidId, "cash_on_delivery");
  for (const state of ["arrived_at_pickup_store", "ready_for_store_pickup", "uncollected", "cancelled"] as const) {
    await assert.rejects(fulfillment.recordAdminFulfillmentEvent({ orderId: invalidId, state, expectedRevision: 0, confirmed: true }));
  }
  check("home rejects store and cancellation fulfillment events", true);
  await adminOrders.updateStoredOrderSafely(invalidId, (order) => ({ ...order, inventoryTransaction: { state: "inventory_failed" } }));
  await assert.rejects(fulfillment.recordAdminFulfillmentEvent({ orderId: invalidId, state: "preparing", expectedRevision: 0 }));
  check("home cannot prepare with failed inventory", true);
  const controls = await readFile(path.join(process.cwd(), "components/admin/FulfillmentOrderControls.tsx"), "utf8");
  check("home Admin controls use an explicit branch before studio controls", controls.indexOf("if (isHomeDelivery)") < controls.indexOf("if (!isSevenEleven && orderMode !== \"studio_pickup\")"));

  const rewardRules = structuredClone(rulesModule.DEFAULT_MEMBERSHIP_RULES);
  rewardRules.money.roundingMode = "round-half-up";
  rewardRules.referral.referrerEligibility = { mode: "none" };
  rewardRules.referral.reward = { mode: "fixed", amount: 100, repeatedRewards: true };
  rewardRules.subscription.pauseResumeAnchorPolicy = "keep-original";
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: 0, rules: rewardRules, now: new Date("2026-09-20T00:00:00Z") });
  const referrer = (await identity.provisionCanonicalMember({ provider: "email", subject: "phase2b-referrer@example.test", persistMember: async () => undefined })).member.memberId;
  const referred = (await identity.provisionCanonicalMember({ provider: "email", subject: "phase2b-referred@example.test", persistMember: async () => undefined })).member.memberId;
  const item = { itemId: "coffee-half", packageWeight: "half-pound" as const, quantity: 1, roast: "淺中焙", unitPrice: 1000, components: [{ productId: "coffee", weightHalfPounds: 1 as const }] };
  const referrerSubscription = await commerce.createSubscription({ memberId: referrer, startedFromOrderId: "referrer-first", anchorDate: "2026-10-01", intervalDays: 30, shippingMethod: "studio_pickup", defaultItems: [item], idempotencyKey: "phase2b-referrer-sub" });
  await commerce.activateSubscriptionFromPickup({ subscriptionId: referrerSubscription.subscriptionId, orderId: "referrer-first", idempotencyKey: "phase2b-referrer-active" });
  await commerce.assignReferralRelationship({ referrerMemberId: referrer, referredMemberId: referred, idempotencyKey: "phase2b-relation" });
  const firstHomeId = "KD20260922-2005";
  await createHomeOrder(firstHomeId, "cash_on_delivery", "new_order", referred);
  const pendingSubscription = await commerce.createSubscription({ memberId: referred, startedFromOrderId: firstHomeId, anchorDate: "2026-10-01", intervalDays: 30, shippingMethod: "studio_pickup", defaultItems: [item], idempotencyKey: "phase2b-first-home-sub" });
  const firstPreparing = await fulfillment.recordAdminFulfillmentEvent({ orderId: firstHomeId, state: "preparing", expectedRevision: 0, now: new Date("2026-09-22T01:00:00Z") });
  const firstShipped = await fulfillment.recordAdminFulfillmentEvent({ orderId: firstHomeId, state: "shipped", expectedRevision: firstPreparing.record.revision, now: new Date("2026-09-22T02:00:00Z") });
  await fulfillment.recordAdminFulfillmentEvent({ orderId: firstHomeId, state: "completed", expectedRevision: firstShipped.record.revision, confirmed: true, delivered: true, codCollected: true, now: new Date("2026-09-22T03:00:00Z") });
  const state = await commerce.readMembershipCommerceState();
  check("home canonical completion activates pending first-order subscription", state.subscriptions[pendingSubscription.subscriptionId].status === "active");
  check("home canonical completion advances existing gift progress", await commerce.getGiftProgress(pendingSubscription.subscriptionId) === 1);
  check("home canonical completion records valid consumption once", Object.values(state.validConsumptionEvents).filter((event) => event.sourceOrderId === firstHomeId).length === 1);
  const homeRewards = Object.values(state.referralRewards).filter((reward) => reward.sourceOrderNumber === firstHomeId);
  check("home referral reward waits under existing rules", homeRewards.length === 1 && homeRewards[0].status === "scheduled" && homeRewards[0].releasedAt === null);
  await commerce.processReferralRewardMaturations({ now: new Date("2026-09-30T02:59:59Z") });
  const beforeProtectionEnd = await commerce.readMembershipCommerceState();
  check("home reward cannot release before base waiting plus return protection", !Object.values(beforeProtectionEnd.creditEntries).some((entry) => entry.sourceType === "referral" && entry.sourceReference.includes(firstHomeId)));
  const creditMember = (await identity.provisionCanonicalMember({ provider: "email", subject: "phase2b-credit@example.test", persistMember: async () => undefined })).member.memberId;
  await commerce.adjustMemberCreditByAdmin({ memberId: creditMember, direction: "grant", amount: 200, reason: "isolated home cancellation test", idempotencyKey: "phase2b-credit-grant" });
  const creditOrderId = "KD20260922-2006";
  const reservation = await commerce.reserveCredit({ memberId: creditMember, orderId: creditOrderId, requestedAmount: 100, merchandiseSubtotal: 1000, shipping: 100, idempotencyKey: "phase2b-home-credit" });
  const creditOrder = await createHomeOrder(creditOrderId, "cash_on_delivery", "new_order", creditMember);
  await writeFile(path.join(orderDir, `${creditOrderId}.json`), JSON.stringify({ ...creditOrder, credit: { reservationId: reservation.reservationId, appliedAmount: 100 }, totalBeforeCredit: 1130, total: 1030 }), "utf8");
  await cancellation.cancelOrderCanonically({ orderNumber: creditOrderId, cancellationReason: "測試取消", cancelledBy: "admin", idempotencyKey: "phase2b-home-credit-cancel", sendNotification: async () => ({ sent: false }) });
  const afterCreditCancel = await commerce.readMembershipCommerceState();
  check("home canonical cancellation releases reserved credit", afterCreditCancel.creditReservations[reservation.reservationId].status === "released" && (await adminOrders.readOrder(creditOrderId))?.inventoryReturn?.state === "returned");
  const creditedCompletionId = "KD20260922-2008";
  const consumedReservation = await commerce.reserveCredit({ memberId: creditMember, orderId: creditedCompletionId, requestedAmount: 100, merchandiseSubtotal: 1000, shipping: 100, idempotencyKey: "phase2b-home-credit-consume" });
  const creditedOrder = await createHomeOrder(creditedCompletionId, "cash_on_delivery", "new_order", creditMember);
  await writeFile(path.join(orderDir, `${creditedCompletionId}.json`), JSON.stringify({ ...creditedOrder, credit: { reservationId: consumedReservation.reservationId, appliedAmount: 100 }, totalBeforeCredit: 1130, total: 1030 }), "utf8");
  const creditedPreparing = await fulfillment.recordAdminFulfillmentEvent({ orderId: creditedCompletionId, state: "preparing", expectedRevision: 0 });
  const creditedShipped = await fulfillment.recordAdminFulfillmentEvent({ orderId: creditedCompletionId, state: "shipped", expectedRevision: creditedPreparing.record.revision });
  await fulfillment.recordAdminFulfillmentEvent({ orderId: creditedCompletionId, state: "completed", expectedRevision: creditedShipped.record.revision, confirmed: true, delivered: true, codCollected: true });
  check("home canonical completion consumes reserved credit once", (await commerce.readMembershipCommerceState()).creditReservations[consumedReservation.reservationId].status === "consumed");
  console.log(`\nPhase 2B home-delivery foundation: ${checks} checks PASS`);
} finally {
  await rm(root, { recursive: true, force: true });
}
