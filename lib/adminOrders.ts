import { promises as fs } from "fs";
import path from "path";

import {
  updateOrderFile,
  withOrderFileUpdateLock,
  type PersistLockedOrder,
} from "@/lib/orderFiles";
import {
  assessOrderInventoryTransaction,
  isFulfillmentOrderStatus,
  orderStatuses,
  type OrderStatus,
} from "@/lib/orderInventoryPolicy";
import { getOrdersDir } from "@/lib/storagePaths";

export {
  assessOrderInventoryTransaction,
  fulfillmentOrderStatuses,
  isFulfillmentOrderStatus,
  orderStatuses,
  orderStatusLabel,
  type OrderInventoryAssessment,
  type OrderInventoryAssessmentKind,
  type OrderStatus,
} from "@/lib/orderInventoryPolicy";

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
  if (isCancelledOrderTerminal(order) && nextStatus !== "cancelled") {
    if (hasReturnedOrderInventory(order)) {
      throw new OrderStatusTransitionError(
        "此訂單已取消且庫存已返還，不能直接恢復為有效訂單。",
      );
    }

    throw new OrderStatusTransitionError(
      "此訂單已取消，庫存狀態無法安全確認，不能直接恢復為有效訂單。",
    );
  }

  if (!isFulfillmentOrderStatus(nextStatus)) {
    return;
  }

  const inventoryAssessment = assessOrderInventoryTransaction(order);
  if (inventoryAssessment.fulfillmentBlocked) {
    throw new OrderStatusTransitionError(
      inventoryAssessment.apiMessage ||
        "此訂單的庫存交易狀態無法確認，不能進入正常履約狀態。",
    );
  }
}
