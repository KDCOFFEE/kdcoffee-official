import { NextResponse } from "next/server";

import { getCurrentMember } from "@/lib/memberAuth";
import {
  MemberOrderCancellationError,
  requestMemberOrderCancellation,
} from "@/lib/orderCancellation";
import { OrderCancellationReasonError, OrderStatusTransitionError } from "@/lib/adminOrders";
import { OrderFileNotFoundError } from "@/lib/orderFiles";
import { isSameOriginRequest } from "@/lib/requestSecurity";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "無法確認請求來源" }, { status: 403 });
  }

  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "請先登入會員" }, { status: 401 });

  const { orderNumber } = await params;
  if (!/^KD[0-9-]+$/.test(orderNumber)) {
    return NextResponse.json({ error: "找不到訂單" }, { status: 404 });
  }

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "請求內容不正確" }, { status: 400 });
    }
    const values = body as Record<string, unknown>;
    const idempotencyKey = String(values.idempotencyKey || "").trim().slice(0, 120);
    if (!idempotencyKey) {
      return NextResponse.json({ error: "操作識別遺失，請再試一次" }, { status: 400 });
    }

    const outcome = await requestMemberOrderCancellation({
      orderNumber,
      memberId: member.id,
      cancellationReason: values.cancellationReason,
      idempotencyKey,
    });
    const status = outcome.result === "requires_manual_shipment_void"
      ? 202
      : outcome.result === "customer_service_required"
        ? 409
        : 200;
    return NextResponse.json({ ok: outcome.result !== "customer_service_required", ...outcome }, { status });
  } catch (error) {
    const status = error instanceof MemberOrderCancellationError
      ? error.status
      : error instanceof OrderCancellationReasonError
        ? error.status
        : error instanceof OrderFileNotFoundError
          ? 404
          : error instanceof OrderStatusTransitionError
            ? error.status
            : error instanceof SyntaxError
              ? 400
              : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "取消申請處理失敗" },
      { status },
    );
  }
}
