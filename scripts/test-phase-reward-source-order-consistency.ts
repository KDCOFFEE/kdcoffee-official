import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildSafeRewardSourceOrderSummary,
  formatRewardRatePercent,
  resolveEffectiveRewardDisplayStatus,
  summarizePendingRewards,
} from "../lib/memberRewardPresentation";

let checks = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
}

const pending = summarizePendingRewards([
  { rewardPV: 17.5, projectedCreditAmount: 18 },
  { rewardPV: 17.5, projectedCreditAmount: 18 },
  { rewardPV: 17.5, projectedCreditAmount: 18 },
]);
check(pending.rewardPoints === 52.5, "pending Retail, referral, and self-purchase points sum to 52.5");
check(pending.rewardCount === 3, "pending source count includes all three sources");
check(pending.projectedCreditAmount === 54, "projected credit sums the three persisted NT$18 values");
check(pending.projectedCreditAmount !== Math.round(pending.rewardPoints), "projected credit is not recomputed from aggregate points");
check(summarizePendingRewards([{ rewardPV: null, projectedCreditAmount: 18 }]).hasIncompletePointHistory, "historical missing point values remain explicitly incomplete");

const sourceOrder = {
  orderNumber: "KD20260929-1705",
  createdAt: "2026-09-29T09:05:00.000Z",
  status: "completed",
  member: null,
  customerName: "SECRET REAL NAME",
  pickupName: "SECRET PICKUP NAME",
  phone: "SECRET PHONE",
  email: "secret@example.test",
  address: "SECRET ADDRESS",
  postalCode: "SECRET POSTAL",
  pickupStore: { name: "SECRET STORE" },
  paymentMethod: "SECRET PAYMENT",
  bankDetails: "SECRET BANK",
  lineId: "SECRET LINE",
  sessionId: "SECRET SESSION",
  accessToken: "SECRET ACCESS TOKEN",
  guestToken: "SECRET GUEST TOKEN",
  notes: "SECRET NOTES",
  metadata: { ip: "SECRET IP", device: "SECRET DEVICE" },
  fulfillmentSummary: { state: "completed", internalFulfillmentId: "SECRET FULFILLMENT" },
  fulfillmentEvents: [{ state: "completed", occurredAt: "2026-09-30T06:32:00.000Z", eventId: "SECRET EVENT" }],
  items: [{
    name: "莫內・花語",
    optionLabel: "半磅豆",
    optionDetail: "227g",
    preparationLabel: "淺焙",
    quantity: 1,
    unitPrice: 700,
    internalSku: "SECRET SKU",
  }],
};

const common = {
  currentMemberId: "reward-owner",
  rewardBeneficiaryMemberId: "reward-owner",
  sourceOrderNumber: sourceOrder.orderNumber,
  order: sourceOrder,
  referralLevel: null,
  calculationBasis: "pv" as const,
  effectivePV: 350,
  rewardRate: 5,
  rewardPV: 17.5,
  projectedCreditAmount: 18,
  releaseEligibleBusinessDate: "2026-10-10",
  releasedAt: null,
  rewardStatus: "scheduled",
  qualificationStatus: "qualified",
  qualificationAuthority: "legacy_order" as const,
  successfulCompletionAt: "2026-09-30T06:32:00.000Z",
  todayDate: "2026-10-01",
};

const guest = buildSafeRewardSourceOrderSummary(common);
check(guest?.sourceCategoryLabel === "訪客訂單" && guest.canViewFullOrder === false, "guest source is classified safely and cannot open the full order");
check(guest?.createdAt === sourceOrder.createdAt && guest.completedAt === "2026-09-30T06:32:00.000Z", "canonical order and completion timestamps are projected");
check(guest?.fulfillmentStatus === "已完成取貨", "fulfillment state is mapped to a safe member label");
check(guest?.sourceItems[0]?.name === "莫內・花語" && guest.sourceItems[0]?.optionLabel === "半磅豆", "safe product name and option are projected");
check(guest?.sourceItems[0]?.optionDetail === "227g" && guest.sourceItems[0]?.preparationLabel === "淺焙" && guest.sourceItems[0]?.quantity === 1, "safe package, roast, and quantity are projected");
check(guest?.effectivePV === 350 && guest.rewardRate === 5 && guest.rewardPV === 17.5, "effective points, percentage points, and reward points remain separate");
check(guest?.projectedCreditAmount === 18 && guest.releaseEligibleBusinessDate === "2026-10-10", "persisted credit and release date are projected without recomputation");

const serializedGuest = JSON.stringify(guest);
for (const secret of [
  "SECRET REAL NAME", "SECRET PICKUP NAME", "SECRET PHONE", "secret@example.test",
  "SECRET ADDRESS", "SECRET POSTAL", "SECRET STORE", "SECRET PAYMENT", "SECRET BANK",
  "SECRET LINE", "SECRET SESSION", "SECRET ACCESS TOKEN", "SECRET GUEST TOKEN",
  "SECRET NOTES", "SECRET IP", "SECRET DEVICE", "SECRET FULFILLMENT", "SECRET EVENT", "SECRET SKU",
]) {
  check(!serializedGuest.includes(secret), `safe DTO omits sensitive value: ${secret}`);
}
check(!/memberId|rewardId|guestToken|accessToken|metadata|eventId|idempotencyKey/u.test(serializedGuest), "safe DTO contains no internal identity, token, audit, or metadata keys");

const downline = buildSafeRewardSourceOrderSummary({
  ...common,
  referralLevel: 2,
  order: { ...sourceOrder, member: { memberId: "another-member", name: "SECRET MEMBER NAME" } },
});
check(downline?.sourceCategoryLabel === "第 2 代會員訂單" && downline.canViewFullOrder === false, "downline generation is shown without full-order access");
check(!JSON.stringify(downline).includes("another-member") && !JSON.stringify(downline).includes("SECRET MEMBER NAME"), "downline identity is never sent to the client");

const own = buildSafeRewardSourceOrderSummary({
  ...common,
  order: { ...sourceOrder, member: { memberId: "reward-owner", name: "SECRET OWNER NAME" } },
});
check(own?.sourceCategoryLabel === "自己的訂單" && own.canViewFullOrder === true, "actual order ownership alone enables the canonical full-order link");
check(!JSON.stringify(own).includes("reward-owner") && !JSON.stringify(own).includes("SECRET OWNER NAME"), "even own safe summary omits member identity fields");
check(buildSafeRewardSourceOrderSummary({ ...common, currentMemberId: "unrelated-member" }) === null, "unrelated member cannot obtain a reward-owned source summary");
check(buildSafeRewardSourceOrderSummary({ ...common, sourceOrderNumber: "KD20260929-9999" }) === null, "knowing a different order number cannot produce a summary");

check(formatRewardRatePercent(5) === "5%", "canonical rewardRate 5 displays as 5 percent");
check(formatRewardRatePercent(5) !== "500%", "percentage formatter never multiplies percentage points by 100");
const coveredStatus = resolveEffectiveRewardDisplayStatus({
  status: "scheduled",
  qualificationStatus: "awaiting_order",
  qualificationAuthority: "qualification_coverage",
  qualificationCoverage: { coverageEndsAt: "2026-10-17" },
  releaseEligibleBusinessDate: "2026-10-10",
  sourceCompleted: true,
}, "2026-10-01");
check(coveredStatus === "資格已確認・安全等待中", "raw awaiting_order plus valid coverage resolves as qualified");
check(!coveredStatus.includes("待完成資格消費") && !coveredStatus.includes("尚待取得推薦回饋資格"), "covered reward never shows an unqualified label");
check(resolveEffectiveRewardDisplayStatus({ status: "scheduled", qualificationStatus: "qualified", releaseEligibleBusinessDate: "2026-10-01", sourceCompleted: true }, "2026-10-01") === "待系統入帳", "due scheduled reward is waiting for system posting");
check(resolveEffectiveRewardDisplayStatus({ status: "released", sourceCompleted: true }, "2026-10-01") === "已入帳 ✓", "released status is final and consistent");
check(resolveEffectiveRewardDisplayStatus({ status: "reversed", sourceCompleted: true }, "2026-10-01") === "已沖回", "reversed status is final and consistent");
check(resolveEffectiveRewardDisplayStatus({ status: "cancelled", sourceCompleted: true }, "2026-10-01") === "已取消", "cancelled status is final and consistent");
check(resolveEffectiveRewardDisplayStatus({ status: "scheduled", qualificationStatus: "expired", sourceCompleted: true }, "2026-10-01") === "資格已逾期", "expired qualification remains explicit");
check(resolveEffectiveRewardDisplayStatus({ status: "scheduled", qualificationStatus: "qualified", sourceCompleted: false }, "2026-10-01") === "等待來源訂單完成", "incomplete source has a truthful status and no fabricated release state");

const root = process.cwd();
const read = (relative: string) => readFile(path.join(root, relative), "utf8");
const [page, center, org, retail, card, compactCard, commerce, nav, disclosure, messagesRoute] = await Promise.all([
  read("app/member/page.tsx"),
  read("components/member/MemberReferralCenter.tsx"),
  read("components/member/MemberReferralOrgChart.tsx"),
  read("components/member/RetailPromotionCenter.tsx"),
  read("components/member/RewardSourceOrderSummaryCard.tsx"),
  read("components/member/RewardLedgerCompactCard.tsx"),
  read("lib/membershipCommerce.ts"),
  read("components/member/MemberSectionNav.tsx"),
  read("components/member/MemberMobileDisclosure.tsx"),
  read("app/api/orders/[orderNumber]/messages/route.ts"),
]);

check(page.includes("commerce.pendingRewardSummary") && page.includes("預估折抵"), "dashboard consumes the unified persisted pending summary");
check(compactCard.includes("<RewardSourceOrderSummaryCard") && org.includes("<RewardSourceOrderSummaryCard") && retail.includes("<RewardSourceOrderSummaryCard"), "all three reward surfaces share one safe order summary component");
check(center.includes("displayStatus: reward.displayStatus") && !center.includes("待完成資格消費"), "Reward Detail consumes the canonical display status");
check(!org.includes("rewardRate * 100") && !org.includes("待完成資格消費"), "Organization Chart no longer reinterprets rate or raw qualification status");
check(card.includes("formatRewardRatePercent(summary.rewardRate)") && card.includes("summary.rewardPV") && card.includes("summary.projectedCreditAmount"), "shared card keeps rate, reward points, and credit value separate");
check(card.includes("summary.canViewFullOrder") && card.includes("查看完整訂單"), "full-order link is rendered only for verified order ownership");
check(compactCard.includes("rewardTimingText(explanation)") && compactCard.includes("releaseEligibleBusinessDate") && compactCard.includes("入帳日期確認中") && compactCard.includes("待完成取貨後計算"), "transaction timing uses the shared persisted projection and distinguishes completed pickup from unfinished fulfillment");
check(compactCard.includes("推薦資格有效至") && center.includes("qualificationCoverage"), "qualification validity remains in the qualification explanation area");
check(retail.includes("retail-promotion-dialog") && retail.includes("查看詳情"), "specialized Retail Promotion detail remains available");
check(page.includes('/member?rewardView=released#rewards') && page.includes('/member?rewardView=pending#rewards'), "released and pending dashboard deep links remain intact");
check(nav.includes("usePathname") && nav.includes("useSearchParams") && nav.includes("popstate"), "Member section route synchronization and Back/Forward support remain intact");
check(disclosure.includes("suppressHydrationWarning") && disclosure.includes("details.open = open"), "MemberMobileDisclosure hydration fix remains intact");
check(messagesRoute.includes("resolveCustomerOrderAccess") && messagesRoute.includes("authorizedOrder"), "canonical full-order authorization remains in force");
check(!commerce.includes("app/api/member/reward-source-order"), "projection introduces no arbitrary order-number lookup endpoint");

const changedFiles = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" }).split(/\r?\n/u).filter(Boolean);
check(!changedFiles.some((file) => file.includes("reward-release-cron") || file.includes("cron/reward")), "reward release cron code is unchanged");
check(!changedFiles.some((file) => file.startsWith("app/api/orders/") || file === "lib/customerOrderAccess.ts"), "canonical order access implementation is unchanged");

console.log(`Reward source order / organization consistency checks passed: ${checks}`);
