import { promises as fs } from "fs";
import type { FileHandle } from "fs/promises";
import path from "path";
import {
  atomicWriteJson,
  withFileLock,
  type FileLockOptions,
} from "./jsonFileStore";

export const MAX_ORDER_NUMBER_ATTEMPTS = 25;

export class OrderFileCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderFileCreationError";
  }
}

export class OrderFileNotFoundError extends Error {
  constructor() {
    super("找不到訂單");
    this.name = "OrderFileNotFoundError";
  }
}

export class OrderFileValidationError extends Error {
  constructor(message = "訂單資料格式不正確") {
    super(message);
    this.name = "OrderFileValidationError";
  }
}

export type PersistLockedOrder = (
  order: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

type LockedOrderOperation<T> = (
  latestOrder: Record<string, unknown>,
  persistOrder: PersistLockedOrder,
) => Promise<T> | T;

type OrderFileUpdater = (
  latestOrder: Record<string, unknown>,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

const ORDER_NUMBER_PATTERN = /^KD[0-9-]+$/;

function isFileExistsError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

export async function createOrderFile(
  dir: string,
  initialOrderNumber: string,
  order: Record<string, unknown>,
  generateOrderNumber: () => string,
) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    throw new OrderFileCreationError("訂單儲存空間無法使用，請稍後再試");
  }

  let orderNumber = initialOrderNumber;
  for (let attempt = 1; attempt <= MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
    const candidateOrder = { ...order, orderNumber };
    const orderPath = path.join(dir, `${orderNumber}.json`);
    let handle: FileHandle | undefined;
    try {
      handle = await fs.open(orderPath, "wx", 0o600);
      await handle.writeFile(JSON.stringify(candidateOrder, null, 2), "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      return { orderNumber, order: candidateOrder };
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => undefined);
        handle = undefined;
        await fs.unlink(orderPath).catch(() => undefined);
      }
      if (!isFileExistsError(error)) {
        throw new OrderFileCreationError("訂單檔案建立失敗，請稍後再試");
      }
      if (attempt < MAX_ORDER_NUMBER_ATTEMPTS) orderNumber = generateOrderNumber();
    }
  }

  throw new OrderFileCreationError("無法產生未重複的訂單編號，請稍後再試");
}

function validateOrderNumber(orderNumber: string) {
  if (!ORDER_NUMBER_PATTERN.test(orderNumber)) {
    throw new OrderFileValidationError("訂單編號不正確");
  }
}

function validateOrderForWrite(
  orderNumber: string,
  order: Record<string, unknown>,
) {
  if (order.orderNumber !== orderNumber) {
    throw new OrderFileValidationError("訂單編號與訂單資料不一致");
  }
}

/**
 * Lock an existing order file and always re-read it inside the lock.
 * The scoped persist function may be used more than once by recovery flows,
 * but it can only write the same validated order number.
 */
export async function withOrderFileUpdateLock<T>(
  dir: string,
  orderNumber: string,
  operation: LockedOrderOperation<T>,
  lockOptions?: FileLockOptions,
) {
  validateOrderNumber(orderNumber);
  const orderPath = path.join(dir, `${orderNumber}.json`);

  await fs.mkdir(dir, { recursive: true });

  return withFileLock(
    orderPath,
    async () => {
      let latestOrder: Record<string, unknown>;
      try {
        const value: unknown = JSON.parse(
          await fs.readFile(orderPath, "utf8"),
        );
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new OrderFileValidationError();
        }
        latestOrder = value as Record<string, unknown>;
        validateOrderForWrite(orderNumber, latestOrder);
      } catch (error) {
        const code =
          error instanceof Error && "code" in error
            ? error.code
            : undefined;
        if (code === "ENOENT") throw new OrderFileNotFoundError();
        if (error instanceof OrderFileValidationError) throw error;
        throw new OrderFileValidationError("訂單資料無法安全讀取");
      }

      const persistOrder: PersistLockedOrder = async (order) => {
        validateOrderForWrite(orderNumber, order);
        await atomicWriteJson(orderPath, order);
        return order;
      };

      return operation(latestOrder, persistOrder);
    },
    lockOptions,
  );
}

/**
 * Safely update an existing order from the latest locked snapshot.
 * Callers must provide an updater instead of a previously-read full order.
 */
export async function updateOrderFile(
  dir: string,
  orderNumber: string,
  updater: OrderFileUpdater,
  lockOptions?: FileLockOptions,
) {
  return withOrderFileUpdateLock(
    dir,
    orderNumber,
    async (latestOrder, persistOrder) => {
      const updatedOrder = await updater(latestOrder);
      return persistOrder(updatedOrder);
    },
    lockOptions,
  );
}
