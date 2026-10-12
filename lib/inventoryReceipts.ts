import { createHash } from "node:crypto";
import path from "node:path";
/** Receipts are server-owned. Never place them in the public fallback Coffee JSON. */
export function isPrivateInventoryFile(file: string) {
  const relative = path.relative(path.resolve(process.cwd(), "public"), path.resolve(file));
  return relative !== "" && (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative));
}
export type InventoryDemand = { identity: string; quantity: number };
export type InventoryReceiptItem = InventoryDemand & { beforeStock: number; afterStock: number };
export type InventoryReceipt = {
  schemaVersion: 1; operationId: string; transactionId: string; domain: string;
  kind: "APPLY" | "RESTORE"; parentOperationId?: string; demandHash: string;
  items: InventoryReceiptItem[]; recordedAt: string;
};
export type InventoryReceipts = Record<string, InventoryReceipt>;
export class InventoryReceiptError extends Error {
  constructor(message: string) { super(message); this.name = "InventoryReceiptError"; }
}
export function inventoryHash(value: unknown) { return createHash("sha256").update(JSON.stringify(value) ?? "undefined").digest("hex"); }
export function inventoryOperationKey(value: string) {
  if (typeof value !== "string" || !value || value.length > 200) throw new InventoryReceiptError("Invalid inventory operation identity");
  return createHash("sha256").update(value).digest("hex");
}
export function normalizeInventoryDemand(items: readonly InventoryDemand[]): InventoryDemand[] {
  if (!Array.isArray(items) || !items.length || items.length > 1000) throw new InventoryReceiptError("Invalid inventory demands");
  const demands = new Map<string, number>();
  for (const item of items) {
    if (!item || typeof item.identity !== "string" || !item.identity || item.identity.length > 160 || /[\u0000-\u001f]/u.test(item.identity)
      || !Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new InventoryReceiptError("Invalid inventory demand");
    const quantity = (demands.get(item.identity) ?? 0) + item.quantity;
    if (!Number.isSafeInteger(quantity)) throw new InventoryReceiptError("Inventory quantity overflow");
    demands.set(item.identity, quantity);
  }
  return [...demands].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([identity, quantity]) => ({ identity, quantity }));
}
export function receiptDemandHash(domain: string, kind: InventoryReceipt["kind"], parent: string | undefined, demands: readonly InventoryDemand[]) {
  return inventoryHash({ domain, kind, parent: parent ?? null, demands: normalizeInventoryDemand(demands) });
}
export function validateInventoryReceipts(value: unknown): asserts value is InventoryReceipts {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InventoryReceiptError("Invalid inventory receipts");
  for (const [key, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new InventoryReceiptError("Invalid inventory receipt");
    const r = raw as InventoryReceipt;
    if (Object.keys(r).some(field => !["schemaVersion","operationId","transactionId","domain","kind","parentOperationId","demandHash","items","recordedAt"].includes(field))
      || r.schemaVersion !== 1 || key !== inventoryOperationKey(r.operationId)
      || typeof r.transactionId !== "string" || !r.transactionId || r.transactionId.length > 200
      || typeof r.domain !== "string" || !/^[a-z][a-z0-9_-]{0,31}$/.test(r.domain)
      || !["APPLY","RESTORE"].includes(r.kind) || !Array.isArray(r.items)
      || !Number.isFinite(Date.parse(r.recordedAt)) || new Date(r.recordedAt).toISOString() !== r.recordedAt) throw new InventoryReceiptError("Corrupt inventory receipt");
    const demands = normalizeInventoryDemand(r.items);
    if (demands.length !== r.items.length || r.demandHash !== receiptDemandHash(r.domain,r.kind,r.parentOperationId,demands)) throw new InventoryReceiptError("Receipt demand mismatch");
    for (const item of r.items) {
      if (Object.keys(item).some(field => !["identity","quantity","beforeStock","afterStock"].includes(field))
        || !Number.isSafeInteger(item.beforeStock) || item.beforeStock < 0 || !Number.isSafeInteger(item.afterStock) || item.afterStock < 0
        || item.afterStock !== item.beforeStock + (r.kind === "APPLY" ? -item.quantity : item.quantity)) throw new InventoryReceiptError("Receipt delta mismatch");
    }
    if (r.kind === "APPLY" && r.parentOperationId !== undefined) throw new InventoryReceiptError("Apply cannot have a parent");
    if (r.kind === "RESTORE" && (typeof r.parentOperationId !== "string" || !r.parentOperationId)) throw new InventoryReceiptError("Restore requires original apply");
  }
  for (const r of Object.values(value as InventoryReceipts).filter(item => item.kind === "RESTORE")) {
    const parent = (value as InventoryReceipts)[inventoryOperationKey(r.parentOperationId!)];
    if (!parent || parent.kind !== "APPLY" || parent.domain !== r.domain || parent.transactionId !== r.transactionId) throw new InventoryReceiptError("Restore parent mismatch");
    for (const item of r.items) {
      const original = parent.items.find(line => line.identity === item.identity);
      const restored = Object.values(value as InventoryReceipts).filter(line => line.parentOperationId === parent.operationId)
        .reduce((sum,line) => sum + (line.items.find(entry => entry.identity === item.identity)?.quantity ?? 0),0);
      if (!original || !Number.isSafeInteger(restored) || restored > original.quantity) throw new InventoryReceiptError("Restore exceeds committed quantity");
    }
  }
}
export function readInventoryReceipts(document: { inventoryReceipts?: unknown }): InventoryReceipts {
  const receipts = document.inventoryReceipts ?? {}; validateInventoryReceipts(receipts); return receipts;
}
export function findInventoryReceipt(document: { inventoryReceipts?: unknown }, operationId: string) {
  return readInventoryReceipts(document)[inventoryOperationKey(operationId)];
}
export function addInventoryReceipt(document: { inventoryReceipts?: InventoryReceipts }, receipt: InventoryReceipt) {
  const current = readInventoryReceipts(document), key = inventoryOperationKey(receipt.operationId), existing = current[key];
  if (existing && inventoryHash(existing) !== inventoryHash(receipt)) throw new InventoryReceiptError("Receipt is immutable");
  const next = { ...current, [key]: structuredClone(receipt) }; validateInventoryReceipts(next); document.inventoryReceipts = next;
}
export function makeInventoryReceipt(input: Omit<InventoryReceipt,"schemaVersion"|"demandHash">): InventoryReceipt {
  return { ...input, schemaVersion: 1, demandHash: receiptDemandHash(input.domain,input.kind,input.parentOperationId,input.items) };
}
