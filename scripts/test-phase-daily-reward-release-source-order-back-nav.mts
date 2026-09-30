import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { MembershipCommerceState, ReferralReward } from "../lib/membershipCommerce";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-daily-reward-release-"));
process.env.KD_DATA_DIR = root;
process.env.LINE_CHANNEL_ACCESS_TOKEN = "focused-test-line-token";
process.env.RESEND_API_KEY = "focused-test-email-key";
process.env.MEMBER_EMAIL_FROM = "noreply@example.test";

const rulesApi = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const policies = await import("../lib/membershipPolicies");
const automation = await import("../lib/memberNotificationAutomation");

let checks = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
}

async function writeState(filePath: string, state: MembershipCommerceState) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

const sourceOrderNumber = "KD20260917-000001";
const reward: ReferralReward = {
  rewardId: "reward-focused-daily-release",
  sourceOrderNumber,
  sourceMemberId: "member-beneficiary",
  beneficiaryMemberId: "member-beneficiary",
  referralLevel: 0,
  rewardType: "self_purchase",
  calculationMode: "pv",
  paidAmountBasis: 700,
  basePV: 35,
  discountRatio: 1,
  effectivePV: 35,
  rewardRate: 50,
  rewardPV: 17.5,
  pvRewardMoneyValue: 1,
  calculatedCreditAmount: 18,
  projectedCreditAmount: 18,
  ruleVersion: 2,
  ancestrySnapshot: ["member-beneficiary"],
  monthlyCapAmountSnapshot: 0,
  monthlyCapPeriodSnapshot: "2026-09",
  monthlyCapUsageAtRelease: null,
  monthlyCapLimitedAmount: null,
  baseWaitingDaysSnapshot: 3,
  returnProtectionDaysSnapshot: 7,
  totalWaitingDaysSnapshot: 10,
  releasePolicyVersion: "taipei-business-date-v1",
  successfulPickupBusinessDate: "2026-09-17",
  releaseEligibleBusinessDate: "2026-09-27",
  sourceOrderFinalState: "completed",
  qualificationStatus: "qualified",
  qualificationAuthority: "self_purchase_direct",
  createdAt: "2026-09-17T02:00:00.000Z",
  eligibleAt: "2026-09-27T00:00:00+08:00",
  scheduledReleaseAt: "2026-09-27T00:00:00+08:00",
  releasedAt: null,
  status: "scheduled",
  reversalCreditEntryId: null,
  rewardCreditEntryId: null,
  idempotencyKey: "reward:focused-daily-release",
};

try {
  check(!policies.isReferralReleaseBusinessDateDue("2026-09-26", "2026-09-27"), "reward is not due before its Taipei business date");
  check(policies.isReferralReleaseBusinessDateDue("2026-09-27", "2026-09-27"), "reward is due on its Taipei business date");
  check(policies.isReferralReleaseBusinessDateDue("2026-09-29", "2026-09-27"), "overdue reward remains eligible for catch-up");

  const stateFilePath = path.join(root, "membership-commerce", "commerce-state.json");
  const rulesFilePath = path.join(root, "membership-commerce", "business-rules.json");
  const rules = structuredClone(rulesApi.DEFAULT_MEMBERSHIP_RULES);
  rules.notification.events.credit_reward = { enabled: true, channels: ["member_center", "line"] };
  await rulesApi.saveMembershipBusinessRules(
    { expectedRevision: 0, rules, now: new Date("2026-09-01T00:00:00.000Z") },
    rulesFilePath,
  );
  const initial = await commerce.readMembershipCommerceState(stateFilePath);
  initial.referralRewards[reward.rewardId] = reward;
  await writeState(stateFilePath, initial);
  await fs.mkdir(path.join(root, "members"), { recursive: true });
  await fs.writeFile(
    path.join(root, "members", "member-beneficiary.json"),
    JSON.stringify({ id: "member-beneficiary", lineUserId: "line-focused-member", createdAt: "2026-01-01T00:00:00.000Z" }),
    "utf8",
  );

  const released = await commerce.runReferralRewardReleaseScheduler({
    now: new Date("2026-09-29T00:00:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
  let state = await commerce.readMembershipCommerceState(stateFilePath);
  const credits = Object.values(state.creditEntries);
  check(released.length === 1 && released[0]?.status === "released", "daily canonical scheduler releases the overdue reward");
  check(state.referralRewards[reward.rewardId]?.status === "released", "existing reward transitions from scheduled to released");
  check(credits.length === 1 && credits[0]?.amount === 18, "release creates exactly one canonical credit entry");
  check(credits[0]?.sourceReference === `referral_reward:${reward.rewardId}`, "credit keeps canonical reward linkage");
  check(credits[0]?.metadata.orderId === sourceOrderNumber, "credit preserves the canonical source order number");
  check(state.notifications.length === 1 && state.notifications[0]?.eventType === "credit_issued", "release queues one canonical credit notification");
  check(state.notifications[0]?.channels.includes("line"), "configured LINE channel is present in the durable notification");

  const repeat = await commerce.runReferralRewardReleaseScheduler({
    now: new Date("2026-09-29T00:05:00.000Z"),
    stateFilePath,
    rulesFilePath,
  });
  state = await commerce.readMembershipCommerceState(stateFilePath);
  check(repeat.length === 0, "same-day retry does not release an already released reward");
  check(Object.values(state.creditEntries).length === 1, "same-day retry creates no duplicate credit");
  check(state.notifications.length === 1, "same-day retry creates no duplicate notification");

  const lineBodies: string[] = [];
  const delivered = await automation.deliverNextMembershipNotification({
    stateFilePath,
    lineFetcher: (async (...args: Parameters<typeof fetch>) => {
      lineBodies.push(String(args[1]?.body ?? ""));
      return new Response("", { status: 200 });
    }) as typeof fetch,
    now: new Date("2026-09-29T00:10:00.000Z"),
  });
  check(delivered?.status === "delivered" && lineBodies.length === 1, "existing dispatcher sends the queued LINE notification");
  check(lineBodies[0]?.includes("會員抵用金") && lineBodies[0]?.includes("NT$18"), "LINE message reports the actual credited reward amount");

  let dashboard = await commerce.getMemberCommerceDashboard(
    "member-beneficiary",
    new Date("2026-09-29T00:15:00.000Z"),
    stateFilePath,
  );
  check(dashboard.credits[0]?.sourceOrderNumber === sourceOrderNumber, "released credit history projects its source order read-only");
  state = await commerce.readMembershipCommerceState(stateFilePath);
  delete state.creditEntries[credits[0]!.creditEntryId]!.metadata.orderId;
  await writeState(stateFilePath, state);
  dashboard = await commerce.getMemberCommerceDashboard(
    "member-beneficiary",
    new Date("2026-09-29T00:20:00.000Z"),
    stateFilePath,
  );
  check(dashboard.credits[0]?.sourceOrderNumber === sourceOrderNumber, "legacy credit can resolve source order through existing reward linkage");

  const rewardCardUi = await fs.readFile(path.join(process.cwd(), "components/member/RewardLedgerCompactCard.tsx"), "utf8");
  const sourceOrderUi = await fs.readFile(path.join(process.cwd(), "components/member/RewardSourceOrderSummaryCard.tsx"), "utf8");
  const creditUi = await fs.readFile(path.join(process.cwd(), "components/member/MemberSubscriptionExperience.tsx"), "utf8");
  const orderUi = await fs.readFile(path.join(process.cwd(), "components/orders/OrderConversation.tsx"), "utf8");
  const memberNav = await fs.readFile(path.join(process.cwd(), "components/member/MemberSectionNav.tsx"), "utf8");
  const cronScript = await fs.readFile(path.join(process.cwd(), "scripts/run-reward-release-cron.mjs"), "utf8");
  const routeSource = await fs.readFile(path.join(process.cwd(), "app/api/internal/reward-release/route.ts"), "utf8");
  check(rewardCardUi.includes("來源訂單") && rewardCardUi.includes("歷史資料未記錄"), "expanded reward detail shows source order with a neutral legacy fallback");
  check(sourceOrderUi.includes("summary.canViewFullOrder") && sourceOrderUi.includes("查看完整訂單 →"), "reward detail links the canonical order only after actual ownership is verified");
  check(creditUi.includes("回饋來源訂單") && creditUi.includes("entry.sourceOrderNumber"), "released credit history retains member-visible order traceability");
  check(orderUi.includes('access === "member" ? "/member#orders" : "/member"'), "authenticated order return action targets Member Center Orders");
  check(orderUi.includes('window.addEventListener("popstate"') && orderUi.includes('router.replace("/member#orders")'), "stale browser-history UI is reconciled through App Router navigation");
  check(memberNav.includes('href={`/member#${item.id}`}'), "member hash tabs use router-aware links while retaining hash activation");
  check(cronScript.includes("REWARD_RELEASE_CRON_SECRET") && cronScript.includes("/api/internal/reward-release"), "Railway runner requires the dedicated secret and endpoint");
  check(!cronScript.includes("console.log(secret)"), "Railway runner never logs the cron secret");

  check(routeSource.includes("REWARD_RELEASE_CRON_SECRET") && routeSource.includes("timingSafeEqual"), "daily release endpoint uses its dedicated constant-time secret check");
  check(routeSource.includes('{ error: "未授權" }, { status: 401 }') && !routeSource.includes("isAdminAuthenticated"), "daily release endpoint rejects missing or incorrect secrets without an admin bypass");

  console.log(`Daily reward release/source-order/back-nav checks passed: ${checks}`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
