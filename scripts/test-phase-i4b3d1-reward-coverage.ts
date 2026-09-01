import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { MembershipCommerceState, QualificationRound, ReferralReward } from "../lib/membershipCommerce";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-i4b3d1-"));
process.env.KD_DATA_DIR = root;

const { DEFAULT_MEMBERSHIP_RULES, readMembershipRulesStore, saveMembershipBusinessRules } = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");

let checks = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
}

let sequence = 0;
async function context() {
  sequence += 1;
  const directory = path.join(root, `context-${sequence}`);
  const stateFilePath = path.join(directory, "commerce-state.json");
  const rulesFilePath = path.join(directory, "business-rules.json");
  const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES);
  rules.money.roundingMode = "round-half-up";
  rules.referral.referralMonthlyCreditCap = 0;
  rules.referral.payoutQualification.mode = "general";
  rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 100;
  await saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-01-01T00:00:00.000Z") }, rulesFilePath);
  return { stateFilePath, rulesFilePath };
}

async function writeState(filePath: string, state: MembershipCommerceState) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function pathEvaluation(at: string) {
  return { windowDays: 30, windowStartedAt: new Date(Date.parse(at) - 30 * 86_400_000).toISOString(), windowEndedAt: at, threshold: 100, cumulativeAmount: 100, eligibleEventIds: [], activeSubscriptionRequired: false, activeSubscriptionSatisfied: true, passed: true };
}

function round(roundId: string, qualifiedAt: string, lookbackDays = 7, forwardDays = 30, memberId = "member-covered", rulesVersion = 2): QualificationRound {
  return {
    roundId, memberId, triggeringValidConsumptionEventId: `event-${roundId}`, triggeringSourceOrderId: `order-${roundId}`, qualifiedAt, createdAt: qualifiedAt, rulesVersion, qualificationMode: "general",
    generalPath: pathEvaluation(qualifiedAt), subscriptionPath: { ...pathEvaluation(qualifiedAt), activeSubscriptionRequired: true }, finalQualified: true, selectedAccountingPaths: ["general"], excessConsumptionMode: "reset",
    consumptionAccounting: { availableAmountBefore: 100, consumedAmount: 100, remainingAmountAfter: 0, allocations: [] }, rewardCoverageRuleSnapshot: { lookbackDays, forwardDays }, idempotencyKey: `round:${roundId}`,
  };
}

function reward(rewardId: string, createdAt: string, authority: ReferralReward["qualificationAuthority"] = "qualification_coverage", memberId = "member-covered"): ReferralReward {
  return {
    rewardId, sourceOrderNumber: `source-${rewardId}`, sourceMemberId: `source-member-${rewardId}`, beneficiaryMemberId: memberId, referralLevel: 1, rewardType: "new_referral", calculationMode: "paid_amount", paidAmountBasis: 1_000, basePV: 0, discountRatio: 1, effectivePV: 0, rewardRate: 5, rewardPV: 0, pvRewardMoneyValue: 1, calculatedCreditAmount: 50, projectedCreditAmount: 50, ruleVersion: 2, ancestrySnapshot: [memberId], monthlyCapAmountSnapshot: 0, monthlyCapUsageAtRelease: null, monthlyCapLimitedAmount: null, sourceOrderFinalState: "completed", qualificationStatus: "awaiting_order", qualificationAuthority: authority, createdAt, eligibleAt: createdAt, scheduledReleaseAt: "", releasedAt: null, status: "scheduled", reversalCreditEntryId: null, rewardCreditEntryId: null, idempotencyKey: `reward:${rewardId}`,
  };
}

async function fixture(input: { rounds?: QualificationRound[]; rewards?: ReferralReward[] }) {
  const ctx = await context();
  const state = await commerce.readMembershipCommerceState(ctx.stateFilePath);
  for (const item of input.rounds ?? []) state.qualificationRounds[item.roundId] = item;
  for (const item of input.rewards ?? []) state.referralRewards[item.rewardId] = item;
  await writeState(ctx.stateFilePath, state);
  return ctx;
}

async function reconcileRound(ctx: Awaited<ReturnType<typeof context>>, roundId: string, now = "2026-02-01T00:00:00.000Z") {
  return commerce.reconcileReferralRewardCoverage({ qualificationRoundId: roundId, now: new Date(now), stateFilePath: ctx.stateFilePath });
}

async function createCompletedOrder(subtotal: number) {
  sequence += 1;
  const orderId = `KD20260201-${50_000 + sequence}`;
  const ordersDir = path.join(root, "orders");
  await fs.mkdir(ordersDir, { recursive: true });
  await fs.writeFile(path.join(ordersDir, `${orderId}.json`), `${JSON.stringify({ orderNumber: orderId, status: "completed", orderMode: "normal", createdAt: "2026-01-01T00:00:00.000Z", subtotal, shipping: 0, total: subtotal, member: { memberId: "member-covered" } }, null, 2)}\n`, "utf8");
  return orderId;
}

const noopIdentity = { assertMember: async () => undefined };

try {
  const oldContext = await context();
  const oldState = await commerce.readMembershipCommerceState(oldContext.stateFilePath);
  const oldObject = structuredClone(oldState) as unknown as Record<string, unknown>;
  delete oldObject.referralRewardCoverages;
  const oldBytes = `${JSON.stringify(oldObject, null, 2)}\n`;
  await fs.mkdir(path.dirname(oldContext.stateFilePath), { recursive: true });
  await fs.writeFile(oldContext.stateFilePath, oldBytes, "utf8");
  const normalizedOld = await commerce.readMembershipCommerceState(oldContext.stateFilePath);
  check(Object.keys(normalizedOld.referralRewardCoverages).length === 0, "old state missing coverage collection normalizes to empty");
  check(await fs.readFile(oldContext.stateFilePath, "utf8") === oldBytes, "reading old state does not mutate raw fixture");

  const q0 = "2026-02-01T00:00:00.000Z";
  const lookbackContext = await fixture({ rounds: [round("round-lookback", q0)], rewards: [reward("reward-minus-5", "2026-01-27T00:00:00.000Z"), reward("reward-minus-7", "2026-01-25T00:00:00.000Z"), reward("reward-before-minus-7", "2026-01-24T23:59:59.999Z")] });
  await reconcileRound(lookbackContext, "round-lookback");
  let state = await commerce.readMembershipCommerceState(lookbackContext.stateFilePath);
  check(Object.values(state.referralRewardCoverages).some((item) => item.referralRewardId === "reward-minus-5"), "Reward Day -5 is covered by lookback 7");
  check(Object.values(state.referralRewardCoverages).some((item) => item.referralRewardId === "reward-minus-7"), "reward exactly on lookback boundary is covered");
  check(!Object.values(state.referralRewardCoverages).some((item) => item.referralRewardId === "reward-before-minus-7"), "reward before lookback boundary is excluded");
  check(Object.keys((await commerce.readMembershipCommerceState(lookbackContext.stateFilePath)).referralRewardCoverages).length === 2, "Coverage persists after save and reload");

  const forwardContext = await fixture({ rounds: [round("round-forward", q0)], rewards: [reward("reward-plus-20", "2026-02-21T00:00:00.000Z"), reward("reward-plus-30", "2026-03-03T00:00:00.000Z"), reward("reward-after-plus-30", "2026-03-03T00:00:00.001Z")] });
  await reconcileRound(forwardContext, "round-forward");
  state = await commerce.readMembershipCommerceState(forwardContext.stateFilePath);
  check(Object.values(state.referralRewardCoverages).some((item) => item.referralRewardId === "reward-plus-20"), "Reward Day +20 is covered by forward 30");
  check(Object.values(state.referralRewardCoverages).some((item) => item.referralRewardId === "reward-plus-30"), "reward exactly on forward boundary is covered");
  check(!Object.values(state.referralRewardCoverages).some((item) => item.referralRewardId === "reward-after-plus-30"), "reward after forward boundary is excluded");

  const snapshotCoverage = Object.values(state.referralRewardCoverages).find((item) => item.referralRewardId === "reward-plus-20")!;
  const snapshotJson = JSON.stringify(snapshotCoverage);
  const store = await readMembershipRulesStore(forwardContext.rulesFilePath);
  const changedRules = structuredClone(store.versions.at(-1)!.rules);
  changedRules.referral.payoutQualification.rewardCoverage = { lookbackDays: 3, forwardDays: 14 };
  await saveMembershipBusinessRules({ expectedRevision: store.revision, rules: changedRules, now: new Date("2026-02-02T00:00:00.000Z") }, forwardContext.rulesFilePath);
  await reconcileRound(forwardContext, "round-forward", "2026-02-03T00:00:00.000Z");
  state = await commerce.readMembershipCommerceState(forwardContext.stateFilePath);
  check(state.referralRewardCoverages[snapshotCoverage.coverageId].lookbackDays === 7 && state.referralRewardCoverages[snapshotCoverage.coverageId].forwardDays === 30, "Round snapshot 7/30 remains authoritative after Owner rule change");
  check(JSON.stringify(state.referralRewardCoverages[snapshotCoverage.coverageId]) === snapshotJson, "historical Coverage is not rewritten by Owner rule changes");
  const differentSnapshot = round("round-different-snapshot", "2026-04-01T00:00:00.000Z", 3, 14, "member-covered", 3);
  state.qualificationRounds[differentSnapshot.roundId] = differentSnapshot;
  state.referralRewards["reward-different-snapshot"] = reward("reward-different-snapshot", "2026-04-15T00:00:00.000Z");
  await writeState(forwardContext.stateFilePath, state);
  await reconcileRound(forwardContext, differentSnapshot.roundId);
  state = await commerce.readMembershipCommerceState(forwardContext.stateFilePath);
  const differentCoverage = Object.values(state.referralRewardCoverages).find((item) => item.referralRewardId === "reward-different-snapshot")!;
  check(differentCoverage.lookbackDays === 3 && differentCoverage.forwardDays === 14, "new Round uses its own stored coverage snapshot");

  const countBeforeRetry = Object.keys(state.referralRewardCoverages).length;
  await reconcileRound(forwardContext, differentSnapshot.roundId);
  check(Object.keys((await commerce.readMembershipCommerceState(forwardContext.stateFilePath)).referralRewardCoverages).length === countBeforeRetry, "same Round processed twice creates one Coverage");
  await commerce.reconcileReferralRewardCoverage({ referralRewardId: "reward-different-snapshot", now: new Date("2026-04-16T00:00:00.000Z"), stateFilePath: forwardContext.stateFilePath });
  check(Object.keys((await commerce.readMembershipCommerceState(forwardContext.stateFilePath)).referralRewardCoverages).length === countBeforeRetry, "same Reward processed twice creates one Coverage");
  const reloadedRetry = await commerce.readMembershipCommerceState(forwardContext.stateFilePath);
  await commerce.reconcileReferralRewardCoverage({ referralRewardId: "reward-different-snapshot", now: new Date("2026-04-17T00:00:00.000Z"), stateFilePath: forwardContext.stateFilePath });
  check(Object.keys((await commerce.readMembershipCommerceState(forwardContext.stateFilePath)).referralRewardCoverages).length === Object.keys(reloadedRetry.referralRewardCoverages).length, "restart and reload do not duplicate Coverage");

  const overlapContext = await fixture({ rounds: [round("round-A", "2026-02-01T00:00:00.000Z"), round("round-B", "2026-02-21T00:00:00.000Z")], rewards: [reward("reward-overlap", "2026-02-26T00:00:00.000Z"), reward("reward-B-only", "2026-03-13T00:00:00.000Z")] });
  await commerce.reconcileReferralRewardCoverage({ referralRewardId: "reward-overlap", now: new Date("2026-02-26T00:00:00.000Z"), stateFilePath: overlapContext.stateFilePath });
  await reconcileRound(overlapContext, "round-B");
  state = await commerce.readMembershipCommerceState(overlapContext.stateFilePath);
  const overlapCoverage = Object.values(state.referralRewardCoverages).find((item) => item.referralRewardId === "reward-overlap")!;
  check(Object.values(state.referralRewardCoverages).filter((item) => item.referralRewardId === "reward-overlap").length === 1, "overlapping Rounds create one Coverage");
  check(overlapCoverage.qualificationRoundId === "round-A", "earliest qualification timestamp is selected");
  check(Object.values(state.referralRewardCoverages).find((item) => item.referralRewardId === "reward-B-only")?.qualificationRoundId === "round-B", "reward outside A but inside B selects B");
  const tieContext = await fixture({ rounds: [round("round-tie-B", q0), round("round-tie-A", q0)], rewards: [reward("reward-tie", q0)] });
  await commerce.reconcileReferralRewardCoverage({ referralRewardId: "reward-tie", now: new Date(q0), stateFilePath: tieContext.stateFilePath });
  check(Object.values((await commerce.readMembershipCommerceState(tieContext.stateFilePath)).referralRewardCoverages)[0].qualificationRoundId === "round-tie-A", "equal timestamps use stable round ID tie-breaker");
  const reassignmentContext = await fixture({ rounds: [round("round-later", "2026-02-21T00:00:00.000Z")], rewards: [reward("reward-fixed", "2026-02-22T00:00:00.000Z")] });
  await reconcileRound(reassignmentContext, "round-later");
  state = await commerce.readMembershipCommerceState(reassignmentContext.stateFilePath);
  state.qualificationRounds["round-earlier"] = round("round-earlier", "2026-02-01T00:00:00.000Z");
  await writeState(reassignmentContext.stateFilePath, state);
  await reconcileRound(reassignmentContext, "round-earlier");
  check(Object.values((await commerce.readMembershipCommerceState(reassignmentContext.stateFilePath)).referralRewardCoverages)[0].qualificationRoundId === "round-later", "existing Coverage is never reassigned");

  const extensionContext = await fixture({ rounds: [round("round-extension-A", "2026-02-01T00:00:00.000Z")], rewards: [reward("reward-day-40", "2026-03-13T00:00:00.000Z")] });
  await reconcileRound(extensionContext, "round-extension-A");
  check(Object.keys((await commerce.readMembershipCommerceState(extensionContext.stateFilePath)).referralRewardCoverages).length === 0, "no new Round means no passive extension");
  state = await commerce.readMembershipCommerceState(extensionContext.stateFilePath);
  state.qualificationRounds["round-extension-B"] = round("round-extension-B", "2026-02-21T00:00:00.000Z");
  await writeState(extensionContext.stateFilePath, state);
  await reconcileRound(extensionContext, "round-extension-B");
  check(Object.values((await commerce.readMembershipCommerceState(extensionContext.stateFilePath)).referralRewardCoverages)[0].qualificationRoundId === "round-extension-B", "later successful Round extends future coverage");

  const legacyMissing = reward("reward-legacy-missing", q0, undefined);
  delete legacyMissing.qualificationAuthority;
  const legacyContext = await fixture({ rounds: [round("round-legacy", q0)], rewards: [legacyMissing, reward("reward-legacy-explicit", q0, "legacy_order"), reward("reward-new-model", q0)] });
  await reconcileRound(legacyContext, "round-legacy");
  state = await commerce.readMembershipCommerceState(legacyContext.stateFilePath);
  check(!Object.values(state.referralRewardCoverages).some((item) => item.referralRewardId === "reward-legacy-missing"), "missing-authority historical reward gets no Coverage");
  check(!Object.values(state.referralRewardCoverages).some((item) => item.referralRewardId === "reward-legacy-explicit"), "explicit legacy_order reward gets no Coverage");
  check(Object.values(state.referralRewardCoverages).some((item) => item.referralRewardId === "reward-new-model"), "qualification_coverage reward may receive Coverage");

  const firewallReward = state.referralRewards["reward-new-model"];
  firewallReward.qualificationStatus = "qualified";
  firewallReward.releaseEligibleBusinessDate = "2026-01-01";
  firewallReward.scheduledReleaseAt = "2026-01-01T00:00:00+08:00";
  const firewallRewardJson = JSON.stringify(firewallReward);
  const creditCount = Object.keys(state.creditEntries).length;
  const notificationCount = state.notifications.length;
  await writeState(legacyContext.stateFilePath, state);
  const schedulerResult = await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-04-01T00:00:00.000Z"), stateFilePath: legacyContext.stateFilePath, rulesFilePath: legacyContext.rulesFilePath });
  state = await commerce.readMembershipCommerceState(legacyContext.stateFilePath);
  check(!schedulerResult.some((item) => item.rewardId === firewallReward.rewardId) && state.referralRewards[firewallReward.rewardId].status === "scheduled", "covered reward is not released");
  check(Object.keys(state.creditEntries).length === creditCount, "covered reward creates no credit");
  check(state.referralRewards[firewallReward.rewardId].monthlyCapUsageAtRelease === null, "covered reward consumes no monthly payout cap");
  check(state.notifications.length === notificationCount, "Coverage sends no notification");
  check(state.referralRewards[firewallReward.rewardId].calculatedCreditAmount === 50, "Coverage does not change reward amount");
  check(state.referralRewards[firewallReward.rewardId].qualificationStatus === "qualified", "Coverage itself does not change legacy qualificationStatus");
  check(state.referralRewards[firewallReward.rewardId].scheduledReleaseAt === "2026-01-01T00:00:00+08:00" && JSON.stringify(state.referralRewards[firewallReward.rewardId]) === firewallRewardJson, "Coverage does not change release timestamp or reward snapshot");

  const evidence = Object.values(state.referralRewardCoverages).find((item) => item.referralRewardId === "reward-new-model")!;
  check(evidence.qualificationRoundId === "round-legacy", "Coverage stores correct Round ID");
  check(evidence.referralRewardId === "reward-new-model", "Coverage stores correct Reward ID");
  check(evidence.coverageStartsAt === "2026-01-25T00:00:00.000Z" && evidence.coverageEndsAt === "2026-03-03T00:00:00.000Z", "Coverage stores exact snapshotted interval");
  check(evidence.rulesVersion === 2, "Coverage stores Qualification Round rules version");
  const evidenceId = evidence.coverageId;
  await commerce.reconcileReferralRewardCoverage({ qualificationRoundId: "round-legacy", referralRewardId: "reward-new-model", now: new Date("2026-04-02T00:00:00.000Z"), stateFilePath: legacyContext.stateFilePath });
  check(Object.values((await commerce.readMembershipCommerceState(legacyContext.stateFilePath)).referralRewardCoverages).filter((item) => item.referralRewardId === "reward-new-model")[0].coverageId === evidenceId, "deterministic idempotency survives reload");

  const rewardFirstContext = await context();
  state = await commerce.readMembershipCommerceState(rewardFirstContext.stateFilePath);
  state.referralRewards["reward-first"] = reward("reward-first", "2026-01-27T00:00:00.000Z");
  await writeState(rewardFirstContext.stateFilePath, state);
  const roundOrder = await createCompletedOrder(100);
  await commerce.recordValidConsumptionFromCompletedOrder({ memberId: "member-covered", orderId: roundOrder, idempotencyKey: "reward-first-round", now: new Date(q0), stateFilePath: rewardFirstContext.stateFilePath, rulesFilePath: rewardFirstContext.rulesFilePath });
  check(Object.values((await commerce.readMembershipCommerceState(rewardFirstContext.stateFilePath)).referralRewardCoverages).some((item) => item.referralRewardId === "reward-first"), "Reward-first then Round hook creates one Coverage");

  const roundFirstContext = await context();
  const firstOrder = await createCompletedOrder(100);
  await commerce.recordValidConsumptionFromCompletedOrder({ memberId: "member-covered", orderId: firstOrder, idempotencyKey: "round-first", now: new Date(q0), stateFilePath: roundFirstContext.stateFilePath, rulesFilePath: roundFirstContext.rulesFilePath });
  await commerce.assignReferralRelationship({ referrerMemberId: "member-covered", referredMemberId: "member-source", idempotencyKey: "round-first-relation", now: new Date(q0), stateFilePath: roundFirstContext.stateFilePath }, noopIdentity);
  const forwardRewards = await commerce.createReferralRewardsFromFulfillment({ sourceMemberId: "member-source", orderId: "KD20260221-6001", rewardType: "new_referral", paidAmountBasis: 1_000, idempotencyKey: "round-first-reward", now: new Date("2026-02-21T00:00:00.000Z"), stateFilePath: roundFirstContext.stateFilePath, rulesFilePath: roundFirstContext.rulesFilePath });
  state = await commerce.readMembershipCommerceState(roundFirstContext.stateFilePath);
  check(Object.values(state.referralRewardCoverages).filter((item) => item.referralRewardId === forwardRewards[0].rewardId).length === 1, "Round-first then Reward hook creates one Coverage");
  await commerce.createReferralRewardsFromFulfillment({ sourceMemberId: "member-source", orderId: "KD20260221-6001", rewardType: "new_referral", paidAmountBasis: 1_000, idempotencyKey: "round-first-reward", now: new Date("2026-02-21T00:00:00.000Z"), stateFilePath: roundFirstContext.stateFilePath, rulesFilePath: roundFirstContext.rulesFilePath });
  check(Object.values((await commerce.readMembershipCommerceState(roundFirstContext.stateFilePath)).referralRewardCoverages).filter((item) => item.referralRewardId === forwardRewards[0].rewardId).length === 1, "repeated Reward hook remains idempotent");
  await commerce.recordValidConsumptionFromCompletedOrder({ memberId: "member-covered", orderId: firstOrder, idempotencyKey: "round-first-retry", now: new Date(q0), stateFilePath: roundFirstContext.stateFilePath, rulesFilePath: roundFirstContext.rulesFilePath });
  check(Object.values((await commerce.readMembershipCommerceState(roundFirstContext.stateFilePath)).referralRewardCoverages).filter((item) => item.referralRewardId === forwardRewards[0].rewardId).length === 1, "repeated Round hook remains idempotent");

  console.log(`Phase I.4B.3D.1 reward coverage checks passed: ${checks}`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
