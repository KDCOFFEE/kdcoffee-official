import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ReferralReward } from "../lib/membershipCommerce";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-i4b3d0-"));
process.env.KD_DATA_DIR = root;

const { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");

let checks = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
}

const stateFilePath = path.join(root, "membership-commerce", "commerce-state.json");
const rulesFilePath = path.join(root, "membership-commerce", "business-rules.json");
const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES);
rules.money.roundingMode = "round-half-up";
rules.referral.referralMonthlyCreditCap = 0;
await saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-01-01T00:00:00.000Z") }, rulesFilePath);

const noopIdentity = { assertMember: async () => undefined };

try {
  const historicalRaw = { rewardId: "historical" } as ReferralReward;
  const historicalJson = JSON.stringify(historicalRaw);
  check(commerce.referralRewardQualificationAuthority(historicalRaw) === "legacy_order", "old reward missing authority normalizes behaviorally to legacy_order");
  check(JSON.stringify(historicalRaw) === historicalJson && !("qualificationAuthority" in historicalRaw), "normalization does not mutate raw historical reward");
  check(commerce.referralRewardQualificationAuthority({ qualificationAuthority: "legacy_order" }) === "legacy_order", "explicit legacy_order remains legacy_order");
  check(commerce.referralRewardQualificationAuthority({ qualificationAuthority: "qualification_coverage" }) === "qualification_coverage", "explicit qualification_coverage remains qualification_coverage");

  await commerce.assignReferralRelationship({ referrerMemberId: "member-referrer", referredMemberId: "member-referred", idempotencyKey: "authority-relation", now: new Date("2026-01-01T00:00:00.000Z"), stateFilePath }, noopIdentity);
  const createdAt = new Date("2026-01-02T03:04:05.000Z");
  const generated = await commerce.createReferralRewardsFromFulfillment({ sourceMemberId: "member-referred", orderId: "KD20260102-3001", rewardType: "new_referral", paidAmountBasis: 1_000, idempotencyKey: "authority-reward", now: createdAt, stateFilePath, rulesFilePath });
  check(generated.length === 1 && generated[0].qualificationAuthority === "qualification_coverage", "new reward explicitly stores qualification_coverage authority");
  const newReward = generated[0];
  const originalRewardId = newReward.rewardId;
  check(originalRewardId.startsWith("reward_"), "reward identity remains the existing deterministic rewardId");
  check(newReward.createdAt === createdAt.toISOString(), "reward createdAt behavior is unchanged");
  check(newReward.calculatedCreditAmount === 50, "reward amount calculation remains unchanged at first-generation 5 percent");
  check(newReward.referralLevel === 1 && newReward.ancestrySnapshot[0] === "member-referrer", "referral generation calculation remains unchanged");
  const generatedRetry = await commerce.createReferralRewardsFromFulfillment({ sourceMemberId: "member-referred", orderId: "KD20260102-3001", rewardType: "new_referral", paidAmountBasis: 1_000, idempotencyKey: "authority-reward", now: createdAt, stateFilePath, rulesFilePath });
  check(generatedRetry.length === 1 && generatedRetry[0].rewardId === originalRewardId, "reward generation remains idempotent");

  const mixed = await commerce.readMembershipCommerceState(stateFilePath);
  const missingLegacy = structuredClone(newReward);
  missingLegacy.rewardId = "legacy-missing-authority";
  missingLegacy.sourceOrderNumber = "KD20260101-2001";
  delete missingLegacy.qualificationAuthority;
  const explicitLegacy = structuredClone(newReward);
  explicitLegacy.rewardId = "legacy-explicit-authority";
  explicitLegacy.sourceOrderNumber = "KD20260101-2002";
  explicitLegacy.qualificationAuthority = "legacy_order";
  for (const reward of [missingLegacy, explicitLegacy]) {
    reward.qualificationStatus = "awaiting_order";
    reward.qualificationStartedAt = "2026-01-01T00:00:00.000Z";
    reward.qualificationExpiresAt = "2026-01-31T23:59:59.999+08:00";
    reward.qualificationAttempts = [];
    reward.status = "scheduled";
    reward.releasedAt = null;
    reward.rewardCreditEntryId = null;
    reward.scheduledReleaseAt = "";
  }
  mixed.referralRewards[missingLegacy.rewardId] = missingLegacy;
  mixed.referralRewards[explicitLegacy.rewardId] = explicitLegacy;
  await fs.writeFile(stateFilePath, `${JSON.stringify(mixed, null, 2)}\n`, "utf8");

  const beforeLegacyRegistration = await commerce.readMembershipCommerceState(stateFilePath);
  const newRewardBefore = JSON.stringify(beforeLegacyRegistration.referralRewards[originalRewardId]);
  await commerce.registerReferralQualificationOrder({ memberId: "member-referrer", orderId: "KD20260103-4001", orderCreatedAt: "2026-01-03T00:00:00.000Z", orderType: "normal", idempotencyKey: "legacy-register", now: new Date("2026-01-03T00:00:00.000Z"), stateFilePath, rulesFilePath });
  await commerce.handleReferralQualificationOrderOutcome({ memberId: "member-referrer", orderId: "KD20260103-4001", outcome: "completed", idempotencyKey: "legacy-complete", now: new Date("2026-01-03T01:00:00.000Z"), stateFilePath, rulesFilePath });
  let afterQualification = await commerce.readMembershipCommerceState(stateFilePath);
  check(afterQualification.referralRewards[missingLegacy.rewardId].qualificationStatus === "qualified", "missing-authority historical reward still qualifies through legacy path");
  check(afterQualification.referralRewards[explicitLegacy.rewardId].qualificationStatus === "qualified", "explicit legacy_order reward still qualifies through legacy path");
  const legacyQualifiedJson = JSON.stringify({ missing: afterQualification.referralRewards[missingLegacy.rewardId], explicit: afterQualification.referralRewards[explicitLegacy.rewardId] });
  await commerce.handleReferralQualificationOrderOutcome({ memberId: "member-referrer", orderId: "KD20260103-4001", outcome: "completed", idempotencyKey: "legacy-complete", now: new Date("2026-01-03T01:00:00.000Z"), stateFilePath, rulesFilePath });
  afterQualification = await commerce.readMembershipCommerceState(stateFilePath);
  check(JSON.stringify({ missing: afterQualification.referralRewards[missingLegacy.rewardId], explicit: afterQualification.referralRewards[explicitLegacy.rewardId] }) === legacyQualifiedJson, "legacy completed-order qualification remains idempotent");
  check(JSON.stringify(afterQualification.referralRewards[originalRewardId]) === newRewardBefore, "qualification_coverage reward ignores legacy completed-order qualification");
  check(afterQualification.referralRewards[originalRewardId].qualificationStatus === "awaiting_order", "new authority retains compatible non-authoritative legacy status");
  check(!("rewardCoverages" in afterQualification), "authority cutover creates no QualificationRound or Coverage bridge");

  const coverageBeforeScheduler = structuredClone(afterQualification.referralRewards[originalRewardId]);
  coverageBeforeScheduler.qualificationStatus = "qualified";
  coverageBeforeScheduler.releaseEligibleBusinessDate = "2026-01-01";
  coverageBeforeScheduler.scheduledReleaseAt = "2026-01-01T00:00:00+08:00";
  afterQualification.referralRewards[originalRewardId] = coverageBeforeScheduler;
  await fs.writeFile(stateFilePath, `${JSON.stringify(afterQualification, null, 2)}\n`, "utf8");
  const beforeScheduler = await commerce.readMembershipCommerceState(stateFilePath);
  const coverageBeforeJson = JSON.stringify(beforeScheduler.referralRewards[originalRewardId]);
  const creditCountBefore = Object.keys(beforeScheduler.creditEntries).length;
  const notificationCountBefore = beforeScheduler.notifications.length;
  const released = await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-02-01T00:00:00.000Z"), stateFilePath, rulesFilePath });
  const afterScheduler = await commerce.readMembershipCommerceState(stateFilePath);
  check(afterScheduler.referralRewards[missingLegacy.rewardId].status === "released" && afterScheduler.referralRewards[explicitLegacy.rewardId].status === "released", "legacy_order rewards retain existing release behavior");
  check(!released.some((result) => result.rewardId === originalRewardId) && afterScheduler.referralRewards[originalRewardId].status === "scheduled", "qualification_coverage reward cannot be released by legacy scheduler");
  check(JSON.stringify(afterScheduler.referralRewards[originalRewardId]) === coverageBeforeJson, "release firewall does not mutate qualification_coverage reward");
  check(Object.keys(afterScheduler.creditEntries).length === creditCountBefore + 2, "only two legacy rewards create credit; new authority creates none");
  check(afterScheduler.referralRewards[originalRewardId].monthlyCapUsageAtRelease === null, "new authority consumes no monthly cap");
  check(afterScheduler.notifications.length === notificationCountBefore + 2, "new authority creates no payout notification");

  check(commerce.referralRewardQualificationAuthority(afterScheduler.referralRewards[missingLegacy.rewardId]) === "legacy_order" && commerce.referralRewardQualificationAuthority(afterScheduler.referralRewards[explicitLegacy.rewardId]) === "legacy_order" && commerce.referralRewardQualificationAuthority(afterScheduler.referralRewards[originalRewardId]) === "qualification_coverage", "mixed history resolves each reward to the correct authority");
  check(afterScheduler.referralRewards[missingLegacy.rewardId].status === "released" && afterScheduler.referralRewards[originalRewardId].status === "scheduled", "mixed authorities follow independent legacy and fail-closed behavior");
  check((await commerce.readMembershipCommerceState(stateFilePath)).referralRewards[originalRewardId].qualificationAuthority === "qualification_coverage", "explicit authority survives save and reload");

  const oldStateFile = path.join(root, "old-state.json");
  const oldState = structuredClone(afterScheduler);
  oldState.referralRewards = { [missingLegacy.rewardId]: structuredClone(missingLegacy) };
  delete oldState.referralRewards[missingLegacy.rewardId].qualificationAuthority;
  const oldBytes = `${JSON.stringify(oldState, null, 2)}\n`;
  await fs.writeFile(oldStateFile, oldBytes, "utf8");
  const reloadedOld = await commerce.readMembershipCommerceState(oldStateFile);
  check(commerce.referralRewardQualificationAuthority(reloadedOld.referralRewards[missingLegacy.rewardId]) === "legacy_order", "old state missing authority remains backward compatible after reload");
  check(await fs.readFile(oldStateFile, "utf8") === oldBytes, "reading old state does not rewrite historical stored JSON");
  check(!("qualificationAuthority" in reloadedOld.referralRewards[missingLegacy.rewardId]), "backward compatibility does not migrate historical reward in memory");

  const finalNewReward = afterScheduler.referralRewards[originalRewardId];
  check(finalNewReward.rewardId === originalRewardId && finalNewReward.createdAt === createdAt.toISOString(), "authority cutover preserves rewardId and generation timestamp");
  check(finalNewReward.calculatedCreditAmount === 50 && finalNewReward.referralLevel === 1, "authority cutover preserves amount and generation evidence");

  console.log(`Phase I.4B.3D.0 qualification authority checks passed: ${checks}`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
