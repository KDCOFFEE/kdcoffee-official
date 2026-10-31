/* eslint-disable react/no-children-prop -- SSR Provider fixture requires children in props. */
import assert from "node:assert/strict";
import {createElement,type ReactElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";
import Provider from "../components/member/MemberCenterCopyProvider";
import {ReturnCreditEvidence,ReturnCreditSettlement,ReturnRequestEvidence} from "../components/member/ReturnEvidence";
import MemberReturnWorkflow from "../components/member/MemberReturnWorkflow";
import {AdminReturnDetail} from "../components/admin/AdminReturnWorkflow";
import type {ReturnWorkflowView,safeCreditPreview} from "../lib/returnWorkflow";
import {MEMBER_CENTER_COPY_CATALOG,memberCopyValidationError,resolveMemberCopy} from "../lib/memberCenterCopy";
import {saveMemberCenterCopy,readMemberCenterCopy} from "../lib/memberCenterCopyStore";

type Preview=ReturnType<typeof safeCreditPreview>;
type Result=NonNullable<ReturnWorkflowView["requests"][number]["creditSettlement"]>;
const future="2026-11-29T00:00:00+08:00",expired="2026-10-29T00:00:00+08:00";
function fixture(caseNumber:3|4):ReturnWorkflowView {
  const total=caseNumber===3?50:60,restored=caseNumber===3?0:30;
  const preview:Preview={returnCreditAmount:total,restorableCreditAmount:total,expiredCreditAmount:0,hasExpiredReturnCredit:false,expiryWarning:undefined,
    entries:caseNumber===3?[{amount:50,expiresAt:expired,classification:"restorable"}]:[{amount:30,expiresAt:future,classification:"restorable"},{amount:30,expiresAt:expired,classification:"restorable"}],
    generatedAt:"2026-10-25T02:00:00Z",returnDeadline:"2026-11-02T15:59:59.999Z",lines:[{returnLineRef:"private-line-ref",quantity:1,attributedCreditAmount:total}],rewardHoldExpected:false,rewardAdjustmentPreview:{status:"review_on_decision",explanation:""}};
  const creditSettlement:Result={status:"applied",settledAt:"2026-10-30T02:00:00Z",selectedAmount:total,restoredAmount:restored,expiredAmount:total-restored,
    entries:caseNumber===3?[{amount:50,expiresAt:expired,restoredAmount:0,expiredAmount:50}]:[{amount:30,expiresAt:future,restoredAmount:30,expiredAmount:0},{amount:30,expiresAt:expired,restoredAmount:0,expiredAmount:30}]};
  const request:ReturnWorkflowView["requests"][number]={returnRequestId:"private-request-id",requestedEventId:"private-request-event",lastEventId:"private-approved-event",requestedBy:"private-member",status:"approved",withdrawable:false,occurredAt:preview.generatedAt,lastOccurredAt:creditSettlement.settledAt!,lines:[{returnLineRef:"private-line-ref",quantity:1,originalQuantity:1}],approvedLines:[{returnLineRef:"private-line-ref",quantity:1}],eventIds:["private-request-event","private-approved-event"],
    refundRequest:null,paymentRefund:{status:"not_started",quote:{status:"manual_review_required",reason:"historical_fixture"},amount:null,confirmedAt:null,notification:undefined,proof:[]},
    reason:"商品不符需求",conditionAcknowledgement:{itemsComplete:true,unopenedUnusedWhereApplicable:true},photos:[],creditPreview:preview,creditSettlement,inventorySettlement:{approvedQuantity:1,appliedQuantity:1,status:"applied"},confirmedAt:preview.generatedAt,timeline:[{type:"RETURN_APPROVED",occurredAt:creditSettlement.settledAt!,reason:"已確認"}]};
  return {refundSettings:undefined,refundMethod:"manual_review_required",orderNumber:"KD20261029-920"+caseNumber,orderStatus:"completed",completedAt:"2026-10-24T02:00:00Z",customer:"測試會員",returnDeadline:preview.returnDeadline,eligible:false,eligibility:"resolved",message:null,technicalReason:null,
    lines:[{returnLineRef:"private-line-ref",name:"原訂單咖啡",option:"半磅",originalQuantity:1,approvedQuantity:1,effectivePendingQuantity:0,remainingReturnableQuantity:0}],requests:[request],rewards:[]};
}
const render=(element:ReactElement,overrides:Record<string,string>={"member.rewards.storeCredit.title":"KD幣"})=>renderToStaticMarkup(createElement(Provider,{initialOverrides:overrides,children:element}));
const plain=(html:string)=>html.replace(/<!--[^]*?-->/g,"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
/** Native closed details render only their summary, including with nested disclosures. */
function collapsedView(html:string) {
  let result="",depth=0,last=0;
  for(const match of html.matchAll(/<\/?details\b[^>]*>|<summary\b[^>]*>[\s\S]*?<\/summary>/g)) {
    if(depth===0)result+=html.slice(last,match.index);
    if(match[0].startsWith("<summary")){if(depth===1)result+=match[0];}
    else if(match[0].startsWith("</details"))depth--;
    else depth++;
    last=match.index!+match[0].length;
  }
  if(depth===0)result+=html.slice(last);
  return plain(result);
}
const case3=fixture(3),case4=fixture(4),before=JSON.stringify([case3,case4]);
let passes=0;
const test=(name:string,run:()=>unknown)=>{run();console.log("PASS "+(++passes)+" "+name);};
for(const [name,view,component] of [
  ["Case 3 Member",case3,createElement(MemberReturnWorkflow,{initial:case3})],
  ["Case 4 Member",case4,createElement(MemberReturnWorkflow,{initial:case4})],
  ["Case 3 Admin",case3,createElement(AdminReturnDetail,{initial:case3})],
  ["Case 4 Admin",case4,createElement(AdminReturnDetail,{initial:case4})],
] as const) {
  const html=render(component),visible=collapsedView(html),r=view.requests[0].creditSettlement!,isAdmin=name.includes("Admin"),resultText=isAdmin?plain(html):visible;
  test(name+" final totals remain accessible with correct primary hierarchy",()=>{assert.ok(resultText.includes("KD幣實際返還結果"));assert.ok(resultText.includes("實際已返還： "+r.restoredAmount+" KD幣"));assert.ok(resultText.includes("因到期未返還： "+r.expiredAmount+" KD幣"));if(isAdmin){assert.ok(visible.includes("已返還 "+r.restoredAmount+" KD幣"));assert.ok(visible.includes("到期未返還 "+r.expiredAmount+" KD幣"));}assert.ok(!visible.includes("當時預計可返還")&&!visible.includes("本次退貨涉及"));assert.equal((resultText.match(/因到期未返還：/g)??[]).length,1);});
  test(name+" explanation/history closed and not repeated in primary",()=>{assert.ok(!/<details[^>]*\sopen(?:\s|>)/.test(html));assert.ok(resultText.includes("查看返還說明"));assert.ok(resultText.includes("查看申請時預估"));if(isAdmin)assert.ok(!visible.includes("KD幣實際返還結果"));assert.ok(!visible.includes("原到期日")&&!visible.includes("因此未返還")&&!visible.includes("申請時金額為預估值"));assert.ok(!html.includes("另有 "));});
  test(name+" disclosures retain source dates and original estimate",()=>{const text=plain(html);assert.ok(text.includes("原到期日 2026/10/28"));assert.ok(text.includes("當時預計可返還： "+view.requests[0].creditPreview!.restorableCreditAmount+" KD幣"));assert.ok(text.includes("當時已到期無法返還： 0 KD幣"));if(r.restoredAmount)assert.ok(text.includes("原到期日 2026/11/28"));});
}
const applied=case4.requests[0].creditSettlement!;
test("source results grouped once; multiple expired rows remain inside explanation",()=>{const result:Result={...applied,selectedAmount:80,restoredAmount:50,expiredAmount:30,entries:[{amount:50,expiresAt:future,restoredAmount:50,expiredAmount:0},{amount:10,expiresAt:expired,restoredAmount:0,expiredAmount:10},{amount:20,expiresAt:"2026-10-31T00:00:00+08:00",restoredAmount:0,expiredAmount:20}]};const html=render(createElement(ReturnCreditSettlement,{result,preview:null})),text=plain(html);assert.ok(text.includes("50 KD幣｜原到期日 2026/11/28"));assert.ok(text.includes("10 KD幣｜原到期日 2026/10/28"));assert.ok(text.includes("20 KD幣｜原到期日 2026/10/30"));assert.equal((text.match(/因此未返還/g)??[]).length,1);assert.ok(!collapsedView(html).includes("原到期日"));});
for(const status of ["pending","failed","manual_review_required","pending_future_settlement"] as const) {
  const view=fixture(4);view.requests[0].creditSettlement={...applied,status,settledAt:null,selectedAmount:null,restoredAmount:null,expiredAmount:null,entries:[]};
  const near:Preview={...view.requests[0].creditPreview!,expiryWarning:{days:7,businessDate:"2026-10-25",amount:30,entries:[{amount:30,expiresAt:expired}]}};view.requests[0].creditPreview=near;
  test(status+" keeps estimate primary and warning visible without actual labels",()=>{const html=render(createElement(ReturnRequestEvidence,{request:view.requests[0],view})),visible=collapsedView(html);assert.ok(visible.includes("KD幣返還預估"));assert.ok(visible.includes("預計可返還： 60 KD幣"));assert.ok(visible.includes("KD幣到期提醒"));assert.ok(!visible.includes("實際已返還：")&&!visible.includes("KD幣實際返還結果"));});
}
test("before approval with no settlement still renders primary preview",()=>{const view=fixture(4);view.requests[0].status="processing";view.requests[0].creditSettlement=null;const text=collapsedView(render(createElement(ReturnRequestEvidence,{request:view.requests[0],view})));assert.ok(text.includes("預計可返還： 60 KD幣"));assert.ok(!text.includes("實際已返還：")&&!text.includes("查看申請時預估"));});
test("confirmed history uses historical labels and preserves all 60/60/0 amounts",()=>{const html=render(createElement(ReturnCreditEvidence,{preview:case4.requests[0].creditPreview!,historical:true}));const text=plain(html);for(const label of ["申請時預估","本次退貨涉及： 60 KD幣","當時預計可返還： 60 KD幣","當時已到期無法返還： 0 KD幣"])assert.ok(text.includes(label),label);assert.ok(!text.includes("尚未入帳"));});
test("missing historical snapshot does not suppress actual result",()=>{const html=render(createElement(ReturnCreditSettlement,{result:applied,preview:null}));assert.ok(collapsedView(html).includes("實際已返還： 30 KD幣"));assert.ok(!html.includes("查看申請時預估"));});
for(const name of ["KD幣","枚","咖啡額度"])test("shared name "+name+" is used for totals, source rows and historical estimate",()=>{const html=render(createElement(ReturnCreditSettlement,{result:applied,preview:case4.requests[0].creditPreview}),{"member.rewards.storeCredit.title":name});assert.ok(collapsedView(html).includes("30 "+name));assert.ok(plain(html).includes("60 "+name));assert.ok(plain(html).includes("30 "+name+"｜原到期日"));assert.ok(!html.includes("NT$")&&!html.includes("KD點"));});
const managed=["creditActualRestored","creditFinalExpired","creditExplanationToggle","creditHistoricalToggle","creditSettlementDescription","creditHistoricalDescription","creditSourceRestored","creditSourceNotRestored","creditFinalExpiredReason","creditResultEntry"];
test("all summary/disclosure/explanation copy uses registered editable keys",()=>{for(const name of managed){const key="member.returns."+name,entry=MEMBER_CENTER_COPY_CATALOG.find(entry=>entry.key===key);assert.ok(entry,key);assert.equal(memberCopyValidationError(key,entry.defaultText),null);}});
test("managed labels and explanation templates override the actual rendered component",()=>{const overrides={"member.rewards.storeCredit.title":"枚",...Object.fromEntries(managed.map(name=>{const key="member.returns."+name;return [key,"編輯："+MEMBER_CENTER_COPY_CATALOG.find(entry=>entry.key===key)!.defaultText];}))};const html=render(createElement(ReturnCreditSettlement,{result:applied,preview:case4.requests[0].creditPreview}),overrides);for(const name of managed)assert.ok(plain(html).includes("編輯："+resolveMemberCopy({},"member.returns."+name,{amount:"30 枚",expiryDate:"2026/11/28"})),name);});
test("Member-visible text never includes internal request/line/source/effect identifiers",()=>{const text=plain(render(createElement(MemberReturnWorkflow,{initial:case4})));for(const value of ["private-request-id","private-line-ref","private-approved-event","return-effect:","fingerprint","creditEntryId"])assert.ok(!text.includes(value));});
test("rendering never mutates original preview, settlement or request evidence",()=>assert.equal(JSON.stringify([case3,case4]),before));
const root=await fs.mkdtemp(path.join(os.tmpdir(),"kd-result-ui-copy-")),oldRoot=process.env.KD_DATA_DIR;process.env.KD_DATA_DIR=root;
try {const overrides=Object.fromEntries(managed.map(name=>{const key="member.returns."+name;return [key,"自訂："+MEMBER_CENTER_COPY_CATALOG.find(entry=>entry.key===key)!.defaultText];}));const saved=await saveMemberCenterCopy({expectedRevision:0,overrides});const reread=await readMemberCenterCopy();test("all new result copy persists through existing copy-management storage",()=>assert.deepEqual(reread,saved));}
finally {if(oldRoot===undefined)delete process.env.KD_DATA_DIR;else process.env.KD_DATA_DIR=oldRoot;}
console.log("J6F2B RESULT UI "+passes+"/"+passes+" PASS; presentation/copy only; no settlement execution");
