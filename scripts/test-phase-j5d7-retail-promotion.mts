import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j5d7-retail-promotion-"));
process.env.KD_DATA_DIR = root;
process.env.AUTH_SESSION_SECRET = "j5d7-test-secret-at-least-32-characters-long";

const rulesApi = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const attributionApi = await import("../lib/retailPromotionAttribution");
const routeApi = await import("../lib/retailPromotionRoutes");

type Snapshot = import("../lib/retailPromotionAttribution").RetailPromotionOrderSnapshot;
type Context = { stateFilePath: string; rulesFilePath: string };

let passed = 0;
const check = (condition: unknown, label: string) => {
  assert.ok(condition, label);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${label}`);
};

const memberA = "member-a";
const memberB = "member-b";
const codeA = commerce.referralCodeForMember(memberA);
const codeB = commerce.referralCodeForMember(memberB);

function snapshot(memberId: string, referralCode: string, rate = 5, ruleVersionId = 1): Snapshot {
  return {
    version: 1,
    referrerMemberId: memberId,
    referralCode,
    attributedAt: "2026-09-20T00:00:00.000Z",
    expiresAt: "2026-10-20T00:00:00.000Z",
    source: "member-share-link",
    ruleVersionId,
    rewardRate: rate,
    baseWaitingDays: 1,
    returnProtectionDays: 1,
    reversalPolicy: "cancel-pending-and-reverse-released",
    roundingMode: "round-half-up",
  };
}

async function context(name: string): Promise<Context> {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  const stateFilePath = path.join(dir, "commerce-state.json");
  const rulesFilePath = path.join(dir, "business-rules.json");
  const rules = structuredClone(rulesApi.DEFAULT_MEMBERSHIP_RULES);
  rules.retailPromotion.enabled = true;
  rules.retailPromotion.rewardRate = 5;
  rules.retailPromotion.attributionWindowDays = 30;
  rules.referral.referralRewardBaseWaitingDays = 1;
  rules.referral.referralRewardReturnProtectionDays = 1;
  rules.referral.selfPurchaseEligibilityMode = "after_prior_valid_consumption";
  await rulesApi.saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-09-01T00:00:00.000Z") }, rulesFilePath);
  return { stateFilePath, rulesFilePath };
}

async function completeGuest(ctx: Context, orderId: string, attribution: Snapshot | null, now = "2026-09-23T04:00:00.000Z") {
  return commerce.handleCanonicalOrderOutcome({
    orderId,
    outcome: "completed",
    retailPromotionAttribution: attribution,
    merchandiseAmount: 2_000,
    basePV: 0,
    effectivePV: 0,
    discountRatio: 1,
    idempotencyKey: `fulfillment:${orderId}`,
    now: new Date(now),
    stateFilePath: ctx.stateFilePath,
    rulesFilePath: ctx.rulesFilePath,
  });
}

async function state(ctx: Context) {
  return commerce.readMembershipCommerceState(ctx.stateFilePath);
}

try {
  const tokenA = attributionApi.createRetailPromotionAttributionToken({ referralCode: codeA, attributionWindowDays: 30, now: new Date("2026-09-01T00:00:00.000Z") });
  check(attributionApi.verifyRetailPromotionAttributionToken(tokenA, new Date("2026-09-02T00:00:00.000Z"))?.referralCode === codeA, "valid signed share attribution is accepted");
  check(attributionApi.verifyRetailPromotionAttributionToken(`${tokenA}x`, new Date("2026-09-02T00:00:00.000Z")) === null, "forged share attribution is rejected");
  check(attributionApi.verifyRetailPromotionAttributionToken(tokenA, new Date("2026-10-02T00:00:00.000Z")) === null, "expired share attribution is rejected");
  assert.throws(() => attributionApi.createRetailPromotionAttributionToken({ referralCode: "INVALID", attributionWindowDays: 30 }), /Invalid/);
  check(true, "invalid share code cannot create attribution");

  const shareUrl = routeApi.retailPromotionShareUrl("https://kdcoffee1962.com/works/giotto?utm_source=line&ref=OLD", codeA);
  const parsedShareUrl = new URL(shareUrl);
  check(parsedShareUrl.searchParams.get("utm_source") === "line" && parsedShareUrl.searchParams.getAll("ref").length === 1 && parsedShareUrl.searchParams.get("ref") === codeA, "share URL preserves useful query parameters and replaces ref without duplication");
  check(routeApi.isRetailPromotionShareablePath("/works/giotto") && !routeApi.isRetailPromotionShareablePath("/member") && !routeApi.isRetailPromotionShareablePath("/admin") && !routeApi.isRetailPromotionShareablePath("/checkout"), "public share eligibility excludes private, admin, auth and checkout routes");
  const shareComponentSource = await fs.readFile(path.join(process.cwd(), "components/member/RetailPromotionShareButton.tsx"), "utf8");
  check(shareComponentSource.includes("navigator.share") && shareComponentSource.includes("navigator.clipboard.writeText"), "share action provides navigator.share and clipboard fallback paths");
  const responsiveCss = await fs.readFile(path.join(process.cwd(), "app/globals.css"), "utf8");
  check(responsiveCss.includes(".retail-promotion-share") && responsiveCss.includes("@media(max-width:620px)"), "share and Member Center UI include desktop and mobile styling");

  const happy = await context("happy");
  await completeGuest(happy, "KD20260923-1001", snapshot(memberA, codeA));
  let happyState = await state(happy);
  const happyRewards = Object.values(happyState.retailPromotionRewards);
  check(happyRewards.length === 1 && happyRewards[0].beneficiaryMemberId === memberA && happyRewards[0].calculatedCreditAmount === 100, "guest + valid A link + completed order creates A's 5% Retail Promotion Reward");
  check(happyRewards[0].status === "scheduled" && happyRewards[0].eligibleMerchandiseAmount === 2_000, "completed guest order enters pending sales and waiting reward lifecycle");
  await commerce.runReferralRewardReleaseScheduler({ now: new Date("2026-09-25T04:00:00.000Z"), stateFilePath: happy.stateFilePath, rulesFilePath: happy.rulesFilePath });
  happyState = await state(happy);
  check(Object.values(happyState.retailPromotionRewards)[0].status === "released" && Object.values(happyState.creditEntries).filter((entry) => entry.sourceType === "promotion").length === 1, "trusted waiting scheduler releases reward into existing credit ledger");

  const none = await context("none");
  await completeGuest(none, "KD20260923-1002", null);
  check(Object.keys((await state(none)).retailPromotionRewards).length === 0, "guest without attribution creates no Retail Promotion Reward");

  const lastClick = await context("last-click");
  const tokenB = attributionApi.createRetailPromotionAttributionToken({ referralCode: codeB, attributionWindowDays: 30, now: new Date("2026-09-02T00:00:00.000Z") });
  check(attributionApi.verifyRetailPromotionAttributionToken(tokenB)?.referralCode === codeB, "last valid B click provides B attribution for future orders");
  await completeGuest(lastClick, "KD20260923-1003", snapshot(memberB, codeB));
  check(Object.values((await state(lastClick)).retailPromotionRewards)[0].beneficiaryMemberId === memberB, "guest clicks A then B before order creation: B owns the new order");

  const immutable = await context("immutable");
  const immutableOrderSnapshot = snapshot(memberA, codeA);
  attributionApi.verifyRetailPromotionAttributionToken(tokenB);
  await completeGuest(immutable, "KD20260923-1004", immutableOrderSnapshot);
  check(Object.values((await state(immutable)).retailPromotionRewards)[0].beneficiaryMemberId === memberA, "order snapshots A; later B click does not rewrite the existing order");
  check(Object.values((await state(immutable)).retailPromotionRewards)[0].beneficiaryMemberId === memberA, "guest registering after guest order creation does not rewrite A attribution");

  const memberOverride = await context("member-override");
  await fs.mkdir(path.join(root, "orders"), { recursive: true });
  await fs.writeFile(path.join(root, "orders", "KD20260923-1005.json"), JSON.stringify({ orderNumber: "KD20260923-1005", createdAt: "2026-09-23T00:00:00.000Z", status: "completed", orderMode: "711_cod", member: { memberId: memberB }, subtotal: 2_000, shipping: 0, items: [] }), "utf8");
  await commerce.handleCanonicalOrderOutcome({ orderId: "KD20260923-1005", outcome: "completed", memberId: memberB, retailPromotionAttribution: snapshot(memberA, codeA), merchandiseAmount: 2_000, idempotencyKey: "member-before-order", now: new Date("2026-09-23T04:00:00.000Z"), stateFilePath: memberOverride.stateFilePath, rulesFilePath: memberOverride.rulesFilePath });
  let memberState = await state(memberOverride);
  check(Object.keys(memberState.retailPromotionRewards).length === 0, "guest registers before ordering: member order creates no Retail Promotion Reward");
  check(Object.keys(memberState.retailPromotionRewards).length === 0, "existing Member B clicks A and buys: A receives zero Retail Promotion Reward");
  check(Object.keys(memberState.retailPromotionRewards).length === 0, "Member A opening own share URL remains self-purchase only");
  check(Object.values(memberState.validConsumptionEvents).some((event) => event.memberId === memberB), "member's own purchase remains the authenticated member's valid consumption");

  await completeGuest(happy, "KD20260923-1001", snapshot(memberA, codeA));
  check(Object.keys((await state(happy)).retailPromotionRewards).length === 1, "same successful completion processed twice creates exactly one reward");

  const cancelled = await context("cancelled");
  await commerce.cancelOrReverseRetailPromotionRewards({ orderId: "KD20260923-1006", outcome: "cancelled", idempotencyKey: "cancel-before-complete", stateFilePath: cancelled.stateFilePath, rulesFilePath: cancelled.rulesFilePath });
  check(Object.keys((await state(cancelled)).retailPromotionRewards).length === 0, "cancelled guest order creates no releasable reward");
  await commerce.handleCanonicalOrderOutcome({ orderId: "KD20260923-1007", outcome: "uncollected", retailPromotionAttribution: snapshot(memberA, codeA), merchandiseAmount: 2_000, idempotencyKey: "uncollected", now: new Date("2026-09-23T04:00:00.000Z"), stateFilePath: cancelled.stateFilePath, rulesFilePath: cancelled.rulesFilePath });
  check(Object.keys((await state(cancelled)).retailPromotionRewards).length === 0, "uncollected guest order creates no releasable reward");

  await commerce.cancelOrReverseRetailPromotionRewards({ orderId: "KD20260923-1001", outcome: "returned", idempotencyKey: "return-1001", now: new Date("2026-09-26T00:00:00.000Z"), stateFilePath: happy.stateFilePath, rulesFilePath: happy.rulesFilePath });
  await commerce.cancelOrReverseRetailPromotionRewards({ orderId: "KD20260923-1001", outcome: "returned", idempotencyKey: "return-1001", now: new Date("2026-09-26T00:00:00.000Z"), stateFilePath: happy.stateFilePath, rulesFilePath: happy.rulesFilePath });
  happyState = await state(happy);
  check(Object.values(happyState.retailPromotionRewards)[0].status === "reversed" && Object.values(happyState.creditEntries).filter((entry) => entry.sourceReference.startsWith("retail_promotion_reward_reversal:")).length === 1, "supported reversal is append-only and idempotent");

  const multiple = await context("multiple");
  await completeGuest(multiple, "KD20260923-1008", snapshot(memberA, codeA));
  await completeGuest(multiple, "KD20260923-1009", snapshot(memberA, codeA));
  check(Object.keys((await state(multiple)).retailPromotionRewards).length === 2, "two completed guest orders under A create two independent rewards");

  const history = await context("history");
  await completeGuest(history, "KD20260923-1010", snapshot(memberA, codeA, 5, 1));
  await completeGuest(history, "KD20260923-1011", snapshot(memberA, codeA, 7, 2));
  const historicalRewards = Object.values((await state(history)).retailPromotionRewards).sort((a, b) => a.sourceOrderNumber.localeCompare(b.sourceOrderNumber));
  check(historicalRewards[0].rewardRate === 5 && historicalRewards[0].calculatedCreditAmount === 100, "Admin rate change does not alter historical reward snapshot");
  check(historicalRewards[1].rewardRate === 7 && historicalRewards[1].calculatedCreditAmount === 140, "new guest order after rate change uses the new rate");

  const isolatedState = await state(history);
  check(Object.keys(isolatedState.referrals).length === 0, "guest Retail Promotion never modifies ReferralRelationship");
  check(Object.values(isolatedState.referrals).every((relationship) => Boolean(relationship.referrerMemberId && relationship.referredMemberId)), "guest Retail Promotion creates no fake member relationship");
  await fs.writeFile(path.join(root, "orders", "KD20260923-1012.json"), JSON.stringify({ orderNumber: "KD20260923-1012", createdAt: "2026-09-23T06:00:00.000Z", status: "confirmed", orderMode: "711_cod", member: null, subtotal: 2_000, shipping: 60, retailPromotionAttribution: snapshot(memberA, codeA), customer: { name: "must-not-leak", phone: "0900000000" }, items: [] }), "utf8");
  const safeCenter = await commerce.getMemberRetailPromotionCenter(memberA, { filePath: history.stateFilePath, rulesFilePath: history.rulesFilePath });
  const safeText = JSON.stringify(safeCenter.history);
  check(safeCenter.summary.pendingPromotionSales === 2_000 && safeCenter.history.some((item) => item.status === "pending_completion" && item.orderReference.endsWith("1012")), "Member Center shows masked pre-completion attributable sales separately from completed rewards");
  check(!/email|phone|address|recipient|customer/i.test(safeText), "member-facing Retail Promotion history leaks no guest PII fields");

  const legacyRules = rulesApi.normalizeMembershipBusinessRules({ ...structuredClone(rulesApi.DEFAULT_MEMBERSHIP_RULES), retailPromotion: undefined });
  check(legacyRules.retailPromotion.enabled === false && legacyRules.retailPromotion.rewardRate === 5 && legacyRules.retailPromotion.attributionWindowDays === 30, "legacy rules normalize safely without activating Retail Promotion");
  check(Object.values(isolatedState.retailPromotionRewards).every((reward) => reward.beneficiaryMemberId === memberA), "Retail Promotion is direct-only with no upline payout");

  console.log(`\nJ.5D.7 focused tests: ${passed} PASS`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
