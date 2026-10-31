import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveOrderRewardBasis, cumulativeOriginalLineContribution as cumulative,
  incrementalOriginalLineContribution as delta, originalEconomicFingerprint } from "../lib/orderRewardBasis";
import { snapshotReturnLineEvidence, resolveReturnLineEvidence, resolveOrderEconomicAllocation,
  prepareOrderCompletionWrite, assertOrderCompletionPreserved, type OrderCompletionSnapshot } from "../lib/orderCompletion";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } from "../lib/membershipBusinessRules";
import { readMembershipCommerceState, recordValidConsumptionFromCompletedOrder, resolveOriginalCommerceEconomicEvidence,
  projectReturnRewardHolds, type ReferralReward, type RetailPromotionReward } from "../lib/membershipCommerce";
import { calculateSelfPurchaseTierReward } from "../lib/selfPurchaseRewardTiers";
import { withOrderFileUpdateLock } from "../lib/orderFiles";

if (process.argv[2] === "--resolve") {
  process.stdout.write(JSON.stringify(resolveOrderEconomicAllocation(JSON.parse(process.argv[3]))));
} else {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f1d0-economics-"));
  const previousRoot = process.env.KD_DATA_DIR; process.env.KD_DATA_DIR = root;
  const rulesFile = path.join(root, "membership-commerce", "business-rules.json");
  const stateFile = path.join(root, "membership-commerce", "commerce-state.json");
  const completedAt = "2026-09-26T02:00:00.000Z";
  let count = 0;
  const test = async (name: string, check: () => unknown | Promise<unknown>) => { await check(); console.log(`PASS ${++count} ${name}`); };
  const line = (amount: number, extra: Record<string, unknown> = {}) => ({ slug: "coffee", optionId: "same-sku", quantity: 1,
    unitPrice: amount, lineTotal: amount, ...extra });
  const order = (amounts = [100, 100], redemption = 100, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    orderNumber: "KD20260925-9010", createdAt: "2026-09-25T02:00:00.000Z", status: "completed",
    items: amounts.map(amount => line(amount)), subtotal: amounts.reduce((a, b) => a + b, 0), shipping: 0,
    total: amounts.reduce((a, b) => a + b, 0) - redemption,
    credit: { appliedAmount: redemption, reservationId: redemption ? "original-reservation" : undefined, rulesVersion: 2 },
    ...extra,
  });
  function resolved(value: ReturnType<typeof resolveOrderEconomicAllocation>) {
    if (value.status !== "resolved") assert.fail(JSON.stringify(value));
    return value;
  }
  function manual(value: ReturnType<typeof resolveOrderEconomicAllocation>, reason?: string) {
    assert.equal(value.status, "manual_review_required");
    if (value.status === "manual_review_required" && reason) assert.equal(value.reason, reason);
  }
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  async function write(file: string, value: unknown) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value)); }
  const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES);
  rules.credit.appliesToShipping = "no"; rules.credit.redemption = { mode: "maximum-percentage", percent: 70 };
  rules.referral.payoutQualification.mode = "general";
  rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 1;
  rules.referral.payoutQualification.validConsumption.includeCreditDiscount = false;
  rules.referral.payoutQualification.validConsumption.includeShipping = false;
  const protectedFiles = ["data/fulfillment/state.json", "data/member-identity/registry.json", "data/membership-commerce/commerce-state.json",
    "data/membership-commerce/business-rules.json", "public/data/assets.json", "public/data/homepage.json", "public/data/pages.json", "public/data/website-data.json"];
  const bytes = async (file: string) => fs.readFile(file).then(value => value.toString("base64")).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error; return null;
  });
  const protectedBefore = await Promise.all(protectedFiles.map(bytes));
  try {
    await saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-08-01T00:00:00Z") }, rulesFile);
    const source = order(), original = structuredClone(source);
    const a = resolved(resolveOrderEconomicAllocation(source));
    await test("existing orderRewardBasis remains the total authority", () => {
      assert.deepEqual(a.rewardBasis, { status: "resolved", authority: "orderRewardBasis", total: resolveOrderRewardBasis(source).rewardMerchandiseAmount });
      assert.equal(sum(a.lines.map(item => item.rewardEconomicContribution!)), 100);
    });
    await test("100/100 with paid basis 100 allocates 50/50", () => assert.deepEqual(a.lines.map(item => item.rewardEconomicContribution), [50, 50]));
    const weighted = resolved(resolveOrderEconomicAllocation(order([300, 100])));
    await test("300/100 with paid basis 300 allocates 225/75", () => assert.deepEqual(weighted.lines.map(item => item.rewardEconomicContribution), [225, 75]));
    await test("100/100 actual redemption 100 allocates 50/50", () => assert.deepEqual(a.lines.map(item => item.allocatedActualRedemption), [50, 50]));
    await test("300/100 actual redemption 100 allocates 75/25", () => assert.deepEqual(weighted.lines.map(item => item.allocatedActualRedemption), [75, 25]));
    await test("duplicate identical SKU lines remain separate", () => assert.equal(new Set(a.lines.map(item => item.returnLineRef)).size, 2));
    await test("maximum allowed 140 is not actual redemption 100", () => assert.equal(a.actualRedemptionUsed, 100));
    await test("misleading maximum/requested fields never replace actual", () => {
      const value = resolved(resolveOrderEconomicAllocation(order([100, 100], 100, {
        maximumAllowedRedemption: 140, credit: { appliedAmount: 100, requestedAmount: 140, maximumAllowedRedemption: 140 },
      })));
      assert.deepEqual(value.lines.map(item => item.allocatedActualRedemption), [50, 50]);
    });
    await test("missing actual redemption is never replaced by maximum", () => manual(resolveOrderEconomicAllocation(order([100, 100], 100,
      { credit: { requestedAmount: 140, maximumAllowedRedemption: 140 } })), "missing_actual_redemption"));
    await test("original economic input is not mutated", () => assert.deepEqual(source, original));
    const noCredit = resolved(resolveOrderEconomicAllocation(order([300, 100], 0)));
    await test("no redemption allocates zero", () => assert.deepEqual(noCredit.lines.map(item => item.allocatedActualRedemption), [0, 0]));
    await test("no adjustment preserves direct contributions", () => assert.deepEqual(noCredit.lines.map(item => item.rewardEconomicContribution), [300, 100]));
    await test("coherent legacy no-credit totals prove zero without synthesizing credit", () => {
      const historical = order([100], 0); delete historical.credit;
      assert.equal(resolved(resolveOrderEconomicAllocation(historical)).actualRedemptionUsed, 0); assert.equal(Object.hasOwn(historical, "credit"), false);
    });
    await test("missing actual evidence with a reduced total fails closed", () => {
      const historical = order(); delete historical.credit;
      manual(resolveOrderEconomicAllocation(historical), "inconsistent_actual_redemption");
    });
    const roundingOrder = order([100, 100, 100], 100), rounding = resolved(resolveOrderEconomicAllocation(roundingOrder));
    await test("fractional redemption conserves exactly 100", () => assert.equal(sum(rounding.lines.map(item => item.allocatedActualRedemption)), 100));
    await test("stable returnLineRef wins a tied NT$1 remainder", () => {
      const ranked = [...rounding.lines].sort((left, right) => left.returnLineRef < right.returnLineRef ? -1 : 1);
      assert.deepEqual(ranked.map(item => item.allocatedActualRedemption), [34, 33, 33]);
    });
    await test("paid complement conserves every line and exact authoritative reward total", () => {
      for (const item of rounding.lines) assert.equal(item.allocatedActualRedemption + item.remainingPaidContribution, item.redemptionEligibleBasis);
      assert.equal(sum(rounding.lines.map(item => item.rewardEconomicContribution!)), 200);
    });
    await test("rounding never loses or creates NT$1 across diverse original orders", () => {
      for (let size = 1; size <= 12; size++) for (let credit = 0; credit <= 40; credit++) {
        const amounts = Array.from({ length: size }, (_, index) => index * 13 + 41);
        const value = resolved(resolveOrderEconomicAllocation(order(amounts, credit)));
        assert.equal(sum(value.lines.map(item => item.allocatedActualRedemption)), credit);
        assert.equal(sum(value.lines.map(item => item.rewardEconomicContribution!)), sum(amounts) - credit);
        assert.ok(value.lines.every(item => Number.isSafeInteger(item.allocatedActualRedemption) && item.remainingPaidContribution >= 0));
      }
    });
    await test("BigInt products stay exact above floating product precision", () => {
      const value = resolved(resolveOrderEconomicAllocation(order([3_000_000_000_001, 3_000_000_000_000], 2_000_000_000_001)));
      assert.equal(sum(value.lines.map(item => item.allocatedActualRedemption)), 2_000_000_000_001);
      assert.equal(value.lines.find(item => item.originalTransactionBasis === 3_000_000_000_001)?.allocatedActualRedemption, 1_000_000_000_001);
    });
    await test("unsafe aggregate money fails closed", () => manual(resolveOrderEconomicAllocation(order([Number.MAX_SAFE_INTEGER, 1], 0))));
    await test("fractional NTD original line fails closed", () => manual(resolveOrderEconomicAllocation(order([100.5], 0))));
    await test("JSON roundtrip preserves allocation", () => assert.deepEqual(resolveOrderEconomicAllocation(JSON.parse(JSON.stringify(roundingOrder))), rounding));
    await test("fresh process/restart produces identical allocation", () => {
      const child = spawnSync(process.execPath, ["--experimental-strip-types", "--import", "./scripts/return-workflow-test-bootstrap.mjs", fileURLToPath(import.meta.url), "--resolve", JSON.stringify(roundingOrder)], { encoding: "utf8", windowsHide: true });
      assert.equal(child.status, 0, child.stderr); assert.deepEqual(JSON.parse(child.stdout), rounding);
    });
    await test("reordered object keys do not change allocation fingerprint", () => {
      const reordered = Object.fromEntries(Object.entries(roundingOrder).reverse());
      assert.deepEqual(resolveOrderEconomicAllocation(reordered), rounding);
    });
    for (const [quantity, expected] of [[2, [0, 50, 100]], [3, [0, 34, 67, 100]]] as const) {
      await test(`quantity ${quantity} uses cumulative contribution`, () => assert.deepEqual(Array.from({ length: quantity + 1 }, (_, index) => cumulative(100, quantity, index)), expected));
      await test(`quantity ${quantity} deltas sum to exactly full line`, () => assert.equal(sum(Array.from({ length: quantity }, (_, index) => delta(100, quantity, index, index + 1))), 100));
    }
    await test("quantity retry returns identical second delta", () => { assert.equal(delta(100, 3, 1, 2), 33); assert.equal(delta(100, 3, 1, 2), 33); });
    await test("multiple-unit request and single-unit requests telescope", () => assert.equal(delta(100, 3, 0, 2), delta(100, 3, 0, 1) + delta(100, 3, 1, 2)));
    await test("quantity model never independently rounds requests", () => assert.notEqual(delta(100, 3, 1, 2), delta(100, 3, 0, 1)));
    await test("quantity greater than money retains exact full contribution", () => { assert.equal(cumulative(2, 5, 2), 2); assert.equal(cumulative(2, 5, 5), 2); });
    for (const [previous, next] of [[0, 4], [-1, 1], [2, 1], [0, 0.5]]) await test(`invalid cumulative transition ${previous}/${next} rejected`, () => assert.throws(() => delta(100, 3, previous, next)));
    const prepared = await prepareOrderCompletionWrite({ ...source, status: "ready_for_pickup" }, { ...source,
      fulfillmentEvents: [{ eventId: "original-completion", state: "completed", occurredAt: completedAt }] });
    const completion = prepared.completion as OrderCompletionSnapshot;
    await test("new completion freezes economic evidence", () => assert.deepEqual(completion.economicAllocation, a));
    await test("A return-line evidence stays identical", () => assert.deepEqual(resolveReturnLineEvidence(prepared), snapshotReturnLineEvidence(source)));
    for (const [field, expected] of Object.entries({ eventId: "original-completion", completedAt, rulesVersion: 2,
      returnProtectionDaysSnapshot: rules.referral.referralRewardReturnProtectionDays, returnDeadline: "2026-10-03T15:59:59.999Z" })) {
      await test(`completion ${field} preserved`, () => assert.equal(completion[field as keyof OrderCompletionSnapshot], expected));
    }
    await test("immutable economic allocation rejects edit", () => {
      const changed = structuredClone(prepared), evidence = (changed.completion as OrderCompletionSnapshot).economicAllocation;
      if (evidence?.status === "resolved") evidence.lines[0].allocatedActualRedemption++;
      assert.throws(() => assertOrderCompletionPreserved(prepared, changed));
      manual(resolveOrderEconomicAllocation(changed), "invalid_saved_allocation");
    });
    await test("completion cannot leave terminal completed state", () => assert.throws(() => assertOrderCompletionPreserved(prepared, { ...prepared, status: "returned" })));
    await test("current order prices, roles, reward rates and redemption maxima cannot replace frozen evidence", () => {
      assert.deepEqual(resolveOrderEconomicAllocation({ ...prepared, items: [line(9999)], subtotal: 9999, credit: { appliedAmount: 140 },
        role: "future-commercial-role", rewardRate: 99, pricingPolicy: { discountPercent: 25 }, maximumAllowedRedemption: 999 }), a);
    });
    const currentRules = structuredClone(rules); currentRules.credit.redemption = { mode: "maximum-percentage", percent: 60 }; currentRules.credit.appliesToShipping = "yes";
    currentRules.referral.selfPurchaseRewardRate = 1;
    await saveMembershipBusinessRules({ expectedRevision: 1, rules: currentRules, now: new Date("2026-10-20T00:00:00Z") }, rulesFile);
    await test("Admin cap 70→60 and later reward rate changes do not affect history", () => assert.deepEqual(resolveOrderEconomicAllocation(prepared), a));
    await test("frozen evidence survives completion JSON restart", () => assert.deepEqual(resolveOrderEconomicAllocation(JSON.parse(JSON.stringify(prepared))), a));
    const historicalFile = path.join(root, "orders", `${source.orderNumber}.json`); await write(historicalFile, source);
    const historicalBytes = await fs.readFile(historicalFile, "utf8");
    await test("historical sufficient order resolves without backfill", async () => {
      const persisted = JSON.parse(await fs.readFile(historicalFile, "utf8")); assert.deepEqual(resolveOrderEconomicAllocation(persisted), a);
      assert.equal(Object.hasOwn(persisted, "completion"), false); assert.equal(await fs.readFile(historicalFile, "utf8"), historicalBytes);
      assert.deepEqual(await prepareOrderCompletionWrite(persisted, persisted), persisted);
    });
    await test("real shared order write boundary rejects economic evidence mutation", async () => {
      await write(historicalFile, prepared); const before = await fs.readFile(historicalFile, "utf8");
      await assert.rejects(() => withOrderFileUpdateLock(path.dirname(historicalFile), String(source.orderNumber), async (saved, persist) =>
        persist({ ...saved, completion: { ...(saved.completion as OrderCompletionSnapshot), economicAllocation: undefined } })));
      assert.equal(await fs.readFile(historicalFile, "utf8"), before);
    });
    await test("historical missing price is manual review", () => manual(resolveOrderEconomicAllocation(order([100], 0, { items: [{ slug: "a", optionId: "b", quantity: 1 }] }))));
    await test("ambiguous legacy order adjustment is manual review", () => manual(resolveOrderEconomicAllocation(order([300, 100], 0, { subtotal: 300, total: 300 })), "ambiguous_original_adjustment"));
    const discountedOrder = order([300, 100], 100, { subtotal: 300, total: 200,
      pricingSnapshot: { merchandiseOriginal: 400, selectedPriceSource: "subscription", subscriptionPrice: 300,
        creditReserved: 100, finalAmount: 200, currency: "TWD" } });
    await test("existing subscription pricing snapshot proves original discount without current pricing", () => {
      const value = resolved(resolveOrderEconomicAllocation(discountedOrder));
      assert.deepEqual(value.lines.map(item => item.redemptionEligibleBasis), [225, 75]);
      assert.equal(sum(value.lines.map(item => item.rewardEconomicContribution!)), 200);
    });
    await test("contradictory preserved pricing credit fails closed", () => manual(resolveOrderEconomicAllocation({ ...discountedOrder,
      pricingSnapshot: { ...(discountedOrder.pricingSnapshot as object), creditReserved: 140 } }), "inconsistent_actual_redemption"));
    await test("redemption weights remain original transaction basis after discount rounding", () => {
      const value = resolved(resolveOrderEconomicAllocation(order([1, 2, 3], 2, { subtotal: 3, total: 1,
        pricingSnapshot: { merchandiseOriginal: 6, selectedPriceSource: "subscription", subscriptionPrice: 3, creditReserved: 2, finalAmount: 1, currency: "TWD" } })));
      assert.deepEqual(value.lines.map(item => item.allocatedActualRedemption), [0, 1, 1]);
      assert.deepEqual(value.lines.map(item => item.rewardEligibleBasis), [1, 2, 3]);
    });
    await test("null saved allocation requires manual review rather than throwing", () => manual(resolveOrderEconomicAllocation({ ...prepared,
      completion: { ...completion, economicAllocation: null } }), "invalid_saved_allocation"));
    const store = { domain: "store", productId: "store", variantId: "one", quantity: 1, unitPrice: 100, lineTotal: 100 };
    const mixed = order([100, 100], 0, { items: [line(100), store] });
    await test("ineligible Store line receives no Coffee monetary contribution", () => {
      const value = resolved(resolveOrderEconomicAllocation(mixed)); assert.deepEqual(value.lines.map(item => item.rewardEconomicContribution), [100, 0]);
      assert.equal(value.lines[1].redemptionEligibleBasis, 100);
    });
    await test("mixed-credit unresolved authority stays manual without changing engine", () => {
      const value = resolved(resolveOrderEconomicAllocation({ ...mixed, credit: { appliedAmount: 50 }, total: 150 }));
      assert.deepEqual(value.rewardBasis, { status: "manual_review_required", reason: "mixed_credit_allocation_unresolved" });
      assert.equal(sum(value.lines.map(item => item.allocatedActualRedemption)), 50);
    });
    await test("no-reward/no-PV order retains transaction evidence", () => {
      const value = resolved(resolveOrderEconomicAllocation(order([100], 0, { items: [store] })));
      assert.deepEqual(value.rewardBasis, { status: "not_applicable" }); assert.equal(value.lines[0].rewardEconomicContribution, null);
    });
    await test("PV is optional and never synthesized from money", () => {
      assert.equal(Object.hasOwn(a.lines[0], "pv"), false); assert.equal(a.lines[0].originalTransactionBasis, 100);
    });
    await test("future commercial identity retains original transaction price 700", () => {
      const value = resolved(resolveOrderEconomicAllocation(order([700], 0, { member: { role: "future-role" }, retailPrice: 1000 })));
      assert.equal(value.lines[0].originalTransactionBasis, 700);
    });
    await test("shipping excluded from monetary merchandise authority", () => {
      const value = resolved(resolveOrderEconomicAllocation(order([100, 100], 0, { shipping: 60, codServiceFee: 30, total: 290 })));
      assert.equal(sum(value.lines.map(item => item.rewardEconomicContribution!)), 200);
    });
    const shippingOrder = order([100, 100], 100, { shipping: 60, total: 160 });
    await test("historical unproven redemption shipping eligibility stays manual", () => manual(resolveOrderEconomicAllocation(shippingOrder), "unproven_original_redemption_scope"));
    await test("new completion uses original exact credit policy version", async () => {
      const saved = await prepareOrderCompletionWrite({ ...shippingOrder, status: "ready_for_pickup" }, { ...shippingOrder,
        fulfillmentEvents: [{ eventId: "shipping-completion", state: "completed", occurredAt: "2026-10-21T02:00:00Z" }] });
      const value = resolved(resolveOrderEconomicAllocation(saved)); assert.deepEqual(value.redemptionScope, { appliesToShipping: "no", rulesVersion: 2 });
      assert.equal(value.actualRedemptionUsed, 100);
    });
    await test("redemption exceeding merchandise cannot silently assign shipping to a line", () => manual(resolveOrderEconomicAllocation(order([100], 150,
      { shipping: 60, total: 10 })), "redemption_non_merchandise_scope"));
    // Real existing consumption API supplies the original authority and round links.
    await write(historicalFile, { ...prepared, totalBeforeCredit: 200 });
    await recordValidConsumptionFromCompletedOrder({ memberId: "source-member", orderId: String(source.orderNumber),
      idempotencyKey: "original-consumption", stateFilePath: stateFile, rulesFilePath: rulesFile, now: new Date(completedAt) });
    const state = await readMembershipCommerceState(stateFile), event = Object.values(state.validConsumptionEvents)[0];
    assert.ok(event);
    const referral: ReferralReward = { rewardId: "original-referral", sourceOrderNumber: String(source.orderNumber), sourceMemberId: "source-member",
      beneficiaryMemberId: "beneficiary", referralLevel: 1, rewardType: "new_referral", calculationMode: "paid_amount", paidAmountBasis: 100,
      basePV: 0, discountRatio: 1, effectivePV: 0, rewardRate: 10, rewardPV: 0, pvRewardMoneyValue: 1, calculatedCreditAmount: 10,
      ruleVersion: 2, ancestrySnapshot: ["beneficiary"], createdAt: completedAt, eligibleAt: completedAt, scheduledReleaseAt: completedAt,
      releasedAt: null, status: "scheduled", rewardCreditEntryId: null, reversalCreditEntryId: null, idempotencyKey: "original-reward" };
    state.referralRewards[referral.rewardId] = referral;
    const retail: RetailPromotionReward = { rewardId: "original-retail", sourceOrderNumber: String(source.orderNumber), beneficiaryMemberId: "beneficiary",
      referralCode: "original-code", attributedAt: completedAt, attributionExpiresAt: completedAt, attributionSource: "member-share-link",
      eligibleMerchandiseAmount: 100, calculationBasis: "paid_amount", calculationBaseValue: 100, rewardRate: 10, calculatedCreditAmount: 10,
      ruleVersion: 2, roundingModeSnapshot: "round-half-up", baseWaitingDaysSnapshot: 0, returnProtectionDaysSnapshot: 7, totalWaitingDaysSnapshot: 7,
      reversalPolicySnapshot: "cancel-pending-only", successfulCompletionAt: completedAt, successfulPickupBusinessDate: "2026-09-26",
      releaseEligibleBusinessDate: "2026-10-03", createdAt: completedAt, releasedAt: null, sourceOrderFinalState: "completed", status: "scheduled",
      rewardCreditEntryId: null, reversalCreditEntryId: null, idempotencyKey: "original-retail" };
    state.retailPromotionRewards[retail.rewardId] = retail;
    state.creditEntries["original-credit"] = { creditEntryId: "original-credit", memberId: "source-member", amount: 100, remainingAmount: 0,
      sourceType: "manual", sourceReference: "original-grant", issuedAt: "2026-08-01T00:00:00Z", expiresAt: "2026-09-30T00:00:00Z",
      status: "consumed", createdAt: "2026-08-01T00:00:00Z", metadata: {} };
    state.creditReservations["original-reservation"] = { reservationId: "original-reservation", memberId: "source-member", orderId: String(source.orderNumber),
      amount: 100, requestedAmount: 140, status: "consumed", allocations: [{ creditEntryId: "original-credit", amount: 100 }],
      createdAt: completedAt, updatedAt: completedAt };
    const stateBefore = structuredClone(state), preparedBefore = structuredClone(prepared);
    const economics = resolveOriginalCommerceEconomicEvidence({ order: prepared, state });
    if (economics.status !== "resolved") assert.fail(JSON.stringify(economics));
    for (const kind of ["valid_consumption", "self_purchase_paid_consumption", "referral_paid_basis", "retail_promotion_eligible_merchandise", "retail_promotion_calculation"]) {
      await test(`${kind} uses exact original total and stable lines`, () => {
        const evidence = economics.monetaryAuthorities.find(item => item.kind === kind);
        assert.equal(evidence?.status, "resolved");
        if (evidence?.status === "resolved") { assert.equal(evidence.authoritativeTotal, 100); assert.deepEqual(evidence.lines.map(item => item.rewardEconomicContribution), [50, 50]); }
      });
    }
    await test("existing qualification round remains linked without recomputation", () => assert.equal(economics.dependencyLinks.rounds[0].roundId, Object.values(state.qualificationRounds)[0].roundId));
    await test("Coverage/Maturation and prior self-purchase tier keep original identities and policy fingerprints", () => {
      const linked = structuredClone(state), round = Object.values(linked.qualificationRounds)[0];
      linked.referralRewardCoverages["original-coverage"] = { coverageId: "original-coverage", memberId: event.memberId,
        qualificationRoundId: round.roundId, referralRewardId: referral.rewardId, qualificationAt: completedAt, rewardGeneratedAt: completedAt,
        coverageStartsAt: completedAt, coverageEndsAt: completedAt, lookbackDays: 0, forwardDays: 0, rulesVersion: 2,
        inclusionReason: "reward-generated-within-snapshotted-coverage-window", createdAt: completedAt,
        sourceReference: "original-coverage", idempotencyKey: "original-coverage" };
      linked.referralRewardMaturations["original-maturation"] = { maturationId: "original-maturation", memberId: event.memberId,
        referralRewardId: referral.rewardId, coverageId: "original-coverage", qualificationRoundId: round.roundId, qualificationAt: completedAt,
        baseWaitingDays: 0, returnProtectionDays: 7, maturesAt: completedAt, maturedAt: completedAt, rulesVersion: 2,
        createdAt: completedAt, sourceReference: "original-maturation", idempotencyKey: "original-maturation" };
      const tierRules = rules.referral.selfPurchaseRewardTiers;
      const result = calculateSelfPurchaseTierReward({ priorAmount: 100, currentAmount: 100, calculationMethod: tierRules.calculationMethod, tiers: tierRules.tiers });
      const { enabled: _enabled, ...preservedTierRules } = tierRules;
      assert.equal(typeof _enabled, "boolean");
      const tierSnapshot = { featureEnabled: true as const, rules: preservedTierRules,
        payout: { calculationMode: "paid_amount" as const, pvRewardMoneyValue: 1, moneyRoundingMode: rules.money.roundingMode },
        windowStartedAt: completedAt, windowEndedAt: completedAt,
        initialEvidence: [{ validConsumptionEventId: event.eventId, sourceOrderId: String(source.orderNumber), finalizedAt: completedAt, thresholdAmount: 100, role: "prior" as const }],
        latestEvidence: [{ validConsumptionEventId: event.eventId, sourceOrderId: String(source.orderNumber), finalizedAt: completedAt, thresholdAmount: 100, role: "prior" as const }],
        initialResult: result, latestResult: result };
      linked.referralRewards["later-tier"] = { ...referral, rewardId: "later-tier", sourceOrderNumber: "later-source-order", rewardType: "self_purchase", selfPurchaseTierSnapshot: tierSnapshot };
      const before = structuredClone(linked), evidence = resolveOriginalCommerceEconomicEvidence({ order: prepared, state: linked });
      if (evidence.status !== "resolved") assert.fail(JSON.stringify(evidence));
      assert.deepEqual(evidence.dependencyLinks.coverages, [{ coverageId: "original-coverage", fingerprint: originalEconomicFingerprint(linked.referralRewardCoverages["original-coverage"]) }]);
      assert.equal(evidence.dependencyLinks.maturations[0].maturationId, "original-maturation");
      assert.deepEqual(evidence.dependencyLinks.selfPurchaseTiers, [{ rewardId: "later-tier", fingerprint: originalEconomicFingerprint(tierSnapshot) }]);
      assert.deepEqual(linked, before);
    });
    await test("actual consumed credit references and original expiry preserved", () => {
      assert.equal(economics.redemptionLinkage.status, "resolved");
      if (economics.redemptionLinkage.status === "resolved") assert.deepEqual(economics.redemptionLinkage.allocations,
        [{ creditEntryId: "original-credit", amount: 100, expiresAt: "2026-09-30T00:00:00Z" }]);
    });
    await test("read-only bridge does not restore expired original credit or change any commerce state", () => { assert.deepEqual(state, stateBefore); assert.deepEqual(prepared, preparedBefore); });
    await test("qualification gross consumption is distinct from paid tier contribution", () => {
      const grossState = structuredClone(state); const consumption = grossState.validConsumptionEvents[event.eventId];
      consumption.includeCreditDiscount = true; consumption.qualificationRulesSnapshot.validConsumption.includeCreditDiscount = true; consumption.validConsumptionAmount = 200;
      const evidence = resolveOriginalCommerceEconomicEvidence({ order: prepared, state: grossState });
      assert.equal(evidence.status, "resolved"); if (evidence.status !== "resolved") return;
      const gross = evidence.monetaryAuthorities.find(item => item.kind === "valid_consumption"), paid = evidence.monetaryAuthorities.find(item => item.kind === "self_purchase_paid_consumption");
      assert.equal(gross?.status === "resolved" && gross.authoritativeTotal, 200); assert.equal(paid?.status === "resolved" && paid.authoritativeTotal, 100);
    });
    await test("non-merchandise consumption is not guessed into product contribution", () => {
      const shippingState = structuredClone(state); const consumption = shippingState.validConsumptionEvents[event.eventId];
      consumption.includeShipping = true; consumption.qualificationRulesSnapshot.validConsumption.includeShipping = true;
      consumption.shippingAmount = 60; consumption.validConsumptionAmount = 160;
      const evidence = resolveOriginalCommerceEconomicEvidence({ order: prepared, state: shippingState });
      if (evidence.status !== "resolved") assert.fail(JSON.stringify(evidence));
      assert.equal(evidence.monetaryAuthorities.find(item => item.kind === "valid_consumption")?.status, "manual_review_required");
    });
    await test("contradictory consumption evidence stays manual", () => {
      const corrupt = structuredClone(state); corrupt.validConsumptionEvents[event.eventId].appliedCreditAmount = 140;
      const evidence = resolveOriginalCommerceEconomicEvidence({ order: prepared, state: corrupt });
      if (evidence.status !== "resolved") assert.fail(JSON.stringify(evidence));
      assert.equal(evidence.monetaryAuthorities.find(item => item.kind === "valid_consumption")?.status, "manual_review_required");
    });
    await test("missing credit entry link stays manual and never creates credit", () => {
      const incomplete = structuredClone(state); incomplete.creditEntries = {};
      const evidence = resolveOriginalCommerceEconomicEvidence({ order: prepared, state: incomplete });
      if (evidence.status !== "resolved") assert.fail(JSON.stringify(evidence));
      assert.equal(evidence.redemptionLinkage.status, "manual_review_required"); assert.deepEqual(incomplete.creditEntries, {});
    });
    await test("HOLD projection unchanged by repeated evidence resolution", () => {
      const ref = { program: "referral" as const, id: referral.rewardId }, before = projectReturnRewardHolds(state, ref);
      resolveOriginalCommerceEconomicEvidence({ order: prepared, state }); assert.deepEqual(projectReturnRewardHolds(state, ref), before);
    });
    await test("PV-based reward preserves monetary and PV authority separately", () => {
      const pvState = structuredClone(state); pvState.referralRewards[referral.rewardId].calculationMode = "pv";
      pvState.referralRewards[referral.rewardId].effectivePV = 9;
      const evidence = resolveOriginalCommerceEconomicEvidence({ order: prepared, state: pvState });
      if (evidence.status !== "resolved") assert.fail(JSON.stringify(evidence));
      assert.equal(evidence.monetaryAuthorities.find(item => item.kind === "referral_paid_basis")?.status, "resolved");
      assert.equal(pvState.referralRewards[referral.rewardId].effectivePV, 9);
    });
    await test("no reward records is normal and does not invalidate transaction evidence", () => {
      const empty = structuredClone(state); empty.referralRewards = {}; empty.retailPromotionRewards = {}; empty.validConsumptionEvents = {};
      const evidence = resolveOriginalCommerceEconomicEvidence({ order: prepared, state: empty });
      if (evidence.status !== "resolved") assert.fail(JSON.stringify(evidence)); assert.deepEqual(evidence.monetaryAuthorities, []);
    });
    await test("original authority fingerprint preserves rate/policy identity without recalculating payout", () => {
      const evidence = economics.monetaryAuthorities.find(item => item.kind === "referral_paid_basis");
      assert.equal(evidence?.authorityFingerprint, originalEconomicFingerprint(referral)); assert.equal(referral.calculatedCreditAmount, 10);
    });
    await test("commerce JSON/reordered identity maps produce identical evidence", () => {
      const reordered = JSON.parse(JSON.stringify(state));
      reordered.referralRewards = Object.fromEntries(Object.entries(reordered.referralRewards).reverse());
      reordered.validConsumptionEvents = Object.fromEntries(Object.entries(reordered.validConsumptionEvents).reverse());
      assert.deepEqual(resolveOriginalCommerceEconomicEvidence({ order: prepared, state: reordered }), economics);
    });
    await test("protected repository runtime files remain byte-identical", async () => assert.deepEqual(await Promise.all(protectedFiles.map(bytes)), protectedBefore));
    console.log(`J.6F.1D0 economic allocation: ${count}/${count} PASS`);
  } finally {
    if (previousRoot === undefined) delete process.env.KD_DATA_DIR; else process.env.KD_DATA_DIR = previousRoot;
    const resolvedRoot = path.resolve(root), prefix = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(resolvedRoot.startsWith(prefix)); await fs.rm(resolvedRoot, { recursive: true, force: true });
  }
}
