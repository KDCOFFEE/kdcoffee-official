import {
  assertOrderStatusTransition,
  normalizeCancellationReason,
  readOrder,
  withStoredOrderUpdateLock,
  type StoredOrder,
} from "@/lib/adminOrders";
import { withFileLock } from "@/lib/jsonFileStore";
import {
  cancelSubscriptionCycleForOrder,
  handleReferralQualificationOrderOutcome,
  settleCreditReservationForOrder,
} from "@/lib/membershipCommerce";
import {
  returnCommittedInventoryForCancellation,
  type InventoryReturnMetadata,
} from "@/lib/orderInventoryReturn";
import { getWebsiteDataFile } from "@/lib/storagePaths";

export type CancellationActor = "admin" | "member";

export type MemberCancellationRequest = {
  state: "requires_manual_shipment_void" | "completed";
  requestedAt: string;
  requestedByMemberId: string;
  reason: string;
  idempotencyKey: string;
  externalOrderId?: string;
  externalShipmentId?: string;
  completedAt?: string;
};

export type CanonicalCancellationResult = {
  ok: boolean;
  order: StoredOrder;
  alreadyCancelled: boolean;
  warning?: string;
};

type CancellationRuntime = {
  now?: () => Date;
  websiteFile?: string;
  membershipStateFilePath?: string;
  membershipRulesFilePath?: string;
  sendNotification?: (
    text: string,
    options?: { attempts?: number; timeoutMs?: number; retryDelayMs?: number; fetcher?: typeof fetch },
  ) => Promise<{ sent: boolean; requestId?: string; reason?: string }>;
};

type CancelOrderInput = CancellationRuntime & {
  orderNumber: string;
  cancellationReason: unknown;
  cancelledBy: CancellationActor;
  idempotencyKey: string;
  trackingNumber?: unknown;
  confirmedExternalShipmentVoid?: boolean;
  authorize?: (order: StoredOrder) => void;
};

function returnFailureMetadata(
  order: StoredOrder,
  warning: string,
  now: () => Date,
): InventoryReturnMetadata {
  const existing = order.inventoryReturn as InventoryReturnMetadata | undefined;
  return {
    ...(existing || { startedAt: now().toISOString(), changes: [] }),
    state: "return_failed",
    failedAt: now().toISOString(),
    warning,
  };
}

function orderMemberId(order: StoredOrder) {
  return typeof order.member?.memberId === "string" ? order.member.memberId : undefined;
}

export function assertMemberOwnsOrder(order: StoredOrder, memberId: string) {
  if (!orderMemberId(order) || orderMemberId(order) !== memberId) {
    throw new MemberOrderCancellationError("找不到訂單", 404);
  }
}

export class MemberOrderCancellationError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MemberOrderCancellationError";
    this.status = status;
  }
}

/**
 * The single canonical order-cancellation pipeline used by Admin and members.
 * It preserves the established website-file -> order-file lock order and reuses
 * the existing inventory, credit, and referral consequence engines.
 */
export async function cancelOrderCanonically(input: CancelOrderInput): Promise<CanonicalCancellationResult> {
  const cancellationReason = normalizeCancellationReason(input.cancellationReason);
  const now = input.now ?? (() => new Date());
  const websiteFile = input.websiteFile ?? getWebsiteDataFile();
  const notifyInternal = input.sendNotification ?? (async (
    text: string,
    options?: { attempts?: number; timeoutMs?: number; retryDelayMs?: number; fetcher?: typeof fetch },
  ) => (await import("@/lib/internalLineNotifications")).sendInternalLineNotification(text, options));

  const result = await withFileLock(
    websiteFile,
    () => withStoredOrderUpdateLock(input.orderNumber, async (latestOrder, persistOrder) => {
      input.authorize?.(latestOrder);

      // A prior attempt may have saved cancellation before a later consequence
      // failed. Retrying resumes only idempotent consequences below.
      if (latestOrder.status === "cancelled") {
        const warning = latestOrder.inventoryReturn?.state === "return_failed"
          ? String(latestOrder.inventoryReturn.warning || "取消狀態已儲存，但庫存回補失敗。")
          : undefined;
        return { ok: !warning, order: latestOrder, warning, alreadyCancelled: true };
      }

      const request = latestOrder.memberCancellationRequest as MemberCancellationRequest | undefined;
      const trustedManualVoidCompletion =
        input.cancelledBy === "admin" &&
        input.confirmedExternalShipmentVoid === true &&
        latestOrder.status === "shipment_created" &&
        request?.state === "requires_manual_shipment_void";
      if (!trustedManualVoidCompletion) assertOrderStatusTransition(latestOrder, "cancelled");
      const previous = latestOrder.status;
      const updatedAt = now().toISOString();
      let order: StoredOrder = {
        ...latestOrder,
        status: "cancelled",
        trackingNumber: input.trackingNumber === undefined
          ? String(latestOrder.trackingNumber || "")
          : String(input.trackingNumber || "").trim().slice(0, 80),
        updatedAt,
        cancelledAt: updatedAt,
        cancelledBy: input.cancelledBy,
        cancellationReason,
        cancellationIdempotencyKey: input.idempotencyKey,
        ...(request?.state === "requires_manual_shipment_void"
          ? { memberCancellationRequest: { ...request, state: "completed", completedAt: updatedAt } }
          : {}),
        statusHistory: [
          ...(Array.isArray(latestOrder.statusHistory) ? latestOrder.statusHistory : []),
          { from: previous, to: "cancelled", at: updatedAt },
        ],
      };

      try {
        const inventoryReturn = await returnCommittedInventoryForCancellation({
          order,
          websiteFile,
          persistOrder: async (nextOrder) => { await persistOrder(nextOrder); },
          websiteLockHeld: true,
          now,
        });
        order = inventoryReturn.order;
        if (inventoryReturn.state === "return_failed") {
          return {
            ok: false,
            order,
            warning: inventoryReturn.warning || "取消狀態已儲存，但庫存回補失敗。",
            alreadyCancelled: false,
          };
        }
      } catch (error) {
        const warning = error instanceof Error
          ? `取消狀態已儲存，但庫存回補失敗：${error.message}`
          : "取消狀態已儲存，但庫存回補失敗。";
        order = { ...order, inventoryReturn: returnFailureMetadata(order, warning, now) };
        await persistOrder(order);
        return { ok: false, order, warning, alreadyCancelled: false };
      }

      const { sent } = await notifyInternal(
        `【KD Coffee 訂單狀態更新】\n\n訂單編號：${order.orderNumber}\n客戶：${order.customer?.name || "未填"}\n狀態：已取消\n物流編號：${order.trackingNumber || "尚未填寫"}`,
        { attempts: 1, timeoutMs: 5_000 },
      );
      order = {
        ...order,
        adminLineNotification: { sent, checkedAt: now().toISOString() },
      };
      await persistOrder(order);
      return { ok: true, order, alreadyCancelled: false };
    }),
    { timeoutMs: 15_000 },
  );

  const stableKey = `order-cancel:${input.orderNumber}`;
  await settleCreditReservationForOrder({
    orderId: input.orderNumber,
    action: "release",
    idempotencyKey: stableKey,
    reason: input.cancelledBy === "admin" ? "Owner 取消訂單，釋放抵用金" : "會員取消訂單，釋放抵用金",
    now: now(),
    stateFilePath: input.membershipStateFilePath,
  });
  const memberId = orderMemberId(result.order);
  if (memberId) {
    try {
      await handleReferralQualificationOrderOutcome({
        memberId,
        orderId: input.orderNumber,
        outcome: "cancelled",
        idempotencyKey: stableKey,
        now: now(),
        stateFilePath: input.membershipStateFilePath,
        rulesFilePath: input.membershipRulesFilePath,
      });
    } catch (error) {
      console.error(`Order ${input.orderNumber} cancelled but referral qualification sync failed:`, error);
    }
  }
  await cancelSubscriptionCycleForOrder({
    orderId: input.orderNumber,
    memberId,
    reason: cancellationReason,
    idempotencyKey: stableKey,
    now: now(),
    stateFilePath: input.membershipStateFilePath,
    rulesFilePath: input.membershipRulesFilePath,
  });

  return result;
}

export async function requestManualShipmentVoid(input: CancellationRuntime & {
  orderNumber: string;
  memberId: string;
  cancellationReason: unknown;
  idempotencyKey: string;
}) {
  const reason = normalizeCancellationReason(input.cancellationReason);
  const now = input.now ?? (() => new Date());
  return withStoredOrderUpdateLock(input.orderNumber, async (latestOrder, persistOrder) => {
    assertMemberOwnsOrder(latestOrder, input.memberId);
    const existing = latestOrder.memberCancellationRequest as MemberCancellationRequest | undefined;
    if (existing?.state === "requires_manual_shipment_void") return { order: latestOrder, request: existing, created: false };
    if (latestOrder.status !== "shipment_created") {
      throw new MemberOrderCancellationError("訂單狀態已更新，請重新整理後再試一次。", 409);
    }
    const summary = latestOrder.fulfillmentSummary as Record<string, unknown> | undefined;
    const request: MemberCancellationRequest = {
      state: "requires_manual_shipment_void",
      requestedAt: now().toISOString(),
      requestedByMemberId: input.memberId,
      reason,
      idempotencyKey: input.idempotencyKey,
      ...(typeof summary?.externalOrderId === "string" ? { externalOrderId: summary.externalOrderId } : {}),
      ...(typeof summary?.externalShipmentId === "string" ? { externalShipmentId: summary.externalShipmentId } : {}),
    };
    const order = { ...latestOrder, memberCancellationRequest: request, updatedAt: now().toISOString() };
    await persistOrder(order);
    return { order, request, created: true };
  });
}

const MEMBER_DIRECT_CANCELLATION_STATUSES = new Set([
  "new_order",
  "confirmed",
  "waiting_merchant_create_cod_shipment",
  "waiting_studio_pickup_confirmation",
  "inventory_pending",
  "inventory_failed",
]);

export type MemberCancellationOutcome =
  | { result: "cancelled" | "already_cancelled"; orderStatus: "cancelled"; customerMessage: string }
  | { result: "requires_manual_shipment_void"; orderStatus: "shipment_created"; requestedAt: string; customerMessage: string }
  | { result: "customer_service_required"; orderStatus: string; customerMessage: string };

export async function requestMemberOrderCancellation(input: CancellationRuntime & {
  orderNumber: string;
  memberId: string;
  cancellationReason: unknown;
  idempotencyKey: string;
}): Promise<MemberCancellationOutcome> {
  // Validate the reason before returning any order-specific result.
  normalizeCancellationReason(input.cancellationReason);
  const order = await readOrder(input.orderNumber);
  if (!order) throw new MemberOrderCancellationError("找不到訂單", 404);
  assertMemberOwnsOrder(order, input.memberId);

  if (MEMBER_DIRECT_CANCELLATION_STATUSES.has(order.status) || order.status === "cancelled") {
    const result = await cancelOrderCanonically({
      orderNumber: input.orderNumber,
      cancellationReason: input.cancellationReason,
      idempotencyKey: input.idempotencyKey,
      now: input.now,
      websiteFile: input.websiteFile,
      membershipStateFilePath: input.membershipStateFilePath,
      membershipRulesFilePath: input.membershipRulesFilePath,
      sendNotification: input.sendNotification,
      cancelledBy: "member",
      authorize: (latestOrder) => assertMemberOwnsOrder(latestOrder, input.memberId),
    });
    if (!result.ok) {
      throw new MemberOrderCancellationError(
        result.warning || "取消狀態已儲存，但後續安全處理未完成，請聯繫 KD Coffee 客服。",
        500,
      );
    }
    return {
      result: result.alreadyCancelled ? "already_cancelled" : "cancelled",
      orderStatus: "cancelled",
      customerMessage: result.alreadyCancelled ? "此筆配送已取消。" : "本次配送已取消。",
    };
  }

  if (order.status === "shipment_created") {
    const recorded = await requestManualShipmentVoid(input);
    return {
      result: "requires_manual_shipment_void",
      orderStatus: "shipment_created",
      requestedAt: recorded.request.requestedAt,
      customerMessage: "取消申請已送出。此訂單已建立 7-ELEVEN 寄件資訊，KD Coffee 將先停止交寄並確認物流單作廢後完成取消。",
    };
  }

  if (order.status === "shipped") {
    return {
      result: "customer_service_required",
      orderStatus: order.status,
      customerMessage: "此訂單已完成交寄，無法直接攔截配送。如需取消或退貨，請聯繫 KD Coffee 客服協助。",
    };
  }

  if (order.status === "ready_for_pickup") {
    return {
      result: "customer_service_required",
      orderStatus: order.status,
      customerMessage: "此訂單已進入待取貨階段，無法使用會員自助取消。如需取消或退貨，請聯繫 KD Coffee 客服協助。",
    };
  }

  if (order.status === "completed") {
    return {
      result: "customer_service_required",
      orderStatus: order.status,
      customerMessage: "此訂單已完成取貨，無法使用一般取消。如需退貨協助，請聯繫 KD Coffee 客服。",
    };
  }

  throw new MemberOrderCancellationError("此訂單目前無法使用會員自助取消，請聯繫 KD Coffee 客服協助。", 409);
}
