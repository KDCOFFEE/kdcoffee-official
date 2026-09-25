import { NextResponse } from "next/server";

import {
  createSessionToken,
  MEMBER_SESSION_COOKIE,
  memberSessionCookieOptions,
  MIN_MEMBER_PASSWORD_LENGTH,
  registerPhoneMember,
} from "@/lib/memberAuth";
import {
  assignReferralByCode,
  MembershipCommerceError,
} from "@/lib/membershipCommerce";
import {
  IdentityValidationError,
  normalizeTaiwanMobile,
} from "@/lib/memberIdentity";
import {
  clearReferralAttributionCookie,
  isValidReferralAttributionCode,
  normalizeReferralAttributionCode,
  resolveReferralAttributionCandidate,
} from "@/lib/referralAttribution";
import { clearRetailPromotionAttributionCookie } from "@/lib/retailPromotionAttribution";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const phone = normalizeTaiwanMobile(String(body.phone ?? ""));
    const password = String(body.password ?? "");
    const passwordConfirmation = String(body.passwordConfirmation ?? "");
    const suppliedReferralCode = String(body.referralCode ?? "").trim().toUpperCase();

    if (!phone) {
      return NextResponse.json({ error: "台灣手機號碼格式不正確" }, { status: 400 });
    }
    if (password.length < MIN_MEMBER_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `密碼至少需要 ${MIN_MEMBER_PASSWORD_LENGTH} 個字元` },
        { status: 400 },
      );
    }
    if (password !== passwordConfirmation) {
      return NextResponse.json({ error: "兩次輸入的密碼不一致" }, { status: 400 });
    }

    if (suppliedReferralCode) {
      const normalized = normalizeReferralAttributionCode(suppliedReferralCode);
      if (!normalized || !(await isValidReferralAttributionCode(normalized))) {
        return NextResponse.json(
          { error: "推薦連結已失效，請向分享給您的朋友確認" },
          { status: 400 },
        );
      }
    }

    const referralCode = await resolveReferralAttributionCandidate(suppliedReferralCode);
    const member = await registerPhoneMember(phone, password);
    if (!member) {
      return NextResponse.json(
        { error: "此手機號碼已經註冊過，請直接登入。" },
        { status: 409 },
      );
    }

    if (referralCode) {
      try {
        await assignReferralByCode({
          referralCode,
          referredMemberId: member.id,
          safeDisplayName: member.displayName || "KD Coffee 會員",
          idempotencyKey: `phone-register:${member.id}:${referralCode}`,
        });
      } catch (error) {
        if (error instanceof MembershipCommerceError) {
          return NextResponse.json(
            { error: `會員已建立，但推薦關係建立失敗：${error.message}` },
            { status: 409 },
          );
        }
        throw error;
      }
    }

    const response = NextResponse.json(
      { ok: true, referralAssigned: Boolean(referralCode) },
      { status: 201 },
    );
    response.cookies.set(
      MEMBER_SESSION_COOKIE,
      createSessionToken(member.id),
      memberSessionCookieOptions(process.env.NODE_ENV === "production"),
    );
    clearReferralAttributionCookie(response);
    clearRetailPromotionAttributionCookie(response);
    return response;
  } catch (error) {
    if (error instanceof IdentityValidationError) {
      return NextResponse.json({ error: "手機號碼或密碼格式不正確" }, { status: 400 });
    }
    return NextResponse.json({ error: "建立會員失敗，請稍後再試" }, { status: 500 });
  }
}
