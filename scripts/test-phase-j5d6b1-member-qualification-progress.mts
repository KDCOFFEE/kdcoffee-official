import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const root =
  await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "kd-j5d6b1-",
    ),
  );

process.env.KD_DATA_DIR = root;

const rulesApi =
  await import("../lib/membershipBusinessRules");

const commerce =
  await import("../lib/membershipCommerce");

let checks = 0;
let seq = 0;

function check(
  condition: unknown,
  label: string,
) {
  assert.ok(condition, label);
  checks += 1;

  console.log(
    `PASS ${String(checks).padStart(2, "0")} ${label}`,
  );
}

async function createContext(input: {
  basis: "money" | "pv";
  mode?: "general" | "subscription" | "either" | "both";
  generalThreshold?: number;
  subscriptionThreshold?: number;
  activeSubscription?: boolean;
  forwardDays?: number;
}) {
  seq += 1;

  const dir =
    path.join(root, `ctx-${seq}`);

  const stateFilePath =
    path.join(dir, "commerce-state.json");

  const rulesFilePath =
    path.join(dir, "business-rules.json");

  await fs.mkdir(dir, {
    recursive: true,
  });

  const rules =
    structuredClone(
      rulesApi.DEFAULT_MEMBERSHIP_RULES,
    );

  rules.referral.payoutQualification.mode =
    input.mode ?? "general";

  rules.referral.payoutQualification.qualificationBasis =
    input.basis;

  rules.referral.payoutQualification.generalMember.rollingWindowDays =
    30;

  rules.referral.payoutQualification.activeSubscriptionMember.rollingWindowDays =
    30;

  rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold =
    input.generalThreshold ?? 1500;

  rules.referral.payoutQualification.activeSubscriptionMember.cumulativeValidConsumptionThreshold =
    input.subscriptionThreshold ?? 1000;

  rules.referral.payoutQualification.generalMember.cumulativeValidPVThreshold =
    input.generalThreshold ?? 800;

  rules.referral.payoutQualification.activeSubscriptionMember.cumulativeValidPVThreshold =
    input.subscriptionThreshold ?? 600;

  rules.referral.payoutQualification.excessConsumptionMode =
    "reset";

  rules.referral.payoutQualification.rewardCoverage.forwardDays =
    input.forwardDays ?? 30;

  await rulesApi.saveMembershipBusinessRules(
    {
      expectedRevision: 0,
      rules,
      now: new Date(
        "2026-09-01T00:00:00.000Z",
      ),
    },
    rulesFilePath,
  );

  const state =
    await commerce.readMembershipCommerceState(
      stateFilePath,
    );

  if (input.activeSubscription) {
    state.subscriptions["sub-b1"] = {
      subscriptionId: "sub-b1",
      memberId: "member-test",
      status: "active",
      startedFromOrderId: "KD-SEED",
      anchorDate: "2026-09-01",
      intervalDays: 30,
      shippingMethod: "studio_pickup",
      storeSelection: null,
      defaultItems: [],
      rulesVersion: 1,
      statusReason: "B1 regression",
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

async function writeCompletedOrder(
  subtotal: number,
  effectivePV: number,
) {
  seq += 1;

  const orderId =
    `KD20260918-${9000 + seq}`;

  const ordersDir =
    path.join(root, "orders");

  await fs.mkdir(ordersDir, {
    recursive: true,
  });

  await fs.writeFile(
    path.join(
      ordersDir,
      `${orderId}.json`,
    ),
    `${JSON.stringify(
      {
        orderNumber: orderId,
        createdAt:
          "2026-09-18T00:00:00.000Z",
        status: "completed",
        orderMode: "studio_pickup",
        subtotal,
        shipping: 0,
        total: subtotal,
        member: {
          memberId: "member-test",
        },
        items: [
          {
            slug: "b1-test",
            name: "B1 Test",
            optionId: "half-pound",
            optionLabel: "半磅",
            unitPrice: subtotal,
            quantity: 1,
            lineTotal: subtotal,
            pvEnabled: true,
            basePV: effectivePV,
            effectivePV,
            discountRatio: 1,
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return orderId;
}

async function complete(
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
    idempotencyKey: `b1:${orderId}`,
    now: new Date(now),
    stateFilePath: ctx.stateFilePath,
    rulesFilePath: ctx.rulesFilePath,
  });
}

async function projection(
  ctx: {
    stateFilePath: string;
    rulesFilePath: string;
  },
  now: string,
) {
  const state =
    await commerce.readMembershipCommerceState(
      ctx.stateFilePath,
    );

  const version =
    await rulesApi.getActiveMembershipRules(
      new Date(now),
      ctx.rulesFilePath,
    );

  return commerce.buildMemberReferralQualificationProgress({
    state,
    rulesVersion: version,
    memberId: "member-test",
    now: new Date(now),
  });
}

try {
  console.log("");
  console.log("=== CASE 1 EMPTY PV PROGRESS ===");

  {
    const ctx =
      await createContext({
        basis: "pv",
        generalThreshold: 800,
      });

    const view =
      await projection(
        ctx,
        "2026-09-18T01:00:00.000Z",
      );

    check(
      view.qualificationBasis === "pv",
      "projection uses configured PV basis",
    );

    check(
      view.general.cumulativeAmount === 0,
      "empty member starts from zero",
    );

    check(
      view.general.remainingToThreshold === 800,
      "empty member shows full remaining threshold",
    );

    check(
      view.status === "in_progress",
      "empty member is in progress",
    );
  }

  console.log("");
  console.log("=== CASE 2 PARTIAL PV PROGRESS ===");

  {
    const ctx =
      await createContext({
        basis: "pv",
        generalThreshold: 800,
      });

    const order =
      await writeCompletedOrder(1200, 600);

    await complete(
      ctx,
      order,
      "2026-09-18T02:00:00.000Z",
    );

    const view =
      await projection(
        ctx,
        "2026-09-18T02:30:00.000Z",
      );

    check(
      view.general.cumulativeAmount === 600,
      "projection shows 600 accumulated KD points",
    );

    check(
      view.general.remainingToThreshold === 200,
      "projection shows 200 KD points remaining",
    );

    check(
      view.general.progressPercent === 75,
      "projection calculates 75 percent progress",
    );

    check(
      view.general.evidence.length === 1 &&
      view.general.evidence[0].orderNumber === order,
      "projection exposes safe order evidence",
    );
  }

  console.log("");
  console.log("=== CASE 3 QUALIFIED COVERAGE ===");

  {
    const ctx =
      await createContext({
        basis: "pv",
        generalThreshold: 800,
      });

    const first =
      await writeCompletedOrder(1200, 600);

    await complete(
      ctx,
      first,
      "2026-09-18T03:00:00.000Z",
    );

    const second =
      await writeCompletedOrder(500, 200);

    await complete(
      ctx,
      second,
      "2026-09-18T04:00:00.000Z",
    );

    const view =
      await projection(
        ctx,
        "2026-09-18T05:00:00.000Z",
      );

    check(
      view.isQualifiedNow === true,
      "active qualification coverage marks member qualified",
    );

    check(
      view.status === "qualified",
      "qualified member receives qualified status",
    );

    check(
      view.activeCoverage !== null,
      "qualified member exposes coverage interval",
    );

    check(
      view.activeCoverage?.qualificationBasis === "pv",
      "current qualification snapshots PV evidence basis",
    );

    check(
      view.activeCoverage?.sourceEvidence.length === 2,
      "current qualification exposes exact consumed source orders",
    );

    check(
      view.activeCoverage?.sourceEvidence[0]?.allocatedAmount === 600 &&
      view.activeCoverage?.sourceEvidence[0]?.cumulativeAllocatedAmount === 600,
      "first qualification source records 600 allocated KD points",
    );

    check(
      view.activeCoverage?.sourceEvidence[1]?.allocatedAmount === 200 &&
      view.activeCoverage?.sourceEvidence[1]?.cumulativeAllocatedAmount === 800,
      "second qualification source reaches cumulative 800 KD points",
    );

    check(
      view.activeCoverage?.sourceEvidence[1]?.triggeredQualification === true,
      "qualification-triggering order is identified",
    );

    check(
      view.activeCoverage?.consumedAmount === 800,
      "current qualification exposes canonical consumed amount",
    );

    check(
      view.general.cumulativeAmount === 0,
      "consumed qualification evidence is not counted twice",
    );
  }

  console.log("");
  console.log("=== CASE 4 EXPIRED COVERAGE ===");

  {
    const ctx =
      await createContext({
        basis: "pv",
        generalThreshold: 800,
        forwardDays: 1,
      });

    const order =
      await writeCompletedOrder(1800, 800);

    await complete(
      ctx,
      order,
      "2026-09-10T00:00:00.000Z",
    );

    const view =
      await projection(
        ctx,
        "2026-09-18T00:00:00.000Z",
      );

    check(
      view.isQualifiedNow === false,
      "expired coverage is not treated as currently qualified",
    );

    check(
      view.status === "in_progress",
      "expired coverage returns to qualification progress",
    );
  }

  console.log("");
  console.log("=== CASE 5 ACTIVE SUBSCRIPTION EITHER MODE ===");

  {
    const ctx =
      await createContext({
        basis: "pv",
        mode: "either",
        generalThreshold: 800,
        subscriptionThreshold: 600,
        activeSubscription: true,
      });

    const order =
      await writeCompletedOrder(900, 600);

    await complete(
      ctx,
      order,
      "2026-09-18T06:00:00.000Z",
    );

    const view =
      await projection(
        ctx,
        "2026-09-18T07:00:00.000Z",
      );

    check(
      view.activeSubscriptionNow === true,
      "projection detects active subscription",
    );

    check(
      view.isQualifiedNow === true,
      "either mode accepts lower active-subscription path",
    );

    check(
      view.activeCoverage?.selectedPaths.includes(
        "subscription",
      ) === true,
      "coverage identifies subscription qualification path",
    );
  }

  console.log("");
  console.log(
    `J.5D.6B1.1 PASS — ${checks}/${checks} checks passed`,
  );
} finally {
  await fs.rm(root, {
    recursive: true,
    force: true,
  });
}