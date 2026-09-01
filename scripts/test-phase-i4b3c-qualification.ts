import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-i4b3c-"));
process.env.KD_DATA_DIR = root;

const { DEFAULT_MEMBERSHIP_RULES, readMembershipRulesStore, saveMembershipBusinessRules } = await import("../lib/membershipBusinessRules");
const { readMembershipCommerceState, recordValidConsumptionFromCompletedOrder } = await import("../lib/membershipCommerce");

let checks = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
}

let orderSequence = 10000;
async function writeOrder(input: { status?: string; subtotal: number; shipping?: number; credit?: number; memberId?: string }) {
  orderSequence += 1;
  const orderId = `KD20260901-${orderSequence}`;
  const shipping = input.shipping ?? 0;
  const credit = input.credit ?? 0;
  const order = {
    orderNumber: orderId,
    status: input.status ?? "completed",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    orderMode: "normal",
    subtotal: input.subtotal,
    shipping,
    totalBeforeCredit: input.subtotal + shipping,
    total: input.subtotal + shipping - credit,
    member: { memberId: input.memberId ?? "member-1" },
    credit: credit > 0 ? { reservationId: `reservation-${orderSequence}`, appliedAmount: credit } : undefined,
  };
  const ordersDir = path.join(root, "orders");
  await fs.mkdir(ordersDir, { recursive: true });
  await fs.writeFile(path.join(ordersDir, `${orderId}.json`), `${JSON.stringify(order, null, 2)}\n`, "utf8");
  return orderId;
}

let scenarioSequence = 0;
async function scenario(mutator?: (rules: typeof DEFAULT_MEMBERSHIP_RULES) => void) {
  scenarioSequence += 1;
  const directory = path.join(root, `scenario-${scenarioSequence}`);
  const stateFilePath = path.join(directory, "commerce-state.json");
  const rulesFilePath = path.join(directory, "business-rules.json");
  const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES);
  mutator?.(rules);
  await saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-01-01T00:00:00.000Z") }, rulesFilePath);
  return { stateFilePath, rulesFilePath, rules };
}

async function record(context: Awaited<ReturnType<typeof scenario>>, input: { subtotal: number; shipping?: number; credit?: number; status?: string; memberId?: string; at?: string }) {
  const memberId = input.memberId ?? "member-1";
  const orderId = await writeOrder({ ...input, memberId });
  const result = await recordValidConsumptionFromCompletedOrder({ memberId, orderId, idempotencyKey: `test:${orderId}`, now: new Date(input.at ?? "2026-09-01T00:00:00.000Z"), stateFilePath: context.stateFilePath, rulesFilePath: context.rulesFilePath });
  return { orderId, result };
}

async function setActiveSubscription(context: Awaited<ReturnType<typeof scenario>>, memberId: string, active: boolean) {
  const state = await readMembershipCommerceState(context.stateFilePath);
  state.subscriptions[`test-sub-${memberId}`] = { memberId, status: active ? "active" : "paused" } as never;
  await fs.mkdir(path.dirname(context.stateFilePath), { recursive: true });
  await fs.writeFile(context.stateFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

try {
  const amountContext = await scenario((rules) => { rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 99_999; });
  const creditIncluded = await record(amountContext, { subtotal: 1_500, shipping: 60, credit: 300 });
  check(creditIncluded.result?.event.validConsumptionAmount === 1_500, "completed order creates an event and includes credit discount by default");
  check(creditIncluded.result?.event.merchandiseSubtotal === 1_500 && creditIncluded.result.event.appliedCreditAmount === 300 && creditIncluded.result.event.shippingAmount === 60, "event snapshots canonical subtotal, explicit credit, and shipping evidence");
  check(creditIncluded.result?.event.sourceReference === `completed-order:${creditIncluded.orderId}`, "event stores deterministic completed-order source evidence");
  check(Object.keys((await readMembershipCommerceState(amountContext.stateFilePath)).validConsumptionEvents).length === 1, "completed order creates exactly one durable event");
  const duplicate = await recordValidConsumptionFromCompletedOrder({ memberId: "member-1", orderId: creditIncluded.orderId, idempotencyKey: "different-retry-key", now: new Date("2026-09-01T01:00:00.000Z"), stateFilePath: amountContext.stateFilePath, rulesFilePath: amountContext.rulesFilePath });
  check(duplicate?.created === false && Object.keys((await readMembershipCommerceState(amountContext.stateFilePath)).validConsumptionEvents).length === 1, "same completed order is idempotent even with another caller key");
  const cancelled = await record(amountContext, { subtotal: 2_000, status: "cancelled" });
  check(cancelled.result === null && Object.keys((await readMembershipCommerceState(amountContext.stateFilePath)).validConsumptionEvents).length === 1, "cancelled or noncompleted order creates no event");

  const excludedContext = await scenario((rules) => { rules.referral.payoutQualification.validConsumption.includeCreditDiscount = false; rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 99_999; });
  check((await record(excludedContext, { subtotal: 1_500, shipping: 60, credit: 300 })).result?.event.validConsumptionAmount === 1_200, "credit is subtracted when Owner excludes credit discount");
  check((await record(excludedContext, { subtotal: 100, credit: 100 })).result?.event.validConsumptionAmount === 0, "valid consumption never falls below zero");
  const shippingExcluded = await record(excludedContext, { subtotal: 500, shipping: 60 });
  check(shippingExcluded.result?.event.validConsumptionAmount === 500, "shipping is excluded by default");
  const shippingContext = await scenario((rules) => { rules.referral.payoutQualification.validConsumption.includeShipping = true; rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 99_999; });
  check((await record(shippingContext, { subtotal: 500, shipping: 60 })).result?.event.validConsumptionAmount === 560, "shipping is included when Owner enables it");

  const general = await scenario((rules) => { rules.referral.payoutQualification.mode = "general"; });
  const firstGeneral = await record(general, { subtotal: 700, at: "2026-08-20T00:00:00.000Z" });
  check(firstGeneral.result?.qualificationRound === null, "below general threshold does not qualify");
  check(Object.keys((await readMembershipCommerceState(general.stateFilePath)).validConsumptionEvents).length === 1, "failed qualification still preserves its immutable consumption event");
  const exactGeneral = await record(general, { subtotal: 800, at: "2026-09-01T00:00:00.000Z" });
  check(exactGeneral.result?.qualificationRound?.generalPath.cumulativeAmount === 1_500, "multiple orders accumulate to exactly general threshold");
  check(exactGeneral.result?.qualificationRound?.generalPath.passed === true, "exactly NT$1500 qualifies general path");
  const aboveGeneral = await scenario((rules) => { rules.referral.payoutQualification.mode = "general"; });
  check((await record(aboveGeneral, { subtotal: 1_501 })).result?.qualificationRound?.finalQualified === true, "above general threshold qualifies");

  const outside = await scenario((rules) => { rules.referral.payoutQualification.mode = "general"; });
  await record(outside, { subtotal: 1_000, at: "2026-08-01T23:59:59.999Z" });
  const outsideResult = await record(outside, { subtotal: 500, at: "2026-09-01T00:00:00.000Z" });
  check(outsideResult.result?.qualificationRound === null, "event one millisecond outside 30-day boundary is excluded");
  const boundary = await scenario((rules) => { rules.referral.payoutQualification.mode = "general"; });
  await record(boundary, { subtotal: 1_000, at: "2026-08-02T00:00:00.000Z" });
  const boundaryResult = await record(boundary, { subtotal: 500, at: "2026-09-01T00:00:00.000Z" });
  check(boundaryResult.result?.qualificationRound?.generalPath.cumulativeAmount === 1_500, "exact rolling-window instant is inclusive");

  const subscription = await scenario((rules) => { rules.referral.payoutQualification.mode = "subscription"; });
  await setActiveSubscription(subscription, "active-member", true);
  await record(subscription, { subtotal: 400, memberId: "active-member", at: "2026-08-25T00:00:00.000Z" });
  const activeResult = await record(subscription, { subtotal: 600, memberId: "active-member" });
  check(activeResult.result?.qualificationRound?.subscriptionPath.passed === true, "active subscription and cumulative NT$1000 qualify");
  check(activeResult.result?.qualificationRound?.subscriptionPath.cumulativeAmount === 1_000 && activeResult.result.qualificationRound.subscriptionPath.eligibleEventIds.length === 2, "subscription path accumulates multiple events in its own window");
  check(activeResult.result?.event.activeSubscriptionAtCompletion === true, "active subscription status is snapshotted at event time");
  const inactive = await scenario((rules) => { rules.referral.payoutQualification.mode = "subscription"; });
  const inactiveResult = await record(inactive, { subtotal: 1_000, memberId: "inactive-member" });
  check(inactiveResult.result?.qualificationRound === null, "inactive member fails subscription path at NT$1000");
  await setActiveSubscription(inactive, "inactive-member", true);
  check((await readMembershipCommerceState(inactive.stateFilePath)).validConsumptionEvents[inactiveResult.result!.event.eventId].activeSubscriptionAtCompletion === false, "later subscription change does not rewrite event snapshot");

  for (const mode of ["general", "subscription", "either", "both"] as const) {
    const modeContext = await scenario((rules) => { rules.referral.payoutQualification.mode = mode; rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 1_200; rules.referral.payoutQualification.activeSubscriptionMember.cumulativeValidConsumptionThreshold = 1_000; });
    await setActiveSubscription(modeContext, "mode-member", true);
    const modeResult = await record(modeContext, { subtotal: 1_200, memberId: "mode-member" });
    check(modeResult.result?.qualificationRound?.qualificationMode === mode, `${mode} qualification mode is evaluated from Owner rules`);
  }

  const eventGate = await scenario((rules) => { rules.referral.payoutQualification.mode = "general"; });
  const huge = await record(eventGate, { subtotal: 5_000 });
  const hugeRoundId = huge.result?.qualificationRound?.roundId;
  check(Boolean(hugeRoundId) && Object.keys((await readMembershipCommerceState(eventGate.stateFilePath)).qualificationRounds).length === 1, "one huge event creates at most one round");
  await recordValidConsumptionFromCompletedOrder({ memberId: "member-1", orderId: huge.orderId, idempotencyKey: "huge-retry", now: new Date("2026-09-02T00:00:00.000Z"), stateFilePath: eventGate.stateFilePath, rulesFilePath: eventGate.rulesFilePath });
  check(Object.keys((await readMembershipCommerceState(eventGate.stateFilePath)).qualificationRounds).length === 1, "same event cannot create a second round and old spend alone does not requalify");

  const reset = await scenario((rules) => { rules.referral.payoutQualification.mode = "general"; rules.referral.payoutQualification.excessConsumptionMode = "reset"; });
  await record(reset, { subtotal: 1_000, at: "2026-08-20T00:00:00.000Z" });
  const resetRound = await record(reset, { subtotal: 1_000, at: "2026-08-21T00:00:00.000Z" });
  check(resetRound.result?.qualificationRound?.consumptionAccounting.consumedAmount === 2_000 && resetRound.result.qualificationRound.consumptionAccounting.remainingAmountAfter === 0, "reset consumes the qualifying batch including excess");
  check((await record(reset, { subtotal: 1_499, at: "2026-08-22T00:00:00.000Z" })).result?.qualificationRound === null, "reset excess cannot immediately qualify again");
  const rawBefore = JSON.stringify((await readMembershipCommerceState(reset.stateFilePath)).validConsumptionEvents);
  check((await record(reset, { subtotal: 1, at: "2026-08-23T00:00:00.000Z" })).result?.qualificationRound?.finalQualified === true, "a new event may requalify after fresh reset consumption reaches threshold");
  const resetState = await readMembershipCommerceState(reset.stateFilePath);
  check(Object.values(resetState.validConsumptionEvents).slice(0, 3).every((item) => rawBefore.includes(item.eventId)), "reset accounting leaves raw consumption events immutable");

  const carry = await scenario((rules) => { rules.referral.payoutQualification.mode = "general"; rules.referral.payoutQualification.excessConsumptionMode = "carry"; });
  await record(carry, { subtotal: 1_000, at: "2026-08-20T00:00:00.000Z" });
  const carryFirst = await record(carry, { subtotal: 1_000, at: "2026-08-21T00:00:00.000Z" });
  check(carryFirst.result?.qualificationRound?.consumptionAccounting.consumedAmount === 1_500 && carryFirst.result.qualificationRound.consumptionAccounting.remainingAmountAfter === 500, "carry consumes one threshold and preserves eligible excess");
  const carryNext = await record(carry, { subtotal: 1_000, at: "2026-08-22T00:00:00.000Z" });
  check(carryNext.result?.qualificationRound?.generalPath.cumulativeAmount === 1_500, "next new event may combine with carried excess");
  check(Object.keys((await readMembershipCommerceState(carry.stateFilePath)).qualificationRounds).length === 2, "carry still creates at most one round per new event");

  const snapshot = await scenario((rules) => { rules.referral.payoutQualification.mode = "general"; rules.referral.payoutQualification.excessConsumptionMode = "reset"; });
  const snapshotResult = await record(snapshot, { subtotal: 1_500 });
  const eventJson = JSON.stringify(snapshotResult.result?.event);
  const roundJson = JSON.stringify(snapshotResult.result?.qualificationRound);
  const rulesStore = await readMembershipRulesStore(snapshot.rulesFilePath);
  const changedRules = structuredClone(rulesStore.versions.at(-1)!.rules);
  changedRules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 9_000;
  changedRules.referral.payoutQualification.excessConsumptionMode = "carry";
  changedRules.referral.payoutQualification.validConsumption.includeCreditDiscount = false;
  changedRules.referral.payoutQualification.validConsumption.includeShipping = true;
  await saveMembershipBusinessRules({ expectedRevision: rulesStore.revision, rules: changedRules, now: new Date("2026-09-02T00:00:00.000Z") }, snapshot.rulesFilePath);
  const snapshotState = await readMembershipCommerceState(snapshot.stateFilePath);
  check(JSON.stringify(snapshotState.validConsumptionEvents[snapshotResult.result!.event.eventId]) === eventJson, "credit/shipping and threshold changes do not rewrite old event");
  check(JSON.stringify(snapshotState.qualificationRounds[snapshotResult.result!.qualificationRound!.roundId]) === roundJson, "threshold and reset/carry changes do not rewrite old round");

  const firewall = await scenario((rules) => { rules.referral.payoutQualification.mode = "general"; });
  const firewallState = await readMembershipCommerceState(firewall.stateFilePath);
  firewallState.referralRewards["protected-reward"] = { rewardId: "protected-reward", status: "scheduled", amount: 123 } as never;
  firewallState.creditEntries["protected-credit"] = { creditEntryId: "protected-credit", memberId: "member-1", amount: 100, remainingAmount: 100, status: "available", sourceReference: "protected", createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z" } as never;
  await fs.mkdir(path.dirname(firewall.stateFilePath), { recursive: true });
  await fs.writeFile(firewall.stateFilePath, `${JSON.stringify(firewallState, null, 2)}\n`, "utf8");
  const beforeRewards = JSON.stringify(firewallState.referralRewards);
  const beforeCredits = JSON.stringify(firewallState.creditEntries);
  const beforeNotifications = JSON.stringify(firewallState.notifications);
  await record(firewall, { subtotal: 1_500 });
  const afterFirewall = await readMembershipCommerceState(firewall.stateFilePath);
  check(JSON.stringify(afterFirewall.referralRewards) === beforeRewards, "qualification does not qualify, release, or reschedule a reward");
  check(JSON.stringify(afterFirewall.creditEntries) === beforeCredits, "qualification creates no payout credit");
  check(JSON.stringify(afterFirewall.notifications) === beforeNotifications, "qualification sends no payout notification");

  const persisted = await readMembershipCommerceState(carry.stateFilePath);
  check(Object.keys(persisted.validConsumptionEvents).length === 3 && Object.keys(persisted.qualificationRounds).length === 2, "restart/reload preserves events and rounds");
  const persistedJson = JSON.stringify({ events: persisted.validConsumptionEvents, rounds: persisted.qualificationRounds });
  const duplicateAfterReload = await recordValidConsumptionFromCompletedOrder({ memberId: "member-1", orderId: carryNext.orderId, idempotencyKey: "after-reload", now: new Date("2026-09-03T00:00:00.000Z"), stateFilePath: carry.stateFilePath, rulesFilePath: carry.rulesFilePath });
  const reloaded = await readMembershipCommerceState(carry.stateFilePath);
  check(duplicateAfterReload?.created === false && JSON.stringify({ events: reloaded.validConsumptionEvents, rounds: reloaded.qualificationRounds }) === persistedJson, "idempotency and append-only history survive reload");

  console.log(`Phase I.4B.3C qualification checks passed: ${checks}`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
