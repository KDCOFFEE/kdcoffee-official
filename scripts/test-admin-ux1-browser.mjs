// Run after prepare-admin-ux1.mts and starting Next with its isolated KD_DATA_DIR/secret.
// Requires Playwright and Chrome paths in ADMIN_UX_PLAYWRIGHT / ADMIN_UX_BROWSER.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.ADMIN_UX_PLAYWRIGHT||'playwright');
const qa=path.resolve('qa-output/admin-ux1'),config=JSON.parse(await fs.readFile(path.join(qa,'ui-private-session.json'),'utf8'));
assert.equal(config.root,path.join(qa,'runtime'),'Only disposable QA content may be modified');
const origin='http://127.0.0.1:'+config.port;
const browser=await chromium.launch({headless:true,executablePath:process.env.ADMIN_UX_BROWSER});
const context=await browser.newContext();await context.addCookies([{name:'kd_admin_session',value:config.cookie,url:origin}]);
const page=await context.newPage(),errors=[],results=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const routes=[['homepage','/admin/homepage','首頁分享圖片'],['service','/admin/customer-service','客服中心分享圖片'],['store','/admin/store/content/landing?tab=seo','商店首頁分享圖片'],['global','/admin/logo#social-share','全站預設分享圖片']];
const card=label=>page.locator('[data-social-image-field]').filter({has:page.getByRole('heading',{name:label,exact:true})});
const choose=async field=>{await field.getByRole('button',{name:'從素材庫選擇',exact:true}).click();await page.getByRole('dialog').getByRole('button').filter({hasText:'畫面測試圖片'}).click();await field.locator('img').waitFor();};
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
try{
 for(const [name,url,label] of routes)for(const width of [1440,1024,768,430,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+url);if(name==='global')await page.reload();const field=card(label);await field.waitFor();await field.getByRole('button',{name:'從素材庫選擇',exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-social-image-field] button')].some(b=>!b.disabled));
  await field.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(qa,`${name}-${width}-empty.png`)});
  const empty=await field.innerText();assert.ok(empty.includes('尚未設定專屬分享圖片'));
  await choose(field);
  await field.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(qa,`${name}-${width}-image.png`)});
  const text=await field.innerText();assert.equal(text.split('LINE、Facebook、Messenger').length-1,1);assert.equal(text.split('1200 × 630').length-1,1);assert.ok(!/Open Graph|Hero|Desktop|Mobile|fallback|備援/.test(text));
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width&&s.position!=='fixed'&&r.right>innerWidth+1}).slice(0,8).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width}))}));
  const buttons=await field.locator('button').evaluateAll(bs=>bs.map(b=>({text:b.innerText,height:b.getBoundingClientRect().height})));assert.ok(buttons.every(b=>b.height>=44),JSON.stringify(buttons));
  const preview=await field.locator('img').evaluate(img=>({complete:img.complete,naturalWidth:img.naturalWidth}));assert.ok(preview.complete&&preview.naturalWidth>0);
  results.push({name,width,layout,buttons,preview});console.log('SCREEN '+name+' '+width+' overflow='+(layout.scroll-width));
 }
 await page.setViewportSize({width:390,height:900});await page.goto(origin+'/admin/homepage');const home=card('首頁分享圖片');await home.getByRole('button',{name:'從素材庫選擇'}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await home.getByRole('button',{name:'從素材庫選擇'}).evaluate(b=>b===document.activeElement),true);checks.push('Escape closes library and restores keyboard focus');
 await choose(home);const value={path:config.asset.path,alt:config.asset.alt,assetId:config.asset.id};
 await check('Homepage selection saves the identical PageStore socialImage value',async()=>{const req=page.waitForRequest(r=>r.method()==='PUT'&&r.url().endsWith('/api/admin/pages'));await page.getByRole('button',{name:'儲存設定',exact:true}).click();assert.deepEqual((await req).postDataJSON().image,value);await page.getByText('設定已儲存。',{exact:true}).waitFor();const store=JSON.parse(await fs.readFile(path.join(config.root,'store/pages.json'),'utf8'));assert.deepEqual(store.systemPages.homepage.seo.socialImage,value);});
 await check('Remove clears only the reference, retaining the library file',async()=>{await home.getByRole('button',{name:'移除設定'}).click();await page.getByRole('button',{name:'儲存設定',exact:true}).click();await page.getByText('設定已儲存。',{exact:true}).waitFor();const store=JSON.parse(await fs.readFile(path.join(config.root,'store/pages.json'),'utf8'));assert.equal(store.systemPages.homepage.seo.socialImage,undefined);await fs.access(path.join(config.root,config.asset.path));});
 await check('Upload keeps multipart file/create contract and shared selection callback',async()=>{let payload;await page.route('**/api/admin/assets/upload?purpose=social-share',async route=>{payload=route.request().postDataBuffer().toString('latin1');await route.fulfill({json:{asset:config.asset}});});await home.locator('input[type=file]').setInputFiles({name:'share.png',mimeType:'image/png',buffer:await fs.readFile(path.join(config.root,config.asset.path))});await home.locator('img').waitFor();assert.ok(payload.includes('name="file"'));assert.ok(payload.includes('name="create"\r\n\r\ntrue'));assert.equal(await home.locator('img').getAttribute('src'),value.path);await page.unroute('**/api/admin/assets/upload?purpose=social-share');});
 await check('Customer Service selection saves unchanged document.config.socialImage',async()=>{await page.goto(origin+'/admin/customer-service');await choose(card('客服中心分享圖片'));await page.getByRole('button',{name:'儲存客服內容',exact:true}).click();await page.getByText('客服內容已儲存。',{exact:true}).waitFor();const state=JSON.parse(await fs.readFile(path.join(config.root,'customer-service/content.json'),'utf8'));assert.deepEqual(state.document.config.socialImage,value);});
 await check('Store selection saves unchanged storeLanding.seo.image',async()=>{await page.goto(origin+'/admin/store/content/landing?tab=seo');await choose(card('商店首頁分享圖片'));await page.getByRole('button',{name:'儲存全部',exact:true}).click();await page.getByText('已儲存全部變更。',{exact:true}).waitFor();const state=JSON.parse(await fs.readFile(path.join(config.root,'gift-cms/content.json'),'utf8'));assert.deepEqual(state.storeLanding.seo.image,{url:value.path,alt:value.alt,caption:''});});
 assert.deepEqual(errors,[]);assert.ok(results.every(r=>r.layout.scroll<=r.width),JSON.stringify(results.filter(r=>r.layout.scroll>r.width)));
}finally{await fs.writeFile(path.join(qa,'browser-results.json'),JSON.stringify({screens:results.length,checks,results,errors},null,2));await browser.close();}
console.log('ADMIN UX BROWSER: '+results.length+' screens; '+checks.length+' interaction checks PASS.');
