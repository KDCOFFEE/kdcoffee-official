import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {createHash,randomUUID} from "node:crypto";
import {prepareOrderCompletionWrite} from "../lib/orderCompletion";
import {DEFAULT_MEMBERSHIP_RULES,saveMembershipBusinessRules} from "../lib/membershipBusinessRules";
import {registerEmailMember} from "../lib/memberAuth";
import {memberReturnAction} from "../lib/returnWorkflow";
import {applyApprovedReturnCredit,adjustMemberCreditByAdmin,executeOrderReturnCommand,getAvailableCredit,purgeMembershipCommerceForMembers,
  readMembershipCommerceState,readReturnConsumptionReductions,resolveTerminalReturnRewardDependencies,recordValidConsumptionFromCompletedOrder,reserveCredit,settleCreditReservation,validateMembershipCommerceState} from "../lib/membershipCommerce";
import {collectProtectedCreditEvidenceReferences} from "../lib/returnCreditCleanupProtection";
import {projectReturnSettlements} from "../lib/returnSettlementLedger";
import {getMemberCommerceDashboard} from "../lib/membershipCommerce";

const suite=await fs.mkdtemp(path.join(os.tmpdir(),"kd-return-credit-cleanup-")),previousRoot=process.env.KD_DATA_DIR;
process.env.AUTH_SESSION_SECRET="cleanup-isolated-auth-secret-more-than-thirty-two-characters";
process.env.MEMBER_IDENTITY_SECRET="cleanup-isolated-identity-secret-more-than-thirty-two-characters";
process.env.RETURN_REQUEST_LINE_NOTIFICATION_ENABLED="false";
globalThis.fetch=async()=>{throw Error("External network forbidden in isolated cleanup test");};
const now=new Date("2026-10-29T03:00:00Z"),createdAt="2026-10-25T02:00:00Z",completedAt="2026-10-28T02:00:00Z";
async function snapshot(base:string,start="",output:Record<string,string>={}):Promise<Record<string,string>> {
  for(const entry of await fs.readdir(path.join(base,start),{withFileTypes:true}).catch((error:NodeJS.ErrnoException)=>{if(error.code === "ENOENT")return [];throw error;})) {
    if(["node_modules",".next","qa-output",".git","tsconfig.tsbuildinfo"].includes(entry.name))continue;
    const relative=path.join(start,entry.name);if(entry.isDirectory())await snapshot(base,relative,output);else if(entry.isFile())output[relative]=createHash("sha256").update(await fs.readFile(path.join(base,relative))).digest("hex");
  }return output;
}
const protectedBefore:Record<string,string>={};for(const dir of ["data","public/data","public/uploads"])await snapshot(process.cwd(),dir,protectedBefore);
const oldRoot="F:/KD_Coffee_Studio_J6F1_RETURN_DEV_20261028",oldBefore=await snapshot(oldRoot);
const write=async(file:string,value:unknown)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value));};
let seq=0,passes=0;
const test=async(label:string,run:()=>unknown|Promise<unknown>)=>{await run();console.log("PASS "+(++passes)+" "+label);};
async function fixture(status:"pending"|"applied"|"failed"|"manual_review_required"|"no-plan"="pending") {
  const root=path.join(suite,"case-"+(++seq));process.env.KD_DATA_DIR=root;
  const rules=structuredClone(DEFAULT_MEMBERSHIP_RULES);rules.money.roundingMode="round-half-up";
  rules.referral.payoutQualification.mode="general";rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold=100;
  await saveMembershipBusinessRules({expectedRevision:0,rules,now:new Date("2026-01-01T00:00:00Z")});
  const member=await registerEmailMember("cleanup-"+seq+"@example.test","Isolated-Password-2026");assert.ok(member);
  const orderNumber="KD20261028-"+(81000+seq),reservationId="original-consumed";
  const before={orderNumber,createdAt,status:"ready_for_pickup",orderMode:"studio_pickup",member:{memberId:member.id},customer:{name:"Isolated cleanup member"},
    items:[{slug:"coffee",optionId:"sku",name:"Coffee",quantity:10,unitPrice:100,lineTotal:1000}],subtotal:1000,shipping:0,totalBeforeCredit:1000,total:900,
    credit:{appliedAmount:100,reservationId,rulesVersion:1},paymentDetails:{status:"paid"}};
  const order=await prepareOrderCompletionWrite(before,{...before,status:"completed",fulfillmentEvents:[{eventId:"complete",state:"completed",occurredAt:completedAt}]});
  const orderFile=path.join(root,"orders",orderNumber+".json");await write(orderFile,order);
  const file=path.join(root,"membership-commerce/commerce-state.json"),state=await readMembershipCommerceState(file);
  for(const [creditEntryId,amount,expiresAt] of [["source-a",50,"2026-12-01T00:00:00+08:00"],["source-b",50,"2027-01-01T00:00:00+08:00"]] as const)
    state.creditEntries[creditEntryId]={creditEntryId,memberId:member.id,sourceType:"manual",sourceReference:"original:"+creditEntryId,amount,remainingAmount:0,expiresAt,issuedAt:"2026-10-01T00:00:00Z",createdAt:"2026-10-01T00:00:00Z",status:"consumed",metadata:{}};
  const template=state.creditEntries['source-a'];
  state.creditEntries['same-member-unrelated']={...template,creditEntryId:"same-member-unrelated",sourceReference:"unrelated-a",amount:999,remainingAmount:999,status:"available",expiresAt:"2030-01-01T00:00:00Z",issuedAt:"2026-10-27T00:00:00Z",createdAt:"2026-10-27T00:00:00Z"};
  state.creditEntries['other-member-unrelated']={...template,creditEntryId:"other-member-unrelated",sourceReference:"unrelated-b",memberId:"member-b",amount:77,remainingAmount:77,status:"available"};
  state.creditReservations[reservationId]={reservationId,memberId:member.id,orderId:orderNumber,requestedAmount:100,amount:100,allocations:[{creditEntryId:"source-a",amount:50},{creditEntryId:"source-b",amount:50}],status:"consumed",createdAt,updatedAt:createdAt};
  state.idempotency['qa-unrelated']={resultId:'same-member-unrelated',occurredAt:now.toISOString()};
  await write(file,state);
  const consumption=await recordValidConsumptionFromCompletedOrder({memberId:member.id,orderId:orderNumber,idempotencyKey:"original-consumption",now:new Date(completedAt)});
  assert.ok(consumption);assert.ok(consumption.qualificationRound);
  const withUnrelated=await readMembershipCommerceState(file);withUnrelated.validConsumptionEvents["unrelated-consumption"]={...consumption.event,eventId:"unrelated-consumption",sourceOrderId:"KD20261028-99900",sourceReference:"unrelated-consumption",idempotencyKey:"unrelated-consumption"};await write(file,withUnrelated);
  const completion=order.completion as import("../lib/orderCompletion").OrderCompletionSnapshot;assert.equal(completion.returnLines?.status,"resolved");
  if(completion.returnLines?.status!=="resolved")throw Error("Missing lines");
  const values={lines:[{returnLineRef:completion.returnLines.lines[0].returnLineRef,quantity:3}],reason:"cleanup QA",quantityAcknowledged:true,conditionAcknowledgement:{itemsComplete:true,unopenedUnusedWhereApplicable:true}};
  const preview=await memberReturnAction(orderNumber,member.id,{action:"preview",...values},{now});
  const requested=await memberReturnAction(orderNumber,member.id,{action:"create",...values,finalConfirmation:true,confirmationToken:preview.confirmationToken,idempotencyKey:randomUUID()},{now});assert.ok(requested.returnRequestId);
  const approval=await executeOrderReturnCommand({orderNumber,actor:{actorId:"owner",authority:"reviewer"},command:{type:"RETURN_APPROVED",returnRequestId:requested.returnRequestId},reason:"reviewed",idempotencyKey:"approval",authorizeOrder:()=>{},now});assert.equal(approval.status,"applied");
  const resolution=await resolveTerminalReturnRewardDependencies({now});assert.equal(resolution.status,"resolved");
  if(status==="applied")await applyApprovedReturnCredit(orderNumber,requested.returnRequestId,{now});
  if(status==="failed")await assert.rejects(applyApprovedReturnCredit(orderNumber,requested.returnRequestId,{now,hook:()=>{throw Error("retryable QA failure");}}));
  if(status==="manual_review_required") {
    const current=await readMembershipCommerceState(file);current.creditEntries['source-b'].expiresAt="2027-02-01T00:00:00+08:00";await write(file,current);
    await assert.rejects(applyApprovedReturnCredit(orderNumber,requested.returnRequestId,{now}));
  }
  if(status==="no-plan"){const current=await readMembershipCommerceState(file);current.returnSettlementEvents=[];await write(file,current);}
  return {root,file,memberId:member.id,orderNumber,reservationId,returnRequestId:requested.returnRequestId,orderFile,orderBytes:await fs.readFile(orderFile,"utf8")};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
const state=(f:Fixture)=>readMembershipCommerceState(f.file);
const effect=async(f:Fixture)=>projectReturnSettlements(await state(f)).find(item=>item.effectType === "member_credit_restore")!;
async function assertSources(f:Fixture,before:Awaited<ReturnType<typeof state>>) {
  const after=await state(f);for(const id of ["source-a","source-b"])assert.deepEqual(after.creditEntries[id],before.creditEntries[id]);
  assert.deepEqual(after.creditReservations[f.reservationId],before.creditReservations[f.reservationId]);
  for(const [id,event] of Object.entries(before.validConsumptionEvents).filter(([,event])=>event.sourceOrderId===f.orderNumber))assert.deepEqual(after.validConsumptionEvents[id],event);
  for(const [id,round] of Object.entries(before.qualificationRounds))if(round.triggeringSourceOrderId===f.orderNumber)assert.deepEqual(after.qualificationRounds[id],round);
  assert.deepEqual(readReturnConsumptionReductions(after),readReturnConsumptionReductions(before));
  assert.deepEqual(after.returnEvents,before.returnEvents);assert.deepEqual(after.returnSettlementEvents,before.returnSettlementEvents);
  assert.equal(await fs.readFile(f.orderFile,"utf8"),f.orderBytes);
}
try {
  const a=await fixture("applied"),aBefore=await state(a);await purgeMembershipCommerceForMembers(["member-b"]);
  await test("A completed credit settlement does not block unrelated member cleanup",async()=>{assert.equal((await state(a)).creditEntries['other-member-unrelated'],undefined);await assertSources(a,aBefore);});
  await purgeMembershipCommerceForMembers([a.memberId]);
  await test("B same member unrelated credit removed; exact sources and restored entry retained",async()=>{const current=await state(a);assert.equal(current.creditEntries['same-member-unrelated'],undefined);assert.equal(current.validConsumptionEvents['unrelated-consumption'],undefined);await assertSources(a,aBefore);assert.equal(Object.values(current.creditEntries).filter(entry=>entry.sourceReference.startsWith('return_credit_restore:')).length,1);assert.equal(await getAvailableCredit(a.memberId,now,a.file),30);});
  const p=await fixture(),pBefore=await state(p);await purgeMembershipCommerceForMembers([p.memberId]);
  await test("C approved PLANNED/pending settlement protects exact source entries",async()=>{await assertSources(p,pBefore);assert.equal((await effect(p)).status,"pending");});
  await test("C exact consumed reservation and source consumption stay unchanged",async()=>{const current=await state(p);assert.ok(Object.values(current.validConsumptionEvents).some(event=>event.sourceOrderId===p.orderNumber));assert.deepEqual(current.creditReservations,pBefore.creditReservations);});
  await applyApprovedReturnCredit(p.orderNumber,p.returnRequestId,{now});
  await test("restoration works after unrelated same-member cleanup: exactly +30",async()=>{assert.equal((await effect(p)).creditResult?.restoredAmount,30);assert.equal(await getAvailableCredit(p.memberId,now,p.file),30);});
  const r=await fixture("failed"),rBefore=await state(r);await purgeMembershipCommerceForMembers();
  await test("D retryable FAILED settlement keeps its exact evidence through clear-all",async()=>{await assertSources(r,rBefore);assert.equal((await effect(r)).status,"failed");});
  await applyApprovedReturnCredit(r.orderNumber,r.returnRequestId,{now});
  await test("retry after cleanup resolves FAILED effect and restores once",async()=>{assert.equal((await effect(r)).status,"applied");assert.equal(await getAvailableCredit(r.memberId,now,r.file),30);});
  const appliedBefore=await state(r);await purgeMembershipCommerceForMembers();
  await test("E completed evidence, effect history and exact issuance idempotency retained",async()=>{const current=await state(r);await assertSources(r,appliedBefore);for(const entry of Object.values(appliedBefore.creditEntries).filter(item=>item.sourceReference.startsWith('return_credit_restore:'))){assert.deepEqual(current.creditEntries[entry.creditEntryId],entry);const key='credit:issue:'+entry.sourceReference;assert.deepEqual(current.idempotency[key],appliedBefore.idempotency[key]);}});
  await applyApprovedReturnCredit(r.orderNumber,r.returnRequestId,{now});
  await test("applied retry after clear-all adds zero and keeps same settlement outcome",async()=>{assert.deepEqual((await state(r)).creditEntries,appliedBefore.creditEntries);assert.equal(await getAvailableCredit(r.memberId,now,r.file),30);});
  const all=await fixture("applied"),allBefore=await state(all);await purgeMembershipCommerceForMembers();
  await test("clear-all removes unrelated data from BOTH members without global failure",async()=>{const current=await state(all);assert.equal(current.creditEntries['same-member-unrelated'],undefined);assert.equal(current.creditEntries['other-member-unrelated'],undefined);assert.equal(current.idempotency['qa-unrelated'],undefined);await assertSources(all,allBefore);assert.ok(validateMembershipCommerceState(current));});
  await test("collector is side-effect free and never protects by member identity",()=>{const serialized=JSON.stringify(allBefore);const refs=collectProtectedCreditEvidenceReferences(allBefore);assert.ok(refs.creditEntryIds.has('source-a')&&refs.creditEntryIds.has('source-b'));assert.ok(!refs.creditEntryIds.has('same-member-unrelated')&&!refs.creditEntryIds.has('other-member-unrelated'));assert.equal(JSON.stringify(allBefore),serialized);});
  await test("D1 audit and exact qualification allocation remain replayable after clear-all",async()=>{const current=await state(all);assert.ok(Object.keys(current.qualificationRounds).length);assert.ok(readReturnConsumptionReductions(current).length);assert.equal(current.validConsumptionEvents['unrelated-consumption'],undefined);});
  const noPlan=await fixture("no-plan"),npBefore=await state(noPlan);await purgeMembershipCommerceForMembers();await assertSources(noPlan,npBefore);await applyApprovedReturnCredit(noPlan.orderNumber,noPlan.returnRequestId,{now});
  await test("approved historical request without enrolled outbox keeps exact sources",async()=>assert.equal((await effect(noPlan)).creditResult?.restoredAmount,30));
  const manual=await fixture("manual_review_required"),mBefore=await state(manual);await purgeMembershipCommerceForMembers();
  await test("manual_review_required evidence remains available for investigation",async()=>{await assertSources(manual,mBefore);assert.equal((await effect(manual)).status,"manual_review_required");});
  const reserve=await fixture("applied");const later=new Date("2026-10-30T03:00:00Z");
  const held=await reserveCredit({memberId:reserve.memberId,orderId:"KD20261030-99901",requestedAmount:10,merchandiseSubtotal:100,shipping:0,idempotencyKey:"connected-reserve",now:later});
  const reserveBefore=await state(reserve),restoredId=(await effect(reserve)).creditResult!.entries.find(entry=>entry.restoredCreditEntryId)!.restoredCreditEntryId!;
  assert.ok(held.allocations.some(item=>item.creditEntryId===restoredId));await purgeMembershipCommerceForMembers();
  await test("connected reservation retained; cleanup does not free held restored credit",async()=>{const current=await state(reserve);assert.deepEqual(current.creditReservations[held.reservationId],reserveBefore.creditReservations[held.reservationId]);assert.equal(await getAvailableCredit(reserve.memberId,later,reserve.file),20);});
  await settleCreditReservation({reservationId:held.reservationId,action:"release",reason:"isolated",idempotencyKey:"connected-release",now:new Date("2026-10-31T03:00:00Z")});
  await test("existing reservation release still works after dependency cleanup",async()=>assert.equal(await getAvailableCredit(reserve.memberId,new Date("2026-10-31T03:00:00Z"),reserve.file),30));
  const debit=await fixture("applied");await adjustMemberCreditByAdmin({memberId:debit.memberId,direction:"deduct",amount:5,reason:"isolated exact allocation",note:"",idempotencyKey:"connected-debit",now:later});
  const debitBefore=await state(debit);await purgeMembershipCommerceForMembers();
  await test("connected Owner debit retained; unrelated grant removed without credit resurrection",async()=>{const current=await state(debit);const deductions=Object.values(debitBefore.creditEntries).filter(entry=>entry.sourceReference.startsWith('admin_credit_adjustment:deduct:'));assert.equal(deductions.length,1);assert.deepEqual(current.creditEntries[deductions[0].creditEntryId],deductions[0]);assert.equal(current.creditEntries['same-member-unrelated'],undefined);assert.equal(await getAvailableCredit(debit.memberId,later,debit.file),25);});
  await test("Production credit dashboard still projects retained canonical ledger after cleanup",async()=>{const current=await state(debit);const page=await getMemberCommerceDashboard(debit.memberId,later,debit.file);assert.ok(page.credits.some(entry=>entry.sourceCopyKey==='member.returns.creditPassbookSource'));assert.ok(page.credits.some(entry=>entry.amount===-5));assert.equal(JSON.stringify(current),JSON.stringify(await state(debit)));});
  const broken=await fixture(),brokenState=await state(broken);delete brokenState.creditEntries['source-b'];await write(broken.file,brokenState);const brokenBytes=await fs.readFile(broken.file,'utf8');
  await test("missing exact source proof fails before write instead of guessing account protection",async()=>{await assert.rejects(purgeMembershipCommerceForMembers());assert.equal(await fs.readFile(broken.file,'utf8'),brokenBytes);});
  await test("protected data and original J6F1 milestone unchanged",async()=>{const after:Record<string,string>={};for(const dir of ["data","public/data","public/uploads"])await snapshot(process.cwd(),dir,after);assert.deepEqual(after,protectedBefore);assert.deepEqual(await snapshot(oldRoot),oldBefore);});
  console.log("J6F2B CLEANUP PROTECTION "+passes+"/"+passes+" PASS; isolated data; no payment/inventory/business-rule changes");
} finally {if(previousRoot===undefined)delete process.env.KD_DATA_DIR;else process.env.KD_DATA_DIR=previousRoot;}
