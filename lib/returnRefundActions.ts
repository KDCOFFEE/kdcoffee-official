import { privateResolvedRefundBank, resolveReturnRefundReview } from "./returnRefundReview";
import { randomUUID } from "node:crypto";
import { validOrderPhotoSelection } from "./orderPhotoPolicy";
import { readMembershipCommerceState, confirmManualReturnPayment } from "./membershipCommerce";
import { projectReturnSettlements } from "./returnSettlementLedger";
import { ReturnWorkflowError } from "./returnCreditPreview";
import { getActiveMembershipRules } from "./membershipBusinessRules";
import { validateAndStoreOrderNotificationPhoto } from "./orderNotificationPhotos";
import { notifyCompletedReturnRefund } from "./returnRefundNotification";
export async function returnRefundAction(orderNumber:string,adminId:string,values:Record<string,unknown>,runtime:{stateFilePath?:string;rulesFilePath?:string;now?:Date;photos?:File[]}){
 const requestId=String(values.returnRequestId??"");
 const state=await readMembershipCommerceState(runtime.stateFilePath);
 const effect=projectReturnSettlements(state).find(e=>e.orderId===orderNumber&&e.returnRequestId===requestId&&e.effectType==="payment_refund");
 const request=state.returnEvents?.find(e=>e.orderId===orderNumber&&e.returnRequestId===requestId&&e.type==="RETURN_REQUESTED");
 if(!effect||request?.type!=="RETURN_REQUESTED")throw new ReturnWorkflowError("return_not_approved");
 if(values.action==="refund_review_resolve")return resolveReturnRefundReview(orderNumber,requestId,adminId,values,runtime);
 if(values.action==="refund_details")return {bank:await privateResolvedRefundBank(orderNumber,requestId,runtime.stateFilePath)};
 if(values.action==="refund_notify")return notifyCompletedReturnRefund(orderNumber,requestId,{...runtime,resend:true});
 if(values.action!=="refund_confirm"||values.manuallyPaid!==true)throw new ReturnWorkflowError("invalid_input",400);
 const prepareProof=async()=>{
  const proof=[];
  for(const photo of runtime.photos??[])proof.push(await validateAndStoreOrderNotificationPhoto(photo,randomUUID()));
  return proof;
 };
 if(effect.status!=="applied"&&runtime.photos?.length){const settings=(await getActiveMembershipRules(runtime.now,runtime.rulesFilePath)).rules.returnRefund;if(!settings?.proofEnabled||runtime.photos.length>3||runtime.photos.some(photo=>!validOrderPhotoSelection(photo)))throw new ReturnWorkflowError("invalid_photos",400);}
 const result=await confirmManualReturnPayment(orderNumber,requestId,adminId,{...runtime,prepareProof,note:typeof values.note==="string"?values.note:""});
 let notification;try{notification=await notifyCompletedReturnRefund(orderNumber,requestId,runtime);}catch{notification={status:"failed"};}
 return {...result,notification};
}
