import "server-only";
import { readAdminSession } from "./adminAuth";
import { isSameOriginRequest } from "./requestSecurity";
import { LineSettingsError } from "./lineAutoReplyStore";
import { readSupportSettings, saveSupportSettings } from "./lineSupportStore";
import { validateSupportSettings } from "./lineSupportValidation";
import { resolveSupportReply } from "./lineSupportEngine";
import { readLineSupportCatalog, readLineSupportProductChoices } from "./lineSupportCatalog";
import type { SupportInput } from "./lineSupportTypes";
export function validateSupportInput(value:unknown):SupportInput{
  if(!value||typeof value!=="object")throw new LineSettingsError("測試方式不正確。");
  const v=value as Record<string,unknown>;
  if(v.mode==="welcome")return {mode:"welcome"};
  if(v.mode==="text"&&typeof v.text==="string"&&v.text.length<=5000)return {mode:"text",text:v.text};
  if(v.mode==="node"&&typeof v.nodeId==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(v.nodeId)&&(v.page===undefined||(Number.isSafeInteger(v.page)&&Number(v.page)>=0&&Number(v.page)<=999)))return {mode:"node",nodeId:v.nodeId,page:v.page as number|undefined};
  if(v.mode==="postback"&&typeof v.data==="string"&&v.data.length<=300)return {mode:"postback",data:v.data};
  throw new LineSettingsError("測試內容格式或長度不正確。");
}
export async function handleSupportAdmin(request:Request,action:"get"|"save"|"simulate",dependencies:{authorized?:()=>Promise<boolean>}={}){
  const authorized=dependencies.authorized?await dependencies.authorized():(await readAdminSession())?.role==="owner";
  if(!authorized)return Response.json({error:"未授權"},{status:401});
  if(action!=="get"&&!isSameOriginRequest(request))return Response.json({error:"無法確認操作來源。"},{status:403});
  try{
    if(action==="get")return Response.json({settings:await readSupportSettings({presets:true}),products:await readLineSupportProductChoices()},{headers:{"Cache-Control":"no-store"}});
    const raw=await request.text();if(raw.length>256000)return Response.json({error:"設定內容過大。"},{status:413});
    let body;try{body=JSON.parse(raw);}catch{throw new LineSettingsError("設定格式不正確。");}
    if(action==="save")return Response.json({settings:await saveSupportSettings(body?.settings,body?.expectedRevision)},{headers:{"Cache-Control":"no-store"}});
    if(body?.memberState!=="linked"&&body?.memberState!=="unlinked")throw new LineSettingsError("請選擇合成會員狀態。");
    const input=validateSupportInput(body?.input);
    const settings=body.settings?validateSupportSettings(body.settings):await readSupportSettings({presets:true});
    // Only a copied master flag changes. No identity lookup, persistence or LINE delivery.
    const result=resolveSupportReply(input,{...settings,enabled:true},{catalog:settings.beanMenu?.enabled?await readLineSupportCatalog():[],linked:body.memberState==="linked",publicOrigin:process.env.MEMBER_SITE_URL?.trim()||process.env.NEXT_PUBLIC_SITE_URL?.trim()});
    return Response.json({result},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return Response.json({error:error instanceof LineSettingsError?error.message:"設定無法安全處理，請稍後再試。"},{status:error instanceof LineSettingsError?error.status:500});
  }
}
