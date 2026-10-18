import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSupportPresetDraft } from "../lib/lineSupportPresets";
import { resolveSupportReply, supportPostback, memberDestinations } from "../lib/lineSupportEngine";
import { validateSupportSettings } from "../lib/lineSupportValidation";
import { defaultSupportSettings, migrateSupportSettings, readSupportSettings, saveSupportSettings } from "../lib/lineSupportStore";
import { handleSupportAdmin } from "../lib/lineSupportAdmin";
import { handleCustomerLineWebhook, claimLineEvent } from "../lib/lineAutoReplyWebhook";
import { isLinkedSupportMember } from "../lib/lineSupportMember";
import { defaultLineSettings } from "../lib/lineAutoReplyStore";
import { provisionCanonicalMember, resolveMemberByIdentity, setCanonicalMemberAccountStatus } from "../lib/memberIdentity";
import { getLineAutoReplyDir, getMembersDir, getOrdersDir, getMemberIdentityRegistryFile, getStoreDir } from "../lib/storagePaths";
import type { SupportNode, SupportSettings, SupportResult } from "../lib/lineSupportTypes";

const temp=await fs.mkdtemp(path.join(os.tmpdir(),"kd-line-auto-3-")),environment={...process.env};
for(const key of Object.keys(process.env))if(key.startsWith("RAILWAY_"))delete process.env[key];
process.env.KD_DATA_DIR=path.join(temp,"canonical");
process.env.LINE_AUTO_REPLY_DATA_DIR=path.join(temp,"line");
process.env.MEMBER_AUTH_SECRET="synthetic-member-secret-for-isolated-line-tests";
process.env.LINE_CUSTOMER_CHANNEL_SECRET="synthetic-customer-secret";
process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN="synthetic-customer-token";
process.env.MEMBER_SITE_URL="https://canonical.example.test";
let networkAttempts=0;
globalThis.fetch=async()=>{networkAttempts++;throw new Error("Network forbidden");};
const counts:Record<string,number>={guided:0,postback:0,presets:0,member:0,master:0,validation:0,storage:0,security:0,migration:0};
async function test(group:string,name:string,run:()=>unknown|Promise<unknown>){await run();counts[group]++;console.log("PASS "+group+" "+counts[group]+": "+name);}
const clone=<T,>(v:T):T=>structuredClone(v);
const draft=validateSupportSettings(buildSupportPresetDraft({})),active={...draft,enabled:true};
const find=(id:string,s=draft)=>s.nodes.find(n=>n.id===id)!;
const text=(value:string,s=active)=>resolveSupportReply({mode:"text",text:value},s);
const node=(id:string,s=active,linked=false,page=0)=>resolveSupportReply({mode:"node",nodeId:id,page},s,{linked,publicOrigin:"https://canonical.example.test"});
const post=(data:string,s=active)=>resolveSupportReply({mode:"postback",data},s);
const items=(r:SupportResult)=>r.messages.at(-1)?.quickReply?.items||[];
const settingsFile=()=>path.join(getLineAutoReplyDir(),"settings.json");
function signed(events:unknown[],secret=process.env.LINE_CUSTOMER_CHANNEL_SECRET!){
  const body=JSON.stringify({events});
  return new Request("https://canonical.example.test/api/webhooks/line/customer",{method:"POST",body,headers:{"x-line-signature":createHmac("sha256",secret).update(body).digest("base64")}});
}
const subject="U"+"a".repeat(32),unlinkedSubject="U"+"b".repeat(32);
function event(data:string,id="synthetic-event"){return {type:"postback",webhookEventId:id,replyToken:"synthetic-reply",postback:{data},source:{type:"user",userId:subject}};}
const request=(body:unknown,origin="https://canonical.example.test")=>new Request("https://canonical.example.test/api/admin/line-auto-reply/simulate",{method:"POST",body:JSON.stringify(body),headers:{"Content-Type":"application/json",Origin:origin}});
const auth={authorized:async()=>true};
let fixtureId="";
const calls:Record<string,unknown>[]=[];
const fakeFetch:typeof fetch=async(url,init)=>{assert.equal(String(url),"https://api.line.me/v2/bot/message/reply");assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer synthetic-customer-token");calls.push(JSON.parse(String(init?.body)));return new Response("{}",{status:200});};
try{
  await test("guided","01 root help returns top-level choices",()=>assert.equal(text("幫助").nodeId,"root"));
  await test("guided","02 root choices are exactly the four groups",()=>assert.deepEqual(new Set(text("幫助").childIds),new Set(["coffee","orders","members","service"])));
  await test("guided","03 broad 回饋 goes to member/reward menu",()=>assert.equal(text("回饋").nodeId,"members"));
  await test("guided","04 broad 獎金 goes to member/reward menu",()=>assert.equal(text("獎金").nodeId,"members"));
  await test("guided","05 推薦 goes to referral menu",()=>assert.equal(text("推薦").nodeId,"referral"));
  await test("guided","06 第二代 reaches second-generation menu",()=>assert.equal(text("第二代").nodeId,"referral-second"));
  await test("guided","07 direct 第二代推薦回饋 reaches the same menu",()=>assert.equal(text("第二代推薦回饋").nodeId,"referral-second"));
  await test("guided","08 second-generation menu has child questions",()=>assert.ok(node("referral-second").childIds.includes("second-calculation")));
  await test("guided","09 back derives canonical parent",()=>assert.equal(post("kd-support:v3:back:referral-second").nodeId,"referral"));
  await test("guided","10 home returns root",()=>assert.equal(post("kd-support:v3:home").nodeId,"root"));
  await test("guided","11 disabled node is not offered",()=>assert.ok(!node("service").childIds.includes("hours")));
  await test("guided","12 disabling parent hides all descendants",()=>{const s=clone(active);find("referral",s).enabled=false;assert.equal(node("referral-second",s).category,"noReply");assert.notEqual(text("第二代",s).nodeId,"referral-second");});
  await test("guided","13 disabled leaf does not answer directly",()=>assert.equal(node("hours").category,"noReply"));
  await test("guided","14 node ordering independent of persisted array order",()=>{const s=clone(active);s.nodes.reverse();assert.deepEqual(node("root",s),node("root"));});
  await test("guided","15 keyword matching deterministic and NFKC normalized",()=>{assert.equal(text("  ＫＤ 點數 ").nodeId,"kd-points");assert.deepEqual(text("第二代"),text("第二代"));});
  await test("guided","precise question remains reachable after broad menu reorder",()=>{const s=clone(active);find("orders",s).order=0;assert.equal(text("我的訂單",s).nodeId,"my-orders");assert.equal(text("訂單",s).nodeId,"orders");});
  await test("guided","16 fallback exposes root choices when configured",()=>{const r=text("synthetic unmatched question");assert.equal(r.category,"fallback");assert.equal(r.childIds.length,4);});
  await test("guided","17 pure navigation makes no AI/network lookup",()=>{for(const n of active.nodes)node(n.id);assert.equal(networkAttempts,0);});
  await test("postback","18 valid LINE Quick Reply message structure",()=>{for(const n of active.nodes){const r=node(n.id);for(const m of r.messages){assert.equal(m.type,"text");for(const item of m.quickReply?.items||[]){assert.equal(item.type,"action");assert.ok(item.action.label.length<=20);assert.ok(["uri","postback"].includes(item.action.type));}}}});
  await test("postback","19 child buttons contain canonical node IDs",()=>{for(const item of items(node("root"))){assert.equal(item.action.type,"postback");if(item.action.type==="postback"){const data=item.action.data;assert.ok(active.nodes.some(n=>data===supportPostback(n.id)));}}});
  await test("postback","20 postback navigation resolves same node and copy",()=>assert.deepEqual(post(supportPostback("referral-second")),node("referral-second")));
  await test("postback","21 malformed postbacks safely ignored",()=>{for(const data of ["","../root","kd-support:v3:node:root:-1","kd-support:v3:node:root:00","kd-support:v3:node:root:0&memberId=x","kd-support:v3:home:extra"])assert.equal(post(data).category,"noReply");});
  await test("postback","22 disabled-node postback cannot invoke answer",()=>assert.equal(post(supportPostback("hours")).category,"noReply"));
  await test("postback","23 unknown-node postback cannot invoke answer",()=>assert.equal(post(supportPostback("unknown")).category,"noReply"));
  await test("postback","24 postback contains navigation IDs only",()=>{for(const n of active.nodes)for(const item of items(node(n.id)))if(item.action.type==="postback"){assert.doesNotMatch(item.action.data,/memberId|orderId|token|U[a-f0-9]{32}/i);assert.ok(item.action.data.length<=300);}});
  await test("postback","25 overflow paginates without dropping any child",()=>{const s=clone(active),template=find("brand");for(let i=0;i<35;i++)s.nodes.push({...template,id:"page-"+i,parentId:"service",title:"Item "+i,order:100+i});validateSupportSettings(s);const all=new Set<string>();const first=node("service",s);assert.ok(first.pageCount>1);for(let page=0;page<first.pageCount;page++){const r=node("service",s,false,page);assert.ok(items(r).length<=13);for(const item of items(r))if(item.action.type==="postback"&&item.action.data.startsWith("kd-support:v3:node:page-"))all.add(item.action.data);}assert.equal(all.size,35);assert.equal(node("service",s,false,first.pageCount).category,"noReply");});
  await test("postback","26 text split and last-message Quick Reply respect limits",()=>{const s=clone(active);find("brand",s).promptText="😀".repeat(2000);find("brand",s).replyText="x".repeat(4500);const r=node("brand",s);assert.ok(r.messages.length>1&&r.messages.length<=5);assert.ok(r.messages.every(m=>m.text.length<=5000&&!/[\uD800-\uDBFF]$/.test(m.text)));assert.ok(!r.messages[0].quickReply&&r.messages.at(-1)?.quickReply);});
  for(const [target,children,uri] of [["root",13,false],["root",14,false],["service",11,false],["service",12,false],["service",10,true],["service",11,true]] as const){
    await test("postback","provider boundary: "+target+" / "+children+" children / URI "+uri,()=>{
      const s=clone(active),rootNode=clone(find("root")),menu=clone(find(target)),template=clone(find("brand"));
      menu.destination=uri?"/works":"";menu.linkLabel=uri?"Open":"";
      s.nodes=target==="root"?[menu]:[rootNode,menu];
      for(let i=0;i<children;i++)s.nodes.push({...template,id:"boundary-"+i,parentId:target,title:"Child "+i});
      validateSupportSettings(s);const limit=13-(target==="root"?0:2)-(uri?1:0),first=node(target,s);
      assert.equal(first.pageCount,children>limit?2:1);const shown=new Set<string>();
      for(let page=0;page<first.pageCount;page++)for(const item of items(node(target,s,false,page))){assert.ok(items(node(target,s,false,page)).length<=13);if(item.action.type==="postback"&&item.action.data.startsWith("kd-support:v3:node:boundary-"))shown.add(item.action.data);}
      assert.equal(shown.size,children);
    });
  }
  await test("presets","27 nonempty draft is master OFF and not persisted",async()=>{assert.equal(draft.enabled,false);assert.ok(draft.nodes.length>30);await assert.rejects(fs.stat(settingsFile()),{code:"ENOENT"});});
  await test("presets","28 initial category tree exists",()=>{for(const id of ["coffee","orders","members","service"])assert.equal(find(id).parentId,"root");});
  await test("presets","29 canonical copy and valid Owner overrides are used",async()=>{const source=await fs.readFile("lib/memberCenterCopyCatalog.ts","utf8");assert.ok(source.includes(find("second-calculation").replyText));const key=find("second-calculation").sourceMetadata.section;const s=buildSupportPresetDraft({[key]:"Synthetic Owner approved copy"});assert.equal(find("second-calculation",s).replyText,"Synthetic Owner approved copy");});
  await test("presets","30 no fabricated business percentages",()=>{for(const n of draft.nodes)assert.doesNotMatch(n.replyText,/\d+\s*%|百分之\d/);});
  await test("presets","31 no fabricated qualification thresholds",()=>{for(const id of ["second-qualification","second-pending","referral-qualification"])assert.doesNotMatch(find(id).replyText,/\d|門檻.*元|滿.*元/);});
  await test("presets","32 missing opening hours remain disabled",()=>{assert.equal(find("hours").enabled,false);assert.equal(find("hours").replyText,"");assert.equal(find("hours").sourceMetadata.needsOwner,true);});
  await test("presets","33 address comes from canonical Footer",async()=>assert.ok((await fs.readFile("components/layout/Footer.tsx","utf8")).includes(find("location").replyText)));
  await test("presets","34 bean menu is canonical link only",()=>{const r=node("monthly-menu");assert.equal(r.destination,"https://canonical.example.test/monthly-menu");assert.equal(find("monthly-menu").destination,"/monthly-menu");});
  await test("presets","35 LINE modules do not import/read product catalog",async()=>{for(const file of ["lib/lineSupportEngine.ts","lib/lineSupportPresets.ts","lib/lineSupportStore.ts","lib/lineAutoReplyWebhook.ts"]){assert.doesNotMatch(await fs.readFile(file,"utf8"),/from\s+["'][^"']*(productStore|products|catalog)|products\.json|readProducts|getProducts/);}});
  await test("presets","36 source metadata never enters delivery messages",()=>{const payload=JSON.stringify(node("monthly-menu").messages);assert.doesNotMatch(payload,/sourceMetadata|app\/monthly-menu|metadata\.description|needsOwner/);});
  const created=await provisionCanonicalMember({provider:"line",subject,persistMember:async(memberId)=>{
    await fs.mkdir(getMembersDir(),{recursive:true});await fs.writeFile(path.join(getMembersDir(),memberId+".json"),JSON.stringify({id:memberId,displayName:"SYNTHETIC PRIVATE NAME",email:"private@example.test",createdAt:new Date().toISOString()}));
  }});fixtureId=created.member.memberId;
  await test("member","37 signed LINE subject uses existing canonical member mapping read-only",async()=>{const before=await fs.readFile(getMemberIdentityRegistryFile());assert.equal((await resolveMemberByIdentity("line",subject))?.memberId,fixtureId);assert.equal(await isLinkedSupportMember(subject),true);assert.deepEqual(await fs.readFile(getMemberIdentityRegistryFile()),before);});
  await test("member","disabled canonical identity fails closed",async()=>{await setCanonicalMemberAccountStatus(fixtureId,"disabled");const before=await fs.readFile(getMemberIdentityRegistryFile());assert.equal(await isLinkedSupportMember(subject),false);assert.deepEqual(await fs.readFile(getMemberIdentityRegistryFile()),before);await setCanonicalMemberAccountStatus(fixtureId,"active");});
  await test("member","mismatched profile identity fails closed",async()=>{const file=path.join(getMembersDir(),fixtureId+".json"),before=await fs.readFile(file);await fs.writeFile(file,JSON.stringify({id:"synthetic-other-member"}));assert.equal(await isLinkedSupportMember(subject),false);await fs.writeFile(file,before);});
  await test("member","corrupt canonical index is read-only and fails closed",async()=>{const file=getMemberIdentityRegistryFile(),before=await fs.readFile(file);await fs.writeFile(file,"{bad");assert.equal(await isLinkedSupportMember(subject),false);assert.equal(await fs.readFile(file,"utf8"),"{bad");await fs.writeFile(file,before);});
  await test("member","38 unlinked subject reveals no member data",async()=>{assert.equal(await isLinkedSupportMember(unlinkedSubject),false);assert.doesNotMatch(JSON.stringify(node("my-orders")),/SYNTHETIC PRIVATE NAME|private@example|memberId|orderId/);});
  await test("member","39 unlinked gets existing login/account-link page",()=>{const r=node("my-orders");assert.equal(r.destination,"https://canonical.example.test/member");assert.equal(r.replyText,draft.unlinkedText);assert.match(r.replyText,/連結 LINE/);});
  await test("member","40 linked orders use guarded member orders section",()=>assert.equal(node("my-orders",active,true).destination,"https://canonical.example.test/member#orders"));
  await test("member","41 no authentication-bearing member ID URLs",()=>{for(const n of draft.nodes.filter(n=>n.type==="member_action"))assert.doesNotMatch(node(n.id,active,true).destination,/memberId|orderId|token|secret|\?/i);});
  await test("member","42 arbitrary customer order IDs never select orders",()=>{const r=text("orderId=synthetic-private-order memberId=other");assert.equal(r.category,"fallback");assert.equal(r.memberAction,"");});
  await test("member","43 points use canonical member section",()=>assert.equal(node("kd-points",active,true).destination,"https://canonical.example.test"+memberDestinations.viewKdPoints));
  await test("member","44 credits use canonical member section",()=>assert.equal(node("credits",active,true).destination,"https://canonical.example.test/member#rewards"));
  await test("member","45 referral uses canonical member section",()=>assert.equal(node("second-my-rewards",active,true).destination,"https://canonical.example.test/member#rewards"));
  await test("member","46 subscriptions use canonical member section",()=>assert.equal(node("subscription",active,true).destination,"https://canonical.example.test/member#subscription"));
  await test("member","47 simulator has no production member lookup capability",async()=>{const source=await fs.readFile("lib/lineSupportAdmin.ts","utf8");assert.doesNotMatch(source,/import.*lineSupportMember|resolveMemberByIdentity|readMember\(/);const before=await fs.readFile(getMemberIdentityRegistryFile());const response=await handleSupportAdmin(request({input:{mode:"node",nodeId:"my-orders"},settings:draft,memberState:"linked"}),"simulate",auth);assert.equal(response.status,200);assert.equal((await response.json()).result.linked,true);assert.deepEqual(await fs.readFile(getMemberIdentityRegistryFile()),before);});
  await test("member","48 no privacy values appear in webhook output or logs",async()=>{const original=console.log,logs:string[]=[];console.log=(...args:unknown[])=>logs.push(args.join(" "));try{const response=await handleCustomerLineWebhook(signed([event(supportPostback("my-orders"))]),{loadSettings:async()=>active,claim:async()=>true,fetcher:fakeFetch});assert.equal((await response.json()).sent,1);assert.doesNotMatch(JSON.stringify(calls)+logs.join(" "),new RegExp(fixtureId+"|"+subject+"|SYNTHETIC PRIVATE NAME|private@example"));}finally{console.log=original;}});
  await test("master","49 simulator works while master OFF",async()=>{const response=await handleSupportAdmin(request({input:{mode:"text",text:"第二代"},settings:draft,memberState:"unlinked"}),"simulate",auth);assert.equal((await response.json()).result.nodeId,"referral-second");});
  await test("master","50 simulator does not mutate master flag",async()=>{const before=JSON.stringify(draft);await handleSupportAdmin(request({input:{mode:"postback",data:supportPostback("root")},settings:draft,memberState:"unlinked"}),"simulate",auth);assert.equal(JSON.stringify(draft),before);});
  await test("master","51 simulator and GET never persist presets",async()=>{await handleSupportAdmin(new Request("https://canonical.example.test/api/admin/line-auto-reply"),"get",auth);await assert.rejects(fs.stat(settingsFile()),{code:"ENOENT"});});
  await test("master","52 disabled webhook sends zero replies",async()=>{const response=await handleCustomerLineWebhook(signed([event(supportPostback("my-orders"))]),{loadSettings:async()=>draft,claim:async()=>true,fetcher:fakeFetch});assert.equal((await response.json()).sent,0);});
  await test("master","53 disabled webhook makes zero claims/identity reads",async()=>{let claims=0,lookups=0;await handleCustomerLineWebhook(signed([event(supportPostback("my-orders"))]),{loadSettings:async()=>draft,claim:async()=>{claims++;return true;},linkedMember:async()=>{lookups++;return true;},fetcher:fakeFetch});assert.equal(claims,0);assert.equal(lookups,0);});
  await test("master","54 disabled webhook makes zero LINE API calls",async()=>{const before=calls.length;await handleCustomerLineWebhook(signed([event(supportPostback("root"))]),{loadSettings:async()=>draft,fetcher:fakeFetch});assert.equal(calls.length,before);});
  const invalidCases:Record<string,(s:SupportSettings)=>void>={
    "duplicate node ID":s=>s.nodes.push(clone(s.nodes[0])),
    "missing parent":s=>find("brand",s).parentId="absent",
    "self parent":s=>find("brand",s).parentId="brand",
    "tree cycle":s=>{find("coffee",s).parentId="roast-flavors";},
    "invalid order":s=>find("brand",s).order=-1,
    "fractional order":s=>find("brand",s).order=1.5,
    "invalid match mode":s=>{(find("brand",s) as unknown as {matchMode:string}).matchMode="regex";},
    "unsafe URL scheme":s=>find("brand",s).destination="javascript:alert(1)",
    "URL credentials":s=>{find("brand",s).destination="https://user:pass@example.test";find("brand",s).linkLabel="Open";},
    "private URL capability":s=>{find("brand",s).destination="/member?memberId=bad";find("brand",s).linkLabel="Open";},
    "private order route":s=>{find("brand",s).destination="/orders/synthetic";find("brand",s).linkLabel="Open";},
    "API destination":s=>{find("brand",s).destination="/api/auth/line/link";find("brand",s).linkLabel="Open";},
    "orphaned member action":s=>find("brand",s).memberAction="viewOrders",
    "unknown member action":s=>{(find("my-orders",s) as unknown as {memberAction:string}).memberAction="viewOtherMembers";},
    "arbitrary member destination":s=>find("my-orders",s).destination="/member?memberId=x",
    "empty enabled answer":s=>find("brand",s).replyText="",
    "empty enabled menu":s=>{s.nodes=s.nodes.filter(n=>n.parentId!=="coffee");find("coffee",s).replyText="";},
    "button without destination":s=>find("brand",s).linkLabel="Open",
    "missing URI label":s=>find("monthly-menu",s).linkLabel="",
    "oversized title":s=>find("brand",s).title="x".repeat(21),
    "oversized text":s=>find("brand",s).replyText="x".repeat(4501),
    "blank nav label":s=>s.navigation.backLabel="",
    "blank unlinked explanation":s=>s.unlinkedText="",
    "duplicate normalized aliases":s=>find("brand",s).keywords=["Ａ","a"],
    "blank keyword":s=>find("brand",s).keywords=[" "],
    "too many keywords":s=>find("brand",s).keywords=Array.from({length:31},(_,i)=>String(i)),
    "too many nodes":s=>{for(let i=0;i<251;i++)s.nodes.push({...find("brand",s),id:"over-"+i});},
    "excessive depth":s=>{for(let i=0;i<7;i++)s.nodes.push({...find("coffee",s),id:"deep-"+i,parentId:i?"deep-"+(i-1):"root",replyText:"Fixture"});},
    "bean destination divergence":s=>find("monthly-menu",s).destination="/works",
  };
  for(const [name,mutate] of Object.entries(invalidCases))await test("validation",name,()=>{const s=clone(draft);mutate(s);assert.throws(()=>validateSupportSettings(s));});
  await test("storage","LINE override leaves canonical namespaces unchanged",()=>{assert.equal(getLineAutoReplyDir(),path.join(temp,"line"));assert.equal(getOrdersDir(),path.join(temp,"canonical","orders"));assert.equal(getMembersDir(),path.join(temp,"canonical","members"));assert.ok(getStoreDir().startsWith(path.join(temp,"canonical")));});
  for(const bad of ["relative","/","C:\\","C:\\qa\\..\\private",path.join(temp,"line")+"\\..\\private"]){
    await test("storage","reject unsafe override "+JSON.stringify(bad),()=>{const previous=process.env.LINE_AUTO_REPLY_DATA_DIR;process.env.LINE_AUTO_REPLY_DATA_DIR=bad;try{assert.throws(getLineAutoReplyDir);}finally{process.env.LINE_AUTO_REPLY_DATA_DIR=previous;}});
  }
  await test("storage","production Railway persistence cannot be bypassed by override",()=>{const saved={...process.env};try{Object.assign(process.env,{NODE_ENV:"production"});process.env.RAILWAY_PROJECT_ID="synthetic";delete process.env.KD_DATA_DIR;assert.throws(getLineAutoReplyDir);process.env.KD_DATA_DIR=path.join(temp,"canonical");assert.throws(getLineAutoReplyDir);process.env.LINE_AUTO_REPLY_DATA_DIR=path.join(temp,"canonical","line");assert.equal(getLineAutoReplyDir(),path.join(temp,"canonical","line"));}finally{for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}});
  await test("storage","override absent preserves existing persistent LINE path",()=>{const prev=process.env.LINE_AUTO_REPLY_DATA_DIR;delete process.env.LINE_AUTO_REPLY_DATA_DIR;assert.equal(getLineAutoReplyDir(),path.join(temp,"canonical","line-auto-reply"));process.env.LINE_AUTO_REPLY_DATA_DIR=prev;});
  await test("security","postback signature verified before settings/identity/claims",async()=>{const response=await handleCustomerLineWebhook(signed([event(supportPostback("root"))],"unrelated-secret"),{loadSettings:async()=>assert.fail("unauthenticated read"),claim:async()=>assert.fail("unauthenticated claim"),linkedMember:async()=>assert.fail("unauthenticated identity")});assert.equal(response.status,401);});
  await test("security","signed postback sends real Quick Reply structure with customer token",async()=>{await handleCustomerLineWebhook(signed([event(supportPostback("referral-second"),"postback-delivery")]),{loadSettings:async()=>active,claim:async()=>true,fetcher:fakeFetch});const sent=calls.at(-1) as {messages:SupportResult["messages"]};assert.ok(sent.messages.at(-1)?.quickReply?.items.length);});
  await test("security","postback dedupe retains one claim and external attempt",async()=>{const before=calls.length;const dependencies={loadSettings:async()=>active,claim:claimLineEvent,fetcher:fakeFetch};await handleCustomerLineWebhook(signed([event(supportPostback("root"),"same-postback")]),dependencies);const response=await handleCustomerLineWebhook(signed([event(supportPostback("root"),"same-postback")]),dependencies);assert.equal((await response.json()).duplicates,1);assert.equal(calls.length,before+1);});
  await test("security","invalid commands make no claims or identity lookup",async()=>{await handleCustomerLineWebhook(signed([event("kd-support:v3:node:root:0&orderId=x")]),{loadSettings:async()=>active,claim:async()=>assert.fail("invalid claim"),linkedMember:async()=>assert.fail("invalid lookup"),fetcher:fakeFetch});});
  await test("security","group source cannot perform member identity resolution",async()=>{const e={...event(supportPostback("my-orders")),source:{type:"group",userId:subject}};await handleCustomerLineWebhook(signed([e]),{loadSettings:async()=>active,claim:async()=>true,linkedMember:async()=>assert.fail("group lookup"),fetcher:fakeFetch});assert.match(JSON.stringify(calls.at(-1)),/連結 LINE/);});
  await test("security","rejected reply has no automatic retry and retains claim",async()=>{let tries=0;const deps={loadSettings:async()=>active,claim:claimLineEvent,fetcher:(async()=>{tries++;return new Response("{}",{status:500});}) as typeof fetch};await handleCustomerLineWebhook(signed([event(supportPostback("root"),"no-retry")]),deps);await handleCustomerLineWebhook(signed([event(supportPostback("root"),"no-retry")]),deps);assert.equal(tries,1);});
  await test("security","Owner authorization and same-origin enforced on new Admin handler",async()=>{assert.equal((await handleSupportAdmin(request({}),"get",{authorized:async()=>false})).status,401);assert.equal((await handleSupportAdmin(request({},"https://evil.example"),"simulate",auth)).status,403);});
  await test("security","invalid simulation modes and identities fail closed",async()=>{for(const input of [{mode:"bad"},{mode:"node",nodeId:"../root"},{mode:"postback",data:"x".repeat(301)}])assert.equal((await handleSupportAdmin(request({input,settings:draft,memberState:"linked"}),"simulate",auth)).status,400);assert.equal((await handleSupportAdmin(request({input:{mode:"text",text:"help"},settings:draft,memberState:"production-member-id"}),"simulate",auth)).status,400);});
  await test("migration","AUTO.2 preserves compatible Owner text/keywords/fallback but master OFF",()=>{
    const old=defaultLineSettings();old.enabled=true;old.fallback={enabled:true,text:"Synthetic Owner fallback"};Object.assign(old.quickReplies.find(n=>n.id==="beanMenu")!,{enabled:true,replyText:"Synthetic Owner bean intro",keywords:["Owner menu"],buttonLabel:"Owner menu",destination:"/works"});
    const migrated=migrateSupportSettings(old);assert.equal(migrated.enabled,false);assert.equal(find("monthly-menu",migrated).replyText,"Synthetic Owner bean intro");assert.deepEqual(find("monthly-menu",migrated).keywords,["Owner menu"]);assert.equal(find("monthly-menu",migrated).destination,"/monthly-menu");assert.equal(migrated.fallback.text,old.fallback.text);
  });
  await test("migration","AUTO.1 ignores obsolete catalog selections and preserves copy",()=>{
    const epoch=draft.updatedAt,old={schemaVersion:1,revision:7,enabled:true,updatedAt:epoch,beanMenu:{enabled:true,title:"Owner bean title",intro:"Owner intro",helpText:"Owner help",footer:"Owner footer",matchMode:"exact",keywords:["豆單"],ctaLabel:"查看豆單",updatedAt:epoch,products:[{sku:"obsolete-private-sku",price:123}]},rules:[],fallback:{enabled:true,text:"Owner fallback"}};
    const migrated=migrateSupportSettings(old);assert.equal(migrated.enabled,false);assert.equal(migrated.revision,7);assert.match(find("monthly-menu",migrated).replyText,/Owner intro/);assert.doesNotMatch(JSON.stringify(migrated),/obsolete-private-sku|products|price/);
  });
  await test("migration","AUTO.2 custom rules preserve copy under generic tree",()=>{const old=defaultLineSettings();old.customRules=[{id:"owner-rule",name:"Owner question",replyText:"Owner custom answer",enabled:true,keywords:["owner question"],matchMode:"exact",order:0,buttonLabel:"",destination:"",createdAt:draft.updatedAt,updatedAt:draft.updatedAt}];const s=migrateSupportSettings(old);assert.equal(find("legacy-0",s).replyText,"Owner custom answer");assert.equal(text("owner question",{...s,enabled:true}).nodeId,"legacy-0");});
  await test("migration","migration read never auto-saves source",async()=>{await fs.mkdir(getLineAutoReplyDir(),{recursive:true});const original=JSON.stringify(defaultLineSettings());await fs.writeFile(settingsFile(),original);assert.equal((await readSupportSettings()).schemaVersion,3);assert.equal(await fs.readFile(settingsFile(),"utf8"),original);});
  await test("migration","AUTO.3 explicit save validates revision and persists only LINE namespace",async()=>{await fs.unlink(settingsFile());const saved=await saveSupportSettings(draft,0);assert.equal(saved.revision,1);assert.equal(saved.enabled,false);await assert.rejects(saveSupportSettings(draft,0),{status:409});assert.equal((await readSupportSettings()).revision,1);});
  await test("migration","AUTO.3 retains explicitly saved master state",async()=>{const current=await readSupportSettings();await saveSupportSettings({...current,enabled:true},current.revision);assert.equal((await readSupportSettings()).enabled,true);});
  await test("migration","malformed storage fails closed without overwrite",async()=>{await fs.writeFile(settingsFile(),"{bad");await assert.rejects(readSupportSettings());await assert.rejects(saveSupportSettings(draft,0));assert.equal(await fs.readFile(settingsFile(),"utf8"),"{bad");});
  await test("migration","missing webhook settings stay empty OFF with no preset delivery",()=>{const s=defaultSupportSettings();assert.equal(s.enabled,false);assert.equal(s.nodes.length,1);assert.equal(text("豆單",s).messages.length,0);});
  await test("security","zero real network attempts across all tests",()=>assert.equal(networkAttempts,0));
  console.log("LINE.AUTO.3 PASS: "+Object.entries(counts).map(([k,v])=>k+"="+v).join(", ")+", total="+Object.values(counts).reduce((a,b)=>a+b,0)+", failed=0, real-network-attempts="+networkAttempts);
}finally{
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep+"kd-line-auto-3-"));await fs.rm(temp,{recursive:true,force:true});
  for(const key of Object.keys(process.env))if(!(key in environment))delete process.env[key];Object.assign(process.env,environment);
}
