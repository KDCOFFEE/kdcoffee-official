import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { assessOrderCancellation, assessOrderInventoryTransaction, orderStatusLabel, readOrder } from "@/lib/adminOrders";
import { assessOrderStatusCompatibility } from "@/lib/orderStatusPolicy";
import OrderStatusForm from "@/components/admin/OrderStatusForm";

type OrderItem = {
  slug?: string;
  name?: string;
  optionLabel?: string;
  optionDetail?: string;
  preparationLabel?: string;
  customRoast?: boolean;
  roastLevel?: string;
  roastNote?: string;
  quantity?: number;
  lineTotal?: number;
};
export const dynamic = "force-dynamic";
export default async function OrderDetailPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const { orderNumber } = await params;
  const order = await readOrder(orderNumber); if (!order) notFound();
  const inventoryAssessment = assessOrderInventoryTransaction(order);
  const cancellationAssessment = assessOrderCancellation(order);
  const statusCompatibility = assessOrderStatusCompatibility(order);
  return <main className="admin-page"><div className="admin-back"><Link href="/admin/orders">← 返回訂單列表</Link></div><section className="admin-detail-grid"><article className="admin-panel"><p className="eyebrow dark">ORDER DETAIL</p><h1>{order.orderNumber}</h1><p>{new Date(order.createdAt).toLocaleString("zh-TW")}・{orderStatusLabel(order.status)}</p><div className="admin-detail-section"><h2>客戶資料</h2><dl><dt>姓名</dt><dd>{order.customer?.name || "—"}</dd><dt>手機</dt><dd>{order.customer?.phone || "—"}</dd><dt>Email</dt><dd>{order.customer?.email || "—"}</dd><dt>LINE 會員</dt><dd>{order.member?.lineDisplayName || "訪客"}</dd><dt>備註</dt><dd>{order.customer?.note || "無"}</dd></dl></div><div className="admin-detail-section"><h2>取貨方式</h2>{order.orderMode === "711_cod" ? <dl><dt>方式</dt><dd>7-ELEVEN 取貨付款</dd><dt>門市</dt><dd>{order.store?.name}</dd><dt>店號</dt><dd>{order.store?.id}</dd><dt>地址</dt><dd>{order.store?.address}</dd></dl> : <dl><dt>方式</dt><dd>工作室自取</dd><dt>日期</dt><dd>{order.studioPickup?.preferredDate || "未指定"}</dd><dt>時段</dt><dd>{order.studioPickup?.preferredTime || "未指定"}</dd></dl>}</div><div className="admin-detail-section"><h2>商品內容</h2>{(order.items || []).map((item:OrderItem)=><div className="admin-item-line" key={`${item.slug}-${item.optionLabel}`}><span>{item.name}<small>{item.optionLabel} {item.optionDetail}{item.preparationLabel ? ` · ${item.preparationLabel}` : ""}</small>{item.customRoast ? <em className="admin-custom-roast">專屬烘焙：{item.roastLevel}{item.roastNote ? `｜${item.roastNote}` : ""}</em> : null}</span><b>× {item.quantity}　NT$ {Number(item.lineTotal).toLocaleString("zh-TW")}</b></div>)}<div className="admin-totals"><span>商品小計</span><b>NT$ {Number(order.subtotal||0).toLocaleString("zh-TW")}</b><span>運費</span><b>{order.shipping ? `NT$ ${order.shipping}` : "免運"}</b><span>總計</span><strong>NT$ {Number(order.total||order.subtotal||0).toLocaleString("zh-TW")}</strong></div></div></article><aside className="admin-panel admin-side-panel"><h2>處理訂單</h2><OrderStatusForm orderNumber={order.orderNumber} orderMode={order.orderMode} initialStatus={order.status} initialTracking={order.trackingNumber} reactivationBlocked={order.status === "cancelled"} inventoryReturned={order.inventoryReturn?.state === "returned"} inventoryFulfillmentBlocked={inventoryAssessment.fulfillmentBlocked} inventoryGuardMessage={inventoryAssessment.adminWarning} cancellationAllowed={cancellationAssessment.allowed} cancellationBlockedMessage={cancellationAssessment.errorMessage} />{!statusCompatibility.compatible ? <div className="admin-line-box admin-status-mismatch-warning" role="alert"><small>配送流程警告</small><strong>{statusCompatibility.warning}</strong></div> : null}{inventoryAssessment.adminWarning ? <div className={`admin-line-box admin-inventory-warning${inventoryAssessment.kind === "legacy_missing" ? " legacy" : ""}`} role={inventoryAssessment.fulfillmentBlocked ? "alert" : "status"}><small>{inventoryAssessment.adminTitle}</small><strong>{inventoryAssessment.adminWarning}</strong></div> : null}{order.status === "cancelled" ? <div className="admin-line-box admin-cancellation-detail"><small>取消資訊</small><strong>已取消</strong><span>取消時間：{order.cancelledAt ? new Date(order.cancelledAt).toLocaleString("zh-TW") : "歷史訂單未記錄"}</span><span>取消原因：{order.cancellationReason || "歷史訂單未記錄"}</span><span>操作來源：{order.cancelledBy === "admin" ? "後台管理員" : "歷史訂單未記錄"}</span></div> : null}{order.inventoryReturn?.state === "returned" ? <div className="admin-line-box"><small>取消訂單庫存</small><strong>庫存已回補（{new Date(order.inventoryReturn.returnedAt).toLocaleString("zh-TW")}）</strong></div> : null}{order.inventoryReturn?.state === "return_pending" ? <div className="admin-line-box"><small>取消訂單庫存</small><strong>庫存回補狀態待確認，請再次儲存取消狀態以安全恢復。</strong></div> : null}{order.inventoryReturn?.state === "return_failed" ? <div className="admin-line-box"><small>取消訂單庫存警告</small><strong>{order.inventoryReturn.warning || "庫存回補失敗，請再次操作或人工核對。"}</strong></div> : null}<div className="admin-line-box"><small>LINE 工作室通知</small><strong>{order.lineNotification?.sent ? "新訂單已通知" : "訂單已保存，通知可能失敗"}</strong></div></aside></section></main>;
}
