import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  validateUnifiedCartItem, cartInventoryKey, cartLineKey, normalizeRoastNote,
  MAX_CART_ITEMS, CommerceCartValidationError,
} from "../lib/commerceCart";
import type { CoffeeCartItem, StoreCartItem } from "../lib/commerceCart";
import {
  CURRENT_CART_STORAGE_KEY, LEGACY_CART_STORAGE_KEYS, readCartStorage,
  writeCartEnvelope, validateCartEnvelope,
} from "../lib/commerceCartStorage";
import type { CartEnvelope, CartStorage } from "../lib/commerceCartStorage";
import {
  resolveLegacyCoffeeCart, CoffeeCartSourceIntegrityError,
} from "../lib/commerceCartResolver";
import type { CoffeeCartProduct, LegacyCoffeeResolution } from "../lib/commerceCartResolver";
import { POST } from "../app/api/commerce/cart/resolve/route";

let passed = 0;
async function test(name: string, operation: () => unknown | Promise<unknown>) {
  try { await operation(); console.log("PASS " + String(++passed).padStart(3, "0") + " " + name); }
  catch (error) { console.error("FAIL " + name); throw error; }
}
const coffee = (patch: Partial<CoffeeCartItem> = {}): CoffeeCartItem => ({
  domain: "coffee", productId: "P00001", variantId: "giotto-awakening-01",
  slug: "giotto-awakening", name: "喬托・初醒", unitPrice: 700, quantity: 1, quantityLimit: 8,
  optionLabel: "半磅咖啡豆", optionDetail: "227g",
  coffeeOptions: { preparation: "咖啡豆", customRoast: false }, ...patch,
});
const store = (patch: Partial<StoreCartItem> = {}): StoreCartItem => ({
  domain: "store", productId: "store-product-one", variantId: "default",
  slug: "giotto-awakening", name: "陶瓷濾杯", unitPrice: 520, quantity: 1, ...patch,
});
const product = (patch: Partial<CoffeeCartProduct> = {}): CoffeeCartProduct => ({
  id: "P00001", slug: "giotto-awakening", name: "喬托・初醒", active: true, purchasable: true,
  purchase: [],
  skus: [
    { id: "giotto-awakening-01", label: "半磅咖啡豆", detail: "227g", price: 700, stock: 8, kind: "beans", enabled: true },
    { id: "giotto-awakening-02", label: "耳掛", detail: "10包", price: 500, stock: 10, kind: "drip", enabled: true },
  ], ...patch,
});
const legacy = (patch: Record<string, unknown> = {}) => ({
  slug: "giotto-awakening", name: "舊名字", optionId: "giotto-awakening-01",
  optionLabel: "舊規格", optionDetail: "舊詳情", unitPrice: 700, quantity: 1, stock: 999,
  preparationLabel: "咖啡豆", customRoast: false, ...patch,
});
function resolve(patch: Record<string, unknown> = {}, products: CoffeeCartProduct[] = [product()]) {
  return resolveLegacyCoffeeCart([legacy(patch)], products);
}
function issue(reason: string, result: LegacyCoffeeResolution) {
  assert.equal(result.items.length, 0);
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.unresolved[0].reason, reason);
}
const emptyEnvelope = (): CartEnvelope => ({
  version: 16, items: [],
  migration: { completed: true, sourceKey: "kdcoffee-cart-v15", unresolved: [], notices: [] },
});
class MemoryStorage implements CartStorage {
  data = new Map<string, string>();
  events: string[] = [];
  failWrite = false;
  failVerification = false;
  failRemove = false;
  failGet = false;
  getItem(key: string) {
    this.events.push("get:" + key);
    if (this.failGet) throw new Error("storage unavailable");
    if (key === CURRENT_CART_STORAGE_KEY && this.failVerification && this.data.has(key)) return "{broken";
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.events.push("set:" + key);
    if (this.failWrite) throw new Error("quota");
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.events.push("remove:" + key);
    if (this.failRemove) throw new Error("remove blocked");
    this.data.delete(key);
  }
}
const protectedFiles = [
  "components/commerce/CartProvider.tsx", "components/commerce/AddToCart.tsx", "components/commerce/FloatingCart.tsx",
  "app/cart/page.tsx", "app/checkout/page.tsx", "components/member/EmailAuthForms.tsx", "app/api/orders/route.ts",
  "lib/orderPricing.ts", "lib/orderInventoryTransaction.ts", "lib/orderInventoryReturn.ts",
  "lib/storeRepository.ts", "lib/storeTypes.ts", "lib/storeValidation.ts", "lib/membershipCommerce.ts",
  "lib/fulfillment.ts", "app/store/[slug]/page.tsx", "app/layout.tsx", "app/globals.css",
  "data/websiteData.ts", "public/data/website-data.json", "package.json", "package-lock.json", "tsconfig.json", ".env.local",
];
async function hashes() {
  return Object.fromEntries(await Promise.all(protectedFiles.map(async file => {
    try { return [file, createHash("sha256").update(await fs.readFile(file)).digest("hex")]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return [file, null]; throw error; }
  })));
}
const before = await hashes();
const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6e1-cart-"));
const canonicalRoot = await fs.realpath(root);
const canonicalTemp = await fs.realpath(os.tmpdir());
const previousRoot = process.env.KD_DATA_DIR, previousMount = process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
const livePath = path.join(root, "store", "website-data.json");
const writeSource = async (products: CoffeeCartProduct[] = [product()]) => {
  await fs.mkdir(path.dirname(livePath), { recursive: true });
  await fs.writeFile(livePath, JSON.stringify({
    menu: { products: products.map(entry => ({ ...entry, pvValue: 777.75, kdRedemption: { mode: "enabled" },
      manualSeo: "PRIVATE-SEO-SENTINEL", unrelatedMember: "PRIVATE-MEMBER-SENTINEL" })) },
    privateCustomers: ["PRIVATE-CUSTOMER-SENTINEL"],
  }));
};
const request = (value: unknown, headers: Record<string, string> = {}) => new Request(
  "http://localhost/api/commerce/cart/resolve",
  { method: "POST", headers: { "content-type": "application/json", ...headers },
    body: typeof value === "string" ? value : JSON.stringify(value) },
);
const payload = (items: unknown[] = [legacy()]) => ({ sourceKey: "kdcoffee-cart-v15", items });
try {
  await test("valid coffee model", () => assert.deepEqual(validateUnifiedCartItem(coffee()), coffee()));
  await test("valid Store model without coffee selections", () => assert.deepEqual(validateUnifiedCartItem(store()), store()));
  for (const [label, patch] of [
    ["domain", { domain: "artwork" }], ["missing domain", { domain: undefined }],
    ["empty product", { productId: "" }], ["empty variant", { variantId: "" }],
    ["identifier whitespace", { productId: " P00001 " }],
    ["negative price", { unitPrice: -1 }], ["infinite price", { unitPrice: Infinity }],
    ["NaN price", { unitPrice: NaN }], ["string price", { unitPrice: "700" }],
    ["fractional quantity", { quantity: 1.5 }], ["zero quantity", { quantity: 0 }],
    ["negative quantity", { quantity: -1 }], ["large quantity", { quantity: 100 }],
    ["unsafe quantity", { quantity: Number.MAX_SAFE_INTEGER + 1 }],
    ["negative cap", { quantityLimit: -1 }], ["large cap", { quantityLimit: 100 }],
    ["fractional cap", { quantityLimit: 1.5 }], ["empty name", { name: " " }],
    ["unsafe slug", { slug: "../store" }], ["control text", { name: "bad\u0000name" }],
    ["PV metadata", { pvValue: 77 }], ["reward metadata", { reward: {} }],
  ] as const) await test("model rejects " + label, () => assert.throws(() => validateUnifiedCartItem({ ...coffee(), ...patch }), CommerceCartValidationError));
  await test("zero and decimal prices accepted", () => {
    assert.equal(validateUnifiedCartItem(store({ unitPrice: 0 })).unitPrice, 0);
    assert.equal(validateUnifiedCartItem(store({ unitPrice: 0.25 })).unitPrice, 0.25);
  });
  await test("zero cap remains a snapshot without making an item purchasable", () => assert.equal(validateUnifiedCartItem(coffee({ quantityLimit: 0 })).quantityLimit, 0));
  await test("Store rejects coffeeOptions including undefined own field", () => {
    assert.throws(() => validateUnifiedCartItem({ ...store(), coffeeOptions: {} }));
    assert.throws(() => validateUnifiedCartItem({ ...store(), coffeeOptions: undefined }));
  });
  await test("Store rejects non-default variant", () => assert.throws(() => validateUnifiedCartItem({ ...store(), variantId: "sku-one" })));
  await test("coffee requires explicit roast intent", () => assert.throws(() => validateUnifiedCartItem({ ...coffee(), coffeeOptions: { preparation: "咖啡豆" } })));
  for (const selection of [
    { customRoast: false, preparation: "whole" },
    { customRoast: true, roastLevel: "dark" },
    { customRoast: false, roastLevel: "中焙" },
    { customRoast: "true" }, { customRoast: true, roastLevel: "中焙", roastNote: "x".repeat(161) },
    { customRoast: false, pvValue: 7 },
  ]) await test("coffee rejects invalid selection " + JSON.stringify(selection).slice(0, 60), () =>
    assert.throws(() => validateUnifiedCartItem({ ...coffee(), coffeeOptions: selection })));
  for (const roastLevel of ["淺焙", "淺中焙", "中焙", "中深焙"] as const) await test("canonical roast " + roastLevel, () =>
    assert.equal(validateUnifiedCartItem(coffee({ coffeeOptions: { customRoast: true, roastLevel } })).domain, "coffee"));
  await test("roast note trims edges and preserves internal text", () =>
    assert.equal(normalizeRoastNote(" \nA  B\r\n中文 Café\tC \n"), "A  B\r\n中文 Café\tC"));
  await test("roast note Unicode sequences are not rewritten", () => assert.notEqual(normalizeRoastNote("é"), normalizeRoastNote("e\u0301")));
  await test("same slug across domains has distinct keys", () => {
    assert.notEqual(cartInventoryKey(coffee()), cartInventoryKey(store()));
    assert.notEqual(cartLineKey(coffee()), cartLineKey(store()));
  });
  await test("same product/variant strings still differ by domain", () =>
    assert.notEqual(cartInventoryKey(coffee({ productId: "same", variantId: "default" })), cartInventoryKey(store({ productId: "same" }))));
  await test("Store same identity combines independently of snapshots", () =>
    assert.equal(cartLineKey(store()), cartLineKey(store({ slug: "new-slug", name: "新名稱", unitPrice: 999 }))));
  await test("different Store products differ", () => assert.notEqual(cartLineKey(store()), cartLineKey(store({ productId: "other" }))));
  await test("different coffee SKU differs", () => assert.notEqual(cartLineKey(coffee()), cartLineKey(coffee({ variantId: "other" }))));
  const custom = (note: string, roastLevel: "中焙" | "淺焙" = "中焙") => coffee({
    coffeeOptions: { preparation: "咖啡豆", customRoast: true, roastLevel, roastNote: note },
  });
  await test("different preparation separates lines but shares inventory", () => {
    const ground = coffee({ coffeeOptions: { preparation: "咖啡粉", customRoast: false } });
    assert.notEqual(cartLineKey(coffee()), cartLineKey(ground));
    assert.equal(cartInventoryKey(coffee()), cartInventoryKey(ground));
  });
  await test("different roast separates lines but shares inventory", () => {
    assert.notEqual(cartLineKey(custom("same")), cartLineKey(custom("same", "淺焙")));
    assert.equal(cartInventoryKey(custom("same")), cartInventoryKey(custom("same", "淺焙")));
  });
  await test("different notes separate lines but share inventory", () => {
    assert.notEqual(cartLineKey(custom("A")), cartLineKey(custom("B")));
    assert.equal(cartInventoryKey(custom("A")), cartInventoryKey(custom("B")));
    assert.equal(cartLineKey(custom(" A ")), cartLineKey(custom("A")));
  });
  await test("tuple serialization handles identifier delimiters without collision", () =>
    assert.notEqual(cartInventoryKey(coffee({ productId: "x::y", variantId: "z" })), cartInventoryKey(coffee({ productId: "x", variantId: "y::z" }))));
  await test("exact key tuples and empty optional tokens", () => {
    assert.equal(cartInventoryKey(coffee()), '["coffee","P00001","giotto-awakening-01"]');
    assert.equal(cartLineKey(store()), '["store","store-product-one","default"]');
    assert.equal(cartLineKey(coffee({ coffeeOptions: { customRoast: false } })), '["coffee","P00001","giotto-awakening-01","","standard","",""]');
  });

  await test("valid v16 round trip", () => {
    const memory = new MemoryStorage(); const envelope = emptyEnvelope(); envelope.items = [coffee(), store()];
    assert.equal(writeCartEnvelope(memory, envelope).ok, true);
    assert.deepEqual(readCartStorage(memory), { kind: "current", envelope });
  });
  await test("completed empty v16 prevents repeated legacy lookup", () => {
    const memory = new MemoryStorage();
    memory.data.set(CURRENT_CART_STORAGE_KEY, JSON.stringify(emptyEnvelope()));
    memory.data.set("kdcoffee-cart-v15", JSON.stringify([legacy()]));
    assert.equal(readCartStorage(memory).kind, "current");
    assert.deepEqual(memory.events, ["get:" + CURRENT_CART_STORAGE_KEY]);
  });
  for (const [index, key] of LEGACY_CART_STORAGE_KEYS.entries()) await test("legacy priority " + key, () => {
    const memory = new MemoryStorage();
    for (const candidate of LEGACY_CART_STORAGE_KEYS.slice(index)) memory.data.set(candidate, JSON.stringify([legacy()]));
    const read = readCartStorage(memory); assert.equal(read.kind, "legacy");
    if (read.kind === "legacy") assert.equal(read.sourceKey, key);
  });
  await test("verified write precedes selected source removal", () => {
    const memory = new MemoryStorage();
    memory.data.set("kdcoffee-cart-v15", "[]"); memory.data.set("kdcoffee-cart-v13", "[]");
    assert.deepEqual(writeCartEnvelope(memory, emptyEnvelope()), { ok: true, legacyRemoved: true });
    assert.deepEqual(memory.events, ["set:" + CURRENT_CART_STORAGE_KEY, "get:" + CURRENT_CART_STORAGE_KEY, "remove:kdcoffee-cart-v15"]);
    assert.equal(memory.data.has("kdcoffee-cart-v13"), true);
  });
  await test("write failure preserves legacy", () => {
    const memory = new MemoryStorage(); memory.data.set("kdcoffee-cart-v15", "[]"); memory.failWrite = true;
    assert.deepEqual(writeCartEnvelope(memory, emptyEnvelope()), { ok: false, reason: "WRITE_FAILED" });
    assert.equal(memory.data.get("kdcoffee-cart-v15"), "[]");
  });
  await test("verification failure preserves legacy", () => {
    const memory = new MemoryStorage(); memory.data.set("kdcoffee-cart-v15", "[]"); memory.failVerification = true;
    assert.deepEqual(writeCartEnvelope(memory, emptyEnvelope()), { ok: false, reason: "VERIFICATION_FAILED" });
    assert.equal(memory.data.get("kdcoffee-cart-v15"), "[]");
    assert.equal(memory.events.some(event => event.startsWith("remove:")), false);
  });
  await test("valid but different writeback also fails verification", () => {
    const memory = new MemoryStorage(); const envelope = emptyEnvelope();
    memory.setItem = (key, _value) => memory.data.set(key, JSON.stringify({ ...envelope, items: [coffee()] }));
    assert.deepEqual(writeCartEnvelope(memory, envelope), { ok: false, reason: "VERIFICATION_FAILED" });
  });
  await test("remove failure leaves verified completed marker", () => {
    const memory = new MemoryStorage(); memory.failRemove = true; memory.data.set("kdcoffee-cart-v15", "[]");
    assert.deepEqual(writeCartEnvelope(memory, emptyEnvelope()), { ok: true, legacyRemoved: false });
    assert.equal(readCartStorage(memory).kind, "current");
  });
  await test("storage read failure is structured", () => {
    const memory = new MemoryStorage(); memory.failGet = true;
    assert.deepEqual(readCartStorage(memory), { kind: "invalid", key: CURRENT_CART_STORAGE_KEY, reason: "STORAGE_UNAVAILABLE" });
  });
  await test("empty storage is distinct from completed empty cart", () => assert.deepEqual(readCartStorage(new MemoryStorage()), { kind: "empty" }));
  await test("empty legacy array remains a migration source", () => {
    const memory = new MemoryStorage(); memory.data.set("kdcoffee-cart-v15", "[]");
    assert.deepEqual(readCartStorage(memory), { kind: "legacy", sourceKey: "kdcoffee-cart-v15", items: [] });
  });
  for (const [label, value, reason] of [
    ["malformed JSON", "{broken", "MALFORMED_JSON"],
    ["future version", JSON.stringify({ ...emptyEnvelope(), version: 17 }), "UNSUPPORTED_VERSION"],
    ["invalid envelope", JSON.stringify({ ...emptyEnvelope(), items: [legacy()] }), "INVALID_ENVELOPE"],
    ["unknown metadata", JSON.stringify({ ...emptyEnvelope(), pvValue: 55 }), "INVALID_ENVELOPE"],
  ]) await test("storage rejects " + label + " without deletion", () => {
    const memory = new MemoryStorage(); memory.data.set(CURRENT_CART_STORAGE_KEY, value);
    memory.data.set("kdcoffee-cart-v15", "[]");
    assert.deepEqual(readCartStorage(memory), { kind: "invalid", key: CURRENT_CART_STORAGE_KEY, reason });
    assert.equal(memory.data.get("kdcoffee-cart-v15"), "[]");
  });
  await test("malformed highest-priority legacy fails closed", () => {
    const memory = new MemoryStorage(); memory.data.set("kdcoffee-cart-v15", "{broken"); memory.data.set("kdcoffee-cart-v13", "[]");
    assert.equal(readCartStorage(memory).kind, "invalid"); assert.equal(memory.data.size, 2);
  });
  await test("oversized legacy storage rejected", () => {
    const memory = new MemoryStorage(); memory.data.set("kdcoffee-cart-v15", JSON.stringify(Array(MAX_CART_ITEMS + 1).fill(legacy())));
    assert.equal(readCartStorage(memory).kind, "invalid");
  });
  await test("envelope issues are narrow and validated", () => {
    const envelope = emptyEnvelope(); envelope.migration.unresolved = [{ sourceIndex: 0, reason: "SKU_NOT_FOUND", name: "舊商品" }];
    assert.deepEqual(validateCartEnvelope(envelope), envelope);
    assert.throws(() => validateCartEnvelope({ ...envelope, migration: { ...envelope.migration, unresolved: [{ sourceIndex: 0, reason: "SKU_NOT_FOUND", raw: { private: true } }] } }));
  });
  await test("unknown issue reason and source key rejected", () => {
    assert.throws(() => validateCartEnvelope({ ...emptyEnvelope(), migration: { ...emptyEnvelope().migration, sourceKey: "store-cart" } }));
    assert.throws(() => validateCartEnvelope({ ...emptyEnvelope(), migration: { ...emptyEnvelope().migration, unresolved: [{ sourceIndex: 0, reason: "UNKNOWN" }] } }));
  });
  await test("invalid envelope is never written", () => {
    const memory = new MemoryStorage(); assert.equal(writeCartEnvelope(memory, {}).ok, false); assert.equal(memory.events.length, 0);
  });

  await test("exact slug and option ID resolve live identity and snapshots", () => {
    const result = resolve(); assert.deepEqual(result.items, [coffee()]);
    assert.deepEqual(result.unresolved, []); assert.deepEqual(result.notices, []);
  });
  await test("unique exact label resolves when ID absent", () => assert.equal(resolve({ optionId: undefined, optionLabel: "半磅咖啡豆" }).items[0].variantId, "giotto-awakening-01"));
  await test("explicit invalid ID never falls back to correct label", () => issue("SKU_NOT_FOUND", resolve({ optionId: "removed", optionLabel: "半磅咖啡豆" })));
  await test("ambiguous label is unresolved", () => {
    const p = product(); p.skus![1].label = p.skus![0].label;
    issue("OPTION_AMBIGUOUS", resolve({ optionId: undefined, optionLabel: "半磅咖啡豆" }, [p]));
  });
  await test("missing product unresolved", () => issue("PRODUCT_NOT_FOUND", resolve({ slug: "removed" })));
  await test("ambiguous slug unresolved", () => issue("PRODUCT_AMBIGUOUS", resolve({}, [product(), product({ id: "P00002" })])));
  await test("missing product ID unresolved", () => issue("PRODUCT_ID_MISSING", resolve({}, [product({ id: undefined })])));
  await test("duplicate product ID unresolved", () => issue("PRODUCT_ID_AMBIGUOUS", resolve({}, [product(), product({ slug: "other" })])));
  await test("missing SKU ID unresolved", () => {
    const p = product(); delete p.skus![0].id;
    issue("SKU_ID_MISSING", resolve({ optionId: undefined, optionLabel: "半磅咖啡豆" }, [p]));
  });
  await test("duplicate SKU ID unresolved", () => {
    const p = product(); p.skus![1].id = p.skus![0].id;
    issue("SKU_ID_AMBIGUOUS", resolve({}, [p]));
  });
  await test("globally duplicated SKU ID unresolved", () => issue("SKU_ID_AMBIGUOUS", resolve({}, [product(), product({ id: "P00002", slug: "other" })])));
  await test("disabled SKU cannot migrate to another option", () => {
    const p = product(); p.skus![0].enabled = false; issue("OPTION_DISABLED", resolve({}, [p]));
  });
  for (const patch of [{ active: false }, { purchasable: false }, { status: "hidden" }, { status: "sold_out" }] as const) {
    await test("unavailable coffee product " + JSON.stringify(patch), () => issue("PRODUCT_UNAVAILABLE", resolve({}, [product(patch)])));
  }
  await test("purchase fallback uses persisted IDs", () => {
    const p = product(); p.purchase = p.skus!; p.skus = [];
    assert.equal(resolve({}, [p]).items[0].variantId, "giotto-awakening-01");
  });
  await test("live price change refreshes snapshot with notice", () => {
    const result = resolve({ unitPrice: 600 }); assert.equal(result.items[0].unitPrice, 700);
    assert.deepEqual(result.notices, [{ sourceIndex: 0, reason: "PRICE_CHANGED", previousUnitPrice: 600, currentUnitPrice: 700 }]);
  });
  await test("zero and decimal live prices remain valid", () => {
    for (const price of [0, 500.25]) { const p = product(); p.skus![0].price = price; assert.equal(resolve({}, [p]).items[0].unitPrice, price); }
  });
  await test("validated custom roast intent and note preserved", () => {
    const result = resolve({ quantity: 4, customRoast: true, roastLevel: " 中焙 ", roastNote: " A  B\n中文 " });
    assert.deepEqual(result.items[0].coffeeOptions, { preparation: "咖啡豆", customRoast: true, roastLevel: "中焙", roastNote: "A  B\n中文" });
  });
  await test("missing custom intent is not invented", () => assert.equal(resolve({ customRoast: undefined }).items[0].coffeeOptions.customRoast, false));
  await test("insufficient custom roast quantity unresolved", () => issue("INVALID_COFFEE_SELECTION", resolve({ customRoast: true, roastLevel: "中焙" })));
  await test("custom roast combines eligible coffee rows without merging different notes", () => {
    const result = resolveLegacyCoffeeCart([
      legacy({ quantity: 2, customRoast: true, roastLevel: "中焙", roastNote: "A" }),
      legacy({ quantity: 2, customRoast: true, roastLevel: "中焙", roastNote: "B" }),
    ], [product()]);
    assert.equal(result.items.length, 2); assert.deepEqual(result.unresolved, []);
    assert.equal(cartInventoryKey(result.items[0]), cartInventoryKey(result.items[1]));
  });
  await test("drip cannot gain coffee preparation or custom roast", () => {
    issue("INVALID_COFFEE_SELECTION", resolve({ optionId: "giotto-awakening-02", preparationLabel: "咖啡粉" }));
    issue("INVALID_COFFEE_SELECTION", resolve({ optionId: "giotto-awakening-02", preparationLabel: undefined, quantity: 4, customRoast: true, roastLevel: "中焙" }));
  });
  for (const quantity of [1.5, 0, -1, NaN, Infinity, "2", Number.MAX_SAFE_INTEGER + 1]) await test("invalid legacy quantity " + String(quantity), () => issue("INVALID_QUANTITY", resolve({ quantity })));
  await test("quantity >99 represented without silent clamp", () => {
    const result = resolve({ quantity: 100 }); issue("QUANTITY_LIMIT_EXCEEDED", result);
    assert.equal(result.unresolved[0].requestedQuantity, 100); assert.equal(result.unresolved[0].quantityLimit, 99);
  });
  await test("current stock conflict represented without silent clamp", () => {
    const result = resolve({ quantity: 9 }); issue("QUANTITY_LIMIT_EXCEEDED", result);
    assert.equal(result.unresolved[0].requestedQuantity, 9); assert.equal(result.unresolved[0].quantityLimit, 8);
  });
  await test("zero stock yields unavailable issue", () => {
    const p = product(); p.skus![0].stock = 0;
    const result = resolve({}, [p]); issue("QUANTITY_LIMIT_EXCEEDED", result); assert.equal(result.unresolved[0].quantityLimit, 0);
  });
  await test("shared SKU aggregate demand cannot exceed stock across selections", () => {
    const result = resolveLegacyCoffeeCart([legacy({ quantity: 5 }), legacy({ quantity: 5, preparationLabel: "咖啡粉" })], [product()]);
    assert.equal(result.items.length, 0); assert.equal(result.unresolved.length, 2);
    assert.equal(result.unresolved[0].totalRequestedQuantity, 10);
  });
  await test("same canonical line combines within stock", () => {
    const result = resolveLegacyCoffeeCart([legacy(), legacy()], [product()]);
    assert.equal(result.items.length, 1); assert.equal(result.items[0].quantity, 2);
  });
  await test("legacy domain Store and canonical identity input are rejected", () => {
    issue("INVALID_LEGACY_ITEM", resolve({ domain: "store" }));
    issue("INVALID_LEGACY_ITEM", resolve({ productId: "store-product-one", variantId: "default" }));
  });
  await test("Store-only slug is never resolved by fallback", () => issue("PRODUCT_NOT_FOUND", resolve({ slug: "ceramic-dripper" }, [])));
  await test("invalid legacy object retains only bounded issue snapshot", () => {
    const result = resolveLegacyCoffeeCart([{ slug: "giotto-awakening", name: "x".repeat(500), secret: "PRIVATE-RAW" }], [product()]);
    assert.deepEqual(result.unresolved, [{ sourceIndex: 0, reason: "INVALID_LEGACY_ITEM", slug: "giotto-awakening" }]);
  });
  await test("source price/stock corruption raises integrity error", () => {
    for (const change of [{ price: NaN }, { stock: -1 }, { stock: undefined }]) {
      const p = product(); Object.assign(p.skus![0], change);
      assert.throws(() => resolve({}, [p]), CoffeeCartSourceIntegrityError);
    }
  });
  await test("resolver does not mutate inputs", () => {
    const data = [product()], input = [legacy()]; const previous = structuredClone({ data, input });
    resolveLegacyCoffeeCart(input, data); assert.deepEqual({ data, input }, previous);
  });
  await test("empty resolution produces a completed writable migration", () => {
    const result = resolveLegacyCoffeeCart([], [product()]);
    const envelope = emptyEnvelope(); envelope.items = result.items;
    const memory = new MemoryStorage(); assert.equal(writeCartEnvelope(memory, envelope).ok, true);
    assert.equal(readCartStorage(memory).kind, "current");
  });

  await writeSource();
  await test("API returns bounded canonical coffee result and no-store", async () => {
    const response = await POST(request(payload())); assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { version: 16, sourceKey: "kdcoffee-cart-v15", ...resolve() });
  });
  await test("API accepts maximum bounded input", async () => {
    const response = await POST(request(payload(Array(MAX_CART_ITEMS).fill(legacy({ slug: "removed" })))));
    assert.equal(response.status, 200);
    const body = await response.json() as LegacyCoffeeResolution;
    assert.equal(body.unresolved.length, MAX_CART_ITEMS); assert.equal(body.items.length, 0);
  });
  await test("API accepts empty legacy cart", async () => assert.equal((await POST(request(payload([])))).status, 200));
  for (const [label, value] of [
    ["malformed JSON", "{broken"], ["non-object", []], ["missing items", { sourceKey: "kdcoffee-cart-v15" }],
    ["wrong source", { sourceKey: "store-cart", items: [] }], ["non-array items", { sourceKey: "kdcoffee-cart-v15", items: {} }],
    ["primitive entry", payload([null])], ["unknown envelope", { ...payload(), domain: "store" }],
    ["excessive count", payload(Array(MAX_CART_ITEMS + 1).fill(legacy()))],
  ] as const) await test("API rejects " + label + " with 400", async () => {
    const response = await POST(request(value)); assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "INVALID_REQUEST" });
  });
  await test("API rejects wrong content type", async () => assert.equal((await POST(request(payload(), { "content-type": "text/plain" }))).status, 400));
  await test("API enforces actual body bytes without content-length", async () =>
    assert.equal((await POST(request(JSON.stringify({ padding: "x".repeat(65536) })))).status, 400));
  await test("API enforces declared length", async () => assert.equal((await POST(request(payload(), { "content-length": "65537" }))).status, 400));
  await test("API never creates a Store cart item", async () => {
    const response = await POST(request(payload([legacy({ domain: "store" })])));
    assert.equal(response.status, 200); const body = await response.json() as LegacyCoffeeResolution;
    issue("INVALID_LEGACY_ITEM", body);
  });
  await test("API returns structured per-item quantity conflict", async () => {
    const body = await (await POST(request(payload([legacy({ quantity: 9 })])))).json() as LegacyCoffeeResolution;
    issue("QUANTITY_LIMIT_EXCEEDED", body); assert.equal(body.unresolved[0].quantityLimit, 8);
  });
  await test("API and envelope expose no rewards or unrelated private metadata", async () => {
    const body = await (await POST(request(payload()))).json() as LegacyCoffeeResolution;
    const envelope = emptyEnvelope(); envelope.items = body.items; envelope.migration.notices = body.notices;
    for (const json of [JSON.stringify(body), JSON.stringify(validateCartEnvelope(envelope))]) {
      assert.doesNotMatch(json, /pvValue|kdRedemption|KD.credit|reward|manualSeo|revision|PRIVATE-|privateCustomers|unrelatedMember/iu);
    }
  });
  await test("API reads without writing source or runtime directories", async () => {
    const beforeBytes = await fs.readFile(livePath); const beforeTree = await fs.readdir(root, { recursive: true });
    await POST(request(payload()));
    assert.deepEqual(await fs.readFile(livePath), beforeBytes); assert.deepEqual(await fs.readdir(root, { recursive: true }), beforeTree);
  });
  await test("API source integrity error is 500 and leaks no path", async () => {
    await fs.writeFile(livePath, "{broken");
    const response = await POST(request(payload())); assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "RESOLUTION_FAILED" });
    assert.equal(await fs.readFile(livePath, "utf8"), "{broken");
  });
  await test("API invalid catalog structure is 500", async () => {
    await fs.writeFile(livePath, JSON.stringify({ menu: { products: "invalid" } }));
    assert.equal((await POST(request(payload()))).status, 500);
  });
  await test("API invalid selected stock is 500", async () => {
    const p = product(); p.skus![0].stock = -1; await writeSource([p]);
    const response = await POST(request(payload())); assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "RESOLUTION_FAILED" });
  });
  await test("API missing source returns generic 500 without creating fallback", async () => {
    await fs.unlink(livePath);
    assert.equal((await POST(request(payload()))).status, 500);
    await assert.rejects(fs.access(livePath), { code: "ENOENT" });
  });
  await test("protected files stay unchanged and live provider has no foundation wiring", async () => {
    assert.deepEqual(await hashes(), before);
    for (const file of ["components/commerce/CartProvider.tsx", "app/checkout/page.tsx", "app/store/[slug]/page.tsx"]) {
      assert.doesNotMatch(await fs.readFile(file, "utf8"), /commerceCart|kdcoffee-cart-v16|commerce\/cart\/resolve/u);
    }
  });
} finally {
  if (previousRoot === undefined) delete process.env.KD_DATA_DIR; else process.env.KD_DATA_DIR = previousRoot;
  if (previousMount === undefined) delete process.env.RAILWAY_VOLUME_MOUNT_PATH; else process.env.RAILWAY_VOLUME_MOUNT_PATH = previousMount;
  // Delete only this verified mkdtemp child of the OS temp directory.
  assert.equal(path.dirname(canonicalRoot), canonicalTemp);
  assert.match(path.basename(canonicalRoot), /^kd-j6e1-cart-/u);
  assert.equal(await fs.realpath(root), canonicalRoot);
  await fs.rm(canonicalRoot, { recursive: true, force: true });
  await assert.rejects(fs.access(canonicalRoot), { code: "ENOENT" });
}
console.log("J.6E.1 Unified cart foundation: " + passed + "/" + passed + " PASS; isolated fixture cleaned; protected files unchanged.");
