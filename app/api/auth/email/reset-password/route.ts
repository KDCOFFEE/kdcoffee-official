import { NextResponse } from "next/server";

import { resetEmailMemberPassword } from "@/lib/memberAuth";

const INVALID_TOKEN_MESSAGE = "密碼重設連結無效或已過期，請重新申請。";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");
    const passwordConfirmation = String(body.passwordConfirmation ?? "");

    if (password.length < 8) {
      return NextResponse.json(
        { error: "密碼至少需要 8 個字元" },
        { status: 400 },
      );
    }
    if (password !== passwordConfirmation) {
      return NextResponse.json(
        { error: "兩次輸入的密碼不一致" },
        { status: 400 },
      );
    }
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(token) ||
      !(await resetEmailMemberPassword(token, password))
    ) {
      return NextResponse.json(
        { error: INVALID_TOKEN_MESSAGE },
        { status: 400 },
      );
    }

    return NextResponse.json({
      message: "密碼已重新設定，請使用新密碼登入。",
    });
  } catch {
    return NextResponse.json(
      { error: INVALID_TOKEN_MESSAGE },
      { status: 400 },
    );
  }
}
