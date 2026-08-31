import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(os.tmpdir(), "kd-phase-i3c3-"));
process.env.KD_DATA_DIR = root;
const rulesModule = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const help = await import("../lib/adminRuleHelp");

let count = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  count += 1;
  console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
}
const identityAdapter = { assertMember: async () => undefined };

type Context = { stateFilePath: string; rulesFilePath: string; beneficiary: string; source: string };
async function fresh(name: string, options: { base?: number; returns?: number; cap?: number; reversal?: "cancel-pending-and-reverse-released" | "cancel-pending-only" } = {}): Promise<Context> {
  const dir = path.join(root, name);
  const stateFilePath = path.join(dir, "commerce.json");
  const rulesFilePath = path.join(dir, "rules.json");
  const rules = structuredClone(rulesModule.DEFAULT_MEMBERSHIP_RULES);
  rules.referral.referralMaxRewardDepth = 1;
  rules.referral.referralTotalRewardCap = 100;
  rules.referral.referralRewardBaseWaitingDays = options.base ?? 0;
  rules.referral.referralRewardReturnProtectionDays = options.returns ?? 0;
  rules.referral.referralMonthlyCreditCap = options.cap ?? 0;
  rules.referral.reversalPolicy = options.reversal ?? "cancel-pending-and-reverse-released";
  rules.referral.referrerEligibility = { mode: "active-subscription" };
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-07-01T00:00:00Z") }, rulesFilePath);
  const beneficiary = `SIM_${name}_A`, source = `SIM_${name}_B`;
  await commerce.assignReferralRelationship({ referrerMemberId: beneficiary, referredMemberId: source, idempotencyKey: `${name}:relation`, now: new Date("2026-07-01T01:00:00Z"), stateFilePath }, identityAdapter);
  return { stateFilePath, rulesFilePath, beneficiary, source };
}
async function reward(ctx: Context, sourceOrder: string, paid = 1000, at = "2026-08-01T01:00:00Z", rewardType: "new_referral" | "subscription" = "subscription") {
  const rewards = await commerce.createReferralRewardsFromFulfillment({ sourceMemberId: ctx.source, orderId: sourceOrder, rewardType, paidAmountBasis: paid, idempotencyKey: sourceOrder, now: new Date(at), stateFilePath: ctx.stateFilePath, rulesFilePath: ctx.rulesFilePath });
  assert.equal(rewards.length, 1);
  return rewards[0];
}
async function qualify(ctx: Context, rewardId: string, orderId: string, completedAt = "2026-08-02T01:00:00Z", orderType: "normal" | "subscription" = "normal") {
  await commerce.registerReferralQualificationOrder({ memberId: ctx.beneficiary, orderId, orderCreatedAt: "2026-08-01T02:00:00Z", orderType, idempotencyKey: `${orderId}:created`, now: new Date("2026-08-01T02:00:00Z"), stateFilePath: ctx.stateFilePath, rulesFilePath: ctx.rulesFilePath });
  await commerce.handleReferralQualificationOrderOutcome({ memberId: ctx.beneficiary, orderId, outcome: "completed", idempotencyKey: `${orderId}:completed`, now: new Date(completedAt), stateFilePath: ctx.stateFilePath, rulesFilePath: ctx.rulesFilePath });
  return (await commerce.readMembershipCommerceState(ctx.stateFilePath)).referralRewards[rewardId];
}

try {
  const basic = await fresh("BASIC", { base: 7, returns: 3 });
  const entitlement = await reward(basic, "B100", 1000, "2026-08-01T01:00:00Z", "new_referral");
  check("Scenario A never-subscribed beneficiary receives awaiting_order entitlement", entitlement.qualificationStatus === "awaiting_order");
  check("Scenario A entitlement creation creates no credit", Object.keys((await commerce.readMembershipCommerceState(basic.stateFilePath)).creditEntries).length === 0);
  await commerce.registerReferralQualificationOrder({ memberId: basic.beneficiary, orderId: "A200", orderCreatedAt: "2026-08-02T01:00:00Z", orderType: "normal", idempotencyKey: "A200:created", now: new Date("2026-08-02T01:00:00Z"), stateFilePath: basic.stateFilePath, rulesFilePath: basic.rulesFilePath });
  let basicState = await commerce.readMembershipCommerceState(basic.stateFilePath);
  check("Scenario B normal order moves to awaiting_completion", basicState.referralRewards[entitlement.rewardId].qualificationStatus === "awaiting_completion");
  await commerce.handleReferralQualificationOrderOutcome({ memberId: basic.beneficiary, orderId: "A200", outcome: "completed", idempotencyKey: "A200:completed", now: new Date("2026-08-03T07:30:00Z"), stateFilePath: basic.stateFilePath, rulesFilePath: basic.rulesFilePath });
  basicState = await commerce.readMembershipCommerceState(basic.stateFilePath);
  check("Scenario W source and qualification orders stay distinct", basicState.referralRewards[entitlement.rewardId].sourceOrderNumber === "B100" && basicState.referralRewards[entitlement.rewardId].qualificationOrderNumber === "A200");
  check("Source and qualification transaction states use separate fields", basicState.referralRewards[entitlement.rewardId].sourceOrderFinalState === "completed" && basicState.referralRewards[entitlement.rewardId].qualificationOrderFinalState === "completed");
  check("Scenario B qualified pickup starts 7+3 waiting", basicState.referralRewards[entitlement.rewardId].qualificationStatus === "qualified" && basicState.referralRewards[entitlement.rewardId].releaseEligibleBusinessDate === "2026-08-13");
  check("Qualified pickup still creates no credit", Object.keys(basicState.creditEntries).length === 0);

  const subscription = await fresh("SUBSCRIPTION");
  const subscriptionReward = await reward(subscription, "SOURCE_SUB");
  const subscriptionQualified = await qualify(subscription, subscriptionReward.rewardId, "QUAL_SUB", "2026-08-02T01:00:00Z", "subscription");
  check("Scenario C subscription-generated order qualifies", subscriptionQualified.qualificationStatus === "qualified" && subscriptionQualified.qualificationAttempts?.[0]?.orderType === "subscription");

  const sourceBefore = await fresh("SOURCE_BEFORE", { base: 7, returns: 3 });
  const sourceBeforeReward = await reward(sourceBefore, "SOURCE_BEFORE_ORDER");
  await qualify(sourceBefore, sourceBeforeReward.rewardId, "QUAL_SOURCE_BEFORE");
  await commerce.cancelOrReverseReferralRewards({ orderId: "SOURCE_BEFORE_ORDER", outcome: "refunded", idempotencyKey: "source-before-refund", now: new Date("2026-08-05T00:00:00Z"), stateFilePath: sourceBefore.stateFilePath, rulesFilePath: sourceBefore.rulesFilePath });
  let state = await commerce.readMembershipCommerceState(sourceBefore.stateFilePath);
  check("Scenario X source refund before release cancels reward with source reason", state.referralRewards[sourceBeforeReward.rewardId].status === "cancelled" && state.referralRewards[sourceBeforeReward.rewardId].cancellationReason === "source_transaction_reversed_before_release");
  check("Scenario X source refund before release creates no credit", Object.keys(state.creditEntries).length === 0);

  const sourceAfter = await fresh("SOURCE_AFTER");
  const sourceAfterReward = await reward(sourceAfter, "SOURCE_AFTER_ORDER");
  await qualify(sourceAfter, sourceAfterReward.rewardId, "QUAL_SOURCE_AFTER");
  await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-08-02T02:00:00Z"), stateFilePath: sourceAfter.stateFilePath, rulesFilePath: sourceAfter.rulesFilePath });
  await commerce.cancelOrReverseReferralRewards({ orderId: "SOURCE_AFTER_ORDER", outcome: "returned", idempotencyKey: "source-after-return", now: new Date("2026-08-03T00:00:00Z"), stateFilePath: sourceAfter.stateFilePath, rulesFilePath: sourceAfter.rulesFilePath });
  state = await commerce.readMembershipCommerceState(sourceAfter.stateFilePath);
  check("Scenario Y source refund after release follows reversal snapshot", state.referralRewards[sourceAfterReward.rewardId].status === "reversed" && state.referralRewards[sourceAfterReward.rewardId].reversalPolicySnapshot === "cancel-pending-and-reverse-released");

  const qualBefore = await fresh("QUAL_BEFORE", { base: 7, returns: 3 });
  const qualBeforeReward = await reward(qualBefore, "SOURCE_QUAL_BEFORE");
  await qualify(qualBefore, qualBeforeReward.rewardId, "QUAL_BEFORE_ORDER");
  await commerce.handleReferralQualificationOrderOutcome({ memberId: qualBefore.beneficiary, orderId: "QUAL_BEFORE_ORDER", outcome: "refunded", idempotencyKey: "qual-before-refund", now: new Date("2026-08-05T00:00:00Z"), stateFilePath: qualBefore.stateFilePath, rulesFilePath: qualBefore.rulesFilePath });
  state = await commerce.readMembershipCommerceState(qualBefore.stateFilePath);
  check("Scenario O qualification refund before release invalidates qualification", state.referralRewards[qualBeforeReward.rewardId].qualificationStatus !== "qualified");
  check("Scenario O qualification refund before release creates no credit", Object.keys(state.creditEntries).length === 0);

  const qualAfter = await fresh("QUAL_AFTER");
  const qualAfterReward = await reward(qualAfter, "SOURCE_QUAL_AFTER");
  await qualify(qualAfter, qualAfterReward.rewardId, "QUAL_AFTER_ORDER");
  await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-08-02T02:00:00Z"), stateFilePath: qualAfter.stateFilePath, rulesFilePath: qualAfter.rulesFilePath });
  await commerce.handleReferralQualificationOrderOutcome({ memberId: qualAfter.beneficiary, orderId: "QUAL_AFTER_ORDER", outcome: "returned", idempotencyKey: "qual-after-return", now: new Date("2026-08-03T00:00:00Z"), stateFilePath: qualAfter.stateFilePath, rulesFilePath: qualAfter.rulesFilePath });
  state = await commerce.readMembershipCommerceState(qualAfter.stateFilePath);
  check("Scenario Z qualification refund after release follows reversal snapshot", state.referralRewards[qualAfterReward.rewardId].status === "reversed");
  check("Reversal uses one append-only negative ledger", Object.values(state.creditEntries).filter((entry) => entry.amount < 0).length === 1);

  const cap = await fresh("CAP", { cap: 500 });
  const capRewards = [
    await reward(cap, "CAP_A", 6000, "2026-08-01T01:00:00Z"),
    await reward(cap, "CAP_B", 6000, "2026-08-01T01:01:00Z"),
    await reward(cap, "CAP_C", 6000, "2026-08-01T01:02:00Z"),
  ];
  check("Scenario Q three pending rewards consume no formal cap", capRewards.every((item) => item.monthlyCapUsageAtRelease === null) && Object.keys((await commerce.readMembershipCommerceState(cap.stateFilePath)).creditEntries).length === 0);
  await qualify(cap, capRewards[0].rewardId, "CAP_QUAL");
  const capRun = await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-08-02T02:00:00Z"), stateFilePath: cap.stateFilePath, rulesFilePath: cap.rulesFilePath });
  state = await commerce.readMembershipCommerceState(cap.stateFilePath);
  check("Scenario R first reward releases 300", state.referralRewards[capRewards[0].rewardId].calculatedCreditAmount === 300);
  check("Scenario R second reward partial releases 200 and limits 100", state.referralRewards[capRewards[1].rewardId].calculatedCreditAmount === 200 && state.referralRewards[capRewards[1].rewardId].monthlyCapLimitedAmount === 100);
  check("Scenario S exhausted reward creates no credit", capRun.some((item) => item.rewardId === capRewards[2].rewardId && item.status === "cap_blocked") && !Object.values(state.creditEntries).some((entry) => entry.metadata.rewardId === capRewards[2].rewardId));
  check("Scenario S exhausted reward preserves explicit domain reason", state.referralRewards[capRewards[2].rewardId].cancellationReason === "monthly_cap_exhausted_at_release");
  check("Released cap usage totals exactly 500", Object.values(state.referralRewards).filter((item) => item.status === "released").reduce((sum, item) => sum + item.calculatedCreditAmount, 0) === 500);
  const capCreditCount = Object.keys(state.creditEntries).length;
  await Promise.all([commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-08-02T03:00:00Z"), stateFilePath: cap.stateFilePath, rulesFilePath: cap.rulesFilePath }), commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-08-02T03:00:00Z"), stateFilePath: cap.stateFilePath, rulesFilePath: cap.rulesFilePath })]);
  check("Duplicate concurrent scheduler does not create another credit", Object.keys((await commerce.readMembershipCommerceState(cap.stateFilePath)).creditEntries).length === capCreditCount);

  const graphDir = path.join(root, "GRAPH"), graphState = path.join(graphDir, "commerce.json"), graphRules = path.join(graphDir, "rules.json");
  const graphRuleSet = structuredClone(rulesModule.DEFAULT_MEMBERSHIP_RULES); graphRuleSet.referral.referralTotalRewardCap = 100;
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: 0, rules: graphRuleSet, now: new Date("2026-07-01T00:00:00Z") }, graphRules);
  const members = "ABCDEFG".split("").map((letter) => `SIM_MEMBER_${letter}`);
  for (let index = 1; index < members.length; index += 1) await commerce.assignReferralRelationship({ referrerMemberId: members[index - 1], referredMemberId: members[index], idempotencyKey: `graph:${index}`, now: new Date("2026-07-01T01:00:00Z"), stateFilePath: graphState }, identityAdapter);
  const graphRewards = await commerce.createReferralRewardsFromFulfillment({ sourceMemberId: members[6], orderId: "G_SOURCE", rewardType: "subscription", paidAmountBasis: 1000, idempotencyKey: "G_SOURCE", now: new Date("2026-08-01T01:00:00Z"), stateFilePath: graphState, rulesFilePath: graphRules });
  const configuredLevels = graphRuleSet.referral.levels.filter((level) => level.enabled && level.level <= graphRuleSet.referral.referralMaxRewardDepth);
  check("Multi-generation A to G respects configured depth", graphRewards.length === configuredLevels.length && graphRewards.every((item) => item.referralLevel <= graphRuleSet.referral.referralMaxRewardDepth));
  check("Multi-generation rates derive from rule snapshot", graphRewards.every((item) => item.rewardRate === configuredLevels.find((level) => level.level === item.referralLevel)?.subscriptionRewardRate));
  await commerce.registerReferralQualificationOrder({ memberId: members[5], orderId: "F_QUAL", orderCreatedAt: "2026-08-02T01:00:00Z", orderType: "normal", idempotencyKey: "F_QUAL:create", now: new Date("2026-08-02T01:00:00Z"), stateFilePath: graphState, rulesFilePath: graphRules });
  await commerce.handleReferralQualificationOrderOutcome({ memberId: members[5], orderId: "F_QUAL", outcome: "completed", idempotencyKey: "F_QUAL:complete", now: new Date("2026-08-03T01:00:00Z"), stateFilePath: graphState, rulesFilePath: graphRules });
  state = await commerce.readMembershipCommerceState(graphState);
  check("Each generation has independent qualification", state.referralRewards[graphRewards.find((item) => item.beneficiaryMemberId === members[5])!.rewardId].qualificationStatus === "qualified" && state.referralRewards[graphRewards.find((item) => item.beneficiaryMemberId === members[4])!.rewardId].qualificationStatus === "awaiting_order");
  check("Self referral is blocked", (await Promise.allSettled([commerce.assignReferralRelationship({ referrerMemberId: members[0], referredMemberId: members[0], idempotencyKey: "self", stateFilePath: graphState }, identityAdapter)]))[0].status === "rejected");
  check("Referral cycle is blocked", (await Promise.allSettled([commerce.assignReferralRelationship({ referrerMemberId: members[6], referredMemberId: members[0], idempotencyKey: "cycle", stateFilePath: graphState }, identityAdapter)]))[0].status === "rejected");
  check("Reparent is blocked", (await Promise.allSettled([commerce.assignReferralRelationship({ referrerMemberId: members[2], referredMemberId: members[1], idempotencyKey: "reparent", stateFilePath: graphState }, identityAdapter)]))[0].status === "rejected");
  const once = await commerce.createReferralRewardsFromFulfillment({ sourceMemberId: members[6], orderId: "G_NEW_1", rewardType: "new_referral", paidAmountBasis: 1000, idempotencyKey: "G_NEW_1", now: new Date("2026-08-04T01:00:00Z"), stateFilePath: graphState, rulesFilePath: graphRules });
  const twice = await commerce.createReferralRewardsFromFulfillment({ sourceMemberId: members[6], orderId: "G_NEW_2", rewardType: "new_referral", paidAmountBasis: 1000, idempotencyKey: "G_NEW_2", now: new Date("2026-08-05T01:00:00Z"), stateFilePath: graphState, rulesFilePath: graphRules });
  check("Once-only new referral is enforced", once.length === configuredLevels.length && twice.length === 0);
  const recurring = await commerce.createReferralRewardsFromFulfillment({ sourceMemberId: members[6], orderId: "G_SUB_2", rewardType: "subscription", paidAmountBasis: 1000, idempotencyKey: "G_SUB_2", now: new Date("2026-08-06T01:00:00Z"), stateFilePath: graphState, rulesFilePath: graphRules });
  const recurringReplay = await commerce.createReferralRewardsFromFulfillment({ sourceMemberId: members[6], orderId: "G_SUB_2", rewardType: "subscription", paidAmountBasis: 1000, idempotencyKey: "G_SUB_2", now: new Date("2026-08-06T01:00:00Z"), stateFilePath: graphState, rulesFilePath: graphRules });
  check("Recurring subscription reward is allowed and duplicate event is idempotent", recurring.length === configuredLevels.length && recurringReplay.length === configuredLevels.length && Object.values((await commerce.readMembershipCommerceState(graphState)).referralRewards).filter((item) => item.sourceOrderNumber === "G_SUB_2").length === configuredLevels.length);

  const memberUi = await readFile(path.join(process.cwd(), "components/member/MemberReferralCenter.tsx"), "utf8");
  const adminUi = await readFile(path.join(process.cwd(), "app/admin/referrals/page.tsx"), "utf8");
  const settingsUi = await readFile(path.join(process.cwd(), "components/admin/MembershipRulesManager.tsx"), "utf8");
  check("Cap exhausted Member Center reason is Owner-friendly", memberUi.includes("本月推薦獎勵上限已達") && memberUi.includes("monthly_cap_exhausted_at_release"));
  check("Cap exhausted Admin reason is Owner-friendly", adminUi.includes("本月推薦獎勵上限已達") && adminUi.includes("cancellationReasonLabel"));
  check("Admin exposes qualification base return and total settings", ["referralRewardQualificationWindowDays", "referralRewardBaseWaitingDays", "referralRewardReturnProtectionDays", "實際總等待"].every((text) => settingsUi.includes(text)));
  check("Admin Help has canonical date-only semantics", help.getAdminRuleHelpDefinition("referral.referralRewardBaseWaitingDays")?.runtimeBehavior.includes("不看成功取貨的時、分、秒") && help.getAdminRuleHelpDefinition("referral.referralRewardReturnProtectionDays")?.historicalImpact.includes("既有 reward 使用建立時 snapshot"));
  check("Member Center uses masked aggregate projection", memberUi.includes("safeDisplayName") && !memberUi.includes("email") && !memberUi.includes("phone") && !memberUi.includes("address"));
  check("Acceptance-specific scenarios all passed", count >= 35);
  console.log(`\nPhase I.3C.3 final acceptance: ${count} checks PASS`);
} finally {
  await rm(root, { recursive: true, force: true });
}
