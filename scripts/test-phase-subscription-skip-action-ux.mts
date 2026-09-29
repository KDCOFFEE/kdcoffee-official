import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "kd-subscription-skip-"));
process.env.KD_DATA_DIR = testRoot;
process.env.AUTH_SESSION_SECRET = "subscription-skip-action-ux-test-secret";

const commerce = await import("../lib/membershipCommerce");
const identity = await import("../lib/memberIdentity");
const stateFilePath = path.join(testRoot, "membership-commerce", "commerce-state.json");
const rulesFilePath = path.join(testRoot, "membership-commerce", "business-rules.json");

const defaultItem = {
  itemId: "skip-coffee-half",
  skuKind: "beans" as const,
  packageWeight: "half-pound" as const,
  quantity: 1,
  roast: "淺中焙",
  components: [{ productId: "skip-coffee", skuId: "skip-coffee-half", weightHalfPounds: 1 as const }],
  unitPrice: 700,
};

let count = 0;

function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  count += 1;
  console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
}

async function member(subject: string) {
  return (await identity.provisionCanonicalMember({
    provider: "email",
    subject,
    persistMember: async () => undefined,
  })).member.memberId;
}

async function activeSubscription(memberId: string, suffix: string, anchorDate = "2026-09-02") {
  const pending = await commerce.createSubscription({
    memberId,
    startedFromOrderId: `first-${suffix}`,
    anchorDate,
    intervalDays: 30,
    shippingMethod: "studio_pickup",
    defaultItems: [defaultItem],
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

async function scheduledCycle(subscriptionId: string, sequence: number, plannedDate: string, suffix: string) {
  return commerce.generateSubscriptionCycle({
    subscriptionId,
    sequence,
    plannedDate,
    idempotencyKey: `cycle-${suffix}`,
    now: new Date("2026-09-10T01:00:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
}

try {
  const memberId = await member("skip-action@example.test");

  const main = await activeSubscription(memberId, "main");
  const current = await scheduledCycle(main.subscriptionId, 1, "2026-10-02", "main-current");
  let state = await commerce.readMembershipCommerceState(stateFilePath);
  check("active subscription starts with one editable current cycle", Object.values(state.cycles).filter((cycle) => cycle.subscriptionId === main.subscriptionId && ["scheduled", "modifiable"].includes(cycle.status)).length === 1);

  const protectedBefore = {
    rewards: structuredClone(state.referralRewards),
    credits: structuredClone(state.creditEntries),
    referrals: structuredClone(state.referrals),
    giftProgress: await commerce.getGiftProgress(main.subscriptionId, stateFilePath),
    qualifyingFulfillments: state.events.filter((event) => event.subscriptionId === main.subscriptionId && event.type === "qualifying_fulfillment").length,
  };
  const skipped = await commerce.memberSkipCycle({
    memberId,
    cycleId: current.cycleId,
    expectedRevision: current.revision,
    idempotencyKey: "skip-main",
    now: new Date("2026-09-20T01:00:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
  state = await commerce.readMembershipCommerceState(stateFilePath);
  const mainCycles = Object.values(state.cycles).filter((cycle) => cycle.subscriptionId === main.subscriptionId && cycle.kind === "scheduled");
  const mainNext = mainCycles.find((cycle) => cycle.cycleId === skipped.nextCycle?.cycleId);
  check("skip marks only the current cycle skipped", state.cycles[current.cycleId].status === "skipped" && mainCycles.filter((cycle) => cycle.status === "skipped").length === 1);
  check("subscription remains active after skip", state.subscriptions[main.subscriptionId].status === "active");
  check("next planned delivery is immediately available", skipped.plannedDate === "2026-11-01" && mainNext?.status === "modifiable");
  check("2026-10-02 current occurrence continues to the canonical 2026-11-01 date", skipped.skippedDate === "2026-10-02" && skipped.plannedDate === "2026-11-01");
  check("new next cycle preserves current default items", JSON.stringify(mainNext?.itemsDraft) === JSON.stringify([defaultItem]));
  check("skip creates no order or locked shipping snapshot", mainNext?.createdOrderId === null && mainNext?.shippingSnapshot === null);
  check("skip preserves interval and shipping preferences", state.subscriptions[main.subscriptionId].intervalDays === 30 && state.subscriptions[main.subscriptionId].shippingMethod === "studio_pickup");
  check("skipped cycle remains historical after next-cycle creation", state.cycles[current.cycleId].plannedDate === "2026-10-02" && state.cycles[current.cycleId].sequence === 1 && JSON.stringify(state.cycles[current.cycleId].itemsDraft) === JSON.stringify([defaultItem]));
  check("gift progress is unchanged by skip and next-cycle creation", await commerce.getGiftProgress(main.subscriptionId, stateFilePath) === protectedBefore.giftProgress);
  check("skip itself does not count as a qualifying fulfillment", state.events.filter((event) => event.subscriptionId === main.subscriptionId && event.type === "qualifying_fulfillment").length === protectedBefore.qualifyingFulfillments);
  check("rewards credits and referrals are unchanged", JSON.stringify({ rewards: state.referralRewards, credits: state.creditEntries, referrals: state.referrals }) === JSON.stringify({ rewards: protectedBefore.rewards, credits: protectedBefore.credits, referrals: protectedBefore.referrals }));

  const replay = await commerce.memberSkipCycle({
    memberId,
    cycleId: current.cycleId,
    expectedRevision: current.revision,
    idempotencyKey: "skip-main",
    now: new Date("2026-09-20T01:01:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
  state = await commerce.readMembershipCommerceState(stateFilePath);
  check("idempotent retry creates no duplicate next cycle", replay.nextCycle?.cycleId === mainNext?.cycleId && Object.values(state.cycles).filter((cycle) => cycle.subscriptionId === main.subscriptionId && cycle.kind === "scheduled").length === 2);

  const reusable = await activeSubscription(memberId, "reuse");
  const reusableCurrent = await scheduledCycle(reusable.subscriptionId, 1, "2026-10-02", "reuse-current");
  const reusableLater = await scheduledCycle(reusable.subscriptionId, 2, "2026-11-01", "reuse-later");
  const reused = await commerce.memberSkipCycle({ memberId, cycleId: reusableCurrent.cycleId, expectedRevision: reusableCurrent.revision, idempotencyKey: "skip-reuse", now: new Date("2026-09-20T01:00:00.000Z"), stateFilePath, rulesFilePath });
  state = await commerce.readMembershipCommerceState(stateFilePath);
  check("existing later editable cycle is reused", reused.nextCycleAction === "reused" && reused.nextCycle?.cycleId === reusableLater.cycleId && Object.values(state.cycles).filter((cycle) => cycle.subscriptionId === reusable.subscriptionId).length === 2);

  const committed = await activeSubscription(memberId, "committed");
  const committedCurrent = await scheduledCycle(committed.subscriptionId, 1, "2026-10-02", "committed-current");
  const committedLater = await scheduledCycle(committed.subscriptionId, 2, "2026-11-01", "committed-later");
  const lockedLater = await commerce.lockSubscriptionCycle({ cycleId: committedLater.cycleId, idempotencyKey: "lock-committed-later", now: new Date("2026-09-20T01:00:00.000Z"), stateFilePath, rulesFilePath });
  const committedSkip = await commerce.memberSkipCycle({ memberId, cycleId: committedCurrent.cycleId, expectedRevision: committedCurrent.revision, idempotencyKey: "skip-committed", now: new Date("2026-09-20T01:01:00.000Z"), stateFilePath, rulesFilePath });
  state = await commerce.readMembershipCommerceState(stateFilePath);
  check("existing later committed cycle is exposed without duplication", committedSkip.nextCycle?.cycleId === lockedLater.cycleId && committedSkip.plannedDate === "2026-11-01" && Object.values(state.cycles).filter((cycle) => cycle.subscriptionId === committed.subscriptionId).length === 2);

  const oneOff = await activeSubscription(memberId, "one-off", "2026-09-01");
  const oneOffCurrent = await scheduledCycle(oneOff.subscriptionId, 1, "2026-10-01", "one-off-current");
  const movedOneOff = await commerce.modifyCycleDate({ memberId, cycleId: oneOffCurrent.cycleId, expectedRevision: oneOffCurrent.revision, plannedDate: "2026-10-02", recalculateAnchor: false, idempotencyKey: "move-one-off", now: new Date("2026-09-20T01:00:00.000Z"), stateFilePath, rulesFilePath });
  const oneOffSkip = await commerce.memberSkipCycle({ memberId, cycleId: movedOneOff.cycleId, expectedRevision: movedOneOff.revision, idempotencyKey: "skip-one-off", now: new Date("2026-09-20T01:01:00.000Z"), stateFilePath, rulesFilePath });
  check("one-off current-date adjustment does not shift the future cadence", oneOffSkip.skippedDate === "2026-10-02" && oneOffSkip.plannedDate === "2026-10-31");

  const restartSource = await activeSubscription(memberId, "restart-cadence");
  const terminated = await commerce.setSubscriptionStatus({ memberId, subscriptionId: restartSource.subscriptionId, expectedRevision: restartSource.revision, status: "terminated", reason: "會員停止定期配送", idempotencyKey: "terminate-restart-cadence", now: new Date("2026-09-10T01:00:00.000Z"), stateFilePath, rulesFilePath });
  const restarted = await commerce.restartTerminatedSubscription({ memberId, subscriptionId: terminated.subscriptionId, expectedRevision: terminated.revision, resumeDate: "2026-10-02", intervalDays: 30, idempotencyKey: "restart-cadence", now: new Date("2026-09-20T01:00:00.000Z"), stateFilePath, rulesFilePath });
  assert(restarted.cycle);
  const restartSkip = await commerce.memberSkipCycle({ memberId, cycleId: restarted.cycle.cycleId, expectedRevision: restarted.cycle.revision, idempotencyKey: "skip-restarted", now: new Date("2026-09-20T01:01:00.000Z"), stateFilePath, rulesFilePath });
  check("restart-established next date remains the cadence basis after skip", restartSkip.skippedDate === "2026-10-02" && restartSkip.plannedDate === "2026-11-01");

  const pauseSource = await activeSubscription(memberId, "pause-resume");
  const paused = await commerce.setSubscriptionStatus({ memberId, subscriptionId: pauseSource.subscriptionId, expectedRevision: pauseSource.revision, status: "paused", reason: "會員暫停配送", idempotencyKey: "pause-normal", now: new Date("2026-09-20T01:00:00.000Z"), stateFilePath, rulesFilePath });
  const resumed = await commerce.setSubscriptionStatus({ memberId, subscriptionId: paused.subscriptionId, expectedRevision: paused.revision, status: "active", reason: "會員恢復配送", resumeDate: "2026-09-23", intervalDays: 30, idempotencyKey: "resume-normal", now: new Date("2026-09-20T01:01:00.000Z"), stateFilePath, rulesFilePath });
  check("normal pause to resume remains functional", resumed.status === "active" && resumed.anchorDate === "2026-09-23");

  const dashboard = await commerce.getMemberCommerceDashboard(memberId, new Date("2026-09-20T01:02:00.000Z"), stateFilePath);
  const dashboardNext = dashboard.cycles.find((cycle) => cycle.subscriptionId === main.subscriptionId && ["scheduled", "modifiable"].includes(cycle.status));
  check("dashboard immediately exposes the created next occurrence", dashboardNext?.cycleId === mainNext?.cycleId && dashboardNext?.plannedDate === "2026-11-01");

  const componentSource = await readFile(path.join(process.cwd(), "components/member/MemberSubscriptionExperience.tsx"), "utf8");
  const routeSource = await readFile(path.join(process.cwd(), "app/api/member/subscription/route.ts"), "utf8");
  check("API returns skippedDate", routeSource.includes("actionResult.skippedDate = result.skippedDate"));
  check("API returns actual next plannedDate", routeSource.includes("actionResult.plannedDate = result.plannedDate"));
  check("success message includes actual skipped and next dates without engineering wording", componentSource.includes("displayDate(skippedDate)") && componentSource.includes("下一次配送日期：${displayDate(plannedDate)}") && !componentSource.includes("原配送週期維持不變"));
  check("skip panel targets the refreshed next occurrence", componentSource.includes("只跳過 {displayDate(nextCycle.plannedDate)} 這一次。") && dashboardNext?.plannedDate === "2026-11-01");
  check("ACTIVE UI exposes only the pause lifecycle action", componentSource.includes('subscription.status === "active" ? "暫停定期配送"') && componentSource.includes("暫停未來定期配送") && !componentSource.includes("只停止之後的定期配送，本次配送照常"));
  check("PAUSED UI retains resume and exposes secondary permanent stop", componentSource.includes('subscription.status === "paused"') && componentSource.includes("確認恢復") && componentSource.includes("停止這筆定期配送") && componentSource.includes("恢復或停止定期配送"));
  check("stop confirmation remains functional and conditionally truthful", componentSource.includes("async function confirmTermination()") && componentSource.includes("確定停止定期配送嗎？") && componentSource.includes("terminationTargetHasCurrentOrder"));
  check("terminated restart remains functional", restarted.subscription.status === "active" && componentSource.includes("重新啟動定期配送"));

  console.log(`Subscription skip/action UX correction: ${count}/${count} PASS`);
} finally {
  await rm(testRoot, { recursive: true, force: true });
}
