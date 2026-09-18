import assert from "node:assert/strict";

import {
  DEFAULT_MEMBERSHIP_RULES,
  normalizeMembershipBusinessRules,
  validateMembershipBusinessRules,
} from "../lib/membershipBusinessRules";

import {
  calculateSelfPurchaseTierReward,
} from "../lib/selfPurchaseRewardTiers";

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

const sampleTiers = [
  {
    threshold: 0,
    rewardRate: 5,
  },
  {
    threshold: 600,
    rewardRate: 7,
  },
  {
    threshold: 1000,
    rewardRate: 8,
  },
  {
    threshold: 2000,
    rewardRate: 10,
  },
];

console.log(
  "\n=== CASE 1 DEFAULT / LEGACY COMPATIBILITY ===",
);

check(
  DEFAULT_MEMBERSHIP_RULES
    .referral
    .selfPurchaseRewardTiers
    .enabled === false,
  "dynamic tiers are disabled by default to preserve flat-rate behavior",
);

const legacyRules =
  structuredClone(
    DEFAULT_MEMBERSHIP_RULES,
  ) as any;

delete legacyRules.referral
  .selfPurchaseRewardTiers;

legacyRules.referral
  .selfPurchaseRewardRate = 7;

const normalizedLegacy =
  normalizeMembershipBusinessRules(
    legacyRules,
  );

check(
  normalizedLegacy.referral
    .selfPurchaseRewardTiers
    .enabled === false,
  "legacy rules missing tier config remain disabled",
);

check(
  normalizedLegacy.referral
    .selfPurchaseRewardTiers
    .tiers.length === 1 &&
  normalizedLegacy.referral
    .selfPurchaseRewardTiers
    .tiers[0].threshold === 0 &&
  normalizedLegacy.referral
    .selfPurchaseRewardTiers
    .tiers[0].rewardRate === 7,
  "legacy flat self-purchase rate becomes fallback zero-threshold tier",
);

check(
  DEFAULT_MEMBERSHIP_RULES
    .referral
    .selfPurchaseRewardTiers
    .thresholdBasis ===
    "paid_amount",
  "dynamic tier threshold basis defaults to paid amount",
);

check(
  normalizedLegacy.referral
    .selfPurchaseRewardTiers
    .thresholdBasis ===
    "paid_amount",
  "legacy rules missing threshold basis normalize to paid amount",
);

console.log(
  "\n=== CASE 2 DYNAMIC SCHEMA VALIDATION ===",
);

const dynamicRules =
  structuredClone(
    DEFAULT_MEMBERSHIP_RULES,
  );

dynamicRules.referral
  .selfPurchaseRewardTiers = {
    enabled: true,
    thresholdBasis:
      "paid_amount",
    accumulationBasis:
      "rolling_period",
    calculationMethod:
      "whole_order",
    rollingWindowDays: 30,
    tiers:
      structuredClone(
        sampleTiers,
      ),
  };

const validated =
  validateMembershipBusinessRules(
    dynamicRules,
  );


check(
  validated.referral
    .selfPurchaseRewardTiers
    .thresholdBasis ===
    "paid_amount",
  "Owner can select paid amount as own-purchase tier basis",
);

const pvBasisRules =
  structuredClone(
    dynamicRules,
  );

pvBasisRules.referral
  .selfPurchaseRewardTiers
  .thresholdBasis =
    "pv";

const validatedPvBasis =
  validateMembershipBusinessRules(
    pvBasisRules,
  );

check(
  validatedPvBasis.referral
    .selfPurchaseRewardTiers
    .thresholdBasis ===
    "pv",
  "Owner can select PV as own-purchase tier basis",
);

const invalidBasisRules =
  structuredClone(
    dynamicRules,
  ) as any;

invalidBasisRules.referral
  .selfPurchaseRewardTiers
  .thresholdBasis =
    "invalid_basis";

const invalidBasisResult =
  await Promise.allSettled([
    Promise.resolve().then(
      () =>
        validateMembershipBusinessRules(
          invalidBasisRules,
        ),
    ),
  ]);

check(
  invalidBasisResult[0].status ===
    "rejected",
  "invalid own-purchase tier threshold basis is rejected",
);

check(
  validated.referral
    .selfPurchaseRewardTiers
    .tiers.length === 4,
  "Owner can configure four dynamic reward tiers",
);

const reducedRules =
  structuredClone(
    dynamicRules,
  );

reducedRules.referral
  .selfPurchaseRewardTiers
  .tiers = [
    sampleTiers[0],
    sampleTiers[2],
  ];

check(
  validateMembershipBusinessRules(
    reducedRules,
  ).referral
    .selfPurchaseRewardTiers
    .tiers.length === 2,
  "Owner can remove reward tiers dynamically",
);

let invalidRejected = false;

try {
  const invalid =
    structuredClone(
      dynamicRules,
    );

  invalid.referral
    .selfPurchaseRewardTiers
    .tiers = [
      {
        threshold: 100,
        rewardRate: 5,
      },
    ];

  validateMembershipBusinessRules(
    invalid,
  );
}
catch {
  invalidRejected = true;
}

check(
  invalidRejected,
  "first reward tier must start at threshold zero",
);

invalidRejected = false;

try {
  const invalid =
    structuredClone(
      dynamicRules,
    );

  invalid.referral
    .selfPurchaseRewardTiers
    .tiers = [
      {
        threshold: 0,
        rewardRate: 5,
      },
      {
        threshold: 600,
        rewardRate: 7,
      },
      {
        threshold: 600,
        rewardRate: 8,
      },
    ];

  validateMembershipBusinessRules(
    invalid,
  );
}
catch {
  invalidRejected = true;
}

check(
  invalidRejected,
  "duplicate tier thresholds are rejected",
);

console.log(
  "\n=== CASE 3 SINGLE-ORDER WHOLE-ORDER ===",
);

const singleWhole =
  calculateSelfPurchaseTierReward({
    priorAmount: 0,
    currentAmount: 1200,
    calculationMethod:
      "whole_order",
    tiers: sampleTiers,
  });

check(
  singleWhole.attainedAmount ===
    1200 &&
  singleWhole.effectiveRewardRate ===
    8,
  "single-order 1200 reaches the 8 percent tier",
);

check(
  singleWhole.rawReward ===
    96,
  "whole-order mode applies 8 percent to the entire 1200 order",
);

console.log(
  "\n=== CASE 4 ROLLING WHOLE-ORDER ===",
);

const rollingWhole =
  calculateSelfPurchaseTierReward({
    priorAmount: 920,
    currentAmount: 200,
    calculationMethod:
      "whole_order",
    tiers: sampleTiers,
  });

check(
  rollingWhole.attainedAmount ===
    1120,
  "rolling calculation includes current order before selecting tier",
);

check(
  rollingWhole.effectiveRewardRate ===
    8 &&
  rollingWhole.rawReward ===
    16,
  "920 plus current 200 gives current order the 8 percent whole-order rate",
);

console.log(
  "\n=== CASE 5 SINGLE-ORDER MARGINAL ===",
);

const singleMarginal =
  calculateSelfPurchaseTierReward({
    priorAmount: 0,
    currentAmount: 1200,
    calculationMethod:
      "marginal",
    tiers: sampleTiers,
  });

check(
  singleMarginal.breakdown.length ===
    3,
  "single-order marginal calculation spans three attained brackets",
);

check(
  Math.abs(
    singleMarginal.rawReward -
    74,
  ) < 0.000001,
  "single-order marginal reward equals 600x5% + 400x7% + 200x8%",
);

console.log(
  "\n=== CASE 6 ROLLING MARGINAL ===",
);

const rollingMarginal =
  calculateSelfPurchaseTierReward({
    priorAmount: 500,
    currentAmount: 700,
    calculationMethod:
      "marginal",
    tiers: sampleTiers,
  });

check(
  rollingMarginal.breakdown.length ===
    3,
  "rolling marginal current order crosses three bracket portions",
);

check(
  Math.abs(
    rollingMarginal.rawReward -
    49,
  ) < 0.000001,
  "rolling marginal reward equals 100x5% + 400x7% + 200x8%",
);

console.log(
  "\n=== CASE 7 NO RETROACTIVE MUTATION CONTRACT ===",
);

const firstSnapshot =
  calculateSelfPurchaseTierReward({
    priorAmount: 0,
    currentAmount: 1000,
    calculationMethod:
      "whole_order",
    tiers: sampleTiers,
  });

const changedTiers = [
  {
    threshold: 0,
    rewardRate: 3,
  },
  {
    threshold: 1000,
    rewardRate: 12,
  },
];

const laterCalculation =
  calculateSelfPurchaseTierReward({
    priorAmount: 0,
    currentAmount: 1000,
    calculationMethod:
      "whole_order",
    tiers: changedTiers,
  });

check(
  firstSnapshot.rawReward === 80 &&
  laterCalculation.rawReward === 120,
  "changed future tier settings produce a new calculation without mutating the earlier result",
);

console.log(
  `\nJ.5D.6B3.2 PASS - ${pass}/${pass} checks passed`,
);