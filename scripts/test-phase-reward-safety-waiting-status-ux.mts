import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

// @ts-expect-error Node's TypeScript stripping requires an explicit extension.
import { buildSafeRewardSourceOrderSummary, compactRewardDisplayStatus, rewardTimingText, selectHistoricalRewardWaitingRule } from "../lib/memberRewardPresentation.ts";

let checks = 0;
const check = (condition: unknown, label: string) => {
  assert.ok(condition, label);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
};

const protectedPaths = [
  "data/fulfillment/state.json",
  "data/member-identity/registry.json",
  "data/membership-commerce/commerce-state.json",
  "data/membership-commerce/business-rules.json",
  "public/data/assets.json",
  "public/data/homepage.json",
  "public/data/pages.json",
  "public/data/website-data.json",
] as const;
const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const beforeHashes = Object.fromEntries(await Promise.all(protectedPaths.map(async (file) => [file, hash(await readFile(file))])));

const order = {
  orderNumber: "KD20260929-1663",
  createdAt: "2026-09-29T12:00:00.000Z",
  status: "completed",
  member: { memberId: "source-downline", realName: "SECRET NAME", email: "secret@example.test", phone: "0900000000" },
  fulfillmentSummary: { state: "completed", internalFulfillmentId: "SECRET FULFILLMENT" },
  fulfillmentEvents: [{ state: "completed", occurredAt: "2026-09-29T14:36:00.000Z", auditId: "SECRET AUDIT" }],
  items: [{ name: "莫內・花語", optionLabel: "半磅豆", optionDetail: "227g", preparationLabel: "淺焙", quantity: 1, sku: "SECRET SKU" }],
  address: "SECRET ADDRESS",
  payment: "SECRET PAYMENT",
};
const common = {
  currentMemberId: "beneficiary",
  rewardBeneficiaryMemberId: "beneficiary",
  sourceOrderNumber: order.orderNumber,
  order,
  referralLevel: 1,
  calculationBasis: "pv" as const,
  effectivePV: 350,
  rewardRate: 5,
  rewardPV: 17.5,
  projectedCreditAmount: 18,
  actualCreditAmount: null,
  availableCreditAmount: null,
  releaseEligibleBusinessDate: "2026-10-09",
  releasedAt: null,
  reversedAt: null,
  rewardStatus: "scheduled",
  qualificationStatus: "qualified",
  qualificationAuthority: "legacy_order" as const,
  waitingRuleSnapshot: { baseWaitingDays: 3, returnProtectionDays: 7 },
  successfulCompletionAt: "2026-09-29T14:36:00.000Z",
};

const waiting = buildSafeRewardSourceOrderSummary({ ...common, todayDate: "2026-10-01" });
assert.ok(waiting);
check(compactRewardDisplayStatus(waiting.displayStatus) === "安全等待中", "01 safety-wait reward shows 安全等待中");
check(waiting.releaseEligibleBusinessDate === "2026-10-09", "02 compact reward receives the canonical projected date");
check(rewardTimingText(waiting.waitingExplanation) === "預計 2026/10/09 入帳", "03 collapsed timing text says 預計 YYYY/MM/DD 入帳");
check(rewardTimingText(waiting.waitingExplanation, true) === "預計 10/09 入帳", "04 compact mobile timing supports MM/DD");
check(waiting.waitingExplanation.state === "safety_wait", "05 before-due state is safety_wait");
check(waiting.fulfillmentStatus === "已完成取貨", "06 completed source order is explicitly 已完成取貨");
check(waiting.waitingExplanation.completedAt === "2026-09-29T14:36:00.000Z", "07 canonical completion timestamp is projected");
check(waiting.waitingExplanation.baseWaitingDays === 3, "08 immutable base waiting days are projected");
check(waiting.waitingExplanation.returnProtectionDays === 7, "09 immutable return-protection days are projected");
check(waiting.waitingExplanation.exactDayBreakdownAvailable, "10 exact historical breakdown is marked available");

const qualificationSnapshot = selectHistoricalRewardWaitingRule({
  qualificationAuthority: "qualification_coverage",
  rewardSnapshot: { baseWaitingDays: 5, returnProtectionDays: 14 },
  qualificationRoundSnapshot: { baseWaitingDays: 3, returnProtectionDays: 7 },
  maturationSnapshot: { baseWaitingDays: 9, returnProtectionDays: 9 },
});
check(qualificationSnapshot?.baseWaitingDays === 3 && qualificationSnapshot.returnProtectionDays === 7, "11 qualification-round snapshot outranks other historical evidence");
check(JSON.stringify(qualificationSnapshot) === JSON.stringify(selectHistoricalRewardWaitingRule({ qualificationAuthority: "qualification_coverage", rewardSnapshot: { baseWaitingDays: 99, returnProtectionDays: 99 }, qualificationRoundSnapshot: { baseWaitingDays: 3, returnProtectionDays: 7 } })), "12 changing unrelated/current-like values does not alter historical explanation");
check(selectHistoricalRewardWaitingRule({ qualificationAuthority: "qualification_coverage", maturationSnapshot: { baseWaitingDays: 2, returnProtectionDays: 6 } })?.returnProtectionDays === 6, "13 persisted maturation is a safe fallback authority");
check(selectHistoricalRewardWaitingRule({ qualificationAuthority: "qualification_coverage", rewardSnapshot: { baseWaitingDays: 5, returnProtectionDays: 14 } }) === null, "14 coverage reward never borrows the wrong reward-generation snapshot");
check(selectHistoricalRewardWaitingRule({ qualificationAuthority: "self_purchase_direct", rewardSnapshot: { baseWaitingDays: 4, returnProtectionDays: 8 } })?.baseWaitingDays === 4, "15 self-purchase uses its own persisted snapshot");
check(selectHistoricalRewardWaitingRule({ qualificationAuthority: "legacy_order", rewardSnapshot: { baseWaitingDays: 1, returnProtectionDays: 2 } })?.returnProtectionDays === 2, "16 legacy and Retail-style rewards use their own persisted snapshot");
check(selectHistoricalRewardWaitingRule({ qualificationAuthority: "legacy_order", rewardSnapshot: { baseWaitingDays: -1, returnProtectionDays: 7 } }) === null, "17 invalid day counts are never fabricated");

const noBreakdown = buildSafeRewardSourceOrderSummary({ ...common, waitingRuleSnapshot: null, todayDate: "2026-10-01" });
assert.ok(noBreakdown);
check(!noBreakdown.waitingExplanation.exactDayBreakdownAvailable, "18 missing historical day components use safe fallback mode");
check(noBreakdown.waitingExplanation.baseWaitingDays === null && noBreakdown.waitingExplanation.returnProtectionDays === null, "19 missing components remain null");
check(rewardTimingText(noBreakdown.waitingExplanation) === "預計 2026/10/09 入帳", "20 known projected date remains visible without day components");
const noDate = buildSafeRewardSourceOrderSummary({ ...common, releaseEligibleBusinessDate: null, waitingRuleSnapshot: null, todayDate: "2026-10-01" });
assert.ok(noDate);
check(rewardTimingText(noDate.waitingExplanation) === "入帳日期確認中", "21 missing timing authority shows 入帳日期確認中");
check(rewardTimingText(noDate.waitingExplanation) !== "待完成取貨後計算", "22 completed reward never claims pickup is unfinished");

const due = buildSafeRewardSourceOrderSummary({ ...common, todayDate: "2026-10-09" });
assert.ok(due);
check(due.displayStatus === "待系統入帳", "23 at projected date status becomes 待系統入帳");
check(due.waitingExplanation.state === "due", "24 due presentation state is explicit");
check(rewardTimingText(due.waitingExplanation) === "已到預計發放日 2026/10/09，系統將自動處理", "25 due helper includes projected date and promises automatic system processing");

const released = buildSafeRewardSourceOrderSummary({ ...common, rewardStatus: "released", releasedAt: "2026-10-09T03:00:00.000Z", todayDate: "2026-10-10" });
assert.ok(released);
check(compactRewardDisplayStatus(released.displayStatus) === "已入帳", "26 released status is 已入帳");
check(rewardTimingText(released.waitingExplanation) === "已入帳 2026/10/09", "27 released date uses releasedAt");
const reversed = buildSafeRewardSourceOrderSummary({ ...common, rewardStatus: "reversed", reversedAt: "2026-10-11T03:00:00.000Z", todayDate: "2026-10-12" });
assert.ok(reversed);
check(compactRewardDisplayStatus(reversed.displayStatus) === "已沖回", "28 reversed status is 已沖回");
check(rewardTimingText(reversed.waitingExplanation) === "已沖回 2026/10/11", "29 reversed date uses reversedAt");
const cancelled = buildSafeRewardSourceOrderSummary({ ...common, rewardStatus: "cancelled", todayDate: "2026-10-01" });
assert.ok(cancelled);
check(cancelled.displayStatus === "已取消", "30 cancelled status is 已取消");
check(rewardTimingText(cancelled.waitingExplanation) === null, "31 cancelled reward has no projected-credit copy");

const explanationCopy = await readFile("components/member/RewardWaitingDisclosure.tsx", "utf8");
const compactCard = await readFile("components/member/RewardLedgerCompactCard.tsx", "utf8");
const sourceCard = await readFile("components/member/RewardSourceOrderSummaryCard.tsx", "utf8");
const referralCenter = await readFile("components/member/MemberReferralCenter.tsx", "utf8");
const orgChart = await readFile("components/member/MemberReferralOrgChart.tsx", "utf8");
const retailCenter = await readFile("components/member/RetailPromotionCenter.tsx", "utf8");
const styles = await readFile("components/member/MemberReferralExperience.module.css", "utf8");
const presentation = await readFile("lib/memberRewardPresentation.ts", "utf8");
const commerce = await readFile("lib/membershipCommerce.ts", "utf8");

check(explanationCopy.includes("說明 ") && !explanationCopy.includes("為什麼要等待"), "32 visible disclosure label is 說明");
check(explanationCopy.includes("useState(false)"), "33 說明 is collapsed by default");
check(explanationCopy.includes('type="button"'), "34 說明 uses button semantics");
check(explanationCopy.includes("aria-expanded={open}"), "35 說明 exposes aria-expanded");
check(explanationCopy.includes("aria-controls={panelId}"), "36 說明 exposes aria-controls");
check(explanationCopy.includes('aria-label="查看安全等待說明"'), "37 disclosure has an accessible label");
check(explanationCopy.includes("您不需要另外操作"), "38 explanation communicates no member action is required");
check(explanationCopy.includes("此筆來源訂單已完成取貨"), "39 explanation distinguishes completed order from waiting reward");
check(explanationCopy.includes("基礎等待") && explanationCopy.includes("退貨保護"), "40 explanation exposes historical day components when available");
check(explanationCopy.includes("依本筆回饋建立時的規則執行"), "41 missing day breakdown uses neutral historical wording");
check(!/Reward Engine|qualification coverage|maturation|snapshot|scheduler|authority/u.test(explanationCopy), "42 member explanation contains no technical engine wording");

check(compactCard.includes("rewardTimingText(explanation)"), "43 compact ledger displays projected timing in collapsed state");
check(compactCard.includes("<RewardWaitingDisclosure"), "44 compact ledger exposes the shared explanation control");
check(compactCard.includes("預計至") && compactCard.includes("安全等待"), "45 lifecycle stepper includes concise projected timing");
check(compactCard.includes("aria-expanded={expanded}") && compactCard.includes("aria-controls={detailId}"), "46 main compact accordion accessibility remains intact");
check(referralCenter.includes("expandedRewardKey") && referralCenter.includes("current === row.stableKey ? null"), "47 one-expanded-card behavior remains intact");
check(referralCenter.includes("rewardView") && referralCenter.includes('currentUrl.hash === "#credit"'), "48 reward deep links and legacy credit intent remain wired");

check(orgChart.includes("RewardSourceOrderSummaryCard"), "49 Organization Chart reuses the shared safe reward source card");
check(sourceCard.includes("RewardWaitingDisclosure"), "50 Organization Chart source card exposes 說明");
check(sourceCard.includes("rewardTimingText(summary.waitingExplanation)"), "51 Organization Chart uses the shared projected-date presentation");
check(sourceCard.includes("summary.waitingExplanation") && sourceCard.includes("summary.releaseEligibleBusinessDate"), "52 safe source card consumes one canonical timing projection");
check(!orgChart.includes("Reward Engine"), "53 Organization Chart no longer exposes technical Reward Engine wording");
check(orgChart.includes("onPointerMove") && orgChart.includes("pointers.current"), "54 Organization Chart zoom and pan remain intact");
check(sourceCard.includes("summary.canViewFullOrder") && sourceCard.includes("查看完整訂單"), "55 full-order link remains guarded by verified ownership");

check(retailCenter.includes("RewardSourceOrderSummaryCard") && retailCenter.includes("RewardWaitingDisclosure"), "56 Retail Promotion uses the same waiting UX grammar");
check(commerce.includes("reward.baseWaitingDaysSnapshot") && commerce.includes("reward.returnProtectionDaysSnapshot"), "57 Retail Promotion projects its own persisted timing fields");
check(commerce.includes("referralRewardWaitingRuleSnapshot(state, reward)"), "58 referral and self-purchase projections use shared immutable evidence selection");
check(commerce.includes("round?.rewardSafetyRuleSnapshot") && commerce.includes("maturation.baseWaitingDays"), "59 qualification coverage uses Round snapshot with persisted maturation fallback");
const snapshotFunction = commerce.slice(commerce.indexOf("export function referralRewardWaitingRuleSnapshot"), commerce.indexOf("export async function getMemberCommerceDashboard"));
check(!snapshotFunction.includes("version.rules") && !snapshotFunction.includes("getActiveMembershipRules"), "60 historical wait-day selector cannot read current Admin rules");
check(/Current business\r?\n \* rules are deliberately not accepted/.test(presentation), "61 presentation selector documents current-rule exclusion");

check(waiting.waitingExplanation.projectedReleaseDate === waiting.releaseEligibleBusinessDate, "62 ledger and safe source projected dates are identical");
check(waiting.waitingExplanation.baseWaitingDays === qualificationSnapshot?.baseWaitingDays, "63 Reward Detail and Organization Chart day values share the same shape");
check(waiting.projectedCreditAmount === 18 && waiting.rewardPV === 17.5, "64 KD points and NT$ projected credit remain separate values");
check(waiting.rewardRate === 5, "65 5 percent remains 5 rather than 500");

const safeJson = JSON.stringify(waiting);
for (const secret of ["SECRET NAME", "secret@example.test", "0900000000", "SECRET FULFILLMENT", "SECRET AUDIT", "SECRET SKU", "SECRET ADDRESS", "SECRET PAYMENT"]) {
  check(!safeJson.includes(secret), `66 privacy projection omits ${secret}`);
}
check(!/memberId|rewardId|fulfillmentId|auditId|token|address|email|phone/iu.test(safeJson), "67 safe DTO contains no private/internal identity keys");
check(waiting.canViewFullOrder === false && waiting.sourceCategory === "downline", "68 downline reward gains no full-order access");

check(styles.includes(".rewardWaitingToggle:focus-visible"), "69 說明 has a visible keyboard focus state");
check(styles.includes("@media (max-width: 700px)") && styles.includes(".rewardWaitingPanel"), "70 mobile 360–430px layout remains compact and responsive");
check(!explanationCopy.includes("dialog") && !explanationCopy.includes("showModal"), "71 waiting explanation introduces no nested modal");
check(![compactCard, sourceCard, explanationCopy].some((value) => value.includes("window.location.reload")), "72 waiting UX uses no reload workaround");

const commerceDiff = execFileSync("git", ["diff", "--unified=0", "--", "lib/membershipCommerce.ts"], { encoding: "utf8" });
check(!presentation.includes("issueCreditInState") && !presentation.includes("runReferralRewardReleaseScheduler"), "73 presentation remains read-only while payout timing is owned by dedicated engine regression");
check(!/^[+-].*(issueCreditInState|runReferralRewardReleaseScheduler|matureCoveredReferralRewards)/mu.test(commerceDiff), "74 accounting, maturation, and scheduler implementations are unchanged");
check(!/fetch\(|transaction\(|atomicWrite/u.test(explanationCopy + compactCard + sourceCard), "75 presentation components have no write path");

const afterHashes = Object.fromEntries(await Promise.all(protectedPaths.map(async (file) => [file, hash(await readFile(file))])));
check(protectedPaths.every((file) => beforeHashes[file] === afterHashes[file]), "76 protected production data remains byte-identical during tests");

console.log(`Reward safety waiting status UX checks passed: ${checks}`);
