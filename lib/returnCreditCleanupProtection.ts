import type { MembershipCommerceState } from "./membershipCommerce";
import { resolveOrderEconomicAllocation } from "./orderCompletion";
import { originalReturnCreditSources } from "./returnCreditPreview";
import { projectReturnSettlements } from "./returnSettlementLedger";

export class ReturnCreditCleanupEvidenceError extends Error {
  constructor() { super("Cleanup cannot prove exact return-credit dependencies; no data was removed"); }
}
function requireReference(condition: unknown): asserts condition {
  if (!condition) throw new ReturnCreditCleanupEvidenceError();
}
export type ProtectedCreditEvidenceReferences = {
  creditEntryIds: Set<string>; reservationIds: Set<string>; consumptionEventIds: Set<string>;
  qualificationRoundIds: Set<string>; orderIds: Set<string>; returnRequestIds: Set<string>;
  settlementEffectIds: Set<string>; idempotencyKeys: Set<string>;
};

/** Cleanup-only, read-only dependency graph. Never protect by member or by amount.
 * Every actual credit effect state is retained (pending, failed/retryable, applied,
 * manual_review_required, and any historical future placeholder). Approval without
 * an enrolled outbox is included because the existing worker may enroll it on retry. */
export function collectProtectedCreditEvidenceReferences(state: MembershipCommerceState): ProtectedCreditEvidenceReferences {
  const refs: ProtectedCreditEvidenceReferences = {
    creditEntryIds:new Set(),reservationIds:new Set(),consumptionEventIds:new Set(),qualificationRoundIds:new Set(),
    orderIds:new Set(),returnRequestIds:new Set(),settlementEffectIds:new Set(),idempotencyKeys:new Set(),
  };
  const effects=projectReturnSettlements(state).filter(effect=>effect.effectType === "member_credit_restore");
  for(const approval of (state.returnEvents ?? []).filter(event=>event.type === "RETURN_APPROVED")) {
    const request=state.returnEvents?.find(event=>event.type === "RETURN_REQUESTED" && event.returnRequestId === approval.returnRequestId && event.orderId === approval.orderId);
    requireReference(request?.type === "RETURN_REQUESTED");
    const allocation=resolveOrderEconomicAllocation({status:"completed",orderNumber:request.orderId,completion:request.completion});
    requireReference(allocation.status === "resolved");
    refs.returnRequestIds.add(request.returnRequestId);
    refs.orderIds.add(request.orderId);
    refs.idempotencyKeys.add(request.idempotencyKey);refs.idempotencyKeys.add(approval.idempotencyKey);
    // The worker revalidates the WHOLE exact original consumed reservation, not just
    // the slice being restored. All its allocated source entries are dependencies.
    const sources=originalReturnCreditSources(request.orderId,request.actor.actorId,allocation,state);
    if(allocation.actualRedemptionUsed > 0) {
      requireReference(allocation.creditReservationId);
      refs.reservationIds.add(allocation.creditReservationId);
      for(const source of sources)refs.creditEntryIds.add(source.creditEntryId);
    }
    for(const effect of effects.filter(item=>item.approvedEventId === approval.eventId)) {
      refs.settlementEffectIds.add(effect.effectId);
      for(const source of effect.creditResult?.entries ?? []) {
        refs.creditEntryIds.add(source.creditEntryId);
        if(source.restoredCreditEntryId)refs.creditEntryIds.add(source.restoredCreditEntryId);
      }
    }
  }
  // Preserve only directly connected ledger evidence. A retained source may have
  // other reservations, Owner deductions or linked reversals; dropping these would
  // corrupt its balance/history. Whole persisted allocation records remain intact.
  let changed=true;
  const add=(set:Set<string>,id:string)=>{if(!set.has(id)){set.add(id);changed=true;}};
  while(changed) {
    changed=false;
    for(const reservation of Object.values(state.creditReservations)) {
      if(!refs.reservationIds.has(reservation.reservationId)
        && !reservation.allocations.some(item=>refs.creditEntryIds.has(item.creditEntryId)))continue;
      add(refs.reservationIds,reservation.reservationId);add(refs.orderIds,reservation.orderId);
      for(const part of reservation.allocations) {
        requireReference(state.creditEntries[part.creditEntryId]?.memberId === reservation.memberId);
        add(refs.creditEntryIds,part.creditEntryId);
      }
    }
    for(const entry of Object.values(state.creditEntries)) {
      const linked=entry.amount < 0 && typeof entry.metadata.reversesCreditEntryId === "string" ? entry.metadata.reversesCreditEntryId : null;
      const allocations=entry.adjustmentAllocations ?? [];
      if(!refs.creditEntryIds.has(entry.creditEntryId) && !allocations.some(item=>refs.creditEntryIds.has(item.creditEntryId))
        && !(linked && refs.creditEntryIds.has(linked)))continue;
      add(refs.creditEntryIds,entry.creditEntryId);
      for(const creditId of [...allocations.map(item=>item.creditEntryId),...(linked?[linked]:[])]) {
        requireReference(state.creditEntries[creditId]?.memberId === entry.memberId);add(refs.creditEntryIds,creditId);
      }
    }
    for(const event of Object.values(state.validConsumptionEvents))if(refs.orderIds.has(event.sourceOrderId))add(refs.consumptionEventIds,event.eventId);
    // D1 replay verifies the frozen qualification allocation references when the
    // corresponding consumption survives. Keep their exact transitive inputs.
    for(const round of Object.values(state.qualificationRounds)) {
      if(!refs.qualificationRoundIds.has(round.roundId) && !refs.consumptionEventIds.has(round.triggeringValidConsumptionEventId)
        && !round.consumptionAccounting.allocations.some(item=>refs.consumptionEventIds.has(item.validConsumptionEventId)))continue;
      add(refs.qualificationRoundIds,round.roundId);
      for(const eventId of [round.triggeringValidConsumptionEventId,...round.consumptionAccounting.allocations.map(item=>item.validConsumptionEventId),
        ...round.generalPath.eligibleEventIds,...round.subscriptionPath.eligibleEventIds]) {
        requireReference(state.validConsumptionEvents[eventId]?.memberId === round.memberId);add(refs.consumptionEventIds,eventId);
      }
    }
  }
  const resultIds=new Set([...refs.creditEntryIds,...refs.reservationIds,...refs.consumptionEventIds,...refs.qualificationRoundIds,...refs.returnRequestIds,...refs.settlementEffectIds]);
  for(const [key,item] of Object.entries(state.idempotency))if(resultIds.has(item.resultId))refs.idempotencyKeys.add(key);
  return refs;
}

/** Reapply only the collected records after either existing selective/all cleanup.
 * Unrelated rows remain deleted. Preserve original append order for retained rows. */
export function retainProtectedCreditEvidence(source: MembershipCommerceState, target: MembershipCommerceState, refs: ProtectedCreditEvidenceReferences) {
  function retain<T>(before:Record<string,T>,after:Record<string,T>,ids:Set<string>) {
    // Rebuild in original dictionary append order (same-millisecond passbook evidence).
    const remaining=new Set(Object.keys(after));
    for(const key of Object.keys(after))delete after[key];
    for(const [key,value] of Object.entries(before))if(remaining.has(key)||ids.has(key))after[key]=structuredClone(value);
    for(const id of ids)requireReference(before[id]);
  }
  retain(source.creditEntries,target.creditEntries,refs.creditEntryIds);
  retain(source.creditReservations,target.creditReservations,refs.reservationIds);
  retain(source.validConsumptionEvents,target.validConsumptionEvents,refs.consumptionEventIds);
  retain(source.qualificationRounds,target.qualificationRounds,refs.qualificationRoundIds);
  for(const key of refs.idempotencyKeys)if(source.idempotency[key])target.idempotency[key]=structuredClone(source.idempotency[key]);
  const recordIds=new Set([...refs.creditEntryIds,...refs.reservationIds,...refs.consumptionEventIds,...refs.qualificationRoundIds,...refs.returnRequestIds,...refs.settlementEffectIds]);
  const eventIds=new Set(target.events.map(item=>item.eventId));
  target.events=source.events.filter(item=>eventIds.has(item.eventId)||(item.orderId && refs.orderIds.has(item.orderId))||recordIds.has(item.eventId));
  const auditIds=new Set(target.audit.map(item=>item.auditId));
  target.audit=source.audit.filter(item=>auditIds.has(item.auditId)||recordIds.has(item.entityId)||recordIds.has(item.sourceEvent)||refs.idempotencyKeys.has(item.sourceEvent));
}
