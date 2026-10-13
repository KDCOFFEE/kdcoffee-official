import type { CommerceLockResource } from "./commerceLocks";
import type { InventoryDemand, InventoryReceipt } from "./inventoryReceipts";
export type ParticipantState = "NOT_APPLIED" | "APPLIED" | "COMPENSATION_PENDING" | "COMPENSATED" | "FAILED" | "UNKNOWN";
export type ParticipantObservation = { state: ParticipantState; apply?: InventoryReceipt; compensation?: InventoryReceipt; snapshotHash?: string };
export type ParticipantOperation = { transactionId: string; operationId: string; demands: InventoryDemand[]; parentOperationId?: string };
export type InventoryParticipant = {
  domain: string; registryRank: number; resource: CommerceLockResource;
  inspect(operation: ParticipantOperation, compensationId: string): Promise<ParticipantObservation>;
  apply(operation: ParticipantOperation): Promise<InventoryReceipt>;
  restore(operation: ParticipantOperation): Promise<InventoryReceipt>;
};
export type TransactionIntent = {
  schemaVersion: 1; transactionId: string; requestHash: string; orderNumber: string;
  participants: Array<{ domain: string; registryRank: number; demands: InventoryDemand[] }>;
  order: Record<string, unknown>; finalStatus: string;
};
export type TransactionEvent =
  | { type: "RESTORE_PREPARED"; intent: CancellationRestoreIntent }
  | { type: "RESTORE_PENDING"; domain: string; beforeHash: string }
  | { type: "RESTORED"; domain: string; receiptHash: string }
  | { type: "CANCELLED" }
  | { type: "PREPARED"; intent: TransactionIntent }
  | { type: "APPLIED"; domain: string; receiptHash: string }
  | { type: "ABORT"; reason: string }
  | { type: "COMPENSATION_PENDING"; domain: string }
  | { type: "COMPENSATED"; domain: string; receiptHash: string }
  | { type: "FINALIZED" }
  | { type: "ABORTED" }
  | { type: "REVIEW_REQUIRED"; reason: string };
export type TransactionResult = {
  state: "FINALIZED" | "ABORTED" | "PENDING" | "REVIEW_REQUIRED";
  observations: Record<string, ParticipantObservation>;
};

export type CancellationSnapshot = {
  cancelledAt: string; cancelledBy: "admin" | "member"; cancellationReason: string;
  cancellationIdempotencyKey: string; trackingNumber?: string;
};
export type CancellationRestoreIntent = {
  schemaVersion: 1; transactionId: string; originalTransactionId: string; originalIntentHash: string;
  orderNumber: string; cancellation: CancellationSnapshot;
  participants: Array<{ domain: string; registryRank: number; demands: InventoryDemand[];
    applyOperationId: string; applyReceiptHash: string }>;
};
export type CancellationRestoreResult = TransactionResult & {
  transactionId: string; newlyCancelled?: boolean; intent?: CancellationRestoreIntent;
};
