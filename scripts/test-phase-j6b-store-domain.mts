import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { createStoreRepository, StoreRevisionConflictError, StoreEntityNotFoundError, StoreRepositoryIntegrityError } = await import("../lib/storeRepository");
const { StoreValidationError, validateStoreCatalog, validateStoreProduct, validateStoreSection, validateStoreCategory } = await import("../lib/storeValidation");
const timestamp = "2026-10-08T00:00:00.000Z";

// Independent OS processes exercise the same file lock and optimistic revisions.
if (process.argv[2] === "--worker") {
  try {
    const repository = createStoreRepository({ dataRoot: process.argv[3], now: () => new Date(timestamp) });
    const product = await repository.updateProduct(process.argv[4], Number(process.argv[5]), JSON.parse(process.argv[6]));
    console.log(JSON.stringify({ revision: product.revision }));
  } catch (error) {
    console.log(JSON.stringify({ error: error instanceof Error ? error.name : String(error) }));
    process.exitCode = error instanceof StoreRevisionConflictError ? 42 : 1;
  }
} else {
  await main().catch(error => { console.error(error); process.exitCode = 1; });
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6b-store-domain-"));
  process.env.KD_DATA_DIR = root;
  const repository = createStoreRepository({ dataRoot: root, now: () => new Date(timestamp) });
  const protectedPaths = [
    "components/admin/ProductManager.tsx", "app/admin/products/page.tsx", "app/api/admin/products/route.ts",
    "data/websiteData.ts", "lib/productCommerceUpdates.ts", "lib/productAssetUpdates.ts", "lib/referralPv.ts", "lib/membershipCommerce.ts",
  ];
  async function collectWorks(directory: string) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await collectWorks(file);
      else protectedPaths.push(file);
    }
  }
  await collectWorks("app/works");
  async function hashes() {
    return Object.fromEntries(await Promise.all(protectedPaths.map(async file => [file, createHash("sha256").update(await fs.readFile(file)).digest("hex")])));
  }
  const protectedBefore = await hashes();
  let passed = 0;
  async function test(label: string, operation: () => unknown | Promise<unknown>) {
    try { await operation(); passed += 1; console.log(`PASS ${String(passed).padStart(3, "0")} ${label}`); }
    catch (error) { console.error(`FAIL ${label}`); throw error; }
  }
  async function diskState() {
    return { bytes: await fs.readFile(repository.catalogPath, "utf8"), backups: (await fs.readdir(path.join(root, "store-domain/backups")).catch(() => [])).sort() };
  }
  async function rejected(label: string, operation: () => Promise<unknown>, errorType: typeof StoreValidationError | typeof StoreRevisionConflictError | typeof StoreEntityNotFoundError = StoreValidationError) {
    await test(label, async () => {
      const before = await diskState();
      await assert.rejects(async () => operation(), errorType);
      assert.deepEqual(await diskState(), before, "Rejected operation must preserve catalog bytes and backups");
    });
  }
  async function product(id: string) {
    const value = (await repository.read()).products.find(item => item.id === id);
    assert.ok(value); return value;
  }
  async function section(id: string) {
    const value = (await repository.read()).sections.find(item => item.id === id);
    assert.ok(value); return value;
  }
  async function category(id: string) {
    const value = (await repository.read()).categories.find(item => item.id === id);
    assert.ok(value); return value;
  }
  const newProduct = (overrides: Record<string, unknown> = {}) => ({ id: "invalid-product", name: "測試商品", slug: "invalid-product", sectionId: "section-a", sku: "STORE-INVALID", price: 500.25, inventory: 10, pvValue: 0, ...overrides });

  await test("Missing Store catalog reads empty without creating runtime data", async () => {
    assert.deepEqual(await repository.read(), { schemaVersion: 1, revision: 0, updatedAt: null, sections: [], categories: [], products: [] });
    await assert.rejects(fs.access(repository.catalogPath), { code: "ENOENT" });
  });
  const artworkSentinel = path.join(root, "store/website-data.json");
  await fs.mkdir(path.dirname(artworkSentinel), { recursive: true });
  const sentinel = JSON.stringify({ menu: { products: [{ id: "existing-artwork", slug: "artwork-must-not-migrate", pvValue: 999 }] } });
  await fs.writeFile(artworkSentinel, sentinel);
  await test("Empty private catalog initializes without importing Artwork", async () => {
    const catalog = await repository.initialize();
    assert.equal(catalog.products.length, 0);
    assert.equal(catalog.revision, 0);
    assert.equal(repository.catalogPath, path.join(root, "store-domain/catalog.json"));
    assert.equal(await fs.readFile(artworkSentinel, "utf8"), sentinel);
  });
  await test("Initialization is idempotent and does not overwrite existing state", async () => {
    const bytes = await fs.readFile(repository.catalogPath, "utf8");
    await repository.initialize();
    assert.equal(await fs.readFile(repository.catalogPath, "utf8"), bytes);
  });
  await test("Read results are detached from persisted state", async () => {
    const result = await repository.read(); result.products.length = 1;
    assert.equal((await repository.read()).products.length, 0);
  });
  await test("Section can be created with generic presentation defaults", async () => {
    const result = await repository.createSection({ id: "section-a", name: "咖啡器具", slug: "coffee-equipment" });
    assert.equal(result.revision, 1); assert.equal(result.published, false); assert.equal(result.showInNavigation, false);
  });
  await repository.createSection({ id: "section-b", name: "手工餅乾", slug: "cookies", published: true });
  await rejected("Duplicate section slug rejected", () => repository.createSection({ id: "section-duplicate", name: "重複", slug: "coffee-equipment" }));
  await rejected("Duplicate entity ID rejected", () => repository.createSection({ id: "section-a", name: "重複", slug: "unique-slug" }));
  for (const slug of ["", "Upper", "two--parts", "../unsafe", "a".repeat(81)]) {
    await rejected(`Invalid section slug rejected: ${JSON.stringify(slug)}`, () => repository.createSection({ id: "invalid-section", name: "測試", slug }));
  }
  await rejected("Missing required Section ID rejected", () => repository.createSection({ name: "測試", slug: "valid-slug" }));
  await test("Section revision and bounded homepage/navigation metadata update", async () => {
    const result = await repository.updateSection("section-a", 1, { name: "精品器具", shortDescription: "器具", published: true, showOnHomepage: true, homepageSortOrder: 2, showInNavigation: true, navigationSortOrder: 3, seoTitle: "器具", seoDescription: "器具說明" });
    assert.equal(result.revision, 2); assert.equal(result.published, true); assert.equal(result.navigationSortOrder, 3);
  });
  await rejected("Stale Section revision rejected", () => repository.updateSection("section-a", 1, { name: "stale" }), StoreRevisionConflictError);
  await rejected("Invalid expected revision rejected", () => repository.updateSection("section-a", 0, { name: "invalid" }));
  for (const field of ["id", "revision", "createdAt", "updatedAt", "archivedAt", "presentation"]) {
    await rejected(`Server-owned/unbounded section patch key rejected: ${field}`, () => repository.updateSection("section-a", 2, { [field]: "unexpected" }));
  }
  await rejected("Empty patch rejected", () => repository.updateSection("section-a", 2, {}));
  await rejected("Unknown entity update rejected", () => repository.updateSection("missing", 1, { name: "missing" }), StoreEntityNotFoundError);

  await test("Category can be created under one Section", async () => {
    const result = await repository.createCategory({ id: "category-a", sectionId: "section-a", name: "濾杯", slug: "filters" });
    assert.equal(result.sectionId, "section-a"); assert.equal(result.revision, 1);
  });
  await test("Category slugs may repeat in different Sections", async () => {
    const result = await repository.createCategory({ id: "category-b", sectionId: "section-b", name: "餅乾", slug: "filters" });
    assert.equal(result.sectionId, "section-b");
  });
  await rejected("Category cannot reference missing Section", () => repository.createCategory({ id: "category-missing", sectionId: "missing", name: "missing", slug: "missing" }));
  await rejected("Duplicate category identity within Section rejected", () => repository.createCategory({ id: "category-duplicate", sectionId: "section-a", name: "duplicate", slug: "filters" }));
  await rejected("Invalid category slug rejected", () => repository.createCategory({ id: "category-invalid", sectionId: "section-a", name: "invalid", slug: "Bad_Category" }));
  await test("Category patch increments revision", async () => {
    const result = await repository.updateCategory("category-a", 1, { description: "濾杯分類" }); assert.equal(result.revision, 2);
  });
  await rejected("Stale category patch rejected", () => repository.updateCategory("category-a", 1, { description: "stale" }), StoreRevisionConflictError);

  const image = { type: "image", url: "/uploads/assets/store/sample.webp", provider: "local", alt: "商品照片", width: 1200, height: 1200 };
  await test("Generic Product create stores media/specifications and pvValue=0", async () => {
    const result = await repository.createProduct(newProduct({ id: "product-a", slug: "product-a", sku: "STORE-A", categoryId: "category-a", productType: "equipment", salePrice: 400.5, heroMedia: image, gallery: [image], specifications: [{ key: "material", label: "材質", value: "陶瓷", sortOrder: 0 }], kdRedemption: { mode: "enabled", maxDiscountPercent: 25 } }));
    assert.equal(result.pvValue, 0); assert.equal(result.price, 500.25); assert.equal(result.subscriptionEligible, false); assert.equal(result.revision, 1);
    const disk = JSON.parse(await fs.readFile(repository.catalogPath, "utf8"));
    assert.equal(disk.products[0].pvValue, 0); assert.equal(disk.products[0].specifications[0].value, "陶瓷");
  });
  await test("Decimal non-negative PV persists independently of price", async () => {
    const result = await repository.createProduct(newProduct({ id: "product-b", slug: "product-b", sku: "STORE-B", price: 100, inventory: 5, pvValue: 12.375, categoryId: "category-a" }));
    assert.equal(result.pvValue, 12.375); assert.equal((await product("product-a")).pvValue, 0);
  });
  await repository.createProduct(newProduct({ id: "product-c", slug: "product-c", sku: "STORE-C", sectionId: "section-b", categoryId: "category-b", pvValue: 3.5, productType: "food" }));
  await rejected("Product requires valid Section", () => repository.createProduct(newProduct({ sectionId: "missing" })));
  await rejected("Product requires an existing category when assigned", () => repository.createProduct(newProduct({ categoryId: "missing" })));
  await rejected("Cross-Section category assignment rejected", () => repository.createProduct(newProduct({ categoryId: "category-b" })));
  await rejected("Case-insensitive duplicate SKU rejected", () => repository.createProduct(newProduct({ sku: "store-a" })));
  await rejected("Product slug is globally unique across Sections", () => repository.createProduct(newProduct({ slug: "product-a", sectionId: "section-b" })));
  await rejected("Category/product IDs cannot collide", () => repository.createProduct(newProduct({ id: "category-a" })));
  for (const value of ["other", ["general"], null]) await rejected(`Invalid productType rejected: ${JSON.stringify(value)}`, () => repository.createProduct(newProduct({ productType: value })));
  for (const value of [-1, NaN, Infinity, "10"]) await rejected(`Invalid price rejected: ${String(value)}`, () => repository.createProduct(newProduct({ price: value })));
  for (const value of [-1, 501, NaN, Infinity, "10"]) await rejected(`Invalid salePrice rejected: ${String(value)}`, () => repository.createProduct(newProduct({ salePrice: value })));
  for (const value of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "1"]) await rejected(`Invalid inventory rejected: ${String(value)}`, () => repository.createProduct(newProduct({ inventory: value })));
  for (const value of [-0.5, NaN, Infinity, -Infinity, undefined, null, "0", "inherit"]) await rejected(`Invalid/missing PV rejected: ${String(value)}`, () => repository.createProduct(newProduct({ pvValue: value })));
  await test("Zero price/inventory/salePrice do not force PV to zero", async () => {
    const result = await repository.createProduct(newProduct({ id: "product-free", slug: "product-free", sku: "STORE-FREE", price: 0, salePrice: 0, inventory: 0, pvValue: 0.125, productType: "gift" }));
    assert.equal(result.pvValue, 0.125); assert.equal(result.price, 0);
  });
  await rejected("Subscription eligibility true cannot be created", () => repository.createProduct(newProduct({ subscriptionEligible: true })));
  await rejected("Inactive Product cannot be created as published", () => repository.createProduct(newProduct({ active: false, published: true })));
  for (const value of [true, false]) await rejected(`Subscription eligibility is not patch-editable: ${value}`, () => repository.updateProduct("product-a", 1, { subscriptionEligible: value }));
  await rejected("Store-wide conversion metadata cannot enter Product", () => repository.updateProduct("product-a", 1, { kdPointValueTwd: 2 }));
  for (const field of ["id", "revision", "archivedAt"]) await rejected(`Server-owned Product field rejected: ${field}`, () => repository.updateProduct("product-a", 1, { [field]: "unexpected" }));
  await rejected("Prototype-shaped patch rejected", () => repository.updateProduct("product-a", 1, JSON.parse('{"__proto__":{"pvValue":999}}')));

  await test("Publish Product under active published Section", async () => {
    const result = await repository.publishProduct("product-a", 1); assert.equal(result.published, true); assert.equal(result.revision, 2);
  });
  await rejected("Unpublishing parent of published Product rejects inconsistent graph", () => repository.unpublishSection("section-a", 2));
  await rejected("Deactivating category of published Product rejects inconsistent graph", () => repository.updateCategory("category-a", 2, { active: false }));
  await rejected("Category reparenting with referenced products rejected", () => repository.updateCategory("category-a", 2, { sectionId: "section-b" }));
  await rejected("Cross-Section category patch rejected", () => repository.updateProduct("product-a", 2, { categoryId: "category-b" }));
  await test("PV patch increments revision and does not affect other Product or inventory", async () => {
    const before = await product("product-a");
    const result = await repository.updateProduct("product-a", 2, { pvValue: 12.625 });
    assert.equal(result.revision, 3); assert.equal(result.pvValue, 12.625); assert.equal(result.inventory, before.inventory); assert.equal(result.price, before.price);
    assert.deepEqual(result.gallery, before.gallery); assert.equal((await product("product-b")).pvValue, 12.375);
  });
  await test("Price patch preserves PV and inventory", async () => {
    const result = await repository.updateProduct("product-a", 3, { price: 600 }); assert.equal(result.pvValue, 12.625); assert.equal(result.inventory, 10);
  });
  await rejected("Price patch cannot invalidate existing salePrice", () => repository.updateProduct("product-a", 4, { price: 300 }));
  await test("Inventory patch preserves PV and price", async () => {
    const result = await repository.updateProduct("product-a", 4, { inventory: 8 }); assert.equal(result.pvValue, 12.625); assert.equal(result.price, 600);
  });
  await rejected("Stale Product payload cannot overwrite inventory or PV", () => repository.updateProduct("product-a", 3, { inventory: 999, pvValue: 999 }), StoreRevisionConflictError);

  function worker(id: string, revision: number, patch: Record<string, unknown>) {
    return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--experimental-strip-types", "--import", pathToFileURL(path.resolve("scripts/member-auth-test-bootstrap.mjs")).href, fileURLToPath(import.meta.url), "--worker", root, id, String(revision), JSON.stringify(patch)], { cwd: process.cwd(), env: process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      child.stdout.on("data", value => { output += String(value); }); child.stderr.on("data", value => { output += String(value); });
      child.on("error", reject); child.on("exit", code => resolve({ code, output }));
    });
  }
  await test("Independent concurrent writers: exactly one succeeds for same revision", async () => {
    const results = await Promise.all([worker("product-a", 5, { pvValue: 10.5 }), worker("product-a", 5, { pvValue: 11.5 })]);
    assert.deepEqual(results.map(result => result.code).sort(), [0, 42], JSON.stringify(results));
    const result = await product("product-a"); assert.equal(result.revision, 6); assert.ok([10.5, 11.5].includes(result.pvValue)); assert.equal(result.inventory, 8);
  });
  await test("Independent concurrent edits to different Products preserve both patches", async () => {
    const results = await Promise.all([worker("product-a", 6, { description: "並行更新 A" }), worker("product-b", 1, { pvValue: 17.375 })]);
    assert.ok(results.every(result => result.code === 0), JSON.stringify(results));
    assert.equal((await product("product-a")).description, "並行更新 A"); assert.equal((await product("product-b")).pvValue, 17.375);
  });
  await test("Redemption metadata changes do not alter earned PV", async () => {
    const before = await product("product-a");
    const result = await repository.updateProduct(before.id, before.revision, { kdRedemption: { mode: "inherit", maxDiscountPercent: 0 } });
    assert.equal(result.pvValue, before.pvValue); assert.equal(result.kdRedemption?.mode, "inherit");
    const enabled = await repository.updateProduct(result.id, result.revision, { kdRedemption: { mode: "enabled", maxDiscountPercent: 100 } });
    assert.equal(enabled.kdRedemption?.maxDiscountPercent, 100); assert.equal(enabled.pvValue, before.pvValue);
  });
  for (const redemption of [{ mode: "enabled", maxDiscountPercent: -1 }, { mode: "enabled", maxDiscountPercent: 101 }, { mode: "enabled", maxDiscountPercent: Infinity }, { mode: "rate" }, { mode: ["enabled"] }]) {
    await rejected(`Invalid redemption metadata rejected: ${JSON.stringify(redemption)}`, async () => { const current = await product("product-a"); return repository.updateProduct(current.id, current.revision, { kdRedemption: redemption }); });
  }
  for (const url of ["javascript:alert(1)", "http://example.com/a.webp", "//example.com/a.webp", "/uploads/../private", "/uploads/%2e%2e/private", "/uploads/%ZZ/private", "/uploads/a%5cb.webp"]) {
    await rejected(`Unsafe media rejected: ${url}`, () => repository.createProduct(newProduct({ gallery: [{ ...image, url }] })));
  }
  await rejected("Gallery bound enforced", () => repository.createProduct(newProduct({ gallery: Array.from({ length: 25 }, () => image) })));
  await rejected("Duplicate specification keys rejected", () => repository.createProduct(newProduct({ specifications: [{ key: "size", label: "大小", value: "S", sortOrder: 0 }, { key: "size", label: "大小", value: "M", sortOrder: 1 }] })));
  await rejected("Missing specification value rejected", () => repository.createProduct(newProduct({ specifications: [{ key: "size", label: "大小", sortOrder: 0 }] })));
  await test("Optional fields can be explicitly cleared without touching omitted fields", async () => {
    const before = await product("product-a");
    const result = await repository.updateProduct(before.id, before.revision, { categoryId: null, salePrice: null, heroMedia: null, kdRedemption: null });
    for (const key of ["categoryId", "salePrice", "heroMedia", "kdRedemption"]) assert.equal(Object.hasOwn(result, key), false);
    assert.equal(result.pvValue, before.pvValue); assert.equal(result.inventory, before.inventory); assert.deepEqual(result.gallery, before.gallery);
  });
  await test("Product unpublish retains record", async () => {
    const current = await product("product-a"); const result = await repository.unpublishProduct(current.id, current.revision); assert.equal(result.published, false);
  });
  await test("Unpublished Product can become inactive", async () => {
    const current = await product("product-a"); assert.equal((await repository.updateProduct(current.id, current.revision, { active: false })).active, false);
  });
  await rejected("Inactive Product cannot publish", async () => { const current = await product("product-a"); return repository.publishProduct(current.id, current.revision); });
  await test("Section can unpublish once child Products are unpublished", async () => {
    const current = await section("section-a"); assert.equal((await repository.unpublishSection(current.id, current.revision)).published, false);
  });
  await rejected("Product cannot publish under unpublished Section", async () => { const current = await product("product-b"); return repository.publishProduct(current.id, current.revision); });
  await rejected("Published Section cannot be inactive", async () => { const current = await section("section-b"); return repository.updateSection(current.id, current.revision, { active: false }); });
  await test("Republishing Section and active Product works with current revisions", async () => {
    const parent = await section("section-a"); await repository.publishSection(parent.id, parent.revision);
    const current = await product("product-a"); const result = await repository.updateProduct(current.id, current.revision, { active: true, published: true }); assert.equal(result.published, true);
  });
  const bBeforeArchive = await product("product-b");
  await test("Category archive retains relationships and archives linked Products", async () => {
    const current = await category("category-a"); const archived = await repository.archiveCategory(current.id, current.revision);
    assert.equal(archived.active, false); assert.equal(archived.archivedAt, timestamp);
    const child = await product("product-b"); assert.equal(child.archivedAt, timestamp); assert.equal(child.revision, bBeforeArchive.revision + 1); assert.equal(child.pvValue, bBeforeArchive.pvValue); assert.equal(child.inventory, bBeforeArchive.inventory);
    assert.equal((await product("product-a")).archivedAt, null);
  });
  await rejected("Child stale update rejected after category cascade", () => repository.updateProduct("product-b", bBeforeArchive.revision, { inventory: 999 }), StoreRevisionConflictError);
  await rejected("New Product cannot reference archived Category", () => repository.createProduct(newProduct({ categoryId: "category-a" })));
  await rejected("Archived Category cannot reactivate via patch", async () => { const current = await category("category-a"); return repository.updateCategory(current.id, current.revision, { active: true }); });
  await test("Product archive preserves SKU, PV, inventory and identity", async () => {
    const before = await product("product-c"); const archived = await repository.archiveProduct(before.id, before.revision);
    assert.equal(archived.archivedAt, timestamp); assert.equal(archived.active, false); assert.equal(archived.published, false); assert.equal(archived.sku, before.sku); assert.equal(archived.pvValue, before.pvValue); assert.equal(archived.inventory, before.inventory);
  });
  await rejected("Archived SKU remains reserved", () => repository.createProduct(newProduct({ sku: "STORE-C" })));
  await rejected("Archived slug remains reserved", () => repository.createProduct(newProduct({ slug: "product-c" })));
  await rejected("Repeated archive rejects without rewriting catalog", async () => { const current = await product("product-c"); return repository.archiveProduct(current.id, current.revision); });
  await repository.createCategory({ id: "category-draft", sectionId: "section-a", name: "草稿分類", slug: "draft-category" });
  const aBeforeArchive = await product("product-a");
  await test("Section archive atomically archives all live descendants", async () => {
    const current = await section("section-a"); const archived = await repository.archiveSection(current.id, current.revision);
    assert.equal(archived.revision, current.revision + 1); assert.equal(archived.archivedAt, timestamp); assert.equal(archived.published, false);
    const catalog = await repository.read();
    assert.ok(catalog.products.filter(item => item.sectionId === current.id).every(item => item.archivedAt !== null && !item.active && !item.published));
    assert.ok(catalog.categories.filter(item => item.sectionId === current.id).every(item => item.archivedAt !== null && !item.active));
    assert.equal((await product("product-a")).revision, aBeforeArchive.revision + 1); assert.equal((await product("product-a")).pvValue, aBeforeArchive.pvValue);
    assert.equal((await section("section-b")).archivedAt, null); assert.equal(catalog.products.length, 4);
  });
  await rejected("Child stale update rejected after section cascade", () => repository.updateProduct("product-a", aBeforeArchive.revision, { pvValue: 999 }), StoreRevisionConflictError);
  await rejected("Stale section archive rejected", () => repository.archiveSection("section-a", 1), StoreRevisionConflictError);
  await rejected("New category cannot reference archived Section", () => repository.createCategory({ id: "archived-parent-category", sectionId: "section-a", name: "invalid", slug: "invalid" }));
  await rejected("New Product cannot reference archived Section", () => repository.createProduct(newProduct()));
  await rejected("Archived Product cannot publish", async () => { const current = await product("product-c"); return repository.publishProduct(current.id, current.revision); });
  await rejected("Archived Section cannot reactivate", async () => { const current = await section("section-a"); return repository.updateSection(current.id, current.revision, { active: true }); });
  await test("All Store Products remain non-subscription", async () => { assert.ok((await repository.read()).products.every(item => item.subscriptionEligible === false)); });
  await test("All Store backups validate and retain pre-update values", async () => {
    const backupFiles = await fs.readdir(path.join(root, "store-domain/backups")); assert.ok(backupFiles.length > 0);
    const catalogs = await Promise.all(backupFiles.map(async file => JSON.parse(await fs.readFile(path.join(root, "store-domain/backups", file), "utf8"))));
    catalogs.forEach(validateStoreCatalog);
    assert.ok(catalogs.some(catalog => catalog.products.some((item: { id: string; pvValue: number }) => item.id === "product-a" && item.pvValue === 0)));
    assert.ok(catalogs.every(catalog => !catalog.products.some((item: { id: string }) => item.id === "existing-artwork")));
  });
  await test("Standalone validation rejects missing publish state and unknown fields", async () => {
    const parent = { ...await section("section-b") } as Record<string, unknown>; delete parent.published;
    const currentProduct = await product("product-c");
    const currentCategory = await category("category-b");
    assert.throws(() => validateStoreSection(parent), StoreValidationError);
    assert.throws(() => validateStoreProduct({ ...currentProduct, unexpected: true }), StoreValidationError);
    assert.throws(() => validateStoreCategory({ ...currentCategory, sectionId: null }), StoreValidationError);
  });
  await test("Private root resolution follows KD_DATA_DIR without public writes", () => {
    assert.equal(createStoreRepository().catalogPath, repository.catalogPath);
    assert.throws(() => createStoreRepository({ dataRoot: path.resolve("public/data") }), StoreValidationError);
    assert.throws(() => createStoreRepository({ dataRoot: "relative" }), StoreValidationError);
    assert.throws(() => createStoreRepository({ dataRoot: path.parse(root).root }), StoreValidationError);
  });
  await test("Corrupt catalog fails closed without replacing original bytes", async () => {
    const corrupt = createStoreRepository({ dataRoot: path.join(root, "corrupt"), now: () => new Date(timestamp) });
    await fs.mkdir(path.dirname(corrupt.catalogPath), { recursive: true }); await fs.writeFile(corrupt.catalogPath, "{corrupt");
    await assert.rejects(corrupt.read(), StoreRepositoryIntegrityError);
    await assert.rejects(() => corrupt.createSection({ id: "must-not-overwrite", name: "invalid", slug: "invalid" }), StoreRepositoryIntegrityError);
    assert.equal(await fs.readFile(corrupt.catalogPath, "utf8"), "{corrupt");
  });
  await test("Unsupported schema fails closed", async () => {
    const incompatible = createStoreRepository({ dataRoot: path.join(root, "unsupported") }); await fs.mkdir(path.dirname(incompatible.catalogPath), { recursive: true });
    const json = JSON.stringify({ ...await repository.read(), schemaVersion: 2 }); await fs.writeFile(incompatible.catalogPath, json);
    await assert.rejects(incompatible.read(), StoreRepositoryIntegrityError); assert.equal(await fs.readFile(incompatible.catalogPath, "utf8"), json);
  });
  await test("Store directory junction cannot redirect writes", async () => {
    const linkedRoot = path.join(root, "linked"); const destination = path.join(root, "link-destination");
    await fs.mkdir(linkedRoot); await fs.mkdir(destination); await fs.writeFile(path.join(destination, "sentinel.txt"), "unchanged");
    await fs.symlink(destination, path.join(linkedRoot, "store-domain"), process.platform === "win32" ? "junction" : "dir");
    const linked = createStoreRepository({ dataRoot: linkedRoot });
    await assert.rejects(linked.initialize(), StoreRepositoryIntegrityError); assert.deepEqual(await fs.readdir(destination), ["sentinel.txt"]);
  });
  await test("Existing Artwork/coffee sources and sentinel remain unchanged", async () => {
    assert.deepEqual(await hashes(), protectedBefore); assert.equal(await fs.readFile(artworkSentinel, "utf8"), sentinel);
    const source = await fs.readFile("lib/storeRepository.ts", "utf8");
    assert.ok(!/membershipCommerce|websiteData|ProductManager|productCommerceUpdates|productAssetUpdates|getWebsiteDataFile/u.test(source));
  });
  const { runStoreSeoTests } = await import(new URL("./test-phase-j6b-store-seo.mts", import.meta.url).href);
  await runStoreSeoTests(test, path.join(root, "seo-regression"));
  console.log(`J.6B Store domain: PASS ${passed}/${passed}; fixture root: ${root}`);
}
