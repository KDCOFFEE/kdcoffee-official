import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { getLiveWebsiteData } from "../data/websiteData";
import { getWebsiteDataFile, getOrdersDir } from "../lib/storagePaths";
import { priceOrderFromWebsiteData } from "../lib/orderPricing";
import { createStoreRepository } from "../lib/storeRepository";
import { validateStoreCatalog } from "../lib/storeValidation";
import type { StoreCatalog } from "../lib/storeTypes";
import type { CoffeeCartProduct } from "../lib/commerceCartResolver";
import { resolveCommerceOrderItems, toPersistableCommerceOrderLines } from "../lib/commerceOrderResolver";
import { CommerceOrderResolutionError, validateCommerceOrderInput,
  readCommerceOrderLines, commerceOrderInventoryKey } from "../lib/commerceOrderTypes";
import type { CommerceOrderErrorCode, ResolvedCoffeeOrderLine, ResolvedStoreOrderLine } from "../lib/commerceOrderTypes";
import { commerceOrderMoney, priceResolvedCommerceOrderItems } from "../lib/commerceOrderPricing";
import { resolveOrderRewardBasis } from "../lib/orderRewardBasis";
import { readOrder, listOrders } from "../lib/adminOrders";
import { validateUnifiedCartItem, coffeeCheckoutItems, cartCheckoutEligibility } from "../lib/commerceCart";

const savedRoot = process.env.KD_DATA_DIR;
const suite = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f2-resolution-"));
process.env.KD_DATA_DIR = suite;
const timestamp = "2026-10-12T06:37:00.000Z";
let checks = 0, failed = false;
async function check(label: string, operation: () => unknown | Promise<unknown>) {
  try { await operation(); checks++; console.log("PASS " + String(checks).padStart(3, "0") + " " + label); }
  catch (error) { failed = true; console.error("FAIL " + label); throw error; }
}
async function rejected(label: string, operation: () => unknown | Promise<unknown>, code: CommerceOrderErrorCode) {
  await check(label, () => assert.rejects(async () => operation(), (error: unknown) =>
    error instanceof CommerceOrderResolutionError && error.code === code && error.message === code));
}
function coffee(overrides: Record<string, unknown> = {}) {
  return { domain: "coffee", productId: "coffee-a", variantId: "beans-a", quantity: 2,
    coffeeOptions: { preparation: "咖啡豆", customRoast: false }, ...overrides };
}
function store(overrides: Record<string, unknown> = {}) {
  return { domain: "store", productId: "store-a", variantId: "default", quantity: 2, ...overrides };
}
const coffeeProducts: CoffeeCartProduct[] = [
      { id: "coffee-a", slug: "current-coffee", name: "現在咖啡", active: true, purchasable: true,
        purchase: [], skus: [
          { id: "beans-a", label: "半磅咖啡豆", detail: "227g", kind: "beans", price: 500,
            stock: 20, enabled: true, pvEnabled: true, pvValue: 30 },
          { id: "drip-a", label: "濾掛", detail: "10入", kind: "drip", price: 250, stock: 20, enabled: true },
        ] },
      { id: "coffee-b", slug: "second-coffee", name: "另一款", active: true, purchase: [
        { id: "beans-b", label: "半磅咖啡豆", detail: "227g", kind: "beans", price: 600, stock: 20, enabled: true },
      ] },
];
const coffeeData = {
  version: 1, updatedAt: timestamp, campaign: {}, menu: {
    monthLabel: "October", title: "Coffee", intro: "", products: coffeeProducts,
  },
};
type CoffeeFixture = typeof coffeeData;
const coffeePath = getWebsiteDataFile();
const repository = createStoreRepository({ now: () => new Date(timestamp) });
let catalog: StoreCatalog;
async function fixtures(
  changeCoffee?: (value: CoffeeFixture) => void, changeStore?: (value: StoreCatalog) => void,
  allowInvalidStore = false,
) {
  const live = structuredClone(coffeeData), current = structuredClone(catalog);
  changeCoffee?.(live); changeStore?.(current);
  if (!allowInvalidStore) validateStoreCatalog(current);
  await fs.writeFile(coffeePath, JSON.stringify(live));
  await fs.writeFile(repository.catalogPath, JSON.stringify(current));
}
async function tree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function visit(directory: string) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      assert.ok(!entry.isSymbolicLink(), "Fixture tree must contain no symlinks");
      if (entry.isDirectory()) await visit(file);
      else result[path.relative(root, file)] = createHash("sha256").update(await fs.readFile(file)).digest("hex");
    }
  }
  await visit(root); return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
function asCoffee(value: Awaited<ReturnType<typeof resolveCommerceOrderItems>>): ResolvedCoffeeOrderLine {
  const line = value.lines[0]; assert.equal(line.domain, "coffee");
  if (line.domain !== "coffee") throw new Error("Expected Coffee fixture");
  return line;
}
function asStore(value: Awaited<ReturnType<typeof resolveCommerceOrderItems>>): ResolvedStoreOrderLine {
  const line = value.lines[0]; assert.equal(line.domain, "store");
  if (line.domain !== "store") throw new Error("Expected Store fixture");
  return line;
}
try {
  assert.ok(path.resolve(suite).startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.notEqual(suite.toLowerCase(), "f:\\kd_coffee_local_runtime");
  await fs.mkdir(path.dirname(coffeePath), { recursive: true });
  await repository.createSection({ id: "section-a", name: "器具", slug: "equipment", active: true, published: true });
  await repository.createSection({ id: "section-b", name: "食品", slug: "food", active: true, published: true });
  await repository.createCategory({ id: "category-a", sectionId: "section-a", name: "濾杯", slug: "filters", active: true });
  await repository.createCategory({ id: "category-b", sectionId: "section-b", name: "餅乾", slug: "cookies", active: true });
  await repository.createProduct({ id: "store-a", name: "現在濾杯", slug: "current-store", sectionId: "section-a",
    categoryId: "category-a", sku: "DISPLAY-SKU", price: 300, inventory: 20, pvValue: 999,
    active: true, published: true });
  catalog = await repository.read();
  await fixtures();

  await check("valid Coffee input reuses existing selection normalization", () => {
    const input = validateCommerceOrderInput([coffee()]);
    assert.deepEqual(input, [coffee()]);
  });
  await check("valid Store input requires exact default, no Coffee selection", () => assert.deepEqual(validateCommerceOrderInput([store()]), [store()]));
  await check("valid mixed input preserves line order", () => assert.deepEqual(validateCommerceOrderInput([store(), coffee()]), [store(), coffee()]));
  for (const domain of [undefined, null, "", "artwork", "subscription", "Coffee", 0]) {
    await rejected("input rejects explicit/missing invalid domain " + String(domain),
      () => validateCommerceOrderInput([coffee({ domain })]), "INVALID_ITEM");
  }
  for (const [field, value] of [
    ["productId", ""], ["productId", " "], ["productId", " coffee-a"], ["variantId", ""],
    ["variantId", " "], ["variantId", "beans-a\u0000"],
  ] as const) await rejected("input rejects invalid stable ID " + field + " " + JSON.stringify(value),
    () => validateCommerceOrderInput([coffee({ [field]: value })]), "INVALID_ITEM");
  for (const quantity of [0, -1, 1.5, 100, NaN, Infinity, "2", null, Number.MAX_SAFE_INTEGER + 1]) {
    await rejected("input rejects quantity " + String(quantity), () => validateCommerceOrderInput([coffee({ quantity })]), "INVALID_ITEM");
  }
  await check("input accepts upper quantity boundary 99", () => assert.equal(validateCommerceOrderInput([store({ quantity: 99 })])[0].quantity, 99));
  for (const value of [[], null, {}, Array.from({ length: 51 }, () => store())]) {
    await rejected("input rejects empty/non-array/excessive lines", () => validateCommerceOrderInput(value), "INVALID_ITEM");
  }
  await rejected("Store rejects non-default variant", () => validateCommerceOrderInput([store({ variantId: "beans-a" })]), "INVALID_ITEM");
  for (const coffeeOptions of [{ customRoast: false }, undefined, null]) {
    await rejected("Store rejects coffeeOptions property even when undefined", () => validateCommerceOrderInput([store({ coffeeOptions })]), "INVALID_ITEM");
  }
  for (const field of ["price", "unitPrice", "quotedUnitPrice", "lineTotal", "subtotal", "stock", "inventory",
    "quantityLimit", "name", "slug", "salePrice", "pvValue", "PV", "basePV", "effectivePV", "kdRedemption", "KD", "sku"]) {
    for (const input of [coffee(), store()]) await rejected(input.domain + " rejects client authority field " + field,
      () => validateCommerceOrderInput([{ ...input, [field]: 999 }]), "INVALID_ITEM");
  }
  await rejected("input rejects non-enumerable unknown authority field", () => {
    const item = store(); Object.defineProperty(item, "unitPrice", { value: 1 });
    return validateCommerceOrderInput([item]);
  }, "INVALID_ITEM");
  for (const coffeeOptions of [undefined, null, {}, { customRoast: "false" }, { customRoast: false, price: 1 },
    { customRoast: false, roastNote: "inactive" }, { customRoast: false, preparation: "茶" },
    { customRoast: true, roastLevel: "極深焙" }, { customRoast: true, roastLevel: "中焙", roastNote: "a".repeat(161) },
    { customRoast: true, roastLevel: "中焙", roastNote: "bad\u0000note" }]) {
    await rejected("Coffee selection rejects malformed/unapproved options", () => validateCommerceOrderInput([coffee({ coffeeOptions })]), "INVALID_COFFEE_OPTIONS");
  }

  await check("Coffee canonical product+SKU IDs resolve current display and price", async () => {
    const line = asCoffee(await resolveCommerceOrderItems([coffee()]));
    assert.equal(line.productId, "coffee-a"); assert.equal(line.variantId, "beans-a");
    assert.equal(line.optionId, "beans-a"); assert.equal(line.slug, "current-coffee");
    assert.equal(line.name, "現在咖啡"); assert.equal(line.unitPrice, 500); assert.equal(line.lineTotal, 1000);
    assert.equal(line.basePV, 30); assert.equal(line.effectivePV, 30);
  });
  await check("Coffee renamed slug/name/label cannot change inventory identity", async () => {
    await fixtures(value => { const product = value.menu.products[0]; product.slug = "renamed-coffee";
      product.name = "重新命名"; product.skus![0].label = "新名稱"; });
    const line = asCoffee(await resolveCommerceOrderItems([coffee()]));
    assert.equal(line.slug, "renamed-coffee"); assert.equal(line.name, "重新命名"); assert.equal(line.optionLabel, "新名稱");
    assert.equal(commerceOrderInventoryKey(line), '["coffee","coffee-a","beans-a"]');
  });
  await fixtures();
  await rejected("Coffee slug cannot impersonate stable product ID", () => resolveCommerceOrderItems([coffee({ productId: "current-coffee" })]), "PRODUCT_NOT_FOUND");
  await rejected("Coffee option label cannot impersonate explicit missing SKU ID", () => resolveCommerceOrderItems([coffee({ variantId: "半磅咖啡豆" })]), "VARIANT_NOT_FOUND");
  await rejected("Coffee missing variant never falls back by label", () => resolveCommerceOrderItems([coffee({ variantId: "missing" })]), "VARIANT_NOT_FOUND");
  await rejected("Coffee other product SKU ID rejected", () => resolveCommerceOrderItems([coffee({ variantId: "beans-b" })]), "VARIANT_NOT_FOUND");
  await check("Coffee purchase fallback uses persisted option ID", async () => {
    const line = asCoffee(await resolveCommerceOrderItems([coffee({ productId: "coffee-b", variantId: "beans-b" })]));
    assert.equal(line.unitPrice, 600); assert.equal(line.optionId, "beans-b");
  });
  await fixtures(value => { value.menu.products[0].skus![0].enabled = false; });
  await rejected("Coffee disabled SKU rejected", () => resolveCommerceOrderItems([coffee()]), "PRODUCT_UNAVAILABLE");
  for (const flag of ["inactive", "hidden", "sold_out", "purchasable"] as const) {
    await fixtures(value => {
      const product = value.menu.products[0];
      if (flag === "inactive") product.active = false;
      else if (flag === "purchasable") value.menu.products[0] = { ...product, purchasable: false };
      else Object.assign(product, { status: flag });
    });
    await rejected("Coffee current availability " + flag, () => resolveCommerceOrderItems([coffee()]), "PRODUCT_UNAVAILABLE");
  }
  await fixtures(value => { value.menu.products[0].skus![0].price = 730; });
  await check("Coffee current server price re-read each invocation", async () => assert.equal(asCoffee(await resolveCommerceOrderItems([coffee()])).unitPrice, 730));
  await fixtures(value => { value.menu.products[0].skus![0].stock = 1; });
  await rejected("Coffee current stock re-read, insufficient rejected", () => resolveCommerceOrderItems([coffee()]), "OUT_OF_STOCK");
  await fixtures(value => { value.menu.products[0].skus![0].stock = 3; });
  await rejected("Coffee sibling demands qty2+qty2 exceed stock3", () => resolveCommerceOrderItems([coffee(), coffee({ coffeeOptions: { preparation: "咖啡粉", customRoast: false } })]), "OUT_OF_STOCK");
  await fixtures();
  await check("Coffee preparation choice passes unchanged production rules", async () => {
    const line = asCoffee(await resolveCommerceOrderItems([coffee({ coffeeOptions: { preparation: "咖啡粉", customRoast: false } })]));
    assert.equal(line.preparationLabel, "咖啡粉");
  });
  await rejected("Coffee drip preparation fails production selection rules", () => resolveCommerceOrderItems([coffee({ variantId: "drip-a" })]), "INVALID_COFFEE_OPTIONS");
  await rejected("custom roast less than same-product 4 units rejected", () => resolveCommerceOrderItems([coffee({ coffeeOptions: { customRoast: true, roastLevel: "中焙" } })]), "INVALID_COFFEE_OPTIONS");
  await rejected("custom roast on drip rejected even at qty4", () => resolveCommerceOrderItems([coffee({ variantId: "drip-a", quantity: 4, coffeeOptions: { customRoast: true, roastLevel: "中焙" } })]), "INVALID_COFFEE_OPTIONS");
  await check("custom roast sibling lines remain distinct, same SKU demand aggregates", async () => {
    const result = await resolveCommerceOrderItems([
      coffee({ coffeeOptions: { preparation: "咖啡豆", customRoast: true, roastLevel: "淺焙", roastNote: "  保留 Case\n雙  空格  " } }),
      coffee({ coffeeOptions: { preparation: "咖啡粉", customRoast: true, roastLevel: "中焙", roastNote: "另一備註" } }),
    ]);
    assert.equal(result.lines.length, 2); assert.equal(result.inventoryDemand.length, 1);
    assert.equal(result.inventoryDemand[0].quantity, 4);
    assert.equal(result.lines[0].domain, "coffee");
    if (result.lines[0].domain === "coffee") assert.equal(result.lines[0].roastNote, "保留 Case\n雙  空格");
    assert.notDeepEqual(result.lines[0], result.lines[1]);
  });
  await rejected("custom roast different Coffee products cannot meet combined minimum", () => resolveCommerceOrderItems([
    coffee({ coffeeOptions: { customRoast: true, roastLevel: "中焙" } }),
    coffee({ productId: "coffee-b", variantId: "beans-b", coffeeOptions: { customRoast: true, roastLevel: "中焙" } }),
  ]), "INVALID_COFFEE_OPTIONS");
  for (const roastLevel of ["淺焙", "淺中焙", "中焙", "中深焙"]) {
    await check("existing roast vocabulary " + roastLevel, async () => {
      const line = asCoffee(await resolveCommerceOrderItems([coffee({ quantity: 4, coffeeOptions: { customRoast: true, roastLevel } })]));
      assert.equal(line.roastLevel, roastLevel);
    });
  }
  await fixtures(value => { value.menu.products[1].id = "coffee-a"; });
  await rejected("duplicate persisted Coffee product ID fails closed", () => resolveCommerceOrderItems([coffee()]), "PRICE_RESOLUTION_FAILED");
  await fixtures(value => { value.menu.products[1].purchase[0].id = "beans-a"; });
  await rejected("globally ambiguous Coffee SKU ID fails closed", () => resolveCommerceOrderItems([coffee()]), "PRICE_RESOLUTION_FAILED");
  await fixtures(value => { value.menu.products[1].slug = "current-coffee"; });
  await rejected("ambiguous server slug cannot redirect canonical Coffee resolution", () => resolveCommerceOrderItems([coffee()]), "PRICE_RESOLUTION_FAILED");
  await fixtures();

  await check("Store active/published graph resolves stable ID and default", async () => {
    const line = asStore(await resolveCommerceOrderItems([store()]));
    assert.equal(line.productId, "store-a"); assert.equal(line.variantId, "default");
    assert.equal(line.sku, "DISPLAY-SKU"); assert.equal(line.unitPrice, 300);
  });
  await check("Store current slug/name/SKU changes do not alter inventory identity", async () => {
    await fixtures(undefined, value => { const product = value.products[0]; product.slug = "renamed-store";
      product.name = "重新命名器具"; product.sku = "RENAMED-DISPLAY"; });
    const line = asStore(await resolveCommerceOrderItems([store()]));
    assert.equal(line.slug, "renamed-store"); assert.equal(line.name, "重新命名器具"); assert.equal(line.sku, "RENAMED-DISPLAY");
    assert.equal(commerceOrderInventoryKey(line), '["store","store-a","default"]');
  });
  await fixtures();
  await rejected("Store slug is not authoritative ID", () => resolveCommerceOrderItems([store({ productId: "current-store" })]), "PRODUCT_NOT_FOUND");
  await rejected("Store display SKU is not authoritative ID", () => resolveCommerceOrderItems([store({ productId: "DISPLAY-SKU" })]), "PRODUCT_NOT_FOUND");
  await rejected("missing Store stable ID rejected", () => resolveCommerceOrderItems([store({ productId: "missing" })]), "PRODUCT_NOT_FOUND");
  for (const flag of ["inactive", "unpublished", "archived"] as const) {
    await fixtures(undefined, value => { const product = value.products[0]; product.published = false;
      if (flag === "inactive") product.active = false;
      if (flag === "archived") { product.active = false; product.archivedAt = timestamp; } });
    await rejected("Store product " + flag + " rejected", () => resolveCommerceOrderItems([store()]), "PRODUCT_UNAVAILABLE");
  }
  for (const flag of ["inactive", "unpublished", "archived"] as const) {
    await fixtures(undefined, value => { const section = value.sections[0]; section.published = false;
      value.products[0].published = false;
      if (flag === "inactive") section.active = false;
      if (flag === "archived") {
        section.active = false; section.archivedAt = timestamp;
        value.categories[0].active = false; value.categories[0].archivedAt = timestamp;
        value.products[0].active = false; value.products[0].archivedAt = timestamp;
      } });
    await rejected("Store section " + flag + " rejected", () => resolveCommerceOrderItems([store()]), "PRODUCT_UNAVAILABLE");
  }
  for (const flag of ["inactive", "archived"] as const) {
    await fixtures(undefined, value => { const category = value.categories[0]; category.active = false;
      value.products[0].published = false;
      if (flag === "archived") {
        category.archivedAt = timestamp; value.products[0].active = false; value.products[0].archivedAt = timestamp;
      } });
    await rejected("Store category " + flag + " rejected", () => resolveCommerceOrderItems([store()]), "PRODUCT_UNAVAILABLE");
  }
  for (const flag of ["missing-section", "missing-category", "cross-section-category"] as const) {
    await fixtures(undefined, value => {
      if (flag === "missing-section") value.products[0].sectionId = "missing";
      else value.products[0].categoryId = flag === "missing-category" ? "missing" : "category-b";
    }, true);
    await rejected("invalid Store catalog graph " + flag + " fails closed", () => resolveCommerceOrderItems([store()]), "PRICE_RESOLUTION_FAILED");
  }
  await fixtures(undefined, value => { delete value.products[0].categoryId; });
  await check("Store optional category absent is valid", async () => assert.equal(asStore(await resolveCommerceOrderItems([store()])).productId, "store-a"));
  for (const [label, price, salePrice, expected] of [
    ["normal", 300, undefined, 300], ["sale", 300, 180, 180], ["zero sale", 300, 0, 0],
    ["zero price", 0, undefined, 0], ["equal sale", 300, 300, 300], ["zero price and sale", 0, 0, 0],
  ] as const) {
    await fixtures(undefined, value => {
      value.products[0] = { ...value.products[0], price, ...(salePrice !== undefined ? { salePrice } : {}) };
      assert.equal(Object.hasOwn(value.products[0], "salePrice"), salePrice !== undefined);
    });
    await check("Store " + label + " follows exact effective-price semantics", async () => {
      const result = await resolveCommerceOrderItems([store({ quantity: 3 })]);
      assert.equal(result.lines[0].unitPrice, expected); assert.equal(result.lines[0].lineTotal, expected * 3);
      assert.equal(result.itemsSubtotal, expected * 3);
    });
  }
  await fixtures(undefined, value => { value.products[0].inventory = 1; });
  await rejected("Store current inventory enforcement", () => resolveCommerceOrderItems([store()]), "OUT_OF_STOCK");
  await fixtures(undefined, value => { value.products[0].inventory = 3; });
  await rejected("Store duplicate lines aggregate qty2+qty2 against stock3", () => resolveCommerceOrderItems([store(), store()]), "OUT_OF_STOCK");
  await fixtures(undefined, value => { value.products[0].inventory = 4; });
  await check("Store inventory exact boundary qty2+qty2 accepted", async () => {
    const result = await resolveCommerceOrderItems([store(), store()]);
    assert.equal(result.inventoryDemand.length, 1); assert.equal(result.inventoryDemand[0].quantity, 4);
  });
  await fixtures(undefined, value => { value.products[0].inventory = 0; });
  await rejected("Store inventory zero remains unavailable", () => resolveCommerceOrderItems([store()]), "OUT_OF_STOCK");
  await fixtures();
  await check("Coffee subtotal/line snapshots equal unchanged production helper", async () => {
    const input = [coffee(), coffee({ variantId: "drip-a", coffeeOptions: { customRoast: false } })];
    const result = await resolveCommerceOrderItems(input);
    const old = priceOrderFromWebsiteData(await getLiveWebsiteData(), [
      { slug: "current-coffee", optionId: "beans-a", optionLabel: "半磅咖啡豆", quotedUnitPrice: 500, quantity: 2, preparationLabel: "咖啡豆", customRoast: false },
      { slug: "current-coffee", optionId: "drip-a", optionLabel: "濾掛", quotedUnitPrice: 250, quantity: 2, customRoast: false },
    ]);
    assert.equal(result.itemsSubtotal, old.priced.subtotal);
    result.lines.forEach((line, index) => {
      const { domain, productId, variantId, ...snapshots } = line;
      assert.equal(domain, "coffee"); assert.equal(productId, "coffee-a");
      assert.equal(variantId, old.priced.items[index].optionId);
      // Production standard roast omits these values during JSON persistence.
      assert.deepEqual(JSON.parse(JSON.stringify(snapshots)), JSON.parse(JSON.stringify(old.priced.items[index])));
    });
  });
  await check("custom Coffee subtotal and roast snapshots equal production", async () => {
    const input = coffee({ quantity: 4, coffeeOptions: { preparation: "咖啡粉", customRoast: true, roastLevel: "中焙", roastNote: "保留\n大小寫" } });
    const result = await resolveCommerceOrderItems([input]);
    const old = priceOrderFromWebsiteData(await getLiveWebsiteData(), [
      { slug: "current-coffee", optionId: "beans-a", optionLabel: "半磅咖啡豆", quotedUnitPrice: 500,
        quantity: 4, preparationLabel: "咖啡粉", customRoast: true, roastLevel: "中焙", roastNote: "保留\n大小寫" },
    ]);
    assert.equal(result.itemsSubtotal, old.priced.subtotal);
    assert.equal(asCoffee(result).roastNote, old.priced.items[0].roastNote);
    assert.equal(asCoffee(result).roastLevel, old.priced.items[0].roastLevel);
  });
  await check("Store-only subtotal is authoritative qty multiplication", async () => assert.equal((await resolveCommerceOrderItems([store({ quantity: 3 })])).itemsSubtotal, 900));
  await check("mixed subtotal adds Coffee and Store while retaining requested order", async () => {
    const result = await resolveCommerceOrderItems([store(), coffee()]);
    assert.equal(result.itemsSubtotal, 1600); assert.deepEqual(result.lines.map(line => line.domain), ["store", "coffee"]);
    assert.equal(result.inventoryDemand.length, 2);
  });
  await fixtures(value => { value.menu.products[0].skus![0].price = 0; });
  await check("Coffee zero-price unit/line/subtotal preserved", async () => {
    const result = await resolveCommerceOrderItems([coffee()]); assert.equal(result.itemsSubtotal, 0); assert.equal(result.lines[0].unitPrice, 0);
  });
  for (const price of [500.5, -1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
    await fixtures(value => { value.menu.products[0].skus![0].price = price; });
    await rejected("Coffee rejects invalid integer-TWD price " + String(price), () => resolveCommerceOrderItems([coffee()]), "PRICE_RESOLUTION_FAILED");
  }
  await fixtures(undefined, value => { value.products[0].price = 300.5; });
  await rejected("Store fractional current price is not silently rounded", () => resolveCommerceOrderItems([store()]), "PRICE_RESOLUTION_FAILED");
  await fixtures(undefined, value => { value.products[0].salePrice = 100.5; });
  await rejected("Store fractional effective sale is not rounded", () => resolveCommerceOrderItems([store()]), "PRICE_RESOLUTION_FAILED");
  for (const price of [Number.MAX_SAFE_INTEGER]) {
    await fixtures(value => { value.menu.products[0].skus![0].price = price; });
    await rejected("line-total safe integer overflow rejected", () => resolveCommerceOrderItems([coffee()]), "PRICE_RESOLUTION_FAILED");
    await rejected("subtotal safe integer overflow rejected", () => resolveCommerceOrderItems([coffee({ quantity: 1 }), coffee({ quantity: 1 })]), "PRICE_RESOLUTION_FAILED");
  }
  await fixtures();
  await check("pure pricing rejects inconsistent resolved lineTotal", async () => {
    const result = await resolveCommerceOrderItems([store()]);
    assert.throws(() => priceResolvedCommerceOrderItems([{ ...result.lines[0], lineTotal: 1 }]),
      error => error instanceof CommerceOrderResolutionError && error.code === "PRICE_RESOLUTION_FAILED");
  });
  await check("pure integer money rejects client-like coercion and fractions", () => {
    for (const value of ["0", 0.5, -1, Infinity, NaN]) assert.throws(() => commerceOrderMoney(value), CommerceOrderResolutionError);
    assert.equal(commerceOrderMoney(0), 0);
  });
  await fs.writeFile(coffeePath, "{invalid-private-coffee");
  await rejected("corrupt Coffee source has sanitized deterministic error", () => resolveCommerceOrderItems([coffee()]), "PRICE_RESOLUTION_FAILED");
  await fixtures();
  await fs.writeFile(repository.catalogPath, "{invalid-private-store");
  await rejected("corrupt Store source has sanitized deterministic error", () => resolveCommerceOrderItems([store()]), "PRICE_RESOLUTION_FAILED");
  await fixtures();

  await check("persistable Coffee and Store DTOs keep explicit discriminants", async () => {
    const result = await resolveCommerceOrderItems([coffee(), store()]);
    assert.deepEqual(toPersistableCommerceOrderLines(result.lines), result.lines);
    assert.deepEqual(readCommerceOrderLines(result.lines), result.lines);
  });
  await check("Store resolved and persisted lines have no Coffee/PV/KD/subscription fields", async () => {
    const line = asStore(await resolveCommerceOrderItems([store()]));
    const persisted = toPersistableCommerceOrderLines([line])[0];
    for (const field of ["coffeeOptions", "optionId", "optionLabel", "optionDetail", "preparationLabel",
      "customRoast", "roastLevel", "roastNote", "pvValue", "pvEnabled", "basePV", "effectivePV", "kdRedemption", "subscriptionEligible"]) {
      assert.ok(!Object.hasOwn(line, field)); assert.ok(!Object.hasOwn(persisted, field));
    }
  });
  await check("Store-only persisted line excluded by protected J.6F.2A reward basis", async () => {
    const result = await resolveCommerceOrderItems([store()]);
    const b = resolveOrderRewardBasis({ items: toPersistableCommerceOrderLines(result.lines), subtotal: result.itemsSubtotal });
    assert.equal(b.hasStore, true); assert.equal(b.coffeeEligible, false); assert.equal(b.coffeeEligibleQuantity, 0);
    assert.equal(b.coffeeEffectivePV, 0); assert.equal(b.coffeeMerchandiseSubtotal, 0);
  });
  await check("mixed persisted DTO preserves Coffee basis and credit fail-closed", async () => {
    const result = await resolveCommerceOrderItems([coffee(), store()]);
    const order = { items: toPersistableCommerceOrderLines(result.lines), subtotal: result.itemsSubtotal };
    const b = resolveOrderRewardBasis(order);
    assert.equal(b.hasStore, true); assert.equal(b.coffeeMerchandiseSubtotal, 1000);
    assert.equal(b.coffeeEligibleQuantity, 2); assert.equal(b.coffeeEffectivePV, 60);
    assert.equal(b.rewardMerchandiseAmount, 1000);
    assert.equal(resolveOrderRewardBasis({ ...order, credit: { appliedAmount: 200 } }).monetaryBasisStatus, "mixed_credit_allocation_unresolved");
  });
  const orderNumber = "KD20261012-9602";
  const orderPath = path.join(getOrdersDir(), orderNumber + ".json");
  const historical = { orderNumber, createdAt: timestamp, status: "completed", orderMode: "studio_pickup",
    items: [{ slug: "old-coffee", name: "歷史咖啡", optionId: "old-sku", optionLabel: "半磅咖啡豆",
      quantity: 2, unitPrice: 500, lineTotal: 1000, effectivePV: 30 }] };
  await fs.mkdir(getOrdersDir(), { recursive: true });
  await fs.writeFile(orderPath, JSON.stringify(historical, null, 2));
  await check("historical readOrder/listOrders normalize only in narrow in-memory helper", async () => {
    const bytes = await fs.readFile(orderPath, "utf8");
    const order = await readOrder(orderNumber); assert.ok(order);
    const lines = readCommerceOrderLines(order.items);
    assert.equal(lines[0].domain, "coffee"); assert.equal(lines[0].name, "歷史咖啡");
    assert.equal(Object.hasOwn(order.items[0], "domain"), false);
    assert.equal(Object.hasOwn(lines[0], "productId"), false);
    const listed = await listOrders(); assert.equal(listed.length, 1);
    assert.equal(readCommerceOrderLines(listed[0].items)[0].domain, "coffee");
    assert.equal(await fs.readFile(orderPath, "utf8"), bytes);
  });
  await check("legacy narrow reader preserves fractional historical snapshot without repricing", () => {
    const legacy = { name: "Historical", quantity: 1, unitPrice: 1.5, lineTotal: 1.5 };
    const line = readCommerceOrderLines([legacy])[0]; assert.equal(line.unitPrice, 1.5);
    assert.equal(Object.hasOwn(legacy, "domain"), false);
  });
  await check("explicit Coffee historical line remains readable without inventing IDs", () =>
    assert.equal(readCommerceOrderLines([{ ...historical.items[0], domain: "coffee" }])[0].domain, "coffee"));
  for (const domain of [undefined, null, "artwork", "", false, 42]) {
    await rejected("historical reader explicit unknown domain " + String(domain) + " fails closed",
      () => readCommerceOrderLines([{ ...historical.items[0], domain }]), "INVALID_ITEM");
  }
  await rejected("historical reader does not filter invalid lines from mixed array",
    () => readCommerceOrderLines([historical.items[0], { ...historical.items[0], domain: "unknown" }]), "INVALID_ITEM");
  await check("historical Store reader rejects fake Coffee fields", async () => {
    const line = asStore(await resolveCommerceOrderItems([store()]));
    for (const field of ["coffeeOptions", "optionId", "optionLabel", "preparationLabel", "customRoast", "roastLevel"]) {
      assert.throws(() => readCommerceOrderLines([{ ...line, [field]: undefined }]), CommerceOrderResolutionError);
    }
  });
  const storeCart = validateUnifiedCartItem({ ...store(), slug: "current-store", name: "濾杯", unitPrice: 300 });
  const coffeeCart = validateUnifiedCartItem({ ...coffee(), slug: "current-coffee", name: "咖啡", unitPrice: 500, optionLabel: "半磅咖啡豆", optionDetail: "227g" });
  await check("live checkout remains Coffee-only; Store and mixed whole carts blocked", () => {
    assert.equal(cartCheckoutEligibility([coffeeCart], "READY", []), "ELIGIBLE");
    for (const items of [[storeCart], [coffeeCart, storeCart]]) {
      assert.equal(cartCheckoutEligibility(items, "READY", []), "STORE_CHECKOUT_NOT_ENABLED");
      assert.throws(() => coffeeCheckoutItems(items));
    }
  });

  const before = await tree(suite);
  await resolveCommerceOrderItems([coffee(), store()]);
  const after = await tree(suite);
  await check("resolver leaves Coffee inventory file byte-for-byte unchanged", () =>
    assert.equal(after[path.relative(suite, coffeePath)], before[path.relative(suite, coffeePath)]));
  await check("resolver leaves Store catalog byte-for-byte unchanged", () =>
    assert.equal(after[path.relative(suite, repository.catalogPath)], before[path.relative(suite, repository.catalogPath)]));
  await check("resolver creates no receipt/journal/order/reward/subscription files or backups", () => assert.deepEqual(after, before));
  await check("resolver does not alter existing historical order file", () =>
    assert.equal(after[path.relative(suite, orderPath)], before[path.relative(suite, orderPath)]));
  await check("resolver rejected demand also has no mutation", async () => {
    await assert.rejects(() => resolveCommerceOrderItems([coffee({ quantity: 99 }), store()]), CommerceOrderResolutionError);
    assert.deepEqual(await tree(suite), before);
  });
  console.log("J.6F.2 mixed-order resolution: PASS " + checks + "/" + checks);
} catch (error) {
  failed = true; console.error(error); console.error("Isolated fixture retained: " + suite); process.exitCode = 1;
} finally {
  if (savedRoot === undefined) delete process.env.KD_DATA_DIR; else process.env.KD_DATA_DIR = savedRoot;
  if (!failed) {
    const resolved = path.resolve(suite), temporaryRoot = path.resolve(os.tmpdir()) + path.sep;
    if (!resolved.startsWith(temporaryRoot) || !path.basename(resolved).startsWith("kd-j6f2-resolution-")) {
      throw new Error("Unsafe fixture cleanup target");
    }
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
