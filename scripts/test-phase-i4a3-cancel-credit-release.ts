import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const acceptanceFiles = [
  path.join(process.cwd(), "data", "orders", "KD20260831-9263.json"),
  path.join(process.cwd(), "data", "membership-commerce", "commerce-state.json"),
  path.join(process.cwd(), "public", "data", "website-data.json"),
];
const hash = async (filePath: string) => createHash("sha256").update(await readFile(filePath)).digest("hex");
const realHashesBefore = await Promise.all(acceptanceFiles.map(hash));

const root = await mkdtemp(path.join(os.tmpdir(), "kd-phase-i4a3-"));
process.env.KD_DATA_DIR = root;
process.env.AUTH_SESSION_SECRET = "phase-i4a3-test-secret-longer-than-thirty-two-characters";

const identity = await import("../lib/memberIdentity");
const rulesModule = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const { projectOrderFinancialBreakdown } = await import("../lib/orderFinancialProjection");
const { assessOrderCancellation } = await import("../lib/orderInventoryPolicy");
const { assertOrderStatusTransition, OrderStatusTransitionError } = await import("../lib/adminOrders");
const { returnCommittedInventoryForCancellation } = await import("../lib/orderInventoryReturn");

let checks = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${name}`);
}

try {
  const member = await identity.ensureLegacyCanonicalMember({ memberId: "member_phase_i4a3", identities: [{ provider: "email", subject: "phase-i4a3@example.test" }] });
  const unrelated = await identity.ensureLegacyCanonicalMember({ memberId: "member_phase_i4a3_other", identities: [{ provider: "email", subject: "phase-i4a3-other@example.test" }] });
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: 0, rules: structuredClone(rulesModule.DEFAULT_MEMBERSHIP_RULES), now: new Date("2026-08-01T00:00:00.000Z") });

  const grant = await commerce.adjustMemberCreditByAdmin({ memberId: member.memberId, direction: "grant", amount: 100, reason: "PRIVATE_ADMIN_REASON", note: "PRIVATE_ADMIN_NOTE", idempotencyKey: "PRIVATE_ADMIN_IDEMPOTENCY", now: new Date("2026-08-20T01:00:00.000Z") });
  const reservation = await commerce.reserveCredit({ memberId: member.memberId, orderId: "KD-CANCEL-CREDIT", requestedAmount: 100, merchandiseSubtotal: 500, shipping: 60, idempotencyKey: "PRIVATE_CHECKOUT_IDEMPOTENCY", now: new Date("2026-08-31T01:00:00.000Z") });
  const order = {
    orderNumber: "KD-CANCEL-CREDIT", createdAt: "2026-08-31T01:00:00.000Z", status: "waiting_merchant_create_cod_shipment", orderMode: "711_cod",
    subtotal: 500, shipping: 60, totalBeforeCredit: 560, total: 460,
    credit: { reservationId: reservation.reservationId, requestedAmount: 100, appliedAmount: 100, status: "reserved" },
    inventoryTransaction: { state: "inventory_committed", changes: [{ skuId: "test-sku", productSlug: "test-product", productName: "測試商品", demand: 1 }] },
  };
  type TestOrder = typeof order & { inventoryReturn?: { state?: string } };
  check("A eligible order with reserved credit can cancel", assessOrderCancellation(order).allowed && (() => { assertOrderStatusTransition(order, "cancelled"); return true; })());

  const websiteFile = path.join(root, "store", "website-data.json");
  await mkdir(path.dirname(websiteFile), { recursive: true });
  await writeFile(websiteFile, `${JSON.stringify({ version: 1, menu: { products: [{ slug: "test-product", stock: 8, skus: [{ id: "test-sku", stock: 8, enabled: true }] }] } }, null, 2)}\n`, "utf8");
  let persistedOrder: TestOrder = structuredClone(order);
  const returned = await returnCommittedInventoryForCancellation({ order, websiteFile, persistOrder: async (nextOrder) => { persistedOrder = structuredClone(nextOrder) as TestOrder; }, now: () => new Date("2026-09-01T01:00:00.000Z") });
  const inventoryAfterFirst = JSON.parse(await readFile(websiteFile, "utf8"));
  check("G cancellation restores committed inventory exactly once", returned.state === "returned" && inventoryAfterFirst.menu.products[0].skus[0].stock === 9 && persistedOrder.inventoryReturn?.state === "returned");
  const returnedRetry = await returnCommittedInventoryForCancellation({ order: returned.order, websiteFile, persistOrder: async (nextOrder) => { persistedOrder = structuredClone(nextOrder) as TestOrder; }, now: () => new Date("2026-09-01T01:01:00.000Z") });
  const inventoryAfterRetry = JSON.parse(await readFile(websiteFile, "utf8"));
  check("G cancellation retry cannot restore inventory twice", returnedRetry.state === "already_returned" && inventoryAfterRetry.menu.products[0].skus[0].stock === 9);

  const sourceBeforeRelease = (await commerce.readMembershipCommerceState()).creditEntries[grant.entry.creditEntryId];
  const released = await commerce.settleCreditReservationForOrder({ orderId: order.orderNumber, action: "release", idempotencyKey: `admin-cancel:${order.orderNumber}`, reason: "PRIVATE_RELEASE_REASON", now: new Date("2026-09-01T01:00:00.000Z") });
  const afterRelease = await commerce.readMembershipCommerceState();
  check("B cancellation releases exactly the reserved amount", released?.amount === 100);
  check("C member available credit returns correctly", await commerce.getAvailableCredit(member.memberId, new Date("2026-09-01T01:00:01.000Z")) === 100);
  check("D reservation becomes released", afterRelease.creditReservations[reservation.reservationId].status === "released");
  check("E original credit ledger is not destructively rewritten", sourceBeforeRelease.amount === 100 && afterRelease.creditEntries[grant.entry.creditEntryId].amount === 100 && afterRelease.creditEntries[grant.entry.creditEntryId].creditEntryId === sourceBeforeRelease.creditEntryId && afterRelease.creditEntries[grant.entry.creditEntryId].remainingAmount === 100);
  check("credit release creates one canonical audit record", afterRelease.audit.filter((entry) => entry.action === "credit-released" && entry.entityId === reservation.reservationId).length === 1);

  await commerce.settleCreditReservationForOrder({ orderId: order.orderNumber, action: "release", idempotencyKey: `admin-cancel:${order.orderNumber}`, reason: "PRIVATE_RELEASE_REASON", now: new Date("2026-09-01T01:01:00.000Z") });
  await commerce.settleCreditReservationForOrder({ orderId: order.orderNumber, action: "release", idempotencyKey: "different-duplicate-cancel", reason: "PRIVATE_RELEASE_REASON", now: new Date("2026-09-01T01:02:00.000Z") });
  const afterRetries = await commerce.readMembershipCommerceState();
  check("F cancellation retry does not release credit twice", afterRetries.creditEntries[grant.entry.creditEntryId].remainingAmount === 100 && afterRetries.audit.filter((entry) => entry.action === "credit-released" && entry.entityId === reservation.reservationId).length === 1);
  assert.throws(() => assertOrderStatusTransition({ ...returned.order, status: "cancelled" }, "cancelled"), OrderStatusTransitionError);
  check("H already-cancelled order cannot start another cancellation", true);

  const consumedGrant = await commerce.adjustMemberCreditByAdmin({ memberId: unrelated.memberId, direction: "grant", amount: 50, reason: "consumed fixture", idempotencyKey: "consumed-grant", now: new Date("2026-08-20T02:00:00.000Z") });
  const consumedReservation = await commerce.reserveCredit({ memberId: unrelated.memberId, orderId: "KD-CONSUMED-CREDIT", requestedAmount: 50, merchandiseSubtotal: 100, shipping: 0, idempotencyKey: "consumed-reserve", now: new Date("2026-08-31T02:00:00.000Z") });
  await commerce.settleCreditReservation({ reservationId: consumedReservation.reservationId, action: "consume", idempotencyKey: "consume", reason: "completed", now: new Date("2026-09-01T02:00:00.000Z") });
  await assert.rejects(commerce.settleCreditReservation({ reservationId: consumedReservation.reservationId, action: "release", idempotencyKey: "wrong-release", reason: "must reject", now: new Date("2026-09-01T02:01:00.000Z") }), commerce.MembershipCommerceError);
  const consumedState = await commerce.readMembershipCommerceState();
  check("I consumed credit is not treated as a normal reserved release", consumedState.creditReservations[consumedReservation.reservationId].status === "consumed" && consumedState.creditEntries[consumedGrant.entry.creditEntryId].remainingAmount === 0);

  const financial = projectOrderFinancialBreakdown(order);
  check("J order financial history retains original NT$100 deduction", financial.creditApplied === 100 && financial.totalBeforeCredit === 560 && financial.total === 460);
  const dashboard = await commerce.getMemberCommerceDashboard(member.memberId, new Date("2026-09-01T03:00:00.000Z"));
  const memberHistory = dashboard.credits.find((entry) => entry.creditEntryId === grant.entry.creditEntryId);
  check("K Member projection explains returned credit safely", memberHistory?.remainingAmount === 100 && memberHistory.orderRedemptions.some((entry) => entry.orderNumber === order.orderNumber && entry.amount === 100 && entry.status === "released"));
  const adminProjection = await commerce.getSafeOrderCreditReservation({ orderId: order.orderNumber, memberId: member.memberId });
  check("L Admin projection explains released credit", adminProjection?.amount === 100 && adminProjection.status === "released");
  const memberSerialized = JSON.stringify(dashboard);
  check("M internal Admin reason actor and idempotency metadata do not leak", !["PRIVATE_ADMIN_REASON", "PRIVATE_ADMIN_NOTE", "PRIVATE_ADMIN_IDEMPOTENCY", "PRIVATE_CHECKOUT_IDEMPOTENCY", "PRIVATE_RELEASE_REASON", "\"actor\"", "\"metadata\"", "\"idempotency\""].some((secret) => memberSerialized.includes(secret)));
  const unrelatedProjection = await commerce.getSafeOrderCreditReservation({ orderId: order.orderNumber, memberId: unrelated.memberId });
  const unrelatedDashboard = await commerce.getMemberCommerceDashboard(unrelated.memberId, new Date("2026-09-01T03:00:00.000Z"));
  check("N unrelated member cannot see this transaction", unrelatedProjection === null && !JSON.stringify(unrelatedDashboard).includes(order.orderNumber));

  const routeSource = await readFile(path.join(process.cwd(), "app", "api", "admin", "orders", "[orderNumber]", "route.ts"), "utf8");
  check("cancellation route wires inventory return and idempotent credit release", routeSource.includes("returnCommittedInventoryForCancellation") && routeSource.includes("settleCreditReservationForOrder") && routeSource.includes("admin-cancel:${orderNumber}"));

  const realHashesAfter = await Promise.all(acceptanceFiles.map(hash));
  check("O isolated tests do not mutate real acceptance data", realHashesAfter.every((value, index) => value === realHashesBefore[index]));
  console.log(`\nPhase I.4A Round 3 cancellation and credit release: ${checks} checks passed.`);
} finally {
  await rm(root, { recursive: true, force: true });
}
