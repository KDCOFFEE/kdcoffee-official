import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MEMBER_CENTER_COPY_CATALOG, resolveMemberCopy } from "../lib/memberCenterCopy";

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
  const passbook = await fs.readFile(path.join(process.cwd(), "components/member/MemberCreditPassbook.tsx"), "utf8");
  const center = await fs.readFile(path.join(process.cwd(), "components/member/MemberReferralCenter.tsx"), "utf8");
  const nav = await fs.readFile(path.join(process.cwd(), "components/member/MemberSectionNav.tsx"), "utf8");
  const retailCenter = await fs.readFile(path.join(process.cwd(), "components/member/RetailPromotionCenter.tsx"), "utf8");
  const order = await fs.readFile(path.join(process.cwd(), "components/orders/OrderConversation.tsx"), "utf8");
  const disclosure = await fs.readFile(path.join(process.cwd(), "components/member/MemberMobileDisclosure.tsx"), "utf8");
  const compactCard = await fs.readFile(path.join(process.cwd(), "components/member/RewardLedgerCompactCard.tsx"), "utf8");
  const sourceCard = await fs.readFile(path.join(process.cwd(), "components/member/RewardSourceOrderSummaryCard.tsx"), "utf8");

  check(page.includes('<MemberCreditPassbook availableCredit={availableCredit} initialPage={creditPassbook}')
    && !page.includes('href="/member?rewardView=released#rewards"') && !page.includes('data-reward-shortcut="released"')
    && passbook.includes('<button ref={trigger}') && passbook.includes('aria-haspopup="dialog"')
    && passbook.includes('onClick={() => dialog.current?.showModal()}')
    && passbook.includes('<MemberCreditLedger initialPage={initialPage}')
    && passbook.includes('<Link href="/member?rewardView=released#rewards" onClick={() => dialog.current?.close()}>'),
  "available-credit overview opens canonical Passbook with ledger and released-details link, without duplicate legacy shortcut");
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
  {
    const key = "member.referral.reward.66ef2bf5c3";
    const customCopy = "推廣零售、推薦與自購的入帳來源";
    check(center.includes('<MemberCopyText copyKey="' + key + '" />')
      && MEMBER_CENTER_COPY_CATALOG.some(entry => entry.key === key)
      && resolveMemberCopy({}, key) === "推廣零售、推薦回饋與自己的消費"
      && resolveMemberCopy({ [key]: customCopy }, key) === customCopy
      && center.includes("data.rewardCreditSources.map")
      && center.includes('entry.sourceCategory === "retail_promotion"')
      && center.includes('entry.sourceCategory === "self_purchase"')
      && ["retail_promotion", "referral", "self_purchase"].every(category => dashboard.rewardCreditSources.some(entry => entry.sourceCategory === category))
      && /const unsortedLedgerRows = rewardFilter === "released"\s*\? creditedLedgerRows/u.test(center)
      && (center.match(/<dialog ref=\{rewardDialogRef\}/gu) ?? []).length === 1,
    "released dialog unifies Retail Promotion and member/referral credits through copy key, catalog and override resolver");
  }
  check(center.includes("data.pendingRetailPromotionRewards.map"), "pending dialog renders scheduled Retail Promotion entries");
  {
    const distinctStrings = (left: string, right: string) => left !== right;
    const originalKey = "member.rewards.reward.14f77fbdd5";
    const availableKey = "credit.passbook.available";
    const originalText = resolveMemberCopy({}, originalKey);
    const availableText = resolveMemberCopy({}, availableKey);
    const originalOverride = "原入帳金額";
    const availableOverride = "可使用餘額";
    check(distinctStrings(originalKey, availableKey)
      && [originalKey, availableKey].every(key => MEMBER_CENTER_COPY_CATALOG.some(entry => entry.key === key))
      && originalText === "實際入帳" && availableText === "目前可用" && distinctStrings(originalText, availableText)
      && resolveMemberCopy({ [originalKey]: originalOverride }, originalKey) === originalOverride
      && resolveMemberCopy({ [originalKey]: originalOverride }, availableKey) === availableText
      && resolveMemberCopy({ [availableKey]: availableOverride }, availableKey) === availableOverride
      && resolveMemberCopy({ [availableKey]: availableOverride }, originalKey) === originalText
      && compactCard.includes('credited && !reversed ? <MemberCopyText copyKey="' + originalKey + '" />')
      && compactCard.includes('</dt><dd>{creditMoney(creditAmount)}</dd>')
      && compactCard.includes('"member.rewards.label.de7f9bd9d5"')
      && center.includes('creditAmount: entry.creditedAmount')
      && /const creditAmount = summary.rewardStatus === "released"\s*\? summary.actualCreditAmount \?\? summary.projectedCreditAmount/u.test(sourceCard)
      && sourceCard.includes('summary.rewardStatus === "released" ? <MemberCopyText copyKey="' + originalKey + '" />')
      && sourceCard.includes('}</small><strong>{creditMoney(creditAmount)}</strong></span>')
      && sourceCard.includes('summary.rewardStatus === "released" && summary.availableCreditAmount != null')
      && sourceCard.includes('<MemberCopyText copyKey="' + availableKey + '" /></small><strong>{creditMoney(summary.availableCreditAmount)}</strong>')
      && referral?.creditedAmount !== referral?.availableAmount && referral?.creditedAmount === 100 && referral.availableAmount === 40,
    "released cards distinguish original credit from current availability through independent labels, overrides and numeric fields");
  }
  {
    const key = "member.referral.reward.0f78857ceb";
    const creditNameKey = "member.rewards.storeCredit.title";
    const balanceBinding = page.match(/const availableCredit =([\s\S]*?);/u)?.[1]?.replace(/\s+/gu, " ").trim();
    const availableTotal = dashboard.credits.filter(entry => entry.status === "available").reduce((sum, entry) => sum + entry.remainingAmount, 0);
    const originalTotal = dashboard.rewardCreditSources.reduce((sum, entry) => sum + entry.creditedAmount, 0);
    check(balanceBinding === 'commerce.credits .filter((item) => item.status === "available") .reduce((sum, item) => sum + item.remainingAmount, 0)'
      && !/(?:referralCenter|rewardCreditSources|referralRewards|retailPromotionRewards)/u.test(balanceBinding)
      && page.includes('availableCreditBalance: availableCredit')
      && center.includes('<strong>{creditValue(data.availableCreditBalance)}</strong><span><MemberCopyText copyKey="' + key + '" /></span>')
      && MEMBER_CENTER_COPY_CATALOG.some(entry => entry.key === key)
      && resolveMemberCopy({}, key) === "直接取自正式抵用金帳本，不由回饋紀錄重算"
      && resolveMemberCopy({ [creditNameKey]: "咖啡金" }, key) === "直接取自正式咖啡金帳本，不由回饋紀錄重算"
      && resolveMemberCopy({ [key]: "目前餘額以正式{creditName}帳本為準" }, key) === "目前餘額以正式抵用金帳本為準"
      && availableTotal !== originalTotal && availableTotal === 120 && originalTotal === 180
      && referral?.creditedAmount !== referral?.availableAmount && referral?.creditedAmount === 100 && referral.availableAmount === 40,
    "available-credit total remains canonical and is not reconstructed from reward records, with resolver-backed explanatory copy");
  }
  {
    const key = "member.rewards.button.52c7dd3708";
    const label = "unified detail links only source orders owned by the signed-in member";
    const { buildSafeRewardSourceOrderSummary } = await import("../lib/memberRewardPresentation");
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const cardModulePath = "../components/member/RewardSourceOrderSummaryCard.tsx";
    const providerModulePath = "../components/member/MemberCenterCopyProvider.tsx";
    const { default: Card } = await import(cardModulePath) as typeof import("../components/member/RewardSourceOrderSummaryCard");
    const { default: Provider } = await import(providerModulePath) as typeof import("../components/member/MemberCenterCopyProvider");
    const currentMemberId = "member-deep-link";
    const orderNumber = "KD20260920-000001";
    const input = {
      currentMemberId, rewardBeneficiaryMemberId: currentMemberId, sourceOrderNumber: orderNumber,
      referralLevel: 0, effectivePV: 100, rewardRate: 5, rewardPV: 5,
      projectedCreditAmount: 100, actualCreditAmount: 100, availableCreditAmount: 40,
      rewardStatus: "released", todayDate: "2026-09-29",
    };
    const owned = buildSafeRewardSourceOrderSummary({ ...input, order: { orderNumber, member: { memberId: currentMemberId } } });
    const nonOwned = buildSafeRewardSourceOrderSummary({ ...input, order: { orderNumber, member: { memberId: "another-member" } } });
    assert.ok(owned && nonOwned, label);
    const render = (summary: NonNullable<typeof owned>, overrides: Record<string, string> = {}) =>
      // eslint-disable-next-line react/no-children-prop -- typed SSR Provider fixture.
      renderToStaticMarkup(createElement(Provider, { initialOverrides: overrides,
        children: createElement(Card, { summary, pointDisplayName: "KD點", variant: "source-only" }) }));
    const ownedMarkup = render(owned);
    const nonOwnedMarkup = render(nonOwned, { [key]: "開啟我的訂單" });
    const unsafeOrderNumber = orderNumber + '/?"&';
    // Presentation boundary probe; the domain builder separately rejects this identifier.
    const encodedMarkup = render({ ...owned, orderNumber: unsafeOrderNumber });
    check(page.includes('await getCurrentMember()') && page.includes('getMemberCommerceDashboard(member.id)')
      && owned.canViewFullOrder === true && nonOwned.canViewFullOrder === false
      && buildSafeRewardSourceOrderSummary({ ...input, rewardBeneficiaryMemberId: "another-member", order: { orderNumber, member: { memberId: currentMemberId } } }) === null
      && buildSafeRewardSourceOrderSummary({ ...input, sourceOrderNumber: unsafeOrderNumber, order: { orderNumber: unsafeOrderNumber, member: { memberId: currentMemberId } } }) === null
      && sourceCard.includes('summary.canViewFullOrder ? (')
      && sourceCard.includes('href={`/orders/${encodeURIComponent(summary.orderNumber)}`}')
      && sourceCard.includes('copyKey="' + key + '"')
      && MEMBER_CENTER_COPY_CATALOG.some(entry => entry.key === key)
      && resolveMemberCopy({}, key) === "查看完整訂單 →"
      && resolveMemberCopy({ [key]: "開啟我的訂單" }, key) === "開啟我的訂單"
      && ownedMarkup.includes('href="/orders/' + encodeURIComponent(orderNumber) + '"')
      && ownedMarkup.includes("查看完整訂單 →")
      && render(owned, { [key]: "開啟我的訂單" }).includes("開啟我的訂單")
      && !nonOwnedMarkup.includes('<a ') && !nonOwnedMarkup.includes('href="/orders/')
      && !nonOwnedMarkup.includes("查看完整訂單 →") && !nonOwnedMarkup.includes("開啟我的訂單")
      && encodedMarkup.includes('href="/orders/' + encodeURIComponent(unsafeOrderNumber) + '"')
      && !encodedMarkup.includes('href="/orders/' + unsafeOrderNumber), label);
  }
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
