import type { RefundBank, ReturnRefundRequest } from "./returnRefundSettings";
export type ReviewedRefundMethod = "manual_cash" | "manual_bank_transfer";
export type ReturnRoutingResolution = {
 operationId:string; orderNumber:string; returnRequestId:string; originalReason:string;
 method:ReviewedRefundMethod; adminId:string; resolvedAt:string; note:string; acknowledged:true;
 bank:RefundBank|null; bankAcknowledged:boolean; economicFingerprint:string;
};
export function effectiveRefundRequest(saved:ReturnRefundRequest|undefined,resolution?:ReturnRoutingResolution){
 return saved&&resolution?{...saved,method:resolution.method,bank:resolution.bank}:saved;
}
export function returnManualReviewReason(reason?:string){
 const labels:Record<string,string>={unsupported_original_payment_method:"原始付款方式無法由系統自動判定",original_economic_evidence_required:"缺少足夠的原始付款金額證據",return_evidence_required:"退貨證據不足，無法自動計算退款",unexplained_original_payment_adjustment:"原始訂單付款金額存在無法解釋的調整",unproven_cod_fee_type:"代收費用證據與付款方式不一致",payment_evidence_requires_review:"原始付款證據需要人工查核",refund_unknown_fee_requires_review:"原訂單另有尚未核定退款政策的費用"};
 return labels[reason??""]??"退款金額／原始付款證據仍不足，不能直接指定退款方式。";
}
