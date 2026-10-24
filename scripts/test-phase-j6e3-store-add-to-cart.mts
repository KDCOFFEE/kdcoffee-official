import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as nodeModule from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isStoreCommerceEnabled } from "../lib/storeCommerceCapability";
import { resolveStoreCommerceOffer, StoreCommerceOfferError } from "../lib/storeCommerceOffer";
import { POST } from "../app/api/commerce/store/offer/route";
import type { StoreCatalog } from "../lib/storeTypes";
import { validateStoreCatalog } from "../lib/storeValidation";
import { findPublicStoreProductBySlug } from "../lib/storePublicSelectors";
import { StoreRepositoryIntegrityError } from "../lib/storeRepository";
import { cartLineKey, cartProductHref, coffeeCheckoutItems } from "../lib/commerceCart";
import type { CoffeeCartItem } from "../lib/commerceCart";
import type { CartContextValue } from "../components/commerce/CartProvider";
import { CURRENT_CART_STORAGE_KEY as V16, validateCartEnvelope } from "../lib/commerceCartStorage";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6e3-store-cart-"));
const tempParent = await fs.realpath(os.tmpdir());
const realRoot = await fs.realpath(root);
assert.equal(path.dirname(realRoot).toLowerCase(), tempParent.toLowerCase());
const catalogPath = path.join(root, "store-domain", "catalog.json");
const savedEnv = Object.fromEntries(["KD_DATA_DIR", "RAILWAY_VOLUME_MOUNT_PATH", "STORE_COMMERCE_ENABLED"].map(key => [key, process.env[key]]));
function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
}
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
const timestamp = "2026-10-12T00:00:00.000Z";
const entity = (id: string) => ({ id, revision: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null });
function fixture(): StoreCatalog {
  return {
    schemaVersion: 1, revision: 7, updatedAt: timestamp,
    sections: [{ ...entity("test-section"), name: "器具", slug: "equipment", shortDescription: "", description: "",
      active: true, published: true, sortOrder: 0, showOnHomepage: false, homepageSortOrder: 0,
      showInNavigation: false, navigationSortOrder: 0, seoTitle: "PRIVATE_SECTION_SEO", seoDescription: "" }],
    categories: [{ ...entity("test-category"), sectionId: "test-section", name: "濾杯", slug: "drippers",
      description: "", active: true, sortOrder: 0 }],
    products: [{ ...entity("test-stable-dripper"), sectionId: "test-section", categoryId: "test-category",
      slug: "test-dripper", name: "測試陶瓷濾杯", shortDescription: "測試介紹", description: "測試商品",
      productType: "equipment", sku: "PRIVATE_SKU", price: 650, inventory: 6, active: true, published: true,
      sortOrder: 0, featured: false, gallery: [], specifications: [], seoTitle: "PRIVATE_PRODUCT_SEO",
      pvValue: 87.5, kdRedemption: { mode: "disabled" }, subscriptionEligible: false }],
  };
}
async function writeFixture(catalog = fixture(), validate = true) {
  if (validate) validateStoreCatalog(catalog);
  await fs.mkdir(path.dirname(catalogPath), { recursive: true });
  await fs.writeFile(catalogPath, JSON.stringify(catalog));
}
const protectedFiles = [
  "components/commerce/CartProvider.tsx", "components/commerce/AddToCart.tsx", "components/commerce/FloatingCart.tsx",
  "components/commerce/CommerceCheckoutBoundary.tsx", "app/cart/page.tsx", "app/checkout/page.tsx", "app/api/orders/route.ts",
  "lib/commerceCart.ts", "lib/commerceCartStorage.ts", "lib/commerceCartResolver.ts", "lib/orderPricing.ts",
  "lib/orderInventoryTransaction.ts", "lib/orderInventoryReturn.ts", "lib/fulfillment.ts", "lib/membershipCommerce.ts",
  "lib/referralPv.ts", "lib/membershipBusinessRules.ts", "lib/subscriptionSkuModel.ts", "lib/storeTypes.ts",
  "lib/storeValidation.ts", "lib/storeRepository.ts", "lib/storePublicSelectors.ts", "lib/storePublicReadModel.ts",
  "components/admin/StoreWorkspace.tsx", "components/admin/HomepageManager.tsx", "components/admin/ProductManager.tsx",
  "app/works/[slug]/page.tsx", "public/data/website-data.json", "public/data/homepage.json",
  "public/data/assets.json", "public/data/pages.json", "package.json", "package-lock.json", "tsconfig.json", ".env.local",
];
async function hashes() {
  return Object.fromEntries(await Promise.all(protectedFiles.map(async file => {
    try { return [file, createHash("sha256").update(await fs.readFile(file)).digest("hex")]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return [file, null]; throw error; }
  })));
}
const before = await hashes();

// Real provider/CTA callbacks; only React scheduling and browser transport/storage are fixtures.
type Slot = { value: unknown; deps?: readonly unknown[] };
class Hooks {
  slots: Slot[] = []; cursor = 0; effects: (() => unknown)[] = [];
  begin() { this.cursor = 0; }
  state(initial: unknown) {
    const i = this.cursor++;
    if (!this.slots[i]) this.slots[i] = { value: typeof initial === "function" ? initial() : initial };
    return [this.slots[i].value, (value: unknown) => {
      this.slots[i].value = typeof value === "function" ? value(this.slots[i].value) : value;
    }];
  }
  ref(initial: unknown) {
    const i = this.cursor++; if (!this.slots[i]) this.slots[i] = { value: { current: initial } };
    return this.slots[i].value;
  }
  memo(factory: () => unknown, deps: readonly unknown[]) {
    const i = this.cursor++, old = this.slots[i];
    if (!old || !deps.every((value, offset) => Object.is(value, old.deps?.[offset]))) this.slots[i] = { value: factory(), deps };
    return this.slots[i].value;
  }
  effect(fn: () => unknown, deps: readonly unknown[]) {
    const i = this.cursor++;
    if (!this.slots[i]) { this.slots[i] = { value: null, deps }; this.effects.push(fn); }
  }
}
let hooks = new Hooks(), providerHooks = new Hooks(), actionHooks = new Hooks();
let context: CartContextValue;
const globals = globalThis as unknown as { __j6e3Hooks?: Record<string, unknown> };
globals.__j6e3Hooks = {
  useState: (initial: unknown) => hooks.state(initial), useRef: (initial: unknown) => hooks.ref(initial),
  useMemo: (factory: () => unknown, deps: readonly unknown[]) => hooks.memo(factory, deps),
  useCallback: (fn: () => unknown, deps: readonly unknown[]) => hooks.memo(() => fn, deps),
  useEffect: (fn: () => unknown, deps: readonly unknown[]) => hooks.effect(fn, deps), useContext: () => context,
};
type ResolveContext = { parentURL?: string };
type ResolveResult = { url: string; shortCircuit?: boolean };
type ResolveNext = (specifier: string, context: ResolveContext) => ResolveResult;
const { registerHooks } = nodeModule as unknown as {
  registerHooks(options: { resolve: (specifier: string, context: ResolveContext, next: ResolveNext) => ResolveResult }): { deregister(): void };
};
const reactURL = pathToFileURL(path.resolve("node_modules/react/index.js")).href;
const hookModule = "export * from " + JSON.stringify(reactURL) + ";" +
  ["useState", "useRef", "useMemo", "useCallback", "useEffect", "useContext"]
    .map(name => "export const " + name + "=(...args)=>globalThis.__j6e3Hooks." + name + "(...args);").join("");
function normalizedParentPath(parentURL?: string): string {
  if (!parentURL) return "";
  try {
    return fileURLToPath(parentURL).replaceAll("\\", "/");
  } catch {
    return "";
  }
}
const registration = registerHooks({
  resolve(specifier, resolveContext, next) {
    if (specifier === "react" && ["CartProvider.tsx", "StoreAddToCart.tsx"].some(name => resolveContext.parentURL?.endsWith("/" + name))) {
      return { url: "data:text/javascript," + encodeURIComponent(hookModule), shortCircuit: true };
    }
    if (specifier === "next/navigation" && normalizedParentPath(resolveContext.parentURL).endsWith("/app/store/[slug]/page.tsx")) return next("next/navigation.js", resolveContext);
    return next(specifier, resolveContext);
  },
});
const moduleURL = (file: string) => pathToFileURL(path.resolve(file)).href;
const { CartProvider } = await import(moduleURL("components/commerce/CartProvider.tsx"));
const { default: CTA, storeCartItemFromOffer } = await import(moduleURL("components/store/StoreAddToCart.tsx"));
const { default: Page } = await import(moduleURL("app/store/[slug]/page.tsx"));
const { default: Boundary } = await import(moduleURL("components/commerce/CommerceCheckoutBoundary.tsx"));
const oldFetch = globalThis.fetch, oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
class MemoryStorage {
  values = new Map<string, string>(); writes: string[] = [];
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes.push(key); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
let storage = new MemoryStorage(), requests = 0;
let fetchMode: "live" | "network" | "invalid" | "delayed" = "live";
let delayedResponse: Promise<Response>;
function request(value: unknown = { slug: "test-dripper" }, headers: Record<string, string> = {}) {
  return new Request("http://127.0.0.1/api/commerce/store/offer", {
    method: "POST", headers: { "content-type": "application/json", ...headers },
    body: typeof value === "string" ? value : JSON.stringify(value),
  });
}
function renderProvider() {
  hooks = providerHooks; hooks.begin();
  const tree = CartProvider({ children: null }) as React.ReactElement<{ value: CartContextValue }>;
  context = tree.props.value; return context;
}
async function boot(items: unknown[] = []) {
  providerHooks = new Hooks(); actionHooks = new Hooks(); storage = new MemoryStorage(); requests = 0; fetchMode = "live";
  storage.values.set(V16, JSON.stringify({ version: 16, items, migration: { completed: true, unresolved: [], notices: [] } }));
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage, dispatchEvent: () => true } });
  globalThis.fetch = async (input, init) => {
    requests++;
    assert.equal(String(input), "/api/commerce/store/offer");
    assert.equal(init?.cache, "no-store");
    assert.deepEqual(JSON.parse(String(init?.body)), { slug: "test-dripper" });
    if (fetchMode === "network") throw new Error("PRIVATE_NETWORK_PATH");
    if (fetchMode === "invalid") return Response.json({ domain: "coffee", productId: "forged", unitPrice: 1 });
    if (fetchMode === "delayed") return delayedResponse;
    return POST(new Request("http://127.0.0.1" + input, init));
  };
  renderProvider(); providerHooks.effects.forEach(fn => fn());
  await new Promise<void>(resolve => setImmediate(resolve)); renderProvider();
  assert.equal(context.ready, true);
}
type Node = React.ReactElement<Record<string, unknown>>;
function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement(tree)) return [];
  const node = tree as Node; return [node, ...nodes(node.props.children)];
}
function renderCTA(inStock = true) {
  hooks = actionHooks; hooks.begin(); return CTA({ slug: "test-dripper", inStock });
}
function button(tree: unknown) {
  const node = nodes(tree).find(node => node.type === "button" && node.props["aria-label"] === "加入購物車"); assert.ok(node); return node;
}
function click(tree: unknown) { (button(tree).props.onClick as () => void)(); }
async function settled() {
  for (let i = 0; i < 400; i++) {
    renderProvider(); const tree = renderCTA();
    if (tree.props["aria-busy"] === false) return renderToStaticMarkup(tree);
    await new Promise<void>(resolve => setTimeout(resolve, 5));
  }
  throw new Error("CTA did not settle within bounded test wait");
}
async function add() { click(renderCTA()); return settled(); }
const coffee: CoffeeCartItem = { domain: "coffee", productId: "test-coffee", variantId: "test-coffee-beans",
  slug: "test-coffee", name: "測試咖啡", unitPrice: 700, quantity: 1, quantityLimit: 6,
  optionLabel: "半磅", coffeeOptions: { preparation: "咖啡豆", customRoast: false } };
const errorCode = (code: string) => (error: unknown) => error instanceof StoreCommerceOfferError && error.code === code;
let passed = 0;
async function test(name: string, operation: () => unknown | Promise<unknown>) {
  const previousFlag = process.env.STORE_COMMERCE_ENABLED;
  process.env.STORE_COMMERCE_ENABLED = "true";
  try { await writeFixture(); await operation(); console.log("PASS " + String(++passed).padStart(3, "0") + " " + name); }
  catch (error) { console.error("FAIL " + name); throw error; }
  finally { restore("STORE_COMMERCE_ENABLED", previousFlag); }
}
try {
  for (const value of [undefined, "", "false", "TRUE", "True", "1", "yes"]) await test("capability disabled for " + JSON.stringify(value), async () => {
    restore("STORE_COMMERCE_ENABLED", value); assert.equal(isStoreCommerceEnabled(), false);
    await assert.rejects(() => resolveStoreCommerceOffer("test-dripper"), errorCode("STORE_COMMERCE_DISABLED"));
    const response = await POST(request("{broken")); assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { code: "STORE_COMMERCE_DISABLED" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
  await test("exact lowercase true enables capability", () => assert.equal(isStoreCommerceEnabled(), true));
  await test("per-test flag restoration preserves original environment", () => {
    restore("STORE_COMMERCE_ENABLED", savedEnv.STORE_COMMERCE_ENABLED);
    assert.equal(process.env.STORE_COMMERCE_ENABLED, savedEnv.STORE_COMMERCE_ENABLED);
  });
  const capabilitySource = await fs.readFile("lib/storeCommerceCapability.ts", "utf8");
  const offerSource = await fs.readFile("lib/storeCommerceOffer.ts", "utf8");
  const actionSource = await fs.readFile("components/store/StoreAddToCart.tsx", "utf8");
  const pageSource = await fs.readFile("app/store/[slug]/page.tsx", "utf8");
  await test("server-only imports and exact private environment rule", () => {
    assert.match(capabilitySource, /import "server-only"/); assert.match(offerSource, /import "server-only"/);
    assert.match(capabilitySource, /process\.env\.STORE_COMMERCE_ENABLED === "true"/);
    assert.doesNotMatch(capabilitySource + actionSource + offerSource, /NEXT_PUBLIC_|NEXT_PUBLIC_STORE_COMMERCE_ENABLED/);
    assert.doesNotMatch(actionSource, /process\.env|storeCommerceCapability|storeCommerceOffer|storeRepository/);
  });
  await test("published product resolves exact narrow server offer with stable identity", async () => {
    assert.deepEqual(await resolveStoreCommerceOffer("test-dripper"), { domain: "store", productId: "test-stable-dripper",
      variantId: "default", slug: "test-dripper", name: "測試陶瓷濾杯", unitPrice: 650, quantityLimit: 6 });
  });
  for (const [label, price, salePrice, expected] of [
    ["regular", 650, undefined, 650], ["sale", 650, 520, 520], ["zero sale", 650, 0, 0],
    ["zero price", 0, undefined, 0], ["equal sale", 650, 650, 650], ["both zero", 0, 0, 0],
  ] as const) await test(label + " follows approved effective-price semantics", async () => {
    const catalog = fixture(); catalog.products[0].price = price;
    if (salePrice !== undefined) catalog.products[0].salePrice = salePrice;
    await writeFixture(catalog); assert.equal((await resolveStoreCommerceOffer("test-dripper")).unitPrice, expected);
  });
  for (const inventory of [1, 37, 99, 100, 250]) await test("quantity limit for live inventory " + inventory, async () => {
    const catalog = fixture(); catalog.products[0].inventory = inventory; await writeFixture(catalog);
    assert.equal((await resolveStoreCommerceOffer("test-dripper")).quantityLimit, Math.min(99, inventory));
  });
  await test("zero stock rejects offer while public product remains visible", async () => {
    const catalog = fixture(); catalog.products[0].inventory = 0; await writeFixture(catalog);
    assert.ok(findPublicStoreProductBySlug(catalog, "test-dripper"));
    await assert.rejects(() => resolveStoreCommerceOffer("test-dripper"), errorCode("STORE_PRODUCT_OUT_OF_STOCK"));
    assert.equal((await POST(request())).status, 409);
  });
  for (const [label, patch] of [
    ["unpublished", { published: false }], ["inactive", { active: false, published: false }],
    ["archived", { active: false, published: false, archivedAt: timestamp }],
  ] as const) await test(label + " product has no commerce offer", async () => {
    const catalog = fixture(); Object.assign(catalog.products[0], patch); await writeFixture(catalog);
    await assert.rejects(() => resolveStoreCommerceOffer("test-dripper"), errorCode("STORE_PRODUCT_NOT_FOUND"));
    assert.equal((await POST(request())).status, 404);
  });
  for (const [label, patch] of [
    ["unpublished", { published: false }], ["inactive", { active: false, published: false }],
    ["archived", { active: false, published: false, archivedAt: timestamp }],
  ] as const) await test(label + " section has no visibility loophole", async () => {
    const catalog = fixture(); Object.assign(catalog.sections[0], patch);
    assert.equal(findPublicStoreProductBySlug(catalog, "test-dripper"), null);
    catalog.products[0].published = false;
    if ("archivedAt" in patch) {
      Object.assign(catalog.categories[0], { active: false, archivedAt: timestamp });
      Object.assign(catalog.products[0], { active: false, archivedAt: timestamp });
    }
    await writeFixture(catalog);
    await assert.rejects(() => resolveStoreCommerceOffer("test-dripper"), errorCode("STORE_PRODUCT_NOT_FOUND"));
  });
  for (const archived of [false, true]) await test((archived ? "archived" : "inactive") + " category is unavailable", async () => {
    const catalog = fixture(); catalog.categories[0].active = false;
    if (archived) catalog.categories[0].archivedAt = timestamp;
    assert.equal(findPublicStoreProductBySlug(catalog, "test-dripper"), null);
    catalog.products[0].published = false;
    if (archived) Object.assign(catalog.products[0], { active: false, archivedAt: timestamp });
    await writeFixture(catalog);
    await assert.rejects(() => resolveStoreCommerceOffer("test-dripper"), errorCode("STORE_PRODUCT_NOT_FOUND"));
  });
  for (const crossSection of [false, true]) await test((crossSection ? "cross-section" : "missing") + " category rejects rather than leaks", async () => {
    const catalog = fixture();
    if (crossSection) {
      catalog.sections.push({ ...catalog.sections[0], id: "second-section", slug: "second-section" });
      catalog.categories[0].sectionId = "second-section";
    } else catalog.products[0].categoryId = "missing-category";
    assert.equal(findPublicStoreProductBySlug(catalog, "test-dripper"), null);
    await writeFixture(catalog, false);
    await assert.rejects(() => resolveStoreCommerceOffer("test-dripper"), StoreRepositoryIntegrityError);
    const response = await POST(request()); assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { code: "STORE_COMMERCE_RESOLUTION_FAILED" });
  });
  await test("uncategorized public product is eligible", async () => {
    const catalog = fixture(); delete catalog.products[0].categoryId; await writeFixture(catalog);
    assert.equal((await resolveStoreCommerceOffer("test-dripper")).productId, "test-stable-dripper");
  });
  await test("missing catalog is not-found without creating data", async () => {
    await fs.unlink(catalogPath); const files = await fs.readdir(path.dirname(catalogPath));
    assert.equal((await POST(request())).status, 404);
    assert.deepEqual(await fs.readdir(path.dirname(catalogPath)), files);
    await assert.rejects(fs.access(catalogPath), { code: "ENOENT" });
  });
  for (const value of ["{broken", null, [], {}, { slug: "../private" }, { slug: "UPPER" }, { slug: "a".repeat(81) },
    { slug: "test-dripper", price: 0 }, { slug: "test-dripper", productId: "forged" },
    { slug: "test-dripper", name: "forged", stock: 99, quantityLimit: 99, pvValue: 0 }]) {
    await test("invalid/authoritative request rejected " + JSON.stringify(value), async () => {
      const response = await POST(request(value)); assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { code: "INVALID_REQUEST" });
      assert.equal(response.headers.get("cache-control"), "no-store");
    });
  }
  await test("wrong content type rejected", async () => assert.equal((await POST(request({}, { "content-type": "text/plain" }))).status, 400));
  await test("declared excessive body rejected", async () => assert.equal((await POST(request({}, { "content-length": "2049" }))).status, 400));
  await test("actual excessive body rejected without trusting content length", async () => {
    assert.equal((await POST(request('{"slug":"test-dripper","padding":"' + "x".repeat(3000) + '"}'))).status, 400);
  });
  await test("chunked excessive body and invalid UTF8 reject safely", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(encoder.encode('{"slug":"')); controller.enqueue(new Uint8Array(3000).fill(97)); controller.close();
    } });
    const init: RequestInit & { duplex: "half" } = { method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half" };
    assert.equal((await POST(new Request("http://127.0.0.1/api/commerce/store/offer", init))).status, 400);
    const malformed = new Request("http://127.0.0.1/api/commerce/store/offer", {
      method: "POST", headers: { "content-type": "application/json" }, body: new Uint8Array([255, 254]),
    });
    assert.equal((await POST(malformed)).status, 400);
  });
  await test("enabled valid API returns current whitelisted offer and no-store", async () => {
    const response = await POST(request()); assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const result = await response.json();
    assert.deepEqual(Object.keys(result).sort(), ["domain", "name", "productId", "quantityLimit", "slug", "unitPrice", "variantId"]);
    assert.doesNotMatch(JSON.stringify(result), /pvValue|kdRedemption|subscriptionEligible|seo|revision|archivedAt|PRIVATE_|sections|categories|products/);
  });
  await test("unknown public slug returns 404 safely", async () => {
    const response = await POST(request({ slug: "missing" })); assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { code: "STORE_PRODUCT_NOT_FOUND" });
  });
  await test("corrupt JSON returns bounded 500 with unchanged bytes", async () => {
    await fs.writeFile(catalogPath, "{PRIVATE_CORRUPT");
    const response = await POST(request()); assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { code: "STORE_COMMERCE_RESOLUTION_FAILED" });
    assert.equal(await fs.readFile(catalogPath, "utf8"), "{PRIVATE_CORRUPT");
  });
  await test("filesystem catalog integrity error has safe 500", async () => {
    await fs.unlink(catalogPath); await fs.mkdir(catalogPath);
    try {
      const response = await POST(request()); assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { code: "STORE_COMMERCE_RESOLUTION_FAILED" });
    } finally { await fs.rmdir(catalogPath); }
  });
  await test("detail stays dynamic Node Server Component with slug-only CTA props", () => {
    assert.doesNotMatch(pageSource, /["']use client["']|productId=|unitPrice=|createStoreRepository/);
    assert.match(pageSource, /runtime = "nodejs"/); assert.match(pageSource, /dynamic = "force-dynamic"/);
    assert.match(pageSource, /isStoreCommerceEnabled\(\) \? <StoreAddToCart/);
    assert.match(pageSource, /slug=\{product.slug\} inStock=\{product.inStock\}/);
  });
  await test("disabled page does not render a Store action", async () => {
    delete process.env.STORE_COMMERCE_ENABLED;
    const tree = await Page({ params: Promise.resolve({ slug: "test-dripper" }) });
    assert.equal(nodes(tree).filter(node => node.type === CTA).length, 0);
    assert.doesNotMatch(renderToStaticMarkup(tree), /加入購物車/);
  });
  await test("enabled public detail renders small client boundary", async () => {
    const tree = await Page({ params: Promise.resolve({ slug: "test-dripper" }) });
    const actions = nodes(tree).filter(node => node.type === CTA); assert.equal(actions.length, 1);
    assert.deepEqual(actions[0].props, { slug: "test-dripper", inStock: true });
  });
  await test("zero stock keeps public detail and has no usable add button", async () => {
    const catalog = fixture(); catalog.products[0].inventory = 0; await writeFixture(catalog); await boot();
    const tree = await Page({ params: Promise.resolve({ slug: "test-dripper" }) });
    assert.equal(nodes(tree).filter(node => node.type === CTA)[0].props.inStock, false);
    assert.equal(button(renderCTA(false)).props.disabled, true); click(renderCTA(false));
    assert.equal(requests, 0); assert.match(renderToStaticMarkup(renderCTA(false)), /目前無庫存/);
  });
  await test("response validator creates exact canonical Store item quantity one", async () => {
    const offer = await resolveStoreCommerceOffer("test-dripper");
    assert.deepEqual(storeCartItemFromOffer(offer, "test-dripper"), { ...offer, quantity: 1 });
    assert.equal(Object.hasOwn(storeCartItemFromOffer(offer, "test-dripper"), "coffeeOptions"), false);
  });
  for (const patch of [{ productId: "" }, { variantId: "forged" }, { domain: "coffee" }, { unitPrice: -1 },
    { quantityLimit: 0 }, { quantityLimit: 100 }, { quantityLimit: 1.5 }, { slug: "other" }, { pvValue: 3 }, { coffeeOptions: {} }]) {
    await test("invalid/private offer cannot produce Store cart item " + JSON.stringify(patch), async () => {
      const offer = await resolveStoreCommerceOffer("test-dripper");
      assert.throws(() => storeCartItemFromOffer({ ...offer, ...patch }, "test-dripper"));
    });
  }
  await test("CTA resolves live server offer before real provider addition", async () => {
    const catalog = fixture(); catalog.products[0].salePrice = 520; await writeFixture(catalog); await boot();
    assert.match(await add(), /已加入購物車/); assert.equal(requests, 1);
    assert.deepEqual(context.items, [{ domain: "store", productId: "test-stable-dripper", variantId: "default",
      slug: "test-dripper", name: "測試陶瓷濾杯", unitPrice: 520, quantity: 1, quantityLimit: 6 }]);
    assert.notEqual(context.checkoutEligibility, "ELIGIBLE");
    const persisted = validateCartEnvelope(JSON.parse(storage.values.get(V16)!)); assert.deepEqual(persisted.items, context.items);
  });
  await test("repeat Store adds merge canonical quantity within the current limit", async () => {
    const catalog = fixture(); catalog.products[0].inventory = 2; await writeFixture(catalog); await boot();
    await add(); await add(); assert.equal(context.items.length, 1); assert.equal(context.items[0].quantity, 2);
    assert.match(await add(), /目前無法加入/); assert.equal(context.items[0].quantity, 2);
    assert.ok(storage.writes.every(key => key === V16));
  });
  await test("concurrent duplicate clicks issue only one request and show loading", async () => {
    await boot(); const offer = await resolveStoreCommerceOffer("test-dripper");
    let release: (response: Response) => void = () => {};
    delayedResponse = new Promise(resolve => { release = resolve; }); fetchMode = "delayed";
    const tree = renderCTA(); click(tree); click(tree);
    assert.equal(requests, 1); assert.equal(button(renderCTA()).props.disabled, true);
    assert.match(renderToStaticMarkup(renderCTA()), /正在加入/);
    release(Response.json(offer)); assert.match(await settled(), /已加入購物車/);
    assert.equal(context.items[0].quantity, 1);
  });
  await test("inventory reaching zero after page render is revalidated on click", async () => {
    await boot(); const tree = renderCTA(); const catalog = fixture(); catalog.products[0].inventory = 0; await writeFixture(catalog);
    click(tree); assert.match(await settled(), /目前無庫存/); assert.equal(context.items.length, 0);
    assert.equal(button(renderCTA()).props.disabled, true);
  });
  await test("capability revocation after page render blocks API and addition", async () => {
    await boot(); delete process.env.STORE_COMMERCE_ENABLED;
    assert.match(await add(), /暫不開放/); assert.equal(context.items.length, 0); assert.equal(button(renderCTA()).props.disabled, true);
  });
  await test("unpublished after render produces safe unavailable message", async () => {
    await boot(); const catalog = fixture(); catalog.products[0].published = false; await writeFixture(catalog);
    assert.match(await add(), /商品目前無法購買/); assert.equal(context.items.length, 0);
  });
  await test("network and forged offer failures never add or leak errors", async () => {
    await boot(); fetchMode = "network"; const html = await add();
    assert.match(html, /暫時無法加入/); assert.doesNotMatch(html, /PRIVATE_/); assert.equal(context.items.length, 0);
    fetchMode = "invalid"; assert.match(await add(), /暫時無法加入/); assert.equal(context.items.length, 0);
  });
  await test("unready cart does not send offer requests", async () => {
    await boot(); context = { ...context, ready: false };
    assert.equal(button(renderCTA()).props.disabled, true); click(renderCTA()); assert.equal(requests, 0);
  });
  await test("Store and Coffee coexist in the same v16 cart and domain routes", async () => {
    await boot([coffee]); await add(); assert.equal(context.items.length, 2);
    assert.equal(cartProductHref(context.items[0]), "/works/test-coffee");
    assert.equal(cartProductHref(context.items[1]), "/store/test-dripper");
    assert.notEqual(context.checkoutEligibility, "ELIGIBLE");
    assert.throws(() => context.getCoffeeCheckoutItems()); assert.throws(() => coffeeCheckoutItems(context.items));
    assert.equal(validateCartEnvelope(JSON.parse(storage.values.get(V16)!)).items.length, 2);
  });
  await test("unverified mixed boundary does not mount legacy Coffee submit and adapter never filters", async () => {
    await boot([coffee]); await add(); let mounts = 0;
    const child = () => { mounts++; return React.createElement("form", { action: "/api/orders" }); };
    const html = renderToStaticMarkup(React.createElement(Boundary, null, React.createElement(child)));
    assert.equal(mounts, 0); assert.doesNotMatch(html, /<form|\/api\/orders/);
    assert.throws(() => coffeeCheckoutItems(context.items));
  });
  await test("unverified Store-only boundary is not eligible before successor capability verification", async () => {
    await boot(); await add(); let mounts = 0;
    const child = () => { mounts++; return React.createElement("form"); };
    renderToStaticMarkup(React.createElement(Boundary, null, React.createElement(child)));
    assert.equal(mounts, 0); assert.notEqual(context.checkoutEligibility, "ELIGIBLE");
  });
  await test("coffee-only cart remains eligible without Store mutation", async () => {
    await boot([coffee]); assert.equal(context.checkoutEligibility, "ELIGIBLE");
    assert.equal(context.getCoffeeCheckoutItems().length, 1);
  });
  await test("add and quantity edit never reserve or mutate catalog inventory", async () => {
    await boot(); const bytes = await fs.readFile(catalogPath, "utf8"); const files = await fs.readdir(path.dirname(catalogPath));
    await add(); context.updateQuantity(cartLineKey(context.items[0]), 3); renderProvider();
    assert.equal(context.items[0].quantity, 3); assert.equal(await fs.readFile(catalogPath, "utf8"), bytes);
    assert.deepEqual(await fs.readdir(path.dirname(catalogPath)), files);
  });
  await test("CTA has no second cart/order/reward/subscription or client authority", () => {
    assert.match(actionSource, /useCart/); assert.match(actionSource, /storeCartItemFromOffer\(await response.json\(\), slug\)/);
    assert.doesNotMatch(actionSource, /localStorage|createContext|CartProvider>|\/api\/orders|\/checkout|pvValue|kdRedemption|subscription|wallet|reward/i);
    assert.doesNotMatch(offerSource, /writeFile|atomicWrite|\.update|\.create|reserve|membership|referral|wallet/);
    assert.match(actionSource, /role=\{state === "error" \? "alert" : "status"\}/);
  });
  await test("Orders wallet rewards and all protected hashes remain unchanged", async () => assert.deepEqual(await hashes(), before));
} finally {
  registration.deregister(); delete globals.__j6e3Hooks; globalThis.fetch = oldFetch;
  if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else Reflect.deleteProperty(globalThis, "window");
  for (const [key, value] of Object.entries(savedEnv)) restore(key, value);
  // Only the verified mkdtemp child is removed.
  assert.equal(path.dirname(await fs.realpath(root)).toLowerCase(), tempParent.toLowerCase());
  await fs.rm(root, { recursive: true, force: true });
  await assert.rejects(fs.access(root), { code: "ENOENT" });
  for (const [key, value] of Object.entries(savedEnv)) assert.equal(process.env[key], value);
}
console.log("J.6E.3 Store add-to-cart: " + passed + "/" + passed + " PASS; isolated fixture cleaned; environment restored.");
