import "server-only";
import { promises as fs } from "node:fs";
import { atomicWriteJson } from "./jsonFileStore";
import { assertCommerceLockHeld } from "./commerceLockProtocol";
import { createStoreRepository } from "./storeRepository";
import { findPublicStoreProductBySlug } from "./storePublicSelectors";
import { addInventoryReceipt, findInventoryReceipt, inventoryHash, isPrivateInventoryFile, makeInventoryReceipt, normalizeInventoryDemand, receiptDemandHash, type InventoryReceipt, type InventoryReceipts } from "./inventoryReceipts";
import type { InventoryParticipant, ParticipantOperation } from "./commerceTransactionTypes";
import type { CommerceLockResource } from "./commerceLocks";
export class InventoryParticipantRejectedError extends Error {
  constructor(message: string) { super(message); this.name = "InventoryParticipantRejectedError"; }
}
type Document = { inventoryReceipts?: InventoryReceipts; [key: string]: unknown };
type Slot = { stock: number; set(value: number): void; available: boolean };
type Adapter = {
  domain: string; registryRank: number; resource: CommerceLockResource;
  read(): Promise<Document>; slots(document: Document): Map<string,Slot>;
  write(before: Document, after: Document): Promise<void>;
  now?: () => Date;
};
/** Trusted adapters only. All operations require the coordinator's domain lock. */
export function createInventoryParticipant(adapter: Adapter): InventoryParticipant {
  const now = adapter.now ?? (() => new Date());
  function expected(operation: ParticipantOperation, kind: "APPLY" | "RESTORE") {
    return receiptDemandHash(adapter.domain,kind,operation.parentOperationId,operation.demands);
  }
  function checked(receipt: InventoryReceipt, operation: ParticipantOperation, kind: "APPLY" | "RESTORE") {
    if (receipt.transactionId !== operation.transactionId || receipt.domain !== adapter.domain || receipt.kind !== kind || receipt.demandHash !== expected(operation,kind)) throw new Error("Participant receipt mismatch");
    return receipt;
  }
  async function inspect(operation: ParticipantOperation, compensationId: string) {
    assertCommerceLockHeld(adapter.resource.file);
    try {
      const document = await adapter.read();
      const apply = findInventoryReceipt(document,operation.operationId);
      const compensation = findInventoryReceipt(document,compensationId);
      if (compensation) {
        if (!apply) throw new Error("Compensation without apply");
        checked(apply,operation,"APPLY");
        checked(compensation,{...operation,operationId:compensationId,parentOperationId:operation.operationId},"RESTORE");
        return { state: "COMPENSATED" as const, apply, compensation, snapshotHash: inventoryHash(document) };
      }
      if (apply) {
        checked(apply,operation,"APPLY");
        return { state: "APPLIED" as const, apply, snapshotHash: inventoryHash(document) };
      }
      return { state: "NOT_APPLIED" as const, snapshotHash: inventoryHash(document) };
    } catch { return { state: "UNKNOWN" as const }; }
  }
  async function execute(operation: ParticipantOperation, kind: "APPLY" | "RESTORE") {
    assertCommerceLockHeld(adapter.resource.file);
    const before = await adapter.read(), existing = findInventoryReceipt(before,operation.operationId);
    if (existing) return checked(existing,operation,kind);
    const document = structuredClone(before), slots = adapter.slots(document);
    const demands = normalizeInventoryDemand(operation.demands);
    const items = demands.map(item => {
      const slot = slots.get(item.identity);
      if (!slot || (kind === "APPLY" && !slot.available) || !Number.isSafeInteger(slot.stock) || slot.stock < 0) throw new InventoryParticipantRejectedError("Inventory identity unavailable");
      const afterStock = slot.stock + (kind === "APPLY" ? -item.quantity : item.quantity);
      if (!Number.isSafeInteger(afterStock) || afterStock < 0) throw new InventoryParticipantRejectedError("Inventory insufficient or overflow");
      return {...item,beforeStock:slot.stock,afterStock};
    });
    const receipt = makeInventoryReceipt({
      operationId:operation.operationId, transactionId:operation.transactionId,domain:adapter.domain,kind,
      ...(operation.parentOperationId ? {parentOperationId:operation.parentOperationId} : {}),
      items,recordedAt:now().toISOString(),
    });
    // Validate restore budgets before touching the draft or writing anything.
    addInventoryReceipt(document,receipt);
    for (const item of items) slots.get(item.identity)!.set(item.afterStock);
    await adapter.write(before,document);
    return receipt;
  }
  return {domain:adapter.domain,registryRank:adapter.registryRank,resource:adapter.resource,inspect,
    apply:operation=>execute(operation,"APPLY"),restore:operation=>execute(operation,"RESTORE")};
}
export function createCoffeeInventoryParticipant(websiteFile: string, now?: () => Date) {
  if (!isPrivateInventoryFile(websiteFile)) throw new Error("N-domain Coffee inventory requires private persistent storage");
  return createInventoryParticipant({
    domain:"coffee",registryRank:0,resource:{file:websiteFile,rank:2,key:"0000:coffee:"+websiteFile},now,
    read:async()=>{
      if (!isPrivateInventoryFile(await fs.realpath(websiteFile))) throw new Error("Public Coffee receipt target forbidden");
      return JSON.parse(await fs.readFile(websiteFile,"utf8"));
    },
    slots:document=>{
      const products = (document.menu as { products?: Array<Record<string,unknown>> })?.products;
      if (!Array.isArray(products)) throw new Error("Invalid Coffee catalog");
      const slots=new Map<string,Slot>();
      for(const product of products){
        const skus=(Array.isArray(product.skus)&&product.skus.length?product.skus:product.purchase) as Array<Record<string,unknown>>;
        if(!Array.isArray(skus))throw new Error("Invalid Coffee SKUs");
        for(const sku of skus){
          if(typeof sku.id!=="string"||!sku.id||slots.has(sku.id))throw new Error("Ambiguous Coffee SKU");
          slots.set(sku.id,{stock:sku.stock as number,set:value=>{sku.stock=value;},available:product.active!==false&&product.purchasable!==false&&!["hidden","sold_out","discontinued"].includes(String(product.status))&&sku.enabled!==false});
        }
      }
      return slots;
    },
    write:async(_before,document)=>{
      const products=(document.menu as {products:Array<Record<string,unknown>>}).products;
      for(const product of products){
        const skus=(Array.isArray(product.skus)&&product.skus.length?product.skus:product.purchase) as Array<{stock:number;enabled?:boolean}>;
        product.stock=skus.reduce((sum,sku)=>{if(sku.enabled===false)return sum;if(!Number.isSafeInteger(sku.stock)||sku.stock<0)throw new Error("Invalid stock");const value=sum+sku.stock;if(!Number.isSafeInteger(value))throw new Error("Stock overflow");return value;},0);
      }
      document.version=Number(document.version??0)+1;document.updatedAt=(now?.()??new Date()).toISOString();
      await atomicWriteJson(websiteFile,document);
    },
  });
}
export function createStoreInventoryParticipant(options: {dataRoot?:string;now?:()=>Date}={}) {
  const repository=createStoreRepository(options);
  return createInventoryParticipant({
    domain:"store",registryRank:10,resource:{file:repository.catalogPath,rank:2,key:"0010:store:"+repository.catalogPath},now:options.now,
    read:async()=>await repository.read() as unknown as Document,
    slots:document=>{
      const catalog=document as unknown as Awaited<ReturnType<typeof repository.read>>;
      const slots=new Map<string,Slot>();
      for(const product of catalog.products) slots.set(product.id,{
        stock:product.inventory,set:value=>{product.inventory=value;},
        available:!!findPublicStoreProductBySlug(catalog,product.slug),
      });
      return slots;
    },
    write:async(before,after)=>{
      await repository.mutateInventoryLocked((catalog,timestamp)=>{
        if(inventoryHash(catalog)!==inventoryHash(before))throw new Error("Store revision changed inside inventory lock");
        const next=after as unknown as typeof catalog;
        for(const product of next.products){
          if(catalog.products.find(item=>item.id===product.id)?.inventory!==product.inventory){
            product.revision+=1;product.updatedAt=timestamp;
          }
        }
        Object.assign(catalog,next);return null;
      });
    },
  });
}
