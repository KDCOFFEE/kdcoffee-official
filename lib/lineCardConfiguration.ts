import {supportsCustomerFlex} from './customerLineCardEvents';
import {LINE_CARD_CATALOG} from './lineNotificationCardCatalog';
import {LINE_CARD_HEADER_ASSETS} from './lineCardPresentation';
import type {CardFamily} from './lineNotificationCards';

export const CARD_COPY_LIMITS={displayName:80,title:60,intro:240,secondaryText:240,ctaLabel:20,altText:300,footerText:120} as const;
export const CARD_COPY_LABELS={displayName:'卡片名稱',title:'卡片標題',intro:'上方說明',secondaryText:'補充說明',ctaLabel:'按鈕文字',altText:'LINE altText',footerText:'頁尾文字'} as const;
export type CardCopyField=keyof typeof CARD_COPY_LIMITS;
export type LineCardOverride=Partial<Record<CardCopyField,string>>&{presentationMode?:'text'|'flex';headerAsset?:CardFamily;headerImageAssetId?:string};
export type LineCardConfigStore={version:1;revision:number;events:Record<string,{overrides:LineCardOverride;updatedAt:string;updatedBy:string}>};
export const EMPTY_LINE_CARD_CONFIG:LineCardConfigStore={version:1,revision:0,events:{}};
export class LineCardValidationError extends Error {}
export function resolveCardPlaceholders(text:string,allowed:readonly string[],values:Readonly<Record<string,string>>){
 if(typeof text!=='string'||text.length>1500)throw Error('invalid-copy');
 const result=text.replace(/\{\{([^{}]+)\}\}/g,(_,key:string)=>{if(!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)||!allowed.includes(key)||!Object.hasOwn(values,key))throw Error('unknown-placeholder');return boundedPlaceholder(values[key]);});if(/[{}]/u.test(result))throw Error('invalid-placeholder');return result;
}
function boundedPlaceholder(value:unknown){if(typeof value!=='string'||!value.trim()||value.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))throw Error('invalid-string');return value.trim();}
export function cardDefinition(eventKey:string){const def=LINE_CARD_CATALOG.find(d=>d.eventKey===eventKey);if(!def)throw new LineCardValidationError('找不到這種通知卡片。');return def;}
export function cardDefaults(eventKey:string){const def=cardDefinition(eventKey);return {displayName:def.displayName,...def.defaultCopy};}
export function validateLineCardOverride(eventKey:string,input:unknown):LineCardOverride{
 const def=cardDefinition(eventKey),defaults=cardDefaults(eventKey);
 if(!input||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new LineCardValidationError('卡片設定格式不正確。');
 const result:LineCardOverride={};
 for(const key of Reflect.ownKeys(input)){
  if(typeof key!=='string'||!('value'in Object.getOwnPropertyDescriptor(input,key)!))throw new LineCardValidationError('卡片包含不允許修改的欄位。');
  const value=(input as Record<string,unknown>)[key];
  if(key==='presentationMode'){if(!supportsCustomerFlex(eventKey)||typeof value!=='string'||!['text','flex'].includes(value))throw new LineCardValidationError('此事件不支援此顯示方式。');if(value==='flex')result.presentationMode='flex';continue;}
  if(key==='headerImageAssetId'){if(typeof value!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_-]{0,120}$/.test(value))throw new LineCardValidationError('請選擇有效的素材庫圖片。');result.headerImageAssetId=value;continue;}
  if(key==='headerAsset'){if(typeof value!=='string'||!Object.hasOwn(LINE_CARD_HEADER_ASSETS,value))throw new LineCardValidationError('請選擇已核准的抬頭圖片。');result.headerAsset=value as CardFamily;continue;}
  if(!Object.hasOwn(CARD_COPY_LIMITS,key))throw new LineCardValidationError('卡片包含不允許修改的欄位。');
  const field=key as CardCopyField;
  if(typeof value!=='string'||value.length>CARD_COPY_LIMITS[field]||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))throw new LineCardValidationError(CARD_COPY_LABELS[field]+'超過長度限制或格式不正確。');
  const text=value.trim();if(!text&&!['secondaryText','footerText'].includes(field))throw new LineCardValidationError(CARD_COPY_LABELS[field]+'不可空白。');
  try{resolveCardPlaceholders(text,field==='displayName'?[]:def.allowedPlaceholders,Object.fromEntries(def.allowedPlaceholders.map(key=>[key,'範例'])));}catch{throw new LineCardValidationError(CARD_COPY_LABELS[field]+'含有未允許的動態欄位，請使用下方插入按鈕。');}
  if(text!==defaults[field])result[field]=text;
 }
 if(result.headerAsset&&result.headerImageAssetId)throw new LineCardValidationError('圖片來源不可重複。');
 return result;
}
export function resolveLineCardConfig(eventKey:string,override:unknown={}){
 const clean=validateLineCardOverride(eventKey,override),defaults=cardDefaults(eventKey);const {displayName,headerAsset,headerImageAssetId,presentationMode,...copy}=clean;
 return {displayName:displayName??defaults.displayName,copy:{...cardDefinition(eventKey).defaultCopy,...copy},headerAsset,headerImageAssetId,presentationMode:presentationMode??'text'};
}
