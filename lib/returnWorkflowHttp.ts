import { NextResponse } from "next/server";
import { ReturnWorkflowError } from "./returnCreditPreview";
import { MemberOrderCancellationError } from "./orderCancellation";
import { OrderFileNotFoundError } from "./orderFiles";
import { OrderNotificationPhotoError } from "./orderNotificationPhotos";
import { readMemberCenterCopy } from "./memberCenterCopyStore";
import { resolveMemberCopy } from "./memberCenterCopy";

export async function returnWorkflowHttpError(error: unknown, admin = false) {
  const status = error instanceof ReturnWorkflowError || error instanceof MemberOrderCancellationError ? error.status
    : error instanceof OrderFileNotFoundError ? 404 : error instanceof SyntaxError || error instanceof OrderNotificationPhotoError ? 400 : 500;
  const code = error instanceof ReturnWorkflowError ? error.code : status === 404 ? "not_found" : status === 400 ? "invalid_input" : "return_review_required";
  const messages: Record<string, string> = { stale_confirmation: "資料或到期狀態已變更，請重新取得退貨確認。",
    invalid_confirmation: "確認資料無效，請重新取得退貨確認。", invalid_input: "請確認數量、200 字內原因及全部勾選項目。",
    final_confirmation_required: "請先完成退貨確認。", return_deadline_expired: "已超過原訂單最晚退貨期限。",
    quantity_exceeded: "可退貨數量已變更，請重新確認。", not_found: "找不到訂單。", not_authorized: "找不到訂單。",
    invalid_transition: "退貨狀態已變更，無法執行此操作。", review_reason_required: "請填寫 200 字內審核原因。" };
  const keys: Record<string, string> = { stale_confirmation: "errorStale", invalid_confirmation: "errorConfirmation", invalid_input: "errorInput", final_confirmation_required: "errorFinal",
    return_deadline_expired: "errorDeadline", quantity_exceeded: "errorQuantity", not_found: "errorNotFound", not_authorized: "errorNotFound", invalid_transition: "errorTransition", invalid_photos: "photoError", login_required: "errorLogin", invalid_origin: "errorOrigin" };
  const copy = await readMemberCenterCopy();
  const message = resolveMemberCopy(copy.overrides, `member.returns.${error instanceof OrderNotificationPhotoError ? "photoError" : keys[code] ?? "manualHelp"}`);
  return NextResponse.json({ error: admin ? messages[code] ?? message : message, ...(admin ? { code } : {}) }, { status });
}
export async function returnRequestBody(request: Request) {
  const body: unknown = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ReturnWorkflowError("invalid_input", 400);
  return body as Record<string, unknown>;
}
