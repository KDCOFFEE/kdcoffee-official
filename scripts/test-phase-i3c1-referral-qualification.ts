import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(os.tmpdir(), "kd-phase-i3c1-"));
process.env.KD_DATA_DIR = root;
const rulesModule = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");

let count = 0;
function check(name: string, value: unknown) {
  assert.ok(value, name);
  count += 1;
  console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
}

type Context = { dir: string; stateFilePath: string; rulesFilePath: string; members: string[] };
const identityAdapter = { assertMember: async () => undefined };

async function fresh(name: string, days = 30, delayDays = 7): Promise<Context> {
  const dir = path.join(root, name);
  const stateFilePath = path.join(dir, "commerce.json");
  const rulesFilePath = path.join(dir, "rules.json");
  const rules = structuredClone(rulesModule.DEFAULT_MEMBERSHIP_RULES);
  rules.referral.referralRewardQualificationWindowDays = days;
  rules.referral.referralRewardBaseWaitingDays = delayDays;
  rules.referral.referralRewardReturnProtectionDays = 0;
  rules.referral.referralTotalRewardCap = 100;
  rules.referral.referrerEligibility = { mode: "active-subscription" };
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-08-01T00:00:00Z") }, rulesFilePath);
  const members = ["A", "B", "C", "D", "E", "F"].map((letter) => `MEMBER_${name}_${letter}`);
  for (let index = 1; index < members.length; index += 1) {
    await commerce.assignReferralRelationship({ referrerMemberId: members[index - 1], referredMemberId: members[index], idempotencyKey: `${name}:${index}`, now: new Date("2026-08-01T01:00:00Z"), stateFilePath }, identityAdapter);
  }
  return { dir, stateFilePath, rulesFilePath, members };
}

async function reward(ctx: Context, orderId: string, now = "2026-08-01T04:00:00Z", rewardType: "new_referral" | "subscription" = "subscription") {
  return commerce.createReferralRewardsFromFulfillment({ sourceMemberId: ctx.members[5], orderId, rewardType, paidAmountBasis: 1000, basePV: 100, effectivePV: 100, discountRatio: 1, idempotencyKey: orderId, now: new Date(now), stateFilePath: ctx.stateFilePath, rulesFilePath: ctx.rulesFilePath });
}

async function place(ctx: Context, memberId: string, orderId: string, createdAt: string, orderType: "normal" | "subscription" = "normal", key = orderId) {
  return commerce.registerReferralQualificationOrder({ memberId, orderId, orderCreatedAt: createdAt, orderType, idempotencyKey: key, now: new Date(createdAt), stateFilePath: ctx.stateFilePath, rulesFilePath: ctx.rulesFilePath });
}

async function finish(ctx: Context, memberId: string, orderId: string, outcome: "completed" | "cancelled" | "uncollected" | "refunded" | "returned", at: string, key = `${orderId}:${outcome}`) {
  return commerce.handleReferralQualificationOrderOutcome({ memberId, orderId, outcome, idempotencyKey: key, now: new Date(at), stateFilePath: ctx.stateFilePath, rulesFilePath: ctx.rulesFilePath });
}

function forMember(rewards: Awaited<ReturnType<typeof reward>>, memberId: string) {
  const found = rewards.find((item) => item.beneficiaryMemberId === memberId);
  assert.ok(found);
  return found;
}

try {
  const base = await fresh("base");
  const baseRewards = await reward(base, "SOURCE_BASE");
  const eBase = forMember(baseRewards, base.members[4]);
  check("reward event creates qualification entitlement", baseRewards.length === 5 && baseRewards.every((item) => item.qualificationStatus === "awaiting_order"));
  check("no active subscription no longer discards reward", baseRewards.some((item) => item.beneficiaryMemberId === base.members[0]));
  check("qualification window default is 30 days", eBase.qualificationWindowDays === 30);
  check("qualification starts at reward creation instant", eBase.qualificationStartedAt === eBase.createdAt);
  check("qualification expiry is last Taipei moment of day 30", eBase.qualificationExpiresAt === "2026-08-30T23:59:59.999+08:00");
  check("qualification snapshot keeps generation and calculation fields", eBase.referralLevel === 1 && eBase.calculationMode === "paid_amount" && eBase.rewardRate === 5 && eBase.ruleVersion > 0);
  check("qualification starts without credit", Object.keys((await commerce.readMembershipCommerceState(base.stateFilePath)).creditEntries).length === 0);

  const ownerRulesStore = await rulesModule.readMembershipRulesStore(base.rulesFilePath);
  const changedRules = structuredClone(ownerRulesStore.versions.at(-1)!.rules);
  changedRules.referral.referralRewardQualificationWindowDays = 60;
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: ownerRulesStore.revision, rules: changedRules, now: new Date("2026-08-02T00:00:00Z") }, base.rulesFilePath);
  const later = await reward(base, "SOURCE_LATER", "2026-08-02T04:00:00Z");
  check("Owner configurable N days applies to new rewards", later.every((item) => item.qualificationWindowDays === 60));
  check("existing reward snapshot keeps original N", eBase.qualificationWindowDays === 30 && (await commerce.readMembershipCommerceState(base.stateFilePath)).referralRewards[eBase.rewardId].qualificationWindowDays === 30);
  check("changing qualification days does not mutate waiting snapshot", (await commerce.readMembershipCommerceState(base.stateFilePath)).referralRewards[eBase.rewardId].scheduledReleaseAt === eBase.scheduledReleaseAt);

  const within = await fresh("within");
  const withinRewards = await reward(within, "SOURCE_WITHIN");
  const eWithin = forMember(withinRewards, within.members[4]);
  const bound = await place(within, within.members[4], "ORDER_E_DAY20", "2026-08-20T04:00:00Z");
  check("order created within window binds attempt", bound.some((item) => item.rewardId === eWithin.rewardId));
  let state = await commerce.readMembershipCommerceState(within.stateFilePath);
  check("bound attempt waits for completion", state.referralRewards[eWithin.rewardId].qualificationStatus === "awaiting_completion");
  check("qualification order trace is distinct from source order", state.referralRewards[eWithin.rewardId].sourceOrderNumber === "SOURCE_WITHIN" && state.referralRewards[eWithin.rewardId].qualificationOrderNumber === "ORDER_E_DAY20");
  check("qualification attempt does not grant credit", Object.keys(state.creditEntries).length === 0);
  await finish(within, within.members[4], "ORDER_E_DAY20", "completed", "2026-09-03T04:00:00Z");
  state = await commerce.readMembershipCommerceState(within.stateFilePath);
  check("pickup after expiry qualifies when order was in-window", state.referralRewards[eWithin.rewardId].qualificationStatus === "qualified");
  check("successful qualifying order records final state", state.referralRewards[eWithin.rewardId].qualificationOrderFinalState === "completed");
  const released = await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-09-10T00:00:00Z"), stateFilePath: within.stateFilePath, rulesFilePath: within.rulesFilePath });
  check("credit follows existing release scheduler only", released.some((item) => item.rewardId === eWithin.rewardId && item.status === "released"));
  const creditCount = Object.keys((await commerce.readMembershipCommerceState(within.stateFilePath)).creditEntries).length;
  await finish(within, within.members[4], "ORDER_E_DAY20", "completed", "2026-09-03T04:00:00Z", "duplicate-fulfillment");
  await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-09-04T12:00:00Z"), stateFilePath: within.stateFilePath, rulesFilePath: within.rulesFilePath });
  check("duplicate fulfillment and scheduler do not double release", Object.keys((await commerce.readMembershipCommerceState(within.stateFilePath)).creditEntries).length === creditCount);
  check("active subscription is not required", !Object.values(state.subscriptions).some((item) => item.memberId === within.members[4]));

  const boundary = await fresh("boundary");
  const boundaryRewards = await reward(boundary, "SOURCE_BOUNDARY");
  const eBoundary = forMember(boundaryRewards, boundary.members[4]);
  check("last valid day 23:59 order qualifies for binding", (await place(boundary, boundary.members[4], "ORDER_LAST_MINUTE", "2026-08-30T15:59:00Z")).some((item) => item.rewardId === eBoundary.rewardId));
  await finish(boundary, boundary.members[4], "ORDER_LAST_MINUTE", "completed", "2026-09-04T04:00:00Z");
  check("last-day order succeeds after expiry", (await commerce.readMembershipCommerceState(boundary.stateFilePath)).referralRewards[eBoundary.rewardId].qualificationStatus === "qualified");
  check("post-window order cannot bind", (await place(boundary, boundary.members[3], "ORDER_TOO_LATE", "2026-08-30T16:01:00Z")).length === 0);

  const retry = await fresh("retry");
  const retryRewards = await reward(retry, "SOURCE_RETRY");
  const eRetry = forMember(retryRewards, retry.members[4]);
  await place(retry, retry.members[4], "ORDER_FAIL_1", "2026-08-10T04:00:00Z");
  await finish(retry, retry.members[4], "ORDER_FAIL_1", "cancelled", "2026-08-15T04:00:00Z");
  state = await commerce.readMembershipCommerceState(retry.stateFilePath);
  check("cancelled qualifying order returns to awaiting order", state.referralRewards[eRetry.rewardId].qualificationStatus === "awaiting_order");
  await place(retry, retry.members[4], "ORDER_RETRY_2", "2026-08-20T04:00:00Z");
  await finish(retry, retry.members[4], "ORDER_RETRY_2", "completed", "2026-08-25T04:00:00Z");
  check("failed order before expiry allows later valid attempt", (await commerce.readMembershipCommerceState(retry.stateFilePath)).referralRewards[eRetry.rewardId].qualificationOrderNumber === "ORDER_RETRY_2");
  check("attempt audit retains failed and completed orders", (await commerce.readMembershipCommerceState(retry.stateFilePath)).referralRewards[eRetry.rewardId].qualificationAttempts?.length === 2);

  for (const failure of ["uncollected", "refunded", "returned"] as const) {
    const ctx = await fresh(`failure-${failure}`);
    const rewards = await reward(ctx, `SOURCE_${failure}`);
    const target = forMember(rewards, ctx.members[4]);
    await place(ctx, ctx.members[4], `ORDER_${failure}`, "2026-08-10T04:00:00Z");
    await finish(ctx, ctx.members[4], `ORDER_${failure}`, failure, "2026-08-15T04:00:00Z");
    const result = (await commerce.readMembershipCommerceState(ctx.stateFilePath)).referralRewards[target.rewardId];
    check(`${failure} qualifying order does not qualify`, result.qualificationStatus === "awaiting_order" && result.qualificationOrderFinalState === failure);
  }

  const pending = await fresh("pending");
  const pendingRewards = await reward(pending, "SOURCE_PENDING");
  const ePending = forMember(pendingRewards, pending.members[4]);
  await place(pending, pending.members[4], "ORDER_PENDING", "2026-08-29T04:00:00Z");
  await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-08-31T04:00:00Z"), stateFilePath: pending.stateFilePath, rulesFilePath: pending.rulesFilePath });
  check("pending in-window order is not expired when window ends", (await commerce.readMembershipCommerceState(pending.stateFilePath)).referralRewards[ePending.rewardId].qualificationStatus === "awaiting_completion");
  await finish(pending, pending.members[4], "ORDER_PENDING", "completed", "2026-09-04T04:00:00Z");
  check("pending in-window order later succeeds", (await commerce.readMembershipCommerceState(pending.stateFilePath)).referralRewards[ePending.rewardId].qualificationStatus === "qualified");

  const pendingFail = await fresh("pending-fail");
  const pendingFailRewards = await reward(pendingFail, "SOURCE_PENDING_FAIL");
  const ePendingFail = forMember(pendingFailRewards, pendingFail.members[4]);
  await place(pendingFail, pendingFail.members[4], "ORDER_PENDING_FAIL", "2026-08-29T04:00:00Z");
  await finish(pendingFail, pendingFail.members[4], "ORDER_PENDING_FAIL", "cancelled", "2026-09-04T04:00:00Z");
  check("in-window attempt failing after expiry becomes expired", (await commerce.readMembershipCommerceState(pendingFail.stateFilePath)).referralRewards[ePendingFail.rewardId].qualificationStatus === "expired");
  check("post-expiry replacement cannot revive entitlement", (await place(pendingFail, pendingFail.members[4], "ORDER_POST_EXPIRY", "2026-09-05T04:00:00Z")).length === 0);

  const expired = await fresh("expired");
  const expiredRewards = await reward(expired, "SOURCE_EXPIRED");
  const eExpired = forMember(expiredRewards, expired.members[4]);
  const expiryRun = await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-08-31T04:00:00Z"), stateFilePath: expired.stateFilePath, rulesFilePath: expired.rulesFilePath });
  check("no qualifying order by expiry becomes expired", expiryRun.some((item) => item.rewardId === eExpired.rewardId && item.status === "expired"));
  state = await commerce.readMembershipCommerceState(expired.stateFilePath);
  check("expired entitlement is retained for audit", Boolean(state.referralRewards[eExpired.rewardId]) && state.referralRewards[eExpired.rewardId].qualificationStatus === "expired");
  check("duplicate expiry scheduler is idempotent", !(await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-09-01T04:00:00Z"), stateFilePath: expired.stateFilePath, rulesFilePath: expired.rulesFilePath })).some((item) => item.rewardId === eExpired.rewardId));

  const multiple = await fresh("multiple");
  const multipleRewards = await reward(multiple, "SOURCE_MULTIPLE");
  const eMultiple = forMember(multipleRewards, multiple.members[4]);
  await place(multiple, multiple.members[4], "ORDER_MULTI_1", "2026-08-10T04:00:00Z", "normal");
  await place(multiple, multiple.members[4], "ORDER_MULTI_2", "2026-08-11T04:00:00Z", "subscription");
  check("normal purchase can qualify", (await commerce.readMembershipCommerceState(multiple.stateFilePath)).referralRewards[eMultiple.rewardId].qualificationAttempts?.some((item) => item.orderType === "normal"));
  check("subscription purchase can qualify", (await commerce.readMembershipCommerceState(multiple.stateFilePath)).referralRewards[eMultiple.rewardId].qualificationAttempts?.some((item) => item.orderType === "subscription"));
  await finish(multiple, multiple.members[4], "ORDER_MULTI_2", "completed", "2026-08-20T04:00:00Z");
  await finish(multiple, multiple.members[4], "ORDER_MULTI_1", "completed", "2026-08-21T04:00:00Z");
  state = await commerce.readMembershipCommerceState(multiple.stateFilePath);
  check("multiple successful orders select deterministic earliest created", state.referralRewards[eMultiple.rewardId].qualificationOrderNumber === "ORDER_MULTI_1");
  await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-08-28T04:00:00Z"), stateFilePath: multiple.stateFilePath, rulesFilePath: multiple.rulesFilePath });
  check("multiple qualifying orders produce one credit", Object.values((await commerce.readMembershipCommerceState(multiple.stateFilePath)).creditEntries).filter((item) => item.metadata.rewardId === eMultiple.rewardId).length === 1);
  check("duplicate order-created event is idempotent", (await place(multiple, multiple.members[4], "ORDER_MULTI_1", "2026-08-10T04:00:00Z", "normal", "duplicate-create")).filter((item) => item.rewardId === eMultiple.rewardId).length === 0 || (await commerce.readMembershipCommerceState(multiple.stateFilePath)).referralRewards[eMultiple.rewardId].qualificationAttempts?.filter((item) => item.orderNumber === "ORDER_MULTI_1").length === 1);

  const chain = await fresh("chain");
  const chainRewards = await reward(chain, "SOURCE_CHAIN");
  check("five-generation chain creates independent windows", chainRewards.length === 5 && new Set(chainRewards.map((item) => item.beneficiaryMemberId)).size === 5);
  await place(chain, chain.members[4], "ORDER_E_ONLY", "2026-08-10T04:00:00Z");
  await finish(chain, chain.members[4], "ORDER_E_ONLY", "completed", "2026-08-12T04:00:00Z");
  state = await commerce.readMembershipCommerceState(chain.stateFilePath);
  check("each beneficiary requires own purchase", state.referralRewards[forMember(chainRewards, chain.members[4]).rewardId].qualificationStatus === "qualified");
  check("one beneficiary purchase does not unlock another", state.referralRewards[forMember(chainRewards, chain.members[3]).rewardId].qualificationStatus === "awaiting_order");
  check("generation rate snapshot remains correct", chainRewards.find((item) => item.referralLevel === 1)?.rewardRate === 5 && chainRewards.find((item) => item.referralLevel === 5)?.rewardRate === 0.5);

  const once = await fresh("once");
  const firstNew = await reward(once, "SOURCE_NEW_1", "2026-08-01T04:00:00Z", "new_referral");
  const secondNew = await reward(once, "SOURCE_NEW_2", "2026-08-02T04:00:00Z", "new_referral");
  check("once-only new referral invariant remains", firstNew.length === 5 && secondNew.length === 0);
  const recurring1 = await reward(once, "SOURCE_SUB_1", "2026-08-03T04:00:00Z", "subscription");
  const recurringReplay = await commerce.createReferralRewardsFromFulfillment({ sourceMemberId: once.members[5], orderId: "SOURCE_SUB_1", rewardType: "subscription", paidAmountBasis: 1000, idempotencyKey: "SOURCE_SUB_1", now: new Date("2026-08-03T04:00:00Z"), stateFilePath: once.stateFilePath, rulesFilePath: once.rulesFilePath });
  check("recurring subscription reward remains idempotent", recurring1.length === 5 && recurringReplay.length === 5 && Object.values((await commerce.readMembershipCommerceState(once.stateFilePath)).referralRewards).filter((item) => item.sourceOrderNumber === "SOURCE_SUB_1").length === 5);

  const compatibility = await fresh("compatibility");
  const compatibilityState = await commerce.readMembershipCommerceState(compatibility.stateFilePath);
  check("production state remains isolated", Object.keys(compatibilityState.creditEntries).length === 0 && compatibility.stateFilePath.startsWith(root));
  const legacyState = structuredClone(await commerce.readMembershipCommerceState(base.stateFilePath));
  const legacyReward = Object.values(legacyState.referralRewards)[0];
  delete legacyReward.qualificationWindowDays; delete legacyReward.qualificationStartedAt; delete legacyReward.qualificationExpiresAt; delete legacyReward.qualificationStatus; delete legacyReward.qualificationAttempts;
  check("legacy reward without qualification metadata remains readable", commerce.validateMembershipCommerceState(legacyState).referralRewards[legacyReward.rewardId].rewardId === legacyReward.rewardId);
  check("qualification and reward waiting are separate snapshots", eBase.qualificationExpiresAt !== eBase.scheduledReleaseAt && eBase.qualificationWindowDays === 30);
  check("08:00 due offset is absent", !(await readFile(path.join(process.cwd(), "lib", "membershipCommerce.ts"), "utf8")).includes("Date.parse(item.scheduledReleaseAt) + 8 * 3_600_000"));
  check("at least 48 qualification scenarios", count >= 48);
  console.log(`\nPhase I.3C.1 referral qualification: ${count} scenarios PASS`);
} finally {
  await rm(root, { recursive: true, force: true });
}
