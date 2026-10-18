import type { MemberAction, SupportAction, SupportInput, SupportNode, SupportResult, SupportSettings } from "./lineSupportTypes";
import { matchLineKeywords, normalizeLineText, resolveLineDestination, splitLineReply } from "./lineAutoReplyEngine";
import type { CoffeeArtwork } from "../data/websiteData";
import { formatLineBeanMenu } from "./lineSupportFeatures";
// Verified member center sections. These links never grant authentication.
export const memberDestinations: Record<MemberAction,string> = {
  viewOrders:"/member#orders",viewOrderStatus:"/member#orders",viewKdPoints:"/member#rewards",
  viewCredits:"/member#rewards",viewReferralRewards:"/member#rewards",viewSubscriptions:"/member#subscription",viewMemberCenter:"/member",
};
export const SUPPORT_QUICK_REPLY_LIMIT = 13;
export function isSupportNodeAvailable(node:SupportNode,settings:SupportSettings) {
  const map=new Map(settings.nodes.map(n=>[n.id,n]));let current:SupportNode|undefined=node;
  for(let depth=0;depth<=6;depth++){if(!current?.enabled)return false;if(current.id===settings.rootNodeId)return current.parentId===null;current=map.get(current.parentId||"");}
  return false;
}
export function supportChildren(nodeId:string,settings:SupportSettings) {
  return settings.nodes.filter(n=>n.parentId===nodeId&&isSupportNodeAvailable(n,settings)).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
}
export function supportPostback(nodeId:string,page=0) { return "kd-support:v3:node:"+nodeId+":"+page; }
function parsePostback(data:string,settings:SupportSettings) {
  if(data==="kd-support:v3:home")return {nodeId:settings.rootNodeId,page:0};
  const back=/^kd-support:v3:back:([A-Za-z0-9][A-Za-z0-9_-]{0,79})$/.exec(data);
  if(back){const node=settings.nodes.find(n=>n.id===back[1]);if(!node||!isSupportNodeAvailable(node,settings)||!node.parentId)return null;return {nodeId:node.parentId,page:0};}
  const match=/^kd-support:v3:node:([A-Za-z0-9][A-Za-z0-9_-]{0,79}):(0|[1-9][0-9]{0,2})$/.exec(data);
  return match?{nodeId:match[1],page:Number(match[2])}:null;
}
export function resolveSupportReply(input:SupportInput,settings:SupportSettings,context:{linked?:boolean;publicOrigin?:string;catalog?:readonly CoffeeArtwork[]}={}):SupportResult {
  const normalizedMessage=input.mode==="text"?normalizeLineText(input.text):"";
  const empty:SupportResult={category:"noReply",normalizedMessage,childIds:[],replyText:"",text:"",destination:"",memberAction:"",authenticationRequired:false,linked:false,page:0,pageCount:1,messages:[]};
  if(settings.enabled!==true)return {...empty,reason:"disabled"};
  if(input.mode==="welcome"){const text=settings.welcome?.enabled===true?settings.welcome.text.trim():"";return {...empty,replyText:text,text,messages:splitLineReply(text).map(text=>({type:"text" as const,text}))};}
  let node:SupportNode|undefined,keyword:string|undefined,page=0,fallback=false;
  if(input.mode==="text"){
    // Precise questions remain reachable when an Owner moves a broad menu earlier.
    const candidates=settings.nodes.filter(n=>isSupportNodeAvailable(n,settings)).sort((a,b)=>Number(a.matchMode!=="exact")-Number(b.matchMode!=="exact")||a.order-b.order||a.id.localeCompare(b.id));
    for(const candidate of candidates){const hit=matchLineKeywords(normalizedMessage,candidate.keywords,candidate.matchMode);if(hit){node=candidate;keyword=hit;break;}}
    if(!node){if(!settings.fallback.enabled)return {...empty,reason:"unmatched"};fallback=true;if(settings.fallback.showRootChoices)node=settings.nodes.find(n=>n.id===settings.rootNodeId&&isSupportNodeAvailable(n,settings));}
  }else{
    const command=input.mode==="node"?{nodeId:input.nodeId,page:input.page??0}:parsePostback(input.data,settings);
    if(!command)return {...empty,reason:"invalid-postback"};
    node=settings.nodes.find(n=>n.id===command.nodeId);page=command.page;
    if(!node||!isSupportNodeAvailable(node,settings))return {...empty,reason:"unavailable-node"};
  }
  if(node&&!isSupportNodeAvailable(node,settings))return {...empty,reason:"unavailable-node"};
  const linked=context.linked===true,memberAction=node?.type==="member_action"?node.memberAction:"";
  let replyText=fallback?settings.fallback.text:(node?[node.promptText,node.replyText].filter(Boolean).join("\n\n"):"");
  if(fallback&&!replyText&&node)replyText=[node.promptText,node.replyText].filter(Boolean).join("\n\n");
  if(memberAction&&!linked)replyText=settings.unlinkedText;
  if(!fallback&&node?.id==="monthly-menu"&&settings.beanMenu?.enabled===true)replyText=formatLineBeanMenu(settings.beanMenu,context.catalog||[],context.publicOrigin).text;
  const destination=node?resolveLineDestination(memberAction?(linked?memberDestinations[memberAction]:"/member"):node.destination,context.publicOrigin):"";
  const text=[replyText,...(destination?[node?.linkLabel,destination].filter(Boolean):[])].filter(Boolean).join("\n\n");
  const chunks=splitLineReply(text);if(!chunks.length)return {...empty,reason:text?"reply-too-long":"empty-reply"};
  const children=node?supportChildren(node.id,settings):[],navigation=node&&node.id!==settings.rootNodeId?2:0;
  const capacity=SUPPORT_QUICK_REPLY_LIMIT-navigation-(destination?1:0),paginated=children.length>capacity;
  const pageSize=paginated?capacity-2:capacity,pageCount=Math.max(1,Math.ceil(children.length/pageSize));
  if(!Number.isSafeInteger(page)||page<0||page>=pageCount)return {...empty,reason:"invalid-page"};
  const visible=children.slice(page*pageSize,(page+1)*pageSize),items:SupportAction[]=[];
  for(const child of visible)items.push({type:"action",action:{type:"postback",label:child.title,data:supportPostback(child.id)}});
  if(paginated&&node&&page>0)items.push({type:"action",action:{type:"postback",label:settings.navigation.previousLabel,data:supportPostback(node.id,page-1)}});
  if(paginated&&node&&page<pageCount-1)items.push({type:"action",action:{type:"postback",label:settings.navigation.nextLabel,data:supportPostback(node.id,page+1)}});
  if(destination&&node)items.push({type:"action",action:{type:"uri",label:node.linkLabel,uri:destination}});
  if(node&&node.id!==settings.rootNodeId){
    items.push({type:"action",action:{type:"postback",label:settings.navigation.backLabel,data:"kd-support:v3:back:"+node.id}});
    items.push({type:"action",action:{type:"postback",label:settings.navigation.homeLabel,data:"kd-support:v3:home"}});
  }
  if(items.length>SUPPORT_QUICK_REPLY_LIMIT)return {...empty,reason:"provider-limit"};
  const messages=chunks.map(text=>({type:"text" as const,text}));
  if(items.length)Object.assign(messages[messages.length-1],{quickReply:{items}});
  return {...empty,category:fallback?"fallback":"node",reason:fallback?"unmatched":undefined,keyword,nodeId:node?.id,nodeType:node?.type,parentId:node?.parentId,
    childIds:children.map(n=>n.id),replyText,text,destination,memberAction,authenticationRequired:Boolean(memberAction),linked:memberAction?linked:false,page,pageCount,messages};
}
