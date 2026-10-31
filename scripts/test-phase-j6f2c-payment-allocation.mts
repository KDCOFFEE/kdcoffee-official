import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { allocateApprovedReturnPayment, resolveReturnRefundMethod } from "../lib/returnPaymentAllocation";
import { prepareOrderCompletionWrite, type OrderCompletionSnapshot } from "../lib/orderCompletion";
import { executeOrderReturnCommand, readMembershipCommerceState } from "../lib/membershipCommerce";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } from "../lib/membershipBusinessRules";
const root=await fs.mkdtemp(path.join(os.tmpdir(),"kd-j6f2c-payment-"));
process.env.KD_DATA_DIR=root;
const rules=structuredClone(DEFAULT_MEMBERSHIP_RULES); rules.credit.appliesToShipping="no";
await saveMembershipBusinessRules({expectedRevision:0,rules});
await fs.mkdir(path.join(root,"orders"),{recursive:true});
let count=0,serial=0,operation=0;
function check(label:string,fn:()=>void){fn();console.log("PASS "+(++count)+" "+label);}
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
 return {order,approved};
}
const quote=async(f:Awaited<ReturnType<typeof fixture>>,id:string)=>allocateApprovedReturnPayment(f.order,(await readMembershipCommerceState()).returnEvents??[],id);
for(const [method,result] of [["pickup_confirmation","manual_cash"],["atm_transfer","manual_bank_transfer"],["cash_on_delivery","manual_bank_transfer"],["credit_card","manual_review_required"],["unknown","manual_review_required"]])check("route "+method,()=>assert.equal(resolveReturnRefundMethod({payment:method}),result));
check("unrelated order property does not opt into new request routing",()=>assert.equal(resolveReturnRefundMethod({orderMode:"studio_pickup",returnHandoff:"in_person"}),"manual_review_required"));
check("conflicting payment evidence needs review",()=>assert.equal(resolveReturnRefundMethod({payment:"atm_transfer",paymentDetails:{method:"cash_on_delivery"}}),"manual_review_required"));
const f=await fixture();const id=await f.approved(2),result=await quote(f,id);assert.equal(result.status,"resolved");
if(result.status==="resolved"){
 check("1000 merchandise + 100 shipping + 50 COD refunds 1000",()=>assert.equal(result.amount,1000));
 check("original shipping retained",()=>assert.equal(result.retainedHomeShipping,100));
 check("original COD fee retained",()=>assert.equal(result.retainedCodFee,50));
 check("original paid cap",()=>assert.equal(result.originalPaidTotal,1150));
}
const discounted=await fixture(40);const discountedResult=await quote(discounted,await discounted.approved(2));
check("discounted historical shipping is 40; no duplicate deduction",()=>{assert.equal(discountedResult.status,"resolved");if(discountedResult.status==="resolved"){assert.equal(discountedResult.amount,1000);assert.equal(discountedResult.retainedHomeShipping,40);}});
const withCredit=await fixture(0,0,200);const creditResult=await quote(withCredit,await withCredit.approved(2));
check("200 member credit never becomes payment refund",()=>{assert.equal(creditResult.status,"resolved");if(creditResult.status==="resolved")assert.equal(creditResult.amount,800);});
const partial=await fixture(0,0,2,"home_delivery",1002,3);const partialIds=[await partial.approved(1),await partial.approved(1),await partial.approved(1)];const portions=await Promise.all(partialIds.map(id=>quote(partial,id)));
check("partial integer allocation conserves exactly 1000",()=>assert.deepEqual(portions.map(p=>p.status==="resolved"?p.amount:null),[334,333,333]));
const retry=await quote(f,id);
check("retry quote remains stable",()=>assert.deepEqual(retry,result));
check("unapproved request cannot quote a refund",()=>assert.equal(allocateApprovedReturnPayment(f.order,[],id).status,"manual_review_required"));
const other=await fixture(60,0,0,"711_cod");const otherResult=await quote(other,await other.approved(2));
check("unapproved shipping category requires separate Owner decision",()=>{assert.equal(otherResult.status,"resolved");if(otherResult.status==="resolved"){assert.equal(otherResult.otherShippingReviewRequired,true);assert.equal(otherResult.amount,1000);}});
const changedRules=structuredClone(rules);changedRules.shipping.homeDeliveryShippingFee=999;changedRules.shipping.homeDeliveryCodFee=25;
const store=JSON.parse(await fs.readFile(path.join(root,"membership-commerce/business-rules.json"),"utf8"));
await saveMembershipBusinessRules({expectedRevision:store.revision,rules:changedRules});
const afterFeeChange=await quote(f,id);
check("current Admin fees do not rewrite historical quote",()=>assert.deepEqual(afterFeeChange,result));
console.log("J6F2C PAYMENT ALLOCATION "+count+" PASS; isolated data; no refund executed.");
