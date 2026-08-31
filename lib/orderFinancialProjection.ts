type UnknownOrderSnapshot = Record<string, unknown>;

export type OrderFinancialBreakdown = {
  subtotal: number;
  shipping: number;
  creditApplied: number | null;
  totalBeforeCredit: number | null;
  total: number;
  creditEvidence: "order-snapshot" | null;
};

function nonNegativeMoney(value: unknown) {
  const amount = typeof value === "number" ? value : Number.NaN;
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

/**
 * Projects only persisted order pricing. Credit is shown when the snapshot has
 * a reservation id, an explicit applied amount, and a self-consistent total.
 * The applied amount is never inferred from the other totals.
 */
export function projectOrderFinancialBreakdown(order: UnknownOrderSnapshot): OrderFinancialBreakdown {
  const subtotal = nonNegativeMoney(order.subtotal) ?? 0;
  const shipping = nonNegativeMoney(order.shipping) ?? 0;
  const storedTotal = nonNegativeMoney(order.total);
  const total = storedTotal ?? subtotal;
  const totalBeforeCredit = nonNegativeMoney(order.totalBeforeCredit);
  const credit = order.credit && typeof order.credit === "object"
    ? order.credit as Record<string, unknown>
    : null;
  const reservationId = typeof credit?.reservationId === "string" ? credit.reservationId.trim() : "";
  const appliedAmount = nonNegativeMoney(credit?.appliedAmount);
  const canonicalCreditIsConsistent = Boolean(
    reservationId
      && appliedAmount
      && totalBeforeCredit !== null
      && totalBeforeCredit === subtotal + shipping
      && total === totalBeforeCredit - appliedAmount,
  );

  return {
    subtotal,
    shipping,
    creditApplied: canonicalCreditIsConsistent ? appliedAmount : null,
    totalBeforeCredit: canonicalCreditIsConsistent ? totalBeforeCredit : null,
    total,
    creditEvidence: canonicalCreditIsConsistent ? "order-snapshot" : null,
  };
}
