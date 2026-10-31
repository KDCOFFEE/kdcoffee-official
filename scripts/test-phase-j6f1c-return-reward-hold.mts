import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as commerce from "../lib/membershipCommerce";
import type { MembershipCommerceState, ReferralReward, RetailPromotionReward, ReturnRewardReference } from "../lib/membershipCommerce";
import { prepareOrderCompletionWrite, type OrderCompletionSnapshot } from "../lib/orderCompletion";
import type { ReturnActor, ReturnCommand } from "../lib/orderReturns";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } from "../lib/membershipBusinessRules";
import { calculateSelfPurchaseTierReward } from "../lib/selfPurchaseRewardTiers";
import { ensureLegacyCanonicalMember } from "../lib/memberIdentity";
import { assessOrderCancellation } from "../lib/orderInventoryPolicy";

const requestedAt = new Date("2026-10-02T02:00:00Z"), releaseAt = new Date("2026-10-20T02:00:00Z");
const originalAt = "2026-09-25T02:00:00.000Z", completedAt = "2026-09-26T02:00:00.000Z";
const actor: ReturnActor = { actorId: "commercial-actor", authority: "customer" };
const reviewer: ReturnActor = { actorId: "inspection-actor", authority: "reviewer" };
const acknowledgement = { itemsComplete: true as const, unopenedUnusedWhereApplicable: true as const };
const authorizeOrder = (order: Readonly<Record<string, unknown>>, caller: ReturnActor) => {
  if (caller.authority === "reviewer" && caller.actorId === reviewer.actorId) return;
  if ((order.actor as { id: string })?.id !== caller.actorId) throw new Error("Order ownership mismatch");
};
if (process.argv[2] === "--inspect") {
  const state = await commerce.readMembershipCommerceState(process.argv[3]);
  process.stdout.write(JSON.stringify(commerce.readReturnRewardHoldDependencies(state).map(item => item.holdDependencyId)));
} else {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f1c-hold-"));
  const previousRoot = process.env.KD_DATA_DIR; process.env.KD_DATA_DIR = root;
  const rulesFile = path.join(root, "membership-commerce", "business-rules.json");
  let sequence = 2000, operation = 0, passes = 0;
  const test = async (name: string, check: () => unknown | Promise<unknown>) => { await check(); passes++; console.log(`PASS ${String(passes).padStart(3, "0")} ${name}`); };
  const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES);
  rules.referral.programEnabled = true; rules.referral.referrerEligibility = { mode: "none" };
  rules.referral.reward = { mode: "fixed", amount: 50, repeatedRewards: true };
  rules.referral.referralRewardBaseWaitingDays = 0; rules.referral.referralRewardReturnProtectionDays = 7;
  rules.referral.payoutQualification.mode = "general"; rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 1;
  rules.referral.selfPurchaseRewardRate = 5; rules.referral.selfPurchaseRewardTiers.enabled = false;
  const write = async (file: string, value: unknown) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value)); };
  async function order() {
    const orderNumber = `KD20260925-${++sequence}`;
    const before = { orderNumber, createdAt: originalAt, status: "ready_for_pickup", orderMode: "studio_pickup", actor: { id: actor.actorId },
      items: [{ slug: "coffee", optionId: "same-sku", name: "Coffee", quantity: 5, unitPrice: 100, lineTotal: 500 }],
      subtotal: 500, shipping: 0, total: 500, paymentDetails: { status: "paid" }, inventoryTransaction: { state: "inventory_committed" } };
    const saved = await prepareOrderCompletionWrite(before, { ...before, status: "completed",
      fulfillmentEvents: [{ eventId: `ful-${orderNumber}`, state: "completed", occurredAt: completedAt }] });
    const file = path.join(root, "orders", orderNumber + ".json"); await write(file, saved);
    const completion = saved.completion as OrderCompletionSnapshot;
    assert.equal(completion.returnLines?.status, "resolved");
    return { orderNumber, file, saved, ref: completion.returnLines?.status === "resolved" ? completion.returnLines.lines[0].returnLineRef : "" };
  }
  type SavedOrder = Awaited<ReturnType<typeof order>>;
  const read = (file: string) => commerce.readMembershipCommerceState(file);
  function reward(id: string, source: SavedOrder, extra: Partial<ReferralReward> = {}): ReferralReward {
    return { rewardId: id, sourceOrderNumber: source.orderNumber, sourceMemberId: "source-actor", beneficiaryMemberId: "beneficiary",
      referralLevel: 1, rewardType: "new_referral", calculationMode: "paid_amount", paidAmountBasis: 500,
      basePV: 0, effectivePV: 0, discountRatio: 1, rewardRate: 10, rewardPV: 0, pvRewardMoneyValue: 1,
      calculatedCreditAmount: 50, projectedCreditAmount: 50, ruleVersion: 2, ancestrySnapshot: ["beneficiary"],
      sourceOrderFinalState: "completed", baseWaitingDaysSnapshot: 0, returnProtectionDaysSnapshot: 7, totalWaitingDaysSnapshot: 7,
      reversalPolicySnapshot: "cancel-pending-and-reverse-released", monthlyCapAmountSnapshot: 0,
      successfulPickupBusinessDate: "2026-09-26", releaseEligibleBusinessDate: "2026-10-03",
      qualificationStatus: "qualified", createdAt: completedAt, eligibleAt: completedAt, scheduledReleaseAt: "2026-10-03T00:00:00+08:00",
      releasedAt: null, status: "scheduled", reversalCreditEntryId: null, rewardCreditEntryId: null, idempotencyKey: `original:${id}`, ...extra };
  }
  async function fixture(kind: "legacy" | "coverage" | "self" | "self_coverage" | "retail" | "none", mature = true) {
    const source = await order(), qualifier = await order(); const file = path.join(root, "cases", String(sequence), "commerce-state.json");
    const id = `reward-${sequence}`; let state = await read(file);
    if (kind !== "none" && kind !== "retail") {
      await commerce.recordValidConsumptionFromCompletedOrder({ memberId: "source-actor", orderId: source.orderNumber,
        idempotencyKey: `consumption:${source.orderNumber}`, now: new Date(completedAt), stateFilePath: file, rulesFilePath: rulesFile });
      await commerce.recordValidConsumptionFromCompletedOrder({ memberId: "beneficiary", orderId: qualifier.orderNumber,
        idempotencyKey: `consumption:${qualifier.orderNumber}`, now: new Date(completedAt), stateFilePath: file, rulesFilePath: rulesFile });
      state = await read(file);
    }
    const reference: ReturnRewardReference = { program: kind === "retail" ? "retail_promotion" : "referral", id };
    if (kind === "retail") {
      const retail: RetailPromotionReward = { rewardId: id, sourceOrderNumber: source.orderNumber, beneficiaryMemberId: "beneficiary",
        referralCode: "existing-code", attributedAt: originalAt, attributionExpiresAt: completedAt, attributionSource: "member-share-link",
        eligibleMerchandiseAmount: 500, calculatedCreditAmount: 50, rewardRate: 10, ruleVersion: 2, roundingModeSnapshot: "round-half-up",
        baseWaitingDaysSnapshot: 0, returnProtectionDaysSnapshot: 7, totalWaitingDaysSnapshot: 7,
        reversalPolicySnapshot: "cancel-pending-and-reverse-released", successfulCompletionAt: completedAt,
        successfulPickupBusinessDate: "2026-09-26", releaseEligibleBusinessDate: "2026-10-03", createdAt: completedAt,
        releasedAt: null, sourceOrderFinalState: "completed", status: "scheduled", rewardCreditEntryId: null, reversalCreditEntryId: null, idempotencyKey: `original:${id}` };
      state.retailPromotionRewards[id] = retail;
    } else if (kind !== "none") {
      const self = kind === "self" || kind === "self_coverage";
      const covered = kind === "coverage" || kind === "self_coverage";
      state.referralRewards[id] = reward(id, source, self && !covered ? { rewardType: "self_purchase", referralLevel: 0,
        beneficiaryMemberId: "source-actor", qualificationAuthority: "self_purchase_direct" } : covered
        ? { qualificationAuthority: "qualification_coverage", ...(self ? { rewardType: "self_purchase" as const, referralLevel: 0, beneficiaryMemberId: "source-actor" } : {}) }
        : { qualificationAuthority: "legacy_order", qualificationStartedAt: "2026-08-23T00:00:00+08:00", qualificationExpiresAt: "2026-09-30T23:59:59.999+08:00",
            qualificationOrderNumber: qualifier.orderNumber, qualificationOrderCreatedAt: originalAt, qualificationOrderFinalState: "completed", qualificationQualifiedAt: completedAt,
            qualificationAttempts: [{ orderNumber: qualifier.orderNumber, orderCreatedAt: originalAt, orderType: "normal", status: "completed", finalState: "completed", finalizedAt: completedAt }] });
    }
    await write(file, state);
    if (kind === "coverage" || kind === "self_coverage") {
      await commerce.reconcileReferralRewardCoverage({ referralRewardId: id, now: new Date(completedAt), stateFilePath: file });
      if (mature) await commerce.processReferralRewardMaturations({ now: releaseAt, stateFilePath: file, rulesFilePath: rulesFile });
    }
    return { source, qualifier, file, id, reference };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const command = (f: Fixture, target: SavedOrder, value: ReturnCommand, caller = actor, key = `command-${++operation}`, now = requestedAt) =>
    commerce.executeOrderReturnCommand({ orderNumber: target.orderNumber, actor: caller, command: value, reason: "Original preserved return evidence", idempotencyKey: key, authorizeOrder, now, stateFilePath: f.file });
  const request = (f: Fixture, target = f.source, key?: string) => command(f, target, { type: "RETURN_REQUESTED",
    lines: [{ returnLineRef: target.ref, quantity: 1 }], conditionAcknowledgement: acknowledgement }, actor, key);
  const transition = (f: Fixture, target: SavedOrder, requestId: string, type: "RETURN_PROCESSING_LOCKED" | "RETURN_WITHDRAWN" | "RETURN_REJECTED" | "RETURN_APPROVED") =>
    command(f, target, { type, returnRequestId: requestId }, type === "RETURN_WITHDRAWN" ? actor : reviewer, undefined, new Date("2026-10-05T00:00:00Z"));
  const run = (f: Fixture) => commerce.runReferralRewardReleaseScheduler({ now: releaseAt, stateFilePath: f.file, rulesFilePath: rulesFile });
  const holds = async (f: Fixture) => commerce.readReturnRewardHoldDependencies(await read(f.file));
  const projection = async (f: Fixture) => commerce.projectReturnRewardHolds(await read(f.file), f.reference);
  function accepted(result: Awaited<ReturnType<typeof request>>) { if (result.status !== "applied") assert.fail(JSON.stringify(result)); return result; }
  const monetary = (state: MembershipCommerceState) => ({ rewards: state.referralRewards, retail: state.retailPromotionRewards,
    credit: state.creditEntries, consumption: state.validConsumptionEvents, rounds: state.qualificationRounds,
    coverages: state.referralRewardCoverages, maturations: state.referralRewardMaturations });
  try {
    await saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-08-01T00:00:00Z") }, rulesFile);
    const inventoryFile = path.join(root, "store", "website-data.json"), fulfillmentFile = path.join(root, "fulfillment", "state.json");
    await write(inventoryFile, { stock: 31, receipts: ["unchanged-original-apply"] }); await write(fulfillmentFile, { records: {}, revision: 1 });
    const originalInventory = await fs.readFile(inventoryFile, "utf8"), originalFulfillment = await fs.readFile(fulfillmentFile, "utf8");
    const fixtures: Fixture[] = [];
    for (const kind of ["legacy", "coverage", "self", "self_coverage", "retail"] as const) {
      const f = await fixture(kind); fixtures.push(f);
      const before = await read(f.file), orderBytes = await fs.readFile(f.source.file, "utf8");
      accepted(await request(f)); const records = await holds(f);
      await test(`${kind}: related pending reward creates one persisted HOLD`, () => {
        assert.equal(records.length, 1); assert.deepEqual(records[0].reward, f.reference); assert.equal(records[0].evidence.status, "resolved");
      });
      await test(`${kind}: HOLD preserves reward/calculation/qualification/credit state`, async () => assert.deepEqual(monetary(await read(f.file)), monetary(before)));
      await test(`${kind}: preserved source time is original 9/25, not return time`, () => assert.equal(records[0].evidence.sourceOrder?.orderCreatedAt, originalAt));
      const result = await run(f);
      await test(`${kind}: release branch reports held and issues no credit`, async () => {
        assert.equal(result.find(item => item.rewardId === f.id)?.status, "held"); assert.equal(Object.keys((await read(f.file)).creditEntries).length, 0);
      });
      await test(`${kind}: held scheduler retries are deterministic and do not duplicate evidence`, async () => {
        const beforeHolds = await holds(f); assert.deepEqual(await run(f), result); assert.deepEqual(await holds(f), beforeHolds);
      });
      await test(`${kind}: completed order, payment, inventory and pricing bytes remain unchanged`, async () => assert.equal(await fs.readFile(f.source.file, "utf8"), orderBytes));
      const unheld = await fixture(kind); const unheldResult = await run(unheld);
      await test(`${kind}: without HOLD existing release behavior remains`, async () => {
        assert.equal(unheldResult.find(item => item.rewardId === unheld.id)?.status, "released"); assert.equal(Object.keys((await read(unheld.file)).creditEntries).length, 1);
      });
    }
    const legacy = fixtures[0], self = fixtures[2];
    await test("compact hold records reference evidence without duplicating full reward objects", async () => {
      assert.doesNotMatch(JSON.stringify(await holds(self)), /calculatedCreditAmount|selfPurchaseTierSnapshot/);
    });
    const qualifierHold = await fixture("coverage"); const qualifierBefore = await read(qualifierHold.file);
    accepted(await request(qualifierHold, qualifierHold.qualifier));
    await test("Coverage consumption contribution creates dependency even when source order differs", async () => {
      const record = (await holds(qualifierHold))[0]; assert.ok(record.links.reasons.includes("qualification_consumption"));
      assert.ok(record.links.consumptionEventIds.length); assert.ok(record.evidence.roundId); assert.ok(record.evidence.coverageId); assert.ok(record.evidence.maturationId);
      assert.equal(record.evidence.qualificationOrders[0].orderCreatedAt, originalAt);
    });
    await test("Coverage HOLD creates no new Round and preserves qualification timestamps", async () => assert.deepEqual(monetary(await read(qualifierHold.file)), monetary(qualifierBefore)));
    await test("Coverage consumption HOLD blocks later reward release", async () => assert.equal((await run(qualifierHold)).find(item => item.rewardId === qualifierHold.id)?.status, "held"));
    const lateCoverage = await fixture("coverage"); const beforeCoverage = await read(lateCoverage.file);
    beforeCoverage.referralRewardCoverages = {}; beforeCoverage.referralRewardMaturations = {};
    await write(lateCoverage.file, beforeCoverage); accepted(await request(lateCoverage, lateCoverage.qualifier));
    await test("unrelated uncovered reward is not held merely by beneficiary identity", async () => assert.equal((await holds(lateCoverage)).length, 0));
    await commerce.reconcileReferralRewardCoverage({ referralRewardId: lateCoverage.id, now: new Date(completedAt), stateFilePath: lateCoverage.file });
    await test("Coverage linked after return acquires HOLD before subsequent payout", async () => {
      assert.equal((await holds(lateCoverage)).length, 1);
      assert.equal((await run(lateCoverage)).find(item => item.rewardId === lateCoverage.id)?.status, "held");
    });
    const missingSource = await fixture("coverage"); await fs.unlink(missingSource.source.file);
    accepted(await request(missingSource, missingSource.qualifier));
    await test("missing historical source proof is persisted as manual review and still blocks payout", async () => {
      const record = (await holds(missingSource))[0]; assert.equal(record.evidence.status, "manual_review_required");
      assert.equal(record.evidence.sourceOrder, null); assert.equal(record.evidence.qualificationOrders[0].orderCreatedAt, originalAt);
      assert.equal((await run(missingSource)).find(item => item.rewardId === missingSource.id)?.status, "held");
    });
    const legacyQualifier = await fixture("legacy"); accepted(await request(legacyQualifier, legacyQualifier.qualifier));
    await test("legacy qualification order is held independently of reward source", async () => {
      const record = (await holds(legacyQualifier))[0]; assert.ok(record.links.reasons.includes("qualification_order"));
      assert.equal(record.evidence.qualificationOrders[0].orderCreatedAt, originalAt);
      assert.equal((await run(legacyQualifier)).find(item => item.rewardId === legacyQualifier.id)?.status, "held");
    });
    const notMature = await fixture("coverage", false); accepted(await request(notMature, notMature.qualifier));
    await commerce.processReferralRewardMaturations({ now: releaseAt, stateFilePath: notMature.file, rulesFilePath: rulesFile });
    await test("active dependency defers new maturation consequences without deleting existing evidence", async () => {
      assert.equal(Object.keys((await read(notMature.file)).referralRewardMaturations).length, 0);
      assert.equal((await run(notMature)).find(item => item.rewardId === notMature.id)?.status, "held");
    });
    const none = await fixture("none"); accepted(await request(none));
    await test("no-PV/no-reward order returns normally with zero dependencies", async () => assert.equal((await holds(none)).length, 0));
    await test("no-reward projection is clear without requiring a reward identity", async () => {
      assert.equal((await projection(none)).blocked, false); assert.deepEqual(await run(none), []);
    });

    const multi = await fixture("self"); const first = accepted(await request(multi, multi.source, "return-a"));
    const second = accepted(await request(multi, multi.source, "return-b"));
    await test("two return requests independently HOLD the same reward", async () => {
      const value = await projection(multi); assert.equal(value.activeHoldDependencyCount, 2); assert.equal((await holds(multi)).length, 2);
      assert.notEqual(value.dependencies[0].holdDependencyId, value.dependencies[1].holdDependencyId);
    });
    const savedHolds = await holds(multi);
    accepted(await transition(multi, multi.source, first.event.returnRequestId, "RETURN_PROCESSING_LOCKED"));
    await test("processing lock continues original HOLD identity and original qualification time", async () => {
      assert.deepEqual(await holds(multi), savedHolds); assert.equal((await projection(multi)).activeHoldDependencyCount, 2);
      assert.equal((await holds(multi))[0].evidence.sourceOrder?.orderCreatedAt, originalAt);
    });
    accepted(await request(multi, multi.source, "return-a"));
    await test("reprocessing original request creates no duplicate HOLD", async () => assert.deepEqual(await holds(multi), savedHolds));
    await test("same idempotency key with changed fingerprint conflicts", async () => {
      const value = await command(multi, multi.source, { type: "RETURN_REQUESTED", lines: [{ returnLineRef: multi.source.ref, quantity: 2 }], conditionAcknowledgement: acknowledgement }, actor, "return-a");
      assert.deepEqual(value, { status: "conflict", reason: "idempotency_conflict" }); assert.deepEqual(await holds(multi), savedHolds);
    });
    accepted(await transition(multi, multi.source, second.event.returnRequestId, "RETURN_WITHDRAWN"));
    await test("withdrawn A cannot clear another active request's HOLD", async () => {
      const value = await projection(multi); assert.equal(value.activeHoldDependencyCount, 1); assert.equal(value.resolutionRequiredDependencyCount, 1); assert.equal(value.blocked, true);
    });
    accepted(await transition(multi, multi.source, first.event.returnRequestId, "RETURN_REJECTED"));
    await test("terminal requests remain blocked for explicit J.6F.1D handoff", async () => {
      const value = await projection(multi); assert.equal(value.activeHoldDependencyCount, 0); assert.equal(value.resolutionRequiredDependencyCount, 2);
      assert.equal((await run(multi)).find(item => item.rewardId === multi.id)?.status, "held");
    });
    const approved = await fixture("self"); const ar = accepted(await request(approved));
    accepted(await transition(approved, approved.source, ar.event.returnRequestId, "RETURN_APPROVED"));
    await test("approval awaits final consequence rather than reversing/cancelling reward", async () => {
      assert.equal((await projection(approved)).dependencies[0].returnStatus, "approved"); await run(approved);
      assert.equal((await read(approved.file)).referralRewards[approved.id].status, "scheduled");
      assert.equal(Object.keys((await read(approved.file)).creditEntries).length, 0);
    });
    await test("restart and JSON roundtrip preserve HOLD IDs", async () => {
      const restart = spawnSync(process.execPath, ["--experimental-strip-types", "--import", "./scripts/return-workflow-test-bootstrap.mjs",
        fileURLToPath(import.meta.url), "--inspect", multi.file], { encoding: "utf8", windowsHide: true });
      assert.equal(restart.status, 0, restart.stderr);
      assert.deepEqual(JSON.parse(restart.stdout), savedHolds.map(item => item.holdDependencyId));
      assert.deepEqual(commerce.readReturnRewardHoldDependencies(JSON.parse(JSON.stringify(await read(multi.file)))), savedHolds);
    });

    const released = await fixture("self"); await run(released); const releasedBefore = await read(released.file);
    accepted(await request(released));
    await test("already released reward remains released with original credit intact", async () => assert.deepEqual(monetary(await read(released.file)), monetary(releasedBefore)));
    await test("released reward dependency remains available for future reversal without negative credit", async () => {
      const record = (await holds(released))[0]; assert.equal(record.rewardStatusAtCreation, "released"); assert.ok(record.evidence.creditEntryId);
      assert.ok(Object.values((await read(released.file)).creditEntries).every(entry => entry.amount > 0));
    });
    await test("scheduler never moves an already released held reward back to scheduled", async () => {
      await run(released); assert.deepEqual(monetary(await read(released.file)), monetary(releasedBefore));
    });

    const tier = await fixture("self"); const prior = await order();
    await commerce.recordValidConsumptionFromCompletedOrder({ memberId: "source-actor", orderId: prior.orderNumber,
      idempotencyKey: `prior:${prior.orderNumber}`, now: new Date(completedAt), stateFilePath: tier.file, rulesFilePath: rulesFile });
    const tierState = await read(tier.file);
    const consumed = Object.values(tierState.validConsumptionEvents).find(item => item.sourceOrderId === prior.orderNumber)!;
    const current = Object.values(tierState.validConsumptionEvents).find(item => item.sourceOrderId === tier.source.orderNumber)!;
    const tierRules = rules.referral.selfPurchaseRewardTiers;
    const tierResult = calculateSelfPurchaseTierReward({ priorAmount: 500, currentAmount: 500, calculationMethod: tierRules.calculationMethod, tiers: tierRules.tiers });
    const tierEvidence = [{ validConsumptionEventId: consumed.eventId, sourceOrderId: prior.orderNumber, finalizedAt: completedAt, thresholdAmount: 500, role: "prior" as const },
      { validConsumptionEventId: current.eventId, sourceOrderId: tier.source.orderNumber, finalizedAt: completedAt, thresholdAmount: 500, role: "current" as const }];
    tierState.referralRewards[tier.id].selfPurchaseTierSnapshot = { featureEnabled: true, rules: tierRules,
      payout: { calculationMode: "paid_amount", pvRewardMoneyValue: 1, moneyRoundingMode: "round-half-up" },
      windowStartedAt: originalAt, windowEndedAt: completedAt, initialEvidence: tierEvidence, latestEvidence: tierEvidence, initialResult: tierResult, latestResult: tierResult };
    await write(tier.file, tierState); accepted(await request(tier, prior));
    await test("dynamic tier prior consumption creates precise dependency", async () => {
      const record = (await holds(tier))[0]; assert.ok(record.links.reasons.includes("self_purchase_tier")); assert.ok(record.links.consumptionEventIds.includes(consumed.eventId));
      assert.equal(record.evidence.qualificationOrders.find(item => item.orderId === prior.orderNumber)?.orderCreatedAt, originalAt);
    });
    await test("HOLD never recalculates dynamic tier or original reward amounts", async () => { await run(tier); assert.deepEqual(monetary(await read(tier.file)), monetary(tierState)); });
    const independent = await order(); const unrelated = await read(tier.file);
    unrelated.referralRewards["unrelated"] = reward("unrelated", independent, { rewardType: "self_purchase", referralLevel: 0, beneficiaryMemberId: "source-actor", qualificationAuthority: "self_purchase_direct" });
    await write(tier.file, unrelated);
    await test("same beneficiary's unrelated reward is not held and releases", async () => {
      const results = await run(tier); assert.equal(results.find(item => item.rewardId === "unrelated")?.status, "released");
      assert.equal(results.find(item => item.rewardId === tier.id)?.status, "held");
    });
    const late = await fixture("none"); accepted(await request(late));
    const lateRewards = await commerce.createSelfPurchaseRewardFromFulfillment({ sourceMemberId: "source-actor", orderId: late.source.orderNumber,
      paidAmountBasis: 500, idempotencyKey: "late-reward", now: new Date(completedAt), stateFilePath: late.file, rulesFilePath: rulesFile });
    await test("reward created after return receives HOLD in the same creation transaction", async () => {
      assert.equal(lateRewards.length, 1); assert.equal((await holds(late)).length, 1);
      const result = await run(late); assert.equal(result.find(item => item.rewardId === lateRewards[0].rewardId)?.status, "held");
    });

    const scalar = await fixture("none"); const scalarState = await read(scalar.file);
    scalarState.referrals["old-relationship"] = { relationshipId: "old-relationship", referrerMemberId: "beneficiary", referredMemberId: "source-actor",
      referralCode: "old-code", safeDisplayName: "Source", status: "registered", createdAt: originalAt, updatedAt: originalAt };
    await write(scalar.file, scalarState); accepted(await request(scalar));
    const conversion = await commerce.processReferralOrderOutcome({ referredMemberId: "source-actor", orderId: scalar.source.orderNumber,
      outcome: "completed", orderMerchandiseAmount: 500, idempotencyKey: "old-immediate", now: requestedAt, stateFilePath: scalar.file, rulesFilePath: rulesFile });
    await test("old immediate conversion release path is held", async () => {
      assert.equal(conversion?.status, "pending"); assert.equal(conversion?.pendingRewardAmount, 50); assert.equal(Object.keys((await read(scalar.file)).creditEntries).length, 0);
      assert.equal((await holds(scalar))[0].reward.program, "referral_conversion");
    });
    await test("old pending conversion release path respects same HOLD", async () => {
      assert.deepEqual(await commerce.releasePendingReferralRewards({ referrerMemberId: "beneficiary", idempotencyKey: "old-pending",
        now: releaseAt, stateFilePath: scalar.file, rulesFilePath: rulesFile }), []);
      assert.equal(Object.keys((await read(scalar.file)).creditEntries).length, 0);
    });
    await ensureLegacyCanonicalMember({ memberId: "beneficiary", identities: [{ provider: "email", subject: "hold-beneficiary@example.test" }] });
    await test("last credit issue boundary cannot bypass reward HOLD", async () => {
      await assert.rejects(() => commerce.issueCredit({ memberId: "beneficiary", sourceType: "referral", sourceReference: `referral_reward:${legacy.id}`,
        amount: 50, idempotencyKey: "bypass", now: releaseAt, stateFilePath: legacy.file, rulesFilePath: rulesFile }), error => error instanceof Error && error.name === "ReturnRewardHeldError");
      assert.equal(Object.keys((await read(legacy.file)).creditEntries).length, 0);
    });
    const race = await fixture("self"); await Promise.all([request(race), run(race)]);
    await test("request/payout race serializes with no unguarded credit after HOLD commit", async () => {
      const saved = await read(race.file); assert.equal((await holds(race)).length, 1);
      if (saved.referralRewards[race.id].status === "released") {
        assert.equal(Object.keys(saved.creditEntries).length, 1); assert.equal((await holds(race))[0].rewardStatusAtCreation, "released");
      } else { assert.equal(saved.referralRewards[race.id].status, "scheduled"); assert.equal(Object.keys(saved.creditEntries).length, 0); }
      const beforeCredit = JSON.stringify(saved.creditEntries); await run(race); assert.equal(JSON.stringify((await read(race.file)).creditEntries), beforeCredit);
    });
    const expiring = await fixture("legacy"); const expiryState = await read(expiring.file);
    expiryState.referralRewards[expiring.id].qualificationStatus = "awaiting_order";
    expiryState.referralRewards[expiring.id].qualificationOrderNumber = null;
    expiryState.referralRewards[expiring.id].qualificationAttempts = [];
    await write(expiring.file, expiryState); accepted(await request(expiring)); await run(expiring);
    await test("held legacy qualification is not permanently expired by later scheduler time", async () => assert.equal((await read(expiring.file)).referralRewards[expiring.id].qualificationStatus, "awaiting_order"));
    const corrupted = await read(self.file); const record = corrupted.audit.find(item => item.action === "RETURN_REWARD_HOLD_CREATED")!;
    const bad = JSON.parse(String(record.after.evidence)); bad.holdDependencyId = "forged"; record.after.evidence = JSON.stringify(bad);
    await test("corrupt HOLD identity fails closed rather than silently unholding", () => assert.throws(() => commerce.validateMembershipCommerceState(corrupted)));
    await test("no ordinary-member role or PV is required by return/HOLD", () => {
      assert.equal(self.source.saved.member, undefined); assert.equal((self.source.saved.items as Record<string, unknown>[])[0].basePV, undefined);
    });
    for (const [orderMode, status, allowed] of [["studio_pickup", "ready_for_pickup", true], ["studio_pickup", "completed", false], ["711_cod", "ready_for_pickup", false], ["711_cod", "shipped", false]] as const) {
      await test(`cancellation remains ${orderMode}/${status}`, () => assert.equal(assessOrderCancellation({ orderMode, status }).allowed, allowed));
    }
    await test("rules, reward rates, thresholds and PV policies are not rewritten", async () => {
      const store = await import("../lib/membershipBusinessRules"); assert.deepEqual((await store.readMembershipRulesStore(rulesFile)).versions.at(-1)!.rules, rules);
    });
    await test("physical inventory and fulfillment files remain byte-identical", async () => {
      assert.equal(await fs.readFile(inventoryFile, "utf8"), originalInventory); assert.equal(await fs.readFile(fulfillmentFile, "utf8"), originalFulfillment);
    });
    // Check only new HOLD implementation, not unrelated pre-existing business programs.
    await test("HOLD contract adds no role program or fixed commercial discount", async () => {
      const source = await fs.readFile("lib/membershipCommerce.ts", "utf8"); const section = source.slice(source.indexOf("export type ReturnRewardReference"), source.indexOf("export class MembershipCommerceError"));
      assert.doesNotMatch(section, /ordinary_member_only|vip_only|franchise_only|70_percent|\b0\.7\b/);
    });
    console.log(`J.6F.1C focused: ${passes}/${passes} PASS; isolated fixtures only.`);
  } finally {
    if (previousRoot === undefined) delete process.env.KD_DATA_DIR; else process.env.KD_DATA_DIR = previousRoot;
    const target = path.resolve(root); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep)); await fs.rm(target, { recursive: true, force: true });
  }
}
