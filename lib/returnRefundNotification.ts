import { withStoredOrderUpdateLock } from "./adminOrders";
import { readMembershipCommerceState, recordReturnRefundNotification } from "./membershipCommerce";
import { projectReturnSettlements } from "./returnSettlementLedger";
import { getActiveMembershipRules } from "./membershipBusinessRules";
import { resolveTrustedCustomerNotificationCapability } from "./customerNotifications";
import { sendCustomerLineNotification } from "./customerNotificationDelivery";
import { readMemberCenterCopy } from "./memberCenterCopyStore";
import { resolveMemberCopy } from "./memberCenterCopy";
/** Notification delivery never executes or re-confirms a payment. */
export async function notifyCompletedReturnRefund(orderNumber:string,requestId:string,options:{stateFilePath?:string;rulesFilePath?:string;resend?:boolean;sender?:typeof sendCustomerLineNotification}={}) {
 return withStoredOrderUpdateLock(orderNumber,async order=>{
  const state=await readMembershipCommerceState(options.stateFilePath);
  const effect=projectReturnSettlements(state).find(e=>e.orderId===orderNumber&&e.returnRequestId===requestId&&e.effectType==="payment_refund");
  if(!effect?.paymentResult||effect.status!=="applied")throw Error("Refund not completed");
  if(effect.notification==="sent"&&!options.resend)return {status:"sent"};
  let status:"sent"|"failed"|"disabled"="failed";
  try {
   const settings=(await getActiveMembershipRules(undefined,options.rulesFilePath)).rules.returnRefund;
   if(!settings?.lineEnabled)status="disabled";
   else {const capability=await resolveTrustedCustomerNotificationCapability(order);if(capability.line.userId){
    const copy=await readMemberCenterCopy(),result=effect.paymentResult;
    const text=resolveMemberCopy(copy.overrides,"member.returns.refundLine",{orderNumber,amount:String(result.amount),method:resolveMemberCopy(copy.overrides,result.method==="manual_cash"?"member.returns.refundCash":"member.returns.refundBank")});
    const delivery=await (options.sender??sendCustomerLineNotification)({userId:capability.line.userId,template:{eventType:"return_refund_completed",subject:"退款完成通知",text}});
    status=delivery.status==="sent"?"sent":"failed";
   }}
  }catch{status="failed";}
  await recordReturnRefundNotification(orderNumber,requestId,status,options);return {status};
 });
}
