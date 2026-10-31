// Optional smoke test against a disposable owner QA session. Leaves cases A-D untouched.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {runInventoryOrderTransaction} from "../lib/orderInventoryTransaction";
import {withStoredOrderUpdateLock} from "../lib/adminOrders";
import {prepareOrderCompletionWrite} from "../lib/orderCompletion";
const session=JSON.parse(await fs.readFile("qa-output/j6f2c-owner-session.json","utf8"));
assert.match(session.qaRoot,/kd-j6f2c-owner-/);assert.equal(session.url,"http://localhost:"+Number(process.env.RETURN_REFUND_QA_PORT||3162));process.env.KD_DATA_DIR=session.qaRoot;
const c=session.cases[3],original=JSON.parse(await fs.readFile(path.join(session.qaRoot,"orders",c.orderNumber+".json"),"utf8"));
const id="KD20261030-"+String(Date.now()),now=new Date().toISOString();
const result=await runInventoryOrderTransaction({websiteFile:path.join(session.qaRoot,"store/website-data.json"),orderDir:path.join(session.qaRoot,"orders"),initialOrderNumber:id,generateOrderNumber:()=>id,items:[{slug:"qa-coffee",optionId:"qa-half-pound",optionLabel:"半磅",quotedUnitPrice:500,quantity:1,preparationLabel:"咖啡豆"}],buildOrder:(orderNumber,priced)=>({order:{...priced,orderNumber,createdAt:now,status:"ready_for_pickup",orderMode:"711_cod",payment:"cash_on_delivery",paymentDetails:{method:"cash_on_delivery",status:"paid"},member:original.member,customer:{name:"隔離工程驗證"},shipping:0,totalBeforeCredit:500,total:500,credit:{appliedAmount:0}},lineText:"isolated live smoke"})});assert.ok(result.finalized);
await withStoredOrderUpdateLock(id,async(order,persist)=>{await persist(await prepareOrderCompletionWrite(order,{...order,status:"completed",fulfillmentEvents:[{eventId:"qa-live-complete-"+id,state:"completed",occurredAt:now}]}) as typeof order);});
async function get(role:"member"|"admin"){const url=session.url+"/api/"+role+(role==="member"?"/orders/":"/returns/")+id+(role==="member"?"/returns":"");const response=await fetch(url,{headers:{Cookie:role==="member"?c.memberCookie:session.adminCookie}});assert.equal(response.status,200);return response.json();}
async function post(role:"member"|"admin",values:Record<string,unknown>,photo?:File){const endpoint=session.url+"/api/"+role+(role==="member"?"/orders/":"/returns/")+id+(role==="member"?"/returns":"");const form=new FormData();form.append("payload",JSON.stringify(values));if(photo)form.append("photos",photo);const response=await fetch(endpoint,{method:"POST",headers:{Origin:session.url,Cookie:role==="member"?c.memberCookie:session.adminCookie,...(!photo?{"Content-Type":"application/json"}:{})},body:photo?form:JSON.stringify(values)});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;}
const view=await get("member"),account="12345678901234",values={lines:[{returnLineRef:view.lines[0].returnLineRef,quantity:1}],reason:"隔離測試",conditionAcknowledgement:{itemsComplete:true,unopenedUnusedWhereApplicable:true},quantityAcknowledged:true,refundHandoff:"seven_eleven",refundBank:{bank:"QA bank",holder:"QA",account,branch:""}};
const preview=await post("member",{...values,action:"preview"});const request=await post("member",{...values,action:"create",finalConfirmation:true,confirmationToken:preview.confirmationToken,idempotencyKey:"qa-live-create-"+id});const rid=request.returnRequestId;assert.ok(rid);
await post("admin",{action:"approve",returnRequestId:rid,reason:"QA approved",idempotencyKey:"qa-live-approve-"+id});
const pending=await get("admin");assert.equal(pending.requests[0].paymentRefund.status,"pending");assert.equal(pending.requests[0].paymentRefund.quote.amount,500);assert.equal(JSON.stringify(pending).includes(account),false);
const bank=await post("admin",{action:"refund_details",returnRequestId:rid});assert.equal(bank.bank.account,account);
const png=await sharp({create:{width:8,height:8,channels:3,background:"white"}}).png().toBuffer();await post("admin",{action:"refund_confirm",returnRequestId:rid,manuallyPaid:true},new File([new Uint8Array(png)],"proof.png",{type:"image/png"}));
const duplicate=await post("admin",{action:"refund_confirm",returnRequestId:rid,manuallyPaid:true});assert.equal(duplicate.additionalRefund,0);
await post("admin",{action:"refund_notify",returnRequestId:rid});
const final=await get("admin");assert.equal(final.requests[0].paymentRefund.status,"completed");assert.equal(final.requests[0].paymentRefund.amount,500);assert.equal(final.requests[0].paymentRefund.proof.length,1);assert.equal(final.requests[0].paymentRefund.notification,"failed");assert.equal(JSON.stringify(await get("member")).includes(account),false);
for(const item of session.cases){const order=JSON.parse(await fs.readFile(path.join(session.qaRoot,"orders",item.orderNumber+".json"),"utf8"));assert.equal(order.status,"completed");}
console.log("LIVE QA PASS: Member submit -> Admin approve -> private details -> photo proof -> confirm -> retry +0 -> notification retry; Owner A-D untouched.");
