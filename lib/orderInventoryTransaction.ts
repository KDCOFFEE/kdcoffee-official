import { createHash } from "crypto";
import { promises as fs } from "fs";
import type { PurchaseOption, WebsiteData } from "../data/websiteData";
import { atomicWriteJson, serializeJson, withFileLock } from "./jsonFileStore";
import { createOrderFile, updateOrderFile } from "./orderFiles";
import { priceOrderFromWebsiteData, type RequestedItem } from "./orderPricing";
import type { AggregatedSkuDemand } from "./orderStockValidation";

export class InventoryTransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryTransactionError";
  }
}

export type InventoryChange = {
  skuId: string;
  productSlug: string;
  productName: string;
  beforeStock: number;
  demand: number;
  afterStock: number;
};

export type InventoryTransactionMetadata = {
  state: "inventory_pending" | "inventory_committed" | "inventory_write_failed";
  finalStatus: string;
  startedAt: string;
  committedAt?: string;
  failedAt?: string;
  beforeWebsiteSha256: string;
  afterWebsiteSha256: string;
  changes: InventoryChange[];
};

type PricedOrder = ReturnType<typeof priceOrderFromWebsiteData>["priced"];

type TransactionDependencies = {
  atomicWriteJson: typeof atomicWriteJson;
  withFileLock: typeof withFileLock;
  createOrderFile: typeof createOrderFile;
  updateOrderFile: typeof updateOrderFile;
};

type InventoryOrderTransactionInput = {
  websiteFile: string;
  orderDir: string;
  items: RequestedItem[];
  initialOrderNumber: string;
  reuseOrderNumber?: string;
  generateOrderNumber: () => string;
  buildOrder: (orderNumber: string, priced: PricedOrder) => {
    order: Record<string, unknown>;
    lineText: string;
  };
  dependencies?: Partial<TransactionDependencies>;
  now?: () => Date;
};

const defaultDependencies: TransactionDependencies = {
  atomicWriteJson,
  withFileLock,
  createOrderFile,
  updateOrderFile,
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function productSkuSource(product: WebsiteData["menu"]["products"][number]) {
  return Array.isArray(product.skus) && product.skus.length ? product.skus : product.purchase;
}

function applySkuDemand(website: WebsiteData, demand: readonly AggregatedSkuDemand[]) {
  const skuIndex = new Map<string, {
    sku: PurchaseOption;
    product: WebsiteData["menu"]["products"][number];
  }>();

  for (const product of website.menu.products) {
    for (const sku of productSkuSource(product)) {
      if (typeof sku.id !== "string" || !sku.id.trim() || skuIndex.has(sku.id)) {
        throw new InventoryTransactionError("商品 SKU 資料異常，訂單未成立，請聯絡 KD Coffee。");
      }
      skuIndex.set(sku.id, { sku, product });
    }
  }

  const changes: InventoryChange[] = [];
  for (const item of demand) {
    const entry = skuIndex.get(item.skuId);
    if (!entry || entry.sku.enabled === false || entry.sku.stock !== item.stock) {
      throw new InventoryTransactionError("商品庫存資料已變更，訂單未成立，請重新整理後再試。");
    }
    const afterStock = item.stock - item.required;
    if (afterStock < 0) throw new InventoryTransactionError("商品庫存不足，訂單未成立，請重新整理後再試。");
    entry.sku.stock = afterStock;
    changes.push({
      skuId: item.skuId,
      productSlug: entry.product.slug,
      productName: entry.product.name,
      beforeStock: item.stock,
      demand: item.required,
      afterStock,
    });
  }

  for (const product of website.menu.products) {
    let totalStock = 0;
    for (const sku of productSkuSource(product)) {
      if (sku.enabled === false) continue;
      if (typeof sku.stock !== "number" || !Number.isInteger(sku.stock) || sku.stock < 0) {
        throw new InventoryTransactionError("商品庫存資料異常，訂單未成立，請聯絡 KD Coffee。");
      }
      totalStock += sku.stock;
    }
    product.stock = totalStock;
  }

  return changes;
}

export function inspectInventoryCommitState(
  metadata: InventoryTransactionMetadata,
  currentWebsiteJson: string,
) {
  const currentHash = sha256(currentWebsiteJson);
  if (currentHash === metadata.afterWebsiteSha256) return "inventory_committed" as const;
  if (currentHash === metadata.beforeWebsiteSha256) return "inventory_not_committed" as const;
  return "inventory_state_diverged" as const;
}

export async function runInventoryOrderTransaction(input: InventoryOrderTransactionInput) {
  const dependencies = { ...defaultDependencies, ...input.dependencies };
  const now = input.now ?? (() => new Date());
  let completedResult:
    | {
        finalized: boolean;
        inventoryCommitted: true;
        orderNumber: string;
        order: Record<string, unknown>;
        lineText: string;
        warning?: string;
      }
    | undefined;

  try {
    return await dependencies.withFileLock(input.websiteFile, async () => {
    let beforeWebsiteJson: string;
    let website: WebsiteData;
    try {
      beforeWebsiteJson = await fs.readFile(input.websiteFile, "utf8");
      website = JSON.parse(beforeWebsiteJson) as WebsiteData;
    } catch {
      throw new InventoryTransactionError("商品庫存資料無法讀取，訂單未成立，請稍後再試。");
    }

    const prepared = priceOrderFromWebsiteData(website, input.items);
    const changes = applySkuDemand(website, prepared.skuDemand);
    website.updatedAt = now().toISOString();
    website.version = Number(website.version || 1) + 1;

    const afterWebsiteJson = serializeJson(website);
    const startedAt = now().toISOString();
    const built = input.buildOrder(input.initialOrderNumber, prepared.priced);
    const finalStatus = String(built.order.status || "");
    if (!finalStatus) throw new InventoryTransactionError("訂單狀態資料異常，訂單未成立。");
    const transaction: InventoryTransactionMetadata = {
      state: "inventory_pending",
      finalStatus,
      startedAt,
      beforeWebsiteSha256: sha256(beforeWebsiteJson),
      afterWebsiteSha256: sha256(afterWebsiteJson),
      changes,
    };
    const pendingOrder = {
      ...built.order,
      status: "inventory_pending",
      inventoryTransaction: transaction,
    };
    let created = input.reuseOrderNumber
      ? {
          orderNumber: input.reuseOrderNumber,
          order: { ...pendingOrder, orderNumber: input.reuseOrderNumber },
        }
      : await dependencies.createOrderFile(
          input.orderDir,
          input.initialOrderNumber,
          pendingOrder,
          input.generateOrderNumber,
        );
    if (input.reuseOrderNumber) {
      const persistedOrder = await dependencies.updateOrderFile(
        input.orderDir,
        created.orderNumber,
        (latestOrder) => ({
          ...latestOrder,
          ...created.order,
        }),
      );
      created = {
        ...created,
        order: {
          ...persistedOrder,
          orderNumber: created.orderNumber,
        },
      };
    }
    const orderNumber = created.orderNumber;
    const lineText = orderNumber === input.initialOrderNumber
      ? built.lineText
      : built.lineText.replace(input.initialOrderNumber, orderNumber);

    try {
      await dependencies.atomicWriteJson(input.websiteFile, website);
    } catch {
      const failedOrder = {
        ...created.order,
        status: "inventory_failed",
        inventoryTransaction: {
          ...transaction,
          state: "inventory_write_failed" as const,
          failedAt: now().toISOString(),
        },
      };
      await dependencies.updateOrderFile(
        input.orderDir,
        orderNumber,
        (latestOrder) => ({
          ...latestOrder,
          status: failedOrder.status,
          inventoryTransaction: failedOrder.inventoryTransaction,
        }),
      ).catch(() => undefined);
      throw new InventoryTransactionError("庫存寫入失敗，訂單未成立，請稍後再試。");
    }

    try {
      const finalOrder = await dependencies.updateOrderFile(
        input.orderDir,
        orderNumber,
        (latestOrder) => ({
          ...latestOrder,
          status: finalStatus,
          inventoryTransaction: {
            ...transaction,
            state: "inventory_committed" as const,
            committedAt: now().toISOString(),
          },
        }),
      );
      completedResult = {
        finalized: true as const,
        inventoryCommitted: true as const,
        orderNumber,
        order: finalOrder,
        lineText,
      };
      return completedResult;
    } catch {
      completedResult = {
        finalized: false as const,
        inventoryCommitted: true as const,
        orderNumber,
        order: created.order,
        lineText,
        warning: "訂單庫存已保留，但訂單狀態待工作室確認，請勿重複下單。",
      };
      return completedResult;
    }
    });
  } catch (error) {
    if (!completedResult) throw error;
    const releaseWarning = "訂單已成立，但庫存鎖釋放異常，工作室需立即檢查系統。";
    return {
      ...completedResult,
      warning: completedResult.warning ? `${completedResult.warning} ${releaseWarning}` : releaseWarning,
    };
  }
}
