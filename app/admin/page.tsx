import {TodayActions,NotificationStatus} from "@/components/admin/AdminDashboard";
import Link from "next/link";
import {isActionableOrder} from "@/lib/adminOrderOperations";
import {returnOperationCounts} from "@/lib/returnOperations";
import { redirect } from "next/navigation";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { listOrders, orderStatusLabel } from "@/lib/adminOrders";
import { listPendingOrderInquiries } from "@/lib/orderConversation";
import { readFulfillmentStore } from "@/lib/fulfillment";
import { readMembershipCommerceState } from "@/lib/membershipCommerce";
import { getDateOnlyInTimeZone, addDateOnlyDays } from "@/lib/checkoutRules";
import { readMember } from "@/lib/memberAuth";
import { subscriptionItemProductIds } from "@/lib/subscriptionSkuModel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const [orders, fulfillment, commerce] = await Promise.all([listOrders(), readFulfillmentStore(), readMembershipCommerceState()]);
  const today = new Date().toLocaleDateString("zh-TW");
  const todayOrders = orders.filter((order) => new Date(order.createdAt).toLocaleDateString("zh-TW") === today);
  const pending = orders.filter(isActionableOrder);
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
  const returnOps = returnOperationCounts(orders,commerce);
  const inquiryMessages = pendingInquiries.reduce((sum,entry)=>sum+entry.inquiry.unresolvedCustomerMessages,0);
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
      <Link href="/admin/customer-service"><strong>客服中心內容</strong><span>Owner 專用・常見問題、快速服務與聯絡資訊 →</span></Link>
      <Link href="/admin/store/content"><strong>商店內容工作室</strong><span>送禮首頁與各禮盒商品的介紹內容 →</span></Link>
      <Link href="/admin/store"><strong>商店工作區 / Store</strong><span>Owner 專用・銷售專區、商品分類與一般零售商品 →</span></Link>
      <Link className="admin-logo-entry" href="/admin/logo"><strong>上傳與管理 Logo</strong><span>Header、Footer、方形標誌與分享圖 →</span></Link>
      <Link href="/admin/homepage"><strong>首頁內容與照片</strong><span>Hero、多活動、推薦作品圖片 →</span></Link>
      <Link href="/admin/line-auto-reply"><strong>LINE 顧客導覽與自動回覆</strong><span>Owner 專用・常見問題、關鍵字、回覆內容與測試 →</span></Link>
      <Link href="/admin/pages"><strong>網站頁面管理</strong><span>建立、預覽與發布活動／專題頁 →</span></Link>
      <Link href="/admin/works"><strong>全部咖啡 / Works</strong><span>編輯全部咖啡頁面的內容與呈現設定 →</span></Link>
      <Link href="/admin/assets"><strong>品牌資產與 Logo</strong><span>圖片編號、尺寸、用途與 SEO 自動命名 →</span></Link>
      <Link href="/admin/products"><strong>作品與本月豆單</strong><span>23 款作品、上架、售完與首頁顯示 →</span></Link>
      <Link href="/admin/monthly-menu"><strong>本月豆單背景</strong><span>背景圖片、濃度、位置與 AI 提示詞 →</span></Link>
      <Link className="admin-inquiry-entry" href="/admin/orders"><strong className="admin-inquiry-link-title">訂單管理{pending.length?<b>{pending.length}</b>:null}</strong><span>待處理 {pending.length}・今日新增 {todayOrders.length} →</span></Link>
      <Link className="admin-inquiry-entry" href="/admin/returns"><strong className="admin-inquiry-link-title">退貨管理{returnOps.total?<b>{returnOps.total}</b>:null}</strong><span>待審核 {returnOps.pending}・待退款 {returnOps.awaitingRefund}・人工確認 {returnOps.manualReview}</span></Link>
      <Link className="admin-inquiry-entry" href="/admin/fulfillment"><strong className="admin-inquiry-link-title">訂單與物流{fulfillmentExceptions>0?<b>{fulfillmentExceptions}</b>:null}</strong><span>人工確認 {fulfillmentExceptions}・疑似未取貨 {unclaimedRisk} →</span></Link>
      <Link className="admin-inquiry-entry" href="/admin/orders/inquiries"><strong className="admin-inquiry-link-title">訂單詢問{pendingInquiries.length ? <b>{pendingInquiries.length}</b> : null}</strong><span>{inquiryMessages} 則留言等待回覆 →</span></Link>
      <Link className="admin-members-entry" href="/admin/members"><strong>會員管理</strong><span>搜尋、查看與管理會員資料、訂單、抵用金與會員狀態 →</span></Link>
      <Link className="admin-members-entry" href="/admin/member-directory"><strong>會員資料與組織圖</strong><span>Owner 專用・完整 live 會員目錄、推薦組織與權益摘要 →</span></Link>
      <Link href="/admin/member-identities"><strong>會員身份系統</strong><span>會員編號與登入方式安全狀態 →</span></Link>
      <Link href="/admin/membership"><strong>會員與定期購設定</strong><span>免運、配送、贈品、推薦與抵用金 →</span></Link>
      <Link href="/admin/member-center/copy"><strong>會員中心顯示文字與說明</strong><span>名稱、按鈕、提示與說明文字 →</span></Link>
      <Link href="/admin/referrals"><strong>推薦制度管理</strong><span>組織、獎勵明細與成本統計 →</span></Link>
      <Link href="/admin/pv"><strong>SKU PV 管理</strong><span>搜尋、篩選與集中設定 PV →</span></Link>
      <Link href="/admin/membership/test-lab"><strong>會員制度測試實驗室</strong><span>隔離模擬推薦、PV、獎勵與時間快轉 →</span></Link>
    </section>
    <section className="admin-panel">
      <div className="admin-panel-head"><div><p className="eyebrow dark">TODAY</p><h2>今天要處理</h2></div><div><a href="/api/admin/fulfillment/export">匯出未來 7 天</a>　<Link href="/admin/fulfillment">逐筆處理</Link></div></div>
      <TodayActions counts={{returns:returnOps.total,manualReturns:returnOps.manualReview,orders:pending.length,inquiries:pendingInquiries.length,messages:inquiryMessages,fulfillment:fulfillmentExceptions,unclaimed:unclaimedRisk}}/>
      <p className="admin-empty">未來 7 天共有 {nextSevenDays.length} 個定期購配送期次，預估需準備 {giftDemand} 份贈品。高風險的未取貨確認必須逐筆處理。</p>
      {upcomingRows.map(({ cycle, subscription, member }) => <Link href={cycle.createdOrderId ? `/admin/orders/${cycle.createdOrderId}` : "/admin/membership"} className="admin-order-row" key={cycle.cycleId}><div><strong>{cycle.plannedDate}・{cycle.createdOrderId || "尚未建立正式訂單"}</strong><span>{member?.displayName || member?.pickupName || "KD Coffee 會員"}・{cycle.itemsDraft.flatMap(subscriptionItemProductIds).join(" + ")}</span></div><div><span>{cycle.itemsDraft.reduce((sum, item) => sum + item.quantity, 0)} 份・{(cycle.shippingSnapshot?.method ?? subscription?.shippingMethod) === "711_cod" ? cycle.shippingSnapshot?.storeSelection?.storeName || subscription?.storeSelection?.storeName || "7-ELEVEN" : (cycle.shippingSnapshot?.method ?? subscription?.shippingMethod) === "home_delivery" ? "宅配" : "工作室自取"}</span><b>{cycle.giftSnapshot?.eligible ? `贈品 ${cycle.giftSnapshot.quantity} 份` : "本期無贈品"}</b></div></Link>)}
    </section>
    <NotificationStatus notifications={commerce.notifications}/>
    <section className="admin-panel"><p className="eyebrow dark">BUSINESS</p><h2>營運摘要</h2><div className="admin-stats">
      <article><small>今日訂單</small><strong>{todayOrders.length}</strong></article>
      <article><small>本月訂單</small><strong>{monthly.length}</strong></article>
      <article><small>本月訂單金額</small><strong>NT$ {revenue.toLocaleString("zh-TW")}</strong></article>
    </div></section>
    <section className="admin-panel">
      <div className="admin-panel-head"><div><p className="eyebrow dark">LATEST ORDERS</p><h2>最新訂單</h2></div><Link href="/admin/orders">查看全部</Link></div>
      {orders.slice(0, 10).map((order) => <Link href={`/admin/orders/${order.orderNumber}`} className="admin-order-row" key={order.orderNumber}><div><strong>{order.orderNumber}</strong><span>{order.customer?.name || "未填姓名"}・{order.orderMode === "711_cod" ? order.store?.name || "7-ELEVEN" : order.orderMode === "home_delivery" ? "宅配" : "工作室自取"}</span></div><div><span className="order-status-chip">{orderStatusLabel(order.status)}</span><b>NT$ {Number(order.total || order.subtotal || 0).toLocaleString("zh-TW")}</b></div></Link>)}
      {!orders.length && <p className="admin-empty">目前還沒有訂單。</p>}
    </section>
  </main>;
}
