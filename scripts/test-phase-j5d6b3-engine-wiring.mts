import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j5d6b3-engine-"));
process.env.KD_DATA_DIR = root;

const rulesApi = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");

type Context = { stateFilePath: string; rulesFilePath: string };
type Rules = typeof rulesApi.DEFAULT_MEMBERSHIP_RULES;
type CommerceState = Awaited<ReturnType<typeof commerce.readMembershipCommerceState>>;

let pass = 0;

function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, "0")} ${message}`);
}

function configureDynamic(
  rules: Rules,
  input: {
    thresholdBasis?: "paid_amount" | "pv";
    accumulationBasis?: "single_order" | "rolling_period";
    calculationMethod?: "whole_order" | "marginal";
  } = {},
) {
  rules.referral.programEnabled = true;
  rules.referral.selfPurchaseEligibilityMode = "first_completed_order";
  rules.referral.selfPurchaseRequiresReferralQualification = false;
  rules.referral.referralRewardCalculationMode = "paid_amount";
  rules.referral.referralRewardBaseWaitingDays = 7;
  rules.referral.referralRewardReturnProtectionDays = 3;
  rules.referral.selfPurchaseRewardTiers = {
    enabled: true,
    thresholdBasis: input.thresholdBasis ?? "paid_amount",
    accumulationBasis: input.accumulationBasis ?? "single_order",
    calculationMethod: input.calculationMethod ?? "whole_order",
    rollingWindowDays: 30,
    tiers: [
      { threshold: 0, rewardRate: 5 },
      { threshold: 600, rewardRate: 7 },
      { threshold: 1000, rewardRate: 10 },
    ],
  };
  return rules;
}

async function context(name: string, configure?: (rules: Rules) => void): Promise<Context> {
  const directory = path.join(root, name);
  await fs.mkdir(directory, { recursive: true });
  const stateFilePath = path.join(directory, "commerce-state.json");
  const rulesFilePath = path.join(directory, "business-rules.json");
  const rules = structuredClone(rulesApi.DEFAULT_MEMBERSHIP_RULES);
  rules.referral.programEnabled = true;
  rules.referral.selfPurchaseEligibilityMode = "first_completed_order";
  rules.referral.selfPurchaseRequiresReferralQualification = false;
  rules.referral.referralRewardBaseWaitingDays = 7;
  rules.referral.referralRewardReturnProtectionDays = 3;
  configure?.(rules);
  await rulesApi.saveMembershipBusinessRules(
    { expectedRevision: 0, rules, now: new Date("2026-09-01T00:00:00.000Z") },
    rulesFilePath,
  );
  return { stateFilePath, rulesFilePath };
}

function evidence(
  eventId: string,
  memberId: string,
  sourceOrderId: string,
  finalizedAt: string,
  paidAmount: number,
  pv: number,
  validConsumptionAmount = paidAmount,
) {
  return {
    eventId,
    memberId,
    sourceOrderId,
    sourceReference: `completed-order:${sourceOrderId}`,
    finalizedAt,
    createdAt: finalizedAt,
    merchandiseSubtotal: paidAmount + 100,
    appliedCreditAmount: 100,
    shippingAmount: 60,
    validConsumptionAmount,
    validConsumptionPV: pv,
    includeCreditDiscount: true,
    includeShipping: false,
    activeSubscriptionAtCompletion: false,
    rulesVersion: 1,
    qualificationRulesSnapshot: structuredClone(
      rulesApi.DEFAULT_MEMBERSHIP_RULES.referral.payoutQualification,
    ),
    idempotencyKey: `evidence:${eventId}`,
  };
}

async function mutateState(ctx: Context, mutate: (state: CommerceState) => void) {
  const state = await commerce.readMembershipCommerceState(ctx.stateFilePath);
  mutate(state);
  await fs.writeFile(ctx.stateFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function seed(ctx: Context, ...events: Array<ReturnType<typeof evidence>>) {
  await mutateState(ctx, (state) => {
    for (const item of events) state.validConsumptionEvents[item.eventId] = item;
  });
}

async function createReward(
  ctx: Context,
  input: { memberId: string; orderId: string; paid: number; pv: number; at: string },
) {
  const rewards = await commerce.createSelfPurchaseRewardFromFulfillment({
    sourceMemberId: input.memberId,
    orderId: input.orderId,
    paidAmountBasis: input.paid,
    basePV: input.pv,
    effectivePV: input.pv,
    discountRatio: 1,
    idempotencyKey: `reward:${input.orderId}`,
    now: new Date(input.at),
    stateFilePath: ctx.stateFilePath,
    rulesFilePath: ctx.rulesFilePath,
  });
  assert.equal(rewards.length, 1, `expected one reward for ${input.orderId}`);
  return rewards[0];
}

try {
  console.log("\n=== LEGACY AND SINGLE-ORDER WIRING ===");
  const legacy = await context("legacy", (rules) => {
    rules.referral.selfPurchaseRewardRate = 5;
    rules.referral.selfPurchaseRewardTiers.enabled = false;
  });
  const legacyReward = await createReward(legacy, {
    memberId: "member-legacy", orderId: "legacy-current", paid: 1000, pv: 5,
    at: "2026-09-10T00:00:00.000Z",
  });
  check(
    legacyReward.calculatedCreditAmount === 50 && !legacyReward.selfPurchaseTierSnapshot,
    "01 dynamic tiers disabled preserves legacy selfPurchaseRewardRate result",
  );

  const singlePaid = await context("single-paid", (rules) => configureDynamic(rules));
  await seed(singlePaid, evidence("sp-current", "member-sp", "sp-order", "2026-09-10T00:00:00.000Z", 800, 10));
  const singlePaidReward = await createReward(singlePaid, {
    memberId: "member-sp", orderId: "sp-order", paid: 800, pv: 10,
    at: "2026-09-10T00:00:00.000Z",
  });
  check(
    singlePaidReward.rewardRate === 7 && singlePaidReward.calculatedCreditAmount === 56,
    "02 single_order + paid_amount chooses the attained tier",
  );

  const singlePv = await context("single-pv", (rules) => {
    configureDynamic(rules, { thresholdBasis: "pv" });
    rules.referral.payoutQualification.qualificationBasis = "money";
    rules.referral.selfPurchaseRewardTiers.tiers = [
      { threshold: 0, rewardRate: 5 },
      { threshold: 100, rewardRate: 10 },
      { threshold: 600, rewardRate: 20 },
    ];
  });
  await seed(singlePv, evidence("pv-current", "member-pv", "pv-order", "2026-09-10T00:00:00.000Z", 800, 120));
  const singlePvReward = await createReward(singlePv, {
    memberId: "member-pv", orderId: "pv-order", paid: 800, pv: 120,
    at: "2026-09-10T00:00:00.000Z",
  });
  check(
    singlePvReward.selfPurchaseTierSnapshot?.initialResult.attainedAmount === 120
      && singlePvReward.rewardRate === 10,
    "03 single_order + pv uses effective PV independently of referral qualification basis",
  );

  console.log("\n=== ROLLING EVIDENCE AND FROZEN SNAPSHOT ===");
  const rollingPaid = await context("rolling-paid", (rules) => configureDynamic(rules, { accumulationBasis: "rolling_period" }));
  await seed(
    rollingPaid,
    evidence("rp-outside", "member-a", "outside-a", "2026-08-01T00:00:00.000Z", 9000, 9000),
    evidence("rp-prior-refund", "member-a", "prior-refund", "2026-09-02T00:00:00.000Z", 300, 30, 9000),
    evidence("rp-prior-return", "member-a", "prior-return", "2026-09-05T00:00:00.000Z", 400, 40, 9000),
    evidence("rp-current", "member-a", "rolling-current", "2026-09-10T00:00:00.000Z", 400, 40),
    evidence("rp-b-prior", "member-b", "prior-b", "2026-09-04T00:00:00.000Z", 700, 70),
    evidence("rp-b-current", "member-b", "current-b", "2026-09-10T00:00:00.000Z", 400, 40),
  );
  await mutateState(rollingPaid, (state) => {
    state.qualificationRounds.consumed_prior = {
      roundId: "consumed_prior",
      memberId: "member-a",
      triggeringValidConsumptionEventId: "rp-prior-refund",
      triggeringSourceOrderId: "prior-refund",
      qualifiedAt: "2026-09-03T00:00:00.000Z",
      createdAt: "2026-09-03T00:00:00.000Z",
      rulesVersion: 1,
      qualificationMode: "general",
      qualificationBasis: "money",
      generalPath: { windowDays: 30, windowStartedAt: "2026-08-04T00:00:00.000Z", windowEndedAt: "2026-09-03T00:00:00.000Z", qualificationBasis: "money", threshold: 300, cumulativeAmount: 300, eligibleEventIds: ["rp-prior-refund"], activeSubscriptionRequired: false, activeSubscriptionSatisfied: true, passed: true },
      subscriptionPath: { windowDays: 30, windowStartedAt: "2026-08-04T00:00:00.000Z", windowEndedAt: "2026-09-03T00:00:00.000Z", qualificationBasis: "money", threshold: 300, cumulativeAmount: 300, eligibleEventIds: ["rp-prior-refund"], activeSubscriptionRequired: true, activeSubscriptionSatisfied: true, passed: true },
      finalQualified: true,
      selectedAccountingPaths: ["general"],
      excessConsumptionMode: "reset",
      consumptionAccounting: { basis: "money", availableAmountBefore: 300, consumedAmount: 300, remainingAmountAfter: 0, allocations: [{ validConsumptionEventId: "rp-prior-refund", amount: 300 }] },
      rewardCoverageRuleSnapshot: { lookbackDays: 7, forwardDays: 30 },
      rewardSafetyRuleSnapshot: { baseWaitingDays: 7, returnProtectionDays: 3 },
      idempotencyKey: "qualification-consumed-prior",
    };
    state.referrals.ref_control = {
      relationshipId: "ref_control", referrerMemberId: "member-referrer", referredMemberId: "member-a",
      referralCode: "CONTROL", safeDisplayName: "Control", status: "registered",
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    };
  });
  const rollingReward = await createReward(rollingPaid, {
    memberId: "member-a", orderId: "rolling-current", paid: 400, pv: 40,
    at: "2026-09-10T00:00:00.000Z",
  });
  const rollingSnapshot = rollingReward.selfPurchaseTierSnapshot!;
  check(
    rollingSnapshot.initialResult.priorAmount === 700 && rollingSnapshot.initialResult.attainedAmount === 1100,
    "04 rolling_period + paid_amount accumulates valid earlier paid merchandise",
  );

  const rollingPv = await context("rolling-pv", (rules) => configureDynamic(rules, { thresholdBasis: "pv", accumulationBasis: "rolling_period" }));
  await seed(
    rollingPv,
    evidence("rv-prior", "member-rv", "rv-prior-order", "2026-09-05T00:00:00.000Z", 10, 80),
    evidence("rv-current", "member-rv", "rv-current-order", "2026-09-10T00:00:00.000Z", 10, 50),
  );
  const rollingPvReward = await createReward(rollingPv, {
    memberId: "member-rv", orderId: "rv-current-order", paid: 10, pv: 50,
    at: "2026-09-10T00:00:00.000Z",
  });
  check(
    rollingPvReward.selfPurchaseTierSnapshot?.initialResult.attainedAmount === 130,
    "05 rolling_period + pv accumulates valid earlier order PV",
  );
  check(
    rollingSnapshot.windowStartedAt === "2026-08-11T00:00:00.000Z"
      && rollingSnapshot.windowEndedAt === "2026-09-10T00:00:00.000Z"
      && !rollingSnapshot.initialEvidence.some((item) => item.sourceOrderId === "outside-a"),
    "06 rolling window is anchored to current order completion time",
  );
  await commerce.runReferralRewardReleaseScheduler({
    now: new Date("2026-09-15T00:00:00.000Z"),
    stateFilePath: rollingPaid.stateFilePath,
    rulesFilePath: rollingPaid.rulesFilePath,
  });
  let state = await commerce.readMembershipCommerceState(rollingPaid.stateFilePath);
  check(
    state.referralRewards[rollingReward.rewardId].selfPurchaseTierSnapshot?.windowStartedAt === "2026-08-11T00:00:00.000Z"
      && state.referralRewards[rollingReward.rewardId].selfPurchaseTierSnapshot?.initialResult.attainedAmount === 1100,
    "07 natural time movement during safety wait does not alter the frozen window",
  );
  check(
    rollingReward.calculatedCreditAmount === 40 && rollingSnapshot.initialResult.effectiveRewardRate === 10,
    "08 whole_order applies the attained tier to the current order",
  );

  const marginal = await context("marginal", (rules) => configureDynamic(rules, { calculationMethod: "marginal" }));
  await seed(marginal, evidence("m-current", "member-m", "m-order", "2026-09-10T00:00:00.000Z", 1200, 1200));
  const marginalReward = await createReward(marginal, {
    memberId: "member-m", orderId: "m-order", paid: 1200, pv: 1200,
    at: "2026-09-10T00:00:00.000Z",
  });
  check(
    marginalReward.selfPurchaseTierSnapshot?.initialResult.rawReward === 78
      && marginalReward.calculatedCreditAmount === 78,
    "09 marginal calculation uses the canonical tier calculator result",
  );
  check(
    rollingSnapshot.rules.tiers.length === 3
      && rollingSnapshot.initialEvidence.map((item) => item.sourceOrderId).join(",") === "prior-refund,prior-return,rolling-current"
      && JSON.stringify(rollingSnapshot.initialResult) === JSON.stringify(rollingSnapshot.latestResult),
    "10 reward snapshots tier rules, evidence, and equal initial/latest creation results",
  );

  const storeBeforeChange = await rulesApi.readMembershipRulesStore(rollingPaid.rulesFilePath);
  const changedRules = structuredClone(storeBeforeChange.versions.at(-1)!.rules);
  changedRules.referral.selfPurchaseRewardTiers.tiers = [{ threshold: 0, rewardRate: 99 }];
  await rulesApi.saveMembershipBusinessRules(
    { expectedRevision: storeBeforeChange.revision, rules: changedRules, now: new Date("2026-09-11T00:00:00.000Z") },
    rollingPaid.rulesFilePath,
  );
  state = await commerce.readMembershipCommerceState(rollingPaid.stateFilePath);
  check(
    state.referralRewards[rollingReward.rewardId].selfPurchaseTierSnapshot?.rules.tiers[0].rewardRate === 5,
    "11 Admin rule changes do not alter an existing reward snapshot",
  );

  const unrelatedReward = await createReward(rollingPaid, {
    memberId: "member-b", orderId: "current-b", paid: 400, pv: 40,
    at: "2026-09-10T00:00:00.000Z",
  });
  const referralRewards = await commerce.createReferralRewardsFromFulfillment({
    sourceMemberId: "member-a", orderId: "referral-control-order", rewardType: "repeat_purchase",
    paidAmountBasis: 1000, basePV: 100, effectivePV: 100, discountRatio: 1,
    idempotencyKey: "referral-control", now: new Date("2026-09-10T01:00:00.000Z"),
    stateFilePath: rollingPaid.stateFilePath, rulesFilePath: rollingPaid.rulesFilePath,
  });
  const referralControl = referralRewards[0];
  const initialResultJson = JSON.stringify(rollingSnapshot.initialResult);
  await commerce.cancelOrReverseReferralRewards({
    orderId: "prior-refund", outcome: "refunded", idempotencyKey: "reverse-prior-refund",
    now: new Date("2026-09-12T00:00:00.000Z"), stateFilePath: rollingPaid.stateFilePath, rulesFilePath: rollingPaid.rulesFilePath,
  });
  state = await commerce.readMembershipCommerceState(rollingPaid.stateFilePath);
  let refreshed = state.referralRewards[rollingReward.rewardId];
  check(
    state.validConsumptionEvents["rp-prior-refund"].reversalOutcome === "refunded"
      && !refreshed.selfPurchaseTierSnapshot?.latestEvidence.some((item) => item.sourceOrderId === "prior-refund"),
    "12 earlier rolling order refunded before release is marked and excluded",
  );
  check(
    refreshed.status === "scheduled" && refreshed.selfPurchaseTierSnapshot?.latestResult.attainedAmount === 800,
    "14 earlier reversal recalculates only the still-scheduled later reward",
  );
  check(
    JSON.stringify(refreshed.selfPurchaseTierSnapshot?.initialResult) === initialResultJson,
    "15 initial tier result remains unchanged after re-evaluation",
  );
  check(
    refreshed.selfPurchaseTierSnapshot?.latestResult.attainedAmount === 800
      && refreshed.selfPurchaseTierSnapshot.latestResult.effectiveRewardRate === 7,
    "16 latest tier result changes after valid earlier-order reversal",
  );
  check(
    refreshed.projectedCreditAmount === 28 && refreshed.calculatedCreditAmount === 40,
    "17 projectedCreditAmount follows latest result while initial calculated amount remains auditable",
  );
  check(
    state.referralRewards[unrelatedReward.rewardId].projectedCreditAmount === unrelatedReward.projectedCreditAmount,
    "22 unrelated member reward is untouched",
  );
  check(
    state.referralRewards[referralControl.rewardId].status === "scheduled"
      && state.referralRewards[referralControl.rewardId].projectedCreditAmount === referralControl.projectedCreditAmount,
    "23 referral rewards are untouched",
  );
  check(
    singlePvReward.selfPurchaseTierSnapshot?.rules.thresholdBasis === "pv"
      && singlePvReward.selfPurchaseTierSnapshot.initialResult.attainedAmount === 120,
    "24 thresholdBasis=pv remains independent of payoutQualification.qualificationBasis",
  );
  check(
    rollingSnapshot.initialResult.priorAmount === 700,
    "25 rolling self-purchase evidence is not depleted by referral qualification allocations",
  );

  await commerce.cancelOrReverseReferralRewards({
    orderId: "prior-return", outcome: "returned", idempotencyKey: "reverse-prior-return",
    now: new Date("2026-09-13T00:00:00.000Z"), stateFilePath: rollingPaid.stateFilePath, rulesFilePath: rollingPaid.rulesFilePath,
  });
  state = await commerce.readMembershipCommerceState(rollingPaid.stateFilePath);
  refreshed = state.referralRewards[rollingReward.rewardId];
  check(
    state.validConsumptionEvents["rp-prior-return"].reversalOutcome === "returned"
      && refreshed.projectedCreditAmount === 20,
    "13 earlier rolling order returned before release is excluded",
  );
  const beforeOwnInitial = JSON.stringify(refreshed.selfPurchaseTierSnapshot?.initialResult);
  const beforeOwnLatest = JSON.stringify(refreshed.selfPurchaseTierSnapshot?.latestResult);
  await commerce.cancelOrReverseReferralRewards({
    orderId: "rolling-current", outcome: "refunded", idempotencyKey: "reverse-own-source",
    now: new Date("2026-09-14T00:00:00.000Z"), stateFilePath: rollingPaid.stateFilePath, rulesFilePath: rollingPaid.rulesFilePath,
  });
  state = await commerce.readMembershipCommerceState(rollingPaid.stateFilePath);
  const ownCancelled = state.referralRewards[rollingReward.rewardId];
  check(
    ownCancelled.status === "cancelled"
      && ownCancelled.cancellationReason === "source_transaction_reversed_before_release"
      && JSON.stringify(ownCancelled.selfPurchaseTierSnapshot?.initialResult) === beforeOwnInitial
      && JSON.stringify(ownCancelled.selfPurchaseTierSnapshot?.latestResult) === beforeOwnLatest,
    "18 own source order reversal cancels through B2.6 instead of tier recalculation",
  );

  console.log("\n=== RELEASE, FINALITY, AND IDEMPOTENCY ===");
  const release = await context("release", (rules) => configureDynamic(rules, { accumulationBasis: "rolling_period" }));
  await seed(
    release,
    evidence("rel-prior-a", "member-release", "rel-prior-a-order", "2026-09-02T00:00:00.000Z", 600, 60),
    evidence("rel-prior-b", "member-release", "rel-prior-b-order", "2026-09-05T00:00:00.000Z", 400, 40),
    evidence("rel-current", "member-release", "rel-current-order", "2026-09-10T00:00:00.000Z", 500, 50),
  );
  const releaseReward = await createReward(release, {
    memberId: "member-release", orderId: "rel-current-order", paid: 500, pv: 50,
    at: "2026-09-10T00:00:00.000Z",
  });
  await commerce.cancelOrReverseReferralRewards({
    orderId: "rel-prior-a-order", outcome: "refunded", idempotencyKey: "release-refresh",
    now: new Date("2026-09-12T00:00:00.000Z"), stateFilePath: release.stateFilePath, rulesFilePath: release.rulesFilePath,
  });
  let releaseState = await commerce.readMembershipCommerceState(release.stateFilePath);
  const refreshEventCount = releaseState.events.filter((item) => item.type === "self_purchase_tier_reward_refreshed").length;
  const reversedAt = releaseState.validConsumptionEvents["rel-prior-a"].reversedAt;
  await commerce.cancelOrReverseReferralRewards({
    orderId: "rel-prior-a-order", outcome: "refunded", idempotencyKey: "release-refresh",
    now: new Date("2026-09-13T00:00:00.000Z"), stateFilePath: release.stateFilePath, rulesFilePath: release.rulesFilePath,
  });
  await commerce.cancelOrReverseReferralRewards({
    orderId: "rel-prior-a-order", outcome: "refunded", idempotencyKey: "release-refresh-second-key",
    now: new Date("2026-09-14T00:00:00.000Z"), stateFilePath: release.stateFilePath, rulesFilePath: release.rulesFilePath,
  });
  releaseState = await commerce.readMembershipCommerceState(release.stateFilePath);
  check(
    releaseState.events.filter((item) => item.type === "self_purchase_tier_reward_refreshed").length === refreshEventCount
      && releaseState.validConsumptionEvents["rel-prior-a"].reversedAt === reversedAt
      && releaseState.referralRewards[releaseReward.rewardId].projectedCreditAmount === 35,
    "21 duplicate reversal and re-evaluation are idempotent",
  );
  await commerce.runReferralRewardReleaseScheduler({
    now: new Date("2026-09-25T00:00:00.000Z"), stateFilePath: release.stateFilePath, rulesFilePath: release.rulesFilePath,
  });
  releaseState = await commerce.readMembershipCommerceState(release.stateFilePath);
  const released = releaseState.referralRewards[releaseReward.rewardId];
  const releasedCredit = released.rewardCreditEntryId ? releaseState.creditEntries[released.rewardCreditEntryId] : null;
  check(
    released.status === "released" && released.calculatedCreditAmount === 35 && releasedCredit?.amount === 35,
    "20 release scheduler pays the latest projected B3 amount",
  );
  const releasedLatest = JSON.stringify(released.selfPurchaseTierSnapshot?.latestResult);
  await commerce.cancelOrReverseReferralRewards({
    orderId: "rel-prior-b-order", outcome: "returned", idempotencyKey: "after-release-older-return",
    now: new Date("2026-09-26T00:00:00.000Z"), stateFilePath: release.stateFilePath, rulesFilePath: release.rulesFilePath,
  });
  releaseState = await commerce.readMembershipCommerceState(release.stateFilePath);
  const finalReward = releaseState.referralRewards[releaseReward.rewardId];
  check(
    finalReward.status === "released"
      && finalReward.calculatedCreditAmount === 35
      && JSON.stringify(finalReward.selfPurchaseTierSnapshot?.latestResult) === releasedLatest,
    "19 released later reward is never retroactively recalculated for an older reversal",
  );

  console.log("\n=== B3.3B COMMIT-GATE PROOFS ===");
  const paidConsistency = await context("paid-consistency", (rules) => configureDynamic(rules, { accumulationBasis: "rolling_period" }));
  const reusableOrderId = "paid-consistency-first";
  await seed(
    paidConsistency,
    evidence("paid-consistency-event", "member-paid-consistency", reusableOrderId, "2026-09-01T00:00:00.000Z", 750, 75, 9999),
  );
  const asCurrent = await createReward(paidConsistency, {
    memberId: "member-paid-consistency", orderId: reusableOrderId, paid: 750, pv: 75,
    at: "2026-09-01T00:00:00.000Z",
  });
  await seed(
    paidConsistency,
    evidence("paid-consistency-later", "member-paid-consistency", "paid-consistency-later-order", "2026-09-02T00:00:00.000Z", 100, 10),
  );
  const asPrior = await createReward(paidConsistency, {
    memberId: "member-paid-consistency", orderId: "paid-consistency-later-order", paid: 100, pv: 10,
    at: "2026-09-02T00:00:00.000Z",
  });
  const currentContribution = asCurrent.selfPurchaseTierSnapshot?.initialResult.currentAmount;
  const historicalContribution = asPrior.selfPurchaseTierSnapshot?.initialEvidence
    .find((item) => item.sourceOrderId === reusableOrderId)?.thresholdAmount;
  check(
    currentContribution === 750 && historicalContribution === currentContribution,
    "26 the same paid_amount order contributes identically as current and later historical evidence",
  );

  assert.equal(pass, 26);
  console.log(`\nJ.5D.6B3.3B PASS — ${pass}/26 checks passed`);
}
finally {
  await fs.rm(root, { recursive: true, force: true });
}
