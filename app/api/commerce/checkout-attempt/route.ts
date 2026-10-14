import {
  issuePublicGuestCheckoutAttemptAccess, PublicCheckoutAttemptAccessUnavailableError,
} from "@/lib/publicCheckoutAttemptAccess";
import { CheckoutAttemptAccessError } from "@/lib/checkoutAttemptAccess";
import { isStoreCommerceEnabled } from "@/lib/storeCommerceCapability";

export const runtime = "nodejs";
function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: {
    "Cache-Control": "no-store", Pragma: "no-cache", Expires: "0",
  } });
}
export async function POST(request: Request) {
  if (!isStoreCommerceEnabled()) return json({ error: "結帳授權服務暫時無法使用。" }, 403);
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: "請求資料不正確。" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).length !== 1 || !Object.hasOwn(body, "idempotencyKey")) {
    return json({ error: "請求資料不正確。" }, 400);
  }
  try {
    const issued = issuePublicGuestCheckoutAttemptAccess({ idempotencyKey: (body as Record<string, unknown>).idempotencyKey });
    return json({
      attemptAccessToken: issued.token, expiresAt: issued.expiresAt, canonicalAttemptKey: issued.idempotencyKey,
    }, 200);
  } catch (error) {
    if (error instanceof PublicCheckoutAttemptAccessUnavailableError) return json({ error: error.message }, error.status);
    if (error instanceof CheckoutAttemptAccessError && error.code === "INVALID_KEY") return json({ error: "請求資料不正確。" }, 400);
    return json({ error: "結帳授權服務暫時無法使用。" }, 500);
  }
}
