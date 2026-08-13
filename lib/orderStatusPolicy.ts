import {
  orderStatusLabel,
  type OrderStatus,
} from "@/lib/orderInventoryPolicy";

export const orderDeliveryMethods = [
  "711_cod",
  "studio_pickup",
  "corporate_gift",
] as const;

export type OrderDeliveryMethod = (typeof orderDeliveryMethods)[number];

type StatusPolicyOrder = {
  status?: unknown;
  orderMode?: unknown;
};

export type OrderStatusPolicyAssessment = {
  allowed: boolean;
  errorMessage?: string;
};

export type OrderStatusCompatibility = {
  compatible: boolean;
  warning?: string;
};

const sevenElevenStatuses = [
  "new_order",
  "confirmed",
  "waiting_merchant_create_cod_shipment",
  "shipment_created",
  "shipped",
  "ready_for_pickup",
  "completed",
  "cancelled",
] as const;

const studioPickupStatuses = [
  "new_order",
  "waiting_studio_pickup_confirmation",
  "confirmed",
  "ready_for_pickup",
  "completed",
  "cancelled",
] as const;

const sevenElevenTransitions: Record<string, readonly string[]> = {
  new_order: ["waiting_merchant_create_cod_shipment"],
  confirmed: ["waiting_merchant_create_cod_shipment"],
  waiting_merchant_create_cod_shipment: ["shipment_created"],
  shipment_created: ["shipped"],
  shipped: ["ready_for_pickup"],
  ready_for_pickup: ["completed"],
};

const studioPickupTransitions: Record<string, readonly string[]> = {
  new_order: ["waiting_studio_pickup_confirmation"],
  waiting_studio_pickup_confirmation: ["confirmed"],
  confirmed: ["ready_for_pickup"],
  ready_for_pickup: ["completed"],
};

const sevenElevenOrder = [
  "new_order",
  "confirmed",
  "waiting_merchant_create_cod_shipment",
  "shipment_created",
  "shipped",
  "ready_for_pickup",
  "completed",
] as const;

const studioPickupOrder = [
  "new_order",
  "waiting_studio_pickup_confirmation",
  "confirmed",
  "ready_for_pickup",
  "completed",
] as const;

function isAbnormalInventoryStatus(status: string) {
  return status === "inventory_pending" || status === "inventory_failed";
}

function statusAllowedForDelivery(orderMode: unknown, status: string) {
  if (orderMode === "711_cod") {
    return (sevenElevenStatuses as readonly string[]).includes(status);
  }
  if (orderMode === "studio_pickup") {
    return (studioPickupStatuses as readonly string[]).includes(status);
  }
  if (orderMode === "corporate_gift") {
    return status === "corporate_gift_inquiry" || status === "cancelled";
  }
  return false;
}

function incompatibleTargetMessage(orderMode: unknown, targetStatus: OrderStatus) {
  if (orderMode === "studio_pickup") {
    if (
      targetStatus === "waiting_merchant_create_cod_shipment" ||
      targetStatus === "shipment_created" ||
      targetStatus === "shipped"
    ) {
      return `工作室自取訂單不能設定為${orderStatusLabel(targetStatus)}。`;
    }
  }
  if (orderMode === "711_cod" && targetStatus === "waiting_studio_pickup_confirmation") {
    return "7-ELEVEN 訂單不能使用工作室自取流程狀態。";
  }
  if (orderMode === "corporate_gift") {
    return "企業送禮洽詢不使用一般商品訂單履約狀態。";
  }
  return "此訂單的配送方式不能使用目標狀態。";
}

export function assessOrderStatusCompatibility(
  order: StatusPolicyOrder,
): OrderStatusCompatibility {
  const status = String(order.status || "");
  if (isAbnormalInventoryStatus(status)) return { compatible: true };
  if (statusAllowedForDelivery(order.orderMode, status)) return { compatible: true };

  return {
    compatible: false,
    warning:
      "此歷史訂單的配送方式與目前狀態不一致，請人工確認後只依正確配送流程處理。",
  };
}

export function assessOrderStatusProgression(
  order: StatusPolicyOrder,
  targetStatus: OrderStatus,
): OrderStatusPolicyAssessment {
  const currentStatus = String(order.status || "");

  if (targetStatus === "cancelled") return { allowed: true };
  if (currentStatus === "cancelled") {
    return { allowed: false, errorMessage: "此訂單已取消，不能重新進入履約流程。" };
  }
  if (currentStatus === "completed") {
    return targetStatus === "completed"
      ? { allowed: true }
      : { allowed: false, errorMessage: "此訂單已完成，不能回到先前狀態。" };
  }
  if (order.orderMode === "corporate_gift" || currentStatus === "corporate_gift_inquiry") {
    return {
      allowed: false,
      errorMessage: "企業送禮洽詢不使用一般商品訂單履約狀態。",
    };
  }
  if (order.orderMode !== "711_cod" && order.orderMode !== "studio_pickup") {
    return {
      allowed: false,
      errorMessage: "此訂單的配送方式無法確認，不能更新履約狀態。",
    };
  }
  if (!statusAllowedForDelivery(order.orderMode, targetStatus)) {
    return {
      allowed: false,
      errorMessage: incompatibleTargetMessage(order.orderMode, targetStatus),
    };
  }

  if (currentStatus === targetStatus && statusAllowedForDelivery(order.orderMode, currentStatus)) {
    return { allowed: true };
  }

  if (
    order.orderMode === "711_cod" &&
    currentStatus === "waiting_studio_pickup_confirmation" &&
    targetStatus === "waiting_merchant_create_cod_shipment"
  ) {
    return { allowed: true };
  }
  if (
    order.orderMode === "studio_pickup" &&
    currentStatus === "waiting_merchant_create_cod_shipment" &&
    targetStatus === "waiting_studio_pickup_confirmation"
  ) {
    return { allowed: true };
  }

  if (!statusAllowedForDelivery(order.orderMode, currentStatus)) {
    return {
      allowed: false,
      errorMessage:
        "此歷史訂單的配送方式與目前狀態不一致，不能直接變更至目標狀態。",
    };
  }

  const transitions =
    order.orderMode === "711_cod"
      ? sevenElevenTransitions
      : studioPickupTransitions;
  if ((transitions[currentStatus] || []).includes(targetStatus)) {
    return { allowed: true };
  }

  const orderedStatuses =
    order.orderMode === "711_cod"
      ? sevenElevenOrder
      : studioPickupOrder;
  const currentIndex = (orderedStatuses as readonly string[]).indexOf(currentStatus);
  const targetIndex = (orderedStatuses as readonly string[]).indexOf(targetStatus);
  if (currentIndex >= 0 && targetIndex >= 0 && targetIndex < currentIndex) {
    return {
      allowed: false,
      errorMessage: "訂單已進入下一處理階段，不能回到先前狀態。",
    };
  }

  return {
    allowed: false,
    errorMessage: "請依訂單處理流程逐步更新狀態，不能跳過中間階段。",
  };
}

export function orderFlowDescription(orderMode: string) {
  if (orderMode === "711_cod") {
    return "待建立寄件單 → 寄件單已建立 → 已寄件 → 到店待取 → 已完成";
  }
  if (orderMode === "studio_pickup") {
    return "待確認 → 已確認 → 已備妥待取 → 已完成";
  }
  if (orderMode === "corporate_gift") {
    return "企業送禮洽詢不使用一般商品訂單履約狀態。";
  }
  return "配送方式待人工確認。";
}

export const sevenElevenOrderStatuses = sevenElevenStatuses;
export const studioPickupOrderStatuses = studioPickupStatuses;
