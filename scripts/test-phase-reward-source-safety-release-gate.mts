import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { QualificationRound, ReferralReward, ReferralRewardCoverage } from "../lib/membershipCommerce";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-reward-source-safety-gate-"));
process.env.KD_DATA_DIR = root;

const rulesApi = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");

type CommerceState = Awaited<ReturnType<typeof commerce.readMembershipCommerceState>>;
const DAY_MS = 24 * 60 * 60 * 1000;
let checks = 0;

function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
}

async function writeState(filePath: string, state: CommerceState) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function makeContext(name: string) {
  const directory = path.join(root, name);
  await fs.mkdir(directory, { recursive: true });
  const stateFilePath = path.join(directory, "commerce-state.json");
  const rulesFilePath = path.join(directory, "business-rules.json");

  const rules = structuredClone(rulesApi.DEFAULT_MEMBERSHIP_RULES);
  rules.referral.programEnabled = true;
  rules.referral.referralRewardBaseWaitingDays = 7;
  rules.referral.referralRewardReturnProtectionDays = 3;

  await rulesApi.saveMembershipBusinessRules(
    { expectedRevision: 0, rules, now: new Date("2026-09-01T00:00:00.000Z") },
    rulesFilePath,
  );

  const store = await rulesApi.readMembershipRulesStore(rulesFilePath);
  const rulesVersion = store.versions.at(-1)!.rulesVersion;
  return { stateFilePath, rulesFilePath, rulesVersion };
}

function coverageInterval(qualifiedAt: string, lookbackDays: number, forwardDays: number) {
  const t = Date.parse(qualifiedAt);
  return {
    startsAt: new Date(t - lookbackDays * DAY_MS).toISOString(),
    endsAt: new Date(t + forwardDays * DAY_MS).toISOString(),
  };
}

async function seedQualificationCoverageReward(input: {
  stateFilePath: string;
  rulesVersion: number;
  suffix: string;
  sourcePickupDate: string;
  rewardCreatedAt: string;
  qualifiedAt: string;
  lookbackDays: number;
  forwardDays: number;
}) {
  const state = await commerce.readMembershipCommerceState(input.stateFilePath);
  const rewardId = `reward-${input.suffix}`;
  const roundId = `round-${input.suffix}`;
  const coverageId = `coverage-${input.suffix}`;
  const beneficiaryMemberId = `member-beneficiary-${input.suffix}`;
  const sourceOrderNumber = `KD202609-${input.suffix}`;
  const interval = coverageInterval(input.qualifiedAt, input.lookbackDays, input.forwardDays);

  const reward: ReferralReward = {
    rewardId,
    sourceOrderNumber,
    sourceMemberId: `member-source-${input.suffix}`,
    beneficiaryMemberId,
    referralLevel: 1,
    rewardType: "repeat_purchase",
    calculationMode: "pv",
    paidAmountBasis: 700,
    basePV: 35,
    discountRatio: 1,
    effectivePV: 35,
    rewardRate: 50,
    rewardPV: 17.5,
    pvRewardMoneyValue: 1,
    calculatedCreditAmount: 18,
    projectedCreditAmount: 18,
    ruleVersion: input.rulesVersion,
    ancestrySnapshot: [beneficiaryMemberId],
    organizationCapPercentSnapshot: 100,
    organizationCapAmountSnapshot: 18,
    monthlyCapPeriodSnapshot: "2026-09",
    monthlyCapUsageAtRelease: null,
    monthlyCapLimitedAmount: null,
    baseWaitingDaysSnapshot: 7,
    returnProtectionDaysSnapshot: 3,
    totalWaitingDaysSnapshot: 10,
    releasePolicyVersion: "taipei-business-date-v1",
    successfulPickupBusinessDate: input.sourcePickupDate,
    // Historical qualification_coverage rewards intentionally had no source release date persisted.
    // The corrected engine derives it from the trusted fulfillment date + immutable reward snapshot.
    releaseEligibleBusinessDate: null,
    sourceOrderFinalState: "completed",
    cancellationReason: null,
    qualificationStatus: "qualified",
    qualificationQualifiedAt: input.qualifiedAt,
    qualificationAuthority: "qualification_coverage",
    createdAt: input.rewardCreatedAt,
    eligibleAt: input.rewardCreatedAt,
    scheduledReleaseAt: "",
    releasedAt: null,
    status: "scheduled",
    reversalCreditEntryId: null,
    rewardCreditEntryId: null,
    idempotencyKey: `reward:${input.suffix}`,
  };

  const round: QualificationRound = {
    roundId,
    memberId: beneficiaryMemberId,
    triggeringValidConsumptionEventId: `consumption-${input.suffix}`,
    triggeringSourceOrderId: `qualification-order-${input.suffix}`,
    qualifiedAt: input.qualifiedAt,
    createdAt: input.qualifiedAt,
    rulesVersion: input.rulesVersion,
    qualificationMode: "general",
    qualificationBasis: "money",
    generalPath: {} as QualificationRound["generalPath"],
    subscriptionPath: {} as QualificationRound["subscriptionPath"],
    finalQualified: true,
    selectedAccountingPaths: ["general"],
    excessConsumptionMode: "reset",
    consumptionAccounting: {
      basis: "money",
      availableAmountBefore: 0,
      consumedAmount: 0,
      remainingAmountAfter: 0,
      allocations: [],
    },
    rewardCoverageRuleSnapshot: {
      lookbackDays: input.lookbackDays,
      forwardDays: input.forwardDays,
    },
    rewardSafetyRuleSnapshot: {
      baseWaitingDays: 7,
      returnProtectionDays: 3,
    },
    idempotencyKey: `round:${input.suffix}`,
  };

  const coverage: ReferralRewardCoverage = {
    coverageId,
    memberId: beneficiaryMemberId,
    qualificationRoundId: roundId,
    referralRewardId: rewardId,
    qualificationAt: input.qualifiedAt,
    rewardGeneratedAt: input.rewardCreatedAt,
    coverageStartsAt: interval.startsAt,
    coverageEndsAt: interval.endsAt,
    lookbackDays: input.lookbackDays,
    forwardDays: input.forwardDays,
    rulesVersion: input.rulesVersion,
    inclusionReason: "reward-generated-within-snapshotted-coverage-window",
    createdAt: input.rewardCreatedAt,
    sourceReference: `reward-coverage:${rewardId}:${roundId}`,
    idempotencyKey: `coverage:${input.suffix}`,
  };

  state.referralRewards[rewardId] = reward;
  state.qualificationRounds[roundId] = round;
  state.referralRewardCoverages[coverageId] = coverage;
  await writeState(input.stateFilePath, state);

  return { rewardId, roundId, coverageId };
}

try {
  console.log("\n=== CASE A: SOURCE-ORDER SAFETY DATE IS THE LATER GATE ===");
  const sourceLater = await makeContext("source-later");
  const sourceLaterSeed = await seedQualificationCoverageReward({
    ...sourceLater,
    suffix: "source-later",
    sourcePickupDate: "2026-09-23",
    rewardCreatedAt: "2026-09-23T07:45:00.000Z",
    qualifiedAt: "2026-09-08T00:00:00.000Z",
    lookbackDays: 7,
    forwardDays: 30,
  });

  let result = await commerce.runReferralRewardReleaseScheduler({
    now: new Date("2026-09-18T00:00:00.000Z"),
    stateFilePath: sourceLater.stateFilePath,
    rulesFilePath: sourceLater.rulesFilePath,
  });
  let state = await commerce.readMembershipCommerceState(sourceLater.stateFilePath);
  check(result.length === 0, "01 qualification maturation alone does not release before source-order safety wait");
  check(Object.values(state.referralRewardMaturations).length === 1, "02 scheduler records due qualification maturation in the same canonical run");
  check(state.referralRewards[sourceLaterSeed.rewardId]?.status === "scheduled", "03 reward remains scheduled after qualification matures early");
  check(Object.values(state.creditEntries).length === 0, "04 no credit is issued before source-order safety date");

  const storeBeforeChange = await rulesApi.readMembershipRulesStore(sourceLater.rulesFilePath);
  const changedRules = structuredClone(storeBeforeChange.versions.at(-1)!.rules);
  changedRules.referral.referralRewardBaseWaitingDays = 1;
  changedRules.referral.referralRewardReturnProtectionDays = 1;
  await rulesApi.saveMembershipBusinessRules(
    { expectedRevision: storeBeforeChange.revision, rules: changedRules, now: new Date("2026-09-24T00:00:00.000Z") },
    sourceLater.rulesFilePath,
  );

  result = await commerce.runReferralRewardReleaseScheduler({
    now: new Date("2026-10-02T00:00:00.000Z"),
    stateFilePath: sourceLater.stateFilePath,
    rulesFilePath: sourceLater.rulesFilePath,
  });
  state = await commerce.readMembershipCommerceState(sourceLater.stateFilePath);
  check(result.length === 0 && state.referralRewards[sourceLaterSeed.rewardId]?.status === "scheduled", "05 2026/09/23 + 7 + 3 does not release on 2026/10/02");
  check(Object.values(state.creditEntries).length === 0, "06 changing current Admin wait rules to 1+1 does not shorten the historical reward wait");

  result = await commerce.runReferralRewardReleaseScheduler({
    now: new Date("2026-10-03T00:00:00.000Z"),
    stateFilePath: sourceLater.stateFilePath,
    rulesFilePath: sourceLater.rulesFilePath,
  });
  state = await commerce.readMembershipCommerceState(sourceLater.stateFilePath);
  const releasedReward = state.referralRewards[sourceLaterSeed.rewardId]!;
  check(result.length === 1 && result[0]?.status === "released", "07 source-later reward releases on canonical 2026/10/03 business date");
  check(releasedReward.status === "released" && Boolean(releasedReward.rewardCreditEntryId), "08 reward records one canonical released credit linkage");
  check(Object.values(state.creditEntries).length === 1, "09 exactly one credit is issued at release");
  check(state.events.filter((item) => item.type === "referral_reward_released").length === 1, "10 exactly one referral_reward_released event is appended");

  const repeat = await commerce.runReferralRewardReleaseScheduler({
    now: new Date("2026-10-03T00:05:00.000Z"),
    stateFilePath: sourceLater.stateFilePath,
    rulesFilePath: sourceLater.rulesFilePath,
  });
  state = await commerce.readMembershipCommerceState(sourceLater.stateFilePath);
  check(repeat.length === 0, "11 same-day cron retry does not release the reward twice");
  check(Object.values(state.creditEntries).length === 1 && state.events.filter((item) => item.type === "referral_reward_released").length === 1, "12 retry creates no duplicate credit or release event");

  console.log("\n=== CASE B: QUALIFICATION MATURATION IS THE LATER GATE ===");
  const qualificationLater = await makeContext("qualification-later");
  const qualificationLaterSeed = await seedQualificationCoverageReward({
    ...qualificationLater,
    suffix: "qualification-later",
    sourcePickupDate: "2026-09-01",
    rewardCreatedAt: "2026-09-01T01:00:00.000Z",
    qualifiedAt: "2026-09-20T00:00:00.000Z",
    lookbackDays: 30,
    forwardDays: 30,
  });

  result = await commerce.runReferralRewardReleaseScheduler({
    now: new Date("2026-09-29T00:00:00.000Z"),
    stateFilePath: qualificationLater.stateFilePath,
    rulesFilePath: qualificationLater.rulesFilePath,
  });
  state = await commerce.readMembershipCommerceState(qualificationLater.stateFilePath);
  check(result.length === 0 && state.referralRewards[qualificationLaterSeed.rewardId]?.status === "scheduled", "13 source safety completion alone does not bypass later qualification maturation");
  check(Object.values(state.referralRewardMaturations).length === 0 && Object.values(state.creditEntries).length === 0, "14 no maturation or credit exists before qualification safety wait completes");

  result = await commerce.runReferralRewardReleaseScheduler({
    now: new Date("2026-09-30T00:00:00.000Z"),
    stateFilePath: qualificationLater.stateFilePath,
    rulesFilePath: qualificationLater.rulesFilePath,
  });
  state = await commerce.readMembershipCommerceState(qualificationLater.stateFilePath);
  check(Object.values(state.referralRewardMaturations).length === 1, "15 scheduler appends the qualification maturation when its historical 7+3 wait becomes due");
  check(result.length === 1 && result[0]?.status === "released", "16 reward releases only when both source-safety and qualification-maturation gates are due");
  check(Object.values(state.creditEntries).length === 1, "17 qualification-later path issues exactly one credit");

  console.log(`\nREWARD SOURCE SAFETY RELEASE GATE PASS — ${checks}/${checks} checks passed`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
