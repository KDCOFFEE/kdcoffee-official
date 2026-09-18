import type {
  SelfPurchaseRewardTier,
  SelfPurchaseRewardTierCalculationMethod,
} from "./membershipRuleTypes";

export type SelfPurchaseTierRewardBreakdown = {
  threshold: number;
  rewardRate: number;
  amount: number;
  reward: number;
};

export type SelfPurchaseTierRewardResult = {
  priorAmount: number;
  currentAmount: number;
  attainedAmount: number;
  effectiveRewardRate: number;
  rawReward: number;
  breakdown:
    SelfPurchaseTierRewardBreakdown[];
};

function finiteNonNegative(
  value: number,
  label: string,
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `${label} must be finite and non-negative`,
    );
  }

  return value;
}

function normalizedTiers(
  tiers: SelfPurchaseRewardTier[],
) {
  if (!Array.isArray(tiers) || !tiers.length) {
    throw new Error(
      "self-purchase reward tiers are empty",
    );
  }

  const result =
    tiers.map((tier) => ({
      threshold:
        finiteNonNegative(
          tier.threshold,
          "tier threshold",
        ),
      rewardRate:
        finiteNonNegative(
          tier.rewardRate,
          "tier reward rate",
        ),
    }));

  if (result[0].threshold !== 0) {
    throw new Error(
      "first self-purchase tier threshold must be zero",
    );
  }

  for (
    let index = 1;
    index < result.length;
    index += 1
  ) {
    if (
      result[index].threshold <=
      result[index - 1].threshold
    ) {
      throw new Error(
        "self-purchase tier thresholds must be strictly increasing",
      );
    }
  }

  return result;
}

export function calculateSelfPurchaseTierReward(
  input: {
    priorAmount: number;
    currentAmount: number;
    calculationMethod:
      SelfPurchaseRewardTierCalculationMethod;
    tiers: SelfPurchaseRewardTier[];
  },
): SelfPurchaseTierRewardResult {
  const priorAmount =
    finiteNonNegative(
      input.priorAmount,
      "prior amount",
    );

  const currentAmount =
    finiteNonNegative(
      input.currentAmount,
      "current amount",
    );

  const tiers =
    normalizedTiers(
      input.tiers,
    );

  const attainedAmount =
    priorAmount +
    currentAmount;

  const attainedTier =
    [...tiers]
      .reverse()
      .find(
        (tier) =>
          attainedAmount >=
          tier.threshold,
      ) ?? tiers[0];

  if (
    input.calculationMethod ===
    "whole_order"
  ) {
    const rawReward =
      currentAmount *
      attainedTier.rewardRate /
      100;

    return {
      priorAmount,
      currentAmount,
      attainedAmount,
      effectiveRewardRate:
        attainedTier.rewardRate,
      rawReward,
      breakdown: [
        {
          threshold:
            attainedTier.threshold,
          rewardRate:
            attainedTier.rewardRate,
          amount:
            currentAmount,
          reward:
            rawReward,
        },
      ],
    };
  }

  if (
    input.calculationMethod !==
    "marginal"
  ) {
    throw new Error(
      "unsupported self-purchase tier calculation method",
    );
  }

  const start =
    priorAmount;

  const end =
    attainedAmount;

  const breakdown:
    SelfPurchaseTierRewardBreakdown[] =
    [];

  for (
    let index = 0;
    index < tiers.length;
    index += 1
  ) {
    const tier =
      tiers[index];

    const nextThreshold =
      tiers[index + 1]
        ?.threshold ??
      Number.POSITIVE_INFINITY;

    const overlapStart =
      Math.max(
        start,
        tier.threshold,
      );

    const overlapEnd =
      Math.min(
        end,
        nextThreshold,
      );

    const amount =
      Math.max(
        0,
        overlapEnd -
        overlapStart,
      );

    if (amount <= 0) {
      continue;
    }

    breakdown.push({
      threshold:
        tier.threshold,
      rewardRate:
        tier.rewardRate,
      amount,
      reward:
        amount *
        tier.rewardRate /
        100,
    });
  }

  const rawReward =
    breakdown.reduce(
      (sum, item) =>
        sum + item.reward,
      0,
    );

  return {
    priorAmount,
    currentAmount,
    attainedAmount,
    effectiveRewardRate:
      attainedTier.rewardRate,
    rawReward,
    breakdown,
  };
}