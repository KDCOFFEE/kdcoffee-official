import Link from 'next/link';
import css from './AdminDashboard.module.css';
export type DashboardCounts={returns:number;manualReturns:number;orders:number;inquiries:number;messages:number;fulfillment:number;unclaimed:number};
export function TodayActions({counts:c}:{counts:DashboardCounts}){
 const cards=[['待處理退貨',c.returns,'人工確認 '+c.manualReturns,'/admin/returns','查看退貨'],['未完成訂單',c.orders,c.orders+' 筆訂單尚未完成','/admin/orders','查看待處理訂單'],['待回覆詢問',c.inquiries,c.messages+' 則留言等待回覆','/admin/orders/inquiries','查看詢問'],['物流／人工確認',c.fulfillment,'查看需要人工確認的物流狀態','/admin/fulfillment','查看物流'],['疑似未取貨',c.unclaimed,'逐筆確認取貨情況','/admin/fulfillment','查看取貨狀態']] as const;
 return <div className={css.tasks}>{cards.map(([label,count,description,href,action])=><Link key={label} href={href} className={css.task+' '+(count>0?css.active:css.quiet)}><span>{label}</span><strong>{count}</strong><p>{description}</p><b>{action} →</b></Link>)}</div>;
}
export function NotificationStatus({notifications}:{notifications:ReadonlyArray<{status:string}>}){
 const count=(status:string)=>notifications.filter(n=>n.status===status).length,failed=count('failed');
 return <section className={'admin-panel '+css.system}><div className="admin-panel-head"><div><p className="eyebrow dark">SYSTEM STATUS</p><h2>自動化與通知</h2></div></div><div className={css.statuses}><article><span>通知待發送</span><strong>{count('pending')}</strong><p>系統將依既有通知流程自動發送。</p></article><article><span>通知處理中</span><strong>{count('processing')}</strong><p>通知正在處理中。</p></article><article className={failed>0?css.warning:css.quiet}><span>通知失敗</span><strong>{failed}</strong><p>{failed>0?'有通知未成功送達，需要後續確認。':'目前無通知失敗'}</p></article></div></section>;
}
