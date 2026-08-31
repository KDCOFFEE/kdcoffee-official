import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(os.tmpdir(), "kd-phase-i3c2-"));
process.env.KD_DATA_DIR = root;
const rulesModule = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const policies = await import("../lib/membershipPolicies");
const storeModule = await import("../lib/jsonFileStore");

let count = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  count += 1;
  console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
}

type Context = { stateFilePath: string; rulesFilePath: string; beneficiary: string; source: string };
const identityAdapter = { assertMember: async () => undefined };

async function fresh(name: string, options: { base?: number; returns?: number; cap?: number; reversal?: "cancel-pending-and-reverse-released" | "cancel-pending-only" } = {}): Promise<Context> {
  const dir = path.join(root, name);
  const stateFilePath = path.join(dir, "commerce.json");
  const rulesFilePath = path.join(dir, "rules.json");
  const rules = structuredClone(rulesModule.DEFAULT_MEMBERSHIP_RULES);
  rules.referral.referralMaxRewardDepth = 1;
  rules.referral.referralTotalRewardCap = 100;
  rules.referral.referralRewardBaseWaitingDays = options.base ?? 7;
  rules.referral.referralRewardReturnProtectionDays = options.returns ?? 3;
  rules.referral.referralMonthlyCreditCap = options.cap ?? 0;
  rules.referral.reversalPolicy = options.reversal ?? "cancel-pending-and-reverse-released";
  rules.referral.referrerEligibility = { mode: "active-subscription" };
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-07-01T00:00:00Z") }, rulesFilePath);
  const beneficiary = `MEMBER_${name}_A`;
  const source = `MEMBER_${name}_B`;
  await commerce.assignReferralRelationship({ referrerMemberId: beneficiary, referredMemberId: source, idempotencyKey: `${name}:relationship`, now: new Date("2026-07-01T01:00:00Z"), stateFilePath }, identityAdapter);
  return { stateFilePath, rulesFilePath, beneficiary, source };
}

async function entitlement(ctx: Context, orderId: string, at = "2026-07-20T04:00:00Z", paid = 1000) {
  const rewards = await commerce.createReferralRewardsFromFulfillment({ sourceMemberId: ctx.source, orderId, rewardType: "subscription", paidAmountBasis: paid, idempotencyKey: orderId, now: new Date(at), stateFilePath: ctx.stateFilePath, rulesFilePath: ctx.rulesFilePath });
  assert.equal(rewards.length, 1);
  return rewards[0];
}

async function qualify(ctx: Context, rewardId: string, orderId: string, pickupAt: string, orderCreatedAt = "2026-07-25T04:00:00Z") {
  await commerce.registerReferralQualificationOrder({ memberId: ctx.beneficiary, orderId, orderCreatedAt, orderType: "normal", idempotencyKey: `${orderId}:created`, now: new Date(orderCreatedAt), stateFilePath: ctx.stateFilePath, rulesFilePath: ctx.rulesFilePath });
  await commerce.handleReferralQualificationOrderOutcome({ memberId: ctx.beneficiary, orderId, outcome: "completed", idempotencyKey: `${orderId}:completed`, now: new Date(pickupAt), stateFilePath: ctx.stateFilePath, rulesFilePath: ctx.rulesFilePath });
  return (await commerce.readMembershipCommerceState(ctx.stateFilePath)).referralRewards[rewardId];
}

async function dateScenario(name: string, pickupAt: string, expected: string, base = 7, returns = 3) {
  const ctx = await fresh(name, { base, returns });
  const reward = await entitlement(ctx, `SOURCE_${name}`);
  return { ctx, reward: await qualify(ctx, reward.rewardId, `QUAL_${name}`, pickupAt), expected };
}

try {
  const midnight = await dateScenario("time-0001", "2026-07-31T16:01:00Z", "2026-08-11");
  const afternoon = await dateScenario("time-1530", "2026-08-01T07:30:00Z", "2026-08-11");
  const night = await dateScenario("time-2359", "2026-08-01T15:59:00Z", "2026-08-11");
  check("00:01 pickup uses 8/11", midnight.reward.releaseEligibleBusinessDate === midnight.expected);
  check("15:30 pickup uses 8/11", afternoon.reward.releaseEligibleBusinessDate === afternoon.expected);
  check("23:59 pickup uses 8/11", night.reward.releaseEligibleBusinessDate === night.expected);
  check("hour minute second do not affect release date", new Set([midnight.reward.releaseEligibleBusinessDate, afternoon.reward.releaseEligibleBusinessDate, night.reward.releaseEligibleBusinessDate]).size === 1);
  check("waiting starts from beneficiary qualification pickup", afternoon.reward.successfulPickupBusinessDate === "2026-08-01" && afternoon.reward.sourceOrderNumber !== afternoon.reward.qualificationOrderNumber);
  check("waiting reward has no credit before eligible date", Object.keys((await commerce.readMembershipCommerceState(afternoon.ctx.stateFilePath)).creditEntries).length === 0);
  const beforeDate = await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-08-10T23:59:00+08:00"), stateFilePath: afternoon.ctx.stateFilePath, rulesFilePath: afternoon.ctx.rulesFilePath });
  const onDateEarly = await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-08-11T00:01:00+08:00"), stateFilePath: afternoon.ctx.stateFilePath, rulesFilePath: afternoon.ctx.rulesFilePath });
  check("not due before release business date", !beforeDate.some((item) => item.rewardId === afternoon.reward.rewardId && item.status === "released"));
  check("release date is due before 08:00", onDateEarly.some((item) => item.rewardId === afternoon.reward.rewardId && item.status === "released"));

  const baseZero = await dateScenario("base-zero", "2026-08-01T07:30:00Z", "2026-08-08", 0, 7);
  const returnZero = await dateScenario("return-zero", "2026-08-01T07:30:00Z", "2026-08-08", 7, 0);
  const bothZero = await dateScenario("both-zero", "2026-08-01T07:30:00Z", "2026-08-01", 0, 0);
  check("base 0 is supported", baseZero.reward.releaseEligibleBusinessDate === baseZero.expected);
  check("return protection 0 is supported", returnZero.reward.releaseEligibleBusinessDate === returnZero.expected);
  check("both 0 release on pickup business date", bothZero.reward.releaseEligibleBusinessDate === bothZero.expected);
  check("month end date addition is safe", policies.referralReleaseEligibleBusinessDate("2026-08-31", 1, 0) === "2026-09-01");
  check("year end date addition is safe", policies.referralReleaseEligibleBusinessDate("2026-12-31", 1, 0) === "2027-01-01");
  check("leap date addition is safe", policies.referralReleaseEligibleBusinessDate("2028-02-28", 1, 0) === "2028-02-29");

  const snapshot = await fresh("snapshot", { base: 7, returns: 3, cap: 500, reversal: "cancel-pending-and-reverse-released" });
  const oldReward = await entitlement(snapshot, "SOURCE_SNAPSHOT_A");
  const store = await rulesModule.readMembershipRulesStore(snapshot.rulesFilePath);
  const changedRules = structuredClone(store.versions.at(-1)!.rules);
  changedRules.referral.referralRewardBaseWaitingDays = 1;
  changedRules.referral.referralRewardReturnProtectionDays = 14;
  changedRules.referral.referralMonthlyCreditCap = 900;
  changedRules.referral.reversalPolicy = "cancel-pending-only";
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: store.revision, rules: changedRules, now: new Date("2026-07-21T00:00:00Z") }, snapshot.rulesFilePath);
  const oldQualified = await qualify(snapshot, oldReward.rewardId, "QUAL_SNAPSHOT_A", "2026-08-01T07:30:00Z");
  const newReward = await entitlement(snapshot, "SOURCE_SNAPSHOT_B", "2026-07-22T04:00:00Z");
  check("base waiting snapshot is immutable", oldQualified.baseWaitingDaysSnapshot === 7 && newReward.baseWaitingDaysSnapshot === 1);
  check("return protection snapshot is immutable", oldQualified.returnProtectionDaysSnapshot === 3 && newReward.returnProtectionDaysSnapshot === 14);
  check("total waiting snapshot is immutable", oldQualified.totalWaitingDaysSnapshot === 10 && newReward.totalWaitingDaysSnapshot === 15);
  check("reversal snapshot is immutable", oldQualified.reversalPolicySnapshot === "cancel-pending-and-reverse-released" && newReward.reversalPolicySnapshot === "cancel-pending-only");
  check("monthly cap snapshot is immutable", oldQualified.monthlyCapAmountSnapshot === 500 && newReward.monthlyCapAmountSnapshot === 900);
  check("rule version is retained", oldQualified.ruleVersion < newReward.ruleVersion && oldQualified.releasePolicyVersion === "taipei-business-date-v1");
  check("calculation and organization cap policy are snapshotted", oldQualified.calculationMode === "paid_amount" && oldQualified.organizationCapPercentSnapshot === 100 && typeof oldQualified.organizationCapAmountSnapshot === "number");
  check("old reward still calculates 8/11", oldQualified.releaseEligibleBusinessDate === "2026-08-11");

  for (const outcome of ["cancelled", "uncollected", "refunded", "returned"] as const) {
    const live = await fresh(`live-${outcome}`, { base: 7, returns: 3 });
    const waiting = await entitlement(live, `SOURCE_LIVE_${outcome}`);
    await qualify(live, waiting.rewardId, `QUAL_LIVE_${outcome}`, "2026-08-01T07:30:00Z");
    await commerce.cancelOrReverseReferralRewards({ orderId: waiting.sourceOrderNumber, outcome, idempotencyKey: `reverse:${outcome}`, now: new Date("2026-08-05T00:00:00Z"), stateFilePath: live.stateFilePath, rulesFilePath: live.rulesFilePath });
    const result = (await commerce.readMembershipCommerceState(live.stateFilePath)).referralRewards[waiting.rewardId];
    check(`${outcome} live fact blocks release`, result.status === "cancelled" && result.sourceOrderFinalState === outcome);
  }

  const reversal = await fresh("reversal", { base: 0, returns: 0, reversal: "cancel-pending-and-reverse-released" });
  const releaseThenRefund = await entitlement(reversal, "SOURCE_REVERSE");
  await qualify(reversal, releaseThenRefund.rewardId, "QUAL_REVERSE", "2026-08-01T07:30:00Z");
  await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-08-01T08:00:00Z"), stateFilePath: reversal.stateFilePath, rulesFilePath: reversal.rulesFilePath });
  const reversalStore = await rulesModule.readMembershipRulesStore(reversal.rulesFilePath);
  const noReverse = structuredClone(reversalStore.versions.at(-1)!.rules); noReverse.referral.reversalPolicy = "cancel-pending-only";
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: reversalStore.revision, rules: noReverse, now: new Date("2026-08-02T00:00:00Z") }, reversal.rulesFilePath);
  await commerce.cancelOrReverseReferralRewards({ orderId: "SOURCE_REVERSE", outcome: "refunded", idempotencyKey: "refund-after-release", now: new Date("2026-08-03T00:00:00Z"), stateFilePath: reversal.stateFilePath, rulesFilePath: reversal.rulesFilePath });
  let reversalState = await commerce.readMembershipCommerceState(reversal.stateFilePath);
  check("refund after release follows creation-time reversal snapshot", reversalState.referralRewards[releaseThenRefund.rewardId].status === "reversed");
  const reversalCount = Object.values(reversalState.creditEntries).filter((item) => item.sourceReference.startsWith("referral_reward_reversal:")).length;
  await commerce.cancelOrReverseReferralRewards({ orderId: "SOURCE_REVERSE", outcome: "refunded", idempotencyKey: "refund-after-release", now: new Date("2026-08-03T00:00:00Z"), stateFilePath: reversal.stateFilePath, rulesFilePath: reversal.rulesFilePath });
  reversalState = await commerce.readMembershipCommerceState(reversal.stateFilePath);
  check("duplicate refund is idempotent", Object.values(reversalState.creditEntries).filter((item) => item.sourceReference.startsWith("referral_reward_reversal:")).length === reversalCount);

  const cap = await fresh("cap", { base: 0, returns: 0, cap: 500 });
  const capA = await entitlement(cap, "SOURCE_CAP_A", "2026-08-01T01:00:00Z", 6000);
  const capB = await entitlement(cap, "SOURCE_CAP_B", "2026-08-01T02:00:00Z", 6000);
  let capState = await commerce.readMembershipCommerceState(cap.stateFilePath);
  check("pending rewards do not consume monthly cap", capState.referralRewards[capA.rewardId].monthlyCapUsageAtRelease === null && Object.keys(capState.creditEntries).length === 0);
  check("scheduled rewards do not steal projected amount", capA.calculatedCreditAmount === 300 && capB.calculatedCreditAmount === 300);
  await qualify(cap, capA.rewardId, "QUAL_CAP_A", "2026-08-02T01:00:00Z", "2026-08-01T03:00:00Z");
  await qualify(cap, capB.rewardId, "QUAL_CAP_B", "2026-08-02T02:00:00Z", "2026-08-01T04:00:00Z");
  await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-08-02T03:00:00Z"), stateFilePath: cap.stateFilePath, rulesFilePath: cap.rulesFilePath });
  capState = await commerce.readMembershipCommerceState(cap.stateFilePath);
  check("first released reward consumes 300", capState.referralRewards[capA.rewardId].calculatedCreditAmount === 300 && capState.referralRewards[capA.rewardId].status === "released");
  check("existing partial payout behavior releases remaining 200", capState.referralRewards[capB.rewardId].calculatedCreditAmount === 200 && capState.referralRewards[capB.rewardId].monthlyCapLimitedAmount === 100 && capState.referralRewards[capB.rewardId].status === "released");
  check("released monthly cap usage totals 500", Object.values(capState.referralRewards).filter((item) => item.status === "released").reduce((sum, item) => sum + item.calculatedCreditAmount, 0) === 500);
  check("release ordering is deterministic", capState.referralRewards[capA.rewardId].monthlyCapUsageAtRelease === 0 && capState.referralRewards[capB.rewardId].monthlyCapUsageAtRelease === 300);
  const creditsBeforeConcurrent = Object.keys(capState.creditEntries).length;
  await Promise.all([1, 2].map(() => commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-08-02T04:00:00Z"), stateFilePath: cap.stateFilePath, rulesFilePath: cap.rulesFilePath })));
  check("concurrent duplicate scheduler does not double credit", Object.keys((await commerce.readMembershipCommerceState(cap.stateFilePath)).creditEntries).length === creditsBeforeConcurrent);

  const noSubscription = await fresh("no-subscription", { base: 0, returns: 0 });
  const noSubReward = await entitlement(noSubscription, "SOURCE_NO_SUB");
  await qualify(noSubscription, noSubReward.rewardId, "QUAL_NO_SUB", "2026-08-01T01:00:00Z");
  const noSubResult = await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-08-01T02:00:00Z"), stateFilePath: noSubscription.stateFilePath, rulesFilePath: noSubscription.rulesFilePath });
  check("never-subscribed beneficiary can release", noSubResult.some((item) => item.rewardId === noSubReward.rewardId && item.status === "released"));
  check("active-subscription setting does not cause canonical retry", !noSubResult.some((item) => item.rewardId === noSubReward.rewardId && item.status === "failed"));
  check("credit mutation occurs only at release", Object.values((await commerce.readMembershipCommerceState(noSubscription.stateFilePath)).creditEntries).filter((item) => item.metadata.rewardId === noSubReward.rewardId).length === 1);

  for (const status of ["paused", "terminated"] as const) {
    const inactive = await fresh(`subscription-${status}`, { base: 0, returns: 0 });
    const inactiveReward = await entitlement(inactive, `SOURCE_${status}`);
    await qualify(inactive, inactiveReward.rewardId, `QUAL_${status}`, "2026-08-01T01:00:00Z");
    const inactiveState = await commerce.readMembershipCommerceState(inactive.stateFilePath);
    inactiveState.subscriptions[`SUB_${status}`] = { subscriptionId: `SUB_${status}`, memberId: inactive.beneficiary, status, startedFromOrderId: `FIRST_${status}`, anchorDate: "2026-08-01", intervalDays: 30, shippingMethod: "studio_pickup", storeSelection: null, defaultItems: [], rulesVersion: 1, statusReason: "isolated policy test", createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z", revision: 0 };
    await storeModule.atomicWriteJson(inactive.stateFilePath, inactiveState);
    const inactiveResult = await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-08-01T02:00:00Z"), stateFilePath: inactive.stateFilePath, rulesFilePath: inactive.rulesFilePath });
    check(`${status} subscription can release canonical reward`, inactiveResult.some((item) => item.rewardId === inactiveReward.rewardId && item.status === "released"));
  }

  check("at least 38 final policy scenarios", count >= 38);
  console.log(`\nPhase I.3C.2 final reward policy: ${count} scenarios PASS`);
} finally {
  await rm(root, { recursive: true, force: true });
}
