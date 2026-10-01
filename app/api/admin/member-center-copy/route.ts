import { NextResponse } from "next/server";
import { readAdminSession } from "@/lib/adminAuth";
import { isSameOriginRequest } from "@/lib/requestSecurity";
import { MemberCopyConflictError, MemberCopyValidationError, readMemberCenterCopy, saveMemberCenterCopy } from "@/lib/memberCenterCopyStore";

export const dynamic = "force-dynamic";
export async function GET() {
  if ((await readAdminSession())?.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await readMemberCenterCopy(), { headers: { "Cache-Control": "no-store" } });
}
export async function PUT(request: Request) {
  if ((await readAdminSession())?.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "無法確認操作來源。" }, { status: 403 });
  try {
    const content = await request.text();
    if (content.length > 512_000) return NextResponse.json({ error: "文字設定過大。" }, { status: 413 });
    let body;
    try { body = JSON.parse(content); } catch { throw new MemberCopyValidationError("文字設定格式不正確。" ); }
    const copy = await saveMemberCenterCopy({ expectedRevision: body?.expectedRevision, overrides: body?.overrides });
    return NextResponse.json(copy, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof MemberCopyConflictError ? 409 : error instanceof MemberCopyValidationError ? 400 : 500;
    return NextResponse.json({ error: status === 500 ? "顯示文字儲存失敗，請稍後再試。" : (error as Error).message }, { status });
  }
}
