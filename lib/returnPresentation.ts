export function returnTaipeiDate(value: string | null | undefined, withTime = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return "未記錄";
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}) }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part("year")}/${part("month")}/${part("day")}${withTime ? ` ${part("hour")}:${part("minute")}` : ""}`;
}
export const returnStatusLabels: Record<string, string> = { pending: "申請處理中", processing: "處理中", withdrawn: "已撤回", approved: "已核准", rejected: "未核准",
  RETURN_REQUESTED: "申請處理中", RETURN_PROCESSING_LOCKED: "處理中", RETURN_WITHDRAWN: "已撤回", RETURN_APPROVED: "已核准", RETURN_REJECTED: "未核准" };
/** Ledger expiresAt is the exclusive instant; midnight expiry belongs to the previous usable day. */
export function returnCreditExpiryDate(expiresAt: string) { return returnTaipeiDate(new Date(Date.parse(expiresAt) - 1).toISOString()); }
export function returnStatusCopyKey(status: string) {
  const names: Record<string, string> = { pending: "Pending", processing: "Processing", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrawn",
    RETURN_REQUESTED: "Pending", RETURN_PROCESSING_LOCKED: "Processing", RETURN_APPROVED: "Approved", RETURN_REJECTED: "Rejected", RETURN_WITHDRAWN: "Withdrawn" };
  return `member.returns.status${names[status] ?? "Pending"}`;
}

/** Display only: original payment plus preserved fulfillment context; never changes routing. */
export function displayOriginalPaymentMethod(method?:string,orderMode?:string){
 if(method==="pickup_confirmation")return "工作室現場付款";
 if(method==="atm_transfer")return "ATM／銀行轉帳";
 if(method==="cash_on_delivery"&&orderMode==="711_cod")return "7-ELEVEN 取貨付款";
 if(method==="cash_on_delivery"&&orderMode==="home_delivery")return "宅配貨到付款";
 return "需人工確認";
}

export function displayReturnRefundMethod(method?:string){return method==="manual_cash"?"工作室現場退款":method==="manual_bank_transfer"?"銀行轉帳":"需確認";}
