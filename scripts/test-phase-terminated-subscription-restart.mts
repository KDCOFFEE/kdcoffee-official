import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "kd-subscription-restart-"));
process.env.KD_DATA_DIR = testRoot;
process.env.AUTH_SESSION_SECRET = "terminated-subscription-restart-test-secret";

const commerce = await import("../lib/membershipCommerce");
const identity = await import("../lib/memberIdentity");
const policy = await import("../lib/membershipPolicies");
const stateFilePath = path.join(testRoot, "membership-commerce", "commerce-state.json");
const rulesFilePath = path.join(testRoot, "membership-commerce", "business-rules.json");

const item = {
  itemId: "restart-coffee-half",
  skuKind: "beans" as const,
  packageWeight: "half-pound" as const,
  quantity: 1,
  roast: "淺中焙",
  components: [{ productId: "restart-coffee", skuId: "restart-coffee-half", weightHalfPounds: 1 as const }],
  unitPrice: 700,
};

let count = 0;

function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  count += 1;
  console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
}

async function rejects(name: string, operation: () => Promise<unknown>) {
  await assert.rejects(operation, name);
  count += 1;
  console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
}

async function member(email: string) {
  return (await identity.provisionCanonicalMember({
    provider: "email",
    subject: email,
    persistMember: async () => undefined,
  })).member.memberId;
}

async function activeSubscription(memberId: string, suffix: string, items = [item]) {
  const pending = await commerce.createSubscription({
    memberId,
    startedFromOrderId: `first-${suffix}`,
    anchorDate: "2026-09-01",
    intervalDays: 30,
    shippingMethod: "studio_pickup",
    defaultItems: items,
    idempotencyKey: `create-${suffix}`,
    now: new Date("2026-09-01T01:00:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
  return commerce.activateSubscriptionFromPickup({
    subscriptionId: pending.subscriptionId,
    orderId: `first-${suffix}`,
    idempotencyKey: `activate-${suffix}`,
    now: new Date("2026-09-02T01:00:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
}

async function terminateMemberSubscription(
  memberId: string,
  subscription: { subscriptionId: string; revision: number },
  suffix: string,
) {
  return commerce.setSubscriptionStatus({
    memberId,
    subscriptionId: subscription.subscriptionId,
    expectedRevision: subscription.revision,
    status: "terminated",
    reason: "會員停止定期配送",
    idempotencyKey: `terminate-${suffix}`,
    now: new Date("2026-09-10T01:00:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
}

try {
  const memberA = await member("restart-a@example.test");
  const memberB = await member("restart-b@example.test");

  const main = await activeSubscription(memberA, "main");
  const completed = await commerce.generateSubscriptionCycle({
    subscriptionId: main.subscriptionId,
    sequence: 1,
    plannedDate: "2026-09-10",
    idempotencyKey: "main-completed-cycle",
    now: new Date("2026-09-03T01:00:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
  const completedLocked = await commerce.lockSubscriptionCycle({
    cycleId: completed.cycleId,
    idempotencyKey: "main-completed-lock",
    now: new Date("2026-09-04T01:00:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
  await commerce.createOrderFromCycle({
    cycleId: completedLocked.cycleId,
    orderId: "ORDER-RESTART-HISTORY",
    idempotencyKey: "main-completed-order",
    now: new Date("2026-09-05T01:00:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
  await commerce.recordCycleFulfillment({
    cycleId: completedLocked.cycleId,
    orderId: "ORDER-RESTART-HISTORY",
    idempotencyKey: "main-completed-fulfillment",
    now: new Date("2026-09-06T01:00:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
  const editable = await commerce.generateSubscriptionCycle({
    subscriptionId: main.subscriptionId,
    sequence: 2,
    plannedDate: "2026-10-10",
    idempotencyKey: "main-editable-cycle",
    now: new Date("2026-09-07T01:00:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
  await commerce.issueCredit({
    memberId: memberA,
    sourceType: "manual",
    sourceReference: "restart-safety-credit",
    amount: 50,
    idempotencyKey: "restart-safety-credit",
    now: new Date("2026-09-07T02:00:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
  await commerce.assignReferralRelationship({
    referrerMemberId: memberB,
    referredMemberId: memberA,
    safeDisplayName: "Restart A",
    idempotencyKey: "restart-safety-referral",
    now: new Date("2026-09-07T03:00:00.000Z"),
    stateFilePath,
  });

  const terminated = await terminateMemberSubscription(memberA, main, "main");
  const eligibleDashboard = await commerce.getMemberCommerceDashboard(memberA, new Date("2026-09-12T01:00:00.000Z"), stateFilePath);
  check("eligible previously-active member subscription can restart", eligibleDashboard.subscriptions.find((entry) => entry.subscriptionId === main.subscriptionId)?.restartEligible === true);

  const beforeRestart = await commerce.readMembershipCommerceState(stateFilePath);
  const completedBefore = structuredClone(beforeRestart.cycles[completed.cycleId]);
  const fulfillmentBefore = structuredClone(beforeRestart.events.filter((event) => event.subscriptionId === main.subscriptionId && event.type === "qualifying_fulfillment"));
  const financialBefore = JSON.stringify({
    creditEntries: beforeRestart.creditEntries,
    referrals: beforeRestart.referrals,
    referralRewards: beforeRestart.referralRewards,
    retailPromotionRewards: beforeRestart.retailPromotionRewards,
  });
  const giftProgressBefore = await commerce.getGiftProgress(main.subscriptionId, stateFilePath);

  const restarted = await commerce.restartTerminatedSubscription({
    memberId: memberA,
    subscriptionId: terminated.subscriptionId,
    expectedRevision: terminated.revision,
    resumeDate: "2026-09-20",
    intervalDays: 45,
    idempotencyKey: "restart-main",
    now: new Date("2026-09-12T01:00:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
  check("same subscriptionId remains", restarted.subscription.subscriptionId === main.subscriptionId);
  check("status changes terminated to active", restarted.subscription.status === "active");
  check("selected resumeDate becomes anchorDate", restarted.subscription.anchorDate === "2026-09-20");
  check("selected interval becomes intervalDays", restarted.subscription.intervalDays === 45);
  check("one editable future cycle is reused, not duplicated", restarted.cycleAction === "reused" && restarted.cycle?.cycleId === editable.cycleId && restarted.cycle.plannedDate === "2026-09-20");

  const generatedSource = await activeSubscription(memberA, "generated");
  const generatedTerminated = await terminateMemberSubscription(memberA, generatedSource, "generated");
  const generatedRestart = await commerce.restartTerminatedSubscription({
    memberId: memberA,
    subscriptionId: generatedTerminated.subscriptionId,
    expectedRevision: generatedTerminated.revision,
    resumeDate: "2026-09-21",
    intervalDays: 30,
    idempotencyKey: "restart-generated",
    now: new Date("2026-09-12T01:00:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
  let generatedState = await commerce.readMembershipCommerceState(stateFilePath);
  check("when appropriate exactly one future scheduled cycle is created", generatedRestart.cycleAction === "created" && Object.values(generatedState.cycles).filter((cycle) => cycle.subscriptionId === generatedSource.subscriptionId && cycle.kind === "scheduled").length === 1);

  const replay = await commerce.restartTerminatedSubscription({
    memberId: memberA,
    subscriptionId: generatedTerminated.subscriptionId,
    expectedRevision: generatedTerminated.revision,
    resumeDate: "2026-09-21",
    intervalDays: 30,
    idempotencyKey: "restart-generated",
    now: new Date("2026-09-12T01:01:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
  generatedState = await commerce.readMembershipCommerceState(stateFilePath);
  check("idempotent retry creates no duplicate cycle", replay.cycle?.cycleId === generatedRestart.cycle?.cycleId && Object.values(generatedState.cycles).filter((cycle) => cycle.subscriptionId === generatedSource.subscriptionId && cycle.kind === "scheduled").length === 1);

  const afterRestart = await commerce.readMembershipCommerceState(stateFilePath);
  check("old completed cycles remain unchanged", JSON.stringify(afterRestart.cycles[completed.cycleId]) === JSON.stringify(completedBefore));
  check("old order link remains unchanged", afterRestart.cycles[completed.cycleId].createdOrderId === "ORDER-RESTART-HISTORY");
  const fulfillmentAfter = afterRestart.events.filter((event) => event.subscriptionId === main.subscriptionId && event.type === "qualifying_fulfillment");
  check("old fulfillment history remains unchanged", JSON.stringify(fulfillmentAfter) === JSON.stringify(fulfillmentBefore));
  check("reward credit and referral state remain unchanged", JSON.stringify({ creditEntries: afterRestart.creditEntries, referrals: afterRestart.referrals, referralRewards: afterRestart.referralRewards, retailPromotionRewards: afterRestart.retailPromotionRewards }) === financialBefore);
  check("gift progress is not reset", await commerce.getGiftProgress(main.subscriptionId, stateFilePath) === giftProgressBefore);
  check("restart itself does not count as fulfillment", fulfillmentAfter.length === fulfillmentBefore.length && afterRestart.events.some((event) => event.subscriptionId === main.subscriptionId && event.type === "subscription_restarted"));

  const validationSource = await activeSubscription(memberA, "validation");
  const validationTerminated = await terminateMemberSubscription(memberA, validationSource, "validation");
  const restartInput = {
    memberId: memberA,
    subscriptionId: validationTerminated.subscriptionId,
    expectedRevision: validationTerminated.revision,
    resumeDate: "2026-09-20",
    intervalDays: 30,
    now: new Date("2026-09-12T01:00:00.000Z"),
    stateFilePath,
    rulesFilePath,
  };
  await rejects("invalid resume date is rejected", () => commerce.restartTerminatedSubscription({ ...restartInput, resumeDate: "2026-09-13", idempotencyKey: "restart-invalid-date" }));
  await rejects("invalid interval is rejected", () => commerce.restartTerminatedSubscription({ ...restartInput, intervalDays: 13, idempotencyKey: "restart-invalid-interval" }));
  await rejects("wrong member is rejected", () => commerce.restartTerminatedSubscription({ ...restartInput, memberId: memberB, idempotencyKey: "restart-wrong-member" }));
  await rejects("stale revision is rejected", () => commerce.restartTerminatedSubscription({ ...restartInput, expectedRevision: validationTerminated.revision - 1, idempotencyKey: "restart-stale" }));

  const activeOnly = await activeSubscription(memberA, "active-only");
  await rejects("active subscription cannot use restart", () => commerce.restartTerminatedSubscription({ memberId: memberA, subscriptionId: activeOnly.subscriptionId, expectedRevision: activeOnly.revision, resumeDate: "2026-09-20", intervalDays: 30, idempotencyKey: "restart-active", now: new Date("2026-09-12T01:00:00.000Z"), stateFilePath, rulesFilePath }));

  const pauseSource = await activeSubscription(memberA, "pause-resume");
  const paused = await commerce.setSubscriptionStatus({ memberId: memberA, subscriptionId: pauseSource.subscriptionId, expectedRevision: pauseSource.revision, status: "paused", reason: "會員暫停配送", idempotencyKey: "pause-normal", now: new Date("2026-09-10T01:00:00.000Z"), stateFilePath, rulesFilePath });
  await rejects("paused subscription continues using normal resume not restart", () => commerce.restartTerminatedSubscription({ memberId: memberA, subscriptionId: paused.subscriptionId, expectedRevision: paused.revision, resumeDate: "2026-09-20", intervalDays: 30, idempotencyKey: "restart-paused", now: new Date("2026-09-12T01:00:00.000Z"), stateFilePath, rulesFilePath }));
  const resumed = await commerce.setSubscriptionStatus({ memberId: memberA, subscriptionId: paused.subscriptionId, expectedRevision: paused.revision, status: "active", reason: "會員恢復配送", resumeDate: "2026-09-20", intervalDays: 30, idempotencyKey: "resume-normal", now: new Date("2026-09-12T01:00:00.000Z"), stateFilePath, rulesFilePath });
  check("normal pause to resume still works", resumed.status === "active" && resumed.anchorDate === "2026-09-20");

  check("2026-09-29 plus three preparation days resolves to 2026-10-02", policy.resolveDateAvailability({ requestedDate: "2026-09-29", today: "2026-09-29", leadDays: 3 }).earliestDate === "2026-10-02");
  const dateBoundarySource = await activeSubscription(memberA, "date-boundary");
  const dateBoundaryTerminated = await terminateMemberSubscription(memberA, dateBoundarySource, "date-boundary");
  await rejects("restart rejects the date immediately before the canonical minimum", () => commerce.restartTerminatedSubscription({ memberId: memberA, subscriptionId: dateBoundaryTerminated.subscriptionId, expectedRevision: dateBoundaryTerminated.revision, resumeDate: "2026-10-01", intervalDays: 30, idempotencyKey: "restart-date-before-minimum", now: new Date("2026-09-29T01:00:00.000Z"), stateFilePath, rulesFilePath }));
  const dateBoundaryRestarted = await commerce.restartTerminatedSubscription({ memberId: memberA, subscriptionId: dateBoundaryTerminated.subscriptionId, expectedRevision: dateBoundaryTerminated.revision, resumeDate: "2026-10-02", intervalDays: 30, idempotencyKey: "restart-date-at-minimum", now: new Date("2026-09-29T01:00:00.000Z"), stateFilePath, rulesFilePath });
  check("restart accepts the canonical minimum date", dateBoundaryRestarted.subscription.anchorDate === "2026-10-02");

  const customRoastItem = {
    ...item,
    itemId: "restart-coffee-dedicated-roast",
    quantity: 4,
    components: [{ productId: "restart-coffee", skuId: "restart-coffee-half", weightHalfPounds: 1 as const, customRoast: true, roastLevel: "中深焙" }],
  };
  const customRoastSource = await activeSubscription(memberA, "custom-roast-resume", [customRoastItem]);
  const customRoastPaused = await commerce.setSubscriptionStatus({ memberId: memberA, subscriptionId: customRoastSource.subscriptionId, expectedRevision: customRoastSource.revision, status: "paused", reason: "會員暫停配送", idempotencyKey: "pause-custom-roast", now: new Date("2026-09-12T01:00:00.000Z"), stateFilePath, rulesFilePath });
  await rejects("dedicated-roast resume rejects the standard three-day minimum", () => commerce.setSubscriptionStatus({ memberId: memberA, subscriptionId: customRoastPaused.subscriptionId, expectedRevision: customRoastPaused.revision, status: "active", reason: "會員恢復配送", resumeDate: "2026-09-15", intervalDays: 30, idempotencyKey: "resume-custom-roast-too-early", now: new Date("2026-09-12T01:00:00.000Z"), stateFilePath, rulesFilePath }));
  const customRoastResumed = await commerce.setSubscriptionStatus({ memberId: memberA, subscriptionId: customRoastPaused.subscriptionId, expectedRevision: customRoastPaused.revision, status: "active", reason: "會員恢復配送", resumeDate: "2026-09-19", intervalDays: 30, idempotencyKey: "resume-custom-roast-valid", now: new Date("2026-09-12T01:00:00.000Z"), stateFilePath, rulesFilePath });
  check("dedicated-roast resume accepts its canonical seven-day minimum", customRoastResumed.anchorDate === "2026-09-19");

  const pending = await commerce.createSubscription({ memberId: memberA, startedFromOrderId: "first-pending-cancel", anchorDate: "2026-09-20", intervalDays: 30, shippingMethod: "studio_pickup", defaultItems: [item], idempotencyKey: "pending-cancel", now: new Date("2026-09-01T01:00:00.000Z"), stateFilePath, rulesFilePath });
  const pendingCancelled = await terminateMemberSubscription(memberA, pending, "pending-cancel");
  const pendingDashboard = await commerce.getMemberCommerceDashboard(memberA, new Date("2026-09-12T01:00:00.000Z"), stateFilePath);
  await rejects("cancelled pending activation cannot self restart", () => commerce.restartTerminatedSubscription({ memberId: memberA, subscriptionId: pendingCancelled.subscriptionId, expectedRevision: pendingCancelled.revision, resumeDate: "2026-09-20", intervalDays: 30, idempotencyKey: "restart-pending-cancel", now: new Date("2026-09-12T01:00:00.000Z"), stateFilePath, rulesFilePath }));
  check("cancelled pending activation is not projected as restartable", pendingDashboard.subscriptions.find((entry) => entry.subscriptionId === pending.subscriptionId)?.restartEligible === false);

  const uncollectedSource = await activeSubscription(memberA, "uncollected");
  const uncollected = await commerce.markUncollected({ subscriptionId: uncollectedSource.subscriptionId, orderId: "ORDER-UNCOLLECTED", idempotencyKey: "uncollected-policy", now: new Date("2026-09-10T01:00:00.000Z"), stateFilePath, rulesFilePath });
  const uncollectedDashboard = await commerce.getMemberCommerceDashboard(memberA, new Date("2026-09-12T01:00:00.000Z"), stateFilePath);
  await rejects("automatic uncollected termination cannot bypass policy", () => commerce.restartTerminatedSubscription({ memberId: memberA, subscriptionId: uncollected.subscriptionId, expectedRevision: uncollected.revision, resumeDate: "2026-09-20", intervalDays: 30, idempotencyKey: "restart-uncollected", now: new Date("2026-09-12T01:00:00.000Z"), stateFilePath, rulesFilePath }));
  check("automatic uncollected termination is not projected as restartable", uncollectedDashboard.subscriptions.find((entry) => entry.subscriptionId === uncollected.subscriptionId)?.restartEligible === false);

  const terminateCheck = await activeSubscription(memberA, "terminate-intact");
  const terminatedCheck = await terminateMemberSubscription(memberA, terminateCheck, "terminate-intact");
  const terminateState = await commerce.readMembershipCommerceState(stateFilePath);
  check("terminate behavior remains intact", terminatedCheck.status === "terminated" && terminateState.events.some((event) => event.subscriptionId === terminateCheck.subscriptionId && event.type === "subscription_terminated"));

  const hidden = await commerce.hideTerminatedSubscriptionFromMember({ memberId: memberA, subscriptionId: pendingCancelled.subscriptionId, expectedRevision: pendingCancelled.revision, idempotencyKey: "hide-pending-cancel", now: new Date("2026-09-12T02:00:00.000Z"), stateFilePath });
  const hiddenDashboard = await commerce.getMemberCommerceDashboard(memberA, new Date("2026-09-12T02:00:00.000Z"), stateFilePath);
  check("hide terminated behavior remains intact", Boolean(hidden.memberHiddenAt) && !hiddenDashboard.subscriptions.some((entry) => entry.subscriptionId === pendingCancelled.subscriptionId));

  const committedSource = await activeSubscription(memberA, "committed");
  const committedCycle = await commerce.generateSubscriptionCycle({ subscriptionId: committedSource.subscriptionId, sequence: 1, plannedDate: "2026-09-25", idempotencyKey: "committed-cycle", now: new Date("2026-09-03T01:00:00.000Z"), stateFilePath, rulesFilePath });
  const committedLocked = await commerce.lockSubscriptionCycle({ cycleId: committedCycle.cycleId, idempotencyKey: "committed-lock", now: new Date("2026-09-04T01:00:00.000Z"), stateFilePath, rulesFilePath });
  const committedTerminated = await terminateMemberSubscription(memberA, committedSource, "committed");
  const committedRestart = await commerce.restartTerminatedSubscription({ memberId: memberA, subscriptionId: committedTerminated.subscriptionId, expectedRevision: committedTerminated.revision, resumeDate: "2026-09-20", intervalDays: 30, idempotencyKey: "restart-committed", now: new Date("2026-09-12T01:00:00.000Z"), stateFilePath, rulesFilePath });
  const committedState = await commerce.readMembershipCommerceState(stateFilePath);
  check("committed in-flight cycle defers new cycle creation", committedRestart.cycleAction === "deferred" && committedState.cycles[committedLocked.cycleId].status === "locked" && Object.values(committedState.cycles).filter((cycle) => cycle.subscriptionId === committedSource.subscriptionId).length === 1);

  const componentSource = await readFile(path.join(process.cwd(), "components/member/MemberSubscriptionExperience.tsx"), "utf8");
  const routeSource = await readFile(path.join(process.cwd(), "app/api/member/subscription/route.ts"), "utf8");
  const checkoutSource = await readFile(path.join(process.cwd(), "app/checkout/page.tsx"), "utf8");
  const orderRouteSource = await readFile(path.join(process.cwd(), "app/api/orders/route.ts"), "utf8");
  const globalCss = await readFile(path.join(process.cwd(), "app/globals.css"), "utf8");
  check("terminated UI uses eligibility-gated two-step restart panel", componentSource.includes("subscription.restartEligible") && componentSource.includes("重新啟動定期配送") && componentSource.includes("確認重新啟動") && componentSource.includes("restartPanelSubscriptionId"));
  check("terminated UI removes the rejected system explanation", !componentSource.includes("已停止的定期配送不會再建立新的配送"));
  check("API exposes a dedicated restart action without broadening resume", routeSource.includes('action === "restart"') && routeSource.includes("restartTerminatedSubscription") && routeSource.includes('["pause", "resume", "terminate"]'));
  check("checkout no longer renders or submits a member-selected first renewal date", !checkoutSource.includes("firstRenewalDate") && !checkoutSource.includes("希望第一次續訂日期"));
  check("orders API stores only consent and interval while using a provisional pending anchor", !orderRouteSource.includes("firstRenewalDate") && orderRouteSource.includes("provisionalPendingActivationAnchorDate"));
  check("paused resume UI uses next-delivery wording and canonical minimum", !componentSource.includes("<label>恢復日期") && componentSource.includes("min={resumeEarliestDate}") && componentSource.includes("最早可選：{displayDate(resumeEarliestDate)}"));
  check("terminated restart UI uses the same canonical minimum and stale-date clamp", componentSource.includes("min={restartEarliestDate}") && componentSource.includes("最早可選：{displayDate(restartEarliestDate)}") && componentSource.includes("current >= currentMinimum ? current : currentMinimum"));
  check("stop confirmation uses approved member-facing copy", componentSource.includes("確定停止定期配送嗎？") && componentSource.includes("停止後，之後不再安排新的定期配送。") && componentSource.includes("這次已成立的訂單會照原安排處理。") && componentSource.includes("先不要") && componentSource.includes("確認停止定期配送"));
  check("checkout quantity value has explicit readable high-contrast styling", /\.checkout-summary \.quantity-control span\{[^}]*background:#fffdf9[^}]*color:#251b16[^}]*font-weight:800/.test(globalCss));

  console.log(`Terminated subscription restart: ${count}/${count} PASS`);
} finally {
  await rm(testRoot, { recursive: true, force: true });
}
