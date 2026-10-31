import { redirect } from "next/navigation";
import { readAdminSession } from "@/lib/adminAuth";
import { listOrders } from "@/lib/adminOrders";
import { readMembershipCommerceState } from "@/lib/membershipCommerce";
import { projectReturnWorkflow } from "@/lib/returnWorkflow";
import { AdminReturnList } from "@/components/admin/AdminReturnWorkflow";

export const dynamic = "force-dynamic";
export default async function ReturnsPage() {
  if (!(await readAdminSession())) redirect("/admin/login");
  const [orders, state] = await Promise.all([listOrders(), readMembershipCommerceState()]);
  const rows = orders.flatMap(order => {
    if (!state.returnEvents?.some(event => event.orderId === order.orderNumber)) return [];
    const view = projectReturnWorkflow(order, state);
    return view.requests.map(item => ({ returnRequestId: item.returnRequestId, orderNumber: order.orderNumber, customer: view.customer,
      status: item.status, refundStatus:item.paymentRefund.status, refundAmount:item.paymentRefund.amount??(item.paymentRefund.preview?.status==="resolved"?item.paymentRefund.preview.amount:null), refundMethod:item.refundRequest?.method, requestedAt: item.occurredAt, quantity: item.lines.reduce((sum, line) => sum + line.quantity, 0), returnDeadline: view.returnDeadline }));
  });
  return <AdminReturnList initial={rows} />;
}
