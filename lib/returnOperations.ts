import {summarizeReturnOperationRows} from "./returnOperationPresentation";
import type {StoredOrder} from "./adminOrders";
import {projectReturnWorkflow,type ReturnWorkflowView} from "./returnWorkflow";
import type {MembershipCommerceState} from "./membershipCommerce";
export function summarizeReturnOperations(views:ReadonlyArray<Pick<ReturnWorkflowView,"orderNumber"|"requests">>){
 const {pending,awaitingRefund,manualReview,total}=summarizeReturnOperationRows(views.flatMap(view=>view.requests.map(request=>({orderNumber:view.orderNumber,returnRequestId:request.returnRequestId,status:request.status,refundStatus:request.paymentRefund.status}))));
 return {pending,awaitingRefund,manualReview,total};
}
export function returnOperationCounts(orders:StoredOrder[],state:MembershipCommerceState){return summarizeReturnOperations(orders.map(order=>projectReturnWorkflow(order,state)));}
