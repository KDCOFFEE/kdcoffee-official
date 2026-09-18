import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root =
  await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "kd-j5d6b2-runtime-",
    ),
  );

process.env.KD_DATA_DIR = root;

const rulesApi =
  await import("../lib/membershipBusinessRules");

const commerce =
  await import("../lib/membershipCommerce");

let pass = 0;

function check(
  condition: unknown,
  message: string,
) {
  assert.ok(condition, message);

  pass += 1;

  console.log(
    `PASS ${String(pass).padStart(2, "0")} ${message}`,
  );
}

type EligibilityMode =
  | "first_completed_order"
  | "after_prior_valid_consumption";

async function createContext(
  name: string,
  mode: EligibilityMode,
) {
  const directory =
    path.join(root, name);

  const stateFilePath =
    path.join(
      directory,
      "commerce-state.json",
    );

  const rulesFilePath =
    path.join(
      directory,
      "business-rules.json",
    );

  await fs.mkdir(
    directory,
    { recursive: true },
  );

  const rules =
    structuredClone(
      rulesApi.DEFAULT_MEMBERSHIP_RULES,
    );

  rules.referral.programEnabled = true;
  rules.referral.selfPurchaseRewardRate = 5;
  rules.referral.selfPurchaseEligibilityMode =
    mode;

  /*
   * Keep qualification thresholds intentionally high.
   * B2.5 tests reward-creation eligibility only,
   * not qualification-round creation.
   */
  rules.referral.payoutQualification
    .generalMember
    .cumulativeValidConsumptionThreshold =
      999999;

  rules.referral.payoutQualification
    .activeSubscriptionMember
    .cumulativeValidConsumptionThreshold =
      999999;

  rules.referral.payoutQualification
    .generalMember
    .cumulativeValidPVThreshold =
      999999;

  rules.referral.payoutQualification
    .activeSubscriptionMember
    .cumulativeValidPVThreshold =
      999999;

  await rulesApi.saveMembershipBusinessRules(
    {
      expectedRevision: 0,
      rules,
      now: new Date(
        "2026-09-18T00:00:00.000Z",
      ),
    },
    rulesFilePath,
  );

  return {
    stateFilePath,
    rulesFilePath,
  };
}

async function writeCompletedOrder(
  orderId: string,
  memberId: string,
  subtotal = 1000,
  effectivePV = 100,
) {
  const ordersDir =
    path.join(root, "orders");

  await fs.mkdir(
    ordersDir,
    { recursive: true },
  );

  const order = {
    orderNumber: orderId,
    createdAt:
      "2026-09-18T01:00:00.000Z",
    status: "completed",
    orderMode: "studio_pickup",
    subtotal,
    shipping: 0,
    total: subtotal,
    member: {
      memberId,
    },
    items: [
      {
        slug: "b2-runtime-product",
        name: "B2 Runtime Product",
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
  };

  await fs.writeFile(
    path.join(
      ordersDir,
      `${orderId}.json`,
    ),
    `${JSON.stringify(
      order,
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function complete(
  ctx: {
    stateFilePath: string;
    rulesFilePath: string;
  },
  input: {
    memberId: string;
    orderId: string;
    key: string;
    at: string;
  },
) {
  await commerce.handleCanonicalOrderOutcome({
    orderId: input.orderId,
    outcome: "completed",
    memberId: input.memberId,
    merchandiseAmount: 1000,
    basePV: 100,
    effectivePV: 100,
    discountRatio: 1,
    idempotencyKey: input.key,
    now: new Date(input.at),
    stateFilePath:
      ctx.stateFilePath,
    rulesFilePath:
      ctx.rulesFilePath,
  });
}

function selfRewards(
  state: Awaited<
    ReturnType<
      typeof commerce.readMembershipCommerceState
    >
  >,
) {
  return Object.values(
    state.referralRewards,
  ).filter(
    (reward) =>
      reward.rewardType ===
      "self_purchase",
  );
}

try {
  console.log(
    "\n=== CASE 1 FIRST COMPLETED ORDER MODE ===",
  );

  const firstCtx =
    await createContext(
      "first-mode",
      "first_completed_order",
    );

  const firstMember =
    "member-first-mode";

  const firstOrder =
    "KD20260918-25001";

  await writeCompletedOrder(
    firstOrder,
    firstMember,
  );

  await complete(
    firstCtx,
    {
      memberId: firstMember,
      orderId: firstOrder,
      key: "b25:first:complete",
      at: "2026-09-18T02:00:00.000Z",
    },
  );

  let state =
    await commerce.readMembershipCommerceState(
      firstCtx.stateFilePath,
    );

  let rewards =
    selfRewards(state);

  check(
    rewards.length === 1,
    "first_completed_order creates self-purchase reward on first completed order",
  );

  check(
    rewards[0].sourceOrderNumber ===
      firstOrder,
    "first-order reward is tied to canonical source order",
  );

  check(
    rewards[0].rewardRate === 5,
    "first-order reward preserves configured 5 percent rate",
  );

  check(
    rewards[0].rewardType ===
      "self_purchase",
    "first-order reward uses self_purchase reward type",
  );

  check(
    Object.values(
      state.validConsumptionEvents,
    ).filter(
      (event) =>
        event.memberId === firstMember,
    ).length === 1,
    "first completed order creates one valid-consumption event",
  );

  console.log(
    "\n=== CASE 2 LEGACY SECOND-ORDER MODE ===",
  );

  const legacyCtx =
    await createContext(
      "legacy-mode",
      "after_prior_valid_consumption",
    );

  const legacyMember =
    "member-legacy-mode";

  const legacyFirstOrder =
    "KD20260918-25002";

  const legacySecondOrder =
    "KD20260918-25003";

  await writeCompletedOrder(
    legacyFirstOrder,
    legacyMember,
  );

  await complete(
    legacyCtx,
    {
      memberId: legacyMember,
      orderId: legacyFirstOrder,
      key: "b25:legacy:first",
      at: "2026-09-18T03:00:00.000Z",
    },
  );

  state =
    await commerce.readMembershipCommerceState(
      legacyCtx.stateFilePath,
    );

  rewards =
    selfRewards(state);

  check(
    rewards.length === 0,
    "after_prior_valid_consumption creates no reward on first completed order",
  );

  check(
    Object.values(
      state.validConsumptionEvents,
    ).filter(
      (event) =>
        event.memberId === legacyMember,
    ).length === 1,
    "legacy first completed order still becomes valid consumption",
  );

  await writeCompletedOrder(
    legacySecondOrder,
    legacyMember,
  );

  await complete(
    legacyCtx,
    {
      memberId: legacyMember,
      orderId: legacySecondOrder,
      key: "b25:legacy:second",
      at: "2026-09-18T04:00:00.000Z",
    },
  );

  state =
    await commerce.readMembershipCommerceState(
      legacyCtx.stateFilePath,
    );

  rewards =
    selfRewards(state);

  check(
    rewards.length === 1,
    "after_prior_valid_consumption creates reward on second completed order",
  );

  check(
    rewards[0].sourceOrderNumber ===
      legacySecondOrder,
    "legacy-mode reward belongs to second order rather than first order",
  );

  console.log(
    "\n=== CASE 3 CANONICAL RETRY IDEMPOTENCY ===",
  );

  const rewardIdBeforeRetry =
    rewards[0].rewardId;

  const rewardCountBeforeRetry =
    rewards.length;

  const eventCountBeforeRetry =
    state.events.length;

  await complete(
    legacyCtx,
    {
      memberId: legacyMember,
      orderId: legacySecondOrder,
      key: "b25:legacy:second",
      at: "2026-09-18T04:00:00.000Z",
    },
  );

  state =
    await commerce.readMembershipCommerceState(
      legacyCtx.stateFilePath,
    );

  rewards =
    selfRewards(state);

  check(
    rewards.length ===
      rewardCountBeforeRetry,
    "replaying same completed outcome does not create duplicate self-purchase reward",
  );

  check(
    rewards[0].rewardId ===
      rewardIdBeforeRetry,
    "replayed outcome preserves deterministic existing reward identity",
  );

  check(
    Object.values(
      state.validConsumptionEvents,
    ).filter(
      (event) =>
        event.sourceOrderId ===
        legacySecondOrder,
    ).length === 1,
    "replayed outcome does not duplicate valid-consumption evidence",
  );

  check(
    state.events.length ===
      eventCountBeforeRetry,
    "replayed canonical outcome does not append duplicate reward events",
  );

  console.log(
    "\n=== CASE 4 IDEMPOTENCY NAMESPACE COMPATIBILITY ===",
  );

  const source =
    await fs.readFile(
      "lib/membershipCommerce.ts",
      "utf8",
    );

  check(
    source.includes(
      ":self-repeat-v1",
    ),
    "historical self-repeat-v1 idempotency namespace is preserved",
  );

  check(
    !source.includes(
      ":self-purchase-v2",
    ),
    "new self-purchase-v2 namespace is absent",
  );

  console.log(
    `\nJ.5D.6B2.5 PASS — ${pass}/15 checks passed`,
  );
}
finally {
  await fs.rm(
    root,
    {
      recursive: true,
      force: true,
    },
  );
}