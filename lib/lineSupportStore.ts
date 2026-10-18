import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { getLineAutoReplyDir } from "./storagePaths";
import { LineSettingsError, migrateLineAutoReplyV1, validateLineSettings } from "./lineAutoReplyStore";
import { validateSupportSettings } from "./lineSupportValidation";
import { buildSupportPresetDraft, readCanonicalSupportDraft } from "./lineSupportPresets";
import type { LineAutoReplySettings } from "./lineAutoReplyTypes";
import type { SupportSettings } from "./lineSupportTypes";

export function defaultSupportSettings():SupportSettings {
  const preset=buildSupportPresetDraft({});
  return {...preset,nodes:[{...preset.nodes.find(n=>n.id===preset.rootNodeId)!,enabled:false,keywords:[],replyText:""}],fallback:{enabled:false,text:"",showRootChoices:false}};
}
const legacyMap:Record<string,string>={beanMenu:"monthly-menu",businessHours:"hours",location:"location",purchaseGuide:"purchase",sevenElevenPickup:"seven-eleven",studioPickup:"studio-pickup",paymentMethods:"payment",orderHelp:"order-help",membership:"member-profile",kdPoints:"kd-points",subscription:"subscription",referral:"referral"};
export function migrateSupportSettings(value:unknown,preset=buildSupportPresetDraft({})):SupportSettings {
  const schema=(value as {schemaVersion?:unknown})?.schemaVersion;
  const old:LineAutoReplySettings=schema===1?migrateLineAutoReplyV1(value):validateLineSettings(value);
  const next:SupportSettings=structuredClone(preset);
  next.enabled=false;next.revision=old.revision;next.updatedAt=old.updatedAt;
  for(const item of old.quickReplies){
    if(!item.replyText&&!item.keywords.length)continue;
    const target=next.nodes.find(n=>n.id===legacyMap[item.id]);
    if(!target)continue;
    target.replyText=item.replyText||target.replyText;target.keywords=[...item.keywords];target.matchMode=item.matchMode;
    target.enabled=item.enabled;target.updatedAt=item.updatedAt;
    // Preserve useful Owner text while retaining approved personal destinations.
    if(target.type!=="member_action")target.destination=item.id==="beanMenu"?"/monthly-menu":item.destination||target.destination;
    target.linkLabel=(item.buttonLabel||target.linkLabel).slice(0,20);
    if(!target.destination&&!target.memberAction)target.linkLabel="";
    target.sourceMetadata={type:"Owner migrated copy",source:"legacy LINE settings",section:item.id,classification:"static",needsOwner:false};
  }
  if(old.customRules.length){
    const root=next.nodes.find(n=>n.id===next.rootNodeId)!;
    next.nodes.push({...root,id:"legacy-custom",parentId:root.id,title:"其他常見問題",order:600,keywords:[],enabled:old.customRules.some(n=>n.enabled),replyText:"",createdAt:old.updatedAt,updatedAt:old.updatedAt});
    old.customRules.forEach((item,index)=>next.nodes.push({...root,id:"legacy-"+index,parentId:"legacy-custom",type:"answer",title:item.name.slice(0,20),promptText:"",replyText:item.replyText,keywords:[...item.keywords],matchMode:item.matchMode,enabled:item.enabled,
      destination:item.destination,linkLabel:item.destination?(item.buttonLabel||"開啟網站查看").slice(0,20):"",memberAction:"",order:item.order,createdAt:item.createdAt,updatedAt:item.updatedAt,
      sourceMetadata:{type:"Owner migrated copy",source:"legacy LINE settings",section:item.id,classification:"static",needsOwner:false}}));
  }
  // Preserve only valid legacy Product references, never duplicated catalog/commerce data.
  if(schema===1){const legacy=(value as {beanMenu?:{products?:unknown[]}}).beanMenu;
    const products=Array.isArray(legacy?.products)?legacy.products.filter((item):item is {productId:string;enabled:boolean;order:number;lineDescriptionOverride:string}=>Boolean(item&&typeof item==="object"&&typeof (item as {productId?:unknown}).productId==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test((item as {productId:string}).productId)&&typeof (item as {enabled?:unknown}).enabled==="boolean"&&Number.isSafeInteger((item as {order?:unknown}).order)&&Number((item as {order:number}).order)>=0&&Number((item as {order:number}).order)<=1_000_000&&typeof (item as {lineDescriptionOverride?:unknown}).lineDescriptionOverride==="string"&&(item as {lineDescriptionOverride:string}).lineDescriptionOverride.length<=1000)):[];
    if(products.length)next.beanMenu={enabled:false,title:"本月豆單",intro:"",emptyText:"目前沒有可顯示的已選商品，請開啟本月豆單查看。",footer:"",products:products.map(item=>({productId:item.productId,enabled:item.enabled,order:item.order,description:item.lineDescriptionOverride}))};
  }
  next.fallback={...old.fallback,showRootChoices:true};
  return validateSupportSettings(next);
}
export async function readSupportSettings(options:{presets?:boolean}={}):Promise<SupportSettings>{
  try{
    const raw=JSON.parse(await fs.readFile(path.join(getLineAutoReplyDir(),"settings.json"),"utf8"));
    if(raw?.schemaVersion===3)return validateSupportSettings({...raw,enabled:raw.enabled===true});
    return migrateSupportSettings(raw,options.presets?await readCanonicalSupportDraft():buildSupportPresetDraft({}));
  }catch(error){
    if((error as NodeJS.ErrnoException)?.code==="ENOENT")return options.presets?validateSupportSettings(await readCanonicalSupportDraft()):defaultSupportSettings();
    if(error instanceof LineSettingsError)throw error;
    throw new LineSettingsError("客服導覽設定無法安全讀取，請先修復設定檔。",503);
  }
}
export async function saveSupportSettings(candidate:unknown,expectedRevision:unknown){
  const validated=validateSupportSettings(candidate);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==validated.revision)throw new LineSettingsError("設定版本不正確。");
  const dir=getLineAutoReplyDir(),file=path.join(dir,"settings.json");
  await fs.mkdir(dir,{recursive:true});
  return withFileLock(file,async()=>{
    const current=await readSupportSettings();
    if(current.revision!==expectedRevision)throw new LineSettingsError("設定已由其他視窗更新，請重新載入。",409);
    const now=new Date().toISOString(),previous=new Map(current.nodes.map(n=>[n.id,n]));
    const next:SupportSettings={...validated,revision:current.revision+1,updatedAt:now,nodes:validated.nodes.map(n=>{
      const old=previous.get(n.id);
      const content=(node:typeof n)=>JSON.stringify({...node,createdAt:"",updatedAt:""});
      return {...n,createdAt:old?.createdAt||now,updatedAt:old&&content(old)===content(n)?old.updatedAt:now};
    })};
    await atomicWriteJson(file,next);return next;
  });
}
