// Real Chrome page zoom, not pinch zoom or deviceScaleFactor emulation.
// Requires the isolated QA runtime/cookie and the same Playwright/browser env as the flicker gate.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const qa=process.env.HOMEPAGE_STUDIO_QA_DIR;assert.ok(qa,'External QA directory required');
const runtime=JSON.parse(await fs.readFile(path.join(qa,'runtime.json'),'utf8')),origin='http://127.0.0.1:'+runtime.port;
const {chromium}=await import(process.env.HOMEPAGE_STUDIO_PLAYWRIGHT||'playwright');
const extension=path.join(qa,'resize-zoom-extension');await fs.mkdir(extension,{recursive:true});
await fs.writeFile(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Local Preview Resize Gate',version:'1.0',host_permissions:['http://127.0.0.1/*']}));
await fs.writeFile(path.join(extension,'control.html'),'<!doctype html><title>Local preview resize test</title>');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'KD_Preview_Resize_Browser_'));
const context=await chromium.launchPersistentContext(profile,{headless:false,viewport:null,...(process.env.HOMEPAGE_STUDIO_BROWSER?{executablePath:process.env.HOMEPAGE_STUDIO_BROWSER}:{}),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging','--window-size=1600,1100']});
const results=[];let loads=0;
await context.addInitScript(()=>{
 const probe=window.__resizeGate={samples:[],callbacks:[],errors:[],motionObservers:0,mounts:0,introFrames:0,videoFrames:0},seen=new WeakSet();let renderer=1;
 window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(r){const id=renderer++;this.renderers.set(id,r);return id;},onCommitFiberRoot(_id,root){function walk(f){if(!f)return;const p=f.memoizedProps;if(p?.homepageData?.hero&&!('order'in p)&&typeof f.type==='function'){if(!seen.has(f)&&!seen.has(f.alternate))probe.mounts++;seen.add(f);if(f.alternate)seen.add(f.alternate);}walk(f.child);walk(f.sibling);}walk(root.current);},onCommitFiberUnmount(){},checkDCE(){}};
 const RO=window.ResizeObserver;window.ResizeObserver=class extends RO{constructor(callback){super((entries,observer)=>{probe.callbacks.push({time:Date.now(),classes:entries.map(e=>e.target.className)});callback(entries,observer);});}};
 const IO=window.IntersectionObserver;window.IntersectionObserver=class extends IO{constructor(callback,options){if(options?.rootMargin==='0px 0px -12%'&&options.threshold===.14)probe.motionObservers++;super(callback,options);}};
 addEventListener('error',event=>{if(event.message)probe.errors.push(event.message);});
 const videos=new WeakSet();function sample(){
  if(window===top){const frame=document.querySelector('iframe[title="首頁未儲存即時預覽"]');if(frame){const r=frame.getBoundingClientRect(),box=frame.parentElement;probe.samples.push({time:Date.now(),scale:frame.style.zoom,width:r.width,height:r.height,y:r.y,clientWidth:box.clientWidth,scrollWidth:box.scrollWidth,gutter:box.offsetWidth-box.clientWidth,physicalWidth:r.width*devicePixelRatio});}}
  else{if(document.getAnimations().some(a=>a.playState==='running'))probe.introFrames++;for(const video of document.querySelectorAll('video'))if(!videos.has(video)&&video.requestVideoFrameCallback){videos.add(video);const tick=()=>{probe.videoFrames++;video.requestVideoFrameCallback(tick);};video.requestVideoFrameCallback(tick);}}
  requestAnimationFrame(sample);
 }requestAnimationFrame(sample);
});
try{
 const cdp=await context.browser().newBrowserCDPSession(),loaded=await cdp.send('Extensions.loadUnpacked',{path:extension}),control=await context.newPage();await control.goto('chrome-extension://'+loaded.id+'/control.html');
 const session=JSON.parse(await fs.readFile(path.join(runtime.root,'browser-session.json'),'utf8'));await context.addCookies([{name:'kd_admin_session',value:session.cookie,url:origin}]);
 const page=await context.newPage();page.setDefaultTimeout(60000);page.on('request',r=>{if(r.isNavigationRequest()&&new URL(r.url()).pathname==='/admin/homepage/preview')loads++;});
 await page.goto(origin+'/admin/homepage',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'首頁內容工作室',exact:true}).waitFor();await page.getByText('正在載入真實首頁預覽…',{exact:true}).waitFor({state:'hidden'});
 const frame=page.frames().find(f=>f.url().endsWith('/admin/homepage/preview'));assert.ok(frame);const [tab]=await control.evaluate(url=>chrome.tabs.query({url}),origin+'/admin/homepage');await page.bringToFront();
 const unique=values=>[...new Set(values)];
 for(const [label,factor] of [['100',1],['90',.9],['80',.8],['75',.75],['67',2/3],['50',.5],['33',1/3]]){
  const start=Date.now();await control.evaluate(({id,factor})=>chrome.tabs.setZoom(id,factor),{id:tab.id,factor});await page.waitForTimeout(label==='67'||label==='50'?12500:4000);
  const actualZoom=await control.evaluate(id=>chrome.tabs.getZoom(id),tab.id),probe=await page.evaluate(()=>window.__resizeGate),rows=probe.samples.filter(s=>s.time>=start+2000);
  assert.ok(rows.length>=2,'Need settled compositor samples');const scales=unique(rows.map(r=>r.scale)),widths=unique(rows.map(r=>r.width)),origins=unique(rows.map(r=>r.y));assert.equal(scales.length,1,label+'% scale oscillation');assert.equal(widths.length,1,label+'% width oscillation');assert.equal(origins.length,1,label+'% origin jumping');assert.ok(rows.every(r=>r.scrollWidth<=r.clientWidth),'Horizontal overflow');
  const callbacks=probe.callbacks.filter(c=>c.time>=start+2000&&c.classes.some(s=>String(s).includes('previewViewport'))).length;const row={label,actualZoom,samples:rows.length,steadyDurationMs:rows.at(-1).time-rows[0].time,scales,widths,origins,resizeObserverCallbacks:callbacks,physicalWidths:unique(rows.map(r=>r.physicalWidth))};results.push(row);console.log('PASS '+label+'% '+JSON.stringify(row));
 }
 const focusChecks=[];
 for(const factor of [2/3,.5]){
  await control.evaluate(({id,factor})=>chrome.tabs.setZoom(id,factor),{id:tab.id,factor});await page.waitForTimeout(1500);
  for(const area of ['主視覺','本月活動','咖啡時刻','品牌價值','咖啡製程','最後購買引導']){
   await page.getByRole('navigation',{name:'首頁編輯區域'}).getByRole('button',{name:new RegExp(area)}).click();await page.waitForTimeout(800);const start=Date.now();
   if(area==='主視覺'){await page.getByRole('button',{name:'重播動畫',exact:true}).click();await frame.locator('[data-studio-replay-status]').filter({hasText:'動畫重播完成'}).waitFor();}
   await page.waitForTimeout(700);const rows=await page.evaluate(s=>window.__resizeGate.samples.filter(r=>r.time>=s),start);assert.ok(rows.length>1);assert.equal(unique(rows.map(r=>r.width)).length,1,'Focus/replay width oscillation');assert.equal(unique(rows.map(r=>r.scale)).length,1,'Focus/replay scale oscillation');assert.equal(unique(rows.map(r=>r.y)).length,1,'Focus/replay origin oscillation');
   if(area==='咖啡時刻'||area==='本月活動'){const id=area==='咖啡時刻'?'home003':'monthly-campaign';assert.ok(await frame.locator('#'+id+' img').evaluateAll(nodes=>nodes.length>0&&nodes.every(n=>n.complete&&n.naturalWidth>0)));assert.equal(await frame.locator('#'+id+' [data-studio-media-placeholder]').count(),0);}
   focusChecks.push({factor,area,replay:area==='主視覺',samples:rows.length,width:rows[0].width,scale:rows[0].scale});
  }
 }
 const live=await frame.evaluate(()=>({mode:document.querySelector('main').getAttribute('data-homepage-preview-mode'),mounts:window.__resizeGate.mounts,motionObservers:window.__resizeGate.motionObservers,introFrames:window.__resizeGate.introFrames,videoFrames:window.__resizeGate.videoFrames,manualVideoButtons:document.querySelectorAll('[data-studio-media-play]').length,video:[...document.querySelectorAll('video')].map(v=>({autoplay:v.autoplay,muted:v.muted,loop:v.loop,paused:v.paused,currentTime:v.currentTime}))}));
 assert.equal(live.mode,'studio-live');assert.equal(live.mounts,1);assert.equal(loads,1);assert.ok(live.motionObservers>0);assert.ok(live.introFrames>0);assert.ok(live.videoFrames>0);assert.equal(live.manualVideoButtons,0);assert.ok(live.video.some(v=>v.autoplay&&v.muted&&v.loop&&!v.paused&&v.currentTime>0));
 await page.getByRole('button',{name:'Mobile 手機',exact:true}).click();await page.waitForTimeout(1800);assert.ok(Math.abs(await frame.evaluate(()=>innerWidth)-390)<=1);await page.getByRole('button',{name:'Desktop 桌機',exact:true}).click();await page.waitForTimeout(500);assert.equal(loads,1);assert.equal(await frame.evaluate(()=>window.__resizeGate.mounts),1);
 const warnings=await page.evaluate(()=>window.__resizeGate.errors);assert.deepEqual(warnings,[]);await fs.writeFile(path.join(qa,'resize-live-results.json'),JSON.stringify({passed:results.length,results,focusChecks,live,iframeLoads:loads,warnings,profile},null,2));console.log('Live preview geometry, motion and native video PASS.');
}finally{await context.close();}
