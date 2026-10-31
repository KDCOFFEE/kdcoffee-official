import { getActiveMembershipRules, readMembershipRulesStore } from "./membershipBusinessRules";
import { createHash } from "node:crypto";
import { snapshotOrderEconomicAllocation, originalEconomicFingerprint,
  type OrderEconomicAllocationResult, type OriginalRedemptionScope } from "./orderRewardBasis";
type Order = Record<string, unknown>;
type EvidenceJson = null | boolean | number | string | EvidenceJson[] | { [key: string]: EvidenceJson };
export type ReturnLineEvidence = {
  returnLineRef: string;
  ordinal: number;
  originalQuantity: number;
  /** Original transaction fields, including optional IDs, domain, price and PV.
   * Unit price is not a refund quote: order discounts/credit stay in transactionSnapshot. */
  snapshot: { [key: string]: EvidenceJson };
};
export type ReturnLineEvidenceResult =
  | { status: "resolved"; schemaVersion: 1; orderNumber: string; orderCreatedAt: string | null;
      lines: ReturnLineEvidence[]; transactionSnapshot: { [key: string]: EvidenceJson } }
  | { status: "manual_review_required"; schemaVersion: 1;
      reason: "missing_completion_snapshot" | "invalid_order_identity" | "insufficient_line_evidence" | "invalid_saved_evidence" };

/** Canonical JSON only: no catalog, generated IDs, role lookup or pricing evaluation. */
function evidenceJson(value: unknown): EvidenceJson {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(evidenceJson);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, evidenceJson(item)]));
  }
  throw new Error("Invalid evidence JSON");
}
function returnLineRef(orderNumber: string, ordinal: number, snapshot: ReturnLineEvidence["snapshot"]) {
  return "return_line_" + createHash("sha256")
    .update(JSON.stringify(["return-line-v1", orderNumber, ordinal, snapshot])).digest("hex");
}

/** First-completion evidence. Incomplete evidence never blocks an otherwise valid completion. */
export function snapshotReturnLineEvidence(order: Order): ReturnLineEvidenceResult {
  const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  if (!text(order.orderNumber)) return { status: "manual_review_required", schemaVersion: 1, reason: "invalid_order_identity" };
  try {
    if (!Array.isArray(order.items) || !order.items.length) throw new Error("Missing lines");
    const lines = order.items.map((raw, ordinal): ReturnLineEvidence => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid line");
      const line = raw as Order;
      const identified = (text(line.productId) && text(line.variantId))
        || (text(line.slug) && text(line.optionId))
        || (text(line.itemId) && (text(line.skuId) || (Array.isArray(line.components)
          && line.components.length > 0 && line.components.every(component => component
            && text(component.productId) && text(component.skuId)))));
      if (!identified || typeof line.quantity !== "number" || !Number.isSafeInteger(line.quantity) || line.quantity < 1
        || typeof line.unitPrice !== "number" || !Number.isFinite(line.unitPrice) || line.unitPrice < 0
        || (line.lineTotal !== undefined && (typeof line.lineTotal !== "number" || !Number.isFinite(line.lineTotal) || line.lineTotal < 0))) {
        throw new Error("Insufficient line identity/quantity/value");
      }
      const snapshot = evidenceJson(line) as ReturnLineEvidence["snapshot"];
      return { returnLineRef: returnLineRef(String(order.orderNumber), ordinal, snapshot), ordinal,
        originalQuantity: line.quantity, snapshot };
    });
    const transactionSnapshot = evidenceJson(Object.fromEntries([
      "subtotal", "shipping", "codServiceFee", "totalBeforeCredit", "total", "credit", "pricingSnapshot",
      "pricingPolicySnapshot", "pricingPolicyReference",
    ].filter(key => order[key] !== undefined).map(key => [key, order[key]]))) as ReturnLineEvidence["snapshot"];
    return { status: "resolved", schemaVersion: 1, orderNumber: String(order.orderNumber),
      orderCreatedAt: typeof order.createdAt === "string" && Number.isFinite(Date.parse(order.createdAt)) ? order.createdAt : null,
      lines, transactionSnapshot };
  } catch {
    return { status: "manual_review_required", schemaVersion: 1, reason: "insufficient_line_evidence" };
  }
}

/** Reads preserved completion evidence, never today's order lines/catalog. No backfill. */
export function resolveReturnLineEvidence(order: Order): ReturnLineEvidenceResult {
  const completion = order.completion as OrderCompletionSnapshot | undefined;
  const saved = completion?.returnLines;
  if (!saved) return { status: "manual_review_required", schemaVersion: 1, reason: "missing_completion_snapshot" };
  if (saved.schemaVersion === 1 && saved.status === "manual_review_required"
    && ["invalid_order_identity", "insufficient_line_evidence"].includes(saved.reason)) return structuredClone(saved);
  try {
    if (!hasOrderCompletion(order) || saved.status !== "resolved" || saved.schemaVersion !== 1
      || saved.orderNumber !== order.orderNumber || !Array.isArray(saved.lines) || !saved.lines.length) throw new Error("Invalid snapshot");
    const rebuilt = snapshotReturnLineEvidence({ ...saved.transactionSnapshot, orderNumber: saved.orderNumber,
      createdAt: saved.orderCreatedAt, items: saved.lines.map(line => line.snapshot) });
    if (JSON.stringify(evidenceJson(rebuilt)) !== JSON.stringify(evidenceJson(saved))) throw new Error("Invalid line reference");
    return structuredClone(saved);
  } catch {
    return { status: "manual_review_required", schemaVersion: 1, reason: "invalid_saved_evidence" };
  }
}

/** Historical resolution is read-only. Saved return lines take precedence over mutable
 * order fields. Without a completion line snapshot, only persisted original transaction
 * fields are considered. No active rule or catalog lookup is performed. */
export function resolveOrderEconomicAllocation(order: Order): OrderEconomicAllocationResult {
  if (!hasOrderCompletion(order)) return { status: "manual_review_required", schemaVersion: 1, reason: "order_not_completed" };
  const completion = order.completion as OrderCompletionSnapshot | undefined;
  const lines = completion?.returnLines === undefined ? snapshotReturnLineEvidence(order) : resolveReturnLineEvidence(order);
  const saved = completion?.economicAllocation;
  if (saved === undefined) return snapshotOrderEconomicAllocation(lines);
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return { status: "manual_review_required", schemaVersion: 1, reason: "invalid_saved_allocation" };
  if (saved.status === "manual_review_required") {
    // A saved failure never becomes success by consulting newer mutable evidence.
    return saved.schemaVersion === 1 && typeof saved.reason === "string"
      ? structuredClone(saved) : { status: "manual_review_required", schemaVersion: 1, reason: "invalid_saved_allocation" };
  }
  const rebuilt = snapshotOrderEconomicAllocation(lines, saved.redemptionScope);
  return originalEconomicFingerprint(rebuilt) === originalEconomicFingerprint(saved)
    ? structuredClone(saved) : { status: "manual_review_required", schemaVersion: 1, reason: "invalid_saved_allocation" };
}
export type OrderCompletionSnapshot = {
  schemaVersion: 1; eventId: string; completedAt: string; timeZone: "Asia/Taipei";
  returnProtectionDaysSnapshot: number; rulesVersion: number; returnDeadline: string;
  /** Additive evidence for new completions only; absent on historical snapshots. */
  returnLines?: ReturnLineEvidenceResult;
  /** D0 evidence for NEW completions only; covered by the same immutability guard. */
  economicAllocation?: OrderEconomicAllocationResult;
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
  const returnLines = snapshotReturnLineEvidence(next);
  let originalScope: OriginalRedemptionScope | null = null;
  const credit = next.credit as Order | undefined;
  if (typeof credit?.appliedAmount === "number" && credit.appliedAmount > 0 && Number(next.shipping) > 0
    && Number.isSafeInteger(credit.rulesVersion)) {
    // Select the ORIGINAL decision's exact version, never the completion/current cap.
    const original = (await readMembershipRulesStore()).versions.find(version => version.rulesVersion === credit.rulesVersion);
    if (original?.rules.credit.appliesToShipping === "no") originalScope = { appliesToShipping: "no", rulesVersion: original.rulesVersion };
  }
  const completion: OrderCompletionSnapshot = {
    schemaVersion: 1, eventId: String(event?.eventId ?? "completion:" + next.orderNumber),
    completedAt, timeZone: "Asia/Taipei", rulesVersion: rules.rulesVersion,
    returnProtectionDaysSnapshot: rules.rules.referral.referralRewardReturnProtectionDays,
    returnDeadline: returnDeadlineAtTaipeiDayEnd(completedAt, rules.rules.referral.referralRewardReturnProtectionDays),
    returnLines,
    economicAllocation: snapshotOrderEconomicAllocation(returnLines, originalScope),
  };
  return { ...next, completedAt, completion };
}
