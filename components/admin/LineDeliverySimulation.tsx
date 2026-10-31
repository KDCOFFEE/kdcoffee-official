"use client";
import Preview from './LineNotificationCardPreview';
import type {ResolvedNotificationCard} from '@/lib/lineNotificationCards';
import {useState} from 'react';
export default function LineDeliverySimulation({eventKey,revision}:{eventKey:string;revision:number}){
 const [result,setResult]=useState<{card?:ResolvedNotificationCard;message:{type:string;altText?:string;contents?:{hero?:{url?:string}}};originalText:string;requestedPresentation:string;fallbackReason?:string}|null>(null),[error,setError]=useState('');
 async function simulate(){try{const response=await fetch('/api/admin/notifications/line-cards/simulate?eventKey='+encodeURIComponent(eventKey),{cache:'no-store'});const value=await response.json();if(!response.ok)throw Error(value.error);setResult(value);setError('');}catch{setError('模擬暫時無法完成。');}}
 return <section aria-label="LINE 傳送模擬" style={{overflowWrap:'anywhere',minWidth:0}}><h3>LINE 傳送模擬</h3><p>僅使用內建範例及已儲存設定（版本 {revision}），不會發送 LINE。</p><button type="button" onClick={()=>void simulate()}>模擬已儲存設定</button>{error?<p role="alert">{error}</p>:null}{result?<dl><dt>事件</dt><dd>{eventKey}</dd><dt>設定模式</dt><dd>{result.requestedPresentation}</dd><dt>最終 message type</dt><dd>{result.message.type}</dd><dt>altText</dt><dd>{result.message.altText||'—'}</dd><dt>Header URL</dt><dd>{result.message.contents?.hero?.url||'—'}</dd><dt>CTA label</dt><dd>{result.card?.cta.label||'—'}</dd><dt>CTA destination</dt><dd>{result.card?.cta.url||'—'}</dd><dt>Header source</dt><dd>{result.card?.headerImageAsset?'素材庫':'系列預設'}</dd><dt>原始文字 fallback（模擬）</dt><dd style={{whiteSpace:'pre-wrap'}}>{result.originalText}</dd>{result.fallbackReason?<><dt>診斷</dt><dd>{result.fallbackReason}</dd></>:null}</dl>:null}{result?.card?<Preview card={result.card}/>:null}</section>;
}
