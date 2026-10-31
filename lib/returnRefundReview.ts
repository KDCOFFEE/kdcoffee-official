import { withStoredOrderUpdateLock } from "./adminOrders";
import { readMembershipCommerceState, resolveReturnRefundReview } from "./membershipCommerce";
import { projectReturnSettlements } from "./returnSettlementLedger";
import { effectiveRefundRequest } from "./returnRefundResolution";
export { resolveReturnRefundReview };
/** Only invoked after the existing authenticated Admin boundary. */
export async function privateResolvedRefundBank(orderNumber:string,requestId:string,stateFilePath?:string){
 return withStoredOrderUpdateLock(orderNumber,async()=>{const state=await readMembershipCommerceState(stateFilePath);const effect=projectReturnSettlements(state).find(e=>e.orderId===orderNumber&&e.returnRequestId===requestId&&e.effectType==="payment_refund");const request=state.returnEvents?.find(e=>e.orderId===orderNumber&&e.returnRequestId===requestId&&e.type==="RETURN_REQUESTED");return effectiveRefundRequest(request?.type==="RETURN_REQUESTED"?request.confirmation?.refundRequest:undefined,effect?.routingResolution)?.bank??null;});
}
