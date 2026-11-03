import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {normalizeGalleryAtmosphere,resolveGalleryAtmosphere,isGalleryBackgroundAsset} from '../lib/galleryAtmosphere';import Controls from '../components/admin/GalleryAtmosphereControls';import type{AssetRecord}from'../lib/assets';
let n=0;const test=(name:string,fn:()=>void)=>{fn();n++;console.log('PASS '+name);};const asset={id:'BG-QA',status:'active',path:'/uploads/assets/website/background.webp',name:'QA background'} as AssetRecord;
test('absent image preserves CSS fallback defaults',()=>{const r=resolveGalleryAtmosphere(undefined,[]);assert.equal(r.imageUrl,'');assert.equal(r.strength,25);assert.equal(r.darkness,55);assert.equal(r.blur,8);});
test('canonical image ID resolves existing asset',()=>assert.equal(resolveGalleryAtmosphere({imageAssetId:asset.id},[asset]).imageUrl,asset.path));
for(const[key,max]of[['strength',100],['darkness',100],['blur',20]] as const){test(key+' accepts bounds and applies',()=>{assert.equal(resolveGalleryAtmosphere({[key]:max},[])[key],max);assert.equal(normalizeGalleryAtmosphere({[key]:0})[key],0);});for(const bad of [-1,max+1,NaN,Infinity,'2',1.5])test(key+' rejects '+String(bad),()=>assert.throws(()=>normalizeGalleryAtmosphere({[key]:bad})));}
test('reject arbitrary image path/base64/URL instead of Asset ID',()=>{for(const id of ['/tmp/a','../a','https://example.test/a','data:image/png;base64,a'])assert.throws(()=>normalizeGalleryAtmosphere({imageAssetId:id}));});
test('video/private/traversal/inactive assets cannot be backgrounds',()=>{for(const p of ['/uploads/order-notifications/a.webp','/uploads/assets/../a.webp','/uploads/assets/%2e%2e/a.webp','/images/a.mp4','https://example.test/a.webp','/images/a".webp'])assert.equal(isGalleryBackgroundAsset({...asset,path:p}),false);assert.equal(isGalleryBackgroundAsset({...asset,status:'missing'}),false);});
test('missing/deleted asset safely falls back to CSS',()=>assert.equal(resolveGalleryAtmosphere({imageAssetId:'MISSING'},[asset]).imageUrl,''));
test('reference follows authoritative asset without duplicating path',()=>{const config={imageAssetId:asset.id};assert.equal(resolveGalleryAtmosphere(config,[{...asset,path:'/images/replaced.webp'}]).imageUrl,'/images/replaced.webp');assert.deepEqual(config,{imageAssetId:asset.id});});
test('Admin exposes image-only shared picker/uploader and bounded pairs',()=>{const html=renderToStaticMarkup(createElement(Controls,{version:1,assets:[asset],value:{imageAssetId:asset.id},onSaved:async()=>{}}));for(const text of ['Gallery 展間背景','背景強度','背景暗化程度','模糊程度','選擇既有媒體'])assert.ok(html.includes(text));assert.equal((html.match(/type="range"/g)||[]).length,3);assert.ok(!html.includes('accept="video/'));assert.ok(html.includes('image/*'));});
const page=await fs.readFile('app/gallery/page.tsx','utf8'),css=await fs.readFile('components/gallery/GalleryExperience.module.css','utf8');
test('room encloses one background, intro and experience, outside Header/Footer',()=>{
 assert.ok(page.includes('<><div className={css.headerChrome}><Header publicProductsOnly/></div><main className={css.page}>'));
 assert.ok(page.includes('</div></div></main><Footer/></>'));
 assert.equal((page.match(/className=\{css.atmosphere\}/g)||[]).length,1);
 assert.ok(page.indexOf('css.room')<page.indexOf('css.atmosphere'));
 assert.ok(page.indexOf('css.atmosphere')<page.indexOf('css.hero'));
 assert.ok(page.indexOf('css.hero')<page.indexOf('<GalleryExperience'));
});
test('room-bounded static atmosphere stays weaker on mobile and preserves native touch',()=>{
 for(const rule of ['.room { position:relative; isolation:isolate; }','.atmosphere { position:absolute; inset:0;','.atmosphere { opacity:.5; }','height:57vh','flex:0 0 78vw','touch-action:pan-x pan-y pinch-zoom'])assert.ok(css.includes(rule));
 assert.ok(!css.includes('@keyframes'));assert.ok(!page.includes('<video'));
});
console.log('GALLERY GLOBAL ATMOSPHERE '+n+' PASS; pure resolution/SSR, no writes.');
