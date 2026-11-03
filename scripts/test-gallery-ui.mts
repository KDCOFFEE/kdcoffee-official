import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Stage from '../components/gallery/GalleryStage';
import {resolveGalleryWorks} from '../lib/galleryWorks';
const site=JSON.parse(await fs.readFile('public/data/website-data.json','utf8'));
const work=resolveGalleryWorks(site.menu.products)[0];let count=0;
function test(name:string,fn:()=>void){fn();count++;console.log('PASS '+name);}
for(const device of [undefined,'desktop','mobile'] as const)test('one canonical work CTA and no secondary control in '+(device||'public')+' stage',()=>{
 const html=renderToStaticMarkup(createElement(Stage,{work,active:true,index:0,total:8,previewDevice:device}));
 assert.ok(!html.includes('閱讀作品'));assert.ok(!html.includes('revealButton'));assert.equal((html.match(/href="\/works\//g)||[]).length,1);assert.ok(html.includes('/works/'+work.slug));
});
const css=await fs.readFile('components/gallery/GalleryExperience.module.css','utf8');
test('removed control has no dead CSS or reserved position',()=>assert.ok(!css.includes('revealButton')));
test('media utility has fixed icon-only dimensions and subtle explicit states',()=>{for(const expected of ['width:34px; height:34px','width:32px; height:32px','border-radius:50%','rgba(12,9,7,.34)','rgba(225,205,170,.24)','.motionButton:hover','.motionButton:active','.motionButton:focus-visible'])assert.ok(css.includes(expected));});
test('desktop uses intrinsic uncropped media without changing mobile stage size',()=>{assert.ok(css.includes('.exhibition .media { height:auto; min-height:0; max-height:none; background:transparent; border:0; }'));assert.ok(css.includes('.media > img,.media > video { object-fit:contain; }'));assert.ok(css.includes('height:57vh; min-height:360px; max-height:640px'));});
const reveal=await fs.readFile('components/gallery/GalleryReveal.tsx','utf8');
test('keyboard focus still provides intentional accessible reading without extra button',()=>{assert.ok(reveal.includes('onFocusCapture={reveal}'));assert.ok(reveal.includes('controller.setHidden(document.hidden)'));});
console.log('GALLERY UI '+count+' PASS; shared public/preview SSR and control styling.');
