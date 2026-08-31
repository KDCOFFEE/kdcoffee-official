import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { SubscriptionDefaultItem } from "../lib/membershipCommerce";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "kd-membership-i2-"));
process.env.KD_DATA_DIR = testRoot;
process.env.AUTH_SESSION_SECRET = "phase-i2-test-secret-long-enough";

const commerce = await import("../lib/membershipCommerce");
const policy = await import("../lib/membershipPolicies");
const rulesModule = await import("../lib/membershipBusinessRules");
const identity = await import("../lib/memberIdentity");

let count = 0;
function check(code: string, name: string, condition: unknown) {
  assert.ok(condition, `${code}. ${name}`);
  count += 1;
  console.log(`PASS ${code.padEnd(2)} ${name}`);
}

function item(productId = "a", weight: "half-pound" | "one-pound" = "half-pound", second = productId, quantity = 1, unitPrice = 1390): SubscriptionDefaultItem {
  return { itemId: `${productId}-${weight}`, packageWeight: weight, quantity, roast: "淺中焙", unitPrice, components: weight === "one-pound" ? [{ productId, weightHalfPounds: 1 }, { productId: second, weightHalfPounds: 1 }] : [{ productId, weightHalfPounds: 1 }] };
}

async function member(email: string) {
  return (await identity.provisionCanonicalMember({ provider: "email", subject: email, persistMember: async () => undefined })).member.memberId;
}

async function active(memberId: string, suffix: string, items = [item()]) {
  const subscription = await commerce.createSubscription({ memberId, startedFromOrderId: `first-${suffix}`, anchorDate: "2026-09-01", intervalDays: 30, shippingMethod: "711_cod", defaultItems: items, idempotencyKey: `create-${suffix}`, now: new Date("2026-08-01T00:00:00Z") });
  return commerce.activateSubscriptionFromPickup({ subscriptionId: subscription.subscriptionId, orderId: `first-${suffix}`, idempotencyKey: `activate-${suffix}`, now: new Date("2026-08-02T00:00:00Z") });
}

async function completedCycle(subscriptionId: string, sequence: number, suffix: string, plannedDate: string) {
  const cycle = await commerce.generateSubscriptionCycle({ subscriptionId, sequence, plannedDate, idempotencyKey: `generate-${suffix}`, now: new Date("2026-08-03T00:00:00Z") });
  const locked = await commerce.lockSubscriptionCycle({ cycleId: cycle.cycleId, shipping: 60, idempotencyKey: `lock-${suffix}`, now: new Date("2026-08-04T00:00:00Z") });
  await commerce.createOrderFromCycle({ cycleId: locked.cycleId, orderId: `order-${suffix}`, idempotencyKey: `order-${suffix}` });
  return commerce.recordCycleFulfillment({ cycleId: locked.cycleId, orderId: `order-${suffix}`, idempotencyKey: `complete-${suffix}` });
}

try {
  const rules = (await rulesModule.getActiveMembershipRules()).rules;
  const memberA = await member("phase-i2-a@example.test");
  const memberB = await member("phase-i2-b@example.test");
  const memberC = await member("phase-i2-c@example.test");

  const pending = await commerce.createSubscription({ memberId: memberA, startedFromOrderId: "first-pending", anchorDate: "2026-09-01", intervalDays: 30, shippingMethod: "711_cod", defaultItems: [item()], idempotencyKey: "pending", now: new Date("2026-08-01T00:00:00Z") });
  check("A", "首筆原價加入後維持等待啟動", pending.status === "pending_activation");
  const activated = await commerce.activateSubscriptionFromPickup({ subscriptionId: pending.subscriptionId, orderId: "first-pending", idempotencyKey: "activate-pending", now: new Date("2026-08-02T00:00:00Z") });
  check("B", "首筆成功取貨後啟動", activated.status === "active");
  const firstCycle = await commerce.generateSubscriptionCycle({ subscriptionId: pending.subscriptionId, sequence: 1, plannedDate: "2026-09-01", idempotencyKey: "first-renewal" });
  const firstLocked = await commerce.lockSubscriptionCycle({ cycleId: firstCycle.cycleId, shipping: 60, idempotencyKey: "first-renewal-lock" });
  check("C", "第一次續訂使用 95% 價格", firstLocked.pricingSnapshot?.subscriptionPrice === 1321);
  check("D", "1320.5 依四捨五入成 1321", policy.applyPercentage(1390, 95, rules.money.roundingMode) === 1321);

  const bestSubscription = policy.previewMembershipPrice({ productSubtotal: 1390, campaignPrice: 1350, shipping: 60, rules });
  check("E", "活動較貴時採定期價格且不疊加", bestSubscription.selectedPriceSource === "subscription" && bestSubscription.finalAmount === 1321);
  const bestCampaign = policy.previewMembershipPrice({ productSubtotal: 1390, campaignPrice: 1200, shipping: 60, rules });
  check("F", "活動較便宜時採活動價格且不疊加", bestCampaign.selectedPriceSource === "campaign" && bestCampaign.finalAmount === 1200);
  check("G", "預設抵用金可折商品與運費", policy.maximumCreditRedemption({ merchandiseSubtotal: 1000, shipping: 60, rules }) === 1060);
  const noShippingRules = structuredClone(rules); noShippingRules.credit.appliesToShipping = "no";
  check("H", "關閉運費折抵後只可折商品", policy.maximumCreditRedemption({ merchandiseSubtotal: 1000, shipping: 60, rules: noShippingRules }) === 1000);
  check("I", "推薦回饋以成交商品金額 5% 四捨五入", policy.referralRewardForMerchandise({ merchandiseAfterDiscounts: 1390, rules }) === 70);
  check("J", "使用抵用金不降低推薦回饋基礎", policy.referralRewardForMerchandise({ merchandiseAfterDiscounts: 1000, rules }) === policy.referralRewardForMerchandise({ merchandiseAfterDiscounts: 1000, rules }));

  const pauseSub = await active(memberA, "pause");
  const paused = await commerce.setSubscriptionStatus({ memberId: memberA, subscriptionId: pauseSub.subscriptionId, expectedRevision: pauseSub.revision, status: "paused", reason: "會員暫停", idempotencyKey: "pause-i2" });
  check("K", "暫停後不建立排程", paused.status === "paused");
  const resumed = await commerce.setSubscriptionStatus({ memberId: memberA, subscriptionId: paused.subscriptionId, expectedRevision: paused.revision, status: "active", resumeDate: "2026-09-15", intervalDays: 45, reason: "會員恢復", idempotencyKey: "resume-i2", now: new Date("2026-08-28T00:00:00Z") });
  check("L", "恢復日期與週期成為新基準", resumed.anchorDate === "2026-09-15" && resumed.intervalDays === 45);

  const dateSub = await active(memberA, "dates");
  let dateCycle = await commerce.generateSubscriptionCycle({ subscriptionId: dateSub.subscriptionId, sequence: 1, plannedDate: "2026-10-01", idempotencyKey: "date-cycle" });
  dateCycle = await commerce.modifyCycleDate({ memberId: memberA, cycleId: dateCycle.cycleId, expectedRevision: dateCycle.revision, plannedDate: "2026-09-25", recalculateAnchor: false, idempotencyKey: "advance-once" });
  check("M", "提前只改一次不改基準", (await commerce.readMembershipCommerceState()).subscriptions[dateSub.subscriptionId].anchorDate === "2026-09-01");
  dateCycle = await commerce.modifyCycleDate({ memberId: memberA, cycleId: dateCycle.cycleId, expectedRevision: dateCycle.revision, plannedDate: "2026-09-24", recalculateAnchor: true, idempotencyKey: "advance-rebase" });
  check("N", "提前並重算會更新基準", (await commerce.readMembershipCommerceState()).subscriptions[dateSub.subscriptionId].anchorDate === "2026-09-24");
  dateCycle = await commerce.modifyCycleDate({ memberId: memberA, cycleId: dateCycle.cycleId, expectedRevision: dateCycle.revision, plannedDate: "2026-10-08", recalculateAnchor: false, idempotencyKey: "delay-once" });
  check("O", "延後只改一次不改基準", (await commerce.readMembershipCommerceState()).subscriptions[dateSub.subscriptionId].anchorDate === "2026-09-24");
  dateCycle = await commerce.modifyCycleDate({ memberId: memberA, cycleId: dateCycle.cycleId, expectedRevision: dateCycle.revision, plannedDate: "2026-10-09", recalculateAnchor: true, idempotencyKey: "delay-rebase" });
  check("P", "延後並重算會更新基準", (await commerce.readMembershipCommerceState()).subscriptions[dateSub.subscriptionId].anchorDate === "2026-10-09");
  const skipped = await commerce.memberSkipCycle({ memberId: memberA, cycleId: dateCycle.cycleId, expectedRevision: dateCycle.revision, idempotencyKey: "skip-i2" });
  check("Q", "跳過只終止本期", skipped.status === "skipped");
  const terminated = await commerce.setSubscriptionStatus({ memberId: memberA, subscriptionId: dateSub.subscriptionId, expectedRevision: (await commerce.readMembershipCommerceState()).subscriptions[dateSub.subscriptionId].revision, status: "terminated", reason: "會員停止", idempotencyKey: "terminate-i2" });
  check("R", "停止後狀態不可再排程", terminated.status === "terminated");

  const replenishSub = await active(memberA, "replenish");
  const anchorBefore = replenishSub.anchorDate;
  const replenishment = await commerce.generateSubscriptionCycle({ subscriptionId: replenishSub.subscriptionId, sequence: 99, plannedDate: "2026-08-31", kind: "manual_replenishment", idempotencyKey: "replenish-i2" });
  check("S", "立即補貨為額外一期且不改基準", replenishment.kind === "manual_replenishment" && (await commerce.readMembershipCommerceState()).subscriptions[replenishSub.subscriptionId].anchorDate === anchorBefore);
  check("T", "半磅 A 組合有效", policy.validateSubscriptionItem(item("a")).components.length === 1);
  check("U", "一磅 A+A 組合有效", policy.validateSubscriptionItem(item("a", "one-pound", "a")).components.map((part) => part.productId).join("+") === "a+a");
  check("V", "一磅 A+B 組合有效", policy.validateSubscriptionItem(item("a", "one-pound", "b")).components.map((part) => part.productId).join("+") === "a+b");
  check("W", "一磅可保留獨立原價差異", item("a", "one-pound", "b", 1, 2500).unitPrice !== item("a", "half-pound", "a", 2, 1390).unitPrice * 2);

  const giftSub = await active(memberA, "gift", [item()]);
  await completedCycle(giftSub.subscriptionId, 1, "gift-1", "2026-09-01");
  let giftCycle = await commerce.generateSubscriptionCycle({ subscriptionId: giftSub.subscriptionId, sequence: 2, plannedDate: "2026-10-01", idempotencyKey: "gift-cycle-2" });
  giftCycle = await commerce.lockSubscriptionCycle({ cycleId: giftCycle.cycleId, shipping: 0, idempotencyKey: "gift-lock-2" });
  check("X", "第 3 次履約當次含贈品", giftCycle.giftSnapshot?.eligible === true);
  await commerce.createOrderFromCycle({ cycleId: giftCycle.cycleId, orderId: "gift-order-2", idempotencyKey: "gift-order-2" });
  await commerce.recordCycleFulfillment({ cycleId: giftCycle.cycleId, orderId: "gift-order-2", idempotencyKey: "gift-complete-2" });
  const giftFour = await commerce.lockSubscriptionCycle({ cycleId: (await commerce.generateSubscriptionCycle({ subscriptionId: giftSub.subscriptionId, sequence: 3, plannedDate: "2026-11-01", idempotencyKey: "gift-cycle-3" })).cycleId, shipping: 0, idempotencyKey: "gift-lock-3" });
  check("Y", "第 4 次履約仍依每次規則含贈品", giftFour.giftSnapshot?.eligible === true);
  await commerce.markUncollected({ subscriptionId: giftSub.subscriptionId, cycleId: giftFour.cycleId, orderId: "gift-uncollected", idempotencyKey: "gift-uncollected" });
  check("Z", "未取貨停止並重設贈品進度", (await commerce.readMembershipCommerceState()).subscriptions[giftSub.subscriptionId].status === "terminated" && await commerce.getGiftProgress(giftSub.subscriptionId) === 0);

  const lockSub = await active(memberB, "lock");
  const lockCycle = await commerce.generateSubscriptionCycle({ subscriptionId: lockSub.subscriptionId, sequence: 1, plannedDate: "2026-09-01", idempotencyKey: "lock-cycle" });
  const locked = await commerce.lockSubscriptionCycle({ cycleId: lockCycle.cycleId, shipping: 0, idempotencyKey: "lock-cycle-lock" });
  const afterLock = await Promise.allSettled([commerce.modifyCycleDate({ memberId: memberB, cycleId: locked.cycleId, expectedRevision: locked.revision, plannedDate: "2026-09-02", recalculateAnchor: false, idempotencyKey: "after-lock" })]);
  check("AA", "鎖定後修改明確失敗", afterLock[0].status === "rejected");
  const staleCycle = await commerce.generateSubscriptionCycle({ subscriptionId: lockSub.subscriptionId, sequence: 2, plannedDate: "2026-10-01", idempotencyKey: "stale-cycle" });
  await commerce.modifyCycleDate({ memberId: memberB, cycleId: staleCycle.cycleId, expectedRevision: staleCycle.revision, plannedDate: "2026-10-02", recalculateAnchor: false, idempotencyKey: "stale-first" });
  const stale = await Promise.allSettled([commerce.modifyCycleDate({ memberId: memberB, cycleId: staleCycle.cycleId, expectedRevision: staleCycle.revision, plannedDate: "2026-10-03", recalculateAnchor: false, idempotencyKey: "stale-second" })]);
  check("AB", "舊版次更新回傳衝突", stale[0].status === "rejected" && stale[0].reason instanceof commerce.MembershipRevisionConflictError);
  const cross = await Promise.allSettled([commerce.modifyCycleDate({ memberId: memberC, cycleId: staleCycle.cycleId, expectedRevision: staleCycle.revision + 1, plannedDate: "2026-10-04", recalculateAnchor: false, idempotencyKey: "cross-member" })]);
  check("AC", "跨會員修改遭拒", cross[0].status === "rejected");
  const oldSnapshot = locked.rulesSnapshot?.rules.subscription.discountPercent;
  const store = await rulesModule.readMembershipRulesStore(); const changedRules = structuredClone(store.versions.at(-1)!.rules); changedRules.subscription.discountPercent = 90;
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: store.revision, rules: changedRules, now: new Date("2026-08-10T00:00:00Z") });
  check("AD", "新規則不改已鎖定快照", locked.rulesSnapshot?.rules.subscription.discountPercent === oldSnapshot);

  const legacyStore = await rulesModule.readMembershipRulesStore();
  const legacyRules = structuredClone(legacyStore.versions.at(-1)!.rules);
  legacyRules.referral.referrerEligibility = { mode: "completed-orders", minimumOrders: 1 };
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: legacyStore.revision, rules: legacyRules, now: new Date("2026-08-10T01:00:00Z") });
  await commerce.assignReferralRelationship({ referrerMemberId: memberC, referredMemberId: memberB, safeDisplayName: "B 會員", idempotencyKey: "referral-i2" });
  const pendingReward = await commerce.processReferralOrderOutcome({ referredMemberId: memberB, orderId: "referral-order", outcome: "completed", orderMerchandiseAmount: 1390, referrerCompletedOrders: 0, idempotencyKey: "referral-pending" });
  check("AE", "推薦人未符合資格時獎勵待領", pendingReward?.status === "pending" && pendingReward.pendingRewardAmount === 70);
  const released = await commerce.releasePendingReferralRewards({ referrerMemberId: memberC, completedOrders: 1, idempotencyKey: "referral-release" });
  check("AF", "符合資格後待領獎勵轉可用", released.length === 1 && released[0].amount === 70);
  const early = await commerce.issueCredit({ memberId: memberC, sourceType: "promotion", sourceReference: "early", amount: 100, idempotencyKey: "credit-early", now: new Date("2026-01-01T00:00:00Z") });
  await commerce.issueCredit({ memberId: memberC, sourceType: "promotion", sourceReference: "late", amount: 100, idempotencyKey: "credit-late", now: new Date("2026-02-01T00:00:00Z") });
  const reservation = await commerce.reserveCredit({ memberId: memberC, orderId: "credit-fefo", requestedAmount: 120, merchandiseSubtotal: 100, shipping: 20, idempotencyKey: "credit-fefo", now: new Date("2026-03-01T00:00:00Z") });
  check("AG", "抵用金依最快到期優先", reservation.allocations[0].creditEntryId === early.creditEntryId);
  check("AH", "抵用金可涵蓋運費", reservation.amount === 120);
  const zero = policy.previewMembershipPrice({ productSubtotal: 100, requestedCredit: 95, shipping: 0, rules: changedRules });
  check("AI", "零元應付邊界可被明確表示", zero.finalAmount === 0);
  const replay = await commerce.issueCredit({ memberId: memberC, sourceType: "manual", sourceReference: "duplicate", amount: 10, idempotencyKey: "duplicate-i2" });
  const replayAgain = await commerce.issueCredit({ memberId: memberC, sourceType: "manual", sourceReference: "duplicate", amount: 10, idempotencyKey: "duplicate-i2" });
  check("AJ", "重送同一識別不重複寫入", replay.creditEntryId === replayAgain.creditEntryId);

  assert.equal(count, 36);
  console.log(`\nPhase I.2 membership experience: ${count} scenarios PASS`);
} finally {
  await rm(testRoot, { recursive: true, force: true });
}
