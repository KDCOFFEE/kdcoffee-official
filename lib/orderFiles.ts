import { promises as fs } from "fs";
import type { FileHandle } from "fs/promises";
import path from "path";
import { atomicWriteJson } from "./jsonFileStore";

export const MAX_ORDER_NUMBER_ATTEMPTS = 25;

export class OrderFileCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderFileCreationError";
  }
}

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

export async function updateOrderFile(dir: string, orderNumber: string, order: Record<string, unknown>) {
  await atomicWriteJson(path.join(dir, `${orderNumber}.json`), order);
}
