import fs from 'node:fs/promises';
import path from 'node:path';
import {composeLineCard} from './lineCardPresentation';
import {readCreditDisplayCopy} from './creditDisplayCopy';
import {CREDIT_NAME_KEY} from './memberCenterCopy';
import 'server-only';
import type {CustomerCardContext} from './customerLineCardEvents';
import {supportsCustomerFlex} from './customerLineCardEvents';
import {readLineCardConfig} from './lineCardConfigStore';
import {readLineCardHeaderAssets} from './lineCardHeaderAssetStore';
import {renderLineFlex} from './lineFlexRenderer';
import {getCanonicalPublicSiteOrigin} from './publicSiteOrigin';
export type CustomerLineMessage={type:'text';text:string}|Extract<ReturnType<typeof renderLineFlex>,{ok:true}>['flex']|{type:'image';originalContentUrl:string;previewImageUrl:string};
/** Pre-send presentation only. No recipient, token, network request, enqueue or business mutation. */
export async function prepareCustomerLinePresentation(text:string,context?:CustomerCardContext,dependencies={readConfig:readLineCardConfig,readAssets:readLineCardHeaderAssets}){
 const original={message:{type:'text',text} as CustomerLineMessage,requestedPresentation:'text' as 'text'|'flex',deliveredPresentation:'text' as 'text'|'flex',fallbackReason:undefined as string|undefined};
 if(!context||!supportsCustomerFlex(context.eventKey))return original;
 try{
  const snapshot=await dependencies.readConfig();const overrides=snapshot.events[context.eventKey]?.overrides;
  if(overrides?.presentationMode!=='flex')return original;
  original.requestedPresentation='flex';
  let assets:Awaited<ReturnType<typeof readLineCardHeaderAssets>>=[];try{if(overrides.headerImageAssetId)assets=await dependencies.readAssets();}catch{/* Family default remains safe. */}
  const labels=context.eventKey==='customer.reward.credit_expiring'?{credit:(await readCreditDisplayCopy())(CREDIT_NAME_KEY),points:'KD點'}:undefined;
  const rendered=renderLineFlex(context.eventKey,context.data,labels,overrides,assets);
  if(!rendered.ok)throw Error('invalid-card');
  const origin=getCanonicalPublicSiteOrigin(),hero=rendered.flex.contents.hero as {url?:string};
  for(const url of [hero.url,rendered.card.cta.url])if(!url||new URL(url).protocol!=='https:'||new URL(url).origin!==origin)throw Error('unsafe-url');
  const visual=composeLineCard(rendered.card);if(visual.imagePath.startsWith('/images/line-cards/'))await fs.access(path.join(process.cwd(),'public',visual.imagePath.slice(1)));
  const serialized=JSON.stringify(rendered.flex);if(Buffer.byteLength(serialized)>24000||!rendered.flex.altText||serialized.includes(':null'))throw Error('invalid-payload');
  return {...original,card:rendered.card,message:rendered.flex,deliveredPresentation:'flex' as const};
 }catch{return {...original,fallbackReason:'PRE_SEND_RENDER_FAILURE'};}
}
