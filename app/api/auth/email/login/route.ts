import { NextResponse } from "next/server";

import {
  authenticateEmailMember,
  MemberAccountDisabledError,
  createSessionToken,
  MEMBER_SESSION_COOKIE,
  memberSessionCookieOptions,
  normalizeEmail,
} from "@/lib/memberAuth";
import { clearReferralAttributionCookie } from "@/lib/referralAttribution";

const LOGIN_ERROR = "Email 或密碼錯誤";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = normalizeEmail(String(body.email ?? ""));
    const password = String(body.password ?? "");
    const member = await authenticateEmailMember(email, password);

    if (!member) {
      return NextResponse.json({ error: LOGIN_ERROR }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      MEMBER_SESSION_COOKIE,
      createSessionToken(member.id),
      memberSessionCookieOptions(process.env.NODE_ENV === "production"),
    );
    clearReferralAttributionCookie(response);
    return response;
  } catch (error) {
    if (error instanceof MemberAccountDisabledError) {
      return NextResponse.json(
        {
          error: "此會員帳號目前已由 KD Coffee 停用。如需重新啟用或有任何疑問，請聯繫 KD Coffee 客服協助。",
          code: "MEMBER_DISABLED",
        },
        { status: 403 },
      );
    }

    return NextResponse.json({ error: LOGIN_ERROR }, { status: 401 });
  }
}
