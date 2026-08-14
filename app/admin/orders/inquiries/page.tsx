import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { listOrders } from "@/lib/adminOrders";
import { listPendingOrderInquiries } from "@/lib/orderConversation";

export const dynamic = "force-dynamic";

function deliveryLabel(order: { orderMode?: string; store?: { name?: string } }) {
  if (order.orderMode === "711_cod") return order.store?.name || "7-ELEVEN 取貨付款";
  if (order.orderMode === "studio_pickup") return "KD Coffee 工作室自取";
  return "企業送禮洽詢";
}

function displayTime(value: string | undefined) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleString("zh-TW")
    : "時間未記錄";
}

export default async function OrderInquiryInboxPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const inquiries = listPendingOrderInquiries(await listOrders());

  return (
    <main className="admin-page">
      <div className="admin-back"><Link href="/admin/orders">← 返回訂單管理</Link></div>
      <section className="admin-panel admin-inquiry-inbox">
        <div className="admin-panel-head">
          <div>
            <p className="eyebrow dark">ORDER INQUIRIES</p>
            <h1>待處理訂單詢問</h1>
            <p>集中查看客人尚待回覆或確認的訂單留言。</p>
          </div>
          <span>{inquiries.length} 張訂單</span>
        </div>
        <div className="admin-inquiry-list">
          {inquiries.map(({ order, inquiry }) => (
            <article className="admin-inquiry-card" key={order.orderNumber}>
              <div className="admin-inquiry-card-head">
                <div>
                  <strong>{order.orderNumber}</strong>
                  <span>{order.customer?.name || "未填姓名"}・{deliveryLabel(order)}</span>
                </div>
                <time>{displayTime(inquiry.latestCustomerMessage?.createdAt)}</time>
              </div>
              <p>{inquiry.latestCustomerMessage?.message.slice(0, 120)}</p>
              <div className="admin-inquiry-card-foot">
                <span>{inquiry.unresolvedCustomerMessages} 則尚待處理</span>
                <Link href={`/admin/orders/${encodeURIComponent(order.orderNumber)}`}>查看並回覆 →</Link>
              </div>
            </article>
          ))}
          {!inquiries.length ? <p className="admin-empty">目前沒有待處理的訂單詢問。</p> : null}
        </div>
      </section>
    </main>
  );
}
