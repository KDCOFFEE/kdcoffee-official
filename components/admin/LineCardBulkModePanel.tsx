'use client';
import {useRef,useState} from 'react';
import {lineCardBulkPlan,type BulkAudience} from '@/lib/lineCardBulkMode';
import type {LineCardConfigStore} from '@/lib/lineCardConfiguration';
import css from './LineCardBulkModePanel.module.css';

export default function LineCardBulkModePanel({store,excludedDraft,onSaved,onBusyChange,disabled=false}:{store:LineCardConfigStore;excludedDraft:string[];onSaved:(store:LineCardConfigStore)=>void;onBusyChange:(busy:boolean)=>void;disabled?:boolean}){
 const [audience,setAudience]=useState<BulkAudience>('all'),[mode,setMode]=useState<'flex'|'text'>('flex');
 const [review,setReview]=useState<ReturnType<typeof lineCardBulkPlan>|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[failed,setFailed]=useState(false);
 const active=useRef(false);
 const exceptionsDirty=JSON.stringify([...excludedDraft].sort())!==JSON.stringify([...(store.bulkExcludedEventKeys??[])].sort());
 const plan=lineCardBulkPlan(store,audience,mode);
 const reviewValid=review&&review.revision===store.revision&&review.audience===audience&&review.mode===mode&&!exceptionsDirty;
 async function save(exceptionsOnly:boolean){
  if(active.current||disabled||(!exceptionsOnly&&!reviewValid))return;
  active.current=true;setBusy(true);onBusyChange(true);setFailed(false);setNotice('');
  const body=exceptionsOnly?{action:'set-exclusions',excludedEventKeys:excludedDraft,expectedRevision:store.revision}:{action:'set-mode',audience:review!.audience,presentationMode:review!.mode,eventKeys:review!.changes.map(d=>d.eventKey),expectedRevision:review!.revision};
  try{
   const response=await fetch('/api/admin/notifications/line-cards/bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const result=await response.json();if(!response.ok)throw Error(result.error||'儲存失敗，請重新整理設定後再確認。');
   onSaved(result.config);setReview(null);setNotice(exceptionsOnly?'批次例外已儲存；顯示方式與通知開關沒有變更。':'已完整套用 '+result.changedEventKeys.length+' 張卡片；圖片、文案、例外與不支援事件均保留。');
  }catch(error){setReview(null);setFailed(true);setNotice(error instanceof Error?error.message:'無法確認儲存結果，請重新整理後檢查。');}
  finally{active.current=false;setBusy(false);onBusyChange(false);}
 }
 const list=(items:typeof plan.supported)=>items.length?<ul className={css.eventList}>{items.map(d=><li key={d.eventKey}><strong>{d.displayName}</strong><small>{d.eventKey}</small></li>)}</ul>:<p>無</p>;
 return <section className={css.panel} aria-label="LINE 顯示方式批次管理">
  <h2>LINE 顯示方式批次管理</h2><p>只調整已接入正式 PUSH 的卡片。先選範圍、檢查清單，再確認儲存；不會重送既有通知。</p>
  {disabled?<p role="status">請先關閉下方的單張編輯，再進行批次管理。</p>:null}
  <fieldset disabled={disabled||busy} className={css.controls}><legend className={css.legend}>批次設定範圍</legend>
   <label>套用範圍<select aria-label="批次套用範圍" value={audience} onChange={e=>{setAudience(e.target.value as BulkAudience);setReview(null);}}><option value="all">全部支援 Flex 的正式通知</option><option value="customer">只設定會員通知</option><option value="admin">只設定管理員通知</option></select></label>
   <label>目標顯示方式<select aria-label="批次目標顯示方式" value={mode} onChange={e=>{setMode(e.target.value as 'text'|'flex');setReview(null);}}><option value="flex">卡片訊息（Flex）</option><option value="text">文字訊息</option></select></label>
   <p className={css.help}>批次範圍由此處決定，與下方列表的搜尋／篩選分開。例外請在卡片上明確勾選，先儲存例外再預覽。</p>
   <div className={css.actions}><button type="button" disabled={!exceptionsDirty} onClick={()=>save(true)}>{busy?'儲存中…':'儲存例外清單'}</button><span role="status">{exceptionsDirty?'例外有未儲存變更，尚不能套用顯示方式。':'例外清單已與保存設定一致。'}</span></div>
   <dl className={css.metrics}><div><dt>範圍內支援卡片</dt><dd>{plan.supported.length}</dd></div><div><dt>符合條件（扣除例外）</dt><dd>{plan.eligible.length}</dd></div><div><dt>目前 Flex</dt><dd>{plan.flexCount}</dd></div><div><dt>目前文字</dt><dd>{plan.textCount}</dd></div><div><dt>將要變更</dt><dd>{plan.changes.length}</dd></div></dl>
   <details><summary>不支援 Flex、排除於本次操作（{plan.unsupported.length}）</summary>{list(plan.unsupported)}</details>
   <details><summary>保留原設定的明確例外（{plan.exceptions.length}）</summary>{list(plan.exceptions)}</details>
   <div className={css.actions}><button type="button" disabled={exceptionsDirty||!plan.changes.length} onClick={()=>{setReview(plan);setNotice('');}}>檢視變更清單</button>{!plan.changes.length?<span>目前沒有需要變更的卡片。</span>:null}</div>
   {reviewValid?<div className={css.review} aria-label="批次確認清單"><h3>確認這 {review.changes.length} 張改為{review.mode==='flex'?'卡片訊息（Flex）':'文字訊息'}</h3><p>只修改以下卡片的顯示方式，不重設文案或圖片。</p>{list(review.changes)}<div className={css.actions}><button type="button" className={css.confirm} onClick={()=>save(false)}>確認套用這 {review.changes.length} 張</button><button type="button" onClick={()=>setReview(null)}>取消預覽</button></div></div>:null}
  </fieldset>
  {notice?<p role={failed?'alert':'status'} className={failed?css.error:css.notice}>{notice}</p>:null}
 </section>;
}
