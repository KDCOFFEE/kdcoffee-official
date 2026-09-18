import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j5d6a-a3-"));
process.env.KD_DATA_DIR = root;

const rulesApi = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");

let checks = 0;

function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
}

let sequence = 0;

function nextOrderId() {
  sequence += 1;
  return `KD20260918-${String(9000 + sequence)}`;
}

async function createContext(input: {
  basis: "money" | "pv";
  mode?: "general" | "subscription" | "either" | "both";
  generalMoney?: number;
  subscriptionMoney?: number;
  generalPV?: number;
  subscriptionPV?: number;
  activeSubscription?: boolean;
}) {
  sequence += 1;

  const directory = path.join(root, `context-${sequence}`);
  const stateFilePath = path.join(directory, "commerce-state.json");
  const rulesFilePath = path.join(directory, "business-rules.json");

  await fs.mkdir(directory, { recursive: true });

  const rules = structuredClone(rulesApi.DEFAULT_MEMBERSHIP_RULES);

  rules.referral.payoutQualification.mode = input.mode ?? "either";
  rules.referral.payoutQualification.qualificationBasis = input.basis;

  rules.referral.payoutQualification.generalMember.rollingWindowDays = 30;
  rules.referral.payoutQualification.activeSubscriptionMember.rollingWindowDays = 30;

  rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold =
    input.generalMoney ?? 1500;

  rules.referral.payoutQualification.activeSubscriptionMember.cumulativeValidConsumptionThreshold =
    input.subscriptionMoney ?? 1000;

  rules.referral.payoutQualification.generalMember.cumulativeValidPVThreshold =
    input.generalPV ?? 800;

  rules.referral.payoutQualification.activeSubscriptionMember.cumulativeValidPVThreshold =
    input.subscriptionPV ?? 600;

  rules.referral.payoutQualification.excessConsumptionMode = "reset";

  await rulesApi.saveMembershipBusinessRules(
    {
      expectedRevision: 0,
      rules,
      now: new Date("2026-09-01T00:00:00.000Z"),
    },
    rulesFilePath,
  );

  const state = await commerce.readMembershipCommerceState(stateFilePath);

  if (input.activeSubscription) {
    state.subscriptions["sub-test"] = {
      subscriptionId: "sub-test",
      memberId: "member-test",
      status: "active",
      startedFromOrderId: "KD-SEED",
      anchorDate: "2026-09-01",
      intervalDays: 30,
      shippingMethod: "studio_pickup",
      storeSelection: null,
      defaultItems: [],
      rulesVersion: 1,
      statusReason: "A3 regression test",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      revision: 0,
    };

    await fs.writeFile(
      stateFilePath,
      `${JSON.stringify(state, null, 2)}\n`,
      "utf8",
    );
  }

  return {
    stateFilePath,
    rulesFilePath,
  };
}

async function writeCompletedOrder(input: {
  subtotal: number;
  effectivePV: number;
  quantity?: number;
}) {
  const orderId = nextOrderId();
  const ordersDir = path.join(root, "orders");

  await fs.mkdir(ordersDir, { recursive: true });

  const quantity = input.quantity ?? 1;

  const order = {
    orderNumber: orderId,
    createdAt: "2026-09-18T00:00:00.000Z",
    status: "completed",
    orderMode: "studio_pickup",
    subtotal: input.subtotal,
    shipping: 0,
    total: input.subtotal,
    member: {
      memberId: "member-test",
    },
    items: [
      {
        slug: "a3-test-product",
        name: "A3 Test Product",
        optionId: "half-pound",
        optionLabel: "半磅",
        unitPrice: input.subtotal / quantity,
        quantity,
        lineTotal: input.subtotal,
        pvEnabled: true,
        basePV: input.effectivePV,
        effectivePV: input.effectivePV,
        discountRatio: 1,
      },
    ],
  };

  await fs.writeFile(
    path.join(ordersDir, `${orderId}.json`),
    `${JSON.stringify(order, null, 2)}\n`,
    "utf8",
  );

  return orderId;
}

async function completeConsumption(
  ctx: {
    stateFilePath: string;
    rulesFilePath: string;
  },
  orderId: string,
  now: string,
) {
  return commerce.recordValidConsumptionFromCompletedOrder({
    memberId: "member-test",
    orderId,
    idempotencyKey: `a3:${orderId}`,
    now: new Date(now),
    stateFilePath: ctx.stateFilePath,
    rulesFilePath: ctx.rulesFilePath,
  });
}

async function latestState(stateFilePath: string) {
  return commerce.readMembershipCommerceState(stateFilePath);
}

try {
  console.log("");
  console.log("=== CASE 1 MONEY MODE ===");

  {
    const ctx = await createContext({
      basis: "money",
      mode: "general",
      generalMoney: 1500,
      generalPV: 800,
    });

    const orderId = await writeCompletedOrder({
      subtotal: 1600,
      effectivePV: 100,
    });

    const result = await completeConsumption(
      ctx,
      orderId,
      "2026-09-18T01:00:00.000Z",
    );

    check(
      result?.event.validConsumptionAmount === 1600,
      "money mode stores valid consumption amount",
    );

    check(
      result?.event.validConsumptionPV === 100,
      "money mode still stores product KD points",
    );

    check(
      result?.qualificationRound?.finalQualified === true,
      "money mode qualifies from NT$ threshold even when KD points are low",
    );

    check(
      result?.qualificationRound?.qualificationBasis === "money",
      "qualification round snapshots money basis",
    );
  }

  console.log("");
  console.log("=== CASE 2 PV MODE BELOW THRESHOLD ===");

  {
    const ctx = await createContext({
      basis: "pv",
      mode: "general",
      generalMoney: 1500,
      generalPV: 800,
    });

    const orderId = await writeCompletedOrder({
      subtotal: 5000,
      effectivePV: 600,
    });

    const result = await completeConsumption(
      ctx,
      orderId,
      "2026-09-18T02:00:00.000Z",
    );

    check(
      result?.event.validConsumptionAmount === 5000,
      "PV mode still stores monetary consumption evidence",
    );

    check(
      result?.event.validConsumptionPV === 600,
      "PV mode stores 600 product KD points",
    );

    check(
      result?.qualificationRound === null,
      "high purchase amount does not qualify when KD points are below 800",
    );
  }

  console.log("");
  console.log("=== CASE 3 PV MODE CUMULATIVE QUALIFICATION ===");

  {
    const ctx = await createContext({
      basis: "pv",
      mode: "general",
      generalPV: 800,
    });

    const firstOrder = await writeCompletedOrder({
      subtotal: 1200,
      effectivePV: 600,
    });

    const first = await completeConsumption(
      ctx,
      firstOrder,
      "2026-09-18T03:00:00.000Z",
    );

    check(
      first?.qualificationRound === null,
      "first 600 KD points remain below 800 threshold",
    );

    const secondOrder = await writeCompletedOrder({
      subtotal: 500,
      effectivePV: 200,
    });

    const second = await completeConsumption(
      ctx,
      secondOrder,
      "2026-09-18T04:00:00.000Z",
    );

    check(
      second?.qualificationRound?.finalQualified === true,
      "600 + 200 KD points qualify at 800",
    );

    check(
      second?.qualificationRound?.generalPath.cumulativeAmount === 800,
      "qualification uses cumulative KD points rather than purchase amount",
    );

    check(
      second?.qualificationRound?.generalPath.threshold === 800,
      "general KD-point threshold snapshot is 800",
    );
  }

  console.log("");
  console.log("=== CASE 4 OWNER SWITCHES MONEY TO PV ===");

  {
    const ctx = await createContext({
      basis: "money",
      mode: "general",
      generalMoney: 999999,
      generalPV: 800,
    });

    const firstOrder = await writeCompletedOrder({
      subtotal: 1000,
      effectivePV: 600,
    });

    const first = await completeConsumption(
      ctx,
      firstOrder,
      "2026-09-18T05:00:00.000Z",
    );

    check(
      first?.qualificationRound === null,
      "first order remains unqualified under high money threshold",
    );

    const store = await rulesApi.readMembershipRulesStore(ctx.rulesFilePath);
    const changedRules = structuredClone(store.versions.at(-1)!.rules);

    changedRules.referral.payoutQualification.qualificationBasis = "pv";
    changedRules.referral.payoutQualification.generalMember.cumulativeValidPVThreshold = 800;

    await rulesApi.saveMembershipBusinessRules(
      {
        expectedRevision: store.revision,
        rules: changedRules,
        now: new Date("2026-09-18T05:30:00.000Z"),
      },
      ctx.rulesFilePath,
    );

    const secondOrder = await writeCompletedOrder({
      subtotal: 300,
      effectivePV: 200,
    });

    const second = await completeConsumption(
      ctx,
      secondOrder,
      "2026-09-18T06:00:00.000Z",
    );

    check(
      second?.qualificationRound?.finalQualified === true,
      "after Owner switches to KD points, earlier stored KD points still count",
    );

    check(
      second?.qualificationRound?.generalPath.cumulativeAmount === 800,
      "basis switch correctly uses 600 historical + 200 new KD points",
    );

    check(
      second?.qualificationRound?.qualificationBasis === "pv",
      "new qualification round snapshots PV basis",
    );
  }

  console.log("");
  console.log("=== CASE 5 ACTIVE SUBSCRIPTION LOWER PV THRESHOLD ===");

  {
    const ctx = await createContext({
      basis: "pv",
      mode: "either",
      generalPV: 800,
      subscriptionPV: 600,
      activeSubscription: true,
    });

    const orderId = await writeCompletedOrder({
      subtotal: 900,
      effectivePV: 600,
    });

    const result = await completeConsumption(
      ctx,
      orderId,
      "2026-09-18T07:00:00.000Z",
    );

    check(
      result?.qualificationRound?.finalQualified === true,
      "active subscription member qualifies at lower 600 KD-point threshold",
    );

    check(
      result?.qualificationRound?.generalPath.passed === false,
      "600 KD points do not satisfy general 800 threshold",
    );

    check(
      result?.qualificationRound?.subscriptionPath.passed === true,
      "600 KD points satisfy active-subscription threshold",
    );

    check(
      result?.qualificationRound?.selectedAccountingPaths.includes("subscription") === true,
      "either mode selects subscription qualification path",
    );
  }

  console.log("");
  console.log(`J.5D.6A A3.4 PASS — ${checks}/${checks} checks passed`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}