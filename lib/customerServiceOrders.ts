import "server-only";
import { getCurrentMember } from "./memberAuth";
import { listOrders, type StoredOrder } from "./adminOrders";
import { readFulfillmentStore, fulfillmentRecordForOrder } from "./fulfillment";
import { fulfillmentStateLabels, type FulfillmentStore } from "./fulfillmentTypes";
import { orderStatusLabel } from "./orderInventoryPolicy";

/** Strict server-side ownership filter; only these display fields can reach the page. */
export function projectServiceOrders(memberId: string, orders: StoredOrder[], fulfillment: FulfillmentStore) {
  return orders.filter(order => order?.member?.memberId === memberId && /^KD[0-9-]+$/.test(order.orderNumber) && typeof order.createdAt === "string")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3)
    .map(order => {
      const record = fulfillmentRecordForOrder(fulfillment, order);
      return {
        orderNumber: order.orderNumber, createdAt: order.createdAt,
        status: fulfillmentStateLabels[record.currentState] || orderStatusLabel(order.status),
        method: order.orderMode === "711_cod" ? "7-ELEVEN 取貨付款" : order.orderMode === "studio_pickup" ? "工作室自取" : order.orderMode === "home_delivery" ? "宅配" : order.orderMode === "corporate_gift" ? "企業送禮洽詢" : "請至訂單確認配送方式",
      };
    });
}
export async function readCustomerServiceOrders() {
  const member = await getCurrentMember();
  if (!member) return { kind: "guest" as const, orders: [] };
  try {
    const [orders, fulfillment] = await Promise.all([listOrders(), readFulfillmentStore()]);
    return { kind: "member" as const, orders: projectServiceOrders(member.id, orders, fulfillment) };
  } catch { return { kind: "unavailable" as const, orders: [] }; }
}
