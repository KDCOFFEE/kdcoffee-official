// Browser integration gate against an isolated, already-built local QA server.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const qa=process.env.HOMEPAGE_STUDIO_QA_DIR;assert.ok(qa);
const runtime=JSON.parse(await fs.readFile(path.join(qa,'runtime.json'),'utf8')),origin='http://127.0.0.1:'+runtime.port;
const {chromium}=await import(process.env.HOMEPAGE_STUDIO_PLAYWRIGHT||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.HOMEPAGE_STUDIO_BROWSER});
const context=await browser.newContext({viewport:{width:1600,height:1050},serviceWorkers:'block'});
const session=JSON.parse(await fs.readFile(path.join(runtime.root,'browser-session.json'),'utf8'));
await context.addCookies([{name:'kd_admin_session',value:session.cookie,url:origin}]);
await context.addInitScript(()=>{
 const probe=window.__liveRegression={messages:[],mounts:0,replays:[],samples:[],clicks:0,observerCount:0};let next=1;const seen=new WeakSet();
 const IO=window.IntersectionObserver;window.IntersectionObserver=class extends IO{constructor(cb,options){if(options?.rootMargin==='0px 0px -12%')probe.observerCount++;super(cb,options);}};
 window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(v){this.renderers.set(next,v);return next++;},onCommitFiberRoot(_id,root){function walk(f){if(!f)return;const p=f.memoizedProps;if(p?.homepageData?.hero&&!('order'in p)&&typeof f.type==='function'){if(!seen.has(f)&&!seen.has(f.alternate))probe.mounts++;seen.add(f);if(f.alternate)seen.add(f.alternate);}walk(f.child);walk(f.sibling);}walk(root.current);},onCommitFiberUnmount(){},checkDCE(){}};
 window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin)probe.messages.push({type:e.data?.type,area:e.data?.area});});
 document.addEventListener('click',e=>{if(e.target.closest('button')?.textContent==='重播動畫')probe.clicks++;},true);
 new MutationObserver(records=>records.forEach(r=>{if(r.attributeName==='data-studio-replay'&&r.target.hasAttribute('data-studio-replay'))probe.replays.push(r.target.id);})).observe(document,{subtree:true,attributes:true,attributeFilter:['data-studio-replay']});
 function sample(){const target=document.querySelector('[data-studio-replay]');if(target){const node=target.id==='top'?target.querySelector('h1 span'):target.querySelector('[data-home-motion-part],[data-home-reveal]');probe.samples.push({id:target.id,at:performance.now(),opacity:node?Number(getComputedStyle(node).opacity):1,animations:target.getAnimations({subtree:true}).filter(a=>a.playState==='running').length});}requestAnimationFrame(sample);}requestAnimationFrame(sample);
});
const checks=[],matrix=[],errors=[];let loads=0;
const poll=async(run,want)=>{const end=Date.now()+15000;let value;do{value=await run();if(value===want)return;await new Promise(r=>setTimeout(r,30));}while(Date.now()<end);assert.equal(value,want);};
const test=async(name,run)=>{await run();checks.push(name);console.log('PASS '+checks.length+' '+name);};
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.isNavigationRequest()&&r.url().endsWith('/admin/homepage/preview'))loads++;});
const draft=async(data)=>page.evaluate(homepage=>document.querySelector('iframe[title="首頁未儲存即時預覽"]').contentWindow.postMessage({type:'kd-homepage-draft',homepage},location.origin),data);
try{
 await page.goto(origin+'/admin/homepage');await page.getByRole('heading',{name:'首頁內容工作室',exact:true}).waitFor();await page.getByText('正在載入真實首頁預覽…',{exact:true}).waitFor({state:'hidden'});
 const frame=page.frames().find(f=>f.url().endsWith('/admin/homepage/preview'));assert.ok(frame);await frame.locator('#top').waitFor();await page.waitForTimeout(3500);
 const data=(await(await page.request.get(origin+'/api/admin/homepage')).json()).homepage;
 for(const [label,id]of [['主視覺','top'],['本月活動','monthly-campaign'],['品牌價值','home002'],['咖啡時刻','home003'],['推薦作品','home004'],['咖啡製程','home005']]){
  await page.getByRole('navigation',{name:'首頁編輯區域'}).getByRole('button',{name:new RegExp(label)}).click();await page.waitForTimeout(1500);
  await frame.evaluate(()=>{window.__liveRegression.samples.length=0;window.__liveRegression.messages.length=0;window.__liveRegression.replays.length=0;});
  await page.getByRole('button',{name:'重播動畫',exact:true}).click();await poll(()=>frame.locator('[data-studio-replay-status]').innerText(),'動畫重播完成');
  const result=await frame.evaluate(()=>window.__liveRegression);const samples=result.samples.filter(s=>s.id===id);
  matrix.push({id,label,messages:result.messages,replays:result.replays,samples,mounts:result.mounts,observerCount:result.observerCount});
 }
 await test('Replay clicks and messages reach the iframe for all six sections',async()=>{assert.equal(await page.evaluate(()=>window.__liveRegression.clicks),6);assert.ok(matrix.every(r=>r.messages.some(m=>m.type==='kd-homepage-replay')));});
 await test('Focused entrances reset visibly and run their full animation',async()=>{for(const r of matrix){assert.deepEqual(r.replays,[r.id]);assert.ok(r.samples.some(s=>s.opacity<.05),r.id+' must reset to hidden');assert.ok(r.samples.some(s=>s.opacity>.95),r.id+' must enter');assert.ok(r.samples.some(s=>s.opacity>.05&&s.opacity<.95&&s.animations>0),r.id+' must visibly interpolate');assert.ok(r.samples.at(-1).at-r.samples[0].at>400,r.id+' full duration');}});
 await test('Replay completes; disabled motion is explicitly distinguishable',async()=>{const d=structuredClone(data);d.hero.motionEnabled=false;await draft(d);await page.getByRole('navigation',{name:'首頁編輯區域'}).getByRole('button',{name:/主視覺/}).click();await poll(()=>frame.locator('#top').getAttribute('data-hero-motion'),'off');await page.getByRole('button',{name:'重播動畫',exact:true}).click();await poll(()=>frame.locator('[data-studio-replay-status]').innerText(),'此區塊已停用動畫');assert.equal(await frame.locator('main').getAttribute('data-homepage-preview-mode'),'studio-live');await draft(data);});
 await test('Replay preserves the iframe, Homepage and the existing motion observer',async()=>{assert.equal(loads,1);assert.ok(matrix.every(r=>r.mounts===1&&r.observerCount===1));});
 const image='/images/home003/kd-coffee-first-specialty-coffee-drip-bag-v02.webp';
 await test('Valid local assets render with zero false placeholders in the Owner cases',async()=>{await poll(()=>frame.locator('#home003 [data-studio-media-placeholder],#monthly-campaign [data-studio-media-placeholder]').count(),0);for(const id of ['home003','monthly-campaign']){assert.ok(await frame.locator('#'+id+' h2').isVisible());assert.ok(await frame.locator('#'+id+' img').evaluateAll(nodes=>nodes.length>0&&nodes.every(n=>n.complete&&n.naturalWidth>0)));}assert.equal((await page.request.get(origin+image)).status(),200);});
 await test('Valid legacy src images resolve and decode in Preview',async()=>{const d=structuredClone(data),c=d.home003.cards[0];delete c.media;c.mediaItems=[];c.image=image+'?legacy=1';await draft(d);await poll(()=>frame.locator('#home003 img[src*="legacy"]').evaluateAll(nodes=>nodes.some(n=>n.complete&&n.naturalWidth>0&&getComputedStyle(n).opacity==='1')),true);});
 await test('MediaAsset URLs and Cloudinary provider semantics remain intact',async()=>{const remote='https://res.cloudinary.com/qa-preview/image/upload/exact-source.webp',bytes=await(await page.request.get(origin+image)).body();await page.route(remote,route=>route.fulfill({status:200,contentType:'image/webp',body:bytes}));const d=structuredClone(data),c=d.home003.cards[0];c.mediaItems=[];c.image='';c.media={type:'image',provider:'cloudinary',url:remote};await draft(d);await poll(()=>frame.locator('#home003 img').evaluateAll((nodes,src)=>nodes.some(n=>n.src===src&&n.naturalWidth>0&&getComputedStyle(n).opacity==='1'),remote),true);await draft(data);});
 await test('Background video keeps autoplay, mute, loop and moving frames',async()=>{const v=frame.locator('#top video').first();await poll(()=>v.evaluate(n=>n.autoplay&&n.muted&&n.loop&&!n.paused&&n.readyState>=2),true);const time=await v.evaluate(n=>n.currentTime);await page.waitForTimeout(400);assert.ok(await v.evaluate((n,t)=>n.currentTime!==t,time));assert.equal(await frame.locator('[data-studio-media-play]').count(),0);});
 await test('Only a genuinely missing initial asset produces a placeholder',async()=>{const other=await context.newPage();await other.route('**/*',async route=>{const u=new URL(route.request().url());if((u.searchParams.get('url')||u.pathname)===image)return route.fulfill({status:404,body:'Not found'});return route.fallback();});await other.goto(origin+'/admin/homepage/preview');await poll(()=>other.locator('[data-studio-media-placeholder]').count(),1);assert.equal(await other.locator('[data-studio-media-placeholder]').evaluate(n=>n.closest('section').id),'home003');await other.close();});
 await test('Protected geometry remains stable during focused replay',async()=>{const geometry=()=>page.locator('iframe').evaluate(n=>{const r=n.getBoundingClientRect();return {width:r.width,y:r.y,height:r.height,zoom:n.style.zoom};});const before=await geometry();await page.getByRole('button',{name:'重播動畫',exact:true}).click();for(let i=0;i<15;i++){await page.waitForTimeout(100);assert.deepEqual(await geometry(),before);}assert.equal(loads,1);assert.equal(await frame.evaluate(()=>window.__liveRegression.mounts),1);});
 assert.deepEqual(errors,[]);await fs.mkdir(path.join(qa,'final-regression'),{recursive:true});await fs.writeFile(path.join(qa,'final-regression','focused-results.json'),JSON.stringify({passed:checks.length,checks,matrix,loads,errors},null,2));
 console.log('Final Live Preview: '+checks.length+' focused checks PASS.');
}finally{await browser.close();}
