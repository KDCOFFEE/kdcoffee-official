import { NextResponse } from "next/server";

import {
  createSessionToken,
  isValidEmail,
  MEMBER_SESSION_COOKIE,
  memberSessionCookieOptions,
  normalizeEmail,
  registerEmailMember,
} from "@/lib/memberAuth";
import { assignReferralByCode, referralCodeForMember, MembershipCommerceError } from "@/lib/membershipCommerce";
import { getIdentityRegistrySnapshot } from "@/lib/memberIdentity";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = normalizeEmail(String(body.email ?? ""));
    const password = String(body.password ?? "");
    const passwordConfirmation = String(body.passwordConfirmation ?? "");
    const referralCode = String(body.referralCode ?? "").trim().toUpperCase();

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Email 格式不正確" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "密碼至少需要 8 個字元" }, { status: 400 });
    }
    if (password !== passwordConfirmation) {
      return NextResponse.json({ error: "兩次輸入的密碼不一致" }, { status: 400 });
    }
    if (referralCode) {
      if (!/^KD[A-F0-9]{10}$/.test(referralCode)) {
        return NextResponse.json({ error: "推薦連結格式不正確" }, { status: 400 });
      }
      const registry = await getIdentityRegistrySnapshot();
      const valid = Object.keys(registry.members).some((memberId) => referralCodeForMember(memberId) === referralCode);
      if (!valid) return NextResponse.json({ error: "推薦連結已失效，請向分享給您的朋友確認" }, { status: 400 });
    }

    const member = await registerEmailMember(email, password);
    if (!member) {
      return NextResponse.json(
        { error: "此 Email 已經註冊過，請直接登入。" },
        { status: 409 },
      );
    }

    if (referralCode) {
      try {
        await assignReferralByCode({
          referralCode,
          referredMemberId: member.id,
          safeDisplayName: member.displayName || "KD Coffee 會員",
          idempotencyKey: `email-register:${member.id}:${referralCode}`,
        });
      } catch (error) {
        if (error instanceof MembershipCommerceError) {
          return NextResponse.json({ error: `會員已建立，但推薦關係建立失敗：${error.message}` }, { status: 409 });
        }
        throw error;
      }
    }

    const response = NextResponse.json({ ok: true, referralAssigned: Boolean(referralCode) }, { status: 201 });
    response.cookies.set(
      MEMBER_SESSION_COOKIE,
      createSessionToken(member.id),
      memberSessionCookieOptions(process.env.NODE_ENV === "production"),
    );
    return response;
  } catch {
    return NextResponse.json({ error: "建立會員失敗，請稍後再試" }, { status: 500 });
  }
}
