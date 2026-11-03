import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as nodeModule from 'node:module';
const {registerHooks}=nodeModule as unknown as {registerHooks(hooks:{resolve:(s:string,c:{parentURL?:string},next:(s:string,c:{parentURL?:string})=>unknown)=>unknown}):unknown};
import { mergeProductAssetUpdates, preserveServerAssetFields } from '../lib/productAssetUpdates';
import { collectCloudinaryVideoUsage } from '../lib/cloudinaryMediaUsageCore';
import { resolveGalleryWorks } from '../lib/galleryWorks';
import type { CoffeeArtwork } from '../data/websiteData';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MediaUploader from '../components/admin/MediaUploader';
import GalleryAnimationControls from '../components/admin/GalleryAnimationControls';

const url = 'https://res.cloudinary.com/qa/video/upload/kd-coffee/videos/existing.mp4';
const posterUrl = '/images/gallery-poster.webp';
registerHooks({resolve(s, c, next) {
  if (s === '@/lib/cloudinary' && c.parentURL?.endsWith('/productMedia.ts')) return {shortCircuit:true, url:'data:text/javascript,' + encodeURIComponent(`
    export class CloudinaryFinalizeError extends Error {}
    export async function verifyCloudinaryVideo(publicId,usage){
      if(usage!=='product')throw Error('wrong verification policy');
      if(publicId.endsWith('/missing'))throw new CloudinaryFinalizeError('missing');
      return {type:'video',provider:'cloudinary',publicId,url:${JSON.stringify(url)},posterUrl:${JSON.stringify(posterUrl)}};
    }`)};
  return next(s,c);
}});
const { verifyProductAssetUpdates, productAssetSupportsVideo } = await import('../lib/productMedia');
const media = {type:'video' as const, provider:'cloudinary' as const, publicId:'kd-coffee/videos/existing',url,posterUrl};
const site=JSON.parse(await fs.readFile('public/data/website-data.json','utf8'));
const base=site.menu.products[0] as CoffeeArtwork;
let checks=0;
async function test(name:string, run:()=>unknown){await run();checks++;console.log('PASS '+name);}
const slots=['galleryDesktopAnimation','galleryMobileAnimation'];
for(const slot of slots) {
  await test(slot+' reuses verified existing Cloudinary video',async()=>{
    const result=await verifyProductAssetUpdates([{slug:base.slug,assets:{[slot]:{media}}}]);
    assert.equal((result[0].assets as Record<string,{media:typeof media}>)[slot].media.url,url);
  });
  await test(slot+' rejects local/unverified provider',()=>assert.rejects(verifyProductAssetUpdates([{assets:{[slot]:{media:{...media,provider:'local'}}}}])));
  await test(slot+' rejects private publicId',()=>assert.rejects(verifyProductAssetUpdates([{assets:{[slot]:{media:{...media,publicId:'private/orders/video'}}}}])));
  await test(slot+' rejects missing resource',()=>assert.rejects(verifyProductAssetUpdates([{assets:{[slot]:{media:{...media,publicId:'kd-coffee/videos/missing'}}}}])));
}
const product={...base,assets:{...base.assets,galleryDesktopAnimation:{media},galleryMobileAnimation:{media:{...media,url:url.replace('existing','mobile')}}}};
await test('desktop and mobile references remain independent',()=>{
  const work=resolveGalleryWorks([product])[0];assert.equal(work.stageVideo,url);assert.equal(work.mobileVideo,product.assets.galleryMobileAnimation.media.url);
});
await test('unrelated Hero video is not Gallery animation',()=>{
  const work=resolveGalleryWorks([{...base,assets:{hero:{media}}}])[0];assert.equal(work.stageVideo,'');assert.equal(work.mobileVideo,'');
});
await test('absent roles have safe image fallback without data mutation',()=>{
  const snapshot=JSON.stringify(base);const work=resolveGalleryWorks([base])[0];assert.ok(work.stageImage);assert.equal(work.stageVideo,'');assert.equal(JSON.stringify(base),snapshot);
});
await test('unrelated asset save preserves both Gallery roles',()=>{
  const result=mergeProductAssetUpdates([product],[{slug:base.slug,assets:{hero:{path:'/images/another.webp'}}}]);assert.deepEqual((result[0].assets as Record<string,{media?:unknown}>).galleryDesktopAnimation,product.assets.galleryDesktopAnimation);assert.deepEqual((result[0].assets as Record<string,{media?:unknown}>).galleryMobileAnimation,product.assets.galleryMobileAnimation);
});
await test('unrelated product save preserves server media',()=>assert.deepEqual(preserveServerAssetFields<Record<string,unknown>>(product,{...base,assets:{}}).assets,product.assets));
await test('old records do not receive bogus optional Gallery defaults',()=>{const result=mergeProductAssetUpdates([base],[{slug:base.slug,assets:{hero:{path:'/images/another.webp'}}}]);assert.ok(!Object.hasOwn(result[0].assets as object,'galleryDesktopAnimation'));});
await test('explicit remove leaves desktop and other asset metadata intact',()=>{
  const result=mergeProductAssetUpdates([product],[{slug:base.slug,assets:{galleryMobileAnimation:{media:null}}}]);assert.equal((result[0].assets as Record<string,{media?:unknown}>).galleryMobileAnimation.media,undefined);assert.deepEqual((result[0].assets as Record<string,{media?:unknown}>).galleryDesktopAnimation,product.assets.galleryDesktopAnimation);
});
await test('cleanup protects both Gallery media references',()=>{
  const snapshot=collectCloudinaryVideoUsage({}, {menu:{products:[product]}});
  assert.ok(snapshot.referencedPublicIds.has(media.publicId));assert.equal(snapshot.referencesByPublicId.get(media.publicId)?.filter(r=>r.field.startsWith('作品詮釋')).length,2);
});
await test('existing image-only asset roles remain image-only',()=>assert.equal(productAssetSupportsVideo('label'),false));
await test('existing generic uploader still offers images and videos',()=>{
  const html=renderToStaticMarkup(createElement(MediaUploader,{onChange:()=>{}}));
  assert.ok(html.includes('accept="image/*"'));assert.ok(html.includes('video/mp4'));
});
await test('existing image-only uploader remains image-only',()=>{
  const html=renderToStaticMarkup(createElement(MediaUploader,{imageOnly:true,onChange:()=>{}}));
  assert.ok(html.includes('accept="image/*"'));assert.ok(!html.includes('video/mp4'));
});
await test('Gallery controls reuse video-only uploader and explain optional mobile fallback',()=>{
  const html=renderToStaticMarkup(createElement(GalleryAnimationControls,{assets:{},libraryAssets:[],onChange:()=>{},onRemove:()=>{}}));
  assert.ok(html.includes('桌機動畫'));assert.ok(html.includes('手機動畫（選填）'));assert.ok(html.includes('自動沿用桌機動畫'));
  assert.equal((html.match(/video\/mp4/g)||[]).length,2);assert.ok(!html.includes('accept="image/*"'));
});
console.log(`GALLERY ASSETS ${checks} PASS; mocked Cloudinary verification, no upload/network/data writes.`);
