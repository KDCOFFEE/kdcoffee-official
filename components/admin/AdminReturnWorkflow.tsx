"use client";

import {returnOperation,isActionableReturn,returnOperationAction,uniqueReturnOperationRows,summarizeReturnOperationRows,compareReturnOperationRows} from "@/lib/returnOperationPresentation";
import css from "./AdminReturnDetail.module.css";
import {StatusBadge,Facts,AdminReturnItems,AdminReasonPhotos,AdminLogistics,AdminRefundInformation,AdminCreditInformation,AdminSettlementStatus,AdminRequestSummary,AdminSecondaryDetails,AdminCreditSummary,returnReasonSummary,returnLogisticsSummary} from "./AdminReturnSections";
import ReturnRefundProcessing from "./ReturnRefundProcessing";
import { useState } from "react";
import Link from "next/link";
import type { ReturnWorkflowView } from "@/lib/returnWorkflow";
import { returnTaipeiDate, displayReturnRefundMethod } from "@/lib/returnPresentation";
import { ReturnRewardEvidence } from "@/components/member/ReturnEvidence";
import ReturnReasonFields from "@/components/member/ReturnReasonFields";

export function AdminReturnDetail({ initial }: { initial: ReturnWorkflowView }) {
  const [view, setView] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [refundRequestId,setRefundRequestId]=useState("");
  async function reload(){const response=await fetch(`/api/admin/returns/${encodeURIComponent(view.orderNumber)}`,{cache:"no-store"});if(response.ok)setView(await response.json());}
  async function review(action: string, returnRequestId: string, reason: string, approvedLines?: Array<{ returnLineRef: string; quantity: number }>) {
    setBusy(true); setError("");
    const endpoint = `/api/admin/returns/${encodeURIComponent(view.orderNumber)}`;
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, returnRequestId, reason, ...(approvedLines ? { approvedLines } : {}), idempotencyKey: `${action}:${returnRequestId}` }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "審核失敗。");
      const latest = await fetch(endpoint, { cache: "no-store" });
      if (latest.ok) setView(await latest.json());
      if(action==="approve")setRefundRequestId(returnRequestId);
      if (result.rewardResolution === "manual_review_required") setError("退貨狀態已保存；部分獎勵需人工確認，仍維持暫停。");
    } catch (error) { setError(error instanceof Error ? error.message : "審核失敗。"); }
    finally { setBusy(false); }
  }
  const latestRequest=[...view.requests].reverse()[0];
  return <main className={css.page}><header className={css.header}><Link className={css.back} href="/admin/returns">← 退貨管理</Link><div className={css.heading}><div><h1>{latestRequest?.paymentRefund.status==="completed"?"退款已完成":latestRequest?.status==="approved"?"辦理退款":"審核退貨"}</h1><div className={css.order}>{view.orderNumber}</div></div><Link className={css.sourceLink} href={`/admin/orders/${encodeURIComponent(view.orderNumber)}`}>查看來源訂單 →</Link></div>
   <div className={css.badges}>{latestRequest?<><StatusBadge value={latestRequest.status}/><StatusBadge value={latestRequest.paymentRefund.status} refund/></>:<span className={css.badge}>尚未收到申請</span>}</div><div className={css.meta}><span>會員：{view.customer??"尚未提供"}</span><span>完成日期：{returnTaipeiDate(view.completedAt)}</span><span>最晚退貨期限：{returnTaipeiDate(view.returnDeadline)}</span></div></header>
   {view.technicalReason?<p className={css.error}>部分原始訂單資料需要人工確認，請確認資料後再辦理。</p>:null}{error?<p className={css.error} role="alert">{error}</p>:null}
   {!view.requests.length?<><div className={css.emptyPage}><strong>尚未收到這筆訂單的退貨申請</strong><p>會員送出申請後，即可在這裡查看退貨商品、寄回方式與退款資料。</p></div><div className={css.layout}><AdminReturnItems view={view}/><section className={css.card}><h2>退貨申請摘要</h2><Facts rows={[["訂單完成時間",returnTaipeiDate(view.completedAt,true)],["最晚退貨期限",returnTaipeiDate(view.returnDeadline)],["申請狀態","尚未申請"]]}/></section></div></>:null}
   {[...view.requests].reverse().map(request=><article key={request.returnRequestId} id={request.returnRequestId}><div className={css.requestHeading}><h2>退貨申請</h2><StatusBadge value={request.status}/></div><div className={css.layout}><div className={css.column}><AdminReturnItems view={view} request={request}/><AdminSecondaryDetails title="退貨原因與說明" summary={returnReasonSummary(request)}><AdminReasonPhotos request={request}/></AdminSecondaryDetails><AdminSecondaryDetails title="退貨寄回方式" summary={returnLogisticsSummary(request)}><AdminLogistics request={request}/></AdminSecondaryDetails><AdminSecondaryDetails title="會員抵用額返還" summary={<AdminCreditSummary request={request}/>}><AdminCreditInformation request={request}/></AdminSecondaryDetails><AdminSecondaryDetails title="退貨申請摘要" summary={returnTaipeiDate(request.occurredAt,true)+" · 期限 "+returnTaipeiDate(view.returnDeadline)}><AdminRequestSummary view={view} request={request}/></AdminSecondaryDetails></div><aside className={css.column+(request.status==="approved"?" "+css.stickySidebar:"")}>{request.status!=="approved"?<AdminRefundInformation request={request}/>:null}{["pending","processing"].includes(request.status)?<section className={css.card}><h2>審核處理</h2><ReviewControls lines={request.lines.map(line=>({...line,name:view.lines.find(item=>item.returnLineRef===line.returnLineRef)?.name}))} disabled={busy} pending={request.status==="pending"} onReview={(action,reason,approvedLines)=>review(action,request.returnRequestId,reason,approvedLines)}/></section>:null}
   {request.status==="approved"?<><section className={css.card+" "+css.processing}><ReturnRefundProcessing orderNumber={view.orderNumber} request={request} autoOpen={refundRequestId===request.returnRequestId} onReload={reload} proofEnabled={view.refundSettings?.proofEnabled??false} hideSummary/></section><AdminSettlementStatus request={request}/><AdminSecondaryDetails title="退款計算明細" summary="商品退款與不退款費用"><AdminRefundInformation request={request}/></AdminSecondaryDetails></>:null}</aside></div></article>)}
   {view.rewards.length?<details><summary>回饋處理資訊</summary><ReturnRewardEvidence rewards={view.rewards}/></details>:null}
  </main>;
}
function ReviewControls({ lines, disabled, pending, onReview }: { lines: Array<{ returnLineRef: string; quantity: number; name?:string }>; disabled: boolean; pending: boolean; onReview: (action: string, reason: string, approvedLines?: Array<{ returnLineRef: string; quantity: number }>) => void }) {
  const [reason, setReason] = useState("");
  const [approvedLines, setApprovedLines] = useState(lines.map(({ returnLineRef, quantity }) => ({ returnLineRef, quantity })));
  return <div className={css.review}><h3>審核原因／備註</h3><ReturnReasonFields admin disabled={disabled} onValue={setReason} />
    {approvedLines.map((line,index) => <label key={line.returnLineRef}>核准數量（{lines[index].name??"商品 "+(index+1)}，申請 {lines[index].quantity} 件）<input type="number" min={0} max={lines[index].quantity} step={1} disabled={disabled} value={line.quantity} onChange={event => setApprovedLines(current => current.map((item,i) => i === index ? { ...item, quantity: Number(event.target.value) } : item))} /></label>)}
    <p>核准後立即回補核准數量；未核准的剩餘數量不回補。會員折抵額依原效期結算；款項由您另行確認人工退款。</p><div className={css.actions}>
      {pending ? <button className={css.lock} disabled={disabled || !reason.trim()} onClick={() => onReview("lock", reason)}>開始處理並鎖定撤回</button> : null}
      <button className={css.primary} disabled={disabled || !reason.trim() || !approvedLines.some(line => line.quantity > 0) || approvedLines.some((line,index) => !Number.isSafeInteger(line.quantity) || line.quantity < 0 || line.quantity > lines[index].quantity)} onClick={() => onReview("approve", reason, approvedLines.filter(line => line.quantity > 0))}>核准退貨</button><button className={css.reject} disabled={disabled || !reason.trim()} onClick={() => onReview("reject", reason)}>拒絕退貨</button>
    </div></div>;
}
export type AdminReturnRow = { returnRequestId:string;orderNumber:string;customer?:string;status:string;refundStatus:string;refundAmount:number|null;refundMethod?:string;requestedAt:string;quantity:number;returnDeadline:string|null };
export function AdminReturnList({ initial }: { initial: AdminReturnRow[] }) {
 const [search,setSearch]=useState(""),[filter,setFilter]=useState("actionable");
 const searched=uniqueReturnOperationRows(initial).filter(row=>[row.orderNumber,row.customer??""].join(" ").toLowerCase().includes(search.trim().toLowerCase()));
 const counts=summarizeReturnOperationRows(searched);
 const matches=(row:AdminReturnRow)=>!filter||(filter==="actionable"?isActionableReturn(row):returnOperation(row)===filter);
 const rows=searched.filter(matches).sort(compareReturnOperationRows);
 const filters:Array<[string,string,number]>=[["actionable","待處理",counts.total],["review","待審核",counts.pending],["refund_pending","待退款",counts.awaitingRefund],["manual_review","人工確認",counts.manualReview],["completed","已完成",counts.completed],["closed","已拒絕／已撤回",counts.closed],["","全部",counts.records]];
 const groups=filter===""?[{label:"待處理",rows:rows.filter(isActionableReturn)},{label:"已完成／歷史紀錄",rows:rows.filter(row=>!isActionableReturn(row))}]:[{label:filters.find(([value])=>value===filter)?.[1]??"退貨申請",rows}];
 const card=(row:AdminReturnRow)=>{const actionable=isActionableReturn(row),action=returnOperationAction(row);return <article className={css.listCard+" "+(actionable?css.listActionable:css.listHistory)} key={row.orderNumber+":"+row.returnRequestId}>
  <div className={css.listCardHeader}><div><h3>{row.orderNumber}</h3><p><span>會員</span>{row.customer??"未提供"}</p></div><div className={css.badges}>{actionable?<span className={css.operationBadge}>待處理</span>:null}<StatusBadge value={row.status}/><StatusBadge value={row.refundStatus} refund/></div></div>
  {actionable?<div className={css.listNextStep}><span>下一步</span><strong>{action}</strong></div>:null}
  <dl className={css.listFacts}><div><dt>申請退貨</dt><dd>{row.quantity} 件</dd></div><div className={css.listAmount}><dt>本次退款</dt><dd>{row.refundAmount===null?"需確認":"NT$"+row.refundAmount.toLocaleString("zh-TW")}</dd></div><div><dt>退款方式</dt><dd>{displayReturnRefundMethod(row.refundMethod)}</dd></div><div><dt>申請時間</dt><dd>{returnTaipeiDate(row.requestedAt,true)}</dd></div><div><dt>最晚退貨期限</dt><dd>{returnTaipeiDate(row.returnDeadline)}</dd></div></dl>
  <div className={css.listActions}><Link className={actionable?css.listPrimary:css.listLink} href={"/admin/returns/"+encodeURIComponent(row.orderNumber)+"#"+encodeURIComponent(row.returnRequestId)}>{action} →</Link></div>
 </article>;};
 return <main className={css.page}><header className={css.listHeader}><Link className={css.back} href="/admin/orders">← 訂單管理</Link><h1>退貨管理</h1><p>集中查看會員退貨申請、審核進度與退款狀態。</p></header>
  <section className={css.operationSummary} aria-label="退貨待辦摘要"><strong>待處理 <b>{counts.total}</b></strong><span>待審核 <b>{counts.pending}</b></span><span>待退款 <b>{counts.awaitingRefund}</b></span><span>人工確認 <b>{counts.manualReview}</b></span><span>已完成 <b>{counts.completed}</b></span></section>
  <section className={css.listToolbar} aria-label="搜尋與篩選"><label>搜尋訂單、會員<input type="search" value={search} placeholder="輸入訂單編號或會員名稱" onChange={event=>setSearch(event.target.value)}/></label><label>狀態篩選<select value={filter} onChange={event=>setFilter(event.target.value)}>{filters.map(([value,label,count])=><option key={value} value={value}>{label}（{count}）</option>)}</select></label></section>
  <p className={css.listCount}>共 {rows.length} 筆退貨申請</p><section className={css.returnList} aria-label="退貨申請列表">{groups.filter(group=>group.rows.length>0).map(group=><section className={css.listGroup} aria-label={group.label} key={group.label}><h2 className={css.listGroupTitle}>{group.label}（{group.rows.length}）</h2>{group.rows.map(card)}</section>)}</section>{!rows.length?<div className={css.emptyPage}><strong>沒有符合條件的退貨申請</strong><p>可調整搜尋內容或狀態篩選。</p></div>:null}
 </main>;
}
