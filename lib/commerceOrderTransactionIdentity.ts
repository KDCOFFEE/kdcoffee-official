import { inventoryOperationKey } from "./inventoryReceipts";

/** Deterministic ID only. Caller validates/canonicalizes the UUID; no IO, locks,
 * registry lookup or transaction execution belongs in this neutral module.
 */
export function commerceOrderTransactionIdForCanonicalKey(canonicalAttemptKey: string): string {
  return "commerce-order:" + inventoryOperationKey(canonicalAttemptKey);
}
