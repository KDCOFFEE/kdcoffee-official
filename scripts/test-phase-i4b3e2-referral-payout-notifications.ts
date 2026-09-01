import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { MembershipCommerceState, QualificationRound, ReferralReward, ReferralRewardCoverage, ReferralRewardMaturation } from "../lib/membershipCommerce";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-i4b3e2-"));
process.env.KD_DATA_DIR = root;
process.env.LINE_CHANNEL_ACCESS_TOKEN = "phase-i4b3e2-test-token";
process.env.RESEND_API_KEY = "phase-i4b3e2-test-key";
process.env.MEMBER_EMAIL_FROM = "noreply@example.test";

const rulesApi = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const automation = await import("../lib/memberNotificationAutomation");

let checks = 0;
function check(condition: unknown, label: string) { assert.ok(condition, label); checks += 1; console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`); }
let sequence = 0;

function pathEvaluation(at: string) { return { windowDays: 30, windowStartedAt: new Date(Date.parse(at) - 30 * 86_400_000).toISOString(), windowEndedAt: at, threshold: 100, cumulativeAmount: 100, eligibleEventIds: [], activeSubscriptionRequired: false, activeSubscriptionSatisfied: true, passed: true }; }
function reward(rewardId: string, options: Partial<ReferralReward> = {}): ReferralReward {
  const createdAt = "2026-09-01T00:00:00.000Z";
  return { rewardId, sourceOrderNumber: `source-${rewardId}`, sourceMemberId: "member-source", beneficiaryMemberId: "member-beneficiary", referralLevel: 1, rewardType: "new_referral", calculationMode: "paid_amount", paidAmountBasis: 2_000, basePV: 0, discountRatio: 1, effectivePV: 0, rewardRate: 5, rewardPV: 0, pvRewardMoneyValue: 1, calculatedCreditAmount: 100, projectedCreditAmount: 100, ruleVersion: 2, ancestrySnapshot: ["member-beneficiary"], monthlyCapAmountSnapshot: 0, monthlyCapPeriodSnapshot: "2026-09", monthlyCapUsageAtRelease: null, monthlyCapLimitedAmount: null, sourceOrderFinalState: "completed", qualificationStatus: "awaiting_order", qualificationAuthority: "qualification_coverage", createdAt, eligibleAt: createdAt, scheduledReleaseAt: "", releasedAt: null, status: "scheduled", reversalCreditEntryId: null, rewardCreditEntryId: null, idempotencyKey: `reward:${rewardId}`, ...options };
}
function evidenceFor(item: ReferralReward) {
  const qualifiedAt = "2026-09-01T00:00:00.000Z";
  const round: QualificationRound = { roundId: `round-${item.rewardId}`, memberId: item.beneficiaryMemberId, triggeringValidConsumptionEventId: `consumption-${item.rewardId}`, triggeringSourceOrderId: `qualification-order-${item.rewardId}`, qualifiedAt, createdAt: qualifiedAt, rulesVersion: 2, qualificationMode: "general", generalPath: pathEvaluation(qualifiedAt), subscriptionPath: { ...pathEvaluation(qualifiedAt), activeSubscriptionRequired: true }, finalQualified: true, selectedAccountingPaths: ["general"], excessConsumptionMode: "reset", consumptionAccounting: { availableAmountBefore: 100, consumedAmount: 100, remainingAmountAfter: 0, allocations: [] }, rewardCoverageRuleSnapshot: { lookbackDays: 7, forwardDays: 30 }, rewardSafetyRuleSnapshot: { baseWaitingDays: 0, returnProtectionDays: 0 }, idempotencyKey: `round:${item.rewardId}` };
  const coverage: ReferralRewardCoverage = { coverageId: `coverage-${item.rewardId}`, memberId: item.beneficiaryMemberId, qualificationRoundId: round.roundId, referralRewardId: item.rewardId, qualificationAt: qualifiedAt, rewardGeneratedAt: item.createdAt, coverageStartsAt: "2026-08-25T00:00:00.000Z", coverageEndsAt: "2026-10-01T00:00:00.000Z", lookbackDays: 7, forwardDays: 30, rulesVersion: 2, inclusionReason: "reward-generated-within-snapshotted-coverage-window", createdAt: qualifiedAt, sourceReference: `coverage:${item.rewardId}`, idempotencyKey: `coverage:${item.rewardId}` };
  const maturation: ReferralRewardMaturation = { maturationId: `maturation-${item.rewardId}`, memberId: item.beneficiaryMemberId, referralRewardId: item.rewardId, coverageId: coverage.coverageId, qualificationRoundId: round.roundId, qualificationAt: qualifiedAt, baseWaitingDays: 0, returnProtectionDays: 0, maturesAt: qualifiedAt, maturedAt: qualifiedAt, rulesVersion: 2, createdAt: qualifiedAt, sourceReference: `maturation:${item.rewardId}`, idempotencyKey: `maturation:${item.rewardId}` };
  return { round, coverage, maturation };
}
async function writeState(filePath: string, state: MembershipCommerceState) { await fs.mkdir(path.dirname(filePath), { recursive: true }); await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8"); }
async function context(input: { channels: Array<"member_center" | "line" | "email">; lineUserId?: string; email?: string; cap?: number; priorReleased?: ReferralReward }) {
  sequence += 1;
  const directory = path.join(root, `context-${sequence}`);
  const stateFilePath = path.join(directory, "commerce-state.json");
  const rulesFilePath = path.join(directory, "business-rules.json");
  const rules = structuredClone(rulesApi.DEFAULT_MEMBERSHIP_RULES);
  rules.referral.referralMonthlyCreditCap = input.cap ?? 0;
  rules.notification.events.credit_reward = { enabled: true, channels: input.channels };
  rules.notification.retryCount = 2;
  await rulesApi.saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-09-01T00:00:00.000Z") }, rulesFilePath);
  await fs.mkdir(path.join(root, "members"), { recursive: true });
  await fs.writeFile(path.join(root, "members", "member-beneficiary.json"), JSON.stringify({ id: "member-beneficiary", email: input.email, lineUserId: input.lineUserId, createdAt: "2026-01-01T00:00:00.000Z" }), "utf8");
  return { stateFilePath, rulesFilePath, priorReleased: input.priorReleased };
}
async function releasePaid(input: { channels: Array<"member_center" | "line" | "email">; lineUserId?: string; email?: string; reward?: ReferralReward; cap?: number; priorReleased?: ReferralReward }) {
  const ctx = await context(input);
  const item = input.reward ?? reward(`reward-${sequence}`);
  const evidence = evidenceFor(item);
  const state = await commerce.readMembershipCommerceState(ctx.stateFilePath);
  state.referralRewards[item.rewardId] = item;
  if (ctx.priorReleased) state.referralRewards[ctx.priorReleased.rewardId] = ctx.priorReleased;
  state.qualificationRounds[evidence.round.roundId] = evidence.round;
  state.referralRewardCoverages[evidence.coverage.coverageId] = evidence.coverage;
  state.referralRewardMaturations[evidence.maturation.maturationId] = evidence.maturation;
  await writeState(ctx.stateFilePath, state);
  await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-09-02T00:00:00.000Z"), stateFilePath: ctx.stateFilePath, rulesFilePath: ctx.rulesFilePath });
  return { ctx, reward: item };
}
function fake(status: number, captures: string[]) { return (async (...args: Parameters<typeof fetch>) => { captures.push(String(args[1]?.body ?? "")); return new Response("", { status }); }) as typeof fetch; }

try {
  const both = await releasePaid({ channels: ["member_center", "line", "email"], lineUserId: "canonical-line-user", email: "member@example.test" });
  let state = await commerce.readMembershipCommerceState(both.ctx.stateFilePath);
  const notice = state.notifications[0];
  check(state.referralRewards[both.reward.rewardId].status === "released" && Object.values(state.creditEntries).length === 1 && notice?.eventType === "credit_issued", "durable payout and canonical credit exist before notification processing");
  check(notice.channels.includes("line") && notice.channels.includes("email") && notice.safeData.amount === 100 && notice.safeData.referralPayout === true, "current credit_reward policy persists both approved channels and actual paid amount");
  const lineBodies: string[] = []; const emailBodies: string[] = [];
  const delivered = await automation.deliverNextMembershipNotification({ stateFilePath: both.ctx.stateFilePath, lineFetcher: fake(200, lineBodies), emailFetcher: fake(200, emailBodies), now: new Date("2026-09-02T01:00:00.000Z") });
  state = await commerce.readMembershipCommerceState(both.ctx.stateFilePath);
  check(delivered?.status === "delivered" && lineBodies.length === 1 && emailBodies.length === 1, "both enabled canonical recipients receive independent LINE and Email attempts");
  check(lineBodies[0].includes("NT$100") && emailBodies[0].includes("NT$100") && lineBodies[0].includes("推薦回饋"), "notification content describes the actual credited referral amount");
  check(Object.values(state.creditEntries).length === 1 && state.referralRewards[both.reward.rewardId].status === "released" && state.referralRewards[both.reward.rewardId].monthlyCapUsageAtRelease === 0, "notification delivery creates no credit, cap use, or payable reward rollback");

  const lineSuccessEmailFailure = await releasePaid({ channels: ["member_center", "line", "email"], lineUserId: "canonical-line-user", email: "member@example.test" });
  const lineFirst: string[] = []; const emailFirst: string[] = [];
  const firstAttempt = await automation.deliverNextMembershipNotification({ stateFilePath: lineSuccessEmailFailure.ctx.stateFilePath, lineFetcher: fake(200, lineFirst), emailFetcher: fake(500, emailFirst), now: new Date("2026-09-02T01:00:00.000Z") });
  const lineSecond: string[] = []; const emailSecond: string[] = [];
  const secondAttempt = await automation.deliverNextMembershipNotification({ stateFilePath: lineSuccessEmailFailure.ctx.stateFilePath, lineFetcher: fake(500, lineSecond), emailFetcher: fake(200, emailSecond), now: new Date("2026-09-02T02:00:00.000Z") });
  state = await commerce.readMembershipCommerceState(lineSuccessEmailFailure.ctx.stateFilePath);
  check(firstAttempt?.status === "pending" && secondAttempt?.status === "delivered" && lineFirst.length === 1 && lineSecond.length === 0 && emailFirst.length === 1 && emailSecond.length === 1, "LINE success persists while failed Email retries without duplicate LINE");
  check(Object.values(state.creditEntries).length === 1 && state.referralRewards[lineSuccessEmailFailure.reward.rewardId].status === "released", "one-channel failure leaves accounting final");

  const emailSuccessLineFailure = await releasePaid({ channels: ["member_center", "line", "email"], lineUserId: "canonical-line-user", email: "member@example.test" });
  const lineFail: string[] = []; const emailSuccess: string[] = [];
  await automation.deliverNextMembershipNotification({ stateFilePath: emailSuccessLineFailure.ctx.stateFilePath, lineFetcher: fake(500, lineFail), emailFetcher: fake(200, emailSuccess), now: new Date("2026-09-02T01:00:00.000Z") });
  const lineRetry: string[] = []; const emailRetry: string[] = [];
  const recovered = await automation.deliverNextMembershipNotification({ stateFilePath: emailSuccessLineFailure.ctx.stateFilePath, lineFetcher: fake(200, lineRetry), emailFetcher: fake(500, emailRetry), now: new Date("2026-09-02T02:00:00.000Z") });
  check(recovered?.status === "delivered" && lineFail.length === 1 && lineRetry.length === 1 && emailSuccess.length === 1 && emailRetry.length === 0, "Email success persists while failed LINE retries without duplicate Email");

  const lineOnly = await releasePaid({ channels: ["member_center", "line"], lineUserId: "canonical-line-user" });
  const lineOnlyBodies: string[] = []; const noEmailBodies: string[] = [];
  await automation.deliverNextMembershipNotification({ stateFilePath: lineOnly.ctx.stateFilePath, lineFetcher: fake(200, lineOnlyBodies), emailFetcher: fake(500, noEmailBodies) });
  check(lineOnlyBodies.length === 1 && noEmailBodies.length === 0, "LINE-only policy attempts only LINE");
  const emailOnly = await releasePaid({ channels: ["member_center", "email"], email: "member@example.test" });
  const noLineBodies: string[] = []; const emailOnlyBodies: string[] = [];
  await automation.deliverNextMembershipNotification({ stateFilePath: emailOnly.ctx.stateFilePath, lineFetcher: fake(500, noLineBodies), emailFetcher: fake(200, emailOnlyBodies) });
  check(noLineBodies.length === 0 && emailOnlyBodies.length === 1, "Email-only policy attempts only Email");

  const missingRecipients = await releasePaid({ channels: ["member_center", "line", "email"] });
  const missing = await automation.deliverNextMembershipNotification({ stateFilePath: missingRecipients.ctx.stateFilePath, lineFetcher: fake(500, []), emailFetcher: fake(500, []) });
  state = await commerce.readMembershipCommerceState(missingRecipients.ctx.stateFilePath);
  check(missing?.status === "pending" && Object.values(state.creditEntries).length === 1 && state.referralRewards[missingRecipients.reward.rewardId].status === "released", "missing LINE and Email recipients do not affect committed payout");

  const prior = reward("prior-released", { status: "released", calculatedCreditAmount: 40, projectedCreditAmount: 40, releasedAt: "2026-09-01T00:00:00.000Z", rewardCreditEntryId: "prior-credit", monthlyCapAmountSnapshot: 100 });
  const partial = reward("partial-payout", { monthlyCapAmountSnapshot: 100 });
  const partialRun = await releasePaid({ channels: ["member_center", "line"], lineUserId: "canonical-line-user", reward: partial, cap: 100, priorReleased: prior });
  const partialBodies: string[] = [];
  await automation.deliverNextMembershipNotification({ stateFilePath: partialRun.ctx.stateFilePath, lineFetcher: fake(200, partialBodies) });
  check(partialBodies.length === 1 && partialBodies[0].includes("NT$60") && !partialBodies[0].includes("NT$100"), "partial payout notification reports actual canonical NT$60 credit only");

  const maturedOnly = reward("matured-only");
  const maturedCtx = await context({ channels: ["member_center", "line"], lineUserId: "canonical-line-user" });
  const maturedState = await commerce.readMembershipCommerceState(maturedCtx.stateFilePath);
  maturedState.referralRewards[maturedOnly.rewardId] = maturedOnly;
  const evidence = evidenceFor(maturedOnly);
  maturedState.qualificationRounds[evidence.round.roundId] = evidence.round;
  maturedState.referralRewardCoverages[evidence.coverage.coverageId] = evidence.coverage;
  maturedState.referralRewardMaturations[evidence.maturation.maturationId] = evidence.maturation;
  await writeState(maturedCtx.stateFilePath, maturedState);
  check(await automation.deliverNextMembershipNotification({ stateFilePath: maturedCtx.stateFilePath, lineFetcher: fake(200, []) }) === null, "matured-only or Coverage-only evidence cannot send a false credited notification");

  const capPrior = reward("cap-prior", { status: "released", calculatedCreditAmount: 100, projectedCreditAmount: 100, releasedAt: "2026-09-01T00:00:00.000Z", rewardCreditEntryId: "prior-credit", monthlyCapAmountSnapshot: 100 });
  const capExhausted = reward("cap-exhausted-notice", { monthlyCapAmountSnapshot: 100 });
  const capRun = await releasePaid({ channels: ["member_center", "line", "email"], lineUserId: "canonical-line-user", email: "member@example.test", reward: capExhausted, cap: 100, priorReleased: capPrior });
  state = await commerce.readMembershipCommerceState(capRun.ctx.stateFilePath);
  check(state.referralRewards[capExhausted.rewardId].status === "cancelled" && state.notifications.length === 0 && await automation.deliverNextMembershipNotification({ stateFilePath: capRun.ctx.stateFilePath, lineFetcher: fake(200, []), emailFetcher: fake(200, []) }) === null, "zero-payout cap exhaustion creates no false credited notification");

  console.log(`Phase I.4B.3E.2 referral payout notifications checks passed: ${checks}`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
