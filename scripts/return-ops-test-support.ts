import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {prepareOrderCompletionWrite} from "../lib/orderCompletion";
import {DEFAULT_MEMBERSHIP_RULES,saveMembershipBusinessRules} from "../lib/membershipBusinessRules";
import {DEFAULT_RETURN_REFUND_SETTINGS} from "../lib/returnRefundSettings";
import {memberReturnAction,getReturnWorkflow} from "../lib/returnWorkflow";
import {executeOrderReturnCommand} from "../lib/membershipCommerce";
import {registerEmailMember} from "../lib/memberAuth";
export async function returnOpsFixture(options:{payment?:string;badTotal?:boolean;rules?:(r:typeof DEFAULT_MEMBERSHIP_RULES)=>void}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"kd-j6f3-ops-"));process.env.KD_DATA_DIR=root;process.env.AUTH_SESSION_SECRET="isolated-j6f3-only-long-secret-at-least-40-characters";process.env.ADMIN_SESSION_SECRET="isolated-j6f3-admin-long-secret-at-least-40-characters";
 for(const k of Object.keys(process.env))if(/^(RAILWAY_|LINE_|GMAIL_|GOOGLE_|SMTP_|RESEND_)/.test(k))delete process.env[k];
 const rules=structuredClone(DEFAULT_MEMBERSHIP_RULES);rules.returnRefund=structuredClone(DEFAULT_RETURN_REFUND_SETTINGS);for(const key of ["courier","in_person"] as const)Object.assign(rules.returnRefund.destinations[key],{enabled:true,address:"Synthetic QA workshop",recipient:"QA",phone:"0000000000"});options.rules?.(rules);await saveMembershipBusinessRules({expectedRevision:0,rules});
 const member=await registerEmailMember("return-ops@example.test","Isolated-Password-2026");assert.ok(member);
 const orderNumber="KD20261031-"+Date.now(),payment=options.payment??"unknown",base={orderNumber,createdAt:new Date().toISOString(),status:"ready_for_pickup",orderMode:"home_delivery",payment,paymentDetails:{method:payment,status:"paid"},customer:{name:"Isolated Return Member",email:"return-ops@example.test"},member:{memberId:member.id,lineUserId:"U"+"a".repeat(32)},items:[{slug:"qa-coffee",optionId:"original",name:"QA Coffee",quantity:1,unitPrice:500,lineTotal:500}],subtotal:500,shipping:0,codServiceFee:0,totalBeforeCredit:options.badTotal?499:500,total:options.badTotal?499:500,credit:{appliedAmount:0}};
 const order=await prepareOrderCompletionWrite(base,{...base,status:"completed"});await fs.mkdir(path.join(root,"orders"),{recursive:true});const file=path.join(root,"orders",orderNumber+".json"),bytes=JSON.stringify(order);await fs.writeFile(file,bytes);
 const view=await getReturnWorkflow(orderNumber,member.id),bank={bank:"822｜中國信託商業銀行",holder:"QA Member",account:"12345678901234",branch:""};
 const values={lines:[{returnLineRef:view.lines[0].returnLineRef,quantity:1}],reason:"商品破損／瑕疵",quantityAcknowledged:true,conditionAcknowledgement:{itemsComplete:true as const,unopenedUnusedWhereApplicable:true as const},refundHandoff:"courier",refundBank:bank};
 const preview=options.badTotal?null:await memberReturnAction(orderNumber,member.id,{...values,action:"preview"});const command={...values,action:"create",confirmationToken:preview?.confirmationToken,finalConfirmation:true,idempotencyKey:"qa-return"};const legacy=options.badTotal?await executeOrderReturnCommand({orderNumber,actor:{actorId:member.id,authority:"customer"},command:{type:"RETURN_REQUESTED",lines:values.lines,conditionAcknowledgement:values.conditionAcknowledgement},reason:values.reason,idempotencyKey:"legacy-insufficient-evidence",authorizeOrder:()=>{}}):null;const created=legacy?.status==="applied"?{returnRequestId:legacy.event.returnRequestId}:await memberReturnAction(orderNumber,member.id,command);const requestId=created.returnRequestId;assert.ok(requestId);
 async function transition(type:"RETURN_APPROVED"|"RETURN_REJECTED"){const r=await executeOrderReturnCommand({orderNumber,actor:{actorId:"owner",authority:"reviewer"},command:{type,returnRequestId:requestId!},reason:"PRIVATE OWNER REVIEW NOTE",idempotencyKey:type,authorizeOrder:()=>{}});assert.equal(r.status,"applied");return r;}
 return {root,rules,member,orderNumber,requestId,bank,file,bytes,command,transition,view:()=>getReturnWorkflow(orderNumber),memberView:()=>getReturnWorkflow(orderNumber,member.id),cleanup:async()=>{assert.ok(root.startsWith(path.join(os.tmpdir(),"kd-j6f3-ops-")));await fs.rm(root,{recursive:true,force:true});}};
}
