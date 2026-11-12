import {promises as fs} from 'node:fs';
import path from 'node:path';
import {atomicWriteJson,withFileLock} from './jsonFileStore';
import {getPersistentDataRoot} from './storagePaths';
import {EMPTY_LINE_CARD_CONFIG,LineCardValidationError,validateLineCardOverride,type LineCardConfigStore} from './lineCardConfiguration';
import {LINE_CARD_CATALOG} from './lineNotificationCardCatalog';
import {renderLineFlex} from './lineFlexRenderer';
import {lineCardBulkPlan,parseBulkModeRequest,validateExcludedCardKeys,type BulkModeRequest} from './lineCardBulkMode';
export class LineCardConflictError extends Error {}
export class LineCardStorageError extends Error {}
export function getLineCardConfigFile(){return path.join(getPersistentDataRoot()||path.join(process.cwd(),'data'),'line-notification-cards','configuration.json');}
/** Reads never create, migrate or repair a file. Corruption must not become an empty overwrite. */
export async function readLineCardConfig(file=getLineCardConfigFile()):Promise<LineCardConfigStore>{
 let content:string;try{content=await fs.readFile(/* turbopackIgnore: true */ file,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return structuredClone(EMPTY_LINE_CARD_CONFIG);throw new LineCardStorageError('無法讀取卡片設定。');}
 try{const raw=JSON.parse(content);if(raw.version!==1||!Number.isSafeInteger(raw.revision)||raw.revision<0||!raw.events||typeof raw.events!=='object'||Array.isArray(raw.events))throw Error();
 const events:LineCardConfigStore['events']={};for(const [key,value]of Object.entries(raw.events)){const entry=value as LineCardConfigStore['events'][string];if(!entry||typeof entry.updatedAt!=='string'||!Number.isFinite(Date.parse(entry.updatedAt))||typeof entry.updatedBy!=='string'||!entry.updatedBy)throw Error();validateLineCardOverride(key,entry.overrides);events[key]={...entry,overrides:structuredClone(entry.overrides)};}return {version:1,revision:raw.revision,events,...(Object.hasOwn(raw,'bulkExcludedEventKeys')?{bulkExcludedEventKeys:validateExcludedCardKeys(raw.bulkExcludedEventKeys)}:{})};
 }catch{throw new LineCardStorageError('卡片設定檔案無法驗證，未覆寫任何資料。');}
}
export async function writeLineCardConfig(input:{eventKey:string;overrides?:unknown;action:'save'|'restore';expectedRevision:number;actor:string;filePath?:string}):Promise<LineCardConfigStore>{
 if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||!['save','restore'].includes(input.action)||!/^[A-Za-z0-9._:@-]{1,100}$/.test(input.actor))throw new LineCardValidationError('操作資料不正確，請重新載入。');
 const def=LINE_CARD_CATALOG.find(d=>d.eventKey===input.eventKey);if(!def)throw new LineCardValidationError('找不到這種通知卡片。');
 const overrides=input.action==='save'?validateLineCardOverride(input.eventKey,input.overrides):{};
 if(input.action==='save'&&!renderLineFlex(input.eventKey,def.previewSample,undefined,overrides).ok)throw new LineCardValidationError('文案展開後無法產生有效卡片，請縮短文字或檢查動態欄位。');
 const file=input.filePath??getLineCardConfigFile();await fs.mkdir(path.dirname(file),{recursive:true});return withFileLock(file,async()=>{const current=await readLineCardConfig(file);if(current.revision!==input.expectedRevision)throw new LineCardConflictError('設定已由另一個視窗更新，請重新載入後再儲存；目前編輯內容仍保留。');
 const events={...current.events};if(input.action==='restore'||Object.keys(overrides).length===0)delete events[input.eventKey];else events[input.eventKey]={overrides,updatedAt:new Date().toISOString(),updatedBy:input.actor};const next:LineCardConfigStore={...current,revision:current.revision+1,events};await atomicWriteJson(file,next);return next;});
}

/** One lock/read/revision gate, validate all candidates, then ONE atomic commit.
 * Never persists defaults or rewrites unrelated override values. No delivery imports. */
export async function writeLineCardBulkConfig(input:BulkModeRequest,options:{actor:string;filePath?:string}){
 const request=parseBulkModeRequest(input);
 if(!/^[A-Za-z0-9._:@-]{1,100}$/.test(options.actor))throw new LineCardValidationError('操作身分不正確。');
 const file=options.filePath??getLineCardConfigFile();await fs.mkdir(path.dirname(file),{recursive:true});
 return withFileLock(file,async()=>{
  const current=await readLineCardConfig(file);
  if(current.revision!==request.expectedRevision)throw new LineCardConflictError('設定已由其他視窗更新，未套用任何變更。請重新整理後檢查清單再確認。');
  if(request.action==='set-exclusions'){
   const keys=[...request.excludedEventKeys].sort();
   if(JSON.stringify(keys)===JSON.stringify([...(current.bulkExcludedEventKeys??[])].sort()))return {config:current,changedEventKeys:[]};
   const next:LineCardConfigStore={...current,revision:current.revision+1,bulkExcludedEventKeys:keys};
   await atomicWriteJson(file,next);return {config:next,changedEventKeys:[]};
  }
  const plan=lineCardBulkPlan(current,request.audience,request.presentationMode);
  const expected=plan.changes.map(d=>d.eventKey).sort(),selected=[...request.eventKeys].sort();
  if(JSON.stringify(expected)!==JSON.stringify(selected))throw new LineCardValidationError('確認清單與目前範圍或例外不符，未變更任何卡片。請重新預覽。');
  const events={...current.events};const now=new Date().toISOString();
  for(const def of plan.eligible){
   const entry=current.events[def.eventKey];const overrides={...entry?.overrides};
   if(request.presentationMode==='flex')overrides.presentationMode='flex';else delete overrides.presentationMode;
   validateLineCardOverride(def.eventKey,overrides);
   if(!renderLineFlex(def.eventKey,def.previewSample,undefined,overrides).ok)throw new LineCardValidationError('卡片「'+def.displayName+'」無法產生有效內容，整批未套用。');
   if(expected.includes(def.eventKey))events[def.eventKey]={...entry,overrides,updatedAt:now,updatedBy:options.actor};
  }
  if(!expected.length)return {config:current,changedEventKeys:[]};
  const next:LineCardConfigStore={...current,revision:current.revision+1,events};
  await atomicWriteJson(file,next);return {config:next,changedEventKeys:expected};
 });
}
