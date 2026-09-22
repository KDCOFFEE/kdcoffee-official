import type { PricedSubscriptionItem } from "@/lib/subscriptionItemTypes";

import {
  subscriptionItemsSummary,
  type MemberSubscriptionProduct,
} from "./memberSubscriptionEditorModel";

export type DashboardSubscriptionStatus =
  | "pending_activation"
  | "active"
  | "paused"
  | "terminated";

export type DashboardSubscriptionLike = {
  subscriptionId: string;
  status: DashboardSubscriptionStatus;
  intervalDays: number;
  shippingMethod: string;
  storeSelection: { storeId: string; storeName: string } | null;
  defaultItems: PricedSubscriptionItem[];
  createdAt?: string;
  updatedAt?: string;
};

export type DashboardCycleLike = {
  cycleId: string;
  subscriptionId: string;
  kind: "scheduled" | "manual_replenishment";
  status: string;
  plannedDate: string;
  orderCreationDate?: string;
  createdOrderId: string | null;
  createdAt?: string;
};

export const subscriptionStatusLabel = (status: DashboardSubscriptionStatus) => ({
  pending_activation: "等待首次取貨",
  active: "定期配送啟用中",
  paused: "定期配送已暫停",
  terminated: "定期配送已停止",
})[status];

function newest<T extends { createdAt?: string }>(items: T[]) {
  return [...items].sort((left, right) =>
    String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")),
  )[0];
}

export function defaultSubscriptionId(subscriptions: DashboardSubscriptionLike[]) {
  const live = subscriptions.find((item) => item.status === "active")
    ?? subscriptions.find((item) => item.status === "paused");
  if (live) return live.subscriptionId;

  return [...subscriptions]
    .sort((left, right) => {
      const rightTime = String(right.updatedAt ?? right.createdAt ?? "");
      const leftTime = String(left.updatedAt ?? left.createdAt ?? "");
      return rightTime.localeCompare(leftTime);
    })[0]?.subscriptionId ?? "";
}

export function latestCreatedOrderCycle<T extends DashboardCycleLike>(
  cycles: T[],
  subscriptionId: string,
) {
  return newest(cycles.filter((item) =>
    item.subscriptionId === subscriptionId
    && item.status === "order_created"
    && Boolean(item.createdOrderId),
  ));
}

export function currentSubscriptionArrangement<T extends DashboardCycleLike>(
  cycles: T[],
  subscriptionId: string,
) {
  return newest(cycles.filter((item) =>
    item.subscriptionId === subscriptionId
    && (
      (item.kind === "manual_replenishment" && ["locked", "order_created"].includes(item.status))
      || (item.status === "order_created" && Boolean(item.createdOrderId))
    ),
  ));
}

export function subscriptionSelectorLabel(
  subscription: DashboardSubscriptionLike,
  products: MemberSubscriptionProduct[],
) {
  const primaryItem = subscription.defaultItems.slice(0, 1);
  const primaryProduct = subscriptionItemsSummary(primaryItem, products) || "尚未選擇商品";
  const shipping = subscription.shippingMethod === "711_cod"
    ? `7-ELEVEN ${subscription.storeSelection?.storeName || "尚未選擇門市"}`
    : "工作室自取";
  return `${subscriptionStatusLabel(subscription.status)}｜${primaryProduct}｜每 ${subscription.intervalDays} 天｜${shipping}`;
}
