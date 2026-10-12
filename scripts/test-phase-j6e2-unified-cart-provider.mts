import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as nodeModule from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  cartLineKey, cartInventoryKey, cartProductHref, coffeeCheckoutItems,
  cartCheckoutEligibility, validateUnifiedCartItem, cartInventoryDemand,
} from "../lib/commerceCart";
import type { CoffeeCartItem, StoreCartItem, UnifiedCartItem } from "../lib/commerceCart";
import { CURRENT_CART_STORAGE_KEY as V16, validateCartEnvelope } from "../lib/commerceCartStorage";
import type { CartEnvelope, CartStorage } from "../lib/commerceCartStorage";
import { resolveLegacyCoffeeCart } from "../lib/commerceCartResolver";
import type { CartContextValue } from "../components/commerce/CartProvider";
import type { CoffeeArtwork } from "../data/websiteData";

// Exercise real provider callbacks with deterministic hook scheduling. Browser storage
// and HTTP are in-memory fixtures; domain validation/resolution is never mocked.
type HookSlot = { value: unknown; deps?: readonly unknown[] };
class HookRun {
  slots: HookSlot[] = []; cursor = 0; effects: (() => void | (() => void))[] = [];
  begin() { this.cursor = 0; }
  state(initial: unknown) {
    const index = this.cursor++;
    if (!this.slots[index]) this.slots[index] = { value: typeof initial === "function" ? initial() : initial };
    return [this.slots[index].value, (next: unknown) => {
      this.slots[index].value = typeof next === "function" ? next(this.slots[index].value) : next;
    }];
  }
  ref(initial: unknown) {
    const index = this.cursor++;
    if (!this.slots[index]) this.slots[index] = { value: { current: initial } };
    return this.slots[index].value;
  }
  memo(factory: () => unknown, deps: readonly unknown[]) {
    const index = this.cursor++;
    const old = this.slots[index];
    if (!old || !deps.every((value, offset) => Object.is(value, old.deps?.[offset]))) {
      this.slots[index] = { value: factory(), deps };
    }
    return this.slots[index].value;
  }
  effect(operation: () => void | (() => void), deps: readonly unknown[]) {
    const index = this.cursor++;
    if (!this.slots[index]) { this.slots[index] = { value: null, deps }; this.effects.push(operation); }
  }
}
let hooks = new HookRun();
let context: CartContextValue;
const navigations: string[] = [];
const globals = globalThis as unknown as {
  __j6e2Hooks?: Record<string, unknown>; __j6e2Navigate?: (destination: string) => void;
};
globals.__j6e2Hooks = {
  useState: (initial: unknown) => hooks.state(initial),
  useRef: (initial: unknown) => hooks.ref(initial),
  useMemo: (factory: () => unknown, deps: readonly unknown[]) => hooks.memo(factory, deps),
  useCallback: (operation: () => unknown, deps: readonly unknown[]) => hooks.memo(() => operation, deps),
  useEffect: (operation: () => void | (() => void), deps: readonly unknown[]) => hooks.effect(operation, deps),
  useContext: () => context,
};
globals.__j6e2Navigate = destination => navigations.push(destination);
type ResolveContext = { parentURL?: string };
type ResolveResult = { url: string; shortCircuit?: boolean };
type ResolveNext = (specifier: string, context: ResolveContext) => ResolveResult;
// Node 24 registerHooks is absent from the project's older Node declaration package.
const { registerHooks } = nodeModule as unknown as {
  registerHooks(options: { resolve: (specifier: string, context: ResolveContext, next: ResolveNext) => ResolveResult }): { deregister(): void };
};
const reactURL = pathToFileURL(path.resolve("node_modules/react/index.js")).href;
const hookModule = "export * from " + JSON.stringify(reactURL) + ";" +
  ["useState", "useRef", "useMemo", "useCallback", "useEffect", "useContext"]
    .map(name => "export const " + name + "=(...args)=>globalThis.__j6e2Hooks." + name + "(...args);").join("");
const providerParents = ["CartProvider.tsx", "AddToCart.tsx", "FloatingCart.tsx"];
const registration = registerHooks({
  resolve(specifier, resolveContext, next) {
    if (specifier === "react" && providerParents.some(file => resolveContext.parentURL?.endsWith("/" + file))) {
      return { url: "data:text/javascript," + encodeURIComponent(hookModule), shortCircuit: true };
    }
    if (specifier === "next/navigation") return { url: "data:text/javascript," + encodeURIComponent(
      "export function usePathname(){return '/works';} export function useRouter(){return {push:(url)=>globalThis.__j6e2Navigate(url)}};"
    ), shortCircuit: true };
    return next(specifier, resolveContext);
  },
});
const moduleURL = (file: string) => pathToFileURL(path.resolve(file)).href;
const { CartProvider } = await import(moduleURL("components/commerce/CartProvider.tsx"));
const { default: CartPage } = await import(moduleURL("app/cart/page.tsx"));
const { default: Boundary } = await import(moduleURL("components/commerce/CommerceCheckoutBoundary.tsx"));
const { default: FloatingCart } = await import(moduleURL("components/commerce/FloatingCart.tsx"));
const { default: AddToCart } = await import(moduleURL("components/commerce/AddToCart.tsx"));
const providerSource = await readFile("components/commerce/CartProvider.tsx", "utf8");
const checkoutSource = await readFile("app/checkout/page.tsx", "utf8");
const storeSource = await readFile("app/store/[slug]/page.tsx", "utf8");
let passed = 0;
async function test(name: string, operation: () => unknown | Promise<unknown>) {
  try { await operation(); console.log("PASS " + String(++passed).padStart(3, "0") + " " + name); }
  catch (error) { console.error("FAIL " + name); throw error; }
}
const coffee = (patch: Partial<CoffeeCartItem> = {}): CoffeeCartItem => ({
  domain: "coffee", productId: "P00001", variantId: "giotto-awakening-01",
  slug: "giotto-awakening", name: "喬托・初醒", unitPrice: 700, quantity: 1, quantityLimit: 12,
  optionLabel: "半磅咖啡豆", optionDetail: "227g",
  coffeeOptions: { preparation: "咖啡豆", customRoast: false }, ...patch,
});
const store = (patch: Partial<StoreCartItem> = {}): StoreCartItem => ({
  domain: "store", productId: "store-dripper", variantId: "default",
  slug: "ceramic-dripper-02", name: "陶瓷錐形濾杯 02", unitPrice: 520, quantity: 1, quantityLimit: 6, ...patch,
});
const envelope = (items: UnifiedCartItem[] = []): CartEnvelope => ({
  version: 16, items, migration: { completed: true, unresolved: [], notices: [] },
});
const legacy = { slug: "giotto-awakening", name: "舊名稱", optionId: "giotto-awakening-01",
  optionLabel: "舊規格", unitPrice: 700, quantity: 1, preparationLabel: "咖啡豆", customRoast: false };
const product: CoffeeArtwork = { id: "P00001", slug: "giotto-awakening", name: "喬托・初醒", active: true,
  artist: "Test Artist", subtitle: "Test Coffee", mood: "Test",
  origin: "Test Origin", process: "Test Process", roast: "Test Roast",
  flavors: [], visualTone: "Test Tone",
  purchasable: true, purchase: [], skus: [
    { id: "giotto-awakening-01", label: "半磅咖啡豆", detail: "227g", price: 700, stock: 12, kind: "beans", enabled: true },
    { id: "giotto-awakening-02", label: "耳掛", detail: "10包", price: 500, stock: 10, kind: "drip", enabled: true },
  ] } satisfies CoffeeArtwork;
class MemoryStorage implements CartStorage {
  values = new Map<string, string>(); log: string[] = [];
  failWrite = false; failRead = false; corruptReadback = false;
  getItem(key: string) {
    this.log.push("read:" + key);
    if (this.failRead) throw new Error("storage read failure");
    if (this.corruptReadback && key === V16 && this.values.has(key)) return "{broken";
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.log.push("write:" + key); if (this.failWrite) throw new Error("quota");
    this.values.set(key, value);
  }
  removeItem(key: string) { this.log.push("remove:" + key); this.values.delete(key); }
}
const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const oldFetch = globalThis.fetch;
let storage = new MemoryStorage();
let providerHooks = new HookRun();
const calls: { url: string; init?: RequestInit }[] = [];
let responseMode: "ok" | "http" | "throw" | "store" | "wrong-source" = "ok";
function renderProvider() {
  hooks = providerHooks; hooks.begin();
  const tree = CartProvider({ children: null }) as React.ReactElement<{ value: CartContextValue }>;
  context = tree.props.value; return context;
}
async function boot(entries: Record<string, string> = {}, configure?: (memory: MemoryStorage) => void, start = true) {
  storage = new MemoryStorage();
  Object.entries(entries).forEach(([key, value]) => storage.values.set(key, value));
  configure?.(storage);
  providerHooks = new HookRun(); calls.length = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: storage, dispatchEvent: () => true, requestAnimationFrame: () => 0,
  } });
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (responseMode === "throw") throw new Error("offline");
    if (responseMode === "http") return new Response("{}", { status: 500 });
    const payload = JSON.parse(String(init?.body)) as { sourceKey: string; items: unknown[] };
    const result = resolveLegacyCoffeeCart(payload.items, [product]);
    const body = { version: 16, sourceKey: responseMode === "wrong-source" ? "kdcoffee-cart-v1" : payload.sourceKey,
      ...result, ...(responseMode === "store" ? { items: [store()] } : {}) };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  renderProvider();
  if (start) {
    providerHooks.effects.forEach(effect => effect());
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  return renderProvider();
}
const currentEntries = (value: CartEnvelope) => ({ [V16]: JSON.stringify(value) });
const legacyEntries = (rows: unknown[] = [legacy]) => ({ "kdcoffee-cart-v15": JSON.stringify(rows) });
const rerender = () => renderProvider();
const htmlCart = () => renderToStaticMarkup(React.createElement(CartPage));
function htmlMini() {
  hooks = new HookRun(); hooks.slots = [{ value: true }, { value: null }, { value: false }];
  hooks.begin(); return renderToStaticMarkup(FloatingCart());
}
function htmlBoundary() {
  let mounts = 0;
  const OldSubmitPath = () => { mounts++; return React.createElement("form", { action: "/api/orders" }, "coffee checkout"); };
  const html = renderToStaticMarkup(React.createElement(Boundary, null, React.createElement(OldSubmitPath)));
  return { html, mounts };
}
type UiElement = React.ReactElement<Record<string, unknown>>;
function elements(tree: unknown): UiElement[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!React.isValidElement(tree)) return [];
  const element = tree as UiElement;
  return [element, ...elements(element.props.children)];
}
function find(tree: unknown, predicate: (element: UiElement) => boolean) {
  const found = elements(tree).find(predicate); assert.ok(found, "UI control missing"); return found;
}
const click = (element: UiElement) => { assert.equal(typeof element.props.onClick, "function"); (element.props.onClick as () => void)(); };
function renderAdd(run: HookRun, target = product) { hooks = run; hooks.begin(); return AddToCart({ product: target }); }
const addButton = (tree: unknown) => find(tree, element => element.props.className === "add-cart-button");
try {
  await test("valid v16 loads canonical coffee directly", async () => { await boot(currentEntries(envelope([coffee()]))); assert.deepEqual(context.items, [coffee()]); assert.equal(context.ready, true); });
  await test("completed v16 skips resolver and retains older legacy source", async () => {
    await boot({ ...legacyEntries(), ...currentEntries(envelope([coffee()])) });
    assert.equal(calls.length, 0); assert.ok(storage.values.has("kdcoffee-cart-v15"));
  });
  await test("completed empty v16 is intentionally empty and never resurrects legacy", async () => {
    await boot({ ...legacyEntries(), ...currentEntries(envelope()) }); assert.equal(context.checkoutEligibility, "EMPTY"); assert.equal(calls.length, 0);
  });
  await test("v15 migration resolves persisted IDs and current copy", async () => {
    await boot(legacyEntries()); assert.equal(context.items[0].productId, "P00001"); assert.equal(context.items[0].variantId, "giotto-awakening-01");
    assert.equal(context.items[0].name, product.name); assert.equal(context.checkoutEligibility, "ELIGIBLE");
  });
  await test("migration calls only the approved coffee resolve endpoint", () => {
    assert.equal(calls[0].url, "/api/commerce/cart/resolve"); assert.equal(calls[0].init?.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { sourceKey: "kdcoffee-cart-v15", items: [legacy] });
  });
  await test("v16 verified readback precedes selected legacy deletion", () => {
    const write = storage.log.indexOf("write:" + V16), removal = storage.log.indexOf("remove:kdcoffee-cart-v15");
    assert.ok(write >= 0 && removal > write + 1); assert.equal(storage.log[write + 1], "read:" + V16);
    assert.equal(validateCartEnvelope(JSON.parse(storage.values.get(V16)!)).migration.completed, true);
  });
  await test("migration cleans only selected source, leaves other keys", async () => {
    await boot({ ...legacyEntries(), "kdcoffee-cart-v13": "[]", unrelated: "preserve" });
    assert.equal(storage.values.get("unrelated"), "preserve"); assert.equal(storage.values.get("kdcoffee-cart-v13"), "[]");
  });
  await test("resolver HTTP failure preserves legacy and blocks checkout", async () => {
    responseMode = "http"; await boot(legacyEntries()); assert.equal(context.migrationState, "FAILED");
    assert.ok(storage.values.has("kdcoffee-cart-v15")); assert.equal(context.checkoutEligibility, "MIGRATION_FAILED");
  });
  await test("failed migration Cart page is recovery, never empty-cart presentation", () => {
    const html = htmlCart(); assert.match(html, /暫時無法完成載入/); assert.match(html, />重試</); assert.doesNotMatch(html, /購物車目前是空的/);
  });
  await test("failed migration FloatingCart remains available with recovery message", () => {
    const html = htmlMini(); assert.match(html, /開啟購物車/); assert.match(html, /暫時無法完成載入/); assert.doesNotMatch(html, /購物車目前是空的/);
  });
  await test("retry after resolver failure succeeds", async () => {
    responseMode = "ok"; await context.retryMigration(); rerender(); assert.equal(context.ready, true); assert.equal(context.items.length, 1);
  });
  await test("network exception preserves legacy", async () => {
    responseMode = "throw"; await boot(legacyEntries()); assert.ok(storage.values.has("kdcoffee-cart-v15")); assert.equal(context.ready, false); responseMode = "ok";
  });
  await test("storage write failure preserves legacy and blocks checkout", async () => {
    await boot(legacyEntries(), memory => { memory.failWrite = true; }); assert.equal(context.migrationState, "FAILED");
    assert.ok(storage.values.has("kdcoffee-cart-v15")); assert.equal(context.ready, false);
  });
  await test("write failure retries cached validated envelope without another API call", async () => {
    const previousCalls = calls.length; storage.failWrite = false; await context.retryMigration(); rerender();
    assert.equal(calls.length, previousCalls); assert.equal(context.checkoutEligibility, "ELIGIBLE"); assert.ok(!storage.values.has("kdcoffee-cart-v15"));
  });
  await test("readback verification failure preserves source", async () => {
    await boot(legacyEntries(), memory => { memory.corruptReadback = true; }); assert.equal(context.migrationState, "FAILED"); assert.ok(storage.values.has("kdcoffee-cart-v15"));
  });
  await test("readback failure retries original canonical result", async () => {
    storage.corruptReadback = false; storage.values.set(V16, JSON.stringify(envelope([store()])));
    await context.retryMigration(); rerender(); assert.equal(context.items[0].domain, "coffee"); assert.equal(context.checkoutEligibility, "ELIGIBLE");
  });
  await test("browser storage read exception fails safely", async () => {
    await boot(legacyEntries(), memory => { memory.failRead = true; }); assert.equal(context.migrationState, "FAILED"); assert.ok(storage.values.has("kdcoffee-cart-v15"));
  });
  await test("corrupt v16 does not silently overwrite or guess legacy", async () => {
    await boot({ ...legacyEntries(), [V16]: "{broken" }); assert.equal(context.migrationState, "FAILED"); assert.equal(storage.values.get(V16), "{broken"); assert.equal(calls.length, 0);
  });
  await test("future v16 version fails closed", async () => {
    await boot({ [V16]: '{"version":17}' }); assert.equal(context.migrationState, "FAILED"); assert.equal(storage.values.get(V16), '{"version":17}');
  });
  await test("resolver response cannot introduce Store into coffee migration", async () => {
    responseMode = "store"; await boot(legacyEntries()); assert.equal(context.migrationState, "FAILED"); assert.ok(storage.values.has("kdcoffee-cart-v15")); responseMode = "ok";
  });
  await test("resolver response source must match selected legacy key", async () => {
    responseMode = "wrong-source"; await boot(legacyEntries()); assert.equal(context.migrationState, "FAILED"); responseMode = "ok";
  });
  await test("unresolved issues persist alongside visible resolved coffee", async () => {
    await boot(legacyEntries([legacy, { ...legacy, slug: "missing" }])); assert.equal(context.items.length, 1); assert.equal(context.unresolved.length, 1);
    assert.equal(context.checkoutEligibility, "UNRESOLVED_LEGACY_ITEMS"); assert.match(htmlCart(), /移除無法辨識的項目/);
  });
  await test("unrelated quantity edit never discards unresolved issues", () => {
    context.updateQuantity(cartLineKey(context.items[0]), 2); rerender();
    assert.equal(context.unresolved.length, 1); assert.equal(validateCartEnvelope(JSON.parse(storage.values.get(V16)!)).migration.unresolved.length, 1);
  });
  await test("unresolved issues survive provider reload", async () => {
    const stored = storage.values.get(V16)!; await boot({ [V16]: stored }); assert.equal(context.unresolved.length, 1); assert.equal(context.checkoutEligibility, "UNRESOLVED_LEGACY_ITEMS");
  });
  await test("explicit discard removes only issues and preserves canonical coffee", () => {
    context.discardUnresolved(); rerender(); assert.equal(context.unresolved.length, 0); assert.equal(context.items[0].quantity, 2); assert.equal(context.checkoutEligibility, "ELIGIBLE");
  });
  await test("PRICE_CHANGED updates snapshot and does not block checkout", async () => {
    await boot(legacyEntries([{ ...legacy, unitPrice: 100 }])); assert.equal(context.items[0].unitPrice, 700); assert.equal(context.notices[0].reason, "PRICE_CHANGED");
    assert.equal(context.checkoutEligibility, "ELIGIBLE"); assert.match(htmlCart(), /部分商品價格已更新/);
  });
  await test("empty hydration creates only verified v16", async () => {
    await boot(); assert.ok(storage.values.has(V16)); assert.equal(context.checkoutEligibility, "EMPTY"); assert.equal(calls.length, 0);
  });
  await test("same canonical coffee add merges quantity", () => {
    assert.equal(context.addItem(coffee(), 2), 2); rerender(); assert.equal(context.addItem(coffee(), 3), 3); rerender();
    assert.equal(context.items.length, 1); assert.equal(context.count, 5); assert.equal(context.subtotal, 3500);
  });
  await test("snapshot name and slug are not line identity", () => {
    assert.equal(context.addItem(coffee({ name: "current name", slug: "current-slug" }), 1), 1); rerender(); assert.equal(context.items.length, 1); assert.equal(context.count, 6);
  });
  await test("different roast notes preserve separate meaningful lines", async () => {
    await boot(); const custom = { preparation: "咖啡豆" as const, customRoast: true, roastLevel: "淺焙" as const };
    assert.equal(context.addItem(coffee({ coffeeOptions: { ...custom, roastNote: "甜感" } }), 4), 4);
    assert.equal(context.addItem(coffee({ coffeeOptions: { ...custom, roastNote: "柔和" } }), 4), 4); rerender();
    assert.equal(context.items.length, 2); assert.equal(new Set(context.items.map(cartLineKey)).size, 2);
  });
  await test("same SKU siblings share add demand and clamp to remaining capacity", () => {
    assert.equal(context.addItem(coffee(), 8), 4); rerender(); assert.equal(context.count, 12);
    assert.equal(context.addItem(coffee(), 1), 0); assert.equal(context.items.length, 3);
  });
  await test("same SKU sibling demand constrains quantity update", () => {
    const key = cartLineKey(context.items[2]); assert.equal(context.updateQuantity(key, 9), true); rerender();
    assert.equal(context.items[2].quantity, 4); assert.equal(cartInventoryDemand(context.items, context.items[0]), 12);
  });
  await test("fractional, zero, negative and unsafe quantities rejected", () => {
    const key = cartLineKey(context.items[0]), before = JSON.stringify(context.items);
    for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 100]) {
      assert.equal(context.addItem(coffee(), invalid), 0); assert.equal(context.updateQuantity(key, invalid), false);
    }
    rerender(); assert.equal(JSON.stringify(context.items), before);
  });
  await test("canonical remove removes only one roast-note line", () => {
    const key = cartLineKey(context.items[0]); context.removeItem(key); rerender();
    assert.equal(context.items.length, 2); assert.ok(context.items.every(item => cartLineKey(item) !== key));
  });
  await test("custom roast edit preserves note when note omitted", () => {
    const item = context.items[0]; assert.equal(context.updateCustomRoast(cartLineKey(item), { enabled: true, roastLevel: "中焙" }), true);
    rerender(); const changed = context.items[0] as CoffeeCartItem; assert.equal(changed.coffeeOptions.roastNote, "柔和"); assert.equal(changed.coffeeOptions.roastLevel, "中焙");
  });
  await test("explicit disabling of custom roast merges matching standard line", () => {
    assert.equal(context.updateCustomRoast(cartLineKey(context.items[0]), { enabled: false }), true); rerender();
    assert.equal(context.items.length, 1); assert.equal(context.items[0].quantity, 8);
    assert.deepEqual((context.items[0] as CoffeeCartItem).coffeeOptions, { preparation: "咖啡豆", customRoast: false });
  });
  await test("enabling custom roast validates selected level and minimum", () => {
    const key = cartLineKey(context.items[0]);
    assert.equal(context.updateCustomRoast(key, { enabled: true, roastLevel: "invalid" }), false);
    assert.equal(context.updateCustomRoast(key, { enabled: true, roastLevel: "淺焙", roastNote: "  甜感  " }), true);
    rerender(); assert.equal((context.items[0] as CoffeeCartItem).coffeeOptions.roastNote, "甜感");
  });
  await test("lower quantity preserves roast note and blocks invalid custom checkout", () => {
    context.updateQuantity(cartLineKey(context.items[0]), 1); rerender();
    assert.equal((context.items[0] as CoffeeCartItem).coffeeOptions.roastNote, "甜感"); assert.equal(context.checkoutEligibility, "CART_UNAVAILABLE");
    assert.match(htmlCart(), /請確認專屬烘焙數量/);
  });
  await test("restoring quantity re-enables valid custom checkout", () => {
    context.updateQuantity(cartLineKey(context.items[0]), 4); rerender(); assert.equal(context.checkoutEligibility, "ELIGIBLE");
  });
  await test("stock zero remains stored unavailable, update never forces one", async () => {
    await boot(currentEntries(envelope([coffee({ quantity: 3, quantityLimit: 0 })])));
    assert.equal(context.updateQuantity(cartLineKey(context.items[0]), 1), false); rerender(); assert.equal(context.items[0].quantity, 3);
    assert.equal(context.checkoutEligibility, "CART_UNAVAILABLE"); assert.match(htmlCart(), /目前無法購買/);
  });
  await test("coffee-only flatten adapter preserves exact legacy request fields", async () => {
    const item = coffee({ quantity: 4, coffeeOptions: { preparation: "咖啡粉", customRoast: true, roastLevel: "中焙", roastNote: "柔和" } });
    await boot(currentEntries(envelope([item])));
    assert.deepEqual(context.getCoffeeCheckoutItems(), [{ slug: item.slug, name: item.name, optionId: item.variantId,
      optionLabel: item.optionLabel, optionDetail: item.optionDetail, preparationLabel: "咖啡粉",
      customRoast: true, roastLevel: "中焙", roastNote: "柔和", unitPrice: 700, quantity: 4, stock: 12 }]);
  });
  await test("Coffee AddToCart actual callback uses persisted product and SKU IDs", async () => {
    await boot(); const run = new HookRun(); click(addButton(renderAdd(run))); rerender();
    assert.equal(context.items[0].productId, product.id); assert.equal(context.items[0].variantId, product.skus![0].id);
    assert.equal(context.items[0].domain, "coffee"); assert.deepEqual((context.items[0] as CoffeeCartItem).coffeeOptions, { preparation: "咖啡豆", customRoast: false });
  });
  await test("Coffee AddToCart missing product ID cannot mutate", async () => {
    await boot(); const run = new HookRun(); const target = { ...product, id: undefined };
    const button = addButton(renderAdd(run, target)); assert.equal(button.props.disabled, true); click(button); rerender(); assert.equal(context.items.length, 0);
  });
  await test("Coffee AddToCart missing SKU ID has no fabricated fallback", async () => {
    await boot(); const run = new HookRun(); const target = { ...product, skus: [{ ...product.skus![0], id: undefined }] };
    const button = addButton(renderAdd(run, target)); assert.equal(button.props.disabled, true); click(button); rerender(); assert.equal(context.items.length, 0);
  });
  await test("Coffee AddToCart drip selection has no preparation or roast fields", async () => {
    await boot(); const run = new HookRun(); let tree = renderAdd(run);
    click(find(tree, element => element.key === "giotto-awakening-02")); tree = renderAdd(run); click(addButton(tree)); rerender();
    assert.equal(context.items[0].variantId, "giotto-awakening-02"); assert.deepEqual((context.items[0] as CoffeeCartItem).coffeeOptions, { customRoast: false });
  });
  await test("Coffee AddToCart quantity/ground/roast handlers preserve selections", async () => {
    await boot(); const run = new HookRun(); let tree = renderAdd(run);
    click(find(tree, element => element.key === "咖啡粉"));
    for (let i = 0; i < 3; i++) { tree = renderAdd(run); click(find(tree, element => element.props["aria-label"] === "增加數量")); }
    tree = renderAdd(run); const toggle = find(tree, element => element.type === "input" && element.props.type === "checkbox");
    (toggle.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    tree = renderAdd(run); const level = find(tree, element => element.type === "input" && element.props.value === "中焙");
    (level.props.onChange as () => void)();
    tree = renderAdd(run); const note = find(tree, element => element.type === "textarea");
    (note.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "甜感明顯" } });
    tree = renderAdd(run); click(addButton(tree)); rerender();
    assert.equal(context.items[0].quantity, 4); assert.deepEqual((context.items[0] as CoffeeCartItem).coffeeOptions,
      { preparation: "咖啡粉", customRoast: true, roastLevel: "中焙", roastNote: "甜感明顯" });
  });
  await test("mixed worked example displays count 4 and subtotal 1520", async () => {
    await boot(currentEntries(envelope([coffee(), store(), store({ productId: "store-paper", slug: "filter-paper-01", name: "01 錐形濾紙 100入", unitPrice: 150, quantity: 2 })])));
    assert.equal(context.count, 4); assert.equal(context.subtotal, 1520); assert.equal(context.checkoutEligibility, "STORE_CHECKOUT_NOT_ENABLED");
    assert.match(htmlCart(), /1,520/); assert.match(htmlMini(), /1,520/);
  });
  await test("mixed v16 stores only bounded snapshots without rewards/catalog/order data", () => {
    const saved = validateCartEnvelope(JSON.parse(storage.values.get(V16)!));
    assert.equal(saved.items.length, 3);
    assert.doesNotMatch(JSON.stringify(saved), /pvValue|kdRedemption|reward|catalog|orderId|customer|manualSeo|revision/);
    assert.throws(() => validateUnifiedCartItem({ ...store(), pvValue: 1 }));
  });
  await test("Store entries contain no coffeeOptions", () => { for (const item of context.items) if (item.domain === "store") assert.equal(Object.hasOwn(item, "coffeeOptions"), false); });
  await test("Store quantity update does not alter coffee", () => {
    const before = JSON.stringify(context.items[0]); context.updateQuantity(cartLineKey(context.items[1]), 2); rerender(); assert.equal(JSON.stringify(context.items[0]), before); assert.equal(context.items[1].quantity, 2);
  });
  await test("Store roast update rejects without attaching coffee options", () => {
    assert.equal(context.updateCustomRoast(cartLineKey(context.items[1]), { enabled: true, roastLevel: "淺焙" }), false); rerender(); assert.equal(Object.hasOwn(context.items[1], "coffeeOptions"), false);
  });
  await test("Store remove does not remove coffee", () => {
    context.removeItem(cartLineKey(context.items[1])); rerender(); assert.equal(context.items[0].domain, "coffee"); assert.equal(context.items.length, 2);
  });
  await test("identical product/SKU strings never collide across domains", async () => {
    const c = coffee({ variantId: "default" }), s = store({ productId: c.productId, slug: c.slug });
    await boot(currentEntries(envelope([c, s]))); assert.notEqual(cartLineKey(c), cartLineKey(s)); assert.notEqual(cartInventoryKey(c), cartInventoryKey(s));
    context.removeItem(cartLineKey(s)); rerender(); assert.deepEqual(context.items, [c]);
  });
  await test("product href is domain-aware and centralized", () => {
    assert.equal(cartProductHref(coffee()), "/works/giotto-awakening"); assert.equal(cartProductHref(store()), "/store/ceramic-dripper-02");
  });
  await test("Store-only Cart renders Store link, neutral copy, no coffee editor", async () => {
    await boot(currentEntries(envelope([store()]))); const html = htmlCart();
    assert.match(html, /href="\/store\/ceramic-dripper-02"/); assert.doesNotMatch(html, /咖啡豆|咖啡粉|專屬烘焙|此規格共.*包|cart-roast-editor|href="\/checkout"/);
  });
  await test("Store-only FloatingCart renders no coffee labels or unit fallback", () => {
    const html = htmlMini(); assert.match(html, /href="\/store\/ceramic-dripper-02"/);
    assert.doesNotMatch(html, /咖啡豆|咖啡粉|專屬烘焙| 包|href="\/checkout"/);
  });
  await test("Store quantity controls retain keyboard button semantics and names", () => {
    assert.match(htmlCart(), /<button type="button" aria-label="增加 陶瓷錐形濾杯 02 數量"/);
    assert.match(htmlMini(), /<button type="button" aria-label="減少 陶瓷錐形濾杯 02 數量"/);
  });
  await test("tampered structurally valid Store snapshot never becomes eligible", async () => {
    await boot(currentEntries(envelope([store({ unitPrice: 0, quantityLimit: 99, name: "server-looking snapshot" })])));
    assert.equal(context.checkoutEligibility, "STORE_CHECKOUT_NOT_ENABLED"); assert.throws(() => context.getCoffeeCheckoutItems());
  });
  await test("coffee-only boundary mounts old checkout child", async () => {
    await boot(currentEntries(envelope([coffee()]))); assert.equal(htmlBoundary().mounts, 1);
  });
  for (const [name, value] of [
    ["Store-only", envelope([store()])], ["mixed", envelope([coffee(), store()])],
    ["unresolved", { ...envelope([coffee()]), migration: { completed: true, unresolved: [{ sourceIndex: 0, reason: "PRODUCT_NOT_FOUND" }], notices: [] } }],
    ["empty", envelope()],
  ] as const) await test(name + " boundary never mounts old order submit child", async () => {
    await boot(currentEntries(validateCartEnvelope(value))); const result = htmlBoundary(); assert.equal(result.mounts, 0); assert.doesNotMatch(result.html, /<form|\/api\/orders/); assert.match(result.html, /href="\/cart"/);
  });
  await test("pending migration boundary blocks with loading instead of empty", async () => {
    await boot(legacyEntries(), undefined, false); assert.equal(context.checkoutEligibility, "MIGRATION_PENDING"); const result = htmlBoundary();
    assert.equal(result.mounts, 0); assert.match(result.html, /role="status"/); assert.doesNotMatch(result.html, /購物車目前是空的/);
  });
  await test("failed migration boundary blocks with retry", async () => {
    responseMode = "http"; await boot(legacyEntries()); const result = htmlBoundary();
    assert.equal(result.mounts, 0); assert.match(result.html, /暫時無法完成載入/); assert.match(result.html, />重試</); responseMode = "ok";
  });
  await test("Store blocker clearly explains integration and offers return to cart", async () => {
    await boot(currentEntries(envelope([coffee(), store()]))); const result = htmlBoundary();
    assert.match(result.html, /商店商品的結帳整合仍在測試中/); assert.match(result.html, /href="\/cart">返回購物車/);
  });
  await test("whole-cart adapter throws for mixed, never filters coffee subset", () => {
    assert.throws(() => coffeeCheckoutItems([coffee(), store()])); assert.throws(() => coffeeCheckoutItems([store()]));
  });
  await test("previous eligible submit accessor rechecks latest state before returning lines", async () => {
    await boot(currentEntries(envelope([coffee()]))); const previousAccessor = context.getCoffeeCheckoutItems;
    context.addItem(store(), 1); assert.throws(() => previousAccessor()); rerender(); assert.equal(context.checkoutEligibility, "STORE_CHECKOUT_NOT_ENABLED");
  });
  await test("checkout wrapper guards before old child hooks and submit exist", () => {
    assert.match(checkoutSource, /return <CommerceCheckoutBoundary><CoffeeCheckout \/><\/CommerceCheckoutBoundary>/);
    assert.match(checkoutSource, /function CoffeeCheckout\(\) \{/);
    assert.match(checkoutSource, /try \{ items = getCoffeeCheckoutItems\(\); \}[\s\S]*catch \{ return setError[\s\S]*fetch\("\/api\/orders"/);
    assert.doesNotMatch(checkoutSource, /unifiedItems\.filter/);
  });
  await test("existing order item request contract is preserved", () => {
    assert.match(checkoutSource, /items\.map\(\(\{ slug, optionId, optionLabel, unitPrice, preparationLabel, customRoast, roastLevel, roastNote, quantity \}\)/);
    assert.doesNotMatch(checkoutSource, /domain:\s*"store"|productId:\s*|variantId:\s*/);
  });
  await test("Immediate Checkout routes mixed cart to confirmation, never adds again", () => {
    navigations.length = 0; const before = JSON.stringify(context.items), run = new HookRun();
    click(find(renderAdd(run), element => element.props.className === "buy-now-button"));
    assert.deepEqual(navigations, ["/cart"]); assert.equal(JSON.stringify(context.items), before);
  });
  await test("Immediate Checkout coffee-only routes to checkout without mutation", async () => {
    await boot(currentEntries(envelope([coffee()]))); navigations.length = 0;
    click(find(renderAdd(new HookRun()), element => element.props.className === "buy-now-button"));
    assert.deepEqual(navigations, ["/checkout"]); assert.equal(context.count, 1);
  });
  await test("persistence failure retains safe in-memory state and warns", async () => {
    await boot(currentEntries(envelope([coffee()]))); storage.failWrite = true; context.updateQuantity(cartLineKey(context.items[0]), 2); rerender();
    assert.equal(context.items[0].quantity, 2); assert.equal(context.persistenceWarning, true); assert.equal(context.checkoutEligibility, "PERSISTENCE_FAILED");
    assert.match(htmlCart(), /重試儲存/); assert.equal(htmlBoundary().mounts, 0);
  });
  await test("persistence retry saves current memory and restores coffee eligibility", async () => {
    storage.failWrite = false; await context.retryMigration(); rerender();
    assert.equal(context.persistenceWarning, false); assert.equal(context.checkoutEligibility, "ELIGIBLE");
    assert.equal(validateCartEnvelope(JSON.parse(storage.values.get(V16)!)).items[0].quantity, 2);
  });
  await test("clearCart clears current items and migration issues/notices only", async () => {
    const value = envelope([coffee()]); value.migration.unresolved = [{ sourceIndex: 1, reason: "PRODUCT_NOT_FOUND" }];
    value.migration.notices = [{ sourceIndex: 0, reason: "PRICE_CHANGED", previousUnitPrice: 100, currentUnitPrice: 700 }];
    await boot({ ...currentEntries(value), unrelated: "keep", "kdcoffee-cart-v13": "[]" });
    context.clearCart(); rerender(); assert.equal(context.items.length, 0); assert.equal(context.unresolved.length, 0); assert.equal(context.notices.length, 0);
    assert.equal(storage.values.get("unrelated"), "keep"); assert.equal(storage.values.get("kdcoffee-cart-v13"), "[]");
  });
  await test("empty cart offers Coffee and Store discovery", () => {
    const html = htmlCart(); assert.match(html, /href="\/works">選購咖啡/); assert.match(html, /href="\/store">逛逛商店/);
  });
  await test("live writes are v16 only and preserve bounded private-free projection", () => {
    assert.ok(storage.log.filter(entry => entry.startsWith("write:")).every(entry => entry === "write:" + V16));
    assert.doesNotMatch(storage.values.get(V16)!, /pvValue|kdRedemption|reward|catalog|orderId|customer|manualSeo|revision/);
    assert.doesNotMatch(providerSource, /kdcoffee-cart-v15|localStorage\.setItem|\/api\/orders|storeRepository/);
  });
  await test("Store detail CTA is capability-gated and coffee orders remain separate", async () => {
    assert.match(storeSource, /isStoreCommerceEnabled\(\) \? <StoreAddToCart/);
    assert.doesNotMatch(storeSource, /<AddToCart|addItem\(|\/api\/orders|productId=/);
    const storeAction = await readFile("components/store/StoreAddToCart.tsx", "utf8");
    assert.match(storeAction, /fetch\("\/api\/commerce\/store\/offer"/);
    assert.match(storeAction, /storeCartItemFromOffer\(await response.json\(\), slug\)/);
    assert.doesNotMatch(storeAction, /\/api\/orders|\/checkout|localStorage|pvValue|kdRedemption/);
    assert.throws(() => coffeeCheckoutItems([store()]));
    assert.equal(cartCheckoutEligibility([store()], "READY", []), "STORE_CHECKOUT_NOT_ENABLED");
  });
  await test("Store rows reject coffeeOptions at model trust boundary", () => {
    assert.throws(() => validateUnifiedCartItem({ ...store(), coffeeOptions: { customRoast: false } }));
    assert.equal(cartCheckoutEligibility([store()], "READY", []), "STORE_CHECKOUT_NOT_ENABLED");
  });
} finally {
  registration.deregister(); delete globals.__j6e2Hooks; delete globals.__j6e2Navigate;
  globalThis.fetch = oldFetch;
  if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else Reflect.deleteProperty(globalThis, "window");
}
console.log("J.6E.2 Unified cart provider: " + passed + "/" + passed + " PASS; in-memory fixtures only.");
