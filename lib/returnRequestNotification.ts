import {readMembershipCommerceState} from "./membershipCommerce";
import {deliverNextMembershipNotification} from "./memberNotificationAutomation";
import type {ReturnDeliveryOptions} from "./returnNotificationDelivery";
/** Dispatch only already-persisted return notices; failures never undo the transition. */
export async function notifyReturnRequest(input:{orderNumber:string;returnRequestId:string;replayed:boolean},options:ReturnDeliveryOptions&{sender?:ReturnDeliveryOptions["internalSender"]}={}){
 if(input.replayed)return {status:"skipped" as const};
 try{const state=await readMembershipCommerceState(options.stateFilePath);const notices=state.notifications.filter(n=>n.safeData.orderNumber===input.orderNumber&&n.safeData.returnRequestId===input.returnRequestId&&n.eventType.startsWith("return_")&&n.eventType!=="return_refund_completed");let status:"sent"|"failed"|"skipped"="skipped";for(const n of notices){if(n.status!=="pending")continue;const r=await deliverNextMembershipNotification({...options,internalSender:options.sender??options.internalSender,notificationId:n.notificationId});if(n.eventType==="return_admin_request_received")status=r?.status==="delivered"?"sent":"failed";}return {status};}catch{return {status:"failed" as const};}
}
