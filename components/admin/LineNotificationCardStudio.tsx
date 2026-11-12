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
import BulkModePanel from './LineCardBulkModePanel';
import {cardPresentationState,cardHasCustomContent,type CardModeFilter} from '@/lib/lineCardBulkMode';
import {supportsCardPresentation} from '@/lib/lineCardDeliverySupport';
export function filterLineCards(recipient:string,family:string,search:string,store:LineCardConfigStore=EMPTY_LINE_CARD_CONFIG,mode:CardModeFilter='all'){return LINE_CARD_CATALOG.filter(d=>(mode==='all'||cardPresentationState(d.eventKey,store)===mode)&&d.recipient===recipient&&(!family||d.family===family)&&resolveLineCardConfig(d.eventKey,store.events[d.eventKey]?.overrides).displayName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));}
export default function LineNotificationCardStudio({initialConfig=EMPTY_LINE_CARD_CONFIG,initialAssets=[],creditLabel='抵用金'}:{creditLabel?:string;initialConfig?:LineCardConfigStore;initialAssets?:AssetRecord[]}={}){
 const [recipient,setRecipient]=useState('customer'),[family,setFamily]=useState(''),[search,setSearch]=useState(''),[selected,setSelected]=useState<string|null>(null);
 const [assets,setAssets]=useState(initialAssets);
 const [store,setStore]=useState(initialConfig),[dirty,setDirty]=useState(false),[pending,setPending]=useState<null|(()=>void)>(null);
 const [modeFilter,setModeFilter]=useState<CardModeFilter>('all'),[excludedDraft,setExcludedDraft]=useState<string[]>(initialConfig.bulkExcludedEventKeys??[]),[bulkBusy,setBulkBusy]=useState(false);
 const exclusionsDirty=JSON.stringify([...excludedDraft].sort())!==JSON.stringify([...(store.bulkExcludedEventKeys??[])].sort());
 const acceptStore=(next:LineCardConfigStore)=>{setStore(next);setExcludedDraft(next.bulkExcludedEventKeys??[]);};
 const dirtyRef=useRef(dirty||exclusionsDirty);useEffect(()=>{dirtyRef.current=dirty||exclusionsDirty||bulkBusy;},[dirty,exclusionsDirty,bulkBusy]);
 useEffect(()=>{
  const warn=(event:BeforeUnloadEvent)=>{if(dirtyRef.current){event.preventDefault();event.returnValue='';}};
  type NavigationGuard=EventTarget&{traverseTo?:(key:string)=>unknown};
  const navigation=(window as Window&{navigation?:NavigationGuard}).navigation;
  const navigate=(raw:Event)=>{const event=raw as Event&{canIntercept?:boolean;hashChange?:boolean;navigationType?:string;destination?:{url:string;key?:string}};if(!dirtyRef.current||!event.cancelable||!event.canIntercept||event.hashChange||!event.destination)return;event.preventDefault();const destination=event.destination;setPending(()=>()=>{if(event.navigationType==='traverse'&&destination.key&&navigation?.traverseTo)navigation.traverseTo(destination.key);else window.location.assign(destination.url);});};
  window.addEventListener('beforeunload',warn);navigation?.addEventListener('navigate',navigate);
  return()=>{window.removeEventListener('beforeunload',warn);navigation?.removeEventListener('navigate',navigate);};
 },[]);
 useEffect(()=>{if(pending)document.querySelector<HTMLButtonElement>('[data-keep-card-draft]')?.focus();},[pending]);
 const guard=(action:()=>void)=>{if(bulkBusy)return;if(dirtyRef.current)setPending(()=>action);else action();};
 const linkGuard=(event:React.MouseEvent<HTMLAnchorElement>)=>{if(dirtyRef.current){event.preventDefault();const href=event.currentTarget.href;guard(()=>window.location.assign(href));}};
 const rows=filterLineCards(recipient,family,search,store,modeFilter);
 return <main className={'admin-page '+css.page}>{pending?<div className={css.unsavedOverlay}><div role="alertdialog" aria-modal="true" aria-label="尚未儲存的卡片內容" className={css.unsavedDialog} onKeyDown={event=>{if(event.key==='Escape')setPending(null);if(event.key==='Tab'){const buttons=event.currentTarget.querySelectorAll('button');event.preventDefault();const next=event.target===buttons[0]?buttons[1]:buttons[0];next?.focus();}}}><h2>保留這次編輯？</h2><p>卡片內容或批次例外尚未儲存。離開後會捨棄這些變更。</p><button type="button" data-keep-card-draft onClick={()=>setPending(null)}>繼續編輯</button><button type="button" onClick={()=>{dirtyRef.current=false;setDirty(false);setExcludedDraft(store.bulkExcludedEventKeys??[]);const action=pending;setPending(null);action();}}>捨棄變更並離開</button></div></div>:null}<Link href="/admin" onClick={linkGuard}>← 返回營運中心</Link><header className={css.heading}><p>LINE CARD STUDIO</p><h1>LINE 通知卡片工作室</h1><p>編輯品牌文案並即時預覽。通知開關仍由「會員與定期購設定 → LINE／Email 通知」控制。</p><Link href="/admin/membership" onClick={linkGuard}>查看通知設定 →</Link></header><p className={css.notice}>只有已接入正式 PUSH 的卡片才會依保存模式發送。預覽不等於已發送；未接線卡片僅供設計預覽，客服互動回覆維持原有文字／Quick Reply。</p>
 <section className={css.familyGallery} aria-label="卡片系列">{Object.entries(LINE_CARD_FAMILY_ART).map(([key,art])=><button type="button" key={key} aria-pressed={family===key} onClick={()=>guard(()=>{setFamily(key);setRecipient(key==='ADMIN'?'admin':'customer');setSearch('');setSelected(null);})}><Image src={'/images/line-cards/'+art.file} alt={art.alt} width={240} height={80} unoptimized/><span>{CARD_TOKENS.families[key as CardFamily]}</span><small>{art.edition}</small></button>)}</section>
 <section className={css.filters} aria-label="卡片篩選"><div role="group" aria-label="收件人">{[['customer','通知會員'],['admin','通知管理者']].map(([value,label])=><button type="button" key={value} aria-pressed={recipient===value} onClick={()=>guard(()=>{setRecipient(value);setSelected(null);})}>{label}</button>)}</div><label>分類<select value={family} onChange={event=>{const value=event.target.value;guard(()=>{setFamily(value);setSelected(null);});}}><option value="">全部</option>{Object.entries(CARD_TOKENS.families).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>顯示方式<select aria-label="列表顯示方式篩選" value={modeFilter} onChange={event=>{const value=event.target.value as CardModeFilter;guard(()=>{setModeFilter(value);setSelected(null);});}}><option value="all">全部</option><option value="flex">Flex</option><option value="text">文字</option><option value="unsupported">不支援 Flex</option></select></label><label>搜尋事件<input type="search" placeholder="輸入事件名稱" value={search} onChange={event=>setSearch(event.target.value)}/></label></section><p>{rows.length} 種卡片</p>
 <BulkModePanel store={store} excludedDraft={excludedDraft} onSaved={acceptStore} onBusyChange={setBulkBusy} disabled={selected!==null}/>
 {selected?<Editor key={selected} eventKey={selected} creditLabel={creditLabel} assets={assets} onAsset={asset=>setAssets(current=>[...current.filter(item=>item.id!==asset.id),asset])} store={store} onSaved={acceptStore} onDirty={setDirty} onClose={()=>guard(()=>setSelected(null))}/>:null}
 <section className={css.grid} aria-label="通知事件卡片">{rows.map(def=>{const entry=store.events[def.eventKey],settings=resolveLineCardConfig(def.eventKey,entry?.overrides),rendered=renderLineFlex(def.eventKey,def.previewSample,{credit:creditLabel,points:'KD點'},entry?.overrides,assets);return rendered.ok?<article className={css.tile} key={def.eventKey}><header><span>{def.recipient==='admin'?'通知管理者':'通知會員'} · {CARD_TOKENS.families[def.family as CardFamily]}</span><h2>{settings.displayName}</h2><p className={css.editStatus}>{cardHasCustomContent(def.eventKey,store)?'有自訂內容':'使用預設文案與圖片'}</p><p className={css.modeBadge}>{cardPresentationState(def.eventKey,store)==='unsupported'?'不支援 Flex／未接線或互動文字':cardPresentationState(def.eventKey,store)==='flex'?'卡片訊息（Flex）':'文字訊息'}</p><label className={css.bulkException}><input type="checkbox" aria-label={settings.displayName+'不參與批次變更'} checked={excludedDraft.includes(def.eventKey)} disabled={!supportsCardPresentation(def.eventKey)||selected!==null||bulkBusy} onChange={event=>{const checked=event.target.checked;dirtyRef.current=true;setExcludedDraft(current=>checked?[...current,def.eventKey]:current.filter(key=>key!==def.eventKey));}}/>不參與批次變更{!supportsCardPresentation(def.eventKey)?'（原本即排除）':''}</label></header><Preview card={rendered.card} compact/><button type="button" onClick={()=>guard(()=>{setSelected(def.eventKey);requestAnimationFrame(()=>document.querySelector('[aria-label="事件卡片預覽"]')?.scrollIntoView({behavior:'smooth',block:'start'}));})}>預覽卡片：{settings.displayName}</button></article>:null;})}</section>{!rows.length?<p>沒有符合條件的卡片，請調整篩選。</p>:null}</main>;
}
