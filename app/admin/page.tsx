import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { listOrders, orderStatusLabel } from "@/lib/adminOrders";
import { listPendingOrderInquiries } from "@/lib/orderConversation";
import { readFulfillmentStore } from "@/lib/fulfillment";
import { readMembershipCommerceState } from "@/lib/membershipCommerce";
import { getDateOnlyInTimeZone, addDateOnlyDays } from "@/lib/checkoutRules";
import { readMember } from "@/lib/memberAuth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const [orders, fulfillment, commerce] = await Promise.all([listOrders(), readFulfillmentStore(), readMembershipCommerceState()]);
  const today = new Date().toLocaleDateString("zh-TW");
  const todayOrders = orders.filter((order) => new Date(order.createdAt).toLocaleDateString("zh-TW") === today);
  const pending = orders.filter((order) => !["completed", "cancelled"].includes(order.status));
  const pendingInquiries = listPendingOrderInquiries(orders);
  const month = new Date().getMonth();
  const year = new Date().getFullYear();
  const monthly = orders.filter((order) => {
    const date = new Date(order.createdAt);
    return date.getMonth() === month && date.getFullYear() === year;
  });
  const revenue = monthly.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + Number(order.total || order.subtotal || 0), 0);
  const taipeiToday = getDateOnlyInTimeZone(new Date());
  const nextWeek = addDateOnlyDays(taipeiToday, 7);
  const fulfillmentExceptions = Object.values(fulfillment.records).filter((record) => ["exception_requires_review", "suspected_uncollected"].includes(record.currentState)).length + fulfillment.reviews.filter((review) => review.status === "open").length;
  const unclaimedRisk = Object.values(fulfillment.records).filter((record) => record.currentState === "suspected_uncollected").length;
  const nextSevenDays = Object.values(commerce.cycles).filter((cycle) => cycle.plannedDate >= taipeiToday && cycle.plannedDate <= nextWeek && !["completed", "cancelled", "skipped", "uncollected"].includes(cycle.status));
  const giftDemand = nextSevenDays.reduce((sum, cycle) => sum + (cycle.giftSnapshot?.eligible ? cycle.giftSnapshot.quantity : 0), 0);
  const pendingNotifications = commerce.notifications.filter((notice) => notice.status === "pending").length;
  const upcomingRows = await Promise.all(nextSevenDays.map(async (cycle) => {
    const subscription = commerce.subscriptions[cycle.subscriptionId];
    const member = subscription ? await readMember(subscription.memberId) : null;
    return { cycle, subscription, member };
  }));

  return <main className="admin-page">
    <header className="admin-topbar">
      <div><p className="eyebrow dark">KD COFFEE STUDIO</p><h1>工作室營運中心</h1></div>
      <form action="/api/admin/logout" method="post"><button className="logout-button">登出後台</button></form>
    </header>
    <section className="admin-quick-links">
      <Link className="admin-logo-entry" href="/admin/logo"><strong>上傳與管理 Logo</strong><span>Header、Footer、方形標誌與分享圖 →</span></Link>
      <Link href="/admin/homepage"><strong>首頁內容與照片</strong><span>Hero、多活動、推薦作品圖片 →</span></Link>
      <Link href="/admin/pages"><strong>網站頁面管理</strong><span>建立、預覽與發布活動／專題頁 →</span></Link>
      <Link href="/admin/assets"><strong>品牌資產與 Logo</strong><span>圖片編號、尺寸、用途與 SEO 自動命名 →</span></Link>
      <Link href="/admin/products"><strong>作品與本月豆單</strong><span>23 款作品、上架、售完與首頁顯示 →</span></Link>
      <Link href="/admin/monthly-menu"><strong>本月豆單背景</strong><span>背景圖片、濃度、位置與 AI 提示詞 →</span></Link>
      <Link href="/admin/orders"><strong>訂單管理</strong><span>查看與更新所有訂單 →</span></Link>
      <Link href="/admin/fulfillment"><strong>訂單與物流</strong><span>準備、交寄、到店、取貨與人工確認 →</span></Link>
      <Link className="admin-inquiry-entry" href="/admin/orders/inquiries"><strong className="admin-inquiry-link-title">訂單詢問{pendingInquiries.length ? <b>{pendingInquiries.length}</b> : null}</strong><span>查看等待回覆的客人留言 →</span></Link>
      <Link className="admin-members-entry" href="/admin/members"><strong>會員管理</strong><span>搜尋、查看與管理會員資料、訂單、抵用金與會員狀態 →</span></Link>
      <Link href="/admin/member-identities"><strong>會員身份系統</strong><span>會員編號與登入方式安全狀態 →</span></Link>
      <Link href="/admin/membership"><strong>會員與定期購設定</strong><span>免運、配送、贈品、推薦與抵用金 →</span></Link>
      <Link href="/admin/referrals"><strong>推薦制度管理</strong><span>組織、獎勵明細與成本統計 →</span></Link>
      <Link href="/admin/pv"><strong>SKU PV 管理</strong><span>搜尋、篩選與集中設定 PV →</span></Link>
      <Link href="/admin/membership/test-lab"><strong>會員制度測試實驗室</strong><span>隔離模擬推薦、PV、獎勵與時間快轉 →</span></Link>
    </section>
    <section className="admin-panel">
      <div className="admin-panel-head"><div><p className="eyebrow dark">TODAY</p><h2>今天要處理</h2></div><div><a href="/api/admin/fulfillment/export">匯出未來 7 天</a>　<Link href="/admin/fulfillment">逐筆處理</Link></div></div>
      <div className="admin-stats"><article><small>未完成訂單</small><strong>{pending.length}</strong></article><article><small>物流／人工確認</small><strong>{fulfillmentExceptions}</strong></article><article><small>疑似未取貨</small><strong>{unclaimedRisk}</strong></article><article><small>待處理通知</small><strong>{pendingNotifications}</strong></article></div>
      <p className="admin-empty">未來 7 天共有 {nextSevenDays.length} 個定期購配送期次，預估需準備 {giftDemand} 份贈品。高風險的未取貨確認必須逐筆處理。</p>
      {upcomingRows.map(({ cycle, subscription, member }) => <Link href={cycle.createdOrderId ? `/admin/orders/${cycle.createdOrderId}` : "/admin/membership"} className="admin-order-row" key={cycle.cycleId}><div><strong>{cycle.plannedDate}・{cycle.createdOrderId || "尚未建立正式訂單"}</strong><span>{member?.displayName || member?.pickupName || "KD Coffee 會員"}・{cycle.itemsDraft.flatMap((item) => item.components.map((part) => part.productId)).join(" + ")}</span></div><div><span>{cycle.itemsDraft.reduce((sum, item) => sum + item.quantity, 0)} 份・{subscription?.shippingMethod === "711_cod" ? subscription.storeSelection?.storeName || "7-ELEVEN" : "工作室自取"}</span><b>{cycle.giftSnapshot?.eligible ? `贈品 ${cycle.giftSnapshot.quantity} 份` : "本期無贈品"}</b></div></Link>)}
    </section>
    <section className="admin-stats">
      <article><small>今日訂單</small><strong>{todayOrders.length}</strong></article>
      <article><small>待處理</small><strong>{pending.length}</strong></article>
      <article><small>本月訂單</small><strong>{monthly.length}</strong></article>
      <article><small>本月訂單金額</small><strong>NT$ {revenue.toLocaleString("zh-TW")}</strong></article>
    </section>
    <section className="admin-panel">
      <div className="admin-panel-head"><div><p className="eyebrow dark">LATEST ORDERS</p><h2>最新訂單</h2></div><Link href="/admin/orders">查看全部</Link></div>
      {orders.slice(0, 10).map((order) => <Link href={`/admin/orders/${order.orderNumber}`} className="admin-order-row" key={order.orderNumber}><div><strong>{order.orderNumber}</strong><span>{order.customer?.name || "未填姓名"}・{order.orderMode === "711_cod" ? order.store?.name || "7-ELEVEN" : "工作室自取"}</span></div><div><span className="order-status-chip">{orderStatusLabel(order.status)}</span><b>NT$ {Number(order.total || order.subtotal || 0).toLocaleString("zh-TW")}</b></div></Link>)}
      {!orders.length && <p className="admin-empty">目前還沒有訂單。</p>}
    </section>
  </main>;
}
