import sharp from "sharp";
import {POST} from "../app/api/admin/returns/[orderNumber]/route";
import {createAdminSessionValue,adminCookieName} from "../lib/adminAuth";
import {spawnSync} from "node:child_process";
import {DEFAULT_RETURN_REFUND_SETTINGS} from "../lib/returnRefundSettings";
import {memberReturnAction,adminReturnAction,getReturnWorkflow} from "../lib/returnWorkflow";
import {projectReturnSettlements} from "../lib/returnSettlementLedger";
import {notifyCompletedReturnRefund} from "../lib/returnRefundNotification";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prepareOrderCompletionWrite, type OrderCompletionSnapshot } from "../lib/orderCompletion";
import { executeOrderReturnCommand, readMembershipCommerceState } from "../lib/membershipCommerce";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } from "../lib/membershipBusinessRules";
const root=await fs.mkdtemp(path.join(os.tmpdir(),"kd-j6f2c-payment-"));
process.env.KD_DATA_DIR=root;
process.env.AUTH_SESSION_SECRET="isolated-j6f2c-test-secret-long-enough-for-signing";for(const key of ["LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN","LINE_CHANNEL_ACCESS_TOKEN"])delete process.env[key];
const rules=structuredClone(DEFAULT_MEMBERSHIP_RULES); rules.credit.appliesToShipping="no";rules.returnRefund=structuredClone(DEFAULT_RETURN_REFUND_SETTINGS);rules.returnRefund.destinations.in_person={...rules.returnRefund.destinations.in_person,enabled:true,address:"QA workshop only"};rules.returnRefund.destinations.courier={...rules.returnRefund.destinations.courier,enabled:true,address:"QA workshop only",recipient:"QA",phone:"0000000000"};
await saveMembershipBusinessRules({expectedRevision:0,rules});
await fs.mkdir(path.join(root,"orders"),{recursive:true});
let serial=0,operation=0;
async function fixture(shipping=100,cod=50,credit=0,mode="home_delivery",subtotal=1000,quantity=2){
 const orderNumber="KD20261029-"+String(9800+(++serial));
 const base={orderNumber,createdAt:"2026-10-29T01:00:00Z",status:"ready_for_pickup",orderMode:mode,payment:"cash_on_delivery",paymentDetails:{method:"cash_on_delivery",status:"paid"},
 items:[{slug:"fixture-coffee",optionId:"original",quantity,unitPrice:subtotal/quantity,lineTotal:subtotal}],subtotal,shipping,codServiceFee:cod,totalBeforeCredit:subtotal+shipping+cod,total:subtotal+shipping+cod-credit,credit:{appliedAmount:credit,rulesVersion:2}};
 const order=await prepareOrderCompletionWrite(base,{...base,status:"completed",fulfillmentEvents:[{eventId:"done-"+orderNumber,state:"completed",occurredAt:"2026-10-29T02:00:00Z"}]});
 await fs.writeFile(path.join(root,"orders",orderNumber+".json"),JSON.stringify(order));
 const completion=order.completion as OrderCompletionSnapshot;
 assert.equal(completion.returnLines?.status,"resolved");
 const ref=completion.returnLines!.status==="resolved"?completion.returnLines!.lines[0].returnLineRef:"";
 async function approved(q:number){
  const request=await executeOrderReturnCommand({orderNumber,actor:{actorId:"qa-member",authority:"customer"},command:{type:"RETURN_REQUESTED",lines:[{returnLineRef:ref,quantity:q}],conditionAcknowledgement:{itemsComplete:true,unopenedUnusedWhereApplicable:true}},reason:"QA",idempotencyKey:"request-"+(++operation),authorizeOrder:()=>{},now:new Date("2026-10-29T03:00:00Z")});
  assert.equal(request.status,"applied");if(request.status!=="applied")throw Error("request failed");
  const id=request.event.returnRequestId;
  const approval=await executeOrderReturnCommand({orderNumber,actor:{actorId:"qa-admin",authority:"reviewer"},command:{type:"RETURN_APPROVED",returnRequestId:id},reason:"QA",idempotencyKey:"approve-"+(++operation),authorizeOrder:()=>{},now:new Date("2026-10-29T04:00:00Z")});
  assert.equal(approval.status,"applied");
  return id;
 }
 return {order,approved,orderNumber,ref};
}

process.env.ADMIN_SESSION_SECRET="isolated-refund-admin-secret-longer-than-thirty-two";
const globals=globalThis as typeof globalThis & {__returnCookies?:Record<string,string>};
const account="12345678901234";
const previousProofUrls:string[]=[];
const png=await sharp({create:{width:8,height:8,channels:3,background:"white"}}).png().toBuffer();
for(const [method,mode] of [["pickup_confirmation","studio_pickup"],["atm_transfer","home_delivery"],["cash_on_delivery","home_delivery"],["cash_on_delivery","711_cod"]]){
 const f=await fixture(0,0,0,mode);const order={...f.order,payment:method,paymentDetails:{method,status:"paid"},member:{memberId:"qa-member",lineUserId:"U"+"a".repeat(32)}};
 await fs.writeFile(path.join(root,"orders",f.orderNumber+".json"),JSON.stringify(order));
 const values={lines:[{returnLineRef:f.ref,quantity:2}],reason:"QA",conditionAcknowledgement:{itemsComplete:true,unopenedUnusedWhereApplicable:true},quantityAcknowledged:true,refundHandoff:"courier",refundBank:{bank:"QA bank",holder:"QA member",account,branch:""}};
 if(method!=="pickup_confirmation"){await assert.rejects(()=>memberReturnAction(f.orderNumber,"qa-member",{...values,refundBank:null,action:"preview"}));console.log("PASS bank required "+method);}
 const preview=await memberReturnAction(f.orderNumber,"qa-member",{...values,action:"preview"});
 assert.ok(preview.confirmationToken);
 const created=await memberReturnAction(f.orderNumber,"qa-member",{...values,action:"create",finalConfirmation:true,confirmationToken:preview.confirmationToken,idempotencyKey:"integration-create-"+f.orderNumber});assert.ok(created.returnRequestId);
 const rid=created.returnRequestId!;
 const saved=(await readMembershipCommerceState()).returnEvents?.find(e=>e.returnRequestId===rid&&e.type==="RETURN_REQUESTED");assert.ok(saved?.type==="RETURN_REQUESTED"&&saved.confirmation?.refundRequest?.destination.address==="QA workshop only");
 const changedStore=JSON.parse(await fs.readFile(path.join(root,"membership-commerce/business-rules.json"),"utf8"));rules.returnRefund!.destinations.courier.address="Updated QA destination";await saveMembershipBusinessRules({expectedRevision:changedStore.revision,rules});
 const historical=await getReturnWorkflow(f.orderNumber,"qa-member");assert.equal(historical.refundSettings!.destinations.courier.address,"Updated QA destination");assert.equal(historical.requests[0].refundRequest!.destination.address,"QA workshop only");
 const resetStore=JSON.parse(await fs.readFile(path.join(root,"membership-commerce/business-rules.json"),"utf8"));rules.returnRefund!.destinations.courier.address="QA workshop only";await saveMembershipBusinessRules({expectedRevision:resetStore.revision,rules});
 const beforeAdminPreview=await fs.readFile(path.join(root,"membership-commerce/commerce-state.json"),"utf8");const adminPreview=await getReturnWorkflow(f.orderNumber);assert.equal(adminPreview.requests[0].paymentRefund.quote.status,"resolved");if(adminPreview.requests[0].paymentRefund.quote.status==="resolved")assert.equal(adminPreview.requests[0].paymentRefund.quote.amount,1000);assert.equal(await fs.readFile(path.join(root,"membership-commerce/commerce-state.json"),"utf8"),beforeAdminPreview);
 await adminReturnAction(f.orderNumber,"qa-admin",{action:"approve",returnRequestId:rid,reason:"QA approved",idempotencyKey:"integration-approve-"+f.orderNumber});
 for(const member of [undefined,"qa-member"]){const view=await getReturnWorkflow(f.orderNumber,member);assert.equal(JSON.stringify(view).includes(account),false);assert.equal(view.requests[0].paymentRefund.status,"pending");assert.deepEqual(view.requests[0].paymentRefund.proof,[]);}
 const details=await adminReturnAction(f.orderNumber,"qa-admin",{action:"refund_details",returnRequestId:rid});if(method!=="pickup_confirmation")assert.ok("bank" in details&&details.bank?.account===account);else assert.ok("bank" in details&&details.bank===null);
 const before=await readMembershipCommerceState();const nonPayment=projectReturnSettlements(before).filter(e=>e.effectType!=="payment_refund");
 globals.__returnCookies={};const denied=await POST(new Request("http://localhost:3162/api/admin/returns/"+f.orderNumber,{method:"POST",headers:{Origin:"http://localhost:3162","Content-Type":"application/json"},body:JSON.stringify({action:"refund_details",returnRequestId:rid})}),{params:Promise.resolve({orderNumber:f.orderNumber})});assert.equal(denied.status,401);
 globals.__returnCookies={[adminCookieName]:createAdminSessionValue({adminId:"qa-admin",role:"owner"})};
 const http=async()=>{const form=new FormData();form.append("payload",JSON.stringify({action:"refund_confirm",returnRequestId:rid,manuallyPaid:true,note:"QA external transfer"}));form.append("photos",new File([new Uint8Array(png)],"proof.png",{type:"image/png"}));const response=await POST(new Request("http://localhost:3162/api/admin/returns/"+f.orderNumber,{method:"POST",headers:{Origin:"http://localhost:3162"},body:form}),{params:Promise.resolve({orderNumber:f.orderNumber})});assert.equal(response.status,200);return response.json();};
 const outcomes=await Promise.all([http(),http()]);
 assert.equal(outcomes.filter(o=>"additionalRefund"in o&&o.additionalRefund===1000).length,1);
 const retry=await adminReturnAction(f.orderNumber,"qa-admin",{action:"refund_confirm",returnRequestId:rid,manuallyPaid:true});assert.ok("additionalRefund"in retry&&retry.additionalRefund===0);
 const restarted=spawnSync(process.execPath,["--experimental-strip-types","--import","./scripts/return-settlement-test-bootstrap.mjs","--input-type=module","-e","import {adminReturnAction} from './lib/returnWorkflow.ts';const result=await adminReturnAction(process.env.QA_RETRY_ORDER,'qa-admin',{action:'refund_confirm',returnRequestId:process.env.QA_RETRY_RETURN,manuallyPaid:true});if(result.additionalRefund!==0)process.exit(2);"],{env:{...process.env,QA_RETRY_ORDER:f.orderNumber,QA_RETRY_RETURN:rid},encoding:"utf8",windowsHide:true});assert.equal(restarted.status,0,restarted.stderr);
 const state=await readMembershipCommerceState();assert.deepEqual(projectReturnSettlements(state).filter(e=>e.effectType!=="payment_refund"),nonPayment);
 const effect=projectReturnSettlements(state).find(e=>e.returnRequestId===rid&&e.effectType==="payment_refund")!;assert.equal(effect.status,"applied");assert.equal(effect.paymentResult!.proof.length,1);await fs.stat(path.join(root,effect.paymentResult!.proof[0].url.replace(/^\/uploads/,"uploads")));assert.equal(state.returnSettlementEvents?.filter(e=>e.effectId===effect.effectId&&e.type==="APPLIED").length,1);
 const memberView=await getReturnWorkflow(f.orderNumber,"qa-member"),memberProof=memberView.requests[0].paymentRefund.proof;
 assert.deepEqual((await getReturnWorkflow(f.orderNumber)).requests[0].paymentRefund.proof,effect.paymentResult!.proof);assert.deepEqual(memberProof,effect.paymentResult!.proof.map(({url,width,height})=>({url,width,height})));assert.deepEqual(Object.keys(memberProof[0]).sort(),["height","url","width"]);
 const serialized=JSON.stringify(memberView);for(const secret of [account,effect.effectId,effect.paymentResult!.allocationFingerprint,"QA external transfer","QA approved","evidenceFingerprint"])assert.ok(!serialized.includes(secret));
 for(const url of previousProofUrls)assert.ok(!serialized.includes(url));previousProofUrls.push(memberProof[0].url);
 await assert.rejects(()=>getReturnWorkflow(f.orderNumber,"another-member"));
 const store=JSON.parse(await fs.readFile(path.join(root,"membership-commerce/business-rules.json"),"utf8"));rules.returnRefund!.lineEnabled=true;await saveMembershipBusinessRules({expectedRevision:store.revision,rules});
 let calls=0;await notifyCompletedReturnRefund(f.orderNumber,rid,{resend:true,sender:async input=>{assert.equal(input.template.text.includes(account),false);assert.ok(input.template.text.includes(f.orderNumber));assert.ok(input.template.text.includes("1000"));assert.ok(input.template.text.includes(method==="pickup_confirmation"?"現場退款":"銀行轉帳"));calls++;return {status:"failed"};}});assert.equal(calls,1);const failedMember=(await getReturnWorkflow(f.orderNumber,"qa-member")).requests[0].paymentRefund;assert.equal(failedMember.notification,"failed");assert.deepEqual(failedMember.proof,memberProof);assert.equal(projectReturnSettlements(await readMembershipCommerceState()).find(e=>e.effectId===effect.effectId)?.status,"applied");
 await notifyCompletedReturnRefund(f.orderNumber,rid,{resend:true,sender:async()=>({status:"sent"})});const final=projectReturnSettlements(await readMembershipCommerceState()).find(e=>e.effectId===effect.effectId)!;assert.equal(final.notification,"sent");assert.equal(final.paymentResult!.amount,1000);assert.deepEqual((await getReturnWorkflow(f.orderNumber,"qa-member")).requests[0].paymentRefund.proof,memberProof);assert.equal((await readMembershipCommerceState()).returnSettlementEvents?.filter(e=>e.effectId===effect.effectId&&e.type==="APPLIED").length,1);
 rules.returnRefund!.lineEnabled=false;const next=JSON.parse(await fs.readFile(path.join(root,"membership-commerce/business-rules.json"),"utf8"));await saveMembershipBusinessRules({expectedRevision:next.revision,rules});
 console.log("PASS end-to-end "+method+" "+mode+": snapshot, privacy, confirmation, concurrent retry +0, separate notification failure/resend");
}

// Exact binding also holds across two independent returns on the same source order.
const split=await fixture(0,0);await fs.writeFile(path.join(root,"orders",split.orderNumber+".json"),JSON.stringify({...split.order,member:{memberId:"qa-member"}}));
const bound:string[][]=[];
for(let index=0;index<2;index++){
 const values={lines:[{returnLineRef:split.ref,quantity:1}],reason:"QA exact proof binding",quantityAcknowledged:true,conditionAcknowledgement:{itemsComplete:true,unopenedUnusedWhereApplicable:true},refundHandoff:"courier",refundBank:{bank:"QA",holder:"QA",account,branch:""}};
 const preview=await memberReturnAction(split.orderNumber,"qa-member",{...values,action:"preview"});
 const created=await memberReturnAction(split.orderNumber,"qa-member",{...values,action:"create",confirmationToken:preview.confirmationToken,finalConfirmation:true,idempotencyKey:"split-proof-"+index});
 const rid=created.returnRequestId!;
 let requests=(await getReturnWorkflow(split.orderNumber,"qa-member")).requests;assert.deepEqual(requests.find(r=>r.returnRequestId===rid)!.paymentRefund.proof,[]);
 if(index)assert.deepEqual(requests[0].paymentRefund.proof.map(p=>p.url),bound[0]);
 await adminReturnAction(split.orderNumber,"qa-admin",{action:"approve",returnRequestId:rid,reason:"QA",idempotencyKey:"approve-split-proof-"+index});
 await adminReturnAction(split.orderNumber,"qa-admin",{action:"refund_confirm",returnRequestId:rid,manuallyPaid:true,note:"private split proof note"},{photos:[new File([new Uint8Array(png)],"proof.png",{type:"image/png"})]});
 requests=(await getReturnWorkflow(split.orderNumber,"qa-member")).requests;const proof=requests.find(r=>r.returnRequestId===rid)!.paymentRefund.proof;assert.equal(proof.length,1);bound.push(proof.map(p=>p.url));
 if(index){assert.notEqual(bound[0][0],bound[1][0]);assert.deepEqual(requests[0].paymentRefund.proof.map(p=>p.url),bound[0]);assert.deepEqual(requests[1].paymentRefund.proof.map(p=>p.url),bound[1]);}
 assert.ok(!JSON.stringify(requests).includes("private split proof note"));
}
console.log("PASS Member proof: exact order + return + applied payment binding; pending hidden; safe metadata; ownership; note/account privacy; LINE retry leaves proof/payment unchanged");
console.log("J6F2C INTEGRATION PASS; isolated data; simulated external manual confirmation only");
