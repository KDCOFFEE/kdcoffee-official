// Isolated local QA only; no real bank transfer or external LINE credentials.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import net from "node:net";
import {randomBytes} from "node:crypto";
import {spawn} from "node:child_process";
import {registerEmailMember,createSessionToken,MEMBER_SESSION_COOKIE} from "../lib/memberAuth";
import {createAdminSessionValue,adminCookieName} from "../lib/adminAuth";
import {runInventoryOrderTransaction} from "../lib/orderInventoryTransaction";
import {withStoredOrderUpdateLock} from "../lib/adminOrders";
import {prepareOrderCompletionWrite} from "../lib/orderCompletion";
import {DEFAULT_MEMBERSHIP_RULES,saveMembershipBusinessRules} from "../lib/membershipBusinessRules";
import {DEFAULT_RETURN_REFUND_SETTINGS} from "../lib/returnRefundSettings";
const qaRoot=await fs.mkdtemp(path.join(os.tmpdir(),"kd-j6f2c-owner-"));process.env.KD_DATA_DIR=qaRoot;
for(const key of ["RAILWAY_VOLUME_MOUNT_PATH","RAILWAY_PROJECT_ID","RAILWAY_SERVICE_ID","RAILWAY_ENVIRONMENT_ID","LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN","LINE_CHANNEL_ACCESS_TOKEN","LINE_INTERNAL_CHANNEL_ACCESS_TOKEN","LINE_INTERNAL_RECIPIENT_ID"])process.env[key]="";
for(const key of ["AUTH_SESSION_SECRET","MEMBER_IDENTITY_SECRET","ADMIN_SESSION_SECRET"])process.env[key]=randomBytes(40).toString("hex");
for(const key of Object.keys(process.env))if(/^(LINE_|GMAIL_|GOOGLE_|SMTP_|RESEND_)/.test(key))delete process.env[key];
process.env.ADMIN_PASSWORD="Return-QA-Owner-2026";process.env.ADMIN_OWNER_ID="owner";process.env.NEXT_TELEMETRY_DISABLED="1";
const port=Number(process.env.RETURN_REFUND_QA_PORT||3162),backendPort=port+1,url="http://localhost:"+port;
if(!Number.isInteger(port)||port<1024||port>65533)throw Error("Invalid isolated QA port");process.env.NEXT_PUBLIC_SITE_URL=url;process.env.MEMBER_SITE_URL=url;process.env.DEV_PUBLIC_ORIGIN=url;
const password="Return-QA-Member-2026",now=new Date();const rules=structuredClone(DEFAULT_MEMBERSHIP_RULES);rules.money.roundingMode="round-half-up";rules.returnRefund=structuredClone(DEFAULT_RETURN_REFUND_SETTINGS);
rules.returnRefund.destinations.seven_eleven={...rules.returnRefund.destinations.seven_eleven,enabled:true,storeNumber:"208303",storeName:"高鳳儀（隔離 QA 範例）",address:"高雄市鳳山區頂庄路209號",instructions:"隔離 QA：請勿實際寄送"};
rules.returnRefund.destinations.courier={...rules.returnRefund.destinations.courier,enabled:true,recipient:"QA 工作室",address:"隔離 QA 測試地址，請勿實際寄送",phone:"0000000000",instructions:"僅供測試宅配退貨選項"};
rules.returnRefund.destinations.in_person={...rules.returnRefund.destinations.in_person,enabled:true,address:"隔離 QA 工作室測試地址",phone:"0000000000",hours:"QA 預約測試",instructions:"請勿實際到訪"};rules.returnRefund.lineEnabled=true;rules.notification.events.return_refund_completed.enabled=true;
await saveMembershipBusinessRules({expectedRevision:0,rules,now:new Date(now.getTime()-86400000)});
const website=path.join(qaRoot,"store/website-data.json");await fs.mkdir(path.dirname(website),{recursive:true});await fs.writeFile(website,JSON.stringify({version:1,menu:{products:[{id:"qa-coffee",slug:"qa-coffee",name:"退款 QA 咖啡",active:true,purchasable:true,skus:[{id:"qa-half-pound",kind:"beans",label:"半磅",enabled:true,price:500,stock:100}]}]},artworks:[],pages:[]}));
const cases:Array<{number:number;name:string;orderNumber:string;email:string;memberCookie:string}>=[];
for(const [index,mode,payment] of [[1,"studio_pickup","pickup_confirmation"],[2,"home_delivery","atm_transfer"],[3,"home_delivery","cash_on_delivery"],[4,"711_cod","cash_on_delivery"]] as const){
 const email="refund-case"+index+"@example.test",member=await registerEmailMember(email,password);if(!member)throw Error("QA member missing");const orderNumber="KD20261030-930"+index,shipping=mode==="home_delivery"?40:0,codServiceFee=index===3?25:0;
 const created=await runInventoryOrderTransaction({websiteFile:website,orderDir:path.join(qaRoot,"orders"),initialOrderNumber:orderNumber,generateOrderNumber:()=>orderNumber,items:[{slug:"qa-coffee",optionId:"qa-half-pound",optionLabel:"半磅",quotedUnitPrice:500,quantity:1,preparationLabel:"咖啡豆"}],buildOrder:(id,priced)=>({order:{orderNumber:id,createdAt:new Date(now.getTime()-3600000).toISOString(),status:"ready_for_pickup",orderMode:mode,payment,paymentDetails:{method:payment,status:"paid"},customer:{name:"退款案例 "+index},member:{memberId:member.id,lineUserId:"U"+"a".repeat(32)},...priced,shipping,codServiceFee,totalBeforeCredit:priced.subtotal+shipping+codServiceFee,total:priced.subtotal+shipping+codServiceFee,credit:{appliedAmount:0}},lineText:"isolated refund Owner QA"})});if(!created.finalized)throw Error("QA inventory not finalized");
 await withStoredOrderUpdateLock(orderNumber,async(order,persist)=>{await persist(await prepareOrderCompletionWrite(order,{...order,status:"completed",fulfillmentEvents:[{eventId:"qa-refund-complete-"+index,state:"completed",occurredAt:now.toISOString()}]}) as typeof order);});
 cases.push({number:index,name:["工作室現場退款","ATM 銀行退款","宅配貨到付款銀行退款","7-ELEVEN 取貨付款銀行退款"][index-1],orderNumber,email,memberCookie:MEMBER_SESSION_COOKIE+"="+createSessionToken(member.id)});
}
const adminCookie=adminCookieName+"="+createAdminSessionValue({adminId:"owner",role:"owner"});await fs.mkdir("qa-output",{recursive:true});await fs.writeFile("qa-output/j6f2c-owner-session.json",JSON.stringify({qaRoot,url,backendPort,launcherPid:process.pid,password,adminPassword:process.env.ADMIN_PASSWORD,cases,adminCookie},null,2));
const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url??"/",url).pathname;if(pathname==="/__qa"||pathname==="/__qa/"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>J6F2C Owner QA</title><main style="max-width:850px;margin:auto;font:18px/1.7 system-ui;padding:24px"><h1>退貨人工退款 Owner QA</h1><p>隔離資料；不會轉帳。LINE 使用空白憑證，確認後可檢查失敗／重送狀態，無實際外送。</p><p>會員密碼：'+password+'<br>Admin 密碼：'+process.env.ADMIN_PASSWORD+'</p>'+cases.map(c=>'<article style="background:#f6f1e8;padding:24px;margin:20px 0"><h2>'+c.name+'</h2><p>'+c.orderNumber+'・'+c.email+'</p><a href="/__qa/member/'+c.number+'">會員申請退貨</a>　<a href="/__qa/admin/'+c.number+'">Admin 審核與退款</a></article>').join('')+'<a href="/__qa/settings">退貨設定</a><p>每案從尚未申請開始：會員選方式、填帳戶（需轉帳時），Admin 核准後可稍後處理或確認人工退款。退款證明請只用測試圖片。</p></main>');return;}
 if(pathname==="/__qa/health"){res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({phase:"J6F2C",isolated:true,cases:4}));return;}
 if(pathname==="/__qa/settings"){res.writeHead(303,{Location:"/admin/membership","Set-Cookie":adminCookie+"; Path=/; HttpOnly; SameSite=Lax"});res.end();return;}
 const login=pathname.match(/^\/__qa\/(member|admin)\/([1-4])$/);if(login){const c=cases[Number(login[2])-1];res.writeHead(303,{Location:login[1]==="admin"?"/admin/returns/"+c.orderNumber:"/member/orders/"+c.orderNumber+"/returns","Set-Cookie":(login[1]==="admin"?adminCookie:c.memberCookie)+"; Path=/; HttpOnly; SameSite=Lax","Cache-Control":"no-store"});res.end();return;}
 const upstream=http.request({hostname:"127.0.0.1",port:backendPort,path:req.url,method:req.method,headers:{...req.headers,"x-forwarded-host":"localhost:"+port,"x-forwarded-proto":"http"}},response=>{res.writeHead(response.statusCode??502,response.headers);response.pipe(res);});upstream.on("error",()=>{if(!res.headersSent)res.writeHead(502);res.end("QA app is starting");});req.pipe(upstream);
}catch{if(!res.headersSent)res.writeHead(500);res.end("QA helper failed");}});
server.on("upgrade",(req,socket,head)=>{const upstream=net.connect(backendPort,"127.0.0.1",()=>{upstream.write((req.method??"GET")+" "+req.url+" HTTP/1.1\r\n"+Object.entries(req.headers).map(([key,value])=>key+": "+value).join("\r\n")+"\r\n\r\n");if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});upstream.on("error",()=>socket.destroy());socket.on("error",()=>upstream.destroy());});
server.listen(port,"127.0.0.1",()=>console.log("J6F2C OWNER QA "+url+"/__qa"));const mode=process.env.RETURN_REFUND_QA_SERVER_MODE==="start"?"start":"dev";const child=spawn(process.execPath,["node_modules/next/dist/bin/next",mode,...(mode==="dev"?["--webpack"]:[]),"--hostname","127.0.0.1","--port",String(backendPort)],{env:{...process.env,NODE_ENV:mode==="start"?"production":"development"},stdio:"inherit",windowsHide:true});child.on("exit",code=>{server.close();process.exitCode=code??1;});for(const signal of ["SIGINT","SIGTERM"] as const)process.on(signal,()=>{child.kill();server.close();});
