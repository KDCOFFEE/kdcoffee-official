import { maximumCreditRedemption } from "./membershipPolicies";
import type { MembershipBusinessRules } from "./membershipRuleTypes";

export type HomeDeliveryPaymentMethod = "atm_transfer" | "cash_on_delivery" | "credit_card";
export type ActiveHomeDeliveryPaymentMethod = Exclude<HomeDeliveryPaymentMethod, "credit_card">;
export type HomeDeliveryPaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type HomeDeliveryPaymentDetails = {
  method: HomeDeliveryPaymentMethod;
  status: HomeDeliveryPaymentStatus;
  paidAt?: string;
  confirmedBy?: "admin";
  provider?: string;
  providerReference?: string;
};

function money(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label}必須是非負整數`);
  return value;
}

/** Creates additive fields for a future home order; existing payment strings remain readable. */
export function createHomeDeliveryPaymentSnapshot(
  method: ActiveHomeDeliveryPaymentMethod,
  rules: MembershipBusinessRules,
) {
  if (method !== "atm_transfer" && method !== "cash_on_delivery") {
    throw new Error("此宅配付款方式尚未開放");
  }
  return {
    payment: method,
    paymentDetails: { method, status: "pending" } satisfies HomeDeliveryPaymentDetails,
    codServiceFee: method === "cash_on_delivery" ? rules.shipping.homeDeliveryCodFee : 0,
  };
}

/** Credit eligibility remains merchandise plus permitted shipping; the COD fee is outside it. */
export function quoteHomeDeliveryPayable(input: {
  merchandiseSubtotal: number;
  shipping: number;
  availableCredit: number;
  requestedCredit: number;
  method: ActiveHomeDeliveryPaymentMethod;
  rules: MembershipBusinessRules;
}) {
  const merchandiseSubtotal = money(input.merchandiseSubtotal, "商品小計");
  const shipping = money(input.shipping, "運費");
  const availableCredit = money(input.availableCredit, "可用抵用金");
  const requestedCredit = money(input.requestedCredit, "欲使用抵用金");
  const payment = createHomeDeliveryPaymentSnapshot(input.method, input.rules);
  const codServiceFee = money(payment.codServiceFee, "貨到付款手續費");
  const maximumCredit = maximumCreditRedemption({ merchandiseSubtotal, shipping, rules: input.rules });
  const creditApplied = Math.min(availableCredit, requestedCredit, maximumCredit);
  const totalBeforeCredit = merchandiseSubtotal + shipping + codServiceFee;
  return {
    ...payment,
    merchandiseSubtotal,
    shipping,
    maximumCredit,
    creditApplied,
    totalBeforeCredit,
    total: totalBeforeCredit - creditApplied,
  };
}
