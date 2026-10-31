import Link from 'next/link';
import {redirect} from 'next/navigation';
import {isAdminAuthenticated} from '@/lib/adminAuth';
import {listOrders} from '@/lib/adminOrders';
import {projectAdminInquiryQueue} from '@/lib/adminOrderOperations';
import AdminOrderQueue from '@/components/admin/AdminOrderQueues';
export const dynamic='force-dynamic';
export default async function OrderInquiryInboxPage(){
 if(!(await isAdminAuthenticated()))redirect('/admin/login');
 const rows=projectAdminInquiryQueue(await listOrders());
 return <main className="admin-page"><div className="admin-back"><Link href="/admin/orders">← 返回訂單管理</Link></div><section className="admin-panel"><div className="admin-panel-head"><div><p className="eyebrow dark">ORDER INQUIRIES</p><h1>訂單詢問</h1><p>優先查看尚待回覆的留言，也能查閱已處理的對話紀錄。</p></div></div><AdminOrderQueue rows={rows} kind="inquiries"/></section></main>;
}
