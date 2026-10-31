import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  snapshotReturnLineEvidence, resolveReturnLineEvidence, prepareOrderCompletionWrite,
  assertOrderCompletionPreserved, returnDeadlineAtTaipeiDayEnd, type OrderCompletionSnapshot,
} from "../lib/orderCompletion";
import { withOrderFileUpdateLock } from "../lib/orderFiles";
import {
  readMembershipCommerceState, recordValidConsumptionFromCompletedOrder, reconcileReferralRewardCoverage,
  processReferralRewardMaturations, resolveRewardDependencyEvidence,
  type ReferralReward, type RetailPromotionReward, type RewardDependencyEvidenceResult,
} from "../lib/membershipCommerce";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } from "../lib/membershipBusinessRules";
import { calculateSelfPurchaseTierReward } from "../lib/selfPurchaseRewardTiers";

// A fresh process proves the line reference does not depend on process state.
if (process.argv[2] === "--line-worker") {
  process.stdout.write(JSON.stringify(snapshotReturnLineEvidence(JSON.parse(process.argv[3]))));
} else {
  const suiteRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f1a-evidence-"));
  const previousRoot = process.env.KD_DATA_DIR;
  process.env.KD_DATA_DIR = suiteRoot;
  let count = 0;
  const test = async (label: string, run: () => unknown | Promise<unknown>) => {
    await run(); count++; console.log(`PASS ${String(count).padStart(2, "0")} ${label}`);
  };
  const originalTime = "2026-09-25T02:00:00.000Z";
  const completedAt = "2026-09-26T06:00:00.000Z";
  const coffee = { slug: "coffee", optionId: "sku-a", name: "Original coffee", quantity: 2, unitPrice: 700, lineTotal: 1400 };
  const order = { orderNumber: "KD20260925-1001", createdAt: originalTime, status: "completed", orderMode: "studio_pickup",
    items: [coffee, { ...coffee, quantity: 1, lineTotal: 700 }], subtotal: 2100, shipping: 0, total: 2100,
    fulfillmentEvents: [{ eventId: "ful-original", state: "completed", occurredAt: completedAt }] };
  function resolvedLines(value = snapshotReturnLineEvidence(order)) {
    if (value.status !== "resolved") assert.fail(value.reason);
    return value;
  }
  function resolvedReward(value: RewardDependencyEvidenceResult) {
    if (value.status !== "resolved") assert.fail(value.reason);
    return value;
  }
  try {
    const rulesFile = path.join(suiteRoot, "membership-commerce", "business-rules.json");
    const stateFile = path.join(suiteRoot, "membership-commerce", "commerce-state.json");
    const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES);
    rules.referral.payoutQualification.mode = "general";
    rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 1;
    await saveMembershipBusinessRules({ expectedRevision: 0, rules, now: new Date("2026-08-01T00:00:00Z") }, rulesFile);
    const initial = structuredClone(order);
    const evidence = resolvedLines();
    await test("same preserved order yields deterministic line references", () => assert.deepEqual(snapshotReturnLineEvidence(order), evidence));
    await test("duplicate SKU lines have distinct references", () => assert.notEqual(evidence.lines[0].returnLineRef, evidence.lines[1].returnLineRef));
    await test("duplicate lines remain individually addressable", () => assert.equal(new Map(evidence.lines.map(line => [line.returnLineRef, line])).size, 2));
    await test("quantity-one future reference retains original quantity two", () => {
      const selection = { returnLineRef: evidence.lines[0].returnLineRef, quantity: 1 };
      assert.equal(evidence.lines.find(line => line.returnLineRef === selection.returnLineRef)?.originalQuantity, 2);
    });
    await test("identical quantities and full snapshots still distinguish duplicate ordinals", () => {
      const lines = resolvedLines(snapshotReturnLineEvidence({ ...order, items: [coffee, coffee] })).lines;
      assert.notEqual(lines[0].returnLineRef, lines[1].returnLineRef);
    });
    await test("Coffee legacy IDs are sufficient without canonical product IDs", () => assert.equal(evidence.lines[0].snapshot.optionId, "sku-a"));
    const store = { domain: "store", productId: "store-a", variantId: "default", sku: "STORE-A", name: "Store", quantity: 2, unitPrice: 99, lineTotal: 198 };
    await test("Store V1 lines resolve", () => assert.equal(resolvedLines(snapshotReturnLineEvidence({ ...order, items: [store] })).lines[0].snapshot.domain, "store"));
    await test("Coffee V1 lines resolve", () => assert.equal(resolvedLines(snapshotReturnLineEvidence({ ...order, items: [{ ...coffee, domain: "coffee", productId: "coffee-id", variantId: "sku-a" }] })).lines.length, 1));
    await test("subscription drip item identity is preserved", () => assert.equal(resolvedLines(snapshotReturnLineEvidence({ ...order, items: [{ itemId: "drip-item", productId: "coffee", skuId: "drip-sku", quantity: 2, unitPrice: 60 }] })).lines[0].snapshot.itemId, "drip-item"));
    const bean = { itemId: "bean-item", packageWeight: "one-pound", components: [{ productId: "a", skuId: "a-sku", weightHalfPounds: 1 }, { productId: "b", skuId: "b-sku", weightHalfPounds: 1 }], quantity: 2, unitPrice: 1200, lineTotal: 2400 };
    await test("subscription bean composition is preserved", () => assert.deepEqual(resolvedLines(snapshotReturnLineEvidence({ ...order, items: [bean] })).lines[0].snapshot.components, bean.components));
    for (const [label, item] of [["name alone", { name: "Coffee" }], ["SKU alone", { sku: "sku-a" }], ["product alone", { productId: "a" }]] as const) {
      await test(`${label} fails closed without catalog lookup`, () => assert.equal(snapshotReturnLineEvidence({ ...order, items: [{ ...item, quantity: 1, unitPrice: 10 }] }).status, "manual_review_required"));
    }
    for (const quantity of [0, -1, 0.5, Number.NaN]) await test(`invalid quantity ${quantity} requires manual review`, () => assert.equal(snapshotReturnLineEvidence({ ...order, items: [{ ...coffee, quantity }] }).status, "manual_review_required"));
    await test("missing original value requires manual review", () => assert.equal(snapshotReturnLineEvidence({ ...order, items: [{ slug: "a", optionId: "b", quantity: 1 }] }).status, "manual_review_required"));
    await test("original transaction unit price and total are preserved", () => { assert.equal(evidence.lines[0].snapshot.unitPrice, 700); assert.equal(evidence.lines[0].snapshot.lineTotal, 1400); });
    await test("PV is optional and not synthesized", () => assert.equal(Object.hasOwn(evidence.lines[0].snapshot, "basePV"), false));
    await test("PV when applicable is preserved", () => assert.equal(resolvedLines(snapshotReturnLineEvidence({ ...order, items: [{ ...coffee, basePV: 20, effectivePV: 18 }] })).lines[0].snapshot.effectivePV, 18));
    await test("PV-not-applicable and no-reward order remains valid", () => assert.equal(snapshotReturnLineEvidence({ ...order, items: [{ ...store, pvApplicable: false }] }).status, "resolved"));
    await test("order-level discounts and credit retain original transaction evidence", () => {
      const value = resolvedLines(snapshotReturnLineEvidence({ ...order, pricingSnapshot: { selectedPriceSource: "subscription", finalAmount: 1900 }, credit: { appliedAmount: 200 } }));
      assert.deepEqual(value.transactionSnapshot.credit, { appliedAmount: 200 });
      assert.deepEqual(value.transactionSnapshot.pricingSnapshot, { finalAmount: 1900, selectedPriceSource: "subscription" });
    });
    const prepared = await prepareOrderCompletionWrite({ ...order, status: "ready_for_pickup", fulfillmentEvents: [] }, order);
    const completion = prepared.completion as OrderCompletionSnapshot;
    await test("new completion persists line evidence at shared boundary", () => assert.deepEqual(resolveReturnLineEvidence(prepared), evidence));
    for (const [field, expected] of Object.entries({ eventId: "ful-original", completedAt,
      returnProtectionDaysSnapshot: rules.referral.referralRewardReturnProtectionDays, rulesVersion: 2,
      returnDeadline: returnDeadlineAtTaipeiDayEnd(completedAt, rules.referral.referralRewardReturnProtectionDays) })) {
      await test(`completion preserves ${field}`, () => assert.equal(completion[field as keyof OrderCompletionSnapshot], expected));
    }
    await test("top-level completion time preserved", () => assert.equal(prepared.completedAt, completedAt));
    await test("end-of-day Taipei semantics unchanged", () => assert.equal(returnDeadlineAtTaipeiDayEnd("2026-12-31T18:00:00Z", 0), "2027-01-01T15:59:59.999Z"));
    await test("catalog and current order price changes cannot alter frozen lines", () => assert.deepEqual(resolveReturnLineEvidence({ ...prepared, items: [{ ...coffee, unitPrice: 750, name: "Renamed" }] }), evidence));
    await test("reads after JSON roundtrip preserve references", () => assert.deepEqual(resolveReturnLineEvidence(JSON.parse(JSON.stringify(prepared))), evidence));
    await test("key order does not change normalized fingerprint", () => assert.deepEqual(snapshotReturnLineEvidence({ ...order, items: order.items.map(item => Object.fromEntries(Object.entries(item).reverse())) }), evidence));
    await test("new process generates the same references", () => {
      const worker = spawnSync(process.execPath, ["--experimental-strip-types", "--import", "./scripts/return-workflow-test-bootstrap.mjs", fileURLToPath(import.meta.url), "--line-worker", JSON.stringify(order)], { encoding: "utf8", windowsHide: true });
      assert.equal(worker.status, 0, worker.stderr); assert.deepEqual(JSON.parse(worker.stdout), evidence);
    });
    for (const status of ["cancelled", "returned", "refunded", "processing", "shipped", "ready_for_pickup"]) await test(`terminal guard blocks ${status}`, () => assert.throws(() => assertOrderCompletionPreserved(prepared, { ...prepared, status })));
    await test("completion evidence cannot be edited", () => assert.throws(() => assertOrderCompletionPreserved(prepared, { ...prepared, completion: { ...completion, returnLines: undefined } })));
    await test("tampered line reference requires manual review", () => {
      const changed = structuredClone(prepared); const saved = (changed.completion as OrderCompletionSnapshot).returnLines;
      if (saved?.status === "resolved") saved.lines[0].returnLineRef = "forged";
      assert.equal(resolveReturnLineEvidence(changed).status, "manual_review_required");
    });
    await test("historical completed order is never backfilled or mutated", async () => {
      const historical = { ...order, completedAt, completion: { ...completion, returnLines: undefined } };
      const before = JSON.stringify(historical);
      const updated = await prepareOrderCompletionWrite(historical, historical);
      assert.equal(JSON.stringify(updated), before); assert.equal(resolveReturnLineEvidence(updated).status, "manual_review_required");
    });
    await test("historical missing canonical IDs require explicit manual review", () => assert.equal(resolveReturnLineEvidence({ status: "completed", items: [{ name: "Old", quantity: 2 }] }).status, "manual_review_required"));
    await test("input order remains unchanged", () => assert.deepEqual(order, initial));
    const orderDir = path.join(suiteRoot, "orders"); await fs.mkdir(orderDir);
    await fs.writeFile(path.join(orderDir, order.orderNumber + ".json"), JSON.stringify({ ...order, status: "ready_for_pickup", fulfillmentEvents: [] }));
    await test("locked persistence integrates the additive completion evidence", async () => {
      const saved = await withOrderFileUpdateLock(orderDir, order.orderNumber, async (latest, persist) => persist({ ...latest, status: "completed", fulfillmentEvents: order.fulfillmentEvents }));
      assert.deepEqual(resolveReturnLineEvidence(saved), evidence);
      await assert.rejects(() => withOrderFileUpdateLock(orderDir, order.orderNumber, async (latest, persist) => persist({ ...latest, completion: {} })));
    });

    // Real isolated consumption / Round / Coverage / Maturation evidence, no production reads.
    const sourceId = "KD20260925-2001", qualifyingId = "KD20260925-2002";
    for (const [orderNumber, memberId] of [[sourceId, "actor-source"], [qualifyingId, "actor-beneficiary"]]) {
      await fs.writeFile(path.join(orderDir, orderNumber + ".json"), JSON.stringify({ ...order, orderNumber, member: { memberId } }));
      await recordValidConsumptionFromCompletedOrder({ memberId, orderId: orderNumber, idempotencyKey: `consumption:${orderNumber}`, now: new Date(completedAt), stateFilePath: stateFile, rulesFilePath: rulesFile });
    }
    let state = await readMembershipCommerceState(stateFile);
    const reward = (rewardId: string, extra: Partial<ReferralReward> = {}): ReferralReward => ({ rewardId,
      sourceOrderNumber: sourceId, sourceMemberId: "actor-source", beneficiaryMemberId: "actor-beneficiary",
      referralLevel: 1, rewardType: "new_referral", calculationMode: "paid_amount", paidAmountBasis: 2100,
      basePV: 0, discountRatio: 1, effectivePV: 0, rewardRate: 5, rewardPV: 0, pvRewardMoneyValue: 1,
      calculatedCreditAmount: 105, projectedCreditAmount: 105, ruleVersion: 2, ancestrySnapshot: ["actor-beneficiary"],
      sourceOrderFinalState: "completed", createdAt: completedAt, eligibleAt: completedAt, scheduledReleaseAt: "",
      releasedAt: null, status: "scheduled", reversalCreditEntryId: null, rewardCreditEntryId: null,
      idempotencyKey: `reward:${rewardId}`, ...extra });
    state.referralRewards.legacy = reward("legacy", { qualificationStatus: "qualified", qualificationOrderNumber: qualifyingId,
      qualificationOrderCreatedAt: originalTime, qualificationOrderFinalState: "completed", qualificationQualifiedAt: completedAt,
      qualificationAttempts: [{ orderNumber: qualifyingId, orderCreatedAt: originalTime, orderType: "normal", status: "completed", finalState: "completed", finalizedAt: completedAt }] });
    state.referralRewards.coverage = reward("coverage", { qualificationAuthority: "qualification_coverage" });
    state.referralRewards.self = reward("self", { rewardType: "self_purchase", referralLevel: 0,
      beneficiaryMemberId: "actor-source", qualificationAuthority: "self_purchase_direct", qualificationStatus: "qualified" });
    const retail: RetailPromotionReward = { rewardId: "retail", sourceOrderNumber: sourceId, beneficiaryMemberId: "actor-beneficiary",
      referralCode: "fixture", attributedAt: originalTime, attributionExpiresAt: completedAt, attributionSource: "member-share-link",
      eligibleMerchandiseAmount: 2100, calculatedCreditAmount: 105, rewardRate: 5, ruleVersion: 2,
      roundingModeSnapshot: "round-half-up", baseWaitingDaysSnapshot: 7, returnProtectionDaysSnapshot: 7, totalWaitingDaysSnapshot: 14,
      reversalPolicySnapshot: "cancel-pending-and-reverse-released", successfulCompletionAt: completedAt,
      successfulPickupBusinessDate: "2026-09-26", releaseEligibleBusinessDate: "2026-10-10", createdAt: completedAt,
      releasedAt: null, sourceOrderFinalState: "completed", status: "scheduled", rewardCreditEntryId: null,
      reversalCreditEntryId: null, idempotencyKey: "retail-original" };
    state.retailPromotionRewards.retail = retail;
    await fs.writeFile(stateFile, JSON.stringify(state));
    await reconcileReferralRewardCoverage({ referralRewardId: "coverage", stateFilePath: stateFile });
    await processReferralRewardMaturations({ now: new Date("2026-10-15T00:00:00Z"), stateFilePath: stateFile, rulesFilePath: rulesFile });
    state = await readMembershipCommerceState(stateFile);
    const stateBefore = JSON.stringify(state), diskBefore = await fs.readFile(stateFile, "utf8");
    const readSourceOrder = async (orderId: string) => JSON.parse(await fs.readFile(path.join(orderDir, orderId + ".json"), "utf8"));
    const resolve = (rewardId: string, program: "referral" | "retail_promotion" = "referral", snapshot = state) => resolveRewardDependencyEvidence({ rewardId, program, state: snapshot, readSourceOrder });
    const legacy = resolvedReward(await resolve("legacy"));
    await test("legacy preserves original qualification order creation time", () => assert.equal(legacy.qualificationOrders[0].orderCreatedAt, originalTime));
    await test("legacy preserves reward source original creation time", () => assert.equal(legacy.sourceOrder.orderCreatedAt, originalTime));
    const coverage = resolvedReward(await resolve("coverage"));
    await test("Coverage resolves source and qualification order original times", () => { assert.equal(coverage.sourceOrder.orderCreatedAt, originalTime); assert.equal(coverage.qualificationOrders[0].orderCreatedAt, originalTime); });
    await test("Coverage preserves original consumption, Round, Coverage and Maturation identities", () => {
      assert.ok(coverage.consumptions.length >= 2); assert.ok(coverage.qualificationRound?.roundId); assert.ok(coverage.coverage?.coverageId); assert.ok(coverage.maturation?.maturationId);
    });
    await test("Coverage preserves existing policy and idempotency snapshots", () => { assert.deepEqual(coverage.reward, state.referralRewards.coverage); assert.ok(coverage.sourceReferences.length); assert.ok(coverage.idempotencyKeys.includes("reward:coverage")); });
    const self = resolvedReward(await resolve("self"));
    await test("self-purchase resolves original source/consumption evidence", () => { assert.equal(self.sourceOrder.orderCreatedAt, originalTime); assert.equal(self.authority, "self_purchase_direct"); assert.ok(self.sourceOrder.consumptionEventId); });
    const promotion = resolvedReward(await resolve("retail", "retail_promotion"));
    await test("retail resolves original source without PV qualification requirement", () => { assert.equal(promotion.sourceOrder.orderCreatedAt, originalTime); assert.deepEqual(promotion.reward, retail); assert.equal(promotion.authority, null); });
    const priorId = "KD20260920-3001";
    const priorTime = "2026-09-20T01:00:00Z", priorCompletion = "2026-09-21T01:00:00Z";
    const tierState = structuredClone(state);
    const sourceConsumption = Object.values(tierState.validConsumptionEvents).find(item => item.sourceOrderId === sourceId)!;
    const prior = { ...sourceConsumption, eventId: "prior-consumption", sourceOrderId: priorId,
      sourceReference: `completed-order:${priorId}`, finalizedAt: priorCompletion, createdAt: priorCompletion,
      idempotencyKey: "original-prior-consumption" };
    tierState.validConsumptionEvents[prior.eventId] = prior;
    const tierRules = rules.referral.selfPurchaseRewardTiers;
    const tierResult = calculateSelfPurchaseTierReward({ priorAmount: 200, currentAmount: 2100,
      calculationMethod: tierRules.calculationMethod, tiers: tierRules.tiers });
    const tierEvidence = [
      { validConsumptionEventId: prior.eventId, sourceOrderId: priorId, finalizedAt: priorCompletion, thresholdAmount: 200, role: "prior" as const },
      { validConsumptionEventId: sourceConsumption.eventId, sourceOrderId: sourceId, finalizedAt: completedAt, thresholdAmount: 2100, role: "current" as const },
    ];
    tierState.referralRewards.self.selfPurchaseTierSnapshot = { featureEnabled: true, rules: tierRules,
      payout: { calculationMode: "paid_amount", pvRewardMoneyValue: 1, moneyRoundingMode: "round-half-up" },
      windowStartedAt: priorTime, windowEndedAt: completedAt, initialEvidence: tierEvidence, latestEvidence: tierEvidence,
      initialResult: tierResult, latestResult: tierResult };
    const tierRead = async (id: string) => id === priorId
      ? { ...order, orderNumber: priorId, createdAt: priorTime, completedAt: priorCompletion, fulfillmentEvents: [] }
      : readSourceOrder(id);
    const tier = resolvedReward(await resolveRewardDependencyEvidence({ program: "referral", rewardId: "self", state: tierState, readSourceOrder: tierRead }));
    await test("dynamic self-purchase preserves initial/latest tier calculations without recomputation", () => assert.deepEqual((tier.reward as ReferralReward).selfPurchaseTierSnapshot, tierState.referralRewards.self.selfPurchaseTierSnapshot));
    await test("dynamic tier resolves prior consumption original order time", () => {
      assert.equal(tier.qualificationOrders.find(item => item.orderId === priorId)?.orderCreatedAt, priorTime);
      assert.ok(tier.consumptions.some(item => item.eventId === prior.eventId));
    });
    await test("missing prior tier consumption fails closed", async () => {
      const broken = structuredClone(tierState); delete broken.validConsumptionEvents[prior.eventId];
      assert.equal((await resolveRewardDependencyEvidence({ program: "referral", rewardId: "self", state: broken, readSourceOrder: tierRead })).status, "manual_review_required");
    });
    await test("credit identity and original ledger metadata are preserved", async () => {
      const credited = structuredClone(state);
      credited.referralRewards.self.rewardCreditEntryId = "credit-original";
      credited.creditEntries["credit-original"] = { creditEntryId: "credit-original", memberId: "actor-source",
        sourceType: "member_reward", sourceReference: "referral_reward:self", amount: 105, remainingAmount: 105,
        issuedAt: completedAt, createdAt: completedAt, expiresAt: "2027-09-26T00:00:00Z", status: "available", metadata: { rewardId: "self" } };
      const value = resolvedReward(await resolve("self", "referral", credited));
      assert.deepEqual(value.creditEntry, credited.creditEntries["credit-original"]);
      credited.creditEntries["credit-original"].sourceReference = "referral_reward:other";
      assert.equal((await resolve("self", "referral", credited)).status, "manual_review_required");
    });
    for (const context of ["return request", "review", "rejection", "withdrawal", "HOLD release", "scheduler execution"]) {
      await test(`${context} time cannot replace original qualification time`, async () => {
        // Ambient wall clock is later than the frozen 8/23–9/30 qualification period.
        const NativeDate = Date;
        class EvidenceDate extends NativeDate {
          constructor(value?: string | number) {
            if (value === undefined) throw new Error("Evidence resolution must not read the ambient clock");
            super(value);
          }
          static now(): number { throw new Error("Evidence resolution must not read Date.now"); }
        }
        globalThis.Date = EvidenceDate as DateConstructor;
        try { assert.deepEqual(await resolve("legacy"), legacy); assert.deepEqual(await resolve("coverage"), coverage); }
        finally { globalThis.Date = NativeDate; }
      });
    }
    await test("resolver is deterministic/idempotent", async () => assert.deepEqual(await resolve("coverage"), await resolve("coverage")));
    await test("resolver does not mutate state, rounds, ledger or persisted files", async () => { assert.equal(JSON.stringify(state), stateBefore); assert.equal(await fs.readFile(stateFile, "utf8"), diskBefore); });
    await test("returned output cannot mutate authoritative state", () => { coverage.reward.calculatedCreditAmount = 999; assert.equal(JSON.stringify(state), stateBefore); });
    await test("missing original source time never falls back to reward/review/completion time", async () => assert.equal((await resolveRewardDependencyEvidence({ rewardId: "coverage", program: "referral", state, readSourceOrder: async () => ({ orderNumber: sourceId, status: "completed", completedAt }) })).status, "manual_review_required"));
    await test("missing historical order is an explicit non-guessing result", async () => assert.equal((await resolveRewardDependencyEvidence({ rewardId: "retail", program: "retail_promotion", state, readSourceOrder: async () => null })).status, "manual_review_required"));
    await test("missing reward returns explicit manual review", async () => assert.equal((await resolve("absent")).status, "manual_review_required"));
    await test("missing Coverage cannot be replaced with legacy flags", async () => {
      const missing = structuredClone(state); missing.referralRewardCoverages = {}; missing.referralRewards.coverage.qualificationStatus = "qualified";
      assert.equal((await resolve("coverage", "referral", missing)).status, "manual_review_required");
    });
    await test("cross-order legacy pointer mismatch fails closed", async () => {
      const changed = structuredClone(state); changed.referralRewards.legacy.qualificationOrderCreatedAt = "2026-10-05T00:00:00Z";
      assert.equal((await resolve("legacy", "referral", changed)).status, "manual_review_required");
    });
    await test("role-neutral orders resolve without ordinary-member status", async () => {
      const value = await resolveRewardDependencyEvidence({ program: "referral", rewardId: "self", state,
        readSourceOrder: async orderId => ({ ...(await readSourceOrder(orderId)), member: undefined, actor: { id: "commercial-actor" } }) });
      assert.equal(value.status, "resolved");
    });
    await test("completion snapshot supplies original time even if loose source time is absent", async () => {
      const frozenSource = await prepareOrderCompletionWrite({ status: "ready_for_pickup" }, { ...order, orderNumber: sourceId });
      delete frozenSource.createdAt;
      const value = resolvedReward(await resolveRewardDependencyEvidence({ program: "referral", rewardId: "self", state,
        readSourceOrder: async () => frozenSource }));
      assert.equal(value.sourceOrder.orderCreatedAt, originalTime); assert.equal(value.sourceOrder.timeSource, "completion_snapshot");
    });
    await test("mismatched original source time and frozen completion evidence fail closed", async () => {
      const frozenSource = await prepareOrderCompletionWrite({ status: "ready_for_pickup" }, { ...order, orderNumber: sourceId });
      frozenSource.createdAt = "2026-10-05T00:00:00Z";
      assert.equal((await resolveRewardDependencyEvidence({ program: "referral", rewardId: "self", state,
        readSourceOrder: async () => frozenSource })).status, "manual_review_required");
    });
    await test("original 9/25 evidence remains inside 8/23–9/30 after later review", () => {
      const basis = Date.parse(legacy.qualificationOrders[0].orderCreatedAt);
      assert.ok(basis >= Date.parse("2026-08-23T00:00:00+08:00") && basis <= Date.parse("2026-09-30T23:59:59.999+08:00"));
    });
    console.log(`J.6F.1A focused: ${count}/${count} PASS; isolated fixtures only.`);
  } finally {
    if (previousRoot === undefined) delete process.env.KD_DATA_DIR; else process.env.KD_DATA_DIR = previousRoot;
    const resolved = path.resolve(suiteRoot);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
