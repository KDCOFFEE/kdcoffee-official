// Isolated synthetic integration: no environment files, production records or backups.
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const root = await mkdtemp(path.join(os.tmpdir(), "kd-credit-ledger-display-"));
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.AUTH_SESSION_SECRET = randomBytes(48).toString("hex");
process.env.MEMBER_IDENTITY_SECRET = randomBytes(48).toString("hex");
globalThis.fetch = async () => { throw new Error("Network forbidden"); };
const commerce = await import("../lib/membershipCommerce");
const { selectMemberCreditTransactions } = await import("../lib/memberCreditTransactions");
const { selectMemberCreditPassbook } = await import("../lib/memberCreditPassbook");
const { default: Ledger } = await import("../components/member/MemberCreditLedger");
const { default: Provider } = await import("../components/member/MemberCenterCopyProvider");
const { GET } = await import("../app/api/member/credit/history/route");
const identity = await import("../lib/memberIdentity");
const auth = await import("../lib/memberAuth");
const now = new Date("2026-11-11T04:00:00Z");
const owner = await identity.ensureLegacyCanonicalMember({ memberId: "ledger_fixture", identities: [{ provider: "email", subject: "ledger@example.test" }] });
const memberId = owner.memberId;
await auth.saveMember({ id: memberId, email: "ledger@example.test", createdAt: now.toISOString(), lastLoginAt: now.toISOString() });
let checks = 0;
function check(name: string, run: () => void) { run(); console.log(`PASS ${++checks}: ${name}`); }
await commerce.adjustMemberCreditByAdmin({ memberId, direction: "grant", amount: 8018, reason: "synthetic", idempotencyKey: "fixture-grant", now });
assert.equal(await commerce.getAvailableCredit(memberId, now), 8018);
const reserved = await commerce.reserveCredit({ memberId, orderId: "KD20261111-5626", requestedAmount: 546, merchandiseSubtotal: 780, shipping: 0, idempotencyKey: "fixture-reserve", now });
check("8018 → reserve 546 → 7472", () => assert.equal(reserved.amount, 546));
assert.equal(await commerce.getAvailableCredit(memberId, now), 7472);
await commerce.settleCreditReservation({ reservationId: reserved.reservationId, action: "consume", reason: "synthetic completed", idempotencyKey: "fixture-consume", now: new Date("2026-11-11T05:00:00Z") });
const state = await commerce.readMembershipCommerceState();
const before = JSON.stringify(state);
const rows = selectMemberCreditTransactions(state, memberId);
check("consumed is one 546 lifecycle row; no double debit", () => { assert.equal(rows.length, 1); assert.equal(rows[0].status, "consumed"); assert.equal(rows[0].amount, 546); });
assert.equal(await commerce.getAvailableCredit(memberId, now), 7472);
const order = { orderNumber: "KD20261111-5626", member: { memberId }, status: "completed", subtotal: 780, total: 234, paymentStatus: "paid", returnStatus: "rejected" };
const orderBefore = JSON.stringify(order);
await mkdir(path.join(root, "orders"), { recursive: true });
await writeFile(path.join(root, "orders", order.orderNumber + ".json"), orderBefore);
const rejected = { ...state, returnEvents: [{ type: "RETURN_REJECTED", orderId: order.orderNumber }] };
check("rejected return cannot add refund or change consumed display", () => assert.deepEqual(selectMemberCreditTransactions(rejected, memberId), rows));
const page = selectMemberCreditPassbook(state, memberId);
check("grant plus order debit reconciles to 7472", () => assert.equal(page.entries.reduce((sum, row) => sum + row.change, 0), 7472));
// eslint-disable-next-line react/no-children-prop -- Provider requires typed children in this SSR fixture.
const html = renderToStaticMarkup(createElement(Provider, { initialOverrides: {}, children: createElement(Ledger, { initialPage: page }) }));
check("member sees order 546, consumed label, recorded-time caveat and valid order link", () => {
  for (const value of ["KD20261111-5626", "546", "訂單正式結算使用", "狀態記錄時間", "/orders/KD20261111-5626", "不再次扣款"]) assert.ok(html.includes(value), value);
});
for (const status of ["reserved", "released"] as const) {
  const variant = structuredClone(state);
  variant.creditReservations[reserved.reservationId].status = status;
  const row = selectMemberCreditPassbook(variant, memberId).entries.find(row => row.transaction);
  check(status + " lifecycle and net display", () => { assert.equal(row?.transaction?.status, status); assert.equal(row?.change, status === "released" ? 0 : -546); });
}
check("another member sees no reservation", () => assert.deepEqual(selectMemberCreditTransactions(state, "other"), []));
check("legacy missing reservations safe", () => assert.deepEqual(selectMemberCreditTransactions({}, memberId), []));
const legacy = { ...reserved, createdAt: undefined, updatedAt: "invalid", status: "consumed" };
const unknown = selectMemberCreditTransactions({ creditReservations: { legacy } }, memberId)[0];
check("missing dates stay null, never synthesized", () => { assert.equal(unknown.reservedAt, null); assert.equal(unknown.statusRecordedAt, null); });
check("exact duplicate event once", () => assert.equal(selectMemberCreditTransactions({ creditReservations: { a: reserved, b: reserved } }, memberId).length, 1));
check("conflicting duplicate omitted", () => assert.equal(selectMemberCreditTransactions({ creditReservations: { a: reserved, b: { ...reserved, amount: 123 } } }, memberId).length, 0));
check("invalid monetary or status fields omitted", () => assert.equal(selectMemberCreditTransactions({ creditReservations: { a: { ...reserved, amount: NaN }, b: { ...reserved, status: "unknown" } } }, memberId).length, 0));
const many = structuredClone(state);
for (let i = 0; i < 43; i++) many.creditReservations["fixture-" + i] = { ...reserved, reservationId: "fixture-" + i, status: "released" };
let cursor: string | undefined, seen = 0;
do { const part = selectMemberCreditPassbook(many, memberId, 0, cursor); seen += part.entries.length; cursor = part.nextCursor ?? undefined; } while (cursor);
check("merged pagination includes each grant/reservation once", () => assert.equal(seen, 45));
const globals = globalThis as typeof globalThis & { __creditTestCookie?: string };
globals.__creditTestCookie = undefined;
const denied = await GET(new Request("http://localhost/api/member/credit/history?memberId=" + memberId));
check("unauthenticated history denied", () => assert.equal(denied.status, 401));
const session = auth.createSessionToken(memberId);
globals.__creditTestCookie = session;
const response = await GET(new Request("http://localhost/api/member/credit/history?memberId=other"));
assert.equal(response.status, 200);
const result = await response.json();
check("session identity overrides forged member parameter", () => assert.equal(result.entries.filter((row: { transaction?: unknown }) => row.transaction).length, 1));
check("private no-store response", () => assert.equal(response.headers.get("Cache-Control"), "private, no-store"));
check("read model does not mutate canonical economic state", () => assert.equal(JSON.stringify(state), before));
check("completed order total/subtotal/payment unchanged", () => assert.equal(JSON.stringify(order), orderBefore));
assert.equal(await readFile(path.join(root, "orders", order.orderNumber + ".json"), "utf8"), orderBefore);
assert.equal(JSON.stringify(await commerce.readMembershipCommerceState()), before);
const other = await identity.ensureLegacyCanonicalMember({ memberId: "ledger_other", identities: [{ provider: "email", subject: "other@example.test" }] });
await auth.saveMember({ id: other.memberId, email: "other@example.test", createdAt: now.toISOString(), lastLoginAt: now.toISOString() });
globals.__creditTestCookie = auth.createSessionToken(other.memberId);
const forbidden = await GET(new Request("http://localhost/api/member/credit/history?memberId=" + memberId));
const foreignPage = await forbidden.json();
check("authenticated other account cannot request owner's rows", () => assert.equal(foreignPage.entries.length, 0));
const legacyPages = structuredClone(many);
for (const item of Object.values(legacyPages.creditReservations)) { item.createdAt = ""; item.updatedAt = ""; }
let legacyCursor: string | undefined, legacySeen = 0;
do { const part = selectMemberCreditPassbook(legacyPages, memberId, 0, legacyCursor); legacySeen += part.entries.length; legacyCursor = part.nextCursor ?? undefined; } while (legacyCursor);
check("undated legacy events paginate without invented dates", () => assert.equal(legacySeen, 45));
const cancel = await commerce.reserveCredit({ memberId, orderId: "KD20261111-9999", requestedAmount: 100, merchandiseSubtotal: 780, shipping: 0, idempotencyKey: "fixture-cancel", now });
assert.equal(await commerce.getAvailableCredit(memberId, now), 7372);
await commerce.settleCreditReservation({ reservationId: cancel.reservationId, action: "release", reason: "synthetic cancellation", idempotencyKey: "fixture-release", now });
assert.equal(await commerce.getAvailableCredit(memberId, now), 7472);
const final = await commerce.readMembershipCommerceState();
check("actual cancelled reservation releases once and displays net zero", () => {
  const row = selectMemberCreditPassbook(final, memberId).entries.find(row => row.transaction?.eventId === cancel.reservationId);
  assert.equal(row?.change, 0); assert.equal(row?.transaction?.status, "released");
  assert.deepEqual(final.creditReservations[reserved.reservationId], state.creditReservations[reserved.reservationId]);
});
const { prepareOrderCompletionWrite } = await import("../lib/orderCompletion");
const base = { ...order, status: "ready_for_pickup", createdAt: now.toISOString(),
  purchaser: { actorId: memberId }, orderMode: "studio_pickup", shipping: 0,
  credit: { appliedAmount: 546 }, paymentDetails: { status: "paid", method: "cash_on_delivery" },
  items: [{ slug: "synthetic-coffee", optionId: "fixture", name: "Synthetic coffee", quantity: 1, unitPrice: 780, lineTotal: 780 }],
  fulfillmentSummary: { state: "completed" }, fulfillmentEvents: [] as Record<string, unknown>[] };
const completedOrder = await prepareOrderCompletionWrite(base, { ...base, status: "completed", fulfillmentEvents: [{ eventId: "fixture-completed", state: "completed", occurredAt: "2026-11-11T05:00:00.000Z" }] });
const completedBytes = JSON.stringify(completedOrder);
await writeFile(path.join(root, "orders", order.orderNumber + ".json"), completedBytes);
const completion = completedOrder.completion as import("../lib/orderCompletion").OrderCompletionSnapshot;
assert.equal(completion.returnLines?.status, "resolved");
const returnLineRef = completion.returnLines!.lines[0].returnLineRef;
const returnNow = new Date("2026-11-12T05:00:00Z");
const authorizeOrder = (value: Readonly<Record<string, unknown>>, actor: { actorId: string; authority: string }) => {
  if (actor.authority === "reviewer" && actor.actorId === "fixture-reviewer") return;
  if (actor.authority === "customer" && (value.purchaser as { actorId: string }).actorId === actor.actorId) return;
  throw new Error("not authorized");
};
const request = await commerce.executeOrderReturnCommand({ orderNumber: order.orderNumber,
  actor: { actorId: memberId, authority: "customer" }, command: { type: "RETURN_REQUESTED", lines: [{ returnLineRef, quantity: 1 }],
    conditionAcknowledgement: { itemsComplete: true, unopenedUnusedWhereApplicable: true } },
  reason: "synthetic request", idempotencyKey: "fixture-return-request", authorizeOrder, now: returnNow });
assert.equal(request.status, "applied");
if (request.status !== "applied") throw new Error("fixture request failed");
const reject = await commerce.executeOrderReturnCommand({ orderNumber: order.orderNumber,
  actor: { actorId: "fixture-reviewer", authority: "reviewer" }, command: { type: "RETURN_REJECTED", returnRequestId: request.event.returnRequestId },
  reason: "synthetic rejection", idempotencyKey: "fixture-return-reject", authorizeOrder, now: returnNow });
assert.equal(reject.status, "applied");
const afterReject = await commerce.readMembershipCommerceState();
check("real rejected return preserves all credit entries and reservations", () => {
  assert.deepEqual(afterReject.creditEntries, final.creditEntries);
  assert.deepEqual(afterReject.creditReservations, final.creditReservations);
  assert.deepEqual(selectMemberCreditTransactions(afterReject, memberId), selectMemberCreditTransactions(final, memberId));
});
assert.equal(await commerce.getAvailableCredit(memberId, returnNow), 7472);
check("real rejected return keeps completed order and NT$780 / NT$234 byte-identical", () => {
  assert.equal(completedOrder.status, "completed"); assert.equal(completedOrder.subtotal, 780); assert.equal(completedOrder.total, 234);
});
assert.equal(await readFile(path.join(root, "orders", order.orderNumber + ".json"), "utf8"), completedBytes);
console.log(`PASS ${checks} checks. Synthetic root: ${root}`);
