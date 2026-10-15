import {
  MAX_CART_ITEMS, cartIdentifier, cartQuantity, isCartRecord,
  validateCoffeeOptions, validateUnifiedCartItem, type CoffeeCartItem, type UnifiedCartItem,
} from "./commerceCart";
import { isValidDateOnly } from "./checkoutRules";
import { validateDeliveryAddress, type DeliveryAddress } from "./deliveryAddress";

export const CHECKOUT_IDEMPOTENCY_KEY = "kdcoffee-checkout-idempotency-key";
export const PROTOCOL_V1_ATTEMPT_EVENT = "kdcoffee-v1-checkout-change";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORDER = /^KD[0-9-]{1,70}$/;
const SNAPSHOT_LIMIT = 64000;
export type CheckoutStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type V1Mode = "studio_pickup" | "711_cod" | "home_delivery";
export type V1Customer = { name: string; phone: string; email: string; note: string };
export type V1Line = {
  domain: "coffee" | "store"; productId: string; variantId: string; quantity: number;
  quotedUnitPrice: number; coffeeOptions?: CoffeeCartItem["coffeeOptions"];
};
export type V1Body = {
  idempotencyKey: string; orderMode: V1Mode; customer: V1Customer; items: V1Line[]; requestedCredit: 0;
  studioPickup?: { preferredDate: string }; store?: { id: string; name: string; address: string };
  deliveryAddress?: DeliveryAddress; paymentMethod?: "cash_on_delivery" | "atm_transfer";
};
export type V1Selection = Omit<V1Body, "idempotencyKey" | "items" | "requestedCredit">;
export type V1Meta = { kind: "member" | "guest"; dispatchStarted: boolean; expiresAt: string | null };
export type V1Attempt = { key: string; snapshot: V1Body; meta: V1Meta; token: string | null };
export type V1Result =
  | { kind: "FINALIZED"; orderNumber: string; saved: true; pending: false; transactionState: "FINALIZED" }
  | { kind: "PENDING"; orderNumber: string; saved: boolean; pending: true; retryable: true; transactionState: "PENDING" }
  | { kind: "ERROR"; status: number; message: string; terminal: boolean };
export class PublicCheckoutClientError extends Error {
  constructor(message = "結帳資料需要重新確認。") { super(message); this.name = "PublicCheckoutClientError"; }
}
const invalid = (): never => { throw new PublicCheckoutClientError(); };
function fields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isCartRecord(value) || Reflect.ownKeys(value).some(k => typeof k !== "string" || !keys.includes(k))) return invalid();
  return value;
}
function text(value: unknown, max: number, empty = false): string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)
    || (!empty && !value.trim())) return invalid();
  return value.trim();
}
function canonicalKey(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) return invalid();
  return value.toLowerCase();
}
function money(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}
export function isStoreContaining(items: readonly UnifiedCartItem[]): boolean {
  return items.some(item => item.domain === "store");
}
export function serializeProtocolV1Items(items: readonly UnifiedCartItem[]): V1Line[] {
  if (!items.length || items.length > MAX_CART_ITEMS || !isStoreContaining(items)) return invalid();
  return items.map(raw => {
    const item = validateUnifiedCartItem(raw);
    const base = { domain: item.domain, productId: item.productId, variantId: item.variantId,
      quantity: cartQuantity(item.quantity), quotedUnitPrice: money(item.unitPrice) };
    return item.domain === "store" ? base : { ...base, coffeeOptions: validateCoffeeOptions(item.coffeeOptions) };
  });
}
/** Revalidate untrusted browser persistence without importing server-only authority. */
export function validateProtocolV1Body(raw: unknown): V1Body {
  const r = fields(raw, ["idempotencyKey", "orderMode", "customer", "items", "requestedCredit",
    "studioPickup", "store", "deliveryAddress", "paymentMethod"]);
  if (r.requestedCredit !== 0 || canonicalKey(r.idempotencyKey) !== r.idempotencyKey) return invalid();
  const c = fields(r.customer, ["name", "phone", "email", "note"]);
  const customer = { name: text(c.name, 20), phone: text(c.phone, 10),
    email: text(c.email, 120, true), note: text(c.note, 200, true) };
  if (!/^09\d{8}$/.test(customer.phone) || (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))) return invalid();
  if (!Array.isArray(r.items) || !r.items.length || r.items.length > MAX_CART_ITEMS) return invalid();
  const items: V1Line[] = r.items.map(rawLine => {
    const line = fields(rawLine, rawLine && isCartRecord(rawLine) && rawLine.domain === "coffee"
      ? ["domain", "productId", "variantId", "quantity", "quotedUnitPrice", "coffeeOptions"]
      : ["domain", "productId", "variantId", "quantity", "quotedUnitPrice"]);
    if (line.domain !== "coffee" && line.domain !== "store") return invalid();
    const base: V1Line = { domain: line.domain, productId: cartIdentifier(line.productId, "productId"),
      variantId: cartIdentifier(line.variantId, "variantId"), quantity: cartQuantity(line.quantity),
      quotedUnitPrice: money(line.quotedUnitPrice) };
    if (line.domain === "store") { if (line.variantId !== "default") return invalid(); return base; }
    return { ...base, coffeeOptions: validateCoffeeOptions(line.coffeeOptions) };
  });
  if (!items.some(line => line.domain === "store")) return invalid();
  const common = { idempotencyKey: r.idempotencyKey as string, customer, items, requestedCredit: 0 as const };
  if (r.orderMode === "studio_pickup") {
    if (Object.hasOwn(r, "store") || Object.hasOwn(r, "deliveryAddress") || Object.hasOwn(r, "paymentMethod")) return invalid();
    const p = fields(r.studioPickup, ["preferredDate"]), preferredDate = text(p.preferredDate, 10);
    if (!isValidDateOnly(preferredDate)) return invalid();
    return { ...common, orderMode: "studio_pickup", studioPickup: { preferredDate } };
  }
  if (r.orderMode === "711_cod") {
    if (Object.hasOwn(r, "studioPickup") || Object.hasOwn(r, "deliveryAddress") || Object.hasOwn(r, "paymentMethod")) return invalid();
    const s = fields(r.store, ["id", "name", "address"]);
    const store = { id: text(s.id, 10), name: text(s.name, 30), address: text(s.address, 100) };
    if (!/^[0-9A-Za-z]{4,10}$/.test(store.id)) return invalid();
    return { ...common, orderMode: "711_cod", store };
  }
  if (r.orderMode !== "home_delivery" || Object.hasOwn(r, "studioPickup") || Object.hasOwn(r, "store")
    || (r.paymentMethod !== "cash_on_delivery" && r.paymentMethod !== "atm_transfer")) return invalid();
  const address = fields(r.deliveryAddress, ["recipientName", "phone", "postalCode", "city", "district", "addressLine"]);
  return { ...common, orderMode: "home_delivery", deliveryAddress: validateDeliveryAddress(address), paymentMethod: r.paymentMethod };
}
export function buildProtocolV1Body(key: string, items: readonly UnifiedCartItem[], selection: V1Selection): V1Body {
  // Do not spread UI state into a public request.
  const base = { idempotencyKey: canonicalKey(key), customer: selection.customer,
    items: serializeProtocolV1Items(items), requestedCredit: 0 };
  const body = selection.orderMode === "studio_pickup"
    ? { ...base, orderMode: selection.orderMode, studioPickup: selection.studioPickup }
    : selection.orderMode === "711_cod" ? { ...base, orderMode: selection.orderMode, store: selection.store }
    : { ...base, orderMode: selection.orderMode, deliveryAddress: selection.deliveryAddress, paymentMethod: selection.paymentMethod };
  return validateProtocolV1Body(body);
}
export function getProtocolV1AttemptKey(storage: CheckoutStorage, uuid = () => crypto.randomUUID()): string {
  const old = storage.getItem(CHECKOUT_IDEMPOTENCY_KEY);
  const key = old === null ? canonicalKey(uuid()) : canonicalKey(old);
  save(storage, CHECKOUT_IDEMPOTENCY_KEY, key);
  return key;
}
export function protocolV1StorageKeys(key: string) {
  const prefix = "kdcoffee-v1-checkout:" + canonicalKey(key);
  return { token: prefix + ":token", snapshot: prefix + ":snapshot", meta: prefix + ":meta" };
}
function save(storage: CheckoutStorage, key: string, value: string) {
  storage.setItem(key, value);
  if (storage.getItem(key) !== value) throw new PublicCheckoutClientError("結帳資料尚未安全儲存，請保留本頁並稍後再試。");
}
function parseStored(raw: string | null, limit: number): unknown {
  if (raw === null || raw.length > limit) return invalid();
  try { return JSON.parse(raw) as unknown; } catch { return invalid(); }
}
export function readProtocolV1Attempt(storage: CheckoutStorage): V1Attempt | null {
  const active = storage.getItem(CHECKOUT_IDEMPOTENCY_KEY);
  if (active === null) return null;
  const key = canonicalKey(active), keys = protocolV1StorageKeys(key);
  const snapshotText = storage.getItem(keys.snapshot), metaText = storage.getItem(keys.meta), token = storage.getItem(keys.token);
  if (snapshotText === null && metaText === null && token === null) return null;
  const snapshot = validateProtocolV1Body(parseStored(snapshotText, SNAPSHOT_LIMIT));
  const m = fields(parseStored(metaText, 512), ["kind", "dispatchStarted", "expiresAt"]);
  if (snapshot.idempotencyKey !== key || (m.kind !== "member" && m.kind !== "guest")
    || typeof m.dispatchStarted !== "boolean"
    || (m.expiresAt !== null && (typeof m.expiresAt !== "string" || m.expiresAt.length > 40 || !Number.isFinite(Date.parse(m.expiresAt))))
    || (token !== null && (!token || token.length > 4096 || /[\s\u0000-\u001f\u007f]/u.test(token)))
    || (m.kind === "member" && (token !== null || m.expiresAt !== null))
    || (m.kind === "guest" && m.dispatchStarted && (!token || m.expiresAt === null))) return invalid();
  return { key, snapshot, token, meta: { kind: m.kind, dispatchStarted: m.dispatchStarted, expiresAt: m.expiresAt as string | null } };
}
export function hasRecoverableProtocolV1Attempt(storage: CheckoutStorage): boolean {
  try { return readProtocolV1Attempt(storage)?.meta.dispatchStarted === true; } catch { return false; }
}
export function notifyProtocolV1AttemptChange() {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event(PROTOCOL_V1_ATTEMPT_EVENT));
  }
}
export async function readBoundedCheckoutJson(response: Response, limit = SNAPSHOT_LIMIT): Promise<unknown> {
  if (!response.body) return invalid();
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let count = 0, source = "";
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      count += chunk.value.byteLength;
      if (count > limit) { await reader.cancel(); return invalid(); }
      source += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(source + decoder.decode()) as unknown;
  } finally { reader.releaseLock(); }
}
export const V1_ERROR_COPY: Record<number, string> = {
  0: "連線中斷，訂單狀態尚未確認。請使用「重試同一筆訂單」，不要重新建立訂單。",
  400: "結帳資料需要重新確認。",
  401: "此筆結帳授權目前無法確認。請保留本頁，登入後再確認或聯絡 KD Coffee。",
  403: "目前無法完成此筆商店結帳。",
  409: "商品、價格或訂單狀態已變更，請確認此筆訂單。",
  503: "結帳服務暫時無法確認此筆訂單，請稍後重試同一筆。",
};
export function validateProtocolV1Response(status: number, raw: unknown): V1Result {
  if (status === 200 || status === 202) {
    const r = fields(raw, status === 200 ? ["orderNumber", "saved", "pending", "transactionState"]
      : ["orderNumber", "saved", "pending", "retryable", "transactionState"]);
    if (typeof r.orderNumber !== "string" || !ORDER.test(r.orderNumber)) return invalid();
    if (status === 200) {
      if (r.saved !== true || r.pending !== false || r.transactionState !== "FINALIZED") return invalid();
      return { kind: "FINALIZED", orderNumber: r.orderNumber, saved: true, pending: false, transactionState: "FINALIZED" };
    }
    if (typeof r.saved !== "boolean" || r.pending !== true || r.retryable !== true || r.transactionState !== "PENDING") return invalid();
    return { kind: "PENDING", orderNumber: r.orderNumber, saved: r.saved, pending: true, retryable: true, transactionState: "PENDING" };
  }
  const r = fields(raw, ["error", "retryable", "transactionState"]);
  const approved = ["結帳資料無效，請確認後再試。", "請重新取得結帳授權後再試。",
    "目前無法使用此結帳授權。", "結帳資料或商品狀態已變更，請確認後再試。", "結帳服務暫時無法使用，請稍後再試。"];
  if (![400, 401, 403, 409, 503].includes(status) || !approved.includes(r.error as string)) return invalid();
  const terminal = r.transactionState !== undefined;
  if (terminal ? !(r.retryable === false && ((status === 409 && r.transactionState === "ABORTED")
    || (status === 503 && r.transactionState === "REVIEW_REQUIRED"))) : r.retryable !== undefined) return invalid();
  return { kind: "ERROR", status, terminal, message: V1_ERROR_COPY[status] };
}
export type V1MemberProfile = { displayName: string; pickupName?: string; phone?: string; email?: string;
  favoriteStore?: { id: string; name: string; address: string } };
export type V1Auth = { kind: "LOADING" } | { kind: "ERROR" } | { kind: "GUEST" }
  | { kind: "MEMBER"; member: V1MemberProfile };
export function validateProtocolV1Auth(raw: unknown): V1Auth {
  if (!isCartRecord(raw) || !Object.hasOwn(raw, "member")) return { kind: "ERROR" };
  if (raw.member === null) return { kind: "GUEST" };
  try {
    const m = raw.member;
    if (!isCartRecord(m) || typeof m.id !== "string" || !m.id || typeof m.displayName !== "string") return { kind: "ERROR" };
    const member: V1MemberProfile = { displayName: text(m.displayName, 200, true) };
    for (const key of ["pickupName", "phone", "email"] as const) {
      if (m[key] != null) member[key] = text(m[key], key === "email" ? 120 : key === "phone" ? 10 : 20, true);
    }
    if (m.favoriteStore != null) {
      const s = m.favoriteStore;
      if (!isCartRecord(s)) return { kind: "ERROR" };
      member.favoriteStore = { id: text(s.id, 10), name: text(s.name, 30), address: text(s.address, 100) };
    }
    return { kind: "MEMBER", member };
  } catch { return { kind: "ERROR" }; }
}
/** One bounded run, no persistence, quote rewrite, polling or retries. */
export async function checkStoreCheckoutAvailability(items: readonly UnifiedCartItem[], fetcher: typeof fetch,
  signal: AbortSignal, timeoutMs = 10000): Promise<"AVAILABLE" | "UNAVAILABLE"> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const checked = items.map(validateUnifiedCartItem), stores = checked.filter(i => i.domain === "store");
    if (!stores.length) return "UNAVAILABLE";
    const slugs = [...new Set(stores.map(i => i.slug))];
    const operation = async () => {
      const offers = new Map<string, Record<string, unknown>>();
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(3, slugs.length) }, async () => {
        while (next < slugs.length) {
          const slug = slugs[next++];
          if (controller.signal.aborted) return invalid();
          const response = await fetcher("/api/commerce/store/offer", { method: "POST", cache: "no-store",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }), signal: controller.signal });
          if (!response.ok) return invalid();
          const offer = fields(await readBoundedCheckoutJson(response, 4096),
            ["domain", "productId", "variantId", "slug", "name", "unitPrice", "quantityLimit"]);
          if (offer.domain !== "store" || offer.variantId !== "default" || offer.slug !== slug
            || typeof offer.name !== "string" || !offer.name || offer.name.length > 200
            || typeof offer.quantityLimit !== "number" || !Number.isSafeInteger(offer.quantityLimit)
            || offer.quantityLimit < 1 || offer.quantityLimit > 99) return invalid();
          cartIdentifier(offer.productId, "productId"); money(offer.unitPrice);
          offers.set(slug, offer);
        }
      }));
      for (const line of stores) {
        const offer = offers.get(line.slug);
        const quantity = stores.reduce((sum, i) => sum + (i.productId === line.productId && i.variantId === line.variantId ? i.quantity : 0), 0);
        if (!offer || offer.productId !== line.productId || offer.unitPrice !== line.unitPrice
          || quantity > (offer.quantityLimit as number)) return invalid();
      }
    };
    await Promise.race([operation(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new PublicCheckoutClientError()); }, timeoutMs);
    })]);
    return controller.signal.aborted ? "UNAVAILABLE" : "AVAILABLE";
  } catch { controller.abort(); return "UNAVAILABLE"; }
  finally { if (timer) clearTimeout(timer); signal.removeEventListener("abort", cancel); }
}
export function protocolV1CompletionUrl(attempt: V1Attempt, orderNumber: string): string {
  if (!ORDER.test(orderNumber)) return invalid();
  return "/order-complete?order=" + encodeURIComponent(orderNumber) + "&mode=" + attempt.snapshot.orderMode
    + (attempt.snapshot.orderMode === "home_delivery" ? "&payment=" + attempt.snapshot.paymentMethod : "")
    + (attempt.meta.kind === "guest" && attempt.token ? "#token=" + encodeURIComponent(attempt.token) : "");
}
export function createProtocolV1CheckoutClient(storage: CheckoutStorage, options: {
  fetcher?: typeof fetch; now?: () => number; timeoutMs?: number; notify?: () => void;
} = {}) {
  const fetcher = options.fetcher ?? fetch, now = options.now ?? Date.now;
  let busy = false, lastAttempt: V1Attempt | null = null, finalized: Extract<V1Result, { kind: "FINALIZED" }> | null = null;
  const notify = options.notify ?? notifyProtocolV1AttemptChange;
  async function request(url: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([(async () => {
        const response = await fetcher(url, { ...init, cache: "no-store", signal: controller.signal });
        return { status: response.status, body: await readBoundedCheckoutJson(response) };
      })(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new PublicCheckoutClientError()); }, options.timeoutMs ?? 15000);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  async function submit(fresh?: { body: V1Body; kind: "member" | "guest" }): Promise<V1Result> {
    if (busy) throw new PublicCheckoutClientError("此筆結帳正在處理，請稍候。");
    if (finalized) return finalized;
    busy = true;
    try {
      let attempt = readProtocolV1Attempt(storage);
      if (!attempt) {
        if (!fresh) return invalid();
        const snapshot = validateProtocolV1Body(fresh.body);
        if (storage.getItem(CHECKOUT_IDEMPOTENCY_KEY) !== snapshot.idempotencyKey) return invalid();
        const keys = protocolV1StorageKeys(snapshot.idempotencyKey), encoded = JSON.stringify(snapshot);
        if (encoded.length > SNAPSHOT_LIMIT) return invalid();
        const meta: V1Meta = { kind: fresh.kind, dispatchStarted: false, expiresAt: null };
        save(storage, keys.snapshot, encoded); save(storage, keys.meta, JSON.stringify(meta));
        attempt = readProtocolV1Attempt(storage);
        if (!attempt) return invalid();
      }
      if (!attempt.meta.dispatchStarted && fresh && (attempt.meta.kind !== fresh.kind
        || JSON.stringify(attempt.snapshot) !== JSON.stringify(validateProtocolV1Body(fresh.body)))) return invalid();
      const keys = protocolV1StorageKeys(attempt.key);
      if (attempt.meta.kind === "guest" && !attempt.meta.dispatchStarted
        && (!attempt.token || !attempt.meta.expiresAt || Date.parse(attempt.meta.expiresAt) <= now())) {
        const issued = await request("/api/commerce/checkout-attempt", { method: "POST",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: attempt.key }) });
        const r = fields(issued.body, ["attemptAccessToken", "expiresAt", "canonicalAttemptKey"]);
        if (issued.status !== 200 || r.canonicalAttemptKey !== attempt.key
          || typeof r.attemptAccessToken !== "string" || !r.attemptAccessToken || r.attemptAccessToken.length > 4096
          || /[\s\u0000-\u001f\u007f]/u.test(r.attemptAccessToken) || typeof r.expiresAt !== "string"
          || r.expiresAt.length > 40 || !Number.isFinite(Date.parse(r.expiresAt)) || Date.parse(r.expiresAt) <= now()) return invalid();
        save(storage, keys.token, r.attemptAccessToken);
        attempt = { ...attempt, token: r.attemptAccessToken, meta: { ...attempt.meta, expiresAt: r.expiresAt } };
        save(storage, keys.meta, JSON.stringify(attempt.meta));
      }
      attempt = { ...attempt, meta: { ...attempt.meta, dispatchStarted: true } };
      save(storage, keys.meta, JSON.stringify(attempt.meta));
      lastAttempt = attempt; notify(); // Durable browser marker precedes the first network dispatch.
      let response: { status: number; body: unknown };
      try {
        response = await request("/api/orders", { method: "POST", headers: { "Content-Type": "application/json",
          ...(attempt.meta.kind === "guest" && attempt.token ? { "X-KD-Checkout-Attempt-Access": attempt.token } : {}) },
          body: JSON.stringify(attempt.snapshot) });
      } catch { return { kind: "ERROR", status: 0, terminal: false, message: V1_ERROR_COPY[0] }; }
      let result: V1Result;
      try { result = validateProtocolV1Response(response.status, response.body); }
      catch { return { kind: "ERROR", status: 503, terminal: false, message: V1_ERROR_COPY[503] }; }
      if (result.kind === "FINALIZED") finalized = result;
      return result;
    } finally { busy = false; }
  }
  function complete(clearCart: () => void, navigate: (url: string) => void): { url: string; cleanupComplete: boolean } {
    if (!finalized || !lastAttempt) return invalid();
    const attempt = lastAttempt, url = protocolV1CompletionUrl(attempt, finalized.orderNumber);
    try {
      if (attempt.meta.kind === "guest") {
        if (!attempt.token) return invalid();
        save(storage, "kdcoffee-order-access:" + finalized.orderNumber, attempt.token);
      }
      save(storage, "kdcoffee-last-order", JSON.stringify({ orderNumber: finalized.orderNumber, saved: true,
        pending: false, transactionState: "FINALIZED", orderMode: attempt.snapshot.orderMode,
        ...(attempt.snapshot.orderMode === "home_delivery" ? { paymentMethod: attempt.snapshot.paymentMethod } : {}) }));
      const keys = protocolV1StorageKeys(attempt.key);
      for (const key of [keys.snapshot, keys.meta, keys.token]) { storage.removeItem(key); if (storage.getItem(key) !== null) return invalid(); }
      storage.removeItem(CHECKOUT_IDEMPOTENCY_KEY);
      if (storage.getItem(CHECKOUT_IDEMPOTENCY_KEY) !== null) return invalid();
      clearCart(); notify(); navigate(url);
      return { url, cleanupComplete: true };
    } catch { return { url, cleanupComplete: false }; }
  }
  return { submit, complete };
}

export type V1OperationalRules = {
  pickup: { earliestStandardDate: string; earliestCustomRoastDate: string; blockedDates: string[] };
  shipping: { homeDeliveryShippingFee: number; homeDeliveryCodFee: number };
  payment: { atmTransfer: { configured: boolean; bankName: string; bankCode: string; branchName: string;
    accountName: string; accountNumber: string; instructions: string; bankbookImageUrl: string | null; showBankbookImageAtCheckout: boolean } };
  openingYearFreeShipping: { enabled: boolean; startDate: string; endDate: string; shippingMethods: string[] };
};
export function validateProtocolV1Rules(raw: unknown): V1OperationalRules {
  if (!isCartRecord(raw) || !isCartRecord(raw.pickup) || !isCartRecord(raw.shipping)
    || !isCartRecord(raw.payment) || !isCartRecord(raw.payment.atmTransfer) || !isCartRecord(raw.openingYearFreeShipping)) return invalid();
  const p = raw.pickup, s = raw.shipping, a = raw.payment.atmTransfer, f = raw.openingYearFreeShipping;
  if (!isValidDateOnly(p.earliestStandardDate) || !isValidDateOnly(p.earliestCustomRoastDate)
    || !Array.isArray(p.blockedDates) || p.blockedDates.length > 1000 || !p.blockedDates.every(isValidDateOnly)
    || typeof a.configured !== "boolean" || typeof a.showBankbookImageAtCheckout !== "boolean"
    || typeof f.enabled !== "boolean" || typeof f.startDate !== "string" || typeof f.endDate !== "string"
    || !Array.isArray(f.shippingMethods) || f.shippingMethods.length > 10
    || !f.shippingMethods.every(value => typeof value === "string" && value.length < 40)
    || (a.bankbookImageUrl !== null && (typeof a.bankbookImageUrl !== "string" || a.bankbookImageUrl.length > 1000))) return invalid();
  const display = (value: unknown): string => {
    if (typeof value !== "string" || value.length > 2000) return invalid(); return value;
  };
  return {
    pickup: { earliestStandardDate: p.earliestStandardDate as string, earliestCustomRoastDate: p.earliestCustomRoastDate as string,
      blockedDates: [...p.blockedDates] as string[] },
    shipping: { homeDeliveryShippingFee: money(s.homeDeliveryShippingFee), homeDeliveryCodFee: money(s.homeDeliveryCodFee) },
    payment: { atmTransfer: { configured: a.configured, bankName: display(a.bankName), bankCode: display(a.bankCode),
      branchName: display(a.branchName), accountName: display(a.accountName), accountNumber: display(a.accountNumber),
      instructions: display(a.instructions), bankbookImageUrl: a.bankbookImageUrl as string | null,
      showBankbookImageAtCheckout: a.showBankbookImageAtCheckout } },
    openingYearFreeShipping: { enabled: f.enabled, startDate: f.startDate, endDate: f.endDate, shippingMethods: [...f.shippingMethods] as string[] },
  };
}
