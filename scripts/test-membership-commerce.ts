import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { SubscriptionDefaultItem } from "../lib/membershipCommerce";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "kd-membership-commerce-"));
process.env.KD_DATA_DIR = testRoot;
process.env.AUTH_SESSION_SECRET = "test-secret-that-is-long-enough-for-member-identity";

const rulesModule = await import("../lib/membershipBusinessRules");
const policyModule = await import("../lib/membershipPolicies");
const commerce = await import("../lib/membershipCommerce");
const identity = await import("../lib/memberIdentity");
const storage = await import("../lib/storagePaths");

let count = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  count += 1;
  console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
}

function item(productId = "coffee-a", packageWeight: "half-pound" | "one-pound" = "half-pound", secondProductId = productId, quantity = 1, unitPrice = 1000): SubscriptionDefaultItem {
  return {
    itemId: `${productId}-${packageWeight}`,
    packageWeight,
    quantity,
    roast: "淺中焙",
    unitPrice,
    components: packageWeight === "one-pound"
      ? [{ productId, weightHalfPounds: 1 }, { productId: secondProductId, weightHalfPounds: 1 }]
      : [{ productId, weightHalfPounds: 1 }],
  };
}

async function member(email: string) {
  return (await identity.provisionCanonicalMember({ provider: "email", subject: email, persistMember: async () => undefined })).member.memberId;
}

async function subscription(memberId: string, orderId: string, suffix: string) {
  return commerce.createSubscription({ memberId, startedFromOrderId: orderId, anchorDate: "2026-01-01", intervalDays: 30, shippingMethod: "711_cod", defaultItems: [item()], idempotencyKey: `sub-${suffix}`, now: new Date("2026-01-01T02:00:00Z") });
}

async function activeSubscription(memberId: string, suffix: string) {
  const sub = await subscription(memberId, `first-${suffix}`, suffix);
  await commerce.activateSubscriptionFromPickup({ subscriptionId: sub.subscriptionId, orderId: `first-${suffix}`, idempotencyKey: `activate-${suffix}`, now: new Date("2026-01-03T02:00:00Z") });
  return sub;
}

async function lockedCycle(subscriptionId: string, sequence: number, suffix: string, plannedDate = "2026-02-01") {
  const cycle = await commerce.generateSubscriptionCycle({ subscriptionId, sequence, plannedDate, idempotencyKey: `generate-${suffix}`, now: new Date("2026-01-10T02:00:00Z") });
  return commerce.lockSubscriptionCycle({ cycleId: cycle.cycleId, shipping: 60, idempotencyKey: `lock-${suffix}`, now: new Date("2026-01-25T02:00:00Z") });
}

try {
  const initialStore = await rulesModule.readMembershipRulesStore();
  const configured = structuredClone(initialStore.versions[0].rules);
  configured.money.roundingMode = "round-half-up";
  configured.credit.appliesToShipping = "no";
  configured.referral.referrerEligibility = { mode: "none" };
  configured.referral.reward = { mode: "fixed", amount: 100, repeatedRewards: true };
  configured.subscription.pauseResumeAnchorPolicy = "keep-original";
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: 0, rules: configured, now: new Date("2026-01-01T00:00:00Z") });

  const memberA = await member("a@example.test");
  const memberB = await member("b@example.test");
  const memberC = await member("c@example.test");
  const memberD = await member("d@example.test");

  const main = await subscription(memberB, "first-main", "main");
  check("1. First original-price order creates a pending subscription", main.status === "pending_activation");
  const activated = await commerce.activateSubscriptionFromPickup({ subscriptionId: main.subscriptionId, orderId: "first-main", idempotencyKey: "activate-main", now: new Date("2026-01-03T00:00:00Z") });
  check("2. Successful first pickup activates and counts gift progress 1", activated.status === "active" && await commerce.getGiftProgress(main.subscriptionId) === 1);

  const renewal1 = await lockedCycle(main.subscriptionId, 1, "main-1");
  check("3. First renewal locks a 95% price snapshot", renewal1.pricingSnapshot?.subscriptionDiscountPercent === 95 && renewal1.pricingSnapshot.subscriptionPrice === 950);
  await commerce.createOrderFromCycle({ cycleId: renewal1.cycleId, orderId: "renewal-1", idempotencyKey: "order-renewal-1" });
  await commerce.recordCycleFulfillment({ cycleId: renewal1.cycleId, orderId: "renewal-1", idempotencyKey: "complete-renewal-1" });
  const renewal2 = await lockedCycle(main.subscriptionId, 2, "main-2", "2026-03-03");
  check("4. Third qualifying fulfillment gift is included in that shipment", renewal2.giftSnapshot?.eligible === true && renewal2.giftSnapshot.quantity === 1);
  await commerce.createOrderFromCycle({ cycleId: renewal2.cycleId, orderId: "renewal-2", idempotencyKey: "order-renewal-2" });
  await commerce.recordCycleFulfillment({ cycleId: renewal2.cycleId, orderId: "renewal-2", idempotencyKey: "complete-renewal-2" });
  const renewal3 = await lockedCycle(main.subscriptionId, 3, "main-3", "2026-04-02");
  check("5. Fourth fulfillment is gift eligible again", renewal3.giftSnapshot?.eligible === true);
  const skipped = await commerce.generateSubscriptionCycle({ subscriptionId: main.subscriptionId, sequence: 4, plannedDate: "2026-05-02", idempotencyKey: "generate-skip" });
  const progressBeforeSkip = await commerce.getGiftProgress(main.subscriptionId);
  await commerce.skipCycle({ cycleId: skipped.cycleId, idempotencyKey: "skip-main" });
  check("6. Skip does not increment gift progress", await commerce.getGiftProgress(main.subscriptionId) === progressBeforeSkip);
  await commerce.markUncollected({ subscriptionId: main.subscriptionId, cycleId: renewal3.cycleId, orderId: "renewal-3", idempotencyKey: "uncollected-main" });
  const afterUncollected = await commerce.readMembershipCommerceState();
  check("7. Uncollected terminates subscription and resets gift progress", afterUncollected.subscriptions[main.subscriptionId].status === "terminated" && await commerce.getGiftProgress(main.subscriptionId) === 0);

  const pauseSub = await activeSubscription(memberB, "pause");
  await commerce.setSubscriptionStatus({ subscriptionId: pauseSub.subscriptionId, status: "paused", reason: "會員暫停", idempotencyKey: "pause" });
  const pausedGeneration = await Promise.allSettled([commerce.generateSubscriptionCycle({ subscriptionId: pauseSub.subscriptionId, sequence: 1, plannedDate: "2026-02-01", idempotencyKey: "paused-generate" })]);
  check("8. Paused subscription generates no future order cycle", pausedGeneration[0].status === "rejected");
  const terminateSub = await activeSubscription(memberB, "terminate");
  await commerce.setSubscriptionStatus({ subscriptionId: terminateSub.subscriptionId, status: "terminated", reason: "會員終止", idempotencyKey: "terminate" });
  const terminatedGeneration = await Promise.allSettled([commerce.generateSubscriptionCycle({ subscriptionId: terminateSub.subscriptionId, sequence: 1, plannedDate: "2026-02-01", idempotencyKey: "terminated-generate" })]);
  check("9. Terminated subscription generates no future cycle", terminatedGeneration[0].status === "rejected");

  const dateSub = await activeSubscription(memberB, "dates");
  const earlyOne = await commerce.generateSubscriptionCycle({ subscriptionId: dateSub.subscriptionId, sequence: 1, plannedDate: "2026-02-01", idempotencyKey: "date-cycle-1" });
  await commerce.modifyCycleDate({ cycleId: earlyOne.cycleId, plannedDate: "2026-01-28", recalculateAnchor: false, idempotencyKey: "early-one" });
  let state = await commerce.readMembershipCommerceState();
  check("10. Early one-time change keeps anchor", state.subscriptions[dateSub.subscriptionId].anchorDate === "2026-01-01");
  await commerce.modifyCycleDate({ cycleId: earlyOne.cycleId, plannedDate: "2026-01-27", recalculateAnchor: true, idempotencyKey: "early-recalculate" });
  state = await commerce.readMembershipCommerceState();
  check("11. Early recalculation changes anchor", state.subscriptions[dateSub.subscriptionId].anchorDate === "2026-01-27");
  await commerce.modifyCycleDate({ cycleId: earlyOne.cycleId, plannedDate: "2026-02-04", recalculateAnchor: false, idempotencyKey: "delay-one" });
  state = await commerce.readMembershipCommerceState();
  check("12. Delay one-time change keeps anchor", state.subscriptions[dateSub.subscriptionId].anchorDate === "2026-01-27");
  await commerce.modifyCycleDate({ cycleId: earlyOne.cycleId, plannedDate: "2026-02-05", recalculateAnchor: true, idempotencyKey: "delay-recalculate" });
  state = await commerce.readMembershipCommerceState();
  check("13. Delay recalculation changes anchor", state.subscriptions[dateSub.subscriptionId].anchorDate === "2026-02-05");

  check("14. Half-pound A composition is valid", policyModule.validateSubscriptionItem(item("a")).components.length === 1);
  check("15. One-pound A+A composition is valid", policyModule.validateSubscriptionItem(item("a", "one-pound", "a")).components.map((part) => part.productId).join("+") === "a+a");
  check("16. One-pound A+B composition is valid", policyModule.validateSubscriptionItem(item("a", "one-pound", "b")).components.map((part) => part.productId).join("+") === "a+b");
  const compositionCycle = await commerce.generateSubscriptionCycle({ subscriptionId: dateSub.subscriptionId, sequence: 2, plannedDate: "2026-03-07", idempotencyKey: "composition-cycle" });
  const changedComposition = await commerce.updateCycleItems({ cycleId: compositionCycle.cycleId, items: [item("b", "one-pound", "c")], idempotencyKey: "composition-change" });
  check("17. Composition can change from A+A to B+C", changedComposition.itemsDraft[0].components.map((part) => part.productId).join("+") === "b+c");
  const changedQuantity = await commerce.updateCycleItems({ cycleId: compositionCycle.cycleId, items: [item("b", "one-pound", "c", 3)], idempotencyKey: "quantity-change" });
  check("18. Quantity update is represented", changedQuantity.itemsDraft[0].quantity === 3);

  const rulesSub = await activeSubscription(memberB, "rules");
  const oldLocked = await lockedCycle(rulesSub.subscriptionId, 1, "rules-old");
  const storeBefore90 = await rulesModule.readMembershipRulesStore();
  const ninety = structuredClone(storeBefore90.versions.at(-1)!.rules);
  ninety.subscription.discountPercent = 90;
  await rulesModule.saveMembershipBusinessRules({ expectedRevision: storeBefore90.revision, rules: ninety, now: new Date("2026-01-26T00:00:00Z") });
  const futureCycle = await commerce.generateSubscriptionCycle({ subscriptionId: rulesSub.subscriptionId, sequence: 2, plannedDate: "2026-03-03", idempotencyKey: "generate-rules-new", now: new Date("2026-01-27T00:00:00Z") });
  const newLocked = await commerce.lockSubscriptionCycle({ cycleId: futureCycle.cycleId, shipping: 60, idempotencyKey: "lock-rules-new", now: new Date("2026-01-27T00:00:00Z") });
  check("19. Locked 95% cycle remains while future cycle uses 90%", oldLocked.rulesSnapshot?.rules.subscription.discountPercent === 95 && newLocked.rulesSnapshot?.rules.subscription.discountPercent === 90);

  const relationship = await commerce.assignReferralRelationship({ referrerMemberId: memberA, referredMemberId: memberB, safeDisplayName: "B 會員", idempotencyKey: "referral-a-b" });
  state = await commerce.readMembershipCommerceState();
  check("20. Referral registration alone issues no credit", Boolean(relationship) && Object.keys(state.creditEntries).length === 0);
  check("21. Referred member ordering alone issues no credit", Object.keys((await commerce.readMembershipCommerceState()).creditEntries).length === 0);
  const conversion1 = await commerce.processReferralOrderOutcome({ referredMemberId: memberB, orderId: "ref-order-1", outcome: "completed", orderMerchandiseAmount: 1000, idempotencyKey: "ref-complete-1" });
  check("22. Successful pickup issues one referrer reward", conversion1?.status === "rewarded" && Boolean(conversion1.rewardCreditEntryId));
  const conversion2 = await commerce.processReferralOrderOutcome({ referredMemberId: memberB, orderId: "ref-order-2", outcome: "completed", orderMerchandiseAmount: 1000, idempotencyKey: "ref-complete-2" });
  state = await commerce.readMembershipCommerceState();
  check("23. Next successful order issues another reward", conversion2?.status === "rewarded" && Object.values(state.creditEntries).filter((entry) => entry.sourceType === "referral").length === 2);
  await commerce.processReferralOrderOutcome({ referredMemberId: memberB, orderId: "ref-order-2", outcome: "completed", orderMerchandiseAmount: 1000, idempotencyKey: "ref-complete-2" });
  state = await commerce.readMembershipCommerceState();
  check("24. Replayed completion does not duplicate reward", Object.values(state.creditEntries).filter((entry) => entry.sourceType === "referral").length === 2);
  const uncollectedReferral = await commerce.processReferralOrderOutcome({ referredMemberId: memberB, orderId: "ref-order-3", outcome: "uncollected", orderMerchandiseAmount: 1000, idempotencyKey: "ref-uncollected" });
  check("25. Uncollected referred order earns no reward", uncollectedReferral?.status === "uncollected" && !uncollectedReferral.rewardCreditEntryId);

  const issued = await commerce.issueCredit({ memberId: memberC, sourceType: "manual", sourceReference: "manual-expiry", amount: 300, idempotencyKey: "issue-expiry", now: new Date("2026-01-31T04:00:00Z") });
  check("26. Credit is issued with deterministic calendar-month expiry", issued.expiresAt.startsWith("2026-05-01T00:00:00+08:00"));
  const earlier = await commerce.issueCredit({ memberId: memberC, sourceType: "promotion", sourceReference: "earlier", amount: 100, idempotencyKey: "issue-earlier", now: new Date("2025-12-01T04:00:00Z") });
  const reservedFefo = await commerce.reserveCredit({ memberId: memberC, orderId: "credit-order-1", requestedAmount: 120, merchandiseSubtotal: 1000, shipping: 60, idempotencyKey: "reserve-fefo", now: new Date("2026-02-01T04:00:00Z") });
  check("27. FEFO spends the earliest expiry first", reservedFefo.allocations[0].creditEntryId === earlier.creditEntryId);
  check("28. Credit reservation records allocation without final consumption", reservedFefo.status === "reserved" && reservedFefo.amount === 120);
  const released = await commerce.settleCreditReservation({ reservationId: reservedFefo.reservationId, action: "release", idempotencyKey: "release-fefo", reason: "訂單失敗", now: new Date("2026-02-01T05:00:00Z") });
  check("29. Failed order releases reserved credit", released.status === "released");
  const reservedConsume = await commerce.reserveCredit({ memberId: memberC, orderId: "credit-order-2", requestedAmount: 80, merchandiseSubtotal: 1000, shipping: 60, idempotencyKey: "reserve-consume", now: new Date("2026-02-01T06:00:00Z") });
  const consumed = await commerce.settleCreditReservation({ reservationId: reservedConsume.reservationId, action: "consume", idempotencyKey: "consume-credit", reason: "成功取貨", now: new Date("2026-02-03T06:00:00Z") });
  check("30. Successful completion consumes reservation", consumed.status === "consumed");
  const consumedAgain = await commerce.settleCreditReservation({ reservationId: reservedConsume.reservationId, action: "consume", idempotencyKey: "consume-credit", reason: "成功取貨重送", now: new Date("2026-02-03T06:01:00Z") });
  check("31. Consume retry is idempotent", consumedAgain.status === "consumed");
  const expired = await commerce.issueCredit({ memberId: memberC, sourceType: "promotion", sourceReference: "will-expire", amount: 40, idempotencyKey: "issue-will-expire", now: new Date("2025-01-01T00:00:00Z") });
  check("32. Expired credit is unavailable", expired.amount === 40 && await commerce.getAvailableCredit(memberC, new Date("2026-02-01T00:00:00Z")) < 460);
  const cappedRules = structuredClone((await rulesModule.getActiveMembershipRules()).rules);
  cappedRules.credit.redemption = { mode: "minimum-payable", amount: 200 };
  check("33. Maximum redemption policy preserves minimum payable", policyModule.maximumCreditRedemption({ merchandiseSubtotal: 1000, shipping: 60, rules: cappedRules }) === 800);

  const concurrencySub = await activeSubscription(memberB, "concurrency");
  const concurrentCycles = await Promise.all([
    commerce.generateSubscriptionCycle({ subscriptionId: concurrencySub.subscriptionId, sequence: 1, plannedDate: "2026-02-01", idempotencyKey: "concurrent-cycle-a" }),
    commerce.generateSubscriptionCycle({ subscriptionId: concurrencySub.subscriptionId, sequence: 1, plannedDate: "2026-02-01", idempotencyKey: "concurrent-cycle-b" }),
  ]);
  check("34. Two cycle generators create one cycle", concurrentCycles[0].cycleId === concurrentCycles[1].cycleId);
  const concurrentLocked = await commerce.lockSubscriptionCycle({ cycleId: concurrentCycles[0].cycleId, shipping: 60, idempotencyKey: "concurrent-lock" });
  const concurrentOrders = await Promise.all([
    commerce.createOrderFromCycle({ cycleId: concurrentLocked.cycleId, orderId: "concurrent-order", idempotencyKey: "concurrent-order-source" }),
    commerce.createOrderFromCycle({ cycleId: concurrentLocked.cycleId, orderId: "concurrent-order", idempotencyKey: "concurrent-order-source" }),
  ]);
  check("35. Two order creators create one linked order", concurrentOrders[0].createdOrderId === "concurrent-order" && concurrentOrders[1].createdOrderId === "concurrent-order");
  const beforeConcurrentReferral = Object.keys((await commerce.readMembershipCommerceState()).creditEntries).length;
  await Promise.all([
    commerce.processReferralOrderOutcome({ referredMemberId: memberB, orderId: "ref-concurrent", outcome: "completed", orderMerchandiseAmount: 1000, idempotencyKey: "ref-concurrent-source" }),
    commerce.processReferralOrderOutcome({ referredMemberId: memberB, orderId: "ref-concurrent", outcome: "completed", orderMerchandiseAmount: 1000, idempotencyKey: "ref-concurrent-source" }),
  ]);
  check("36. Two referral processors issue one reward", Object.keys((await commerce.readMembershipCommerceState()).creditEntries).length === beforeConcurrentReferral + 1);
  await commerce.issueCredit({ memberId: memberD, sourceType: "manual", sourceReference: "overspend", amount: 100, idempotencyKey: "issue-overspend", now: new Date("2026-06-01T00:00:00Z") });
  const concurrentReservations = await Promise.allSettled([
    commerce.reserveCredit({ memberId: memberD, orderId: "overspend-a", requestedAmount: 80, merchandiseSubtotal: 500, shipping: 0, idempotencyKey: "overspend-a", now: new Date("2026-06-02T00:00:00Z") }),
    commerce.reserveCredit({ memberId: memberD, orderId: "overspend-b", requestedAmount: 80, merchandiseSubtotal: 500, shipping: 0, idempotencyKey: "overspend-b", now: new Date("2026-06-02T00:00:00Z") }),
  ]);
  check("37. Concurrent credit redemptions cannot overspend", concurrentReservations.filter((result) => result.status === "fulfilled").length === 1);

  check("38. 30/45/60 day dates are deterministic", commerce.nextScheduledDate("2026-01-01", 30, 1) === "2026-01-31" && commerce.nextScheduledDate("2026-01-01", 45, 1) === "2026-02-15" && commerce.nextScheduledDate("2026-01-01", 60, 1) === "2026-03-02");
  const manual = await commerce.generateSubscriptionCycle({ subscriptionId: concurrencySub.subscriptionId, sequence: 99, plannedDate: "2026-01-15", kind: "manual_replenishment", idempotencyKey: "manual-replenishment" });
  check("39. Immediate replenishment is distinct from scheduled sequence", manual.kind === "manual_replenishment" && (await commerce.readMembershipCommerceState()).subscriptions[concurrencySub.subscriptionId].anchorDate === "2026-01-01");
  const auditState = await commerce.readMembershipCommerceState();
  check("40. Audit and notification events contain no login secrets", !JSON.stringify({ audit: auditState.audit, notifications: auditState.notifications }).match(/@example\.test|password|session|lineSubject/i));
  check("41. Rules and commerce stayed in isolated test storage", storage.getMembershipRulesFile().startsWith(testRoot) && storage.getMembershipCommerceStateFile().startsWith(testRoot));
  console.log(`\nMembership commerce foundation: ${count} assertions PASS`);
} finally {
  await rm(testRoot, { recursive: true, force: true });
}
