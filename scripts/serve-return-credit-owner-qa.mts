// Local-only Owner QA wrapper. All business operations use the accepted domain APIs.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import net from "node:net";
import {randomBytes} from "node:crypto";
import {spawn,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {registerEmailMember,createSessionToken,MEMBER_SESSION_COOKIE} from "../lib/memberAuth";
import {createAdminSessionValue,adminCookieName} from "../lib/adminAuth";
import {readMembershipCommerceState,getAvailableCredit,recordValidConsumptionFromCompletedOrder} from "../lib/membershipCommerce";
import {runInventoryOrderTransaction} from "../lib/orderInventoryTransaction";
import {withStoredOrderUpdateLock} from "../lib/adminOrders";
import {prepareOrderCompletionWrite,type OrderCompletionSnapshot} from "../lib/orderCompletion";
import {DEFAULT_MEMBERSHIP_RULES,saveMembershipBusinessRules} from "../lib/membershipBusinessRules";
import {memberReturnAction,adminReturnAction,getReturnWorkflow} from "../lib/returnWorkflow";
import {projectReturnSettlements} from "../lib/returnSettlementLedger";
import {readMemberCenterCopy,saveMemberCenterCopy} from "../lib/memberCenterCopyStore";
import {creditDisplayName} from "../lib/memberCenterCopy";
import {addTaipeiCalendarDays} from "../lib/membershipPolicies";
import {getDateOnlyInTimeZone} from "../lib/checkoutRules";

const port=Number(process.env.RETURN_SETTLEMENT_QA_PORT||3162),backendPort=port+1,url="http://localhost:"+port;
assert.ok(Number.isInteger(port)&&port>=1024&&port<65534);
const qaRoot=await fs.mkdtemp(path.join(os.tmpdir(),"kd-j6f2b-owner-"));
process.env.KD_DATA_DIR=qaRoot;
for(const key of ["RAILWAY_VOLUME_MOUNT_PATH","RAILWAY_PROJECT_ID","RAILWAY_SERVICE_ID","RAILWAY_ENVIRONMENT_ID","RAILWAY_VOLUME_NAME","LINE_CHANNEL_ACCESS_TOKEN","LINE_INTERNAL_CHANNEL_ACCESS_TOKEN","LINE_INTERNAL_RECIPIENT_ID"])process.env[key]="";
process.env.AUTH_SESSION_SECRET=randomBytes(40).toString("hex");process.env.MEMBER_IDENTITY_SECRET=randomBytes(40).toString("hex");process.env.ADMIN_SESSION_SECRET=randomBytes(40).toString("hex");
process.env.ADMIN_PASSWORD="Return-QA-Owner-2026";process.env.ADMIN_OWNER_ID="owner";
process.env.RETURN_REQUEST_LINE_NOTIFICATION_ENABLED="false";process.env.NEXT_TELEMETRY_DISABLED="1";
process.env.NEXT_PUBLIC_SITE_URL=url;process.env.MEMBER_SITE_URL=url;process.env.DEV_PUBLIC_ORIGIN=url;
const now=new Date(),day=86400000,today=getDateOnlyInTimeZone(now),normalExpiry=addTaipeiCalendarDays(today,31)+"T00:00:00+08:00";
const nearExpiry=addTaipeiCalendarDays(today,4)+"T00:00:00+08:00",pastExpiry=addTaipeiCalendarDays(today,-2)+"T00:00:00+08:00";
const password="Return-QA-Member-2026",statePath=path.join(qaRoot,"membership-commerce/commerce-state.json");
const write=async(file:string,value:unknown)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value));};
const rules=structuredClone(DEFAULT_MEMBERSHIP_RULES);rules.money.roundingMode="round-half-up";rules.credit.returnCreditExpiryWarningDays=7;
await saveMembershipBusinessRules({expectedRevision:0,rules,now:new Date(now.getTime()-30*day)});
await saveMemberCenterCopy({expectedRevision:0,overrides:{"member.rewards.storeCredit.title":"KD幣"}});
const website=path.join(qaRoot,"store/website-data.json");
await write(website,{version:1,menu:{products:[{id:"qa-coffee",slug:"qa-coffee",name:"Owner QA 咖啡",active:true,purchasable:true,skus:[{id:"qa-half-pound",kind:"beans",label:"半磅",enabled:true,price:500,stock:100}]}]},artworks:[],pages:[]});
const cases:Array<{number:number;name:string;orderNumber:string;memberId:string;email:string;memberCookie:string;requestedAt:string;settledAt:string|null;returnRequestId:string|null;originalExpiry:string[];estimated:number;actual:number|null;expired:number|null;balanceBefore:number;balanceAfter:number;retry?:{before:number;after:number;additional:number;replayed:boolean;appliedCreditEvents:number;restoredEntries:number}}> = [];
for(const number of [1,2,3,4,5]) {
  const historical=number===3||number===4;
  const requestedAt=new Date(now.getTime()-(historical?6*day:2*3600000)),completedAt=new Date(requestedAt.getTime()-3600000),createdAt=new Date(requestedAt.getTime()-day).toISOString();
  const settledAt=number===2?null:new Date(now.getTime()-(historical?day:3600000));
  const email="return-case"+number+"@example.test",member=await registerEmailMember(email,password);assert.ok(member);
  const orderNumber="KD20261029-920"+number,reservationId="qa-consumed-"+number;
  const sources=number===4?[{amount:30,expiresAt:pastExpiry},{amount:30,expiresAt:normalExpiry}]:[{amount:number===2?20:number===5?30:50,expiresAt:number===2?nearExpiry:number===3?pastExpiry:normalExpiry}];
  const credit=sources.reduce((sum,item)=>sum+item.amount,0);
  const created=await runInventoryOrderTransaction({websiteFile:website,orderDir:path.join(qaRoot,"orders"),initialOrderNumber:orderNumber,generateOrderNumber:()=>orderNumber,
    items:[{slug:"qa-coffee",optionId:"qa-half-pound",optionLabel:"半磅",quotedUnitPrice:500,quantity:1,preparationLabel:"咖啡豆"}],
    buildOrder:(id,priced)=>({order:{orderNumber:id,createdAt,status:"ready_for_pickup",orderMode:"studio_pickup",customer:{name:"案例 "+number+" 測試會員"},member:{memberId:member.id},...priced,shipping:0,totalBeforeCredit:priced.subtotal,total:priced.subtotal-credit,credit:{appliedAmount:credit,reservationId,rulesVersion:1},paymentDetails:{method:"cash_on_delivery",status:"paid"}},lineText:"isolated Owner QA"})});
  assert.ok(created.finalized);
  await withStoredOrderUpdateLock(orderNumber,async(order,persist)=>{await persist(await prepareOrderCompletionWrite(order,{...order,status:"completed",fulfillmentEvents:[{eventId:"qa-complete-"+number,state:"completed",occurredAt:completedAt.toISOString()}]}) as typeof order);});
  const state=await readMembershipCommerceState();
  sources.forEach((source,index)=>{const id="qa-original-"+number+"-"+index;state.creditEntries[id]={creditEntryId:id,memberId:member.id,sourceType:"manual",sourceReference:"qa-original:"+number+":"+index,amount:source.amount,remainingAmount:0,expiresAt:source.expiresAt,issuedAt:new Date(requestedAt.getTime()-2*day).toISOString(),createdAt:new Date(requestedAt.getTime()-2*day).toISOString(),status:"consumed",metadata:{}};});
  state.creditReservations[reservationId]={reservationId,memberId:member.id,orderId:orderNumber,requestedAmount:credit,amount:credit,allocations:sources.map((source,index)=>({creditEntryId:"qa-original-"+number+"-"+index,amount:source.amount})),status:"consumed",createdAt,updatedAt:createdAt};
  await write(statePath,state);
  await recordValidConsumptionFromCompletedOrder({memberId:member.id,orderId:orderNumber,idempotencyKey:"qa-consumption-"+number,now:completedAt});
  const order=JSON.parse(await fs.readFile(path.join(qaRoot,"orders",orderNumber+".json"),"utf8")),completion=order.completion as OrderCompletionSnapshot;
  assert.equal(completion.returnLines?.status,"resolved");if(completion.returnLines?.status!=="resolved")throw Error("Missing source lines");
  const values={lines:[{returnLineRef:completion.returnLines.lines[0].returnLineRef,quantity:1}],reason:"商品不符需求",conditionAcknowledgement:{itemsComplete:true,unopenedUnusedWhereApplicable:true},quantityAcknowledged:true};
  const preview=await memberReturnAction(orderNumber,member.id,{action:"preview",...values},{now:requestedAt});assert.ok(preview.preview&&preview.confirmationToken);
  assert.equal(preview.preview.restorableCreditAmount,credit);
  const before=await getAvailableCredit(member.id,settledAt??now);assert.equal(before,0);
  let rid:string|null=null;
  if(number!==2) {
    const requested=await memberReturnAction(orderNumber,member.id,{action:"create",...values,finalConfirmation:true,confirmationToken:preview.confirmationToken,idempotencyKey:"qa-return-"+number},{now:requestedAt});assert.ok(requested.returnRequestId);rid=requested.returnRequestId;
    const snapshot=structuredClone((await readMembershipCommerceState()).returnEvents?.find(event=>event.returnRequestId===rid&&event.type==="RETURN_REQUESTED"));
    await adminReturnAction(orderNumber,"owner",{action:"approve",returnRequestId:rid,reason:"已確認退貨商品狀況",idempotencyKey:"qa-approve-"+number},{now:settledAt!});
    assert.deepEqual((await readMembershipCommerceState()).returnEvents?.find(event=>event.returnRequestId===rid&&event.type==="RETURN_REQUESTED"),snapshot);
  } else {
    assert.equal(preview.preview.expiryWarning?.amount,20);assert.equal(preview.preview.expiryWarning?.days,7);
    // Prove non-blocking submission using a disposable commerce-state copy, leaving
    // the real Owner case untouched and ready for browser confirmation/submission.
    const clone=path.join(qaRoot,"nonblocking-check/commerce-state.json");await write(clone,await readMembershipCommerceState());
    const accepted=await memberReturnAction(orderNumber,member.id,{action:"create",...values,finalConfirmation:true,confirmationToken:preview.confirmationToken,idempotencyKey:"qa-nonblocking"},{now:requestedAt,stateFilePath:clone});assert.ok(accepted.returnRequestId);
  }
  const view=await getReturnWorkflow(orderNumber,member.id,{now}),result=view.requests[0]?.creditSettlement;
  const expectedActual=number===2?null:number===3?0:number===4||number===5?30:50;
  if(number!==2){assert.equal(result?.status,"applied");assert.equal(result.restoredAmount,expectedActual);assert.equal(result.expiredAmount,credit-expectedActual!);assert.equal(view.requests[0].inventorySettlement,undefined);}
  const after=await getAvailableCredit(member.id,now);assert.equal(after,expectedActual??0);
  const caseState=await readMembershipCommerceState();
  for(const entry of Object.values(caseState.creditEntries).filter(entry=>entry.memberId===member.id&&entry.sourceReference.startsWith("return_credit_restore:")))assert.equal(entry.expiresAt,caseState.creditEntries[String(entry.metadata.originalCreditEntryId)].expiresAt);
  cases.push({number,name:["正常返還","即將到期提醒","申請有效、結算已到期","部分有效、部分到期","同一結算重試"][number-1],orderNumber,memberId:member.id,email,memberCookie:MEMBER_SESSION_COOKIE+"="+createSessionToken(member.id),requestedAt:requestedAt.toISOString(),settledAt:settledAt?.toISOString()??null,returnRequestId:rid,originalExpiry:sources.map(item=>item.expiresAt),estimated:credit,actual:expectedActual,expired:expectedActual===null?null:credit-expectedActual,balanceBefore:before,balanceAfter:after});
}
async function retryCase5() {
  const c=cases[4],before=await getAvailableCredit(c.memberId);
  const outcome=await adminReturnAction(c.orderNumber,"owner",{action:"approve",returnRequestId:c.returnRequestId,reason:"已確認退貨商品狀況",idempotencyKey:"qa-approve-5"});
  const state=await readMembershipCommerceState(),after=await getAvailableCredit(c.memberId),effect=projectReturnSettlements(state).find(effect=>effect.returnRequestId===c.returnRequestId&&effect.effectType==="member_credit_restore")!;
  const proof={before,after,additional:after-before,replayed:outcome.replayed,appliedCreditEvents:(state.returnSettlementEvents??[]).filter(event=>event.effectId===effect.effectId&&event.type==="APPLIED").length,restoredEntries:Object.values(state.creditEntries).filter(entry=>entry.metadata.settlementEffectId===effect.effectId).length};
  assert.equal(proof.additional,0);assert.equal(proof.after,30);assert.equal(proof.replayed,true);assert.equal(proof.appliedCreditEvents,1);assert.equal(proof.restoredEntries,1);c.retry=proof;return proof;
}
await retryCase5();
const cleanupLog="qa-output/j6f2b-owner-cleanup-recheck.log";
await fs.mkdir("qa-output",{recursive:true});
const cleanup=spawnSync(process.execPath,["--experimental-strip-types","--import",new URL("./return-settlement-test-bootstrap.mjs",import.meta.url).href,"scripts/test-phase-j6f2b-cleanup-protection.mts"],{env:process.env,encoding:"utf8",windowsHide:true});
await fs.writeFile(cleanupLog,cleanup.stdout+cleanup.stderr);assert.equal(cleanup.status,0,cleanup.stdout+cleanup.stderr);assert.match(cleanup.stdout,/20\/20 PASS/);
const adminCookie=adminCookieName+"="+createAdminSessionValue({adminId:"owner",role:"owner"});
const sessionFile="qa-output/j6f2b-owner-session.json";
const session={qaRoot,url,backendPort,launcherPid:process.pid,emailPassword:password,adminPassword:process.env.ADMIN_PASSWORD,adminCookie,cases,cleanupRecheck:"20/20 PASS",createdAt:now.toISOString()};
await fs.writeFile(sessionFile,JSON.stringify(session,null,2));
const escape=(value:unknown)=>String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
async function dashboard() {
  const name=creditDisplayName((await readMemberCenterCopy()).overrides),credit=(amount:number|null)=>amount===null?"尚未結算":amount.toLocaleString("zh-TW")+" "+name;
  return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>J.6F.2B Owner QA</title><style>body{font:16px/1.7 system-ui;background:#f6f1e8;color:#2d332b;margin:0}main{max-width:1000px;margin:auto;padding:30px 20px}h1{font-size:30px}article,aside{background:white;border:1px solid #ddd8ce;border-radius:18px;padding:24px;margin:18px 0}nav{display:flex;gap:12px;flex-wrap:wrap}a,button{color:#244f3c}button{font:inherit;background:#edf4ef;border:1px solid #bdd1c2;border-radius:9px;padding:8px 14px;cursor:pointer}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px;border-bottom:1px solid #eee}small{color:#666}dl{display:grid;grid-template-columns:1fr 1fr;gap:8px}dd{margin:0;font-weight:600}details{padding:10px 0}code{overflow-wrap:anywhere}</style><main><h1>會員額度返還・Owner QA</h1><p>各案例使用不同測試會員；點選會員連結會切換到該案帳號。資料完全隔離。</p><aside><nav><a href="/__qa/admin/copy">共用額度顯示名稱</a><a href="/__qa/admin/list">退貨管理</a></nav><p>目前共用名稱：<strong>${escape(name)}</strong>；近到期提醒：7 天。先改為「枚」並儲存，再重新整理會員中心與退貨頁比較。</p><p>會員密碼：${escape(password)}<br>Admin 密碼：${escape(process.env.ADMIN_PASSWORD)}</p></aside>
${cases.map(c=>`<article id="case${c.number}"><h2>案例 ${c.number}・${escape(c.name)}</h2><p>${c.orderNumber} · ${c.email}</p><nav><a href="/__qa/member/${c.number}">開啟會員退貨頁</a><a href="/__qa/admin/${c.number}">開啟 Admin 審核頁</a><a href="/__qa/balance/${c.number}">查看此會員餘額</a></nav><dl><dt>申請時預估</dt><dd>${credit(c.estimated)}</dd><dt>實際已返還</dt><dd>${credit(c.actual)}</dd><dt>因到期未返還</dt><dd>${credit(c.expired)}</dd><dt>餘額增加</dt><dd>${credit(c.balanceAfter-c.balanceBefore)}</dd></dl>${c.number===2?'<p>此案保留未送出的表單。按「申請退貨」，數量填 1、選原因並勾選確認；按退貨確認即可看到 20 單位的近到期提醒。明細預設收合，仍可送出。</p>':''}${c.number===3||c.number===4?'<p>使用歷史時間線：原申請預估仍有效，結算時部分或全部已超過原有效期限。原申請快照保留。</p>':''}<details><summary>查看案例時間</summary><p>申請：${escape(c.requestedAt)}<br>結算：${escape(c.settledAt??"尚未結算")}</p></details>${c.number===5?`<h3>同一結算的重試證據</h3><p>重試前餘額 ${credit(c.retry!.before)}；重試後 ${credit(c.retry!.after)}；額外返還 <strong>${credit(c.retry!.additional)}</strong>。已確認為同一筆已完成操作。</p><p>返還入帳紀錄仍為 ${c.retry!.restoredEntries} 筆，結算完成紀錄仍為 ${c.retry!.appliedCreditEvents} 筆。</p><form method="post" action="/__qa/retry-case5"><button>再次重試同一筆結算</button></form>`:''}</article>`).join("")}<aside><h2>案例 7・清除保護複查</h2><p>20/20 PASS。無關會員與同會員無關額度可清除；待執行、可重試、已完成結算的精確來源證據保留，返還與重試仍正常。</p></aside></main></html>`;
}
const server=http.createServer(async(req,res)=>{
  try {
    const pathname=new URL(req.url??"/",url).pathname;
    if(pathname==="/__qa"||pathname==="/__qa/"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(await dashboard());return;}
    if(pathname==="/__qa/health"){res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify({phase:"J6F2B",isolated:true,cases:5,cleanup:"20/20 PASS"}));return;}
    const login=pathname.match(/^\/__qa\/(member|admin|balance)\/(\d|copy|list)$/);
    if(login){const kind=login[1],c=cases[Number(login[2])-1];if(!c&&!["copy","list"].includes(login[2])){res.writeHead(404).end();return;}
      const destination=kind==="admin"?(login[2]==="copy"?"/admin/member-center/copy":login[2]==="list"?"/admin/returns":"/admin/returns/"+c.orderNumber):kind==="balance"?"/member":"/member/orders/"+c.orderNumber+"/returns";
      res.writeHead(303,{Location:destination,"Set-Cookie":(kind==="admin"?adminCookie:c.memberCookie)+"; Path=/; HttpOnly; SameSite=Lax","Cache-Control":"no-store"});res.end();return;}
    if(pathname==="/__qa/retry-case5") {
      if(req.method!=="POST"||req.headers.origin!==url){res.writeHead(403).end();return;}
      await retryCase5();await fs.writeFile(sessionFile,JSON.stringify(session,null,2));res.writeHead(303,{Location:"/__qa#case5"});res.end();return;
    }
    const upstream=http.request({hostname:"127.0.0.1",port:backendPort,path:req.url,method:req.method,headers:{...req.headers,"x-forwarded-host":"localhost:"+port,"x-forwarded-proto":"http"}},response=>{res.writeHead(response.statusCode??502,response.headers);response.pipe(res);});
    upstream.on("error",()=>{if(!res.headersSent)res.writeHead(502,{"Content-Type":"text/plain; charset=utf-8"});res.end("QA app is starting. Refresh shortly.");});req.pipe(upstream);
  }catch(error){console.error(error);if(!res.headersSent)res.writeHead(500);res.end("QA helper failed");}
});
server.on("upgrade",(req,socket,head)=>{const upstream=net.connect(backendPort,"127.0.0.1",()=>{upstream.write((req.method??"GET")+" "+req.url+" HTTP/1.1\r\n"+Object.entries(req.headers).map(([key,value])=>key+": "+value).join("\r\n")+"\r\n\r\n");if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});upstream.on("error",()=>socket.destroy());socket.on("error",()=>upstream.destroy());});
server.listen(port,"127.0.0.1",()=>console.log("J6F2B OWNER QA: "+url+"/__qa\nIsolated storage: "+qaRoot));
const child=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(backendPort)],{env:{...process.env,NODE_ENV:"development"},stdio:"inherit",windowsHide:true});
child.on("exit",code=>{console.error("QA app exited",code);server.close();process.exitCode=code??1;});
for(const signal of ["SIGINT","SIGTERM"] as const)process.on(signal,()=>{child.kill();server.close();});
console.log("Fixtures verified: normal +50; near-expiry 20; final-expired +0; mixed +30; retry +0; cleanup 20/20.");
console.log("Launcher: "+fileURLToPath(import.meta.url));
