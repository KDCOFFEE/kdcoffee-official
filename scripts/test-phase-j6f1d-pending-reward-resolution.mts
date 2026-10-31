import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as commerce from "../lib/membershipCommerce";
import type { ReferralReward, RetailPromotionReward, ReturnRewardReference, MembershipCommerceState } from "../lib/membershipCommerce";
import { prepareOrderCompletionWrite, type OrderCompletionSnapshot } from "../lib/orderCompletion";
import type { ReturnActor, ReturnCommand } from "../lib/orderReturns";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } from "../lib/membershipBusinessRules";
import { calculateSelfPurchaseTierReward } from "../lib/selfPurchaseRewardTiers";
import { ensureLegacyCanonicalMember } from "../lib/memberIdentity";
import { assessOrderCancellation } from "../lib/orderInventoryPolicy";

const originalAt = "2026-09-25T02:00:00.000Z", completedAt = "2026-09-26T02:00:00.000Z";
const resolvedAt = new Date("2026-10-05T03:00:00Z"), releaseAt = new Date("2026-10-20T03:00:00Z");
if (process.argv[2] === "--resolve" || process.argv[2] === "--release") {
  process.stdout.write(JSON.stringify(process.argv[2] === "--resolve"
    ? await commerce.resolveTerminalReturnRewardDependencies({ stateFilePath: process.argv[3], rulesFilePath: process.argv[4], now: resolvedAt })
    : await commerce.runReferralRewardReleaseScheduler({ stateFilePath: process.argv[3], rulesFilePath: process.argv[4], now: releaseAt })));
} else {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f1d-pending-"));
  const previousRoot = process.env.KD_DATA_DIR; process.env.KD_DATA_DIR = root;
  const rulesFile = path.join(root, "membership-commerce", "business-rules.json");
  let sequence = 10000, operation = 0, passes = 0;
  const test = async (name: string, check: () => unknown | Promise<unknown>) => { await check(); console.log(`PASS ${++passes} ${name}`); };
  const write = async (file: string, value: unknown) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value)); };
  const read = commerce.readMembershipCommerceState;
  const actor: ReturnActor = { actorId: "commercial-actor", authority: "customer" }, reviewer: ReturnActor = { actorId: "reviewer", authority: "reviewer" };
  const authorizeOrder = (order: Readonly<Record<string, unknown>>, caller: ReturnActor) => {
    if (caller.authority === "reviewer" && caller.actorId === reviewer.actorId) return;
    if (order.actorId !== caller.actorId) throw new Error("Not authorized");
  };
  const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES);
  rules.money.roundingMode = "round-half-up";
  rules.referral.programEnabled = true; rules.referral.referrerEligibility = { mode: "none" };
  rules.referral.reward = { mode: "percentage", percent: 10, repeatedRewards: true };
  rules.referral.referralRewardBaseWaitingDays = 0; rules.referral.referralRewardReturnProtectionDays = 7;
  rules.referral.referralMonthlyCreditCap = 0;
  rules.referral.payoutQualification.mode = "general"; rules.referral.payoutQualification.qualificationBasis = "money";
  rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 200;
  rules.referral.payoutQualification.excessConsumptionMode = "carry";
  rules.referral.payoutQualification.validConsumption = { includeCreditDiscount: false, includeShipping: false };
  async function order(memberId: string, options: { quantity?: number; unitPrice?: number; redemption?: number; pv?: number; createdAt?: string; completedAt?: string } = {}) {
    const quantity = options.quantity ?? 10, unitPrice = options.unitPrice ?? 100, credit = options.redemption ?? 0;
    const orderNumber = `KD20260925-${++sequence}`;
    const before = { orderNumber, createdAt: options.createdAt ?? originalAt, status: "ready_for_pickup", orderMode: "studio_pickup", actorId: actor.actorId,
      member: { memberId }, items: [{ slug: "coffee", optionId: "original-sku", quantity, unitPrice, lineTotal: quantity * unitPrice,
        ...(options.pv === undefined ? {} : { basePV: options.pv, effectivePV: options.pv }) }],
      subtotal: quantity * unitPrice, shipping: 0, totalBeforeCredit: quantity * unitPrice, total: quantity * unitPrice - credit,
      credit: { appliedAmount: credit, status: credit ? "reserved" : "not_used", rulesVersion: 2, reservationId: credit ? `original-credit-${sequence}` : undefined },
      paymentDetails: { status: "paid" }, inventoryTransaction: { state: "inventory_committed" } };
    const saved = await prepareOrderCompletionWrite(before, { ...before, status: "completed", fulfillmentEvents: [
      { eventId: `ful-${sequence}`, state: "completed", occurredAt: options.completedAt ?? completedAt }] });
    const file = path.join(root, "orders", `${orderNumber}.json`); await write(file, saved);
    const completion = saved.completion as OrderCompletionSnapshot;
    if (completion.returnLines?.status !== "resolved") assert.fail("Missing original lines");
    return { orderNumber, file, saved, ref: completion.returnLines.lines[0].returnLineRef };
  }
  type SavedOrder = Awaited<ReturnType<typeof order>>;
  function referral(id: string, source: SavedOrder, extra: Partial<ReferralReward> = {}): ReferralReward {
    const paid = Number(source.saved.subtotal) - Number((source.saved.credit as { appliedAmount: number }).appliedAmount);
    return { rewardId: id, sourceOrderNumber: source.orderNumber, sourceMemberId: "source-member", beneficiaryMemberId: "beneficiary",
      referralLevel: 1, rewardType: "new_referral", calculationMode: "paid_amount", paidAmountBasis: paid, basePV: 0, effectivePV: 0,
      discountRatio: 1, rewardRate: 10, rewardPV: 0, pvRewardMoneyValue: 1, calculatedCreditAmount: Math.round(paid / 10), projectedCreditAmount: Math.round(paid / 10),
      ruleVersion: 2, ancestrySnapshot: ["beneficiary"], monthlyCapAmountSnapshot: 0, baseWaitingDaysSnapshot: 0,
      returnProtectionDaysSnapshot: 7, totalWaitingDaysSnapshot: 7, successfulPickupBusinessDate: "2026-09-26",
      qualificationStatus: "qualified",
      releaseEligibleBusinessDate: "2026-10-03", sourceOrderFinalState: "completed", createdAt: completedAt,
      eligibleAt: completedAt, scheduledReleaseAt: "2026-10-03T00:00:00+08:00", releasedAt: null, status: "scheduled",
      rewardCreditEntryId: null, reversalCreditEntryId: null, reversalPolicySnapshot: "cancel-pending-and-reverse-released",
      idempotencyKey: `original:${id}`, ...extra };
  }
  async function fixture(kind: "legacy" | "coverage" | "self" | "tier" | "retail" | "none", options: { quantity?: number; unitPrice?: number; redemption?: number; pv?: number; qualifierPV?: number } = {}) {
    const source = await order("source-member", options), qualifier = await order("beneficiary", { pv: options.qualifierPV });
    const file = path.join(root, "cases", String(sequence), "commerce-state.json"), id = `reward-${sequence}`;
    let state = await read(file);
    if (kind === "self" || kind === "tier") {
      await commerce.recordValidConsumptionFromCompletedOrder({ memberId: "source-member", orderId: source.orderNumber,
        idempotencyKey: `consume:${source.orderNumber}`, now: new Date(completedAt), stateFilePath: file, rulesFilePath: rulesFile }); state = await read(file);
    }
    if (kind === "coverage") {
      await commerce.recordValidConsumptionFromCompletedOrder({ memberId: "beneficiary", orderId: qualifier.orderNumber,
        idempotencyKey: `consume:${qualifier.orderNumber}`, now: new Date(completedAt), stateFilePath: file, rulesFilePath: rulesFile }); state = await read(file);
    }
    const reference: ReturnRewardReference = { program: kind === "retail" ? "retail_promotion" : "referral", id };
    if (kind === "retail") {
      const reward: RetailPromotionReward = { rewardId: id, sourceOrderNumber: source.orderNumber, beneficiaryMemberId: "beneficiary", referralCode: "original-code",
        attributedAt: originalAt, attributionExpiresAt: completedAt, attributionSource: "member-share-link", eligibleMerchandiseAmount: 1000,
        calculationBasis: "paid_amount", calculationBaseValue: 1000, rewardRate: 10, rewardPV: 0, pvRewardMoneyValue: 1, calculatedCreditAmount: 100, ruleVersion: 2,
        roundingModeSnapshot: "round-half-up", baseWaitingDaysSnapshot: 0, returnProtectionDaysSnapshot: 7, totalWaitingDaysSnapshot: 7,
        reversalPolicySnapshot: "cancel-pending-and-reverse-released", successfulCompletionAt: completedAt, successfulPickupBusinessDate: "2026-09-26",
        releaseEligibleBusinessDate: "2026-10-03", createdAt: completedAt, releasedAt: null, sourceOrderFinalState: "completed", status: "scheduled",
        rewardCreditEntryId: null, reversalCreditEntryId: null, idempotencyKey: `original:${id}` };
      state.retailPromotionRewards[id] = reward;
    } else if (kind !== "none") {
      const self = kind === "self" || kind === "tier";
      const extra: Partial<ReferralReward> = self ? { rewardType: "self_purchase", referralLevel: 0, beneficiaryMemberId: "source-member",
        qualificationAuthority: "self_purchase_direct" } : kind === "coverage" ? { qualificationAuthority: "qualification_coverage" }
        : { qualificationAuthority: "legacy_order", qualificationStatus: "qualified", qualificationStartedAt: "2026-08-23T00:00:00Z",
            qualificationExpiresAt: "2026-09-30T23:59:59.999+08:00", qualificationOrderNumber: qualifier.orderNumber,
            qualificationOrderCreatedAt: originalAt, qualificationOrderFinalState: "completed", qualificationQualifiedAt: completedAt,
            qualificationAttempts: [{ orderNumber: qualifier.orderNumber, orderCreatedAt: originalAt, orderType: "normal", status: "completed", finalState: "completed", finalizedAt: completedAt }] };
      state.referralRewards[id] = referral(id, source, extra);
      if (kind === "tier") {
        const current = Object.values(state.validConsumptionEvents)[0];
        const tiers = [{ threshold: 0, rewardRate: 7.5 }, { threshold: 1000, rewardRate: 10 }];
        const result = calculateSelfPurchaseTierReward({ priorAmount: 0, currentAmount: 1000, calculationMethod: "whole_order", tiers });
        const evidence = [{ validConsumptionEventId: current.eventId, sourceOrderId: source.orderNumber, finalizedAt: completedAt, thresholdAmount: 1000, role: "current" as const }];
        state.referralRewards[id].selfPurchaseTierSnapshot = { featureEnabled: true,
          rules: { thresholdBasis: "paid_amount", accumulationBasis: "single_order", calculationMethod: "whole_order", rollingWindowDays: 30, tiers },
          payout: { calculationMode: "paid_amount", pvRewardMoneyValue: 1, moneyRoundingMode: "round-half-up" },
          windowStartedAt: originalAt, windowEndedAt: completedAt, initialEvidence: evidence, latestEvidence: evidence,
          initialResult: result, latestResult: result };
      }
    }
    await write(file, state);
    if (kind === "coverage") {
      await commerce.reconcileReferralRewardCoverage({ referralRewardId: id, stateFilePath: file, now: new Date(completedAt) });
      await commerce.processReferralRewardMaturations({ stateFilePath: file, rulesFilePath: rulesFile, now: releaseAt });
    }
    return { source, qualifier, file, id, reference };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function command(f: Fixture, target: SavedOrder, value: ReturnCommand, caller = actor, key = `operation-${++operation}`) {
    const result = await commerce.executeOrderReturnCommand({ orderNumber: target.orderNumber, actor: caller, command: value, reason: "Original return evidence",
      idempotencyKey: key, authorizeOrder, stateFilePath: f.file, now: new Date(value.type === "RETURN_REQUESTED" ? "2026-10-02T02:00:00Z" : "2026-10-05T02:00:00Z") });
    if (result.status !== "applied") assert.fail(JSON.stringify(result)); return result;
  }
  const request = (f: Fixture, quantity: number, target = f.source, key?: string) => command(f, target, { type: "RETURN_REQUESTED",
    lines: [{ returnLineRef: target.ref, quantity }], conditionAcknowledgement: { itemsComplete: true, unopenedUnusedWhereApplicable: true } }, actor, key);
  const terminal = (f: Fixture, requestId: string, type: "RETURN_WITHDRAWN" | "RETURN_REJECTED" | "RETURN_APPROVED", target = f.source) =>
    command(f, target, { type, returnRequestId: requestId }, type === "RETURN_WITHDRAWN" ? actor : reviewer);
  async function resolve(f: Fixture) {
    const value = await commerce.resolveTerminalReturnRewardDependencies({ stateFilePath: f.file, rulesFilePath: rulesFile, now: resolvedAt });
    if (value.status !== "resolved" || value.issues.length) assert.fail(JSON.stringify(value)); return value;
  }
  const scheduler = (f: Fixture, now = releaseAt) => commerce.runReferralRewardReleaseScheduler({ stateFilePath: f.file, rulesFilePath: rulesFile, now });
  const pending = async (f: Fixture) => commerce.projectPendingReturnRewardEntitlement(await read(f.file), f.reference);
  const holds = async (f: Fixture) => commerce.projectReturnRewardHolds(await read(f.file), f.reference);
  const preserved = (state: MembershipCommerceState) => ({ consumption: state.validConsumptionEvents, rounds: state.qualificationRounds,
    coverages: state.referralRewardCoverages, maturations: state.referralRewardMaturations, rewards: state.referralRewards,
    retail: state.retailPromotionRewards, credit: state.creditEntries, reservations: state.creditReservations });
  const bytes = (file: string) => fs.readFile(file).then(value => value.toString("base64")).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error; return null;
  });
  const protectedFiles = ["data/fulfillment/state.json", "data/member-identity/registry.json", "data/membership-commerce/commerce-state.json",
    "data/membership-commerce/business-rules.json", "public/data/assets.json", "public/data/homepage.json", "public/data/pages.json", "public/data/website-data.json"];
  const protectedBefore = await Promise.all(protectedFiles.map(bytes));
  try {
    await saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-08-01T00:00:00Z") }, rulesFile);
    await ensureLegacyCanonicalMember({ memberId: "beneficiary", identities: [{ provider: "email", subject: "pending-beneficiary@example.test" }] });
    await ensureLegacyCanonicalMember({ memberId: "source-member", identities: [{ provider: "email", subject: "pending-source@example.test" }] });
    const inventoryFile = path.join(root, "store", "website-data.json"), fulfillmentFile = path.join(root, "fulfillment", "state.json");
    await write(inventoryFile, { stock: 31, receipts: ["original"] }); await write(fulfillmentFile, { revision: 1, records: {} });
    const inventoryBefore = await bytes(inventoryFile), fulfillmentBefore = await bytes(fulfillmentFile);
    for (const type of ["RETURN_WITHDRAWN", "RETURN_REJECTED"] as const) {
      const f = await fixture("legacy"), requested = await request(f, 2), before = await read(f.file);
      await test(`${type}: pending HOLD blocks normal release`, async () => assert.equal((await scheduler(f)).find(item => item.rewardId === f.id)?.status, "held"));
      await terminal(f, requested.event.returnRequestId, type);
      await test(`${type}: terminal fact remains blocking until explicit D worker completes`, async () => assert.equal((await holds(f)).resolutionRequiredDependencyCount, 1));
      const value = await resolve(f), record = value.resolutions[0];
      await test(`${type}: exactly its own HOLD resolves`, async () => { assert.equal(value.resolvedCount, 1); assert.equal((await holds(f)).blocked, false); });
      await test(`${type}: original 100 pending restored with zero reduction`, async () => { assert.equal((await pending(f)).remainingEffectivePendingRewardAmount, 100); assert.equal(record.incrementalAdjustment, 0); });
      await test(`${type}: original 9/25 qualification and original window preserved`, () => {
        assert.equal(record.originalQualification.qualificationOrders[0].orderCreatedAt, originalAt);
        assert.equal(record.originalQualification.sourceOrder?.orderCreatedAt, originalAt); assert.equal(record.occurredAt, "2026-10-05T02:00:00.000Z");
      });
      await test(`${type}: structured restoration reason/request/source retained`, () => {
        assert.equal(record.returnRequestId, requested.event.returnRequestId); assert.equal(record.rewardSourceOrderId, f.source.orderNumber);
        assert.ok(record.reasonCode.endsWith(type === "RETURN_WITHDRAWN" ? "withdrawn" : "rejected"));
      });
      await test(`${type}: no Round, Maturation, original reward or credit rewritten`, async () => assert.deepEqual(preserved(await read(f.file)), preserved(before)));
      await test(`${type}: retry produces no duplicate resolution`, async () => { const again = await resolve(f); assert.equal(again.resolvedCount, 0); assert.deepEqual(again.resolutions, value.resolutions); });
      await test(`${type}: next past-safe-date scheduler releases original amount without new wait`, async () => {
        assert.equal((await scheduler(f, new Date(resolvedAt.getTime() + 1000))).find(item => item.rewardId === f.id)?.status, "released");
        assert.deepEqual(Object.values((await read(f.file)).creditEntries).map(item => item.amount), [100]);
      });
    }
    for (const kind of ["legacy", "retail", "self", "tier"] as const) {
      const f = await fixture(kind), requested = await request(f, kind === "tier" ? 2 : 3);
      await terminal(f, requested.event.returnRequestId, "RETURN_APPROVED"); const before = await read(f.file);
      const value = await resolve(f), record = value.resolutions[0], expected = kind === "tier" ? 60 : 70;
      await test(`${kind}: original pending amount remains 100`, () => assert.equal(record.originalPendingRewardAmount, 100));
      await test(`${kind}: approved return recalculates remaining pending ${expected}`, async () => assert.equal((await pending(f)).remainingEffectivePendingRewardAmount, expected));
      await test(`${kind}: incremental and cumulative adjustments are exact`, () => {
        assert.equal(record.previousEffectivePendingAmount, 100); assert.equal(record.incrementalAdjustment, expected - 100); assert.equal(record.cumulativeAdjustment, expected - 100);
      });
      await test(`${kind}: D0 fingerprints and approval source are preserved`, () => { assert.ok(record.d0Evidence.length); assert.equal(record.returnRequestId, requested.event.returnRequestId); });
      await test(`${kind}: pending adjustment creates no credit or negative credit`, async () => assert.deepEqual((await read(f.file)).creditEntries, {}));
      await test(`${kind}: original financial/qualification objects remain immutable`, async () => assert.deepEqual(preserved(await read(f.file)), preserved(before)));
      await test(`${kind}: only this terminal dependency becomes resolved`, async () => assert.equal((await holds(f)).dependencies[0].state, "resolved"));
      await test(`${kind}: next normal release issues remaining amount once`, async () => {
        assert.equal((await scheduler(f)).find(item => item.rewardId === f.id)?.status, "released");
        assert.deepEqual(Object.values((await read(f.file)).creditEntries).map(item => item.amount), [expected]);
        await scheduler(f); assert.equal(Object.keys((await read(f.file)).creditEntries).length, 1);
      });
      if (kind === "tier") {
        await test("nonlinear tier 1000→800 yields 100→60, not naive 80", () => {
          assert.notEqual(expected, 80); const tier = record.calculation.tier as { current: number; result: { rawReward: number } };
          assert.equal(tier.current, 800); assert.equal(tier.result.rawReward, 60); assert.ok(record.d1ReductionIds.length);
        });
      }
    }
    const full = await fixture("self"), fullRequest = await request(full, 10);
    await terminal(full, fullRequest.event.returnRequestId, "RETURN_APPROVED"); const fullResult = await resolve(full), fullRecord = fullResult.resolutions[0];
    await test("full return creates zero effective pending entitlement", async () => { assert.equal((await pending(full)).remainingEffectivePendingRewardAmount, 0); assert.equal((await pending(full)).cancelledBeforeRelease, true); });
    await test("full cancellation reason preserves original/zero/delta", () => { assert.equal(fullRecord.originalPendingRewardAmount, 100); assert.equal(fullRecord.incrementalAdjustment, -100); assert.equal(fullRecord.reasonCode, "pending_reward_cancelled_due_to_return"); });
    await test("zero entitlement never releases original credit or creates a negative", async () => { assert.equal((await scheduler(full)).find(item => item.rewardId === full.id)?.status, "return_cancelled"); assert.deepEqual((await read(full.file)).creditEntries, {}); });
    const multi = await fixture("self"), a = await request(multi, 2), b = await request(multi, 3);
    await test("multiple requests create independent active HOLD dependencies", async () => assert.equal((await holds(multi)).activeHoldDependencyCount, 2));
    await terminal(multi, a.event.returnRequestId, "RETURN_REJECTED"); await resolve(multi);
    await test("rejecting A does not clear pending B", async () => { assert.equal((await holds(multi)).activeHoldDependencyCount, 1); assert.equal((await scheduler(multi)).find(item => item.rewardId === multi.id)?.status, "held"); });
    await command(multi, multi.source, { type: "RETURN_PROCESSING_LOCKED", returnRequestId: b.event.returnRequestId }, reviewer);
    await test("processing B still blocks release after A resolved", async () => { assert.equal((await holds(multi)).blocked, true); assert.equal((await pending(multi)).remainingEffectivePendingRewardAmount, 100); });
    await terminal(multi, b.event.returnRequestId, "RETURN_APPROVED"); const multiResult = await resolve(multi);
    await test("approving B changes only remaining valid pending amount", async () => { assert.equal((await pending(multi)).remainingEffectivePendingRewardAmount, 70); assert.equal((await holds(multi)).blocked, false); });
    await test("rejected A contributes zero alongside approved B", () => assert.deepEqual(multiResult.resolutions.map(item => item.incrementalAdjustment), [0, -30]));
    const cumulative = await fixture("self");
    for (const quantity of [2, 3]) { const r = await request(cumulative, quantity); await terminal(cumulative, r.event.returnRequestId, "RETURN_APPROVED"); await resolve(cumulative); }
    const cumulativeRecords = commerce.readPendingReturnRewardResolutions(await read(cumulative.file));
    await test("approved A/B create only incremental -20/-30", () => assert.deepEqual(cumulativeRecords.map(item => item.incrementalAdjustment), [-20, -30]));
    await test("cumulative approved adjustment is 50 and remaining pending is 50", async () => { assert.equal((await pending(cumulative)).cumulativeApprovedReturnConsequence, 50); assert.equal((await pending(cumulative)).remainingEffectivePendingRewardAmount, 50); });
    await test("replaying all approvals does not duplicate D0/D1/D audit or idempotency", async () => {
      const before = await read(cumulative.file); const replay = await resolve(cumulative); const after = await read(cumulative.file);
      assert.equal(replay.resolvedCount, 0); assert.deepEqual(after.audit, before.audit); assert.deepEqual(after.idempotency, before.idempotency);
    });
    await test("restart/JSON roundtrip reproduces the same entitlement", async () => {
      const state = await read(cumulative.file); assert.deepEqual(commerce.projectPendingReturnRewardEntitlement(JSON.parse(JSON.stringify(state)), cumulative.reference), await pending(cumulative));
      const child = spawnSync(process.execPath, ["--experimental-strip-types", "--import", "./scripts/return-workflow-test-bootstrap.mjs", fileURLToPath(import.meta.url), "--resolve", cumulative.file, rulesFile], { encoding: "utf8", windowsHide: true });
      assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).resolvedCount, 0);
    });
    const afterApproved = await request(cumulative, 1); await terminal(cumulative, afterApproved.event.returnRequestId, "RETURN_WITHDRAWN"); await resolve(cumulative);
    await test("withdrawing a later request cannot restore entitlement already lost to approved returns", async () => {
      assert.equal((await pending(cumulative)).remainingEffectivePendingRewardAmount, 50);
      assert.equal((await pending(cumulative)).resolutions.at(-1)?.incrementalAdjustment, 0);
    });
    for (const [quantity, expected, expectedAllocation, carry] of [[5, 100, 200, 300], [9, 0, 100, 0]] as const) {
      const f = await fixture("coverage"), before = await read(f.file), requested = await request(f, quantity, f.qualifier);
      await terminal(f, requested.event.returnRequestId, "RETURN_APPROVED", f.qualifier); const value = await resolve(f), record = value.resolutions[0];
      await test(`Coverage qualifier return ${quantity * 100}: D1 carry-first projection used`, async () => {
        const event = Object.values((await read(f.file)).validConsumptionEvents)[0], projection = commerce.projectEffectiveReturnConsumption(await read(f.file), event.eventId);
        if (projection.status !== "resolved") assert.fail(JSON.stringify(projection));
        assert.equal(projection.effectiveAllocationByRound[0].effectiveAllocation, expectedAllocation); assert.equal(projection.effectiveCarry, carry);
      });
      await test(`Coverage qualifier return ${quantity * 100}: original threshold determines pending ${expected}`, async () => assert.equal((await pending(f)).remainingEffectivePendingRewardAmount, expected));
      await test(`Coverage qualifier return ${quantity * 100}: original Round/allocation/Coverage/Maturation remain`, async () => {
        const after = await read(f.file); assert.deepEqual(after.qualificationRounds, before.qualificationRounds);
        assert.deepEqual(after.referralRewardCoverages, before.referralRewardCoverages); assert.deepEqual(after.referralRewardMaturations, before.referralRewardMaturations);
      });
      await test(`Coverage qualifier return ${quantity * 100}: original 9/25 qualification identity preserved`, () => {
        assert.equal(record.originalQualification.qualificationOrders[0].orderCreatedAt, originalAt);
        assert.ok(record.originalQualification.qualificationRoundId); assert.ok(record.originalQualification.coverageId); assert.ok(record.originalQualification.maturationId);
      });
      await test(`Coverage qualifier return ${quantity * 100}: release respects remaining entitlement`, async () => {
        await scheduler(f); assert.deepEqual(Object.values((await read(f.file)).creditEntries).map(item => item.amount), expected ? [expected] : []);
      });
    }
    const deadline = await fixture("self");
    const originalDeadline = (deadline.source.saved.completion as OrderCompletionSnapshot).returnDeadline;
    await test("same return-protection day cannot release at its beginning", async () => assert.equal((await scheduler(deadline, new Date("2026-10-03T00:00:00+08:00"))).find(item => item.rewardId === deadline.id)?.status, "safety_wait"));
    await test("exact preserved deadline millisecond remains protected", async () => assert.equal((await scheduler(deadline, new Date(originalDeadline))).find(item => item.rewardId === deadline.id)?.status, "safety_wait"));
    await test("one millisecond after original deadline can release through normal scheduler", async () => assert.equal((await scheduler(deadline, new Date(Date.parse(originalDeadline) + 1))).find(item => item.rewardId === deadline.id)?.status, "released"));
    const raw = await fixture("legacy"), rawRequest = await request(raw, 3); await terminal(raw, rawRequest.event.returnRequestId, "RETURN_APPROVED"); await resolve(raw);
    await test("deep issueCredit boundary rejects original 100 after adjustment to 70", async () => assert.rejects(() => commerce.issueCredit({ memberId: "beneficiary", sourceType: "referral", sourceReference: `referral_reward:${raw.id}`, amount: 100,
      idempotencyKey: "over-original-amount", stateFilePath: raw.file, rulesFilePath: rulesFile, now: releaseAt })));
    await test("deep issueCredit boundary rejects premature adjusted credit", async () => assert.rejects(() => commerce.issueCredit({ memberId: "beneficiary", sourceType: "referral", sourceReference: `referral_reward:${raw.id}`, amount: 70,
      idempotencyKey: "before-return-deadline", stateFilePath: raw.file, rulesFilePath: rulesFile, now: new Date("2026-10-03T02:00:00+08:00") })));
    await test("deep issueCredit boundary cannot relabel exact reward credit as manual", async () => assert.rejects(() => commerce.issueCredit({ memberId: "beneficiary", sourceType: "manual", sourceReference: `referral_reward:${raw.id}`, amount: 70,
      idempotencyKey: "wrong-reward-credit-type", stateFilePath: raw.file, rulesFilePath: rulesFile, now: releaseAt })));
    const longerWait = await fixture("legacy"), longerState = await read(longerWait.file);
    longerState.referralRewards[longerWait.id].baseWaitingDaysSnapshot = 7;
    longerState.referralRewards[longerWait.id].totalWaitingDaysSnapshot = 14;
    longerState.referralRewards[longerWait.id].releaseEligibleBusinessDate = "2026-10-10";
    longerState.referralRewards[longerWait.id].scheduledReleaseAt = "2026-10-10T00:00:00+08:00"; await write(longerWait.file, longerState);
    const lw = await request(longerWait, 1); await terminal(longerWait, lw.event.returnRequestId, "RETURN_REJECTED"); await resolve(longerWait);
    await test("deep issuance still enforces original base waiting period after return deadline and HOLD resolution", async () => assert.rejects(() => commerce.issueCredit({ memberId: "beneficiary", sourceType: "referral", sourceReference: `referral_reward:${longerWait.id}`, amount: 100,
      idempotencyKey: "original-base-wait-not-complete", stateFilePath: longerWait.file, rulesFilePath: rulesFile, now: new Date("2026-10-06T00:00:00Z") })));
    await test("unrelated manual credit on same member is unaffected", async () => {
      const entry = await commerce.issueCredit({ memberId: "beneficiary", sourceType: "manual", sourceReference: "unrelated-manual", amount: 19,
        idempotencyKey: "unrelated-manual-credit", stateFilePath: raw.file, rulesFilePath: rulesFile, now: new Date("2026-10-02T02:00:00Z") }); assert.equal(entry.amount, 19);
    });
    const unrelated = await order("other-member"), unrelatedState = await read(raw.file);
    unrelatedState.referralRewards["other-reward"] = referral("other-reward", unrelated, { sourceMemberId: "other-member", beneficiaryMemberId: "other-member", rewardType: "self_purchase", referralLevel: 0, qualificationAuthority: "self_purchase_direct" });
    unrelatedState.creditReservations["unrelated-reservation"] = { reservationId: "unrelated-reservation", memberId: "beneficiary", orderId: "other-purchase", amount: 0, requestedAmount: 0,
      status: "reserved", allocations: [], createdAt: originalAt, updatedAt: originalAt }; await write(raw.file, unrelatedState);
    await test("different source/member reward releases independently", async () => {
      assert.equal((await scheduler(raw)).find(item => item.rewardId === "other-reward")?.status, "released");
      assert.equal((await read(raw.file)).creditEntries[(await read(raw.file)).referralRewards["other-reward"].rewardCreditEntryId!].memberId, "other-member");
    });
    await test("purchase credit reservation is untouched", async () => assert.deepEqual((await read(raw.file)).creditReservations, unrelatedState.creditReservations));
    const current = structuredClone(rules); current.credit.redemption = { mode: "maximum-percentage", percent: 60 }; current.referral.selfPurchaseRewardRate = 1;
    current.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 99999;
    current.referral.selfPurchaseRewardTiers.enabled = true; current.referral.selfPurchaseRewardTiers.tiers = [{ threshold: 0, rewardRate: 1 }];
    current.referral.levels = current.referral.levels.map(item => ({ ...item, newReferralRewardRate: 1 })); current.retailPromotion.rewardRate = 1;
    current.referral.referrerEligibility = { mode: "completed-orders", minimumOrders: 999 };
    await saveMembershipBusinessRules({ expectedRevision: 1, rules: current, now: new Date("2026-10-04T00:00:00Z") }, rulesFile);
    for (const kind of ["legacy", "retail", "tier", "coverage"] as const) {
      const f = await fixture(kind); const target = kind === "coverage" ? f.qualifier : f.source;
      await write(target.file, { ...target.saved, items: [{ slug: "current-price", optionId: "current", quantity: 1, unitPrice: 99999 }], currentPricingPolicy: { amount: 99999 }, maximumAllowedRedemption: 140 });
      const r = await request(f, kind === "tier" ? 2 : 5, target); await terminal(f, r.event.returnRequestId, "RETURN_APPROVED", target); await resolve(f);
      await test(`${kind}: current rate/tier/threshold/catalog/redemption changes cannot alter original result`, async () => assert.equal((await pending(f)).remainingEffectivePendingRewardAmount, kind === "tier" ? 60 : kind === "coverage" ? 100 : 50));
    }
    const credit = await fixture("self", { quantity: 2, unitPrice: 100, redemption: 100 }), creditRequest = await request(credit, 1);
    await terminal(credit, creditRequest.event.returnRequestId, "RETURN_APPROVED"); const creditResult = await resolve(credit);
    await test("actual original redemption 100, not hypothetical cap 140, drives pending 10→5", async () => {
      assert.equal(creditResult.resolutions[0].originalPendingRewardAmount, 10); assert.equal((await pending(credit)).remainingEffectivePendingRewardAmount, 5);
    });
    const rounding = await fixture("self", { quantity: 3, unitPrice: 100, redemption: 200 });
    for (let index = 0; index < 3; index++) { const r = await request(rounding, 1); await terminal(rounding, r.event.returnRequestId, "RETURN_APPROVED"); await resolve(rounding); }
    await test("D0 34/33/33 economics feed original reward rounding with cumulative -3/-4/-3 deltas", async () => {
      const records = commerce.readPendingReturnRewardResolutions(await read(rounding.file));
      assert.deepEqual(records.map(item => item.incrementalAdjustment), [-3, -4, -3]); assert.equal(records.at(-1)?.remainingEffectivePendingRewardAmount, 0);
    });
    const marginal = await fixture("tier"), marginalState = await read(marginal.file), marginalReward = marginalState.referralRewards[marginal.id];
    const marginalSnapshot = marginalReward.selfPurchaseTierSnapshot!;
    marginalSnapshot.rules.calculationMethod = "marginal"; marginalSnapshot.rules.tiers = [{ threshold: 0, rewardRate: 5 }, { threshold: 500, rewardRate: 10 }];
    marginalSnapshot.initialResult = calculateSelfPurchaseTierReward({ priorAmount: 0, currentAmount: 1000, calculationMethod: "marginal", tiers: marginalSnapshot.rules.tiers });
    marginalSnapshot.latestResult = structuredClone(marginalSnapshot.initialResult); marginalReward.calculatedCreditAmount = 75; marginalReward.projectedCreditAmount = 75;
    await write(marginal.file, marginalState); const mr = await request(marginal, 3); await terminal(marginal, mr.event.returnRequestId, "RETURN_APPROVED"); await resolve(marginal);
    await test("preserved marginal tier semantics recalculate 75→45 instead of quantity proration", async () => assert.equal((await pending(marginal)).remainingEffectivePendingRewardAmount, 45));
    const priorTier = await fixture("tier"), priorOrder = await order("source-member", { createdAt: "2026-09-24T02:00:00.000Z", completedAt: "2026-09-25T02:00:00.000Z" });
    await commerce.recordValidConsumptionFromCompletedOrder({ memberId: "source-member", orderId: priorOrder.orderNumber, idempotencyKey: "original-prior-tier-consumption",
      stateFilePath: priorTier.file, rulesFilePath: rulesFile, now: new Date("2026-09-25T02:00:00Z") });
    const priorState = await read(priorTier.file), priorReward = priorState.referralRewards[priorTier.id], priorSnapshot = priorReward.selfPurchaseTierSnapshot!;
    const priorConsumption = Object.values(priorState.validConsumptionEvents).find(item => item.sourceOrderId === priorOrder.orderNumber)!;
    priorSnapshot.rules.accumulationBasis = "rolling_period"; priorSnapshot.rules.tiers = [{ threshold: 0, rewardRate: 7.5 }, { threshold: 2000, rewardRate: 10 }];
    priorSnapshot.initialEvidence.unshift({ validConsumptionEventId: priorConsumption.eventId, sourceOrderId: priorOrder.orderNumber, finalizedAt: priorConsumption.finalizedAt, thresholdAmount: 1000, role: "prior" });
    priorSnapshot.latestEvidence = structuredClone(priorSnapshot.initialEvidence);
    priorSnapshot.initialResult = calculateSelfPurchaseTierReward({ priorAmount: 1000, currentAmount: 1000, calculationMethod: "whole_order", tiers: priorSnapshot.rules.tiers });
    priorSnapshot.latestResult = structuredClone(priorSnapshot.initialResult); await write(priorTier.file, priorState);
    const priorRequest = await request(priorTier, 5, priorOrder); await terminal(priorTier, priorRequest.event.returnRequestId, "RETURN_APPROVED", priorOrder); const priorResolved = await resolve(priorTier);
    await test("return of prior tier consumption adjusts later reward from preserved rolling evidence", async () => {
      assert.equal((await pending(priorTier)).remainingEffectivePendingRewardAmount, 75);
      assert.ok(priorResolved.resolutions[0].originalQualification.qualificationOrders.some(item => item.orderId === priorOrder.orderNumber && item.orderCreatedAt === "2026-09-24T02:00:00.000Z"));
    });
    const pvSource = await fixture("self", { pv: 2.5 }), pvSourceState = await read(pvSource.file), pvReward = pvSourceState.referralRewards[pvSource.id];
    pvReward.calculationMode = "pv"; pvReward.basePV = 25; pvReward.effectivePV = 25; pvReward.rewardPV = 2.5;
    pvReward.calculatedCreditAmount = 3; pvReward.projectedCreditAmount = 3; await write(pvSource.file, pvSourceState);
    const pvr = await request(pvSource, 3); await terminal(pvSource, pvr.event.returnRequestId, "RETURN_APPROVED"); const pvSourceResult = await resolve(pvSource);
    await test("PV payout uses preserved per-line PV separately from NTD economics", async () => {
      assert.equal((await pending(pvSource)).remainingEffectivePendingRewardAmount, 2);
      assert.equal((pvSourceResult.resolutions[0].calculation.linear as { remainingPV: number }).remainingPV, 17.5);
    });
    for (const [quantity, expected] of [[2, 100], [5, 0]] as const) {
      const f = await fixture("coverage", { qualifierPV: 3 }), state = await read(f.file), event = Object.values(state.validConsumptionEvents)[0];
      const round = Object.values(state.qualificationRounds)[0]; round.qualificationBasis = "pv";
      round.generalPath.qualificationBasis = "pv"; round.generalPath.threshold = 20; round.generalPath.cumulativeAmount = 30;
      round.consumptionAccounting = { basis: "pv", availableAmountBefore: 30, consumedAmount: 20, remainingAmountAfter: 10,
        allocations: [{ validConsumptionEventId: event.eventId, amount: 20 }] }; await write(f.file, state);
      const r = await request(f, quantity, f.qualifier); await terminal(f, r.event.returnRequestId, "RETURN_APPROVED", f.qualifier); const value = await resolve(f);
      await test(`PV Coverage return ${quantity}: separate original PV carry applies same D1 unwind without NTD conversion`, async () => {
        assert.equal((await pending(f)).remainingEffectivePendingRewardAmount, expected);
        const proof = value.resolutions[0].calculation.pvCoveragePolicy as { unit: string; originalPV: string; remainingPV: string };
        assert.equal(proof.unit, "pv"); assert.equal(proof.originalPV, "30"); assert.equal(proof.remainingPV, String(30 - quantity * 3));
        assert.deepEqual((await read(f.file)).qualificationRounds, state.qualificationRounds);
      });
    }
    const cap = await fixture("legacy"), secondQualifier = await order("beneficiary-two"), capState = await read(cap.file), firstCap = capState.referralRewards[cap.id];
    firstCap.rewardRate = 7; firstCap.projectedCreditAmount = 70; firstCap.calculatedCreditAmount = 70;
    firstCap.organizationCapPercentSnapshot = 10; firstCap.organizationCapAmountSnapshot = 100;
    capState.referralRewards["z-cap-peer"] = { ...structuredClone(firstCap), rewardId: "z-cap-peer", referralLevel: 2, beneficiaryMemberId: "beneficiary-two",
      projectedCreditAmount: 30, calculatedCreditAmount: 30, qualificationOrderNumber: secondQualifier.orderNumber,
      qualificationAttempts: [{ orderNumber: secondQualifier.orderNumber, orderCreatedAt: originalAt, orderType: "normal", status: "completed", finalState: "completed", finalizedAt: completedAt }] };
    await write(cap.file, capState); const cr = await request(cap, 2); await terminal(cap, cr.event.returnRequestId, "RETURN_APPROVED"); await resolve(cap);
    await test("original organization cap and level ordering recompute 70/30→56/24", async () => {
      const state = await read(cap.file); assert.equal((await pending(cap)).remainingEffectivePendingRewardAmount, 56);
      assert.equal(commerce.projectPendingReturnRewardEntitlement(state, { program: "referral", id: "z-cap-peer" }).remainingEffectivePendingRewardAmount, 24);
    });
    const scalar = await fixture("none"), scalarState = await read(scalar.file);
    scalarState.referrals["original-relationship"] = { relationshipId: "original-relationship", referrerMemberId: "beneficiary", referredMemberId: "source-member",
      referralCode: "original-code", safeDisplayName: "Source", status: "registered", createdAt: originalAt, updatedAt: originalAt }; await write(scalar.file, scalarState);
    const conversion = await commerce.processReferralOrderOutcome({ referredMemberId: "source-member", orderId: scalar.source.orderNumber, outcome: "completed",
      orderMerchandiseAmount: 1000, eligibleItemCount: 10, idempotencyKey: "original-conversion", stateFilePath: scalar.file, rulesFilePath: rulesFile, now: new Date(completedAt) });
    assert.ok(conversion); scalar.reference = { program: "referral_conversion", id: conversion.conversionId }; scalar.id = conversion.conversionId;
    await test("old scalar issuance path keeps a new canonical completion pending through original return exposure", async () => {
      assert.equal(conversion.status, "pending"); assert.equal(conversion.originalCalculation?.referrerEligibleAtCreation, true); assert.deepEqual((await read(scalar.file)).creditEntries, {});
    });
    const sr = await request(scalar, 3); await terminal(scalar, sr.event.returnRequestId, "RETURN_APPROVED"); await resolve(scalar);
    await test("legacy conversion pending amount uses original policy and D0 source economics", async () => assert.equal((await pending(scalar)).remainingEffectivePendingRewardAmount, 70));
    await test("originally-qualified conversion resumes without today's 999-order requalification", async () => {
      const credits = await commerce.releasePendingReferralRewards({ referrerMemberId: "beneficiary", completedOrders: 0, idempotencyKey: "resolved-conversion-release",
        stateFilePath: scalar.file, rulesFilePath: rulesFile, now: releaseAt }); assert.deepEqual(credits.map(item => item.amount), [70]);
    });
    const unqualified = await fixture("none"), unqualifiedState = await read(unqualified.file);
    unqualifiedState.referrals["unqualified-relationship"] = { relationshipId: "unqualified-relationship", referrerMemberId: "beneficiary", referredMemberId: "source-member",
      referralCode: "original-code", safeDisplayName: "Source", status: "registered", createdAt: originalAt, updatedAt: originalAt }; await write(unqualified.file, unqualifiedState);
    const uc = await commerce.processReferralOrderOutcome({ referredMemberId: "source-member", orderId: unqualified.source.orderNumber, outcome: "completed",
      orderMerchandiseAmount: 1000, eligibleItemCount: 10, referrerCompletedOrders: 0, idempotencyKey: "original-unqualified-conversion",
      stateFilePath: unqualified.file, rulesFilePath: rulesFile, now: resolvedAt });
    assert.ok(uc); assert.equal(uc.originalCalculation?.referrerEligibleAtCreation, false);
    await test("deep credit call cannot bypass an unqualified original conversion program", async () => assert.rejects(() => commerce.issueCredit({ memberId: "beneficiary", sourceType: "referral",
      sourceReference: `referral_conversion:${uc.relationshipId}:${uc.orderId}`, amount: 100, idempotencyKey: "unqualified-raw-bypass", stateFilePath: unqualified.file, rulesFilePath: rulesFile, now: releaseAt })));
    await test("genuine later eligibility still uses the existing original conversion release path", async () => {
      const entries = await commerce.releasePendingReferralRewards({ referrerMemberId: "beneficiary", completedOrders: 1000, idempotencyKey: "genuine-original-eligibility",
        stateFilePath: unqualified.file, rulesFilePath: rulesFile, now: releaseAt }); assert.deepEqual(entries.map(item => item.amount), [100]);
    });
    const restoredLegacy = await fixture("legacy"), restoredRequest = await request(restoredLegacy, 1);
    await terminal(restoredLegacy, restoredRequest.event.returnRequestId, "RETURN_REJECTED"); await resolve(restoredLegacy);
    const newer = structuredClone(current); newer.referral.referrerEligibility = { mode: "active-subscription" };
    await saveMembershipBusinessRules({ expectedRevision: 2, rules: newer, now: new Date("2026-10-06T00:00:00Z") }, rulesFile);
    await test("restored original legacy qualification does not require a new active subscription under today's changed policy", async () => {
      assert.deepEqual((await read(restoredLegacy.file)).subscriptions, {});
      assert.equal((await scheduler(restoredLegacy)).find(item => item.rewardId === restoredLegacy.id)?.status, "released");
      assert.deepEqual(Object.values((await read(restoredLegacy.file)).creditEntries).map(item => item.amount), [100]);
    });
    for (const type of ["RETURN_APPROVED", "RETURN_REJECTED", "RETURN_WITHDRAWN"] as const) {
      const f = await fixture("none"), r = await request(f, 1); await terminal(f, r.event.returnRequestId, type);
      await test(`${type}: no-reward/no-PV order resolves as normal no-op`, async () => { const value = await resolve(f); assert.equal(value.resolvedCount, 0); assert.deepEqual((await read(f.file)).creditEntries, {}); });
    }
    const released = await fixture("self"); await scheduler(released); const releasedBefore = await read(released.file);
    const rr = await request(released, 1); await terminal(released, rr.event.returnRequestId, "RETURN_APPROVED");
    const compatibility = await commerce.resolveTerminalReturnRewardDependencies({ stateFilePath: released.file, rulesFilePath: rulesFile, now: resolvedAt });
    await test("already-released anomaly is explicitly separated and reported for defensive review", () => {
      assert.equal(compatibility.resolvedCount, 0); assert.equal(compatibility.issues[0].compatibility, "released_reward_defensive_review");
    });
    await test("released positive credit remains byte-equivalent; D creates no negative", async () => assert.deepEqual((await read(released.file)).creditEntries, releasedBefore.creditEntries));
    await test("defensive review preserves audit reason and cannot silently unhold", async () => {
      const state = await read(released.file); assert.ok(state.audit.some(item => item.action === "RETURN_REWARD_DEFENSIVE_REVIEW_REQUIRED")); assert.equal((await holds(released)).blocked, true);
    });
    await test("explicit existing legacy defensive reversal remains available outside normal D flow", async () => {
      await commerce.cancelOrReverseReferralRewards({ orderId: released.source.orderNumber, outcome: "returned", idempotencyKey: "explicit-legacy-exception",
        stateFilePath: released.file, rulesFilePath: rulesFile, now: releaseAt });
      const state = await read(released.file); assert.deepEqual(Object.values(state.creditEntries).filter(item => item.amount < 0).map(item => item.amount), [-100]);
      assert.equal(state.referralRewards[released.id].status, "reversed");
    });
    await test("existing defensive retry remains idempotent and does not duplicate exceptional negative credit", async () => {
      await commerce.cancelOrReverseReferralRewards({ orderId: released.source.orderNumber, outcome: "returned", idempotencyKey: "explicit-legacy-exception",
        stateFilePath: released.file, rulesFilePath: rulesFile, now: releaseAt });
      assert.equal(Object.values((await read(released.file)).creditEntries).filter(item => item.amount < 0).length, 1);
    });
    const race = await fixture("self"), raceRequest = await request(race, 3); await terminal(race, raceRequest.event.returnRequestId, "RETURN_APPROVED");
    const worker = () => new Promise<{ status: number | null; stdout: string; stderr: string }>(done => {
      const child = spawn(process.execPath, ["--experimental-strip-types", "--import", "./scripts/return-workflow-test-bootstrap.mjs", fileURLToPath(import.meta.url), "--resolve", race.file, rulesFile], { windowsHide: true });
      let stdout = "", stderr = ""; child.stdout.on("data", data => stdout += data); child.stderr.on("data", data => stderr += data); child.on("close", status => done({ status, stdout, stderr }));
    });
    const workers = await Promise.all([worker(), worker()]);
    await test("two independent resolution workers append exactly once", async () => {
      for (const child of workers) assert.equal(child.status, 0, child.stderr);
      assert.deepEqual(workers.map(child => JSON.parse(child.stdout).resolvedCount).sort(), [0, 1]); assert.equal(commerce.readPendingReturnRewardResolutions(await read(race.file)).length, 1);
    });
    const releaseRace = await fixture("self"), releaseRaceRequest = await request(releaseRace, 3);
    await terminal(releaseRace, releaseRaceRequest.event.returnRequestId, "RETURN_APPROVED");
    const raceWorker = (mode: string) => new Promise<{ status: number | null; stderr: string }>(done => {
      const child = spawn(process.execPath, ["--experimental-strip-types", "--import", "./scripts/return-workflow-test-bootstrap.mjs", fileURLToPath(import.meta.url), mode, releaseRace.file, rulesFile], { windowsHide: true });
      let stderr = ""; child.stdout.resume(); child.stderr.on("data", data => stderr += data); child.on("close", status => done({ status, stderr }));
    });
    const raced = await Promise.all([raceWorker("--resolve"), raceWorker("--release")]);
    await test("independent resolution-versus-payout race never issues the unadjusted reward", async () => {
      for (const child of raced) assert.equal(child.status, 0, child.stderr);
      const entries = Object.values((await read(releaseRace.file)).creditEntries); assert.ok(entries.every(item => item.amount === 70));
      await scheduler(releaseRace); assert.deepEqual(Object.values((await read(releaseRace.file)).creditEntries).map(item => item.amount), [70]);
    });
    const isolatedGood = await fixture("self"), isolatedBad = await fixture("self");
    for (const f of [isolatedGood, isolatedBad]) { const r = await request(f, 3); await terminal(f, r.event.returnRequestId, "RETURN_APPROVED"); }
    const goodState = await read(isolatedGood.file), badState = await read(isolatedBad.file);
    Object.values(badState.validConsumptionEvents)[0].validConsumptionAmount = 999;
    const merged: MembershipCommerceState = { ...goodState,
      referralRewards: { ...goodState.referralRewards, ...badState.referralRewards }, validConsumptionEvents: { ...goodState.validConsumptionEvents, ...badState.validConsumptionEvents },
      qualificationRounds: { ...goodState.qualificationRounds, ...badState.qualificationRounds }, returnEvents: [...goodState.returnEvents!, ...badState.returnEvents!],
      audit: [...goodState.audit, ...badState.audit], idempotency: { ...goodState.idempotency, ...badState.idempotency } };
    await write(isolatedGood.file, merged);
    await test("insufficient economic evidence blocks only its exact dependency, not another reward", async () => {
      const value = await commerce.resolveTerminalReturnRewardDependencies({ stateFilePath: isolatedGood.file, rulesFilePath: rulesFile, now: resolvedAt });
      assert.equal(value.status, "manual_review_required"); assert.equal(value.resolvedCount, 1); assert.equal(value.issues[0].reward.id, isolatedBad.id);
      assert.equal((await pending(isolatedGood)).remainingEffectivePendingRewardAmount, 70);
      assert.equal((await holds(isolatedGood)).blocked, false);
      assert.equal(commerce.projectReturnRewardHolds(await read(isolatedGood.file), isolatedBad.reference).blocked, true);
      assert.equal((await scheduler(isolatedGood)).find(item => item.rewardId === isolatedGood.id)?.status, "released");
    });
    const goodSafety = await fixture("self"), badSafety = await fixture("self");
    const goodSafetyState = await read(goodSafety.file), badSafetyState = await read(badSafety.file);
    await write(goodSafety.file, { ...goodSafetyState, referralRewards: { ...goodSafetyState.referralRewards, ...badSafetyState.referralRewards },
      validConsumptionEvents: { ...goodSafetyState.validConsumptionEvents, ...badSafetyState.validConsumptionEvents },
      qualificationRounds: { ...goodSafetyState.qualificationRounds, ...badSafetyState.qualificationRounds },
      audit: [...goodSafetyState.audit, ...badSafetyState.audit], idempotency: { ...goodSafetyState.idempotency, ...badSafetyState.idempotency } });
    await write(badSafety.source.file, { ...badSafety.source.saved, completion: { ...(badSafety.source.saved.completion as OrderCompletionSnapshot), returnDeadline: "invalid" } });
    await test("one incomplete source safety snapshot cannot abort unrelated safe reward payout", async () => {
      const result = await scheduler(goodSafety); assert.equal(result.find(item => item.rewardId === badSafety.id)?.status, "failed");
      assert.equal(result.find(item => item.rewardId === goodSafety.id)?.status, "released");
      assert.deepEqual(Object.values((await read(goodSafety.file)).creditEntries).map(item => item.amount), [100]);
    });
    await test("tampered resolution cannot bypass HOLD", async () => {
      const state = await read(race.file), audit = state.audit.find(item => item.action === "RETURN_REWARD_HOLD_RESOLVED_APPROVED")!;
      const record = JSON.parse(String(audit.after.evidence)); record.remainingEffectivePendingRewardAmount = 100; audit.after.evidence = JSON.stringify(record);
      assert.throws(() => commerce.projectReturnRewardHolds(state, race.reference));
    });
    await test("deleted resolution with retained idempotency identity fails closed", async () => {
      const state = await read(race.file); state.audit = state.audit.filter(item => !item.action.startsWith("RETURN_REWARD_HOLD_RESOLVED_"));
      assert.throws(() => commerce.readPendingReturnRewardResolutions(state));
    });
    await test("full/cumulative adjustment remains bounded by original pending reward", async () => {
      for (const f of [full, multi, cumulative, raw, credit]) { const value = await pending(f); assert.ok(value.cumulativeApprovedReturnConsequence >= 0); assert.ok(value.cumulativeApprovedReturnConsequence <= value.originalPendingRewardAmount); }
    });
    await test("completed order/payment/inventory bytes are unchanged by D resolution", async () => {
      const sourceBytes = await fs.readFile(cumulative.source.file, "utf8"); assert.equal(sourceBytes, JSON.stringify(cumulative.source.saved)); assert.equal(JSON.parse(sourceBytes).status, "completed");
    });
    for (const [mode, status, allowed] of [["studio_pickup", "completed", false], ["711_cod", "shipped", false], ["studio_pickup", "ready_for_pickup", true]] as const) {
      await test(`cancellation remains ${mode}/${status}`, () => assert.equal(assessOrderCancellation({ orderMode: mode, status, inventoryTransaction: { state: "inventory_committed" } }).allowed, allowed));
    }
    await test("physical inventory and fulfillment files remain unchanged", async () => { assert.equal(await bytes(inventoryFile), inventoryBefore); assert.equal(await bytes(fulfillmentFile), fulfillmentBefore); });
    await test("protected repository runtime files remain byte-identical", async () => assert.deepEqual(await Promise.all(protectedFiles.map(bytes)), protectedBefore));
    console.log(`J.6F.1D pending reward resolution: ${passes}/${passes} PASS; isolated fixtures only.`);
  } finally {
    if (previousRoot === undefined) delete process.env.KD_DATA_DIR; else process.env.KD_DATA_DIR = previousRoot;
    const absolute = path.resolve(root); assert.ok(absolute.startsWith(path.resolve(os.tmpdir()) + path.sep)); await fs.rm(absolute, { recursive: true, force: true });
  }
}
