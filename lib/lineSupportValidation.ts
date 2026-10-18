import type { SupportNode, SupportSettings } from "./lineSupportTypes";
import { memberActionTypes } from "./lineSupportTypes";
import { normalizeLineText, validateLineDestination } from "./lineAutoReplyEngine";
import { LineSettingsError } from "./lineAutoReplyStore";
function fail(field:string):never{throw new LineSettingsError("客服導覽設定不正確："+field);}
const record=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=="object"||Array.isArray(v))return fail("物件");return v as Record<string,unknown>;};
const text=(v:unknown,max:number,field:string)=>{if(typeof v!=="string"||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v))return fail(field);return v.trim();};
const bool=(v:unknown)=>{if(typeof v!=="boolean")return fail("開關");return v;};
const integer=(v:unknown)=>{if(typeof v!=="number"||!Number.isSafeInteger(v)||v<0||v>1_000_000)return fail("順序或版本");return v;};
const id=(v:unknown)=>{const s=text(v,80,"編號");if(!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(s))return fail("編號");return s;};
const time=(v:unknown)=>{const s=text(v,40,"時間");if(!Number.isFinite(Date.parse(s)))return fail("時間");return s;};
export function validateSupportSettings(value:unknown):SupportSettings {
  const v=record(value);if(v.schemaVersion!==3)return fail("版本");
  if(!Array.isArray(v.nodes)||!v.nodes.length||v.nodes.length>250)return fail("節點數量（1–250）");
  const nodes:SupportNode[]=v.nodes.map(raw=>{
    const n=record(raw),source=record(n.sourceMetadata);
    if(!["menu","answer","member_action"].includes(String(n.type)))return fail("節點類型");
    if(n.matchMode!=="exact"&&n.matchMode!=="contains")return fail("比對方式");
    if(!Array.isArray(n.keywords)||n.keywords.length>30)return fail("關鍵字數量");
    const words=n.keywords.map(k=>text(k,100,"關鍵字")),normalized=words.map(normalizeLineText);
    if(normalized.some(k=>!k)||new Set(normalized).size!==words.length)return fail("空白或重複關鍵字");
    if(!["static","dynamic-link","missing"].includes(String(source.classification)))return fail("來源類型");
    let destination:string;try{destination=validateLineDestination(text(n.destination,2000,"連結"));}catch{return fail("僅允許安全站內路徑或 HTTPS 連結");}
    // Never allow public presentation links to smuggle private IDs/capabilities.
    if(destination){const url=new URL(destination,"https://www.kdcoffee1962.com");if([...url.searchParams.keys()].some(k=>/member.?id|order.?id|token|password|secret/i.test(k))||/^\/orders\//i.test(url.pathname)||/\/api\//i.test(url.pathname))return fail("連結不可含私人身分或存取憑證");}
    const type=n.type as SupportNode["type"],action=text(n.memberAction,40,"會員功能");
    if(type==="member_action"&&(!(memberActionTypes as readonly string[]).includes(action)||destination))return fail("會員功能必須使用核准入口，不可自訂 URL");
    if(type!=="member_action"&&action)return fail("非會員節點不可設定會員功能");
    const node:SupportNode={id:id(n.id),parentId:n.parentId===null?null:id(n.parentId),type,enabled:bool(n.enabled),
      title:text(n.title,20,"按鈕標題（20 字元）"),promptText:text(n.promptText,4500,"提示"),keywords:words,matchMode:n.matchMode,
      replyText:text(n.replyText,4500,"答案"),linkLabel:text(n.linkLabel,20,"連結標籤"),destination,memberAction:action as SupportNode["memberAction"],
      order:integer(n.order),createdAt:time(n.createdAt),updatedAt:time(n.updatedAt),
      sourceMetadata:{type:text(source.type,100,"來源"),source:text(source.source,200,"來源"),section:text(source.section,200,"區段"),classification:source.classification as SupportNode["sourceMetadata"]["classification"],needsOwner:bool(source.needsOwner)}};
    if(!node.title)return fail("標題不可空白");
    if(node.linkLabel&&!destination&&!action)return fail("連結標籤沒有目的地");
    if((destination||action)&&!node.linkLabel)return fail("連結需要按鈕標籤");
    if(node.enabled&&type==="answer"&&!node.replyText&&!destination)return fail("啟用答案需要內容或安全連結");
    if(node.id==="monthly-menu"&&(type!=="answer"||destination!=="/monthly-menu"))return fail("豆單必須連到 /monthly-menu");
    return node;
  });
  const rootNodeId=id(v.rootNodeId),map=new Map(nodes.map(n=>[n.id,n]));
  if(map.size!==nodes.length)return fail("重複節點編號");
  if(map.get(rootNodeId)?.type!=="menu"||map.get(rootNodeId)?.parentId!==null)return fail("客服首頁需為根目錄");
  for(const node of nodes){
    if(node.id!==rootNodeId&&(!node.parentId||!map.has(node.parentId)))return fail("缺少上層");
    if(node.parentId&&map.get(node.parentId)?.type==="member_action")return fail("會員功能不可作為上層");
    const seen=new Set<string>();let cursor:SupportNode|undefined=node,depth=0;
    while(cursor){if(seen.has(cursor.id))return fail("循環上層");seen.add(cursor.id);if(depth++>6)return fail("最多六層");cursor=cursor.parentId?map.get(cursor.parentId):undefined;}
    if(node.enabled&&node.type==="menu"&&!nodes.some(n=>n.parentId===node.id&&n.enabled)&&!node.replyText)return fail("啟用目錄需有啟用子項目或回覆");
  }
  const nav=record(v.navigation),fallback=record(v.fallback);
  const navigation={backLabel:text(nav.backLabel,20,"返回"),homeLabel:text(nav.homeLabel,20,"首頁"),previousLabel:text(nav.previousLabel,20,"上一頁"),nextLabel:text(nav.nextLabel,20,"下一頁")};
  if(Object.values(navigation).some(label=>!label))return fail("導覽標籤不可空白");
  const fallbackState={enabled:bool(fallback.enabled),text:text(fallback.text,4500,"未命中回覆"),showRootChoices:bool(fallback.showRootChoices)};
  if(fallbackState.enabled&&!fallbackState.text&&!fallbackState.showRootChoices)return fail("未命中回覆需有文字或首頁選項");
  const unlinkedText=text(v.unlinkedText,4500,"未連結會員說明");
  if(nodes.some(n=>n.enabled&&n.type==="member_action")&&!unlinkedText)return fail("會員功能需要未連結會員說明");
  const features:Pick<SupportSettings,"welcome"|"beanMenu">={};
  if(v.welcome!==undefined){const welcome=record(v.welcome);features.welcome={enabled:bool(welcome.enabled),text:text(welcome.text,4500,"歡迎訊息")};if(features.welcome.enabled&&!features.welcome.text)return fail("歡迎訊息不可空白");}
  if(v.beanMenu!==undefined){const menu=record(v.beanMenu);if(!Array.isArray(menu.products)||menu.products.length>100)return fail("商品參照數量");
    const products=menu.products.map(raw=>{const item=record(raw);return {productId:id(item.productId),enabled:bool(item.enabled),order:integer(item.order),description:text(item.description,1000,"商品說明")};});
    if(new Set(products.map(item=>item.productId)).size!==products.length)return fail("重複商品參照");
    features.beanMenu={enabled:bool(menu.enabled),title:text(menu.title,200,"豆單標題"),intro:text(menu.intro,1000,"豆單前言"),emptyText:text(menu.emptyText,1000,"豆單空白說明"),footer:text(menu.footer,1000,"豆單結尾"),products};
    if(features.beanMenu.enabled&&!features.beanMenu.emptyText)return fail("豆單需有失效商品說明");
  }
  return {...features,schemaVersion:3,revision:integer(v.revision),enabled:bool(v.enabled),updatedAt:time(v.updatedAt),rootNodeId,nodes:nodes.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)),
    navigation,unlinkedText,fallback:fallbackState};
}
