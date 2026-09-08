import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/memberAuth";
import { assignReferralByCode, getMemberReferralCenter, MembershipCommerceError } from "@/lib/membershipCommerce";

export const dynamic = "force-dynamic";

function normalizeOrigin(value: string | null | undefined) {
  if (!value?.trim()) return null;

  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

function resolvePublicOrigin(request: Request) {
  const configured =
    normalizeOrigin(process.env.MEMBER_SITE_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);

  if (configured) return configured;

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();

  if (forwardedHost) {
    const protocol = forwardedProto === "http" ? "http" : "https";
    const forwardedOrigin = normalizeOrigin(`${protocol}://${forwardedHost}`);
    if (forwardedOrigin) return forwardedOrigin;
  }

  const host = request.headers.get("host")?.trim();

  if (host) {
    const requestProtocol = new URL(request.url).protocol;
    const hostOrigin = normalizeOrigin(`${requestProtocol}//${host}`);
    if (hostOrigin) return hostOrigin;
  }

  return new URL(request.url).origin;
}

function sameOrigin(request: Request) {
  const origin = normalizeOrigin(request.headers.get("origin"));
  return !origin || origin === resolvePublicOrigin(request);
}

export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "請先登入會員" }, { status: 401 });
  return NextResponse.json(await getMemberReferralCenter(member.id, { baseUrl: resolvePublicOrigin(request) }));
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
