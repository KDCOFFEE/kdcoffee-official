import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  compactRewardDisplayStatus,
  sortRewardLedgerItems,
  summarizeRewardSourceItems,
} from "../lib/memberRewardPresentation";

let checks = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
}

const oneItem = [{ name: "拉斐爾之吻", optionLabel: "半磅豆", optionDetail: "227g", preparationLabel: "淺焙", quantity: 1 }];
const threeItems = [...oneItem, { name: "耶加雪菲", optionLabel: "耳掛", optionDetail: "12g", preparationLabel: "中焙", quantity: 2 }, { name: "濾掛組", optionLabel: "", optionDetail: "", preparationLabel: "", quantity: 1 }];
check(summarizeRewardSourceItems(oneItem) === "拉斐爾之吻・半磅豆・淺焙 × 1", "single product is a concise one-line summary");
check(summarizeRewardSourceItems(threeItems) === "拉斐爾之吻・半磅豆・淺焙 × 1 ＋ 2 項商品", "multi-product summary shows first item plus remaining count");
check(summarizeRewardSourceItems([]) === "歷史資料未記錄", "missing product history has a neutral fallback");
check(compactRewardDisplayStatus("資格已確認・安全等待中") === "安全等待中", "covered waiting status is concise");
check(compactRewardDisplayStatus("本人消費不需推薦資格・安全等待中") === "安全等待中", "self-purchase waiting status uses the same compact language");
check(compactRewardDisplayStatus("已入帳 ✓") === "已入帳", "released status is concise without losing meaning");
check(compactRewardDisplayStatus("尚待取得推薦回饋資格") === "尚待取得資格", "unqualified status remains explicit and compact");

const sortFixture = [
  { stableKey: "undated", releaseEligibleBusinessDate: null, releasedAt: null, sourceOrderCreatedAt: "2026-09-30T08:00:00Z" },
  { stableKey: "later", releaseEligibleBusinessDate: "2026-10-10", releasedAt: "2026-10-10T08:00:00Z", sourceOrderCreatedAt: "2026-09-30T09:00:00Z" },
  { stableKey: "near-new", releaseEligibleBusinessDate: "2026-10-05", releasedAt: "2026-10-11T08:00:00Z", sourceOrderCreatedAt: "2026-09-30T10:00:00Z" },
  { stableKey: "near-old", releaseEligibleBusinessDate: "2026-10-05", releasedAt: "2026-10-09T08:00:00Z", sourceOrderCreatedAt: "2026-09-29T10:00:00Z" },
];
const pending = sortRewardLedgerItems(sortFixture, "pending");
check(pending.map((item) => item.stableKey).join(",") === "near-new,near-old,later,undated", "pending sorts nearest release first, newest source on ties, and undated last");
const released = sortRewardLedgerItems(sortFixture, "released");
check(released[0]?.stableKey === "near-new" && released[1]?.stableKey === "later", "released sorts newest credited first");
const all = sortRewardLedgerItems(sortFixture, "all");
check(all[0]?.stableKey === "near-new", "all sorts by newest meaningful activity");
check(sortFixture[0]?.stableKey === "undated", "display sorting does not mutate persisted input order");

const root = process.cwd();
const read = (relative: string) => readFile(path.join(root, relative), "utf8");
const [center, compactCard, sourceCard, css, helper, page, org, nav, disclosure, cron, orderAccess] = await Promise.all([
  read("components/member/MemberReferralCenter.tsx"),
  read("components/member/RewardLedgerCompactCard.tsx"),
  read("components/member/RewardSourceOrderSummaryCard.tsx"),
  read("components/member/MemberReferralExperience.module.css"),
  read("lib/memberRewardPresentation.ts"),
  read("app/member/page.tsx"),
  read("components/member/MemberReferralOrgChart.tsx"),
  read("components/member/MemberSectionNav.tsx"),
  read("components/member/MemberMobileDisclosure.tsx"),
  read("scripts/run-reward-release-cron.mjs"),
  read("lib/customerOrderAccess.ts"),
]);

check(center.includes("pendingRetailLedgerRows") && center.includes("RewardLedgerCompactCard"), "pending Retail Promotion uses the compact reward card");
check(center.includes('rewardFilter === "released"') && center.includes("creditedLedgerRows"), "released rewards use the compact reward card collection");
check(center.includes("memberLedgerRows") && center.includes('kind: "member"'), "referral and self-purchase use the same compact card grammar");
check(center.includes('title: "推廣零售回饋"'), "Retail Promotion keeps its member-facing reward type");
check(center.includes('reward.rewardType === "self_purchase" ? "自己的消費"'), "self-purchase compact card uses the approved title");
check(center.includes("`第 ${reward.referralLevel} 代推薦回饋`"), "referral compact card includes its generation");
check(compactCard.includes("compactRewardDisplayStatus(displayStatus)"), "compact card consumes the shared effective status presentation");
check(compactCard.includes("sourceOrderNumber") && compactCard.includes("compactRewardSource"), "compact card shows source order number and date");
check(compactCard.includes("summarizeRewardSourceItems(sourceItems)"), "compact card uses the shared concise product summary");
check(compactCard.includes('`+ ${number(rewardPV)} ${pointDisplayName}`'), "compact card gives reward KD points primary emphasis");
check(compactCard.includes("money(creditAmount)"), "compact card shows monetary credit separately");
check(compactCard.includes('reversed ? "已沖回" : credited ? "已入帳" : "預計入帳"'), "compact card distinguishes projected, credited, and reversed dates");
check(compactCard.includes('reversed ? "已沖回折抵" : credited ? "實際入帳" : "預估折抵"'), "reversed rows do not mislabel reversed credit as deposited");
check(compactCard.includes('"待完成取貨後計算"'), "unknown release date uses the approved fallback");
check(compactCard.includes("hidden={!expanded}"), "calculation, qualification, lifecycle, and source detail are hidden by default");
check(compactCard.includes('aria-expanded={expanded}') && compactCard.includes('aria-controls={detailId}'), "detail trigger exposes accessible expansion state and target");
check(compactCard.includes('expanded ? "收合詳情" : "查看詳情"'), "one action expands and collapses the selected reward");
check(center.includes("expandedRewardKey === row.stableKey") && center.includes("current === row.stableKey ? null : row.stableKey"), "accordion state permits only one expanded reward key");
check(compactCard.includes("回饋怎麼算") && compactCard.includes("rewardCalculationGrid"), "expanded detail shows calculation section");
check(compactCard.includes("formatRewardRatePercent(rewardRate)"), "expanded detail formats canonical percentage points without multiplying");
check(compactCard.includes("RewardSourceOrderSummaryCard") && compactCard.includes('variant="source-only"'), "expanded detail reuses the privacy-safe source-order summary");
check(compactCard.includes("資格狀態") && compactCard.includes("qualificationSummary"), "expanded detail shows qualification status");
check(compactCard.includes("入帳進度") && compactCard.includes("lifecycleLabels.map"), "expanded detail contains the compact lifecycle");
check(compactCard.includes("查看資格規則") && compactCard.includes("rewardRuleDisclosure"), "full qualification rules remain a nested closed disclosure");
check(!compactCard.includes("<dialog") && !compactCard.includes("showModal"), "compact cards introduce no nested modal");
check(sourceCard.includes("summary.canViewFullOrder") && sourceCard.includes("查看完整訂單"), "own-order full link remains guarded by actual ownership");
check(!compactCard.includes("customerName") && !compactCard.includes("phone") && !compactCard.includes("email") && !compactCard.includes("address"), "compact presentation declares no customer PII fields");
check(!compactCard.includes("guestToken") && !compactCard.includes("accessToken") && !compactCard.includes("memberId"), "compact presentation declares no tokens or internal member ID");
check(compactCard.includes("formatRewardRatePercent") && helper.includes('return `${finiteNumber(value).toLocaleString'), "5 percent formatter remains the shared percentage-point formatter");
check(compactCard.includes("rewardPV") && compactCard.includes("creditAmount"), "KD points and NT$ credit remain independent fields");
check(center.includes("sortRewardLedgerItems(filteredLedgerRows, rewardFilter)"), "all card modes use deterministic presentation sorting");
check(helper.includes('mode === "pending"') && helper.includes("if (leftDate && !rightDate) return -1"), "pending sorting places undated records after dated rewards");
check(helper.includes('mode === "released"') && helper.includes("right.releasedAt"), "released sorting uses releasedAt descending");
check(center.includes('rewardView === "released"') && center.includes('rewardView === "pending"'), "released and pending deep-link intents remain supported");
check(center.includes('hash === "#credit"') && center.includes('? "released" as const'), "legacy #credit still selects released rewards");
check(center.includes('window.addEventListener("popstate"') && nav.includes('window.addEventListener("popstate"'), "browser Back and Forward synchronization remains intact");
check(center.includes("if (rewardsSection && !rewardsSection.hidden)") && center.includes("dialog.showModal()"), "outer reward modal still opens only after Rewards is visible");
check(center.includes("setExpandedRewardKey(null)") && center.includes("setRewardFilter(filter)"), "filter and deep-link changes reset inline expansion safely");
check(css.includes("min-height: 44px") && css.includes("compactRewardToggle"), "mobile detail action retains a reasonable touch target");
check(css.includes("white-space: nowrap") && css.includes("text-overflow: ellipsis"), "compact product and source lines cannot grow into text walls");
check(css.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"), "expanded calculation uses a readable two-column grid, not four tiny columns");
check(css.includes("@media (max-width: 700px)") && css.includes("compactRewardCard"), "mobile-specific compact spacing is present");
check(css.includes(':global(.member-org-order-card-source-only)') && sourceCard.includes('variant === "source-only"'), "expanded safe order detail removes nested card chrome");
check(page.includes("commerce.pendingRewardSummary") && page.includes("預估折抵"), "unified dashboard pending total remains unchanged");
check(org.includes("RewardSourceOrderSummaryCard") && org.includes("onPointerMove") && org.includes("pointers.current"), "Organization Chart viewer and interactions remain intact");
check(disclosure.includes("suppressHydrationWarning") && disclosure.includes("details.open = open"), "MemberMobileDisclosure hydration fix remains intact");
check(nav.includes("usePathname") && nav.includes("useSearchParams"), "Member route synchronization remains intact");
check(cron.includes("REWARD_RELEASE_CRON_SECRET") && cron.includes("/api/internal/reward-release"), "reward release cron remains intact");
check(orderAccess.includes("getCurrentMember") && orderAccess.includes("authorizeOrderConversationAccess"), "canonical customer order authorization remains intact");
check(!compactCard.includes("membershipCommerce") && !center.includes("createReferralRewardsFromFulfillment"), "compact UX adds no Reward Engine mutation call");
check(!compactCard.includes("/api/") && !compactCard.includes("fetch("), "compact card adds no order or reward lookup endpoint");
check(!compactCard.includes("data/membership-commerce") && !compactCard.includes("public/data") && !compactCard.includes("public/uploads"), "compact UI has no protected-data write path");
check(!center.includes("這筆 ${pointValue") && !center.includes("member-reward-transparency"), "overlapping per-reward calculation disclosure was removed");
check(!center.includes("member-reward-transparency-grid") && !center.includes("member-reward-lifecycle"), "old always-tall nested reward layout was removed from the ledger");
check(center.includes("累計回饋") && center.includes("本月已入帳"), "top summary preserves the four prioritized totals");
check(center.includes("預估折抵 NT$") && center.includes("pendingRewardSourceCount"), "top summary retains the concise pending count and credit line");
check(center.includes("推薦回饋如何計算？") && center.includes("<details"), "global reward explanation remains collapsed by default");

const changedFiles = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" }).split(/\r?\n/u).filter(Boolean);
check(!changedFiles.some((file) => file.includes("reward-release-cron") || file.includes("api/internal/reward-release")), "this working diff does not change cron behavior");
check(!changedFiles.some((file) => file.startsWith("app/api/orders/") || file === "lib/customerOrderAccess.ts"), "this working diff does not change order authorization");

console.log(`Reward ledger compact UX checks passed: ${checks}`);
