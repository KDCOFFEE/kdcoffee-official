import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/memberAuth";
import { readOrder } from "@/lib/adminOrders";
import { readMembershipCommerceState } from "@/lib/membershipCommerce";
import { buildCancelCreditPreview, unavailableCancelCreditPreview } from "@/lib/cancelCreditPreview";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(_request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const { orderNumber } = await params;
  if (!/^KD[0-9-]+$/.test(orderNumber)) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  const order = await readOrder(orderNumber);
  if (!order || order.member?.memberId !== member.id) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  try {
    const state = await readMembershipCommerceState();
    return NextResponse.json(buildCancelCreditPreview(order, state, member.id, new Date()), { headers });
  } catch {
    return NextResponse.json(unavailableCancelCreditPreview(new Date()), { headers });
  }
}
