import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { CreditEntry, MembershipCommerceState, RetailPromotionReward } from "../lib/membershipCommerce";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-reward-deep-link-"));
process.env.KD_DATA_DIR = root;

const commerceModulePath = "../lib/membershipCommerce.ts";
const commerce = await import(commerceModulePath) as typeof import("../lib/membershipCommerce");
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

function credit(input: Partial<CreditEntry> & Pick<CreditEntry, "creditEntryId" | "sourceType" | "sourceReference" | "amount" | "remainingAmount">): CreditEntry {
  return {
    memberId: "member-deep-link",
    issuedAt: "2026-09-20T00:00:00.000Z",
    expiresAt: "2027-09-20T00:00:00.000Z",
    status: "available",
    createdAt: "2026-09-20T00:00:00.000Z",
    metadata: {},
    ...input,
  };
}

const pendingRetailReward: RetailPromotionReward = {
  rewardId: "retail-pending-internal-id",
  sourceOrderNumber: "KD20260925-000004",
  beneficiaryMemberId: "member-deep-link",
  referralCode: "SAFE-CODE",
  attributedAt: "2026-09-20T00:00:00.000Z",
  attributionExpiresAt: "2026-10-20T00:00:00.000Z",
  attributionSource: "member-share-link",
  eligibleMerchandiseAmount: 800,
  calculationBasis: "paid_amount",
  calculationBaseValue: 800,
  rewardRate: 5,
  rewardPV: 0,
  pvRewardMoneyValue: 1,
  calculatedCreditAmount: 40,
  ruleVersion: 2,
  roundingModeSnapshot: "round-half-up",
  baseWaitingDaysSnapshot: 3,
  returnProtectionDaysSnapshot: 7,
  totalWaitingDaysSnapshot: 10,
  reversalPolicySnapshot: "cancel-pending-and-reverse-released",
  successfulCompletionAt: "2026-09-25T00:00:00.000Z",
  successfulPickupBusinessDate: "2026-09-25",
  releaseEligibleBusinessDate: "2026-10-05",
  createdAt: "2026-09-25T00:00:00.000Z",
  releasedAt: null,
  sourceOrderFinalState: "completed",
  status: "scheduled",
  rewardCreditEntryId: null,
  reversalCreditEntryId: null,
  idempotencyKey: "retail-pending",
};

try {
  const stateFilePath = path.join(root, "membership-commerce", "commerce-state.json");
  const state = await commerce.readMembershipCommerceState(stateFilePath);
  state.creditEntries["credit-referral-internal-id"] = credit({
    creditEntryId: "credit-referral-internal-id",
    sourceType: "referral",
    sourceReference: "referral_reward:reward-referral-internal-id",
    amount: 100,
    remainingAmount: 40,
    metadata: { orderId: "KD20260920-000001" },
  });
  state.creditEntries["credit-member-internal-id"] = credit({
    creditEntryId: "credit-member-internal-id",
    sourceType: "member_reward",
    sourceReference: "referral_reward:reward-member-internal-id",
    amount: 50,
    remainingAmount: 50,
    metadata: { orderId: "KD20260921-000002" },
  });
  state.creditEntries["credit-retail-internal-id"] = credit({
    creditEntryId: "credit-retail-internal-id",
    sourceType: "promotion",
    sourceReference: "retail_promotion_reward:reward-retail-internal-id",
    amount: 30,
    remainingAmount: 30,
    metadata: { orderId: "KD20260922-000003" },
  });
  state.retailPromotionRewards[pendingRetailReward.rewardId] = pendingRetailReward;
  await writeState(stateFilePath, state);

  const dashboard = await commerce.getMemberCommerceDashboard(
    "member-deep-link",
    new Date("2026-09-29T00:00:00.000Z"),
    stateFilePath,
  );
  const referral = dashboard.rewardCreditSources.find((item) => item.sourceCategory === "referral");
  const member = dashboard.rewardCreditSources.find((item) => item.sourceCategory === "self_purchase");
  const retail = dashboard.rewardCreditSources.find((item) => item.sourceCategory === "retail_promotion");
  check(dashboard.rewardCreditSources.length === 3, "released detail projects all reward-derived credit categories");
  check(retail?.sourceLabel === "推廣零售" && retail.sourceOrderNumber === "KD20260922-000003", "released detail includes canonical Retail Promotion source");
  check(referral?.sourceLabel === "推薦回饋" && member?.sourceLabel === "自己的消費", "released detail includes referral and member reward sources");
  check(referral?.creditedAmount === 100 && referral.availableAmount === 40, "partially consumed credit distinguishes credited and currently available amounts");
  check(dashboard.pendingRetailPromotionRewards.length === 1 && dashboard.pendingRetailPromotionRewards[0]?.projectedCreditAmount === 40, "pending detail includes scheduled Retail Promotion reward");
  check(!JSON.stringify(dashboard.rewardCreditSources).includes("internal-id"), "member-facing reward source projection exposes no internal IDs");

  const page = await fs.readFile(path.join(process.cwd(), "app/member/page.tsx"), "utf8");
  const center = await fs.readFile(path.join(process.cwd(), "components/member/MemberReferralCenter.tsx"), "utf8");
  const nav = await fs.readFile(path.join(process.cwd(), "components/member/MemberSectionNav.tsx"), "utf8");
  const retailCenter = await fs.readFile(path.join(process.cwd(), "components/member/RetailPromotionCenter.tsx"), "utf8");
  const order = await fs.readFile(path.join(process.cwd(), "components/orders/OrderConversation.tsx"), "utf8");
  const disclosure = await fs.readFile(path.join(process.cwd(), "components/member/MemberMobileDisclosure.tsx"), "utf8");

  check(page.includes('href="/member?rewardView=released#rewards"') && page.includes('data-reward-shortcut="released"'), "available-credit overview card is actionable");
  check(page.includes('href="/member?rewardView=pending#rewards"') && page.includes('data-reward-shortcut="pending"'), "pending-reward overview card is actionable");
  check(center.includes('hash === "#rewards"') && center.includes("if (rewardsSection && !rewardsSection.hidden)"), "shortcut requires visible Rewards before opening the dialog");
  check(center.includes('hash === "#credit"') && center.includes('? "released" as const'), "legacy #credit aliases to released reward detail");
  check(center.includes("setRewardFilter(intent)") && center.includes("setRewardLevel(0)"), "deep-link intent applies its filter and resets the level");
  check(center.includes("setRewardPage(1)"), "explicit shortcut resets reward pagination to page one");
  check(nav.includes('href={`/member#${item.id}`}') && !nav.includes("rewardView="), "normal top navigation remains a plain Rewards overview navigation");
  check(nav.includes('requestedId === "credit" ? "rewards"'), "Member navigation treats legacy #credit as Rewards");
  check(nav.includes("usePathname") && nav.includes("useSearchParams") && nav.includes("[activate, pathname, searchParams]"), "Member navigation resynchronizes sections after App Router path or query changes");
  check(nav.includes('window.addEventListener("hashchange", syncRoute)') && nav.includes('window.addEventListener("popstate", syncRoute)'), "Member navigation also follows native hash and browser history changes");
  check(nav.indexOf("section.hidden = section.id !== item.id") < nav.indexOf('new CustomEvent("kd-member-section-activated"'), "section visibility updates before the activation signal is emitted");
  check(nav.includes('detail: { id: item.id }'), "section activation signal identifies the canonical active section");
  check(center.includes('window.addEventListener("popstate"') && center.includes("useSearchParams"), "URL intent responds to browser Back and Forward");
  check(center.includes("new URLSearchParams(window.location.search)") && center.includes("syncRewardIntent();"), "refresh restores reward deep-link intent");
  check(center.includes('window.addEventListener("kd-member-section-activated", syncRewardSection)'), "reward dialog follows the canonical section activation signal");
  check(center.includes("if (!isActive)") && center.includes("setRewardDetailsOpen(false)"), "hidden Rewards always clears dialog-open state");
  check(center.indexOf("setRewardFilter(intent)") < center.indexOf("setRewardDetailsOpen(true)", center.indexOf("setRewardFilter(intent)")), "deep-link filter is applied before dialog-open state");
  check(center.includes("rewardSectionActive") && center.includes("!rewardsSection.hidden") && center.includes("if (canOpen && !dialog.open) dialog.showModal()"), "native showModal has an explicit visible-Rewards guard");
  check(center.includes("if (!isActive && dialog?.open)") && center.includes("closingFromRouteSyncRef.current = true"), "an open reward dialog closes synchronously when Rewards becomes hidden");
  check(center.includes("if (closedForRouteSync) return"), "route-driven modal close cannot race a second navigation or focus restoration");
  check(!center.includes("openRewardDetails(\n          intent"), "URL intent never bypasses section activation by opening the dialog directly");
  check(center.includes("data.rewardCreditSources.map") && center.includes("推廣零售、推薦回饋與自己的消費"), "released dialog unifies Retail Promotion and member/referral credits");
  check(center.includes("data.pendingRetailPromotionRewards.map"), "pending dialog renders scheduled Retail Promotion entries");
  check(center.includes("入帳金額") && center.includes("目前可用"), "released cards distinguish original credit from current availability");
  check(center.includes("直接取自正式抵用金帳本，不由回饋紀錄重算"), "available-credit total remains canonical and is not reconstructed from reward records");
  check(center.includes("查看訂單 →") && center.includes("encodeURIComponent(entry.sourceOrderNumber"), "unified detail keeps source orders visible and clickable");
  check(retailCenter.includes("查看詳情") && retailCenter.includes("retail-promotion-dialog"), "existing specialized Retail Promotion detail remains available");
  check(center.includes('openRewardDetails("all", rewardTriggerRef.current)'), "existing reward-detail button still opens the all view");
  check(center.includes("rewardFocusReturnRef") && center.includes("focusTarget.focus()"), "dialog preserves accessible focus return");
  check(order.includes('router.replace("/member#orders")') && order.includes('window.addEventListener("popstate"'), "approved order back-navigation fix remains intact");
  check(disclosure.includes("suppressHydrationWarning") && disclosure.includes("details.open = open"), "MemberMobileDisclosure hydration fix remains intact");
  check(center.includes('router.replace(') && !center.includes("window.location.reload"), "deep-link close/navigation uses App Router without reload");
  check(page.includes("commerce.credits") && !page.includes("referralCenter.rewards.reduce((sum, reward) => sum + reward.creditAmount"), "overview available balance is sourced from the credit ledger projection");

  console.log(`Member dashboard reward deep-link checks passed: ${checks}`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
