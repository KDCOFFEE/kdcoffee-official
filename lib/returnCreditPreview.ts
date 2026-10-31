import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { CustomerNotificationPhoto } from "./customerNotifications";
import type { MembershipCommerceState } from "./membershipCommerce";
import { cumulativeOriginalLineContribution, originalEconomicFingerprint, type ResolvedOrderEconomicAllocation } from "./orderRewardBasis";
import { resolveOrderEconomicAllocation } from "./orderCompletion";
import { normalizeReturnCommand, projectOrderReturns, returnCommandConflict, type ReturnCommandEvidence, type ReturnSelection } from "./orderReturns";

export const RETURN_CREDIT_ALLOCATION_POLICY = "original-consumed-later-expiry-first-v1";
export type ReturnCreditEntry = { creditEntryId: string; amount: number; expiresAt: string; classification: "restorable" | "expired_not_restorable" };
export type ReturnConfirmationPreview = {
  schemaVersion: 1; policy: typeof RETURN_CREDIT_ALLOCATION_POLICY; sourceOrderId: string;
  actorId: string; lines: Array<ReturnSelection & { attributedCreditAmount: number }>;
  returnDeadline: string; returnCreditAmount: number; restorableCreditAmount: number; expiredCreditAmount: number;
  entries: ReturnCreditEntry[]; hasExpiredReturnCredit: boolean; generatedAt: string;
  rewardHoldExpected: boolean; rewardAdjustmentPreview: { status: "review_on_decision"; explanation: string };
  evidenceFingerprint: string; confirmationFingerprint: string;
};
export type ReturnConfirmationSnapshot = { preview: ReturnConfirmationPreview; tokenDigest: string; confirmedAt: string; quantityAcknowledged: true; supportingPhotos?: CustomerNotificationPhoto[] };
export class ReturnWorkflowError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 409) { super(code); this.name = "ReturnWorkflowError"; this.code = code; this.status = status; }
}
function fail(code: string): never { throw new ReturnWorkflowError(code); }
const money = (value: number) => Number.isSafeInteger(value) && value >= 0;
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function originalReturnCreditSources(orderId: string, memberId: string, allocation: ResolvedOrderEconomicAllocation, state: MembershipCommerceState) {
  if (allocation.actualRedemptionUsed === 0) return [];
  const reservation = allocation.creditReservationId ? state.creditReservations[allocation.creditReservationId] : undefined;
  if (!reservation || reservation.status !== "consumed" || reservation.orderId !== orderId
    || reservation.memberId !== memberId || reservation.amount !== allocation.actualRedemptionUsed
    || reservation.allocations.reduce((sum, item) => sum + item.amount, 0) !== allocation.actualRedemptionUsed
    || new Set(reservation.allocations.map(item => item.creditEntryId)).size !== reservation.allocations.length) fail("missing_original_consumed_credit");
  return reservation.allocations.map(item => {
    const entry = state.creditEntries[item.creditEntryId];
    if (!money(item.amount) || !entry || entry.memberId !== memberId || entry.amount <= 0 || item.amount > entry.amount
      || !Number.isFinite(Date.parse(entry.expiresAt))) fail("missing_original_credit_expiry");
    return { ...item, expiresAt: entry.expiresAt };
  });
}

/** Only the source order's consumed entries; balances/status are deliberately irrelevant. */
export function allocateOriginalReturnCredit(entries: Array<{ creditEntryId: string; amount: number; expiresAt: string }>, amount: number, now: Date) {
  if (!money(amount) || !Number.isFinite(now.getTime()) || entries.some(item => !item.creditEntryId || !money(item.amount)
    || !Number.isFinite(Date.parse(item.expiresAt))) || new Set(entries.map(item => item.creditEntryId)).size !== entries.length) fail("invalid_original_credit_evidence");
  let remaining = amount;
  const result: ReturnCreditEntry[] = [];
  for (const item of [...entries].sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt) || compareId(a.creditEntryId, b.creditEntryId))) {
    const selected = Math.min(remaining, item.amount);
    if (selected) result.push({ ...item, amount: selected, classification: Date.parse(item.expiresAt) <= now.getTime() ? "expired_not_restorable" : "restorable" });
    remaining -= selected;
  }
  if (remaining) fail("insufficient_original_consumed_credit");
  return result;
}

export function buildReturnConfirmationPreview(input: {
  order: Record<string, unknown>; state: MembershipCommerceState; command: ReturnCommandEvidence;
  memberId: string; now: Date; generatedAt?: string; rewardHoldExpected: boolean;
}): ReturnConfirmationPreview {
  const { order, state, command, now } = input;
  if (command.type !== "RETURN_REQUESTED" || command.reason.length > 200) fail("invalid_input");
  const projection = projectOrderReturns(order, state.returnEvents ?? []);
  if (projection.status !== "resolved") fail(projection.reason);
  const conflict = returnCommandConflict(command, projection, now.toISOString(), String((order.completion as { completedAt: string }).completedAt));
  if (conflict) fail(conflict);
  const allocation = resolveOrderEconomicAllocation(order);
  if (allocation.status !== "resolved") fail("original_economic_evidence_requires_review");
  const original = allocation.actualRedemptionUsed;
  const sources = originalReturnCreditSources(String(order.orderNumber), input.memberId, allocation, state);
  // Active requests retain their exact source allocations. Rejected/withdrawn requests release them.
  const occupied = projection.requests.filter(item => ["pending", "processing", "approved"].includes(item.status));
  const usedByEntry = new Map<string, number>(), usedByLine = new Map<string, number>();
  for (const request of occupied) {
    const event = state.returnEvents?.find(item => item.eventId === request.requestedEventId);
    if (!event || event.type !== "RETURN_REQUESTED") fail("missing_return_evidence");
    const saved = event.confirmation?.preview;
    if (!saved && original > 0) fail("historical_return_credit_requires_review");
    for (const entry of saved?.entries ?? []) usedByEntry.set(entry.creditEntryId, (usedByEntry.get(entry.creditEntryId) ?? 0) + entry.amount);
    for (const line of saved?.lines ?? []) usedByLine.set(line.returnLineRef, (usedByLine.get(line.returnLineRef) ?? 0) + line.attributedCreditAmount);
  }
  const lines = command.lines.map(line => {
    const basis = allocation.lines.find(item => item.returnLineRef === line.returnLineRef)!;
    const quantities = projection.lines.find(item => item.returnLineRef === line.returnLineRef)!;
    const cumulative = quantities.approvedQuantity + quantities.effectivePendingQuantity + line.quantity;
    const amount = cumulativeOriginalLineContribution(basis.allocatedActualRedemption, basis.originalQuantity, cumulative) - (usedByLine.get(line.returnLineRef) ?? 0);
    if (!money(amount)) fail("historical_return_credit_requires_review");
    return { ...line, attributedCreditAmount: amount };
  });
  const available = sources.map(entry => ({ ...entry, amount: entry.amount - (usedByEntry.get(entry.creditEntryId) ?? 0) }));
  const returnCreditAmount = lines.reduce((sum, line) => sum + line.attributedCreditAmount, 0);
  const entries = allocateOriginalReturnCredit(available, returnCreditAmount, now);
  const expiredCreditAmount = entries.filter(item => item.classification === "expired_not_restorable").reduce((sum, item) => sum + item.amount, 0);
  const evidenceFingerprint = originalEconomicFingerprint({ orderId: order.orderNumber, completion: order.completion,
    projection, sources, occupied: occupied.map(item => item.requestedEventId), command, memberId: input.memberId, allocation: allocation.allocationFingerprint });
  const payload = { schemaVersion: 1 as const, policy: RETURN_CREDIT_ALLOCATION_POLICY as typeof RETURN_CREDIT_ALLOCATION_POLICY, sourceOrderId: String(order.orderNumber),
    actorId: command.actor.actorId, lines, returnDeadline: projection.returnDeadline, returnCreditAmount,
    restorableCreditAmount: returnCreditAmount - expiredCreditAmount, expiredCreditAmount, entries,
    hasExpiredReturnCredit: expiredCreditAmount > 0, rewardHoldExpected: input.rewardHoldExpected,
    rewardAdjustmentPreview: { status: "review_on_decision" as const, explanation: "退貨審核時依原始獎勵證據確認；相關待發放獎勵可能暫停或調整。" }, evidenceFingerprint };
  return { ...payload, generatedAt: input.generatedAt ?? now.toISOString(), confirmationFingerprint: originalEconomicFingerprint(payload) };
}

function signingKey() {
  const configured = process.env.AUTH_SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && (!configured || configured.length < 32)) throw new ReturnWorkflowError("confirmation_signing_unavailable", 503);
  return configured || "dev-only-change-this-secret-before-production";
}
export function signReturnPreview(preview: ReturnConfirmationPreview) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update("return-confirmation-v1:" + signingKey()).digest(), nonce);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(preview), "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function verifyReturnPreviewToken(token: unknown, now: Date): ReturnConfirmationPreview {
  if (typeof token !== "string" || token.length > 2000000) fail("invalid_confirmation");
  let preview: ReturnConfirmationPreview;
  const key = createHash("sha256").update("return-confirmation-v1:" + signingKey()).digest();
  try {
    const bytes = Buffer.from(token, "base64url");
    const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    preview = JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString());
  } catch { return fail("invalid_confirmation"); }
  const age = now.getTime() - Date.parse(preview.generatedAt);
  if (!Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) fail("stale_confirmation");
  return preview;
}

export function requestCommand(actorId: string, values: Record<string, unknown>) {
  if (values.quantityAcknowledged !== true || typeof values.reason !== "string" || values.reason.trim().length > 200) fail("invalid_input");
  const command = normalizeReturnCommand({ type: "RETURN_REQUESTED", lines: values.lines as ReturnSelection[],
    conditionAcknowledgement: values.conditionAcknowledgement as { itemsComplete: true; unopenedUnusedWhereApplicable: true } },
    { actorId, authority: "customer" }, values.reason.trim());
  if (!command || command.type !== "RETURN_REQUESTED") fail("invalid_input");
  return command;
}
