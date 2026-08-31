import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/memberAuth";
import { assignReferralByCode, getMemberReferralCenter, MembershipCommerceError } from "@/lib/membershipCommerce";

export const dynamic = "force-dynamic";

function sameOrigin(request: Request) { const origin = request.headers.get("origin"); return !origin || origin === new URL(request.url).origin; }

export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "請先登入會員" }, { status: 401 });
  const url = new URL(request.url);
  return NextResponse.json(await getMemberReferralCenter(member.id, { baseUrl: url.origin }));
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "無法確認請求來源" }, { status: 403 });
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "請先登入會員" }, { status: 401 });
  try {
    const body = await request.json();
    const referralCode = String(body.referralCode || "").slice(0, 40);
    const idempotencyKey = String(body.idempotencyKey || "").slice(0, 120);
    if (!referralCode || !idempotencyKey) throw new MembershipCommerceError("推薦碼或操作識別遺失");
    await assignReferralByCode({ referralCode, referredMemberId: member.id, safeDisplayName: member.displayName, idempotencyKey: `${member.id}:${idempotencyKey}` });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "推薦關係無法建立" }, { status: 400 }); }
}
