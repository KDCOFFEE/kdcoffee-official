"use client";
import type {AssetRecord} from '@/lib/assets';

import Image from 'next/image';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {LINE_CARD_FAMILY_ART} from '@/lib/lineCardPresentation';
import {LINE_CARD_CATALOG} from '@/lib/lineNotificationCardCatalog';
import {EMPTY_LINE_CARD_CONFIG,resolveLineCardConfig,type LineCardConfigStore} from '@/lib/lineCardConfiguration';
import {CARD_TOKENS,type CardFamily} from '@/lib/lineNotificationCards';
import {renderLineFlex} from '@/lib/lineFlexRenderer';
import Preview from './LineNotificationCardPreview';
import Editor from './LineNotificationCardEditor';
import css from './LineNotificationCardStudio.module.css';
export function filterLineCards(recipient:string,family:string,search:string,store:LineCardConfigStore=EMPTY_LINE_CARD_CONFIG){return LINE_CARD_CATALOG.filter(d=>d.recipient===recipient&&(!family||d.family===family)&&resolveLineCardConfig(d.eventKey,store.events[d.eventKey]?.overrides).displayName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));}
export default function LineNotificationCardStudio({initialConfig=EMPTY_LINE_CARD_CONFIG,initialAssets=[]}:{initialConfig?:LineCardConfigStore;initialAssets?:AssetRecord[]}={}){
 const [recipient,setRecipient]=useState('customer'),[family,setFamily]=useState(''),[search,setSearch]=useState(''),[selected,setSelected]=useState<string|null>(null);
 const [assets,setAssets]=useState(initialAssets);
 const [store,setStore]=useState(initialConfig),[dirty,setDirty]=useState(false),[pending,setPending]=useState<null|(()=>void)>(null);
 const dirtyRef=useRef(dirty);useEffect(()=>{dirtyRef.current=dirty;},[dirty]);
 useEffect(()=>{
  const warn=(event:BeforeUnloadEvent)=>{if(dirtyRef.current){event.preventDefault();event.returnValue='';}};
  type NavigationGuard=EventTarget&{traverseTo?:(key:string)=>unknown};
  const navigation=(window as Window&{navigation?:NavigationGuard}).navigation;
  const navigate=(raw:Event)=>{const event=raw as Event&{canIntercept?:boolean;hashChange?:boolean;navigationType?:string;destination?:{url:string;key?:string}};if(!dirtyRef.current||!event.cancelable||!event.canIntercept||event.hashChange||!event.destination)return;event.preventDefault();const destination=event.destination;setPending(()=>()=>{if(event.navigationType==='traverse'&&destination.key&&navigation?.traverseTo)navigation.traverseTo(destination.key);else window.location.assign(destination.url);});};
  window.addEventListener('beforeunload',warn);navigation?.addEventListener('navigate',navigate);
  return()=>{window.removeEventListener('beforeunload',warn);navigation?.removeEventListener('navigate',navigate);};
 },[]);
 useEffect(()=>{if(pending)document.querySelector<HTMLButtonElement>('[data-keep-card-draft]')?.focus();},[pending]);
 const guard=(action:()=>void)=>{if(dirtyRef.current)setPending(()=>action);else action();};
 const linkGuard=(event:React.MouseEvent<HTMLAnchorElement>)=>{if(dirtyRef.current){event.preventDefault();const href=event.currentTarget.href;guard(()=>window.location.assign(href));}};
 const rows=filterLineCards(recipient,family,search,store);
 return <main className={'admin-page '+css.page}>{pending?<div className={css.unsavedOverlay}><div role="alertdialog" aria-modal="true" aria-label="尚未儲存的卡片內容" className={css.unsavedDialog} onKeyDown={event=>{if(event.key==='Escape')setPending(null);if(event.key==='Tab'){const buttons=event.currentTarget.querySelectorAll('button');event.preventDefault();const next=event.target===buttons[0]?buttons[1]:buttons[0];next?.focus();}}}><h2>保留這次編輯？</h2><p>卡片內容尚未儲存。離開後會捨棄這些變更。</p><button type="button" data-keep-card-draft onClick={()=>setPending(null)}>繼續編輯</button><button type="button" onClick={()=>{dirtyRef.current=false;setDirty(false);const action=pending;setPending(null);action();}}>捨棄變更並離開</button></div></div>:null}<Link href="/admin" onClick={linkGuard}>← 返回營運中心</Link><header className={css.heading}><p>LINE CARD STUDIO</p><h1>LINE 通知卡片工作室</h1><p>編輯品牌文案並即時預覽。通知開關仍由「會員與定期購設定 → LINE／Email 通知」控制。</p><Link href="/admin/membership" onClick={linkGuard}>查看通知設定 →</Link></header><p className={css.notice}>目前卡片設定尚未套用至正式 LINE 通知。所有預覽資料為內建範例，不會發送 LINE。</p>
 <section className={css.familyGallery} aria-label="卡片系列">{Object.entries(LINE_CARD_FAMILY_ART).map(([key,art])=><button type="button" key={key} aria-pressed={family===key} onClick={()=>guard(()=>{setFamily(key);setRecipient(key==='ADMIN'?'admin':'customer');setSearch('');setSelected(null);})}><Image src={'/images/line-cards/'+art.file} alt={art.alt} width={240} height={80} unoptimized/><span>{CARD_TOKENS.families[key as CardFamily]}</span><small>{art.edition}</small></button>)}</section>
 <section className={css.filters} aria-label="卡片篩選"><div role="group" aria-label="收件人">{[['customer','通知會員'],['admin','通知管理者']].map(([value,label])=><button type="button" key={value} aria-pressed={recipient===value} onClick={()=>guard(()=>{setRecipient(value);setSelected(null);})}>{label}</button>)}</div><label>分類<select value={family} onChange={event=>{const value=event.target.value;guard(()=>{setFamily(value);setSelected(null);});}}><option value="">全部</option>{Object.entries(CARD_TOKENS.families).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>搜尋事件<input type="search" placeholder="輸入事件名稱" value={search} onChange={event=>setSearch(event.target.value)}/></label></section><p>{rows.length} 種卡片</p>
 {selected?<Editor key={selected} eventKey={selected} assets={assets} onAsset={asset=>setAssets(current=>[...current.filter(item=>item.id!==asset.id),asset])} store={store} onSaved={setStore} onDirty={setDirty} onClose={()=>guard(()=>setSelected(null))}/>:null}
 <section className={css.grid} aria-label="通知事件卡片">{rows.map(def=>{const entry=store.events[def.eventKey],settings=resolveLineCardConfig(def.eventKey,entry?.overrides),rendered=renderLineFlex(def.eventKey,def.previewSample,undefined,entry?.overrides,assets);return rendered.ok?<article className={css.tile} key={def.eventKey}><header><span>{def.recipient==='admin'?'通知管理者':'通知會員'} · {CARD_TOKENS.families[def.family as CardFamily]}</span><h2>{settings.displayName}</h2><p className={css.editStatus}>{entry?'已自訂':'使用預設'}</p></header><Preview card={rendered.card} compact/><button type="button" onClick={()=>guard(()=>{setSelected(def.eventKey);requestAnimationFrame(()=>document.querySelector('[aria-label="事件卡片預覽"]')?.scrollIntoView({behavior:'smooth',block:'start'}));})}>預覽卡片：{settings.displayName}</button></article>:null;})}</section>{!rows.length?<p>沒有符合條件的卡片，請調整篩選。</p>:null}</main>;
}
