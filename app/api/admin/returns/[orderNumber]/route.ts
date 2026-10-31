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
  try {
    let values:Record<string,unknown>,photos:File[]=[];
    if(request.headers.get("Content-Type")?.startsWith("multipart/form-data")){
      const form=await request.formData();const raw:unknown=JSON.parse(String(form.get("payload")??"null"));
      if(!raw||typeof raw!=="object"||Array.isArray(raw))return NextResponse.json({error:"無效操作"},{status:400});
      values=raw as Record<string,unknown>;const files=form.getAll("photos");
      if(values.action!=="refund_confirm"||files.length>3||files.some(f=>!(f instanceof File)))return NextResponse.json({error:"無效圖片"},{status:400});
      photos=files as File[];
    }else values=await returnRequestBody(request);
    return NextResponse.json(await adminReturnAction((await params).orderNumber,session.adminId??"legacy-admin",values,{photos}));
  }
  catch (error) { return returnWorkflowHttpError(error, true); }
}
