import { promises as fs } from "fs";
import path from "path";

import {
  updateOrderFile,
  withOrderFileUpdateLock,
  type PersistLockedOrder,
} from "@/lib/orderFiles";
import { getOrdersDir } from "@/lib/storagePaths";

// Orders include legacy and evolving persisted fields that are read dynamically by the admin UI.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StoredOrder = Record<string, any> & {
  orderNumber: string;
  createdAt: string;
  status: string;
  orderMode: string;
};

type PersistStoredOrder = (
  order: StoredOrder,
) => Promise<StoredOrder>;

type StoredOrderLockOperation<T> = (
  latestOrder: StoredOrder,
  persistOrder: PersistStoredOrder,
) => Promise<T> | T;

const orderDir = () => getOrdersDir();

export const orderFilePath = (orderNumber: string) =>
  path.join(orderDir(), `${orderNumber}.json`);

export async function listOrders(): Promise<StoredOrder[]> {
  try {
    const files = (await fs.readdir(orderDir())).filter((f) =>
      f.endsWith(".json"),
    );

    const rows: StoredOrder[] = [];

    for (const file of files) {
      try {
        rows.push(
          JSON.parse(
            await fs.readFile(path.join(orderDir(), file), "utf8"),
          ),
        );
      } catch {}
    }

    return rows.sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt)),
    );
  } catch {
    return [];
  }
}

export async function readOrder(
  orderNumber: string,
): Promise<StoredOrder | null> {
  if (!/^KD[0-9-]+$/.test(orderNumber)) return null;

  try {
    return JSON.parse(
      await fs.readFile(orderFilePath(orderNumber), "utf8"),
    );
  } catch {
    return null;
  }
}

export async function withStoredOrderUpdateLock<T>(
  orderNumber: string,
  operation: StoredOrderLockOperation<T>,
) {
  return withOrderFileUpdateLock(
    orderDir(),
    orderNumber,
    (latestOrder, persistOrder: PersistLockedOrder) =>
      operation(
        latestOrder as StoredOrder,
        async (order) =>
          (await persistOrder(order)) as StoredOrder,
      ),
    { timeoutMs: 15_000 },
  );
}

export async function updateStoredOrderSafely(
  orderNumber: string,
  updater: (
    latestOrder: StoredOrder,
  ) => Promise<StoredOrder> | StoredOrder,
) {
  return (await updateOrderFile(
    orderDir(),
    orderNumber,
    async (latestOrder) =>
      updater(latestOrder as StoredOrder),
    { timeoutMs: 15_000 },
  )) as StoredOrder;
}

export const orderStatuses = [
  "new_order",
  "confirmed",
  "waiting_merchant_create_cod_shipment",
  "waiting_studio_pickup_confirmation",
  "shipment_created",
  "shipped",
  "ready_for_pickup",
  "completed",
  "cancelled",
] as const;

export type OrderStatus = (typeof orderStatuses)[number];

export class OrderStatusTransitionError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "OrderStatusTransitionError";
  }
}

export function hasReturnedOrderInventory(order: StoredOrder) {
  return order.inventoryReturn?.state === "returned";
}

export function isCancelledOrderTerminal(order: StoredOrder) {
  return order.status === "cancelled";
}

export function assertOrderStatusTransition(
  order: StoredOrder,
  nextStatus: OrderStatus,
) {
  if (!isCancelledOrderTerminal(order) || nextStatus === "cancelled") {
    return;
  }

  if (hasReturnedOrderInventory(order)) {
    throw new OrderStatusTransitionError(
      "此訂單已取消且庫存已返還，不能直接恢復為有效訂單。",
    );
  }

  throw new OrderStatusTransitionError(
    "此訂單已取消，庫存狀態無法安全確認，不能直接恢復為有效訂單。",
  );
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
    } as Record<string, string>
  )[status] || "訂單已成立";
}
