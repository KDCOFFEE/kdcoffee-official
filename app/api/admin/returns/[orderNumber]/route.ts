import { NextResponse } from "next/server";
import { readAdminSession } from "@/lib/adminAuth";
import { getReturnWorkflow, adminReturnAction } from "@/lib/returnWorkflow";
import { returnRequestBody, returnWorkflowHttpError } from "@/lib/returnWorkflowHttp";
import { isSameOriginRequest } from "@/lib/requestSecurity";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ orderNumber: string }> };
export async function GET(_request: Request, { params }: Context) {
  if (!(await readAdminSession())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  try { return NextResponse.json(await getReturnWorkflow((await params).orderNumber), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return returnWorkflowHttpError(error, true); }
}
export async function POST(request: Request, { params }: Context) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "無法確認請求來源" }, { status: 403 });
  const session = await readAdminSession();
  if (!session) return NextResponse.json({ error: "未授權" }, { status: 401 });
  try { return NextResponse.json(await adminReturnAction((await params).orderNumber, session.adminId ?? "legacy-admin", await returnRequestBody(request))); }
  catch (error) { return returnWorkflowHttpError(error, true); }
}
