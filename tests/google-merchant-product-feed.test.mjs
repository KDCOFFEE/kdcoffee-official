import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modules = new Map();
const testModules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path).exports;
  const filename = join(project, /\.tsx?$/u.test(path) ? path : path + ".ts");
  const m = { exports: {} };
  modules.set(path, m);
  const js = ts.transpileModule(readFileSync(filename, "utf8"), { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("module", "exports", "require", js)(m, m.exports, name => {
    if (testModules.has(name)) return testModules.get(name);
    if (name === "server-only") return {};
    if (name === "@/public/data/website-data.json") return { campaign: {}, menu: { products: [] } };
    if (name.startsWith("@/")) return load(name.slice(2));
    if (name.startsWith(".")) return load(join(dirname(path), name).replaceAll("\\", "/"));
    return require(name);
  });
  return m.exports;
}

const { GET } = load("app/google/merchant/products.tsv/route");

const { resolveStoreCommerceOffer } = load("lib/storeCommerceOffer");
const { resolveCommerceOrderItems } = load("lib/commerceOrderResolver");
const { priceOrderFromWebsiteData } = load("lib/orderPricing");
const { readLiveMerchantProductFeed } = load("lib/googleMerchantProductFeedSource");
const url = "https://www.kdcoffee1962.com/google/merchant/products.tsv";
const stamp = "2026-11-19T00:00:00.000Z";
const image = "/uploads/artworks/first-coffee/synthetic.png";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
const approvedAsset = (skuIds, sha256 = createHash("sha256").update(png).digest("hex")) =>
  ({ path: image, merchantApproval: { skuIds, sha256 } });
const base = { revision: 1, createdAt: stamp, updatedAt: stamp, archivedAt: null,
  active: true, sortOrder: 0, description: "Synthetic public description" };
const section = (id, slug) => ({ ...base, id, slug, name: slug, published: true, shortDescription: "",
  showOnHomepage: true, homepageSortOrder: 0, showInNavigation: true, navigationSortOrder: 0, seoTitle: "", seoDescription: "" });
const media = url => ({ type: "image", url, alt: "Test product" });
const store = (id, slug, overrides = {}) => ({ ...base, id, slug, name: slug, sectionId: "gear",
  published: true, shortDescription: "Public store item", productType: "equipment", sku: id.toUpperCase(),
  price: 1000, inventory: 4, featured: false, heroMedia: media(image), gallery: [], specifications: [],
  pvValue: 0, subscriptionEligible: false, ...overrides });
const coffee = (overrides = {}) => ({ id: "coffee1", slug: "first-coffee", name: "Coffee", active: true,
  inMonthlyMenu: true, purchasable: true, status: "active", subtitle: "Public coffee",
  assets: { productPhoto: approvedAsset(["sku1", "sku2"]) }, skus: [
    { id: "sku1", kind: "beans", label: "半磅咖啡豆", detail: "227g", price: 500, stock: 2, enabled: true },
    { id: "sku2", kind: "drip", label: "12g", detail: "", price: 80, stock: 0, enabled: true },
  ], ...overrides });
const req = (target = url) => new Request(target);
const fixtures = async fn => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "kd-merchant-product-")));
  const cwd = process.cwd();
  const keys = ["KD_DATA_DIR", "RAILWAY_VOLUME_MOUNT_PATH", "GOOGLE_MERCHANT_PRODUCT_FEED_ENABLED",
    "GOOGLE_MERCHANT_COFFEE_FEED_ENABLED", "STORE_COMMERCE_ENABLED", "CLOUDINARY_CLOUD_NAME",
    "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_ID"];
  const old = keys.map(key => process.env[key]);
  const oldFetch = globalThis.fetch;
  try {
    process.chdir(root);
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, { KD_DATA_DIR: root, GOOGLE_MERCHANT_PRODUCT_FEED_ENABLED: "true", STORE_COMMERCE_ENABLED: "true" });
    globalThis.fetch = () => { throw Error("Unexpected external request"); };
    const coffeeFile = join(root, "store", "website-data.json");
    const storeFile = join(root, "store-domain", "catalog.json");
    const imageFile = join(root, "public", image);
    for (const file of [coffeeFile, storeFile, imageFile]) await mkdir(dirname(file), { recursive: true });
    const writeCoffee = async products => {
      const value = { version: 1, updatedAt: stamp, menu: { products } };
      await writeFile(coffeeFile, JSON.stringify(value));
      return value;
    };
    const writeStore = (products, sections = [section("gear", "equipment"), section("gift", "gift")]) =>
      writeFile(storeFile, JSON.stringify({ schemaVersion: 1, revision: 1, updatedAt: stamp, sections, categories: [], products }));
    await writeFile(imageFile, png);
    await fn({ writeCoffee, writeStore, coffeeFile, storeFile, imageFile });
  } finally {
    process.chdir(cwd);
    globalThis.fetch = oldFetch;
    keys.forEach((key, i) => old[i] === undefined ? delete process.env[key] : process.env[key] = old[i]);
    await rm(root, { recursive: true, force: true });
  }
};
async function rows() {
  const response = await GET(req());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /tab-separated-values/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  return (await response.text()).trimEnd().split("\n").slice(1).map(line => line.split("\t"));
}

test("Coffee SKU URLs, Gift deduplication, Store promotions and checkout unit prices", () => fixtures(async f => {
  const website = await f.writeCoffee([coffee()]);
  await f.writeStore([
    store("gift1", "gift-box", { sectionId: "gift", productType: "gift" }),
    store("gear1", "dripper", { salePrice: 850 }),
  ]);
  const actual = await rows();
  console.log("REFERENCE_TSV " + JSON.stringify(actual));
  assert.equal(actual.length, 3);
  assert.equal(actual.filter(row => row[3].endsWith("/store/gift-box")).length, 1);
  const sku = actual.find(row => row[3].endsWith("?sku=sku1"));
  assert.equal(sku[0], "kd-coffee-coffee1-sku1");
  assert.equal(sku[6], priceOrderFromWebsiteData(website, [{ slug: "first-coffee", optionId: "sku1",
    optionLabel: "半磅咖啡豆", quotedUnitPrice: 500, quantity: 1 }]).priced.items[0].unitPrice + " TWD");
  assert.equal(actual.some(row => row[3].endsWith("?sku=sku2")), false);
  const gear = actual.find(row => row[3].endsWith("/store/dripper"));
  assert.equal(gear[6], (await resolveStoreCommerceOffer("dripper")).unitPrice + " TWD");
  const checkout = await resolveCommerceOrderItems([
    { domain: "coffee", productId: "coffee1", variantId: "sku1", quantity: 1, coffeeOptions: { customRoast: false } },
    { domain: "store", productId: "gear1", variantId: "default", quantity: 1 },
  ]);
  assert.deepEqual(checkout.lines.map(line => line.unitPrice + " TWD"), [sku[6], gear[6]]);
}));

test("Refreshes price, images, inventory and publish state on the next read", () => fixtures(async f => {
  const item = coffee();
  await f.writeCoffee([item]);
  await f.writeStore([store("gear1", "dripper", { inventory: 0 })]);
  assert.equal((await rows()).find(row => row[3].endsWith("/dripper"))[5], "out_of_stock");
  item.skus[0].price = 575;
  item.skus[0].stock = 0;
  item.skus[1].stock = 7;
  await f.writeCoffee([item, coffee({ id: "hidden", slug: "hidden", status: "hidden", skus: [] })]);
  await f.writeStore([store("gear1", "dripper"), store("hidden", "hidden", { published: false })]);
  await writeFile(f.imageFile, "not an image");
  assert.deepEqual(await rows(), []);
  await writeFile(f.imageFile, png);
  const actual = await rows();
  assert.equal(actual.length, 2);
  assert.equal(actual.find(row => row[3].endsWith("?sku=sku1"))[6], "575 TWD");
  assert.equal(actual.find(row => row[3].endsWith("?sku=sku1"))[5], "out_of_stock");
  assert.equal(actual.some(row => row[3].endsWith("?sku=sku2")), false);
  assert.equal(actual.find(row => row[3].endsWith("/dripper"))[5], "in_stock");
}));

test("Missing SKU, bad price or image, inquiry-only gifts and hidden parent are excluded per item", () => fixtures(async f => {
  await f.writeCoffee([coffee(), coffee({ id: "missing", slug: "preview", status: "coming_soon", skus: [] })]);
  await f.writeStore([
    store("gift1", "custom-gift", { sectionId: "gift", productType: "gift", sku: "GIFT-CUSTOM" }),
    store("badprice", "bad-price", { salePrice: 19.5 }),
    store("badimage", "bad-image", { heroMedia: media("/images/absent.png") }),
    store("hiddengear", "hidden-gear", { sectionId: "hidden", published: false }),
  ], [section("gear", "equipment"), section("gift", "gift"), { ...section("hidden", "hidden"), published: false }]);
  const result = await readLiveMerchantProductFeed();
  assert.equal(result.rows, 1);
  assert.deepEqual(new Set(result.exclusions.map(row => row.reason)), new Set([
    "missing_public_persisted_sku", "inquiry_only", "invalid_store_offer", "missing_or_invalid_image",
  ]));
}));

test("Legal empty sources produce only the TSV header; missing or corrupt source blocks all rows", () => fixtures(async f => {
  await f.writeCoffee([]);
  await f.writeStore([], []);
  const empty = await GET(req());
  assert.equal(empty.status, 200);
  assert.equal((await empty.text()).trimEnd().split("\n").length, 1);
  await f.writeCoffee([coffee()]);
  await rm(f.storeFile);
  const blocked = await GET(req());
  assert.equal(blocked.status, 503);
  assert.doesNotMatch(await blocked.text(), /sku1|id\ttitle/);
  await writeFile(f.storeFile, "{bad");
  assert.equal((await GET(req())).status, 503);
}));

test("Disabled flags and untrusted origin stop before sources", () => fixtures(async () => {
  delete process.env.GOOGLE_MERCHANT_PRODUCT_FEED_ENABLED;
  assert.equal((await GET(req())).status, 503);
  process.env.GOOGLE_MERCHANT_PRODUCT_FEED_ENABLED = "true";
  for (const target of [url.replace("https:", "http:"), url.replace("www.", ""), url + "?debug=1"]) {
    assert.equal((await GET(req(target))).status, 503);
  }


}));

test("Canonical CDN images are bounded and rechecked; image or catalog change during reading returns 503", () => fixtures(async f => {
  const cloud = "https://res.cloudinary.com/synthetic/image/upload/v123/gift/photo.png";
  process.env.CLOUDINARY_CLOUD_NAME = "synthetic";
  await f.writeCoffee([]);
  await f.writeStore([store("gift1", "gift-box", { heroMedia: media(cloud) })]);
  let calls = 0;
  globalThis.fetch = async (target, options) => {
    assert.equal(target, cloud);
    assert.equal(options.redirect, "manual");
    assert.equal(options.credentials, "omit");
    calls++;
    return new Response(png, { headers: { "content-type": "image/png" } });
  };
  assert.equal((await rows())[0][4], cloud);
  assert.equal(calls, 2);

  globalThis.fetch = async () => {
    calls++;
    const bytes = calls === 4 ? Buffer.concat([png, Buffer.from([1])]) : png;
    return new Response(bytes, { headers: { "content-type": "image/png" } });
  };
  assert.equal((await GET(req())).status, 503);

  globalThis.fetch = async () => {
    await f.writeStore([]);
    return new Response(png, { headers: { "content-type": "image/png" } });
  };
  assert.equal((await GET(req())).status, 503);
}));

test("Railway HTTPS ingress permits only the canonical Host with a local Next listener", () => fixtures(async f => {
  await f.writeCoffee([]);
  await f.writeStore([], []);
  const local = "https://127.0.0.1:8080/google/merchant/products.tsv";
  const headers = { host: "www.kdcoffee1962.com", "x-forwarded-host": "www.kdcoffee1962.com", "x-forwarded-proto": "https" };
  assert.equal((await GET(new Request(local, { headers }))).status, 503);
  process.env.RAILWAY_SERVICE_ID = "synthetic";
  process.env.RAILWAY_ENVIRONMENT_ID = "synthetic";
  assert.equal((await GET(new Request(local, { headers }))).status, 200);
  assert.equal((await GET(new Request(local, { headers: { ...headers, host: "other.example" } }))).status, 503);
  assert.equal((await GET(new Request(local, { headers: { ...headers, "x-forwarded-proto": "http" } }))).status, 503);
  assert.equal((await GET(new Request(local, { headers: { ...headers, "x-forwarded-host": "other.example" } }))).status, 503);
}));

test("A catalog over the snapshot resource limit fails closed", () => fixtures(async f => {
  await f.writeCoffee(Array(5001).fill(coffee()));
  await f.writeStore([]);
  assert.equal((await GET(req())).status, 503);
}));

const cdnBase = "https://res.cloudinary.com/synthetic/image/upload";
const photoId = "kd-coffee/images/uploaded-product-hero";
const optimizedPhoto = {
  type: "image", provider: "cloudinary", publicId: photoId, format: "png", alt: "Product package",
  url: cdnBase + "/c_limit,f_auto,q_auto,w_2400/v1/" + photoId + "?_a=BAMAAAkS0",
};
const originalPhoto = cdnBase + "/v1/" + photoId + ".png";

test("Store and Gifts use the same verified original for CMS-optimized images", () => fixtures(async f => {
  process.env.CLOUDINARY_CLOUD_NAME = "synthetic";
  await f.writeCoffee([coffee()]);
  await f.writeStore([
    store("gift1", "gift-box", { sectionId: "gift", productType: "gift", heroMedia: optimizedPhoto }),
    store("gear1", "dripper", { salePrice: 850, gallery: [optimizedPhoto], heroMedia: media("/images/absent.png") }),
  ]);
  const probes = [];
  globalThis.fetch = async (url, options) => {
    probes.push(url);
    assert.equal(options.redirect, "manual");
    assert.equal(options.credentials, "omit");
    return new Response(png, { headers: { "content-type": "image/png" } });
  };
  const actual = await rows();
  assert.equal(actual.length, 3);
  assert.equal(new Set(actual.map(row => row[0])).size, 3);
  assert.equal(actual.filter(row => row[3].endsWith("/store/gift-box")).length, 1);
  const gift = actual.find(row => row[3].endsWith("/store/gift-box"));
  const gear = actual.find(row => row[3].endsWith("/store/dripper"));
  assert.deepEqual(gift.slice(4, 7), [originalPhoto, "in_stock", "1000 TWD"]);
  assert.deepEqual(gear.slice(4, 7), [originalPhoto, "in_stock", "850 TWD"]);
  assert.deepEqual(probes, [originalPhoto, originalPhoto]);
}));

test("Unrecognized Cloudinary metadata or URL is excluded without a network request", () => fixtures(async f => {
  process.env.CLOUDINARY_CLOUD_NAME = "synthetic";
  await f.writeCoffee([]);
  const invalid = [
    { ...optimizedPhoto, publicId: photoId + "-other" },
    { ...optimizedPhoto, provider: undefined },
    { ...optimizedPhoto, format: "svg" },
    { ...optimizedPhoto, url: optimizedPhoto.url.replace("synthetic", "other-account") },
    { ...optimizedPhoto, url: optimizedPhoto.url.replace("w_2400", "w_2600") },
    { ...optimizedPhoto, url: optimizedPhoto.url + "&token=no" },
    { ...optimizedPhoto, url: optimizedPhoto.url.replace("res.cloudinary.com", "res.cloudinary.com.example.org") },
  ];
  await f.writeStore(invalid.map((heroMedia, i) => store("gear" + i, "gear-" + i, { heroMedia })));
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("Unexpected external request"); };
  assert.deepEqual(await rows(), []);
  assert.equal(requests, 0);
}));

test("Original must still return matching bytes and stay unchanged", () => fixtures(async f => {
  process.env.CLOUDINARY_CLOUD_NAME = "synthetic";
  await f.writeCoffee([]);
  await f.writeStore([store("gift1", "gift-box", {
    sectionId: "gift", productType: "gift", heroMedia: optimizedPhoto,
  })]);
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: originalPhoto } });
  assert.deepEqual(await rows(), []);
  globalThis.fetch = async () => new Response("not a png image", { headers: { "content-type": "image/png" } });
  assert.deepEqual(await rows(), []);
  let requests = 0;
  globalThis.fetch = async () => new Response(++requests === 1 ? png : Buffer.concat([png, Buffer.from([1])]),
    { headers: { "content-type": "image/png" } });
  assert.equal((await GET(req())).status, 503);
  assert.equal(requests, 2);
}));

test("Coffee without an explicit SKU kind or an eligible photo remains excluded", () => fixtures(async f => {
  const original = coffee();
  const noKind = {
    ...coffee({ id: "coffee2", slug: "no-kind" }),
    skus: [{ ...original.skus[0], id: "bad-kind", kind: undefined }],
  };
  const decorative = {
    ...coffee({ id: "coffee3", slug: "artwork-only", assets: { artworkCover: { path: image } } }),
    pageLayout: { productAsset: "artworkCover" },
    skus: [{ ...original.skus[0], id: "decorative" }],
  };
  await f.writeCoffee([original, noKind, decorative]);
  await f.writeStore([]);
  const result = await readLiveMerchantProductFeed();
  assert.equal(result.rows, 1);
  assert.deepEqual(new Set(result.exclusions.map(entry => entry.reason)),
    new Set(["unverified_coffee_half_pound_sku_kind", "missing_or_invalid_image"]));
  assert.match(result.tsv, /sku1/);
  assert.match(result.tsv, /in_stock/);
  assert.doesNotMatch(result.tsv, /sku2/);
  assert.doesNotMatch(result.tsv, /bad-kind|decorative/);
}));


test("Approved package visual used as Hero supplies only its approved SKU", () => fixtures(async f => {
  const product = coffee({
    pageLayout: { productAsset: "productPhoto", heroAsset: "productVisual" },
    assets: { productVisual: approvedAsset(["sku1"]) },
  });
  await f.writeCoffee([product]);
  await f.writeStore([]);
  const actual = await rows();
  assert.equal(actual.length, 1);
  assert.equal(actual[0][0], "kd-coffee-coffee1-sku1");
  assert.deepEqual(actual[0].slice(3, 7), [
    "https://www.kdcoffee1962.com/works/first-coffee?sku=sku1",
    "https://www.kdcoffee1962.com" + image, "in_stock", "500 TWD",
  ]);
}));

test("Requires exact SKU approval and matching immutable image bytes", () => fixtures(async f => {
  const tab = { productAsset: "productPhoto", heroAsset: "productVisual" };
  await f.writeStore([]);
  const product = coffee({ pageLayout: tab });
  for (const assets of [
    { productVisual: { path: image } },
    { productVisual: approvedAsset(["unrelated-sku"]) },
    { productVisual: approvedAsset(["sku1"], "0".repeat(64)) },
    { productVisual: { ...approvedAsset(["sku1"]), path: "https://other.example" + image } },
    { productVisual: { ...approvedAsset(["sku1"]), path: image.replace("first-coffee", "another-coffee") } },
    { productVisual: approvedAsset(["sku1"]), artworkCover: { path: image } },
    { artworkCover: approvedAsset(["sku1"]) },
  ]) {
    await f.writeCoffee([{ ...product, assets }]);
    assert.deepEqual(await rows(), []);
  }

  await f.writeCoffee([{ ...product, assets: {
    productPhoto: approvedAsset(["sku1"]),
    productVisual: approvedAsset(["sku2"], "0".repeat(64)),
  } }]);
  assert.deepEqual((await rows()).map(row => row[0]), ["kd-coffee-coffee1-sku1"]);
  await rm(f.imageFile);
  assert.deepEqual(await rows(), []);
}));

test("A verified Coffee image deleted during snapshot generation fails closed", () => fixtures(async f => {
  process.env.CLOUDINARY_CLOUD_NAME = "synthetic";
  await f.writeCoffee([coffee()]);
  await f.writeStore([store("gift1", "gift-box", { sectionId: "gift", productType: "gift", heroMedia: optimizedPhoto })]);
  globalThis.fetch = async () => {
    await rm(f.imageFile, { force: true });
    return new Response(png, { headers: { "content-type": "image/png" } });
  };
  const response = await GET(req());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /sku1|gift-box/);
}));

test("Coming soon cannot publish even with verified image, kind, price and stock", () => fixtures(async f => {
  await f.writeCoffee([coffee({ status: "coming_soon" })]);
  await f.writeStore([]);
  assert.deepEqual(await rows(), []);
  await f.writeCoffee([coffee({ status: "sold_out" })]);
  assert.deepEqual((await rows()).map(row => row[5]), ["out_of_stock"]);
  await f.writeCoffee([coffee({ status: "sold_out", active: false })]);
  assert.deepEqual(await rows(), []);
}));

test("Store disabled and invalid Coffee price or SKU stay excluded", () => fixtures(async f => {
  delete process.env.STORE_COMMERCE_ENABLED;
  const product = coffee();
  await f.writeCoffee([
    { ...product, skus: [{ ...product.skus[0], price: 19.5 }] },
    { ...product, id: "coffee2", slug: "second-coffee", skus: [{ ...product.skus[0], id: " bad-id " }] },
  ]);
  await f.writeStore([store("gear1", "dripper"), store("gift1", "gift-box", { sectionId: "gift", productType: "gift" })]);
  const result = await readLiveMerchantProductFeed();
  assert.equal(result.rows, 0);
  assert.equal(result.exclusions.filter(item => item.reason === "invalid_coffee_offer").length, 2);
  assert.equal(result.exclusions.filter(item => item.reason === "store_commerce_disabled").length, 2);
}));

test("Admin persists an explicit missing kind through its existing optimistic patch", () => {
  const { buildProductChanges, applyProductChanges } = load("lib/productCommerceUpdates");
  const source = coffee({ id: "P00001", status: "coming_soon", stock: 17 });
  source.skus[0].label = "Legacy label";
  delete source.skus[0].kind;
  source.purchase = [{ id: "sku1", label: "Legacy label", detail: "", price: 500 }];
  const next = structuredClone(source);
  next.skus[0].kind = "beans";
  const patch = JSON.parse(JSON.stringify(buildProductChanges([source], [next])));
  assert.deepEqual(patch[0].skuOperations[0].fields, [
    { field: "kind", expectedValue: null, nextValue: "beans" },
  ]);
  const [applied] = applyProductChanges([source], patch);
  assert.deepEqual(applied.skus, next.skus);
  assert.deepEqual(applied.purchase, source.purchase);
  assert.equal(applied.id, source.id);
  assert.equal(applied.stock, 17);
  assert.equal(applied.status, "coming_soon");
  assert.equal(source.skus[0].kind, undefined);
  assert.throws(() => applyProductChanges([applied], patch));
  patch[0].skuOperations[0].fields[0].expectedValue = "beans";
  patch[0].skuOperations[0].fields[0].nextValue = "drip";
  assert.throws(() => applyProductChanges([applied], patch), /只允許補填/);
  patch[0].skuOperations[0].fields[0].expectedValue = null;
  patch[0].skuOperations[0].fields[0].nextValue = "ground";
  assert.throws(() => applyProductChanges([source], patch), /SKU 類型/);
});


test("Existing asset endpoint reserves Merchant photo approval for the Owner", () => fixtures(async f => {
  let session = { role: "staff", legacy: false };
  testModules.set("@/lib/adminAuth", { readAdminSession: async () => session });
  const { PUT } = load("app/api/admin/products/route");
  testModules.delete("@/lib/adminAuth");

  const published = coffee({
    assets: { productVisual: { path: image } },
    pageLayout: { heroAsset: "productVisual", productAsset: "productPhoto" },
  });
  await f.writeCoffee([published]);
  await f.writeStore([]);
  const before = readFileSync(f.coffeeFile, "utf8");
  const put = assets => PUT(new Request("https://www.kdcoffee1962.com/api/admin/products", {
    method: "PUT", body: JSON.stringify({ scope: "assets", products: [{ id: "coffee1", assets }] }),
  }));
  assert.equal((await put({ productVisual: approvedAsset(["sku1"]) })).status, 403);
  assert.equal(readFileSync(f.coffeeFile, "utf8"), before);

  session = { role: "owner", legacy: true };
  assert.equal((await put({ productVisual: approvedAsset(["sku1"]) })).status, 403);
  assert.equal(readFileSync(f.coffeeFile, "utf8"), before);

  session = { role: "owner", legacy: false };
  assert.equal((await put({ productVisual: approvedAsset(["sku1"]) })).status, 200);
  assert.deepEqual((await rows()).map(row => row[0]), ["kd-coffee-coffee1-sku1"]);

  session = { role: "staff", legacy: false };
  assert.equal((await put({ productVisual: { alt: "Updated caption" } })).status, 200);
  const actual = JSON.parse(readFileSync(f.coffeeFile, "utf8")).menu.products[0];
  assert.deepEqual(actual.pageLayout, published.pageLayout);
  assert.deepEqual(actual.skus, published.skus);
  assert.deepEqual(actual.assets.productVisual.merchantApproval, {
    ...approvedAsset(["sku1"]).merchantApproval, sourceUrl: new URL(image, url).href,
  });
}));


const approvalEndpoint = "https://www.kdcoffee1962.com/api/admin/products";

test("Merchant panel previews the chosen source before submitting its approval", async () => {
  const sha256 = createHash("sha256").update(png).digest("hex");
  const candidates = ["productPhoto", "productVisual"].map((slot, i) => ({
    slot, url: new URL(i ? image.replace(".png", "-alternate.png") : image, url).href,
    sha256, approved: false,
  }));
  const inspection = { sku: { id: "sku1", label: "Beans" }, version: 4, images: candidates, hasApproval: false };
  const requests = [];
  const state = [];
  let cursor = 0;
  let inspect;
  const oldFetch = globalThis.fetch;
  testModules.set("react", {
    useId: () => "merchant-preview",
    useEffect(effect) { inspect = effect; },
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = initial;
      return [state[i], next => { state[i] = typeof next === "function" ? next(state[i]) : next; }];
    },
  });
  globalThis.fetch = async (endpoint, options) => {
    assert.equal(endpoint, "/api/admin/products");
    const body = JSON.parse(options.body);
    requests.push(body);
    return { ok: true, json: async () => body.action === "inspect" ? inspection : { ok: true } };
  };
  try {
    const { default: Panel } = load("components/admin/MerchantCoffeeImageApproval.tsx");
    const elements = node => Array.isArray(node) ? node.flatMap(elements)
      : node?.props ? [node, ...elements(node.props.children)] : [];
    const draw = () => {
      cursor = 0;
      return elements(Panel({ slug: "first-coffee", productName: "Coffee", disabled: false }));
    };
    const approve = () => draw().find(node => node.type === "button" && node.props.children === "核准所選圖片").props;
    const preview = () => draw().find(node => node.type === "img").props;
    draw();
    inspect();
    await new Promise(resolve => setImmediate(resolve));
    const [photo, visual] = draw().filter(node => node.type === "input");
    photo.props.onChange();
    assert.equal(approve().disabled, true);
    preview().onLoad();
    assert.equal(approve().disabled, false);
    visual.props.onChange();
    assert.equal(approve().disabled, true);
    assert.equal(preview().src, `${new URL(candidates[1].url).pathname}?sha256=${sha256}`);
    preview().onError();
    assert.equal(approve().disabled, true);
    assert.equal(requests.length, 1);
    preview().onLoad();
    approve().onClick();
    await new Promise(resolve => setImmediate(resolve));
    const { slot, url: sourceUrl } = candidates[1];
    assert.deepEqual(requests[1], {
      scope: "merchantImageApproval", slug: "first-coffee", action: "approve",
      version: 4, skuId: "sku1", slot, url: sourceUrl, sha256,
    });
  } finally {
    globalThis.fetch = oldFetch;
    testModules.delete("react");
  }
});

function merchantApprovalClient() {
  let session = { role: "owner", legacy: false };
  // The route resolves persistence paths at import time, so bind it to this fixture.
  modules.delete("app/api/admin/products/route");
  testModules.set("@/lib/adminAuth", { readAdminSession: async () => session });
  const { PUT } = load("app/api/admin/products/route");
  testModules.delete("@/lib/adminAuth");
  return {
    setSession(value) { session = value; },
    request(action, fields = {}, headers = {}, endpoint = approvalEndpoint) {
      return PUT(new Request(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ scope: "merchantImageApproval", slug: "first-coffee", action, ...fields }),
      }));
    },
  };
}

test("Merchant approval inspection and mutations require a current Owner session", () => fixtures(async f => {
  await f.writeCoffee([coffee()]);
  const before = readFileSync(f.coffeeFile, "utf8");
  const client = merchantApprovalClient();
  for (const action of ["inspect", "approve", "revoke"]) {
    for (const [session, code] of [[null, 401], [{ role: "admin", legacy: false }, 403], [{ role: "owner", legacy: true }, 403]]) {
      client.setSession(session);
      assert.equal((await client.request(action)).status, code);
    }
  }
  client.setSession({ role: "owner", legacy: false });
  assert.equal((await client.request("inspect", {}, { "Sec-Fetch-Site": "cross-site" })).status, 400);
  for (const action of ["inspect", "approve", "revoke"]) {
    assert.equal((await client.request(action, {}, {
      Origin: "https://other.example",
      "Sec-Fetch-Site": "same-origin",
    })).status, 400);
  }
  assert.equal((await client.request("inspect", {}, {
    Origin: new URL(approvalEndpoint).origin,
    "X-Forwarded-Host": new URL(approvalEndpoint).host,
    "X-Forwarded-Proto": "https",
    "Sec-Fetch-Site": "same-origin",
  }, "http://localhost:3000/api/admin/products")).status, 200);
  assert.equal(readFileSync(f.coffeeFile, "utf8"), before);
}));

test("Owner can replace the approved source and revoke without changing images, commerce, or page layout", () => fixtures(async f => {
  const alternate = image.replace(".png", "-alternate.png");
  await writeFile(f.imageFile.replace(".png", "-alternate.png"), png);
  const product = coffee({
    assets: { productPhoto: approvedAsset(["sku1"]), productVisual: { path: alternate, alt: "Existing visual" } },
    pageLayout: { productAsset: "productPhoto", heroAsset: "productVisual" },
  });
  await f.writeCoffee([product]);
  await f.writeStore([store("gift1", "gift-box", { sectionId: "gift", productType: "gift" }), store("gear1", "dripper")]);
  const client = merchantApprovalClient();
  const response = await client.request("inspect");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const { sku, images, version } = await response.json();
  assert.equal(sku.id, "sku1");
  assert.deepEqual(images.map(item => [item.slot, item.approved]), [["productPhoto", true], ["productVisual", false]]);
  const { slot, url: sourceUrl, sha256 } = images[1];
  assert.equal(sha256, createHash("sha256").update(png).digest("hex"));
  const beforeRows = await rows();
  assert.equal((await client.request("approve", { slot, url: sourceUrl, sha256, skuId: sku.id, version })).status, 200);
  const saved = JSON.parse(readFileSync(f.coffeeFile, "utf8")).menu.products[0];
  assert.deepEqual(saved, {
    ...product,
    assets: {
      productPhoto: { path: image },
      productVisual: { ...product.assets.productVisual, merchantApproval: { skuIds: ["sku1"], sha256, sourceUrl } },
    },
  });
  const afterRows = await rows();
  assert.deepEqual(afterRows[0], beforeRows[0].map((value, index) => index === 4 ? sourceUrl : value));
  assert.deepEqual(afterRows.slice(1), beforeRows.slice(1));
  assert.equal((await client.request("revoke", { version })).status, 409);
  assert.equal((await client.request("revoke", { version: version + 1 })).status, 200);
  assert.deepEqual(await rows(), beforeRows.slice(1));
  const revoked = JSON.parse(readFileSync(f.coffeeFile, "utf8")).menu.products[0];
  assert.deepEqual(revoked, { ...product, assets: { productPhoto: { path: image }, productVisual: product.assets.productVisual } });
  const refreshed = await (await client.request("inspect")).json();
  assert.equal(refreshed.hasApproval, false);
  assert.equal(refreshed.images.every(item => !item.approved), true);
}));

test("Owner approval rejects a stale hash, a different SKU or source, and ambiguous persisted SKU data", () => fixtures(async f => {
  const product = coffee({ assets: { productVisual: { path: image } } });
  await f.writeCoffee([product]);
  await f.writeStore([]);
  const client = merchantApprovalClient();
  const inspection = await (await client.request("inspect")).json();
  const { slot, url: sourceUrl, sha256 } = inspection.images[0];
  const fields = { slot, url: sourceUrl, sha256, skuId: "sku1", version: inspection.version };
  const before = readFileSync(f.coffeeFile, "utf8");
  for (const override of [{ slot: "mainVisual" }, { skuId: "sku2" }, { url: sourceUrl.replace(".png", "-other.png") },
    { sha256: "0".repeat(64) }]) {
    assert.equal((await client.request("approve", { ...fields, ...override })).status, 409);
  }
  await writeFile(f.imageFile, Buffer.concat([png, Buffer.from("updated")]));
  assert.equal((await client.request("approve", fields)).status, 409);
  assert.equal(readFileSync(f.coffeeFile, "utf8"), before);
  for (const skus of [undefined, [product.skus[0], { ...product.skus[0], id: "second" }]]) {
    await f.writeCoffee([{ ...product, skus, purchase: product.skus }]);
    assert.equal((await (await client.request("inspect")).json()).sku, null);
    assert.equal((await client.request("approve", fields)).status, 409);
  }
}));

test("Replacing the approved source URL with identical image bytes fails closed", () => fixtures(async f => {
  const alternate = image.replace(".png", "-alternate.png");
  await writeFile(f.imageFile.replace(".png", "-alternate.png"), png);
  await f.writeStore([]);
  await f.writeCoffee([coffee({
    assets: { productPhoto: {
      path: alternate,
      merchantApproval: { ...approvedAsset(["sku1"]).merchantApproval, sourceUrl: new URL(image, url).href },
    } },
  })]);
  assert.deepEqual(await rows(), []);
}));

test("Exactly one persisted 227g beans SKU per Coffee with stable identities across updates", () => fixtures(async f => {
  const first = coffee();
  const secondPath = image.replace("first-coffee", "second-coffee");
  const secondFile = join(process.cwd(), "public", secondPath);
  await mkdir(dirname(secondFile), { recursive: true });
  await writeFile(secondFile, png);
  const second = coffee({
    id: "coffee2", slug: "second-coffee",
    assets: { productVisual: { ...approvedAsset(["sku-b"]), path: secondPath } },
    skus: [{ ...first.skus[0], id: "sku-b", detail: "２２７ ｇ", price: 620 }, {
      ...first.skus[0], id: "other-size", detail: "250g", price: 640,
    }],
  });
  first.skus.push({ ...first.skus[1], id: "drip-227", stock: 20, detail: "227g" });
  await f.writeStore([]);
  await f.writeCoffee([first, second]);
  const initial = await rows();
  assert.deepEqual(initial.map(row => [row[0], row[6]]), [
    ["kd-coffee-coffee1-sku1", "500 TWD"],
    ["kd-coffee-coffee2-sku-b", "620 TWD"],
  ]);
  assert.equal(initial[1][4], "https://www.kdcoffee1962.com" + secondPath);
  first.skus.push({ ...first.skus[1], id: "extra-drip", stock: 99, price: 999 });
  first.skus[0].price = 550;
  await f.writeCoffee([first, second]);
  const refreshed = await rows();
  assert.deepEqual(refreshed.map(row => row[0]), initial.map(row => row[0]));
  assert.equal(refreshed[0][6], "550 TWD");
  assert.deepEqual(refreshed[1], initial[1]);
}));

test("Ambiguous half-pound SKU conflicts fail closed before pricing or photo selection", () => fixtures(async f => {
  const product = coffee();
  const competing = { ...product.skus[0], id: "another-227g" };
  await f.writeStore([]);
  for (const other of [competing, { ...competing, kind: undefined }, { ...competing, id: product.skus[0].id }]) {
    await f.writeCoffee([{ ...product, skus: [...product.skus, other] }]);
    const snapshot = await readLiveMerchantProductFeed();
    assert.equal(snapshot.rows, 0);
    assert.deepEqual(snapshot.exclusions, [{ item: product.slug, reason: "ambiguous_coffee_half_pound_sku" }]);
  }
  await f.writeCoffee([{ ...product, skus: [...product.skus, { ...competing, enabled: false }] }]);
  assert.equal((await rows()).length, 1);
  const duplicateProduct = { ...product, slug: "second-coffee", skus: [{ ...competing }] };
  await f.writeCoffee([product, duplicateProduct]);
  assert.equal((await rows()).length, 0);
  const duplicateSku = { ...duplicateProduct, id: "unique-id", skus: [product.skus[0]] };
  await f.writeCoffee([product, duplicateSku]);
  assert.equal((await rows()).length, 0);
}));

test("Name alone, missing kind and legacy purchase never qualify as 227g beans", () => fixtures(async f => {
  const product = coffee();
  await f.writeStore([]);
  for (const detail of ["", "227g plus 500g", "250g"]) {
    await f.writeCoffee([{ ...product, skus: [
      { ...product.skus[0], label: "半磅咖啡豆 227g", detail }, product.skus[1],
    ] }]);
    const result = await readLiveMerchantProductFeed();
    assert.equal(result.rows, 0);
    assert.equal(result.exclusions[0].reason, "missing_coffee_half_pound_sku");
  }
  await f.writeCoffee([{ ...product, skus: [
    { ...product.skus[0], kind: undefined }, product.skus[1],
  ] }]);
  assert.equal((await readLiveMerchantProductFeed()).exclusions[0].reason, "unverified_coffee_half_pound_sku_kind");
  await f.writeCoffee([{ ...product, purchase: product.skus, skus: undefined }]);
  assert.equal((await readLiveMerchantProductFeed()).exclusions[0].reason, "missing_public_persisted_sku");
}));

test("Merchant link preselects beans in the real buy panel and permits drip and other existing SKUs", () => fixtures(async f => {
  const product = coffee();
  const [beans, drip] = product.skus;
  drip.stock = 7;
  const other = { ...beans, id: "sku3", label: "Other bag", detail: "250g", price: 600 };
  product.skus = [drip, beans, other];
  const website = await f.writeCoffee([product]);
  await f.writeStore([]);
  const [row] = await rows();
  const link = new URL(row[3]);
  assert.equal(link.pathname, "/works/" + product.slug);
  assert.equal(link.searchParams.get("sku"), beans.id);
  const page = readFileSync(join(project, "app/works/[slug]/page.tsx"), "utf8");
  assert.match(page, /sku:\s*requestedSku/);
  assert.match(page, /sku\?\.id === requestedSku && sku\.enabled !== false/);
  assert.equal([...page.matchAll(/initialSkuId=\{initialSkuId\}/g)].length, 2);

  const state = [];
  let cursor = 0;
  const additions = [];
  testModules.set("react", {
    useEffect() {},
    useMemo(fn) { return fn(); },
    useRef(current) { return { current }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
      return [state[i], next => { state[i] = typeof next === "function" ? next(state[i]) : next; }];
    },
  });
  testModules.set("next/navigation", { useRouter: () => ({ push() {} }) });
  testModules.set("./CartProvider", { useCart: () => ({
    items: [], ready: true, checkoutEligibility: "ELIGIBLE",
    addItem(item, quantity) { additions.push({ ...item, quantity }); return quantity; },
  }) });
  const oldWindow = globalThis.window;
  try {
    globalThis.window = { dispatchEvent() {} };
    const { default: AddToCart } = load("components/commerce/AddToCart.tsx");
    function* elements(node) {
      if (Array.isArray(node)) {
        for (const child of node) yield* elements(child);
      } else if (node && typeof node === "object" && node.props) {
        yield node;
        yield* elements(node.props.children);
      }
    }
    const draw = () => {
      cursor = 0;
      return [...elements(AddToCart({ product, initialSkuId: link.searchParams.get("sku") }))];
    };
    const option = (nodes, sku) => nodes.find(node => node.key === sku.id && "aria-pressed" in node.props);
    const add = nodes => nodes.find(node => node.props.className === "add-cart-button").props;
    let nodes = draw();
    assert.equal(option(nodes, beans).props["aria-pressed"], true);
    assert.equal(option(nodes, drip).props.disabled, false);
    assert.equal(option(nodes, other).props.disabled, false);
    assert.equal(add(nodes).disabled, false);
    add(nodes).onClick();
    option(nodes, drip).props.onClick();
    nodes = draw();
    assert.equal(option(nodes, drip).props["aria-pressed"], true);
    add(nodes).onClick();
    option(nodes, other).props.onClick();
    nodes = draw();
    assert.equal(option(nodes, other).props["aria-pressed"], true);
    add(nodes).onClick();
  } finally {
    for (const name of ["react", "next/navigation", "./CartProvider"]) testModules.delete(name);
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }

  const cart = load("lib/commerceCart");
  const lines = additions.map(item => cart.validateUnifiedCartItem(item));
  assert.deepEqual(lines.map(item => [item.variantId, item.unitPrice, item.quantityLimit]),
    [[beans.id, 500, 2], [drip.id, 80, 7], [other.id, 600, 2]]);
  const [beanLine] = cart.coffeeCheckoutItems(lines);
  const priced = priceOrderFromWebsiteData(website, [{
    slug: beanLine.slug, optionId: beanLine.optionId, optionLabel: beanLine.optionLabel,
    quotedUnitPrice: beanLine.unitPrice, quantity: 1,
  }]);
  assert.equal(priced.priced.items[0].unitPrice + " TWD", row[6]);
}));

test("Owner can pause and restore Coffee Merchant sync without changing the public offer", () => fixtures(async f => {
  const item = coffee();
  await f.writeCoffee([item]);
  await f.writeStore([store("gear1", "dripper")]);
  const original = await rows();
  assert.equal(original.length, 2);

  const client = merchantApprovalClient();
  // An inspect action on the sync scope must still use the write lock.
  const change = (expectedEnabled, enabled, headers) => client.request("inspect",
    { scope: "merchantSync", expectedEnabled, enabled }, headers);
  for (const [session, status] of [[null, 401], [{ role: "admin", legacy: false }, 403], [{ role: "owner", legacy: true }, 403]]) {
    client.setSession(session);
    assert.equal((await change(true, false)).status, status);
  }
  client.setSession({ role: "owner", legacy: false });
  assert.equal((await change(true, false, { Origin: "https://other.example" })).status, 400);
  assert.equal((await change(true, "false")).status, 400);
  assert.equal(JSON.parse(readFileSync(f.coffeeFile, "utf8")).version, 1);

  const disabled = await change(true, false);
  assert.equal(disabled.status, 200);
  assert.deepEqual(await disabled.json(), { ok: true, enabled: false });
  const snapshot = JSON.parse(readFileSync(f.coffeeFile, "utf8"));
  assert.deepEqual(snapshot.menu.products, [{ ...item, googleMerchantSyncEnabled: false }]);
  assert.deepEqual(await rows(), original.filter(row => row[0] !== "kd-coffee-coffee1-sku1"));
  assert.equal(priceOrderFromWebsiteData(snapshot, [{ slug: item.slug, optionId: "sku1",
    optionLabel: "半磅咖啡豆", quotedUnitPrice: 500, quantity: 1 }]).priced.items[0].unitPrice, 500);

  assert.equal((await change(true, false)).status, 200);
  assert.equal(JSON.parse(readFileSync(f.coffeeFile, "utf8")).version, snapshot.version);
  assert.equal((await change(true, true)).status, 409);
  assert.equal((await change(false, true)).status, 200);
  assert.deepEqual(await rows(), original);
}));

test("Owner Store updates preserve a per-product Merchant preference and reject invalid or stale changes", () => fixtures(async f => {
  await f.writeCoffee([coffee()]);
  await f.writeStore([store("gear1", "dripper")]);
  const original = await rows();
  assert.equal(original.length, 2);

  let session = { role: "owner", legacy: false };
  testModules.set("./adminAuth", { readAdminSession: async () => session });
  modules.delete("lib/storeAdminApi");
  const { storeAdminHandlers } = load("lib/storeAdminApi");
  testModules.delete("./adminAuth");
  const { PATCH } = storeAdminHandlers("products");
  const update = (expectedRevision, changes, headers) => PATCH(new Request("https://www.kdcoffee1962.com/api/admin/store/products", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ id: "gear1", expectedRevision, action: "update", changes }),
  }));
  try {
    session = { role: "admin", legacy: false };
    assert.equal((await update(1, { googleMerchantSyncEnabled: false })).status, 403);
    session = { role: "owner", legacy: false };
    assert.equal((await update(1, { googleMerchantSyncEnabled: false }, { Origin: "https://other.example" })).status, 403);
    assert.equal((await update(1, { googleMerchantSyncEnabled: "false" })).status, 400);
    const disabled = await update(1, { googleMerchantSyncEnabled: false });
    assert.equal(disabled.status, 200);
    assert.equal((await disabled.json()).googleMerchantSyncEnabled, false);
    assert.deepEqual(await rows(), original.filter(row => !row[3].endsWith("/dripper")));
    assert.equal((await resolveStoreCommerceOffer("dripper")).unitPrice, 1000);

    const unrelated = await update(2, { featured: true });
    assert.equal(unrelated.status, 200);
    assert.equal((await unrelated.json()).googleMerchantSyncEnabled, false);
    assert.equal((await update(2, { googleMerchantSyncEnabled: true })).status, 409);
    assert.equal((await update(3, { googleMerchantSyncEnabled: true })).status, 200);
    assert.deepEqual(await rows(), original);
  } finally {
    modules.delete("lib/storeAdminApi");
  }
}));
