import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {normalizeGalleryEditorial,GALLERY_EDITORIAL_LIMITS} from '../lib/galleryEditorial';
import {classifyGalleryEditorialText,mergeGalleryEditorialDefaults} from '../lib/galleryEditorialSeed';
import {resolveGalleryWorks} from '../lib/galleryWorks';
const data=JSON.parse(await fs.readFile('public/data/website-data.json','utf8'));let count=0;
function test(name:string,fn:()=>void){fn();count++;console.log('PASS '+name);}
test('inventory includes every real unique canonical record',()=>{assert.equal(new Set(data.menu.products.map((p:{slug:string})=>p.slug)).size,data.menu.products.length);assert.ok(data.menu.products.length>8);});
const hooks=new Set();for(const work of data.menu.products)test(work.slug+' has complete bounded editorial without placeholders',()=>{assert.deepEqual(normalizeGalleryEditorial(work.galleryEditorial),work.galleryEditorial);for(const key of Object.keys(GALLERY_EDITORIAL_LIMITS)){const value=work.galleryEditorial[key];assert.equal(classifyGalleryEditorialText(value),'preserved');assert.ok(Array.from(value).length>=({hook:10,interpretation:45,coffeeBridge:30} as Record<string,number>)[key]);}assert.ok(!hooks.has(work.galleryEditorial.hook));hooks.add(work.galleryEditorial.hook);});
test('known QA placeholders are replaceable, meaningful Owner text is preserved',()=>{for(const text of ['dddASs','SsSs','SsSsASASasS','test','123','temporary QA copy'])assert.equal(classifyGalleryEditorialText(text),'placeholder');assert.equal(classifyGalleryEditorialText('把今天的柔光留在杯中。'),'preserved');const defaults=data.menu.products[0].galleryEditorial,owner='這是 Owner 已寫好的作品詮釋。';assert.deepEqual(mergeGalleryEditorialDefaults({hook:owner,interpretation:'test'},defaults),{...defaults,hook:owner});});
test('repeated seeding is idempotent',()=>{for(const work of data.menu.products)assert.deepEqual(mergeGalleryEditorialDefaults(work.galleryEditorial,work.galleryEditorial),work.galleryEditorial);});
test('editorial does not publish hidden works',()=>{const visible=resolveGalleryWorks(data.menu.products);assert.equal(visible.length,8);for(const p of data.menu.products.filter((p:{status:string})=>p.status==='hidden'||p.status==='coming_soon'))assert.ok(!visible.some(w=>w.slug===p.slug));});
console.log('GALLERY EDITORIAL SEED '+count+' PASS; '+data.menu.products.length+' real records.');
