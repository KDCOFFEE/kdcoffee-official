import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(os.tmpdir(), "kd-phase2c-home-"));
process.env.KD_DATA_DIR = root;
process.env.AUTH_SESSION_SECRET = "phase2c-isolated-test-secret-longer-than-thirty-two-characters";

const { validateDeliveryAddress, validateOrderDeliverySelection } = await import("../lib/deliveryAddress");
const { generalCheckoutShipping } = await import("../lib/checkoutShipping");
const { DEFAULT_MEMBERSHIP_RULES, readMembershipRulesStore, saveMembershipBusinessRules } = await import("../lib/membershipBusinessRules");
const { quoteHomeDeliveryPayable } = await import("../lib/homeDeliveryPayment");
const commerce = await import("../lib/membershipCommerce");
const { provisionCanonicalMember } = await import("../lib/memberIdentity");
const { runSubscriptionOrderScheduler } = await import("../lib/subscriptionOrderScheduler");
const { projectOrderFinancialBreakdown } = await import("../lib/orderFinancialProjection");

const addressA = { recipientName: "測試收件人", phone: "0912345678", postalCode: "100", city: "臺北市", district: "中正區", addressLine: "測試路 1 號" };
const addressB = { ...addressA, addressLine: "測試路 2 號" };
const stateFilePath = path.join(root, "membership-commerce", "commerce-state.json");
const rulesFilePath = path.join(root, "membership-commerce", "business-rules.json");
const orderDir = path.join(root, "orders");
const websiteFilePath = path.join(root, "website-data.json");
const t0 = new Date("2026-08-27T01:00:00.000Z");
const t1 = new Date("2026-08-28T01:00:00.000Z");
let checks = 0;
function check(name: string, value: unknown) { assert.ok(value, name); checks++; console.log(`PASS ${checks} ${name}`); }

try {
  check("address trims valid fields", validateDeliveryAddress({ ...addressA, city: " 臺北市 " }).city === "臺北市");
  for (const key of Object.keys(addressA) as Array<keyof typeof addressA>) {
    assert.throws(() => validateDeliveryAddress({ ...addressA, [key]: "  " }));
    check(`empty ${key} rejected`, true);
  }
  assert.throws(() => validateDeliveryAddress({ ...addressA, postalCode: "12" }));
  assert.throws(() => validateDeliveryAddress({ ...addressA, phone: "bad" }));
  for (const bad of [
    { orderMode: "home_delivery", store: { id: "123456" }, deliveryAddress: addressA, paymentMethod: "atm_transfer" },
    { orderMode: "home_delivery", studioPickup: { preferredDate: "2026-09-01" }, deliveryAddress: addressA, paymentMethod: "atm_transfer" },
    { orderMode: "711_cod", deliveryAddress: addressA },
    { orderMode: "studio_pickup", deliveryAddress: addressA },
    ...["credit_card", "unknown", ""].map((paymentMethod) => ({ orderMode: "home_delivery", deliveryAddress: addressA, paymentMethod })),
  ]) assert.throws(() => validateOrderDeliverySelection(bad));
  check("conflicting methods and inactive payments rejected", true);
  for (const paymentMethod of ["atm_transfer", "cash_on_delivery"] as const) check(`${paymentMethod} accepted`, validateOrderDeliverySelection({ orderMode: "home_delivery", deliveryAddress: addressA, paymentMethod }).paymentMethod === paymentMethod);

  check("studio general shipping zero", generalCheckoutShipping({ mode: "studio_pickup", subtotal: 1499 }) === 0);
  for (const [subtotal, expected] of [[1499, 60], [1500, 0], [2000, 0]]) check(`711 threshold ${subtotal}`, generalCheckoutShipping({ mode: "711_cod", subtotal }) === expected);
  for (const fee of [100, 120]) check(`home fee ${fee}`, generalCheckoutShipping({ mode: "home_delivery", subtotal: 2000, homeDeliveryShippingFee: fee }) === fee);
  check("home default fee fallback", generalCheckoutShipping({ mode: "home_delivery", subtotal: 1000 }) === 100);
  const campaign = { enabled: true, startDate: "2026-08-01", endDate: "2026-09-30", shippingMethods: ["711_cod"] };
  check("default campaign excludes home", generalCheckoutShipping({ mode: "home_delivery", subtotal: 1000, homeDeliveryShippingFee: 100, member: true, date: "2026-08-27", openingYearFreeShipping: campaign }) === 100);
  check("explicit campaign includes home", generalCheckoutShipping({ mode: "home_delivery", subtotal: 1000, homeDeliveryShippingFee: 100, member: true, date: "2026-08-27", openingYearFreeShipping: { ...campaign, shippingMethods: ["711_cod", "home_delivery"] } }) === 0);

  const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES);
  rules.shipping.homeDeliveryCodFee = 30;
  rules.shipping.homeDeliveryShippingFee = 100;
  rules.shipping.subscriptionShippingDiscount = 60;
  for (const fee of [0, 30, 50]) {
    rules.shipping.homeDeliveryCodFee = fee;
    const quote = quoteHomeDeliveryPayable({ merchandiseSubtotal: 1000, shipping: 100, availableCredit: 0, requestedCredit: 0, method: "cash_on_delivery", rules });
    check(`COD fee ${fee} separate`, quote.codServiceFee === fee && quote.shipping === 100 && quote.total === 1100 + fee);
  }
  rules.shipping.homeDeliveryCodFee = 30;
  const atm = quoteHomeDeliveryPayable({ merchandiseSubtotal: 1000, shipping: 100, availableCredit: 0, requestedCredit: 0, method: "atm_transfer", rules });
  check("ATM has no COD fee", atm.codServiceFee === 0 && atm.total === 1100);
  rules.credit.appliesToShipping = "no";
  const noShippingCredit = quoteHomeDeliveryPayable({ merchandiseSubtotal: 1000, shipping: 100, availableCredit: 5000, requestedCredit: 5000, method: "cash_on_delivery", rules });
  check("credit excludes shipping and COD fee", noShippingCredit.creditApplied === 1000 && noShippingCredit.total === 130);
  rules.credit.appliesToShipping = "yes";
  const shippingCredit = quoteHomeDeliveryPayable({ merchandiseSubtotal: 1000, shipping: 100, availableCredit: 5000, requestedCredit: 5000, method: "cash_on_delivery", rules });
  check("excess credit leaves COD fee payable", shippingCredit.creditApplied === 1100 && shippingCredit.total === 30);
  check("historical order without COD fee projects as zero", projectOrderFinancialBreakdown({ subtotal: 1000, shipping: 100, total: 1100 }).codServiceFee === 0);

  await writeFile(websiteFilePath, JSON.stringify({ version: 1, menu: { products: [{ active: true, status: "active", purchasable: true, slug: "coffee-a", name: "Coffee A", stock: 10, purchase: [{ id: "coffee-a-01", label: "Half-pound beans", detail: "227g", price: 700, stock: 10, enabled: true, kind: "beans" }], skus: [{ id: "coffee-a-01", label: "Half-pound beans", detail: "227g", price: 700, stock: 10, enabled: true, kind: "beans" }] }] } }), "utf8");
  const memberId = (await provisionCanonicalMember({ provider: "email", subject: "phase2c@example.test", persistMember: async () => undefined })).member.memberId;
  const item = { itemId: "coffee-a-half", packageWeight: "half-pound" as const, quantity: 1, roast: "medium", unitPrice: 700, components: [{ productId: "coffee-a", weightHalfPounds: 1 as const }] };
  const subscription = await commerce.createSubscription({ memberId, startedFromOrderId: "phase2c-first", anchorDate: "2026-08-27", intervalDays: 30, shippingMethod: "home_delivery", deliveryAddress: addressA, paymentMethod: "cash_on_delivery", defaultItems: [item], idempotencyKey: "phase2c-sub", now: t0, stateFilePath, rulesFilePath });
  check("first order preference stores home address and COD", subscription.shippingMethod === "home_delivery" && subscription.deliveryAddress?.addressLine === addressA.addressLine && subscription.paymentMethod === "cash_on_delivery" && subscription.storeSelection === null);
  await commerce.activateSubscriptionFromPickup({ subscriptionId: subscription.subscriptionId, orderId: "phase2c-first", idempotencyKey: "phase2c-activate", now: t0, stateFilePath, rulesFilePath });
  const saveRules = async (homeFee: number, discount: number, codFee: number, now: Date) => {
    const store = await readMembershipRulesStore(rulesFilePath);
    const next = structuredClone(store.versions.at(-1)!.rules);
    next.shipping.homeDeliveryShippingFee = homeFee;
    next.shipping.subscriptionShippingDiscount = discount;
    next.shipping.homeDeliveryCodFee = codFee;
    await saveMembershipBusinessRules({ expectedRevision: store.revision, rules: next, now }, rulesFilePath);
  };
  await saveRules(100, 60, 30, t0);
  const cycle = await commerce.generateSubscriptionCycle({ subscriptionId: subscription.subscriptionId, sequence: 1, plannedDate: "2026-08-31", idempotencyKey: "phase2c-cycle", now: t0, stateFilePath, rulesFilePath });
  const locked = await commerce.lockSubscriptionCycle({ cycleId: cycle.cycleId, idempotencyKey: "phase2c-lock", now: t0, stateFilePath, rulesFilePath });
  check("home lock separates shipping and fee", locked.pricingSnapshot?.shipping === 40 && locked.pricingSnapshot.codServiceFee === 30 && locked.pricingSnapshot.finalAmount === 735);
  check("home lock snapshots address and payment", locked.shippingSnapshot?.deliveryAddress?.addressLine === addressA.addressLine && locked.shippingSnapshot.paymentMethod === "cash_on_delivery" && locked.shippingSnapshot.codServiceFee === 30 && locked.shippingSnapshot.storeSelection === null);
  const updated = await commerce.updateSubscriptionPreferences({ memberId, subscriptionId: subscription.subscriptionId, expectedRevision: (await commerce.readMembershipCommerceState(stateFilePath)).subscriptions[subscription.subscriptionId].revision, idempotencyKey: "phase2c-address-b", shippingMethod: "home_delivery", deliveryAddress: addressB, paymentMethod: "atm_transfer", stateFilePath });
  check("future preference changes without editing lock", updated.deliveryAddress?.addressLine === addressB.addressLine && updated.paymentMethod === "atm_transfer");
  await saveRules(120, 100, 50, t1);
  const persistedLock = (await commerce.readMembershipCommerceState(stateFilePath)).cycles[cycle.cycleId];
  check("locked pricing and address immutable", persistedLock.pricingSnapshot?.shipping === 40 && persistedLock.pricingSnapshot.codServiceFee === 30 && persistedLock.shippingSnapshot?.deliveryAddress?.addressLine === addressA.addressLine && persistedLock.shippingSnapshot.paymentMethod === "cash_on_delivery");
  const future = await commerce.generateSubscriptionCycle({ subscriptionId: subscription.subscriptionId, sequence: 2, plannedDate: "2026-10-01", idempotencyKey: "phase2c-future", now: t1, stateFilePath, rulesFilePath });
  const futureLocked = await commerce.lockSubscriptionCycle({ cycleId: future.cycleId, idempotencyKey: "phase2c-future-lock", now: t1, stateFilePath, rulesFilePath });
  check("future ATM lock takes current address and rules", futureLocked.shippingSnapshot?.deliveryAddress?.addressLine === addressB.addressLine && futureLocked.pricingSnapshot?.shipping === 20 && futureLocked.pricingSnapshot.codServiceFee === 0);
  const scheduled = await runSubscriptionOrderScheduler({ today: "2026-08-28", now: t1, stateFilePath, rulesFilePath, orderDir, websiteFilePath });
  assert.equal(scheduled.failed, 0);
  assert.equal(scheduled.created, 1);
  const orderNumber = scheduled.items.find((entry) => entry.cycleId === cycle.cycleId)?.orderNumber;
  assert.ok(orderNumber);
  const order = JSON.parse(await readFile(path.join(orderDir, `${orderNumber}.json`), "utf8"));
  check("scheduler uses locked home snapshot", order.orderMode === "home_delivery" && order.status === "new_order" && order.deliveryAddress.addressLine === addressA.addressLine && order.payment === "cash_on_delivery" && order.codServiceFee === 30 && order.shipping === 40 && order.total === 735 && order.paymentDetails.status === "pending" && order.inventoryTransaction.state === "inventory_committed");

  const switches: Array<["studio_pickup" | "711_cod" | "home_delivery", "atm_transfer" | "cash_on_delivery" | null]> = [["studio_pickup", null], ["711_cod", null], ["home_delivery", "cash_on_delivery"], ["studio_pickup", null], ["home_delivery", "atm_transfer"], ["711_cod", null], ["home_delivery", "cash_on_delivery"], ["home_delivery", "atm_transfer"]];
  for (const [shippingMethod, paymentMethod] of switches) {
    const current = (await commerce.readMembershipCommerceState(stateFilePath)).subscriptions[subscription.subscriptionId];
    const changed = await commerce.updateSubscriptionPreferences({ memberId, subscriptionId: subscription.subscriptionId, expectedRevision: current.revision, idempotencyKey: `switch-${checks}`, shippingMethod, storeSelection: shippingMethod === "711_cod" ? { storeId: "123456", storeName: "Test store" } : null, deliveryAddress: shippingMethod === "home_delivery" ? addressB : null, paymentMethod, stateFilePath });
    check(`switch to ${shippingMethod} ${paymentMethod || ""}`, changed.shippingMethod === shippingMethod && (shippingMethod === "711_cod" ? Boolean(changed.storeSelection?.storeId) && changed.deliveryAddress === null : shippingMethod === "home_delivery" ? changed.storeSelection === null && changed.deliveryAddress?.addressLine === addressB.addressLine && changed.paymentMethod === paymentMethod : changed.storeSelection === null && changed.deliveryAddress === null && changed.paymentMethod === null));
  }
  const checkoutSource = await readFile(path.join(process.cwd(), "app/checkout/page.tsx"), "utf8");
  check("checkout exposes home but no credit card", checkoutSource.includes('value="home_delivery"') && !checkoutSource.includes('value="credit_card"'));
  check("checkout keeps credit quote on subtotal and shipping", checkoutSource.includes('credit/quote?subtotal=${subtotal}&shipping=${shipping}'));
  console.log(`Phase 2C PASS (${checks} focused checks)`);
} finally {
  await rm(root, { recursive: true, force: true });
}
