import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { mock } from "node:test";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as commerce from "../lib/membershipCommerce";
import { prepareOrderCompletionWrite, type OrderCompletionSnapshot } from "../lib/orderCompletion";
import { allocateOriginalReturnCredit, verifyReturnPreviewToken } from "../lib/returnCreditPreview";
import { getReturnWorkflow, memberReturnAction, adminReturnAction, returnRewardPresentation } from "../lib/returnWorkflow";
import { returnCreditExpiryDate, returnTaipeiDate } from "../lib/returnPresentation";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } from "../lib/membershipBusinessRules";
import { createSessionToken, registerEmailMember, MEMBER_SESSION_COOKIE } from "../lib/memberAuth";
import { createAdminSessionValue, adminCookieName } from "../lib/adminAuth";
import { GET as memberGET, POST as memberPOST } from "../app/api/member/orders/[orderNumber]/returns/route";
import { GET as adminGET, POST as adminPOST } from "../app/api/admin/returns/[orderNumber]/route";
import { GET as listGET } from "../app/api/admin/returns/route";
import MemberReturnWorkflow from "../components/member/MemberReturnWorkflow";
import { AdminReturnDetail, AdminReturnList } from "../components/admin/AdminReturnWorkflow";
import { ReturnCreditEvidence, ReturnRewardEvidence } from "../components/member/ReturnEvidence";
import Provider from "../components/member/MemberCenterCopyProvider";
import CopyManager from "../components/admin/MemberCenterCopyManager";
import { resolveMemberCopy, memberCopyValidationError, MEMBER_CENTER_COPY_CATALOG } from "../lib/memberCenterCopy";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f1e-return-")), previousRoot = process.env.KD_DATA_DIR;
process.env.KD_DATA_DIR = root;
process.env.AUTH_SESSION_SECRET = "isolated-return-workflow-secret-more-than-32-characters";
process.env.MEMBER_IDENTITY_SECRET = "isolated-return-identity-secret-more-than-32-characters";
process.env.RETURN_REQUEST_LINE_NOTIFICATION_ENABLED = "false";
const now = new Date("2026-12-10T03:00:00Z"), originalAt = "2026-11-29T02:00:00Z", completedAt = "2026-12-08T02:00:00Z";
const rulesFilePath = path.join(root, "membership-commerce", "business-rules.json");
let sequence = 20000, key = 0, passes = 0;
const test = async (name: string, run: () => unknown | Promise<unknown>) => { await run(); console.log(`PASS ${++passes} ${name}`); };
const write = async (file: string, value: unknown) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value)); };
const protectedFiles = ["data/fulfillment/state.json", "data/member-identity/registry.json", "data/membership-commerce/commerce-state.json", "data/membership-commerce/business-rules.json", "public/data/assets.json", "public/data/homepage.json", "public/data/pages.json", "public/data/website-data.json"];
const bytes = (file: string) => fs.readFile(file).then(value => value.toString("base64"), () => null);
const protectedBefore = await Promise.all(protectedFiles.map(bytes));
const globals = globalThis as typeof globalThis & { __returnCookies?: Record<string, string>; __returnHooks?: Hooks };
const context = (orderNumber: string) => ({ params: Promise.resolve({ orderNumber }) });
const request = (body: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/returns", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
// eslint-disable-next-line react/no-children-prop -- Provider's required children prop is needed by the non-JSX React.createElement overload.
const render = (child: ReactElement, overrides = {}) => renderToStaticMarkup(createElement(Provider, { initialOverrides: overrides, children: child }));
let memberId = "";
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function fixture(options: { credit?: number; quantity?: number; duplicate?: boolean; reward?: boolean; historical?: boolean; sharedState?: boolean } = {}) {
  const orderNumber = `KD20261208-${++sequence}`, quantity = options.quantity ?? 20, credit = options.credit ?? 100;
  const reservationId = `reservation-${sequence}`, stateFilePath = options.sharedState ? path.join(root, "membership-commerce", "commerce-state.json") : path.join(root, "cases", String(sequence), "commerce-state.json");
  const before = { orderNumber, createdAt: originalAt, status: "ready_for_pickup", orderMode: "studio_pickup", member: { memberId }, customer: { name: "測試會員" },
    items: Array.from({ length: options.duplicate ? 2 : 1 }, () => ({ slug: "same-coffee", optionId: "same-option", name: "原訂單咖啡", optionLabel: "半磅", quantity, unitPrice: 10, lineTotal: quantity * 10 })),
    subtotal: quantity * 10 * (options.duplicate ? 2 : 1), shipping: 0, totalBeforeCredit: quantity * 10 * (options.duplicate ? 2 : 1), total: quantity * 10 * (options.duplicate ? 2 : 1) - credit,
    credit: { appliedAmount: credit, reservationId: credit ? reservationId : undefined, rulesVersion: 2 }, paymentDetails: { status: "paid" }, inventoryTransaction: { state: "inventory_committed" } };
  const saved = options.historical ? { ...before, status: "completed" } : await prepareOrderCompletionWrite(before, { ...before, status: "completed", fulfillmentEvents: [{ eventId: `complete-${sequence}`, state: "completed", occurredAt: completedAt }] });
  const file = path.join(root, "orders", orderNumber + ".json"); await write(file, saved);
  const state = await commerce.readMembershipCommerceState(stateFilePath);
  const creditId = (suffix: string) => `${sequence}-${suffix}`;
  for (const [suffix, amount, expiry] of [["A", 50, "2026-12-01T00:00:00+08:00"], ["B", 50, "2027-01-01T00:00:00+08:00"], ["unrelated", 9999, "2030-01-01T00:00:00+08:00"]] as const) {
    state.creditEntries[creditId(suffix)] = { creditEntryId: creditId(suffix), memberId, sourceType: "manual", sourceReference: `original:${creditId(suffix)}`, amount,
      remainingAmount: suffix === "unrelated" ? amount : 0, issuedAt: originalAt, expiresAt: expiry, status: suffix === "unrelated" ? "available" : "consumed", createdAt: originalAt, metadata: {} };
  }
  if (credit) state.creditReservations[reservationId] = { reservationId, memberId, orderId: orderNumber, requestedAmount: credit, amount: credit,
    allocations: [{ creditEntryId: creditId("A"), amount: 50 }, { creditEntryId: creditId("B"), amount: 50 }], status: "consumed", createdAt: originalAt, updatedAt: originalAt };
  if (options.reward) state.retailPromotionRewards[`reward-${sequence}`] = { rewardId: `reward-${sequence}`, sourceOrderNumber: orderNumber, beneficiaryMemberId: memberId, referralCode: "original-code", attributionSource: "member-share-link", attributedAt: originalAt, attributionExpiresAt: completedAt,
    eligibleMerchandiseAmount: before.total, calculationBasis: "paid_amount", calculationBaseValue: before.total, rewardRate: 10, rewardPV: 0, pvRewardMoneyValue: 1, calculatedCreditAmount: Math.round(before.total / 10), ruleVersion: 2,
    roundingModeSnapshot: "round-half-up", baseWaitingDaysSnapshot: 0, returnProtectionDaysSnapshot: 7, totalWaitingDaysSnapshot: 7, reversalPolicySnapshot: "cancel-pending-and-reverse-released", successfulCompletionAt: completedAt,
    successfulPickupBusinessDate: "2026-12-08", releaseEligibleBusinessDate: "2026-12-15", createdAt: completedAt, releasedAt: null, sourceOrderFinalState: "completed", status: "scheduled", rewardCreditEntryId: null, reversalCreditEntryId: null, idempotencyKey: `reward:${sequence}` };
  await write(stateFilePath, state);
  const completion = saved.completion as OrderCompletionSnapshot | undefined;
  const refs = completion?.returnLines?.status === "resolved" ? completion.returnLines.lines.map(line => line.returnLineRef) : [];
  return { orderNumber, file, saved, refs, stateFilePath, a: creditId("A"), b: creditId("B"), unrelated: creditId("unrelated"), reservationId };
}
const runtime = (f: Fixture, at = now) => ({ stateFilePath: f.stateFilePath, rulesFilePath, now: at });
const values = (f: Fixture, quantity = 12) => ({ lines: [{ returnLineRef: f.refs[0], quantity }], reason: "商品不符需求", conditionAcknowledgement: { itemsComplete: true, unopenedUnusedWhereApplicable: true }, quantityAcknowledged: true });
const preview = async (f: Fixture, quantity = 12, at = now) => {
  const result = await memberReturnAction(f.orderNumber, memberId, { ...values(f, quantity), action: "preview" }, runtime(f, at));
  assert.ok(result.preview && result.confirmationToken, "Missing preview"); return { preview: result.preview, confirmationToken: result.confirmationToken };
};
const create = async (f: Fixture, p: Awaited<ReturnType<typeof preview>>, quantity = 12, idempotencyKey = `request-${++key}`, at = now) => {
  const result = await memberReturnAction(f.orderNumber, memberId,
    { ...values(f, quantity), action: "create", finalConfirmation: true, confirmationToken: p.confirmationToken, idempotencyKey }, runtime(f, at));
  assert.ok(result.returnRequestId); return { returnRequestId: result.returnRequestId, replayed: result.replayed };
};
const state = (f: Fixture) => commerce.readMembershipCommerceState(f.stateFilePath);
const view = (f: Fixture) => getReturnWorkflow(f.orderNumber, memberId, runtime(f));
async function requestId(f: Fixture, quantity = 12) { const p = await preview(f, quantity); const result = await create(f, p, quantity); if (!("returnRequestId" in result)) assert.fail(); return result.returnRequestId; }
const review = (f: Fixture, returnRequestId: string, action: string, at = now, reason = "已確認退貨證據") => adminReturnAction(f.orderNumber, "owner", { action, returnRequestId, reason, idempotencyKey: `${action}:${returnRequestId}` }, runtime(f, at));
const withdraw = (f: Fixture, returnRequestId: string, at = now) => memberReturnAction(f.orderNumber, memberId, { action: "withdraw", returnRequestId, idempotencyKey: `withdraw:${returnRequestId}` }, runtime(f, at));

type Hooks = { useState: (value: unknown) => unknown; useRef: (value: unknown) => unknown; useEffect: (callback: () => void) => void; useContext: (context: { _currentValue: unknown }) => unknown };
function hookFixture() {
  const slots: unknown[] = []; let cursor = 0;
  return { slots, start() { cursor = 0; }, useState(value: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = value; return [slots[index], (next: unknown) => { slots[index] = next; }]; },
    useRef(value: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = { current: value }; return slots[index]; }, useEffect() {}, useContext(context: { _currentValue: unknown }) { return context._currentValue; } };
}
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...nodes(element.props.children as ReactNode)];
}

try {
  const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES); rules.money.roundingMode = "round-half-up";
  await saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-01-01T00:00:00Z") }, rulesFilePath);
  const member = await registerEmailMember("return-workflow@example.test", "Isolated-Password-2026"); assert.ok(member); memberId = member.id;
  const originals = [{ creditEntryId: "A", amount: 50, expiresAt: "2026-12-01T00:00:00+08:00" }, { creditEntryId: "B", amount: 50, expiresAt: "2027-01-01T00:00:00+08:00" }];
  for (const [amount, b, a] of [[30, 30, 0], [60, 50, 10], [80, 50, 30], [100, 50, 50]]) await test(`later expiry first ${amount}: B=${b}, A=${a}`, () => { const entries = allocateOriginalReturnCredit(originals, amount, now); assert.equal(entries.find(item => item.creditEntryId === "B")?.amount, b); assert.equal(entries.find(item => item.creditEntryId === "A")?.amount ?? 0, a); });
  await test("input sequence cannot override expiry priority", () => assert.deepEqual(allocateOriginalReturnCredit([...originals].reverse(), 60, now), allocateOriginalReturnCredit(originals, 60, now)));
  await test("equal expiry tie resolves by stable credit ID", () => assert.deepEqual(allocateOriginalReturnCredit([{ ...originals[1], creditEntryId: "Z" }, { ...originals[1], creditEntryId: "C" }], 30, now).map(item => item.creditEntryId), ["C"]));
  await test("invalid original expiry fails closed", () => assert.throws(() => allocateOriginalReturnCredit([{ ...originals[0], expiresAt: "invalid" }], 1, now)));
  await test("insufficient original credits are never substituted", () => assert.throws(() => allocateOriginalReturnCredit(originals, 101, now)));
  await test("duplicate source entry evidence fails closed", () => assert.throws(() => allocateOriginalReturnCredit([originals[0], originals[0]], 1, now)));
  const f = await fixture({ reward: true }), before = await fs.readFile(f.stateFilePath, "utf8"), orderBytes = await fs.readFile(f.file, "utf8"), p = await preview(f);
  await test("preview creates no RETURN_REQUESTED", async () => assert.equal((await state(f)).returnEvents?.length, 0));
  await test("preview preserves exact commerce state bytes", async () => assert.equal(await fs.readFile(f.stateFilePath, "utf8"), before));
  await test("D0 attributable actual credit is 60", () => assert.equal(p.preview.returnCreditAmount, 60));
  await test("restorable 50 and expired 10", () => { assert.equal(p.preview.restorableCreditAmount, 50); assert.equal(p.preview.expiredCreditAmount, 10); });
  await test("expired boolean follows expired amount", () => assert.equal(p.preview.hasExpiredReturnCredit, true));
  await test("selected expiry dates remain original", () => assert.deepEqual(p.preview.entries.map(item => item.expiresAt), [originals[1].expiresAt, originals[0].expiresAt]));
  await test("member DTO has no credit IDs or fingerprints", () => { assert.ok(!JSON.stringify(p.preview).includes(f.a)); assert.ok(!JSON.stringify(p.preview).includes("Fingerprint")); });
  await test("confirmation token encrypts private credit source IDs", () => assert.ok(!Buffer.from(p.confirmationToken, "base64url").toString().includes(f.a)));
  await test("server token preserves generatedAt and full evidence", () => { const signed = verifyReturnPreviewToken(p.confirmationToken, now); assert.equal(signed.generatedAt, now.toISOString()); assert.equal(signed.entries[0].creditEntryId, f.b); });
  await test("unrelated current balance is excluded", () => assert.equal(p.preview.entries.reduce((sum, item) => sum + item.amount, 0), 60));
  await test("HOLD expectation uses precise reward dependencies", () => assert.equal(p.preview.rewardHoldExpected, true));
  await test("normal no-expired preview still returns confirmation token", async () => { const normal = await preview(f, 6); assert.equal(normal.preview.hasExpiredReturnCredit, false); assert.ok(normal.confirmationToken); });
  await test("first form opening has no expired warning dialog", async () => { const html = render(createElement(MemberReturnWorkflow, { initial: await view(f) })); assert.ok(!html.includes("抵用金返還提醒")); assert.ok(!html.includes("確認申請退貨")); });
  for (const [label, change] of [
    ["empty reason", { reason: "" }], ["reason over 200", { reason: "a".repeat(201) }], ["missing conditions", { conditionAcknowledgement: {} }],
    ["missing quantity ack", { quantityAcknowledged: false }], ["unknown line", { lines: [{ returnLineRef: "unknown", quantity: 1 }] }],
    ["zero quantity", { lines: [{ returnLineRef: f.refs[0], quantity: 0 }] }], ["quantity above remaining", { lines: [{ returnLineRef: f.refs[0], quantity: 21 }] }],
  ] as const) await test(`preview rejects ${label}`, () => assert.rejects(() => memberReturnAction(f.orderNumber, memberId, { ...values(f), ...change, action: "preview" }, runtime(f))));
  await test("member cannot read another member order", () => assert.rejects(() => getReturnWorkflow(f.orderNumber, "other-member", runtime(f))));
  await test("member cannot preview another member order", () => assert.rejects(() => memberReturnAction(f.orderNumber, "other-member", { ...values(f), action: "preview", memberId }, runtime(f))));
  await test("first click does not replace explicit final consent", () => assert.rejects(() => memberReturnAction(f.orderNumber, memberId, { ...values(f), action: "create", confirmationToken: p.confirmationToken, idempotencyKey: "no-consent" }, runtime(f))));
  await test("tampered token rejected", () => assert.rejects(() => create(f, { ...p, confirmationToken: "bad" + p.confirmationToken })));
  await test("changed reason cannot reuse confirmation", () => assert.rejects(() => memberReturnAction(f.orderNumber, memberId, { ...values(f), reason: "changed", action: "create", finalConfirmation: true, confirmationToken: p.confirmationToken, idempotencyKey: "changed-reason" }, runtime(f)), /stale_confirmation/));
  const created = await create(f, p, 12, "exact-retry"); assert.ok("returnRequestId" in created); const id = created.returnRequestId;
  await test("second explicit confirmation appends request", async () => assert.equal((await state(f)).returnEvents?.[0].type, "RETURN_REQUESTED"));
  await test("request stores detailed confirmation snapshot", async () => { const event = (await state(f)).returnEvents?.[0]; assert.ok(event?.type === "RETURN_REQUESTED"); assert.equal(event.confirmation?.preview.expiredCreditAmount, 10); assert.equal(event.confirmation?.quantityAcknowledged, true); });
  await test("browser-supplied credit amounts have no authority", async () => { const event = (await state(f)).returnEvents?.[0]; assert.ok(event?.type === "RETURN_REQUESTED"); assert.equal(event.confirmation?.preview.returnCreditAmount, 60); });
  await test("exact retry is idempotent", async () => { const replay = await create(f, p, 12, "exact-retry"); assert.ok("replayed" in replay && replay.replayed); assert.equal((await state(f)).returnEvents?.length, 1); });
  await test("concurrent state change rejects stale preview", () => assert.rejects(() => create(f, p, 12), /quantity_exceeded|stale_confirmation/));
  await test("pending request occupies remaining quantities", async () => assert.equal((await view(f)).lines[0].remainingReturnableQuantity, 8));
  await test("pending request creates exactly one HOLD", async () => assert.equal(commerce.readReturnRewardHoldDependencies(await state(f)).length, 1));
  await test("member sees pending HOLD reason", async () => assert.match((await view(f)).rewards[0].reason, /暫停/));
  await test("unrelated member sees no reward evidence", async () => assert.equal(returnRewardPresentation(await state(f), undefined, "other-member").length, 0));
  const pendingBytes = (await state(f)).returnEvents;
  await withdraw(f, id);
  await test("own pending unlocked request withdraws", async () => assert.equal((await view(f)).requests[0].status, "withdrawn"));
  await test("withdrawal keeps original request prefix", async () => assert.deepEqual((await state(f)).returnEvents?.slice(0, 1), pendingBytes));
  await test("withdrawal invokes D restoration", async () => { assert.equal(commerce.readPendingReturnRewardResolutions(await state(f))[0].result, "withdrawn"); assert.equal((await view(f)).rewards[0].blocked, false); });
  await test("withdrawn pending reward explanation restores", async () => assert.match((await view(f)).rewards[0].reason, /恢復/));
  await test("different withdrawal key cannot withdraw terminal again", () => assert.rejects(() => memberReturnAction(f.orderNumber, memberId, { action: "withdraw", returnRequestId: id, idempotencyKey: "second-withdraw" }, runtime(f))));
  const locked = await fixture({ reward: true }), lockedId = await requestId(locked); await review(locked, lockedId, "lock");
  await test("processing lock appends canonical event", async () => assert.equal((await state(locked)).returnEvents?.at(-1)?.type, "RETURN_PROCESSING_LOCKED"));
  await test("locked request hides withdrawal", async () => assert.equal((await view(locked)).requests[0].withdrawable, false));
  await test("lock prevents member withdrawal", () => assert.rejects(() => withdraw(locked, lockedId), /invalid_transition/));
  await test("Admin rejection reason is required", () => assert.rejects(() => review(locked, lockedId, "reject", now, ""), /review_reason_required/));
  await review(locked, lockedId, "reject");
  await test("rejection appends event without overwriting member reason", async () => { const events = (await state(locked)).returnEvents!; assert.equal(events.at(-1)?.type, "RETURN_REJECTED"); assert.equal(events[0].reason, "商品不符需求"); assert.equal(events.at(-1)?.reason, "已確認退貨證據"); });
  await test("rejection invokes D restoration reason", async () => assert.match((await view(locked)).rewards[0].reason, /恢復/));
  await test("incompatible second terminal action rejected", () => assert.rejects(() => review(locked, lockedId, "approve"), /invalid_transition/));
  await test("terminal action retry idempotent", async () => { const result = await review(locked, lockedId, "reject"); assert.equal(result.replayed, true); assert.equal((await state(locked)).returnEvents?.length, 3); });
  const approved = await fixture({ reward: true }), approvedId = await requestId(approved), creditBefore = (await state(approved)).creditEntries;
  await review(approved, approvedId, "approve");
  await test("approval appends canonical event", async () => assert.equal((await state(approved)).returnEvents?.at(-1)?.type, "RETURN_APPROVED"));
  await test("partial approval invokes D pending adjustment", async () => { const reward = (await view(approved)).rewards[0]; assert.equal(reward.originalPendingAmount, 10); assert.equal(reward.effectivePendingAmount, 4); assert.equal(reward.adjustment, 6); });
  await test("approval restores only valid selected credits and preserves existing entries", async () => {
    const after=(await state(approved)).creditEntries;
    for(const [id,entry] of Object.entries(creditBefore))assert.deepEqual(after[id],entry);
    const restored=Object.values(after).filter(entry=>entry.sourceReference.startsWith("return_credit_restore:"));
    assert.equal(restored.reduce((sum,entry)=>sum+entry.amount,0),50);
    assert.equal(restored[0].expiresAt,creditBefore[approved.b].expiresAt);
  });
  await test("approval preserves original expiration", async () => assert.equal((await state(approved)).creditEntries[approved.a].expiresAt, originals[0].expiresAt));
  await test("approved request cannot withdraw", () => assert.rejects(() => withdraw(approved, approvedId), /invalid_transition/));
  const full = await fixture({ reward: true }); await review(full, await requestId(full, 20), "approve");
  await test("full loss shows original and zero effective pending", async () => { const reward = (await view(full)).rewards[0]; assert.equal(reward.effectivePendingAmount, 0); assert.match(reward.reason, /已取消/); });
  await test("full loss ordinary explanation has no clawback copy", async () => assert.doesNotMatch(render(createElement(ReturnRewardEvidence, { rewards: (await view(full)).rewards })), /追回|已扣回|負數扣款/));
  const cumulative = await fixture(), firstId = await requestId(cumulative, 12); await review(cumulative, firstId, "approve"); const remainder = await preview(cumulative, 8);
  await test("second return uses remaining source credit capacity", () => { assert.equal(remainder.preview.returnCreditAmount, 40); assert.equal(remainder.preview.entries.length, 1); assert.equal(remainder.preview.entries[0].expiresAt, originals[0].expiresAt); });
  await test("rejected/withdrawn credit allocations become selectable again", async () => assert.equal((await preview(f)).preview.returnCreditAmount, 60));
  const race = await fixture({ credit: 0, quantity: 1 }), raceP = await preview(race, 1);
  const raceResults = await Promise.allSettled([create(race, raceP, 1, "tab-a"), create(race, raceP, 1, "tab-b")]);
  await test("two tabs can consume final quantity only once", async () => { assert.equal(raceResults.filter(item => item.status === "fulfilled").length, 1); assert.equal((await state(race)).returnEvents?.length, 1); });
  const expiry = await fixture(), expiryAt = new Date("2026-11-30T15:59:59.999Z");
  // Original consumption before completion is valid; use an isolated saved earlier completion for this timing fixture.
  const early = { ...expiry.saved, completion: { ...(expiry.saved.completion as OrderCompletionSnapshot), completedAt: "2026-11-29T03:00:00Z", returnDeadline: "2026-12-15T15:59:59.999Z" }, completedAt: "2026-11-29T03:00:00Z" };
  await write(expiry.file, early);
  const expiryP = await preview(expiry, 12, expiryAt);
  await test("expiry crossing between preview and confirmation rejects stale consent", () => assert.rejects(() => create(expiry, expiryP, 12, "expiry-crossing", new Date("2026-11-30T16:00:00Z")), /stale_confirmation/));
  await test("expired token requires fresh preview", () => assert.rejects(() => create(expiry, expiryP, 12, "old-token", new Date(expiryAt.getTime() + 600001)), /stale_confirmation/));
  const late = new Date("2026-12-30T03:00:00Z");
  await test("new request after saved deadline is rejected", () => assert.rejects(() => preview(f, 1, late), /return_deadline_expired/));
  const finish = await fixture({ credit: 0 }), finishId = await requestId(finish, 1); await review(finish, finishId, "approve", late);
  await test("timely request can finish after deadline", async () => assert.equal((await view(finish)).requests[0].status, "approved"));
  await test("saved deadline displays Taipei calendar date", () => assert.equal(returnTaipeiDate("2026-12-15T15:59:59.999Z"), "2026/12/15"));
  await test("exclusive midnight expiry displays original last usable date", () => assert.equal(returnCreditExpiryDate(originals[0].expiresAt), "2026/11/30"));
  await test("Taipei timeline renders local time", () => assert.equal(returnTaipeiDate("2026-12-10T03:00:00Z", true), "2026/12/10 11:00"));
  const duplicate = await fixture({ duplicate: true, credit: 0 });
  await test("duplicate SKU lines have separate return identities", async () => { const result = await view(duplicate); assert.equal(result.lines.length, 2); assert.notEqual(result.lines[0].returnLineRef, result.lines[1].returnLineRef); });
  const historical = await fixture({ historical: true });
  await test("insufficient history gets safe manual-assistance wording", async () => { const result = await view(historical); assert.equal(result.eligible, false); assert.equal(result.message, "此訂單需人工協助確認退貨資格"); });
  await test("Admin historical detail contains technical review reason", async () => assert.ok((await getReturnWorkflow(historical.orderNumber, undefined, runtime(historical))).technicalReason));
  const missing = await fixture(); const missingState = await state(missing); delete missingState.creditEntries[missing.a]; await write(missing.stateFilePath, missingState);
  await test("missing consumed source credit fails manual without substitution", async () => { assert.equal((await view(missing)).eligible, false); await assert.rejects(() => preview(missing), /missing_original_credit_expiry/); });
  const noReward = await fixture({ credit: 0 });
  await test("PV absent and reward absent work", async () => { const value = await preview(noReward, 1); assert.equal(value.preview.returnCreditAmount, 0); assert.equal(value.preview.rewardHoldExpected, false); });
  const changedBalance = await fixture(), balanceP = await preview(changedBalance), balanceState = await state(changedBalance);
  balanceState.creditEntries[changedBalance.unrelated].remainingAmount = 123; balanceState.creditEntries[changedBalance.a].status = "expired"; await write(changedBalance.stateFilePath, balanceState);
  await test("current balances/status cannot alter original source allocation", async () => assert.deepEqual((await preview(changedBalance)).preview, balanceP.preview));
  const copyKey = "member.returns.returnExpiredCreditConfirmationNotice", configured = { "member.rewards.storeCredit.title": "KD幣", [copyKey]: "已到期 {amount}，日期 {expiryDate}；本次不返還。" };
  await test("copy catalog remains unique", () => assert.equal(new Set(MEMBER_CENTER_COPY_CATALOG.map(item => item.key)).size, MEMBER_CENTER_COPY_CATALOG.length));
  await test("expired notice is configurable with required safe placeholders", () => { assert.equal(memberCopyValidationError(copyKey, configured[copyKey]), null); assert.ok(memberCopyValidationError(copyKey, "missing variables")); assert.ok(memberCopyValidationError(copyKey, "<b>{amount}{expiryDate}</b>")); });
  await test("copy renderer substitutes exact amount and date", () => assert.equal(resolveMemberCopy(configured, copyKey, { amount: "10 KD幣", expiryDate: "2026/11/30" }), "已到期 10 KD幣，日期 2026/11/30；本次不返還。"));
  await test("existing copy Admin owns new expired notice in orders group", () => { assert.ok(MEMBER_CENTER_COPY_CATALOG.some(item => item.key === copyKey && item.group === "orders")); assert.ok(render(createElement(CopyManager, { initialRevision: 0, initialOverrides: {} })).includes("訂單相關說明")); });
  await test("expired warning renders configured amount/date", () => { const html = render(createElement(ReturnCreditEvidence, { preview: p.preview, warning: true }), configured); assert.ok(html.includes("已到期 10 KD幣，日期 2026/11/30")); });
  await test("zero expired amount renders no expired-warning heading", () => assert.ok(!render(createElement(ReturnCreditEvidence, { preview: { ...p.preview, expiredCreditAmount: 0, hasExpiredReturnCredit: false }, warning: true })).includes("抵用金返還提醒")));
  await test("multiple expired entries retain separate amount/date rows", () => { const preview = { ...p.preview, entries: [{ amount: 10, expiresAt: originals[0].expiresAt, classification: "expired_not_restorable" as const }, { amount: 5, expiresAt: "2026-11-01T00:00:00+08:00", classification: "expired_not_restorable" as const }] }; const html = render(createElement(ReturnCreditEvidence, { preview, warning: true }), configured); assert.ok(html.includes("10 KD幣，日期 2026/11/30")); assert.ok(html.includes("5 KD幣，日期 2026/10/31")); });
  await test("configured warning values render escaped text", () => assert.ok(render(createElement(ReturnCreditEvidence, { preview: p.preview, warning: true }), configured).includes("本次不返還")));

  // Exercise actual client event handlers and state transitions with native effects stubbed only.
  const hooks = hookFixture(); globals.__returnHooks = hooks;
  let tree: ReactElement;
  const draw = async () => { hooks.start(); tree = MemberReturnWorkflow({ initial: await view(noReward) }); return nodes(tree); };
  let current = await draw(); const openButton = current.find(node => node.type === "button" && node.props["data-action"] === "start-return")!;
  (openButton.props.onClick as () => void)(); current = await draw();
  const submitted: Record<string, unknown>[] = [], oldFetch = globalThis.fetch, oldFormData = globalThis.FormData;
  globalThis.fetch = async (_url, options) => { const body = JSON.parse(String(options?.body ?? "{}")); submitted.push(body); if (options?.method === "POST") return Response.json(body.action === "preview" ? { preview: (await preview(noReward, 1)).preview, confirmationToken: "test-dialog-token" } : { ok: true }); return Response.json(await view(noReward)); };
  globalThis.FormData = class { get(name: string) { return name === noReward.refs[0] ? "1" : name === "reason" ? "UI reason" : "on"; } } as unknown as typeof FormData;
  const form = current.find(node => node.type === "form")!;
  await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {}, currentTarget: {} }); current = await draw();
  await test("actual first client click sends only preview", () => { assert.equal(submitted.length, 1); assert.equal(submitted[0].action, "preview"); });
  await test("normal preview opens a labelled final dialog", () => { assert.ok(current.some(node => node.type === "dialog" && node.props["aria-labelledby"] === "return-confirm-title")); assert.ok(current.some(node => node.type === "button" && nodes(node).some(child => child.props.copyKey === "member.returns.confirmSubmit"))); });
  const cancel = current.find(node => node.type === "button" && nodes(node).some(child => child.props.copyKey === "member.returns.cancel"))!; (cancel.props.onClick as () => void)(); await draw();
  await test("dialog cancellation creates no return request", () => assert.equal(submitted.length, 1));
  current = await draw(); await (current.find(node => node.type === "form")!.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {}, currentTarget: {} }); current = await draw();
  const finalButton = current.find(node => node.type === "button" && nodes(node).some(child => child.props.copyKey === "member.returns.confirmSubmit"))!;
  await (finalButton.props.onClick as () => Promise<void>)();
  await test("actual second client click sends final consent and token", () => { const last = submitted.find(item => item.action === "create")!; assert.equal(last.finalConfirmation, true); assert.equal(last.confirmationToken, "test-dialog-token"); });
  globals.__returnHooks = undefined; globalThis.fetch = oldFetch; globalThis.FormData = oldFormData;

  // Real auth tokens and route handlers; only next/headers cookie jar is a fixture.
  mock.timers.enable({ apis: ["Date"], now });
  globals.__returnCookies = {};
  await test("anonymous member read denied", async () => assert.equal((await memberGET(new Request("http://localhost:3000"), context(f.orderNumber))).status, 401));
  await test("non-admin detail denied", async () => assert.equal((await adminGET(new Request("http://localhost:3000"), context(f.orderNumber))).status, 401));
  await test("non-admin mutation denied", async () => assert.equal((await adminPOST(request({}), context(f.orderNumber))).status, 401));
  globals.__returnCookies = { [MEMBER_SESSION_COOKIE]: createSessionToken(memberId) };
  const api = await fixture({ credit: 0, sharedState: true });
  await test("authenticated member reads own return eligibility", async () => assert.equal((await memberGET(new Request("http://localhost:3000"), context(api.orderNumber))).status, 200));
  await test("member mutation rejects cross-origin", async () => assert.equal((await memberPOST(request({}, "https://other.test"), context(api.orderNumber))).status, 403));
  const other = await registerEmailMember("other-return@example.test", "Other-Isolated-Password"); assert.ok(other);
  globals.__returnCookies = { [MEMBER_SESSION_COOKIE]: createSessionToken(other.id) };
  await test("real other-member session receives 404", async () => assert.equal((await memberGET(new Request("http://localhost:3000"), context(api.orderNumber))).status, 404));
  globals.__returnCookies = { [MEMBER_SESSION_COOKIE]: createSessionToken(memberId) };
  const apiPreviewResponse = await memberPOST(request({ ...values(api, 1), action: "preview", returnCreditAmount: 99999, memberId: other.id }), context(api.orderNumber));
  const apiPreview = await apiPreviewResponse.json();
  await test("API ignores browser member ID and credit amounts", () => { assert.equal(apiPreviewResponse.status, 200); assert.equal(apiPreview.preview.returnCreditAmount, 0); });
  const apiCreated = await memberPOST(request({ ...values(api, 1), action: "create", finalConfirmation: true, confirmationToken: apiPreview.confirmationToken, idempotencyKey: "api-request" }), context(api.orderNumber)); const apiId = (await apiCreated.json()).returnRequestId;
  await test("authenticated API final confirmation creates own return", () => assert.equal(apiCreated.status, 200));
  globals.__returnCookies = { [adminCookieName]: createAdminSessionValue({ adminId: "owner", role: "owner" }) };
  await test("authenticated Admin list filters/searches", async () => { const response = await listGET(new Request(`http://localhost:3000/api/admin/returns?status=pending&q=${api.orderNumber}`)); const result = await response.json(); assert.equal(result.rows.length, 1); assert.equal(result.rows[0].returnRequestId, apiId); });
  await test("Admin detail exposes credit confirmation snapshot", async () => { const response = await adminGET(new Request("http://localhost:3000"), context(api.orderNumber)); assert.equal((await response.json()).requests[0].creditPreview.returnCreditAmount, 0); });
  await test("Admin mutation rejects cross-origin", async () => assert.equal((await adminPOST(request({}, "https://other.test"), context(api.orderNumber))).status, 403));
  await test("Admin API lock derives actor from session", async () => { const response = await adminPOST(request({ action: "lock", returnRequestId: apiId, reason: "API審核", idempotencyKey: "api-lock", actorId: "spoof" }), context(api.orderNumber)); assert.equal(response.status, 200); assert.equal((await state(api)).returnEvents?.at(-1)?.actor.actorId, "owner"); });
  await test("Admin page renders source/deadline/zero-credit empty state/review controls", async () => { const html = render(createElement(AdminReturnDetail, { initial: await getReturnWorkflow(api.orderNumber) })); for (const label of ["查看來源訂單", "最晚退貨期限", "本次訂單未使用抵用金", "核准退貨", "審核處理"]) assert.ok(html.includes(label)); });
  await test("Admin list renders operational status filters", () => { const html = render(createElement(AdminReturnList, { initial: [] })); for (const label of ["待處理", "待審核", "待退款", "人工確認", "已完成", "已拒絕／已撤回", "全部"]) assert.ok(html.includes(label)); });
  await test("new E code contains no role-specific pricing implementation", async () => { for (const file of ["lib/returnCreditPreview.ts", "lib/returnWorkflow.ts", "components/member/MemberReturnWorkflow.tsx"]) assert.doesNotMatch(await fs.readFile(file, "utf8"), /Franchise|VIP|0\.7\b/); });
  await test("original order remains byte-identical after all workflow actions", async () => assert.equal(await fs.readFile(f.file, "utf8"), orderBytes));
  await test("approved source order/payment/inventory remain byte-identical", async () => assert.equal(await fs.readFile(approved.file, "utf8"), JSON.stringify(approved.saved)));
  await test("saved deadline ignores changed current rules", async () => { const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES); rules.referral.referralRewardReturnProtectionDays = 30; await saveMembershipBusinessRules({ expectedRevision: 1, rules, now: new Date("2026-12-09T00:00:00Z") }, rulesFilePath); assert.equal((await view(f)).returnDeadline, (f.saved.completion as OrderCompletionSnapshot).returnDeadline); });
  await test("protected runtime files stay byte-identical", async () => assert.deepEqual(await Promise.all(protectedFiles.map(bytes)), protectedBefore));
  await test("other member cannot create with owner's preview", () => assert.rejects(() => memberReturnAction(noReward.orderNumber, other.id,
    { ...values(noReward, 1), action: "create", finalConfirmation: true, confirmationToken: p.confirmationToken, idempotencyKey: "foreign-create" }, runtime(noReward))));
  await test("other member cannot withdraw own-order request", () => assert.rejects(() => memberReturnAction(api.orderNumber, other.id,
    { action: "withdraw", returnRequestId: apiId, idempotencyKey: "foreign-withdraw" }, runtime(api))));
  const notCompleted = await fixture({ credit: 0 }); await write(notCompleted.file, { ...notCompleted.saved, status: "ready_for_pickup", completion: undefined });
  await test("non-completed source cannot preview", () => assert.rejects(() => preview(notCompleted, 1), /order_not_completed/));
  const deadlineCrossing = await fixture({ credit: 0 }), deadline = new Date((deadlineCrossing.saved.completion as OrderCompletionSnapshot).returnDeadline);
  const deadlineP = await preview(deadlineCrossing, 1, deadline);
  await test("saved deadline last millisecond is inclusive", () => assert.ok(deadlineP.confirmationToken));
  await test("confirmation after saved deadline cannot create", () => assert.rejects(() => create(deadlineCrossing, deadlineP, 1, "deadline-crossing", new Date(deadline.getTime() + 1)), /return_deadline_expired/));
  const sourceChange = await fixture(), sourceP = await preview(sourceChange), sourceState = await state(sourceChange);
  sourceState.creditEntries[sourceChange.b].expiresAt = "2027-02-01T00:00:00+08:00"; await write(sourceChange.stateFilePath, sourceState);
  await test("changed original credit expiry rejects old confirmation", () => assert.rejects(() => create(sourceChange, sourceP), /stale_confirmation/));
  await test("multiple expired source allocations preserve separate backend evidence", () => { const selected = allocateOriginalReturnCredit(originals, 100, new Date("2027-02-01T00:00:00Z")); assert.equal(selected.length, 2); assert.ok(selected.every(item => item.classification === "expired_not_restorable")); assert.notEqual(selected[0].expiresAt, selected[1].expiresAt); });
  await test("tampered stored credit confirmation fails domain validation", async () => { const tampered = await state(f); const event = tampered.returnEvents![0]; assert.ok(event.type === "RETURN_REQUESTED" && event.confirmation); event.confirmation.preview.expiredCreditAmount = 999; assert.throws(() => commerce.validateMembershipCommerceState(tampered)); });
  console.log(`J.6F.1E return workflow: ${passes}/${passes} PASS; isolated fixtures only.`);
} finally {
  mock.timers.reset();
  globals.__returnHooks = undefined; globals.__returnCookies = undefined;
  if (previousRoot === undefined) delete process.env.KD_DATA_DIR; else process.env.KD_DATA_DIR = previousRoot;
  const target = path.resolve(root); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep)); await fs.rm(target, { recursive: true, force: true });
}
