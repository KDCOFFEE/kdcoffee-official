import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { addDateOnlyDays, getDateOnlyInTimeZone } from "@/lib/checkoutRules";
import { readMember } from "@/lib/memberAuth";
import { readMembershipCommerceState } from "@/lib/membershipCommerce";

export const dynamic = "force-dynamic";
const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const state = await readMembershipCommerceState();
  const today = getDateOnlyInTimeZone(new Date()); const end = addDateOnlyDays(today, 7);
  const cycles = Object.values(state.cycles).filter((cycle) => cycle.plannedDate >= today && cycle.plannedDate <= end && !["completed", "cancelled", "skipped", "uncollected"].includes(cycle.status));
  const rows = ["配送日期,訂單編號,會員,咖啡,數量,贈品,取貨方式"];
  for (const cycle of cycles) {
    const subscription = state.subscriptions[cycle.subscriptionId]; const member = subscription ? await readMember(subscription.memberId) : null;
    rows.push([cycle.plannedDate, cycle.createdOrderId || "尚未建立", member?.displayName || member?.pickupName || "KD Coffee 會員", cycle.itemsDraft.flatMap((item) => item.components.map((part) => part.productId)).join(" + "), cycle.itemsDraft.reduce((sum, item) => sum + item.quantity, 0), cycle.giftSnapshot?.eligible ? cycle.giftSnapshot.quantity : 0, subscription?.shippingMethod === "711_cod" ? subscription.storeSelection?.storeName || "7-ELEVEN" : "工作室自取"].map(csv).join(","));
  }
  return new Response(`\uFEFF${rows.join("\r\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="kd-fulfillment-${today}.csv"`, "Cache-Control": "no-store" } });
}
