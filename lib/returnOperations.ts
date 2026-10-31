import type {StoredOrder} from "./adminOrders";
import {projectReturnWorkflow,type ReturnWorkflowView} from "./returnWorkflow";
import type {MembershipCommerceState} from "./membershipCommerce";
export function summarizeReturnOperations(views:ReadonlyArray<Pick<ReturnWorkflowView,"orderNumber"|"requests">>){
 const counts={pending:0,awaitingRefund:0,manualReview:0,total:0},seen=new Set<string>();
 for(const view of views)for(const request of view.requests){const key=JSON.stringify([view.orderNumber,request.returnRequestId]);if(seen.has(key))continue;seen.add(key);if(["pending","processing"].includes(request.status))counts.pending++;else if(request.status==="approved"&&request.paymentRefund.status!=="completed"){if(request.paymentRefund.status==="manual_review_required")counts.manualReview++;else if(request.paymentRefund.status==="pending")counts.awaitingRefund++;}}
 counts.total=counts.pending+counts.awaitingRefund+counts.manualReview;return counts;
}
export function returnOperationCounts(orders:StoredOrder[],state:MembershipCommerceState){return summarizeReturnOperations(orders.map(order=>projectReturnWorkflow(order,state)));}
