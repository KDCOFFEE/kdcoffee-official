"use client";

import { useState } from "react";
import Link from "next/link";
import type { ReturnWorkflowView } from "@/lib/returnWorkflow";
import { returnTaipeiDate, returnStatusLabels } from "@/lib/returnPresentation";
import { ReturnRequestEvidence, ReturnRewardEvidence } from "@/components/member/ReturnEvidence";
import styles from "@/components/member/ReturnWorkflow.module.css";
import ReturnReasonFields from "@/components/member/ReturnReasonFields";
import { MemberCopyText } from "@/components/member/MemberCenterCopyProvider";

export function AdminReturnDetail({ initial }: { initial: ReturnWorkflowView }) {
  const [view, setView] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function review(action: string, returnRequestId: string, reason: string) {
    setBusy(true); setError("");
    const endpoint = `/api/admin/returns/${encodeURIComponent(view.orderNumber)}`;
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, returnRequestId, reason, idempotencyKey: `${action}:${returnRequestId}` }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "審核失敗。");
      const latest = await fetch(endpoint, { cache: "no-store" });
      if (latest.ok) setView(await latest.json());
      if (result.rewardResolution === "manual_review_required") setError("退貨狀態已保存；部分獎勵需人工確認，仍維持暫停。");
    } catch (error) { setError(error instanceof Error ? error.message : "審核失敗。"); }
    finally { setBusy(false); }
  }
  return <main className={styles.panel}><Link href="/admin/returns">← 退貨管理</Link><h1>退貨審核・{view.orderNumber}</h1><Link href={`/admin/orders/${encodeURIComponent(view.orderNumber)}`}>查看來源訂單</Link>
    <p>會員／客戶：{view.customer}</p><p>訂單狀態：{view.orderStatus === "completed" ? "已完成" : view.orderStatus}</p><p>完成時間：{returnTaipeiDate(view.completedAt, true)}</p><p>最晚退貨期限：{returnTaipeiDate(view.returnDeadline)}</p>
    {view.technicalReason ? <p className={styles.notice}>manual_review_required：{view.technicalReason}</p> : null}
    {error ? <p className={styles.notice} role="alert">{error}</p> : null}
    {view.requests.map(request => <article className={styles.card} key={request.returnRequestId} id={request.returnRequestId}><ReturnRequestEvidence request={request} view={view} admin />
      {["pending", "processing"].includes(request.status) ? <ReviewControls disabled={busy} pending={request.status === "pending"} onReview={(action, reason) => review(action, request.returnRequestId, reason)} /> : null}
    </article>)}<ReturnRewardEvidence rewards={view.rewards} />
  </main>;
}
function ReviewControls({ disabled, pending, onReview }: { disabled: boolean; pending: boolean; onReview: (action: string, reason: string) => void }) {
  const [reason, setReason] = useState("");
  return <div><h3>Admin 審核原因／備註</h3><ReturnReasonFields admin disabled={disabled} onValue={setReason} />
    <p><MemberCopyText copyKey="member.returns.adminSettlementNotice" /></p><div className={styles.actions}>
      {pending ? <button disabled={disabled || !reason.trim()} onClick={() => onReview("lock", reason)}>開始處理並鎖定撤回</button> : null}
      <button disabled={disabled || !reason.trim()} onClick={() => onReview("approve", reason)}>核准退貨</button><button disabled={disabled || !reason.trim()} onClick={() => onReview("reject", reason)}>不核准</button>
    </div></div>;
}
export type AdminReturnRow = { returnRequestId: string; orderNumber: string; customer?: string; status: string; requestedAt: string; quantity: number; returnDeadline: string | null };
export function AdminReturnList({ initial }: { initial: AdminReturnRow[] }) {
  const [search, setSearch] = useState(""), [status, setStatus] = useState("");
  const rows = initial.filter(item => (!status || item.status === status) && [item.orderNumber, item.customer, item.returnRequestId].join(" ").toLowerCase().includes(search.toLowerCase()));
  return <main className={styles.panel}><Link href="/admin/orders">← 訂單管理</Link><h1>退貨管理</h1><label>搜尋訂單／會員／退貨編號<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
    <label>狀態<select value={status} onChange={event => setStatus(event.target.value)}><option value="">全部</option>{["pending", "processing", "approved", "rejected", "withdrawn"].map(value => <option key={value} value={value}>{returnStatusLabels[value]}</option>)}</select></label>
    <p>{rows.length} 筆</p>{rows.map(item => <article className={styles.card} key={item.returnRequestId}><Link href={`/admin/returns/${encodeURIComponent(item.orderNumber)}#${item.returnRequestId}`}>{item.orderNumber}・{returnStatusLabels[item.status]}</Link><p>{item.customer}・申請 {item.quantity} 件</p><small>{item.returnRequestId}</small><p>申請時間：{returnTaipeiDate(item.requestedAt, true)}<br />最晚退貨期限：{returnTaipeiDate(item.returnDeadline)}</p></article>)}
    {!rows.length ? <p>沒有符合的退貨申請。</p> : null}
  </main>;
}
