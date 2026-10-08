import { NextResponse } from "next/server";
import { readAdminSession } from "@/lib/adminAuth";
import { isSameOriginRequest } from "@/lib/requestSecurity";
import { MembershipRulesValidationError, MembershipRulesVersionConflictError } from "@/lib/membershipBusinessRules";
import { readPointDisplayNameSetting, savePointDisplayName } from "@/lib/pointDisplayNameStore";

export const dynamic = "force-dynamic";
export async function GET() {
  if ((await readAdminSession())?.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await readPointDisplayNameSetting(), { headers: { "Cache-Control": "no-store" } });
}
export async function PUT(request: Request) {
  if ((await readAdminSession())?.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "無法確認操作來源。" }, { status: 403 });
  try {
    const content = await request.text();
    if (content.length > 1024) return NextResponse.json({ error: "名稱設定過大。" }, { status: 413 });
    let body;
    try { body = JSON.parse(content); } catch { throw new MembershipRulesValidationError("名稱設定格式不正確。"); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["expectedRevision", "pointDisplayName"].includes(key))) throw new MembershipRulesValidationError("只能儲存點數名稱與設定版本。");
    return NextResponse.json(await savePointDisplayName({ expectedRevision: body.expectedRevision, pointDisplayName: body.pointDisplayName }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof MembershipRulesVersionConflictError ? 409 : error instanceof MembershipRulesValidationError ? 400 : 500;
    return NextResponse.json({ error: status === 500 ? "點數名稱儲存失敗，請稍後再試。" : (error as Error).message }, { status });
  }
}
