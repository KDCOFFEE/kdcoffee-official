import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { getPersistentDataRoot } from "./storagePaths";
import { inventoryHash, inventoryOperationKey, receiptDemandHash, normalizeInventoryDemand, validateInventoryReceipts, type InventoryReceipt } from "./inventoryReceipts";

type Document = Record<string, unknown>;
export type ReturnStockOperation = {
  operationId: string; transactionId: string; parentOperationId: string;
  domain: "coffee" | "store"; identity: string; quantity: number; originalQuantity: number;
  productSlug?: string; now: Date;
};
export class ReturnStockEvidenceError extends Error {}
function prove(value: unknown): asserts value { if (!value) throw new ReturnStockEvidenceError("original_inventory_identity_requires_review"); }
function object(value: unknown): Document { prove(value && typeof value === "object" && !Array.isArray(value)); return value as Document; }
function inside(root: string, file: string) { const relative = path.relative(root,file); return relative !== "" && !relative.startsWith(".."+path.sep) && relative !== ".." && !path.isAbsolute(relative); }
async function privatePath(file: string) {
  const root = getPersistentDataRoot(); prove(root && inside(path.resolve(root),path.resolve(file)) && !inside(path.resolve("public"),path.resolve(file)));
  const realRoot = await fs.realpath(root), real = await fs.realpath(file);
  prove(inside(realRoot,real) && !inside(await fs.realpath("public"),real) && !(await fs.lstat(file)).isSymbolicLink());
}
/** Reads never initialize/migrate receipts. Missing collections are legacy empty state. */
export function readReturnStockReceipts(document: Document): Record<string,InventoryReceipt> {
  const raw = document.returnSettlementReceipts ?? {};
  const receipts = object(raw) as Record<string,InventoryReceipt>;
  for(const [key,receipt] of Object.entries(receipts)) {
    prove(receipt && receipt.schemaVersion === 1 && receipt.kind === "RESTORE" && ["coffee","store"].includes(receipt.domain)
      && key === inventoryOperationKey(receipt.operationId) && typeof receipt.transactionId === "string" && receipt.transactionId.length > 0
      && typeof receipt.parentOperationId === "string" && receipt.parentOperationId.length > 0 && Array.isArray(receipt.items) && receipt.items.length === 1
      && Number.isFinite(Date.parse(receipt.recordedAt)) && new Date(receipt.recordedAt).toISOString() === receipt.recordedAt);
    prove(receipt.demandHash === receiptDemandHash(receipt.domain,"RESTORE",receipt.parentOperationId,receipt.items));
    const item=receipt.items[0];
    prove(Number.isSafeInteger(item.beforeStock) && item.beforeStock >= 0 && Number.isSafeInteger(item.afterStock)
      && item.afterStock === item.beforeStock + item.quantity);
  }
  return receipts;
}
function slots(document: Document, operation: ReturnStockOperation) {
  const products = operation.domain === "coffee" ? object(document.menu).products : document.products;
  prove(Array.isArray(products));
  const matches: Array<{product:Document;slot:Document}> = [];
  const identities = new Set<string>();
  for(const raw of products) {
    const product=object(raw);
    const values=operation.domain === "coffee" ? (Array.isArray(product.skus) && product.skus.length ? product.skus : product.purchase) : [product];
    prove(Array.isArray(values));
    for(const value of values) { const slot=object(value); const identity=slot.id; prove(typeof identity === "string" && identity && !identities.has(identity));identities.add(identity);
      if(identity === operation.identity)matches.push({product,slot}); }
  }
  prove(matches.length === 1);
  if(operation.domain === "coffee")prove(matches[0].product.slug === operation.productSlug);
  return {products:products as Document[],...matches[0]};
}
async function restore(file: string, operation: ReturnStockOperation): Promise<InventoryReceipt> {
  await privatePath(file);
  const document=object(JSON.parse(await fs.readFile(file,"utf8"))), receipts=readReturnStockReceipts(document);
  prove(operation.operationId.startsWith("return-stock:") && Number.isSafeInteger(operation.originalQuantity) && operation.originalQuantity > 0);
  normalizeInventoryDemand([{identity:operation.identity,quantity:operation.quantity}]);
  const demandHash=receiptDemandHash(operation.domain,"RESTORE",operation.parentOperationId,[{identity:operation.identity,quantity:operation.quantity}]);
  const existing=receipts[inventoryOperationKey(operation.operationId)];
  if(existing) { prove(existing.demandHash === demandHash && existing.transactionId === operation.transactionId);return structuredClone(existing); }
  let used=Object.values(receipts).filter(item=>item.transactionId === operation.transactionId && item.parentOperationId === operation.parentOperationId && item.domain === operation.domain)
    .reduce((sum,item)=>sum+(item.items.find(value=>value.identity === operation.identity)?.quantity ?? 0),0);
  // Existing legacy cancellation/restore receipts share the same original budget.
  if(document.inventoryReceipts !== undefined) { validateInventoryReceipts(document.inventoryReceipts); used+=Object.values(document.inventoryReceipts).filter(item=>item.kind === "RESTORE" && item.parentOperationId === operation.parentOperationId && item.domain === operation.domain)
    .reduce((sum,item)=>sum+(item.items.find(value=>value.identity === operation.identity)?.quantity ?? 0),0); }
  prove(Number.isSafeInteger(used) && used+operation.quantity <= operation.originalQuantity);
  const target=slots(document,operation), field=operation.domain === "coffee" ? "stock" : "inventory", before=target.slot[field];
  prove(typeof before === "number" && Number.isSafeInteger(before) && before >= 0 && Number.isSafeInteger(before+operation.quantity));
  const receipt:InventoryReceipt={schemaVersion:1,operationId:operation.operationId,transactionId:operation.transactionId,parentOperationId:operation.parentOperationId,
    domain:operation.domain,kind:"RESTORE",demandHash,items:[{identity:operation.identity,quantity:operation.quantity,beforeStock:before,afterStock:before+operation.quantity}],recordedAt:operation.now.toISOString()};
  target.slot[field]=before+operation.quantity;
  if(operation.domain === "coffee") { for(const product of target.products) { const values=Array.isArray(product.skus) && product.skus.length ? product.skus : product.purchase;prove(Array.isArray(values));product.stock=values.reduce((sum:number,raw:unknown)=>{const value=object(raw);if(value.enabled === false)return sum;prove(typeof value.stock === "number" && Number.isSafeInteger(value.stock) && value.stock >= 0 && Number.isSafeInteger(sum+value.stock));return sum+value.stock;},0); }document.version=Number(document.version ?? 0)+1; }
  else {prove(Number.isSafeInteger(Number(document.revision ?? 0)));document.revision=Number(document.revision ?? 0)+1;}
  document.updatedAt=operation.now.toISOString();document.returnSettlementReceipts={...receipts,[inventoryOperationKey(operation.operationId)]:receipt};readReturnStockReceipts(document);
  // Stock and immutable receipt are inseparable: no crash window between two files.
  await atomicWriteJson(file,document);return structuredClone(receipt);
}
/** Return-only scope -> existing inventory locks -> caller's existing order/commerce locks.
 * No global lock wrapper, order gate, checkout hook, number allocation, startup I/O or stale-lock deletion. */
export async function withReturnInventoryLocks<T>(input:{scopeFile:string;stockFiles:string[]}, run:(apply:(file:string,operation:ReturnStockOperation)=>Promise<InventoryReceipt>)=>Promise<T>) {
  const root=getPersistentDataRoot();prove(root && inside(path.resolve(root),path.resolve(input.scopeFile)));
  for(const file of input.stockFiles)await privatePath(file);
  prove(new Set(input.stockFiles.map(file=>path.resolve(file).toLowerCase())).size === input.stockFiles.length);
  await fs.mkdir(path.dirname(input.scopeFile),{recursive:true});
  const realRoot=await fs.realpath(root), realScope=await fs.realpath(path.dirname(input.scopeFile));
  prove(realScope === realRoot || inside(realRoot,realScope));
  return withFileLock(input.scopeFile,async()=>{
    let active=true;
    const apply=(file:string,operation:ReturnStockOperation)=>{prove(active && input.stockFiles.includes(file));return restore(file,operation);};
    const acquire=async(index:number):Promise<T>=>index === input.stockFiles.length ? run(apply) : withFileLock(input.stockFiles[index],()=>acquire(index+1),{timeoutMs:15000});
    try{return await acquire(0);}finally{active=false;}
  },{timeoutMs:15000});
}
export const returnInventorySourceFingerprint=inventoryHash;
