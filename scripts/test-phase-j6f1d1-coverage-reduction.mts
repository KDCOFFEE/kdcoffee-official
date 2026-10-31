import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as commerce from "../lib/membershipCommerce";
import type { MembershipCommerceState, ReferralReward, ReturnConsumptionReduction, EffectiveReturnConsumption } from "../lib/membershipCommerce";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } from "../lib/membershipBusinessRules";
import { prepareOrderCompletionWrite, type OrderCompletionSnapshot } from "../lib/orderCompletion";
import type { ReturnActor, ReturnCommand } from "../lib/orderReturns";
import { assessOrderCancellation } from "../lib/orderInventoryPolicy";
import { originalEconomicFingerprint } from "../lib/orderRewardBasis";

if (process.argv[2] === "--reconcile") {
  const result = await commerce.reconcileApprovedReturnConsumptionReductions({ stateFilePath: process.argv[3], now: new Date("2026-10-06T00:00:00Z") });
  process.stdout.write(JSON.stringify(result));
} else {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f1d1-coverage-"));
  const previousRoot = process.env.KD_DATA_DIR; process.env.KD_DATA_DIR = root;
  const rulesFile = path.join(root, "membership-commerce", "business-rules.json");
  const completedAt = "2026-09-26T02:00:00.000Z", originalAt = "2026-09-25T02:00:00.000Z";
  const actor: ReturnActor = { actorId: "commercial-actor", authority: "customer" };
  const reviewer: ReturnActor = { actorId: "reviewer", authority: "reviewer" };
  const authorizeOrder = (order: Readonly<Record<string, unknown>>, caller: ReturnActor) => {
    if (caller.authority === "reviewer" && caller.actorId === reviewer.actorId) return;
    if (order.actorId !== caller.actorId) throw new Error("Not authorized");
  };
  let count = 0, sequence = 7000, commandSequence = 0;
  const test = async (label: string, run: () => unknown | Promise<unknown>) => { await run(); console.log(`PASS ${++count} ${label}`); };
  const write = async (file: string, value: unknown) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value)); };
  const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES);
  rules.referral.payoutQualification.mode = "general";
  rules.referral.payoutQualification.qualificationBasis = "money";
  rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 200;
  rules.referral.payoutQualification.validConsumption = { includeCreditDiscount: false, includeShipping: false };
  rules.referral.payoutQualification.excessConsumptionMode = "carry";
  const byteRead = (file: string) => fs.readFile(file).then(data => data.toString("base64")).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error; return null;
  });
  const protectedFiles = ["data/fulfillment/state.json", "data/member-identity/registry.json", "data/membership-commerce/commerce-state.json",
    "data/membership-commerce/business-rules.json", "public/data/assets.json", "public/data/homepage.json", "public/data/pages.json", "public/data/website-data.json"];
  const protectedBefore = await Promise.all(protectedFiles.map(byteRead));
  function resolvedProjection(value: ReturnType<typeof commerce.projectEffectiveReturnConsumption>): EffectiveReturnConsumption {
    if (value.status !== "resolved") assert.fail(JSON.stringify(value)); return value;
  }
  async function reconcile(file: string) {
    const value = await commerce.reconcileApprovedReturnConsumptionReductions({ stateFilePath: file, now: new Date("2026-10-06T00:00:00Z") });
    if (value.status !== "resolved") assert.fail(JSON.stringify(value)); return value;
  }
  const read = commerce.readMembershipCommerceState;
  async function fixture(options: { twoRounds?: boolean; quantity?: number; unitPrice?: number; redemption?: number; reward?: boolean; consumption?: boolean; pv?: number; duplicateLines?: boolean } = {}) {
    const orderNumber = `KD20260925-${++sequence}`, file = path.join(root, "cases", String(sequence), "commerce-state.json");
    const quantity = options.quantity ?? 10, unitPrice = options.unitPrice ?? 100, credit = options.redemption ?? 0;
    const originalLine = { slug: "original-coffee", optionId: "original-sku", quantity, unitPrice, lineTotal: quantity * unitPrice,
      ...(options.pv === undefined ? {} : { basePV: options.pv, effectivePV: options.pv }) };
    const before = { orderNumber, createdAt: originalAt, actorId: actor.actorId, status: "ready_for_pickup", orderMode: "studio_pickup",
      member: { memberId: "commercial-member" }, items: options.duplicateLines
        ? Array.from({ length: quantity }, () => ({ ...originalLine, quantity: 1, lineTotal: unitPrice })) : [originalLine],
      subtotal: quantity * unitPrice, shipping: 0, totalBeforeCredit: quantity * unitPrice, total: quantity * unitPrice - credit,
      credit: { appliedAmount: credit, status: credit ? "reserved" : "not_used", rulesVersion: 2, reservationId: credit ? "original-redemption" : undefined },
      inventoryTransaction: { state: "inventory_committed" }, paymentDetails: { status: "paid", paidAt: completedAt } };
    const saved = await prepareOrderCompletionWrite(before, { ...before, status: "completed",
      fulfillmentEvents: [{ eventId: `ful-${sequence}`, state: "completed", occurredAt: completedAt }] });
    const orderFile = path.join(root, "orders", `${orderNumber}.json`); await write(orderFile, saved);
    const completion = saved.completion as OrderCompletionSnapshot;
    if (completion.returnLines?.status !== "resolved") assert.fail("Missing original lines");
    let state = await read(file);
    let eventId = "", roundA = "", roundB = "";
    if (options.consumption !== false) {
      const result = await commerce.recordValidConsumptionFromCompletedOrder({ memberId: "commercial-member", orderId: orderNumber,
        idempotencyKey: `original-consumption:${orderNumber}`, stateFilePath: file, rulesFilePath: rulesFile, now: new Date(completedAt) });
      assert.ok(result); eventId = result.event.eventId; roundA = result.qualificationRound?.roundId ?? ""; state = await read(file);
      if (options.twoRounds) {
        // Persisted later Round fixture, using the existing Round shape and same event.
        // No return code creates a Round; this is original historical input.
        const template = state.qualificationRounds[roundA]; assert.ok(template);
        roundB = `round-later-${sequence}`;
        state.qualificationRounds[roundB] = { ...structuredClone(template), roundId: roundB,
          qualifiedAt: "2026-09-27T02:00:00.000Z", createdAt: "2026-09-27T02:00:00.000Z", idempotencyKey: `original:${roundB}`,
          generalPath: { ...template.generalPath, threshold: 300 },
          consumptionAccounting: { basis: "money", availableAmountBefore: 800, consumedAmount: 300, remainingAmountAfter: 500,
            allocations: [{ validConsumptionEventId: eventId, amount: 300 }] } };
      }
    }
    const rewardId = `reward-${sequence}`;
    if (options.reward) {
      const reward: ReferralReward = { rewardId, sourceOrderNumber: orderNumber, sourceMemberId: "commercial-member", beneficiaryMemberId: "commercial-member",
        referralLevel: 0, rewardType: "self_purchase", calculationMode: "paid_amount", paidAmountBasis: quantity * unitPrice - credit,
        basePV: 0, effectivePV: 0, discountRatio: 1, rewardRate: 5, rewardPV: 0, pvRewardMoneyValue: 1,
        calculatedCreditAmount: 50, projectedCreditAmount: 50, ruleVersion: 2, ancestrySnapshot: [],
        qualificationAuthority: "qualification_coverage", sourceOrderFinalState: "completed", baseWaitingDaysSnapshot: 7, returnProtectionDaysSnapshot: 7,
        totalWaitingDaysSnapshot: 14, successfulPickupBusinessDate: "2026-09-26", releaseEligibleBusinessDate: "2026-10-10",
        createdAt: completedAt, eligibleAt: completedAt, scheduledReleaseAt: "2026-10-10T00:00:00+08:00", releasedAt: null,
        status: "scheduled", rewardCreditEntryId: null, reversalCreditEntryId: null, reversalPolicySnapshot: "cancel-pending-and-reverse-released", idempotencyKey: `original:${rewardId}` };
      state.referralRewards[rewardId] = reward;
    }
    await write(file, state);
    if (options.reward) {
      await commerce.reconcileReferralRewardCoverage({ referralRewardId: rewardId, stateFilePath: file, now: new Date(completedAt) });
      await commerce.processReferralRewardMaturations({ stateFilePath: file, rulesFilePath: rulesFile, now: new Date("2026-10-20T00:00:00Z") });
    }
    return { orderNumber, orderFile, file, saved, ref: completion.returnLines.lines[0].returnLineRef, eventId, roundA, roundB, rewardId };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function command(f: Fixture, value: ReturnCommand, caller = actor, key = `operation-${++commandSequence}`) {
    const result = await commerce.executeOrderReturnCommand({ orderNumber: f.orderNumber, actor: caller, command: value,
      reason: "Original source return evidence", idempotencyKey: key, authorizeOrder, stateFilePath: f.file,
      now: new Date(value.type === "RETURN_REQUESTED" ? "2026-10-02T02:00:00Z" : "2026-10-05T02:00:00Z") });
    if (result.status !== "applied") assert.fail(JSON.stringify(result)); return result;
  }
  const request = (f: Fixture, quantity: number, key?: string) => command(f, { type: "RETURN_REQUESTED",
    lines: [{ returnLineRef: f.ref, quantity }], conditionAcknowledgement: { itemsComplete: true, unopenedUnusedWhereApplicable: true } }, actor, key);
  async function approve(f: Fixture, quantity: number) {
    const requested = await request(f, quantity);
    return command(f, { type: "RETURN_APPROVED", returnRequestId: requested.event.returnRequestId }, reviewer);
  }
  const projection = async (f: Fixture) => resolvedProjection(commerce.projectEffectiveReturnConsumption(await read(f.file), f.eventId));
  const originalBusiness = (state: MembershipCommerceState) => ({ consumptions: state.validConsumptionEvents, rounds: state.qualificationRounds,
    coverage: state.referralRewardCoverages, maturation: state.referralRewardMaturations, rewards: state.referralRewards,
    retail: state.retailPromotionRewards, credit: state.creditEntries, reservation: state.creditReservations, notifications: state.notifications });
  try {
    const inventoryFile = path.join(root, "store", "website-data.json"), fulfillmentFile = path.join(root, "fulfillment", "state.json");
    await write(inventoryFile, { stock: 31, receipts: ["original-committed"] });
    await write(fulfillmentFile, { revision: 1, records: {} });
    const inventoryBytes = await fs.readFile(inventoryFile, "utf8"), fulfillmentBytes = await fs.readFile(fulfillmentFile, "utf8");
    await saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-08-01T00:00:00Z") }, rulesFile);
    for (const [quantity, expectedRound, expectedCarry, expectedConsumption] of [[5, 200, 300, 500], [9, 100, 0, 100], [10, 0, 0, 0]]) {
      const f = await fixture(); await approve(f, quantity); await reconcile(f.file); const value = await projection(f);
      await test(`single Round: reduction ${quantity * 100} consumes carry first`, () => {
        assert.equal(value.originalConsumptionAmount, 1000); assert.equal(value.originalAllocatedAmount, 200); assert.equal(value.originalUnallocatedCarry, 800);
        assert.equal(value.effectiveAllocationByRound[0].effectiveAllocation, expectedRound); assert.equal(value.effectiveCarry, expectedCarry);
        assert.equal(value.effectiveConsumptionAmount, expectedConsumption);
      });
    }
    for (const [quantity, expectedA, expectedB, carry] of [[3, 200, 300, 200], [6, 200, 200, 0], [8, 200, 0, 0], [9, 100, 0, 0], [10, 0, 0, 0]]) {
      const f = await fixture({ twoRounds: true }); await approve(f, quantity); await reconcile(f.file); const value = await projection(f);
      await test(`two Rounds: reduction ${quantity * 100} unwinds latest first`, () => {
        assert.deepEqual(value.effectiveAllocationByRound.map(item => item.roundId), [f.roundA, f.roundB]);
        assert.deepEqual(value.effectiveAllocationByRound.map(item => item.effectiveAllocation), [expectedA, expectedB]); assert.equal(value.effectiveCarry, carry);
        assert.equal(value.effectiveCarry + value.effectiveAllocationByRound.reduce((sum, item) => sum + item.effectiveAllocation, 0), value.effectiveConsumptionAmount);
      });
    }
    const main = await fixture({ reward: true, twoRounds: true });
    const first = await approve(main, 3), businessBefore = originalBusiness(await read(main.file));
    const originalOrderBytes = await fs.readFile(main.orderFile, "utf8");
    const originalHolds = commerce.readReturnRewardHoldDependencies(await read(main.file));
    assert.ok(Object.keys(businessBefore.coverage).length); assert.ok(Object.keys(businessBefore.maturation).length);
    const result = await reconcile(main.file);
    await test("first approved return appends one reduction with original event/source identity", () => {
      assert.equal(result.createdCount, 1); const record = result.reductions[0];
      assert.equal(record.approvedReturnEventId, first.event.eventId); assert.equal(record.returnRequestId, first.event.returnRequestId);
      assert.equal(record.consumptionEventId, main.eventId); assert.equal(record.sourceOrderId, main.orderNumber); assert.equal(record.unit, "NTD");
    });
    await test("original Consumption remains unchanged", async () => assert.deepEqual((await read(main.file)).validConsumptionEvents, businessBefore.consumptions));
    await test("original Round and allocation remain unchanged", async () => assert.deepEqual((await read(main.file)).qualificationRounds, businessBefore.rounds));
    await test("original Coverage remains unchanged", async () => assert.deepEqual((await read(main.file)).referralRewardCoverages, businessBefore.coverage));
    await test("original Maturation remains unchanged", async () => assert.deepEqual((await read(main.file)).referralRewardMaturations, businessBefore.maturation));
    await test("no reward entitlement, release, credit or reservation mutation", async () => assert.deepEqual(originalBusiness(await read(main.file)), businessBefore));
    await test("D1 does not resolve existing HOLD or mutate HOLD-created evidence", async () => {
      const state = await read(main.file); assert.deepEqual(commerce.readReturnRewardHoldDependencies(state), originalHolds);
      assert.equal(commerce.projectReturnRewardHolds(state, { program: "referral", id: main.rewardId }).blocked, true);
    });
    await test("same approval retry appends nothing and preserves original reduction", async () => {
      const again = await reconcile(main.file); assert.equal(again.createdCount, 0); assert.deepEqual(again.reductions, result.reductions);
    });
    const immutableRecord = result.reductions[0];
    await approve(main, 4); await reconcile(main.file);
    await test("approved A 300 + B 400 accumulates to 700", async () => {
      const value = await projection(main); assert.equal(value.cumulativeApprovedReturnReduction, 700);
      assert.deepEqual(value.effectiveAllocationByRound.map(item => item.effectiveAllocation), [200, 100]); assert.equal(value.effectiveCarry, 0);
    });
    await approve(main, 2); const final = await reconcile(main.file);
    await test("third approval adds only new 200, cumulative 900", async () => {
      assert.deepEqual(final.reductions.map(item => item.incrementalEconomicReduction), [300, 400, 200]);
      const value = await projection(main); assert.deepEqual(value.effectiveAllocationByRound.map(item => item.effectiveAllocation), [100, 0]);
    });
    await test("old reduction evidence remains byte-for-byte equivalent after later approvals", () => assert.deepEqual(final.reductions[0], immutableRecord));
    await test("restart/JSON roundtrip preserves effective projection", async () => {
      const state = await read(main.file); assert.deepEqual(commerce.projectEffectiveReturnConsumption(JSON.parse(JSON.stringify(state)), main.eventId), await projection(main));
      const child = spawnSync(process.execPath, ["--experimental-strip-types", "--import", "./scripts/return-workflow-test-bootstrap.mjs", fileURLToPath(import.meta.url), "--reconcile", main.file], { encoding: "utf8", windowsHide: true });
      assert.equal(child.status, 0, child.stderr); const replay = JSON.parse(child.stdout); assert.equal(replay.createdCount, 0); assert.deepEqual(replay.reductions, final.reductions);
    });
    await test("original order and qualification times are preserved; no new Round or maturity restart", async () => {
      const state = await read(main.file); assert.equal(final.reductions[0].sourceOrderCreatedAt, originalAt);
      assert.equal(final.reductions[0].occurredAt, "2026-10-05T02:00:00.000Z");
      assert.deepEqual(state.qualificationRounds, businessBefore.rounds); assert.deepEqual(state.referralRewardMaturations, businessBefore.maturation);
      assert.equal(await fs.readFile(main.orderFile, "utf8"), originalOrderBytes);
    });
    await test("future member reason joins reduction -> request -> HOLD -> original pending reward", () => {
      assert.equal(immutableRecord.reasonCode, "partial_return_approved");
      const hold = originalHolds.find(item => item.returnRequestId === immutableRecord.returnRequestId)!;
      assert.equal(hold.reward.id, main.rewardId); assert.equal(businessBefore.rewards[hold.reward.id].calculatedCreditAmount, 50);
      assert.ok(immutableRecord.recordedAt); assert.ok(immutableRecord.d0AllocationFingerprint); assert.ok(immutableRecord.d0AuthorityFingerprint);
      assert.equal(immutableRecord.rewardSafetyWaitContractVersion, commerce.RETURN_REWARD_SAFETY_WAIT_CONTRACT);
    });
    for (const type of ["pending", "RETURN_PROCESSING_LOCKED", "RETURN_WITHDRAWN", "RETURN_REJECTED"] as const) {
      const f = await fixture(); const pending = await request(f, 5);
      if (type !== "pending") await command(f, { type, returnRequestId: pending.event.returnRequestId }, type === "RETURN_WITHDRAWN" ? actor : reviewer);
      const value = await reconcile(f.file);
      await test(`${type} contributes zero finalized reduction`, async () => {
        assert.equal(value.createdCount, 0); const derived = await projection(f); assert.equal(derived.cumulativeApprovedReturnReduction, 0);
        assert.equal(derived.effectiveCarry, 800); assert.equal(derived.effectiveAllocationByRound[0].effectiveAllocation, 200);
      });
    }
    const rounding = await fixture({ quantity: 3, unitPrice: 100, redemption: 200 });
    // Original valid consumption is 100 and therefore below the 200 threshold: all carry.
    for (let index = 0; index < 3; index++) { await approve(rounding, 1); await reconcile(rounding.file); }
    await test("D0 cumulative quantity contributes 34/33/33 rather than independent rounding", async () => {
      const records = commerce.readReturnConsumptionReductions(await read(rounding.file));
      assert.deepEqual(records.map(item => item.incrementalEconomicReduction), [34, 33, 33]);
      assert.deepEqual(records.map(item => item.cumulativeApprovedReturnReduction), [34, 67, 100]);
      assert.equal((await projection(rounding)).effectiveConsumptionAmount, 0); assert.equal(records[2].reasonCode, "full_return_approved");
    });
    await test("full cumulative consumption reduction stays zero on every retry", async () => {
      assert.equal((await reconcile(rounding.file)).createdCount, 0);
      assert.equal((await projection(rounding)).cumulativeApprovedReturnReduction, 100);
      assert.equal((await projection(rounding)).effectiveConsumptionAmount, 0);
    });
    const redemption = await fixture({ quantity: 2, unitPrice: 100, redemption: 100 }); await approve(redemption, 1);
    await test("original actual redemption 100 is used; maximum possible 140 is never substituted", async () => {
      const value = await reconcile(redemption.file); assert.equal(value.reductions[0].incrementalEconomicReduction, 50);
      assert.equal(value.reductions[0].originalConsumptionAmount, 100);
    });
    const duplicate = await fixture({ quantity: 2, unitPrice: 100, redemption: 100, duplicateLines: true });
    const duplicateLines = (duplicate.saved.completion as OrderCompletionSnapshot).returnLines;
    assert.equal(duplicateLines?.status, "resolved"); if (duplicateLines?.status !== "resolved") assert.fail("Missing duplicate lines");
    for (const line of duplicateLines.lines) {
      const requested = await command(duplicate, { type: "RETURN_REQUESTED", lines: [{ returnLineRef: line.returnLineRef, quantity: 1 }],
        conditionAcknowledgement: { itemsComplete: true, unopenedUnusedWhereApplicable: true } });
      await command(duplicate, { type: "RETURN_APPROVED", returnRequestId: requested.event.returnRequestId }, reviewer); await reconcile(duplicate.file);
    }
    await test("identical SKU lines retain independent D0 quantities and consumption contributions", async () => {
      const records = commerce.readReturnConsumptionReductions(await read(duplicate.file));
      assert.deepEqual(records.map(item => item.incrementalEconomicReduction), [50, 50]);
      assert.equal(new Set(records.map(item => item.lines[0].returnLineRef)).size, 2);
      assert.deepEqual(records.map(item => item.lines[0].previousApprovedQuantity), [0, 0]);
      assert.equal((await projection(duplicate)).effectiveConsumptionAmount, 0);
    });
    const changed = structuredClone(rules); changed.credit.redemption = { mode: "maximum-percentage", percent: 60 }; changed.referral.selfPurchaseRewardRate = 1;
    changed.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 9999;
    await saveMembershipBusinessRules({ expectedRevision: 1, rules: changed, now: new Date("2026-10-04T00:00:00Z") }, rulesFile);
    const frozen = await fixture({ quantity: 2, unitPrice: 100, redemption: 100 }); await approve(frozen, 1);
    await write(frozen.orderFile, { ...frozen.saved, items: [{ slug: "current-price", optionId: "current", quantity: 1, unitPrice: 99999 }],
      currentPricingPolicy: { price: 99999 }, currentRewardRate: 99, maximumAllowedRedemption: 140 });
    await test("current catalog/price/policy/rate/Admin cap and thresholds cannot change D0 evidence", async () => {
      const value = await reconcile(frozen.file); assert.equal(value.reductions[0].incrementalEconomicReduction, 50);
      assert.equal(value.reductions[0].sourceOrderCreatedAt, originalAt);
    });
    const orderOnly = await fixture({ consumption: false }); await approve(orderOnly, 1);
    await test("no-consumption/no-reward approved return is a valid no-op", async () => { const value = await reconcile(orderOnly.file); assert.equal(value.createdCount, 0); assert.deepEqual(value.projections, []); });
    await test("PV and reward are optional", async () => {
      const state = await read(redemption.file); assert.deepEqual(state.referralRewards, {}); assert.equal((await projection(redemption)).effectiveConsumptionAmount, 50);
      assert.equal(Object.hasOwn((redemption.saved.items as object[])[0], "basePV"), false);
    });
    const other = await fixture(); const otherBefore = await projection(other);
    await test("another consumption event and its carry/allocations are not reallocated", async () => { await reconcile(main.file); assert.deepEqual(await projection(other), otherBefore); });
    const tie = await fixture({ twoRounds: true }); await approve(tie, 6);
    const tieState = await read(tie.file), early = tieState.qualificationRounds[tie.roundA], later = tieState.qualificationRounds[tie.roundB];
    const firstRoundId = "same-time-a", lastRoundId = "same-time-z";
    delete tieState.qualificationRounds[tie.roundA]; delete tieState.qualificationRounds[tie.roundB];
    tieState.qualificationRounds[lastRoundId] = { ...later, roundId: lastRoundId, createdAt: completedAt, qualifiedAt: completedAt };
    tieState.qualificationRounds[firstRoundId] = { ...early, roundId: firstRoundId };
    await write(tie.file, tieState); await reconcile(tie.file);
    await test("equal persisted timestamps use stable Round identity tie-break", async () => {
      const value = await projection(tie); assert.deepEqual(value.effectiveAllocationByRound.map(item => item.roundId), [firstRoundId, lastRoundId]);
      assert.deepEqual(value.effectiveAllocationByRound.map(item => item.effectiveAllocation), [200, 200]);
    });
    await test("reordering raw Round dictionary insertion order cannot change chronology", async () => {
      const state = await read(tie.file), expected = commerce.projectEffectiveReturnConsumption(state, tie.eventId);
      state.qualificationRounds = Object.fromEntries(Object.entries(state.qualificationRounds).reverse());
      assert.deepEqual(commerce.projectEffectiveReturnConsumption(state, tie.eventId), expected);
    });
    const shared = await fixture(); const sharedState = await read(shared.file), originalConsumption = sharedState.validConsumptionEvents[shared.eventId];
    const unrelatedId = "other-original-consumption";
    sharedState.validConsumptionEvents[unrelatedId] = { ...structuredClone(originalConsumption), eventId: unrelatedId,
      sourceOrderId: "KD20260925-9999", sourceReference: "completed-order:KD20260925-9999", merchandiseSubtotal: 400, validConsumptionAmount: 400 };
    sharedState.qualificationRounds[shared.roundA].consumptionAccounting.allocations.push({ validConsumptionEventId: unrelatedId, amount: 400 });
    sharedState.qualificationRounds[shared.roundA].consumptionAccounting.consumedAmount += 400;
    sharedState.qualificationRounds[shared.roundA].consumptionAccounting.availableAmountBefore += 400;
    await write(shared.file, sharedState); await approve(shared, 9); await reconcile(shared.file);
    await test("same Round retains another event's original allocation without cross-event borrowing", async () => {
      const state = await read(shared.file), value = await projection(shared);
      assert.equal(value.effectiveAllocationByRound[0].effectiveAllocation, 100);
      assert.deepEqual(state.qualificationRounds[shared.roundA].consumptionAccounting.allocations,
        sharedState.qualificationRounds[shared.roundA].consumptionAccounting.allocations);
      const other = resolvedProjection(commerce.projectEffectiveReturnConsumption(state, unrelatedId));
      assert.equal(other.effectiveConsumptionAmount, 400); assert.equal(other.effectiveAllocationByRound[0].effectiveAllocation, 400);
      assert.equal(other.cumulativeApprovedReturnReduction, 0);
    });
    const pv = await fixture({ pv: 5 }); const pvState = await read(pv.file);
    const pvRoundId = "original-pv-round", moneyRound = pvState.qualificationRounds[pv.roundA];
    pvState.qualificationRounds[pvRoundId] = { ...structuredClone(moneyRound), roundId: pvRoundId, qualificationBasis: "pv",
      createdAt: "2026-09-27T02:00:00.000Z", qualifiedAt: "2026-09-27T02:00:00.000Z",
      consumptionAccounting: { basis: "pv", availableAmountBefore: 50, consumedAmount: 20, remainingAmountAfter: 30,
        allocations: [{ validConsumptionEventId: pv.eventId, amount: 20 }] } };
    await write(pv.file, pvState); await approve(pv, 9); await reconcile(pv.file);
    await test("NTD projection keeps preserved PV allocations in a separate unit", async () => {
      const state = await read(pv.file), value = await projection(pv);
      assert.equal(value.unit, "NTD"); assert.equal(value.effectiveConsumptionAmount, 100);
      assert.deepEqual(value.separatePVAllocationRoundIds, [pvRoundId]); assert.equal(value.effectiveAllocationByRound.length, 1);
      assert.deepEqual(state.qualificationRounds[pvRoundId], pvState.qualificationRounds[pvRoundId]);
      assert.equal(state.validConsumptionEvents[pv.eventId].validConsumptionPV, 50);
    });
    const zero = await fixture({ redemption: 1000 }); await approve(zero, 1); await reconcile(zero.file);
    await approve(zero, 1); const zeroResult = await reconcile(zero.file);
    await test("distinct approved zero-value quantities retain distinct stable evidence", () => {
      assert.equal(zeroResult.reductions.length, 2);
      assert.deepEqual(zeroResult.reductions.map(item => item.incrementalEconomicReduction), [0, 0]);
      assert.equal(new Set(zeroResult.reductions.map(item => item.reductionId)).size, 2);
    });
    await test("zero-value reduction audit chronology cannot be reordered", async () => {
      const state = await read(zero.file), indices = state.audit.flatMap((item, index) => item.action === "RETURN_CONSUMPTION_REDUCTION_RECORDED" ? [index] : []);
      [state.audit[indices[0]], state.audit[indices[1]]] = [state.audit[indices[1]], state.audit[indices[0]]];
      assert.throws(() => commerce.readReturnConsumptionReductions(state));
    });
    await test("missing earlier zero-value approval cannot hide behind an unchanged monetary total", async () => {
      const state = await read(zero.file), first = zeroResult.reductions[0];
      state.audit = state.audit.filter(item => item.after.reductionId !== first.reductionId);
      delete state.idempotency[first.idempotencyKey]; assert.throws(() => commerce.readReturnConsumptionReductions(state));
    });
    const lateRound = await fixture(); await approve(lateRound, 6); const firstLateResult = await reconcile(lateRound.file);
    const lateState = await read(lateRound.file), lateTemplate = lateState.qualificationRounds[lateRound.roundA];
    lateState.qualificationRounds["later-original-round"] = { ...structuredClone(lateTemplate), roundId: "later-original-round",
      createdAt: "2026-09-28T02:00:00.000Z", qualifiedAt: "2026-09-28T02:00:00.000Z",
      consumptionAccounting: { basis: "money", availableAmountBefore: 800, consumedAmount: 300, remainingAmountAfter: 500,
        allocations: [{ validConsumptionEventId: lateRound.eventId, amount: 300 }] } };
    await write(lateRound.file, lateState);
    await test("additional persisted Round evidence derives latest-first result without rewriting old reduction", async () => {
      const value = await reconcile(lateRound.file); assert.equal(value.createdCount, 0); assert.deepEqual(value.reductions, firstLateResult.reductions);
      assert.deepEqual((await projection(lateRound)).effectiveAllocationByRound.map(item => item.effectiveAllocation), [200, 200]);
    });
    const corrupt = await read(main.file);
    await test("tampered audit evidence fails closed", () => {
      const state = structuredClone(corrupt), audit = state.audit.find(item => item.action === "RETURN_CONSUMPTION_REDUCTION_RECORDED")!;
      const record = JSON.parse(String(audit.after.evidence)); record.incrementalEconomicReduction++;
      audit.after.evidence = JSON.stringify(record); assert.throws(() => commerce.readReturnConsumptionReductions(state));
    });
    await test("even re-fingerprinted non-D0 monetary evidence is rejected", () => {
      const state = structuredClone(corrupt), audit = state.audit.find(item => item.action === "RETURN_CONSUMPTION_REDUCTION_RECORDED")!;
      const record: ReturnConsumptionReduction = JSON.parse(String(audit.after.evidence));
      record.lines[0].originalLineConsumptionContribution = 9999;
      const { evidenceFingerprint: _old, ...payload } = record; void _old; record.evidenceFingerprint = originalEconomicFingerprint(payload);
      audit.after.evidence = JSON.stringify(record); assert.throws(() => commerce.readReturnConsumptionReductions(state));
    });
    await test("duplicate reduction identity is rejected", () => {
      const state = structuredClone(corrupt), audit = state.audit.find(item => item.action === "RETURN_CONSUMPTION_REDUCTION_RECORDED")!;
      state.audit.push(structuredClone(audit)); assert.throws(() => commerce.readReturnConsumptionReductions(state));
    });
    await test("missing reduction with retained idempotency backlink is rejected", () => {
      const state = structuredClone(corrupt); state.audit = state.audit.filter(item => item.action !== "RETURN_CONSUMPTION_REDUCTION_RECORDED");
      assert.throws(() => commerce.readReturnConsumptionReductions(state));
    });
    await test("D1 cannot hide a rewrite of original allocation history", () => {
      const state = structuredClone(corrupt); state.qualificationRounds[main.roundA].consumptionAccounting.allocations[0].amount++;
      assert.throws(() => commerce.readReturnConsumptionReductions(state));
    });
    const chronology = await fixture(); await approve(chronology, 9); const missingTime = await read(chronology.file);
    missingTime.qualificationRounds[chronology.roundA].createdAt = "missing"; await write(chronology.file, missingTime);
    await test("unproven original chronology returns explicit manual review without appending", async () => {
      const value = await commerce.reconcileApprovedReturnConsumptionReductions({ stateFilePath: chronology.file });
      assert.equal(value.status, "manual_review_required");
      if (value.status === "manual_review_required") assert.equal(value.reason, "unproven_allocation_chronology");
      assert.deepEqual(commerce.readReturnConsumptionReductions(await read(chronology.file)), []);
    });
    const over = await fixture(); await approve(over, 1); const overState = await read(over.file);
    overState.qualificationRounds[over.roundA].consumptionAccounting.allocations[0].amount = 1001; await write(over.file, overState);
    await test("overallocated original history cannot produce negative carry", async () => {
      const value = await commerce.reconcileApprovedReturnConsumptionReductions({ stateFilePath: over.file }); assert.equal(value.status, "manual_review_required");
    });
    const insufficient = await fixture(); await approve(insufficient, 1); const insufficientState = await read(insufficient.file);
    insufficientState.validConsumptionEvents[insufficient.eventId].validConsumptionAmount = 999;
    await write(insufficient.file, insufficientState);
    await test("insufficient D0 consumption evidence remains explicit manual review without guessing", async () => {
      const value = await commerce.reconcileApprovedReturnConsumptionReductions({ stateFilePath: insufficient.file });
      assert.equal(value.status, "manual_review_required");
      assert.deepEqual(commerce.readReturnConsumptionReductions(await read(insufficient.file)), []);
    });
    const concurrency = await fixture(); await approve(concurrency, 5);
    const worker = () => new Promise<{ status: number | null; stdout: string; stderr: string }>(resolve => {
      const child = spawn(process.execPath, ["--experimental-strip-types", "--import", "./scripts/return-workflow-test-bootstrap.mjs", fileURLToPath(import.meta.url), "--reconcile", concurrency.file], { windowsHide: true });
      let stdout = "", stderr = ""; child.stdout.on("data", chunk => stdout += chunk); child.stderr.on("data", chunk => stderr += chunk);
      child.on("close", status => resolve({ status, stdout, stderr }));
    });
    const workers = await Promise.all([worker(), worker()]);
    await test("independent concurrent reconciliation processes append exactly once", async () => {
      for (const child of workers) assert.equal(child.status, 0, child.stderr);
      assert.deepEqual(workers.map(child => JSON.parse(child.stdout).createdCount).sort(), [0, 1]);
      assert.equal(commerce.readReturnConsumptionReductions(await read(concurrency.file)).length, 1);
    });
    await test("all effective values remain nonnegative and conserve original minus approved", async () => {
      for (const f of [main, tie, concurrency, redemption, rounding]) {
        const value = await projection(f); assert.ok(value.effectiveConsumptionAmount >= 0); assert.ok(value.effectiveCarry >= 0);
        assert.ok(value.effectiveAllocationByRound.every(item => item.effectiveAllocation >= 0));
        assert.equal(value.originalConsumptionAmount - value.cumulativeApprovedReturnReduction, value.effectiveConsumptionAmount);
        assert.equal(value.effectiveCarry + value.effectiveAllocationByRound.reduce((sum, item) => sum + item.effectiveAllocation, 0), value.effectiveConsumptionAmount);
      }
    });
    await test("D1 evidence remains readable after existing membership maintenance archives its live sources", async () => {
      const state = await read(main.file), records = commerce.readReturnConsumptionReductions(state); state.validConsumptionEvents = {}; state.qualificationRounds = {};
      assert.deepEqual(commerce.readReturnConsumptionReductions(state), records);
      assert.equal(commerce.projectEffectiveReturnConsumption(state, main.eventId).status, "manual_review_required");
    });
    await test("D1 preserves existing whole-order defensive reversal compatibility", async () => {
      const before = commerce.readReturnConsumptionReductions(await read(main.file));
      await commerce.cancelOrReverseReferralRewards({ orderId: main.orderNumber, outcome: "returned", idempotencyKey: "defensive-compatibility", stateFilePath: main.file, rulesFilePath: rulesFile, now: new Date("2026-10-20T00:00:00Z") });
      assert.deepEqual(commerce.readReturnConsumptionReductions(await read(main.file)), before);
    });
    for (const [mode, status, allowed] of [["studio_pickup", "completed", false], ["711_cod", "shipped", false], ["studio_pickup", "ready_for_pickup", true]] as const) {
      await test(`cancellation remains ${mode}/${status}`, () => {
        const value = { orderMode: mode, status, inventoryTransaction: { state: "inventory_committed" } };
        assert.equal(assessOrderCancellation(value).allowed, allowed);
      });
    }
    await test("physical inventory fixture remains unchanged", async () => assert.equal(await fs.readFile(inventoryFile, "utf8"), inventoryBytes));
    await test("physical fulfillment fixture remains unchanged", async () => assert.equal(await fs.readFile(fulfillmentFile, "utf8"), fulfillmentBytes));
    await test("protected runtime files remain byte-identical", async () => assert.deepEqual(await Promise.all(protectedFiles.map(byteRead)), protectedBefore));
    console.log(`J.6F.1D1 Coverage reduction: ${count}/${count} PASS; isolated fixtures only.`);
  } finally {
    if (previousRoot === undefined) delete process.env.KD_DATA_DIR; else process.env.KD_DATA_DIR = previousRoot;
    const absolute = path.resolve(root); assert.ok(absolute.startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(absolute, { recursive: true, force: true });
  }
}
