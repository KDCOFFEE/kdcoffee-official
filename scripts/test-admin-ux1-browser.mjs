// Run after prepare-admin-ux1.mts and starting Next with its isolated KD_DATA_DIR/secret.
// Requires Playwright and Chrome paths in ADMIN_UX_PLAYWRIGHT / ADMIN_UX_BROWSER.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.ADMIN_UX_PLAYWRIGHT||'playwright');
const qa=path.resolve('qa-output/admin-ux1'),config=JSON.parse(await fs.readFile(path.join(qa,'ui-private-session.json'),'utf8'));
assert.equal(config.root,path.join(qa,'runtime'),'Only disposable QA content may be modified');
const origin='http://127.0.0.1:'+config.port;
const homepageFile=path.join(config.root,'store/homepage.json'),pagesFile=path.join(config.root,'store/pages.json');
const homepage=JSON.parse(await fs.readFile(homepageFile,'utf8')),pageStore=JSON.parse(await fs.readFile(pagesFile,'utf8'));
const legacy={title:'舊標題 QA',description:'舊描述 QA',shareImage:{media:{type:'image',provider:'local',url:config.asset.path},alt:'舊圖片 QA'}};
homepage.seo=legacy;
for(const item of homepage.home008.images){
 if(item.media?.provider!=='cloudinary')continue;
 item.image=config.asset.path;item.media=legacy.shareImage.media;
}
const withdrawn=pageStore.pages.find(entry=>entry.slug==='story-20260826-5e00b6');
assert.ok(withdrawn);withdrawn.status='unpublished';
await fs.writeFile(homepageFile,JSON.stringify(homepage));
await fs.writeFile(pagesFile,JSON.stringify(pageStore));
const websiteFile=path.join(config.root,'store/website-data.json');
const website=JSON.parse(await fs.readFile(websiteFile,'utf8'));
// The public seed predates these two works' inclusion in the production sitemap.
for(const slug of ['eyck-soft-shadow','la-tour-dawn']){
 const work=website.menu.products.find(entry=>entry.slug===slug);
 assert.ok(work);work.inMonthlyMenu=true;
}
await fs.writeFile(websiteFile,JSON.stringify(website));
const browser=await chromium.launch({headless:true,executablePath:process.env.ADMIN_UX_BROWSER});
const context=await browser.newContext();await context.addCookies([{name:'kd_admin_session',value:config.cookie,url:origin}]);
const page=await context.newPage(),errors=[],results=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const routes=[['homepage','/admin/homepage','首頁分享圖片'],['service','/admin/customer-service','客服中心分享圖片'],['store','/admin/store/content/landing?tab=seo','商店首頁分享圖片'],['global','/admin/logo#social-share','全站預設分享圖片']];
const card=label=>page.locator('[data-social-image-field]').filter({has:page.getByRole('heading',{name:label,exact:true})});
const choose=async field=>{await field.getByRole('button',{name:'從素材庫選擇',exact:true}).click();await page.getByRole('dialog').getByRole('button').filter({hasText:'畫面測試圖片'}).click();await field.locator('img').waitFor();};
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const getPublic=pathname=>context.request.get(origin+pathname,{headers:{'User-Agent':'Line/1.0'}});
const headTags=async pathname=>{
 const response=await getPublic(pathname);
 const html=await response.text();
 return {status:response.status(),tags:html.match(/<title>.*?<\/title>|<meta (?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>|<link rel="canonical"[^>]*>/g)??[]};
};
try{
 const sitemap=await (await getPublic('/sitemap.xml')).text();
 const works=[...sitemap.matchAll(/<loc>https:\/\/www\.kdcoffee1962\.com(\/works\/[^<]+)<\/loc>/g)].map(match=>match[1]);
 assert.equal(works.length,10);
 const publicPaths=['/works','/gallery','/monthly-menu','/customer-service','/store','/gifts',...works];
 const beforeSeo=await Promise.all(publicPaths.map(headTags)),defaultHome=await headTags('/');
 assert.ok(beforeSeo.every(entry=>entry.status===200&&entry.tags.some(tag=>tag.startsWith('<title>'))),JSON.stringify(beforeSeo.map(entry=>[entry.status,entry.tags.length])));
 for(const pathname of ['/store','/gifts'])assert.ok(beforeSeo[publicPaths.indexOf(pathname)].tags.some(tag=>tag.includes('name="robots" content="noindex')));
 assert.ok(!sitemap.includes(withdrawn.slug));assert.equal((await getPublic('/pages/'+withdrawn.slug)).status(),404);
 assert.ok(defaultHome.tags.includes('<title>KD 咖啡藝術工坊｜KD Coffee 精品咖啡</title>'));
 for(const [name,url,label] of routes)for(const width of [1440,1024,768,430,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+url);if(name==='global')await page.reload();const field=card(label);await field.waitFor();await field.getByRole('button',{name:'從素材庫選擇',exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-social-image-field] button')].some(b=>!b.disabled));
  await field.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(qa,`${name}-${width}-empty.png`)});
  const empty=await field.innerText();assert.ok(empty.includes('尚未設定專屬分享圖片'));
  await choose(field);
  await field.locator('img').evaluate(img=>img.decode());
  await field.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(qa,`${name}-${width}-image.png`)});
  const text=await field.innerText();assert.equal(text.split('LINE、Facebook、Messenger').length-1,1);assert.equal(text.split('1200 × 630').length-1,1);assert.ok(!/Open Graph|Hero|Desktop|Mobile|fallback|備援/.test(text));
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width&&s.position!=='fixed'&&r.right>innerWidth+1}).slice(0,8).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width}))}));
  const buttons=await field.locator('button').evaluateAll(bs=>bs.map(b=>({text:b.innerText,height:b.getBoundingClientRect().height})));assert.ok(buttons.every(b=>b.height>=44),JSON.stringify(buttons));
  const preview=await field.locator('img').evaluate(img=>({complete:img.complete,naturalWidth:img.naturalWidth,width:img.getBoundingClientRect().width}));assert.ok(preview.complete&&preview.naturalWidth>0);
  if(name==='homepage'){
   if(width>=768)assert.ok(preview.width>=150&&preview.width<=200,JSON.stringify(preview));
   assert.equal(await page.locator('#homepage-social-share').evaluate(el=>!el.nextElementSibling),true);
   assert.equal(await page.getByLabel('Google 搜尋標題（正在編輯）').getAttribute('maxlength'),'70');
   assert.equal(await page.getByLabel('Google 搜尋描述（正在編輯）').getAttribute('maxlength'),'180');
  }
  results.push({name,width,layout,buttons,preview});console.log('SCREEN '+name+' '+width+' overflow='+(layout.scroll-width));
 }
 await page.setViewportSize({width:390,height:900});await page.goto(origin+'/admin/homepage');const home=card('首頁分享圖片');await home.getByRole('button',{name:'從素材庫選擇'}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await home.getByRole('button',{name:'從素材庫選擇'}).evaluate(b=>b===document.activeElement),true);checks.push('Escape closes library and restores keyboard focus');
 await check('Homepage opens at the Studio and deep links reach bottom settings',async()=>{
  await page.goto(origin+'/admin/homepage');await page.getByRole('heading',{name:'首頁內容工作室'}).waitFor();
  assert.equal(await page.evaluate(()=>window.scrollY),0);
  await page.goto(origin+'/admin/homepage#homepage-social-share');
  await page.waitForFunction(()=>{const r=document.getElementById('homepage-social-share').getBoundingClientRect();return window.scrollY>0&&r.top<innerHeight&&r.bottom>0;});
 });
 const titleInput=page.getByLabel('Google 搜尋標題（正在編輯）');
 const descriptionInput=page.getByLabel('Google 搜尋描述（正在編輯）');
 const save=page.getByRole('button',{name:'儲存設定',exact:true});
 const readSeo=async()=>await (await context.request.get(origin+'/api/admin/pages?scope=homepageSeo')).json();
 await check('Homepage unsaved text, effective values, real 409 and explicit retry',async()=>{
  const initial=await readSeo();
  await titleInput.fill('畫面測試｜自訂標題');
  await page.getByText('尚有未儲存的變更',{exact:true}).waitFor();
  assert.equal(await page.getByText('目前生效（品牌預設）：'+initial.effective.title,{exact:true}).count(),1);
  const competing=await context.request.put(origin+'/api/admin/pages',{
   headers:{Origin:origin},data:{scope:'homepageSeo',version:initial.version,description:'另一視窗儲存的描述。'},
  });assert.equal(competing.status(),200,await competing.text());
  await save.click();
  await page.getByRole('button',{name:'已核對，保留我的編輯'}).waitFor();
  assert.equal(await titleInput.inputValue(),'畫面測試｜自訂標題');
  assert.equal(await descriptionInput.inputValue(),'另一視窗儲存的描述。');
  assert.equal(await save.isDisabled(),true);
  assert.equal((await readSeo()).version,initial.version+1);
  await page.getByRole('button',{name:'已核對，保留我的編輯'}).click();
  await save.click();await page.getByText('設定已儲存。',{exact:true}).waitFor();
  const liveHome=await headTags('/');
  for(const fragment of ['<title>畫面測試｜自訂標題</title>','name="description" content="另一視窗儲存的描述。"','property="og:title" content="畫面測試｜自訂標題"','name="twitter:title" content="畫面測試｜自訂標題"','name="robots" content="index, follow"']){
   assert.ok(liveHome.tags.some(tag=>tag.includes(fragment)),JSON.stringify({fragment,liveHome}));
  }
  assert.ok(liveHome.tags.some(tag=>/^<link rel="canonical" href="https:\/\/www\.kdcoffee1962\.com\/?"\s*\/>$/.test(tag)));
  assert.deepEqual(await Promise.all(publicPaths.map(headTags)),beforeSeo);
  assert.equal(await (await getPublic('/sitemap.xml')).text(),sitemap);
  console.log('Metadata unchanged for '+works.length+' Works details and '+(publicPaths.length-works.length)+' landing pages.');
  await page.getByRole('button',{name:/搜尋與分享/}).click();
  await page.getByRole('link',{name:'頁面底部的首頁搜尋與分享設定'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'頁面底部的首頁搜尋與分享設定'}).getAttribute('href'),'#homepage-social-share');
  await page.getByRole('button',{name:/主視覺/}).first().click();
  const cmsBefore=await fs.readFile(pagesFile);
  await page.getByLabel('品牌小標',{exact:true}).fill('工作室儲存 QA');
  await page.getByRole('button',{name:'儲存全部',exact:true}).click();
  await page.getByText(/首頁設定已儲存/).waitFor();
  assert.deepEqual(await fs.readFile(pagesFile),cmsBefore);
  assert.deepEqual(JSON.parse(await fs.readFile(homepageFile,'utf8')).seo,legacy);
  for(const button of await page.getByRole('button',{name:'恢復預設',exact:true}).all())await button.click();
  await save.click();await page.getByText('設定已儲存。',{exact:true}).waitFor();
  assert.deepEqual((await readSeo()).seo,{});
  assert.deepEqual(await headTags('/'),defaultHome);
  const currentStore=JSON.parse(await fs.readFile(pagesFile,'utf8'));
  assert.deepEqual(currentStore.pages,pageStore.pages);
  assert.deepEqual(currentStore.visualStyle,pageStore.visualStyle);
  assert.deepEqual({...currentStore.systemPages,homepage:undefined},{...pageStore.systemPages,homepage:undefined});
 });
 await choose(home);const value={path:config.asset.path,alt:config.asset.alt,assetId:config.asset.id};
 await check('Homepage selection saves the identical PageStore socialImage value',async()=>{const req=page.waitForRequest(r=>r.method()==='PUT'&&r.url().endsWith('/api/admin/pages'));await page.getByRole('button',{name:'儲存設定',exact:true}).click();assert.deepEqual((await req).postDataJSON().image,value);await page.getByText('設定已儲存。',{exact:true}).waitFor();await page.getByRole('link',{name:'查看品牌預設分享圖片'}).waitFor();const store=JSON.parse(await fs.readFile(path.join(config.root,'store/pages.json'),'utf8'));assert.deepEqual(store.systemPages.homepage.seo.socialImage,value);});
 await check('Remove clears only the reference, retaining the library file',async()=>{await home.getByRole('button',{name:'移除設定'}).click();await page.getByRole('button',{name:'儲存設定',exact:true}).click();await page.getByText('設定已儲存。',{exact:true}).waitFor();const store=JSON.parse(await fs.readFile(path.join(config.root,'store/pages.json'),'utf8'));assert.equal(store.systemPages.homepage.seo.socialImage,undefined);await fs.access(path.join(config.root,config.asset.path));});
 await check('Upload keeps multipart file/create contract and shared selection callback',async()=>{let payload;await page.route('**/api/admin/assets/upload?purpose=social-share',async route=>{payload=route.request().postDataBuffer().toString('latin1');await route.fulfill({json:{asset:config.asset}});});await home.locator('input[type=file]').setInputFiles({name:'share.png',mimeType:'image/png',buffer:await fs.readFile(path.join(config.root,config.asset.path))});await home.locator('img').waitFor();assert.ok(payload.includes('name="file"'));assert.ok(payload.includes('name="create"\r\n\r\ntrue'));assert.equal(await home.locator('img').getAttribute('src'),value.path);await page.unroute('**/api/admin/assets/upload?purpose=social-share');});
 await check('Customer Service selection saves unchanged document.config.socialImage',async()=>{await page.goto(origin+'/admin/customer-service');await choose(card('客服中心分享圖片'));await page.getByRole('button',{name:'儲存客服內容',exact:true}).click();await page.getByText('客服內容已儲存。',{exact:true}).waitFor();const state=JSON.parse(await fs.readFile(path.join(config.root,'customer-service/content.json'),'utf8'));assert.deepEqual(state.document.config.socialImage,value);});
 await check('Store selection saves unchanged storeLanding.seo.image',async()=>{await page.goto(origin+'/admin/store/content/landing?tab=seo');await choose(card('商店首頁分享圖片'));await page.getByRole('button',{name:'儲存全部',exact:true}).click();await page.getByText('已儲存全部變更。',{exact:true}).waitFor();const state=JSON.parse(await fs.readFile(path.join(config.root,'gift-cms/content.json'),'utf8'));assert.deepEqual(state.storeLanding.seo.image,{url:value.path,alt:value.alt,caption:''});});
 assert.deepEqual(errors,[]);assert.ok(results.every(r=>r.layout.scroll<=r.width),JSON.stringify(results.filter(r=>r.layout.scroll>r.width)));
}finally{await fs.writeFile(path.join(qa,'browser-results.json'),JSON.stringify({screens:results.length,checks,results,errors},null,2));await browser.close();}
console.log('ADMIN UX BROWSER: '+results.length+' screens; '+checks.length+' interaction checks PASS.');
