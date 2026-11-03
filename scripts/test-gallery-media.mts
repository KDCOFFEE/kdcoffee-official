import assert from 'node:assert/strict';import {createRequire} from 'node:module';import * as nodeModule from 'node:module';
const {registerHooks}=nodeModule as unknown as {registerHooks(hooks:{resolve:(s:string,c:{parentURL?:string},next:(s:string,c:{parentURL?:string})=>unknown)=>unknown}):unknown};import {pathToFileURL} from 'node:url';
const react=pathToFileURL(createRequire(import.meta.url).resolve('react')).href;
const hook='data:text/javascript,'+encodeURIComponent(`export * from ${JSON.stringify(react)};export const useState=(value)=>globalThis.__galleryMediaHooks.state(value);export const useRef=(value)=>globalThis.__galleryMediaHooks.ref(value);export const useEffect=(fn,deps)=>globalThis.__galleryMediaHooks.effect(fn,deps);`);
registerHooks({resolve(s,c,next){if(s==='react'&&c.parentURL?.includes('/GalleryMedia.tsx'))return {url:hook,shortCircuit:true};return next(s,c);}});
const {default:Media}=await import('../components/gallery/GalleryMedia');
const values:unknown[]=[];let stateCursor=0,refCursor=0,effects:Array<()=>void|(()=>void)>=[];const refs:Array<{current:unknown}>=[{current:null},{current:{}}];let mobile=false,reduced=false,saveData=false,motionChange=()=>{},visibilityChange=()=>{},observerDisconnect=0,playCount=0,pauseCount=0;const fakeVideo={muted:false,play:async()=>{playCount++;},pause:()=>{pauseCount++;}};
Object.defineProperty(globalThis,'__galleryMediaHooks',{value:{state(initial:unknown){const i=stateCursor++;if(!(i in values))values[i]=initial;return [values[i],(value:unknown)=>{values[i]=typeof value==='function'?(value as (v:unknown)=>unknown)(values[i]):value;}];},ref(){return refs[refCursor++];},effect(fn:()=>void|(()=>void)){effects.push(fn);}},configurable:true});
Object.defineProperty(globalThis,'matchMedia',{value:(query:string)=>({get matches(){return query.includes('max-width')?mobile:reduced;},addEventListener:(_name:string,fn:()=>void)=>{motionChange=fn;},removeEventListener:()=>{}}),configurable:true});
Object.defineProperty(globalThis,'navigator',{value:{connection:{get saveData(){return saveData;}}},configurable:true});Object.defineProperty(globalThis,'document',{value:{hidden:false,addEventListener:(_name:string,fn:()=>void)=>{visibilityChange=fn;},removeEventListener:()=>{}},configurable:true});
Object.defineProperty(globalThis,'IntersectionObserver',{value:class { constructor(private notify:(entries:Array<{isIntersecting:boolean}>)=>void){}observe(){this.notify([{isIntersecting:true}]);}disconnect(){observerDisconnect++;}},configurable:true});
const work={slug:'test',title:'作品',englishTitle:'',artist:'',hook:'',interpretation:'',coffeeBridge:'',stageImage:'/images/poster.webp',stageVideo:'/videos/fixture.mp4',mobileVideo:'',mobilePosterImage:'',posterImage:'/images/poster.webp',thumbnailImage:'',imageAlt:'作品視覺',published:true as const,sortOrder:1};
let reported: {mode:string;duration?:number}|undefined;
function render(active=true){stateCursor=0;refCursor=0;effects=[];return Media({work,active,onPlayback:state=>{reported=state;}});}
type NodeLike={type?:unknown;props?:{children?:unknown;[key:string]:unknown}};function find(tree:unknown,type:string):NodeLike|undefined{if(!tree||typeof tree!=='object')return;const node=tree as NodeLike;if(node.type===type)return node;const kids=node.props?.children;for(const child of Array.isArray(kids)?kids:[kids]){const result=find(child,type);if(result)return result;}}
let checks=0;function test(name:string,run:()=>void){run();checks++;console.log('PASS '+name);}
let tree=render();test('SSR/initial render has poster and no video network source',()=>assert.ok(!find(tree,'video')));const observerCleanup=effects[0]();tree=render();let video=find(tree,'video')!;
test('active visible motion-allowed work mounts one muted inline looping video',()=>{assert.ok(video);for(const field of ['autoPlay','muted','playsInline','loop'])assert.equal(video.props?.[field],true);assert.equal(video.props?.preload,'metadata');});
test('media utility exposes pause action and unpressed state while playing, with no visible label',()=>{const button=find(tree,'button')!;assert.equal(button.props?.['aria-label'],'暫停作品動態');assert.equal(button.props?.['aria-pressed'],false);assert.ok(find(button,'svg'));assert.ok(!find(button,'span'));(button.props?.onClick as ()=>void)();});
tree=render();test('media utility toggles to play action and pressed state when manually paused',()=>{const button=find(tree,'button')!;assert.equal(button.props?.['aria-label'],'播放作品動態');assert.equal(button.props?.['aria-pressed'],true);(button.props?.onClick as ()=>void)();});tree=render();
refs[0].current=fakeVideo;const playbackCleanup=effects[1]();test('active playback starts muted',()=>{assert.equal(playCount,1);assert.equal(fakeVideo.muted,true);});if(typeof playbackCleanup==='function')playbackCleanup();test('switch/unmount pauses prior native video',()=>assert.ok(pauseCount>=1));
tree=render(false);test('inactive work removes video node and source',()=>assert.ok(!find(tree,'video')));
tree=render();video=find(tree,'video')!;(video.props?.onError as ()=>void)();tree=render();test('video error removes failed node while poster remains',()=>{assert.ok(!find(tree,'video'));assert.ok(tree.props.children);});
values[2]='';reduced=true;motionChange();tree=render();test('reduced motion prevents autoplay node',()=>assert.ok(!find(tree,'video')));
reduced=false;saveData=true;motionChange();tree=render();test('save-data prevents autoplay node',()=>assert.ok(!find(tree,'video')));
values[2]='';saveData=false;reduced=false;motionChange();tree=render();refs[0].current=fakeVideo;effects[1]();const pausedBefore=pauseCount;(document as unknown as {hidden:boolean}).hidden=true;visibilityChange();test('hidden tab pauses native playback',()=>assert.ok(pauseCount>pausedBefore));(document as unknown as {hidden:boolean}).hidden=false;
values[1]=false;tree=render();test('offscreen work removes video source',()=>assert.ok(!find(tree,'video')));values[1]=true;
for(let i=0;i<12;i++){tree=render(i%2===0);test('rapid switch '+i+' never mounts an inactive video',()=>assert.equal(Boolean(find(tree,'video')),i%2===0));}
if(typeof observerCleanup==='function')observerCleanup();test('observer cleaned up',()=>assert.equal(observerDisconnect,1));
mobile=true;motionChange();tree=render();saveData=false;motionChange();tree=render();test('mobile without dedicated animation uses desktop source',()=>assert.equal(find(tree,'video')?.props?.src,work.stageVideo));
work.mobileVideo='/videos/mobile.mp4';tree=render();test('mobile dedicated animation wins',()=>assert.equal(find(tree,'video')?.props?.src,work.mobileVideo));
mobile=false;motionChange();tree=render();test('desktop ignores mobile animation',()=>assert.equal(find(tree,'video')?.props?.src,work.stageVideo));
work.posterImage='/images/dedicated-poster.webp';tree=render();
let imageNode=tree.props.children[0] as unknown as NodeLike;
test('dedicated poster is preferred over existing work image',()=>assert.equal(imageNode.props?.src,work.posterImage));
(imageNode.props?.onError as ()=>void)();tree=render();imageNode=tree.props.children[0] as unknown as NodeLike;
test('failed poster falls back to existing work image',()=>assert.equal(imageNode.props?.src,work.stageImage));
(imageNode.props?.onError as ()=>void)();tree=render();imageNode=tree.props.children[0] as unknown as NodeLike;
test('all failed images produce controlled placeholder with no empty src',()=>assert.equal(imageNode.props?.src,undefined));
values[2]='';values[3]=true;values[7]=true;values[8]=8;values[9]=work.stageVideo;tree=render();effects[2]();test('playing status reports duration to reveal clock',()=>{assert.equal(reported?.mode,'playing');assert.equal(reported?.duration,8);});
values[3]=false;tree=render();effects[2]();test('paused playback pauses reveal clock',()=>assert.equal(reported?.mode,'paused'));
test('paused native frame stays visible after playback has begun',()=>assert.equal(find(tree,'video')?.props?.className,'videoReady'));
reduced=true;motionChange();tree=render();effects[2]();test('reduced-motion reports the explicit accessibility override',()=>assert.equal(reported?.mode,'reduced'));
reduced=false;saveData=true;motionChange();tree=render();effects[2]();test('save-data reports static elapsed fallback',()=>assert.equal(reported?.mode,'static'));
saveData=false;motionChange();values[2]=work.stageVideo;tree=render();effects[2]();test('video error reports static elapsed fallback',()=>assert.equal(reported?.mode,'static'));
values[2]='';tree=render();refs[0].current={...fakeVideo,play:()=>Promise.reject(new DOMException('Playback blocked','NotAllowedError'))};effects[1]();await Promise.resolve();tree=render();effects[2]();test('autoplay rejection reports static elapsed fallback',()=>assert.equal(reported?.mode,'static'));
console.log('GALLERY MEDIA '+checks+' lifecycle/failure/accessibility checks PASS; fake native video only, no network.');
