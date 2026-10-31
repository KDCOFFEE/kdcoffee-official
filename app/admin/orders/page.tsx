import Link from 'next/link';
import {redirect} from 'next/navigation';
import {isAdminAuthenticated} from '@/lib/adminAuth';
import {listOrders} from '@/lib/adminOrders';
import {projectAdminOrderQueue} from '@/lib/adminOrderOperations';
import AdminOrderQueue from '@/components/admin/AdminOrderQueues';
export const dynamic='force-dynamic';
export default async function OrdersPage(){
 if(!(await isAdminAuthenticated()))redirect('/admin/login');
 const rows=projectAdminOrderQueue(await listOrders());
 return <main className="admin-page"><div className="admin-back"><Link href="/admin">← 返回營運中心</Link></div><section className="admin-panel"><div className="admin-panel-head"><div><p className="eyebrow dark">ORDER MANAGEMENT</p><h1>訂單管理</h1><p>先處理尚未完成的訂單，已完成與已取消紀錄可隨時查閱。</p></div></div><AdminOrderQueue rows={rows} kind="orders"/></section></main>;
}
