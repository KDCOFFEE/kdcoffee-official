import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
type Context={parentURL?:string};const {registerHooks}=createRequire(import.meta.url)("node:module") as {registerHooks:(hooks:{resolve:(specifier:string,context:Context,next:(specifier:string,context:Context)=>unknown)=>unknown;load:(id:string,context:Record<string,unknown>,next:(id:string,context:Record<string,unknown>)=>unknown)=>unknown})=>void};
const react=pathToFileURL(createRequire(import.meta.url).resolve("react")).href;
const source="export * from "+JSON.stringify(react)+";export const useState=(...a)=>globalThis.__lightboxHooks.useState(...a);export const useRef=(...a)=>globalThis.__lightboxHooks.useRef(...a);export const useEffect=(...a)=>globalThis.__lightboxHooks.useEffect(...a);";
const reactUrl="data:text/javascript,"+encodeURIComponent(source),portalUrl="data:text/javascript,export const createPortal=(child)=>child;";
registerHooks({resolve(specifier,context,next){if(context.parentURL?.endsWith("/AttachmentLightbox.tsx")){if(specifier==="react")return{url:reactUrl,shortCircuit:true};if(specifier==="react-dom")return{url:portalUrl,shortCircuit:true};}return next(specifier,context);},load(url,context,next){if(url===reactUrl)return{format:"module",source,shortCircuit:true};return next(url,context);}});
const {default:Lightbox}=await import("../components/shared/AttachmentLightbox");
const globalRecord=globalThis as unknown as Record<string,unknown>,previousDocument=globalRecord.document;const slots:unknown[]=[];let cursor=0,dependency:unknown,cleanup:(()=>void)|undefined,pending:(()=>void|(()=>void))|undefined,focused="",shown=0,n=0;
const body={style:{overflow:"auto"}},location={href:"http://localhost:3162/admin/returns/KD20261030-9304"};globalRecord.document={body,location};
const trigger={focus(){focused="thumbnail";}},closeButton={focus(){focused="close";}},dialog={open:false,showModal(){this.open=true;shown++;},close(){this.open=false;}};
globalRecord.__lightboxHooks={useState(initial:unknown){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],(v:unknown)=>{slots[i]=v;}];},useRef(initial:unknown){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(fn:()=>void|(()=>void),deps:unknown[]){if(dependency!==deps[0]){dependency=deps[0];pending=fn;}}};
function nodes(v:unknown):Array<{type:unknown;props:Record<string,unknown>}>{if(Array.isArray(v))return v.flatMap(nodes);if(!v||typeof v!=="object"||!("props"in v))return[];const item=v as {type:unknown;props:Record<string,unknown>};return[item,...nodes(item.props.children)];}
let src="/uploads/order-notifications/11111111-1111-4111-a111-111111111111.webp";
function draw(){cursor=0;const ui=nodes(Lightbox({src,alt:"退貨照片",width:80,height:64}));for(const node of ui){if(node.type==="dialog")(node.props.ref as {current:unknown}).current=dialog;if(node.props["aria-haspopup"]==="dialog")(node.props.ref as {current:unknown}).current=trigger;if(node.props["aria-label"]==="關閉圖片預覽")(node.props.ref as {current:unknown}).current=closeButton;}if(pending){cleanup?.();const fn=pending;pending=undefined;cleanup=fn()??undefined;}return ui;}
const check=(label:string,fn:()=>void)=>{fn();console.log("PASS "+(++n)+" "+label);};
const open=()=>{const ui=draw();(ui.find(v=>v.props["aria-haspopup"]==="dialog")!.props.onClick as ()=>void)();return draw();};
try{
 let ui=draw();check("thumbnail is a button without navigation",()=>{const button=ui.find(v=>v.type==="button")!;assert.equal(button.props.type,"button");assert.equal(button.props.href,undefined);assert.equal(button.props.target,undefined);});
 ui=open();check("inline dialog opens with full image",()=>{assert.equal(dialog.open,true);assert.equal(shown,1);assert.equal(ui.find(v=>v.type==="dialog")!.props["aria-modal"],"true");assert.ok(ui.some(v=>v.type==="img"&&v.props.src===src));});check("focus enters modal",()=>assert.equal(focused,"close"));check("background scrolling locked",()=>assert.equal(body.style.overflow,"hidden"));
 const modal=ui.find(v=>v.type==="dialog")!;(modal.props.onClick as (e:unknown)=>void)({target:{tagName:"IMG"},currentTarget:dialog});check("image click keeps modal open",()=>assert.equal(dialog.open,true));
 (ui.find(v=>v.props["aria-label"]==="關閉圖片預覽")!.props.onClick as ()=>void)();draw();check("close button closes and restores focus",()=>{assert.equal(dialog.open,false);assert.equal(focused,"thumbnail");});check("body scroll restored",()=>assert.equal(body.style.overflow,"auto"));
 ui=open();let prevented=false;(ui.find(v=>v.type==="dialog")!.props.onCancel as (e:unknown)=>void)({preventDefault(){prevented=true;}});draw();check("Escape closes without navigation",()=>{assert.equal(prevented,true);assert.equal(dialog.open,false);assert.equal(focused,"thumbnail");});
 ui=open();(ui.find(v=>v.type==="dialog")!.props.onClick as (e:unknown)=>void)({target:dialog,currentTarget:dialog});draw();check("dark backdrop closes",()=>assert.equal(dialog.open,false));check("current page URL unchanged",()=>assert.equal(location.href,"http://localhost:3162/admin/returns/KD20261030-9304"));
 src="blob:second-selected-photo";ui=open();check("each thumbnail opens its exact image",()=>assert.ok(ui.some(v=>v.type==="img"&&v.props.src===src)));
 const css=fs.readFileSync("components/shared/AttachmentLightbox.module.css","utf8");check("viewport containment and preserved aspect ratio",()=>{assert.ok(css.includes("object-fit:contain")&&css.includes("100dvh - 100px")&&css.includes("100vw - 32px"));});check("close button remains reachable on mobile",()=>assert.ok(css.includes("safe-area-inset-top")&&css.includes("width:44px")));
}finally{cleanup?.();globalRecord.document=previousDocument;delete globalRecord.__lightboxHooks;}
console.log("J6F2C ATTACHMENT LIGHTBOX "+n+" PASS");
