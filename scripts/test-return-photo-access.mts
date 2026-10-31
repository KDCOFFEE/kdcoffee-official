import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {GET} from "../app/uploads/order-notifications/[fileName]/route";
import {registerEmailMember,createSessionToken,MEMBER_SESSION_COOKIE} from "../lib/memberAuth";
import {createAdminSessionValue,adminCookieName} from "../lib/adminAuth";
import {prepareOrderCompletionWrite} from "../lib/orderCompletion";
import {DEFAULT_MEMBERSHIP_RULES,saveMembershipBusinessRules} from "../lib/membershipBusinessRules";
import {DEFAULT_RETURN_REFUND_SETTINGS} from "../lib/returnRefundSettings";
import {memberReturnAction,adminReturnAction,getReturnWorkflow} from "../lib/returnWorkflow";
import {validateAndStoreOrderNotificationPhoto} from "../lib/orderNotificationPhotos";
const root=await fs.mkdtemp(path.join(os.tmpdir(),"kd-return-photo-access-")),previous=process.env.KD_DATA_DIR;process.env.KD_DATA_DIR=root;
process.env.AUTH_SESSION_SECRET="isolated-return-photo-auth-secret-long-enough";process.env.MEMBER_IDENTITY_SECRET="isolated-return-photo-identity-secret-long-enough";process.env.ADMIN_SESSION_SECRET="isolated-return-photo-admin-secret-long-enough";process.env.RETURN_REQUEST_LINE_NOTIFICATION_ENABLED="false";
const cookies=globalThis as typeof globalThis & {__returnCookies?:Record<string,string>};let checks=0;
const check=async(name:string,fn:()=>unknown|Promise<unknown>)=>{await fn();console.log(`PASS ${++checks} ${name}`);};
try {
  const rules=structuredClone(DEFAULT_MEMBERSHIP_RULES);rules.returnRefund=structuredClone(DEFAULT_RETURN_REFUND_SETTINGS);rules.returnRefund.destinations.courier={...rules.returnRefund.destinations.courier,enabled:true,address:"isolated",recipient:"QA",phone:"0000000000"};await saveMembershipBusinessRules({expectedRevision:0,rules});
  const owner=await registerEmailMember("owner-photo@example.test","Isolated-Password-2026"),other=await registerEmailMember("other-photo@example.test","Isolated-Password-2026");assert.ok(owner&&other);
  const id="KD20261030-88201",now=new Date().toISOString(),base={orderNumber:id,createdAt:now,status:"ready_for_pickup",orderMode:"home_delivery",payment:"cash_on_delivery",paymentDetails:{method:"cash_on_delivery",status:"paid"},member:{memberId:owner.id},customer:{name:"QA"},items:[{slug:"qa",optionId:"sku",name:"QA",quantity:1,unitPrice:500,lineTotal:500}],subtotal:500,shipping:0,totalBeforeCredit:500,total:500,credit:{appliedAmount:0}};
  await fs.mkdir(path.join(root,"orders"),{recursive:true});await fs.writeFile(path.join(root,"orders",id+".json"),JSON.stringify(await prepareOrderCompletionWrite(base,{...base,status:"completed",fulfillmentEvents:[{eventId:"done",state:"completed",occurredAt:now}]})));
  const view=await getReturnWorkflow(id,owner.id),values={lines:[{returnLineRef:view.lines[0].returnLineRef,quantity:1}],reason:"photo QA",quantityAcknowledged:true,conditionAcknowledgement:{itemsComplete:true,unopenedUnusedWhereApplicable:true},refundHandoff:"courier",refundBank:{bank:"822",holder:"QA",account:"12345678901234",branch:""}};
  const png=await sharp({create:{width:8,height:8,channels:3,background:"white"}}).png().toBuffer(),photo=()=>new File([new Uint8Array(png)],"proof.png",{type:"image/png"});
  const preview=await memberReturnAction(id,owner.id,{...values,action:"preview"});const created=await memberReturnAction(id,owner.id,{...values,action:"create",confirmationToken:preview.confirmationToken,finalConfirmation:true,idempotencyKey:"photo-return"},{photos:[photo()]});assert.ok(created.returnRequestId);
  await adminReturnAction(id,"owner",{action:"approve",returnRequestId:created.returnRequestId,reason:"QA",idempotencyKey:"photo-approved"});await adminReturnAction(id,"owner",{action:"refund_confirm",returnRequestId:created.returnRequestId,manuallyPaid:true},{photos:[photo()]});
  const final=await getReturnWorkflow(id,owner.id),request=final.requests[0],urls=[request.photos[0].url,request.paymentRefund.proof[0].url];assert.ok(urls.every(Boolean));
  const get=(url:string)=>GET(new Request("http://localhost"+url),{params:Promise.resolve({fileName:path.basename(url)})});
  for(const url of urls) {
    cookies.__returnCookies={};await check("return image requires session",async()=>assert.equal((await get(url)).status,404));
    cookies.__returnCookies={[MEMBER_SESSION_COOKIE]:createSessionToken(other.id)};await check("other member cannot retrieve known return image URL",async()=>assert.equal((await get(url)).status,404));
    cookies.__returnCookies={[MEMBER_SESSION_COOKIE]:createSessionToken(owner.id)};await check("exact order owner can view private image",async()=>{const response=await get(url);assert.equal(response.status,200);assert.equal(response.headers.get("Cache-Control"),"private, no-store");assert.equal(response.headers.get("Vary"),"Cookie");assert.ok((await response.arrayBuffer()).byteLength>0);});
    cookies.__returnCookies={[adminCookieName]:createAdminSessionValue({adminId:"owner",role:"owner"})};await check("authenticated Admin can view return image",async()=>assert.equal((await get(url)).status,200));
  }
  const ordinary=await validateAndStoreOrderNotificationPhoto(photo(),"11111111-1111-4111-a111-111111111111");cookies.__returnCookies={};
  await check("unrelated existing LINE image retains public delivery",async()=>{const response=await get(ordinary.url);assert.equal(response.status,200);assert.equal(response.headers.get("Cache-Control"),"public, max-age=86400, immutable");});
  await check("invalid path still rejected",async()=>assert.equal((await GET(new Request("http://localhost"),{params:Promise.resolve({fileName:"../secret"})})).status,404));
  await check("Member proof DTO contains only safe image references",()=>assert.deepEqual(Object.keys(request.paymentRefund.proof[0]).sort(),["height","url","width"]));
  console.log(`RETURN PHOTO ACCESS ${checks}/${checks} PASS; existing upload storage/LINE split preserved.`);
}finally{delete cookies.__returnCookies;if(previous===undefined)delete process.env.KD_DATA_DIR;else process.env.KD_DATA_DIR=previous;assert.ok(root.startsWith(path.join(os.tmpdir(),"kd-return-photo-access-")));await fs.rm(root,{recursive:true,force:true});}
