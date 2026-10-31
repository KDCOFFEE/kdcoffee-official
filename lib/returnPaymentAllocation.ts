import {refundMethodForHandoff} from "./returnRefundSettings";
import { resolveOrderEconomicAllocation, resolveReturnLineEvidence } from "./orderCompletion";
import { cumulativeOriginalLineContribution, originalEconomicFingerprint } from "./orderRewardBasis";
import { approvedReturnLines, projectOrderReturns, type ReturnDomainEvent } from "./orderReturns";

export type RefundMethod = "manual_cash" | "manual_bank_transfer" | "manual_review_required";
/** Original payment routing; new requests may explicitly opt into the Owner in-person override. */
function originalRefundMethod(order: Record<string, unknown>): RefundMethod {
  const details = order.paymentDetails as { method?: unknown; status?: unknown } | undefined;
  const method = order.payment;
  if (details && (details.method !== method || ["failed", "refunded"].includes(String(details.status)))) return "manual_review_required";
  if (method === "pickup_confirmation") return "manual_cash";
  if (method === "atm_transfer" || method === "cash_on_delivery") return "manual_bank_transfer";
  return "manual_review_required";
}
export function resolveReturnRefundMethod(order:Record<string,unknown>,handoff?:string):RefundMethod{return refundMethodForHandoff(originalRefundMethod(order),handoff);}
export type ReturnPaymentAllocation =
  | { status: "manual_review_required"; reason: string }
  | { status: "resolved"; amount: number; originalPaidTotal: number; merchandisePaidTotal: number;
      retainedHomeShipping: number; retainedCodFee: number; otherShippingReviewRequired: boolean;
      method: RefundMethod; evidenceFingerprint: string };

/** Owner decision: home shipping and COD fees are not refundable. Never read current fee settings.
 * Remaining paid merchandise already excludes credit and fees; do not deduct fees again.
 * Approval-order cumulative slices preserve integer rounding across multiple partial returns.
 */
export function allocateApprovedReturnPayment(order: Record<string, unknown>, events: ReturnDomainEvent[], requestId: string): ReturnPaymentAllocation {
  const review = (reason: string): ReturnPaymentAllocation => ({ status: "manual_review_required", reason });
  try {
    const evidence = resolveReturnLineEvidence(order), economic = resolveOrderEconomicAllocation(order);
    if (evidence.status !== "resolved" || economic.status !== "resolved") return review("original_economic_evidence_required");
    const projection = projectOrderReturns(order, events);
    if (projection.status !== "resolved") return review("return_evidence_required");
    const snapshot = evidence.transactionSnapshot;
    const paid = snapshot.total, shipping = snapshot.shipping, codFee = snapshot.codServiceFee ?? 0;
    const validMoney = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
    if (!validMoney(paid) || !validMoney(shipping) || !validMoney(codFee)
      || economic.remainingPaidMerchandiseTotal + shipping + codFee !== paid) return review("unexplained_original_payment_adjustment");
    const requested=events.find(e=>e.orderId===order.orderNumber&&e.returnRequestId===requestId&&e.type==="RETURN_REQUESTED");
    const saved=requested?.type==="RETURN_REQUESTED"?requested.confirmation?.refundRequest:undefined;
    const method = resolveReturnRefundMethod(order,saved?.routingPolicyVersion===2?saved.handoff:undefined);
    if (method === "manual_review_required") return review("unsupported_original_payment_method");
    if (codFee && order.payment !== "cash_on_delivery") return review("unproven_cod_fee_type");
    const used = new Map<string, number>();
    let amount: number | null = null;
    for (const approval of events.filter(event => event.orderId === order.orderNumber && event.type === "RETURN_APPROVED")) {
      if (approval.type !== "RETURN_APPROVED") continue;
      const request = events.find(event => event.orderId === order.orderNumber && event.returnRequestId === approval.returnRequestId && event.type === "RETURN_REQUESTED");
      if (request?.type !== "RETURN_REQUESTED") return review("missing_original_return_request");
      let contribution = 0;
      for (const selected of approvedReturnLines(request, approval)) {
        const line = economic.lines.find(item => item.returnLineRef === selected.returnLineRef);
        if (!line) return review("missing_original_payment_line");
        const before = used.get(line.returnLineRef) ?? 0, after = before + selected.quantity;
        contribution += cumulativeOriginalLineContribution(line.remainingPaidContribution, line.originalQuantity, after)
          - cumulativeOriginalLineContribution(line.remainingPaidContribution, line.originalQuantity, before);
        used.set(line.returnLineRef, after);
      }
      if (approval.returnRequestId === requestId) amount = contribution;
    }
    if (amount === null) return review("return_not_approved");
    if (!validMoney(amount) || amount > paid || amount > economic.remainingPaidMerchandiseTotal) return review("original_payment_cap_exceeded");
    const home = order.orderMode === "home_delivery";
    const result = { amount, originalPaidTotal: paid, merchandisePaidTotal: economic.remainingPaidMerchandiseTotal,
      retainedHomeShipping: home ? shipping : 0, retainedCodFee: codFee,
      otherShippingReviewRequired: shipping > 0 && !home, method };
    return { status: "resolved", ...result, evidenceFingerprint: originalEconomicFingerprint({ result, allocation: economic.allocationFingerprint, requestId }) };
  } catch { return review("payment_evidence_requires_review"); }
}

export type ReturnPaymentPreview = {status:"resolved";originalPaidTotal:number;merchandiseAmount:number;shippingAmount:number;codFee:number;amount:number;method:RefundMethod}|{status:"manual_review_required";method:RefundMethod};
