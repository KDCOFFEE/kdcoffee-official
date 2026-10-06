import { fulfillmentStateLabels, type FulfillmentEmailEventType, type LogisticsTrackingRecord } from "./fulfillmentTypes";
import { validSevenElevenShipmentId } from "./sevenElevenEmailSummary";

export function logisticsNotificationText(record: LogisticsTrackingRecord, state: FulfillmentEmailEventType, occurredAt: string, linkedOrderId?: string) {
  const summary = record.summary;
  const lines = ["KD Coffee｜7-ELEVEN 物流通知", `狀態：${fulfillmentStateLabels[state]}`];
  if (summary?.recipient) lines.push(`收件人：${summary.recipient}`);
  if (state === "order_created" && summary?.market) lines.push(`賣場：${summary.market}`);
  if (summary?.items?.length) {
    lines.push("商品：");
    for (const item of summary.items.slice(0, 10)) lines.push(`・${item.name} × ${item.quantity}`);
    if (summary.items.length > 10) lines.push(`另有 ${summary.items.length - 10} 項商品，請查看訂單明細`);
  }
  if (summary?.total !== undefined) lines.push(`訂單總額：NT$${summary.total.toLocaleString("zh-TW")}`);
  if (state === "order_created" && summary?.shipping !== undefined) lines.push(`運費：NT$${summary.shipping.toLocaleString("zh-TW")}`);
  if ((state === "order_created" || state === "arrived_at_pickup_store") && summary?.payment) lines.push(`付款方式：${summary.payment}`);
  if (summary?.store) lines.push(`取貨門市：${summary.store}`);
  if (state === "arrived_at_pickup_store" && summary?.pickupDeadline) lines.push(`取貨期限（郵件）：${summary.pickupDeadline}`);
  if (state === "order_created" && summary?.note) lines.push(`備註：${summary.note}`);
  lines.push(`賣貨便訂單：${record.externalOrderId}`);
  if (validSevenElevenShipmentId(record.externalShipmentId)) lines.push(`交貨便單號：${record.externalShipmentId}`);
  if (linkedOrderId) {
    lines.push(`官網訂單：${linkedOrderId}`);
    lines.push(`後台：https://www.kdcoffee1962.com/admin/orders/${encodeURIComponent(linkedOrderId)}`);
  }
  lines.push(`郵件收件時間：${new Date(occurredAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`);
  const actions = { order_created: "確認商品內容，安排備貨", shipped: "已交寄，等待到店通知", arrived_at_pickup_store: "可聯絡客人取貨", completed: "客人已完成取貨" };
  lines.push(`待辦：${actions[state]}`);
  return lines.join("\n");
}
