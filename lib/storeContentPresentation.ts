import type { CSSProperties } from "react";
import { VISUAL_COLOR_PRESETS, visualColorHex, type VisualColorValue } from "./pageBuilderVisualStyle";
export type StudioDeviceStyle = {
  marginTop?: number; marginBottom?: number; gap?: number; fit?: "cover" | "contain"; focalX?: number; focalY?: number;
  headingSize?: number; bodySize?: number; fontPreset?: "display" | "body" | "system";
  weight?: 300 | 400 | 500 | 700; lineHeight?: number; letterSpacing?: number;
  alignment?: "left" | "center" | "right"; top?: number; bottom?: number; horizontal?: number;
  width?: "narrow" | "normal" | "wide" | "full"; visible?: boolean;
  mediaPosition?: "left" | "right" | "top" | "bottom"; aspect?: "original" | "square" | "landscape" | "portrait";
};
/** One content tree, sparse responsive overrides; omission retains the accepted renderer. */
export type StudioPresentation = { desktop?: StudioDeviceStyle; mobile?: StudioDeviceStyle & { content?: StudioMobileContent }; textColor?: VisualColorValue; backgroundColor?: VisualColorValue; buttonColor?: VisualColorValue; buttonTextColor?: VisualColorValue };
export const STUDIO_BRAND_COLORS = [{ value: "coffee", label: "深咖啡" }, { value: "warm-gray", label: "暖灰" }, { value: "ivory", label: "象牙白" }, { value: "gold", label: "品牌金" }, { value: "#eee5d8", label: "暖米" }] as const;
export function isStudioColor(v: unknown): v is VisualColorValue { return typeof v === "string" && ((VISUAL_COLOR_PRESETS as readonly string[]).includes(v) || /^#[0-9a-fA-F]{6}$/u.test(v)); }
function object(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Reflect.ownKeys(v).some(k => typeof k !== "string" || !keys.includes(k) || !('value' in Object.getOwnPropertyDescriptor(v,k)!))) throw new Error("視覺設定格式不正確。");
}
export function validateStudioPresentation(v: unknown): asserts v is StudioPresentation {
  object(v, ["desktop","mobile","textColor","backgroundColor","buttonColor","buttonTextColor"]);
  for (const key of ["textColor","backgroundColor","buttonColor","buttonTextColor"]) if (v[key] !== undefined && !isStudioColor(v[key])) throw new Error("請使用品牌色或有效的六碼色彩。");
  const ranges = { headingSize:[16,96], bodySize:[12,32], lineHeight:[1,2.5], letterSpacing:[-1,8], top:[0,240], bottom:[0,240], horizontal:[0,96], marginTop:[0,240], marginBottom:[0,240], gap:[0,120], focalX:[0,100], focalY:[0,100] } as const;
  const enums = { fontPreset:["display","body","system"], alignment:["left","center","right"], width:["narrow","normal","wide","full"], aspect:["original","square","landscape","portrait"], fit:["cover","contain"] };
  for (const device of ["desktop","mobile"]) { const d=v[device]; if (d === undefined) continue; object(d,[...Object.keys(ranges),...Object.keys(enums),"visible","weight","mediaPosition",...(device === "mobile" ? ["content"] : [])]);
    if (device === "mobile" && d.content !== undefined) validateStudioMobileContent(d.content);
    for (const [k,[min,max]] of Object.entries(ranges)) if (d[k] !== undefined && (typeof d[k] !== "number" || !Number.isFinite(d[k]) || d[k] < min || d[k] > max)) throw new Error("字級或間距超出安全範圍。");
    for (const [k,values] of Object.entries(enums)) if (d[k] !== undefined && !(values as unknown[]).includes(d[k])) throw new Error("請選擇有效的視覺選項。");
    if (d.weight !== undefined && ![300,400,500,700].includes(d.weight as number)) throw new Error("字重不正確。");
    if (d.visible !== undefined && typeof d.visible !== "boolean") throw new Error("顯示設定不正確。");
    if (d.mediaPosition !== undefined && !(device === "desktop" ? ["left","right"] : ["top","bottom"]).includes(d.mediaPosition as string)) throw new Error("圖片位置不正確。");
  }
}
const widths={narrow:"640px",normal:"780px",wide:"1180px",full:"100%"};
const fonts={display:"var(--font-display)",body:"var(--font-body)",system:"system-ui, sans-serif"};
const aspects={original:"auto",square:"1 / 1",landscape:"4 / 3",portrait:"3 / 4"};
export function studioPresentationProps(p?: StudioPresentation, headingDefault=34, bodyDefault=15): {style?:CSSProperties} & Record<`data-${string}`,string> {
  if (!p) return {};
  const style: Record<string,string|number>={}, attrs: Record<string,string>={}; const d=p.desktop||{},m={...d,...p.mobile};
  for (const [device,s] of [["d",d],["m",m]] as const) {
    const values={heading:s.headingSize??headingDefault,body:s.bodySize??bodyDefault,font:s.fontPreset?fonts[s.fontPreset]:"inherit",weight:s.weight??500,line:s.lineHeight??1.8,tracking:s.letterSpacing??0,alignment:s.alignment??"left",top:s.top??30,bottom:s.bottom??30,horizontal:s.horizontal??0,width:s.width?widths[s.width]:"100%",visible:s.visible===false?"none":"",aspect:s.aspect?aspects[s.aspect]:"auto",marginTop:s.marginTop??0,marginBottom:s.marginBottom??0,gap:s.gap??24,fit:s.fit??"cover",focal:`${s.focalX??50}% ${s.focalY??50}%`};
    for(const [key,v]of Object.entries(values))style[`--studio-${device}-${key}`]=["heading","body","top","bottom","horizontal","tracking","marginTop","marginBottom","gap"].includes(key)?`${v}px`:v;
    for(const [key,value]of Object.entries(s))if(key!=="content"&&value!==undefined)attrs[`data-studio-${device}-${key}`.toLowerCase()]=key==="visible"?String(value):"true";
    if(s.mediaPosition)attrs[`data-studio-${device}-media`]=s.mediaPosition;
  }
  for(const key of ["textColor","backgroundColor","buttonColor","buttonTextColor"] as const)if(p[key]){style[`--studio-${key}`]=visualColorHex(p[key]);attrs[`data-studio-${key}`.toLowerCase()]="true";}
  return {...attrs,style:style as CSSProperties};
}

/** Formatting only: caller supplies canonical Store PV and configured global point name. */
export function studioCardEditorial(card: {label:string|null;summary:string|null}|null|undefined,pvValue:number,pointName:string,showPoints:boolean){
 return {...(card?.label!==null&&card?.label!==undefined?{label:card.label}:{}),...(card?.summary!==null&&card?.summary!==undefined?{summary:card.summary}:{}),...(showPoints&&pointName&&pvValue>0?{pointsText:`可獲得 ${pvValue.toLocaleString("zh-TW")} ${pointName}`}:{})};
}


export const STUDIO_TEXT_FIELDS = ["eyebrow", "heading", "subheading", "body", "caption", "ctaLabel"] as const;
export type StudioTextField = typeof STUDIO_TEXT_FIELDS[number];
/** Sparse content lives in the existing mobile presentation namespace, never a second page. */
export type StudioMobileContent = Partial<Record<StudioTextField,string>> & {
  rows?: {label:string;value:string}[];
  galleryCaptions?: Record<string,string>;
};
function studioText(value:unknown, max:number) {
  if(typeof value!=="string" || Array.from(value).length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value) || Array.from(value).some(c=>{const n=c.codePointAt(0)!;return n>=0xd800&&n<=0xdfff;}))throw new Error("手機文字格式不正確。");
}
export function validateStudioMobileContent(value:unknown): asserts value is StudioMobileContent {
  object(value,[...STUDIO_TEXT_FIELDS,"rows","galleryCaptions"]);
  for(const key of STUDIO_TEXT_FIELDS)if(Object.hasOwn(value,key))studioText(value[key],key==="body"?20000:key==="caption"?2000:400);
  if(Object.hasOwn(value,"rows")){
    if(!Array.isArray(value.rows)||value.rows.length>40)throw new Error("手機資訊表格式不正確。");
    for(const row of value.rows){object(row,["label","value"]);studioText(row.label,400);studioText(row.value,4000);if(!(row.label as string).trim()||!(row.value as string).trim())throw new Error("請填寫資訊表內容。");}
  }
  if(Object.hasOwn(value,"galleryCaptions")){
    const captions=value.galleryCaptions;if(!captions||typeof captions!=="object"||Array.isArray(captions))throw new Error("手機圖片說明格式不正確。");
    const keys=Reflect.ownKeys(captions);if(keys.length>24)throw new Error("手機圖片說明過多。");
    object(captions,keys.filter((k):k is string=>typeof k==="string"));
    for(const [url,caption]of Object.entries(captions)){if(url.length>2048||!["/uploads/assets/","https://"].some(prefix=>url.startsWith(prefix)))throw new Error("手機圖片說明引用不正確。");studioText(caption,2000);}
  }
}
export function resolveStudioContent<T extends object>(base:T,presentation:StudioPresentation|undefined,device:"desktop"|"mobile"):T & StudioMobileContent {
  return {...base,...(device==="mobile"?presentation?.mobile?.content:undefined)};
}
/** undefined deletes only the selected override; an explicit empty string is a mobile blank. */
export function updateStudioMobileContent<K extends keyof StudioMobileContent>(presentation:StudioPresentation|undefined,key:K,value:StudioMobileContent[K]|undefined):StudioPresentation {
  const next=structuredClone(presentation||{}),mobile={...next.mobile},content={...mobile.content};
  if(value===undefined)delete content[key];else content[key]=value;
  if(Object.keys(content).length)mobile.content=content;else delete mobile.content;
  if(Object.keys(mobile).length)next.mobile=mobile;else delete next.mobile;
  return next;
}

/** Resolve an editorial section identity independently of canonical Product identity. */
export function studioSectionById<T extends {id:string}>(sections:readonly T[]|undefined,id:string):T|undefined {return sections?.find(section=>section.id===id);}
