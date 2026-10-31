import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {prepareOrderCompletionWrite} from "../lib/orderCompletion";
import {DEFAULT_MEMBERSHIP_RULES,saveMembershipBusinessRules} from "../lib/membershipBusinessRules";
import {DEFAULT_RETURN_REFUND_SETTINGS} from "../lib/returnRefundSettings";
import {memberReturnAction,adminReturnAction,getReturnWorkflow} from "../lib/returnWorkflow";
import {resolveReturnRefundMethod} from "../lib/returnPaymentAllocation";
import {readMembershipCommerceState} from "../lib/membershipCommerce";
import {projectReturnSettlements} from "../lib/returnSettlementLedger";
const root=await fs.mkdtemp(path.join(os.tmpdir(),"kd-refund-routing-safety-"));process.env.KD_DATA_DIR=root;process.env.AUTH_SESSION_SECRET="isolated-routing-safety-secret-long-enough-for-tokens";
const rules=structuredClone(DEFAULT_MEMBERSHIP_RULES);rules.returnRefund=structuredClone(DEFAULT_RETURN_REFUND_SETTINGS);
for(const key of ["in_person","courier","seven_eleven"] as const)rules.returnRefund.destinations[key]={...rules.returnRefund.destinations[key],enabled:true,address:"QA only",recipient:"QA",phone:"0000000000",storeName:"QA",storeNumber:"123456"};await saveMembershipBusinessRules({expectedRevision:0,rules});await fs.mkdir(path.join(root,"orders"),{recursive:true});
let n=0,serial=0;const check=(label:string,fn:()=>void)=>{fn();console.log("PASS "+(++n)+" "+label);};
const cases=[
 ["atm_transfer","home_delivery","in_person","manual_cash"],["cash_on_delivery","home_delivery","in_person","manual_cash"],["cash_on_delivery","711_cod","in_person","manual_cash"],["pickup_confirmation","studio_pickup","in_person","manual_cash"],
 ["credit_card","home_delivery","in_person","manual_review_required"],["credit_card","home_delivery","courier","manual_review_required"],["credit_card","home_delivery","seven_eleven","manual_review_required"],["unknown","home_delivery","in_person","manual_review_required"],["atm_transfer","ambiguous","in_person","manual_review_required"],
 ["atm_transfer","home_delivery","courier","manual_bank_transfer"],["cash_on_delivery","home_delivery","courier","manual_bank_transfer"],["cash_on_delivery","711_cod","seven_eleven","manual_bank_transfer"],["pickup_confirmation","studio_pickup","courier","manual_cash"]
];
for(const [payment,mode,handoff,expected]of cases){
 const orderNumber="KD20261030-"+(99500+(++serial)),now=new Date(),orderMode=mode==="ambiguous"?"home_delivery":mode,shipping=orderMode==="home_delivery"?40:0,cod=orderMode==="home_delivery"&&payment==="cash_on_delivery"?25:0;
 const base={orderNumber,createdAt:now.toISOString(),status:"ready_for_pickup",orderMode,payment,paymentDetails:{method:mode==="ambiguous"?"cash_on_delivery":payment,status:"paid"},member:{memberId:"qa-route-member"},items:[{slug:"qa",optionId:"qa",quantity:1,unitPrice:500,lineTotal:500}],subtotal:500,shipping,codServiceFee:cod,totalBeforeCredit:500+shipping+cod,total:500+shipping+cod,credit:{appliedAmount:0}};
 const order=await prepareOrderCompletionWrite(base,{...base,status:"completed",fulfillmentEvents:[{eventId:"done-"+orderNumber,state:"completed",occurredAt:now.toISOString()}]});await fs.writeFile(path.join(root,"orders",orderNumber+".json"),JSON.stringify(order));
 const view=await getReturnWorkflow(orderNumber,"qa-route-member"),values={lines:[{returnLineRef:view.lines[0].returnLineRef,quantity:1}],reason:"QA routing safety",quantityAcknowledged:true,conditionAcknowledgement:{itemsComplete:true,unopenedUnusedWhereApplicable:true},refundHandoff:handoff,refundBank:{bank:"QA",holder:"QA",account:"12345678",branch:""}};
 check(payment+"/"+mode+" + "+handoff,()=>assert.equal(resolveReturnRefundMethod(order,handoff),expected));
 const preview=await memberReturnAction(orderNumber,"qa-route-member",{...values,action:"preview"});assert.ok("paymentPreview"in preview);
 check("server preview shares route and preserves amounts",()=>{assert.equal(preview.paymentPreview?.method,expected);if(expected==="manual_review_required")assert.equal(preview.paymentPreview?.status,"manual_review_required");else{assert.equal(preview.paymentPreview?.status,"resolved");if(preview.paymentPreview?.status==="resolved"){assert.equal(preview.paymentPreview.amount,500);assert.equal(preview.paymentPreview.shippingAmount,shipping);assert.equal(preview.paymentPreview.codFee,cod);}}});
 if(expected==="manual_review_required"){
  const created=await memberReturnAction(orderNumber,"qa-route-member",{...values,action:"create",finalConfirmation:true,confirmationToken:preview.confirmationToken,idempotencyKey:"safety-create-"+serial});const rid=created.returnRequestId!;
  await adminReturnAction(orderNumber,"qa-route-admin",{action:"approve",returnRequestId:rid,reason:"isolated review",idempotencyKey:"safety-approve-"+serial});
  const approved=await getReturnWorkflow(orderNumber);assert.equal(approved.requests[0].paymentRefund.status,"manual_review_required");
  await assert.rejects(()=>adminReturnAction(orderNumber,"qa-route-admin",{action:"refund_confirm",returnRequestId:rid,manuallyPaid:true}));
  const effect=projectReturnSettlements(await readMembershipCommerceState()).find(e=>e.orderId===orderNumber&&e.returnRequestId===rid&&e.effectType==="payment_refund");check("unsupported/ambiguous cannot confirm a manual refund",()=>{assert.notEqual(effect?.status,"applied");assert.equal(effect?.paymentResult,undefined);});
 }
}
console.log("J6F2C ROUTING SAFETY "+n+" PASS; isolated data only");
