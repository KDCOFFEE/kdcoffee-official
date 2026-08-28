import Link from "next/link";
import { redirect } from "next/navigation";

import LogisticsSettingsForm from "@/components/admin/LogisticsSettingsForm";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { listOrders } from "@/lib/adminOrders";
import { fulfillmentRecordForOrder, readFulfillmentStore, readLogisticsSettings } from "@/lib/fulfillment";
import { fulfillmentStateLabels } from "@/lib/fulfillmentTypes";

export const dynamic = "force-dynamic";

export default async function FulfillmentPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const [orders, store, settings] = await Promise.all([listOrders(), readFulfillmentStore(), readLogisticsSettings()]);
  const rows = orders.filter((order)=>order.orderMode === "711_cod" || order.orderMode === "studio_pickup").map((order)=>({order,record:fulfillmentRecordForOrder(store,order)}));
  const counts = {
    preparing: rows.filter(({record})=>["order_created","preparing"].includes(record.currentState)).length,
    shipping: rows.filter(({record})=>["shipped","in_transit"].includes(record.currentState)).length,
    arrived: rows.filter(({record})=>record.currentState === "arrived_at_pickup_store").length,
    pickup: rows.filter(({record})=>record.currentState === "ready_for_store_pickup").length,
    review: rows.filter(({record})=>["suspected_uncollected","exception_requires_review"].includes(record.currentState)).length + store.reviews.filter((item)=>item.status === "open").length,
  };
  return <main className="admin-page fulfillment-admin-page">
    <div className="admin-back"><Link href="/admin">← 返回營運中心</Link></div>
    <header className="fulfillment-admin-header"><div><p className="eyebrow dark">ORDER FULFILLMENT</p><h1>訂單與物流</h1><p>集中查看 7-ELEVEN 與工作室自取的準備、到店和完成狀態。</p></div><span className="gmail-status-pill">自動追蹤：{settings.automaticTrackingEnabled ? "已啟用" : "未啟用"}</span></header>
    <section className="fulfillment-summary" aria-label="履約摘要"><article><small>待準備</small><strong>{counts.preparing}</strong></article><article><small>待交寄／配送中</small><strong>{counts.shipping}</strong></article><article><small>7-ELEVEN 已到店</small><strong>{counts.arrived}</strong></article><article><small>自取待領</small><strong>{counts.pickup}</strong></article><article className={counts.review ? "needs-review" : ""}><small>需要人工確認</small><strong>{counts.review}</strong></article></section>
    {store.reviews.some((item)=>item.status==="open")?<section className="admin-panel fulfillment-review-panel"><div className="admin-panel-head"><div><p className="eyebrow dark">REVIEW</p><h2>需要人工確認的物流通知</h2></div></div>{store.reviews.filter((item)=>item.status==="open").map((item)=><article key={item.reviewId}><strong>{item.externalOrderId||"物流編號無法辨識"}</strong><span>{item.message}</span><small>{new Date(item.createdAt).toLocaleString("zh-TW")}</small></article>)}<p>請先在正確的 KD Coffee 訂單中連結賣貨便編號，再重新檢查；系統不會自行猜測。</p></section>:null}
    <section className="admin-panel fulfillment-orders-panel"><div className="admin-panel-head"><div><p className="eyebrow dark">NEXT ACTION</p><h2>待處理訂單</h2></div><span>{rows.filter(({record})=>!["completed","cancelled","uncollected"].includes(record.currentState)).length} 筆</span></div><div className="fulfillment-order-list">{rows.map(({order,record})=><Link href={`/admin/orders/${order.orderNumber}`} key={order.orderNumber} className="fulfillment-order-row"><div><strong>{order.orderNumber}</strong><span>{order.customer?.name || "未填姓名"}・{order.orderMode === "711_cod" ? "7-ELEVEN" : "工作室自取"}</span><small>{order.orderMode === "711_cod" ? order.store?.name || "門市待確認" : `${order.studioPickup?.preferredDate || "日期待確認"} ${order.studioPickup?.preferredTime || ""}`}</small></div><div><span className={`fulfillment-state-chip state-${record.currentState}`}>{fulfillmentStateLabels[record.currentState]}</span>{record.pickupDeadline ? <small>取貨期限：{new Date(record.pickupDeadline).toLocaleDateString("zh-TW")}</small> : null}<b>{record.currentState === "order_created" ? "開始準備 →" : record.currentState === "preparing" && order.orderMode === "711_cod" ? "標記已交寄 →" : record.currentState === "preparing" ? "標記可以取貨 →" : ["arrived_at_pickup_store","ready_for_store_pickup","suspected_uncollected"].includes(record.currentState) ? "確認取貨結果 →" : "查看紀錄 →"}</b></div></Link>)}</div></section>
    <section className="admin-panel fulfillment-settings-panel"><div className="admin-panel-head"><div><p className="eyebrow dark">LOGISTICS SETTINGS</p><h2>物流追蹤設定</h2></div></div><LogisticsSettingsForm initial={{...settings,gmailConnection:{...settings.gmailConnection,reviewCount:store.reviews.filter((item)=>item.status === "open").length}}} /></section>
  </main>;
}
