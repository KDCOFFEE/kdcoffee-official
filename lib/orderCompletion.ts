import { getActiveMembershipRules } from "./membershipBusinessRules";
type Order = Record<string, unknown>;
export type OrderCompletionSnapshot = {
  schemaVersion: 1; eventId: string; completedAt: string; timeZone: "Asia/Taipei";
  returnProtectionDaysSnapshot: number; rulesVersion: number; returnDeadline: string;
};
export class OrderCompletionIntegrityError extends Error {
  readonly status = 409;
  constructor(message: string) { super(message); this.name = "OrderCompletionIntegrityError"; }
}
function records(value: unknown): Order[] {
  return Array.isArray(value) ? value.filter((item): item is Order => !!item && typeof item === "object") : [];
}
export function hasOrderCompletion(order: Order) {
  return order.status === "completed" || order.completion !== undefined || order.completedAt !== undefined
    || records(order.statusHistory).some(event => event.to === "completed")
    || records(order.fulfillmentEvents).some(event => event.state === "completed");
}
export function returnDeadlineAtTaipeiDayEnd(completedAt: string, days: number) {
  const instant = Date.parse(completedAt);
  if (!Number.isFinite(instant) || !Number.isSafeInteger(days) || days < 0 || days > 365) throw new OrderCompletionIntegrityError("Invalid completion return window");
  const local = new Date(instant + 8 * 60 * 60 * 1000);
  const deadline = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days + 1) - 8 * 60 * 60 * 1000 - 1;
  return new Date(deadline).toISOString();
}
export function assertOrderCompletionPreserved(previous: Order, next: Order) {
  if (!hasOrderCompletion(previous)) return;
  if (next.status !== "completed") throw new OrderCompletionIntegrityError("已完成訂單不可變更為其他狀態；退貨須使用獨立追加紀錄。");
  for (const field of ["completedAt", "completion"]) {
    if (previous[field] !== undefined && JSON.stringify(previous[field]) !== JSON.stringify(next[field])) throw new OrderCompletionIntegrityError("不可修改已保存的完成事實或退貨期限");
  }
  for (const [field, marker] of [["statusHistory", "to"], ["fulfillmentEvents", "state"]] as const) {
    const current = records(next[field]);
    for (const event of records(previous[field]).filter(item => item[marker] === "completed")) {
      if (!current.some(item => JSON.stringify(item) === JSON.stringify(event))) throw new OrderCompletionIntegrityError("不可刪除或改寫完成事件");
    }
  }
}
export async function prepareOrderCompletionWrite(previous: Order, next: Order): Promise<Order> {
  assertOrderCompletionPreserved(previous, next);
  // Historical completed orders are not backfilled or assigned guessed dates.
  if (hasOrderCompletion(previous) || next.status !== "completed") return next;
  const event = records(next.fulfillmentEvents).filter(item => item.state === "completed").at(-1);
  const history = records(next.statusHistory).filter(item => item.to === "completed").at(-1);
  const completedAt = String(event?.occurredAt ?? history?.at ?? new Date().toISOString());
  if (!Number.isFinite(Date.parse(completedAt))) throw new OrderCompletionIntegrityError("完成時間無效");
  const rules = await getActiveMembershipRules(new Date(completedAt));
  const completion: OrderCompletionSnapshot = {
    schemaVersion: 1, eventId: String(event?.eventId ?? "completion:" + next.orderNumber),
    completedAt, timeZone: "Asia/Taipei", rulesVersion: rules.rulesVersion,
    returnProtectionDaysSnapshot: rules.rules.referral.referralRewardReturnProtectionDays,
    returnDeadline: returnDeadlineAtTaipeiDayEnd(completedAt, rules.rules.referral.referralRewardReturnProtectionDays),
  };
  return { ...next, completedAt, completion };
}
