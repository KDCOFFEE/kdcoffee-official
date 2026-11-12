import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import React,{createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {LINE_CARD_CATALOG} from '../lib/lineNotificationCardCatalog';
import {supportsCardPresentation} from '../lib/lineCardDeliverySupport';
import {lineCardBulkPlan,parseBulkModeRequest,cardPresentationState,type BulkAudience} from '../lib/lineCardBulkMode';
import {readLineCardConfig,writeLineCardConfig,writeLineCardBulkConfig,LineCardConflictError,LineCardStorageError,getLineCardConfigFile} from '../lib/lineCardConfigStore';
import {EMPTY_LINE_CARD_CONFIG,LineCardValidationError,type LineCardConfigStore} from '../lib/lineCardConfiguration';
import {POST} from '../app/api/admin/notifications/line-cards/bulk/route';
import {GET} from '../app/api/admin/notifications/line-cards/route';
import {createAdminSessionValue,adminCookieName} from '../lib/adminAuth';
import Studio,{filterLineCards} from '../components/admin/LineNotificationCardStudio';
import Panel from '../components/admin/LineCardBulkModePanel';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'kd-line-bulk1-'));
process.env.KD_DATA_DIR=root;process.env.ADMIN_SESSION_SECRET='synthetic-bulk-owner-only-session-secret-2026';
for(const k of Object.keys(process.env))if(/^(RAILWAY_|LINE_|GOOGLE_|GMAIL_|RESEND_)/.test(k))delete process.env[k];
let checks=0,network=0;const priorFetch=globalThis.fetch;
globalThis.fetch=async()=>{network++;throw Error('Real network forbidden');};
const g=globalThis as typeof globalThis&{__returnCookies?:Record<string,string>;__bulkHooks?:{useState:(initial:unknown)=>[unknown,(v:unknown)=>void];useRef:(initial:unknown)=>unknown}};
const owner=()=>{g.__returnCookies={[adminCookieName]:createAdminSessionValue({role:'owner',adminId:'owner'})};};
const request=(body:unknown,headers:Record<string,string>={})=>new Request('http://localhost:3195/api/admin/notifications/line-cards/bulk',{method:'POST',headers:{Origin:'http://localhost:3195','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
async function test(name:string,run:()=>unknown|Promise<unknown>){await run();checks++;console.log('PASS '+name);}
const file=()=>getLineCardConfigFile();
const planRequest=(store:LineCardConfigStore,audience:BulkAudience='all',presentationMode:'text'|'flex'='flex')=>({action:'set-mode' as const,audience,presentationMode,expectedRevision:store.revision,eventKeys:lineCardBulkPlan(store,audience,presentationMode).changes.map(d=>d.eventKey)});
const supported=LINE_CARD_CATALOG.filter(d=>supportsCardPresentation(d.eventKey));
async function seed(name='case'){
 process.env.KD_DATA_DIR=path.join(root,name);const config:LineCardConfigStore={version:1,revision:3,events:{
  'customer.order.confirmed':{overrides:{displayName:'訂單已確認',title:'Owner 訂單標題',intro:'  已確認 {{orderNumber}}  ',secondaryText:'補充',ctaLabel:'Owner 按鈕',altText:'Owner alt',footerText:'頁尾',headerImageAssetId:'OWNER-SAVED-IMAGE'},updatedAt:'2026-11-01T00:00:00Z',updatedBy:'previous-owner'},
  'admin.order.inquiry_received':{overrides:{title:'Owner 詢問標題',headerAsset:'RETURN'},updatedAt:'2026-11-01T00:00:00Z',updatedBy:'previous-owner'},
  'customer.support.root':{overrides:{title:'Owner 客服標題'},updatedAt:'2026-11-01T00:00:00Z',updatedBy:'previous-owner'},
 }};await fs.mkdir(path.dirname(file()),{recursive:true});await fs.writeFile(file(),JSON.stringify(config,null,1));return config;
}
type Element=React.ReactElement<Record<string,any>>;
function elements(value:unknown):Element[]{if(Array.isArray(value))return value.flatMap(elements);if(!React.isValidElement(value))return [];const e=value as Element;return [e,...elements(e.props.children)];}
function button(tree:unknown,text:string){const e=elements(tree).find(e=>e.type==='button'&&JSON.stringify(e.props.children).includes(text));assert.ok(e,'button '+text);return e;}
function hookPanel(props:Parameters<typeof Panel>[0]){
 let cursor=0;const slots:unknown[]=[];
 const hooks={useState(initial:unknown):[unknown,(v:unknown)=>void]{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?(v as (x:unknown)=>unknown)(slots[i]):v;}];},useRef(initial:unknown){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];}};
 return ()=>{cursor=0;g.__bulkHooks=hooks;try{return Panel(props);}finally{delete g.__bulkHooks;}};
}
try{
 await test('legacy absent file reads without initializing metadata or configuration',async()=>{assert.deepEqual(await readLineCardConfig(),EMPTY_LINE_CARD_CONFIG);await assert.rejects(fs.access(file()));const r=await writeLineCardBulkConfig(planRequest(EMPTY_LINE_CARD_CONFIG,'all','text'),{actor:'owner'});assert.equal(r.config.revision,0);await assert.rejects(fs.access(file()));});
 for(const audience of ['all','customer','admin'] as const)await test(audience+' scope changes exact supported set; other overrides and recipients untouched',async()=>{
  const before=await seed(audience),r=await writeLineCardBulkConfig(planRequest(before,audience),{actor:'owner'});assert.equal(r.config.revision,4);
  const expected=supported.filter(d=>audience==='all'||d.recipient===audience).map(d=>d.eventKey).sort();assert.deepEqual(r.changedEventKeys,expected);
  for(const def of LINE_CARD_CATALOG){const old=before.events[def.eventKey],current=r.config.events[def.eventKey];if(expected.includes(def.eventKey)){assert.equal(current.overrides.presentationMode,'flex');const {presentationMode,...rest}=current.overrides;assert.deepEqual(rest,old?.overrides??{});}else assert.deepEqual(current,old);}
  assert.equal((await readLineCardConfig()).revision,4);assert.deepEqual((await GET()).status,401);
 });
 await test('all unconnected and Quick Reply cards excluded; preview alone is not support',()=>{const p=lineCardBulkPlan(EMPTY_LINE_CARD_CONFIG,'all','flex');assert.equal(p.supported.length,supported.length);assert.ok(p.unsupported.some(d=>d.eventKey==='admin.order.created'));assert.ok(p.unsupported.some(d=>d.eventKey.startsWith('customer.support.')));});
 await test('explicit exceptions persist across reload; existing individual overrides are NOT auto-exceptions',async()=>{
  const before=await seed('exceptions');assert.equal(lineCardBulkPlan(before,'all','flex').exceptions.length,0);
  const event='customer.order.confirmed';const r=await writeLineCardBulkConfig({action:'set-exclusions',excludedEventKeys:[event],expectedRevision:3},{actor:'owner'});assert.deepEqual(r.config.events,before.events);assert.deepEqual((await readLineCardConfig()).bulkExcludedEventKeys,[event]);
  const mode=await writeLineCardBulkConfig(planRequest(r.config),{actor:'owner'});assert.deepEqual(mode.config.events[event],before.events[event]);assert.ok(!mode.changedEventKeys.includes(event));
  await writeLineCardConfig({eventKey:'customer.order.completed',action:'save',expectedRevision:5,actor:'owner',overrides:{title:'單張仍可修改',presentationMode:'flex'}});assert.deepEqual((await readLineCardConfig()).bulkExcludedEventKeys,[event]);
 });
 await test('explicit defaults, whitespace, custom image and ALL copy values survive batch raw',async()=>{
  const before=await seed('raw');const read=await readLineCardConfig();assert.deepEqual(read,before);
  const result=await writeLineCardBulkConfig(planRequest(read),{actor:'owner'});const old=before.events['customer.order.confirmed'].overrides;const current=result.config.events['customer.order.confirmed'].overrides;for(const key of Object.keys(old) as Array<keyof typeof old>)assert.deepEqual(current[key],old[key]);
  const text=await writeLineCardBulkConfig(planRequest(result.config,'all','text'),{actor:'owner'});assert.deepEqual(text.config.events['customer.order.confirmed'].overrides,old);
 });
 await test('one lock-protected read, one atomic rename, one revision for a whole batch',async()=>{
  const before=await seed('atomic-count');let renames=0,reads=0;const target=file(),rename=fs.rename,read=fs.readFile;
  fs.rename=(async(a,b)=>{if(String(b)===target)renames++;return rename(a,b);}) as typeof fs.rename;
  fs.readFile=(async(...args:Parameters<typeof fs.readFile>)=>{if(String(args[0])===target)reads++;return read(...args);}) as typeof fs.readFile;
  try{const r=await writeLineCardBulkConfig(planRequest(before),{actor:'owner'});assert.equal(r.config.revision,4);assert.equal(renames,1);assert.equal(reads,1);}finally{fs.rename=rename;fs.readFile=read;}
 });
 await test('stale revision rejected before overwrite; concurrent saves have one winner',async()=>{
  const before=await seed('conflict');const request=planRequest(before);const results=await Promise.allSettled([writeLineCardBulkConfig(request,{actor:'owner'}),writeLineCardBulkConfig(request,{actor:'owner'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason instanceof LineCardConflictError).length,1);const saved=await fs.readFile(file());await assert.rejects(writeLineCardBulkConfig(request,{actor:'owner'}),LineCardConflictError);assert.deepEqual(await fs.readFile(file()),saved);
 });
 await test('one render-invalid card rejects all changes with original bytes intact',async()=>{
  const before=await seed('invalid-card');before.events['customer.return.refund_completed']={overrides:{intro:'{{completedAt}}'.repeat(13)},updatedAt:'2026-11-01T00:00:00Z',updatedBy:'owner'};await fs.writeFile(file(),JSON.stringify(before));const bytes=await fs.readFile(file());await assert.rejects(writeLineCardBulkConfig(planRequest(before),{actor:'owner'}),LineCardValidationError);assert.deepEqual(await fs.readFile(file()),bytes);
 });
 await test('atomic filesystem failure never partially changes configuration',async()=>{
  const before=await seed('disk-failure'),bytes=await fs.readFile(file()),target=file(),rename=fs.rename;
  fs.rename=(async(a,b)=>{if(String(b)===target)throw Object.assign(Error('synthetic rename failure'),{code:'EACCES'});return rename(a,b);}) as typeof fs.rename;
  try{await assert.rejects(writeLineCardBulkConfig(planRequest(before),{actor:'owner'}));assert.deepEqual(await fs.readFile(file()),bytes);}finally{fs.rename=rename;}
 });
 await test('malformed legacy configuration is never silently initialized or replaced',async()=>{await seed('bad-config');await fs.writeFile(file(),'{broken');await assert.rejects(readLineCardConfig(),LineCardStorageError);await assert.rejects(writeLineCardBulkConfig(planRequest({...EMPTY_LINE_CARD_CONFIG,revision:3}),{actor:'owner'}));assert.equal(await fs.readFile(file(),'utf8'),'{broken');});
 await test('unsupported, unknown, duplicate, extra field and restore operations rejected',()=>{
  const base=planRequest(EMPTY_LINE_CARD_CONFIG);for(const b of [{...base,eventKeys:['customer.support.root']},{...base,eventKeys:['unknown']},{...base,eventKeys:[base.eventKeys[0],base.eventKeys[0]]},{...base,title:'forged'},{...base,action:'restore'},{...base,actor:'other-owner'},{...base,presentationMode:'html'},{...base,expectedRevision:'0'},{...base,audience:{toString:()=> 'all'}}])assert.throws(()=>parseBulkModeRequest(b),LineCardValidationError);
 });
 await test('tampered selection cannot modify another audience or an excluded event',async()=>{const before=await seed('selection');const bytes=await fs.readFile(file());await assert.rejects(writeLineCardBulkConfig({...planRequest(before,'customer'),eventKeys:planRequest(before).eventKeys},{actor:'owner'}),LineCardValidationError);assert.deepEqual(await fs.readFile(file()),bytes);});
 await test('Owner-only, legacy session, same-origin, CSRF and JSON/body guards',async()=>{
  const legacy=Buffer.from(JSON.stringify({role:'admin',expiresAt:Date.now()+60000})).toString('base64url');
  g.__returnCookies={[adminCookieName]:legacy+'.'+createHmac('sha256',process.env.ADMIN_SESSION_SECRET!).update(legacy).digest('base64url')};
  assert.equal((await POST(request({}))).status,403);
  const before=await seed('api-guards'),body=planRequest(before),bytes=await fs.readFile(file());g.__returnCookies={};assert.equal((await POST(request(body))).status,401);g.__returnCookies={[adminCookieName]:createAdminSessionValue({role:'admin',adminId:'staff'})};assert.equal((await POST(request(body))).status,403);owner();assert.equal((await POST(request(body,{Origin:'https://evil.test'}))).status,403);assert.equal((await POST(request(body,{'sec-fetch-site':'cross-site'}))).status,403);assert.equal((await POST(request(body,{'Content-Type':'text/plain'}))).status,415);assert.equal((await POST(request({padding:'x'.repeat(17000)}))).status,413);assert.equal((await POST(new Request('http://localhost:3195/api/admin/notifications/line-cards/bulk',{method:'POST',headers:{Origin:'http://localhost:3195','Content-Type':'application/json'},body:'{broken'}))).status,400);assert.equal((await POST(request({...body,overrides:{title:'forged'}}))).status,400);assert.deepEqual(await fs.readFile(file()),bytes);
 });
 await test('actual API saves one whole batch, refresh reads same result, stale request returns 409',async()=>{
  const before=await seed('api-save');owner();const body=planRequest(before);const response=await POST(request(body));assert.equal(response.status,200);const result=await response.json();assert.equal(result.config.revision,4);assert.equal(result.changedEventKeys.length,supported.length);assert.deepEqual(await (await GET()).json(),result.config);const bytes=await fs.readFile(file());assert.equal((await POST(request(body))).status,409);assert.deepEqual(await fs.readFile(file()),bytes);
 });
 await test('list filters and status/custom-content badges match real support',async()=>{
  const store=await seed('ui');store.events['customer.order.confirmed'].overrides.presentationMode='flex';assert.equal(filterLineCards('customer','','',store,'flex').length,1);assert.ok(filterLineCards('customer','','',store,'unsupported').every(d=>!supportsCardPresentation(d.eventKey)));assert.ok(filterLineCards('admin','','',store,'text').every(d=>supportsCardPresentation(d.eventKey)));const html=renderToStaticMarkup(createElement(Studio as React.ComponentType<NonNullable<Parameters<typeof Studio>[0]>>,{initialConfig:store}));for(const label of ['LINE 顯示方式批次管理','不參與批次變更','有自訂內容','目前 Flex','目前文字','不支援 Flex'])assert.ok(html.includes(label));assert.ok(!html.includes('目前卡片設定尚未套用至正式 LINE 通知'));assert.equal(cardPresentationState('customer.support.root',store),'unsupported');
 });
 await test('UI requires explicit review, shows excluded lists, and suppresses duplicate clicks',async()=>{
  const store=await seed('ui-confirm');let calls=0,saved:LineCardConfigStore|undefined;let resolve:(r:Response)=>void=()=>{};
  const render=hookPanel({store,excludedDraft:[],onSaved:r=>{saved=r;},onBusyChange:()=>{}});let tree=render();assert.ok(!elements(tree).some(e=>e.type==='button'&&JSON.stringify(e.props.children).includes('確認套用這')));button(tree,'檢視變更清單').props.onClick();tree=render();const confirm=button(tree,'確認套用這');
  globalThis.fetch=async(url,init)=>{assert.equal(String(url),'/api/admin/notifications/line-cards/bulk');calls++;assert.deepEqual(JSON.parse(String(init?.body)),planRequest(store));return new Promise<Response>(r=>{resolve=r;});};
  const a=confirm.props.onClick(),b=confirm.props.onClick();assert.equal(calls,1);resolve(Response.json({config:{...store,revision:4},changedEventKeys:planRequest(store).eventKeys}));await Promise.all([a,b]);assert.equal(saved?.revision,4);assert.ok(elements(render()).some(e=>e.props.role==='status'&&JSON.stringify(e.props.children).includes('已完整套用')));
 });
 await test('UI dirty exceptions block mode preview and can persist separately',async()=>{
  const store=await seed('ui-exceptions');let calls=0;const render=hookPanel({store,excludedDraft:['customer.order.confirmed'],onSaved:()=>{},onBusyChange:()=>{}});const tree=render();assert.equal(button(tree,'檢視變更清單').props.disabled,true);globalThis.fetch=async(_url,init)=>{calls++;assert.equal(JSON.parse(String(init?.body)).action,'set-exclusions');return Response.json({config:{...store,revision:4,bulkExcludedEventKeys:['customer.order.confirmed']},changedEventKeys:[]});};await button(tree,'儲存例外清單').props.onClick();assert.equal(calls,1);
 });
 await test('UI 409/failure is explicit, never reports partial success or auto-retries',async()=>{
  const store=await seed('ui-conflict');let calls=0;const render=hookPanel({store,excludedDraft:[],onSaved:()=>{throw Error('must not save');},onBusyChange:()=>{}});button(render(),'檢視變更清單').props.onClick();globalThis.fetch=async()=>{calls++;return Response.json({error:'設定已更新，請重新整理'},{status:409});};await button(render(),'確認套用這').props.onClick();const tree=render();assert.equal(calls,1);assert.ok(elements(tree).some(e=>e.props.role==='alert'));assert.ok(!elements(tree).some(e=>e.type==='button'&&JSON.stringify(e.props.children).includes('確認套用這')));
 });
 await test('no real network request was attempted',()=>assert.equal(network,0));
 console.log('LINE.NOTIFY.BULK.MODE.1 '+checks+' checks PASS; synthetic only; no LINE sends.');
}finally{globalThis.fetch=priorFetch;delete g.__bulkHooks;g.__returnCookies={};assert.ok(root.startsWith(path.join(os.tmpdir(),'kd-line-bulk1-')));await fs.rm(root,{recursive:true,force:true});}
