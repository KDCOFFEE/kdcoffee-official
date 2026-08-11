import crypto from "crypto";
import { promises as fs } from "fs";

import type { StoredOrder } from "@/lib/adminOrders";
import {
  atomicWriteJson,
  serializeJson,
  withFileLock,
  type FileLockOptions,
} from "@/lib/jsonFileStore";

type SkuRecord = {
  id?: unknown;
  stock?: unknown;
  enabled?: unknown;
  [key: string]: unknown;
};

type ProductRecord = {
  id?: unknown;
  slug?: unknown;
  stock?: unknown;
  skus?: SkuRecord[];
  purchase?: SkuRecord[];
  [key: string]: unknown;
};

type WebsiteDataRecord = {
  menu?: { products?: ProductRecord[] };
  version?: unknown;
  updatedAt?: string;
  [key: string]: unknown;
};

type InventoryCommittedChange = {
  skuId: string;
  productSlug: string;
  productName: string;
  demand: number;
};

export type InventoryReturnedChange = InventoryCommittedChange & {
  beforeStock: number;
  afterStock: number;
};

export type InventoryReturnMetadata = {
  state: "return_pending" | "returned" | "return_failed";
  startedAt: string;
  returnedAt?: string;
  failedAt?: string;
  beforeWebsiteSha256?: string;
  afterWebsiteSha256?: string;
  changes: InventoryReturnedChange[];
  warning?: string;
};

export type InventoryReturnResult = {
  order: StoredOrder;
  state: "not_applicable" | "already_returned" | "returned" | "return_failed";
  warning?: string;
};

type InventoryReturnDependencies = {
  atomicWriteJson: typeof atomicWriteJson;
  withFileLock: typeof withFileLock;
  readFile: typeof fs.readFile;
};

type ReturnCommittedInventoryInput = {
  order: StoredOrder;
  websiteFile: string;
  persistOrder: (order: StoredOrder) => Promise<void>;
  now?: () => Date;
  lockOptions?: FileLockOptions;
  dependencies?: Partial<InventoryReturnDependencies>;
};

const DEFAULT_DEPENDENCIES: InventoryReturnDependencies = {
  atomicWriteJson,
  withFileLock,
  readFile: fs.readFile,
};

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isGeneralProductOrder(order: StoredOrder) {
  return order.orderMode === "711_cod" || order.orderMode === "studio_pickup";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function committedChanges(order: StoredOrder): InventoryCommittedChange[] | null {
  if (!isGeneralProductOrder(order)) return null;

  const transaction = isRecord(order.inventoryTransaction) ? order.inventoryTransaction : undefined;
  if (transaction?.state !== "inventory_committed" || !Array.isArray(transaction.changes)) {
    return null;
  }

  const changes = transaction.changes.map((value: unknown) => {
    const change = isRecord(value) ? value : {};
    return {
      skuId: String(change.skuId || ""),
      productSlug: String(change.productSlug || ""),
      productName: String(change.productName || ""),
      demand: Number(change.demand),
    };
  });

  if (
    changes.length === 0 ||
    changes.some(
      (change) => !change.skuId || !Number.isInteger(change.demand) || change.demand <= 0,
    ) ||
    new Set(changes.map((change) => change.skuId)).size !== changes.length
  ) {
    throw new Error("訂單庫存交易資料不完整，無法安全回補庫存。");
  }

  return changes;
}

function productSkuSource(product: ProductRecord): SkuRecord[] {
  if (Array.isArray(product.skus) && product.skus.length > 0) return product.skus;
  if (Array.isArray(product.purchase)) return product.purchase;
  return [];
}

function planInventoryReturn(
  websiteData: WebsiteDataRecord,
  committed: InventoryCommittedChange[],
): InventoryReturnedChange[] {
  const products = Array.isArray(websiteData.menu?.products) ? websiteData.menu.products : [];
  if (products.length === 0) {
    throw new Error("商品庫存資料中沒有可用商品，無法安全回補庫存。");
  }
  const skuById = new Map<string, { sku: ProductRecord; product: ProductRecord }>();

  for (const product of products) {
    for (const sku of productSkuSource(product)) {
      const skuId = String(sku?.id || "");
      if (!skuId) continue;
      if (skuById.has(skuId)) {
        throw new Error(`SKU ${skuId} 重複，無法安全回補庫存。`);
      }
      skuById.set(skuId, { sku, product });
    }
  }

  const returnedChanges = committed.map((change) => {
    const match = skuById.get(change.skuId);
    if (!match) {
      throw new Error(`找不到訂單中的 SKU ${change.skuId}，無法安全回補庫存。`);
    }

    const currentStock = Number(match.sku.stock);
    if (!Number.isInteger(currentStock) || currentStock < 0) {
      throw new Error(`SKU ${change.skuId} 的現行庫存資料異常，無法安全回補。`);
    }

    const afterStock = currentStock + change.demand;
    if (!Number.isSafeInteger(afterStock)) {
      throw new Error(`SKU ${change.skuId} 回補後庫存超出安全範圍。`);
    }

    return { ...change, beforeStock: currentStock, afterStock };
  });

  for (const change of returnedChanges) {
    skuById.get(change.skuId)!.sku.stock = change.afterStock;
  }

  for (const product of products) {
    product.stock = productSkuSource(product).reduce((total, sku) => {
      if (sku?.enabled === false) return total;
      const stock = Number(sku?.stock);
      if (!Number.isInteger(stock) || stock < 0) {
        throw new Error(`商品 ${product.slug || product.id || "未知"} 的 SKU 庫存資料異常。`);
      }
      return total + stock;
    }, 0);
  }

  return returnedChanges;
}

function withInventoryReturn(order: StoredOrder, metadata: InventoryReturnMetadata): StoredOrder {
  return { ...order, inventoryReturn: metadata };
}

async function persistFailure(
  order: StoredOrder,
  metadata: InventoryReturnMetadata,
  warning: string,
  persistOrder: (order: StoredOrder) => Promise<void>,
  now: () => Date,
) {
  const failedOrder = withInventoryReturn(order, {
    ...metadata,
    state: "return_failed",
    failedAt: now().toISOString(),
    warning,
  });
  await persistOrder(failedOrder);
  return failedOrder;
}

export async function returnCommittedInventoryForCancellation({
  order,
  websiteFile,
  persistOrder,
  now = () => new Date(),
  lockOptions,
  dependencies,
}: ReturnCommittedInventoryInput): Promise<InventoryReturnResult> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const existing = order.inventoryReturn as InventoryReturnMetadata | undefined;

  if (existing?.state === "returned") {
    await persistOrder(order);
    return { order, state: "already_returned" };
  }

  let committed: InventoryCommittedChange[] | null;
  try {
    committed = committedChanges(order);
  } catch (error) {
    const warning = error instanceof Error ? error.message : "訂單庫存交易資料異常，無法回補庫存。";
    const failedOrder = await persistFailure(
      order,
      existing || { state: "return_pending", startedAt: now().toISOString(), changes: [] },
      warning,
      persistOrder,
      now,
    );
    return { order: failedOrder, state: "return_failed", warning };
  }

  if (!committed) {
    await persistOrder(order);
    return { order, state: "not_applicable" };
  }

  return deps.withFileLock(
    websiteFile,
    async () => {
      const beforeJson = await deps.readFile(websiteFile, "utf8");
      const beforeSha256 = sha256(beforeJson);

      if (
        existing &&
        (existing.state === "return_pending" || existing.state === "return_failed") &&
        existing.afterWebsiteSha256 &&
        beforeSha256 === existing.afterWebsiteSha256
      ) {
        const returnedOrder = withInventoryReturn(order, {
          ...existing,
          state: "returned",
          returnedAt: now().toISOString(),
          failedAt: undefined,
          warning: undefined,
        });
        await persistOrder(returnedOrder);
        return { order: returnedOrder, state: "returned" };
      }

      if (
        existing &&
        (existing.state === "return_pending" || existing.state === "return_failed") &&
        existing.beforeWebsiteSha256 &&
        beforeSha256 !== existing.beforeWebsiteSha256
      ) {
        const warning = "庫存檔已在先前回補流程後變更，系統無法自動判定結果；未再次增加庫存，請人工核對。";
        const failedOrder = await persistFailure(order, existing, warning, persistOrder, now);
        return { order: failedOrder, state: "return_failed", warning };
      }

      let websiteData: WebsiteDataRecord;
      let returnedChanges: InventoryReturnedChange[];
      try {
        websiteData = JSON.parse(beforeJson) as WebsiteDataRecord;
        returnedChanges = planInventoryReturn(websiteData, committed);
      } catch (error) {
        const warning = error instanceof Error ? error.message : "商品庫存資料異常，無法回補庫存。";
        const failedOrder = await persistFailure(
          order,
          existing || { state: "return_pending", startedAt: now().toISOString(), changes: [] },
          warning,
          persistOrder,
          now,
        );
        return { order: failedOrder, state: "return_failed", warning };
      }

      websiteData.version = Number(websiteData.version || 0) + 1;
      websiteData.updatedAt = now().toISOString();
      const afterJson = serializeJson(websiteData);
      const pending: InventoryReturnMetadata = {
        state: "return_pending",
        startedAt: existing?.startedAt || now().toISOString(),
        beforeWebsiteSha256: beforeSha256,
        afterWebsiteSha256: sha256(afterJson),
        changes: returnedChanges,
      };
      const pendingOrder = withInventoryReturn(order, pending);

      await persistOrder(pendingOrder);

      try {
        await deps.atomicWriteJson(websiteFile, websiteData);
      } catch {
        const warning = "取消狀態已儲存，但庫存回補寫入失敗；未將本次回補標示為成功，請再次操作或人工處理。";
        const failedOrder = await persistFailure(pendingOrder, pending, warning, persistOrder, now);
        return { order: failedOrder, state: "return_failed", warning };
      }

      const returnedOrder = withInventoryReturn(pendingOrder, {
        ...pending,
        state: "returned",
        returnedAt: now().toISOString(),
      });

      try {
        await persistOrder(returnedOrder);
      } catch {
        const warning = "庫存已回補，但訂單回補狀態尚未完成保存；請再次儲存取消狀態以執行安全恢復。";
        try {
          const failedOrder = await persistFailure(pendingOrder, pending, warning, persistOrder, now);
          return { order: failedOrder, state: "return_failed", warning };
        } catch {
          return { order: pendingOrder, state: "return_failed", warning };
        }
      }

      return { order: returnedOrder, state: "returned" };
    },
    lockOptions,
  );
}
