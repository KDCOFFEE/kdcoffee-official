import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { isCartRecord } from "./commerceCart";
import { validateCommerceOrderInput, CommerceOrderResolutionError, type CommerceOrderInputItem, normalizeCommerceCheckoutContext, CheckoutContextValidationError, type CommerceCheckoutOrderContext } from "./commerceOrderTypes";
import { resolveCommerceOrderItems, toPersistableCommerceOrderLines, type CommerceOrderResolution } from "./commerceOrderResolver";
import { commerceOrderMoney } from "./commerceOrderPricing";
import { createCommerceTransactionCoordinator } from "./commerceTransactionCoordinator";
import { createCommerceTransactionJournal } from "./commerceTransactionJournal";
import { withCommerceLockPlan } from "./commerceLocks";
import { resolveCheckoutAttemptEvidence, resolveCheckoutAttemptRecoveryAuthority, type ProtocolV1RecoveryAuthority } from "./checkoutAttemptResolver";
import { createCoffeeInventoryParticipant, createStoreInventoryParticipant } from "./inventoryParticipants";
import { inventoryHash, normalizeInventoryDemand } from "./inventoryReceipts";
import { orderIdempotencyResource, isValidIdempotencyKey, createIdempotencyRequestHash, findOrderByIdempotencyKey } from "./orderIdempotency";
import { MAX_ORDER_NUMBER_ATTEMPTS } from "./orderFiles";
import { makeOrderNumber } from "./orders";
import { getOrdersDir, getWebsiteDataFile, getStorageRootContract } from "./storagePaths";
import type { TransactionIntent, TransactionResult } from "./commerceTransactionTypes";
import { deriveCheckoutFinancialFacts, resolveTrustedCheckoutOwnership, AdmissionValidationError, type AdmissionReason, type TrustedCheckoutIdentity, type CheckoutOwnership } from "./commerceCheckoutAdmission";
import { isStoreCommerceEnabled } from "./storeCommerceCapability";
import { commerceOrderTransactionIdForCanonicalKey } from "./commerceOrderTransactionIdentity";
import { createProtocolV1SelectedFactsFingerprint, type PublicCheckoutOwnerBinding } from "./publicCheckoutContract";
import { createCheckoutAttemptBindingSnapshot, validateCheckoutAttemptBindingSnapshot,
  compareCheckoutAttemptBinding, compareHistoricalV1CheckoutAttempt, type CheckoutAttemptBindingSnapshot } from "./checkoutAttemptBinding";

export type CommerceOrderTransactionErrorCode = "INVALID_REQUEST" | "IDEMPOTENCY_CONFLICT"
  | "MIXED_CREDIT_ALLOCATION_UNRESOLVED" | "SUBSCRIPTION_NOT_SUPPORTED" | "REVIEW_REQUIRED" | "STORAGE_UNAVAILABLE" | AdmissionReason;
export class CommerceOrderTransactionError extends Error {
  readonly code: CommerceOrderTransactionErrorCode;
  constructor(code: CommerceOrderTransactionErrorCode) { super(code); this.name = "CommerceOrderTransactionError"; this.code = code; }
}
/** Keep existing typed F3 studio callers compatible; new internal callers select the mode-safe union. */
export type CommerceOrderTransactionRequest<Context extends CommerceCheckoutOrderContext =
  Extract<CommerceCheckoutOrderContext, { orderMode: "studio_pickup" }>> = {
  idempotencyKey: string; items: CommerceOrderInputItem[]; orderContext: Context;
};
type AnyCommerceOrderTransactionRequest = CommerceOrderTransactionRequest<CommerceCheckoutOrderContext>;
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
function request(raw: unknown): AnyCommerceOrderTransactionRequest {
  const input = fields(raw, ["idempotencyKey", "items", "orderContext"]);
  if (!isValidIdempotencyKey(input.idempotencyKey)) return fail("INVALID_REQUEST");
  const items = validateCommerceOrderInput(input.items);
  if (isCartRecord(input.orderContext) && Object.hasOwn(input.orderContext, "subscriptionIntent")) return fail("SUBSCRIPTION_NOT_SUPPORTED");
  if (!isCartRecord(input.orderContext)) return fail("INVALID_REQUEST");
  const context = input.orderContext;
  if (context.creditApplied !== undefined && context.creditApplied !== 0) {
    if (typeof context.creditApplied === "number" && Number.isFinite(context.creditApplied) && context.creditApplied > 0
      && items.some(item => item.domain === "store")) return fail("MIXED_CREDIT_ALLOCATION_UNRESOLVED");
    return fail("INVALID_REQUEST");
  }
  let normalized: CommerceCheckoutOrderContext;
  try { normalized = normalizeCommerceCheckoutContext(context); }
  catch (error) {
    if (error instanceof CheckoutContextValidationError) return fail(error.reason);
    throw error;
  }
  // Sorting normalized selection inputs makes item order irrelevant, without merging distinct lines.
  const sorted = [...items].sort((a, b) => {
    const left = JSON.stringify(a), right = JSON.stringify(b); return left < right ? -1 : left > right ? 1 : 0;
  });
  return { idempotencyKey: input.idempotencyKey.toLowerCase(), items: sorted, orderContext: normalized };
}
/** Existing transaction journal is the durable intent registry; no second registry is introduced. */
export function commerceOrderTransactionId(idempotencyKey: string): string {
  if (!isValidIdempotencyKey(idempotencyKey)) return fail("INVALID_REQUEST");
  return commerceOrderTransactionIdForCanonicalKey(idempotencyKey.toLowerCase());
}
type CoordinatorOptions = Parameters<typeof createCommerceTransactionCoordinator>[0];
export function createCommerceOrderTransactionService(options: {
  now?: () => Date; hook?: CoordinatorOptions["hook"]; writeFinalOrder?: CoordinatorOptions["writeFinalOrder"];
  /** Trusted test/server instrumentation before locks, never a public request field. */
  afterResolve?: (resolution: CommerceOrderResolution) => Promise<void>;
  generateOrderNumber?: typeof makeOrderNumber;
  /** Trusted server/test scheduling only; never accepted in request JSON. */
  beforeRecoveryLocks?: () => Promise<void>;
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
  async function intentFor(input: AnyCommerceOrderTransactionRequest, hash: string, orderNumber: string,
    resolution: CommerceOrderResolution, owner?: CheckoutOwnership, binding?: CheckoutAttemptBindingSnapshot): Promise<TransactionIntent> {
    const intents = participants.filter(participant => resolution.inventoryDemand.some(item => item.domain === participant.domain))
      .map(participant => ({ domain: participant.domain, registryRank: participant.registryRank,
        // Preserve existing adapter authorities: global Coffee SKU ID, StoreProduct ID.
        demands: normalizeInventoryDemand(resolution.inventoryDemand.filter(item => item.domain === participant.domain)
          .map(item => ({ identity: item.domain === "coffee" ? item.variantId : item.productId, quantity: item.quantity }))) }));
    const items = toPersistableCommerceOrderLines(resolution.lines), subtotal = commerceOrderMoney(resolution.itemsSubtotal);
    const context = input.orderContext, at = now();
    const base = { schemaVersion: 1 as const, transactionId: commerceOrderTransactionId(input.idempotencyKey), requestHash: hash, orderNumber, participants: intents };
    // Existing direct F3 studio requests without identity retain their original DTO/hash semantics.
    if (context.orderMode === "studio_pickup" && !owner) return { ...base, finalStatus: "waiting_studio_pickup_confirmation",
      order: { orderNumber, createdAt: at.toISOString(), orderMode: "studio_pickup",
        customer: context.customer, studioPickup: context.studioPickup,
        deliveryAddress: null, payment: "pickup_confirmation", delivery: "KD Coffee 工作室自取",
        idempotencyKey: input.idempotencyKey, idempotencyRequestHash: hash, items, subtotal, shipping: 0, total: subtotal } };
    if (!owner) return fail("INVALID_IDENTITY");
    if (context.orderMode !== "studio_pickup" && input.items.some(item => item.domain === "store") && !isStoreCommerceEnabled()) return fail("STORE_COMMERCE_DISABLED");
    const derived = await deriveCheckoutFinancialFacts(context, subtotal, owner, at,
      resolution.lines.some(line => line.domain === "coffee" && line.customRoast));
    sameStorage();
    return { ...base, finalStatus: derived.finalStatus,
      order: { orderNumber, createdAt: at.toISOString(), orderMode: context.orderMode, customer: context.customer,
        ...(owner.kind === "member" ? { member: owner.member } : { member: null, guestOrderAccess: owner.guestOrderAccess }),
        ...(binding ? { checkoutAttemptBinding: binding } : {}),
        ...derived.facts, idempotencyKey: input.idempotencyKey, idempotencyRequestHash: hash, items, subtotal } };

  }
  async function create(raw: unknown, trustedIdentity?: TrustedCheckoutIdentity): Promise<CommerceOrderTransactionResult> {
    const input = request(raw);
    let owner: CheckoutOwnership | undefined;
    try { owner = trustedIdentity === undefined ? undefined : resolveTrustedCheckoutOwnership(trustedIdentity); }
    catch (error) { if (error instanceof AdmissionValidationError) return fail(error.reason); throw error; }
    if (input.orderContext.orderMode !== "studio_pickup" && !owner) return fail("INVALID_IDENTITY");
    // B3B applies only to Store-containing owned internal V1 requests. Coffee-only
    // and ownerless F3 retain their exact historical hash contract.
    const stableOwner: PublicCheckoutOwnerBinding | undefined = owner?.kind === "member"
      ? { kind: "member", memberId: owner.member.memberId }
      : owner?.kind === "guest" ? { kind: "guest", canonicalAttemptKey: input.idempotencyKey, tokenHash: owner.guestOrderAccess.tokenHash } : undefined;
    const binding = stableOwner && input.items.some(item => item.domain === "store")
      ? createCheckoutAttemptBindingSnapshot({
          canonicalAttemptKey: input.idempotencyKey, ownerBinding: stableOwner,
          selectedFactsFingerprint: createProtocolV1SelectedFactsFingerprint({
            canonicalAttemptKey: input.idempotencyKey, ownerBinding: stableOwner,
            items: input.items, orderContext: input.orderContext,
          }).fingerprint,
        }) : undefined;
    const hash = binding?.selectedFactsFingerprint ?? createIdempotencyRequestHash({
      items: input.items, orderContext: input.orderContext, ...(owner ? { ownership: owner } : {}),
    });
    const transactionId = commerceOrderTransactionId(input.idempotencyKey);
    const journal = createCommerceTransactionJournal(orderDir, transactionId);
    const readIntent = async () => {
      const events = await journal.read();
      if (!events.length) return null;
      const first = events[0].event;
      if (first.type !== "PREPARED" || first.intent.transactionId !== transactionId) return fail("REVIEW_REQUIRED");
      if (binding) {
        const durable = first.intent;
        if (!isCartRecord(durable.order)) return fail("REVIEW_REQUIRED");
        // Presence claims the new format, including null/malformed values.
        // Never repair it or fall back to the historical compatibility path.
        const comparison = Object.hasOwn(durable.order, "checkoutAttemptBinding") ? (() => {
          const snapshot = validateCheckoutAttemptBindingSnapshot(durable.order.checkoutAttemptBinding);
          if (durable.requestHash !== snapshot.selectedFactsFingerprint
            || durable.order.idempotencyKey !== snapshot.canonicalAttemptKey
            || (Object.hasOwn(durable.order, "idempotencyRequestHash") && durable.order.idempotencyRequestHash !== durable.requestHash)) return fail("REVIEW_REQUIRED");
          return compareCheckoutAttemptBinding({
            currentCanonicalAttemptKey: input.idempotencyKey,
            currentSelectedFactsFingerprint: binding.selectedFactsFingerprint,
            currentOwnerBinding: stableOwner, durableSnapshot: snapshot,
          });
        })() : compareHistoricalV1CheckoutAttempt({
          intent: durable, currentRequest: input, currentOwnerBinding: stableOwner,
        });
        if (comparison.kind === "OWNER_MISMATCH") return fail("INVALID_IDENTITY");
        if (comparison.kind === "SELECTION_CONFLICT") return fail("IDEMPOTENCY_CONFLICT");
        if (comparison.kind !== "MATCH" && comparison.kind !== "MATCH_LEGACY_V1") return fail("REVIEW_REQUIRED");
      } else if (first.intent.requestHash !== hash) return fail("IDEMPOTENCY_CONFLICT");
      return first.intent;
    };
    try {
      sameStorage();
      let intent = await readIntent();
      if (!intent) {
        // Collision authorization is deferred to the canonical under-lock B2 gate.
        const resolution = await resolveCommerceOrderItems(input.items);
        await options.afterResolve?.(resolution);
        sameStorage();
        intent = await intentFor(input, hash, generateOrderNumber(), resolution, owner, binding);
      }
      for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
        const plannedIntent: TransactionIntent = intent;
        const outcome: LockedOrderOutcome = await withCommerceLockPlan([
          orderIdempotencyResource(orderDir, input.idempotencyKey), ...coordinator.resources(plannedIntent),
        ], async (): Promise<LockedOrderOutcome> => {
          sameStorage();
          // B4 collision authority is decided again under the existing sealed
          // plan, including the canonical UUID rank-0 resource. No nested lock.
          const evidence = await resolveCheckoutAttemptEvidence({ orderDir, canonicalAttemptKey: input.idempotencyKey });
          if (evidence.kind === "CONFLICT" || evidence.kind === "REVIEW_REQUIRED") return fail("REVIEW_REQUIRED");
          const prepared = await readIntent();
          if (evidence.kind === "LEGACY_ORDER") return fail(prepared ? "REVIEW_REQUIRED" : "IDEMPOTENCY_CONFLICT");
          if (evidence.kind === "NONE" && prepared) return fail("REVIEW_REQUIRED");
          if (evidence.kind === "PROTOCOL_V1_ATTEMPT"
            && (!prepared || evidence.transactionId !== transactionId || evidence.orderNumber !== prepared.orderNumber)) return fail("REVIEW_REQUIRED");
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
            canonical = await intentFor(input, hash, plannedIntent.orderNumber, resolution, owner, binding);
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
      if (error instanceof AdmissionValidationError) return fail(error.reason);
      if (error instanceof CheckoutContextValidationError) return fail(error.reason);
      return fail("REVIEW_REQUIRED");
    }
  }

  /** Existing B3B attempt only; no live admission, new intent or fresh fallback. */
  async function recoverExisting(raw: unknown, trustedIdentity: TrustedCheckoutIdentity): Promise<CommerceOrderTransactionResult> {
    const input = request(raw);
    let owner: CheckoutOwnership;
    try { owner = resolveTrustedCheckoutOwnership(trustedIdentity); }
    catch (error) { if (error instanceof AdmissionValidationError) return fail(error.reason); throw error; }
    const stableOwner: PublicCheckoutOwnerBinding = owner.kind === "member"
      ? { kind: "member", memberId: owner.member.memberId }
      : { kind: "guest", canonicalAttemptKey: input.idempotencyKey, tokenHash: owner.guestOrderAccess.tokenHash };
    function compare(authority: ProtocolV1RecoveryAuthority) {
      // Owner comparison precedes selection computation/conflict disclosure.
      const comparison = compareCheckoutAttemptBinding({
        currentCanonicalAttemptKey: input.idempotencyKey, currentOwnerBinding: stableOwner,
        currentSelectedFactsFingerprint: authority.selectedFactsFingerprint,
        durableSnapshot: createCheckoutAttemptBindingSnapshot({
          canonicalAttemptKey: authority.canonicalAttemptKey, ownerBinding: authority.owner.kind === "member" ? authority.owner
            : { kind: "guest", canonicalAttemptKey: authority.owner.canonicalAttemptKey, tokenHash: authority.owner.tokenHash },
          selectedFactsFingerprint: authority.selectedFactsFingerprint,
        }),
      });
      if (comparison.kind === "OWNER_MISMATCH") return fail("INVALID_IDENTITY");
      if (comparison.kind !== "MATCH") return fail("REVIEW_REQUIRED");
      const fingerprint = createProtocolV1SelectedFactsFingerprint({
        canonicalAttemptKey: input.idempotencyKey, ownerBinding: stableOwner, items: input.items, orderContext: input.orderContext,
      }).fingerprint;
      if (fingerprint !== authority.selectedFactsFingerprint) return fail("IDEMPOTENCY_CONFLICT");
    }
    async function authority(): Promise<ProtocolV1RecoveryAuthority> {
      const value = await resolveCheckoutAttemptRecoveryAuthority({ orderDir, canonicalAttemptKey: input.idempotencyKey });
      if (value.kind !== "PROTOCOL_V1_MEMBER" && value.kind !== "PROTOCOL_V1_GUEST") return fail("REVIEW_REQUIRED");
      compare(value);
      return value;
    }
    async function readDurable(value: ProtocolV1RecoveryAuthority): Promise<TransactionIntent> {
      const first = (await createCommerceTransactionJournal(orderDir, value.transactionId).read())[0]?.event;
      if (first?.type !== "PREPARED") return fail("REVIEW_REQUIRED");
      const intent = first.intent, binding = validateCheckoutAttemptBindingSnapshot(intent.order.checkoutAttemptBinding);
      if (intent.transactionId !== value.transactionId || intent.orderNumber !== value.orderNumber
        || intent.requestHash !== value.requestHash || intent.order.idempotencyKey !== value.canonicalAttemptKey
        || binding.canonicalAttemptKey !== value.canonicalAttemptKey || binding.selectedFactsFingerprint !== value.selectedFactsFingerprint
        || (Object.hasOwn(intent.order, "idempotencyRequestHash") && intent.order.idempotencyRequestHash !== intent.requestHash)) return fail("REVIEW_REQUIRED");
      if (value.kind === "PROTOCOL_V1_GUEST") {
        if (!isDeepStrictEqual(intent.order.guestOrderAccess, { tokenHash: value.owner.tokenHash, createdAt: value.owner.createdAt })
          || intent.order.member != null || !isDeepStrictEqual(binding.ownerBinding, {
            kind: "guest", canonicalAttemptKey: value.canonicalAttemptKey, tokenHash: value.owner.tokenHash,
          })) return fail("REVIEW_REQUIRED");
      } else if (!isCartRecord(intent.order.member) || intent.order.member.memberId !== value.owner.memberId
        || intent.order.guestOrderAccess != null || !isDeepStrictEqual(binding.ownerBinding, value.owner)) return fail("REVIEW_REQUIRED");
      return intent;
    }
    try {
      sameStorage();
      const provisional = await authority(), planned = await readDurable(provisional);
      const originalHash = inventoryHash(planned);
      await options.beforeRecoveryLocks?.();
      return await withCommerceLockPlan([
        orderIdempotencyResource(orderDir, input.idempotencyKey), ...coordinator.resources(planned),
      ], async (): Promise<CommerceOrderTransactionResult> => {
        sameStorage();
        const locked = await authority();
        if (locked.kind !== provisional.kind || locked.transactionId !== provisional.transactionId
          || locked.orderNumber !== provisional.orderNumber || locked.requestHash !== provisional.requestHash
          || locked.selectedFactsFingerprint !== provisional.selectedFactsFingerprint
          || !isDeepStrictEqual(locked.owner, provisional.owner)) return fail("REVIEW_REQUIRED");
        const durable = await readDurable(locked);
        if (inventoryHash(durable) !== originalHash) return fail("REVIEW_REQUIRED");
        if (locked.journalState === "ABORTED") return {
          state: "ABORTED", observations: {}, transactionId: durable.transactionId, orderNumber: durable.orderNumber,
        };
        const result = await coordinator.recoverLocked(durable);
        let order: Record<string, unknown> | undefined;
        if (result.state === "FINALIZED") {
          const finalAuthority = await authority();
          if (finalAuthority.transactionId !== locked.transactionId || finalAuthority.orderNumber !== locked.orderNumber
            || finalAuthority.requestHash !== locked.requestHash || finalAuthority.journalState !== "FINALIZED"
            || finalAuthority.orderState !== "inventory_committed" || !isDeepStrictEqual(finalAuthority.owner, locked.owner)
            || inventoryHash(await readDurable(finalAuthority)) !== originalHash) return fail("REVIEW_REQUIRED");
          const stored: unknown = JSON.parse(await fs.readFile(path.join(orderDir, durable.orderNumber + ".json"), "utf8"));
          if (!isCartRecord(stored) || !isCartRecord(stored.inventoryTransaction)
            || stored.orderNumber !== durable.orderNumber || stored.inventoryTransaction.protocolVersion !== 1
            || stored.inventoryTransaction.transactionId !== durable.transactionId
            || stored.inventoryTransaction.intentHash !== originalHash || stored.inventoryTransaction.state !== "inventory_committed"
            || Object.entries(durable.order).some(([field, value]) => !isDeepStrictEqual(stored[field], value))) return fail("REVIEW_REQUIRED");
          order = stored;
        }
        return { ...result, transactionId: durable.transactionId, orderNumber: durable.orderNumber, ...(order ? { order } : {}) };
      }, { timeoutMs: 15000 });
    } catch (error) {
      if (error instanceof CommerceOrderTransactionError || error instanceof CommerceOrderResolutionError) throw error;
      return fail("REVIEW_REQUIRED");
    }
  }
  return { create, recoverExisting };
}
