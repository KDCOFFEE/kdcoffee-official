import type { MembershipBusinessRules } from "./membershipRuleTypes";

type ShippingRuleInput = {
  shipping: Pick<
    MembershipBusinessRules["shipping"],
    "sevenElevenShippingFee" | "homeDeliveryShippingFee" | "subscriptionShippingDiscount"
  >;
};

export type KdShippingMethod =
  | "studio_pickup"
  | "711_cod"
  | "home_delivery";

export function regularShippingFee(
  method: KdShippingMethod,
  rules: ShippingRuleInput,
): number {
  if (method === "studio_pickup") {
    return 0;
  }

  if (method === "711_cod") {
    return Math.max(
      0,
      rules.shipping.sevenElevenShippingFee,
    );
  }

  return Math.max(
    0,
    rules.shipping.homeDeliveryShippingFee,
  );
}

export function subscriptionShippingFee(
  method: KdShippingMethod,
  rules: ShippingRuleInput,
): number {
  if (method === "studio_pickup") {
    return 0;
  }

  const regular =
    regularShippingFee(method, rules);

  const discount =
    Math.max(
      0,
      rules.shipping.subscriptionShippingDiscount,
    );

  return Math.max(
    0,
    regular - discount,
  );
}

export function subscriptionShippingSaving(
  method: KdShippingMethod,
  rules: ShippingRuleInput,
): number {
  return Math.max(
    0,
    regularShippingFee(method, rules) -
      subscriptionShippingFee(method, rules),
  );
}
