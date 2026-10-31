import {readMemberCenterCopy} from "./memberCenterCopyStore";
import {resolveMemberCopy} from "./memberCenterCopy";
import {projectReturnSettlements} from "./returnSettlementLedger";
import {createHash} from "node:crypto";
import {readOrder} from "./adminOrders";
import {resolveReturnLineEvidence} from "./orderCompletion";
import {getCanonicalPublicSiteOrigin} from "./publicSiteOrigin";
import {resolveTrustedCustomerNotificationCapability} from "./customerNotifications";
import {sendCustomerLineNotification,sendCustomerOrderEmail} from "./customerNotificationDelivery";
import {sendInternalLineNotification} from "./internalLineNotifications";
import {readMembershipCommerceState,type NotificationEvent} from "./membershipCommerce";
export type ReturnDeliveryOptions={stateFilePath?:string;lineFetcher?:typeof fetch;emailFetcher?:typeof fetch;internalSender?:typeof sendInternalLineNotification;returnLineSender?:typeof sendCustomerLineNotification};
export async function deliverReturnNotice(notice:NotificationEvent,options:ReturnDeliveryOptions){
 const delivered:NotificationEvent["channels"]=[...new Set(notice.deliveredChannels??[])];
 const order=await readOrder(String(notice.safeData.orderNumber??""));if(!order)throw Error("退貨通知找不到來源訂單");
 const state=await readMembershipCommerceState(options.stateFilePath),event=state.returnEvents?.find(e=>e.eventId===notice.sourceEvent);
 const hash=createHash("sha256").update(notice.notificationId).digest("hex"),retryKey=hash.slice(0,8)+"-"+hash.slice(8,12)+"-4"+hash.slice(13,16)+"-a"+hash.slice(17,20)+"-"+hash.slice(20,32);
 if(notice.eventType==="return_admin_request_received"){
  if(event?.type!=="RETURN_REQUESTED"||event.orderId!==order.orderNumber)throw Error("退貨通知事件無效");
  const evidence=resolveReturnLineEvidence({orderNumber:order.orderNumber,status:"completed",completion:event.completion});
  const items=event.lines.map(line=>(evidence.status==="resolved"?String(evidence.lines.find(x=>x.returnLineRef===line.returnLineRef)?.snapshot.name??"原訂單商品").slice(0,80):"原訂單商品")+" × "+line.quantity).join("、");
  const text="【KD Coffee 退貨申請】\n訂單："+order.orderNumber+"\n會員："+String(order.customer?.name??"會員").slice(0,80)+"\n商品："+items.slice(0,2000)+"\n原因："+event.reason+"\n管理："+getCanonicalPublicSiteOrigin()+"/admin/returns/"+encodeURIComponent(order.orderNumber);
  if(!delivered.includes("line")){const r=await(options.internalSender??sendInternalLineNotification)(text,{attempts:1,timeoutMs:2000,retryKey,fetcher:options.lineFetcher});if(r.sent)delivered.push("line");else throw Error("管理者 LINE 通知未送達");}if(!delivered.includes("admin"))delivered.push("admin");return {delivered};
 }
 const expected:Record<string,string>={return_request_received:"RETURN_REQUESTED",return_request_approved:"RETURN_APPROVED",return_request_rejected:"RETURN_REJECTED"};
 let authoritative=notice;
 if(notice.eventType==="return_refund_completed"){const effect=projectReturnSettlements(state).find(e=>e.effectId===notice.sourceEvent&&e.orderId===order.orderNumber&&e.returnRequestId===notice.safeData.returnRequestId&&e.effectType==="payment_refund"&&e.status==="applied");if(!effect?.paymentResult)throw Error("退款通知尚無完成證據");authoritative={...notice,safeData:{...notice.safeData,amount:effect.paymentResult.amount,method:effect.paymentResult.method}};}
 else if(event?.type!==expected[notice.eventType]||event?.orderId!==order.orderNumber||event.returnRequestId!==notice.safeData.returnRequestId)throw Error("退貨通知事件無效");
 const template=await createReturnNotificationTemplate(authoritative,order.orderNumber),capability=await resolveTrustedCustomerNotificationCapability(order),errors:string[]=[];
 if(notice.channels.includes("member_center")&&!delivered.includes("member_center"))delivered.push("member_center");
 let lineSucceeded=delivered.includes("line");if(notice.channels.includes("line")&&!lineSucceeded){if(capability.line.userId){const r=await(options.returnLineSender??sendCustomerLineNotification)({userId:capability.line.userId,template,retryKey,fetcher:options.lineFetcher});lineSucceeded=r.status==="sent";if(lineSucceeded)delivered.push("line");else errors.push("會員 LINE 通知未送達");}else errors.push("會員沒有可用 LINE 身份");}
 if((notice.channels.includes("email")||(!lineSucceeded&&notice.deliveryPolicy?.emailFallback))&&!delivered.includes("email")){if(capability.email.address){const r=await sendCustomerOrderEmail({recipientEmail:capability.email.address,orderNumber:order.orderNumber,template,subject:template.subject,idempotencyKey:notice.notificationId,fetcher:options.emailFetcher});if(r.status==="sent")delivered.push("email");else errors.push("會員 Email 通知未送達");}else errors.push("會員沒有可用 Email");}
 if(notice.channels.includes("admin")&&!delivered.includes("admin"))delivered.push("admin");return {delivered,error:errors.join("；")||undefined};
}

/** Existing editable refund copy stays authoritative; lifecycle copy shares the same catalog. */
export async function createReturnNotificationTemplate(notice:NotificationEvent,orderNumber=String(notice.safeData.orderNumber??"")){
 const copy=await readMemberCenterCopy(),text=(key:string,tokens:Record<string,string>={})=>resolveMemberCopy(copy.overrides,"member.returns."+key,tokens);
 const keys:Record<string,string>={return_request_received:"notificationReceived",return_request_approved:"notificationApproved",return_request_rejected:"notificationRejected"};
 const body=notice.eventType==="return_refund_completed"?text("refundLine",{orderNumber,amount:String(notice.safeData.amount),method:text(notice.safeData.method==="manual_cash"?"refundCash":"refundBank")}):"訂單："+orderNumber+"\n"+text(keys[notice.eventType]??"manualHelp");
 return {eventType:notice.eventType,subject:text("notificationSubject"),text:body};
}
