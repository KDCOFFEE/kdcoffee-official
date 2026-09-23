import { NextResponse } from "next/server";

import { readAdminSession, verifyAdminPassword } from "@/lib/adminAuth";
import { resetEmailMemberPasswordByAdmin } from "@/lib/memberAuth";
import { isSameOriginRequest } from "@/lib/requestSecurity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function POST(
  request: Request,
  context: { params: Promise<{ memberId: string }> },
) {
  const session = await readAdminSession();
  if (!session) {
    return NextResponse.json({ error: "管理員登入已失效，請重新登入。" }, { status: 401 });
  }
  if (session.legacy || session.role !== "owner") {
    return NextResponse.json({ error: "只有 Owner 可以重新設定會員密碼。" }, { status: 403 });
  }
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "無法確認操作來源，請重新整理後再試一次。" },
      { status: 403 },
    );
  }

  try {
    const { memberId } = await context.params;
    if (!/^[A-Za-z0-9_-]{3,160}$/.test(memberId)) {
      return NextResponse.json({ error: "會員識別碼格式不正確。" }, { status: 400 });
    }

    const body = await request.json();
    const adminPassword = String(body.adminPassword ?? "");
    const password = String(body.password ?? "");
    const passwordConfirmation = String(body.passwordConfirmation ?? "");

    if (!adminPassword) {
      return NextResponse.json({ error: "請輸入 Owner 管理員密碼。" }, { status: 400 });
    }
    if (!verifyAdminPassword(adminPassword)) {
      return NextResponse.json({ error: "Owner 管理員密碼不正確。" }, { status: 403 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "會員新密碼至少需要 8 個字元。" }, { status: 400 });
    }
    if (password !== passwordConfirmation) {
      return NextResponse.json({ error: "兩次輸入的會員新密碼不一致。" }, { status: 400 });
    }

    const result = await resetEmailMemberPasswordByAdmin(memberId, password);
    if (result.status === "not-found") {
      return NextResponse.json({ error: "找不到這位會員。" }, { status: 404 });
    }
    if (result.status === "email-login-unavailable") {
      return NextResponse.json(
        { error: "這位會員目前沒有可重新設定的 Email 密碼登入憑證。" },
        { status: 409 },
      );
    }
    if (result.status === "invalid-input") {
      return NextResponse.json({ error: "會員資料或新密碼格式不正確。" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "會員密碼已重新設定。",
      updatedAt: result.updatedAt,
    });
  } catch (error) {
    console.error("admin member password reset failed", error);
    return NextResponse.json(
      { error: "會員密碼重新設定失敗，請先停止操作並檢查伺服器紀錄。" },
      { status: 500 },
    );
  }
}
