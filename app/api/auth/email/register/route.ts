import { NextResponse } from "next/server";

import {
  createSessionToken,
  isValidEmail,
  MEMBER_SESSION_COOKIE,
  memberSessionCookieOptions,
  normalizeEmail,
  registerEmailMember,
} from "@/lib/memberAuth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = normalizeEmail(String(body.email ?? ""));
    const password = String(body.password ?? "");
    const passwordConfirmation = String(body.passwordConfirmation ?? "");

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Email 格式不正確" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "密碼至少需要 8 個字元" }, { status: 400 });
    }
    if (password !== passwordConfirmation) {
      return NextResponse.json({ error: "兩次輸入的密碼不一致" }, { status: 400 });
    }

    const member = await registerEmailMember(email, password);
    if (!member) {
      return NextResponse.json(
        { error: "此 Email 已經註冊過，請直接登入。" },
        { status: 409 },
      );
    }

    const response = NextResponse.json({ ok: true }, { status: 201 });
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
