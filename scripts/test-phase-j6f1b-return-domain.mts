import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  executeOrderReturnCommand, readMembershipCommerceState, purgeMembershipCommerceForMembers,
  validateMembershipCommerceState,
} from "../lib/membershipCommerce";
import { prepareOrderCompletionWrite, type OrderCompletionSnapshot } from "../lib/orderCompletion";
import {
  projectOrderReturns, validateReturnEventLog, assertReturnEventsPreserved, ReturnDomainIntegrityError,
  type ReturnActor, type ReturnCommand, type ReturnCommandResult, type OrderReturnProjection,
} from "../lib/orderReturns";
import { assessOrderCancellation } from "../lib/orderInventoryPolicy";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } from "../lib/membershipBusinessRules";
import { withStoredOrderUpdateLock } from "../lib/adminOrders";

const at = new Date("2026-10-14T02:00:00.000Z");
const customer: ReturnActor = { actorId: "customer-actor", authority: "customer" };
const reviewer: ReturnActor = { actorId: "reviewer-actor", authority: "reviewer" };
const acknowledgement = { itemsComplete: true as const, unopenedUnusedWhereApplicable: true as const };
function authorizeOrder(order: Readonly<Record<string, unknown>>, actor: ReturnActor) {
  const purchaser = order.purchaser as { actorId: string } | undefined;
  if (actor.authority === "customer" && actor.actorId === purchaser?.actorId) return;
  if (actor.authority === "reviewer" && actor.actorId === reviewer.actorId) return;
  throw new Error("Unauthorized actor");
}
function applied(result: ReturnCommandResult) {
  if (result.status !== "applied") assert.fail(JSON.stringify(result));
  return result;
}
function resolved(result: ReturnType<typeof projectOrderReturns>): OrderReturnProjection {
  if (result.status !== "resolved") assert.fail(JSON.stringify(result));
  return result;
}
if (process.argv[2] === "--worker") {
  process.env.KD_DATA_DIR = process.argv[3];
  const result = await executeOrderReturnCommand({ orderNumber: process.argv[4], actor: customer, authorizeOrder,
    command: { type: "RETURN_REQUESTED", lines: [{ returnLineRef: process.argv[5], quantity: 1 }], conditionAcknowledgement: acknowledgement },
    idempotencyKey: process.argv[6], reason: "Concurrent request", now: at });
  process.stdout.write(JSON.stringify(result));
} else {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f1b-return-"));
  const previousRoot = process.env.KD_DATA_DIR;
  process.env.KD_DATA_DIR = root;
  const ordersDir = path.join(root, "orders"), stateFile = path.join(root, "membership-commerce", "commerce-state.json");
  await fs.mkdir(ordersDir, { recursive: true });
  let sequence = 1000, operations = 0, passes = 0;
  const test = async (name: string, run: () => unknown | Promise<unknown>) => {
    await run(); passes++; console.log(`PASS ${String(passes).padStart(3, "0")} ${name}`);
  };
  async function fixture(quantities = [5], options: { historical?: boolean; noPV?: boolean } = {}) {
    const orderNumber = `KD20261012-${++sequence}`;
    const base = { orderNumber, createdAt: "2026-10-10T01:00:00Z", status: "ready_for_pickup", orderMode: "studio_pickup",
      purchaser: { actorId: customer.actorId }, items: quantities.map(quantity => ({ slug: "same-coffee", optionId: "same-sku", name: "Same coffee",
        quantity, unitPrice: 100, lineTotal: 100 * quantity, ...(options.noPV ? {} : { basePV: 10, effectivePV: 10 }) })),
      subtotal: quantities.reduce((sum, q) => sum + q * 100, 0), shipping: 0, total: quantities.reduce((sum, q) => sum + q * 100, 0),
      credit: { appliedAmount: 0 }, paymentDetails: { status: "paid", method: "cash_on_delivery" },
      inventoryTransaction: { state: "inventory_committed", operationId: "unchanged-inventory" },
      fulfillmentSummary: { state: "completed" }, fulfillmentEvents: [] as Record<string, unknown>[] };
    const order = options.historical ? { ...base, status: "completed" } : await prepareOrderCompletionWrite(base, {
      ...base, status: "completed", fulfillmentEvents: [{ eventId: `ful-${orderNumber}`, state: "completed", occurredAt: "2026-10-12T06:00:00.000Z" }],
    });
    const file = path.join(ordersDir, orderNumber + ".json"); await fs.writeFile(file, JSON.stringify(order));
    const completion = order.completion as OrderCompletionSnapshot | undefined;
    const refs = completion?.returnLines?.status === "resolved" ? completion.returnLines.lines.map(line => line.returnLineRef) : [];
    return { orderNumber, order, file, refs };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const state = () => readMembershipCommerceState(stateFile);
  const project = async (f: Fixture) => resolved(projectOrderReturns(JSON.parse(await fs.readFile(f.file, "utf8")), (await state()).returnEvents ?? []));
  const command = (f: Fixture, value: ReturnCommand, actor = customer, key = `operation-${++operations}`, now = at) =>
    executeOrderReturnCommand({ orderNumber: f.orderNumber, command: value, actor, idempotencyKey: key, reason: "Preserved return evidence", authorizeOrder, now });
  const request = (f: Fixture, quantity = 1, key?: string, index = 0, now = at) => command(f,
    { type: "RETURN_REQUESTED", lines: [{ returnLineRef: f.refs[index], quantity }], conditionAcknowledgement: acknowledgement }, customer, key, now);
  const transition = (f: Fixture, returnRequestId: string, type: Exclude<ReturnCommand["type"], "RETURN_REQUESTED">, key?: string, now = at) =>
    command(f, { type, returnRequestId }, type === "RETURN_WITHDRAWN" ? customer : reviewer, key, now);
  async function child(f: Fixture, key: string): Promise<ReturnCommandResult> {
    return new Promise((resolve, reject) => {
      const worker = spawn(process.execPath, ["--experimental-strip-types", "--import", "./scripts/return-workflow-test-bootstrap.mjs",
        fileURLToPath(import.meta.url), "--worker", root, f.orderNumber, f.refs[0], key], { windowsHide: true });
      let stdout = "", stderr = "";
      worker.stdout.on("data", chunk => stdout += String(chunk)); worker.stderr.on("data", chunk => stderr += String(chunk));
      worker.on("error", reject); worker.on("exit", code => {
        if (code !== 0) reject(new Error(stderr)); else { try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); } }
      });
    });
  }
  try {
    const f = await fixture([2], { noPV: true });
    const orderBefore = await fs.readFile(f.file, "utf8");
    const first = applied(await request(f, 1, "first-request"));
    await test("completed eligible order creates a return request", () => assert.equal(first.event.type, "RETURN_REQUESTED"));
    await test("request uses preserved deterministic returnLineRef", () => assert.equal(first.projection.requests[0].lines[0].returnLineRef, f.refs[0]));
    await test("quantity one retains original quantity two", () => assert.equal(first.projection.requests[0].lines[0].originalQuantity, 2));
    await test("pending quantity occupies one with one remaining", () => assert.deepEqual(first.projection.lines[0], {
      returnLineRef: f.refs[0], originalQuantity: 2, approvedQuantity: 0, effectivePendingQuantity: 1, remainingReturnableQuantity: 1 }));
    await test("request preserves condition, completion and transaction evidence", () => {
      assert.equal(first.event.type, "RETURN_REQUESTED");
      if (first.event.type === "RETURN_REQUESTED") {
        assert.deepEqual(first.event.conditionAcknowledgement, acknowledgement);
        assert.deepEqual(first.event.completion, f.order.completion);
        assert.equal(first.event.completion.returnLines?.status, "resolved");
      }
    });
    await test("second request can consume remaining quantity", async () => assert.equal(applied(await request(f)).projection.lines[0].remainingReturnableQuantity, 0));
    await test("additional request cannot over-return", async () => assert.deepEqual(await request(f), { status: "conflict", reason: "quantity_exceeded" }));
    await test("same request key replays after availability is exhausted", async () => {
      const replay = applied(await request(f, 1, "first-request")); assert.equal(replay.replayed, true); assert.equal(replay.event.eventId, first.event.eventId);
    });
    await test("changed quantity with same key conflicts", async () => assert.deepEqual(await request(f, 2, "first-request"), { status: "conflict", reason: "idempotency_conflict" }));
    await test("same key cannot silently change command type", async () => {
      assert.deepEqual(await transition(f, first.event.returnRequestId, "RETURN_WITHDRAWN", "first-request"), { status: "conflict", reason: "idempotency_conflict" });
    });
    await test("return activity never rewrites original order bytes", async () => assert.equal(await fs.readFile(f.file, "utf8"), orderBefore));
    for (const quantity of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await test(`invalid quantity ${quantity} rejected`, async () => assert.deepEqual(await request(f, quantity), { status: "conflict", reason: "invalid_input" }));
    }
    await test("customer condition acknowledgement is mandatory", async () => {
      const value = { type: "RETURN_REQUESTED", lines: [{ returnLineRef: f.refs[0], quantity: 1 }], conditionAcknowledgement: { itemsComplete: true } } as ReturnCommand;
      assert.deepEqual(await command(f, value), { status: "conflict", reason: "invalid_input" });
    });
    await test("both condition acknowledgements must be true", async () => {
      const value = { type: "RETURN_REQUESTED", lines: [{ returnLineRef: f.refs[0], quantity: 1 }], conditionAcknowledgement: { itemsComplete: false, unopenedUnusedWhereApplicable: true } } as unknown as ReturnCommand;
      assert.equal((await command(f, value)).status, "conflict");
    });
    await test("invalid clock returns a typed conflict without appending", async () => {
      const before = (await state()).returnEvents!.length;
      assert.deepEqual(await request(f, 1, undefined, 0, new Date(Number.NaN)), { status: "conflict", reason: "invalid_clock" });
      assert.equal((await state()).returnEvents!.length, before);
    });
    await test("request timestamp cannot precede preserved completion", async () => assert.deepEqual(
      await request(f, 1, undefined, 0, new Date("2026-10-11T00:00:00Z")), { status: "conflict", reason: "invalid_clock" }));
    const legacy = await fixture([2], { historical: true }); const legacyBefore = await fs.readFile(legacy.file, "utf8");
    await test("historical missing completion evidence requires manual review", async () => assert.deepEqual(await request({ ...legacy, refs: f.refs }), { status: "manual_review_required", reason: "missing_completion_evidence" }));
    await test("historical order is not backfilled or guessed", async () => assert.equal(await fs.readFile(legacy.file, "utf8"), legacyBefore));
    const notCompleted = await fixture(); await fs.writeFile(notCompleted.file, JSON.stringify({ ...notCompleted.order, status: "ready_for_pickup" }));
    await test("non-completed order cannot request return", async () => assert.deepEqual(await request(notCompleted), { status: "not_eligible", reason: "order_not_completed" }));
    const missingLines = await fixture(); const badCompletion = structuredClone(missingLines.order.completion) as OrderCompletionSnapshot; delete badCompletion.returnLines;
    await fs.writeFile(missingLines.file, JSON.stringify({ ...missingLines.order, completion: badCompletion }));
    await test("missing J.6F.1A line evidence cannot enter automatic flow", async () => assert.deepEqual(await request(missingLines), { status: "manual_review_required", reason: "line_evidence_requires_review" }));
    const missingDeadline = await fixture(); const noDeadline = { ...(missingDeadline.order.completion as object), returnDeadline: undefined };
    await fs.writeFile(missingDeadline.file, JSON.stringify({ ...missingDeadline.order, completion: noDeadline }));
    await test("missing saved deadline cannot be reconstructed", async () => assert.deepEqual(await request(missingDeadline), { status: "manual_review_required", reason: "invalid_completion_evidence" }));
    const deadlineFixture = await fixture([5]);
    const deadline = (deadlineFixture.order.completion as OrderCompletionSnapshot).returnDeadline;
    await test("request accepted exactly at preserved deadline millisecond", async () => assert.equal((await request(deadlineFixture, 1, undefined, 0, new Date(deadline))).status, "applied"));
    await test("one millisecond after deadline is ineligible", async () => assert.deepEqual(await request(deadlineFixture, 1, undefined, 0, new Date(Date.parse(deadline) + 1)), { status: "not_eligible", reason: "return_deadline_expired" }));
    const expiredRetry = await fixture([1]); const retry = applied(await request(expiredRetry, 1, "saved-before-expiry"));
    await test("accepted request retry remains idempotent after deadline", async () => {
      const value = applied(await request(expiredRetry, 1, "saved-before-expiry", 0, new Date("2027-01-01T00:00:00Z")));
      assert.equal(value.event.eventId, retry.event.eventId); assert.equal(value.replayed, true);
    });
    await test("pending request can be withdrawn after deadline without requalifying", async () => {
      const value = applied(await transition(expiredRetry, retry.event.returnRequestId, "RETURN_WITHDRAWN", undefined, new Date("2027-01-01T00:00:00Z")));
      assert.equal(value.projection.requests[0].status, "withdrawn");
      assert.equal(value.projection.lines[0].remainingReturnableQuantity, 1);
    });
    const duplicate = await fixture([3, 2]);
    const multi = applied(await command(duplicate, { type: "RETURN_REQUESTED", lines: [
      { returnLineRef: duplicate.refs[0], quantity: 1 }, { returnLineRef: duplicate.refs[1], quantity: 2 }], conditionAcknowledgement: acknowledgement }));
    await test("duplicate SKU lines remain independent in multi-line request", () => assert.deepEqual(multi.projection.lines.map(line => line.remainingReturnableQuantity), [2, 0]));
    await test("duplicate refs within one request are rejected", async () => assert.equal((await command(duplicate, { type: "RETURN_REQUESTED", lines: [
      { returnLineRef: duplicate.refs[0], quantity: 1 }, { returnLineRef: duplicate.refs[0], quantity: 1 }], conditionAcknowledgement: acknowledgement })).status, "conflict"));
    await test("another order's reference cannot be substituted", async () => assert.deepEqual(await command(duplicate, {
      type: "RETURN_REQUESTED", lines: [{ returnLineRef: f.refs[0], quantity: 1 }], conditionAcknowledgement: acknowledgement }), { status: "conflict", reason: "unknown_line" }));
    await test("multi-line validation is atomic when one line exceeds remaining", async () => {
      const before = JSON.stringify((await state()).returnEvents);
      assert.equal((await command(duplicate, { type: "RETURN_REQUESTED", lines: [
        { returnLineRef: duplicate.refs[0], quantity: 1 }, { returnLineRef: duplicate.refs[1], quantity: 1 }], conditionAcknowledgement: acknowledgement })).status, "conflict");
      assert.equal(JSON.stringify((await state()).returnEvents), before);
    });

    const example = await fixture([5]); const a = applied(await request(example, 2));
    applied(await transition(example, a.event.returnRequestId, "RETURN_APPROVED", "approve-a"));
    const b = applied(await request(example, 1)); const c = applied(await request(example, 1));
    const rejected = applied(await transition(example, c.event.returnRequestId, "RETURN_REJECTED", "reject-c"));
    await test("approved 2 + pending 1 + rejected 1 of 5 leaves 2", () => {
      assert.equal(rejected.projection.lines[0].approvedQuantity, 2); assert.equal(rejected.projection.lines[0].effectivePendingQuantity, 1); assert.equal(rejected.projection.lines[0].remainingReturnableQuantity, 2);
    });
    const withdrawn = applied(await transition(example, b.event.returnRequestId, "RETURN_WITHDRAWN", "withdraw-b"));
    await test("withdrawal releases occupied quantity and leaves 3", () => assert.deepEqual([
      withdrawn.projection.lines[0].approvedQuantity, withdrawn.projection.lines[0].effectivePendingQuantity, withdrawn.projection.lines[0].remainingReturnableQuantity], [2, 0, 3]));
    await test("pending withdrawal is append-only", async () => {
      const events = (await state()).returnEvents!;
      assert.ok(events.some(event => event.eventId === b.event.eventId));
      assert.equal(withdrawn.event.previousEventId, b.event.eventId); assert.equal(withdrawn.event.type, "RETURN_WITHDRAWN");
    });
    await test("new request for 4 exceeds restored remaining 3", async () => assert.deepEqual(await request(example, 4), { status: "conflict", reason: "quantity_exceeded" }));
    const d = applied(await request(example, 3));
    await test("new request for 3 succeeds after withdrawal", () => assert.equal(d.projection.lines[0].remainingReturnableQuantity, 0));
    await test("withdrawal replay does not append a duplicate", async () => {
      const before = (await state()).returnEvents!.length;
      assert.equal(applied(await transition(example, b.event.returnRequestId, "RETURN_WITHDRAWN", "withdraw-b")).replayed, true);
      assert.equal((await state()).returnEvents!.length, before);
    });
    for (const [requestId, name] of [[a.event.returnRequestId, "approved"], [c.event.returnRequestId, "rejected"], [b.event.returnRequestId, "withdrawn"]]) {
      await test(`${name} request cannot be withdrawn with a new operation`, async () => assert.deepEqual(await transition(example, requestId, "RETURN_WITHDRAWN"), { status: "conflict", reason: "invalid_transition" }));
      for (const type of ["RETURN_APPROVED", "RETURN_REJECTED", "RETURN_PROCESSING_LOCKED"] as const) {
        await test(`${name} is terminal against ${type}`, async () => assert.deepEqual(await transition(example, requestId, type), { status: "conflict", reason: "invalid_transition" }));
      }
    }
    for (const [id, type, key] of [[a.event.returnRequestId, "RETURN_APPROVED", "approve-a"], [c.event.returnRequestId, "RETURN_REJECTED", "reject-c"]] as const) {
      await test(`${type} replay cannot double count`, async () => {
        const before = JSON.stringify((await state()).returnEvents);
        assert.equal(applied(await transition(example, id, type, key)).replayed, true);
        assert.equal(JSON.stringify((await state()).returnEvents), before);
      });
    }
    const processing = await fixture([2]); const p = applied(await request(processing, 1));
    const locked = applied(await transition(processing, p.event.returnRequestId, "RETURN_PROCESSING_LOCKED", "lock-p"));
    await test("processing lock retains pending quantity without double counting", () => assert.deepEqual([
      locked.projection.lines[0].effectivePendingQuantity, locked.projection.lines[0].remainingReturnableQuantity], [1, 1]));
    await test("processing projection is not withdrawable", () => assert.equal(locked.projection.requests[0].withdrawable, false));
    await test("processing request cannot be withdrawn", async () => assert.deepEqual(await transition(processing, p.event.returnRequestId, "RETURN_WITHDRAWN"), { status: "conflict", reason: "invalid_transition" }));
    await test("duplicate processing key does not append again", async () => {
      const before = (await state()).returnEvents!.length;
      assert.equal(applied(await transition(processing, p.event.returnRequestId, "RETURN_PROCESSING_LOCKED", "lock-p")).replayed, true);
      assert.equal((await state()).returnEvents!.length, before);
    });
    await test("second processing lock under new identity conflicts", async () => assert.deepEqual(await transition(processing, p.event.returnRequestId, "RETURN_PROCESSING_LOCKED"), { status: "conflict", reason: "invalid_transition" }));
    await test("processing can be approved without increasing total occupied quantity", async () => {
      const result = applied(await transition(processing, p.event.returnRequestId, "RETURN_APPROVED"));
      assert.deepEqual([result.projection.lines[0].approvedQuantity, result.projection.lines[0].effectivePendingQuantity, result.projection.lines[0].remainingReturnableQuantity], [1, 0, 1]);
    });
    const processingRejection = await fixture(); const pr = applied(await request(processingRejection));
    applied(await transition(processingRejection, pr.event.returnRequestId, "RETURN_PROCESSING_LOCKED"));
    await test("processing can be rejected and releases quantity", async () => assert.equal(applied(await transition(processingRejection, pr.event.returnRequestId, "RETURN_REJECTED")).projection.lines[0].remainingReturnableQuantity, 5));
    await test("customer cannot approve or processing-lock own request", async () => {
      const candidate = applied(await request(processingRejection));
      for (const type of ["RETURN_APPROVED", "RETURN_REJECTED", "RETURN_PROCESSING_LOCKED"] as const) assert.deepEqual(await command(processingRejection, { type, returnRequestId: candidate.event.returnRequestId }), { status: "conflict", reason: "not_authorized" });
    });
    await test("authenticated ownership hook is enforced", async () => assert.deepEqual(await command(processingRejection, {
      type: "RETURN_REQUESTED", lines: [{ returnLineRef: processingRejection.refs[0], quantity: 1 }], conditionAcknowledgement: acknowledgement,
    }, { actorId: "other-customer", authority: "customer" }), { status: "conflict", reason: "not_authorized" }));

    const race = await fixture([1]);
    const winners = await Promise.all([child(race, "race-a"), child(race, "race-b")]);
    await test("two independent processes cannot both win last quantity", () => { assert.equal(winners.filter(value => value.status === "applied").length, 1); assert.deepEqual(winners.find(value => value.status !== "applied"), { status: "conflict", reason: "quantity_exceeded" }); });
    await test("concurrent acceptance has exactly one event and no overflow", async () => {
      assert.equal((await state()).returnEvents!.filter(event => event.orderId === race.orderNumber).length, 1);
      assert.equal((await project(race)).lines[0].remainingReturnableQuantity, 0);
    });
    const sameKey = await fixture([1]); const sameResults = await Promise.all([child(sameKey, "same-operation"), child(sameKey, "same-operation")]);
    await test("concurrent same-key requests return same event", () => { assert.equal(applied(sameResults[0]).event.eventId, applied(sameResults[1]).event.eventId); assert.equal(sameResults.filter(value => value.status === "applied" && value.replayed).length, 1); });
    const withdrawRace = await fixture(); const wr = applied(await request(withdrawRace));
    const outcomes = await Promise.all([transition(withdrawRace, wr.event.returnRequestId, "RETURN_WITHDRAWN"), transition(withdrawRace, wr.event.returnRequestId, "RETURN_PROCESSING_LOCKED")]);
    await test("withdrawal versus inspection lock serializes to exactly one winner", () => assert.equal(outcomes.filter(value => value.status === "applied").length, 1));

    await test("pure projection is deterministic across JSON roundtrip", async () => {
      const events = (await state()).returnEvents!;
      assert.deepEqual(projectOrderReturns(example.order, events), projectOrderReturns(JSON.parse(JSON.stringify(example.order)), JSON.parse(JSON.stringify(events))));
    });
    await test("event prefix cannot be deleted, rewritten or reordered", async () => {
      const events = (await state()).returnEvents!;
      for (const invalid of [events.slice(1), [...events].reverse(), events.map((event, index) => index === 0 ? { ...event, reason: "rewritten" } : event)]) assert.throws(() => assertReturnEventsPreserved(events, invalid), ReturnDomainIntegrityError);
    });
    await test("corrupted quantity history fails closed", async () => {
      const events = structuredClone((await state()).returnEvents!); const requested = events.find(event => event.type === "RETURN_REQUESTED")!;
      if (requested.type === "RETURN_REQUESTED") requested.lines[0].quantity = requested.lines[0].originalQuantity + 1;
      assert.throws(() => validateReturnEventLog(events), ReturnDomainIntegrityError);
    });
    await test("event cannot replace preserved original quantity with caller evidence", async () => {
      const events = structuredClone((await state()).returnEvents!); const requested = events.find(event => event.type === "RETURN_REQUESTED")!;
      if (requested.type === "RETURN_REQUESTED") requested.lines[0].originalQuantity += 1;
      assert.throws(() => validateReturnEventLog(events), ReturnDomainIntegrityError);
    });
    await test("broken prior-event chain is rejected", async () => {
      const events = structuredClone((await state()).returnEvents!); const final = events.find(event => event.type === "RETURN_APPROVED")!; final.previousEventId = "unknown";
      assert.throws(() => validateReturnEventLog(events), ReturnDomainIntegrityError);
    });
    await test("legacy commerce reads normalize absent events without writing files", async () => {
      const legacyFile = path.join(root, "legacy-commerce.json"); const old = await state(); delete old.returnEvents;
      await fs.writeFile(legacyFile, JSON.stringify(old)); const before = await fs.readFile(legacyFile, "utf8");
      assert.deepEqual((await readMembershipCommerceState(legacyFile)).returnEvents, []); assert.equal(await fs.readFile(legacyFile, "utf8"), before);
    });
    await test("malformed event collection is never silently cleared", async () => {
      const saved = await state(); assert.throws(() => validateMembershipCommerceState({ ...saved, returnEvents: null }));
    });

    const boundary = await fixture([5], { noPV: true }); const beforeBytes = await fs.readFile(boundary.file, "utf8");
    const seeded = await state();
    seeded.creditEntries["existing-credit"] = { creditEntryId: "existing-credit", memberId: customer.actorId,
      sourceType: "member_reward", sourceReference: "referral_reward:existing-reward", amount: 50, remainingAmount: 50,
      issuedAt: at.toISOString(), createdAt: at.toISOString(), expiresAt: "2027-10-14T00:00:00Z", status: "available", metadata: {} };
    seeded.referralRewards["existing-reward"] = { rewardId: "existing-reward", sourceOrderNumber: boundary.orderNumber,
      sourceMemberId: customer.actorId, beneficiaryMemberId: customer.actorId, referralLevel: 0, rewardType: "self_purchase",
      qualificationAuthority: "self_purchase_direct", qualificationStatus: "qualified", sourceOrderFinalState: "completed",
      calculationMode: "paid_amount", paidAmountBasis: 500, basePV: 0, effectivePV: 0, discountRatio: 1,
      rewardRate: 10, rewardPV: 0, pvRewardMoneyValue: 1, calculatedCreditAmount: 50, ruleVersion: 1, ancestrySnapshot: [],
      createdAt: at.toISOString(), eligibleAt: at.toISOString(), scheduledReleaseAt: "2026-10-19T00:00:00+08:00",
      releasedAt: at.toISOString(), status: "released", reversalCreditEntryId: null, rewardCreditEntryId: "existing-credit", idempotencyKey: "existing-reward" };
    await fs.writeFile(stateFile, JSON.stringify(seeded));
    await fs.mkdir(path.join(root, "store"), { recursive: true }); await fs.mkdir(path.join(root, "fulfillment"), { recursive: true });
    const inventoryFile = path.join(root, "store", "website-data.json"), fulfillmentFile = path.join(root, "fulfillment", "state.json");
    const inventoryBytes = JSON.stringify({ stock: 17, receipts: ["original-apply"] });
    const fulfillmentBytes = JSON.stringify({ records: { [boundary.orderNumber]: { currentState: "completed" } } });
    await fs.writeFile(inventoryFile, inventoryBytes); await fs.writeFile(fulfillmentFile, fulfillmentBytes);
    const beforeState = await state();
    const protectedState = (value: typeof beforeState) => Object.fromEntries(Object.entries(value).filter(([key]) => !["revision", "updatedAt", "returnEvents", "audit", "idempotency"].includes(key)));
    for (const type of ["RETURN_WITHDRAWN", "RETURN_APPROVED", "RETURN_REJECTED"] as const) {
      const entry = applied(await request(boundary)); applied(await transition(boundary, entry.event.returnRequestId, type));
      await test(`order, fulfillment, payment and inventory remain byte-identical after ${type}`, async () => assert.equal(await fs.readFile(boundary.file, "utf8"), beforeBytes));
    }
    await test("reward, consumption, credit, subscription and notification state remain unchanged", async () => assert.deepEqual(protectedState(await state()), protectedState(beforeState)));
    await test("physical inventory and fulfillment state files remain byte-identical", async () => {
      assert.equal(await fs.readFile(inventoryFile, "utf8"), inventoryBytes); assert.equal(await fs.readFile(fulfillmentFile, "utf8"), fulfillmentBytes);
    });
    await test("return core requires neither PV nor reward identity nor a member role", async () => {
      const result = await project(boundary); assert.equal(result.status, "resolved"); assert.equal(boundary.order.member, undefined);
      const saved = boundary.order.completion as OrderCompletionSnapshot;
      assert.equal(saved.returnLines?.status, "resolved");
      if (saved.returnLines?.status === "resolved") assert.equal(Object.hasOwn(saved.returnLines.lines[0].snapshot, "basePV"), false);
    });
    for (const [orderMode, status, allowed] of [["studio_pickup", "ready_for_pickup", true], ["studio_pickup", "completed", false],
      ["711_cod", "ready_for_pickup", false], ["711_cod", "shipped", false], ["711_cod", "shipment_created", false]] as const) {
      await test(`cancellation policy unchanged: ${orderMode}/${status}`, () => assert.equal(assessOrderCancellation({ orderMode, status }).allowed, allowed));
    }
    await test("return evidence does not block unrelated completed-order notes", async () => {
      const eventsBefore = JSON.stringify((await state()).returnEvents);
      await withStoredOrderUpdateLock(boundary.orderNumber, async (order, persist) => persist({ ...order, note: "Unrelated admin note" }));
      assert.equal(JSON.stringify((await state()).returnEvents), eventsBefore);
      assert.equal((await project(boundary)).status, "resolved");
    });
    const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES); rules.referral.referralRewardReturnProtectionDays = 0;
    await saveMembershipBusinessRules({ expectedRevision: 0, rules, now: at }, path.join(root, "membership-commerce", "business-rules.json"));
    const noRecalculation = await fixture();
    // An older preserved deadline remains authoritative even after the settings change.
    await test("current Admin return-days cannot shorten accepted historical snapshot deadline", async () => {
      assert.equal((await request(deadlineFixture, 1, undefined, 0, new Date(deadline))).status, "applied");
    });
    await test("completion-time rules remain authoritative after current settings change", () => assert.equal((noRecalculation.order.completion as OrderCompletionSnapshot).returnDeadline, deadline));

    await test("membership selective cleanup preserves all return facts and operation identities", async () => {
      const before = await state(); await purgeMembershipCommerceForMembers([customer.actorId]); const after = await state();
      assert.deepEqual(after.returnEvents, before.returnEvents);
      assert.deepEqual(Object.entries(after.idempotency).filter(([key]) => key.startsWith("return-domain:")), Object.entries(before.idempotency).filter(([key]) => key.startsWith("return-domain:")));
    });
    await test("membership full cleanup preserves return history, audit and replay", async () => {
      const before = await state(); await purgeMembershipCommerceForMembers(); const after = await state();
      assert.deepEqual(after.returnEvents, before.returnEvents); assert.deepEqual(after.audit, before.audit.filter(item => item.entityType === "return_request"));
      assert.equal(applied(await request(f, 1, "first-request")).event.eventId, first.event.eventId);
    });
    await test("existing non-return commerce transaction preserves event prefix", async () => {
      const before = (await state()).returnEvents!;
      // Notification enqueue is a normal existing commerce transaction with no monetary effects.
      const commerce = await import("../lib/membershipCommerce");
      await commerce.enqueueScheduledMembershipNotifications({ today: "2026-10-14", now: at });
      assertReturnEventsPreserved(before, (await state()).returnEvents!);
    });
    // This phase adds no public route, role program, price policy, reward or inventory action.
    await test("return-domain code has no role program, fixed discount or settlement dependency", async () => {
      const source = await fs.readFile(path.join(process.cwd(), "lib/orderReturns.ts"), "utf8");
      assert.doesNotMatch(source, /\b(?:VIP|Franchise|0\.7|70\s*\/\s*100|refundAmount|restockInventory|cancelOrReverse|runReferralRewardReleaseScheduler)\b/u);
    });
    console.log(`J.6F.1B focused: ${passes}/${passes} PASS; isolated fixtures only.`);
  } finally {
    if (previousRoot === undefined) delete process.env.KD_DATA_DIR; else process.env.KD_DATA_DIR = previousRoot;
    const target = path.resolve(root); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(target, { recursive: true, force: true });
  }
}
