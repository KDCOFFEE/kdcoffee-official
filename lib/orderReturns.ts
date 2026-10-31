import { isDeepStrictEqual } from "node:util";
import { resolveReturnLineEvidence, type OrderCompletionSnapshot } from "./orderCompletion";
import type { ReturnConfirmationSnapshot } from "./returnCreditPreview";
import { originalEconomicFingerprint } from "./orderRewardBasis";

// Return-domain evidence and pure replay only. Persistence belongs to membershipCommerce.
export type ReturnActor = { actorId: string; authority: "customer" | "reviewer" };
export type ReturnConditionAcknowledgement = { itemsComplete: true; unopenedUnusedWhereApplicable: true };
export type ReturnSelection = { returnLineRef: string; quantity: number };
export type ReturnCommand =
  | { type: "RETURN_REQUESTED"; lines: ReturnSelection[]; conditionAcknowledgement: ReturnConditionAcknowledgement }
  | { type: "RETURN_PROCESSING_LOCKED" | "RETURN_WITHDRAWN" | "RETURN_APPROVED" | "RETURN_REJECTED"; returnRequestId: string };
export type ReturnCommandEvidence = ReturnCommand & { actor: ReturnActor; reason: string };
type ReturnEventBase = {
  schemaVersion: 1; eventId: string; returnRequestId: string; orderId: string;
  actor: ReturnActor; source: "return_service"; occurredAt: string; recordedAt: string;
  idempotencyKey: string; commandFingerprint: string; previousEventId: string | null; reason: string;
};
export type ReturnDomainEvent = ReturnEventBase & (
  | { type: "RETURN_REQUESTED"; completion: OrderCompletionSnapshot;
      lines: Array<ReturnSelection & { originalQuantity: number }>;
      confirmation?: ReturnConfirmationSnapshot;
      conditionAcknowledgement: ReturnConditionAcknowledgement }
  | { type: "RETURN_PROCESSING_LOCKED" | "RETURN_WITHDRAWN" | "RETURN_APPROVED" | "RETURN_REJECTED" }
);
export type ReturnRequestStatus = "pending" | "processing" | "approved" | "rejected" | "withdrawn";
export type ReturnRequestProjection = {
  returnRequestId: string; requestedEventId: string; lastEventId: string; requestedBy: string;
  status: ReturnRequestStatus; withdrawable: boolean; occurredAt: string; lastOccurredAt: string;
  lines: Array<ReturnSelection & { originalQuantity: number }>; eventIds: string[];
};
export type ReturnQuantityProjection = {
  returnLineRef: string; originalQuantity: number; approvedQuantity: number;
  effectivePendingQuantity: number; remainingReturnableQuantity: number;
};
export type OrderReturnProjection = {
  status: "resolved"; orderId: string; completionEventId: string; returnDeadline: string;
  lines: ReturnQuantityProjection[]; requests: ReturnRequestProjection[];
};
export type ReturnEligibilityFailure =
  | { status: "not_eligible"; reason: "order_not_completed" | "return_deadline_expired" | "invalid_clock" }
  | { status: "manual_review_required"; reason: "missing_completion_evidence" | "invalid_completion_evidence" | "line_evidence_requires_review" };
export type ReturnConflictReason = "invalid_input" | "not_authorized" | "idempotency_conflict"
  | "quantity_exceeded" | "unknown_line" | "request_not_found" | "invalid_transition" | "invalid_clock";
export type ReturnCommandResult = ReturnEligibilityFailure
  | { status: "conflict"; reason: ReturnConflictReason }
  | { status: "applied"; replayed: boolean; event: ReturnDomainEvent; projection: OrderReturnProjection };

export class ReturnDomainIntegrityError extends Error {
  constructor(message: string) { super(message); this.name = "ReturnDomainIntegrityError"; }
}
export function returnEvidenceText(value: unknown, max = 1000): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= max
    && !/[\u0000-\u001f\u007f]/u.test(value);
}
function validInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function actorValid(actor: ReturnActor) {
  return actor && returnEvidenceText(actor.actorId, 200) && ["customer", "reviewer"].includes(actor.authority);
}
function conditionValid(value: ReturnConditionAcknowledgement) {
  return value?.itemsComplete === true && value.unopenedUnusedWhereApplicable === true;
}

/** Strictly select canonical command fields. No caller-supplied original quantities or prices. */
export function normalizeReturnCommand(command: ReturnCommand, actor: ReturnActor, reason: string): ReturnCommandEvidence | null {
  if (!actorValid(actor) || !returnEvidenceText(reason) || !command) return null;
  const base = { actor: { actorId: actor.actorId, authority: actor.authority }, reason };
  if (command.type === "RETURN_REQUESTED") {
    if (!conditionValid(command.conditionAcknowledgement) || !Array.isArray(command.lines)
      || !command.lines.length || command.lines.length > 1000) return null;
    const refs = new Set<string>();
    const lines: ReturnSelection[] = [];
    for (const line of command.lines) {
      if (!line || !returnEvidenceText(line.returnLineRef, 200) || !Number.isSafeInteger(line.quantity)
        || line.quantity < 1 || refs.has(line.returnLineRef)) return null;
      refs.add(line.returnLineRef); lines.push({ returnLineRef: line.returnLineRef, quantity: line.quantity });
    }
    lines.sort((left, right) => left.returnLineRef < right.returnLineRef ? -1 : left.returnLineRef > right.returnLineRef ? 1 : 0);
    return { ...base, type: command.type, lines,
      conditionAcknowledgement: { itemsComplete: true, unopenedUnusedWhereApplicable: true } };
  }
  if (!["RETURN_PROCESSING_LOCKED", "RETURN_WITHDRAWN", "RETURN_APPROVED", "RETURN_REJECTED"].includes(command.type)
    || !returnEvidenceText(command.returnRequestId, 200)) return null;
  return { ...base, type: command.type, returnRequestId: command.returnRequestId };
}

/** No current rules/catalog access; review/withdrawal of an accepted request has no new deadline gate. */
export function preservedReturnCompletion(order: Record<string, unknown>):
  | { status: "resolved"; completion: OrderCompletionSnapshot }
  | ReturnEligibilityFailure {
  if (order.status !== "completed") return { status: "not_eligible", reason: "order_not_completed" };
  const completion = order.completion as OrderCompletionSnapshot | undefined;
  if (!completion) return { status: "manual_review_required", reason: "missing_completion_evidence" };
  if (completion.schemaVersion !== 1 || !returnEvidenceText(completion.eventId, 200)
    || !validInstant(completion.completedAt) || !validInstant(completion.returnDeadline)
    || Date.parse(completion.returnDeadline) < Date.parse(completion.completedAt)
    || (order.completedAt !== undefined && order.completedAt !== completion.completedAt)
    || !Number.isSafeInteger(completion.rulesVersion) || completion.rulesVersion < 1
    || !Number.isSafeInteger(completion.returnProtectionDaysSnapshot) || completion.returnProtectionDaysSnapshot < 0
    || completion.timeZone !== "Asia/Taipei") return { status: "manual_review_required", reason: "invalid_completion_evidence" };
  if (resolveReturnLineEvidence(order).status !== "resolved") return { status: "manual_review_required", reason: "line_evidence_requires_review" };
  return { status: "resolved", completion: structuredClone(completion) };
}

type Replay = { completion: OrderCompletionSnapshot; projection: OrderReturnProjection };
function emptyProjection(orderId: string, completion: OrderCompletionSnapshot): OrderReturnProjection {
  const evidence = completion.returnLines;
  if (evidence?.status !== "resolved") throw new ReturnDomainIntegrityError("Missing immutable return lines");
  return { status: "resolved", orderId, completionEventId: completion.eventId, returnDeadline: completion.returnDeadline,
    requests: [], lines: evidence.lines.map(line => ({ returnLineRef: line.returnLineRef, originalQuantity: line.originalQuantity,
      approvedQuantity: 0, effectivePendingQuantity: 0, remainingReturnableQuantity: line.originalQuantity })) };
}
function integrity(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ReturnDomainIntegrityError(message);
}

/** Persisted array order is authoritative. Timestamps never reorder concurrent decisions. */
function replayReturnEvents(events: readonly ReturnDomainEvent[]): Map<string, Replay> {
  const orders = new Map<string, Replay>();
  const eventIds = new Set<string>(), idempotencyKeys = new Set<string>();
  for (const event of events) {
    integrity(event && event.schemaVersion === 1 && returnEvidenceText(event.eventId, 200)
      && returnEvidenceText(event.returnRequestId, 200) && returnEvidenceText(event.orderId, 200)
      && actorValid(event.actor) && event.source === "return_service" && returnEvidenceText(event.reason)
      && validInstant(event.occurredAt) && validInstant(event.recordedAt)
      && Date.parse(event.recordedAt) >= Date.parse(event.occurredAt)
      && returnEvidenceText(event.idempotencyKey, 1000) && /^[a-f0-9]{64}$/u.test(event.commandFingerprint), "Invalid return event");
    integrity(!eventIds.has(event.eventId) && !idempotencyKeys.has(event.idempotencyKey), "Duplicate return event/operation");
    eventIds.add(event.eventId); idempotencyKeys.add(event.idempotencyKey);
    let context = orders.get(event.orderId);
    if (event.type === "RETURN_REQUESTED") {
      const proof = preservedReturnCompletion({ orderNumber: event.orderId, status: "completed", completion: event.completion });
      integrity(proof.status === "resolved", "Invalid requested completion evidence");
      if (!context) {
        context = { completion: proof.completion, projection: emptyProjection(event.orderId, proof.completion) };
        orders.set(event.orderId, context);
      }
      integrity(isDeepStrictEqual(context.completion, event.completion), "Completion evidence changed across requests");
      integrity(event.previousEventId === null && event.actor.authority === "customer"
        && conditionValid(event.conditionAcknowledgement) && Array.isArray(event.lines) && event.lines.length > 0
        && Date.parse(event.occurredAt) >= Date.parse(event.completion.completedAt)
        && Date.parse(event.occurredAt) <= Date.parse(event.completion.returnDeadline), "Invalid return request evidence");
      integrity(!context.projection.requests.some(request => request.returnRequestId === event.returnRequestId), "Duplicate return request");
      if (event.confirmation) {
        const saved = event.confirmation, preview = saved.preview;
        integrity(saved.supportingPhotos === undefined || (Array.isArray(saved.supportingPhotos) && saved.supportingPhotos.length <= 3
          && saved.supportingPhotos.every(photo => photo.mimeType === "image/webp" && /^\/uploads\/order-notifications\/[0-9a-f-]{36}\.webp$/iu.test(photo.url)
            && [photo.bytes, photo.width, photo.height].every(value => Number.isSafeInteger(value) && value > 0))), "Invalid return photo references");
        const { generatedAt, confirmationFingerprint, ...payload } = preview;
        integrity(saved.quantityAcknowledged === true && saved.confirmedAt === event.occurredAt
          && /^[a-f0-9]{64}$/u.test(saved.tokenDigest) && preview.schemaVersion === 1
          && preview.policy === "original-consumed-later-expiry-first-v1"
          && validInstant(generatedAt) && Date.parse(generatedAt) <= Date.parse(saved.confirmedAt)
          && Date.parse(saved.confirmedAt) - Date.parse(generatedAt) <= 600000
          && preview.sourceOrderId === event.orderId && preview.actorId === event.actor.actorId
          && preview.returnDeadline === event.completion.returnDeadline
          && originalEconomicFingerprint(payload) === confirmationFingerprint
          && preview.lines.length === event.lines.length
          && preview.lines.every(line => event.lines.some(item => item.returnLineRef === line.returnLineRef && item.quantity === line.quantity)
            && Number.isSafeInteger(line.attributedCreditAmount) && line.attributedCreditAmount >= 0)
          && preview.entries.every(entry => returnEvidenceText(entry.creditEntryId, 200) && validInstant(entry.expiresAt)
            && Number.isSafeInteger(entry.amount) && entry.amount > 0
            && entry.classification === (Date.parse(entry.expiresAt) <= Date.parse(generatedAt) ? "expired_not_restorable" : "restorable"))
          && new Set(preview.entries.map(entry => entry.creditEntryId)).size === preview.entries.length
          && preview.returnCreditAmount === preview.lines.reduce((sum, line) => sum + line.attributedCreditAmount, 0)
          && preview.returnCreditAmount === preview.entries.reduce((sum, entry) => sum + entry.amount, 0)
          && preview.expiredCreditAmount === preview.entries.filter(entry => entry.classification === "expired_not_restorable").reduce((sum, entry) => sum + entry.amount, 0)
          && preview.restorableCreditAmount === preview.returnCreditAmount - preview.expiredCreditAmount
          && preview.hasExpiredReturnCredit === (preview.expiredCreditAmount > 0), "Invalid return confirmation evidence");
      }
      const refs = new Set<string>();
      for (const line of event.lines) {
        const original = context.projection.lines.find(item => item.returnLineRef === line.returnLineRef);
        integrity(original && !refs.has(line.returnLineRef) && line.originalQuantity === original.originalQuantity
          && Number.isSafeInteger(line.quantity) && line.quantity > 0
          && line.quantity <= original.remainingReturnableQuantity, "Return quantity/identity exceeds preserved evidence");
        refs.add(line.returnLineRef);
        original.effectivePendingQuantity += line.quantity;
        original.remainingReturnableQuantity -= line.quantity;
      }
      context.projection.requests.push({ returnRequestId: event.returnRequestId, requestedEventId: event.eventId,
        lastEventId: event.eventId, requestedBy: event.actor.actorId, status: "pending", withdrawable: true,
        occurredAt: event.occurredAt, lastOccurredAt: event.occurredAt, lines: structuredClone(event.lines), eventIds: [event.eventId] });
    } else {
      const request = context?.projection.requests.find(item => item.returnRequestId === event.returnRequestId);
      integrity(context && request && event.previousEventId === request.lastEventId
        && Date.parse(event.occurredAt) >= Date.parse(request.lastOccurredAt), "Broken return event chain");
      integrity(request.status === "pending" || request.status === "processing", "Return request already terminal");
      if (event.type === "RETURN_WITHDRAWN") {
        integrity(request.withdrawable && event.actor.authority === "customer" && event.actor.actorId === request.requestedBy, "Return is not withdrawable by actor");
        request.status = "withdrawn";
      } else {
        integrity(event.actor.authority === "reviewer", "Reviewer authority required");
        if (event.type === "RETURN_PROCESSING_LOCKED") {
          integrity(request.status === "pending", "Processing already locked"); request.status = "processing";
        } else if (event.type === "RETURN_APPROVED") request.status = "approved";
        else { integrity(event.type === "RETURN_REJECTED", "Unknown return event type"); request.status = "rejected"; }
      }
      if (request.status !== "processing") {
        for (const line of request.lines) {
          const original = context.projection.lines.find(item => item.returnLineRef === line.returnLineRef)!;
          original.effectivePendingQuantity -= line.quantity;
          if (request.status === "approved") original.approvedQuantity += line.quantity;
          original.remainingReturnableQuantity = original.originalQuantity - original.approvedQuantity - original.effectivePendingQuantity;
          integrity(original.remainingReturnableQuantity >= 0 && original.effectivePendingQuantity >= 0, "Return quantity overflow");
        }
      }
      request.withdrawable = false; request.lastEventId = event.eventId;
      request.lastOccurredAt = event.occurredAt; request.eventIds.push(event.eventId);
    }
  }
  return orders;
}

export function validateReturnEventLog(value: unknown): asserts value is ReturnDomainEvent[] {
  integrity(Array.isArray(value), "Invalid return event collection");
  replayReturnEvents(value);
}
export function assertReturnEventsPreserved(previous: readonly ReturnDomainEvent[], next: readonly ReturnDomainEvent[]) {
  integrity(Array.isArray(next) && next.length >= previous.length
    && isDeepStrictEqual(previous, next.slice(0, previous.length)), "Return history must remain append-only");
}
export function projectOrderReturns(order: Record<string, unknown>, events: readonly ReturnDomainEvent[]): OrderReturnProjection | ReturnEligibilityFailure {
  const proof = preservedReturnCompletion(order);
  if (proof.status !== "resolved") return proof;
  const replay = replayReturnEvents(events).get(String(order.orderNumber));
  if (!replay) return emptyProjection(String(order.orderNumber), proof.completion);
  integrity(isDeepStrictEqual(proof.completion, replay.completion), "Canonical completion differs from return evidence");
  return structuredClone(replay.projection);
}

/** Validate a command against the freshly replayed projection inside the existing commerce lock. */
export function returnCommandConflict(command: ReturnCommandEvidence, projection: OrderReturnProjection,
  now: string, completedAt: string): ReturnConflictReason | "return_deadline_expired" | null {
  if (!validInstant(now) || Date.parse(now) < Date.parse(completedAt)) return "invalid_clock";
  if (command.type === "RETURN_REQUESTED") {
    if (command.actor.authority !== "customer") return "not_authorized";
    if (Date.parse(now) > Date.parse(projection.returnDeadline)) return "return_deadline_expired";
    for (const line of command.lines) {
      const original = projection.lines.find(item => item.returnLineRef === line.returnLineRef);
      if (!original) return "unknown_line";
      if (line.quantity > original.remainingReturnableQuantity) return "quantity_exceeded";
    }
    return null;
  }
  const request = projection.requests.find(item => item.returnRequestId === command.returnRequestId);
  if (!request) return "request_not_found";
  if (Date.parse(now) < Date.parse(request.lastOccurredAt)) return "invalid_clock";
  if (command.type === "RETURN_WITHDRAWN") {
    if (command.actor.authority !== "customer" || command.actor.actorId !== request.requestedBy) return "not_authorized";
    return request.withdrawable ? null : "invalid_transition";
  }
  if (command.actor.authority !== "reviewer") return "not_authorized";
  if (request.status !== "pending" && request.status !== "processing") return "invalid_transition";
  return command.type === "RETURN_PROCESSING_LOCKED" && request.status !== "pending" ? "invalid_transition" : null;
}
