import type { MembershipCommerceState } from "./membershipCommerce";
import { projectReturnSettlements } from "./returnSettlementLedger";
import type { PassbookBalanceState, ReleasedCreditEvidence } from "./memberCreditRunningBalance";

export type CreditRestoration = { kind: "cancel" | "return"; expectedAmount: number; restoredAmount: number; expiredAmount: number };
export type RestorationRow = { id: string; orderNumber: string; date: string; change: number; balanceAfter: number | null;
  restoration: CreditRestoration; creditEntryIds: string[] };
export type RestorationState = PassbookBalanceState & Partial<Pick<MembershipCommerceState, "audit" | "returnEvents" | "returnSettlementEvents">>;
const orderNumber = (value: string) => /^KD[0-9-]+$/.test(value);

/** Successful original releases only, with complete replay and matching immutable audit.
 * A final released flag or a cancellation preview never supplies an actual amount.
 */
export function selectCancellationRestorations(state: RestorationState, memberId: string,
  releases: Map<string, ReleasedCreditEvidence>, completedOrders: ReadonlySet<string>): RestorationRow[] {
  const reservations = Object.values(state.creditReservations ?? {}).filter(r => r.memberId === memberId && r.amount > 0);
  if (!state.audit || reservations.some(r => {
    const actions = ["credit-reserved", ...(r.status === "reserved" ? [] : [r.status === "released" ? "credit-released" : "credit-consumed"])];
    return actions.some(action => state.audit!.filter(a => a.action === action && a.entityType === "credit-reservation"
      && a.entityId === r.reservationId && a.sourceEvent === r.orderId && a.timestamp === (action === "credit-reserved" ? r.createdAt : r.updatedAt)
      && a.after.amount === r.amount).length !== 1);
  })) return [];
  return reservations.flatMap(r => {
    const effect = releases.get(r.reservationId);
    if (r.status !== "released" || !completedOrders.has(r.orderId) || !orderNumber(r.orderId) || !effect
      || !Number.isSafeInteger(effect.amount) || effect.amount < 0 || effect.amount > r.amount) return [];
    return [{ id: "cancel:" + r.reservationId, orderNumber: r.orderId, date: r.updatedAt, change: effect.amount,
      balanceAfter: effect.balanceAfter, creditEntryIds: [],
      restoration: { kind: "cancel" as const, expectedAmount: r.amount, restoredAmount: effect.amount, expiredAmount: effect.expiredAmount } }];
  });
}

/** Reuses the accepted J.6F.1 integrity validator and APPLIED creditResult.
 * Selected approved scope is the denominator, never the entire order redemption.
 */
export function selectReturnRestorations(state: RestorationState, memberId: string): RestorationRow[] {
  try {
    return projectReturnSettlements(state).flatMap(effect => {
      const result = effect.creditResult;
      if (effect.effectType !== "member_credit_restore" || effect.status !== "applied" || !result
        || result.memberId !== memberId || result.selectedAmount <= 0 || !orderNumber(effect.orderId)) return [];
      return [{ id: "return:" + effect.effectId, orderNumber: effect.orderId, date: result.settledAt,
        change: result.restoredAmount, balanceAfter: null,
        creditEntryIds: result.entries.flatMap(entry => entry.restoredCreditEntryId ? [entry.restoredCreditEntryId] : []),
        restoration: { kind: "return" as const, expectedAmount: result.selectedAmount, restoredAmount: result.restoredAmount, expiredAmount: result.expiredAmount } }];
    });
  } catch { return []; } // Corrupt/legacy evidence cannot authorize a fabricated restoration row.
}
