import { allocateApprovedReturnPayment } from "./returnPaymentAllocation";
import type { ReturnPaymentResult } from "./returnPaymentResult";
import { approvedReturnCreditSelection } from "./returnCreditSelection";
import { isDeepStrictEqual } from "node:util";
import { originalEconomicFingerprint as fingerprint } from "./orderRewardBasis";
import { approvedReturnLines, type ReturnDomainEvent } from "./orderReturns";
import { receiptDemandHash, type InventoryReceipt } from "./inventoryReceipts";

export type SettlementEffectType = "inventory_restore" | "member_credit_restore" | "payment_refund";
export type SettlementPlan = {
  version: 1; effectId: string; idempotencyKey: string; orderId: string; returnRequestId: string;
  approvedEventId: string; returnLineRef: string | null; approvedQuantity: number;
  effectType: SettlementEffectType; plannedQuantity: number | null; plannedAmount: null;
  createdAt: string; sourceFingerprint: string;
};
export type CreditSettlementResult = {
  memberId: string; selectedAmount: number; restoredAmount: number; expiredAmount: number; settledAt: string;
  entries: Array<{ creditEntryId: string; amount: number; expiresAt: string; restoredAmount: number; expiredAmount: number; restoredCreditEntryId: string | null }>;
};
export type SettlementEvent = {
  sequence: number; previousHash: string | null; hash: string; effectId: string; recordedAt: string;
  type: "PLANNED" | "APPLIED" | "FAILED" | "MANUAL_REVIEW_REQUIRED" | "NOTIFIED";
  paymentResult?: ReturnPaymentResult; notification?: "sent"|"failed"|"disabled";
  plan?: SettlementPlan; receipt?: InventoryReceipt; creditResult?: CreditSettlementResult; reason?: string;
};
export type SettlementState = { returnEvents?: ReturnDomainEvent[]; returnSettlementEvents?: SettlementEvent[];
  creditEntries?: Record<string,{memberId:string;amount:number;expiresAt:string;sourceType:string;sourceReference:string;metadata:Record<string,string|number|boolean>}>;
  creditReservations?: Record<string,{orderId?:string;memberId:string;status:string;amount:number;allocations:Array<{creditEntryId:string;amount:number}>}>;
};
export type SettlementEffect = SettlementPlan & {
  status: "pending" | "applied" | "failed" | "manual_review_required" | "pending_future_settlement";
  paymentResult?: ReturnPaymentResult; notification?: "sent"|"failed"|"disabled";
  appliedAt: string | null; receipt?: InventoryReceipt; creditResult?: CreditSettlementResult; reason?: string; attempts: number;
};
export class ReturnSettlementIntegrityError extends Error {}
function requireEvidence(condition: unknown): asserts condition { if (!condition) throw new ReturnSettlementIntegrityError("Invalid return settlement evidence"); }
function plans(state: SettlementState, approval: Extract<ReturnDomainEvent, { type: "RETURN_APPROVED" }>): SettlementPlan[] {
  const request = state.returnEvents?.find(event => event.type === "RETURN_REQUESTED" && event.returnRequestId === approval.returnRequestId && event.orderId === approval.orderId);
  requireEvidence(request?.type === "RETURN_REQUESTED");
  const approved = approvedReturnLines(request, approval);
  const targets: Array<{ effectType: SettlementEffectType; returnLineRef: string | null; quantity: number }> = approved.map(line => ({ effectType: "inventory_restore", returnLineRef: line.returnLineRef, quantity: line.quantity }));
  for (const effectType of ["member_credit_restore", "payment_refund"] as const) targets.push({ effectType, returnLineRef: null, quantity: approved.reduce((sum,line) => sum + line.quantity, 0) });
  return targets.map(target => {
    const effectId = "return-effect:" + fingerprint(["return-settlement-v1", approval.eventId, target.effectType, target.returnLineRef]);
    return { version: 1, effectId, idempotencyKey: effectId, orderId: approval.orderId, returnRequestId: approval.returnRequestId,
      approvedEventId: approval.eventId, returnLineRef: target.returnLineRef, approvedQuantity: target.quantity,
      effectType: target.effectType, plannedQuantity: target.effectType === "inventory_restore" ? target.quantity : null, plannedAmount: null,
      createdAt: approval.occurredAt, sourceFingerprint: fingerprint({ approval, request, target }) };
  });
}
export function projectReturnSettlements(state: SettlementState): SettlementEffect[] {
  const effects = new Map<string, SettlementEffect>();
  const expectedPlans = new Map<string, Map<string, SettlementPlan>>();
  const consumedCredit = new Map<string,number>();
  const log = state.returnSettlementEvents ?? [];
  requireEvidence(Array.isArray(log));
  for (const [index, entry] of log.entries()) {
    const { hash, ...payload } = entry;
    requireEvidence(entry.sequence === index && entry.previousHash === (log[index - 1]?.hash ?? null) && hash === fingerprint(payload)
      && Number.isFinite(Date.parse(entry.recordedAt)));
    let effect = effects.get(entry.effectId);
    if (entry.type === "PLANNED") {
      requireEvidence(!effect && entry.plan && entry.plan.effectId === entry.effectId && !entry.receipt && !entry.creditResult && !entry.paymentResult && !entry.notification && !entry.reason);
      const approval = state.returnEvents?.find(event => event.eventId === entry.plan!.approvedEventId);
      requireEvidence(approval?.type === "RETURN_APPROVED");
      let expectedForApproval = expectedPlans.get(approval.eventId);
      if (!expectedForApproval) { expectedForApproval = new Map(plans(state, approval).map(plan => [plan.effectId, plan])); expectedPlans.set(approval.eventId, expectedForApproval); }
      const expected = expectedForApproval.get(entry.effectId);
      requireEvidence(isDeepStrictEqual(expected, entry.plan) && Date.parse(entry.recordedAt) >= Date.parse(entry.plan.createdAt));
      effect = { ...entry.plan, status: entry.plan.effectType === "payment_refund" ? "pending_future_settlement" : "pending", appliedAt: null, attempts: 0 };
      effects.set(entry.effectId, effect);
    } else if (effect?.effectType === "payment_refund" && entry.type === "NOTIFIED") {
      requireEvidence(effect.status === "applied" && ["sent","failed","disabled"].includes(entry.notification ?? "") && !entry.paymentResult && !entry.plan && !entry.receipt && !entry.creditResult && !entry.reason && Date.parse(entry.recordedAt)>=Date.parse(effect.appliedAt!));
      effect.notification=entry.notification;
    } else if (effect?.effectType === "payment_refund" && entry.type === "APPLIED") {
      const r=entry.paymentResult;
      requireEvidence(effect.status !== "applied" && r && !entry.plan && !entry.receipt && !entry.creditResult && !entry.reason
        && [r.amount,r.originalPaidTotal,r.merchandisePaidTotal].every(n=>Number.isSafeInteger(n)&&n>=0)
        && r.amount<=r.merchandisePaidTotal && r.merchandisePaidTotal<=r.originalPaidTotal
        && ["manual_cash","manual_bank_transfer"].includes(r.method) && r.confirmedBy.length>0 && r.confirmedAt===entry.recordedAt
        && Date.parse(entry.recordedAt)>=Date.parse(effect.createdAt) && r.note.length<=200 && Array.isArray(r.proof) && r.proof.length<=3);
      const request=state.returnEvents?.find(e=>e.type==="RETURN_REQUESTED"&&e.orderId===effect!.orderId&&e.returnRequestId===effect!.returnRequestId);
      requireEvidence(request?.type==="RETURN_REQUESTED"&&request.confirmation?.refundRequest);
      const saved=request.confirmation.refundRequest;
      const quote=allocateApprovedReturnPayment({orderNumber:effect.orderId,status:"completed",completion:request.completion,payment:saved.originalPayment,orderMode:saved.originalOrderMode??"home_delivery"},state.returnEvents??[],effect.returnRequestId);
      requireEvidence(quote.status==="resolved"&&quote.amount===r.amount&&quote.originalPaidTotal===r.originalPaidTotal&&quote.merchandisePaidTotal===r.merchandisePaidTotal&&quote.method===r.method&&saved.originalPayment===r.originalPayment&&quote.evidenceFingerprint===r.allocationFingerprint);
      requireEvidence(r.proof.every(photo=>typeof photo.url==="string"&&/^\/uploads\/order-notifications\/[0-9a-f-]{36}\.webp$/iu.test(photo.url)&&photo.mimeType==="image/webp"&&photo.bytes>0&&photo.width>0&&photo.height>0));
      const prior=[...effects.values()].filter(e=>e.orderId===effect!.orderId&&e.effectType==="payment_refund"&&e.status==="applied");
      requireEvidence(prior.reduce((n,e)=>n+(e.paymentResult?.amount ?? 0),0)+r.amount<=r.merchandisePaidTotal);
      effect.status="applied";effect.paymentResult=structuredClone(r);effect.appliedAt=r.confirmedAt;effect.attempts++;
    } else {
      requireEvidence(effect && effect.effectType !== "payment_refund" && effect.status !== "applied" && effect.status !== "manual_review_required" && !entry.plan
        && Date.parse(entry.recordedAt) >= Date.parse(effect.createdAt));
      effect.attempts++;
      if (entry.type === "APPLIED" && effect.effectType === "member_credit_restore") {
        requireEvidence(entry.creditResult && !entry.receipt && !entry.reason && !entry.paymentResult && !entry.notification);
        validateCreditResult(state,effect,entry.creditResult,entry.recordedAt);
        for(const selected of entry.creditResult.entries) {
          const key=JSON.stringify([effect.orderId,selected.creditEntryId]);
          const used=(consumedCredit.get(key) ?? 0)+selected.amount;
          const reservation=Object.values(state.creditReservations ?? {}).find(item=>item.orderId === effect!.orderId && item.status === "consumed" && item.memberId === entry.creditResult!.memberId);
          requireEvidence(used <= (reservation?.allocations.find(item=>item.creditEntryId === selected.creditEntryId)?.amount ?? 0));
          consumedCredit.set(key,used);
        }
        effect.status="applied"; effect.creditResult=structuredClone(entry.creditResult); effect.appliedAt=entry.creditResult.settledAt; delete effect.reason;
      } else if (entry.type === "APPLIED") {
        requireEvidence(!entry.creditResult && !entry.paymentResult && !entry.notification);
        const receipt = entry.receipt;
        requireEvidence(receipt?.kind === "RESTORE" && receipt.operationId === "return-stock:" + fingerprint(effect.effectId)
          && receipt.items.length === 1 && receipt.items[0].quantity === effect.approvedQuantity && receipt.parentOperationId
          && receipt.items[0].afterStock - receipt.items[0].beforeStock === effect.approvedQuantity
          && receipt.demandHash === receiptDemandHash(receipt.domain, "RESTORE", receipt.parentOperationId, receipt.items) && !entry.reason);
        effect.status = "applied"; effect.receipt = structuredClone(receipt); effect.appliedAt = receipt.recordedAt; delete effect.reason;
      } else {
        requireEvidence(["FAILED", "MANUAL_REVIEW_REQUIRED"].includes(entry.type) && typeof entry.reason === "string" && entry.reason.length > 0 && entry.reason.length <= 200 && !entry.receipt && !entry.creditResult);
        effect.status = entry.type === "FAILED" ? "failed" : "manual_review_required"; effect.reason = entry.reason;
      }
    }
  }
  return [...effects.values()];
}
export function appendSettlementEvent(state: SettlementState, input: Omit<SettlementEvent,"sequence"|"previousHash"|"hash">) {
  const log = state.returnSettlementEvents ?? [];
  const payload = { ...input, sequence: log.length, previousHash: log.at(-1)?.hash ?? null };
  state.returnSettlementEvents = [...log, { ...payload, hash: fingerprint(payload) }];
  projectReturnSettlements(state);
}
/** Called inside the SAME commerce transaction that appends approval: durable outbox. */
export function planApprovedReturnSettlement(state: SettlementState, approval: Extract<ReturnDomainEvent, { type: "RETURN_APPROVED" }>, recordedAt = approval.recordedAt) {
  const existing = new Set(projectReturnSettlements(state).map(effect => effect.effectId));
  const log = [...(state.returnSettlementEvents ?? [])];
  for (const plan of plans(state, approval)) if (!existing.has(plan.effectId)) {
    const payload = { effectId: plan.effectId, type: "PLANNED" as const, plan, recordedAt, sequence: log.length, previousHash: log.at(-1)?.hash ?? null };
    log.push({ ...payload, hash: fingerprint(payload) });
  }
  state.returnSettlementEvents = log;
  projectReturnSettlements(state);
}
export function assertSettlementPrefix(previous: SettlementEvent[], next: SettlementEvent[]) {
  requireEvidence(next.length >= previous.length && isDeepStrictEqual(previous, next.slice(0, previous.length)));
}
/** Admin-safe summary; member DTOs never contain this projection or internal IDs. */
export function returnInventorySummary(state: SettlementState, requestId: string) {
  const effects = projectReturnSettlements(state).filter(effect => effect.returnRequestId === requestId && effect.effectType === "inventory_restore");
  return { approvedQuantity: effects.reduce((sum,effect) => sum + effect.approvedQuantity, 0),
    appliedQuantity: effects.filter(effect => effect.status === "applied").reduce((sum,effect) => sum + effect.approvedQuantity, 0),
    status: !effects.length ? "not_started" : effects.some(effect => effect.status === "manual_review_required") ? "manual_review_required"
      : effects.every(effect => effect.status === "applied") ? "applied" : effects.some(effect => effect.status === "failed") ? "failed" : "pending" };
}

function validateCreditResult(state: SettlementState, effect: SettlementEffect, result: CreditSettlementResult, recordedAt: string) {
  const request=state.returnEvents?.find(item=>item.type === "RETURN_REQUESTED" && item.returnRequestId === effect.returnRequestId);
  const approval=state.returnEvents?.find(item=>item.eventId === effect.approvedEventId);
  requireEvidence(request?.type === "RETURN_REQUESTED" && approval?.type === "RETURN_APPROVED");
  const selected=approvedReturnCreditSelection(request,approval,result.selectedAmount === 0);
  requireEvidence(result.memberId === request.actor.actorId && result.settledAt === recordedAt && result.entries.length === selected.length);
  requireEvidence(result.selectedAmount === selected.reduce((sum,item)=>sum+item.amount,0)
    && result.restoredAmount === result.entries.reduce((sum,item)=>sum+item.restoredAmount,0)
    && result.expiredAmount === result.entries.reduce((sum,item)=>sum+item.expiredAmount,0)
    && result.selectedAmount === result.restoredAmount+result.expiredAmount);
  for(const [index,item] of result.entries.entries()) {
    const source=selected[index], original=state.creditEntries?.[item.creditEntryId];
    requireEvidence(item.creditEntryId === source.creditEntryId && item.amount === source.amount && item.expiresAt === source.expiresAt
      && original?.memberId === result.memberId && original.expiresAt === source.expiresAt);
    const consumed=Object.values(state.creditReservations ?? {}).filter(reservation=>reservation.orderId === effect.orderId && reservation.memberId === result.memberId && reservation.status === "consumed");
    requireEvidence(consumed.length === 1 && (consumed[0].allocations.find(part=>part.creditEntryId === item.creditEntryId)?.amount ?? 0) >= item.amount);
    const expired=Date.parse(item.expiresAt) <= Date.parse(result.settledAt);
    requireEvidence(item.restoredAmount === (expired ? 0 : item.amount) && item.expiredAmount === (expired ? item.amount : 0));
    if(expired) requireEvidence(item.restoredCreditEntryId === null);
    else {
      const restored=state.creditEntries?.[item.restoredCreditEntryId ?? ""];
      requireEvidence(restored?.memberId === result.memberId && restored.amount === item.amount && restored.expiresAt === item.expiresAt
        && restored.sourceType === "compensation" && restored.sourceReference === "return_credit_restore:"+effect.effectId+":"+item.creditEntryId
        && restored.metadata.orderId === effect.orderId && restored.metadata.returnRequestId === effect.returnRequestId
        && restored.metadata.approvedEventId === effect.approvedEventId && restored.metadata.settlementEffectId === effect.effectId
        && restored.metadata.originalCreditEntryId === item.creditEntryId && restored.metadata.originalExpiresAt === item.expiresAt);
    }
  }
}
/** No ledger/source/effect identifiers cross the presentation boundary. */
export function returnCreditSettlementSummary(state: SettlementState, requestId: string) {
  const effect=projectReturnSettlements(state).find(item=>item.returnRequestId === requestId && item.effectType === "member_credit_restore");
  if(!effect)return null;
  return {status:effect.status,settledAt:effect.creditResult?.settledAt ?? null,
    selectedAmount:effect.creditResult?.selectedAmount ?? null,restoredAmount:effect.creditResult?.restoredAmount ?? null,
    expiredAmount:effect.creditResult?.expiredAmount ?? null,
    entries:effect.creditResult?.entries.map(({amount,expiresAt,restoredAmount,expiredAmount})=>({amount,expiresAt,restoredAmount,expiredAmount})) ?? []};
}
