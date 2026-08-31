import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { adjustMemberCreditByAdmin, MembershipCommerceError } from "@/lib/membershipCommerce";

export const dynamic = "force-dynamic";

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!site || site === "same-origin");
}

export async function POST(request: Request, context: { params: Promise<{ memberId: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "尚未登入管理後台。" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "無法確認操作來源，請重新整理後再試一次。" }, { status: 403 });
  try {
    const { memberId } = await context.params;
    const body = await request.json();
    if (body.confirmation !== "CONFIRM_CREDIT_ADJUSTMENT") return NextResponse.json({ error: "請先勾選確認本次調整。" }, { status: 400 });
    if (body.direction !== "grant" && body.direction !== "deduct") return NextResponse.json({ error: "請選擇新增或扣除抵用金。" }, { status: 400 });
    const result = await adjustMemberCreditByAdmin({
      memberId,
      direction: body.direction,
      amount: Number(body.amount),
      reason: String(body.reason ?? ""),
      note: String(body.note ?? ""),
      idempotencyKey: String(body.idempotencyKey ?? ""),
    });
    return NextResponse.json({ ok: true, balanceBefore: result.balanceBefore, balanceAfter: result.balanceAfter, creditEntryId: result.entry.creditEntryId });
  } catch (error) {
    if (error instanceof MembershipCommerceError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "抵用金調整失敗" }, { status: 500 });
  }
}
