import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { createHmac } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { buildSupportPresetDraft } from "../lib/lineSupportPresets";
import { readSupportSettings, saveSupportSettings, migrateSupportSettings } from "../lib/lineSupportStore";
import { validateSupportSettings } from "../lib/lineSupportValidation";
import { resolveSupportReply } from "../lib/lineSupportEngine";
import { defaultLineBeanMenu, defaultLineWelcome, resolveLineBeans, formatLineBeanMenu } from "../lib/lineSupportFeatures";
import { readLineSupportCatalog } from "../lib/lineSupportCatalog";
import { handleSupportAdmin } from "../lib/lineSupportAdmin";
import { handleCustomerLineWebhook } from "../lib/lineAutoReplyWebhook";
import { getLineAutoReplyDir, getWebsiteDataFile } from "../lib/storagePaths";
import type { CoffeeArtwork } from "../data/websiteData";
const env={...process.env},temp=await fs.mkdtemp(path.join(os.tmpdir(),"kd-line-auto-j6-"));
for(const key of Object.keys(process.env))if(key.startsWith("RAILWAY_"))delete process.env[key];
process.env.KD_DATA_DIR=temp;delete process.env.LINE_AUTO_REPLY_DATA_DIR;
process.env.LINE_CUSTOMER_CHANNEL_SECRET="synthetic-j6-customer-secret";process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN="synthetic-j6-customer-token";
process.env.LINE_INTERNAL_CHANNEL_ACCESS_TOKEN="synthetic-staff-only";process.env.LINE_CHANNEL_ACCESS_TOKEN="synthetic-legacy-only";
let network=0,calls=0,count=0;globalThis.fetch=async()=>{network++;throw Error("Real network forbidden");};
const file=()=>path.join(getLineAutoReplyDir(),"settings.json"),draft=()=>validateSupportSettings(buildSupportPresetDraft()),active=()=>({...draft(),enabled:true});
async function test(name:string,fn:()=>unknown|Promise<unknown>){await fn();count++;console.log("PASS J6 "+count+": "+name);}
const product=(id:string):CoffeeArtwork=>({id,slug:id,name:"Product "+id,artist:"",subtitle:"",mood:"copy",origin:"origin",process:"process",roast:"roast",flavors:["flavor"],visualTone:"",status:"active",inMonthlyMenu:true,active:true,purchasable:true,purchase:[{label:"250g",detail:"",price:100,stock:2}]});
const selected=(id:string,order=0)=>({productId:id,enabled:true,order,description:""});
const menu=()=>({...defaultLineBeanMenu(),enabled:true,products:[selected("a",20),selected("b",10)]});
const beanSettings=()=>({...active(),beanMenu:menu()});
const auth={authorized:async()=>true};
const request=(body:unknown)=>new Request("https://j6.example.test/api/admin/line-auto-reply",{method:"PUT",headers:{origin:"https://j6.example.test"},body:JSON.stringify(body)});
const event=(type="follow",id="follow-fixture")=>({type,webhookEventId:id,replyToken:"synthetic-reply",source:{type:"user",userId:"U"+"a".repeat(32)}});
function signed(events:unknown[]){const body=JSON.stringify({events});return new Request("https://j6.example.test/api/webhooks/line/customer",{method:"POST",body,headers:{"x-line-signature":createHmac("sha256",process.env.LINE_CUSTOMER_CHANNEL_SECRET!).update(body).digest("base64")}});}
const capture:typeof fetch=async(_url,init)=>{assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer synthetic-j6-customer-token");calls++;return new Response("{}",{status:200});};
try{
  await test("fresh state OFF despite customer envs present",async()=>assert.equal((await readSupportSettings()).enabled,false));
  await test("missing settings read creates no directory",async()=>{await assert.rejects(fs.stat(getLineAutoReplyDir()),{code:"ENOENT"});});
  await test("fresh welcome and Product menu are OFF",()=>{assert.equal(defaultLineWelcome().enabled,false);assert.equal(defaultLineBeanMenu().enabled,false);});
  await test("Owner GET is read-only and initial state OFF",async()=>{const response=await handleSupportAdmin(new Request("https://j6.example.test/api/admin/line-auto-reply"),"get",auth);assert.equal(response.status,200);assert.equal((await response.json()).settings.enabled,false);await assert.rejects(fs.stat(file()),{code:"ENOENT"});});
  await test("editing/simulation does not persist settings",async()=>{const settings={...draft(),welcome:{enabled:true,text:"Hello"}};const before=JSON.stringify(settings);const response=await handleSupportAdmin(request({input:{mode:"welcome"},settings,memberState:"unlinked"}),"simulate",auth);assert.equal((await response.json()).result.text,"Hello");assert.equal(JSON.stringify(settings),before);await assert.rejects(fs.stat(file()),{code:"ENOENT"});});
  await test("explicit validated save persists OFF and extras",async()=>{const saved=await saveSupportSettings({...draft(),welcome:{enabled:false,text:"Owner welcome"},beanMenu:menu()},0);assert.equal(saved.enabled,false);assert.equal(saved.beanMenu?.products.length,2);});
  await test("explicit persisted true enables replies",async()=>{const current=await readSupportSettings();await saveSupportSettings({...current,enabled:true},current.revision);assert.equal((await readSupportSettings()).enabled,true);});
  await test("explicit persisted false disables replies",async()=>{const current=await readSupportSettings();await saveSupportSettings({...current,enabled:false},current.revision);assert.equal((await readSupportSettings()).enabled,false);});
  await test("missing enabled reads OFF without repair write",async()=>{const raw={...active()} as Record<string,unknown>;delete raw.enabled;const bytes=JSON.stringify(raw);await fs.writeFile(file(),bytes);assert.equal((await readSupportSettings()).enabled,false);assert.equal(await fs.readFile(file(),"utf8"),bytes);});
  await test("truthy string cannot enable stored settings",async()=>{await fs.writeFile(file(),JSON.stringify({...active(),enabled:"true"}));assert.equal((await readSupportSettings()).enabled,false);});
  await test("invalid save leaves exact prior bytes",async()=>{const before=await fs.readFile(file());await assert.rejects(saveSupportSettings({...draft(),welcome:{enabled:true,text:""}},0));assert.deepEqual(await fs.readFile(file()),before);});
  await test("atomic rename failure preserves old config and removes temporary file",async()=>{await fs.writeFile(file(),JSON.stringify(draft()));const before=await fs.readFile(file()),rename=fs.rename;fs.rename=async()=>{throw Object.assign(Error("Synthetic rename failure"),{code:"EIO"});};try{await assert.rejects(saveSupportSettings(active(),0),/Synthetic rename failure/);}finally{fs.rename=rename;}assert.deepEqual(await fs.readFile(file()),before);assert.ok((await fs.readdir(getLineAutoReplyDir())).every(name=>!name.endsWith(".tmp")&&!name.endsWith(".lock")));});
  await test("corrupt settings fail closed without overwrite",async()=>{await fs.writeFile(file(),"{corrupt");await assert.rejects(readSupportSettings());await assert.rejects(saveSupportSettings(draft(),0));assert.equal(await fs.readFile(file(),"utf8"),"{corrupt");});
  await test("corrupt webhook acknowledges 200 without reply, claims, member/Product reads or disk writes",async()=>{
    const beforeCalls=calls,beforeFile=await fs.readFile(file()),beforeNames=await fs.readdir(getLineAutoReplyDir());
    let claims=0,members=0;const reads:string[]=[],logs:unknown[][]=[],readFile=fs.readFile,diagnostic=console.error;
    fs.readFile=(async(...args:Parameters<typeof fs.readFile>)=>{reads.push(path.resolve(String(args[0])));return readFile(...args);}) as typeof fs.readFile;
    console.error=(...args:unknown[])=>{logs.push(args);};
    try{
      const events=[event(),{...event("postback"),postback:{data:"kd-support:v3:node:my-orders:0"}},{...event("message"),message:{type:"text",text:"豆單",id:"synthetic-bean-id"}}];
      const response=await handleCustomerLineWebhook(signed(events),{claim:async()=>{claims++;return true;},linkedMember:async()=>{members++;return true;},fetcher:capture});
      assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,sent:0,duplicates:0,failed:0});
    }finally{fs.readFile=readFile;console.error=diagnostic;}
    assert.equal(claims,0);assert.equal(members,0);assert.equal(calls,beforeCalls);assert.deepEqual(reads,[path.resolve(file())]);
    assert.deepEqual(await fs.readFile(file()),beforeFile);assert.deepEqual(await fs.readdir(getLineAutoReplyDir()),beforeNames);
    assert.deepEqual(logs,[["LINE auto reply: settings unavailable; verified webhook acknowledged without processing."]]);
  });
  await test("valid empty events acknowledges without reading corrupt settings",async()=>{
    let loads=0;const before=await fs.readFile(file()),response=await handleCustomerLineWebhook(signed([]),{loadSettings:async()=>{loads++;throw Error("must not read settings");},claim:async()=>assert.fail("verification claim"),linkedMember:async()=>assert.fail("verification member"),fetcher:async()=>assert.fail("verification delivery")});
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,sent:0,duplicates:0,failed:0});assert.equal(loads,0);assert.deepEqual(await fs.readFile(file()),before);
  });
  await test("invalid signature stays rejected even for empty events",async()=>{
    const request=signed([]);request.headers.set("x-line-signature","A".repeat(43)+"=");const response=await handleCustomerLineWebhook(request,{loadSettings:async()=>assert.fail("invalid signature settings")});assert.equal(response.status,401);
  });
  await test("signed malformed JSON stays rejected before configuration load",async()=>{
    const body="{broken",request=new Request("https://j6.example.test/api/webhooks/line/customer",{method:"POST",body,headers:{"x-line-signature":createHmac("sha256",process.env.LINE_CUSTOMER_CHANNEL_SECRET!).update(body).digest("base64")}});
    assert.equal((await handleCustomerLineWebhook(request,{loadSettings:async()=>assert.fail("malformed settings")})).status,400);
  });
  await test("signed invalid events shape stays rejected before configuration load",async()=>{
    const body=JSON.stringify({events:{}}),request=new Request("https://j6.example.test/api/webhooks/line/customer",{method:"POST",body,headers:{"x-line-signature":createHmac("sha256",process.env.LINE_CUSTOMER_CHANNEL_SECRET!).update(body).digest("base64")}});
    assert.equal((await handleCustomerLineWebhook(request,{loadSettings:async()=>assert.fail("invalid events settings")})).status,400);
  });
  await test("configuration read failure logs no thrown credentials or private request data",async()=>{
    const logs:unknown[][]=[],original=console.error,before=calls;console.error=(...args:unknown[])=>{logs.push(args);};
    try{const response=await handleCustomerLineWebhook(signed([event()]),{loadSettings:async()=>{throw Error("synthetic-private-config synthetic-customer-token");},claim:async()=>assert.fail("unavailable claim"),linkedMember:async()=>assert.fail("unavailable member"),fetcher:capture});assert.equal(response.status,200);assert.equal((await response.json()).sent,0);}finally{console.error=original;}
    assert.equal(calls,before);assert.deepEqual(logs,[["LINE auto reply: settings unavailable; verified webhook acknowledged without processing."]]);
  });
  await test("invalid parsed configuration acknowledges without enabled defaults or mutation",async()=>{
    const original=await fs.readFile(file()),bytes=JSON.stringify({schemaVersion:3,enabled:true}),before=calls,diagnostic=console.error;await fs.writeFile(file(),bytes);console.error=()=>{};
    try{const response=await handleCustomerLineWebhook(signed([event()]),{claim:async()=>assert.fail("invalid configuration claim"),linkedMember:async()=>assert.fail("invalid configuration member"),fetcher:capture});assert.equal(response.status,200);assert.equal((await response.json()).sent,0);assert.equal(await fs.readFile(file(),"utf8"),bytes);assert.equal(calls,before);}finally{console.error=diagnostic;await fs.writeFile(file(),original);}
  });
  await test("global OFF acknowledges without claims, member lookups or delivery",async()=>{
    const response=await handleCustomerLineWebhook(signed([event()]),{loadSettings:async()=>draft(),claim:async()=>assert.fail("OFF claim"),linkedMember:async()=>assert.fail("OFF member"),fetcher:async()=>assert.fail("OFF delivery")});assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,sent:0,duplicates:0,failed:0});
  });
  await test("post-load processing failure retains non-2xx response",async()=>{
    const before=calls,response=await handleCustomerLineWebhook(signed([event()]),{loadSettings:async()=>({...active(),welcome:{enabled:true,text:"Hello"}}),claim:async()=>{throw Error("synthetic claim failure");},fetcher:capture});assert.equal(response.status,503);assert.equal(calls,before);
  });
  await test("fresh volume remains OFF",async()=>{process.env.LINE_AUTO_REPLY_DATA_DIR=path.join(temp,"fresh-volume");assert.equal((await readSupportSettings()).enabled,false);const response=await handleCustomerLineWebhook(signed([event()]),{claim:async()=>assert.fail("OFF claim"),fetcher:capture});assert.equal(response.status,200);assert.equal((await response.json()).sent,0);await assert.rejects(fs.stat(getLineAutoReplyDir()),{code:"ENOENT"});delete process.env.LINE_AUTO_REPLY_DATA_DIR;});
  for(const invalid of [{welcome:{enabled:true,text:""}},{welcome:{enabled:"true",text:"x"}},{beanMenu:{...menu(),emptyText:""}},{beanMenu:{...menu(),products:[selected("../unsafe")]}},{beanMenu:{...menu(),products:[selected("a"),selected("a")]}},{beanMenu:{...menu(),products:[{...selected("a"),order:-1}]}},{beanMenu:{...menu(),products:[{...selected("a"),description:"x".repeat(1001)}]}}])await test("invalid feature config rejected "+JSON.stringify(invalid).slice(0,65),()=>assert.throws(()=>validateSupportSettings({...draft(),...invalid})));
  await test("welcome requires global ON",()=>assert.equal(resolveSupportReply({mode:"welcome"},{...draft(),welcome:{enabled:true,text:"Hello"}}).messages.length,0));
  await test("welcome feature OFF sends no greeting",()=>assert.equal(resolveSupportReply({mode:"welcome"},{...active(),welcome:{enabled:false,text:"Hello"}}).messages.length,0));
  await test("welcome missing text sends no empty payload",()=>assert.equal(resolveSupportReply({mode:"welcome"},{...active(),welcome:{enabled:true,text:" "}}).messages.length,0));
  await test("follow replies only once on duplicate delivery",async()=>{const settings={...active(),welcome:{enabled:true,text:"Hello"}},before=calls,deps={loadSettings:async()=>settings,fetcher:capture};await fs.unlink(file());assert.equal((await (await handleCustomerLineWebhook(signed([event()]),deps)).json()).sent,1);assert.equal((await (await handleCustomerLineWebhook(signed([event()]),deps)).json()).duplicates,1);assert.equal(calls,before+1);});
  await test("unfollow never sends welcome",async()=>{const before=calls;await handleCustomerLineWebhook(signed([event("unfollow")]),{loadSettings:async()=>({...active(),welcome:{enabled:true,text:"Hello"}}),fetcher:capture,claim:async()=>assert.fail("unfollow claim")});assert.equal(calls,before);});
  await test("selected Product ordering preserved",()=>assert.deepEqual(resolveLineBeans(menu(),[product("a"),product("b")]).map(p=>p.productId),["b","a"]));
  await test("equal order uses deterministic ID",()=>assert.deepEqual(resolveLineBeans({...menu(),products:[selected("b"),selected("a")]},[product("a"),product("b")]).map(p=>p.productId),["a","b"]));
  await test("selection OFF skips referenced Product",()=>assert.deepEqual(resolveLineBeans({...menu(),products:[{...selected("a"),enabled:false}]},[product("a")]),[]));
  await test("deleted Product does not substitute",()=>assert.deepEqual(resolveLineBeans(menu(),[product("unselected")]),[]));
  for(const patch of [{active:false},{status:"hidden"},{status:"discontinued"},{inMonthlyMenu:false},{purchasable:false},{purchase:[]},{name:""},{slug:"../bad"},{purchase:[{label:"x",detail:"",price:100,stock:0}]}])await test("unavailable Product safely skipped "+JSON.stringify(patch),()=>assert.deepEqual(resolveLineBeans({...menu(),products:[selected("a")]},[{...product("a"),...patch} as CoffeeArtwork]),[]));
  await test("ambiguous duplicate Product IDs skipped",()=>assert.deepEqual(resolveLineBeans({...menu(),products:[selected("a")]},[product("a"),product("a")]),[]));
  await test("empty menu returns Owner empty-state copy",()=>{const result=formatLineBeanMenu(menu(),[]);assert.equal(result.text,menu().emptyText);assert.doesNotMatch(JSON.stringify(result),/undefined/);});
  await test("Product description override and safe URL",()=>{const result=formatLineBeanMenu({...menu(),products:[{...selected("a"),description:"Owner copy"}]},[product("a")],"https://j6.example.test");assert.match(result.text,/Owner copy/);assert.ok(result.text.includes("https://j6.example.test/works/a"));});
  await test("enabled Product menu uses selected references in actual engine",()=>{const result=resolveSupportReply({mode:"text",text:"豆單"},beanSettings(),{catalog:[product("a"),product("b")]});assert.ok(result.text.indexOf("Product b")<result.text.indexOf("Product a"));});
  await test("disabled Product extension preserves guided link reply",()=>{const result=resolveSupportReply({mode:"text",text:"豆單"},{...active(),beanMenu:{...menu(),enabled:false}},{catalog:[product("a")]});assert.doesNotMatch(result.text,/Product a/);assert.match(result.text,/monthly-menu/);});
  await test("catalog missing/corrupt returns empty read-only",async()=>{assert.deepEqual(await readLineSupportCatalog(),[]);await fs.mkdir(path.dirname(getWebsiteDataFile()),{recursive:true});await fs.writeFile(getWebsiteDataFile(),"{bad");assert.deepEqual(await readLineSupportCatalog(),[]);assert.equal(await fs.readFile(getWebsiteDataFile(),"utf8"),"{bad");});
  await test("Admin choices use current Product source and save only references",async()=>{await fs.writeFile(getWebsiteDataFile(),JSON.stringify({menu:{products:[product("a"),product("b")]}}));await fs.writeFile(file(),JSON.stringify(draft()));const response=await handleSupportAdmin(new Request("https://j6.example.test/api/admin/line-auto-reply"),"get",auth);assert.deepEqual((await response.json()).products.map((p:{id:string})=>p.id),["a","b"]);const save=await handleSupportAdmin(request({settings:beanSettings(),expectedRevision:0}),"save",auth);assert.equal(save.status,200);const stored=JSON.parse(await fs.readFile(file(),"utf8"));assert.deepEqual(stored.beanMenu.products.map((p:{productId:string})=>p.productId),["a","b"]);assert.doesNotMatch(JSON.stringify(stored.beanMenu),/stock|price|skus|purchase/);});
  await test("webhook and Admin simulation resolve same Product order",async()=>{const settings=await readSupportSettings(),result=await handleSupportAdmin(request({settings,input:{mode:"text",text:"豆單"},memberState:"unlinked"}),"simulate",auth);const preview=(await result.json()).result;let delivered:unknown;const e={...event("message","bean-e2e"),message:{type:"text",text:"豆單",id:"bean-message"}};await handleCustomerLineWebhook(signed([e]),{fetcher:async(_url,init)=>{delivered=JSON.parse(String(init?.body)).messages;return new Response("{}",{status:200});}});assert.deepEqual(delivered,preview.messages);});
  await test("legacy Product IDs migrate without commerce snapshots and stay OFF",()=>{const base=draft(),legacy={schemaVersion:1,revision:0,enabled:true,updatedAt:base.updatedAt,fallback:{enabled:false,text:""},rules:[],beanMenu:{enabled:true,title:"Owner menu",intro:"Owner intro",helpText:"",footer:"",matchMode:"exact",keywords:["豆單"],ctaLabel:"豆單",updatedAt:base.updatedAt,products:[{productId:"a",enabled:true,order:20,lineDescriptionOverride:"Owner copy",price:999,stock:99}]}};const migrated=migrateSupportSettings(legacy);assert.equal(migrated.enabled,false);assert.equal(migrated.beanMenu?.enabled,false);assert.deepEqual(migrated.beanMenu?.products,[{productId:"a",enabled:true,order:20,description:"Owner copy"}]);assert.doesNotMatch(JSON.stringify(migrated.beanMenu),/price|stock/);});
  await test("Owner status displays persisted state and draft separately",async()=>{const ui=await fs.readFile("components/admin/LineAutoReplyManager.tsx","utf8");assert.match(ui,/自動回覆狀態/);assert.match(ui,/savedEnabled/);assert.ok(ui.includes("關閉 (OFF)"));assert.ok(ui.includes("開啟 (ON)"));assert.match(ui,/草稿開關/);});
  await test("Customer webhook has no staff/legacy credential fallback",async()=>{const source=await fs.readFile("lib/lineAutoReplyWebhook.ts","utf8");assert.doesNotMatch(source,/LINE_INTERNAL|LINE_CHANNEL_ACCESS_TOKEN|LINE_ORDER_RECIPIENT|LINE_LOGIN_CHANNEL_SECRET/);});
  await test("zero real network calls",()=>assert.equal(network,0));
  console.log("LINE.AUTO.J6.1 PASS: total="+count+", failed=0, real-network-attempts="+network);
}finally{const resolved=path.resolve(temp);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith("kd-line-auto-j6-"));await fs.rm(resolved,{recursive:true,force:true});for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);}
