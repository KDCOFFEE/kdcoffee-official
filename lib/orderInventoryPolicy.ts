export const fulfillmentOrderStatuses = [
  "new_order",
  "confirmed",
  "waiting_merchant_create_cod_shipment",
  "waiting_studio_pickup_confirmation",
  "shipment_created",
  "shipped",
  "ready_for_pickup",
  "completed",
] as const;

export const orderStatuses = [
  ...fulfillmentOrderStatuses,
  "cancelled",
] as const;

export type OrderStatus = (typeof orderStatuses)[number];

export type OrderInventoryAssessmentKind =
  | "trusted_committed"
  | "pending"
  | "failed"
  | "unknown_abnormal"
  | "legacy_missing"
  | "not_applicable";

export type OrderInventoryAssessment = {
  kind: OrderInventoryAssessmentKind;
  fulfillmentBlocked: boolean;
  apiMessage?: string;
  adminTitle?: string;
  adminWarning?: string;
};

export type OrderCancellationAssessment = {
  allowed: boolean;
  errorMessage?: string;
};

type InventoryPolicyOrder = {
  status?: unknown;
  orderMode?: unknown;
  inventoryTransaction?: unknown;
};

export const MAX_CANCELLATION_REASON_LENGTH = 200;

export class OrderCancellationReasonError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "OrderCancellationReasonError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGeneralProductOrder(order: InventoryPolicyOrder) {
  return order.orderMode === "711_cod" || order.orderMode === "studio_pickup";
}

function pendingAssessment(): OrderInventoryAssessment {
  return {
    kind: "pending",
    fulfillmentBlocked: true,
    apiMessage:
      "此訂單的庫存交易尚未完成，不能進入正常履約狀態。請先確認庫存交易狀態。",
    adminTitle: "庫存交易待確認",
    adminWarning: "庫存交易尚未完成，請勿備貨或出貨。",
  };
}

function failedAssessment(): OrderInventoryAssessment {
  return {
    kind: "failed",
    fulfillmentBlocked: true,
    apiMessage: "此訂單的庫存交易失敗，不能進入正常履約狀態。",
    adminTitle: "庫存扣除失敗",
    adminWarning: "庫存扣除失敗，此訂單目前不可進入履約流程。",
  };
}

function unknownAssessment(): OrderInventoryAssessment {
  return {
    kind: "unknown_abnormal",
    fulfillmentBlocked: true,
    apiMessage:
      "此訂單的庫存交易狀態無法確認，不能進入正常履約狀態。請先確認庫存交易狀態。",
    adminTitle: "庫存交易狀態異常",
    adminWarning: "庫存交易狀態無法確認，請勿備貨或出貨。",
  };
}

export function assessOrderInventoryTransaction(
  order: InventoryPolicyOrder,
): OrderInventoryAssessment {
  if (order.status === "inventory_pending") return pendingAssessment();
  if (order.status === "inventory_failed") return failedAssessment();

  const transaction = order.inventoryTransaction;
  if (transaction === undefined || transaction === null) {
    if (isGeneralProductOrder(order)) {
      return {
        kind: "legacy_missing",
        fulfillmentBlocked: false,
        adminTitle: "歷史訂單庫存提示",
        adminWarning:
          "此歷史訂單未記錄庫存交易狀態；變更狀態前請先人工確認庫存。",
      };
    }

    return {
      kind: "not_applicable",
      fulfillmentBlocked: false,
    };
  }

  if (!isRecord(transaction)) return unknownAssessment();

  const transactionState = transaction.state;
  if (transactionState === "inventory_committed") {
    return {
      kind: "trusted_committed",
      fulfillmentBlocked: false,
    };
  }
  if (transactionState === "inventory_pending" || transactionState === "pending") {
    return pendingAssessment();
  }
  if (
    transactionState === "inventory_write_failed" ||
    transactionState === "inventory_failed" ||
    transactionState === "write_failed" ||
    transactionState === "failed"
  ) {
    return failedAssessment();
  }

  return unknownAssessment();
}

export function isFulfillmentOrderStatus(
  status: OrderStatus,
): status is (typeof fulfillmentOrderStatuses)[number] {
  return status !== "cancelled";
}

export function assessOrderCancellation(
  order: InventoryPolicyOrder,
): OrderCancellationAssessment {
  const status = String(order.status || "");

  if (
    status === "new_order" ||
    status === "confirmed" ||
    status === "waiting_merchant_create_cod_shipment" ||
    status === "waiting_studio_pickup_confirmation" ||
    status === "inventory_pending" ||
    status === "inventory_failed" ||
    status === "corporate_gift_inquiry"
  ) {
    return { allowed: true };
  }

  if (status === "ready_for_pickup") {
    if (order.orderMode === "711_cod") {
      return {
        allowed: false,
        errorMessage:
          "此 7-ELEVEN 訂單已進入到店取貨階段，不能使用一般取消操作。",
      };
    }
    if (order.orderMode === "studio_pickup") {
      return {
        allowed: false,
        errorMessage:
          "此工作室自取訂單已備妥待取，不能使用一般取消直接回補庫存。",
      };
    }

    return {
      allowed: false,
      errorMessage:
        "此訂單的取貨方式無法確認，不能使用一般取消操作。",
    };
  }

  if (status === "shipment_created") {
    return {
      allowed: false,
      errorMessage: "此訂單已進入寄件流程，不能使用一般取消操作。",
    };
  }
  if (status === "shipped") {
    return {
      allowed: false,
      errorMessage: "此訂單已出貨，不能取消並回補庫存。",
    };
  }
  if (status === "completed") {
    return {
      allowed: false,
      errorMessage: "此訂單已完成，不能再取消。",
    };
  }
  if (status === "cancelled") {
    return {
      allowed: false,
      errorMessage: "此訂單已取消，不能再次取消。",
    };
  }

  return {
    allowed: false,
    errorMessage:
      "此訂單的目前狀態無法確認，不能使用一般取消操作。",
  };
}

export function normalizeCancellationReason(value: unknown) {
  const reason = String(value ?? "").trim();
  if (!reason) {
    throw new OrderCancellationReasonError("請填寫取消原因。");
  }
  if (reason.length > MAX_CANCELLATION_REASON_LENGTH) {
    throw new OrderCancellationReasonError(
      `取消原因最多 ${MAX_CANCELLATION_REASON_LENGTH} 個字。`,
    );
  }
  return reason;
}

export function orderStatusLabel(status: string) {
  return (
    {
      new_order: "新訂單",
      confirmed: "已確認",
      waiting_merchant_create_cod_shipment: "待建立 7-ELEVEN 寄件單",
      waiting_studio_pickup_confirmation: "待確認自取時間",
      shipment_created: "寄件單已建立",
      shipped: "已寄件",
      ready_for_pickup: "等待取貨",
      completed: "已完成",
      cancelled: "已取消",
      inventory_pending: "庫存交易待確認",
      inventory_failed: "庫存交易失敗",
      inventory_write_failed: "庫存寫入失敗",
      corporate_gift_inquiry: "企業送禮洽詢",
    } as Record<string, string>
  )[status] || "狀態待確認";
}
