/* eslint-disable react/no-children-prop -- Non-JSX SSR provider fixture. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createElement,type ReactElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import Provider from "../components/member/MemberCenterCopyProvider";
import Preview from "../components/member/MemberPaymentRefundPreview";
import Processing from "../components/admin/ReturnRefundProcessing";
import SettingsFields from "../components/admin/ReturnRefundSettingsFields";
import {DEFAULT_RETURN_REFUND_SETTINGS,resolvedReturnRefundSettings,validateReturnRefundSettings} from "../lib/returnRefundSettings";
import {DEFAULT_MEMBERSHIP_RULES,saveMembershipBusinessRules} from "../lib/membershipBusinessRules";
import {prepareOrderCompletionWrite} from "../lib/orderCompletion";
import {memberReturnAction,adminReturnAction,getReturnWorkflow} from "../lib/returnWorkflow";
import {readMembershipCommerceState} from "../lib/membershipCommerce";
import {allocateApprovedReturnPayment,resolveReturnRefundMethod} from "../lib/returnPaymentAllocation";
let count=0;const check=(label:string,fn:()=>void)=>{fn();console.log("PASS "+(++count)+" "+label);};
const root=await fs.mkdtemp(path.join(os.tmpdir(),"kd-inperson-preview-"));process.env.KD_DATA_DIR=root;process.env.AUTH_SESSION_SECRET="isolated-preview-test-secret-long-enough-for-signing";
for(const key of ["LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN","LINE_CHANNEL_ACCESS_TOKEN"])delete process.env[key];
const rules=structuredClone(DEFAULT_MEMBERSHIP_RULES);rules.returnRefund=structuredClone(DEFAULT_RETURN_REFUND_SETTINGS);
for(const key of ["in_person","courier","seven_eleven"] as const)rules.returnRefund.destinations[key]={...rules.returnRefund.destinations[key],enabled:true,address:"QA original workshop",recipient:"QA",phone:"0000000000",hours:"QA only",instructions:"Do not visit",storeNumber:"123456",storeName:"QA"};
await saveMembershipBusinessRules({expectedRevision:0,rules});await fs.mkdir(path.join(root,"orders"),{recursive:true});
const render=(element:ReactElement)=>renderToStaticMarkup(createElement(Provider,{initialOverrides:{},children:element}));
let serial=0;
for(const [payment,orderMode] of [["atm_transfer","home_delivery"],["cash_on_delivery","home_delivery"],["cash_on_delivery","711_cod"]]){
 const orderNumber="KD20261030-"+(9700+(++serial)),now=new Date(),shipping=orderMode==="home_delivery"?40:0,cod=orderMode==="home_delivery"&&payment==="cash_on_delivery"?25:0;
 const base={orderNumber,createdAt:now.toISOString(),status:"ready_for_pickup",orderMode,payment,paymentDetails:{method:payment,status:"paid"},member:{memberId:"qa-member"},items:[{slug:"qa",optionId:"qa",quantity:1,unitPrice:500,lineTotal:500}],subtotal:500,shipping,codServiceFee:cod,totalBeforeCredit:500+shipping+cod,total:500+shipping+cod,credit:{appliedAmount:0}};
 const order=await prepareOrderCompletionWrite(base,{...base,status:"completed",fulfillmentEvents:[{eventId:"done-"+orderNumber,state:"completed",occurredAt:now.toISOString()}]});await fs.writeFile(path.join(root,"orders",orderNumber+".json"),JSON.stringify(order));
 const view=await getReturnWorkflow(orderNumber,"qa-member"),line=view.lines[0].returnLineRef,values={lines:[{returnLineRef:line,quantity:1}],reason:"QA",conditionAcknowledgement:{itemsComplete:true,unopenedUnusedWhereApplicable:true},quantityAcknowledged:true,refundHandoff:"in_person",refundBank:{bank:"QA",holder:"QA",account:"12345678",branch:""}};
 const before=await fs.readFile(path.join(root,"membership-commerce/commerce-state.json"),"utf8").catch(()=>null);
 const preview=await memberReturnAction(orderNumber,"qa-member",{...values,action:"preview"});assert.ok("paymentPreview"in preview);const quote=preview.paymentPreview!;assert.equal(quote.status,"resolved");if(quote.status!=="resolved")throw Error("No quote");
 check(payment+" "+orderMode+" in-person overrides to cash",()=>{assert.equal(quote.method,"manual_cash");assert.equal(quote.amount,500);assert.equal(quote.originalPaidTotal,500+shipping+cod);assert.equal(quote.shippingAmount,shipping);assert.equal(quote.codFee,cod);});
 const afterPreview=await fs.readFile(path.join(root,"membership-commerce/commerce-state.json"),"utf8").catch(()=>null);check("preview persists no events or settlement",()=>assert.equal(afterPreview,before));
 const originalOrderBeforeRender=await fs.readFile(path.join(root,"orders",orderNumber+".json"),"utf8");const quoteBeforeRender=structuredClone(quote);const html=render(createElement(Preview,{preview:quote}));assert.deepEqual(quote,quoteBeforeRender);assert.equal(await fs.readFile(path.join(root,"orders",orderNumber+".json"),"utf8"),originalOrderBeforeRender);check("original order total is the first financial row",()=>{assert.match(html,new RegExp("NT\\$"+(500+shipping+cod)));assert.ok(html.indexOf("本次訂單金額")<html.indexOf("商品退款金額"));});check("Member displays merchandise and expected payment",()=>{assert.match(html,/退款金額預估/);assert.match(html,/商品退款金額/);assert.match(html,/本次預計台幣退款/);assert.match(html,/NT\$500/);assert.match(html,/工作室現場退款/);});
 check("only originally charged fees render",()=>{assert.equal(html.split("</dl>")[0].includes("宅配運費"),shipping>0);assert.equal(html.split("</dl>")[0].includes("貨到付款手續費"),cod>0);if(shipping)assert.match(html,/-NT\$40/);if(cod)assert.match(html,/-NT\$25/);assert.doesNotMatch(html,/NT\$0/);});
 for(const handoff of ["courier","seven_eleven"]){const bankPreview=await memberReturnAction(orderNumber,"qa-member",{...values,refundHandoff:handoff,action:"preview"});assert.ok("paymentPreview"in bankPreview);check(handoff+" retains bank routing",()=>{assert.equal(bankPreview.paymentPreview?.method,"manual_bank_transfer");assert.ok(bankPreview.paymentPreview?.status==="resolved"&&bankPreview.paymentPreview.amount===500);});}
 await assert.rejects(()=>memberReturnAction(orderNumber,"qa-member",{...values,lines:[{returnLineRef:line,quantity:0}],action:"preview"}));
 const created=await memberReturnAction(orderNumber,"qa-member",{...values,action:"create",finalConfirmation:true,confirmationToken:preview.confirmationToken,idempotencyKey:"inperson-"+serial});
 const rid=created.returnRequestId!;const stateAfterCreate=await fs.readFile(path.join(root,"membership-commerce/commerce-state.json"),"utf8");const requested=(await getReturnWorkflow(orderNumber,"qa-member")).requests[0];check("post-submit Member/Admin use the same confirmation quote",()=>assert.deepEqual(requested.paymentRefund.preview,quote));const adminBeforeApproval=await getReturnWorkflow(orderNumber);assert.deepEqual(adminBeforeApproval.requests[0].paymentRefund.preview,quote);assert.equal(await fs.readFile(path.join(root,"membership-commerce/commerce-state.json"),"utf8"),stateAfterCreate);check("new cash request stores no submitted bank",()=>{assert.equal(requested.refundRequest?.method,"manual_cash");assert.equal(requested.refundRequest?.bank,null);assert.equal(requested.refundRequest?.destination.mapUrl,"https://maps.app.goo.gl/LnWPuqmR2BfDW3UM8");});
 rules.returnRefund.destinations.in_person.address="Edited QA address";rules.returnRefund.destinations.in_person.mapUrl="https://maps.example.test/new";rules.shipping.homeDeliveryShippingFee=999;
 const store=JSON.parse(await fs.readFile(path.join(root,"membership-commerce/business-rules.json"),"utf8"));await saveMembershipBusinessRules({expectedRevision:store.revision,rules});
 const admin=await getReturnWorkflow(orderNumber);check("Admin quote equals Member quote after current rates changed",()=>{const q=admin.requests[0].paymentRefund.quote;assert.ok(q.status==="resolved"&&q.amount===quote.amount&&q.originalPaidTotal===quote.originalPaidTotal&&q.retainedHomeShipping===shipping&&q.retainedCodFee===cod&&q.method===quote.method);});
 check("historical workshop address and map survive edits",()=>{assert.equal(admin.requests[0].refundRequest?.destination.address,"QA original workshop");assert.equal(admin.requests[0].refundRequest?.destination.mapUrl,"https://maps.app.goo.gl/LnWPuqmR2BfDW3UM8");assert.equal(admin.refundSettings?.destinations.in_person.address,"Edited QA address");});
 await adminReturnAction(orderNumber,"qa-admin",{action:"approve",returnRequestId:rid,reason:"QA",idempotencyKey:"approve-"+serial});
 const approved=(await getReturnWorkflow(orderNumber)).requests[0];const adminHtml=render(createElement(Processing,{orderNumber,request:approved,autoOpen:true,onReload:async()=>{},proofEnabled:true}));check("Admin cash confirmation has no bank processing/proof requirement",()=>{assert.match(adminHtml,/確認已現場退款/);assert.match(adminHtml,/退款方式.*現場退款/);assert.doesNotMatch(adminHtml,/name="refund_|請先在站外完成轉帳|type="file"/);});
 const state=await readMembershipCommerceState(),legacy=structuredClone(state.returnEvents??[]);for(const event of legacy)if(event.type==="RETURN_REQUESTED"&&event.returnRequestId===rid&&event.confirmation?.refundRequest){delete event.confirmation.refundRequest.routingPolicyVersion;event.confirmation.refundRequest.method="manual_bank_transfer";}
 check("legacy in-person bank route remains unchanged",()=>{const old=allocateApprovedReturnPayment(order,legacy,rid);assert.ok(old.status==="resolved"&&old.method==="manual_bank_transfer");});
 const paid=await adminReturnAction(orderNumber,"qa-admin",{action:"refund_confirm",returnRequestId:rid,manuallyPaid:true});check("cash can finish without proof and retry restores no extra money",()=>assert.ok("additionalRefund"in paid&&paid.additionalRefund===500));const retry=await adminReturnAction(orderNumber,"qa-admin",{action:"refund_confirm",returnRequestId:rid,manuallyPaid:true});assert.ok("additionalRefund"in retry&&retry.additionalRefund===0);
 rules.returnRefund.destinations.in_person={...rules.returnRefund.destinations.in_person,address:"QA original workshop",mapUrl:"https://maps.app.goo.gl/LnWPuqmR2BfDW3UM8"};const current=JSON.parse(await fs.readFile(path.join(root,"membership-commerce/business-rules.json"),"utf8"));await saveMembershipBusinessRules({expectedRevision:current.revision,rules});
}
check("settings backfill map without mutating saved config",()=>{const old=structuredClone(rules.returnRefund!);delete old.destinations.in_person.mapUrl;assert.ok(resolvedReturnRefundSettings(old)?.destinations.in_person.mapUrl);assert.equal(old.destinations.in_person.mapUrl,undefined);});
let edited=rules.returnRefund!;const settingsTree=SettingsFields({value:rules.returnRefund,onChange:value=>{edited=value;}});
function nodes(value:unknown):Array<{type:unknown;props:Record<string,unknown>}>{if(Array.isArray(value))return value.flatMap(nodes);if(!value||typeof value!=="object"||!("props"in value))return[];const item=value as {type:unknown;props:Record<string,unknown>};return[item,...nodes(item.props.children)];}
const mapInput=nodes(settingsTree).find(n=>n.type==="input"&&n.props.type==="url")!;(mapInput.props.onChange as (e:unknown)=>void)({target:{value:"https://maps.example.test/edit"}});check("Admin edits map in canonical returnRefund",()=>assert.equal(edited.destinations.in_person.mapUrl,"https://maps.example.test/edit"));
check("unsafe map URL rejected",()=>{const invalid=structuredClone(edited);invalid.destinations.in_person.mapUrl="javascript:alert(1)";assert.throws(()=>validateReturnRefundSettings(invalid));});
for(const payment of ["atm_transfer","cash_on_delivery"])assert.equal(resolveReturnRefundMethod({payment},"in_person"),"manual_cash");
console.log("J6F2C IN-PERSON/PAYMENT PREVIEW "+count+" PASS; isolated data only");
