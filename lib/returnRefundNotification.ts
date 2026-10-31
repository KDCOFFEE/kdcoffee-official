import {withStoredOrderUpdateLock} from "./adminOrders";
import {readMembershipCommerceState,recordReturnRefundNotification,retryReturnNotification,ensureReturnRefundNotification} from "./membershipCommerce";
import {projectReturnSettlements} from "./returnSettlementLedger";
import {deliverNextMembershipNotification} from "./memberNotificationAutomation";
import type {ReturnDeliveryOptions} from "./returnNotificationDelivery";
/** This dispatcher cannot execute a refund. Explicit resend reuses the same notice identity. */
export async function notifyCompletedReturnRefund(orderNumber:string,requestId:string,options:ReturnDeliveryOptions&{rulesFilePath?:string;resend?:boolean;sender?:ReturnDeliveryOptions["returnLineSender"]}={}){
 return withStoredOrderUpdateLock(orderNumber,async()=>{
 const state=await readMembershipCommerceState(options.stateFilePath),effect=projectReturnSettlements(state).find(e=>e.orderId===orderNumber&&e.returnRequestId===requestId&&e.effectType==="payment_refund");
 if(!effect?.paymentResult||effect.status!=="applied")throw Error("Refund not completed");
 if(effect.notification==="sent"&&!options.resend)return {status:"sent" as const};
 const notificationId=await ensureReturnRefundNotification(orderNumber,requestId,options);
 if(!notificationId){await recordReturnRefundNotification(orderNumber,requestId,"disabled",options);return {status:"disabled" as const};}
 let notice=(await readMembershipCommerceState(options.stateFilePath)).notifications.find(n=>n.eventType==="return_refund_completed"&&n.sourceEvent===effect.effectId);
 if(options.resend&&notice)await retryReturnNotification(notice.notificationId,options);
 if(notice?.status!=="delivered"||options.resend){if(notice)await deliverNextMembershipNotification({...options,returnLineSender:options.sender,notificationId:notice.notificationId});notice=(await readMembershipCommerceState(options.stateFilePath)).notifications.find(n=>n.notificationId===notice?.notificationId);}
 if(notice?.status==="processing")return {status:effect.notification??"failed"};
 const status=!notice?"disabled" as const:notice.status==="delivered"?"sent" as const:"failed" as const;
 await recordReturnRefundNotification(orderNumber,requestId,status,options);return {status};
 });
}
