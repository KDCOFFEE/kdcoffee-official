import "server-only";
import { getCurrentMember } from "./memberAuth";
import { getOrdersDir } from "./storagePaths";
import { canonicalPublicCheckoutAttemptKey, classifyPublicCheckoutRequest,
  createProtocolV1SelectedFactsFingerprint, type PublicCheckoutOwnerBinding,
  type PublicCheckoutSelectedFacts } from "./publicCheckoutContract";
import { resolveCheckoutAttemptRecoveryAuthority, isValidatedCheckoutAttemptRecoveryAuthority,
  type CheckoutAttemptRecoveryAuthority, type ProtocolV1RecoveryAuthority } from "./checkoutAttemptResolver";
import { resolveGuestCheckoutIdentityFromAttemptAccess, resolveDurableGuestCheckoutIdentity,
  PublicCheckoutAttemptAccessUnavailableError, DurableGuestCheckoutIdentityError } from "./publicCheckoutAttemptAccess";
import { CheckoutAttemptAccessError } from "./checkoutAttemptAccess";
import { admitCommerceCheckout, type TrustedCheckoutIdentity } from "./commerceCheckoutAdmission";
import { createCommerceOrderTransactionService, CommerceOrderTransactionError,
  type CommerceOrderTransactionRequest, type CommerceOrderTransactionResult } from "./commerceOrderTransaction";
import { CommerceOrderResolutionError, type CommerceCheckoutOrderContext } from "./commerceOrderTypes";
import { isStoreCommerceEnabled } from "./storeCommerceCapability";

export const PUBLIC_CHECKOUT_ATTEMPT_ACCESS_HEADER = "X-KD-Checkout-Attempt-Access";
export function hasExplicitCommerceDomainMarker(raw: unknown): boolean {
  return record(raw) && Array.isArray(raw.items)
    && raw.items.some(item => record(item) && Object.hasOwn(item, "domain"));
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export type PublicCommerceCheckoutInput = { body: unknown; guestAttemptAccessToken?: string | null };
export type PublicCommerceCheckoutResponse = {
  status: 200 | 202 | 400 | 401 | 403 | 409 | 503; body: Record<string, unknown>;
};
type SessionMember = Pick<NonNullable<Awaited<ReturnType<typeof getCurrentMember>>>, "id" | "lineUserId" | "displayName">;
type Dependencies = {
  getCurrentMember: () => Promise<SessionMember | null>;
  getOrdersDir: typeof getOrdersDir;
  resolveAuthority: typeof resolveCheckoutAttemptRecoveryAuthority;
  resolveFreshGuest: typeof resolveGuestCheckoutIdentityFromAttemptAccess;
  resolveDurableGuest: typeof resolveDurableGuestCheckoutIdentity;
  classify: typeof classifyPublicCheckoutRequest;
  admit: typeof admitCommerceCheckout;
  createTransactionService: typeof createCommerceOrderTransactionService;
  isStoreEnabled: typeof isStoreCommerceEnabled;
};
const defaults: Dependencies = {
  getCurrentMember, getOrdersDir, resolveAuthority: resolveCheckoutAttemptRecoveryAuthority,
  resolveFreshGuest: resolveGuestCheckoutIdentityFromAttemptAccess,
  resolveDurableGuest: resolveDurableGuestCheckoutIdentity,
  classify: classifyPublicCheckoutRequest, admit: admitCommerceCheckout,
  createTransactionService: createCommerceOrderTransactionService, isStoreEnabled: isStoreCommerceEnabled,
};
const copy = {
  400: "結帳資料無效，請確認後再試。",
  401: "請重新取得結帳授權後再試。",
  403: "目前無法使用此結帳授權。",
  409: "結帳資料或商品狀態已變更，請確認後再試。",
  503: "結帳服務暫時無法使用，請稍後再試。",
} as const;
function failure(status: keyof typeof copy): PublicCommerceCheckoutResponse {
  return { status, body: { error: copy[status] } };
}
const credentialCodes = new Set(["EXPIRED", "INVALID_TOKEN", "INVALID_SIGNATURE", "INVALID_CLAIMS",
  "ATTEMPT_MISMATCH", "NOT_YET_VALID"]);
function mapCode(code: string): PublicCommerceCheckoutResponse {
  if (code === "FRESH_AUTHORITY_INVALID") return failure(401);
  if (code === "STORE_COMMERCE_DISABLED" || code === "INVALID_IDENTITY") return failure(403);
  if (["IDEMPOTENCY_CONFLICT", "PRICE_CHANGED", "OUT_OF_STOCK", "PRODUCT_NOT_FOUND",
    "PRODUCT_UNAVAILABLE", "VARIANT_NOT_FOUND"].includes(code)) return failure(409);
  if (["INVALID_REQUEST", "UNKNOWN_DOMAIN", "INVALID_ITEM", "INVALID_MONEY", "INVALID_COFFEE_OPTIONS",
    "OUTSIDE_MERCHANDISE_ADMISSION", "STORE_CREDIT_NOT_SUPPORTED", "STORE_SUBSCRIPTION_NOT_SUPPORTED",
    "MIXED_CREDIT_ALLOCATION_UNRESOLVED", "SUBSCRIPTION_NOT_SUPPORTED", "MODE_NOT_SUPPORTED",
    "PAYMENT_NOT_SUPPORTED", "INVALID_PICKUP_DATE", "PICKUP_TOO_EARLY", "PICKUP_DATE_BLOCKED",
    "INVALID_CUSTOMER", "INVALID_STORE", "INVALID_ADDRESS", "INVALID_DELIVERY_ADDRESS", "INVALID_PAYMENT"].includes(code)) return failure(400);
  return failure(503);
}
function mapError(error: unknown): PublicCommerceCheckoutResponse {
  if (error instanceof PublicCheckoutAttemptAccessUnavailableError) return failure(error.status);
  if (error instanceof CheckoutAttemptAccessError) return failure(credentialCodes.has(error.code) ? 401 : 503);
  if (error instanceof DurableGuestCheckoutIdentityError) return failure(403);
  if (error instanceof CommerceOrderTransactionError || error instanceof CommerceOrderResolutionError) return mapCode(error.code);
  return failure(503);
}
function memberIdentity(member: SessionMember): TrustedCheckoutIdentity {
  return { member: { id: member.id, lineUserId: member.lineUserId, displayName: member.displayName } };
}
function stableOwner(identity: TrustedCheckoutIdentity, key: string): PublicCheckoutOwnerBinding {
  if (identity.member) return { kind: "member", memberId: identity.member.id };
  if (identity.guestOrderAccess) return { kind: "guest", canonicalAttemptKey: key, tokenHash: identity.guestOrderAccess.tokenHash };
  throw new CommerceOrderTransactionError("INVALID_IDENTITY");
}
function recoveryRequest(facts: PublicCheckoutSelectedFacts): CommerceOrderTransactionRequest<CommerceCheckoutOrderContext> {
  const common = { customer: facts.customer };
  const context: CommerceCheckoutOrderContext = facts.orderMode === "studio_pickup"
    ? { ...common, orderMode: "studio_pickup", studioPickup: facts.studioPickup! }
    : facts.orderMode === "711_cod"
      ? { ...common, orderMode: "711_cod", store: facts.store!, payment: "cash_on_delivery" }
      : { ...common, orderMode: "home_delivery", deliveryAddress: facts.deliveryAddress!,
          paymentMethod: facts.paymentMethod as "cash_on_delivery" | "atm_transfer" };
  return { idempotencyKey: facts.canonicalAttemptKey, items: facts.items, orderContext: context };
}

/** Server-only dependencies are never accepted by the public request entry point.
 * Durable journal ownership remains authoritative; no second registry or token rotation.
 */
export function createPublicCommerceCheckoutDispatcher(overrides: Partial<Dependencies> = {}) {
  const deps = { ...defaults, ...overrides };
  async function authority(key: string) {
    return deps.resolveAuthority({ orderDir: deps.getOrdersDir(), canonicalAttemptKey: key });
  }
  async function resultResponse(result: CommerceOrderTransactionResult, key: string,
    fingerprint: string): Promise<PublicCommerceCheckoutResponse> {
    if (result.state === "FINALIZED") return { status: 200, body: {
      orderNumber: result.orderNumber, saved: true, pending: false, transactionState: "FINALIZED",
    } };
    if (result.state === "PENDING") {
      const durable = await authority(key);
      if (!isValidatedCheckoutAttemptRecoveryAuthority(durable)
        || durable.canonicalAttemptKey !== key || durable.transactionId !== result.transactionId
        || durable.orderNumber !== result.orderNumber || durable.selectedFactsFingerprint !== fingerprint) return failure(503);
      return { status: 202, body: { orderNumber: result.orderNumber,
        saved: durable.orderState !== "ABSENT", pending: true, retryable: true, transactionState: "PENDING" } };
    }
    if (result.state === "ABORTED") return { status: 409, body: {
      error: copy[409], retryable: false, transactionState: "ABORTED",
    } };
    return { status: 503, body: { error: copy[503], retryable: false, transactionState: "REVIEW_REQUIRED" } };
  }
  async function recover(durable: ProtocolV1RecoveryAuthority, key: string,
    input: PublicCommerceCheckoutInput): Promise<PublicCommerceCheckoutResponse> {
    let identity: TrustedCheckoutIdentity;
    if (durable.kind === "PROTOCOL_V1_MEMBER") {
      const member = await deps.getCurrentMember();
      if (!member) return failure(401);
      if (member.id !== durable.owner.memberId) return failure(403);
      identity = memberIdentity(member);
    } else {
      if (!input.guestAttemptAccessToken?.trim()) return failure(401);
      identity = deps.resolveDurableGuest({ token: input.guestAttemptAccessToken,
        canonicalAttemptKey: key, authority: durable });
    }
    const selection = deps.classify(input.body, stableOwner(identity, key));
    if (selection.family !== "STORE_CONTAINING_PROTOCOL_V1") return failure(400);
    if (selection.fingerprint !== durable.selectedFactsFingerprint) return failure(409);
    const result = await deps.createTransactionService().recoverExisting(recoveryRequest(selection.selectedFacts), identity);
    return resultResponse(result, key, selection.fingerprint);
  }
  async function existing(found: CheckoutAttemptRecoveryAuthority, key: string,
    input: PublicCommerceCheckoutInput): Promise<PublicCommerceCheckoutResponse> {
    if (found.kind === "LEGACY_ORDER") return failure(409);
    if (!isValidatedCheckoutAttemptRecoveryAuthority(found)) return failure(503);
    return recover(found, key, input);
  }
  return async function dispatch(input: PublicCommerceCheckoutInput): Promise<PublicCommerceCheckoutResponse> {
    let key: string;
    try { key = canonicalPublicCheckoutAttemptKey(record(input.body) ? input.body.idempotencyKey : undefined); }
    catch { return failure(400); }
    try {
      const found = await authority(key);
      if (found.kind !== "NONE") return await existing(found, key, input);
      const member = await deps.getCurrentMember();
      if (!member && !input.guestAttemptAccessToken?.trim()) return failure(401);
      const identity = member ? memberIdentity(member) : deps.resolveFreshGuest({
        token: input.guestAttemptAccessToken, idempotencyKey: key,
      });
      const owner = stableOwner(identity, key);
      const selection = deps.classify(input.body, owner);
      if (selection.family !== "STORE_CONTAINING_PROTOCOL_V1") return failure(400);
      const admission = await deps.admit(input.body, identity);
      if (admission.kind !== "PROTOCOL_V1_ELIGIBLE")
        return admission.kind === "REJECTED" ? mapCode(admission.reason) : failure(400);
      const candidate = admission.candidate;
      if (candidate.request.idempotencyKey !== key || createProtocolV1SelectedFactsFingerprint({
        canonicalAttemptKey: key, ownerBinding: owner, items: candidate.request.items,
        orderContext: candidate.request.orderContext,
      }).fingerprint !== selection.fingerprint
        || candidate.request.items.length !== candidate.priceAssertions.length
        || candidate.request.items.length !== selection.admissionItems.length) return failure(503);
      // Pair before sorting: preserve duplicate selections and every quote occurrence.
      const quotes = candidate.request.items.map((item, index) => {
        const assertion = candidate.priceAssertions[index], browser = selection.admissionItems[index];
        const { quotedUnitPrice, ...selected } = browser;
        if (assertion.domain !== item.domain || assertion.productId !== item.productId
          || assertion.variantId !== item.variantId || assertion.quotedUnitPrice !== quotedUnitPrice
          || JSON.stringify(selected) !== JSON.stringify(item)) throw new CommerceOrderTransactionError("REVIEW_REQUIRED");
        return { item, quotedUnitPrice: assertion.quotedUnitPrice };
      }).sort((a, b) => {
        const left = JSON.stringify(a.item), right = JSON.stringify(b.item);
        return left < right ? -1 : left > right ? 1 : 0;
      });
      const service = deps.createTransactionService({ publicFresh: { validateLocked: async ({ canonicalAttemptKey, resolution, intent }) => {
        if (deps.isStoreEnabled() !== true) throw new CommerceOrderTransactionError("STORE_COMMERCE_DISABLED");
        if (!member) {
          let verified: TrustedCheckoutIdentity;
          try { verified = deps.resolveFreshGuest({ token: input.guestAttemptAccessToken, idempotencyKey: key }); }
          catch (error) {
            if (error instanceof CheckoutAttemptAccessError && credentialCodes.has(error.code))
              throw new CommerceOrderTransactionError("FRESH_AUTHORITY_INVALID");
            throw new CommerceOrderTransactionError("SOURCE_UNAVAILABLE");
          }
          if (verified.guestOrderAccess?.tokenHash !== identity.guestOrderAccess?.tokenHash)
            throw new CommerceOrderTransactionError("FRESH_AUTHORITY_INVALID");
        }
        if (canonicalAttemptKey !== key || intent.requestHash !== selection.fingerprint
          || resolution.lines.length !== quotes.length) throw new CommerceOrderTransactionError("REVIEW_REQUIRED");
        resolution.lines.forEach((line, index) => {
          const quote = quotes[index], item = quote.item;
          if (line.domain !== item.domain || line.productId !== item.productId
            || line.variantId !== item.variantId || line.quantity !== item.quantity)
            throw new CommerceOrderTransactionError("REVIEW_REQUIRED");
          if (line.unitPrice !== quote.quotedUnitPrice) throw new CommerceOrderTransactionError("PRICE_CHANGED");
        });
      } } });
      let result: CommerceOrderTransactionResult;
      try { result = await service.create(candidate.request, identity); }
      catch (error) {
        if (error instanceof CommerceOrderTransactionError && error.code === "ATTEMPT_BECAME_DURABLE")
          return await existing(await authority(key), key, input);
        throw error;
      }
      return await resultResponse(result, key, selection.fingerprint);
    } catch (error) { return mapError(error); }
  };
}
export const dispatchPublicCommerceCheckout = createPublicCommerceCheckoutDispatcher();
