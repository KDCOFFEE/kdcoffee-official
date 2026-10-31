/* eslint-disable react/no-children-prop -- Fixture Provider overload. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyApprovedReturnCredit, purgeMembershipCommerceForMembers, executeOrderReturnCommand, getAvailableCredit, readMembershipCommerceState, validateMembershipCommerceState } from "../lib/membershipCommerce";
import { getReturnWorkflow, memberReturnAction, adminReturnAction } from "../lib/returnWorkflow";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules, validateMembershipBusinessRules, getActiveMembershipRules } from "../lib/membershipBusinessRules";
import { prepareOrderCompletionWrite } from "../lib/orderCompletion";
import { withStoredOrderUpdateLock } from "../lib/adminOrders";
import { runInventoryOrderTransaction } from "../lib/orderInventoryTransaction";
import { projectReturnSettlements, returnInventorySummary } from "../lib/returnSettlementLedger";
import { registerEmailMember } from "../lib/memberAuth";
import { readMemberCenterCopy, saveMemberCenterCopy } from "../lib/memberCenterCopyStore";
import {getMemberCommerceDashboard} from "../lib/membershipCommerce";
import { MEMBER_CENTER_COPY_CATALOG } from "../lib/memberCenterCopy";
import Provider from "../components/member/MemberCenterCopyProvider";
import {MemberCopyText} from "../components/member/MemberCenterCopyProvider";
import { ReturnCreditEvidence, ReturnCreditSettlement } from "../components/member/ReturnEvidence";

const script=fileURLToPath(import.meta.url), bootstrap=new URL("./return-settlement-test-bootstrap.mjs",import.meta.url).href;
process.env.AUTH_SESSION_SECRET="j6f2b-isolated-secret-longer-than-thirty-two-characters";
process.env.MEMBER_IDENTITY_SECRET="j6f2b-isolated-identity-secret-longer-than-thirty-two-characters";
process.env.RETURN_REQUEST_LINE_NOTIFICATION_ENABLED="false";
globalThis.fetch=async()=>{throw Error("External network forbidden in isolated settlement test");};
for(const key of ["LINE_CHANNEL_ACCESS_TOKEN","LINE_INTERNAL_CHANNEL_ACCESS_TOKEN","LINE_INTERNAL_RECIPIENT_ID"])delete process.env[key];
const now=new Date("2026-10-29T03:00:00Z"), late=new Date("2026-11-29T03:00:00Z");
if(process.argv[2]?.startsWith("--worker")) {
  process.env.KD_DATA_DIR=process.argv[3];
  await applyApprovedReturnCredit(process.argv[4],process.argv[5],{now:new Date(process.argv[6]),hook:process.argv[2] === "--worker-crash" ? ()=>process.exit(82) : undefined});
} else {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"kd-j6f2b-")), previousRoot=process.env.KD_DATA_DIR;
  async function snapshot(base:string,start="",output:Record<string,string>={}):Promise<Record<string,string>> {
    for(const entry of await fs.readdir(path.join(base,start),{withFileTypes:true}).catch((error:NodeJS.ErrnoException)=>{if(error.code === "ENOENT")return [];throw error;})) {
      if(["node_modules",".next","qa-output",".git","tsconfig.tsbuildinfo"].includes(entry.name))continue;
      const relative=path.join(start,entry.name);if(entry.isDirectory())await snapshot(base,relative,output);else if(entry.isFile())output[relative]=createHash("sha256").update(await fs.readFile(path.join(base,relative))).digest("hex");
    }return output;
  }
  const protectedBefore:Record<string,string>={};for(const dir of ["data","public/data","public/uploads"])await snapshot(process.cwd(),dir,protectedBefore);
  const prior="F:/KD_Coffee_Studio_J6F1_RETURN_DEV_20261028", priorBefore=await snapshot(prior);
  let count=0,seq=0;
  const test=async(label:string,fn:()=>unknown|Promise<unknown>)=>{await fn();console.log("PASS "+(++count)+" "+label);};
  const write=async(file:string,value:unknown)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value));};
  const render=(element:ReturnType<typeof createElement>,overrides={})=>renderToStaticMarkup(createElement(Provider,{initialOverrides:overrides,children:element}));
  type Source={amount:number;expiresAt:string};
  async function fixture(sources:Source[]=[{amount:50,expiresAt:"2026-10-29T00:00:00+08:00"},{amount:50,expiresAt:"2026-11-29T00:00:00+08:00"}]) {
    const data=path.join(root,"case-"+(++seq));process.env.KD_DATA_DIR=data;
    const rules=structuredClone(DEFAULT_MEMBERSHIP_RULES);rules.money.roundingMode="round-half-up";
    await saveMembershipBusinessRules({expectedRevision:0,rules,now:new Date("2026-01-01T00:00:00Z")});
    const member=await registerEmailMember("case"+seq+"@example.test","Isolated-Password-2026");assert.ok(member);
    const website=path.join(data,"store/website-data.json");
    await write(website,{version:1,menu:{products:[{id:"coffee",slug:"coffee",name:"Coffee",active:true,purchasable:true,skus:[{id:"sku",kind:"beans",label:"Coffee",enabled:true,price:500,stock:20}]}]}});
    const credit=sources.reduce((sum,item)=>sum+item.amount,0),reservationId="original-reservation";
    const created=await runInventoryOrderTransaction({websiteFile:website,orderDir:path.join(data,"orders"),initialOrderNumber:"KD20261028-"+(70000+seq),generateOrderNumber:()=>"KD20261028-"+(70000+seq),
      items:[{slug:"coffee",optionId:"sku",optionLabel:"Coffee",quotedUnitPrice:500,quantity:10,preparationLabel:"咖啡豆"}],
      buildOrder:(orderNumber,priced)=>({order:{orderNumber,createdAt:"2026-10-25T02:00:00Z",orderMode:"studio_pickup",status:"ready_for_pickup",customer:{name:"Isolated Member"},member:{memberId:member.id},...priced,total:priced.subtotal-credit,
        credit:{appliedAmount:credit,reservationId,rulesVersion:1},paymentDetails:{status:"paid"}},lineText:"isolated"})});
    assert.ok(created.finalized);
    await withStoredOrderUpdateLock(created.orderNumber,async(order,persist)=>persist(await prepareOrderCompletionWrite(order,{...order,status:"completed",fulfillmentEvents:[{eventId:"completed",state:"completed",occurredAt:"2026-10-28T02:00:00Z"}]}) as typeof order));
    const file=path.join(data,"membership-commerce/commerce-state.json"),state=await readMembershipCommerceState(file);
    sources.forEach((source,index)=>{const creditEntryId="original-"+index;state.creditEntries[creditEntryId]={creditEntryId,memberId:member.id,sourceType:"manual",sourceReference:"source-"+index,amount:source.amount,remainingAmount:0,expiresAt:source.expiresAt,issuedAt:"2026-10-01T00:00:00Z",createdAt:"2026-10-01T00:00:00Z",status:"consumed",metadata:{}};});
    state.creditEntries.unrelated={creditEntryId:"unrelated",memberId:member.id,sourceType:"manual",sourceReference:"unrelated",amount:999,remainingAmount:999,issuedAt:now.toISOString(),createdAt:now.toISOString(),expiresAt:"2030-01-01T00:00:00Z",status:"available",metadata:{}};
    state.creditReservations[reservationId]={reservationId,memberId:member.id,orderId:created.orderNumber,requestedAmount:credit,amount:credit,allocations:sources.map((source,index)=>({creditEntryId:"original-"+index,amount:source.amount})),status:"consumed",createdAt:now.toISOString(),updatedAt:now.toISOString()};
    await write(file,state);
    const view=await getReturnWorkflow(created.orderNumber,member.id,{stateFilePath:file,now});
    const orderFile=path.join(data,"orders",created.orderNumber+".json");
    return {data,file,orderFile,bytes:await fs.readFile(orderFile,"utf8"),memberId:member.id,id:created.orderNumber,ref:view.lines[0].returnLineRef,website};
  }
  type Fixture=Awaited<ReturnType<typeof fixture>>;
  const runtime=(f:Fixture,at=now)=>({stateFilePath:f.file,rulesFilePath:path.join(f.data,"membership-commerce/business-rules.json"),now:at});
  const activate=(f:Fixture)=>{process.env.KD_DATA_DIR=f.data;};
  const state=(f:Fixture)=>readMembershipCommerceState(f.file);
  const values=(f:Fixture,qty:number)=>({lines:[{returnLineRef:f.ref,quantity:qty}],reason:"商品破損",quantityAcknowledged:true,conditionAcknowledgement:{itemsComplete:true,unopenedUnusedWhereApplicable:true}});
  async function preview(f:Fixture,qty=6,at=now){activate(f);const p=await memberReturnAction(f.id,f.memberId,{action:"preview",...values(f,qty)},runtime(f,at));assert.ok(p.preview && p.confirmationToken);return {preview:p.preview,confirmationToken:p.confirmationToken};}
  async function request(f:Fixture,qty=6){const p=await preview(f,qty);const result=await memberReturnAction(f.id,f.memberId,{action:"create",...values(f,qty),finalConfirmation:true,confirmationToken:p.confirmationToken,idempotencyKey:randomUUID()},runtime(f));assert.ok(result.returnRequestId);return {rid:result.returnRequestId,p};}
  async function approve(f:Fixture,rid:string,at=now,qty?:number){activate(f);return adminReturnAction(f.id,"owner",{action:"approve",returnRequestId:rid,reason:"reviewed",idempotencyKey:"approve-"+rid,...(qty!==undefined?{approvedLines:[{returnLineRef:f.ref,quantity:qty}]}:{})},runtime(f,at));}
  async function outbox(f:Fixture,rid:string){activate(f);const result=await executeOrderReturnCommand({orderNumber:f.id,actor:{actorId:"owner",authority:"reviewer"},command:{type:"RETURN_APPROVED",returnRequestId:rid},reason:"reviewed",idempotencyKey:"approve-"+rid,authorizeOrder:()=>{},...runtime(f)});assert.equal(result.status,"applied");}
  const restored=async(f:Fixture)=>Object.values((await state(f)).creditEntries).filter(entry=>entry.sourceReference.startsWith("return_credit_restore:"));
  async function worker(f:Fixture,rid:string,crash=false){return new Promise<{code:number|null;pid:number|undefined}>((resolve,reject)=>{const child=spawn(process.execPath,["--experimental-strip-types","--import",bootstrap,script,crash?"--worker-crash":"--worker",f.data,f.id,rid,now.toISOString()],{windowsHide:true,stdio:["ignore","pipe","pipe"]});let output="";child.stdout.on("data",data=>output+=data);child.stderr.on("data",data=>output+=data);child.on("error",reject);child.on("exit",code=>code===0||code===82?resolve({code,pid:child.pid}):reject(Error(output)));});}
  try {
    const f=await fixture(), p=await preview(f);
    await test("A/B preview 60 = valid 50 + expired 10",()=>{assert.equal(p.preview.returnCreditAmount,60);assert.equal(p.preview.restorableCreditAmount,50);assert.equal(p.preview.expiredCreditAmount,10);});
    const initial=await state(f),r=await request(f),historical=structuredClone((await state(f)).returnEvents?.[0]);
    await test("request only: balance and original entries untouched",async()=>{assert.deepEqual((await state(f)).creditEntries,initial.creditEntries);assert.equal(await getAvailableCredit(f.memberId,now,f.file),999);});
    const near=await fixture([{amount:20,expiresAt:"2026-11-04T00:00:00+08:00"},{amount:80,expiresAt:"2026-11-21T00:00:00+08:00"}]), np=await preview(near,10);
    await test("C default 7 days warns 20 expiring Taipei 11/03 without blocking",()=>{assert.equal(np.preview.restorableCreditAmount,100);assert.equal(np.preview.expiryWarning?.days,7);assert.equal(np.preview.expiryWarning?.amount,20);assert.ok(np.confirmationToken);});
    await test("D outside warning window and already expired sources excluded",()=>{assert.equal(p.preview.expiryWarning?.amount,0);});
    const changed=await getActiveMembershipRules(now,runtime(near).rulesFilePath);changed.rules.credit.returnCreditExpiryWarningDays=3;
    await saveMembershipBusinessRules({expectedRevision:1,rules:changed.rules,now},runtime(near).rulesFilePath);
    await test("E Admin rule change affects future preview",async()=>{assert.equal((await preview(near,10)).preview.expiryWarning?.amount,0);});
    await test("warning setting rejects fractions, negative and excessive days",()=>{for(const days of [-1,1.5,366]){const rules=structuredClone(DEFAULT_MEMBERSHIP_RULES);rules.credit.returnCreditExpiryWarningDays=days;assert.throws(()=>validateMembershipBusinessRules(rules));}});
    const boundary=await fixture([{amount:50,expiresAt:"2026-11-06T00:00:00+08:00"},{amount:50,expiresAt:"2026-11-07T00:00:00+08:00"}]);
    await test("Taipei boundary includes last usable Nov05 (today+7), excludes Nov06",async()=>assert.equal((await preview(boundary,10)).preview.expiryWarning?.amount,50));
    const today=await fixture([{amount:100,expiresAt:"2026-10-30T00:00:00+08:00"}]);const td=await getActiveMembershipRules(now,runtime(today).rulesFilePath);td.rules.credit.returnCreditExpiryWarningDays=0;await saveMembershipBusinessRules({expectedRevision:1,rules:td.rules,now},runtime(today).rulesFilePath);
    await test("0-day window warns still-valid credits on their last usable Taipei day",async()=>assert.equal((await preview(today,10)).preview.expiryWarning?.amount,100));
    await approve(f,r.rid);
    const result=(await getReturnWorkflow(f.id,f.memberId,runtime(f))).requests[0].creditSettlement!;
    await test("F/H actual restoration 50; expired source 10 never replaced",async()=>{assert.equal(result.status,"applied");assert.equal(result.restoredAmount,50);assert.equal(result.expiredAmount,10);assert.equal(await getAvailableCredit(f.memberId,now,f.file),1049);assert.equal((await restored(f)).length,1);});
    await test("I restored expiry exactly equals original source timestamp",async()=>assert.equal((await restored(f))[0].expiresAt,initial.creditEntries['original-1'].expiresAt));
    await test("source order, request, approval, effect and original source all attributable",async()=>{const entry=(await restored(f))[0];assert.equal(entry.metadata.orderId,f.id);assert.equal(entry.metadata.returnRequestId,r.rid);assert.equal(entry.metadata.originalCreditEntryId,"original-1");assert.ok(entry.metadata.approvedEventId);assert.ok(entry.metadata.settlementEffectId);});
    await test("original entries and consumed reservation are not rewritten",async()=>{const after=await state(f);for(const key of Object.keys(initial.creditEntries))assert.deepEqual(after.creditEntries[key],initial.creditEntries[key]);assert.deepEqual(after.creditReservations,initial.creditReservations);});
    await test("O historical preview survives settlement byte-for-byte",async()=>assert.deepEqual((await state(f)).returnEvents?.[0],historical));
    await approve(f,r.rid);await applyApprovedReturnCredit(f.id,r.rid,runtime(f));
    await test("J durable retry adds 0",async()=>assert.equal((await restored(f)).reduce((sum,item)=>sum+item.amount,0),50));
    const concurrent=await fixture(),cr=await request(concurrent);await outbox(concurrent,cr.rid);
    await Promise.all([worker(concurrent,cr.rid),worker(concurrent,cr.rid)]);
    await test("K separate concurrent processes restore exactly once",async()=>assert.equal((await restored(concurrent)).reduce((sum,item)=>sum+item.amount,0),50));
    await worker(concurrent,cr.rid);
    await test("process restart retry adds 0",async()=>assert.equal((await restored(concurrent)).length,1));
    const expired=await fixture(),er=await request(expired);await approve(expired,er.rid,late);
    await test("G request valid 50 becomes settlement 0; final expired 60",async()=>{const v=await getReturnWorkflow(expired.id,expired.memberId,runtime(expired,late));assert.equal(v.requests[0].creditPreview?.restorableCreditAmount,50);assert.equal(v.requests[0].creditSettlement?.restoredAmount,0);assert.equal(v.requests[0].creditSettlement?.expiredAmount,60);assert.equal((await restored(expired)).length,0);});
    const exact=await fixture([{amount:100,expiresAt:"2026-11-01T00:00:00+08:00"}]),ex=await request(exact);await approve(exact,ex.rid,new Date("2026-10-31T16:00:00Z"));
    await test("exclusive expiry instant is already expired",async()=>assert.equal((await restored(exact)).length,0));
    const multiple=await fixture([{amount:50,expiresAt:"2026-12-01T00:00:00+08:00"},{amount:50,expiresAt:"2027-01-01T00:00:00+08:00"}]);
    const m1=await request(multiple,4);await approve(multiple,m1.rid,now,3);const m2=await request(multiple,5);await approve(multiple,m2.rid,now,4);const m3=await request(multiple,3);await approve(multiple,m3.rid);
    await test("L multiple partial approvals restore 30+40+30 = original 100",async()=>{const s=await state(multiple);assert.equal((await restored(multiple)).reduce((sum,item)=>sum+item.amount,0),100);assert.equal(await getAvailableCredit(multiple.memberId,now,multiple.file),1099);assert.deepEqual(projectReturnSettlements(s).filter(item=>item.effectType === "member_credit_restore").map(item=>item.creditResult?.selectedAmount),[30,40,30]);});
    await test("M later-expiry-first, remaining exact sources used cumulatively",async()=>{const s=await state(multiple);const results=projectReturnSettlements(s).filter(item=>item.effectType === "member_credit_restore").map(item=>item.creditResult!);assert.deepEqual(results[0].entries.map(item=>[item.creditEntryId,item.amount]),[["original-1",30]]);assert.deepEqual(results[1].entries.map(item=>[item.creditEntryId,item.amount]),[["original-1",20],["original-0",20]]);});
    const occupied=await fixture(),oa=await request(occupied,6),ob=await request(occupied,4);
    await approve(occupied,oa.rid,now,3);await approve(occupied,ob.rid);
    await test("pending request retains its exact expired source despite later freed valid credit",async()=>{const effect=projectReturnSettlements(await state(occupied)).find(item=>item.returnRequestId === ob.rid && item.effectType === "member_credit_restore");assert.equal(effect?.creditResult?.restoredAmount,0);assert.equal(effect?.creditResult?.expiredAmount,40);});
    const oc=await request(occupied,3);await approve(occupied,oc.rid);
    await test("expired selections remain attributed; partial remainder alone becomes available",async()=>{const effects=projectReturnSettlements(await state(occupied)).filter(item=>item.effectType === "member_credit_restore");assert.equal(effects.reduce((sum,item)=>sum+(item.creditResult?.selectedAmount ?? 0),0),100);assert.equal(effects.reduce((sum,item)=>sum+(item.creditResult?.restoredAmount ?? 0),0),50);});
    const small=await fixture([{amount:3,expiresAt:"2027-01-01T00:00:00+08:00"}]);
    const sm1=await request(small,6),sm2=await request(small,4);await approve(small,sm2.rid,now,1);await approve(small,sm1.rid,now,3);
    const sm3=await request(small,6);await approve(small,sm3.rid);
    await test("integer rounding and out-of-order partial approvals conserve original 3",async()=>assert.equal((await restored(small)).reduce((sum,item)=>sum+item.amount,0),3));
    const warningSnapshot=await fixture([{amount:20,expiresAt:"2026-11-04T00:00:00+08:00"},{amount:80,expiresAt:"2026-11-21T00:00:00+08:00"}]),ws=await request(warningSnapshot,9);
    const beforeWarning=structuredClone((await state(warningSnapshot)).returnEvents?.[0]);
    const wr=await getActiveMembershipRules(now,runtime(warningSnapshot).rulesFilePath);wr.rules.credit.returnCreditExpiryWarningDays=3;await saveMembershipBusinessRules({expectedRevision:1,rules:wr.rules,now},runtime(warningSnapshot).rulesFilePath);
    await test("historical 7-day warning snapshot retained after Admin changes to 3 days",async()=>{assert.equal(ws.p.preview.expiryWarning?.amount,10);assert.equal((await preview(warningSnapshot,1)).preview.expiryWarning?.amount,0);assert.deepEqual((await state(warningSnapshot)).returnEvents?.[0],beforeWarning);});
    const missing=await fixture(),mr=await request(missing);const corrupt=await state(missing);corrupt.creditEntries['original-1'].expiresAt="2027-01-01T00:00:00+08:00";await write(missing.file,corrupt);await approve(missing,mr.rid);
    await test("changed original source expiry fails closed without replacement",async()=>{assert.equal((await restored(missing)).length,0);assert.equal(projectReturnSettlements(await state(missing)).find(item=>item.effectType === "member_credit_restore")?.status,"manual_review_required");});
    const rejected=await fixture(),rr=await request(rejected);await adminReturnAction(rejected.id,"owner",{action:"reject",returnRequestId:rr.rid,reason:"rejected",idempotencyKey:"reject"},runtime(rejected));
    await test("reject/withdraw never issue return credits",async()=>assert.equal((await restored(rejected)).length,0));
    const delayed=await fixture(),dr=await request(delayed);await outbox(delayed,dr.rid);await applyApprovedReturnCredit(delayed.id,dr.rid,runtime(delayed,late));
    await test("approval earlier, execution later uses execution-time expiry",async()=>{const effect=projectReturnSettlements(await state(delayed)).find(item=>item.effectType === "member_credit_restore");assert.equal(effect?.creditResult?.restoredAmount,0);assert.equal(effect?.creditResult?.expiredAmount,60);});
    const fail=await fixture(),fr=await request(fail);await outbox(fail,fr.rid);
    // Inventory succeeds before a credit-only failure; the independent stock receipt survives.
    const {applyApprovedReturnInventory}=await import("../lib/returnInventorySettlement");
    await applyApprovedReturnInventory(fail.id,fr.rid,runtime(fail));
    await assert.rejects(applyApprovedReturnCredit(fail.id,fr.rid,{...runtime(fail),hook:()=>{throw Error("isolated pre-commit failure");}}));
    await test("P inventory success + credit failure commits no partial wallet mutation",async()=>{const s=await state(fail);assert.equal(returnInventorySummary(s,fr.rid).status,"applied");assert.equal(projectReturnSettlements(s).find(item=>item.effectType === "member_credit_restore")?.status,"failed");assert.equal((await restored(fail)).length,0);});
    await approve(fail,fr.rid);
    await test("retry preserves inventory +6 once while credit restores +50",async()=>{assert.equal(JSON.parse(await fs.readFile(fail.website,"utf8")).menu.products[0].skus[0].stock,16);assert.equal((await restored(fail)).reduce((sum,item)=>sum+item.amount,0),50);});
    const crash=await fixture(),hr=await request(crash);await outbox(crash,hr.rid);const exited=await worker(crash,hr.rid,true);assert.equal(exited.code,82);
    await test("hard exit before atomic commerce commit leaves credits/outcome uncommitted",async()=>assert.equal((await restored(crash)).length,0));
    // Existing lock recovery is operator-only. Remove ONLY this suite's confirmed-dead worker locks.
    async function clearDeadFixtureLocks(dir:string):Promise<void>{assert.ok(path.resolve(dir).startsWith(path.resolve(root)+path.sep));for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await clearDeadFixtureLocks(file);else if(entry.name.endsWith(".lock")){const owner=JSON.parse(await fs.readFile(file,"utf8"));assert.equal(owner.pid,exited.pid);await fs.unlink(file);}}}
    await clearDeadFixtureLocks(crash.data);
    await worker(crash,hr.rid);await worker(crash,hr.rid);
    await test("restart after fixture lock recovery restores once",async()=>assert.equal((await restored(crash)).reduce((sum,item)=>sum+item.amount,0),50));
    activate(f);const copyState=await readMemberCenterCopy();await saveMemberCenterCopy({expectedRevision:copyState.revision,overrides:{...copyState.overrides,"member.rewards.storeCredit.title":"枚"}});const overrides=(await readMemberCenterCopy()).overrides;
    await test("N shared label updates Member balance, preview and Member/Admin result",async()=>{const dashboard=await getMemberCommerceDashboard(f.memberId,now,f.file);const actual=dashboard.credits.filter(entry=>entry.status==="available").reduce((sum,entry)=>sum+entry.remainingAmount,0);assert.equal(actual,1049);const balance=render(createElement("strong",null,actual.toLocaleString("zh-TW")," ",createElement(MemberCopyText,{copyKey:"member.rewards.storeCredit.title"})),overrides);assert.ok(balance.includes("1,049"));assert.ok(balance.includes("枚"));for(const element of [createElement(ReturnCreditEvidence,{preview:r.p.preview,warning:true}),createElement(ReturnCreditSettlement,{result,preview:r.p.preview})]){const html=render(element,overrides);assert.ok(html.includes("50 枚"));assert.ok(!html.includes("NT$"));}assert.ok(dashboard.credits.some(entry=>entry.sourceCopyKey === "member.returns.creditPassbookSource"));});
    await test("member result contains no internal ledger/source/effect IDs",async()=>{const dto=(await getReturnWorkflow(f.id,f.memberId,runtime(f))).requests[0].creditSettlement;const json=JSON.stringify(dto);for(const key of ["creditEntryId","settlementEffectId","original-1","return-effect:","fingerprint"])assert.ok(!json.includes(key));});
    await test("warning and result copy all registered in existing catalog",()=>{for(const name of ["nearExpiryTitle","nearExpiryBody","nearExpiryAmount","nearExpiryDate","creditRestorable","creditActualRestored","creditFinalExpiredNotice","creditSettlementDescription"])assert.ok(MEMBER_CENTER_COPY_CATALOG.some(item=>item.key === "member.returns."+name));});
    await test("details remain collapsed; preview is explicitly estimated",()=>{const html=render(createElement(ReturnCreditEvidence,{preview:np.preview,warning:true}));assert.ok(html.includes("預計可返還"));assert.ok(html.includes("即將到期"));assert.ok(!/<details[^>]*\sopen/.test(html));});
    await test("credit result tampering fails ledger validation",async()=>{const s=await state(f),entry=s.returnSettlementEvents?.find(item=>item.creditResult);assert.ok(entry?.creditResult);entry.creditResult.restoredAmount++;assert.throws(()=>validateMembershipCommerceState(s));});
    await test("cleanup retains exact settled sources, restored entries and durable identity without blocking",async()=>{
      activate(f);const before=await state(f);await purgeMembershipCommerceForMembers([f.memberId]);await purgeMembershipCommerceForMembers();const after=await state(f);
      for(const id of ["original-0","original-1",...(await restored(f)).map(item=>item.creditEntryId)])assert.deepEqual(after.creditEntries[id],before.creditEntries[id]);
      assert.equal(after.creditEntries.unrelated,undefined);assert.deepEqual(after.creditReservations,before.creditReservations);assert.deepEqual(after.returnSettlementEvents,before.returnSettlementEvents);
      await applyApprovedReturnCredit(f.id,r.rid,runtime(f));assert.equal((await restored(f)).length,1);
    });
    await test("Q all payment effects future/unexecuted and completed order bytes unchanged",async()=>{for(const item of [f,near,concurrent,expired,multiple,fail,crash,delayed]){assert.equal(await fs.readFile(item.orderFile,"utf8"),item.bytes);assert.ok(projectReturnSettlements(await state(item)).filter(effect=>effect.effectType === "payment_refund").every(effect=>effect.status === "pending_future_settlement" && !effect.appliedAt));}});
    await test("protected runtime and original J6F1 milestone unchanged",async()=>{const after:Record<string,string>={};for(const dir of ["data","public/data","public/uploads"])await snapshot(process.cwd(),dir,after);assert.deepEqual(after,protectedBefore);assert.deepEqual(await snapshot(prior),priorBefore);});
    console.log("J6F2B "+count+"/"+count+" PASS — NO PAYMENT REFUND EXECUTED");
  } finally {if(previousRoot===undefined)delete process.env.KD_DATA_DIR;else process.env.KD_DATA_DIR=previousRoot;}
}
