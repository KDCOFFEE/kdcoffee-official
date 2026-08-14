import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withStoredOrderUpdateLock } from "@/lib/adminOrders";
import { markOrderInquiryResolved } from "@/lib/orderConversation";
import { OrderFileNotFoundError } from "@/lib/orderFiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "未授權。" }, { status: 401 });
  }

  const { orderNumber } = await params;
  if (!/^KD[0-9-]+$/.test(orderNumber)) {
    return NextResponse.json({ error: "找不到訂單。" }, { status: 404 });
  }

  try {
    const result = await withStoredOrderUpdateLock(
      orderNumber,
      async (latestOrder, persistOrder) => {
        const resolved = markOrderInquiryResolved(latestOrder);
        if (resolved.changed) await persistOrder(resolved.order);
        return resolved;
      },
    );
    return NextResponse.json({
      ok: true,
      resolved: result.changed,
      inquiry: result.inquiry,
    });
  } catch (error) {
    if (error instanceof OrderFileNotFoundError) {
      return NextResponse.json({ error: "找不到訂單。" }, { status: 404 });
    }
    return NextResponse.json({ error: "目前無法更新詢問狀態。" }, { status: 500 });
  }
}
