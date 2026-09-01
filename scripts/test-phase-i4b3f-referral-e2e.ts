import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-i4b3f-"));
process.env.KD_DATA_DIR = root;
process.env.LINE_CHANNEL_ACCESS_TOKEN = "phase-i4b3f-test-token";
process.env.RESEND_API_KEY = "phase-i4b3f-test-key";
process.env.MEMBER_EMAIL_FROM = "noreply@example.test";

const rulesApi = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const automation = await import("../lib/memberNotificationAutomation");

let checks = 0;
let sequence = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks += 1; console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`); }
function fake(status: number, captures: string[]) { return (async (...args: Parameters<typeof fetch>) => { captures.push(String(args[1]?.body ?? "")); return new Response("", { status }); }) as typeof fetch; }

async function writeOrder(orderId: string, memberId: string, subtotal: number) {
  await fs.mkdir(path.join(root, "orders"), { recursive: true });
  await fs.writeFile(path.join(root, "orders", `${orderId}.json`), `${JSON.stringify({ orderNumber: orderId, status: "completed", orderMode: "normal", createdAt: "2026-09-01T00:00:00.000Z", subtotal, shipping: 0, totalBeforeCredit: subtotal, total: subtotal, member: { memberId } }, null, 2)}\n`, "utf8");
}

async function writeMember(memberId: string, input: { email?: string; lineUserId?: string }) {
  await fs.mkdir(path.join(root, "members"), { recursive: true });
  await fs.writeFile(path.join(root, "members", `${memberId}.json`), JSON.stringify({ id: memberId, createdAt: "2026-01-01T00:00:00.000Z", ...input }), "utf8");
}

async function makeContext(input: { cap?: number; channels?: Array<"member_center" | "line" | "email"> } = {}) {
  sequence += 1;
  const directory = path.join(root, `scenario-${sequence}`);
  const stateFilePath = path.join(directory, "commerce-state.json");
  const rulesFilePath = path.join(directory, "business-rules.json");
  const rules = structuredClone(rulesApi.DEFAULT_MEMBERSHIP_RULES);
  rules.money.roundingMode = "round-half-up";
  rules.referral.payoutQualification.mode = "general";
  rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 100;
  rules.referral.referralRewardBaseWaitingDays = 0;
  rules.referral.referralRewardReturnProtectionDays = 0;
  rules.referral.referralMonthlyCreditCap = input.cap ?? 0;
  rules.notification.events.referral_reward = { enabled: false, channels: [] };
  rules.notification.events.credit_reward = { enabled: true, channels: input.channels ?? ["member_center", "line", "email"] };
  await rulesApi.saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-09-01T00:00:00.000Z") }, rulesFilePath);
  return { stateFilePath, rulesFilePath };
}

const noopIdentity = { assertMember: async () => undefined };

async function createReward(ctx: Awaited<ReturnType<typeof makeContext>>, input: { beneficiary: string; source: string; orderId: string; paidAmount: number; at: string }) {
  await commerce.assignReferralRelationship({ referrerMemberId: input.beneficiary, referredMemberId: input.source, idempotencyKey: `relationship:${input.source}`, now: new Date(input.at), stateFilePath: ctx.stateFilePath }, noopIdentity);
  const rewards = await commerce.createReferralRewardsFromFulfillment({ sourceMemberId: input.source, orderId: input.orderId, rewardType: "new_referral", paidAmountBasis: input.paidAmount, idempotencyKey: `reward:${input.orderId}`, now: new Date(input.at), stateFilePath: ctx.stateFilePath, rulesFilePath: ctx.rulesFilePath });
  assert.equal(rewards.length, 1, "fixture must create exactly one new-model reward");
  return rewards[0];
}

async function qualify(ctx: Awaited<ReturnType<typeof makeContext>>, memberId: string, orderId: string, at: string) {
  await writeOrder(orderId, memberId, 100);
  const result = await commerce.recordValidConsumptionFromCompletedOrder({ memberId, orderId, idempotencyKey: `consumption:${orderId}`, now: new Date(at), stateFilePath: ctx.stateFilePath, rulesFilePath: ctx.rulesFilePath });
  assert.ok(result?.qualificationRound, `fixture consumption must qualify: ${JSON.stringify(result)}`);
  return result!;
}

function payoutNotices(state: Awaited<ReturnType<typeof commerce.readMembershipCommerceState>>) {
  return state.notifications.filter((item) => item.eventType === "credit_issued" && item.safeData.referralPayout === true);
}

async function deliverAll(ctx: Awaited<ReturnType<typeof makeContext>>, lineStatus = 200, emailStatus = 200) {
  const lineBodies: string[] = []; const emailBodies: string[] = [];
  for (;;) {
    const result = await automation.deliverNextMembershipNotification({ stateFilePath: ctx.stateFilePath, lineFetcher: fake(lineStatus, lineBodies), emailFetcher: fake(emailStatus, emailBodies), now: new Date("2026-09-02T00:00:00.000Z") });
    if (!result) break;
    if (result.status === "pending") break;
  }
  return { lineBodies, emailBodies };
}

try {
  // Primary chain: every durable fact is created by its accepted production transition.
  const happy = await makeContext();
  const beneficiary = "member-e2e-beneficiary";
  await writeMember(beneficiary, { lineUserId: "line-e2e-beneficiary", email: "beneficiary@example.test" });
  const reward = await createReward(happy, { beneficiary, source: "member-e2e-source", orderId: "source-e2e-1", paidAmount: 2_000, at: "2026-09-01T00:00:00.000Z" });
  check(reward.qualificationAuthority === "qualification_coverage" && reward.calculatedCreditAmount === 100, "new referral reward has qualification_coverage authority and nominal amount");
  const consumed = await qualify(happy, beneficiary, "KD20260901-31001", "2026-09-01T01:00:00.000Z");
  let state = await commerce.readMembershipCommerceState(happy.stateFilePath);
  const round = consumed.qualificationRound!;
  const coverage = Object.values(state.referralRewardCoverages).find((item) => item.referralRewardId === reward.rewardId)!;
  check(Object.keys(state.validConsumptionEvents).length === 1 && consumed.event.memberId === beneficiary && consumed.event.sourceReference === "completed-order:KD20260901-31001", "trusted completed consumption creates exactly one canonical event");
  check(Object.keys(state.qualificationRounds).length === 1 && round.finalQualified && round.triggeringValidConsumptionEventId === consumed.event.eventId, "event creates exactly one final-qualified Qualification Round");
  check(Boolean(coverage) && coverage.qualificationRoundId === round.roundId && coverage.memberId === beneficiary && coverage.inclusionReason === "reward-generated-within-snapshotted-coverage-window", "Round automatically creates one consistent Reward Coverage");
  const preMature = new Date(Date.parse(round.qualifiedAt) - 1);
  await commerce.processReferralRewardMaturations({ now: preMature, stateFilePath: happy.stateFilePath, rulesFilePath: happy.rulesFilePath });
  state = await commerce.readMembershipCommerceState(happy.stateFilePath);
  check(Object.keys(state.referralRewardMaturations).length === 0 && Object.keys(state.creditEntries).length === 0 && payoutNotices(state).length === 0, "before exact maturity no maturation, credit, cap release, or credited notification exists");
  const expectedMaturesAt = new Date(Date.parse(round.qualifiedAt) + (round.rewardSafetyRuleSnapshot!.baseWaitingDays + round.rewardSafetyRuleSnapshot!.returnProtectionDays) * 86_400_000);
  const matured = await commerce.processReferralRewardMaturations({ now: expectedMaturesAt, stateFilePath: happy.stateFilePath, rulesFilePath: happy.rulesFilePath });
  state = await commerce.readMembershipCommerceState(happy.stateFilePath);
  const maturation = matured.find((item) => item.referralRewardId === reward.rewardId)!;
  check(matured.length === 1 && maturation.coverageId === coverage.coverageId && maturation.qualificationRoundId === round.roundId && maturation.maturesAt === expectedMaturesAt.toISOString(), "exact boundary appends exactly one immutable Maturation from Round snapshots");
  check(Object.keys(state.creditEntries).length === 0 && state.referralRewards[reward.rewardId].status === "scheduled", "maturation itself remains non-monetary");
  // Change current rules after facts exist: completion must keep all historical snapshots authoritative.
  const store = await rulesApi.readMembershipRulesStore(happy.rulesFilePath);
  const changed = structuredClone(store.versions.at(-1)!.rules);
  changed.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 9_999;
  changed.referral.payoutQualification.rewardCoverage = { lookbackDays: 1, forwardDays: 1 };
  changed.referral.referralRewardBaseWaitingDays = 99; changed.referral.referralRewardReturnProtectionDays = 99; changed.referral.referralMonthlyCreditCap = 1;
  await rulesApi.saveMembershipBusinessRules({ expectedRevision: store.revision, rules: changed, now: new Date("2026-09-01T02:00:00.000Z") }, happy.rulesFilePath);
  const release = await commerce.runReferralRewardReleaseScheduler({ now: expectedMaturesAt, stateFilePath: happy.stateFilePath, rulesFilePath: happy.rulesFilePath });
  state = await commerce.readMembershipCommerceState(happy.stateFilePath);
  const credit = Object.values(state.creditEntries).find((item) => item.sourceReference === `referral_reward:${reward.rewardId}`)!;
  const notice = payoutNotices(state).find((item) => item.memberId === beneficiary)!;
  check(release.some((item) => item.rewardId === reward.rewardId && item.status === "released") && state.referralRewards[reward.rewardId].status === "released" && credit.amount === 100 && state.referralRewards[reward.rewardId].monthlyCapUsageAtRelease === 0, "payout commits one released reward, one canonical credit, and cap consumption only at release");
  check(notice.channels.includes("line") && notice.channels.includes("email") && notice.safeData.amount === 100, "committed payout writes durable outbox evidence with actual credited amount and persisted policy");
  const firstDelivery = await deliverAll(happy);
  check(firstDelivery.lineBodies.length === 1 && firstDelivery.emailBodies.length === 1 && firstDelivery.lineBodies[0].includes("NT$100") && firstDelivery.emailBodies[0].includes("NT$100"), "injected LINE and Email delivery use canonical recipients and actual credited amount without network");
  const beforeReplay = JSON.stringify({ credits: state.creditEntries, rewards: state.referralRewards, coverages: state.referralRewardCoverages, maturations: state.referralRewardMaturations });
  await commerce.recordValidConsumptionFromCompletedOrder({ memberId: beneficiary, orderId: "KD20260901-31001", idempotencyKey: "consumption:replay", now: new Date("2026-09-03T00:00:00.000Z"), stateFilePath: happy.stateFilePath, rulesFilePath: happy.rulesFilePath });
  await commerce.reconcileReferralRewardCoverage({ referralRewardId: reward.rewardId, now: new Date("2026-09-03T00:00:00.000Z"), stateFilePath: happy.stateFilePath });
  await commerce.processReferralRewardMaturations({ now: new Date("2026-09-03T00:00:00.000Z"), stateFilePath: happy.stateFilePath, rulesFilePath: happy.rulesFilePath });
  await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-09-03T00:00:00.000Z"), stateFilePath: happy.stateFilePath, rulesFilePath: happy.rulesFilePath });
  const replayDelivery = await deliverAll(happy);
  state = await commerce.readMembershipCommerceState(happy.stateFilePath);
  check(Object.keys(state.validConsumptionEvents).length === 1 && Object.keys(state.qualificationRounds).length === 1 && Object.keys(state.referralRewardCoverages).length === 1 && Object.keys(state.referralRewardMaturations).length === 1 && Object.keys(state.creditEntries).length === 1 && JSON.stringify({ credits: state.creditEntries, rewards: state.referralRewards, coverages: state.referralRewardCoverages, maturations: state.referralRewardMaturations }) === beforeReplay && replayDelivery.lineBodies.length === 0 && replayDelivery.emailBodies.length === 0, "reload/replay preserves exactly-once monetary and successful-delivery evidence");

  // Partial cap: two complete rewards share the same qualified round; production release ordering yields 40 then 60.
  const partial = await makeContext({ cap: 100 }); const partialBeneficiary = "member-partial";
  await writeMember(partialBeneficiary, { lineUserId: "line-partial", email: "partial@example.test" });
  const partialFirst = await createReward(partial, { beneficiary: partialBeneficiary, source: "member-partial-source-a", orderId: "partial-source-a", paidAmount: 800, at: "2026-09-01T00:00:00.000Z" });
  const partialSecond = await createReward(partial, { beneficiary: partialBeneficiary, source: "member-partial-source-b", orderId: "partial-source-b", paidAmount: 2_000, at: "2026-09-01T00:00:01.000Z" });
  const partialConsumption = await qualify(partial, partialBeneficiary, "KD20260901-31002", "2026-09-01T01:00:00.000Z");
  const partialMatureAt = new Date(Date.parse(partialConsumption.qualificationRound!.qualifiedAt));
  await commerce.processReferralRewardMaturations({ now: partialMatureAt, stateFilePath: partial.stateFilePath, rulesFilePath: partial.rulesFilePath });
  await commerce.runReferralRewardReleaseScheduler({ now: partialMatureAt, stateFilePath: partial.stateFilePath, rulesFilePath: partial.rulesFilePath });
  state = await commerce.readMembershipCommerceState(partial.stateFilePath);
  const partialCredit = Object.values(state.creditEntries).find((item) => item.sourceReference === `referral_reward:${partialSecond.rewardId}`)!;
  const partialBodies = await deliverAll(partial);
  check(state.referralRewards[partialFirst.rewardId].calculatedCreditAmount === 40 && partialCredit.amount === 60 && state.referralRewards[partialSecond.rewardId].monthlyCapLimitedAmount === 40 && partialBodies.lineBodies.some((body) => body.includes("NT$60")) && partialBodies.emailBodies.some((body) => body.includes("NT$60")), "partial monthly cap releases and notifies actual NT$60, never nominal NT$100");

  // Cap exhausted: exact same complete chain, but the second reward has no positive release and no credited notice.
  const capped = await makeContext({ cap: 100 }); const cappedBeneficiary = "member-capped";
  await writeMember(cappedBeneficiary, { lineUserId: "line-capped", email: "capped@example.test" });
  await createReward(capped, { beneficiary: cappedBeneficiary, source: "member-capped-source-a", orderId: "capped-source-a", paidAmount: 2_000, at: "2026-09-01T00:00:00.000Z" });
  const cappedSecond = await createReward(capped, { beneficiary: cappedBeneficiary, source: "member-capped-source-b", orderId: "capped-source-b", paidAmount: 2_000, at: "2026-09-01T00:00:01.000Z" });
  const cappedConsumption = await qualify(capped, cappedBeneficiary, "KD20260901-31003", "2026-09-01T01:00:00.000Z");
  const cappedAt = new Date(Date.parse(cappedConsumption.qualificationRound!.qualifiedAt));
  await commerce.processReferralRewardMaturations({ now: cappedAt, stateFilePath: capped.stateFilePath, rulesFilePath: capped.rulesFilePath });
  await commerce.runReferralRewardReleaseScheduler({ now: cappedAt, stateFilePath: capped.stateFilePath, rulesFilePath: capped.rulesFilePath });
  state = await commerce.readMembershipCommerceState(capped.stateFilePath);
  check(state.referralRewards[cappedSecond.rewardId].status === "cancelled" && state.referralRewards[cappedSecond.rewardId].cancellationReason === "monthly_cap_exhausted_at_release" && !Object.values(state.creditEntries).some((item) => item.sourceReference === `referral_reward:${cappedSecond.rewardId}`) && payoutNotices(state).length === 1, "cap exhaustion creates neither positive credit nor false credited notification");

  // The accepted outbox handles independent recovery after accounting has already committed.
  const failure = await makeContext(); const failureBeneficiary = "member-failure";
  await writeMember(failureBeneficiary, { lineUserId: "line-failure", email: "failure@example.test" });
  const failureReward = await createReward(failure, { beneficiary: failureBeneficiary, source: "member-failure-source", orderId: "failure-source", paidAmount: 2_000, at: "2026-09-01T00:00:00.000Z" });
  const failureConsumption = await qualify(failure, failureBeneficiary, "KD20260901-31004", "2026-09-01T01:00:00.000Z");
  const failureAt = new Date(Date.parse(failureConsumption.qualificationRound!.qualifiedAt));
  await commerce.processReferralRewardMaturations({ now: failureAt, stateFilePath: failure.stateFilePath, rulesFilePath: failure.rulesFilePath }); await commerce.runReferralRewardReleaseScheduler({ now: failureAt, stateFilePath: failure.stateFilePath, rulesFilePath: failure.rulesFilePath });
  const lineFirst: string[] = []; const emailFirst: string[] = [];
  await automation.deliverNextMembershipNotification({ stateFilePath: failure.stateFilePath, lineFetcher: fake(200, lineFirst), emailFetcher: fake(500, emailFirst) });
  const lineRetry: string[] = []; const emailRetry: string[] = [];
  await automation.deliverNextMembershipNotification({ stateFilePath: failure.stateFilePath, lineFetcher: fake(500, lineRetry), emailFetcher: fake(200, emailRetry) });
  state = await commerce.readMembershipCommerceState(failure.stateFilePath);
  check(lineFirst.length === 1 && lineRetry.length === 0 && emailFirst.length === 1 && emailRetry.length === 1 && Object.values(state.creditEntries).filter((item) => item.sourceReference === `referral_reward:${failureReward.rewardId}`).length === 1 && state.referralRewards[failureReward.rewardId].status === "released", "LINE success survives Email retry; notification failure never reopens payout or cap accounting");

  // Compact authority and legacy gates are intentionally isolated from the real happy-path state.
  const authority = await makeContext(); const authorityReward = await createReward(authority, { beneficiary: "member-authority", source: "member-authority-source", orderId: "authority-source", paidAmount: 2_000, at: "2026-09-01T00:00:00.000Z" });
  let authorityState = await commerce.readMembershipCommerceState(authority.stateFilePath);
  authorityState.referralRewards[authorityReward.rewardId].qualificationStatus = "qualified";
  await fs.writeFile(authority.stateFilePath, `${JSON.stringify(authorityState, null, 2)}\n`, "utf8");
  await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-10-01T00:00:00.000Z"), stateFilePath: authority.stateFilePath, rulesFilePath: authority.rulesFilePath });
  authorityState = await commerce.readMembershipCommerceState(authority.stateFilePath);
  check(Object.keys(authorityState.creditEntries).length === 0 && authorityState.referralRewards[authorityReward.rewardId].status === "scheduled", "forged legacy qualificationStatus without Coverage and Maturation cannot bypass new-model authority");
  authorityState.referralRewards["legacy-isolated"] = { ...authorityState.referralRewards[authorityReward.rewardId], rewardId: "legacy-isolated", qualificationAuthority: "legacy_order", status: "scheduled", idempotencyKey: "legacy-isolated" };
  await fs.writeFile(authority.stateFilePath, `${JSON.stringify(authorityState, null, 2)}\n`, "utf8");
  await commerce.reconcileReferralRewardCoverage({ referralRewardId: "legacy-isolated", stateFilePath: authority.stateFilePath });
  await commerce.processReferralRewardMaturations({ now: new Date("2026-10-01T00:00:00.000Z"), stateFilePath: authority.stateFilePath, rulesFilePath: authority.rulesFilePath });
  authorityState = await commerce.readMembershipCommerceState(authority.stateFilePath);
  check(!Object.values(authorityState.referralRewardCoverages).some((item) => item.referralRewardId === "legacy-isolated") && !Object.values(authorityState.referralRewardMaturations).some((item) => item.referralRewardId === "legacy-isolated"), "legacy_order remains isolated from new Coverage/Maturation authority");

  console.log(`Phase I.4B.3F referral E2E checks passed: ${checks}`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
