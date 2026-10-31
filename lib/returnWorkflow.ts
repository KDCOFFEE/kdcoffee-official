import { approvedReturnCreditSelection } from "./returnCreditSelection";
import { applyApprovedReturnInventory } from "./returnInventorySettlement";
import { returnCreditSettlementSummary, returnInventorySummary } from "./returnSettlementLedger";
import { readOrder, type StoredOrder } from "./adminOrders";
import { createHash } from "node:crypto";
import { projectReturnRewardUnits } from "./returnRewardUnits";
import { validateAndStoreOrderNotificationPhoto } from "./orderNotificationPhotos";
import { validOrderPhotoSelection } from "./orderPhotoPolicy";
import { assertMemberOwnsOrder } from "./orderCancellation";
import { resolveReturnLineEvidence, resolveOrderEconomicAllocation } from "./orderCompletion";
import { projectOrderReturns, type ReturnCommand, type ReturnDomainEvent } from "./orderReturns";
import { applyApprovedReturnCredit, executeOrderReturnCommand, previewOrderReturn, readMembershipCommerceState, readReturnRewardHoldDependencies,
  projectPendingReturnRewardEntitlement, projectReturnRewardHolds, resolveTerminalReturnRewardDependencies,
  type MembershipCommerceState, type ReturnRewardReference } from "./membershipCommerce";
import { requestCommand, originalReturnCreditSources, ReturnWorkflowError, type ReturnConfirmationPreview } from "./returnCreditPreview";

export type ReturnWorkflowRuntime = { now?: Date; stateFilePath?: string; rulesFilePath?: string; photos?: File[] };
export function memberReturnAuthorization(memberId: string) {
  return (order: Readonly<Record<string, unknown>>) => assertMemberOwnsOrder(order as StoredOrder, memberId);
}
export function safeCreditPreview(preview: ReturnConfirmationPreview) {
  return { returnCreditAmount: preview.returnCreditAmount, restorableCreditAmount: preview.restorableCreditAmount,
    expiredCreditAmount: preview.expiredCreditAmount, hasExpiredReturnCredit: preview.hasExpiredReturnCredit,
    entries: preview.entries.map(({ amount, expiresAt, classification }) => ({ amount, expiresAt, classification })),
    expiryWarning: preview.expiryWarning,
    generatedAt: preview.generatedAt, returnDeadline: preview.returnDeadline, lines: preview.lines.map(({returnLineRef,quantity,attributedCreditAmount})=>({returnLineRef,quantity,attributedCreditAmount})),
    rewardHoldExpected: preview.rewardHoldExpected, rewardAdjustmentPreview: preview.rewardAdjustmentPreview };
}
function beneficiary(state: MembershipCommerceState, ref: ReturnRewardReference) {
  return ref.program === "referral" ? state.referralRewards[ref.id]?.beneficiaryMemberId
    : ref.program === "retail_promotion" ? state.retailPromotionRewards[ref.id]?.beneficiaryMemberId
      : state.referrals[state.referralConversions[ref.id]?.relationshipId]?.referrerMemberId;
}
export function returnRewardPresentation(state: MembershipCommerceState, orderId?: string, memberId?: string) {
  const refs = new Map(readReturnRewardHoldDependencies(state).filter(hold => (!orderId || hold.returnOrderId === orderId)
    && (!memberId || beneficiary(state, hold.reward) === memberId)).map(hold => [JSON.stringify(hold.reward), hold]));
  return [...refs.values()].map(hold => {
    const amount = projectPendingReturnRewardEntitlement(state, hold.reward), holds = projectReturnRewardHolds(state, hold.reward);
    const latest = amount.resolutions.at(-1);
    const display = projectReturnRewardUnits(state, hold.reward, amount);
    const selfPurchase = hold.reward.program === "referral" && state.referralRewards[hold.reward.id]?.rewardType === "self_purchase";
    return { program: hold.reward.program, display, programCopyKey: selfPurchase ? "member.returns.rewardSelf" : hold.reward.program === "retail_promotion" ? "member.returns.rewardRetail" : "member.returns.rewardReferral", sourceOrderId: hold.rewardSourceOrderId,
      originalPendingAmount: amount.originalPendingRewardAmount, effectivePendingAmount: amount.remainingEffectivePendingRewardAmount,
      adjustment: amount.cumulativeApprovedReturnConsequence, blocked: holds.blocked,
      delta: amount.remainingEffectivePendingRewardAmount - amount.originalPendingRewardAmount,
      reasonCopyKey: holds.blocked ? "member.returns.rewardHeld" : latest?.result === "withdrawn" || latest?.result === "rejected" ? "member.returns.rewardRestored"
        : display.unit === "points" && display.effective !== null ? display.effective === 0 ? "member.returns.rewardCancelled" : display.delta !== null && display.delta < 0 ? "member.returns.rewardAdjusted" : "member.returns.rewardUnchanged"
          : amount.cancelledBeforeRelease ? "member.returns.rewardCancelled" : amount.cumulativeApprovedReturnConsequence > 0 ? "member.returns.rewardAdjusted" : "member.returns.rewardUnchanged",
      reason: holds.blocked ? "相關訂單有退貨申請正在處理中，待發放獎勵暫停。"
        : latest?.result === "withdrawn" || latest?.result === "rejected" ? "待發放獎勵恢復。"
          : amount.cancelledBeforeRelease ? "待發放獎勵調整為 0／已取消。" : "待發放獎勵已依核准退貨調整。",
      adjustedAt: latest?.recordedAt ?? null,
      relatedReturns: holds.dependencies.filter(item => !orderId || item.returnOrderId === orderId).map(item => ({ returnRequestId: item.returnRequestId, state: item.state })) };
  });
}

/** A DTO boundary: members never receive source credit IDs, other beneficiaries, or fingerprints. */
export function projectReturnWorkflow(order: StoredOrder, state: MembershipCommerceState, memberId?: string, now = new Date()) {
  if (memberId) assertMemberOwnsOrder(order, memberId);
  const projection = projectOrderReturns(order, state.returnEvents ?? []);
  const evidence = resolveReturnLineEvidence(order), economic = resolveOrderEconomicAllocation(order);
  const events = (state.returnEvents ?? []).filter(event => event.orderId === order.orderNumber);
  const deadline = projection.status === "resolved" ? projection.returnDeadline : null;
  let creditReview: string | null = null;

  if (projection.status === "resolved" && economic.status === "resolved") {
    try { originalReturnCreditSources(order.orderNumber, String(order.member?.memberId ?? ""), economic, state); }
    catch (error) { creditReview = error instanceof ReturnWorkflowError ? error.code : "credit_evidence_requires_review"; }
    for(const approval of events.filter(event=>event.type === "RETURN_APPROVED")) {
      const request=events.find(event=>event.type === "RETURN_REQUESTED" && event.returnRequestId === approval.returnRequestId);
      if(request?.type === "RETURN_REQUESTED" && approval.type === "RETURN_APPROVED") {
        try { approvedReturnCreditSelection(request,approval,economic.actualRedemptionUsed === 0); }
        catch { creditReview="historical_return_credit_requires_review"; }
      }
    }
    if (economic.actualRedemptionUsed > 0 && projection.requests.some(request => ["pending", "processing", "approved"].includes(request.status)
      && !events.find(event => event.eventId === request.requestedEventId && event.type === "RETURN_REQUESTED" && event.confirmation))) creditReview = "historical_return_credit_requires_review";
  }
  const manual = projection.status === "manual_review_required" || (projection.status === "resolved" && economic.status !== "resolved") || Boolean(creditReview);
  return { orderNumber: order.orderNumber, orderStatus: order.status, completedAt: order.completion?.completedAt ?? null,
    customer: memberId ? undefined : order.customer?.name ?? order.member?.memberId ?? "未記錄",
    returnDeadline: deadline, eligible: projection.status === "resolved" && !manual && now.getTime() <= Date.parse(projection.returnDeadline)
      && projection.lines.some(line => line.remainingReturnableQuantity > 0),
    eligibility: manual ? "manual_review_required" : projection.status !== "resolved" ? projection.reason
      : now.getTime() > Date.parse(projection.returnDeadline) ? "return_deadline_expired" : "resolved",
    message: manual ? "此訂單需人工協助確認退貨資格" : null,
    technicalReason: memberId ? undefined : projection.status !== "resolved" ? projection.reason : economic.status !== "resolved" ? economic.reason : creditReview,
    lines: projection.status === "resolved" ? projection.lines.map(line => {
      const original = evidence.status === "resolved" ? evidence.lines.find(item => item.returnLineRef === line.returnLineRef)?.snapshot : undefined;
      return { ...line, name: String(original?.name ?? "原訂單商品"), option: [original?.optionLabel, original?.optionDetail, original?.variantName].filter(Boolean).join(" / ") };
    }) : [],
    requests: projection.status === "resolved" ? projection.requests.map(request => {
      const requested = events.find(event => event.eventId === request.requestedEventId) as Extract<ReturnDomainEvent, { type: "RETURN_REQUESTED" }>;
      return { ...request, withdrawable: request.withdrawable && (!memberId || request.requestedBy === memberId),
        inventorySettlement: memberId ? undefined : returnInventorySummary(state, request.returnRequestId),
        creditSettlement: returnCreditSettlementSummary(state, request.returnRequestId),
        reason: requested.reason, conditionAcknowledgement: requested.conditionAcknowledgement,
        photos: requested.confirmation?.supportingPhotos ?? [],
        creditPreview: requested.confirmation ? safeCreditPreview(requested.confirmation.preview) : null,
        confirmedAt: requested.confirmation?.confirmedAt ?? null,
        timeline: events.filter(event => event.returnRequestId === request.returnRequestId).map(event => ({ type: event.type, occurredAt: event.occurredAt, reason: event.reason })) };
    }) : [], rewards: returnRewardPresentation(state, order.orderNumber, memberId) };
}
export async function getReturnWorkflow(orderNumber: string, memberId?: string, runtime: ReturnWorkflowRuntime = {}) {
  const order = await readOrder(orderNumber);
  if (!order) throw new ReturnWorkflowError("not_found", 404);
  if (memberId) assertMemberOwnsOrder(order, memberId);
  return projectReturnWorkflow(order, await readMembershipCommerceState(runtime.stateFilePath), memberId, runtime.now);
}
export async function memberReturnAction(orderNumber: string, memberId: string, values: Record<string, unknown>, runtime: ReturnWorkflowRuntime = {}) {
  const authorizeOrder = memberReturnAuthorization(memberId);
  if (values.action === "preview" || values.action === "create") {
    const command = requestCommand(memberId, values);
    if (values.action === "preview") {
      const result = await previewOrderReturn({ orderNumber, memberId, command, reason: command.reason, authorizeOrder, ...runtime });
      return { preview: safeCreditPreview(result.preview), confirmationToken: result.confirmationToken };
    }
    if (values.finalConfirmation !== true || typeof values.confirmationToken !== "string") throw new ReturnWorkflowError("final_confirmation_required", 400);
    if (runtime.photos?.length && (!/^[A-Za-z0-9:_-]{1,120}$/u.test(String(values.idempotencyKey ?? "")) || runtime.photos.length > 3)) throw new ReturnWorkflowError("invalid_input", 400);
    const supportingPhotos = [];
    if (runtime.photos?.length) {
      const order = await readOrder(orderNumber);
      if (!order) throw new ReturnWorkflowError("not_found", 404);
      authorizeOrder(order);
      for (const [index, photo] of runtime.photos.entries()) {
        if (!validOrderPhotoSelection(photo)) throw new ReturnWorkflowError("invalid_photos", 400);
        const digest = createHash("sha256").update(JSON.stringify([orderNumber, memberId, values.idempotencyKey, index, photo.type, photo.name])).update(Buffer.from(await photo.arrayBuffer())).digest("hex");
        const photoId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
        supportingPhotos.push(await validateAndStoreOrderNotificationPhoto(photo, photoId));
      }
    }
    const result = await executeOrderReturnCommand({ orderNumber, actor: command.actor, command, reason: command.reason,
      idempotencyKey: String(values.idempotencyKey ?? ""), authorizeOrder, ...runtime,
      confirmation: { token: values.confirmationToken, memberId, quantityAcknowledged: true, supportingPhotos } });
    if (result.status !== "applied") throw new ReturnWorkflowError(result.reason);
    return { returnRequestId: result.event.returnRequestId, replayed: result.replayed };
  }
  if (values.action !== "withdraw" || typeof values.returnRequestId !== "string") throw new ReturnWorkflowError("invalid_input", 400);
  const result = await executeOrderReturnCommand({ orderNumber, actor: { actorId: memberId, authority: "customer" },
    command: { type: "RETURN_WITHDRAWN", returnRequestId: values.returnRequestId }, reason: "會員撤回退貨申請",
    idempotencyKey: String(values.idempotencyKey ?? ""), authorizeOrder, ...runtime });
  if (result.status !== "applied") throw new ReturnWorkflowError(result.reason);
  await resolveTerminalReturnRewardDependencies(runtime);
  return { returnRequestId: result.event.returnRequestId, replayed: result.replayed };
}
/** The caller supplies the verified existing Admin session, never body identity. */
export async function adminReturnAction(orderNumber: string, adminId: string, values: Record<string, unknown>, runtime: ReturnWorkflowRuntime = {}) {
  const types = { lock: "RETURN_PROCESSING_LOCKED", approve: "RETURN_APPROVED", reject: "RETURN_REJECTED" } as const;
  if (typeof values.action !== "string" || !Object.hasOwn(types, values.action) || typeof values.returnRequestId !== "string") throw new ReturnWorkflowError("invalid_input", 400);
  const reason = typeof values.reason === "string" ? values.reason.trim() : "";
  if (!reason || reason.length > 200) throw new ReturnWorkflowError("review_reason_required", 400);
  const command: ReturnCommand = values.action === "approve" ? { type: "RETURN_APPROVED", returnRequestId: values.returnRequestId, ...(values.approvedLines !== undefined ? { approvedLines: values.approvedLines as import("./orderReturns").ReturnSelection[] } : {}) } : { type: types[values.action as "lock" | "reject"], returnRequestId: values.returnRequestId };
  const result = await executeOrderReturnCommand({ orderNumber, actor: { actorId: adminId, authority: "reviewer" }, command,
    reason, idempotencyKey: String(values.idempotencyKey ?? ""), authorizeOrder: () => {}, ...runtime });
  if (result.status !== "applied") throw new ReturnWorkflowError(result.reason);
  let inventorySettlement: Awaited<ReturnType<typeof applyApprovedReturnInventory>> | null = null;
  if (values.action === "approve") { try { inventorySettlement = await applyApprovedReturnInventory(orderNumber, result.event.returnRequestId, runtime); } catch { /* Atomic approval/outbox survives. Retry uses the same durable receipt identity. */ } }
  let creditSettlement: Awaited<ReturnType<typeof applyApprovedReturnCredit>> | null = null;
  if (values.action === "approve") { try { creditSettlement = await applyApprovedReturnCredit(orderNumber,result.event.returnRequestId,runtime); } catch { /* Independent durable credit effect remains retryable; inventory receipt is untouched. */ } }
  const resolution = values.action === "lock" ? null : await resolveTerminalReturnRewardDependencies(runtime);
  return { returnRequestId: result.event.returnRequestId, replayed: result.replayed, inventorySettlement, creditSettlement, rewardResolution: resolution?.status ?? null };
}
export type ReturnWorkflowView = ReturnType<typeof projectReturnWorkflow>;
