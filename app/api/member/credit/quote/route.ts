import { NextResponse } from "next/server";

import { getCurrentMember } from "@/lib/memberAuth";
import { getCheckoutCreditQuote, MembershipCommerceError } from "@/lib/membershipCommerce";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "請先登入會員" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const merchandiseSubtotal = Number(url.searchParams.get("subtotal"));
    const shipping = Number(url.searchParams.get("shipping"));
    if (!Number.isSafeInteger(merchandiseSubtotal) || merchandiseSubtotal < 0 || !Number.isSafeInteger(shipping) || shipping < 0) throw new MembershipCommerceError("結帳金額不正確");
    return NextResponse.json(await getCheckoutCreditQuote({ memberId: member.id, merchandiseSubtotal, shipping }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法計算抵用金" }, { status: error instanceof MembershipCommerceError ? 400 : 500 });
  }
}
