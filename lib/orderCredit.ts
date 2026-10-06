import { promises as fs } from "node:fs";
import path from "node:path";
import { withOrderFileUpdateLock } from "./orderFiles";
import { getOrdersDir } from "./storagePaths";
import { getActiveMembershipRules, type RulesVersion } from "./membershipBusinessRules";
import { reserveCredit, settleCreditReservation, type CreditReservation } from "./membershipCommerce";
import { maximumCreditRedemption } from "./membershipPolicies";
import { requestedSubscriptionCredit, type SubscriptionCreditPreference } from "./subscriptionCreditPreference";

/** Inventory must finish before credit. Order lock serializes credit against cancellation.
 * An interrupted ledger -> order write is recovered by the stable order reservation key.
 * A confirmed write failure releases the reservation; retries can reserve afresh.
 */
export async function applyOrderCredit(input: {
  memberId: string; orderNumber: string; requestedAmount?: number;
  preference?: SubscriptionCreditPreference; rulesVersionSnapshot?: RulesVersion;
  orderDir?: string; stateFilePath?: string; rulesFilePath?: string; now?: Date;
}) {
  const orderDir = input.orderDir ?? getOrdersDir();
  const version = input.rulesVersionSnapshot ?? await getActiveMembershipRules(input.now, input.rulesFilePath);
  let reserved: CreditReservation | null = null;
  try {
    return await withOrderFileUpdateLock(orderDir, input.orderNumber, async (order, persistOrder) => {
      const member = order.member as { memberId?: string } | undefined;
      if (member?.memberId !== input.memberId) throw new Error("訂單會員不一致");
      const credit = order.credit as Record<string, unknown> | undefined;
      if (credit?.reservationId || credit?.decisionFinalized === true) return order;
      if (!["new_order", "confirmed", "waiting_merchant_create_cod_shipment", "waiting_studio_pickup_confirmation"].includes(String(order.status))) return order;
      const inventory = order.inventoryTransaction as { state?: string } | undefined;
      if (inventory?.state !== "inventory_committed") return order;
      const merchandiseSubtotal = Number(order.subtotal ?? 0);
      const shipping = Number(order.shipping ?? 0);
      const totalBeforeCredit = merchandiseSubtotal + shipping + Number(order.codServiceFee ?? 0);
      if (Number(order.total) !== totalBeforeCredit) throw new Error("訂單金額與折抵前快照不一致");
      const maximum = maximumCreditRedemption({ merchandiseSubtotal, shipping, rules: version.rules });
      const requestedAmount = input.preference ? requestedSubscriptionCredit(input.preference, maximum) : input.requestedAmount ?? 0;
      if (requestedAmount <= 0) return persistOrder({ ...order, credit: { appliedAmount: 0, status: "not_used", decisionFinalized: true, rulesVersion: version.rulesVersion } });
      const reservation = await reserveCredit({
        memberId: input.memberId, orderId: input.orderNumber, requestedAmount,
        merchandiseSubtotal, shipping, rulesVersionSnapshot: version,
        clampToAvailable: true, recoverForOrder: true,
        idempotencyKey: `order-credit:${input.orderNumber}`,
        stateFilePath: input.stateFilePath, now: input.now,
      });
      reserved = reservation;
      if (reservation.status !== "reserved") throw new Error("訂單保留狀態與折抵快照不一致");
      return persistOrder({
        ...order, totalBeforeCredit, total: totalBeforeCredit - reservation.amount,
        credit: { reservationId: reservation.reservationId, requestedAmount, appliedAmount: reservation.amount, status: "reserved", decisionFinalized: true, rulesVersion: reservation.rulesVersion ?? version.rulesVersion },
        ...(order.pricingSnapshot && typeof order.pricingSnapshot === "object" ? { pricingSnapshot: { ...order.pricingSnapshot, creditReserved: reservation.amount, finalAmount: totalBeforeCredit - reservation.amount } } : {}),
      });
    }, { timeoutMs: 15_000 });
  } catch (error) {
    // A write may have completed before reporting an IO error. Read it before compensating.
    const reservation = reserved as CreditReservation | null;
    if (reservation) {
      const persisted = await fs.readFile(path.join(orderDir, `${input.orderNumber}.json`), "utf8").then((text) => JSON.parse(text)).catch(() => null);
      if (persisted?.credit?.reservationId === reservation.reservationId) return persisted;
      if (persisted) await settleCreditReservation({ reservationId: reservation.reservationId, action: "release", idempotencyKey: `order-credit-write-failed:${reservation.reservationId}`, reason: "訂單折抵快照寫入失敗", stateFilePath: input.stateFilePath, now: input.now });
    }
    throw error;
  }
}
