import type { StoredOrder } from "./adminOrders";
import { effectiveCreditRemaining, type MembershipCommerceState } from "./membershipCommerce";
import { isOriginalCreditExpired } from "./creditSourceExpiry";

/** Safe display DTO: no source IDs, allocations, metadata or account balance. */
export type CancelCreditPreview = {
  status: "none" | "ready" | "unavailable";
  originalAmount: number | null;
  restorableAmount: number | null;
  expiredAmount: number | null;
  otherUnavailableAmount: number | null;
  entries: Array<{ amount: number; restorableAmount: number; expiresAt: string; expired: boolean }>;
  generatedAt: string;
};
const money = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
export function unavailableCancelCreditPreview(now: Date, amount: number | null = null): CancelCreditPreview {
  return { status: "unavailable", originalAmount: amount, restorableAmount: null, expiredAmount: null,
    otherUnavailableAmount: null, entries: [], generatedAt: now.toISOString() };
}

/** Simulates only the existing release's source contribution, never writes or settles.
 * Cancellation still independently uses the original canonical release at server time.
 */
export function buildCancelCreditPreview(order: StoredOrder, state: MembershipCommerceState, memberId: string, now: Date): CancelCreditPreview {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid preview clock");
  const raw = order.credit?.appliedAmount ?? order.creditApplied;
  const amount = money(raw) ? raw : null;
  const unknown = () => unavailableCancelCreditPreview(now, amount);
  if (!memberId || order.member?.memberId !== memberId) return unavailableCancelCreditPreview(now);
  // Match the canonical order-wide selector. Multiple identities are not safe evidence.
  const reservations = Object.values(state.creditReservations).filter(r => r.orderId === order.orderNumber);
  if ((!reservations.length && (raw === undefined || raw === 0))
    || (raw === 0 && reservations.length === 1 && reservations[0].memberId === memberId && reservations[0].amount === 0)) {
    return { status: "none", originalAmount: 0, restorableAmount: 0, expiredAmount: 0, otherUnavailableAmount: 0, entries: [], generatedAt: now.toISOString() };
  }
  if (reservations.length !== 1 || amount === null || !amount) return unknown();
  const reservation = reservations[0];
  if (state.creditReservations[reservation.reservationId] !== reservation || reservation.memberId !== memberId || reservation.status !== "reserved" || reservation.amount !== amount
    || (order.credit?.reservationId && order.credit.reservationId !== reservation.reservationId)
    || !Array.isArray(reservation.allocations) || !reservation.allocations.length
    || new Set(reservation.allocations.map(a => a.creditEntryId)).size !== reservation.allocations.length
    || reservation.allocations.some(a => !money(a.amount) || !a.amount)
    || reservation.allocations.reduce((sum, a) => sum + a.amount, 0) !== amount) return unknown();
  // Validate all Owner debit evidence used by effectiveCreditRemaining. Missing evidence
  // cannot safely promise availability merely because a source has not expired.
  for (const entry of Object.values(state.creditEntries)) {
    if (!entry.sourceReference.startsWith("admin_credit_adjustment:deduct:")) continue;
    if (!Array.isArray(entry.adjustmentAllocations) || entry.adjustmentAllocations.some(a => !money(a.amount) || !a.amount
      || !state.creditEntries[a.creditEntryId] || state.creditEntries[a.creditEntryId].memberId !== entry.memberId)) return unknown();
  }
  const entries: CancelCreditPreview["entries"] = [];
  for (const allocation of reservation.allocations) {
    const entry = state.creditEntries[allocation.creditEntryId];
    if (!entry || entry.creditEntryId !== allocation.creditEntryId || entry.memberId !== memberId
      || !money(entry.amount) || allocation.amount > entry.amount || !money(entry.remainingAmount)
      || !money(entry.remainingAmount + allocation.amount) || entry.remainingAmount + allocation.amount > entry.amount
      || !Number.isFinite(Date.parse(entry.expiresAt))
      || !["available", "reserved", "consumed", "expired"].includes(entry.status)) return unknown();
    const expired = isOriginalCreditExpired(entry.expiresAt, now);
    const released = { ...entry, remainingAmount: entry.remainingAmount + allocation.amount,
      status: expired ? "expired" as const : "available" as const };
    const restored = effectiveCreditRemaining(state, released, now) - effectiveCreditRemaining(state, entry, now);
    if (!money(restored) || restored > allocation.amount) return unknown();
    entries.push({ amount: allocation.amount, restorableAmount: restored, expiresAt: entry.expiresAt, expired });
  }
  const restorableAmount = entries.reduce((sum, e) => sum + e.restorableAmount, 0);
  const expiredAmount = entries.filter(e => e.expired).reduce((sum, e) => sum + e.amount, 0);
  return { status: "ready", originalAmount: amount, restorableAmount, expiredAmount,
    otherUnavailableAmount: amount - restorableAmount - expiredAmount, entries, generatedAt: now.toISOString() };
}
