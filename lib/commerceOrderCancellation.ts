import "server-only";
import { readOrder } from "./adminOrders";
import { createCommerceTransactionJournal } from "./commerceTransactionJournal";
import { createCommerceTransactionCoordinator } from "./commerceTransactionCoordinator";
import { createCoffeeInventoryParticipant, createStoreInventoryParticipant } from "./inventoryParticipants";
import { getOrdersDir, getStorageRootContract, getWebsiteDataFile } from "./storagePaths";
import { inventoryHash } from "./inventoryReceipts";
import type { InventoryParticipant, CancellationSnapshot, TransactionIntent } from "./commerceTransactionTypes";

export class CommerceOrderCancellationError extends Error {
  readonly status = 500;
  constructor(readonlyCode: "PENDING" | "REVIEW_REQUIRED") {
    super(readonlyCode);
    this.name = "CommerceOrderCancellationError";
  }
}
type RestoreCallbacks = Parameters<ReturnType<typeof createCommerceTransactionCoordinator>["restore"]>[2];
/** Inventory orchestration only. Authorization and all cancellation policy remain in the canonical core. */
export function createCommerceOrderCancellation(options: {
  now?: () => Date; participants?: InventoryParticipant[]; hook?: RestoreCallbacks["hook"];
  authorizationResources?: RestoreCallbacks["authorizationResources"];
} = {}) {
  const storage = getStorageRootContract();
  if (!storage.root) throw new CommerceOrderCancellationError("REVIEW_REQUIRED");
  const orderDir = getOrdersDir();
  const participants = options.participants ?? [
    createCoffeeInventoryParticipant(getWebsiteDataFile(), options.now),
    createStoreInventoryParticipant({ dataRoot: storage.root, now: options.now }),
  ];
  const coordinator = createCommerceTransactionCoordinator({ orderDir, participants });
  async function discover(orderNumber: string): Promise<TransactionIntent> {
    if (getOrdersDir() !== orderDir || getStorageRootContract().root !== storage.root) throw new CommerceOrderCancellationError("REVIEW_REQUIRED");
    const order = await readOrder(orderNumber), tx = order?.inventoryTransaction;
    if (!order || tx?.protocolVersion !== 1 || typeof tx.transactionId !== "string" ||
      typeof tx.intentHash !== "string") throw new CommerceOrderCancellationError("REVIEW_REQUIRED");
    const entries = await createCommerceTransactionJournal(orderDir, tx.transactionId).read();
    const first = entries[0]?.event;
    if (first?.type !== "PREPARED" || first.intent.orderNumber !== orderNumber ||
      first.intent.transactionId !== tx.transactionId || inventoryHash(first.intent) !== tx.intentHash) {
      throw new CommerceOrderCancellationError("REVIEW_REQUIRED");
    }
    return first.intent;
  }
  return {
    async restore(orderNumber: string, cancellation: CancellationSnapshot, callbacks: Omit<RestoreCallbacks, "hook" | "finalizeOnly">) {
      const original = await discover(orderNumber);
      const result = await coordinator.restore(original, cancellation, { ...callbacks, hook: options.hook, authorizationResources: options.authorizationResources });
      if (result.state !== "FINALIZED") throw new CommerceOrderCancellationError(result.state === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "PENDING");
      return result;
    },
    async finalize(orderNumber: string, validateOrder: RestoreCallbacks["validateOrder"]) {
      const original = await discover(orderNumber);
      const order = await readOrder(orderNumber);
      const result = await coordinator.restore(original, {
        cancelledAt: String(order?.cancelledAt), cancelledBy: order?.cancelledBy,
        cancellationReason: String(order?.cancellationReason), cancellationIdempotencyKey: String(order?.cancellationIdempotencyKey),
      }, { validateOrder, finalizeOnly: true, authorizationResources: options.authorizationResources, commitOrder: async () => { throw new Error("Finalization cannot mutate order"); } });
      if (result.state !== "FINALIZED") throw new CommerceOrderCancellationError(result.state === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "PENDING");
      return result;
    },
  };
}
