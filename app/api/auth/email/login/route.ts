import { NextResponse } from "next/server";

import {
  authenticateEmailMember,
  createSessionToken,
  MEMBER_SESSION_COOKIE,
  memberSessionCookieOptions,
  normalizeEmail,
} from "@/lib/memberAuth";

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
    return response;
  } catch {
    return NextResponse.json({ error: LOGIN_ERROR }, { status: 401 });
  }
}
