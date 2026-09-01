import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { MembershipCommerceState, QualificationRound, ReferralReward, ReferralRewardCoverage, ReferralRewardMaturation } from "../lib/membershipCommerce";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-i4b3e1-"));
process.env.KD_DATA_DIR = root;

const rulesApi = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");

let checks = 0;
function check(condition: unknown, label: string) { assert.ok(condition, label); checks += 1; console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`); }

let sequence = 0;
async function context(cap = 0) {
  sequence += 1;
  const directory = path.join(root, `context-${sequence}`);
  const stateFilePath = path.join(directory, "commerce-state.json");
  const rulesFilePath = path.join(directory, "business-rules.json");
  const rules = structuredClone(rulesApi.DEFAULT_MEMBERSHIP_RULES);
  rules.referral.referralMonthlyCreditCap = cap;
  await rulesApi.saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-09-01T00:00:00.000Z") }, rulesFilePath);
  return { stateFilePath, rulesFilePath };
}

async function writeState(filePath: string, state: MembershipCommerceState) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function pathEvaluation(at: string) {
  return { windowDays: 30, windowStartedAt: new Date(Date.parse(at) - 30 * 86_400_000).toISOString(), windowEndedAt: at, threshold: 100, cumulativeAmount: 100, eligibleEventIds: [], activeSubscriptionRequired: false, activeSubscriptionSatisfied: true, passed: true };
}

function reward(rewardId: string, options: Partial<ReferralReward> = {}): ReferralReward {
  const createdAt = "2026-09-01T00:00:00.000Z";
  return {
    rewardId, sourceOrderNumber: `source-${rewardId}`, sourceMemberId: "member-source", beneficiaryMemberId: "member-beneficiary", referralLevel: 1, rewardType: "new_referral", calculationMode: "paid_amount", paidAmountBasis: 1_000, basePV: 0, discountRatio: 1, effectivePV: 0, rewardRate: 5, rewardPV: 0, pvRewardMoneyValue: 1, calculatedCreditAmount: 50, projectedCreditAmount: 50, ruleVersion: 2, ancestrySnapshot: ["member-beneficiary"], monthlyCapAmountSnapshot: 0, monthlyCapPeriodSnapshot: "2026-09", monthlyCapUsageAtRelease: null, monthlyCapLimitedAmount: null, sourceOrderFinalState: "completed", qualificationStatus: "awaiting_order", qualificationAuthority: "qualification_coverage", createdAt, eligibleAt: createdAt, scheduledReleaseAt: "", releasedAt: null, status: "scheduled", reversalCreditEntryId: null, rewardCreditEntryId: null, idempotencyKey: `reward:${rewardId}`,
    ...options,
  };
}

function evidenceFor(item: ReferralReward, options: { invalid?: "coverage-reference" | "maturation-reference" | "maturation-time" } = {}) {
  const qualifiedAt = "2026-09-01T00:00:00.000Z";
  const round: QualificationRound = {
    roundId: `round-${item.rewardId}`, memberId: item.beneficiaryMemberId, triggeringValidConsumptionEventId: `consumption-${item.rewardId}`, triggeringSourceOrderId: `qualification-order-${item.rewardId}`, qualifiedAt, createdAt: qualifiedAt, rulesVersion: 2, qualificationMode: "general", generalPath: pathEvaluation(qualifiedAt), subscriptionPath: { ...pathEvaluation(qualifiedAt), activeSubscriptionRequired: true }, finalQualified: true, selectedAccountingPaths: ["general"], excessConsumptionMode: "reset", consumptionAccounting: { availableAmountBefore: 100, consumedAmount: 100, remainingAmountAfter: 0, allocations: [] }, rewardCoverageRuleSnapshot: { lookbackDays: 7, forwardDays: 30 }, rewardSafetyRuleSnapshot: { baseWaitingDays: 0, returnProtectionDays: 0 }, idempotencyKey: `round:${item.rewardId}`,
  };
  const coverage: ReferralRewardCoverage = {
    coverageId: `coverage-${item.rewardId}`, memberId: item.beneficiaryMemberId, qualificationRoundId: round.roundId, referralRewardId: options.invalid === "coverage-reference" ? "another-reward" : item.rewardId, qualificationAt: qualifiedAt, rewardGeneratedAt: item.createdAt, coverageStartsAt: "2026-08-25T00:00:00.000Z", coverageEndsAt: "2026-10-01T00:00:00.000Z", lookbackDays: 7, forwardDays: 30, rulesVersion: 2, inclusionReason: "reward-generated-within-snapshotted-coverage-window", createdAt: qualifiedAt, sourceReference: `coverage:${item.rewardId}`, idempotencyKey: `coverage:${item.rewardId}`,
  };
  const maturation: ReferralRewardMaturation = {
    maturationId: `maturation-${item.rewardId}`, memberId: item.beneficiaryMemberId, referralRewardId: options.invalid === "maturation-reference" ? "another-reward" : item.rewardId, coverageId: coverage.coverageId, qualificationRoundId: round.roundId, qualificationAt: qualifiedAt, baseWaitingDays: 0, returnProtectionDays: 0, maturesAt: qualifiedAt, maturedAt: options.invalid === "maturation-time" ? "2026-08-31T23:59:59.999Z" : qualifiedAt, rulesVersion: 2, createdAt: qualifiedAt, sourceReference: `maturation:${item.rewardId}`, idempotencyKey: `maturation:${item.rewardId}`,
  };
  return { round, coverage, maturation };
}

async function fixture(input: { rewards: ReferralReward[]; evidence?: Array<ReturnType<typeof evidenceFor>> }) {
  const ctx = await context(input.rewards[0]?.monthlyCapAmountSnapshot ?? 0);
  const state = await commerce.readMembershipCommerceState(ctx.stateFilePath);
  for (const item of input.rewards) state.referralRewards[item.rewardId] = item;
  for (const item of input.evidence ?? []) {
    state.qualificationRounds[item.round.roundId] = item.round;
    state.referralRewardCoverages[item.coverage.coverageId] = item.coverage;
    state.referralRewardMaturations[item.maturation.maturationId] = item.maturation;
  }
  await writeState(ctx.stateFilePath, state);
  return ctx;
}

try {
  const paid = reward("new-model-paid", { qualificationStatus: "awaiting_order" });
  const paidEvidence = evidenceFor(paid);
  const paidCtx = await fixture({ rewards: [paid], evidence: [paidEvidence] });
  const result = await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-09-02T00:00:00.000Z"), stateFilePath: paidCtx.stateFilePath, rulesFilePath: paidCtx.rulesFilePath });
  let state = await commerce.readMembershipCommerceState(paidCtx.stateFilePath);
  const released = state.referralRewards[paid.rewardId];
  check(result.some((item) => item.rewardId === paid.rewardId && item.status === "released"), "matured qualification_coverage reward releases without legacy qualificationStatus");
  check(released.status === "released" && released.rewardCreditEntryId !== null, "release persists exactly one reward credit reference");
  check(Object.values(state.creditEntries).filter((item) => item.sourceReference === `referral_reward:${paid.rewardId}`).length === 1, "release appends one canonical credit entry");
  check(released.monthlyCapUsageAtRelease === 0 && released.monthlyCapLimitedAmount === 0, "release records existing monthly-cap accounting");
  check(state.notifications.length === 1 && state.notifications[0].status === "pending" && state.notifications[0].safeData.amount === 50, "successful payout only records a pending notification outbox item; delivery remains separate");
  const retry = await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-09-03T00:00:00.000Z"), stateFilePath: paidCtx.stateFilePath, rulesFilePath: paidCtx.rulesFilePath });
  state = await commerce.readMembershipCommerceState(paidCtx.stateFilePath);
  check(!retry.some((item) => item.rewardId === paid.rewardId) && Object.values(state.creditEntries).filter((item) => item.sourceReference === `referral_reward:${paid.rewardId}`).length === 1 && state.referralRewards[paid.rewardId].monthlyCapUsageAtRelease === 0, "retry and reload do not duplicate payout, credit, or cap use");

  const noMaturation = reward("no-maturation");
  const noMaturationEvidence = evidenceFor(noMaturation);
  const missingCtx = await fixture({ rewards: [noMaturation], evidence: [noMaturationEvidence] });
  state = await commerce.readMembershipCommerceState(missingCtx.stateFilePath);
  delete state.referralRewardMaturations[noMaturationEvidence.maturation.maturationId];
  await writeState(missingCtx.stateFilePath, state);
  await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-09-02T00:00:00.000Z"), stateFilePath: missingCtx.stateFilePath, rulesFilePath: missingCtx.rulesFilePath });
  state = await commerce.readMembershipCommerceState(missingCtx.stateFilePath);
  check(state.referralRewards[noMaturation.rewardId].status === "scheduled" && Object.keys(state.creditEntries).length === 0, "missing Maturation record blocks payout");

  const inconsistent = reward("inconsistent");
  const inconsistentCtx = await fixture({ rewards: [inconsistent], evidence: [evidenceFor(inconsistent, { invalid: "maturation-reference" })] });
  await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-09-02T00:00:00.000Z"), stateFilePath: inconsistentCtx.stateFilePath, rulesFilePath: inconsistentCtx.rulesFilePath });
  state = await commerce.readMembershipCommerceState(inconsistentCtx.stateFilePath);
  check(state.referralRewards[inconsistent.rewardId].status === "scheduled" && Object.keys(state.creditEntries).length === 0, "inconsistent Reward/Coverage/Round/Maturation references block payout");

  const unsafe = reward("unsafe-source", { sourceOrderFinalState: "cancelled" });
  const unsafeCtx = await fixture({ rewards: [unsafe], evidence: [evidenceFor(unsafe)] });
  await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-09-02T00:00:00.000Z"), stateFilePath: unsafeCtx.stateFilePath, rulesFilePath: unsafeCtx.rulesFilePath });
  state = await commerce.readMembershipCommerceState(unsafeCtx.stateFilePath);
  check(state.referralRewards[unsafe.rewardId].status === "scheduled" && Object.keys(state.creditEntries).length === 0, "existing live final-state safety blocks payout");

  const prior = reward("already-released", { status: "released", calculatedCreditAmount: 70, projectedCreditAmount: 70, releasedAt: "2026-09-01T00:00:00.000Z", rewardCreditEntryId: "existing-credit", monthlyCapAmountSnapshot: 100 });
  const partial = reward("partial-cap", { monthlyCapAmountSnapshot: 100, projectedCreditAmount: 50, calculatedCreditAmount: 50 });
  const partialCtx = await fixture({ rewards: [prior, partial], evidence: [evidenceFor(partial)] });
  await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-09-02T00:00:00.000Z"), stateFilePath: partialCtx.stateFilePath, rulesFilePath: partialCtx.rulesFilePath });
  state = await commerce.readMembershipCommerceState(partialCtx.stateFilePath);
  check(state.referralRewards[partial.rewardId].status === "released" && state.referralRewards[partial.rewardId].calculatedCreditAmount === 30 && state.referralRewards[partial.rewardId].monthlyCapUsageAtRelease === 70 && state.referralRewards[partial.rewardId].monthlyCapLimitedAmount === 20, "existing monthly-cap semantics partially release remaining NT$30");

  const exhaustedPrior = reward("already-exhausted", { status: "released", calculatedCreditAmount: 100, projectedCreditAmount: 100, releasedAt: "2026-09-01T00:00:00.000Z", rewardCreditEntryId: "existing-credit", monthlyCapAmountSnapshot: 100 });
  const exhausted = reward("cap-exhausted", { monthlyCapAmountSnapshot: 100 });
  const exhaustedCtx = await fixture({ rewards: [exhaustedPrior, exhausted], evidence: [evidenceFor(exhausted)] });
  const exhaustedResult = await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-09-02T00:00:00.000Z"), stateFilePath: exhaustedCtx.stateFilePath, rulesFilePath: exhaustedCtx.rulesFilePath });
  state = await commerce.readMembershipCommerceState(exhaustedCtx.stateFilePath);
  check(exhaustedResult.some((item) => item.rewardId === exhausted.rewardId && item.status === "cap_blocked") && state.referralRewards[exhausted.rewardId].status === "cancelled" && Object.keys(state.creditEntries).length === 0, "remaining amount below NT$1 keeps existing cap-exhausted behavior");

  const legacy = reward("legacy-qualified", { qualificationAuthority: "legacy_order", qualificationStatus: "qualified", releaseEligibleBusinessDate: "2026-09-01", scheduledReleaseAt: "2026-09-01T00:00:00+08:00" });
  const legacyCtx = await fixture({ rewards: [legacy] });
  await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-09-02T00:00:00.000Z"), stateFilePath: legacyCtx.stateFilePath, rulesFilePath: legacyCtx.rulesFilePath });
  state = await commerce.readMembershipCommerceState(legacyCtx.stateFilePath);
  check(state.referralRewards[legacy.rewardId].status === "released" && Object.keys(state.creditEntries).length === 1, "legacy_order reward retains its existing release behavior");

  console.log(`Phase I.4B.3E.1 referral payout checks passed: ${checks}`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
