import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { listOrders, orderStatusLabel } from "@/lib/adminOrders";
import { listPendingOrderInquiries } from "@/lib/orderConversation";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const orders = await listOrders();
  const today = new Date().toLocaleDateString("zh-TW");
  const todayOrders = orders.filter(o => new Date(o.createdAt).toLocaleDateString("zh-TW") === today);
  const pending = orders.filter(o => !["completed","cancelled"].includes(o.status));
  const pendingInquiries = listPendingOrderInquiries(orders);
  const month = new Date().getMonth(); const year = new Date().getFullYear();
  const monthly = orders.filter(o => { const d=new Date(o.createdAt); return d.getMonth()===month && d.getFullYear()===year; });
  const revenue = monthly.filter(o=>o.status!=="cancelled").reduce((sum,o)=>sum+Number(o.total||o.subtotal||0),0);
  return <main className="admin-page"><header className="admin-topbar"><div><p className="eyebrow dark">KD COFFEE STUDIO</p><h1>工作室營運中心</h1></div><form action="/api/admin/logout" method="post"><button className="logout-button">登出後台</button></form></header><section className="admin-quick-links"><Link className="admin-logo-entry" href="/admin/logo"><strong>上傳與管理 Logo</strong><span>Header、Footer、方形標誌與分享圖 →</span></Link><Link href="/admin/homepage"><strong>首頁內容與照片</strong><span>Hero、多活動、推薦作品圖片 →</span></Link><Link href="/admin/pages"><strong>網站頁面管理</strong><span>建立、預覽與發布活動／專題頁 →</span></Link><Link href="/admin/assets"><strong>品牌資產與 Logo</strong><span>圖片編號、尺寸、用途與 SEO 自動命名 →</span></Link><Link href="/admin/products"><strong>作品與本月豆單</strong><span>23 款作品、上架、售完與首頁顯示 →</span></Link><Link href="/admin/monthly-menu"><strong>本月豆單背景</strong><span>背景圖片、濃度、位置與 AI 提示詞 →</span></Link><Link href="/admin/orders"><strong>訂單管理</strong><span>查看與更新所有訂單 →</span></Link><Link className="admin-inquiry-entry" href="/admin/orders/inquiries"><strong className="admin-inquiry-link-title">訂單詢問{pendingInquiries.length ? <b>{pendingInquiries.length}</b> : null}</strong><span>查看等待回覆的客人留言 →</span></Link></section><section className="admin-stats"><article><small>今日訂單</small><strong>{todayOrders.length}</strong></article><article><small>待處理</small><strong>{pending.length}</strong></article><article><small>本月訂單</small><strong>{monthly.length}</strong></article><article><small>本月訂單金額</small><strong>NT$ {revenue.toLocaleString("zh-TW")}</strong></article></section><section className="admin-panel"><div className="admin-panel-head"><div><p className="eyebrow dark">LATEST ORDERS</p><h2>最新訂單</h2></div><Link href="/admin/orders">查看全部</Link></div>{orders.slice(0,10).map(order=><Link href={`/admin/orders/${order.orderNumber}`} className="admin-order-row" key={order.orderNumber}><div><strong>{order.orderNumber}</strong><span>{order.customer?.name || "未填姓名"}・{order.orderMode === "711_cod" ? order.store?.name || "7-ELEVEN" : "工作室自取"}</span></div><div><span className="order-status-chip">{orderStatusLabel(order.status)}</span><b>NT$ {Number(order.total||order.subtotal||0).toLocaleString("zh-TW")}</b></div></Link>)}{!orders.length && <p className="admin-empty">目前還沒有訂單。</p>}</section></main>;
}
