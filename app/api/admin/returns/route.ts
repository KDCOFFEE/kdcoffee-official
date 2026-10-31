import { NextResponse } from "next/server";
import { readAdminSession } from "@/lib/adminAuth";
import { listOrders } from "@/lib/adminOrders";
import { readMembershipCommerceState } from "@/lib/membershipCommerce";
import { projectReturnWorkflow } from "@/lib/returnWorkflow";
import { returnWorkflowHttpError } from "@/lib/returnWorkflowHttp";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!(await readAdminSession())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  try {
    const [orders, state] = await Promise.all([listOrders(), readMembershipCommerceState()]);
    const { searchParams } = new URL(request.url), status = searchParams.get("status"), search = (searchParams.get("q") ?? "").toLowerCase();
    const rows = orders.flatMap(order => {
      if (!state.returnEvents?.some(event => event.orderId === order.orderNumber)) return [];
      const view = projectReturnWorkflow(order, state);
      return view.requests.map(item => ({ returnRequestId: item.returnRequestId, orderNumber: order.orderNumber,
        customer: view.customer, status: item.status, requestedAt: item.occurredAt, quantity: item.lines.reduce((sum, line) => sum + line.quantity, 0), returnDeadline: view.returnDeadline }));
    }).filter(item => (!status || item.status === status) && (!search || [item.orderNumber, item.returnRequestId, item.customer].join(" ").toLowerCase().includes(search)));
    return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return returnWorkflowHttpError(error, true); }
}
