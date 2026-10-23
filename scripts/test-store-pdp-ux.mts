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

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-store-pdp-ux-"));
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
let fetchMode: "live" | "network" | "invalid" = "live";
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

const { default: Card } = await import(moduleURL("components/store/StoreProductCard.tsx"));
const { readPublicStoreProductBySlug } = await import(moduleURL("lib/storePublicReadModel.ts"));
const { readPointDisplayName } = await import(moduleURL("lib/pointDisplayNameStore.ts"));
const rules = JSON.parse(await fs.readFile(process.env.GIFT_QA_RULES!, "utf8"));
for (const version of rules.versions) version.rules.referral = { ...version.rules.referral, pointDisplayName: "測試會員點" };
await fs.mkdir(path.join(root,"membership-commerce"),{recursive:true});
await fs.writeFile(path.join(root,"membership-commerce/business-rules.json"),JSON.stringify(rules));
function control(label: string) {const node=nodes(renderCTA()).find(n=>n.type==="button"&&n.props["aria-label"]===label);assert.ok(node);return node;}
function selected() {const node=nodes(renderCTA()).find(n=>n.type==="output");assert.ok(node);return Number(node.props.children);}
function press(label: string) {const node=control(label);if(!node.props.disabled)(node.props.onClick as ()=>void)();}
async function until(check:()=>boolean){for(let i=0;i<400;i++){renderProvider();renderCTA();if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail("bounded UI settle deadline");}
let cleanups:(()=>void)[]=[];
async function mount(){renderCTA();for(const effect of actionHooks.effects.splice(0)){const cleanup=effect();if(typeof cleanup==="function")cleanups.push(cleanup as ()=>void);}await until(()=>!control("增加數量").props.disabled);}
let passed=0;
async function test(name:string,run:()=>unknown|Promise<unknown>){
  for(const fn of cleanups.splice(0))fn();process.env.STORE_COMMERCE_ENABLED="true";
  await writeFixture();await run();console.log("PASS "+(++passed)+" "+name);
}
try {
await test("Image/name/CTA links share one canonical destination with no nested anchors",()=>{
 const c=fixture();c.products[0].heroMedia={type:"image",url:"/qa.png",alt:"原有圖片替代文字"};
 const html=renderToStaticMarkup(React.createElement(Card,{product:findPublicStoreProductBySlug(c,"test-dripper")!,editorial:{compact:true,cta:"查看禮盒 →"}}));
 const links=[...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];assert.equal(links.length,2);
 for(const link of links){assert.match(link[1],/href="\/store\/test-dripper"/);assert.doesNotMatch(link[2],/<a\b/);}
 assert.match(links[0][1],/aria-label="查看 測試陶瓷濾杯"/);assert.match(links[0][2],/alt="原有圖片替代文字"/);
 assert.match(links[1][2],/查看禮盒 →/);assert.match(links[1][2],/測試陶瓷濾杯/);
});
for(const type of ["gift","equipment"] as const)await test(type+" PDP shows configured 88 points through the global resolver",async()=>{
 const c=fixture();c.products[0].productType=type;c.products[0].pvValue=88;await writeFixture(c);await boot();
 assert.equal(await readPointDisplayName(),"測試會員點");const model=await readPublicStoreProductBySlug("test-dripper");assert.equal(model!.pointValue,88);
 const html=renderToStaticMarkup(await Page({params:Promise.resolve({slug:"test-dripper"})}));assert.match(html,/可獲得 88 測試會員點/);
 assert.ok(html.indexOf("NT$")<html.indexOf("可獲得"));assert.ok(html.indexOf("可獲得")<html.indexOf("有庫存"));
});
await test("Zero points hide the entire PDP point row",async()=>{
 const c=fixture();c.products[0].pvValue=0;await writeFixture(c);await boot();assert.doesNotMatch(renderToStaticMarkup(await Page({params:Promise.resolve({slug:"test-dripper"})})),/可獲得/);
});
await test("DRAFT product remains unavailable through public read and offer",async()=>{
 const c=fixture();c.products[0].published=false;await writeFixture(c);assert.equal(await readPublicStoreProductBySlug("test-dripper"),null);assert.equal((await POST(request())).status,404);
});
await test("Quantity initializes at one; minus cannot remove a PDP product",async()=>{await boot();await mount();assert.equal(selected(),1);assert.equal(control("減少數量").props.disabled,true);press("減少數量");assert.equal(selected(),1);assert.equal(context.items.length,0);});
await test("Plus/plus/minus produces 2/3/2",async()=>{await boot();await mount();press("增加數量");assert.equal(selected(),2);press("增加數量");assert.equal(selected(),3);press("減少數量");assert.equal(selected(),2);});
await test("Inventory five is the UI maximum from the live offer",async()=>{const c=fixture();c.products[0].inventory=5;await writeFixture(c);await boot();await mount();for(let i=0;i<10;i++)press("增加數量");assert.equal(selected(),5);assert.equal(control("增加數量").props.disabled,true);});
await test("Selected quantity three reaches the real CartProvider",async()=>{await boot();await mount();press("增加數量");press("增加數量");await add();assert.equal(context.items[0].quantity,3);assert.equal(context.subtotal,1950);});
await test("Existing quantity two plus selected three aggregates to five",async()=>{await boot();await mount();press("增加數量");await add();assert.equal(context.items[0].quantity,2);press("增加數量");await add();assert.equal(context.items.length,1);assert.equal(context.items[0].quantity,5);});
await test("Existing four of stock five leaves capacity one and cannot over-add",async()=>{const c=fixture();c.products[0].inventory=5;await writeFixture(c);await boot();await mount();for(let i=0;i<3;i++)press("增加數量");await add();assert.equal(context.items[0].quantity,4);assert.equal(selected(),1);assert.equal(control("增加數量").props.disabled,true);await add();assert.equal(context.items[0].quantity,5);assert.equal(button(renderCTA()).props.disabled,true);});
await test("Stock falling after selection is revalidated; canonical provider clamps safely",async()=>{await boot();await mount();press("增加數量");press("增加數量");const c=fixture();c.products[0].inventory=2;await writeFixture(c);assert.match(await add(),/2 件/);assert.equal(context.items[0].quantity,2);});
await test("Stock zero removes functional stepper and retains disabled Store CTA",async()=>{const c=fixture();c.products[0].inventory=0;await writeFixture(c);await boot();const tree=renderCTA(false);assert.equal(nodes(tree).filter(n=>n.type==="output").length,0);assert.equal(button(tree).props.disabled,true);});
await test("Commerce flag still removes the entire PDP purchase control",async()=>{delete process.env.STORE_COMMERCE_ENABLED;await boot();const tree=await Page({params:Promise.resolve({slug:"test-dripper"})});assert.equal(nodes(tree).filter(n=>n.type===CTA).length,0);});
await test("Point display is server-only presentation; canonical public DTO remains private-free",async()=>{const model=await readPublicStoreProductBySlug("test-dripper");assert.equal(Object.hasOwn(model!.product,"pvValue"),false);const source=await fs.readFile("app/store/[slug]/page.tsx","utf8");assert.match(source,/readPointDisplayName/);assert.doesNotMatch(source,/membershipCommerce|orderRewardBasis|pvRewardMoneyValue/);});
await test("Quantity controls communicate labels/current value and have visible focus/touch targets",async()=>{await boot();await mount();const html=renderToStaticMarkup(renderCTA());assert.match(html,/aria-label="目前數量"/);assert.match(html,/aria-live="polite"/);const css=await fs.readFile("components/store/StoreAddToCart.module.css","utf8");assert.match(css,/width: 44px/);assert.match(css,/min-height: 48px/);assert.match(css,/focus-visible/);});
await test("Existing cart quantity and removal semantics remain canonical",async()=>{await boot();await mount();await add();renderProvider();const key=cartLineKey(context.items[0]);assert.equal(context.updateQuantity(key,3),true);renderProvider();assert.equal(context.items[0].quantity,3);context.removeItem(key);renderProvider();assert.equal(context.items.length,0);});
await test("TEMP root uses real resolver and all protected sources/data stay byte-identical",async()=>{const {getPersistentDataRoot}=await import(moduleURL("lib/storagePaths.ts"));assert.equal(path.resolve(getPersistentDataRoot()),path.resolve(root));assert.deepEqual(await hashes(),before);});
console.log("STORE PDP UX: "+passed+" PASS / 0 FAIL; TEMP "+root);
} finally {
 for(const fn of cleanups)fn();globalThis.fetch=oldFetch;if(oldWindow)Object.defineProperty(globalThis,"window",oldWindow);else Reflect.deleteProperty(globalThis,"window");
 registration.deregister();delete globals.__j6e3Hooks;for(const [key,value] of Object.entries(savedEnv))restore(key,value);
}
