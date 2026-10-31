import { createHash } from "node:crypto";
import { readOrder } from "./adminOrders";
import { resolveReturnLineEvidence } from "./orderCompletion";
import { readMembershipCommerceState } from "./membershipCommerce";
import { sendInternalLineNotification } from "./internalLineNotifications";

/** Reuses the existing configured Owner LINE recipient. Off unless explicitly enabled. */
export async function notifyReturnRequest(input: { orderNumber: string; returnRequestId: string; replayed: boolean }, options: {
  stateFilePath?: string; enabled?: boolean; sender?: typeof sendInternalLineNotification;
} = {}) {
  if (input.replayed || !(options.enabled ?? /^(true|1)$/iu.test(process.env.RETURN_REQUEST_LINE_NOTIFICATION_ENABLED ?? ""))) return { status: "skipped" as const };
  try {
    const [order, state] = await Promise.all([readOrder(input.orderNumber), readMembershipCommerceState(options.stateFilePath)]);
    const requested = state.returnEvents?.find(event => event.type === "RETURN_REQUESTED" && event.returnRequestId === input.returnRequestId && event.orderId === input.orderNumber);
    if (!order || !requested || requested.type !== "RETURN_REQUESTED") return { status: "skipped" as const };
    const evidence = resolveReturnLineEvidence({ orderNumber: order.orderNumber, status: "completed", completion: requested.completion });
    const items = requested.lines.map(line => `${evidence.status === "resolved" ? String(evidence.lines.find(item => item.returnLineRef === line.returnLineRef)?.snapshot.name ?? "原訂單商品").slice(0, 80) : "原訂單商品"} × ${line.quantity}`).join("、");
    const hash = createHash("sha256").update(`return-request-line:${requested.eventId}`).digest("hex");
    const retryKey = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    const result = await (options.sender ?? sendInternalLineNotification)(`【KD Coffee 退貨申請】\n訂單：${order.orderNumber}\n會員：${String(order.customer?.name ?? "會員").slice(0, 80)}\n商品：${items.slice(0, 2000)}\n原因：${requested.reason}`, { attempts: 1, timeoutMs: 2000, retryKey });
    return { status: result.sent ? "sent" as const : "failed" as const };
  } catch { return { status: "failed" as const }; }
}
