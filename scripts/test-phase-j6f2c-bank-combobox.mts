import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
// Node 24 hook API; the repository's older Node declarations do not expose it yet.
type HookContext={parentURL?:string};
const {registerHooks}=createRequire(import.meta.url)("node:module") as {registerHooks:(hooks:{resolve:(specifier:string,context:HookContext,next:(specifier:string,context:HookContext)=>unknown)=>unknown;load:(id:string,context:Record<string,unknown>,next:(id:string,context:Record<string,unknown>)=>unknown)=>unknown})=>void};
const react=pathToFileURL(createRequire(import.meta.url).resolve("react")).href;
const source="export * from "+JSON.stringify(react)+";export const useState=(...args)=>globalThis.__bankHooks.useState(...args);export const useRef=(...args)=>globalThis.__bankHooks.useRef(...args);export const useId=()=> 'bank-test';export const useEffect=()=>{};";
const url="data:text/javascript,"+encodeURIComponent(source);
registerHooks({resolve(specifier,context,next){if(specifier==="react"&&context.parentURL?.endsWith("/RefundBankCombobox.tsx"))return{url,shortCircuit:true};return next(specifier,context);},load(id,context,next){if(id===url)return{format:"module",source,shortCircuit:true};return next(id,context);}});
const {default:Combobox}=await import("../components/member/RefundBankCombobox");
const slots:unknown[]=[];let cursor=0,edits=0,count=0;
const record=globalThis as unknown as Record<string,unknown>;record.__bankHooks={useState(initial:unknown){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],(next:unknown)=>{slots[i]=next;}];},useRef(initial:unknown){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];}};
function nodes(v:unknown):Array<{type:unknown;props:Record<string,unknown>}>{if(Array.isArray(v))return v.flatMap(nodes);if(!v||typeof v!=="object"||!("props"in v))return[];const e=v as {type:unknown;props:Record<string,unknown>};return[e,...nodes(e.props.children)];}
const draw=()=>{cursor=0;return nodes(Combobox({disabled:false,label:"銀行",placeholder:"搜尋",onEdited:()=>{edits++;}}));};
const check=(label:string,fn:()=>void)=>{fn();console.log("PASS "+(++count)+" "+label);};
try{
 let ui=draw(),input=ui.find(e=>e.type==="input")!;check("accessible manual combobox",()=>{assert.equal(input.props.role,"combobox");assert.equal(input.props["aria-autocomplete"],"list");});
 (input.props.onChange as (e:unknown)=>void)({target:{value:"822"}});ui=draw();check("code suggestions show Chinese name",()=>assert.ok(JSON.stringify(ui).includes("中國信託商業銀行")));input=ui.find(e=>e.type==="input")!;
 (input.props.onKeyDown as (e:unknown)=>void)({key:"ArrowDown",preventDefault(){}});ui=draw();input=ui.find(e=>e.type==="input")!;check("keyboard highlights option",()=>assert.equal(input.props["aria-activedescendant"],"bank-test-0"));
 (input.props.onKeyDown as (e:unknown)=>void)({key:"Enter",preventDefault(){}});ui=draw();input=ui.find(e=>e.type==="input")!;check("Enter selects bank code and name",()=>assert.equal(input.props.value,"822｜中國信託商業銀行"));check("selection requests field-error refresh",()=>assert.equal(edits,1));
 (input.props.onChange as (e:unknown)=>void)({target:{value:"自訂退款銀行"}});ui=draw();input=ui.find(e=>e.type==="input")!;check("manual unlisted text preserved",()=>assert.equal(input.props.value,"自訂退款銀行"));
 (input.props.onKeyDown as (e:unknown)=>void)({key:"ArrowDown",preventDefault(){}});ui=draw();input=ui.find(e=>e.type==="input")!;check("unlisted manual input never highlights nonexistent option",()=>assert.equal(input.props["aria-activedescendant"],undefined));
 (input.props.onChange as (e:unknown)=>void)({target:{value:"臺灣銀行"}});ui=draw();const option=ui.find(e=>e.props.role==="option")!;(option.props.onClick as ()=>void)();ui=draw();input=ui.find(e=>e.type==="input")!;check("pointer selection works",()=>assert.equal(input.props.value,"004｜臺灣銀行"));
 (input.props.onFocus as ()=>void)();ui=draw();input=ui.find(e=>e.type==="input")!;(input.props.onKeyDown as (e:unknown)=>void)({key:"Escape",preventDefault(){}});ui=draw();check("Escape closes list without deleting value",()=>{const current=ui.find(e=>e.type==="input")!;assert.equal(current.props["aria-expanded"],false);assert.equal(current.props.value,"004｜臺灣銀行");});
}finally{delete record.__bankHooks;}
console.log("J6F2C BANK COMBOBOX "+count+" PASS");
