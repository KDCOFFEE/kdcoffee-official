import {LINE_CARD_CATALOG} from './lineNotificationCardCatalog';
import {supportsCardPresentation} from './lineCardDeliverySupport';
import {LineCardValidationError,type LineCardConfigStore} from './lineCardConfiguration';

export type BulkAudience='all'|'customer'|'admin';
export type CardModeFilter='all'|'flex'|'text'|'unsupported';
export type BulkModeRequest=
 |{action:'set-mode';audience:BulkAudience;presentationMode:'text'|'flex';eventKeys:string[];expectedRevision:number}
 |{action:'set-exclusions';excludedEventKeys:string[];expectedRevision:number};

export function validateExcludedCardKeys(value:unknown):string[]{
 if(!Array.isArray(value)||value.length>LINE_CARD_CATALOG.length||value.some(k=>typeof k!=='string'||!LINE_CARD_CATALOG.some(d=>d.eventKey===k))||new Set(value).size!==value.length)throw new LineCardValidationError('例外清單含有不合法或重複的事件。');
 return [...value];
}
export function parseBulkModeRequest(value:unknown):BulkModeRequest{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).some(k=>typeof k!=='string'||!('value'in Object.getOwnPropertyDescriptor(value,k)!)))throw new LineCardValidationError('批次設定格式不正確。');
 const b=value as Record<string,unknown>;
 if(!Number.isSafeInteger(b.expectedRevision)||Number(b.expectedRevision)<0||Number(b.expectedRevision)>=Number.MAX_SAFE_INTEGER)throw new LineCardValidationError('設定版本不正確。');
 if(b.action==='set-exclusions'){
  if(Object.keys(b).some(k=>!['action','excludedEventKeys','expectedRevision'].includes(k)))throw new LineCardValidationError('例外操作包含不允許的欄位。');
  const keys=validateExcludedCardKeys(b.excludedEventKeys);
  if(keys.some(k=>!supportsCardPresentation(k)))throw new LineCardValidationError('只能為已支援正式卡片發送的事件設定批次例外。');
  return {action:b.action,excludedEventKeys:keys,expectedRevision:b.expectedRevision as number};
 }
 if(b.action!=='set-mode'||Object.keys(b).some(k=>!['action','audience','presentationMode','eventKeys','expectedRevision'].includes(k))||typeof b.audience!=='string'||!['all','customer','admin'].includes(b.audience)||typeof b.presentationMode!=='string'||!['text','flex'].includes(b.presentationMode))throw new LineCardValidationError('批次操作只允許設定顯示方式。');
 const keys=validateExcludedCardKeys(b.eventKeys);
 if(keys.some(k=>!supportsCardPresentation(k)))throw new LineCardValidationError('批次清單包含不支援 Flex 的事件。');
 return {action:b.action,audience:b.audience as BulkAudience,presentationMode:b.presentationMode as 'text'|'flex',eventKeys:keys,expectedRevision:b.expectedRevision as number};
}
export function cardPresentationState(key:string,store:LineCardConfigStore):'flex'|'text'|'unsupported'{
 return supportsCardPresentation(key)?store.events[key]?.overrides.presentationMode==='flex'?'flex':'text':'unsupported';
}
export function cardHasCustomContent(key:string,store:LineCardConfigStore){return Object.keys(store.events[key]?.overrides??{}).some(k=>k!=='presentationMode');}
export function lineCardBulkPlan(store:LineCardConfigStore,audience:BulkAudience,mode:'text'|'flex'){
 const scoped=LINE_CARD_CATALOG.filter(d=>audience==='all'||d.recipient===audience);
 const supported=scoped.filter(d=>supportsCardPresentation(d.eventKey));
 const exceptions=supported.filter(d=>store.bulkExcludedEventKeys?.includes(d.eventKey));
 const eligible=supported.filter(d=>!store.bulkExcludedEventKeys?.includes(d.eventKey));
 const changes=eligible.filter(d=>cardPresentationState(d.eventKey,store)!==mode);
 return {revision:store.revision,audience,mode,supported,eligible,exceptions,changes,unsupported:scoped.filter(d=>!supportsCardPresentation(d.eventKey)),flexCount:eligible.filter(d=>cardPresentationState(d.eventKey,store)==='flex').length,textCount:eligible.filter(d=>cardPresentationState(d.eventKey,store)==='text').length};
}
