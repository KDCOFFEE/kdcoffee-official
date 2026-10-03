import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import type { CoffeeArtwork } from "../data/websiteData";
import type { LineAutoReplySettings } from "../lib/lineAutoReplyTypes";
import { beanFields } from "../lib/lineAutoReplyTypes";
import { defaultLineSettings, readLineSettings, readLineProducts, saveLineSettings, validateLineSettings } from "../lib/lineAutoReplyStore";
import { formatLineBeanMenu, normalizeLineText, resolveLineBeans, resolveLineReply, splitLineReply } from "../lib/lineAutoReplyEngine";
import { claimLineEvent, handleCustomerLineWebhook, replyCustomerLine, verifyCustomerLineSignature } from "../lib/lineAutoReplyWebhook";
import { handleLineReplyAdmin } from "../lib/lineAutoReplyAdmin";
import { getLineAutoReplyDir } from "../lib/storagePaths";
import { LINE_CLAIM_LOCK_STALE_MS, withLineClaimLock } from "../lib/lineAutoReplyClaimLock";

const temp = await mkdtemp(path.join(os.tmpdir(),"kd-line-auto-1-"));
const saved = {...process.env};
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.KD_DATA_DIR=temp;
process.env.LINE_CUSTOMER_CHANNEL_SECRET="synthetic-webhook-secret";
process.env.LINE_LOGIN_CHANNEL_SECRET="synthetic-unrelated-login-secret";
process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN="synthetic-customer-token";
process.env.LINE_INTERNAL_CHANNEL_ACCESS_TOKEN="synthetic-internal-token";
process.env.LINE_CHANNEL_ACCESS_TOKEN="synthetic-legacy-token";
process.env.MEMBER_SITE_URL="https://canonical.example.test";
let realAttempts=0;
globalThis.fetch=async()=>{realAttempts++;throw new Error("Network forbidden in LINE.AUTO.1 tests");};
const counts={auto:0,bean:0};
async function test(group:keyof typeof counts,name:string,run:()=>unknown|Promise<unknown>) {
  await run();counts[group]++;console.log(`PASS ${group} ${counts[group]}: ${name}`);
}
function product(id:string,name:string,price:number):CoffeeArtwork {
  return {id,slug:id,name,artist:"Fixture",subtitle:"Fixture subtitle",mood:"Fixture mood",shortCopy:"Fixture canonical description",origin:"Fixture origin",process:"Fixture process",roast:"Fixture roast",flavors:["Fixture flavor A","Fixture flavor B"],variety:"Fixture variety",altitude:"Fixture altitude",visualTone:"fixture",active:true,status:"active",purchasable:true,inMonthlyMenu:true,skus:[{id:id+"-sku",label:"Fixture package",detail:"",price,stock:5,enabled:true}],purchase:[]};
}
const catalog=[product("fixture-a","Fixture Alpha",123),product("fixture-b","Fixture Beta",456),product("fixture-c","Fixture Gamma",789)];
const websiteFile=path.join(temp,"store","website-data.json");
await mkdir(path.dirname(websiteFile),{recursive:true});
await writeFile(websiteFile,JSON.stringify({menu:{products:catalog}}));
const productHash=createHash("sha256").update(await readFile(websiteFile)).digest("hex");
const clone=<T,>(v:T):T=>structuredClone(v);
function config():LineAutoReplySettings {
  const c=defaultLineSettings();c.enabled=true;
  c.rules=[{id:"fixture-rule",enabled:true,name:"Fixture rule",order:0,matchMode:"exact",keywords:["fixture question","alt fixture"],replyText:"Fixture answer",createdAt:c.updatedAt,updatedAt:c.updatedAt}];
  return c;
}
function beanConfig() {
  const c=config();c.beanMenu={...c.beanMenu,enabled:true,keywords:["fixture menu"],title:"Fixture menu title",intro:"Fixture intro",helpText:"Fixture help",footer:"Fixture footer",ctaLabel:"Fixture CTA",ctaUrl:"https://destination.example.test/fixture",availableText:"Fixture availability",
    displayFields:Object.fromEntries(beanFields.map(k=>[k,true])) as typeof c.beanMenu.displayFields,
    labels:Object.fromEntries(beanFields.map(k=>[k,"Fixture "+k])) as typeof c.beanMenu.labels,
    products:[{productId:"fixture-b",enabled:true,order:1,lineDescriptionOverride:""},{productId:"fixture-a",enabled:true,order:0,lineDescriptionOverride:""}]};
  return c;
}
const resolve=(message:string,c=config(),p=catalog)=>resolveLineReply(message,c,p,"https://canonical.example.test");
const signature=(raw:string,secret=process.env.LINE_CUSTOMER_CHANNEL_SECRET!)=>createHmac("sha256",secret).update(raw).digest("base64");
const event=(id="fixture-event",text="fixture question")=>({type:"message",webhookEventId:id,replyToken:"synthetic-reply-token",source:{userId:"synthetic-private-user"},message:{type:"text",id:"fixture-message-"+id,text}});
function request(body:unknown,sig?:string) {
  const raw=typeof body==="string"?body:JSON.stringify(body);
  return new Request("https://canonical.example.test/api/webhooks/line/customer",{method:"POST",body:raw,headers:{"x-line-signature":sig??signature(raw)}});
}
type Capture={url:string;headers:Headers;body:{replyToken:string;messages:{type:string;text:string}[]}};
const calls:Capture[]=[];
const mock:typeof fetch=async(url,init)=>{calls.push({url:String(url),headers:new Headers(init?.headers),body:JSON.parse(String(init?.body))});return new Response(null,{status:200});};
const dependencies={loadSettings:async()=>config(),loadProducts:async()=>catalog,claim:claimLineEvent,fetcher:mock};
const adminRequest=(body:unknown,url="/api/admin/line-auto-reply")=>new Request("https://canonical.example.test"+url,{method:"PUT",headers:{"Content-Type":"application/json",Origin:"https://canonical.example.test"},body:JSON.stringify(body)});
const lockWorkers = new Set<ReturnType<typeof spawn>>();
const lockPath=()=>path.join(getLineAutoReplyDir(),"event-claims.json.lock");
const staleOwner=()=>({protocol:"line-claim-sqlite-v1",token:"12345678-1234-4234-8234-123456789abc",pid:process.pid,hostname:"synthetic-previous-container",acquiredAt:new Date(Date.now()-LINE_CLAIM_LOCK_STALE_MS-1000).toISOString()});
async function startLockWorker() {
  const source=`import {withLineClaimLock} from ${JSON.stringify(pathToFileURL(path.resolve("lib/lineAutoReplyClaimLock.ts")).href)};
    await withLineClaimLock(async()=>{process.send("held");await new Promise(resolve=>process.on("message",message=>{if(message==="release")resolve();}));});process.disconnect();`;
  const child=spawn(process.execPath,["--experimental-strip-types","--import","./scripts/line-messaging-test-bootstrap.mjs","--input-type=module","-e",source],{cwd:process.cwd(),env:{...process.env},stdio:["ignore","ignore","pipe","ipc"],windowsHide:true});
  lockWorkers.add(child);
  const exited=new Promise<void>(resolve=>child.once("exit",()=>{lockWorkers.delete(child);resolve();}));
  await new Promise<void>((resolve,reject)=>{
    const timeout=setTimeout(()=>{child.kill();reject(new Error("Fixture lock worker did not start"));},5000);
    child.once("message",message=>{clearTimeout(timeout);assert.equal(message,"held");resolve();});
    child.once("error",error=>{clearTimeout(timeout);reject(error);});
    child.once("exit",()=>{clearTimeout(timeout);reject(new Error("Fixture lock worker exited before acquiring"));});
  });
  return {child,exited};
}

try {
  await test("auto","invalid signature rejected without loading or parsing",async()=>{let loaded=false;const r=await handleCustomerLineWebhook(request("{malformed","A".repeat(43)+"="),{loadSettings:async()=>{loaded=true;return config();}});assert.equal(r.status,401);assert.equal(loaded,false);});
  await test("auto","valid signature accepted and replied",async()=>{const r=await handleCustomerLineWebhook(request({events:[event()]}),dependencies);assert.equal(r.status,200);assert.equal((await r.json()).sent,1);assert.equal(calls.length,1);});
  await test("auto","malformed signature and missing signature rejected",()=>{for(const sig of [null,"invalid","",signature("x").slice(0,-1)," "+signature("x")])assert.equal(verifyCustomerLineSignature(Buffer.from("x"),sig,"synthetic-webhook-secret"),false);});
  await test("auto","raw whitespace and Unicode must remain unmodified",()=>{const raw='{ "events":[], "fixture":"你好\\n😀" }';assert.equal(verifyCustomerLineSignature(Buffer.from(raw),signature(raw),"synthetic-webhook-secret"),true);assert.equal(verifyCustomerLineSignature(Buffer.from(JSON.stringify(JSON.parse(raw))),signature(raw),"synthetic-webhook-secret"),false);});
  await test("auto","LINE Login secret cannot verify customer webhook",async()=>{const raw=JSON.stringify({events:[]});assert.equal((await handleCustomerLineWebhook(request(raw,signature(raw,process.env.LINE_LOGIN_CHANNEL_SECRET)))).status,401);});
  await test("auto","verified malformed JSON is safely rejected",async()=>assert.equal((await handleCustomerLineWebhook(request("{broken"))).status,400));
  await test("auto","global disabled performs no product load, claim or send",async()=>{const c=config();c.enabled=false;const before=calls.length;const r=await handleCustomerLineWebhook(request({events:[event("disabled")]}),{loadSettings:async()=>c,loadProducts:async()=>{throw Error("must not load");},claim:async()=>{throw Error("must not claim");},fetcher:mock});assert.equal((await r.json()).sent,0);assert.equal(calls.length,before);});
  await test("auto","ordinary rule does not read unrelated product data when bean menu is enabled",async()=>{const c=beanConfig();const r=await handleCustomerLineWebhook(request({events:[event("ordinary-no-catalog")]}),{...dependencies,loadSettings:async()=>c,loadProducts:async()=>{throw Error("must not read");}});assert.equal((await r.json()).sent,1);});
  await test("auto","disabled rule ignored",()=>{const c=config();c.rules[0].enabled=false;assert.equal(resolve("fixture question",c).category,"noReply");});
  await test("auto","exact match rejects a partial phrase",()=>{assert.equal(resolve("fixture question").category,"rule");assert.equal(resolve("prefix fixture question").category,"noReply");});
  await test("auto","contains mode matches partial phrase",()=>{const c=config();c.rules[0].matchMode="contains";assert.equal(resolve("prefix fixture question suffix",c).text,"Fixture answer");});
  await test("auto","multiple keywords and normalized Latin Unicode",()=>{assert.equal(resolve("alt fixture").keyword,"alt fixture");assert.equal(resolve("  ＦＩＸＴＵＲＥ   QUESTION  ").category,"rule");assert.equal(normalizeLineText("  A\tＢ  "),"a b");});
  await test("auto","priority ordering and first matching rule wins",()=>{const c=config();c.rules.push({...c.rules[0],id:"priority-rule",order:0,replyText:"Priority answer"});c.rules[0].order=10;assert.equal(resolve("fixture question",c).ruleId,"priority-rule");});
  await test("auto","priority ties have deterministic ID ordering",()=>{const c=config();c.rules.push({...c.rules[0],id:"aaa-rule",replyText:"Tie answer"});assert.equal(resolve("fixture question",c).ruleId,"aaa-rule");});
  await test("auto","no match without fallback sends nothing",()=>assert.equal(resolve("unmatched").messages.length,0));
  await test("auto","enabled fallback uses current editable text",()=>{const c=config();c.fallback={enabled:true,text:"Fixture fallback"};assert.equal(resolve("unmatched",c).text,"Fixture fallback");});
  await test("auto","disabled or blank fallback sends nothing",()=>{const c=config();c.fallback={enabled:false,text:"Fixture fallback"};assert.equal(resolve("unmatched",c).category,"noReply");c.fallback={enabled:true,text:""};assert.equal(resolve("unmatched",c).messages.length,0);});
  await test("auto","missing config defaults are disabled without creating a file",async()=>{assert.deepEqual(validateLineSettings(await readLineSettings()),defaultLineSettings());assert.equal(await readFile(path.join(getLineAutoReplyDir(),"settings.json")).then(()=>true,()=>false),false);});
  for (const [name,mutate] of [
    ["blank rule name",(c:LineAutoReplySettings)=>{c.rules[0].name=" \t ";}],
    ["empty rule keywords",(c:LineAutoReplySettings)=>{c.rules[0].keywords=[];}],
    ["normalized blank keywords",(c:LineAutoReplySettings)=>{c.rules[0].keywords=[" \u3000\u2000 "];}],
    ["blank rule reply",(c:LineAutoReplySettings)=>{c.rules[0].replyText=" \n ";}],
  ] as const) await test("auto",`server rejects ${name} for enabled and disabled persisted rules`,async()=>{
    for(const enabled of [true,false]){const c=config();c.rules[0].enabled=enabled;mutate(c);
      assert.throws(()=>validateLineSettings(c));
      const response=await handleLineReplyAdmin(adminRequest({settings:c,expectedRevision:0}),"save",{authorized:async()=>true});
      assert.equal(response.status,400);assert.ok((await response.json()).error.length>0);
    }
  });
  await test("auto","server rejects enabled bean menu without triggers",async()=>{const c=config();c.beanMenu.enabled=true;assert.throws(()=>validateLineSettings(c));assert.equal((await handleLineReplyAdmin(adminRequest({settings:c,expectedRevision:0}),"save",{authorized:async()=>true})).status,400);});
  await test("auto","server rejects enabled blank fallback",async()=>{const c=config();c.fallback.enabled=true;assert.throws(()=>validateLineSettings(c));assert.equal((await handleLineReplyAdmin(adminRequest({settings:c,expectedRevision:0}),"save",{authorized:async()=>true})).status,400);});
  await test("auto","disabled empty bean menu remains server-valid",()=>{const c=config();assert.equal(validateLineSettings(c).beanMenu.enabled,false);assert.deepEqual(validateLineSettings(c).beanMenu.keywords,[]);});
  await test("auto","disabled empty fallback remains server-valid",()=>{const c=config();assert.deepEqual(validateLineSettings(c).fallback,{enabled:false,text:""});});
  await test("auto","normalized duplicate keywords rejected for rules and bean triggers",()=>{for(const bean of [false,true]){const c=beanConfig();if(bean)c.beanMenu.keywords=["Fixture menu","ＦＩＸＴＵＲＥ  MENU"];else c.rules[0].keywords=["Fixture question","ＦＩＸＴＵＲＥ  QUESTION"];assert.throws(()=>validateLineSettings(c));}});
  await test("auto","Admin authorization rejects get, save and simulator before writes",async()=>{for(const action of ["get","save","simulate"] as const)assert.equal((await handleLineReplyAdmin(adminRequest({}),action,{authorized:async()=>false})).status,401);});
  await test("auto","cross-origin Admin saves rejected",async()=>{const r=new Request("https://canonical.example.test/api/admin/line-auto-reply",{method:"PUT",headers:{Origin:"https://other.example.test"},body:"{}"});assert.equal((await handleLineReplyAdmin(r,"save",{authorized:async()=>true})).status,403);});
  await test("auto","Admin save persists and GET reload returns saved config",async()=>{const c=beanConfig();const savedReply=await handleLineReplyAdmin(adminRequest({settings:c,expectedRevision:0}),"save",{authorized:async()=>true});assert.equal(savedReply.status,200);const next=(await savedReply.json()).settings;assert.equal(next.revision,1);assert.deepEqual(await readLineSettings(),next);const loaded=await handleLineReplyAdmin(new Request("https://canonical.example.test/api/admin/line-auto-reply"),"get",{authorized:async()=>true});assert.deepEqual((await loaded.json()).settings,next);});
  await test("auto","malformed Admin JSON safely rejected",async()=>{const r=new Request("https://canonical.example.test/api/admin/line-auto-reply",{method:"PUT",body:"{broken"});assert.equal((await handleLineReplyAdmin(r,"save",{authorized:async()=>true})).status,400);});
  await test("auto","invalid Admin input rejected without overwriting settings",async()=>{const before=await readFile(path.join(getLineAutoReplyDir(),"settings.json"),"utf8");const c=config();(c as unknown as {rules:unknown}).rules="invalid";await assert.rejects(()=>saveLineSettings(c,0));assert.equal(await readFile(path.join(getLineAutoReplyDir(),"settings.json"),"utf8"),before);});
  await test("auto","duplicate rule IDs rejected",()=>{const c=config();c.rules.push(clone(c.rules[0]));assert.throws(()=>validateLineSettings(c));});
  await test("auto","invalid match mode rejected",()=>{const c=config();(c.rules[0] as unknown as {matchMode:string}).matchMode="regex";assert.throws(()=>validateLineSettings(c));});
  await test("auto","stale revisions rejected",async()=>await assert.rejects(()=>saveLineSettings(config(),0),error=>(error as {status:number}).status===409));
  await test("auto","invalid arrays, IDs, order, URL, labels and length rejected",()=>{for(const mutate of [(c:LineAutoReplySettings)=>{c.rules[0].id="../path";},(c:LineAutoReplySettings)=>{c.rules[0].order=-1;},(c:LineAutoReplySettings)=>{c.rules[0].replyText="x".repeat(4501);},(c:LineAutoReplySettings)=>{c.beanMenu.ctaUrl="javascript:fixture";},(c:LineAutoReplySettings)=>{c.beanMenu.labels.price="x".repeat(41);},(c:LineAutoReplySettings)=>{c.rules[0].keywords=[""]; }]){const c=config();mutate(c);assert.throws(()=>validateLineSettings(c));}});
  await test("auto","simulator equals production engine and makes no LINE request",async()=>{const c=beanConfig(),before=calls.length;const r=await handleLineReplyAdmin(adminRequest({settings:c,message:"fixture menu"}),"simulate",{authorized:async()=>true});assert.deepEqual((await r.json()).result,resolve("fixture menu",c));assert.equal(calls.length,before);});
  await test("auto","customer token selected, internal and legacy tokens never used",()=>{assert.equal(calls[0].headers.get("Authorization"),"Bearer synthetic-customer-token");assert.equal(calls[0].url,"https://api.line.me/v2/bot/message/reply");assert.equal(calls[0].body.messages[0].text,"Fixture answer");assert.equal("to" in calls[0].body,false);});
  await test("auto","missing customer token never falls back to internal or legacy",async()=>{delete process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN;const before=calls.length;assert.equal((await replyCustomerLine("fixture",["Fixture"],mock)).sent,false);assert.equal(calls.length,before);process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN="synthetic-customer-token";});
  await test("auto","safe diagnostics never contain request secrets or identifiers",async()=>{const error=await replyCustomerLine("synthetic-private-reply",["Fixture"],async()=>{throw Error("synthetic-customer-token synthetic-private-reply synthetic-private-user");});assert.equal(error.code,"line-request-failed");assert.doesNotMatch(JSON.stringify(error),/synthetic-/);});
  await test("auto","unsupported follow, image and standby events safely acknowledged",async()=>{const before=calls.length;const r=await handleCustomerLineWebhook(request({events:[{type:"follow",replyToken:"fixture"},{...event("image"),message:{type:"image"}},{...event("standby"),mode:"standby"}]}),dependencies);assert.equal(r.status,200);assert.equal((await r.json()).sent,0);assert.equal(calls.length,before);});
  await test("auto","duplicate redelivery suppressed persistently",async()=>{const before=calls.length;const r=await handleCustomerLineWebhook(request({events:[event()]}),dependencies);assert.equal((await r.json()).duplicates,1);assert.equal(calls.length,before);});
  await test("auto","concurrent duplicate claims admit exactly one",async()=>assert.deepEqual((await Promise.all([claimLineEvent("concurrent-fixture"),claimLineEvent("concurrent-fixture")])).sort(),[false,true]));
  await test("auto","active LINE-only lock serializes distinct concurrent operations",async()=>{
    let active=0,maxActive=0;const entries:number[]=[];
    await Promise.all(Array.from({length:4},(_,index)=>withLineClaimLock(async()=>{
      active++;maxActive=Math.max(maxActive,active);entries.push(index);
      await new Promise(resolve=>setTimeout(resolve,10));active--;
    })));
    assert.equal(maxActive,1);assert.equal(entries.length,4);
  });
  await test("auto","fresh abandoned metadata is not deleted or overwritten",async()=>{
    const fresh={...staleOwner(),acquiredAt:new Date().toISOString()},raw=JSON.stringify(fresh);
    await writeFile(lockPath(),raw);
    await assert.rejects(()=>withLineClaimLock(async()=>assert.fail("must not enter"),{timeoutMs:30,retryDelayMs:5}));
    assert.equal(await readFile(lockPath(),"utf8"),raw);
    // This fixture alone owns the file; age it for the next recovery test.
    await writeFile(lockPath(),JSON.stringify(staleOwner()));
  });
  await test("auto","clearly stale LINE lock recovers across restart hostname and reused PID",async()=>{
    assert.equal(await claimLineEvent("stale-lock-recovered"),true);
    assert.equal(await readFile(lockPath()).then(()=>true,()=>false),false);
  });
  await test("auto","new claims succeed and duplicates stay suppressed after recovery",async()=>{
    assert.equal(await claimLineEvent("post-recovery-new"),true);
    assert.equal(await claimLineEvent("stale-lock-recovered"),false);
    assert.equal(await claimLineEvent("post-recovery-new"),false);
    const json=JSON.parse(await readFile(path.join(getLineAutoReplyDir(),"event-claims.json"),"utf8"));
    assert.equal(json.schemaVersion,1);assert.ok(Object.keys(json.claims).every(key=>/^[a-f0-9]{64}$/.test(key)));
  });
  await test("auto","racing stale recoverers admit one duplicate claim and leave valid JSON",async()=>{
    await writeFile(lockPath(),JSON.stringify(staleOwner()));
    const accepted=await Promise.all(Array.from({length:6},()=>claimLineEvent("racing-recovery")));
    assert.equal(accepted.filter(Boolean).length,1);
    assert.equal(await readFile(lockPath()).then(()=>true,()=>false),false);
    assert.equal(JSON.parse(await readFile(path.join(getLineAutoReplyDir(),"event-claims.json"),"utf8")).schemaVersion,1);
  });
  await test("auto","live subprocess lock cannot be evicted even with very old acquiredAt",async()=>{
    const worker=await startLockWorker();
    try {
      const owner=JSON.parse(await readFile(lockPath(),"utf8"));owner.acquiredAt=staleOwner().acquiredAt;
      const raw=JSON.stringify(owner);await writeFile(lockPath(),raw);
      await assert.rejects(()=>withLineClaimLock(async()=>assert.fail("active holder must not be evicted"),{timeoutMs:30,retryDelayMs:5}));
      assert.equal(await readFile(lockPath(),"utf8"),raw);
      worker.child.send("release");await worker.exited;
    } finally {if(worker.child.exitCode===null && worker.child.signalCode===null){worker.child.kill();await worker.exited;}}
    assert.equal(await readFile(lockPath()).then(()=>true,()=>false),false);
  });
  await test("auto","crashed subprocess releases kernel lock and stale metadata can recover",async()=>{
    const worker=await startLockWorker();
    try {
      const owner=JSON.parse(await readFile(lockPath(),"utf8"));owner.acquiredAt=staleOwner().acquiredAt;
      await writeFile(lockPath(),JSON.stringify(owner));
    } finally {worker.child.kill();await worker.exited;}
    assert.equal(await claimLineEvent("crash-recovered"),true);
    assert.equal(await claimLineEvent("crash-recovered"),false);
  });
  await test("auto","unknown legacy host or live PID metadata fails closed",async()=>{
    for(const hostname of ["synthetic-unknown-host",os.hostname()]){
      const owner={pid:process.pid,hostname,acquiredAt:staleOwner().acquiredAt},raw=JSON.stringify(owner);await writeFile(lockPath(),raw);
      await assert.rejects(()=>withLineClaimLock(async()=>assert.fail("uncertain owner must stay protected"),{timeoutMs:20,retryDelayMs:5}));
      assert.equal(await readFile(lockPath(),"utf8"),raw);
    }
    // Replace only this test-owned fixture, so subsequent tests can continue.
    await writeFile(lockPath(),JSON.stringify(staleOwner()));await withLineClaimLock(async()=>{});
  });
  await test("auto","known-host legacy lock with a confirmed exited PID recovers",async()=>{
    const worker=await startLockWorker();worker.child.send("release");await worker.exited;
    await writeFile(lockPath(),JSON.stringify({pid:worker.child.pid,hostname:os.hostname(),acquiredAt:staleOwner().acquiredAt}));
    assert.equal(await claimLineEvent("legacy-confirmed-dead"),true);
  });
  await test("auto","lock errors release kernel ownership and do not create recovery-file growth",async()=>{
    await assert.rejects(()=>withLineClaimLock(async()=>{throw Error("Fixture failure");}));
    await withLineClaimLock(async()=>{});
    const files=await readdir(getLineAutoReplyDir());
    assert.ok(files.every(name=>["settings.json","event-claims.json","event-claims-lock.sqlite"].includes(name)));
  });
  await test("auto","generic lock retains original no-stale-removal behavior and unrelated files stay untouched",async()=>{
    const {withFileLock}=await import("../lib/jsonFileStore");
    const file=path.join(temp,"unrelated-fixture.json"),raw="Fixture unrelated state";
    await writeFile(file,raw);await writeFile(file+".lock",JSON.stringify(staleOwner()));
    await assert.rejects(()=>withFileLock(file,async()=>assert.fail("generic lock must not recover"),{timeoutMs:20,retryDelayMs:5}));
    assert.equal(await readFile(file,"utf8"),raw);assert.deepEqual(JSON.parse(await readFile(file+".lock","utf8")).protocol,staleOwner().protocol);
    assert.equal(createHash("sha256").update(await readFile(websiteFile)).digest("hex"),productHash);
  });

  await test("auto","failed Reply API attempt is retained and never blindly retried",async()=>{let attempts=0;const deps={...dependencies,fetcher:async()=>{attempts++;return new Response(null,{status:500});}};const first=await handleCustomerLineWebhook(request({events:[event("failed")]}),deps);assert.equal((await first.json()).failed,1);const second=await handleCustomerLineWebhook(request({events:[event("failed")]}),deps);assert.equal((await second.json()).duplicates,1);assert.equal(attempts,1);});
  await test("auto","fallback dedupe uses message ID without storing user or reply token",async()=>{const e=event("missing-event-id");delete (e as Partial<typeof e>).webhookEventId;const before=calls.length;await handleCustomerLineWebhook(request({events:[e,e]}),dependencies);assert.equal(calls.length,before+1);assert.doesNotMatch(await readFile(path.join(getLineAutoReplyDir(),"event-claims.json"),"utf8"),/synthetic-|fixture-event|private-user|replyToken/);});
  await test("auto","claim retention expires after seven days",async()=>{const now=Date.now();assert.equal(await claimLineEvent("ttl-fixture",now),true);assert.equal(await claimLineEvent("ttl-fixture",now+8*86400000),true);});
  await test("auto","bounded claim capacity fails closed without evicting a live claim",async()=>{const file=path.join(getLineAutoReplyDir(),"event-claims.json"),claims=Object.fromEntries(Array.from({length:5000},(_,i)=>[createHash("sha256").update("capacity-"+i).digest("hex"),Date.now()]));await writeFile(file,JSON.stringify({schemaVersion:1,claims}));await assert.rejects(()=>claimLineEvent("new-capacity"));assert.equal(Object.keys(JSON.parse(await readFile(file,"utf8")).claims).length,5000);await writeFile(file,JSON.stringify({schemaVersion:1,claims:{}}));});
  await test("auto","oversized payload rejected before settings are loaded",async()=>{const r=await handleCustomerLineWebhook(request("x".repeat(256001)),{loadSettings:async()=>{throw Error("must not load");}});assert.equal(r.status,413);});
  await test("auto","malformed configuration fails closed without overwriting it",async()=>{const file=path.join(getLineAutoReplyDir(),"settings.json"),before=await readFile(file);await writeFile(file,"{broken");await assert.rejects(()=>readLineSettings());await assert.rejects(()=>saveLineSettings(config(),0));assert.equal(await readFile(file,"utf8"),"{broken");await writeFile(file,before);});
  await test("auto","multi-message replies use at most five blocks without splitting surrogate pairs",()=>{const text="😀".repeat(6000);const chunks=splitLineReply(text);assert.equal(chunks.join(""),text);assert.ok(chunks.every(t=>t.length<=5000&&!/[\uD800-\uDBFF]$/u.test(t)));assert.equal(splitLineReply("x".repeat(25001)).length,0);});
  await test("auto","canonical proxy excludes webhook APIs and leaves LINE Login untouched",async()=>{const proxy=await readFile("proxy.ts","utf8");assert.match(proxy,/\(\?!api/);assert.match(proxy,/request.method !== "GET"/);const route=await readFile("app/api/webhooks/line/customer/route.ts","utf8");assert.match(route,/handleCustomerLineWebhook/);});

  await test("bean","dedicated Admin-loaded trigger wins over a general rule",()=>{const c=beanConfig();c.rules[0].keywords=["fixture menu"];assert.equal(resolve("fixture menu",c).category,"beanMenu");});
  await test("bean","disabled bean menu yields no bean response",()=>{const c=beanConfig();c.beanMenu.enabled=false;assert.equal(resolve("fixture menu",c).category,"noReply");});
  await test("bean","trigger changes immediately without mandatory production keywords",()=>{const c=beanConfig();c.beanMenu.keywords=["arbitrary fixture"];assert.equal(resolve("fixture menu",c).category,"noReply");assert.equal(resolve("arbitrary fixture",c).category,"beanMenu");assert.equal(resolve("豆單",c).category,"noReply");});
  await test("bean","exact bean trigger rejects partial match",()=>assert.equal(resolve("prefix fixture menu",beanConfig()).category,"noReply"));
  await test("bean","contains bean trigger accepts partial match",()=>{const c=beanConfig();c.beanMenu.matchMode="contains";assert.equal(resolve("prefix fixture menu",c).category,"beanMenu");});
  await test("bean","only selected enabled products appear",()=>{const c=beanConfig();c.beanMenu.products[1].enabled=false;assert.deepEqual(resolve("fixture menu",c).productIds,["fixture-b"]);});
  await test("bean","Admin product ordering respected",()=>assert.deepEqual(resolve("fixture menu",beanConfig()).productIds,["fixture-a","fixture-b"]));
  await test("bean","current canonical product name is used",()=>{const p=clone(catalog);p[0].name="Fixture LIVE renamed";assert.match(resolve("fixture menu",beanConfig(),p).text,/Fixture LIVE renamed/);});
  await test("bean","current canonical SKU price is used",()=>{const p=clone(catalog);p[0].skus![0].price=999;assert.match(resolve("fixture menu",beanConfig(),p).text,/Fixture price: Fixture package: 999/);});
  for(const key of ["roast","origin","process","flavors","variety","altitude"] as const) {
    await test("bean",`live ${key} used when enabled`,()=>{const p=clone(catalog);if(key==="flavors")p[0].flavors=["LIVE fixture flavor"];else p[0][key]="LIVE fixture "+key;assert.match(resolve("fixture menu",beanConfig(),p).text,new RegExp("LIVE fixture "+(key==="flavors"?"flavor":key)));});
  }
  await test("bean","disabled display fields disappear",()=>{const c=beanConfig();for(const key of beanFields)c.beanMenu.displayFields[key]=false;const text=resolve("fixture menu",c).text;for(const key of beanFields)assert.ok(!text.includes("Fixture "+key+":"));});
  await test("bean","Admin-edited customer labels and blank label omission",()=>{const c=beanConfig();c.beanMenu.labels.price="Custom fixture label";c.beanMenu.labels.origin="";const text=resolve("fixture menu",c).text;assert.match(text,/Custom fixture label:/);assert.doesNotMatch(text,/Fixture origin:/);});
  await test("bean","LINE description override wins",()=>{const c=beanConfig();c.beanMenu.products[1].lineDescriptionOverride="Fixture override";assert.match(resolve("fixture menu",c).text,/Fixture override/);});
  await test("bean","blank override uses current canonical description",()=>assert.match(resolve("fixture menu",beanConfig()).text,/Fixture canonical description/));
  for(const key of ["title","intro","helpText","footer","ctaLabel","ctaUrl"] as const)await test("bean",`Admin ${key} loaded dynamically`,()=>{const c=beanConfig();const text=resolve("fixture menu",c).text;assert.ok(text.includes(c.beanMenu[key]));});
  await test("bean","empty state uses Admin text, blank empty state sends no reply",()=>{const c=beanConfig();c.beanMenu.products=[];c.beanMenu.emptyStateReply="Fixture empty";assert.equal(resolve("fixture menu",c).text,"Fixture empty");c.beanMenu.emptyStateReply="";assert.equal(resolve("fixture menu",c).messages.length,0);});
  await test("bean","hidden, discontinued, sold-out and coming-soon products omitted",()=>{for(const status of ["hidden","discontinued","sold_out","coming_soon"] as const){const p=clone(catalog);p[0].status=status;assert.ok(!resolve("fixture menu",beanConfig(),p).productIds.includes("fixture-a"));}});
  await test("bean","inactive, nonmonthly, nonpurchasable and zero-stock products omitted",()=>{for(const mutate of [(p:CoffeeArtwork)=>{p.active=false;},(p:CoffeeArtwork)=>{p.inMonthlyMenu=false;},(p:CoffeeArtwork)=>{p.purchasable=false;},(p:CoffeeArtwork)=>{p.skus![0].stock=0;},(p:CoffeeArtwork)=>{p.skus![0].enabled=false;}]){const p=clone(catalog);mutate(p[0]);assert.ok(!resolve("fixture menu",beanConfig(),p).productIds.includes("fixture-a"));}});
  await test("bean","deleted selection and ambiguous canonical IDs omitted safely",()=>{const p=clone(catalog);p.push(clone(p[0]));assert.ok(!resolve("fixture menu",beanConfig(),p).productIds.includes("fixture-a"));const c=beanConfig();c.beanMenu.products[1].productId="fixture-deleted";assert.ok(!resolve("fixture menu",c).productIds.includes("fixture-deleted"));});
  await test("bean","duplicate product IDs, path-like IDs and invalid URLs rejected",()=>{const c=beanConfig();c.beanMenu.products.push(clone(c.beanMenu.products[0]));assert.throws(()=>validateLineSettings(c));const other=beanConfig();other.beanMenu.products[0].productId="../../file";assert.throws(()=>validateLineSettings(other));});
  await test("bean","canonical product page destination and editable availability text",()=>{const text=resolve("fixture menu",beanConfig()).text;assert.match(text,/https:\/\/canonical.example.test\/works\/fixture-a/);assert.match(text,/Fixture status: Fixture availability/);});
  await test("bean","missing canonical origin omits product links without guessing a host",()=>{const beans=resolveLineBeans(beanConfig().beanMenu,catalog,"");assert.equal(beans[0].fields.productUrl,"");});
  await test("bean","selected settings persist only references, no duplicate product truth",async()=>{const settings=await readLineSettings();for(const p of settings.beanMenu.products)assert.deepEqual(Object.keys(p).sort(),["enabled","lineDescriptionOverride","order","productId"]);const stored=await readFile(path.join(getLineAutoReplyDir(),"settings.json"),"utf8");assert.doesNotMatch(stored,/Fixture Alpha|Fixture Beta|"skus"|"stock"|"price":123/);});
  await test("bean","resolver and formatter do not mutate products, SKUs or stock",()=>{const before=JSON.stringify(catalog);const c=beanConfig();const beans=resolveLineBeans(c.beanMenu,catalog,"https://canonical.example.test");assert.equal(formatLineBeanMenu(c.beanMenu,beans),resolve("fixture menu",c).text);assert.equal(JSON.stringify(catalog),before);});
  await test("bean","webhook formatter equals simulator formatter with mock delivery",async()=>{const c=beanConfig();const expected=resolve("fixture menu",c);const r=await handleCustomerLineWebhook(request({events:[event("bean-delivery","fixture menu")]}),{...dependencies,loadSettings:async()=>c});assert.equal((await r.json()).sent,1);assert.equal(calls.at(-1)!.body.messages.map(m=>m.text).join(""),expected.text);});
  await test("bean","price, stock and products file remain byte-identical",async()=>{assert.equal(createHash("sha256").update(await readFile(websiteFile)).digest("hex"),productHash);assert.deepEqual(await readLineProducts(),catalog);});
  await test("bean","defaults contain no production copy, keywords or enabled display labels",()=>{const c=defaultLineSettings();assert.equal(c.enabled,false);assert.equal(c.beanMenu.enabled,false);assert.equal(c.fallback.enabled,false);assert.deepEqual(c.rules,[]);assert.deepEqual(c.beanMenu.keywords,[]);for(const key of beanFields){assert.equal(c.beanMenu.labels[key],"");assert.equal(c.beanMenu.displayFields[key],false);}for(const key of ["title","intro","helpText","emptyStateReply","footer","ctaLabel","ctaUrl","availableText"] as const)assert.equal(c.beanMenu[key],"");});
  await test("bean","no real external network request occurred",()=>assert.equal(realAttempts,0));
  console.log(`LINE.AUTO.1 PASS: auto=${counts.auto}, bean=${counts.bean}, failed=0, real-network-attempts=${realAttempts}`);
} finally {
  await Promise.all([...lockWorkers].map(child=>new Promise<void>(resolve=>{child.once("exit",()=>resolve());child.kill();})));
  // Only remove the mkdtemp directory owned by this suite.
  assert.ok(temp.startsWith(path.join(os.tmpdir(),"kd-line-auto-1-")));
  await rm(temp,{recursive:true,force:true});
  for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];
  Object.assign(process.env,saved);
}
