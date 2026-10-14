import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { canonicalPublicCheckoutAttemptKey } from "./publicCheckoutContract";
import { commerceOrderTransactionId } from "./commerceOrderTransaction";
import { createCommerceTransactionJournal } from "./commerceTransactionJournal";
import { inventoryHash, normalizeInventoryDemand, type InventoryDemand } from "./inventoryReceipts";
import { isCartRecord } from "./commerceCart";
import type { TransactionIntent } from "./commerceTransactionTypes";

export type CheckoutAttemptReviewReason = "UNSAFE_ORDER_SOURCE" | "ORDER_READ_LIMIT"
  | "CORRUPT_ORDER_SOURCE" | "MALFORMED_MATCHING_ORDER" | "UNSUPPORTED_ORDER_PROTOCOL"
  | "MALFORMED_V1_ORDER_METADATA" | "DUPLICATE_CANONICAL_LEGACY_ORDERS"
  | "EXTRA_CANONICAL_V1_ORDER" | "ORPHAN_V1_ORDER" | "UNSAFE_JOURNAL_SOURCE"
  | "JOURNAL_READ_LIMIT" | "CORRUPT_JOURNAL" | "INVALID_PREPARED_INTENT"
  | "JOURNAL_REVIEW_REQUIRED" | "CONTRADICTORY_JOURNAL_STATE"
  | "V1_ORDER_CORRELATION_MISMATCH" | "FINALIZED_ORDER_MISSING_OR_UNCOMMITTED"
  | "EXECUTION_PROGRESS_WITHOUT_ORDER" | "ABORT_WITH_COMMITTED_ORDER";
type EvidenceIdentity = { canonicalAttemptKey: string };
export type CheckoutAttemptEvidence =
  | (EvidenceIdentity & { kind: "NONE" })
  | (EvidenceIdentity & { kind: "LEGACY_ORDER"; orderNumber: string; persistedIdempotencyKey: string; requestHash?: string })
  | (EvidenceIdentity & { kind: "PROTOCOL_V1_ATTEMPT"; transactionId: string; orderNumber: string;
      requestHash: string; journalState: "PREPARED" | "PENDING" | "FINALIZED" | "ABORTED";
      orderState: "ABSENT" | "inventory_pending" | "inventory_committed"; orderPresent: boolean })
  | (EvidenceIdentity & { kind: "CONFLICT"; reason: "CROSS_PROTOCOL_DUAL_AUTHORITY";
      legacyOrderNumber: string; transactionId: string; protocolOrderNumber: string })
  | (EvidenceIdentity & { kind: "REVIEW_REQUIRED"; reason: CheckoutAttemptReviewReason });
export class CheckoutAttemptEvidenceInputError extends Error {
  constructor() { super("An explicit absolute non-root orderDir is required"); this.name = "CheckoutAttemptEvidenceInputError"; }
}
class EvidenceFailure extends Error {
  readonly reason: CheckoutAttemptReviewReason;
  constructor(reason: CheckoutAttemptReviewReason) { super(reason); this.reason = reason; }
}
function fail(reason: CheckoutAttemptReviewReason): never { throw new EvidenceFailure(reason); }
const MAX_ENTRIES = 10000, MAX_FILE_BYTES = 2 * 1024 * 1024, MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const hashPattern = /^[a-f0-9]{64}$/, orderPattern = /^KD[0-9-]+$/;
function missing(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}
function key(value: unknown): string | null {
  try { return canonicalPublicCheckoutAttemptKey(value); } catch { return null; }
}
async function directoryExists(directory: string, reason: CheckoutAttemptReviewReason): Promise<boolean> {
  try {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return fail(reason);
    return true;
  } catch (error) { if (missing(error)) return false; if (error instanceof EvidenceFailure) throw error; return fail(reason); }
}
/** Read at most MAX_FILE_BYTES + 1. Never follow a known symlink or read a
 * non-file; changed identity/size/mtime during the read is ambiguous evidence.
 */
async function readOrder(file: string): Promise<{ order: Record<string, unknown>; bytes: number }> {
  try {
    const before = await fs.lstat(file);
    if (!before.isFile() || before.isSymbolicLink()) return fail("UNSAFE_ORDER_SOURCE");
    if (before.size > MAX_FILE_BYTES) return fail("ORDER_READ_LIMIT");
    const handle = await fs.open(file, "r");
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) return fail("UNSAFE_ORDER_SOURCE");
      const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
      let bytes = 0;
      while (bytes < buffer.length) {
        const read = await handle.read(buffer, bytes, buffer.length - bytes, null);
        if (!read.bytesRead) break;
        bytes += read.bytesRead;
      }
      if (bytes > MAX_FILE_BYTES) return fail("ORDER_READ_LIMIT");
      const after = await fs.lstat(file);
      if (!after.isFile() || after.isSymbolicLink() || after.dev !== before.dev || after.ino !== before.ino
        || after.size !== before.size || bytes !== before.size || after.mtimeMs !== before.mtimeMs) return fail("UNSAFE_ORDER_SOURCE");
      const raw = buffer.subarray(0, bytes), text = raw.toString("utf8");
      if (!Buffer.from(text, "utf8").equals(raw)) return fail("CORRUPT_ORDER_SOURCE");
      const order: unknown = JSON.parse(text);
      if (!isCartRecord(order)) return fail("CORRUPT_ORDER_SOURCE");
      return { order, bytes };
    } finally { await handle.close(); }
  } catch (error) { if (error instanceof EvidenceFailure) throw error; return fail("CORRUPT_ORDER_SOURCE"); }
}
type Match = { file: string; order: Record<string, unknown>; protocol: "legacy" | "v1" };
function matchingOrder(file: string, order: Record<string, unknown>): Match {
  if (typeof order.orderNumber !== "string" || !orderPattern.test(order.orderNumber)
    || file !== order.orderNumber + ".json" || typeof order.orderMode !== "string" || !order.orderMode
    || typeof order.status !== "string" || !order.status
    || (order.idempotencyRequestHash !== undefined
      && (typeof order.idempotencyRequestHash !== "string" || !hashPattern.test(order.idempotencyRequestHash)))) return fail("MALFORMED_MATCHING_ORDER");
  const metadata = order.inventoryTransaction;
  if (metadata == null) return { file, order, protocol: "legacy" };
  if (!isCartRecord(metadata)) return fail("MALFORMED_V1_ORDER_METADATA");
  if (!Object.hasOwn(metadata, "protocolVersion")) {
    if (Object.hasOwn(metadata, "transactionId") || Object.hasOwn(metadata, "intentHash")) return fail("MALFORMED_V1_ORDER_METADATA");
    return { file, order, protocol: "legacy" };
  }
  if (metadata.protocolVersion !== 1) return fail("UNSUPPORTED_ORDER_PROTOCOL");
  if (typeof metadata.transactionId !== "string" || !metadata.transactionId
    || typeof metadata.intentHash !== "string" || !hashPattern.test(metadata.intentHash)
    || !["inventory_pending", "inventory_committed"].includes(String(metadata.state))) return fail("MALFORMED_V1_ORDER_METADATA");
  return { file, order, protocol: "v1" };
}
async function scanOrders(orderDir: string, attempt: string, declaredFile?: string) {
  const matches: Match[] = [];
  let declared: Record<string, unknown> | undefined, count = 0, bytes = 0;
  try {
    const directory = await fs.opendir(orderDir);
    for await (const entry of directory) {
      if (++count > MAX_ENTRIES) return fail("ORDER_READ_LIMIT");
      if (!entry.name.toLowerCase().endsWith(".json")) continue;
      const read = await readOrder(path.join(orderDir, entry.name));
      bytes += read.bytes;
      if (bytes > MAX_SOURCE_BYTES) return fail("ORDER_READ_LIMIT");
      if (entry.name === declaredFile) declared = read.order;
      if (Object.hasOwn(read.order, "idempotencyKey") && typeof read.order.idempotencyKey !== "string") return fail("CORRUPT_ORDER_SOURCE");
      if (key(read.order.idempotencyKey) === attempt) matches.push(matchingOrder(entry.name, read.order));
    }
    return { matches, declared };
  } catch (error) { if (error instanceof EvidenceFailure) throw error; return fail("UNSAFE_ORDER_SOURCE"); }
}
type Journal = ReturnType<typeof createCommerceTransactionJournal>;
async function journalEntries(journal: Journal, orderDir: string) {
  if (!await directoryExists(path.join(orderDir, ".transactions"), "UNSAFE_JOURNAL_SOURCE")) return [];
  if (!await directoryExists(journal.directory, "UNSAFE_JOURNAL_SOURCE")) return [];
  // Bound total bytes before invoking the existing, unchanged hash-chain reader.
  try {
    let count = 0, bytes = 0;
    const directory = await fs.opendir(journal.directory);
    for await (const entry of directory) {
      if (entry.name.startsWith(".")) continue;
      if (++count > MAX_ENTRIES) return fail("JOURNAL_READ_LIMIT");
      const stat = await fs.lstat(path.join(journal.directory, entry.name));
      if (!stat.isFile() || stat.isSymbolicLink()) return fail("UNSAFE_JOURNAL_SOURCE");
      bytes += stat.size;
      if (stat.size > MAX_FILE_BYTES || bytes > MAX_SOURCE_BYTES) return fail("JOURNAL_READ_LIMIT");
    }
    const entries = await journal.read();
    if (!entries.length) return fail("INVALID_PREPARED_INTENT");
    return entries;
  } catch (error) { if (error instanceof EvidenceFailure) throw error; return fail("CORRUPT_JOURNAL"); }
}
function prepared(value: unknown, transactionId: string, attempt: string): TransactionIntent {
  if (!isCartRecord(value) || value.schemaVersion !== 1 || value.transactionId !== transactionId
    || typeof value.requestHash !== "string" || !hashPattern.test(value.requestHash)
    || typeof value.orderNumber !== "string" || !orderPattern.test(value.orderNumber)
    || !isCartRecord(value.order) || (value.order.orderNumber !== undefined && value.order.orderNumber !== value.orderNumber)
    || key(value.order.idempotencyKey) !== attempt
    || (value.order.idempotencyRequestHash !== undefined && value.order.idempotencyRequestHash !== value.requestHash)
    || !Array.isArray(value.participants) || !value.participants.length || value.participants.length > 32
    || !["new_order", "confirmed", "waiting_merchant_create_cod_shipment", "waiting_studio_pickup_confirmation"].includes(String(value.finalStatus))) return fail("INVALID_PREPARED_INTENT");
  const domains = new Set<string>(), ranks = new Set<number>();
  for (const participant of value.participants) {
    if (!isCartRecord(participant) || typeof participant.domain !== "string"
      || !/^[a-z][a-z0-9_-]{0,31}$/.test(participant.domain) || domains.has(participant.domain)
      || !Number.isSafeInteger(participant.registryRank) || (participant.registryRank as number) < 0
      || ranks.has(participant.registryRank as number)) return fail("INVALID_PREPARED_INTENT");
    try { normalizeInventoryDemand(participant.demands as InventoryDemand[]); } catch { return fail("INVALID_PREPARED_INTENT"); }
    domains.add(participant.domain); ranks.add(participant.registryRank as number);
  }
  return value as unknown as TransactionIntent; // Preserve the original JSON for intentHash; no normalization rewrite.
}
function summarize(entries: Awaited<ReturnType<Journal["read"]>>, intent: TransactionIntent) {
  const events = entries.map(entry => entry.event);
  if (events.some(event => event.type === "REVIEW_REQUIRED")) return fail("JOURNAL_REVIEW_REQUIRED");
  let finalized = false, aborted = false, abortProgress = false, executionProgress = false;
  const domains = new Set(intent.participants.map(participant => participant.domain));
  for (const event of events.slice(1)) {
    if (!["APPLIED", "ABORT", "COMPENSATION_PENDING", "COMPENSATED", "FINALIZED", "ABORTED"].includes(event.type)) return fail("CONTRADICTORY_JOURNAL_STATE");
    if (finalized && event.type !== "FINALIZED" || aborted && event.type !== "ABORTED") return fail("CONTRADICTORY_JOURNAL_STATE");
    if (event.type === "APPLIED" || event.type === "COMPENSATED" || event.type === "COMPENSATION_PENDING") {
      if (!domains.has(event.domain)) return fail("CONTRADICTORY_JOURNAL_STATE");
      if (event.type !== "COMPENSATION_PENDING" && (typeof event.receiptHash !== "string" || !hashPattern.test(event.receiptHash))) return fail("CONTRADICTORY_JOURNAL_STATE");
      executionProgress = true;
    }
    if (event.type === "ABORT" || event.type === "COMPENSATION_PENDING" || event.type === "COMPENSATED") abortProgress = true;
    if (event.type === "FINALIZED") finalized = true;
    if (event.type === "ABORTED") aborted = true;
  }
  if (finalized && (aborted || abortProgress)) return fail("CONTRADICTORY_JOURNAL_STATE");
  const state = finalized ? "FINALIZED" as const : aborted ? "ABORTED" as const
    : events.length > 1 ? "PENDING" as const : "PREPARED" as const;
  return { state, executionProgress, abortProgress: abortProgress || aborted };
}
/** READ-ONLY EVIDENCE ONLY. An UNLOCKED RESULT IS PROVISIONAL FOR FUTURE WRITE
 * AUTHORIZATION: B4 must resolve again under canonical coordination before any
 * mutation. This API does not authenticate, compare a current request, replay,
 * retry, recover, acquire locks or return full customer/order/ownership data.
 */
export async function resolveCheckoutAttemptEvidence(input: {
  orderDir: string; canonicalAttemptKey: unknown;
}): Promise<CheckoutAttemptEvidence> {
  const attempt = canonicalPublicCheckoutAttemptKey(input.canonicalAttemptKey);
  if (typeof input.orderDir !== "string" || !input.orderDir || input.orderDir.includes("\0")
    || !path.isAbsolute(input.orderDir) || path.resolve(input.orderDir) === path.parse(path.resolve(input.orderDir)).root) throw new CheckoutAttemptEvidenceInputError();
  const orderDir = path.resolve(input.orderDir), transactionId = commerceOrderTransactionId(attempt);
  try {
    if (!await directoryExists(orderDir, "UNSAFE_ORDER_SOURCE")) return { kind: "NONE", canonicalAttemptKey: attempt };
    const entries = await journalEntries(createCommerceTransactionJournal(orderDir, transactionId), orderDir);
    let intent: TransactionIntent | undefined;
    if (entries.length) {
      if (entries[0].event.type !== "PREPARED") return fail("INVALID_PREPARED_INTENT");
      intent = prepared(entries[0].event.intent, transactionId, attempt);
    }
    const summary = intent ? summarize(entries, intent) : undefined;
    const orders = await scanOrders(orderDir, attempt, intent ? intent.orderNumber + ".json" : undefined);
    const legacy = orders.matches.filter(match => match.protocol === "legacy");
    const v1 = orders.matches.filter(match => match.protocol === "v1");
    if (legacy.length > 1) return fail("DUPLICATE_CANONICAL_LEGACY_ORDERS");
    if (v1.length > 1) return fail("EXTRA_CANONICAL_V1_ORDER");
    if (!intent || !summary) {
      if (v1.length) return fail("ORPHAN_V1_ORDER");
      if (!legacy.length) return { kind: "NONE", canonicalAttemptKey: attempt };
      const order = legacy[0].order;
      return { kind: "LEGACY_ORDER", canonicalAttemptKey: attempt, orderNumber: order.orderNumber as string,
        persistedIdempotencyKey: order.idempotencyKey as string,
        ...(typeof order.idempotencyRequestHash === "string" ? { requestHash: order.idempotencyRequestHash } : {}) };
    }
    if (v1.length && v1[0].file !== intent.orderNumber + ".json") return fail("EXTRA_CANONICAL_V1_ORDER");
    let orderState: "ABSENT" | "inventory_pending" | "inventory_committed" = "ABSENT";
    if (orders.declared) {
      const order = orders.declared, metadata = order.inventoryTransaction;
      if (order.orderNumber !== intent.orderNumber || key(order.idempotencyKey) !== attempt
        || !isCartRecord(metadata) || metadata.protocolVersion !== 1 || metadata.transactionId !== transactionId
        || metadata.intentHash !== inventoryHash(intent)
        || (order.idempotencyRequestHash !== undefined && order.idempotencyRequestHash !== intent.requestHash)
        || (metadata.state !== "inventory_pending" && metadata.state !== "inventory_committed")) return fail("V1_ORDER_CORRELATION_MISMATCH");
      orderState = metadata.state;
    }
    if (summary.state === "FINALIZED" && orderState !== "inventory_committed") return fail("FINALIZED_ORDER_MISSING_OR_UNCOMMITTED");
    if (summary.executionProgress && orderState === "ABSENT") return fail("EXECUTION_PROGRESS_WITHOUT_ORDER");
    if (summary.abortProgress && orderState === "inventory_committed") return fail("ABORT_WITH_COMMITTED_ORDER");
    if (legacy.length) return { kind: "CONFLICT", canonicalAttemptKey: attempt, reason: "CROSS_PROTOCOL_DUAL_AUTHORITY",
      legacyOrderNumber: legacy[0].order.orderNumber as string, transactionId, protocolOrderNumber: intent.orderNumber };
    return { kind: "PROTOCOL_V1_ATTEMPT", canonicalAttemptKey: attempt, transactionId, orderNumber: intent.orderNumber,
      requestHash: intent.requestHash, journalState: summary.state, orderState, orderPresent: orderState !== "ABSENT" };
  } catch (error) {
    return { kind: "REVIEW_REQUIRED", canonicalAttemptKey: attempt,
      reason: error instanceof EvidenceFailure ? error.reason : "UNSAFE_ORDER_SOURCE" };
  }
}
