import { NextResponse } from "next/server";

import { getCurrentMember } from "@/lib/memberAuth";
import { getMemberRetailPromotionCenter } from "@/lib/membershipCommerce";

export const dynamic = "force-dynamic";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "請先登入會員" }, { status: 401 });
  return NextResponse.json(await getMemberRetailPromotionCenter(member.id), {
    headers: { "Cache-Control": "no-store" },
  });
}
