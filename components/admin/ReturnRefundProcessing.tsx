"use client";
import AttachmentLightbox from "@/components/shared/AttachmentLightbox";
import css from "./AdminReturnDetail.module.css";
import {returnTaipeiDate,displayOriginalPaymentMethod,displayReturnRefundMethod} from "@/lib/returnPresentation";
import {Facts} from "./AdminReturnSections";
import {useEffect,useRef,useState} from "react";
import type {ReturnWorkflowView} from "@/lib/returnWorkflow";
import type {RefundBank} from "@/lib/returnRefundSettings";
import {ORDER_PHOTO_ACCEPT,validOrderPhotoSelection} from "@/lib/orderPhotoPolicy";
type RequestView=ReturnWorkflowView["requests"][number];
const maskedAccount=(account:string)=>"********"+account.slice(-4);
export default function ReturnRefundProcessing({orderNumber,request,autoOpen,onReload,proofEnabled,hideSummary=false}:{orderNumber:string;request:RequestView;autoOpen:boolean;onReload:()=>Promise<void>;proofEnabled:boolean;hideSummary?:boolean}){
 const [manualOpen,setOpen]=useState(false),[dismissed,setDismissed]=useState(false),[processing,setProcessing]=useState(false),[bank,setBank]=useState<RefundBank|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [photos,setPhotos]=useState<File[]>([]),[urls,setUrls]=useState<string[]>([]),[note,setNote]=useState(""),[paid,setPaid]=useState(false);
 const open=manualOpen||(autoOpen&&!dismissed);
 const dialog=useRef<HTMLDialogElement>(null),titleId="refund-modal-title-"+request.returnRequestId;
 const refund=request.paymentRefund,quote=refund.quote,saved=request.refundRequest,method=saved?.method;
 const amount=refund.amount??(quote.status==="resolved"?quote.amount:null),money=amount===null?"需人工確認":"NT$"+amount.toLocaleString("zh-TW");
 const methodLabel=displayReturnRefundMethod(method);
 const originalLabel=displayOriginalPaymentMethod(saved?.originalPayment,saved?.originalOrderMode);
 const bankRows=(account:RefundBank,masked:boolean):Array<[string,string]>=>[["退款銀行",account.bank],["戶名",account.holder],["帳號",masked?maskedAccount(account.account):account.account],...(account.branch?[["分行",account.branch] as [string,string]]:[])];
 useEffect(()=>{if(open&&refund.status!=="completed"){if(!dialog.current?.open)dialog.current?.showModal();}else dialog.current?.close();},[open,refund.status]);
 useEffect(()=>()=>urls.forEach(url=>URL.revokeObjectURL(url)),[urls]);
 const endpoint="/api/admin/returns/"+encodeURIComponent(orderNumber);
 async function post(action:string){const payload={action,returnRequestId:request.returnRequestId,manuallyPaid:paid||method==="manual_cash",note};const form=new FormData();form.append("payload",JSON.stringify(payload));photos.forEach(file=>form.append("photos",file));const response=await fetch(endpoint,{method:"POST",headers:action==="refund_confirm"&&photos.length?undefined:{"Content-Type":"application/json"},body:action==="refund_confirm"&&photos.length?form:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw Error(result.error||"退款處理失敗");return result;}
 async function process(){if(busy)return;setBusy(true);setError("");try{const result=await post("refund_details");setBank(result.bank);setProcessing(true);}catch(e){setError(e instanceof Error?e.message:"無法讀取資料");}finally{setBusy(false);}}
 async function confirm(){if(busy||(method==="manual_bank_transfer"&&(!processing||!paid)))return;setBusy(true);setError("");try{await post("refund_confirm");setBank(null);setPhotos([]);setUrls([]);setPaid(false);setProcessing(false);setDismissed(true);setOpen(false);await onReload();}catch(e){setError(e instanceof Error?e.message:"確認失敗");}finally{setBusy(false);}}
 function close(){if(!busy){setOpen(false);setDismissed(true);setBank(null);setProcessing(false);setPhotos([]);setUrls([]);setPaid(false);setError("");}}
 return <section aria-label="退款進度"><h2 className={refund.status==="completed"?css.completedTitle:undefined}>{refund.status==="completed"?"✓ 退款已完成":"退貨已核准"}</h2>
 {refund.status!=="completed"?<div className={css.nextStep}><span>下一步</span><strong>{refund.status==="pending"?"辦理退款":"確認退款資料"}</strong></div>:null}
 <div className={css.refundAmount}><span>本次退款</span><strong>{money}</strong></div>
 <Facts rows={[["退款方式",methodLabel],...(!hideSummary?[["原付款方式",originalLabel] as [string,string]]:[]),...(refund.status==="completed"?[["完成時間",returnTaipeiDate(refund.confirmedAt,true)] as [string,string]]:[])]}/>
 {refund.status!=="completed"&&method==="manual_bank_transfer"&&saved?.bank?<Facts rows={[["退款銀行",saved.bank.bank],["帳號",maskedAccount(saved.bank.account)]]}/>:null}
 {refund.status==="pending"?<button className={css.primary+" "+css.refundAction} type="button" onClick={()=>setOpen(true)}>辦理退款</button>:null}
 {refund.status==="completed"?<div className={css.notificationStatus}><span>LINE 通知</span><p className={refund.notification==="failed"?css.notificationWarning:undefined}>{refund.notification?{sent:"已發送",failed:"⚠ 發送失敗，可重送",disabled:"已停用"}[refund.notification]:"尚未發送"}</p>{refund.notification==="failed"?<button className={css.notificationRetry} disabled={busy} onClick={async()=>{setBusy(true);try{await post("refund_notify");await onReload();}catch(e){setError(e instanceof Error?e.message:"重送失敗");}finally{setBusy(false);}}}>重送退款通知</button>:null}
 {refund.proof.length?<div className={css.proofBlock}><h3>退款證明</h3><div className={css.proofThumbnails}>{refund.proof.map((photo,index)=><AttachmentLightbox key={photo.url} src={photo.url} imageClassName={css.proofThumbnail} alt={"退款證明 "+(index+1)} width={80} height={64}/>)}</div></div>:null}</div>:null}
 {error&&!open?<p className={refund.status==="completed"?css.notificationWarning:undefined} role={refund.status==="completed"?"status":"alert"}>{error}</p>:null}
 <dialog ref={dialog} className={css.refundDialog} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();close();}}>
  <header className={css.refundDialogHeader}><div><h2 id={titleId}>{processing?"辦理退款":"✓ 退貨已核准"}</h2><p>{processing?"請先完成站外銀行轉帳，再於此確認退款完成。":method==="manual_cash"?"下一步：確認現場退款":"下一步：辦理退款"}</p></div><button type="button" className={css.refundDialogClose} aria-label="關閉退款視窗" disabled={busy} onClick={close}>×</button></header>
  <div className={css.refundDialogBody}>
   <div className={css.refundAmount}><span>本次退款</span><strong>{money}</strong></div>
   <Facts rows={[["原付款方式",originalLabel],["退款方式",methodLabel]]}/>
   {method==="manual_bank_transfer"&&saved?.bank&&!processing?<section className={css.refundAccountPanel}><h3>退款帳戶</h3><Facts rows={bankRows(saved.bank,true)}/><p className={css.refundHelp}>完整帳號僅於退款處理時提供。</p></section>:null}
   {processing&&method==="manual_bank_transfer"?<>
    {bank?<section className={css.refundAccountPanel}><h3>退款帳戶</h3><Facts rows={bankRows(bank,false)}/></section>:null}
    <section className={css.refundForm}>
     {proofEnabled?<><label>退款證明（選填）<input type="file" multiple accept={ORDER_PHOTO_ACCEPT} disabled={busy} onChange={e=>{const selected=Array.from(e.target.files??[]);if(selected.length>3||selected.some(file=>!validOrderPhotoSelection(file))){setError("請選擇符合訂單圖片規格的照片（最多三張）");e.target.value="";return;}setPhotos(selected);setUrls(selected.map(file=>URL.createObjectURL(file)));}}/></label><div className={css.proofThumbnails}>{urls.map((url,i)=><AttachmentLightbox key={url} src={url} imageClassName={css.proofThumbnail} alt={"退款證明預覽 "+(i+1)} width={80} height={64}/>)}</div></>:null}
     <label>備註（選填）<textarea rows={2} maxLength={200} value={note} disabled={busy} onChange={e=>setNote(e.target.value)}/></label>
     <label className={css.refundAcknowledgement}><input type="checkbox" checked={paid} disabled={busy} onChange={e=>setPaid(e.target.checked)}/><span>我已完成本次站外退款</span></label><p className={css.refundHelp}>系統只記錄退款完成狀態，不會替您執行銀行轉帳。</p>
    </section>
   </>:null}
   {method==="manual_cash"?<p className={css.refundHelp}>請先實際交付款項給客戶，再按下確認。</p>:null}
   {error?<p className={css.error} role="alert">{error}</p>:null}
  </div>
  <footer className={css.refundDialogActions}><button type="button" disabled={busy} onClick={close}>稍後處理</button>{refund.status==="pending"?(method==="manual_cash"?<button type="button" className={css.primary} disabled={busy} onClick={confirm}>確認已現場退款</button>:method==="manual_bank_transfer"?(processing?<button type="button" className={css.primary} disabled={busy||!paid} onClick={confirm}>確認已完成退款</button>:<button type="button" className={css.primary} disabled={busy} onClick={process}>辦理退款</button>):null):null}</footer>
 </dialog></section>;
}
