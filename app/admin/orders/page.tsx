import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { listOrders, orderStatusLabel } from "@/lib/adminOrders";
import { listPendingOrderInquiries } from "@/lib/orderConversation";
export const dynamic = "force-dynamic";
export default async function OrdersPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const orders = await listOrders();
  const pendingInquiries = listPendingOrderInquiries(orders);
  return <main className="admin-page"><div className="admin-back"><Link href="/admin">← 返回營運中心</Link></div><section className="admin-panel"><div className="admin-panel-head"><div><p className="eyebrow dark">ORDER MANAGEMENT</p><h1>全部訂單</h1></div><div className="admin-orders-head-actions"><Link className={pendingInquiries.length ? "has-pending" : ""} href="/admin/orders/inquiries">{pendingInquiries.length ? `待處理詢問：${pendingInquiries.length}` : "訂單詢問"}</Link><span>{orders.length} 筆</span></div></div>{orders.map(order=><Link href={`/admin/orders/${order.orderNumber}`} className="admin-order-row" key={order.orderNumber}><div><strong>{order.orderNumber}</strong><span>{new Date(order.createdAt).toLocaleString("zh-TW")}・{order.customer?.name || "未填姓名"}</span><span>{order.orderMode === "711_cod" ? `${order.store?.name || "7-ELEVEN"}｜${order.store?.id || ""}` : "工作室自取"}</span></div><div><span className="order-status-chip">{orderStatusLabel(order.status)}</span><b>NT$ {Number(order.total||order.subtotal||0).toLocaleString("zh-TW")}</b></div></Link>)}</section></main>;
}
