import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isCartRecord } from "./commerceCart";
import { validateCommerceOrderInput, CommerceOrderResolutionError, type CommerceOrderInputItem } from "./commerceOrderTypes";
import { resolveCommerceOrderItems, toPersistableCommerceOrderLines, type CommerceOrderResolution } from "./commerceOrderResolver";
import { commerceOrderMoney } from "./commerceOrderPricing";
import { createCommerceTransactionCoordinator } from "./commerceTransactionCoordinator";
import { createCommerceTransactionJournal } from "./commerceTransactionJournal";
import { withCommerceLockPlan } from "./commerceLocks";
import { createCoffeeInventoryParticipant, createStoreInventoryParticipant } from "./inventoryParticipants";
import { inventoryOperationKey, normalizeInventoryDemand } from "./inventoryReceipts";
import { orderIdempotencyResource, isValidIdempotencyKey, createIdempotencyRequestHash, findOrderByIdempotencyKey } from "./orderIdempotency";
import { MAX_ORDER_NUMBER_ATTEMPTS } from "./orderFiles";
import { makeOrderNumber } from "./orders";
import { getOrdersDir, getWebsiteDataFile, getStorageRootContract } from "./storagePaths";
import type { TransactionIntent, TransactionResult } from "./commerceTransactionTypes";

export type CommerceOrderTransactionErrorCode = "INVALID_REQUEST" | "IDEMPOTENCY_CONFLICT"
  | "MIXED_CREDIT_ALLOCATION_UNRESOLVED" | "SUBSCRIPTION_NOT_SUPPORTED" | "REVIEW_REQUIRED" | "STORAGE_UNAVAILABLE";
export class CommerceOrderTransactionError extends Error {
  readonly code: CommerceOrderTransactionErrorCode;
  constructor(code: CommerceOrderTransactionErrorCode) { super(code); this.name = "CommerceOrderTransactionError"; this.code = code; }
}
/** Minimal existing studio-pickup financial context only. No new shipping/credit policy. */
export type CommerceOrderTransactionRequest = {
  idempotencyKey: string; items: CommerceOrderInputItem[];
  orderContext: {
    orderMode: "studio_pickup";
    customer: { name: string; phone: string; email: string; note: string };
    studioPickup: { preferredDate: string };
    creditApplied?: 0;
    subscriptionIntent?: never;
  };
};
export type CommerceOrderTransactionResult = TransactionResult & {
  transactionId: string; orderNumber: string; order?: Record<string, unknown>;
};
type LockedOrderOutcome =
  | { replan: TransactionIntent; result?: never }
  | { result: CommerceOrderTransactionResult; replan?: never };
function fail(code: CommerceOrderTransactionErrorCode): never { throw new CommerceOrderTransactionError(code); }
function fields(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!isCartRecord(value) || Reflect.ownKeys(value).some(key => typeof key !== "string" || !allowed.includes(key))) return fail("INVALID_REQUEST");
  return value;
}
function text(value: unknown, maximum: number, empty = false): string {
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) return fail("INVALID_REQUEST");
  const result = value.trim(); if (!empty && !result) return fail("INVALID_REQUEST");
  return result;
}
function request(raw: unknown): CommerceOrderTransactionRequest {
  const input = fields(raw, ["idempotencyKey", "items", "orderContext"]);
  if (!isValidIdempotencyKey(input.idempotencyKey)) return fail("INVALID_REQUEST");
  const items = validateCommerceOrderInput(input.items);
  if (isCartRecord(input.orderContext) && Object.hasOwn(input.orderContext, "subscriptionIntent")) return fail("SUBSCRIPTION_NOT_SUPPORTED");
  const context = fields(input.orderContext, ["orderMode", "customer", "studioPickup", "creditApplied"]);
  if (context.orderMode !== "studio_pickup") return fail("INVALID_REQUEST");
  if (context.creditApplied !== undefined && context.creditApplied !== 0) {
    if (typeof context.creditApplied === "number" && Number.isFinite(context.creditApplied) && context.creditApplied > 0
      && items.some(item => item.domain === "store")) return fail("MIXED_CREDIT_ALLOCATION_UNRESOLVED");
    return fail("INVALID_REQUEST");
  }
  const customer = fields(context.customer, ["name", "phone", "email", "note"]);
  const name = text(customer.name, 40), phone = text(customer.phone, 20);
  const email = text(customer.email, 120, true), note = text(customer.note, 200, true);
  if (!/^09\d{8}$/.test(phone) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return fail("INVALID_REQUEST");
  const pickup = fields(context.studioPickup, ["preferredDate"]), preferredDate = text(pickup.preferredDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate) || !Number.isFinite(Date.parse(preferredDate))
    || new Date(preferredDate).toISOString().slice(0, 10) !== preferredDate) return fail("INVALID_REQUEST");
  // Sorting normalized selection inputs makes item order irrelevant, without merging distinct lines.
  const sorted = [...items].sort((a, b) => {
    const left = JSON.stringify(a), right = JSON.stringify(b); return left < right ? -1 : left > right ? 1 : 0;
  });
  return { idempotencyKey: input.idempotencyKey.toLowerCase(), items: sorted,
    orderContext: { orderMode: "studio_pickup", customer: { name, phone, email, note },
      studioPickup: { preferredDate }, creditApplied: 0 } };
}
/** Existing transaction journal is the durable intent registry; no second registry is introduced. */
export function commerceOrderTransactionId(idempotencyKey: string): string {
  if (!isValidIdempotencyKey(idempotencyKey)) return fail("INVALID_REQUEST");
  return "commerce-order:" + inventoryOperationKey(idempotencyKey.toLowerCase());
}
type CoordinatorOptions = Parameters<typeof createCommerceTransactionCoordinator>[0];
export function createCommerceOrderTransactionService(options: {
  now?: () => Date; hook?: CoordinatorOptions["hook"]; writeFinalOrder?: CoordinatorOptions["writeFinalOrder"];
  /** Trusted test/server instrumentation before locks, never a public request field. */
  afterResolve?: (resolution: CommerceOrderResolution) => Promise<void>;
  generateOrderNumber?: typeof makeOrderNumber;
} = {}) {
  const now = options.now ?? (() => new Date()), generateOrderNumber = options.generateOrderNumber ?? makeOrderNumber;
  const storage = getStorageRootContract();
  if (!storage.root) return fail("STORAGE_UNAVAILABLE");
  const orderDir = getOrdersDir(), websiteFile = getWebsiteDataFile();
  const participants = [createCoffeeInventoryParticipant(websiteFile, now), createStoreInventoryParticipant({ dataRoot: storage.root, now })];
  const coordinator = createCommerceTransactionCoordinator({ orderDir, participants,
    hook: options.hook, writeFinalOrder: options.writeFinalOrder });
  function sameStorage() {
    if (getOrdersDir() !== orderDir || getWebsiteDataFile() !== websiteFile
      || getStorageRootContract().root !== storage.root) return fail("STORAGE_UNAVAILABLE");
  }
  function intentFor(input: CommerceOrderTransactionRequest, hash: string, orderNumber: string,
    resolution: CommerceOrderResolution): TransactionIntent {
    const intents = participants.filter(participant => resolution.inventoryDemand.some(item => item.domain === participant.domain))
      .map(participant => ({ domain: participant.domain, registryRank: participant.registryRank,
        // Preserve existing adapter authorities: global Coffee SKU ID, StoreProduct ID.
        demands: normalizeInventoryDemand(resolution.inventoryDemand.filter(item => item.domain === participant.domain)
          .map(item => ({ identity: item.domain === "coffee" ? item.variantId : item.productId, quantity: item.quantity }))) }));
    const items = toPersistableCommerceOrderLines(resolution.lines), subtotal = commerceOrderMoney(resolution.itemsSubtotal);
    return { schemaVersion: 1, transactionId: commerceOrderTransactionId(input.idempotencyKey), requestHash: hash, orderNumber,
      participants: intents, finalStatus: "waiting_studio_pickup_confirmation",
      order: { orderNumber, createdAt: now().toISOString(), orderMode: "studio_pickup",
        customer: input.orderContext.customer, studioPickup: input.orderContext.studioPickup,
        deliveryAddress: null, payment: "pickup_confirmation", delivery: "KD Coffee 工作室自取",
        idempotencyKey: input.idempotencyKey, idempotencyRequestHash: hash,
        items, subtotal, shipping: 0, total: subtotal } };
  }
  async function create(raw: unknown): Promise<CommerceOrderTransactionResult> {
    const input = request(raw), hash = createIdempotencyRequestHash({ items: input.items, orderContext: input.orderContext });
    const transactionId = commerceOrderTransactionId(input.idempotencyKey);
    const journal = createCommerceTransactionJournal(orderDir, transactionId);
    const readIntent = async () => {
      const events = await journal.read();
      if (!events.length) return null;
      const first = events[0].event;
      if (first.type !== "PREPARED" || first.intent.transactionId !== transactionId) return fail("REVIEW_REQUIRED");
      if (first.intent.requestHash !== hash) return fail("IDEMPOTENCY_CONFLICT");
      return first.intent;
    };
    try {
      sameStorage();
      let intent = await readIntent();
      if (!intent) {
        const existing = await findOrderByIdempotencyKey(orderDir, input.idempotencyKey);
        if (existing) return fail(existing.idempotencyRequestHash !== hash ? "IDEMPOTENCY_CONFLICT" : "REVIEW_REQUIRED");
        const resolution = await resolveCommerceOrderItems(input.items);
        await options.afterResolve?.(resolution);
        sameStorage();
        intent = intentFor(input, hash, generateOrderNumber(), resolution);
      }
      for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
        const plannedIntent: TransactionIntent = intent;
        const outcome: LockedOrderOutcome = await withCommerceLockPlan([
          orderIdempotencyResource(orderDir, input.idempotencyKey), ...coordinator.resources(plannedIntent),
        ], async (): Promise<LockedOrderOutcome> => {
          sameStorage();
          const prepared = await readIntent();
          if (prepared && prepared.orderNumber !== plannedIntent.orderNumber) return { replan: prepared };
          let canonical = prepared;
          if (!canonical) {
            // No durability/mutation yet: check collisions, release all locks, then replan.
            try {
              await fs.lstat(path.join(orderDir, plannedIntent.orderNumber + ".json"));
              return { replan: { ...plannedIntent, orderNumber: generateOrderNumber() } };
            } catch (error) {
              if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
            }
            const existing = await findOrderByIdempotencyKey(orderDir, input.idempotencyKey);
            if (existing) return fail(existing.idempotencyRequestHash !== hash ? "IDEMPOTENCY_CONFLICT" : "REVIEW_REQUIRED");
            // Revalidate BOTH domains under their locks before ANY APPLY or PREPARED event.
            const resolution = await resolveCommerceOrderItems(input.items);
            sameStorage();
            canonical = intentFor(input, hash, plannedIntent.orderNumber, resolution);
          }
          // Durable PREPARED intent binds this attempt's locked authoritative price.
          // Recovery retains that admitted price; later Admin repricing does not create a new attempt.
          const result = await coordinator.runLocked(canonical);
          let order: Record<string, unknown> | undefined;
          if (result.state === "FINALIZED") {
            const stored: unknown = JSON.parse(await fs.readFile(path.join(orderDir, canonical.orderNumber + ".json"), "utf8"));
            if (!isCartRecord(stored) || stored.orderNumber !== canonical.orderNumber) return fail("REVIEW_REQUIRED");
            order = stored;
          }
          return { result: { ...result, transactionId, orderNumber: canonical.orderNumber, ...(order ? { order } : {}) } };
        }, { timeoutMs: 15000 });
        if (outcome.result) return outcome.result;
        if (!outcome.replan) return fail("REVIEW_REQUIRED");
        intent = outcome.replan;
      }
      return fail("STORAGE_UNAVAILABLE");
    } catch (error) {
      if (error instanceof CommerceOrderTransactionError || error instanceof CommerceOrderResolutionError) throw error;
      return fail("REVIEW_REQUIRED");
    }
  }
  return { create };
}
