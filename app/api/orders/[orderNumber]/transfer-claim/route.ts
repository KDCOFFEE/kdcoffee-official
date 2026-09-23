import { NextResponse } from "next/server";

import { readOrder, withStoredOrderUpdateLock } from "@/lib/adminOrders";
import { resolveCustomerOrderAccess } from "@/lib/customerOrderAccess";
import { authorizeOrderConversationAccess } from "@/lib/orderConversation";
import {
  AtmTransferClaimValidationError,
  normalizeAtmTransferClaims,
  validateAtmTransferClaimInput,
} from "@/lib/homeDeliveryPayment";
import { sendInternalLineNotification } from "@/lib/internalLineNotifications";
import {
  OrderNotificationPhotoError,
  validateAndStoreOrderNotificationPhoto,
} from "@/lib/orderNotificationPhotos";
import { projectOrderFinancialBreakdown } from "@/lib/orderFinancialProjection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validOrderNumber(value: string) {
  return /^KD[0-9-]+$/.test(value);
}

async function authorizedOrder(orderNumber: string, guestToken?: string) {
  if (!validOrderNumber(orderNumber)) return null;
  const order = await readOrder(orderNumber);
  if (!order) return null;
  const access = await resolveCustomerOrderAccess(order, guestToken);
  return access ? { order, access } : null;
}

function assertAtmClaimable(order: Awaited<ReturnType<typeof readOrder>>) {
  if (!order) throw new Error("找不到訂單。");
  if (order.orderMode !== "home_delivery" || order.paymentDetails?.method !== "atm_transfer") {
    throw new AtmTransferClaimValidationError("此訂單不是 ATM 宅配付款，無法回報轉帳。");
  }
  if (order.status === "cancelled") {
    throw new AtmTransferClaimValidationError("此訂單已取消，不需要再回報轉帳。", 409);
  }
  if (order.paymentDetails?.status === "paid") {
    throw new AtmTransferClaimValidationError("此訂單已確認入帳，不需要再次回報。", 409);
  }
  if (order.paymentDetails?.status !== "pending") {
    throw new AtmTransferClaimValidationError("此訂單目前的付款狀態無法回報 ATM 轉帳，請聯繫 KD Coffee。", 409);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const { orderNumber } = await params;
  const guestToken = request.headers.get("X-Order-Access-Token") || undefined;
  const authorized = await authorizedOrder(orderNumber, guestToken);
  if (!authorized) return NextResponse.json({ error: "找不到訂單。" }, { status: 404 });

  try {
    assertAtmClaimable(authorized.order);
    const form = await request.formData();
    const actionId = String(form.get("actionId") || "").trim();
    if (!ACTION_ID_PATTERN.test(actionId)) {
      return NextResponse.json({ error: "匯款回報識別碼不正確，請重新整理後再試。" }, { status: 400 });
    }

    const existingClaims = normalizeAtmTransferClaims(authorized.order.atmTransferClaims);
    const existing = existingClaims.find((claim) => claim.actionId === actionId);
    if (existing) {
      return NextResponse.json({ ok: true, replayed: true, claim: existing });
    }

    const financialBreakdown = projectOrderFinancialBreakdown(authorized.order);
    const validated = validateAtmTransferClaimInput({
      accountLast5: form.get("accountLast5"),
      transferredAt: form.get("transferredAt"),
      amount: financialBreakdown.total,
    });

    const receiptValue = form.get("receipt");
    const receipt = receiptValue instanceof File && receiptValue.size > 0
      ? await validateAndStoreOrderNotificationPhoto(receiptValue, actionId)
      : undefined;
    const submittedAt = new Date().toISOString();

    const result = await withStoredOrderUpdateLock(
      orderNumber,
      async (latestOrder, persistOrder) => {
        const latestAccess = authorizeOrderConversationAccess(latestOrder, {
          memberId: authorized.access.memberId,
          guestToken,
        });
        if (!latestAccess) return null;
        assertAtmClaimable(latestOrder);

        const latestClaims = normalizeAtmTransferClaims(latestOrder.atmTransferClaims);
        const replay = latestClaims.find((claim) => claim.actionId === actionId);
        if (replay) return { claim: replay, replayed: true as const };

        const latestFinancials = projectOrderFinancialBreakdown(latestOrder);
        const claim = {
          actionId,
          accountLast5: validated.accountLast5,
          amount: latestFinancials.total,
          transferredAt: validated.transferredAt,
          submittedAt,
          ...(receipt ? { receipt } : {}),
        };
        const nextClaims = [...latestClaims.slice(-9), claim];
        await persistOrder({ ...latestOrder, atmTransferClaims: nextClaims });
        return { claim, replayed: false as const };
      },
    );

    if (!result) return NextResponse.json({ error: "找不到訂單。" }, { status: 404 });

    if (!result.replayed) {
      const transferTime = new Date(result.claim.transferredAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
      const alert = await sendInternalLineNotification(
        `【KD Coffee ATM 匯款回報】\n訂單：${orderNumber}\n應付金額：NT$ ${result.claim.amount.toLocaleString("zh-TW")}\n匯款帳號末五碼：${result.claim.accountLast5}\n匯款時間：${transferTime}\n匯款明細：${result.claim.receipt ? "已上傳" : "未上傳"}\n\n請至後台核對銀行入帳後，再確認付款。`,
        { attempts: 1, timeoutMs: 8_000 },
      );
      if (!alert.sent) {
        console.warn("ATM transfer claim LINE alert was not sent", {
          event: "atm_transfer_claim_line_alert_failed",
          orderNumber,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      replayed: result.replayed,
      claim: result.claim,
      paymentStatus: "pending",
      message: "匯款資料已回報。KD Coffee 核對銀行入帳後才會標記為已付款。",
    });
  } catch (error) {
    if (error instanceof AtmTransferClaimValidationError || error instanceof OrderNotificationPhotoError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("ATM transfer claim failed", { orderNumber, error });
    return NextResponse.json({ error: "匯款回報暫時無法送出，請稍後再試。" }, { status: 500 });
  }
}
