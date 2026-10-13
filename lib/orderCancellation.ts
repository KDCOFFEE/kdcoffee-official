import {
  assertOrderStatusTransition,
  OrderStatusTransitionError,
  normalizeCancellationReason,
  readOrder,
  withStoredOrderUpdateLock,
  type StoredOrder,
} from "@/lib/adminOrders";
import { withFileLock } from "@/lib/jsonFileStore";
import { withOrderGate, type CommerceLockResource } from "./commerceLocks";
import { assertCommerceLockHeld, compareCommerceLocks } from "./commerceLockProtocol";
import { getOrdersDir } from "./storagePaths";
import {
  cancelOrReverseRetailPromotionRewards,
  cancelSubscriptionCycleForOrder,
  handleReferralQualificationOrderOutcome,
  settleCreditReservationForOrder,
  readMembershipCommerceState,
} from "@/lib/membershipCommerce";
import {
  returnCommittedInventoryForCancellation,
  type InventoryReturnMetadata,
} from "@/lib/orderInventoryReturn";
import { getWebsiteDataFile } from "@/lib/storagePaths";
import { hasOrderCompletion } from "./orderCompletion";
import { appendFulfillmentCancellationProjection } from "./fulfillmentCancellationProjection";
import type { createCommerceOrderCancellation } from "./commerceOrderCancellation";

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
  fulfillmentFilePath?: string;
  /** Trusted server/test instrumentation; never forwarded from route payloads. */
  transactionCancellation?: Parameters<typeof createCommerceOrderCancellation>[0];
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
  authorize?: (order: StoredOrder) => void | Promise<void>;
  /** State dependencies are declared before acquisition. validateLocked may read, never acquire. */
  lockedAuthorization?: {
    resources: CommerceLockResource[];
    validateLocked: (order: StoredOrder) => void | Promise<void>;
  };
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


export class UnsupportedOrderCancellationError extends OrderStatusTransitionError {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "UnsupportedOrderCancellationError";
    this.code = code;
  }
}

function assertCancellationDomainSupported(order: StoredOrder) {
  const transaction = order.inventoryTransaction;
  if (transaction && Object.hasOwn(transaction, "protocolVersion") && transaction.protocolVersion !== 1) {
    throw new UnsupportedOrderCancellationError("UNKNOWN_CANCELLATION_PROTOCOL");
  }
  for (const line of Array.isArray(order.items) ? order.items : []) {
    if (!line || typeof line !== "object") throw new UnsupportedOrderCancellationError("INVALID_CANCELLATION_DOMAIN");
    if (!Object.hasOwn(line, "domain")) continue; // Historical Coffee lines.
    if (line.domain === "store" && order.inventoryTransaction?.protocolVersion === 1) continue;
    if (line.domain === "store") throw new UnsupportedOrderCancellationError("MIXED_CANCELLATION_NOT_SUPPORTED");
    if (line.domain !== "coffee") throw new UnsupportedOrderCancellationError("INVALID_CANCELLATION_DOMAIN");
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


  const initial = await readOrder(input.orderNumber);
  let transactionReturn: Awaited<ReturnType<ReturnType<typeof createCommerceOrderCancellation>["restore"]>> | undefined;
  let transactionService: ReturnType<typeof createCommerceOrderCancellation> | undefined;
  const authorizationResources = input.lockedAuthorization?.resources ?? [];
  const authorizeLocked = async (order: StoredOrder) => {
    await input.authorize?.(order);
    if (input.lockedAuthorization) {
      for (const resource of authorizationResources) assertCommerceLockHeld(resource.file);
      await input.lockedAuthorization.validateLocked(order);
    }
  };
  // The legacy/post-RESTORE phase already holds order rank 3; declared higher dependencies follow it.
  const authorizeWithDependencies = async (order: StoredOrder) => {
    const sorted = [...authorizationResources].sort(compareCommerceLocks);
    const acquire = (index: number): Promise<void> => index === sorted.length
      ? authorizeLocked(order)
      : withFileLock(sorted[index].file, () => acquire(index + 1),
        { timeoutMs: 20_000, commerceLock: sorted[index] });
    await acquire(0);
  };
  const validateTransactionOrder = async (raw: Record<string, unknown>) => {
    const order = raw as StoredOrder;
    await authorizeLocked(order);
    assertCancellationDomainSupported(order);
    if (hasOrderCompletion(order)) assertOrderStatusTransition(order, "cancelled");
    const hasStore = Array.isArray(order.items) && order.items.some(line => line.domain === "store");
    if (hasStore) {
      const amount = order.credit?.appliedAmount ?? order.creditApplied ?? 0;
      if (!Number.isSafeInteger(amount) || amount < 0 || amount > 0) {
        throw new UnsupportedOrderCancellationError("MIXED_CREDIT_ALLOCATION_UNRESOLVED");
      }
      const state = await readMembershipCommerceState(input.membershipStateFilePath);
      if (Object.values(state.creditReservations).some(reservation => reservation.orderId === input.orderNumber && reservation.amount > 0)) {
        throw new UnsupportedOrderCancellationError("MIXED_CREDIT_ALLOCATION_UNRESOLVED");
      }
      if (order.subscription || order.subscriptionIntent || order.subscriptionId) {
        throw new UnsupportedOrderCancellationError("STORE_SUBSCRIPTION_NOT_SUPPORTED");
      }
    }
    if (order.status === "cancelled") return;
    const request = order.memberCancellationRequest as MemberCancellationRequest | undefined;
    const manualVoid = input.cancelledBy === "admin" && input.confirmedExternalShipmentVoid === true &&
      order.status === "shipment_created" && request?.state === "requires_manual_shipment_void";
    if (!manualVoid) assertOrderStatusTransition(order, "cancelled");
  };
  if (initial?.inventoryTransaction && Object.hasOwn(initial.inventoryTransaction, "protocolVersion")) {
    assertCancellationDomainSupported(initial);
    if (initial.inventoryTransaction.protocolVersion !== 1) throw new UnsupportedOrderCancellationError("UNKNOWN_CANCELLATION_PROTOCOL");
    const { createCommerceOrderCancellation } = await import("./commerceOrderCancellation");
    transactionService = createCommerceOrderCancellation({ now, ...input.transactionCancellation, authorizationResources });
    transactionReturn = await transactionService.restore(input.orderNumber, {
      cancelledAt: now().toISOString(), cancelledBy: input.cancelledBy, cancellationReason,
      cancellationIdempotencyKey: input.idempotencyKey,
      ...(input.trackingNumber === undefined ? {} : { trackingNumber: String(input.trackingNumber || "").trim().slice(0, 80) }),
    }, {
      validateOrder: validateTransactionOrder,
      commitOrder: async (raw, intent, receipts, persist) => {
        await validateTransactionOrder(raw);
        const order = raw as StoredOrder, snapshot = intent.cancellation;
        const request = order.memberCancellationRequest as MemberCancellationRequest | undefined;
        await persist({
          ...order, ...snapshot, status: "cancelled", updatedAt: snapshot.cancelledAt,
          canonicalCancellation: { state: "pending", operationId: `order-cancel:${input.orderNumber}` },
          inventoryReturn: { protocolVersion: 1, state: "returned", operationId: intent.transactionId,
            originalTransactionId: intent.originalTransactionId, returnedAt: snapshot.cancelledAt, participantReceipts: receipts },
          ...(request?.state === "requires_manual_shipment_void" ? {
            memberCancellationRequest: { ...request, state: "completed", completedAt: snapshot.cancelledAt },
          } : {}),
          statusHistory: [...(Array.isArray(order.statusHistory) ? order.statusHistory : []),
            { from: order.status, to: "cancelled", at: snapshot.cancelledAt }],
        });
      },
    });
  }

  const canonicalResult = await withOrderGate(getOrdersDir(), input.orderNumber, async () => {
  const updateCancellation = () => withStoredOrderUpdateLock(input.orderNumber, async (latestOrder, persistOrder) => {
      await authorizeWithDependencies(latestOrder);
      assertCancellationDomainSupported(latestOrder);
      if (hasOrderCompletion(latestOrder)) assertOrderStatusTransition(latestOrder, "cancelled");

      if (latestOrder.inventoryTransaction?.protocolVersion === 1 && !transactionReturn) {
        throw new UnsupportedOrderCancellationError("TRANSACTION_RESTORE_NOT_PROVEN");
      }
      // A prior attempt may have saved cancellation before a later consequence
      // failed. Retrying resumes only idempotent consequences below.
      if (latestOrder.status === "cancelled") {
        if (latestOrder.canonicalCancellation?.state === "completed" ||
          (!latestOrder.canonicalCancellation && latestOrder.inventoryReturn?.state !== "return_failed" &&
            latestOrder.inventoryReturn?.state !== "return_pending")) {
          return { ok: true, order: latestOrder, alreadyCancelled: true, projectionOnly: true };
        }
        if (transactionReturn && latestOrder.inventoryReturn?.protocolVersion === 1) {
          return { ok: true, order: latestOrder, alreadyCancelled: !transactionReturn.newlyCancelled };
        }
        const recovered = await returnCommittedInventoryForCancellation({
          order: latestOrder, websiteFile, persistOrder: async next => { await persistOrder(next); }, websiteLockHeld: true, now,
        });
        const warning = recovered.state === "return_failed" ? recovered.warning : undefined;
        return { ok: !warning, order: recovered.order, warning, alreadyCancelled: true };
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
        canonicalCancellation: { state: "pending", operationId: `order-cancel:${input.orderNumber}` },
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
    });
  const result = transactionReturn ? await updateCancellation() : await withFileLock(
    websiteFile, updateCancellation,
    { timeoutMs: 15_000, commerceLock: { rank: 2, key: "0000:coffee:" + websiteFile } },
  );

  if (!result.ok) return result; // Never project an incomplete cancellation.
  if ("projectionOnly" in result && result.projectionOnly) {
    const projection = await appendFulfillmentCancellationProjection({ orderNumber: input.orderNumber, filePath: input.fulfillmentFilePath, now: now() });
    return { ...result, order: projection.order };
  }

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
      throw error; // Keep pending; do not falsely publish a completed projection.
    }
  }
  if (!memberId && result.order.retailPromotionAttribution) {
    await cancelOrReverseRetailPromotionRewards({
      orderId: input.orderNumber,
      outcome: "cancelled",
      idempotencyKey: stableKey,
      now: now(),
      stateFilePath: input.membershipStateFilePath,
      rulesFilePath: input.membershipRulesFilePath,
    });
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

  await withStoredOrderUpdateLock(input.orderNumber, async (latest, persistOrder) => {
    await persistOrder({ ...latest, canonicalCancellation: {
      state: "completed", operationId: stableKey, completedAt: now().toISOString(),
    } });
  });
  const projection = await appendFulfillmentCancellationProjection({
    orderNumber: input.orderNumber, filePath: input.fulfillmentFilePath, now: now(),
  });
  return { ...result, order: projection.order };
  });
  if (canonicalResult.ok && transactionService) await transactionService.finalize(input.orderNumber, validateTransactionOrder);
  return canonicalResult;
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

  if (
    MEMBER_DIRECT_CANCELLATION_STATUSES.has(order.status) ||
    (order.status === "ready_for_pickup" && order.orderMode === "studio_pickup") ||
    order.status === "cancelled"
  ) {
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
