import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/memberAuth";
import { getReturnWorkflow, memberReturnAction } from "@/lib/returnWorkflow";
import { returnRequestBody, returnWorkflowHttpError } from "@/lib/returnWorkflowHttp";
import { isSameOriginRequest } from "@/lib/requestSecurity";
import { ReturnWorkflowError } from "@/lib/returnCreditPreview";
import { notifyReturnRequest } from "@/lib/returnRequestNotification";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ orderNumber: string }> };
export async function GET(_request: Request, { params }: Context) {
  const member = await getCurrentMember();
  if (!member) return returnWorkflowHttpError(new ReturnWorkflowError("login_required", 401));
  try { return NextResponse.json(await getReturnWorkflow((await params).orderNumber, member.id), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return returnWorkflowHttpError(error); }
}
export async function POST(request: Request, { params }: Context) {
  if (!isSameOriginRequest(request)) return returnWorkflowHttpError(new ReturnWorkflowError("invalid_origin", 403));
  const member = await getCurrentMember();
  if (!member) return returnWorkflowHttpError(new ReturnWorkflowError("login_required", 401));
  try {
    const orderNumber = (await params).orderNumber;
    let values: Record<string, unknown>, photos: File[] = [];
    if (request.headers.get("Content-Type")?.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const raw: unknown = JSON.parse(String(form.get("payload") ?? "null"));
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ReturnWorkflowError("invalid_input", 400);
      values = raw as Record<string, unknown>;
      const attachments = form.getAll("photos");
      if (values.action !== "create" || attachments.length > 3 || attachments.some(value => !(value instanceof File))) throw new ReturnWorkflowError("invalid_photos", 400);
      photos = attachments as File[];
    } else values = await returnRequestBody(request);
    const result = await memberReturnAction(orderNumber, member.id, values, { photos });
    if (values.action === "create" && result.returnRequestId) await notifyReturnRequest({ orderNumber, returnRequestId: result.returnRequestId, replayed: result.replayed ?? false });
    return NextResponse.json(result);
  }
  catch (error) { return returnWorkflowHttpError(error); }
}
