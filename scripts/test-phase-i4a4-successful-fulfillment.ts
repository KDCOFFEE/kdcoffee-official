import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const realFiles = [
  path.join(process.cwd(), "data", "orders", "KD20260831-6077.json"),
  path.join(process.cwd(), "data", "orders", "KD20260831-9263.json"),
  path.join(process.cwd(), "data", "membership-commerce", "commerce-state.json"),
  path.join(process.cwd(), "public", "data", "website-data.json"),
  path.join(process.cwd(), "data", "fulfillment", "state.json"),
];
const sha256File = async (filePath: string) => createHash("sha256").update(await readFile(filePath)).digest("hex");
const realHashesBefore = await Promise.all(realFiles.map(sha256File));

const root = await mkdtemp(path.join(os.tmpdir(), "kd-phase-i4a4-"));
process.env.KD_DATA_DIR = root;
process.env.AUTH_SESSION_SECRET = "phase-i4a4-test-secret-longer-than-thirty-two-characters";

const identity = await import("../lib/memberIdentity");
const rulesModule = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const fulfillment = await import("../lib/fulfillment");
const adminOrders = await import("../lib/adminOrders");
const storage = await import("../lib/storagePaths");
const { assessOrderCancellation } = await import("../lib/orderInventoryPolicy");
const { buildOrderTimeline } = await import("../lib/orderTimeline");

let checks = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${name}`);
}

try {
  const targetMember = await identity.ensureLegacyCanonicalMember({ memberId: "member_phase_i4a4", identities: [{ provider: "email", subject: "phase-i4a4@example.test" }] });
  const unrelatedMember = await identity.ensureLegacyCanonicalMember({ memberId: "member_phase_i4a4_other", identities: [{ provider: "email", subject: "phase-i4a4-other@example.test" }] });
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: 0, rules: structuredClone(rulesModule.DEFAULT_MEMBERSHIP_RULES), now: new Date("2026-08-01T00:00:00.000Z") });
  const targetUnrelatedGrant = await commerce.adjustMemberCreditByAdmin({ memberId: targetMember.memberId, direction: "grant", amount: 55, reason: "isolated existing balance", idempotencyKey: "i4a4-target-existing-grant", now: new Date("2026-08-19T00:00:00.000Z") });
  const unrelatedGrant = await commerce.adjustMemberCreditByAdmin({ memberId: unrelatedMember.memberId, direction: "grant", amount: 77, reason: "isolated unrelated fixture", idempotencyKey: "i4a4-unrelated-grant", now: new Date("2026-08-20T00:00:00.000Z") });

  const orderNumber = "KD20260831-4400";
  const orderDir = storage.getOrdersDir();
  const websiteFile = storage.getWebsiteDataFile();
  await mkdir(orderDir, { recursive: true });
  await mkdir(path.dirname(websiteFile), { recursive: true });
  await writeFile(websiteFile, `${JSON.stringify({ version: 1, menu: { products: [{ slug: "turner-sunset", stock: 9, skus: [{ id: "turner-sunset-02", stock: 9, enabled: true }] }] } }, null, 2)}\n`, "utf8");
  await writeFile(path.join(orderDir, `${orderNumber}.json`), `${JSON.stringify({
    orderNumber, createdAt: "2026-08-31T05:41:01.814Z", status: "waiting_merchant_create_cod_shipment", orderMode: "711_cod",
    customer: { name: "SAFE_MEMBER_NAME", phone: "PRIVATE_PHONE", email: "PRIVATE_EMAIL" }, member: { memberId: targetMember.memberId, lineDisplayName: "SAFE_MEMBER_NAME" },
    store: { id: "231152", name: "福賜", address: "PRIVATE_ADDRESS" }, payment: "cash_on_delivery", delivery: "7-ELEVEN 門市取貨付款", subscriptionIntent: null,
    items: [{ slug: "turner-sunset", optionId: "turner-sunset-02", name: "特納夕日", quantity: 1, lineTotal: 500, basePV: 50, effectivePV: 50 }],
    subtotal: 500, shipping: 60, total: 560,
    inventoryTransaction: { state: "inventory_committed", changes: [{ skuId: "turner-sunset-02", productSlug: "turner-sunset", productName: "特納夕日", beforeStock: 10, demand: 1, afterStock: 9 }] },
    lineNotification: { sent: false },
  }, null, 2)}\n`, "utf8");

  const websiteBefore = await sha256File(websiteFile);
  const initialOrder = (await adminOrders.readOrder(orderNumber))!;
  const initial = fulfillment.fulfillmentRecordForOrder(await fulfillment.readFulfillmentStore(), initialOrder);
  check("A pending 7-ELEVEN order begins at canonical inferred order_created", initial.currentState === "order_created" && initial.revision === 0);

  const preparing = await fulfillment.recordAdminFulfillmentEvent({ orderId: orderNumber, state: "preparing", expectedRevision: 0, now: new Date("2026-09-01T01:00:00.000Z") });
  const shipped = await fulfillment.recordAdminFulfillmentEvent({ orderId: orderNumber, state: "shipped", expectedRevision: preparing.record.revision, now: new Date("2026-09-01T02:00:00.000Z") });
  const arrived = await fulfillment.recordAdminFulfillmentEvent({ orderId: orderNumber, state: "arrived_at_pickup_store", expectedRevision: shipped.record.revision, now: new Date("2026-09-02T02:00:00.000Z") });
  const completed = await fulfillment.recordAdminFulfillmentEvent({ orderId: orderNumber, state: "completed", expectedRevision: arrived.record.revision, confirmed: true, now: new Date("2026-09-03T02:00:00.000Z") });
  check("A pending order follows the incremental successful path", [preparing, shipped, arrived, completed].map((result) => result.record.currentState).join(",") === "preparing,shipped,arrived_at_pickup_store,completed");

  const websiteAfter = await sha256File(websiteFile);
  const completedOrder = (await adminOrders.readOrder(orderNumber))!;
  check("B successful fulfillment does not deduct inventory twice", websiteAfter === websiteBefore && JSON.parse(await readFile(websiteFile, "utf8")).menu.products[0].skus[0].stock === 9);
  check("C successful completion does not return inventory", completedOrder.inventoryTransaction.state === "inventory_committed" && completedOrder.inventoryReturn === undefined);
  check("D cancellation is rejected after irreversible completion", assessOrderCancellation(completedOrder).allowed === false && assessOrderCancellation(completedOrder).errorMessage === "此訂單已完成，不能再取消。");
  await assert.rejects(fulfillment.recordAdminFulfillmentEvent({ orderId: orderNumber, state: "cancelled", expectedRevision: completed.record.revision, confirmed: true }), fulfillment.FulfillmentError);
  check("D terminal fulfillment record also rejects cancellation", true);

  const commerceAfterCompletion = await readFile(storage.getMembershipCommerceStateFile(), "utf8");
  const fulfillmentAfterCompletion = await readFile(storage.getFulfillmentStateFile(), "utf8");
  const replay = await fulfillment.recordAdminFulfillmentEvent({ orderId: orderNumber, state: "completed", expectedRevision: arrived.record.revision, confirmed: true, now: new Date("2026-09-03T02:01:00.000Z") });
  check("E repeated same fulfillment event is idempotent", replay.replayed === true && (await readFile(storage.getFulfillmentStateFile(), "utf8")) === fulfillmentAfterCompletion && (await readFile(storage.getMembershipCommerceStateFile(), "utf8")) === commerceAfterCompletion);
  const finalRecord = (await fulfillment.readFulfillmentStore()).records[orderNumber];
  check("F successful pickup produces exactly one canonical completion", finalRecord.currentState === "completed" && finalRecord.events.filter((event) => event.state === "completed").length === 1);

  const timeline = buildOrderTimeline(completedOrder, "customer");
  check("G Member projection reflects completed status", completedOrder.status === "completed" && completedOrder.fulfillmentSummary?.state === "completed" && timeline.some((entry) => entry.title === "已完成取貨"));
  check("H Admin projection reflects completed status", fulfillment.fulfillmentRecordForOrder(await fulfillment.readFulfillmentStore(), completedOrder).currentState === "completed" && completedOrder.statusHistory.filter((entry: { to?: string }) => entry.to === "completed").length === 1);

  const commerceState = await commerce.readMembershipCommerceState();
  check("I no fake credit transaction is created for no-credit order", !Object.values(commerceState.creditReservations).some((entry) => entry.orderId === orderNumber) && Object.values(commerceState.creditEntries).filter((entry) => entry.memberId === targetMember.memberId).length === 1 && commerceState.creditEntries[targetUnrelatedGrant.entry.creditEntryId].remainingAmount === 55);
  check("J unrelated member credit remains unchanged", commerceState.creditEntries[unrelatedGrant.entry.creditEntryId].amount === 77 && commerceState.creditEntries[unrelatedGrant.entry.creditEntryId].remainingAmount === 77);
  check("K subscription and referral side effects require canonical eligibility", !Object.values(commerceState.subscriptions).some((entry) => entry.memberId === targetMember.memberId) && !Object.values(commerceState.referralRewards).some((entry) => entry.sourceOrderNumber === orderNumber));
  check("L retries do not duplicate commerce effects", finalRecord.events.length === 4 && !Object.values(commerceState.referralRewards).some((entry) => entry.sourceOrderNumber === orderNumber));
  const memberProjection = JSON.stringify({ timeline, fulfillment: { currentState: finalRecord.currentState, events: finalRecord.events.map(({ eventId, state, occurredAt }) => ({ eventId, state, occurredAt })) } });
  check("M Member projection remains privacy-safe", !["PRIVATE_PHONE", "PRIVATE_EMAIL", "PRIVATE_ADDRESS", "後台管理員", "sourceFingerprint"].some((secret) => memberProjection.includes(secret)));
  check("local Admin fulfillment path adds no external notification", completedOrder.lineNotification.sent === false && completedOrder.customerNotifications === undefined && completedOrder.adminLineNotification === undefined);

  const realHashesAfter = await Promise.all(realFiles.map(sha256File));
  check("N isolated storage leaves all real acceptance data unchanged", realHashesAfter.every((value, index) => value === realHashesBefore[index]));
  console.log(`\nPhase I.4A Round 4 successful fulfillment: ${checks} checks passed.`);
} finally {
  await rm(root, { recursive: true, force: true });
}
