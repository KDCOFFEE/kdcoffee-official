/** Read-only reservation projection. Never calls any settlement or persistence API. */
export type MemberCreditTransaction = {
  source: "creditReservations";
  eventId: string;
  orderNumber: string | null;
  amount: number;
  status: "reserved" | "consumed" | "released";
  reservedAt: string | null;
  statusRecordedAt: string | null;
};
export const creditTransactionLabels = {
  reserved: "訂單抵用金保留",
  consumed: "訂單正式結算使用",
  released: "訂單保留已釋放／取消",
} as const;
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const date = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)) ? v : null;

/** One lifecycle row per reservation, not one debit for every status transition.
 * updatedAt proves a recorded status time, not an independently verified consume time.
 * Missing dates remain null. Conflicting duplicate identities are omitted.
 */
export function selectMemberCreditTransactions(state: { creditReservations?: unknown }, memberId: string): MemberCreditTransaction[] {
  if (!memberId) return [];
  const byId = new Map<string, MemberCreditTransaction>();
  const conflicts = new Set<string>();
  for (const value of Object.values(record(state.creditReservations))) {
    const item = record(value);
    if (item.memberId !== memberId || typeof item.reservationId !== "string" || !item.reservationId || item.reservationId.length > 500
      || !Number.isSafeInteger(item.amount) || Number(item.amount) <= 0
      || !["reserved", "consumed", "released"].includes(String(item.status))) continue;
    const row: MemberCreditTransaction = {
      source: "creditReservations", eventId: item.reservationId,
      orderNumber: typeof item.orderId === "string" && /^KD[0-9-]+$/.test(item.orderId) ? item.orderId : null,
      amount: Number(item.amount), status: item.status as MemberCreditTransaction["status"],
      reservedAt: date(item.createdAt), statusRecordedAt: date(item.updatedAt),
    };
    const previous = byId.get(row.eventId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) conflicts.add(row.eventId);
    byId.set(row.eventId, row);
  }
  return [...byId.values()].filter(row => !conflicts.has(row.eventId));
}
