"use client";
import {useEffect,useRef,useState} from 'react';
import {CARD_COPY_LABELS,CARD_COPY_LIMITS,cardDefaults,cardDefinition,validateLineCardOverride,type CardCopyField,type LineCardConfigStore,type LineCardOverride} from '@/lib/lineCardConfiguration';
import {LINE_CARD_HEADER_ASSETS} from '@/lib/lineCardPresentation';
import {CARD_TOKENS} from '@/lib/lineNotificationCards';
import {renderLineFlex} from '@/lib/lineFlexRenderer';
import type {AssetRecord} from '@/lib/assets';
import LineCardHeaderPicker from './LineCardHeaderPicker';
import Preview from './LineNotificationCardPreview';
import css from './LineNotificationCardStudio.module.css';

type Draft=Record<CardCopyField,string>&{headerAsset:string;headerImageAssetId:string};
export default function LineNotificationCardEditor({eventKey,store,onSaved,onDirty,onClose,assets=[],onAsset=()=>{}}:{assets?:AssetRecord[];onAsset?:(asset:AssetRecord)=>void;eventKey:string;store:LineCardConfigStore;onSaved:(store:LineCardConfigStore)=>void;onDirty:(dirty:boolean)=>void;onClose:()=>void}){
 const defaults=cardDefaults(eventKey),def=cardDefinition(eventKey),entry=store.events[eventKey];
 const base:Draft={...defaults,...entry?.overrides,headerAsset:entry?.overrides.headerAsset??'default',headerImageAssetId:entry?.overrides.headerImageAssetId??''};
 const [draft,setDraft]=useState<Draft>(base),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[confirmRestore,setConfirmRestore]=useState(false),[failed,setFailed]=useState(false);
 const target=useRef<HTMLInputElement|HTMLTextAreaElement|null>(null),active=useRef<CardCopyField>('intro');
 const dirty=JSON.stringify(draft)!==JSON.stringify(base);
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
 const overrides=()=>{const {headerAsset,headerImageAssetId,...copy}=draft;return validateLineCardOverride(eventKey,{...copy,...(headerImageAssetId?{headerImageAssetId}:headerAsset==='default'?{}:{headerAsset})});};
 let error='',clean:LineCardOverride|undefined;try{clean=overrides();}catch(e){error=(e as Error).message;}
 const rendered=clean?renderLineFlex(eventKey,def.previewSample,undefined,clean,assets):null;
 if(!error&&rendered&&!rendered.ok)error='文案展開後無法產生有效卡片，請縮短文字或檢查動態欄位。';
 const update=(field:CardCopyField,value:string)=>{setDraft(current=>({...current,[field]:value}));setNotice('');};
 function insert(key:string){if(active.current==='displayName'){setFailed(true);setNotice('卡片名稱不支援動態資料，請先點選其他文案欄位。');return;}const field=active.current,element=target.current,value=draft[field],text='{{'+key+'}}',start=element?.selectionStart??value.length,end=element?.selectionEnd??start;update(field,value.slice(0,start)+text+value.slice(end));requestAnimationFrame(()=>{element?.focus();element?.setSelectionRange(start+text.length,start+text.length);});}
 async function persist(action:'save'|'restore'){
  if(busy||action==='save'&&error)return;setBusy(true);setNotice('');setFailed(false);
  try{const response=await fetch('/api/admin/notifications/line-cards',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,eventKey,expectedRevision:store.revision,...(action==='save'?{overrides:overrides()}: {})})});const result=await response.json();if(!response.ok)throw Error(result.error||'儲存失敗，請稍後再試。');onSaved(result);const saved=result.events[eventKey]?.overrides;setDraft({...defaults,...saved,headerAsset:saved?.headerAsset??'default',headerImageAssetId:saved?.headerImageAssetId??''});onDirty(false);setNotice(action==='restore'?'已恢復系列預設內容。':'卡片設定已儲存；尚未套用至正式 LINE 通知。');setConfirmRestore(false);
  }catch(e){setFailed(true);setNotice((e as Error).message);}finally{setBusy(false);}
 }
 const changed=(Object.keys(CARD_COPY_LIMITS) as CardCopyField[]).filter(field=>draft[field]!==defaults[field]);
 return <section className={css.detail} aria-label="事件卡片預覽"><div>
  <button type="button" onClick={onClose} disabled={busy}>關閉預覽</button><h2>{draft.displayName||def.displayName}</h2>
  <p className={css.editStatus}>{entry?'已自訂':'使用預設'}{dirty?' · 尚未儲存':''}</p>
  <form onSubmit={event=>{event.preventDefault();void persist('save');}} className={css.editor}>
   {(Object.keys(CARD_COPY_LIMITS) as CardCopyField[]).map(field=><label key={field}>{CARD_COPY_LABELS[field]}{['intro','secondaryText'].includes(field)?<textarea value={draft[field]} maxLength={CARD_COPY_LIMITS[field]} rows={3} onFocus={e=>{target.current=e.currentTarget;active.current=field;}} onChange={e=>update(field,e.target.value)}/>:<input value={draft[field]} maxLength={CARD_COPY_LIMITS[field]} required={!['secondaryText','footerText'].includes(field)} onFocus={e=>{target.current=e.currentTarget;active.current=field;}} onChange={e=>update(field,e.target.value)}/>}<small>{draft[field].length} / {CARD_COPY_LIMITS[field]}</small></label>)}
   <label>抬頭圖片<select value={draft.headerImageAssetId?'custom':draft.headerAsset} onChange={event=>setDraft(current=>({...current,headerAsset:event.target.value,headerImageAssetId:''}))}>{draft.headerImageAssetId?<option value="custom" disabled>素材庫自訂圖片</option>:null}<option value="default">使用系列預設</option>{Object.keys(LINE_CARD_HEADER_ASSETS).map(key=><option key={key} value={key}>{CARD_TOKENS.families[key as keyof typeof CARD_TOKENS.families]}</option>)}</select></label>
   <LineCardHeaderPicker assetId={draft.headerImageAssetId} assets={assets} disabled={busy} onAsset={onAsset} onSelect={id=>setDraft(current=>({...current,headerAsset:'default',headerImageAssetId:id}))}/>
   {def.fields.length?<section className={css.placeholders} aria-label="可用動態欄位"><h3>可用動態欄位</h3><p>先點選要編輯的文案，再插入資料。</p>{def.fields.map(field=><button type="button" key={field.key} onClick={()=>insert(field.key)}>{'{{'+field.key+'}}'}<small>{field.label}</small></button>)}</section>:<p className={css.disclaimer}>此卡片沒有可插入的動態資料。</p>}
   <p className={css.disclaimer}>金額、狀態、日期及連結目的地由系統帶入，此處僅編輯顯示文案。</p>
   {error?<p role="alert" className={css.editorError}>{error}</p>:null}
   <div className={css.editorActions}><button type="submit" disabled={busy||Boolean(error)||!dirty}>{busy?'處理中…':'儲存卡片設定'}</button><button type="button" disabled={busy} onClick={()=>setConfirmRestore(true)}>恢復預設文案</button></div>
   {notice?<p role={failed?'alert':'status'} className={failed?css.editorError:css.saveNotice}>{notice}</p>:null}
  </form>
  {confirmRestore?<div role="alertdialog" aria-label="恢復預設文案" aria-modal="false" className={css.restoreConfirm}><p>恢復此卡片的預設內容與圖片？其他卡片不會受影響。</p><button type="button" disabled={busy} onClick={()=>void persist('restore')}>確認恢復預設</button><button type="button" disabled={busy} onClick={()=>setConfirmRestore(false)}>保留目前內容</button></div>:null}
  <details className={css.compare}><summary>比較預設</summary>{changed.length||draft.headerAsset!=='default'||draft.headerImageAssetId?<><table><thead><tr><th>欄位</th><th>系列預設</th><th>目前內容</th></tr></thead><tbody>{changed.map(field=><tr key={field}><th>{CARD_COPY_LABELS[field]}</th><td>{defaults[field]||'—'}</td><td>{draft[field]||'—'}</td></tr>)}{draft.headerImageAssetId?<tr><th>抬頭圖片</th><td>使用系列預設</td><td>{assets.find(asset=>asset.id===draft.headerImageAssetId)?.name||'已選擇素材庫圖片'}</td></tr>:null}{draft.headerAsset!=='default'?<tr><th>抬頭圖片</th><td>使用系列預設</td><td>{CARD_TOKENS.families[draft.headerAsset as keyof typeof CARD_TOKENS.families]}</td></tr>:null}</tbody></table></>:<p>目前與系列預設相同。</p>}</details>
  {entry?<p className={css.disclaimer}>最後更新：{entry.updatedAt.replace('T',' ').replace('Z',' UTC')}</p>:null}
 </div><div><h2>LINE 卡片預覽</h2>{rendered?.ok&&!error?<><Preview card={rendered.card}/><details className={css.compare}><summary>純文字 fallback 預覽</summary><pre>{rendered.plainTextFallback}</pre></details></>:<p className={css.editorError}>請先修正文案格式，再預覽卡片。</p>}<p className={css.disclaimer}>實際顯示可能因 LINE 版本與裝置略有差異。預覽按鈕不會開啟範例訂單。</p></div></section>;
}
