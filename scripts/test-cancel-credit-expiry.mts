// node --experimental-strip-types --import ./scripts/credit-integration-test-bootstrap.mjs scripts/test-cancel-credit-expiry.mts
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const root = await mkdtemp(path.join(os.tmpdir(), "kd-cancel-credit-expiry-"));
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.AUTH_SESSION_SECRET = randomBytes(48).toString("hex");
process.env.MEMBER_IDENTITY_SECRET = randomBytes(48).toString("hex");
for (const key of ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_INTERNAL_CHANNEL_ACCESS_TOKEN", "LINE_INTERNAL_RECIPIENT_ID"]) delete process.env[key];
globalThis.fetch = async () => { throw new Error("Network disabled"); };
const commerce = await import("../lib/membershipCommerce");
const cancellation = await import("../lib/orderCancellation");
const identity = await import("../lib/memberIdentity");
const rules = await import("../lib/membershipBusinessRules");
const auth = await import("../lib/memberAuth");
const { buildCancelCreditPreview } = await import("../lib/cancelCreditPreview");
const { allocateOriginalReturnCredit } = await import("../lib/returnCreditPreview");
const { GET } = await import("../app/api/member/orders/[orderNumber]/cancel/credit-preview/route");
const { default: Provider } = await import("../components/member/MemberCenterCopyProvider");
const { CancelCreditPreviewContent } = await import("../components/member/CancelCreditConfirmation");
const { MEMBER_CENTER_COPY_CATALOG } = await import("../lib/memberCenterCopy");
let count=0,sequence=0;
function check(name:string, run:()=>void) { run(); console.log(`PASS ${++count}: ${name}`); }
const at = new Date("2026-11-13T04:00:00.000Z");
const future = new Date(at.getTime()+86400000).toISOString(), past = new Date(at.getTime()-1).toISOString();
async function fixture(expiries: string[], useCredit=true) {
  const id=++sequence, data=path.join(root,"case-"+id);process.env.KD_DATA_DIR=data;
  const member=(await identity.ensureLegacyCanonicalMember({ memberId:"fixture-"+id,identities:[{provider:"email",subject:`case-${id}@example.test`}] })).memberId;
  await auth.saveMember({ id:member,email:`case-${id}@example.test`,createdAt:at.toISOString(),lastLoginAt:at.toISOString() });
  await rules.saveMembershipBusinessRules({expectedRevision:0,rules:structuredClone(rules.DEFAULT_MEMBERSHIP_RULES),now:at});
  await mkdir(path.join(data,"store"),{recursive:true});await mkdir(path.join(data,"orders"),{recursive:true});
  await writeFile(path.join(data,"store/website-data.json"),JSON.stringify({version:1,menu:{products:[{slug:"coffee",stock:7,skus:[{id:"coffee-sku",kind:"beans",enabled:true,stock:7,price:1000}]}]}}));
  const orderNumber="KD20261113-"+String(id).padStart(4,"0");
  const ids:string[]=[];
  if(useCredit) for(let i=0;i<expiries.length;i++) {const grant=await commerce.adjustMemberCreditByAdmin({memberId:member,direction:"grant",amount:100,reason:"synthetic grant",idempotencyKey:"fixture-grant-"+i,now:at});ids.push(grant.entry.creditEntryId);}
  const amount=useCredit?expiries.length*100:0;
  const reservation=useCredit?await commerce.reserveCredit({memberId:member,orderId:orderNumber,requestedAmount:amount,merchandiseSubtotal:1000,shipping:0,idempotencyKey:"fixture-reserve",now:at}):null;
  const file=path.join(data,"membership-commerce/commerce-state.json");
  const state=await commerce.readMembershipCommerceState();
  for(let i=0;i<ids.length;i++)state.creditEntries[ids[i]].expiresAt=expiries[i];
  await writeFile(file,JSON.stringify(state));
  const order={orderNumber,createdAt:at.toISOString(),status:"waiting_studio_pickup_confirmation",orderMode:"studio_pickup",member:{memberId:member},customer:{name:"Synthetic"},
    items:[{slug:"coffee",name:"Coffee",quantity:1,unitPrice:1000,lineTotal:1000}],subtotal:1000,shipping:0,total:1000-amount,
    credit:{reservationId:reservation?.reservationId,appliedAmount:amount,status:"reserved"},inventoryTransaction:{state:"inventory_committed",changes:[{skuId:"coffee-sku",productSlug:"coffee",productName:"Coffee",demand:1}]}};
  const orderFile=path.join(data,"orders",orderNumber+".json");await writeFile(orderFile,JSON.stringify(order));
  const cancel=(now=at)=>cancellation.requestMemberOrderCancellation({orderNumber,memberId:member,cancellationReason:"synthetic cancellation",idempotencyKey:"fixture-cancel",now:()=>now,sendNotification:async()=>({sent:false})});
  return {member,order,orderNumber,data,file,ids,reservation,orderFile,cancel,state};
}
for(const [name,expiries,expected] of [["all valid",[future,future],200],["all expired",[past,past],0],["partly expired",[past,future],100],["exact boundary",[at.toISOString()],0]] as const) {
 const f=await fixture([...expiries]);const before=await readFile(f.file,"utf8"),orderBefore=await readFile(f.orderFile,"utf8");
 const preview=buildCancelCreditPreview(f.order,f.state,f.member,at);
 check(name+" preview",()=>{assert.equal(preview.status,"ready");assert.equal(preview.restorableAmount,expected);assert.equal(preview.expiredAmount,expiries.length*100-expected);});
 check(name+" preview performs no writes",()=>assert.equal(JSON.stringify(f.state),JSON.stringify(JSON.parse(before))));
 assert.equal(await readFile(f.orderFile,"utf8"),orderBefore);
 const result=await f.cancel();assert.equal(result.result,"cancelled");
 check(name+" canonical cancellation result",()=>assert.equal(result.orderStatus,"cancelled"));
 assert.equal(await commerce.getAvailableCredit(f.member,at),expected);
 const saved=JSON.parse(await readFile(f.orderFile,"utf8"));
 check(name+" preserves subtotal/total and original credit snapshot",()=>{assert.equal(saved.subtotal,f.order.subtotal);assert.equal(saved.total,f.order.total);assert.deepEqual(saved.credit,f.order.credit);});
 const after=await commerce.readMembershipCommerceState();
 await f.cancel();assert.equal(await commerce.getAvailableCredit(f.member,at),expected);
 const retried=await commerce.readMembershipCommerceState();
 check(name+" retry does not return twice",()=>assert.deepEqual(retried.creditEntries,after.creditEntries));
}
const boundary=await fixture([new Date(at.getTime()+1).toISOString()]);
assert.equal(buildCancelCreditPreview(boundary.order,boundary.state,boundary.member,at).restorableAmount,100);
await boundary.cancel(new Date(at.getTime()+2));
assert.equal(await commerce.getAvailableCredit(boundary.member,new Date(at.getTime()+2)),0);
const boundarySaved=JSON.parse(await readFile(boundary.orderFile,"utf8"));
check("expires after preview: actual server cancellation uses new time",()=>assert.equal(boundarySaved.status,"cancelled"));
const empty=await fixture([],false);
check("no credit produces no reminder",()=>assert.equal(buildCancelCreditPreview(empty.order,empty.state,empty.member,at).status,"none"));
const f=await fixture([future]);
const corrupt=structuredClone(f.state);corrupt.creditReservations[f.reservation!.reservationId].allocations[0].creditEntryId="missing";
check("missing source never promises a return",()=>assert.equal(buildCancelCreditPreview(f.order,corrupt,f.member,at).status,"unavailable"));
check("foreign member sees no preview amounts",()=>assert.equal(buildCancelCreditPreview(f.order,f.state,"other",at).originalAmount,null));
const globals=globalThis as typeof globalThis & {__creditTestCookie?:string};globals.__creditTestCookie=undefined;
const req=new Request("http://localhost/api/member/orders/"+f.orderNumber+"/cancel/credit-preview");const params={params:Promise.resolve({orderNumber:f.orderNumber})};
assert.equal((await GET(req,params)).status,401);check("preview API rejects anonymous",()=>{});
globals.__creditTestCookie=auth.createSessionToken(f.member);
const response=await GET(req,params);assert.equal(response.status,200);const dto=await response.json();
check("preview DTO is private no-store and contains no internal identity",()=>{assert.equal(response.headers.get("Cache-Control"),"private, no-store");for(const key of ["reservationId","creditEntryId","memberId","allocations","metadata"])assert.ok(!JSON.stringify(dto).includes(key));});
const other=(await identity.ensureLegacyCanonicalMember({memberId:"other",identities:[{provider:"email",subject:"other@example.test"}]})).memberId;
await auth.saveMember({id:other,email:"other@example.test",createdAt:at.toISOString(),lastLoginAt:at.toISOString()});globals.__creditTestCookie=auth.createSessionToken(other);
assert.equal((await GET(req,params)).status,404);check("preview API rejects another member",()=>{});
const preview=buildCancelCreditPreview(f.order,f.state,f.member,at);
// eslint-disable-next-line react/no-children-prop -- typed SSR fixture.
const html=renderToStaticMarkup(createElement(Provider,{initialOverrides:{"credit.cancelPreview.title":"Owner title","credit.cancelPreview.warning":"Owner editable warning"},children:createElement(CancelCreditPreviewContent,{preview})}));
check("UI shows original, valid, expired, Taipei deadline and editable warning",()=>{for(const word of ["原使用額度","目前預計可恢復使用","已過期","Owner editable warning","2026/11/14"])assert.ok(html.includes(word),word);});
check("all preview strings participate in editable catalog",()=>assert.ok(MEMBER_CENTER_COPY_CATALOG.filter(e=>e.key.startsWith("credit.cancelPreview.")).length>=13));
check("shared J6F1 expiry classification remains identical",()=>{const entries=allocateOriginalReturnCredit([{creditEntryId:"a",amount:100,expiresAt:at.toISOString()}],100,at);assert.equal(entries[0].classification,"expired_not_restorable");});
for(const [name,mutate] of [
 ["conflicting order amount",(s:typeof f.state)=>{s.creditReservations[f.reservation!.reservationId].amount=99;}],
 ["missing reservation identity",(s:typeof f.state)=>{s.creditReservations[f.reservation!.reservationId].reservationId="wrong";}],
 ["duplicate source allocation",(s:typeof f.state)=>{const r=s.creditReservations[f.reservation!.reservationId];r.allocations=[{creditEntryId:f.ids[0],amount:50},{creditEntryId:f.ids[0],amount:50}];}],
 ["invalid original deadline",(s:typeof f.state)=>{s.creditEntries[f.ids[0]].expiresAt="invalid";}],
 ["consumed cannot be promised as cancellation release",(s:typeof f.state)=>{s.creditReservations[f.reservation!.reservationId].status="consumed";}],
] as const){const variant=structuredClone(f.state);mutate(variant);check(name,()=>assert.equal(buildCancelCreditPreview(f.order,variant,f.member,at).status,"unavailable"));}
const offset=structuredClone(f.state);const source=offset.creditEntries[f.ids[0]];source.remainingAmount=50;
const offsetReservation=offset.creditReservations[f.reservation!.reservationId];offsetReservation.amount=20;offsetReservation.allocations[0].amount=20;
offset.creditEntries["deduct"]={...source,creditEntryId:"deduct",sourceType:"manual",sourceReference:"admin_credit_adjustment:deduct:synthetic",amount:-80,remainingAmount:0,status:"consumed",adjustmentAllocations:[{creditEntryId:source.creditEntryId,amount:80}]};
const offsetOrder={...f.order,credit:{...f.order.credit,appliedAmount:20}};
check("unexpired source with existing debit offset does not promise unusable credit",()=>{const p=buildCancelCreditPreview(offsetOrder,offset,f.member,at);assert.equal(p.status,"ready");assert.equal(p.restorableAmount,0);assert.equal(p.expiredAmount,0);assert.equal(p.otherUnavailableAmount,20);});
check("return preview retains later-expiry-first original allocation",()=>{const result=allocateOriginalReturnCredit([{creditEntryId:"old",amount:100,expiresAt:past},{creditEntryId:"new",amount:100,expiresAt:future}],150,at);assert.deepEqual(result.map(e=>[e.creditEntryId,e.amount,e.classification]),[["new",100,"restorable"],["old",50,"expired_not_restorable"]]);});
// Inject only a synthetic source loss. Existing core must remain pending and recover.
await writeFile(f.file,JSON.stringify(corrupt));
await assert.rejects(()=>f.cancel());const pending=JSON.parse(await readFile(f.orderFile,"utf8"));
check("release failure does not falsely complete canonical cancellation",()=>{assert.equal(pending.status,"cancelled");assert.equal(pending.canonicalCancellation.state,"pending");});
await writeFile(f.file,JSON.stringify(f.state));
await f.cancel();const recovered=JSON.parse(await readFile(f.orderFile,"utf8"));
check("existing cancellation retry resumes failed release",()=>assert.equal(recovered.canonicalCancellation.state,"completed"));
assert.equal(await commerce.getAvailableCredit(f.member,at),100);
console.log(`TOTAL ${count} PASS / 0 FAIL. Synthetic root: ${root}`);
