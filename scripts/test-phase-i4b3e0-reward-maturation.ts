import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { MembershipCommerceState, QualificationRound, ReferralReward, ReferralRewardCoverage } from "../lib/membershipCommerce";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-i4b3e0-"));
process.env.KD_DATA_DIR = root;
const rulesApi = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");

let checks = 0;
function check(condition: unknown, label: string) { assert.ok(condition, label); checks += 1; console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`); }

const stateFilePath = path.join(root, "membership-commerce", "commerce-state.json");
const rulesFilePath = path.join(root, "membership-commerce", "business-rules.json");
const rules = structuredClone(rulesApi.DEFAULT_MEMBERSHIP_RULES);
rules.money.roundingMode = "round-half-up";
rules.referral.payoutQualification.mode = "general";
rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 100;
await rulesApi.saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-08-01T00:00:00.000Z") }, rulesFilePath);

let orderSequence = 70_000;
async function qualify(memberId: string, at: string) {
  orderSequence += 1;
  const orderId = `KD20260901-${orderSequence}`;
  const ordersDir = path.join(root, "orders");
  await fs.mkdir(ordersDir, { recursive: true });
  await fs.writeFile(path.join(ordersDir, `${orderId}.json`), `${JSON.stringify({ orderNumber: orderId, status: "completed", orderMode: "normal", createdAt: at, subtotal: 100, shipping: 0, total: 100, member: { memberId } }, null, 2)}\n`, "utf8");
  return commerce.recordValidConsumptionFromCompletedOrder({ memberId, orderId, idempotencyKey: `qualify:${orderId}`, now: new Date(at), stateFilePath, rulesFilePath });
}

function reward(id: string, memberId: string, authority: ReferralReward["qualificationAuthority"] = "qualification_coverage"): ReferralReward {
  return { rewardId: id, sourceOrderNumber: `source-${id}`, sourceMemberId: `source-${id}`, beneficiaryMemberId: memberId, referralLevel: 1, rewardType: "new_referral", calculationMode: "paid_amount", paidAmountBasis: 1000, basePV: 0, discountRatio: 1, effectivePV: 0, rewardRate: 5, rewardPV: 0, pvRewardMoneyValue: 1, calculatedCreditAmount: 50, projectedCreditAmount: 50, ruleVersion: 2, ancestrySnapshot: [memberId], monthlyCapAmountSnapshot: 0, monthlyCapUsageAtRelease: null, monthlyCapLimitedAmount: null, sourceOrderFinalState: "completed", qualificationStatus: "qualified", qualificationAuthority: authority, createdAt: "2026-09-01T10:00:00.000Z", eligibleAt: "2026-09-01T10:00:00.000Z", scheduledReleaseAt: "2026-09-02T00:00:00+08:00", releasedAt: null, status: "scheduled", reversalCreditEntryId: null, rewardCreditEntryId: null, idempotencyKey: `reward:${id}` };
}

function coverage(id: string, rewardId: string, round: QualificationRound): ReferralRewardCoverage {
  return { coverageId: id, memberId: round.memberId, qualificationRoundId: round.roundId, referralRewardId: rewardId, qualificationAt: round.qualifiedAt, rewardGeneratedAt: round.qualifiedAt, coverageStartsAt: new Date(Date.parse(round.qualifiedAt) - 7 * 86_400_000).toISOString(), coverageEndsAt: new Date(Date.parse(round.qualifiedAt) + 30 * 86_400_000).toISOString(), lookbackDays: 7, forwardDays: 30, rulesVersion: round.rulesVersion, inclusionReason: "reward-generated-within-snapshotted-coverage-window", createdAt: round.qualifiedAt, sourceReference: `coverage:${id}`, idempotencyKey: `coverage:${id}` };
}

async function writeState(state: MembershipCommerceState) { await fs.mkdir(path.dirname(stateFilePath), { recursive: true }); await fs.writeFile(stateFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8"); }

try {
  const first = await qualify("member-default", "2026-09-01T10:00:00.000Z");
  const roundDefault = first!.qualificationRound!;
  check(roundDefault.rewardSafetyRuleSnapshot?.baseWaitingDays === 7, "new Qualification Round snapshots Base Waiting");
  check(roundDefault.rewardSafetyRuleSnapshot?.returnProtectionDays === 7, "new Qualification Round snapshots Return Protection");

  let store = await rulesApi.readMembershipRulesStore(rulesFilePath);
  const changed = structuredClone(store.versions.at(-1)!.rules);
  changed.referral.referralRewardBaseWaitingDays = 3;
  changed.referral.referralRewardReturnProtectionDays = 2;
  await rulesApi.saveMembershipBusinessRules({ expectedRevision: store.revision, rules: changed, now: new Date("2026-09-01T12:00:00.000Z") }, rulesFilePath);
  const second = await qualify("member-new", "2026-09-02T10:00:00.000Z");
  const roundNew = second!.qualificationRound!;
  check(roundDefault.rewardSafetyRuleSnapshot?.baseWaitingDays === 7 && roundDefault.rewardSafetyRuleSnapshot.returnProtectionDays === 7, "later Owner change does not alter old Round");
  check(roundNew.rewardSafetyRuleSnapshot?.baseWaitingDays === 3 && roundNew.rewardSafetyRuleSnapshot.returnProtectionDays === 2, "new Round after Owner change uses new values");

  store = await rulesApi.readMembershipRulesStore(rulesFilePath);
  const historicalRules = structuredClone(store.versions.at(-1)!.rules);
  historicalRules.referral.referralRewardBaseWaitingDays = 7;
  historicalRules.referral.referralRewardReturnProtectionDays = 3;
  await rulesApi.saveMembershipBusinessRules({ expectedRevision: store.revision, rules: historicalRules, now: new Date("2026-09-02T12:00:00.000Z") }, rulesFilePath);
  store = await rulesApi.readMembershipRulesStore(rulesFilePath);
  const historicalVersion = store.activeRulesVersion;
  const historicalRound: QualificationRound = { ...roundDefault, roundId: "round-historical-7-3", memberId: "member-historical", qualifiedAt: "2026-09-03T10:00:00.000Z", createdAt: "2026-09-03T10:00:00.000Z", rulesVersion: historicalVersion, rewardSafetyRuleSnapshot: undefined };

  let state = await commerce.readMembershipCommerceState(stateFilePath);
  state.qualificationRounds[historicalRound.roundId] = historicalRound;
  const rewardDefault = reward("reward-default", roundDefault.memberId);
  const rewardNew = reward("reward-new", roundNew.memberId);
  const rewardHistorical = reward("reward-historical", historicalRound.memberId);
  const rewardNoCoverage = reward("reward-no-coverage", "member-no-coverage");
  const rewardLegacyMissing = reward("reward-legacy-missing", roundDefault.memberId, undefined); delete rewardLegacyMissing.qualificationAuthority;
  const rewardLegacyExplicit = reward("reward-legacy-explicit", roundDefault.memberId, "legacy_order");
  for (const item of [rewardDefault, rewardNew, rewardHistorical, rewardNoCoverage, rewardLegacyMissing, rewardLegacyExplicit]) state.referralRewards[item.rewardId] = item;
  const coverageDefault = coverage("coverage-default", rewardDefault.rewardId, roundDefault);
  const coverageNew = coverage("coverage-new", rewardNew.rewardId, roundNew);
  const coverageHistorical = coverage("coverage-historical", rewardHistorical.rewardId, historicalRound);
  const coverageLegacyMissing = coverage("coverage-legacy-missing", rewardLegacyMissing.rewardId, roundDefault);
  const coverageLegacyExplicit = coverage("coverage-legacy-explicit", rewardLegacyExplicit.rewardId, roundDefault);
  for (const item of [coverageDefault, coverageNew, coverageHistorical, coverageLegacyMissing, coverageLegacyExplicit]) state.referralRewardCoverages[item.coverageId] = item;
  await writeState(state);

  const rewardSnapshots = JSON.stringify(state.referralRewards);
  const creditCount = Object.keys(state.creditEntries).length;
  const notificationCount = state.notifications.length;
  check((await commerce.processReferralRewardMaturations({ now: new Date("2026-09-15T09:59:59.999Z"), stateFilePath, rulesFilePath })).length === 2, "one millisecond before default maturesAt leaves that reward unmatured while earlier rewards mature");
  state = await commerce.readMembershipCommerceState(stateFilePath);
  check(!Object.values(state.referralRewardMaturations).some((item) => item.referralRewardId === rewardDefault.rewardId), "before maturesAt no default maturation record exists");
  const exact = await commerce.processReferralRewardMaturations({ now: new Date("2026-09-15T10:00:00.000Z"), stateFilePath, rulesFilePath });
  const defaultMaturation = exact.find((item) => item.referralRewardId === rewardDefault.rewardId)!;
  check(Boolean(defaultMaturation), "exactly maturesAt appends maturation");
  check(defaultMaturation.maturesAt === "2026-09-15T10:00:00.000Z", "qualifiedAt plus default 7+7 produces exact maturesAt");
  state = await commerce.readMembershipCommerceState(stateFilePath);
  const newMaturation = Object.values(state.referralRewardMaturations).find((item) => item.referralRewardId === rewardNew.rewardId)!;
  const historicalMaturation = Object.values(state.referralRewardMaturations).find((item) => item.referralRewardId === rewardHistorical.rewardId)!;
  check(newMaturation.maturesAt === "2026-09-07T10:00:00.000Z", "non-default 3+2 produces correct maturesAt");
  check(historicalMaturation.baseWaitingDays === 7 && historicalMaturation.returnProtectionDays === 3, "explicit historical 7+3 remains 7+3");
  check(historicalMaturation.maturesAt === "2026-09-13T10:00:00.000Z", "historical 7+3 produces correct maturesAt");
  check(defaultMaturation.qualificationAt === roundDefault.qualifiedAt, "maturation starts from QualificationRound.qualifiedAt");
  check(defaultMaturation.baseWaitingDays === 7 && defaultMaturation.returnProtectionDays === 7, "maturation stores immutable safety snapshots");
  check(Object.values(state.referralRewardMaturations).some((item) => item.referralRewardId === rewardDefault.rewardId), "qualification_coverage reward with Coverage matures");
  check(!Object.values(state.referralRewardMaturations).some((item) => item.referralRewardId === rewardNoCoverage.rewardId), "qualification_coverage reward without Coverage cannot mature");
  check(rewardNoCoverage.qualificationStatus === "qualified" && !Object.values(state.referralRewardMaturations).some((item) => item.referralRewardId === rewardNoCoverage.rewardId), "forged legacy qualificationStatus cannot bypass missing Coverage");
  check(!Object.values(state.referralRewardMaturations).some((item) => item.referralRewardId === rewardLegacyMissing.rewardId), "missing-authority legacy reward gets no maturation");
  check(!Object.values(state.referralRewardMaturations).some((item) => item.referralRewardId === rewardLegacyExplicit.rewardId), "explicit legacy_order reward gets no maturation");
  check(state.referralRewards[rewardLegacyExplicit.rewardId].status === "scheduled", "legacy reward behavior remains unchanged");

  const countAfterDue = Object.keys(state.referralRewardMaturations).length;
  await commerce.processReferralRewardMaturations({ now: new Date("2026-09-15T10:00:00.000Z"), stateFilePath, rulesFilePath });
  check(Object.keys((await commerce.readMembershipCommerceState(stateFilePath)).referralRewardMaturations).length === countAfterDue, "processing same due Coverage twice creates one maturation");
  await commerce.processReferralRewardMaturations({ now: new Date("2026-10-01T00:00:00.000Z"), stateFilePath, rulesFilePath });
  state = await commerce.readMembershipCommerceState(stateFilePath);
  check(Object.keys(state.referralRewardMaturations).length === countAfterDue, "later retry creates no duplicate");
  const maturationId = defaultMaturation.maturationId;
  await commerce.processReferralRewardMaturations({ now: new Date("2026-10-02T00:00:00.000Z"), stateFilePath, rulesFilePath });
  check(Object.values((await commerce.readMembershipCommerceState(stateFilePath)).referralRewardMaturations).find((item) => item.referralRewardId === rewardDefault.rewardId)?.maturationId === maturationId, "restart/reload preserves deterministic identity");
  check(defaultMaturation.coverageId === coverageDefault.coverageId && defaultMaturation.qualificationRoundId === roundDefault.roundId, "maturation uses Coverage referenced Round");
  check(defaultMaturation.rulesVersion === roundDefault.rulesVersion, "current Owner settings do not recompute old Round");

  state = await commerce.readMembershipCommerceState(stateFilePath);
  const laterRound = { ...roundDefault, roundId: "round-later", qualifiedAt: "2026-09-10T10:00:00.000Z", rewardSafetyRuleSnapshot: { baseWaitingDays: 0, returnProtectionDays: 0 } };
  state.qualificationRounds[laterRound.roundId] = laterRound;
  await writeState(state);
  await commerce.processReferralRewardMaturations({ now: new Date("2026-10-03T00:00:00.000Z"), stateFilePath, rulesFilePath });
  check(Object.values((await commerce.readMembershipCommerceState(stateFilePath)).referralRewardMaturations).find((item) => item.referralRewardId === rewardDefault.rewardId)?.qualificationRoundId === roundDefault.roundId, "later overlapping Round does not reassign maturation");

  state = await commerce.readMembershipCommerceState(stateFilePath);
  check(Object.keys(state.creditEntries).length === creditCount, "maturation creates no credit");
  check(Object.values(state.referralRewards).every((item) => item.status === "scheduled" && item.releasedAt === null), "maturation does not release rewards");
  check(state.referralRewards[rewardDefault.rewardId].monthlyCapUsageAtRelease === null, "maturation consumes no monthly cap");
  check(state.referralRewards[rewardDefault.rewardId].calculatedCreditAmount === 50, "maturation does not change reward amount");
  check(state.referralRewards[rewardDefault.rewardId].qualificationStatus === "qualified", "maturation does not change legacy qualificationStatus");
  check(state.referralRewards[rewardDefault.rewardId].scheduledReleaseAt === "2026-09-02T00:00:00+08:00", "maturation does not change legacy release date");
  check(state.notifications.length === notificationCount, "maturation sends no notification");
  check(JSON.stringify(state.referralRewards) === rewardSnapshots, "payout firewall preserves every reward snapshot");

  const oldFile = path.join(root, "old-commerce.json");
  const oldObject = structuredClone(state) as unknown as Record<string, unknown>; delete oldObject.referralRewardMaturations;
  const oldBytes = `${JSON.stringify(oldObject, null, 2)}\n`; await fs.writeFile(oldFile, oldBytes, "utf8");
  const oldRead = await commerce.readMembershipCommerceState(oldFile);
  check(Object.keys(oldRead.referralRewardMaturations).length === 0, "old state missing maturation collection normalizes safely");
  check(await fs.readFile(oldFile, "utf8") === oldBytes, "reading old state does not rewrite raw fixture");
  check(Object.values((await commerce.readMembershipCommerceState(stateFilePath)).referralRewardMaturations).some((item) => item.maturationId === maturationId), "maturation persists after reload");
  check(commerce.validateMembershipCommerceState(await commerce.readMembershipCommerceState(stateFilePath)).referralRewardMaturations[maturationId].maturationId === maturationId, "append-only maturation history validates");
  check(Object.values(state.referralRewardMaturations).filter((item) => [rewardNew.rewardId, rewardHistorical.rewardId].includes(item.referralRewardId)).length === 2, "two covered rewards mature independently");
  check(!Object.values(state.referralRewardMaturations).some((item) => item.referralRewardId === rewardNoCoverage.rewardId), "uncovered reward remains unmatured while others mature");

  console.log(`Phase I.4B.3E.0 reward maturation checks passed: ${checks}`);
} finally { await fs.rm(root, { recursive: true, force: true }); }
