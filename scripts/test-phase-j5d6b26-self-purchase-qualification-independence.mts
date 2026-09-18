import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root =
  await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "kd-j5d6b26-",
    ),
  );

process.env.KD_DATA_DIR = root;

const rulesApi =
  await import(
    "../lib/membershipBusinessRules"
  );

const commerce =
  await import(
    "../lib/membershipCommerce"
  );

let pass = 0;

function check(
  condition: unknown,
  message: string,
) {
  assert.ok(
    condition,
    message,
  );

  pass += 1;

  console.log(
    `PASS ${String(pass).padStart(2, "0")} ${message}`,
  );
}

async function createContext(
  name: string,
  requiresQualification: boolean,
) {
  const directory =
    path.join(
      root,
      name,
    );

  await fs.mkdir(
    directory,
    { recursive: true },
  );

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

  const rules =
    structuredClone(
      rulesApi.DEFAULT_MEMBERSHIP_RULES,
    );

  rules.referral.programEnabled = true;
  rules.referral.selfPurchaseRewardRate = 5;
  rules.referral.selfPurchaseEligibilityMode =
    "first_completed_order";

  rules.referral
    .selfPurchaseRequiresReferralQualification =
    requiresQualification;

  rules.referral
    .referralRewardCalculationMode =
    "paid_amount";

  rules.referral
    .referralRewardBaseWaitingDays = 1;

  rules.referral
    .referralRewardReturnProtectionDays = 1;

  rules.referral
    .payoutQualification
    .generalMember
    .cumulativeValidConsumptionThreshold =
    999999;

  rules.referral
    .payoutQualification
    .activeSubscriptionMember
    .cumulativeValidConsumptionThreshold =
    999999;

  rules.referral
    .payoutQualification
    .generalMember
    .cumulativeValidPVThreshold =
    999999;

  rules.referral
    .payoutQualification
    .activeSubscriptionMember
    .cumulativeValidPVThreshold =
    999999;

  await rulesApi
    .saveMembershipBusinessRules(
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

async function createReward(
  ctx: {
    stateFilePath: string;
    rulesFilePath: string;
  },
  orderId: string,
  memberId: string,
  now: string,
) {
  return commerce
    .createSelfPurchaseRewardFromFulfillment({
      sourceMemberId: memberId,
      orderId,
      paidAmountBasis: 1000,
      basePV: 100,
      effectivePV: 100,
      discountRatio: 1,
      idempotencyKey:
        `${orderId}:self-repeat-v1`,
      now: new Date(now),
      stateFilePath:
        ctx.stateFilePath,
      rulesFilePath:
        ctx.rulesFilePath,
    });
}

async function readState(
  filePath: string,
) {
  return commerce
    .readMembershipCommerceState(
      filePath,
    );
}

try {
  console.log(
    "\n=== CASE 1 DEFAULT RULE IS INDEPENDENT ===",
  );

  check(
    rulesApi.DEFAULT_MEMBERSHIP_RULES
      .referral
      .selfPurchaseRequiresReferralQualification ===
      false,
    "default self-purchase reward does not require referral qualification",
  );

  const legacyLike =
    structuredClone(
      rulesApi.DEFAULT_MEMBERSHIP_RULES,
    ) as any;

  delete legacyLike.referral
    .selfPurchaseRequiresReferralQualification;

  const normalized =
    rulesApi.normalizeMembershipBusinessRules(
      legacyLike,
    );

  check(
    normalized.referral
      .selfPurchaseRequiresReferralQualification ===
      false,
    "missing setting normalizes to independent self-purchase reward",
  );

  console.log(
    "\n=== CASE 2 DIRECT SELF-PURCHASE REWARD ===",
  );

  const direct =
    await createContext(
      "direct",
      false,
    );

  const directOrder =
    "KD20260918-26001";

  const directMember =
    "member-b26-direct";

  const directCreated =
    await createReward(
      direct,
      directOrder,
      directMember,
      "2026-09-18T02:00:00.000Z",
    );

  check(
    directCreated.length === 1,
    "direct mode creates one self-purchase reward",
  );

  check(
    directCreated[0]
      .qualificationAuthority ===
      "self_purchase_direct",
    "direct self-purchase reward snapshots independent authority",
  );

  check(
    directCreated[0]
      .qualificationStatus ===
      "qualified",
    "direct self-purchase reward is immediately qualification-complete",
  );

  check(
    Boolean(
      directCreated[0]
        .releaseEligibleBusinessDate,
    ),
    "direct self-purchase reward receives safety-wait release date",
  );

  let state =
    await readState(
      direct.stateFilePath,
    );

  check(
    Object.values(
      state.referralRewardCoverages,
    ).length === 0,
    "direct self-purchase reward creates no referral qualification coverage",
  );

  await commerce
    .runReferralRewardReleaseScheduler({
      now: new Date(
        "2026-09-18T03:00:00.000Z",
      ),
      stateFilePath:
        direct.stateFilePath,
      rulesFilePath:
        direct.rulesFilePath,
    });

  state =
    await readState(
      direct.stateFilePath,
    );

  check(
    state.referralRewards[
      directCreated[0].rewardId
    ].status === "scheduled",
    "direct reward does not release before safety wait expires",
  );

  await commerce
    .runReferralRewardReleaseScheduler({
      now: new Date(
        "2026-10-01T03:00:00.000Z",
      ),
      stateFilePath:
        direct.stateFilePath,
      rulesFilePath:
        direct.rulesFilePath,
    });

  state =
    await readState(
      direct.stateFilePath,
    );

  const releasedDirect =
    state.referralRewards[
      directCreated[0].rewardId
    ];

  check(
    releasedDirect.status ===
      "released",
    "direct reward releases after safety wait without referral qualification",
  );

  check(
    Object.values(
      state.creditEntries,
    ).some(
      (entry) =>
        entry.memberId ===
          directMember &&
        entry.sourceType ===
          "member_reward" &&
        entry.amount === 50,
    ),
    "direct self-purchase release writes member reward credit",
  );

  console.log(
    "\n=== CASE 3 OWNER CAN REQUIRE REFERRAL QUALIFICATION ===",
  );

  const qualified =
    await createContext(
      "requires-qualification",
      true,
    );

  const qualifiedCreated =
    await createReward(
      qualified,
      "KD20260918-26002",
      "member-b26-qualified",
      "2026-09-18T04:00:00.000Z",
    );

  check(
    qualifiedCreated[0]
      .qualificationAuthority ===
      "qualification_coverage",
    "checked setting keeps canonical referral qualification authority",
  );

  check(
    qualifiedCreated[0]
      .qualificationStatus ===
      "awaiting_order",
    "qualification-required self-purchase reward waits for referral qualification",
  );

  check(
    qualifiedCreated[0]
      .releaseEligibleBusinessDate ===
      null,
    "qualification-required reward has no direct safety release date",
  );

  await commerce
    .runReferralRewardReleaseScheduler({
      now: new Date(
        "2026-10-20T03:00:00.000Z",
      ),
      stateFilePath:
        qualified.stateFilePath,
      rulesFilePath:
        qualified.rulesFilePath,
    });

  state =
    await readState(
      qualified.stateFilePath,
    );

  check(
    state.referralRewards[
      qualifiedCreated[0].rewardId
    ].status === "scheduled",
    "qualification-required reward does not bypass missing coverage",
  );

  console.log(
    "\n=== CASE 4 REVERSAL BEFORE RELEASE ===",
  );

  const cancelCtx =
    await createContext(
      "cancel-before-release",
      false,
    );

  const cancelCreated =
    await createReward(
      cancelCtx,
      "KD20260918-26003",
      "member-b26-cancel",
      "2026-09-18T05:00:00.000Z",
    );

  await commerce
    .cancelOrReverseReferralRewards({
      orderId:
        "KD20260918-26003",
      outcome:
        "refunded",
      idempotencyKey:
        "b26:cancel-before",
      now: new Date(
        "2026-09-18T06:00:00.000Z",
      ),
      stateFilePath:
        cancelCtx.stateFilePath,
      rulesFilePath:
        cancelCtx.rulesFilePath,
    });

  state =
    await readState(
      cancelCtx.stateFilePath,
    );

  check(
    state.referralRewards[
      cancelCreated[0].rewardId
    ].status === "cancelled",
    "refund before release cancels direct self-purchase reward",
  );

  check(
    Object.values(
      state.creditEntries,
    ).length === 0,
    "cancelled direct reward creates no credit",
  );

  console.log(
    "\n=== CASE 5 REVERSAL AFTER RELEASE ===",
  );

  const reverseCtx =
    await createContext(
      "reverse-after-release",
      false,
    );

  const reverseCreated =
    await createReward(
      reverseCtx,
      "KD20260918-26004",
      "member-b26-reverse",
      "2026-09-18T07:00:00.000Z",
    );

  await commerce
    .runReferralRewardReleaseScheduler({
      now: new Date(
        "2026-10-01T07:00:00.000Z",
      ),
      stateFilePath:
        reverseCtx.stateFilePath,
      rulesFilePath:
        reverseCtx.rulesFilePath,
    });

  await commerce
    .cancelOrReverseReferralRewards({
      orderId:
        "KD20260918-26004",
      outcome:
        "returned",
      idempotencyKey:
        "b26:reverse-after",
      now: new Date(
        "2026-10-02T07:00:00.000Z",
      ),
      stateFilePath:
        reverseCtx.stateFilePath,
      rulesFilePath:
        reverseCtx.rulesFilePath,
    });

  state =
    await readState(
      reverseCtx.stateFilePath,
    );

  check(
    state.referralRewards[
      reverseCreated[0].rewardId
    ].status === "reversed",
    "returned order reverses already released direct self-purchase reward",
  );

  check(
    Object.values(
      state.creditEntries,
    ).some(
      (entry) =>
        entry.amount < 0 &&
        entry.sourceReference.startsWith(
          "referral_reward_reversal:",
        ),
    ),
    "released direct reward reversal writes negative ledger evidence",
  );

  console.log(
    "\n=== CASE 6 MEMBER / ADMIN SOURCE WIRING ===",
  );

  const [
    adminSource,
    memberSource,
  ] =
    await Promise.all([
      fs.readFile(
        "components/admin/MembershipRulesManager.tsx",
        "utf8",
      ),
      fs.readFile(
        "components/member/MemberReferralCenter.tsx",
        "utf8",
      ),
    ]);

  check(
    adminSource.includes(
      "selfPurchaseRequiresReferralQualification",
    ) &&
    adminSource.includes(
      "本人消費回饋需符合推薦獎勵領取資格",
    ),
    "Admin exposes owner-controlled qualification checkbox",
  );

  check(
    memberSource.includes(
      "self_purchase_direct",
    ) &&
    memberSource.includes(
      "不需要符合推薦獎勵領取資格",
    ),
    "Member Center clearly distinguishes direct self-purchase reward",
  );

  console.log(
    `\nJ.5D.6B2.6 PASS — ${pass}/20 checks passed`,
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