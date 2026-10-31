/** Shared, browser-safe operational presentation. No settlement or routing decisions. */
export type ReturnOperationRow = {orderNumber:string;returnRequestId:string;status:string;refundStatus:string};
export type ReturnOperation = "review"|"manual_review"|"refund_pending"|"completed"|"closed"|"history";
export function returnOperation(row:Pick<ReturnOperationRow,"status"|"refundStatus">):ReturnOperation {
 if(row.refundStatus==="completed")return "completed";
 if(row.status==="rejected"||row.status==="withdrawn")return "closed";
 if(row.status==="pending"||row.status==="processing")return "review";
 if(row.status==="approved"&&row.refundStatus==="manual_review_required")return "manual_review";
 if(row.status==="approved"&&row.refundStatus==="pending")return "refund_pending";
 return "history";
}
export function isActionableReturn(row:Pick<ReturnOperationRow,"status"|"refundStatus">){return ["review","manual_review","refund_pending"].includes(returnOperation(row));}
export function returnOperationAction(row:Pick<ReturnOperationRow,"status"|"refundStatus">){const operation=returnOperation(row);return operation==="review"?"審核退貨":operation==="manual_review"?"人工確認退款方式":operation==="refund_pending"?"辦理退款":"查看紀錄";}
export function uniqueReturnOperationRows<T extends ReturnOperationRow>(rows:readonly T[]):T[]{const seen=new Set<string>();return rows.filter(row=>{const key=JSON.stringify([row.orderNumber,row.returnRequestId]);if(seen.has(key))return false;seen.add(key);return true;});}
export function summarizeReturnOperationRows(rows:readonly ReturnOperationRow[]){
 const counts={pending:0,awaitingRefund:0,manualReview:0,total:0,completed:0,closed:0,history:0,records:0};
 for(const row of uniqueReturnOperationRows(rows)){counts.records++;switch(returnOperation(row)){case "review":counts.pending++;break;case "refund_pending":counts.awaitingRefund++;break;case "manual_review":counts.manualReview++;break;case "completed":counts.completed++;break;case "closed":counts.closed++;break;default:counts.history++;}}
 counts.total=counts.pending+counts.awaitingRefund+counts.manualReview;return counts;
}
export function compareReturnOperationRows(a:ReturnOperationRow&{requestedAt:string},b:ReturnOperationRow&{requestedAt:string}){
 const priority:Record<ReturnOperation,number>={review:0,manual_review:1,refund_pending:2,completed:3,closed:3,history:3};
 const rank=priority[returnOperation(a)]-priority[returnOperation(b)];if(rank)return rank;
 const dates=(Date.parse(a.requestedAt)||0)-(Date.parse(b.requestedAt)||0);
 return (isActionableReturn(a)?dates:-dates)||a.orderNumber.localeCompare(b.orderNumber)||a.returnRequestId.localeCompare(b.returnRequestId);
}
