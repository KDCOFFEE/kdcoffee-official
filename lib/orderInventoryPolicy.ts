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

type InventoryPolicyOrder = {
  status?: unknown;
  orderMode?: unknown;
  inventoryTransaction?: unknown;
};

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
