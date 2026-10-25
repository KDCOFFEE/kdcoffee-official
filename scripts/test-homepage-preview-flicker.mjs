// Local production-build browser regression; instrumentation lives only in this test.
// Set HOMEPAGE_STUDIO_QA_DIR, HOMEPAGE_STUDIO_PLAYWRIGHT (module/file URL),
// and optionally HOMEPAGE_STUDIO_BROWSER. The QA runtime.json supplies TEMP data/port.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const qa=process.env.HOMEPAGE_STUDIO_QA_DIR;
assert.ok(qa,'An external local QA directory is required');
const runtime=JSON.parse(await fs.readFile(path.join(qa,'runtime.json'),'utf8'));
const origin='http://127.0.0.1:'+runtime.port;
assert.ok([ 'localhost','127.0.0.1' ].includes(new URL(origin).hostname));
const {chromium}=await import(process.env.HOMEPAGE_STUDIO_PLAYWRIGHT||'playwright');
const original=await fs.readFile(path.join(runtime.root,'store/homepage.json'),'utf8');
const session=JSON.parse(await fs.readFile(path.join(runtime.root,'browser-session.json'),'utf8'));
const browser=await chromium.launch({headless:true,...(process.env.HOMEPAGE_STUDIO_BROWSER?{executablePath:process.env.HOMEPAGE_STUDIO_BROWSER}:{})});
const context=await browser.newContext({viewport:{width:1600,height:1050}});
await context.addCookies([{name:'kd_admin_session',value:session.cookie,url:origin}]);
await context.addInitScript(()=>{
 const probe=window.__homepagePreviewProbe={homepageMounts:0,previewMounts:0,homepageSnapshots:0,messages:[],scrollCalls:0,monitor:false,hiddenSamples:0,sampledFrames:0};
 const seen=new WeakSet(),snapshots=new WeakSet();let nextRenderer=1;
 window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(renderer){const id=nextRenderer++;this.renderers.set(id,renderer);return id;},onCommitFiberRoot(_id,root){
  function walk(fiber){if(!fiber)return;const props=fiber.memoizedProps;
   // MonthlyCampaign also receives homepageData, plus its own order prop.
   const homepage=props?.homepageData?.hero&&Array.isArray(props.homepageData.campaigns)&&!('order' in props);
   const preview=props?.initial?.hero&&Array.isArray(props.initial.campaigns)&&'footer' in props;
   if((homepage||preview)&&typeof fiber.type==='function'){
    if(!seen.has(fiber)&&!seen.has(fiber.alternate)){if(homepage)probe.homepageMounts++;if(preview)probe.previewMounts++;}
    seen.add(fiber);if(fiber.alternate)seen.add(fiber.alternate);
    if(homepage&&!snapshots.has(props.homepageData)){snapshots.add(props.homepageData);probe.homepageSnapshots++;}
   }walk(fiber.child);walk(fiber.sibling);
  }walk(root.current);
 },onCommitFiberUnmount(){},checkDCE(){}};
 const scroll=window.scrollTo;window.scrollTo=function(...args){probe.scrollCalls++;return Reflect.apply(scroll,this,args);};
 window.addEventListener('message',event=>{if(event.source!==window.parent||event.origin!==location.origin)return;
  if(event.data?.type?.startsWith('kd-homepage-'))probe.messages.push({type:event.data.type,area:event.data.area,hasHomepage:'homepage' in event.data});
  if(event.data?.type==='kd-homepage-draft')probe.latestHomepage=event.data.homepage;
 });
 function sample(){if(probe.monitor){probe.sampledFrames++;
  const targets=document.querySelectorAll('#top h1 span,[data-home-motion-part],[data-home-motion-item],[data-home-reveal="editorial"],[data-home-reveal="editorial-detail"]');
  for(const node of targets){const rect=node.getBoundingClientRect();if(rect.width<=0||rect.height<=0||rect.bottom<=96||rect.top>=innerHeight||rect.right<=0||rect.left>=innerWidth)continue;
   let opacity=1,visible=true;for(let el=node;el;el=el.parentElement){const style=getComputedStyle(el);opacity*=Number(style.opacity);if(style.visibility==='hidden'||style.display==='none')visible=false;}
   if(!visible||opacity<.01){probe.hiddenSamples++;break;}
  }
 }requestAnimationFrame(sample);}requestAnimationFrame(sample);
});
const page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[],checks=[];let loads=0,puts=0,frame;
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(request.isNavigationRequest()&&new URL(request.url()).pathname==='/admin/homepage/preview')loads++;if(request.method()==='PUT'&&new URL(request.url()).pathname==='/api/admin/homepage')puts++;});
const poll=async(run,expected)=>{const until=Date.now()+20000;let value;do{value=await run();if(value===expected)return;await new Promise(resolve=>setTimeout(resolve,50));}while(Date.now()<until);assert.equal(value,expected);};
const test=async(label,run)=>{await run();checks.push(label);console.log('PASS '+checks.length+' '+label);};
const probe=()=>frame.evaluate(()=>{const {latestHomepage,...rest}=window.__homepagePreviewProbe;return rest;});
const settle=()=>frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const nav=name=>page.getByRole('navigation',{name:'首頁編輯區域'}).getByRole('button',{name:new RegExp(name)});
const device=mode=>page.getByRole('button',{name:mode==='mobile'?'Mobile 手機':'Desktop 桌機',exact:true}).click();
const slot=()=>page.locator('details.cms-item-card').filter({has:page.locator('summary > strong').filter({hasText:/^主標題$/})}).first();
const openTitle=async()=>{if(!await slot().evaluate(el=>el.open))await slot().locator('summary').first().click();};
const style=(selector,name)=>frame.locator(selector).first().evaluate((el,key)=>getComputedStyle(el).getPropertyValue(key),name);
const setRange=async(value)=>page.getByLabel(/^時間（ms）/).evaluate((el,next)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(next));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);
const stable=async()=>{const state=await probe();assert.equal(loads,1);assert.equal(state.previewMounts,1);assert.equal(state.homepageMounts,1);};
let result;
try{
 await page.goto(origin+'/admin/homepage',{waitUntil:'networkidle',timeout:60000});
 await page.getByText('正在載入真實首頁預覽…',{exact:true}).waitFor({state:'hidden'});
 frame=page.frames().find(item=>new URL(item.url()).pathname==='/admin/homepage/preview');assert.ok(frame);
 await poll(async()=>(await probe()).homepageMounts>=1,true);
 if(process.env.HOMEPAGE_PREVIEW_OBSERVE_BASELINE==='1'){
  const initial=await probe();await nav('品牌價值').click();await settle();const afterFocus=await probe();
  await page.getByRole('button',{name:'字體・留白・動畫',exact:true}).click();
  await setRange(1200);await poll(()=>style('#home002','--home-motion-duration'),'1200ms');
  const afterAnimation=await probe();result={mode:'baseline observation',loads,initial,afterFocus,afterAnimation};
  console.log(JSON.stringify({baselineFocusDrafts:afterFocus.messages.filter(x=>x.type==='kd-homepage-draft').length-initial.messages.filter(x=>x.type==='kd-homepage-draft').length,baselineFocusSnapshotUpdates:afterFocus.homepageSnapshots-initial.homepageSnapshots,baselineAnimationRemounts:afterAnimation.homepageMounts-afterFocus.homepageMounts,loads}));
 }else{
 await test('Initial iframe and both preview components mount once',stable);
 await frame.evaluate(()=>{window.__homepagePreviewProbe.monitor=true;window.__previewHero=document.getElementById('top');window.__previewMedia=document.querySelector('#top .v3-hero-video');});
 await test('Area navigation sends focus only and scrolls without replacing Homepage state',async()=>{
  const before=await probe();await nav('品牌價值').click();await poll(()=>frame.locator('#home002').getAttribute('data-homepage-studio-focus'),'true');await settle();
  const after=await probe(),messages=after.messages.slice(before.messages.length);assert.ok(messages.some(item=>item.type==='kd-homepage-focus'&&item.area==='home002'&&!item.hasHomepage));assert.ok(messages.every(item=>item.type!=='kd-homepage-draft'));assert.equal(after.homepageSnapshots,before.homepageSnapshots);assert.equal(after.scrollCalls,before.scrollCalls+1);await stable();
 });
 await test('Rapid navigation between five areas sends no duplicate draft or full remount',async()=>{
  const before=await probe();for(const area of ['主視覺','本月活動','品牌價值','咖啡時刻','咖啡製程','品牌價值'])await nav(area).click();await settle();
  const after=await probe();assert.equal(after.homepageSnapshots,before.homepageSnapshots);assert.equal(after.messages.filter(item=>item.type==='kd-homepage-draft').length,before.messages.filter(item=>item.type==='kd-homepage-draft').length);await stable();
 });
 await test('Semantically identical reordered draft is suppressed before Homepage state update',async()=>{
  const before=await probe();await page.evaluate(()=>{const child=document.querySelector('iframe[title="首頁未儲存即時預覽"]').contentWindow;const old=child.__homepagePreviewProbe.latestHomepage;child.postMessage({type:'kd-homepage-draft',homepage:Object.fromEntries(Object.entries(old).reverse())},location.origin);});await settle();assert.equal((await probe()).homepageSnapshots,before.homepageSnapshots);await stable();
 });
 await test('Character-by-character text edits update unsaved preview without scrolling or remounting',async()=>{
  await nav('主視覺').click();const before=await probe();await page.getByLabel('標題第一行',{exact:true}).fill('');await page.getByLabel('標題第一行',{exact:true}).pressSequentially('HOTFIX LIVE PREVIEW',{delay:12});await poll(()=>frame.locator('#top h1').innerText().then(text=>text.includes('HOTFIX LIVE PREVIEW')),true);assert.equal((await probe()).scrollCalls,before.scrollCalls);assert.equal(await frame.evaluate(()=>window.__previewHero===document.getElementById('top')),true);await stable();
 });
 await test('Repeated typography changes update the same mounted real Homepage',async()=>{
  await nav('品牌價值').click();await page.getByRole('button',{name:'字體・留白・動畫',exact:true}).click();await openTitle();
  const before=await probe();for(const value of [45,46,47,48,49,50])await slot().getByLabel('字級（px）',{exact:true}).fill(String(value));await poll(()=>style('#home002 h2','font-size'),'50px');assert.equal((await probe()).scrollCalls,before.scrollCalls);await stable();
 });
 await test('Repeated spacing changes update preview without focus scrolling or remount',async()=>{
  await page.getByText('版面與留白',{exact:true}).click();const before=await probe();for(const value of [60,70,80])await page.getByLabel('上方留白（px）',{exact:true}).fill(String(value));await poll(()=>style('#home002','padding-top'),'80px');assert.equal((await probe()).scrollCalls,before.scrollCalls);await stable();
 });
 await test('Desktop/Mobile resize keeps iframe src, document and media alive',async()=>{
  await device('mobile');assert.equal(await frame.evaluate(()=>innerWidth),390);await device('desktop');assert.equal(await frame.evaluate(()=>innerWidth),1280);assert.equal(await page.locator('iframe[title="首頁未儲存即時預覽"]').getAttribute('src'),'/admin/homepage/preview');assert.equal(await frame.evaluate(()=>window.__previewHero===document.getElementById('top')&&window.__previewMedia===document.querySelector('#top .v3-hero-video')),true);await stable();
 });
 await test('Mobile sparse override remains independent and reset follows latest Desktop',async()=>{
  await device('mobile');await openTitle();await slot().getByLabel('字級（px）',{exact:true}).fill('30');await poll(()=>style('#home002 h2','font-size'),'30px');await device('desktop');await openTitle();await slot().getByLabel('字級（px）',{exact:true}).fill('52');await device('mobile');await poll(()=>style('#home002 h2','font-size'),'30px');await openTitle();await slot().getByRole('button',{name:'恢復與桌機同步',exact:true}).first().click();await poll(()=>style('#home002 h2','font-size'),'52px');await stable();
 });
 await test('Animation slider edits apply configuration without a global replay',async()=>{
  await device('desktop');const before=await probe();for(const value of [1000,1100,1200,1300,1400])await setRange(value);await poll(()=>style('#home002','--home-motion-duration'),'1400ms');await page.getByLabel(/^進場方式/).selectOption('slide-left');await poll(()=>frame.locator('#home002').getAttribute('data-home-motion'),'slide-left');await page.getByLabel(/^啟用動畫/).uncheck();await poll(()=>frame.locator('#home002').getAttribute('data-home-motion'),'none');await page.getByLabel(/^啟用動畫/).check();await poll(()=>frame.locator('#home002').getAttribute('data-home-motion'),'slide-left');assert.equal((await probe()).scrollCalls,before.scrollCalls);assert.equal(await frame.locator('main[data-homepage-preview]').getAttribute('data-homepage-preview'),'stable');await stable();
 });
 await test('Normal interaction has no sampled invisible entrance content or autosave',async()=>{await settle();const state=await probe();assert.ok(state.sampledFrames>0);assert.equal(state.hiddenSamples,0);assert.equal(puts,0);assert.equal(await fs.readFile(path.join(runtime.root,'store/homepage.json'),'utf8'),original);});
 await test('Explicit Replay alone intentionally remounts Homepage and shows real animations',async()=>{
  await nav('咖啡時刻').click();await nav('品牌價值').click();await frame.evaluate(()=>{window.__homepagePreviewProbe.monitor=false;});await page.getByRole('button',{name:'重播動畫',exact:true}).click();await poll(async()=>(await probe()).homepageMounts,2);assert.equal((await probe()).previewMounts,1);assert.equal(loads,1);assert.equal(await frame.locator('main[data-homepage-preview]').getAttribute('data-homepage-preview'),'replay');await poll(()=>frame.locator('#home002').getAttribute('data-home-motion-state'),'entered');await poll(()=>style('#home002 .v3-why-heading','opacity'),'1');assert.notEqual(await style('#home002 .v3-why-heading','transition-duration'),'0s');
 });
 await test('Ordinary editing after Replay returns to stable visible mode without another remount',async()=>{
  await openTitle();await slot().getByLabel('字級（px）',{exact:true}).fill('54');await poll(()=>style('#home002 h2','font-size'),'54px');assert.equal(await frame.locator('main[data-homepage-preview]').getAttribute('data-homepage-preview'),'stable');assert.equal((await probe()).homepageMounts,2);assert.equal(loads,1);
 });
 await test('Save shortcut still writes only canonical TEMP data and clears dirty state',async()=>{await page.keyboard.press('Control+s');await page.getByText('✓ 已儲存',{exact:false}).waitFor();assert.equal(puts,1);assert.ok(JSON.parse(await fs.readFile(path.join(runtime.root,'store/homepage.json'),'utf8')).version>JSON.parse(original).version);});
 await test('Foreign message source cannot replace preview data',async()=>{
  await settle();const before=await probe();await frame.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data:{type:'kd-homepage-draft',homepage:{hero:{},campaigns:[]}}})));await settle();assert.equal((await probe()).homepageSnapshots,before.homepageSnapshots);
 });
 await test('Reduced-motion Replay completes visibly and runtime has no errors',async()=>{await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'重播動畫',exact:true}).click();await poll(async()=>(await probe()).homepageMounts,3);await poll(()=>style('#home002 h2','opacity'),'1');assert.deepEqual(errors,[]);assert.equal(loads,1);});
 await test('Public Homepage retains its own entrance lifecycle without Admin preview overrides',async()=>{
  const publicPage=await context.newPage();publicPage.on('pageerror',error=>errors.push(error.message));await publicPage.goto(origin+'/',{waitUntil:'networkidle'});
  assert.equal(await publicPage.locator('[data-homepage-preview]').count(),0);
  await poll(()=>publicPage.evaluate(()=>document.documentElement.classList.contains('is-home-motion-ready')),true);
  const animation=await publicPage.locator('.v3-hero-video').first().evaluate(el=>({name:getComputedStyle(el).animationName,state:getComputedStyle(el).animationPlayState,delay:getComputedStyle(el).animationDelay}));
  assert.ok(animation.name.includes('home-hero-media-emerge'));assert.notEqual(animation.state,'paused');assert.ok(!animation.delay.includes('-999'));
  await publicPage.setViewportSize({width:390,height:900});assert.equal(await publicPage.locator('#top').isVisible(),true);assert.equal(await publicPage.locator('[data-homepage-preview]').count(),0);assert.deepEqual(errors,[]);await publicPage.close();
 });
 await page.screenshot({path:path.join(qa,'hotfix-owner-qa-desktop.png')});await device('mobile');await nav('咖啡時刻').click();await nav('品牌價值').click();await page.screenshot({path:path.join(qa,'hotfix-owner-qa-mobile.png')});
 const finalProbe=await probe(),intentionalReplays=finalProbe.messages.filter(message=>message.type==='kd-homepage-replay').length;
 assert.equal(finalProbe.homepageMounts-1-intentionalReplays,0);assert.equal(loads,1);
 result={mode:'hotfix acceptance',passed:checks.length,checks,iframeInitialLoads:Math.min(loads,1),additionalIframeLoads:loads-1,homepageDraftPreviewMounts:finalProbe.previewMounts,unintendedHomepageV3Remounts:finalProbe.homepageMounts-1-intentionalReplays,intentionalReplayRemounts:intentionalReplays,probe:finalProbe,errors,puts};
 console.log('Homepage preview flicker: '+checks.length+' checks PASS.');
 }
}finally{
 await fs.writeFile(path.join(runtime.root,'store/homepage.json'),original);
 await fs.writeFile(path.join(qa,process.env.HOMEPAGE_PREVIEW_OBSERVE_BASELINE==='1'?'baseline-observation.json':'flicker-results.json'),JSON.stringify(result||{passed:checks.length,checks,loads,errors,probe:frame?await probe().catch(()=>null):null},null,2));
 await browser.close();
}
