import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { withFileLock } from "./jsonFileStore";
import {
  inspectInventoryCommitState,
  type InventoryTransactionMetadata,
} from "./orderInventoryTransaction";
import { updateOrderFile } from "./orderFiles";

export class OrderIdempotencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderIdempotencyError";
  }
}

export type IdempotentOrder = Record<string, unknown> & {
  orderNumber: string;
  orderMode: string;
  status: string;
  idempotencyKey: string;
  idempotencyRequestHash?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function keyHash(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function createIdempotencyRequestHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isIdempotentOrder(value: unknown): value is IdempotentOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as Record<string, unknown>;
  return typeof order.orderNumber === "string"
    && typeof order.orderMode === "string"
    && typeof order.status === "string"
    && typeof order.idempotencyKey === "string";
}

function inventoryMetadata(order: IdempotentOrder) {
  const value = order.inventoryTransaction;
  if (!value || typeof value !== "object") return null;
  const metadata = value as Partial<InventoryTransactionMetadata>;
  if (
    typeof metadata.state !== "string"
    || typeof metadata.finalStatus !== "string"
    || typeof metadata.beforeWebsiteSha256 !== "string"
    || typeof metadata.afterWebsiteSha256 !== "string"
    || !Array.isArray(metadata.changes)
  ) return null;
  return metadata as InventoryTransactionMetadata;
}

export async function withOrderIdempotencyLock<T>(
  orderDir: string,
  idempotencyKey: string,
  operation: () => Promise<T>,
) {
  const lockDir = path.join(orderDir, ".idempotency");
  await fs.mkdir(lockDir, { recursive: true });
  const lockTarget = path.join(lockDir, keyHash(idempotencyKey));
  let completed = false;
  let result: T | undefined;
  try {
    return await withFileLock(lockTarget, async () => {
      result = await operation();
      completed = true;
      return result;
    }, { timeoutMs: 15_000, retryDelayMs: 40 });
  } catch (error) {
    if (completed) return result as T;
    throw error;
  }
}

export async function findOrderByIdempotencyKey(orderDir: string, idempotencyKey: string) {
  let files: string[];
  try {
    files = (await fs.readdir(orderDir)).filter((name) => name.endsWith(".json"));
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "ENOENT") return null;
    throw error;
  }

  const matches: IdempotentOrder[] = [];
  for (const file of files) {
    try {
      const value: unknown = JSON.parse(await fs.readFile(path.join(orderDir, file), "utf8"));
      if (isIdempotentOrder(value) && value.idempotencyKey === idempotencyKey) matches.push(value);
    } catch {
      throw new OrderIdempotencyError("訂單資料無法安全檢查，為避免重複下單已停止處理，請聯絡 KD Coffee。");
    }
  }
  if (matches.length > 1) {
    throw new OrderIdempotencyError("同一防重複識別碼對應多張訂單，請聯絡 KD Coffee 人工確認。");
  }
  return matches[0] ?? null;
}

type ExistingOrderResolution =
  | { action: "none" }
  | { action: "retry"; orderNumber: string; order: IdempotentOrder }
  | { action: "replay"; order: IdempotentOrder; status: 200 | 202; warning?: string };

export async function resolveExistingIdempotentOrder(
  orderDir: string,
  websiteFile: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<ExistingOrderResolution> {
  const order = await findOrderByIdempotencyKey(orderDir, idempotencyKey);
  if (!order) return { action: "none" };
  if (order.idempotencyRequestHash && order.idempotencyRequestHash !== requestHash) {
    throw new OrderIdempotencyError("同一防重複識別碼的訂單內容不一致，系統已停止重複處理。");
  }
  if (order.status !== "inventory_pending" && order.status !== "inventory_failed") {
    return { action: "replay", order, status: 200 };
  }

  const metadata = inventoryMetadata(order);
  if (!metadata) {
    return {
      action: "replay",
      order,
      status: 202,
      warning: "訂單處理狀態待工作室確認，系統不會重複扣庫存，請勿重複下單。",
    };
  }

  return withFileLock(websiteFile, async () => {
    let currentWebsiteJson: string;
    try {
      currentWebsiteJson = await fs.readFile(websiteFile, "utf8");
    } catch {
      return {
        action: "replay" as const,
        order,
        status: 202 as const,
        warning: "訂單庫存狀態暫時無法確認，系統不會重複扣庫存，請聯絡 KD Coffee。",
      };
    }

    const inventoryState = inspectInventoryCommitState(metadata, currentWebsiteJson);
    if (inventoryState === "inventory_not_committed") {
      return { action: "retry" as const, orderNumber: order.orderNumber, order };
    }
    if (inventoryState === "inventory_state_diverged") {
      return {
        action: "replay" as const,
        order,
        status: 202 as const,
        warning: "訂單庫存狀態需要人工核對，系統不會再次扣庫存，請勿重複下單。",
      };
    }

    try {
      const recoveredOrder = (await updateOrderFile(
        orderDir,
        order.orderNumber,
        (latestOrder) => ({
          ...latestOrder,
          status: metadata.finalStatus,
          inventoryTransaction: {
            ...metadata,
            state: "inventory_committed",
            committedAt: metadata.committedAt || new Date().toISOString(),
          },
        }),
      )) as IdempotentOrder;
      return {
        action: "replay" as const,
        order: recoveredOrder,
        status: 200 as const,
        warning: "訂單已依庫存交易紀錄安全恢復，未重複扣庫存。",
      };
    } catch {
      return {
        action: "replay" as const,
        order,
        status: 202 as const,
        warning: "庫存已提交，但訂單狀態仍待工作室確認；系統不會再次扣庫存。",
      };
    }
  });
}
