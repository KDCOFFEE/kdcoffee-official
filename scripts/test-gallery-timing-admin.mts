import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createElement,Fragment} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {resolveHeroTiming,PREMIUM_HERO_TIMING} from '../lib/homepageCms';import Controls from '../components/admin/GalleryTimingControls';import Seconds from '../components/admin/SecondsTimingControl';
const site=JSON.parse(await fs.readFile('public/data/website-data.json','utf8'));const work={...site.menu.products[0],galleryRevealTiming:{titleHookAt:3,interpretationAt:4.3,coffeeBridgeAt:5,ctaAt:5.6}};let count=0;function test(name:string,fn:()=>void){fn();count++;console.log('PASS '+name);}
test('Admin has four shared range/numeric pairs, no duplicate mobile timing',()=>{const html=renderToStaticMarkup(createElement(Controls,{work,onChange(){}}));assert.equal((html.match(/type="range"/g)||[]).length,4);assert.equal((html.match(/type="number"/g)||[]).length,4);for(const text of ['作品詮釋進場效果','標題／吸引句','作品詮釋','咖啡連結','走進作品','預覽進場動畫','5.6'])assert.ok(html.includes(text));});
test('old work defaults render without creating metadata',()=>{const old={...work};delete old.galleryRevealTiming;const html=renderToStaticMarkup(createElement(Controls,{work:old,onChange(){}}));assert.ok(html.includes('value="3.5"'));assert.ok(html.includes('value="5.0"'));assert.equal(old.galleryRevealTiming,undefined);});
test('both input handlers use the same value callback',()=>{let value=0;const tree=Seconds({seconds:3,onChange:n=>{value=n;}});const children=tree.props.children;children[0].props.onChange({target:{value:'4.3'}});assert.equal(value,4.3);children[1].props.children[0].props.onChange({target:{value:'5.6'}});assert.equal(value,5.6);const html=renderToStaticMarkup(createElement(Seconds,{seconds:value,onChange(){}}));assert.ok(html.includes('value="5.6"'));});
const source=await fs.readFile('components/admin/GalleryTimingControls.tsx','utf8');
test('preview uses current work draft and remount key, blocks navigation',()=>{assert.ok(source.includes('key={`${work.slug}-${replay}`}'));assert.ok(source.includes('setReplay(value => value + 1)'));assert.ok(source.includes('work={draft}'));assert.ok(source.includes('event.preventDefault()'));});
for(const seconds of [0,1.7,3.5,10])test('Homepage input DOM remains unchanged at '+seconds,()=>{
 const legacy=createElement(Fragment,null,createElement('input',{type:'range',min:'0',max:'10',step:'0.1',value:seconds,onChange(){}}),createElement('span',{className:'hero-timing-value'},createElement('input',{type:'number',min:'0',max:'10',step:'0.1',value:seconds.toFixed(1),onChange(){}}),createElement('span',null,'秒')));
 assert.equal(renderToStaticMarkup(createElement(Seconds,{seconds,onChange(){}})),renderToStaticMarkup(legacy));
});
const oldPair='<input type="range" min="0" max="10" step="0.1" value={timing[key] / 1000} onChange={(event) => updateTiming(key, Number(event.target.value))} /><span className="hero-timing-value"><input type="number" min="0" max="10" step="0.1" value={(timing[key] / 1000).toFixed(1)} onChange={(event) => updateTiming(key, Number(event.target.value))} /><span>秒</span></span>';
for(const file of ['components/admin/HomepageEditors.tsx','components/admin/HomepageManager.tsx']){
 const current=(await fs.readFile(file,'utf8')).replaceAll('\r\n','\n'),baseline=execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
 test(file+' preserves original timing conversion, replay, device and save behavior',()=>{
  assert.equal(current.replace('import SecondsTimingControl from "@/components/admin/SecondsTimingControl";\n','').replace('<SecondsTimingControl seconds={timing[key] / 1000} onChange={seconds => updateTiming(key, seconds)}/>',oldPair),baseline);
 });
}
test('Gallery settings do not replace Homepage timing defaults or stored content',()=>{
 assert.deepEqual(resolveHeroTiming(undefined),PREMIUM_HERO_TIMING);
 assert.equal(execFileSync('git',['diff','HEAD','--','public/data/homepage.json'],{encoding:'utf8'}),'');
});
console.log('GALLERY TIMING ADMIN '+count+' PASS; Homepage contract/SSR and isolated handlers.');
