import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import * as nodeModule from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildProtocolV1Body, serializeProtocolV1Items, validateProtocolV1Body, validateProtocolV1Response,
  getProtocolV1AttemptKey, protocolV1StorageKeys, readProtocolV1Attempt, hasRecoverableProtocolV1Attempt,
  createProtocolV1CheckoutClient, checkStoreCheckoutAvailability, validateProtocolV1Auth, validateProtocolV1Rules,
  CHECKOUT_IDEMPOTENCY_KEY, type V1Body, type V1Selection, type CheckoutStorage,
} from "../lib/publicCommerceCheckoutClient";
import { cartCheckoutEligibility, coffeeCheckoutItems, cartLineKey, type CoffeeCartItem, type StoreCartItem, type UnifiedCartItem } from "../lib/commerceCart";
import { CURRENT_CART_STORAGE_KEY } from "../lib/commerceCartStorage";
import type { CartContextValue } from "../components/commerce/CartProvider";
import { guestTokenHash, verifyGuestOrderAccessToken } from "../lib/orderConversation";
import { POST as messagePOST } from "../app/api/orders/[orderNumber]/messages/route";
import type { StoredOrder } from "../lib/adminOrders";

let checks = 0, unexpectedNetwork = 0;
async function test(label: string, action: () => unknown | Promise<unknown>) {
  try { await action(); console.log("PASS " + (++checks) + " " + label); }
  catch (error) { console.error("FAIL case " + (checks + 1) + " " + label); throw error; }
}
const K = "550e8400-e29b-41d4-a716-446655440000";
const now = Date.parse("2026-10-15T02:00:00.000Z");
const T1 = "gco1.original-fixture-capability";
const expiresAt = new Date(now + 900000).toISOString();
const store = (extra: Partial<StoreCartItem> = {}): StoreCartItem => ({
  domain: "store", productId: "Store-A", variantId: "default", slug: "store-a", name: "Store A",
  unitPrice: 520, quantity: 1, quantityLimit: 10, ...extra,
});
const coffee = (extra: Partial<CoffeeCartItem> = {}): CoffeeCartItem => ({
  domain: "coffee", productId: "Coffee-A", variantId: "Coffee-SKU", slug: "coffee-a", name: "Coffee A",
  unitPrice: 700, quantity: 1, quantityLimit: 12, optionLabel: "半磅咖啡豆", optionDetail: "227g",
  coffeeOptions: { preparation: "咖啡豆", customRoast: false }, ...extra,
});
const customer = { name: "Fixture", phone: "0912345678", email: "", note: "" };
const address = { recipientName: "Fixture", phone: "0912345678", postalCode: "100", city: "臺北市", district: "中正區", addressLine: "Fixture Road" };
const selections: V1Selection[] = [
  { orderMode: "studio_pickup", customer, studioPickup: { preferredDate: "2026-10-20" } },
  { orderMode: "711_cod", customer, store: { id: "123456", name: "Fixture Store", address: "Fixture Address" } },
  { orderMode: "home_delivery", customer, deliveryAddress: address, paymentMethod: "cash_on_delivery" },
  { orderMode: "home_delivery", customer, deliveryAddress: address, paymentMethod: "atm_transfer" },
];
const body = (items: UnifiedCartItem[] = [store()], index = 0) => buildProtocolV1Body(K, items, selections[index]);
const pending = (saved = true) => ({ orderNumber: "KD20261015-123456", saved, pending: true, retryable: true, transactionState: "PENDING" });
const finalized = () => ({ orderNumber: "KD20261015-123456", saved: true, pending: false, transactionState: "FINALIZED" });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
class MemoryStorage implements CheckoutStorage {
  values = new Map<string, string>(); log: string[] = [];
  failSet: string | null = null; failRemove = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    this.log.push("set:" + key);
    if (key === this.failSet) throw new Error("fixture storage failure");
    this.values.set(key, value);
  }
  removeItem(key: string) { this.log.push("remove:" + key); if (this.failRemove) throw new Error("fixture cleanup failure"); this.values.delete(key); }
}
const freshStorage = () => { const s = new MemoryStorage(); getProtocolV1AttemptKey(s, () => K); return s; };
function persisted(kind: "member" | "guest", dispatched = true, expiry: string | null = expiresAt) {
  const s = freshStorage(), keys = protocolV1StorageKeys(K);
  s.setItem(keys.snapshot, JSON.stringify(body()));
  s.setItem(keys.meta, JSON.stringify({ kind, dispatchStarted: dispatched, expiresAt: kind === "guest" ? expiry : null }));
  if (kind === "guest") s.setItem(keys.token, T1);
  return s;
}
type Call = { url: string; init: RequestInit };
function fakeTransport(storage: MemoryStorage, kind: "member" | "guest", result = finalized(), status = 200) {
  const calls: Call[] = [];
  const fetcher: typeof fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === "/api/commerce/checkout-attempt") return json({ attemptAccessToken: T1, expiresAt, canonicalAttemptKey: K });
    assert.equal(String(url), "/api/orders");
    assert.equal(readProtocolV1Attempt(storage)?.meta.dispatchStarted, true);
    assert.deepEqual(JSON.parse(String(init.body)), readProtocolV1Attempt(storage)?.snapshot);
    const headers = new Headers(init.headers);
    assert.equal(headers.get("X-KD-Checkout-Attempt-Access"), kind === "guest" ? T1 : null);
    assert.equal(headers.get("Cookie"), null);
    assert.ok(!String(init.body).includes(T1)); assert.ok(!String(url).includes(T1));
    return json(result, status);
  };
  return { calls, fetcher };
}
const operationalRules = {
  pickup: { earliestStandardDate: "2026-10-15", earliestCustomRoastDate: "2026-10-18", blockedDates: [] },
  shipping: { homeDeliveryShippingFee: 100, homeDeliveryCodFee: 30 },
  payment: { atmTransfer: { configured: true, bankName: "Fixture Bank", bankCode: "999", branchName: "Fixture Branch",
    accountName: "Fixture", accountNumber: "123456789", instructions: "", bankbookImageUrl: null, showBankbookImageAtCheckout: false } },
  openingYearFreeShipping: { enabled: false, startDate: "", endDate: "", shippingMethods: [] },
};
const originalFetch = globalThis.fetch;
const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const oldSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
const envKeys = ["KD_DATA_DIR", "RAILWAY_VOLUME_MOUNT_PATH", "AUTH_SESSION_SECRET", "MEMBER_IDENTITY_SECRET",
  "LINE_INTERNAL_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_ACCESS_TOKEN", "LINE_INTERNAL_RECIPIENT_ID", "LINE_ORDER_RECIPIENT_ID"];
const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const suite = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f5c2c2c3-"));
const realTemp = await fs.realpath(os.tmpdir());
assert.equal(path.dirname(await fs.realpath(suite)).toLowerCase(), realTemp.toLowerCase());
process.env.KD_DATA_DIR = suite; delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.AUTH_SESSION_SECRET = "isolated-c3-auth-secret-more-than-thirty-two-bytes";
process.env.MEMBER_IDENTITY_SECRET = process.env.AUTH_SESSION_SECRET;
for (const key of envKeys.filter(key => key.startsWith("LINE_"))) delete process.env[key];
const networkForbidden: typeof fetch = async () => { unexpectedNetwork++; throw new Error("Network forbidden"); };
globalThis.fetch = networkForbidden;

type Slot = { value: any; deps?: readonly unknown[]; cleanup?: () => void };
class HookRun {
  slots: Slot[] = []; cursor = 0; effects: (() => void)[] = [];
  begin() { this.cursor = 0; }
  state(initial: any) {
    const index = this.cursor++;
    if (!this.slots[index]) this.slots[index] = { value: typeof initial === "function" ? initial() : initial };
    return [this.slots[index].value, (next: any) => { this.slots[index].value = typeof next === "function" ? next(this.slots[index].value) : next; }];
  }
  ref(initial: unknown) { const index = this.cursor++; if (!this.slots[index]) this.slots[index] = { value: { current: initial } }; return this.slots[index].value; }
  memo(operation: () => unknown, deps: readonly unknown[]) {
    const index = this.cursor++, old = this.slots[index];
    if (!old || old.deps?.length !== deps.length || !deps.every((v, i) => Object.is(v, old.deps?.[i]))) this.slots[index] = { value: operation(), deps };
    return this.slots[index].value;
  }
  effect(operation: () => void | (() => void), deps: readonly unknown[]) {
    const index = this.cursor++, old = this.slots[index];
    if (old && old.deps?.length === deps.length && deps.every((v, i) => Object.is(v, old.deps?.[i]))) return;
    const slot: { value: null; deps: readonly unknown[]; cleanup?: void | (() => void); } = this.slots[index] = { value: null, deps };
    this.effects.push(() => { old?.cleanup?.(); const cleanup = operation(); if (cleanup) slot.cleanup = cleanup; });
  }
  flush() { this.effects.splice(0).forEach(operation => operation()); }
  unmount() { this.slots.forEach(slot => slot.cleanup?.()); }
}
let hooks = new HookRun(), context: CartContextValue;
const navigate: string[] = [];
const globals = globalThis as any;
globals.__c3Hooks = {
  useState: (v: unknown) => hooks.state(v), useRef: (v: unknown) => hooks.ref(v),
  useMemo: (fn: () => unknown, deps: readonly unknown[]) => hooks.memo(fn, deps),
  useCallback: (fn: () => unknown, deps: readonly unknown[]) => hooks.memo(() => fn, deps),
  useEffect: (fn: () => void | (() => void), deps: readonly unknown[]) => hooks.effect(fn, deps),
  useContext: () => context,
};
globals.__c3Navigate = (url: string) => navigate.push(url);
const { registerHooks } = nodeModule as any;
const reactURL = pathToFileURL(path.resolve("node_modules/react/index.js")).href;
const hookModule = "export * from " + JSON.stringify(reactURL) + ";"
  + ["useState", "useRef", "useMemo", "useCallback", "useEffect", "useContext"]
    .map(name => "export const " + name + "=(...args)=>globalThis.__c3Hooks." + name + "(...args);").join("");
const parents = ["/components/commerce/CartProvider.tsx", "/components/commerce/ProtocolV1Checkout.tsx",
  "/components/orders/OrderConversation.tsx", "/app/checkout/page.tsx", "/app/cart/page.tsx"];
const registration = registerHooks({
  resolve(specifier: string, resolveContext: { parentURL?: string }, next: any) {
    if (specifier === "react" && parents.some(file => resolveContext.parentURL?.endsWith(file))) {
      return { url: "data:text/javascript," + encodeURIComponent(hookModule), shortCircuit: true };
    }
    if (specifier === "next/navigation") return { url: "data:text/javascript," + encodeURIComponent(
      "export function usePathname(){return '/checkout';}export function useSearchParams(){return new URLSearchParams();}export function useRouter(){return {push:(url)=>globalThis.__c3Navigate(url),replace(){},refresh(){}};}"), shortCircuit: true };
    if (specifier === "@/components/member/MemberCenterCopyProvider" && resolveContext.parentURL?.endsWith("/OrderConversation.tsx")) {
      return { url: "data:text/javascript,export function useMemberCopyKey(){return ()=> 'Fixture copy';}export function MemberCopyText(){return null;}", shortCircuit: true };
    }
    return next(specifier, resolveContext);
  },
});
const moduleURL = (file: string) => pathToFileURL(path.resolve(file)).href;
const { CartProvider } = await import(moduleURL("components/commerce/CartProvider.tsx"));
const { default: Boundary } = await import(moduleURL("components/commerce/CommerceCheckoutBoundary.tsx"));
const { default: CheckoutPage } = await import(moduleURL("app/checkout/page.tsx"));
const { default: V1Checkout } = await import(moduleURL("components/commerce/ProtocolV1Checkout.tsx"));
const { default: Conversation } = await import(moduleURL("components/orders/OrderConversation.tsx"));
const { default: CartPage } = await import(moduleURL("app/cart/page.tsx"));
let session = new MemoryStorage(), local = new MemoryStorage(), providerHooks = new HookRun();
function installBrowser() {
  const browser = Object.assign(new EventTarget(), { sessionStorage: session, localStorage: local,
    location: { hash: "", pathname: "/checkout" }, requestAnimationFrame: () => 0 });
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: session });
}
function renderProvider() {
  hooks = providerHooks; hooks.begin();
  context = (CartProvider({ children: null }) as React.ReactElement<{ value: CartContextValue }>).props.value;
  return context;
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function settleProvider() {
  for (let i = 0; i < 5; i++) { renderProvider(); providerHooks.flush(); await tick(); }
  return renderProvider();
}
async function bootProvider(items: UnifiedCartItem[], fetcher: typeof fetch, recovery = false) {
  providerHooks.unmount(); providerHooks = new HookRun(); session = recovery ? persisted("guest") : new MemoryStorage(); local = new MemoryStorage();
  local.setItem(CURRENT_CART_STORAGE_KEY, JSON.stringify({ version: 16, items, migration: { completed: true, unresolved: [], notices: [] } }));
  installBrowser(); globalThis.fetch = fetcher; await settleProvider();
}
const offer = (extra: Record<string, unknown> = {}) => ({ domain: "store", productId: "Store-A", variantId: "default",
  slug: "store-a", name: "Store A", unitPrice: 520, quantityLimit: 10, ...extra });
type Element = React.ReactElement<Record<string, any>>;
function elements(tree: unknown): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!React.isValidElement(tree)) return [];
  const e = tree as Element; return [e, ...elements(e.props.children)];
}
function find(tree: unknown, predicate: (e: Element) => boolean): Element {
  const result = elements(tree).find(predicate); assert.ok(result, "UI control missing"); return result;
}
function renderComponent(component: () => unknown, run: HookRun) { hooks = run; hooks.begin(); return component(); }
const source = await fs.readFile("app/checkout/page.tsx", "utf8");
const head = execFileSync("git", ["cat-file", "--filters", "HEAD:app/checkout/page.tsx"], { encoding: "utf8" });
const providerSource = await fs.readFile("components/commerce/CartProvider.tsx", "utf8");
const v1Source = await fs.readFile("components/commerce/ProtocolV1Checkout.tsx", "utf8");
const helperSource = await fs.readFile("lib/publicCommerceCheckoutClient.ts", "utf8");
try {
  await test("CoffeeCheckout is byte-identical to committed legacy function", () => {
    assert.equal(source.slice(source.indexOf("function CoffeeCheckout()")), head.slice(head.indexOf("function CoffeeCheckout()")));
    assert.match(source, /getCoffeeCheckoutItems\(\)/); assert.match(source, /CreditHelpDialog/); assert.match(source, /subscriptionIntent: member && joinSubscription/);
  });
  await test("Coffee serializer remains domain-free with unchanged selection shape", () => {
    const projected = coffeeCheckoutItems([coffee()]);
    assert.equal(Object.hasOwn(projected[0], "domain"), false);
    assert.match(source, /items\.map\(\(\{ slug, optionId, optionLabel, unitPrice, preparationLabel, customRoast, roastLevel, roastNote, quantity \}\)/);
    const legacy = source.slice(source.indexOf("function CoffeeCheckout()")); assert.ok(!legacy.includes("checkout-attempt")); assert.ok(!legacy.includes("buildProtocolV1Body"));
  });
  await test("C3A maintained test remains at approved SHA", async () => {
    assert.equal(createHash("sha256").update(await fs.readFile("scripts/test-phase-j6f5c2c2c2-public-dispatch.mts")).digest("hex"),
      "c5d550670c39f86c4b8e400c5c82fe2ca1884f10c8a61e63d0a61071843532f5");
  });
  await test("Coffee-only provider performs zero Store or V1 requests", async () => {
    let calls = 0; await bootProvider([coffee()], async () => { calls++; return json({}); });
    assert.equal(calls, 0); assert.equal(context.checkoutEligibility, "ELIGIBLE"); assert.equal(context.storeCheckoutAvailability, "NOT_REQUIRED");
    const tree = CheckoutPage() as Element; const child = tree.props.children as Element;
    assert.equal((child.type as () => Element)().type instanceof Function, true);
    assert.equal(((child.type as () => Element)().type as Function).name, "CoffeeCheckout");
  });
  for (const mixed of [false, true]) await test("Store family routes before Coffee projection: mixed=" + mixed, async () => {
    await bootProvider(mixed ? [coffee(), store()] : [store()], async () => json(offer()));
    const tree = CheckoutPage() as Element, flow = tree.props.children as Element;
    assert.equal((flow.type as () => Element)().type, V1Checkout);
    assert.equal(context.checkoutEligibility, "ELIGIBLE"); assert.throws(() => context.getCoffeeCheckoutItems());
  });
  for (const mixed of [false, true]) for (const kind of ["member", "guest"] as const) for (let mode = 0; mode < selections.length; mode++) {
    await test("exact fresh request " + kind + " mixed=" + mixed + " mode=" + mode, async () => {
      const storage = freshStorage(), expected = body(mixed ? [coffee(), store()] : [store()], mode);
      const transport = fakeTransport(storage, kind), client = createProtocolV1CheckoutClient(storage, { fetcher: transport.fetcher, now: () => now, notify() {} });
      assert.equal((await client.submit({ body: expected, kind })).kind, "FINALIZED");
      assert.equal(expected.requestedCredit, 0);
      for (const key of ["corporateGift", "subscriptionIntent", "creditApplied", "memberId", "owner", "ownerBinding", "tokenHash", "fingerprint", "transactionId", "attemptAccessToken"]) assert.ok(!Object.hasOwn(expected, key));
      const extras = mode === 0 ? ["studioPickup"] : mode === 1 ? ["store"] : ["deliveryAddress", "paymentMethod"];
      assert.deepEqual(Object.keys(expected).sort(), ["idempotencyKey", "orderMode", "customer", "items", "requestedCredit", ...extras].sort());
      assert.equal(transport.calls.length, kind === "guest" ? 2 : 1);
      if (kind === "guest") {
        assert.deepEqual(JSON.parse(String(transport.calls[0].init.body)), { idempotencyKey: K });
        assert.ok(!storage.getItem(protocolV1StorageKeys(K).snapshot)!.includes(T1));
        assert.equal(storage.getItem(protocolV1StorageKeys(K).token), T1);
      }
    });
  }
  await test("item serializer preserves IDs, occurrences, quotes and distinct Coffee options", () => {
    const lines = [store(), store({ unitPrice: 530 }), coffee(), coffee({ coffeeOptions: { preparation: "咖啡粉", customRoast: false } })];
    const serialized = serializeProtocolV1Items(lines);
    assert.equal(serialized.length, 4); assert.deepEqual(serialized.map(l => l.quotedUnitPrice), [520, 530, 700, 700]);
    assert.deepEqual(serialized.map(l => l.productId), ["Store-A", "Store-A", "Coffee-A", "Coffee-A"]);
    assert.deepEqual(Object.keys(serialized[0]).sort(), ["domain", "productId", "variantId", "quantity", "quotedUnitPrice"].sort());
    assert.deepEqual(Object.keys(serialized[2]).sort(), ["domain", "productId", "variantId", "quantity", "quotedUnitPrice", "coffeeOptions"].sort());
    assert.equal(serialized[2].coffeeOptions?.preparation, "咖啡豆"); assert.equal(serialized[3].coffeeOptions?.preparation, "咖啡粉");
  });
  for (const patch of [{ quantity: 0 }, { quantity: 1.5 }, { quantity: 100 }, { unitPrice: -1 }, { unitPrice: 1.5 }, { variantId: "DEFAULT" }]) {
    await test("reject invalid V1 line " + JSON.stringify(patch), () => assert.throws(() => serializeProtocolV1Items([store(patch as any)])));
  }
  for (const patch of [{ name: "" }, { name: "a".repeat(21) }, { phone: "123" }, { email: "bad" }, { note: "a".repeat(201) }]) {
    await test("customer bound rejects " + Object.keys(patch)[0], () => assert.throws(() => buildProtocolV1Body(K, [store()], { ...selections[0], customer: { ...customer, ...patch } })));
  }
  await test("snapshot rejects extra/null legacy and server authority fields", () => {
    for (const field of ["subscriptionIntent", "corporateGift", "payment", "creditApplied", "owner", "tokenHash", "transactionId"]) assert.throws(() => validateProtocolV1Body({ ...body(), [field]: null }));
    assert.throws(() => validateProtocolV1Body({ ...body(), store: null }));
    assert.throws(() => validateProtocolV1Body({ ...body(), requestedCredit: 1 }));
    assert.throws(() => serializeProtocolV1Items([coffee()]));
  });
  await test("guest canonical key mismatch never dispatches orders", async () => {
    const storage = freshStorage(), calls: string[] = [];
    const client = createProtocolV1CheckoutClient(storage, { now: () => now, notify() {}, fetcher: async url => {
      calls.push(String(url)); return json({ attemptAccessToken: T1, expiresAt, canonicalAttemptKey: randomUUID() });
    } });
    await assert.rejects(client.submit({ body: body(), kind: "guest" })); assert.deepEqual(calls, ["/api/commerce/checkout-attempt"]);
    assert.equal(readProtocolV1Attempt(storage)?.meta.dispatchStarted, false);
  });
  await test("same K expired guest credential can reissue only before first dispatch", async () => {
    const storage = persisted("guest", false, new Date(now - 1).toISOString()), transport = fakeTransport(storage, "guest");
    assert.equal((await createProtocolV1CheckoutClient(storage, { now: () => now, fetcher: transport.fetcher, notify() {} }).submit()).kind, "FINALIZED");
    assert.equal(transport.calls[0].url, "/api/commerce/checkout-attempt");
    assert.equal(JSON.parse(String(transport.calls[0].init.body)).idempotencyKey, K);
  });
  for (const saved of [true, false]) await test("202 retains K/T1/cart and immutable snapshot saved=" + saved, async () => {
    const storage = freshStorage(), calls: string[] = [], sent: string[] = [], tokens: (string | null)[] = [];
    const client = createProtocolV1CheckoutClient(storage, { now: () => now, notify() {}, fetcher: async (url, init = {}) => {
      calls.push(String(url));
      if (String(url).endsWith("checkout-attempt")) return json({ attemptAccessToken: T1, expiresAt, canonicalAttemptKey: K });
      sent.push(String(init.body)); tokens.push(new Headers(init.headers).get("X-KD-Checkout-Attempt-Access")); return json(pending(saved), 202);
    } });
    const initial = body(); assert.equal((await client.submit({ body: initial, kind: "guest" })).kind, "PENDING");
    const snapshot = storage.getItem(protocolV1StorageKeys(K).snapshot);
    const changed = body([store({ quantity: 3, unitPrice: 999 })]);
    assert.equal((await client.submit({ body: changed, kind: "member" })).kind, "PENDING");
    assert.deepEqual(tokens, [T1, T1]); assert.equal(sent[0], sent[1]); assert.equal(storage.getItem(protocolV1StorageKeys(K).snapshot), snapshot);
    assert.equal(storage.getItem(CHECKOUT_IDEMPOTENCY_KEY), K); assert.equal(storage.getItem(protocolV1StorageKeys(K).token), T1);
    assert.equal(calls.filter(u => u.endsWith("checkout-attempt")).length, 1);
    let cleared = false; assert.throws(() => client.complete(() => { cleared = true; }, () => {})); assert.equal(cleared, false);
  });
  await test("401 after dispatch retains original T1 with no repeated issuance", async () => {
    const storage = freshStorage(), calls: string[] = [];
    const client = createProtocolV1CheckoutClient(storage, { now: () => now, notify() {}, fetcher: async (url, init = {}) => {
      calls.push(String(url));
      if (String(url).endsWith("checkout-attempt")) return json({ attemptAccessToken: T1, expiresAt, canonicalAttemptKey: K });
      assert.equal(new Headers(init.headers).get("X-KD-Checkout-Attempt-Access"), T1);
      return json({ error: "請重新取得結帳授權後再試。" }, 401);
    } });
    assert.equal((await client.submit({ body: body(), kind: "guest" })).kind, "ERROR"); await client.submit();
    assert.equal(calls.filter(u => u.endsWith("checkout-attempt")).length, 1); assert.equal(calls.length, 3);
    assert.equal(readProtocolV1Attempt(storage)?.meta.dispatchStarted, true);
  });
  await test("network timeout keeps attempt and never reissues after dispatch", async () => {
    const storage = persisted("guest"), calls: string[] = [];
    const client = createProtocolV1CheckoutClient(storage, { now: () => now, timeoutMs: 20, notify() {}, fetcher: async url => {
      calls.push(String(url)); return new Promise<Response>(() => {});
    } });
    const first = await client.submit(); assert.equal(first.kind, "ERROR"); if (first.kind === "ERROR") assert.equal(first.status, 0);
    await client.submit(); assert.deepEqual(calls, ["/api/orders", "/api/orders"]);
    assert.equal(storage.getItem(protocolV1StorageKeys(K).token), T1); assert.ok(hasRecoverableProtocolV1Attempt(storage));
  });
  await test("storage failure prevents dispatchStarted-before-fetch violation", async () => {
    const storage = persisted("guest", false); storage.failSet = protocolV1StorageKeys(K).meta;
    let calls = 0; const client = createProtocolV1CheckoutClient(storage, { now: () => now, notify() {}, fetcher: async () => { calls++; return json(finalized()); } });
    await assert.rejects(client.submit()); assert.equal(calls, 0);
  });
  await test("double click concurrent dispatch is blocked", async () => {
    const storage = freshStorage(); let resolve!: (r: Response) => void, calls = 0;
    const client = createProtocolV1CheckoutClient(storage, { notify() {}, fetcher: async () => { calls++; return new Promise<Response>(done => { resolve = done; }); } });
    const first = client.submit({ body: body(), kind: "member" }); await assert.rejects(client.submit());
    resolve(json(pending(), 202)); await first; assert.equal(calls, 1);
  });
  await test("reload expired guest recovery uses original credential without issuance", async () => {
    const storage = persisted("guest", true, new Date(now - 900000).toISOString()), transport = fakeTransport(storage, "guest");
    await createProtocolV1CheckoutClient(storage, { now: () => now, fetcher: transport.fetcher, notify() {} }).submit();
    assert.deepEqual(transport.calls.map(c => c.url), ["/api/orders"]);
  });
  await test("recoverable browser state requires K correlation, bounded snapshot and dispatch marker", () => {
    const storage = persisted("guest"); assert.equal(hasRecoverableProtocolV1Attempt(storage), true);
    const keys = protocolV1StorageKeys(K), original = storage.getItem(keys.snapshot)!;
    storage.setItem(keys.snapshot, JSON.stringify({ ...body(), idempotencyKey: randomUUID() })); assert.equal(hasRecoverableProtocolV1Attempt(storage), false);
    storage.setItem(keys.snapshot, "x".repeat(64001)); assert.equal(hasRecoverableProtocolV1Attempt(storage), false);
    storage.setItem(keys.snapshot, original); storage.setItem(keys.meta, JSON.stringify({ kind: "guest", dispatchStarted: false, expiresAt }));
    assert.equal(hasRecoverableProtocolV1Attempt(storage), false);
  });
  for (const kind of ["guest", "member"] as const) await test("FINALIZED local ordering and completion compatibility " + kind, async () => {
    const storage = freshStorage(), transport = fakeTransport(storage, kind), client = createProtocolV1CheckoutClient(storage, { now: () => now, fetcher: transport.fetcher, notify() {} });
    await client.submit({ body: body([store()], 3), kind }); storage.log.length = 0;
    const done = client.complete(() => storage.log.push("clearCart"), url => storage.log.push("navigate:" + url));
    assert.equal(done.cleanupComplete, true);
    const index = (name: string) => storage.log.findIndex(row => row === name);
    if (kind === "guest") {
      assert.ok(index("set:kdcoffee-order-access:KD20261015-123456") < index("set:kdcoffee-last-order"));
      assert.equal(storage.getItem("kdcoffee-order-access:KD20261015-123456"), T1);
    } else assert.equal(storage.getItem("kdcoffee-order-access:KD20261015-123456"), null);
    assert.ok(index("set:kdcoffee-last-order") < index("remove:" + protocolV1StorageKeys(K).snapshot));
    assert.ok(index("remove:" + protocolV1StorageKeys(K).token) < index("remove:" + CHECKOUT_IDEMPOTENCY_KEY));
    assert.ok(index("remove:" + CHECKOUT_IDEMPOTENCY_KEY) < index("clearCart"));
    assert.ok(storage.log.at(-1)!.startsWith("navigate:"));
    const url = new URL(done.url, "https://isolated.test"); assert.equal(url.searchParams.get("line"), null);
    assert.equal(url.searchParams.get("payment"), "atm_transfer"); assert.ok(!url.search.includes(T1));
    assert.equal(new URLSearchParams(url.hash.slice(1)).get("token"), kind === "guest" ? T1 : null);
    const completion = JSON.parse(storage.getItem("kdcoffee-last-order")!);
    for (const key of ["lineNotification", "warning", "orderAccessToken", "credit", "idempotentReplay"]) assert.equal(Object.hasOwn(completion, key), false);
    const before = transport.calls.length; await client.submit(); assert.equal(transport.calls.length, before);
  });
  for (const failure of ["access", "completion", "remove", "cart"]) await test("FINALIZED " + failure + " cleanup failure never re-dispatches", async () => {
    const storage = freshStorage(), transport = fakeTransport(storage, "guest"), client = createProtocolV1CheckoutClient(storage, { now: () => now, fetcher: transport.fetcher, notify() {} });
    await client.submit({ body: body(), kind: "guest" });
    if (failure === "access") storage.failSet = "kdcoffee-order-access:KD20261015-123456";
    if (failure === "completion") storage.failSet = "kdcoffee-last-order";
    if (failure === "remove") storage.failRemove = true;
    const done = client.complete(() => { if (failure === "cart") throw new Error("fixture"); }, () => {});
    assert.equal(done.cleanupComplete, false); assert.ok(done.url.includes("#token="));
    const before = transport.calls.length; assert.equal((await client.submit()).kind, "FINALIZED"); assert.equal(transport.calls.length, before);
  });
  for (const status of [400, 401, 403, 409, 503]) await test("bounded public error mapping " + status, () => {
    const errors: Record<number, string> = { 400: "結帳資料無效，請確認後再試。", 401: "請重新取得結帳授權後再試。", 403: "目前無法使用此結帳授權。",
      409: "結帳資料或商品狀態已變更，請確認後再試。", 503: "結帳服務暫時無法使用，請稍後再試。" };
    assert.equal(validateProtocolV1Response(status, { error: errors[status] }).kind, "ERROR");
    assert.throws(() => validateProtocolV1Response(status, { error: "secret stack", owner: "private" }));
  });
  await test("strict success/PENDING/terminal response shapes reject internals", () => {
    assert.throws(() => validateProtocolV1Response(200, { ...finalized(), tokenHash: "secret" }));
    assert.throws(() => validateProtocolV1Response(202, { ...pending(), retryable: false }));
    assert.throws(() => validateProtocolV1Response(200, { ...finalized(), saved: false }));
    assert.equal(validateProtocolV1Response(409, { error: "結帳資料或商品狀態已變更，請確認後再試。", retryable: false, transactionState: "ABORTED" }).kind, "ERROR");
    assert.equal(validateProtocolV1Response(503, { error: "結帳服務暫時無法使用，請稍後再試。", retryable: false, transactionState: "REVIEW_REQUIRED" }).kind, "ERROR");
  });

  await test("offer checks are deduplicated by slug without changing quotes", async () => {
    let calls = 0;
    const items = [store(), store({ quantity: 2 })], before = JSON.stringify(items);
    const available = await checkStoreCheckoutAvailability(items, async (url, init) => {
      calls++; assert.equal(String(url), "/api/commerce/store/offer"); assert.deepEqual(JSON.parse(String(init?.body)), { slug: "store-a" }); return json(offer());
    }, new AbortController().signal);
    assert.equal(available, "AVAILABLE"); assert.equal(calls, 1); assert.equal(JSON.stringify(items), before);
  });
  for (const status of [403, 404, 409, 500]) await test("offer HTTP " + status + " fails closed", async () => {
    assert.equal(await checkStoreCheckoutAvailability([store()], async () => json({ code: "unavailable" }, status), new AbortController().signal), "UNAVAILABLE");
  });
  for (const [label, patch] of [
    ["product identity", { productId: "another" }], ["domain", { domain: "coffee" }], ["variant", { variantId: "other" }],
    ["slug", { slug: "other" }], ["price", { unitPrice: 999 }], ["quantity", { quantityLimit: 1 }],
    ["private fields", { owner: "private" }], ["invalid price", { unitPrice: "520" }],
  ] as const) await test("offer " + label + " mismatch fails closed", async () => {
    const original = [store({ quantity: 2 })], frozen = JSON.stringify(original);
    assert.equal(await checkStoreCheckoutAvailability(original, async () => json(offer(patch)), new AbortController().signal), "UNAVAILABLE");
    assert.equal(JSON.stringify(original), frozen);
  });
  await test("offer total run timeout is bounded with no retry", async () => {
    let calls = 0, aborted = false;
    const available = await checkStoreCheckoutAvailability([store()], async (_url, init) => {
      calls++; init?.signal?.addEventListener("abort", () => { aborted = true; }); return new Promise<Response>(() => {});
    }, new AbortController().signal, 20);
    assert.equal(available, "UNAVAILABLE"); assert.equal(calls, 1); assert.equal(aborted, true);
  });
  await test("offer superseded request aborts and never becomes AVAILABLE", async () => {
    const controller = new AbortController(); controller.abort();
    let calls = 0;
    assert.equal(await checkStoreCheckoutAvailability([store()], async () => { calls++; return json(offer()); }, controller.signal), "UNAVAILABLE");
    assert.equal(calls, 0);
  });
  await test("provider checks one slug once per stable signature, no polling", async () => {
    let calls = 0; await bootProvider([store()], async () => { calls++; return json(offer()); });
    const before = calls; await settleProvider(); assert.equal(calls, before); assert.equal(calls, 1);
    const snapshot = context.getProtocolV1CheckoutItems(); assert.deepEqual(snapshot, [store()]);
    snapshot[0].quantity = 4; assert.equal(context.items[0].quantity, 1);
  });
  await test("provider accessor uses current ref and invalidates stale AVAILABLE signature", async () => {
    await bootProvider([store()], async () => json(offer()));
    const oldGetter = context.getProtocolV1CheckoutItems;
    context.updateQuantity(cartLineKey(store()), 2);
    assert.throws(() => oldGetter()); await settleProvider();
    assert.equal(context.getProtocolV1CheckoutItems()[0].quantity, 2);
  });
  await test("Store disabled blocks fresh mount and state-aware cart links", async () => {
    await bootProvider([store()], async () => json({ code: "STORE_COMMERCE_DISABLED" }, 403));
    assert.equal(context.storeCheckoutAvailability, "UNAVAILABLE"); assert.equal(context.checkoutEligibility, "STORE_CHECKOUT_NOT_ENABLED");
    const marker = React.createElement("form", { "data-fresh": true });
    assert.notEqual((Boundary({ children: marker }) as Element).type, React.Fragment);
    assert.throws(() => context.getProtocolV1CheckoutItems());
    const run = new HookRun(); const tree = renderComponent(CartPage, run);
    assert.ok(!elements(tree).some(e => e.type === "a" && e.props.href === "/checkout"));
  });
  await test("persisted dispatched recovery bypasses disabled fresh availability and never mounts Coffee", async () => {
    await bootProvider([store()], async () => json({ code: "STORE_COMMERCE_DISABLED" }, 403), true);
    assert.equal(context.recoverableProtocolV1Attempt, true); assert.equal(context.storeCheckoutAvailability, "UNAVAILABLE");
    const tree = CheckoutPage() as Element; assert.equal((tree.props.children.type as () => Element)().type, V1Checkout);
    assert.equal((Boundary({ children: tree.props.children }) as Element).type, React.Fragment);
    const html = renderToStaticMarkup(React.createElement(CartPage)); assert.ok(html.includes("繼續確認此筆訂單"));
    assert.ok(!html.includes("訂單已成立"));
  });
  await test("persisted dispatched recovery ignores current empty cart, capability and auth lookup", async () => {
    await bootProvider([], networkForbidden, true);
    assert.equal(context.checkoutEligibility, "EMPTY"); assert.equal(context.recoverableProtocolV1Attempt, true);
    const run = new HookRun();
    renderComponent(V1Checkout, run); run.flush(); await tick();
    const tree = renderComponent(V1Checkout, run);
    assert.ok(find(tree, e => e.type === "button" && e.props.children === "重試同一筆訂單"));
    run.unmount();
  });
  for (const [label, migration, unresolved, warning, expected] of [
    ["pending migration", "PENDING", [], false, "MIGRATION_PENDING"],
    ["failed migration", "FAILED", [], false, "MIGRATION_FAILED"],
    ["unresolved", "READY", [{ sourceIndex: 0, reason: "SKU_NOT_FOUND" }], false, "UNRESOLVED_LEGACY_ITEMS"],
    ["persistence", "READY", [], true, "PERSISTENCE_FAILED"],
  ] as const) await test("fresh guard retained: " + label, () => {
    assert.equal(cartCheckoutEligibility([store()], migration, unresolved, warning, "AVAILABLE"), expected);
  });
  await test("empty/checking/disabled/canonical/inventory/roast eligibility retained", () => {
    assert.equal(cartCheckoutEligibility([], "READY", []), "EMPTY");
    assert.equal(cartCheckoutEligibility([store()], "READY", [], false, "CHECKING"), "STORE_CHECKOUT_CHECKING");
    assert.equal(cartCheckoutEligibility([store()], "READY", []), "STORE_CHECKOUT_NOT_ENABLED");
    assert.equal(cartCheckoutEligibility([store({ quantity: 6 }), store({ quantity: 5 })], "READY", [], false, "AVAILABLE"), "CART_UNAVAILABLE");
    assert.equal(cartCheckoutEligibility([{ ...store(), coffeeOptions: {} } as any], "READY", [], false, "AVAILABLE"), "CART_UNAVAILABLE");
    const roasted = coffee({ quantity: 3, coffeeOptions: { customRoast: true, roastLevel: "淺中焙" } });
    assert.equal(cartCheckoutEligibility([store(), roasted], "READY", [], false, "AVAILABLE"), "CART_UNAVAILABLE");
    assert.equal(cartCheckoutEligibility([store(), { ...roasted, quantity: 4 }], "READY", [], false, "AVAILABLE"), "ELIGIBLE");
    assert.equal(cartCheckoutEligibility([store(), { ...roasted, quantity: 4, optionLabel: "耳掛", optionDetail: "10包" }], "READY", [], false, "AVAILABLE"), "CART_UNAVAILABLE");
  });
  await test("auth parser has explicit GUEST, MEMBER and ERROR states", () => {
    assert.deepEqual(validateProtocolV1Auth({ member: null }), { kind: "GUEST" });
    assert.equal(validateProtocolV1Auth({ member: { id: "member-a", displayName: "Fixture" } }).kind, "MEMBER");
    for (const raw of [{}, null, [], { member: "guest" }, { member: {} }]) assert.equal(validateProtocolV1Auth(raw).kind, "ERROR");
    assert.deepEqual(validateProtocolV1Rules(operationalRules), operationalRules);
    assert.throws(() => validateProtocolV1Rules({}));
  });
  await test("V1 auth failure disables fresh submit and does not become Guest", async () => {
    await bootProvider([store()], async () => json(offer()));
    const calls: string[] = []; globalThis.fetch = async url => {
      calls.push(String(url)); return String(url) === "/api/member/me" ? json({}, 503) : json(operationalRules);
    };
    const run = new HookRun();
    renderComponent(V1Checkout, run); run.flush(); await tick(); await tick();
    const tree = renderComponent(V1Checkout, run);
    assert.equal(find(tree, e => e.type === "button" && e.props.type === "submit").props.disabled, true);
    assert.deepEqual(calls.sort(), ["/api/commerce/operational-rules", "/api/member/me"]);
    run.unmount();
  });
  await test("V1 component has no mounted credit or subscription controls/effects", () => {
    for (const forbidden of ["CreditHelp", "credit/quote", "CreditPreference", "subscriptionIntent", "joinSubscription"]) assert.ok(!v1Source.includes(forbidden));
    assert.ok(v1Source.includes('maxLength={200}')); assert.ok(v1Source.includes("商店商品目前採單次訂購"));
    assert.ok(!helperSource.includes("console.")); assert.ok(!helperSource.includes("logger."));
    assert.ok(!providerSource.includes("setInterval")); assert.ok(!providerSource.includes("storeRepository"));
  });
  for (const guest of [true, false]) await test("actual conversation client message header/body guest=" + guest, async () => {
    providerHooks.unmount(); session = new MemoryStorage(); local = new MemoryStorage(); installBrowser();
    if (guest) session.setItem("kdcoffee-order-access:KD20261015-123456", T1);
    const requests: Call[] = [];
    const summary = { orderNumber: "KD20261015-123456", createdAt: "2026-10-15T02:00:00.000Z", status: "new_order", statusLabel: "Fixture",
      orderMode: "studio_pickup", modeLabel: "Fixture", deliveryAddress: null, paymentDetails: null, atmTransferSnapshot: null, atmTransferClaims: [],
      cancellation: null, creditReservation: null, financialBreakdown: { subtotal: 520, shipping: 0, codServiceFee: 0, creditApplied: 0, totalBeforeCredit: 520, total: 520 } };
    globalThis.fetch = async (url, init = {}) => {
      requests.push({ url: String(url), init });
      if (init.method === "POST") return json({ message: { id: "message-1", actionId: randomUUID(), createdAt: "2026-10-15T02:00:00.000Z", authorType: "customer", channel: "order_page", message: "Fixture inquiry" } });
      return json({ order: summary, access: guest ? "guest" : "member", messages: [], timeline: [] });
    };
    const run = new HookRun(), render = () => renderComponent(() => Conversation({ orderNumber: "KD20261015-123456" }), run);
    render(); run.flush(); await tick(); await tick();
    let tree = render(); find(tree, e => e.type === "textarea" && e.props.id === "order-question").props.onChange({ target: { value: "Fixture inquiry" } });
    tree = render();
    await find(tree, e => e.type === "form" && e.props.className === "order-conversation-form").props.onSubmit({ preventDefault() {} });
    const post = requests.find(r => r.init.method === "POST")!;
    assert.ok(post); assert.equal(new Headers(post.init.headers).get("X-Order-Access-Token"), guest ? T1 : null);
    assert.deepEqual(Object.keys(JSON.parse(String(post.init.body))).sort(), ["actionId", "message"]);
    assert.ok(!String(post.init.body).includes(T1)); assert.ok(!post.url.includes(T1));
    assert.equal(new Headers(post.init.headers).get("Cookie"), null); run.unmount();
  });
  await test("real messages API header-first, legacy fallback and hash-only persisted access", async () => {
    globalThis.fetch = networkForbidden;
    const orderNumber = "KD20261015-123456"; await fs.mkdir(path.join(suite, "orders"), { recursive: true });
    const file = path.join(suite, "orders", orderNumber + ".json");
    const order = { orderNumber, createdAt: "2026-10-15T02:00:00.000Z", status: "waiting_studio_pickup_confirmation", orderMode: "studio_pickup",
      customer, member: null, guestOrderAccess: { tokenHash: guestTokenHash(T1), createdAt: "2026-10-15T02:00:00.000Z" },
      items: [], subtotal: 520, shipping: 0, total: 520 };
    await fs.writeFile(file, JSON.stringify(order));
    const post = (header?: string, token?: string) => messagePOST(new Request("http://isolated.test/api/orders/" + orderNumber + "/messages", {
      method: "POST", headers: { "Content-Type": "application/json", ...(header ? { "X-Order-Access-Token": header } : {}) },
      body: JSON.stringify({ actionId: randomUUID(), message: "Fixture inquiry", ...(token ? { token } : {}) }),
    }), { params: Promise.resolve({ orderNumber }) });
    assert.equal((await post(T1)).status, 200);
    assert.equal((await post(T1, "wrong-body-token")).status, 200);
    const beforeDenied = await fs.readFile(file);
    assert.equal((await post("wrong-header-token", T1)).status, 404);
    assert.deepEqual(await fs.readFile(file), beforeDenied);
    assert.equal((await post(undefined, T1)).status, 200);
    const stored = await fs.readFile(file, "utf8"); assert.ok(!stored.includes(T1)); assert.ok(!stored.includes("wrong-body-token"));
    assert.equal(verifyGuestOrderAccessToken(JSON.parse(stored) as StoredOrder, T1), true);
  });
  await test("all focused requests remained isolated with zero unexpected network calls", () => assert.equal(unexpectedNetwork, 0));
  console.log("J.6F.5C2C2C3 PASS " + checks + "/" + checks);
} finally {
  providerHooks.unmount(); registration.deregister(); globalThis.fetch = originalFetch;
  delete globals.__c3Hooks; delete globals.__c3Navigate;
  if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else Reflect.deleteProperty(globalThis, "window");
  if (oldSession) Object.defineProperty(globalThis, "sessionStorage", oldSession); else Reflect.deleteProperty(globalThis, "sessionStorage");
  for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  const resolved = await fs.realpath(suite);
  assert.equal(path.dirname(resolved).toLowerCase(), realTemp.toLowerCase()); assert.ok(path.basename(resolved).startsWith("kd-j6f5c2c2c3-"));
  await fs.rm(resolved, { recursive: true, force: true });
}
