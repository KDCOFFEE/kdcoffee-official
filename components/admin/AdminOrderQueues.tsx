"use client";
import Link from 'next/link';
import {useState} from 'react';
import type {AdminOrderQueueRow,AdminInquiryQueueRow} from '@/lib/adminOrderOperations';
import css from './AdminOrderQueues.module.css';
type Row=AdminOrderQueueRow|AdminInquiryQueueRow;
type Kind='orders'|'inquiries';
export function selectAdminQueue(rows:readonly Row[],kind:Kind,filter:string,search:string){
 const needle=search.trim().toLocaleLowerCase();
 return rows.filter(row=>(filter==='all'||(filter==='actionable'?row.actionable:kind==='inquiries'?!row.actionable:row.status===filter))&&[row.orderNumber,row.customer,'message'in row?row.message:''].join(' ').toLocaleLowerCase().includes(needle)).sort((a,b)=>{
  if(a.actionable!==b.actionable)return a.actionable?-1:1;
  const time=(row:Row)=>kind==='inquiries'&&'waitingSince'in row?(row.actionable?row.waitingSince:row.historyAt):row.createdAt;
  const difference=(Date.parse(time(a))||0)-(Date.parse(time(b))||0);
  return (a.actionable?difference:-difference)||a.orderNumber.localeCompare(b.orderNumber);
 });
}
function displayTime(value?:string){return value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'時間未記錄';}
export function AdminQueueView({rows,kind,filter,search,onFilter,onSearch}:{rows:Row[];kind:Kind;filter:string;search:string;onFilter:(value:string)=>void;onSearch:(value:string)=>void}){
 const inquiry=kind==='inquiries',pending=rows.filter(row=>row.actionable).length,history=rows.length-pending;
 const filters:Array<[string,string,number]>=inquiry?[['actionable','待處理',pending],['history','已處理',history],['all','全部',rows.length]]:[['actionable','待處理',pending],['completed','已完成',rows.filter(row=>row.status==='completed').length],['cancelled','已取消',rows.filter(row=>row.status==='cancelled').length],['all','全部',rows.length]];
 const visible=selectAdminQueue(rows,kind,filter,search),historyLabel=inquiry?'已處理／歷史':'已完成／歷史';
 const groups=filter==='all'?[{label:'待處理',rows:visible.filter(row=>row.actionable)},{label:historyLabel,rows:visible.filter(row=>!row.actionable)}]:[{label:filters.find(([key])=>key===filter)?.[1]??'待處理',rows:visible}];
 return <><section className={css.summary} aria-label="營運摘要"><strong>{inquiry?'待處理詢問':'待處理訂單'}（{pending}）</strong>{filters.filter(([key])=>key!=='actionable'&&key!=='all').map(([key,label,count])=><span key={key}>{label}（{count}）</span>)}{inquiry?<span>尚待回覆訊息（{rows.reduce((sum,row)=>sum+('unresolved'in row?row.unresolved:0),0)} 則）</span>:<Link href="/admin/orders/inquiries">待處理詢問（{rows.filter(row=>row.pendingInquiry).length}） →</Link>}</section>
 <section className={css.toolbar} aria-label="搜尋與篩選"><label>搜尋訂單、會員{inquiry?'或留言':''}<input type="search" placeholder={inquiry?'輸入訂單編號、會員名稱或留言':'輸入訂單編號或會員名稱'} value={search} onChange={event=>onSearch(event.target.value)}/></label><label>狀態篩選<select value={filter} onChange={event=>onFilter(event.target.value)}>{filters.map(([value,label,count])=><option key={value} value={value}>{label}（{count}）</option>)}</select></label></section>
 <p className={css.count}>共 {visible.length} {inquiry?'筆訂單詢問':'筆訂單'}</p>
 {groups.filter(group=>group.rows.length>0).map(group=><section className={css.group} aria-label={group.label} key={group.label}><h2>{group.label}（{group.rows.length}）</h2>{group.rows.map(row=><article className={css.card+' '+(row.actionable?css.actionable:css.history)} key={row.orderNumber}>
 <header><div><h3>{row.orderNumber}</h3><p>{row.customer} · {row.delivery}</p></div><div className={css.badges}>{row.actionable?<span className={css.workBadge}>待處理</span>:null}<span>{inquiry?(row.actionable?'待回覆':'已處理'):row.statusLabel}</span>{!inquiry&&row.pendingInquiry?<Link href={'/admin/orders/'+encodeURIComponent(row.orderNumber)}>有待回覆詢問</Link>:null}</div></header>
 {inquiry&&'message'in row?<><p className={css.message}>{row.message}</p><dl><div><dt>最後客人留言時間</dt><dd>{displayTime(row.customerMessageAt)}</dd></div>{row.lastReplyAt?<div><dt>最後回覆時間</dt><dd>{displayTime(row.lastReplyAt)}</dd></div>:null}{row.actionable?<div><dt>尚待回覆</dt><dd>{row.unresolved} 則</dd></div>:null}</dl></>:<dl><div><dt>建立時間</dt><dd>{displayTime(row.createdAt)}</dd></div><div><dt>訂單金額</dt><dd>NT$ {row.total.toLocaleString('zh-TW')}</dd></div></dl>}
 <footer>{row.actionable?<p><span>下一步</span><strong>{inquiry?'查看並回覆':'處理訂單'}</strong></p>:<span/>}<Link className={row.actionable?css.primary:css.secondary} href={'/admin/orders/'+encodeURIComponent(row.orderNumber)}>{row.actionable?(inquiry?'查看並回覆':'處理訂單'):'查看紀錄'} →</Link></footer>
 </article>)}</section>)}{!visible.length?<p className={css.empty}>目前沒有符合條件的{inquiry?'訂單詢問':'訂單'}。可調整搜尋或篩選查看歷史。</p>:null}</>;
}
export default function AdminOrderQueue({rows,kind}:{rows:AdminOrderQueueRow[]|AdminInquiryQueueRow[];kind:Kind}){
 const [filter,setFilter]=useState('actionable'),[search,setSearch]=useState('');
 return <AdminQueueView rows={rows} kind={kind} filter={filter} search={search} onFilter={setFilter} onSearch={setSearch}/>;
}
