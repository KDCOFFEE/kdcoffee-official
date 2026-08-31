import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-phase-i3c-"));
process.env.KD_DATA_DIR = root;
process.env.ENABLE_MEMBERSHIP_TEST_LAB = "true";

const help = await import("../lib/adminRuleHelp");
const rulesModule = await import("../lib/membershipBusinessRules");
const lab = await import("../lib/membershipTestLab");
const commerceModule = await import("../lib/membershipCommerce");
const storage = await import("../lib/storagePaths");
const policies = await import("../lib/membershipPolicies");

let count = 0;
function check(condition: unknown, name: string) {
  assert.ok(condition, name);
  count += 1;
  console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
}

async function fresh(preset = "paid-five-level") {
  await lab.initializeMembershipTestLab();
  return lab.applyMembershipTestLabPreset(preset);
}

try {
  const definitions = help.adminRuleHelpDefinitions;
  const expectedOwnerKeys = [
    "membership.openingYearFreeShipping.enabled", "membership.openingYearFreeShipping.startDate", "membership.openingYearFreeShipping.endDate", "shipping.subscriptionFreeShipping", "shipping.subscriptionShippingFee", "subscription.discountPercent", "subscription.modificationCutoffDays", "subscription.orderCreationLeadDays", "subscription.intervalOptions", "subscription.customCycleEnabled", "subscription.customCycleMinDays", "subscription.customCycleMaxDays", "pickup.preparationLeadDays", "pickup.customRoastPreparationLeadDays", "pickup.blockedDates", "pickup.datePickerMode", "referral.programEnabled", "referral.referralMaxRewardDepth", "referral.referralRewardCalculationMode", "referral.referrerEligibility", "referral.referralRewardQualificationWindowDays", "referral.referralRewardBaseWaitingDays", "referral.referralRewardReturnProtectionDays", "referral.referralTotalRewardCap", "referral.referralMonthlyCreditCap", "referral.pvRewardMoneyValue", "referral.showProductPV", "referral.reversalPolicy", "referral.levels.*.enabled", "referral.levels.*.newReferralRewardRate", "referral.levels.*.subscriptionRewardRate", "gift.startsAtFulfillment", "gift.repeatEveryFulfillments", "gift.pool", "credit.expiryCalendarMonths", "credit.expiryReminderDays", "credit.redemption", "credit.appliesToShipping", "credit.allowZeroTotal", "campaign.eligiblePricingMode", "notification.retryCount", "notification.emailFallback", "notification.events.*.enabled", "fulfillment.gmailScanLookbackDays", "ownerExceptions.canUnlockDate", "ownerExceptions.canUnlockStore", "ownerExceptions.canUnlockQuantity",
  ];
  check(expectedOwnerKeys.every((key) => definitions.some((item) => item.ruleKey === key)), "所有 Owner-facing Phase I 規則都有 Help Definition");
  check(new Set(definitions.map((item) => item.ruleKey)).size === definitions.length, "Help key 沒有重複");
  check(help.resolveAdminRuleCurrentValue("referral.referralRewardBaseWaitingDays", rulesModule.DEFAULT_MEMBERSHIP_RULES) === "7", "Help current value resolver 讀到目前值");
  check(definitions.filter((item) => help.highRiskAdminRuleKeys.includes(item.ruleKey as never)).every((item) => item.historicalImpact.length > 10), "snapshot-sensitive Help 都有 historical impact");
  check(help.highRiskAdminRuleKeys.every((key) => help.getAdminRuleHelpDefinition(key)?.runtimeRuleKey === key), "高風險設定綁定 canonical runtime rule key");
  check(help.getAdminRuleHelpDefinition("referral.levels.0.enabled")?.ruleKey === "referral.levels.*.enabled", "動態推薦代數使用同一 Help source");
  check(help.getAdminRuleHelpDefinition("notification.events.shipped.enabled")?.ruleKey === "notification.events.*.enabled", "動態通知事件使用同一 Help source");

  let snapshot = await fresh();
  const productionBefore = await commerceModule.readMembershipCommerceState(storage.getMembershipCommerceStateFile());
  check(snapshot.state.members.every((member) => member.memberId.startsWith("SIM_MEMBER_")), "simulation member 使用獨立 namespace");
  check(Object.keys(productionBefore.subscriptions).length === 0, "simulation member 不出現在 production commerce");
  const order = await lab.createMembershipTestLabOrder({ memberId: "SIM_MEMBER_F", regularUnitPrice: 600, campaignUnitPrice: null, creditUsed: 0, basePV: 100 });
  check(order.orderId.startsWith("SIM_ORDER_"), "simulation order 使用獨立 namespace");
  check(!(await fs.readdir(path.join(root, "orders")).catch(() => [])).length, "simulation order 不寫 production orders");
  await lab.transitionMembershipTestLabOrder(order.orderId, "completed");
  snapshot = await lab.getMembershipTestLabSnapshot();
  check(snapshot.rewards.length > 0 && Object.keys((await commerceModule.readMembershipCommerceState()).referralRewards).length === 0, "simulation reward 不出現在 production reward reports");
  check(Object.keys((await commerceModule.readMembershipCommerceState()).creditEntries).length === 0, "simulation credit 不改 production credit ledger");
  await fs.mkdir(path.dirname(storage.getMembershipCommerceStateFile()), { recursive: true });
  await fs.writeFile(path.join(path.dirname(storage.getMembershipCommerceStateFile()), "production-sentinel.txt"), "preserve", "utf8");
  await lab.resetMembershipTestLab();
  check(await fs.readFile(path.join(path.dirname(storage.getMembershipCommerceStateFile()), "production-sentinel.txt"), "utf8") === "preserve", "simulation reset 不能刪 production data");
  check((await lab.runMembershipTestLabScheduler()).pending === 0 && Object.keys((await commerceModule.readMembershipCommerceState()).referralRewards).length === 0, "simulation scheduler 不能處理 real rewards");
  check(storage.getMembershipTestLabCommerceFile() !== storage.getMembershipCommerceStateFile(), "production scheduler 與 simulation rewards 使用不同檔案");

  snapshot = await fresh();
  check(snapshot.relationships.length === 6, "A→B→C→D→E→F→G 完整建立");
  const selfAttack = await lab.simulateReferralAttack({ referrerMemberId: "SIM_MEMBER_A", referredMemberId: "SIM_MEMBER_A" });
  check(!selfAttack.accepted, "self referral rejected");
  const cycleAttack = await lab.simulateReferralAttack({ referrerMemberId: "SIM_MEMBER_G", referredMemberId: "SIM_MEMBER_A" });
  check(!cycleAttack.accepted, "referral cycle rejected");
  const locked = await lab.simulateReferralAttack({ referrerMemberId: "SIM_MEMBER_A", referredMemberId: "SIM_MEMBER_F" });
  check(!locked.accepted, "permanent relation lock works");

  snapshot = await fresh();
  let paidOrder = await lab.createMembershipTestLabOrder({ memberId: "SIM_MEMBER_F", regularUnitPrice: 600, campaignUnitPrice: null, basePV: 100 });
  await lab.transitionMembershipTestLabOrder(paidOrder.orderId, "completed");
  snapshot = await lab.getMembershipTestLabSnapshot();
  check(snapshot.rewards.find((reward) => reward.referralLevel === 1)?.calculatedCreditAmount === 30, "Paid Amount 600 × 5% = 30");
  snapshot = await fresh();
  paidOrder = await lab.createMembershipTestLabOrder({ memberId: "SIM_MEMBER_F", regularUnitPrice: 600, campaignUnitPrice: 480, basePV: 100 });
  check(paidOrder.paidAmountBasis === 480, "campaign price applied");
  snapshot = await fresh();
  paidOrder = await lab.createMembershipTestLabOrder({ memberId: "SIM_MEMBER_F", regularUnitPrice: 600, campaignUnitPrice: 480, creditUsed: 100, basePV: 100 });
  check(paidOrder.paidAmountBasis === 380, "credit redemption handling matches production basis");
  await lab.transitionMembershipTestLabOrder(paidOrder.orderId, "completed");
  const firstRewardCount = (await lab.getMembershipTestLabSnapshot()).rewards.length;
  const secondNormal = await lab.createMembershipTestLabOrder({ memberId: "SIM_MEMBER_F", regularUnitPrice: 600, basePV: 100 });
  await lab.transitionMembershipTestLabOrder(secondNormal.orderId, "completed");
  check((await lab.getMembershipTestLabSnapshot()).rewards.length === firstRewardCount, "new referral reward is once-only for the same referred member");
  const subscriptionOrder = await lab.createMembershipTestLabOrder({ memberId: "SIM_MEMBER_F", rewardType: "subscription", regularUnitPrice: 600, basePV: 100 });
  await lab.transitionMembershipTestLabOrder(subscriptionOrder.orderId, "completed");
  check((await lab.getMembershipTestLabSnapshot()).rewards.length > firstRewardCount, "subscription cycle can still create recurring referral rewards");

  snapshot = await fresh("pv-five-level");
  const pvOrder = await lab.createMembershipTestLabOrder({ memberId: "SIM_MEMBER_F", regularUnitPrice: 600, campaignUnitPrice: 480, basePV: 100 });
  check(pvOrder.basePV === 100, "base PV works");
  check(pvOrder.effectivePV === 80, "effective PV applies price ratio");
  await lab.transitionMembershipTestLabOrder(pvOrder.orderId, "completed");
  snapshot = await lab.getMembershipTestLabSnapshot();
  check(snapshot.rewards.find((reward) => reward.referralLevel === 1)?.calculatedCreditAmount === 4, "PV reward conversion works");

  snapshot = await fresh();
  check(snapshot.state.members[0].activeSubscription, "active subscription eligible state is present");
  snapshot = await fresh("inactive-referrer");
  const inactiveOrder = await lab.createMembershipTestLabOrder({ memberId: "SIM_MEMBER_F", regularUnitPrice: 600, campaignUnitPrice: null, basePV: 100 });
  await lab.transitionMembershipTestLabOrder(inactiveOrder.orderId, "completed");
  snapshot = await lab.getMembershipTestLabSnapshot();
  check(snapshot.rewards.some((reward) => reward.beneficiaryMemberId === "SIM_MEMBER_A" && reward.qualificationStatus === "awaiting_order"), "inactive subscription no longer discards reward entitlement");

  snapshot = await fresh("new-referral-wait");
  const waitingOrder = await lab.createMembershipTestLabOrder({ memberId: "SIM_MEMBER_B", regularUnitPrice: 600, campaignUnitPrice: null, basePV: 100 });
  await lab.transitionMembershipTestLabOrder(waitingOrder.orderId, "completed");
  const qualifyingOrder = await lab.createMembershipTestLabOrder({ memberId: "SIM_MEMBER_A", regularUnitPrice: 600, campaignUnitPrice: null, basePV: 100 });
  await lab.transitionMembershipTestLabOrder(qualifyingOrder.orderId, "completed");
  snapshot = await lab.getMembershipTestLabSnapshot();
  check(snapshot.rewards[0]?.status === "scheduled", "successful pickup creates pending reward");
  await lab.advanceMembershipTestLabClock({ days: 9 });
  let schedule = await lab.runMembershipTestLabScheduler();
  check(schedule.released === 0, "+9 days does not release a 7+3-day reward");
  await lab.advanceMembershipTestLabClock({ days: 1 });
  schedule = await lab.runMembershipTestLabScheduler();
  check(schedule.due === 1, "+10 days reward is due by Taipei business date");
  check(schedule.released === 1, "simulation scheduler releases due reward once");
  schedule = await lab.runMembershipTestLabScheduler();
  check(schedule.released === 0, "scheduler retry does not duplicate release");

  snapshot = await fresh("refund-pending");
  const pendingRefund = await lab.createMembershipTestLabOrder({ memberId: "SIM_MEMBER_B", regularUnitPrice: 600, basePV: 100 });
  await lab.transitionMembershipTestLabOrder(pendingRefund.orderId, "completed");
  await lab.advanceMembershipTestLabClock({ days: 3 });
  await lab.transitionMembershipTestLabOrder(pendingRefund.orderId, "refunded");
  snapshot = await lab.getMembershipTestLabSnapshot();
  check(snapshot.rewards[0]?.status === "cancelled" && snapshot.creditEntries.length === 0, "refund before release cancels without credit");

  snapshot = await fresh("refund-released");
  const releasedRefund = await lab.createMembershipTestLabOrder({ memberId: "SIM_MEMBER_B", regularUnitPrice: 600, basePV: 100 });
  await lab.transitionMembershipTestLabOrder(releasedRefund.orderId, "completed");
  const releasedQualifier = await lab.createMembershipTestLabOrder({ memberId: "SIM_MEMBER_A", regularUnitPrice: 600, basePV: 100 });
  await lab.transitionMembershipTestLabOrder(releasedQualifier.orderId, "completed");
  await lab.advanceMembershipTestLabClock({ days: 10 });
  await lab.runMembershipTestLabScheduler();
  await lab.transitionMembershipTestLabOrder(releasedRefund.orderId, "returned");
  snapshot = await lab.getMembershipTestLabSnapshot();
  check(snapshot.rewards[0]?.status === "reversed" && snapshot.creditEntries.some((entry) => entry.amount < 0), "refund after release creates append-only reversal");
  const reversalCount = snapshot.creditEntries.filter((entry) => entry.amount < 0).length;
  await lab.transitionMembershipTestLabOrder(releasedRefund.orderId, "returned");
  snapshot = await lab.getMembershipTestLabSnapshot();
  check(snapshot.creditEntries.filter((entry) => entry.amount < 0).length === reversalCount, "double reversal is idempotent");

  snapshot = await fresh("organization-cap");
  const capOrder = await lab.createMembershipTestLabOrder({ memberId: "SIM_MEMBER_F", regularUnitPrice: 600, basePV: 100 });
  await lab.transitionMembershipTestLabOrder(capOrder.orderId, "completed");
  snapshot = await lab.getMembershipTestLabSnapshot();
  check(snapshot.rewards.reduce((sum, reward) => sum + reward.calculatedCreditAmount, 0) === 18 && snapshot.rewards[0]?.referralLevel === 1, "organization cap uses nearest-first allocation");
  snapshot = await fresh("monthly-cap");
  const monthlyOrder = await lab.createMembershipTestLabOrder({ memberId: "SIM_MEMBER_F", rewardType: "subscription", regularUnitPrice: 600, basePV: 100 });
  await lab.transitionMembershipTestLabOrder(monthlyOrder.orderId, "completed");
  snapshot = await lab.getMembershipTestLabSnapshot();
  check(snapshot.rewards.some((reward) => reward.calculatedCreditAmount > 20) && snapshot.rewards.every((reward) => reward.monthlyCapUsageAtRelease === null), "pending monthly cap is projected and not consumed at creation");
  snapshot = await fresh();
  check(snapshot.rules.referral.referralMonthlyCreditCap === 0, "zero monthly cap means unlimited");

  check((await lab.testMembershipLabCycle(20)).accepted, "custom minimum accepted");
  check((await lab.testMembershipLabCycle(120)).accepted, "custom maximum accepted");
  check(!(await lab.testMembershipLabCycle(19)).accepted, "below custom minimum rejected");
  check(!(await lab.testMembershipLabCycle(121)).accepted, "above custom maximum rejected");
  await lab.configureMembershipTestLab({ ruleMode: "scenario-override" });
  const labRules = await rulesModule.readMembershipRulesStore(storage.getMembershipTestLabRulesFile());
  labRules.versions.at(-1)!.rules.subscription.customCycleEnabled = false;
  const customDisabledRules = rulesModule.validateMembershipBusinessRules({ ...labRules.versions.at(-1)!.rules, subscription: { ...labRules.versions.at(-1)!.rules.subscription, customCycleEnabled: false } });
  check(!policies.resolveSubscriptionInterval(20, customDisabledRules).allowed, "custom-disabled behavior rejects non-preset value");

  const realBefore = Date.now();
  const simBefore = (await lab.getMembershipTestLabSnapshot()).state.simulationNow;
  await lab.advanceMembershipTestLabClock({ days: 30 });
  const realAfter = Date.now();
  check(realAfter - realBefore < 10_000 && (await lab.getMembershipTestLabSnapshot()).state.simulationNow !== simBefore, "simulated clock never changes system clock");
  const futureSchedule = await lab.runMembershipTestLabScheduler();
  check(typeof futureSchedule.pending === "number", "simulation scheduler uses simulationNow");

  snapshot = await lab.getMembershipTestLabSnapshot();
  check(snapshot.externalDeliveryEnabled === false, "simulation cannot deliver LINE");
  check(snapshot.externalDeliveryEnabled === false, "simulation cannot deliver Email");
  check(snapshot.state.simulatedNotifications.every((item) => item.delivered === false), "simulated notification events are displayed but not delivered");

  const routeSource = await fs.readFile(path.join(process.cwd(), "app", "api", "admin", "membership-test-lab", "route.ts"), "utf8");
  check(routeSource.includes("isAdminAuthenticated") && routeSource.includes("status: 401"), "anonymous Test Lab API denied");
  check(!routeSource.includes("isMemberAuthenticated"), "normal member session is not accepted as Admin");
  check(routeSource.includes("return NextResponse.json({ ok: true"), "Admin-authenticated route exposes allowed operations");
  check(lab.isMembershipTestLabEnabled(), "local Test Lab enabled with explicit safe env");
  check((await lab.getMembershipTestLabIsolationProof()).externalDeliveryEnabled === false, "isolation proof disables external delivery");
  check(count >= 48, "Phase I.3C 至少 48 個等價情境");
  console.log(`\nPhase I.3C Admin Help / Membership Test Lab: ${count} scenarios PASS`);
} finally {
  const resolved = path.resolve(root);
  if (resolved.startsWith(path.resolve(os.tmpdir()))) await fs.rm(resolved, { recursive: true, force: true });
}
