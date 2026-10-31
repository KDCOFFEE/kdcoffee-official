/* eslint-disable react/no-children-prop -- Non-JSX Provider fixture overload. */
import assert from "node:assert/strict";
import {createElement,type ReactElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import Provider from "../components/member/MemberCenterCopyProvider";
import Preview from "../components/member/MemberPaymentRefundPreview";
import Workflow from "../components/member/MemberReturnWorkflow";
import type {ReturnWorkflowView} from "../lib/returnWorkflow";
const preview=Object.freeze({status:"resolved" as const,originalPaidTotal:565,merchandiseAmount:500,shippingAmount:40,codFee:25,amount:500,method:"manual_bank_transfer" as const});
const render=(element:ReactElement)=>renderToStaticMarkup(createElement(Provider,{initialOverrides:{"member.rewards.storeCredit.title":"KD幣"},children:element}));
let count=0;const check=(label:string,fn:()=>void)=>{fn();console.log("PASS "+(++count)+" "+label);};
const before=JSON.stringify(preview),html=render(createElement(Preview,{preview}));
check("original total remains 565 near top",()=>{assert.match(html,/本次訂單金額<\/dt><dd[^>]*>NT\$565/);assert.ok(html.indexOf("本次訂單金額")<html.indexOf("商品退款金額"));});
check("authoritative merchandise amount remains 500",()=>assert.match(html,/商品退款金額<\/dt><dd>NT\$500/));
check("shipping has direct non-refundable label and visual negative amount",()=>assert.match(html,/宅配運費（不退款）<\/dt><dd>-NT\$40/));
check("COD has direct non-refundable label and visual negative amount",()=>assert.match(html,/貨到付款手續費（不退款）<\/dt><dd>-NT\$25/));
check("final refund remains positive 500",()=>assert.match(html,/本次預計台幣退款<\/dt><dd[^>]*>NT\$500/));
check("original charge policy and bank route remain",()=>{assert.match(html,/銀行轉帳/);assert.match(html,/宅配運費及貨到付款手續費不列入退款；實際退款金額以退貨核准／結算結果為準。/);});
check("canonical positive values unchanged after rendering",()=>{assert.equal(JSON.stringify(preview),before);assert.equal(preview.shippingAmount,40);assert.equal(preview.codFee,25);});
for(const [shippingAmount,codFee]of [[0,0],[40,0],[0,25]]){const result=render(createElement(Preview,{preview:{...preview,shippingAmount,codFee}})).split("</dl>")[0];check("only charged fee rows render: "+shippingAmount+"/"+codFee,()=>{assert.equal(result.includes("宅配運費（不退款）"),shippingAmount>0);assert.equal(result.includes("貨到付款手續費（不退款）"),codFee>0);assert.doesNotMatch(result,/-NT\$0/);});}
const view={orderNumber:"KD20261030-9395",orderStatus:"completed",completedAt:null,returnDeadline:null,eligible:true,eligibility:"resolved",message:null,technicalReason:undefined,customer:undefined,refundSettings:undefined,refundMethod:"manual_bank_transfer",lines:[{returnLineRef:"line",name:"QA 咖啡",option:"",originalQuantity:1,approvedQuantity:0,effectivePendingQuantity:0,remainingReturnableQuantity:1}],requests:[],rewards:[]} as ReturnWorkflowView;
const confirmation={paymentPreview:preview,quantity:1,confirmationToken:"test-only",values:{},idempotencyKey:"test-only",photos:[],preview:{returnCreditAmount:60,restorableCreditAmount:50,expiredCreditAmount:10,hasExpiredReturnCredit:true,entries:[],generatedAt:"2026-10-30T01:00:00Z",returnDeadline:null,lines:[{returnLineRef:"line",quantity:1,attributedCreditAmount:60}],rewardHoldExpected:false,rewardAdjustmentPreview:null}};
const globals=globalThis as unknown as Record<string,unknown>;let stateIndex=0;globals.__returnHooks={useState:(initial:unknown)=>[stateIndex++===5?confirmation:initial,()=>{}],useRef:()=>({current:null}),useEffect:()=>{},useContext:(context:{_currentValue:unknown})=>context._currentValue};
let tree:ReactElement;try{tree=Workflow({initial:view});}finally{delete globals.__returnHooks;}
const workflowHtml=render(tree!);check("real Member confirmation keeps payment and credit in separate sections",()=>{const payment=workflowHtml.indexOf("退款金額預估"),paymentEnd=workflowHtml.indexOf("</section>",payment),credit=workflowHtml.indexOf("KD幣返還預估");assert.ok(payment>=0&&paymentEnd<credit);assert.ok(workflowHtml.includes("60 KD幣")&&workflowHtml.includes("50 KD幣")&&workflowHtml.includes("10 KD幣"));assert.match(workflowHtml,/本次預計台幣退款<\/dt><dd[^>]*>NT\$500/);});
console.log("J6F2C PAYMENT PREVIEW UI "+count+" PASS");
