import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { findPublicStoreProductBySlug, paginatePublicStoreProducts, selectPublicStoreIndex } from "../lib/storePublicSelectors";
import type { StoreCatalog, StoreCategory, StoreMediaReference, StoreProduct, StoreSection } from "../lib/storeTypes";

const timestamp = "2026-10-09T00:00:00.000Z";
const entity = (id: string) => ({ id, revision: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null });
function section(id: string, overrides: Partial<StoreSection> = {}): StoreSection {
  return { ...entity(id), slug: id, name: id, shortDescription: "Section intro", description: "Section description",
    active: true, published: true, sortOrder: 0, showOnHomepage: false, homepageSortOrder: 0,
    showInNavigation: false, navigationSortOrder: 0, seoTitle: "", seoDescription: "", ...overrides };
}
function category(id: string, sectionId: string, overrides: Partial<StoreCategory> = {}): StoreCategory {
  return { ...entity(id), sectionId, slug: id, name: id, description: "Category description", active: true, sortOrder: 0, ...overrides };
}
function product(id: string, sectionId: string, overrides: Partial<StoreProduct> = {}): StoreProduct {
  return { ...entity(id), sectionId, slug: id, name: id, shortDescription: "Product intro",
    description: "Product description\n<script>text stays text</script>", productType: "general", sku: id.toUpperCase(),
    price: 50, inventory: 2, active: true, published: true, sortOrder: 0, featured: false, pvValue: 123.5,
    kdRedemption: { mode: "enabled", maxDiscountPercent: 50 }, subscriptionEligible: false, gallery: [], specifications: [], ...overrides };
}
const hero: StoreMediaReference = { type: "image", url: "https://example.com/hero.webp", alt: "  stored ALT  ",
  provider: "cloudinary", publicId: "products/hero", width: 800, height: 600, format: "webp", bytes: 200 };
const gallery: StoreMediaReference[] = [
  { type: "video", url: "https://example.com/gallery.mp4", posterUrl: "https://example.com/poster.webp", alt: "", provider: "cloudinary", duration: 0 },
  { type: "youtube", url: "https://www.youtube.com/watch?v=abcdefghijk", videoId: "abcdefghijk", alt: "影片說明" },
  { type: "image", url: "/uploads/gallery.webp", provider: "local", alt: "third" },
];
function fixture(): StoreCatalog {
  return { schemaVersion: 1, revision: 1, updatedAt: timestamp,
    sections: [section("section-b", { sortOrder: 1 }), section("section-a")],
    categories: [category("category-b", "section-b", { slug: "shared" }),
      category("category-a", "section-a", { slug: "shared" }), category("category-z", "section-a", { slug: "zeta", sortOrder: 2 })],
    products: [product("bravo", "section-b", { categoryId: "category-b", price: 0, inventory: 0 }),
      product("alpha", "section-a", { categoryId: "category-a", price: 125.5, salePrice: 0, featured: true,
        heroMedia: structuredClone(hero), gallery: structuredClone(gallery), seoTitle: "  Owner title  ", seoDescription: "  Owner description  ",
        specifications: [{ key: "last", label: "Last", value: "3", sortOrder: 2 },
          { key: "first", label: "First", value: "1", sortOrder: 1 }, { key: "tied", label: "Tied", value: "2", sortOrder: 1 }] }),
      product("charlie", "section-a", { sortOrder: 1, salePrice: 50 })] };
}
function detail(catalog = fixture(), slug = "alpha") {
  const value = findPublicStoreProductBySlug(catalog, slug);
  assert.ok(value); return value;
}
const slugs = (values: { slug: string }[]) => values.map(value => value.slug);
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
const privateKeys = new Set(["id", "revision", "createdAt", "updatedAt", "archivedAt", "pvValue", "kdRedemption",
  "subscriptionEligible", "inventory", "sku", "sectionId", "categoryId", "active", "published", "sortOrder", "seoTitle", "seoDescription",
  "catalogPath", "backupsPath", "dataRoot", "showOnHomepage", "homepageSortOrder", "showInNavigation", "navigationSortOrder"]);
function assertPublic(value: unknown) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!privateKeys.has(key), `Public DTO leaked ${key}`);
    assertPublic(child);
  }
}
const protectedFiles = [
  "app/works/page.tsx", "app/works/[slug]/page.tsx", "app/cart/page.tsx", "app/checkout/page.tsx", "app/api/orders/route.ts",
  "components/commerce/AddToCart.tsx", "components/commerce/CartProvider.tsx",
  "lib/membershipCommerce.ts", "lib/referralPv.ts", "lib/membershipBusinessRules.ts",
  "lib/storeRepository.ts", "lib/storeValidation.ts", "lib/storeTypes.ts", "lib/storeSeo.ts", "components/media/KdMedia.tsx",
  "public/data/website-data.json", "scripts/test-phase-j6c-store-admin.mjs", "package.json", "package-lock.json",
];
async function protectedHashes() {
  return Object.fromEntries(await Promise.all(protectedFiles.map(async file =>
    [file, createHash("sha256").update(await fs.readFile(file)).digest("hex")])));
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6d1-public-read-"));
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
  const previousDataRoot = process.env.KD_DATA_DIR;
  const previousRailwayRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  process.env.KD_DATA_DIR = root;
  delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
  const beforeHashes = await protectedHashes();
  let passed = 0;
  async function test(label: string, operation: () => unknown | Promise<unknown>) {
    try { await operation(); passed++; console.log(`PASS ${String(passed).padStart(3, "0")} ${label}`); }
    catch (error) { console.error(`FAIL ${label}`); throw error; }
  }
  async function diskSnapshot(directory = root): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      const relative = path.relative(root, file);
      if (entry.isDirectory()) { result[relative] = "directory"; Object.assign(result, await diskSnapshot(file)); }
      else result[relative] = createHash("sha256").update(await fs.readFile(file)).digest("hex");
    }
    return result;
  }
  try {
    const { readPublicStoreIndex, readPublicStoreProductBySlug } = await import("../lib/storePublicReadModel");
    const { createStoreRepository, StoreRepositoryIntegrityError } = await import("../lib/storeRepository");
    const validateStoreCatalog: typeof import("../lib/storeValidation").validateStoreCatalog =
      (await import("../lib/storeValidation")).validateStoreCatalog;
    const repository = createStoreRepository();

    await test("Visible Sections included", () => assert.deepEqual(slugs(selectPublicStoreIndex(fixture()).sections), ["section-a", "section-b"]));
    for (const [label, change] of [
      ["inactive", { active: false }], ["unpublished", { published: false }], ["archived", { archivedAt: timestamp }],
    ] as const) await test(`${label} Section hides itself, children and direct detail`, () => {
      const catalog = fixture(); Object.assign(catalog.sections[1], change);
      const index = selectPublicStoreIndex(catalog);
      assert.deepEqual(slugs(index.sections), ["section-b"]);
      assert.deepEqual(index.categories.map(item => item.sectionSlug), ["section-b"]);
      assert.deepEqual(slugs(index.products.items), ["bravo"]);
      assert.equal(findPublicStoreProductBySlug(catalog, "alpha"), null);
      assert.equal(findPublicStoreProductBySlug(catalog, "charlie"), null);
    });
    await test("Active Category under public Section included", () => assert.equal(selectPublicStoreIndex(fixture()).categories.length, 3));
    for (const [label, change] of [["inactive", { active: false }], ["archived", { archivedAt: timestamp }]] as const)
      await test(`${label} Category hides category and assigned Product`, () => {
        const catalog = fixture(); Object.assign(catalog.categories[1], change);
        assert.equal(selectPublicStoreIndex(catalog).categories.length, 2);
        assert.deepEqual(slugs(selectPublicStoreIndex(catalog).products.items), ["bravo", "charlie"]);
        assert.equal(findPublicStoreProductBySlug(catalog, "alpha"), null);
      });
    await test("Category with missing parent cannot appear", () => {
      const catalog = fixture(); catalog.categories[1].sectionId = "missing";
      assert.equal(selectPublicStoreIndex(catalog).categories.length, 2);
      assert.equal(findPublicStoreProductBySlug(catalog, "alpha"), null);
    });
    await test("Public Products included", () => assert.deepEqual(slugs(selectPublicStoreIndex(fixture()).products.items), ["alpha", "bravo", "charlie"]));
    for (const [label, change] of [
      ["inactive", { active: false }], ["unpublished", { published: false }], ["archived", { archivedAt: timestamp }],
    ] as const) await test(`${label} Product absent from index and direct lookup`, () => {
      const catalog = fixture(); Object.assign(catalog.products[1], change);
      assert.deepEqual(slugs(selectPublicStoreIndex(catalog).products.items), ["bravo", "charlie"]);
      assert.equal(findPublicStoreProductBySlug(catalog, "alpha"), null);
    });
    await test("Uncategorized public Product allowed", () => assert.equal(detail(fixture(), "charlie").category, undefined));
    await test("Category/Section mismatch cannot leak Product", () => {
      const catalog = fixture(); catalog.products[1].categoryId = "category-b";
      assert.equal(findPublicStoreProductBySlug(catalog, "alpha"), null);
      assert.deepEqual(slugs(selectPublicStoreIndex(catalog).products.items), ["bravo", "charlie"]);
    });
    await test("Missing assigned Category cannot leak Product", () => {
      const catalog = fixture(); catalog.products[1].categoryId = "missing";
      assert.equal(findPublicStoreProductBySlug(catalog, "alpha"), null);
    });
    await test("Present but empty categoryId does not count as uncategorized", () => {
      const catalog = fixture(); catalog.products[1].categoryId = "";
      assert.equal(findPublicStoreProductBySlug(catalog, "alpha"), null);
    });
    await test("Missing Section cannot leak Product", () => {
      const catalog = fixture(); catalog.products[1].sectionId = "missing";
      assert.equal(findPublicStoreProductBySlug(catalog, "alpha"), null);
    });
    await test("Inventory zero remains visible with inStock false", () => assert.equal(detail(fixture(), "bravo").inStock, false));
    await test("Positive inventory maps to inStock true", () => assert.equal(detail().inStock, true));
    await test("featured does not change visibility", () => {
      const catalog = fixture(); catalog.products[1].featured = false;
      assert.deepEqual(slugs(selectPublicStoreIndex(catalog).products.items), ["alpha", "bravo", "charlie"]);
    });
    await test("Homepage/navigation flags are not visibility gates", () => {
      const catalog = fixture();
      assert.ok(catalog.sections.every(item => !item.showOnHomepage && !item.showInNavigation));
      assert.equal(selectPublicStoreIndex(catalog).products.totalItems, 3);
      catalog.sections.forEach(item => { item.showOnHomepage = true; item.showInNavigation = true; });
      assert.equal(selectPublicStoreIndex(catalog).products.totalItems, 3);
    });

    await test("Sections sortOrder then ASCII slug ascending", () => {
      const catalog = fixture(); catalog.sections[1].sortOrder = 1; catalog.sections.reverse();
      assert.deepEqual(slugs(selectPublicStoreIndex(catalog).sections), ["section-a", "section-b"]);
    });
    await test("Categories sortOrder then slug ascending", () => {
      const catalog = fixture(); catalog.categories.push(category("category-aa", "section-a", { slug: "aaa" }));
      assert.deepEqual(slugs(selectPublicStoreIndex(catalog).categories), ["aaa", "shared", "shared", "zeta"]);
    });
    await test("Products sortOrder then slug ascending", () => {
      const catalog = fixture(); catalog.products.reverse();
      assert.deepEqual(slugs(selectPublicStoreIndex(catalog).products.items), ["alpha", "bravo", "charlie"]);
    });
    await test("featured inventory price and timestamps cannot override Owner ordering", () => {
      const catalog = fixture(); catalog.products[2].featured = true; catalog.products[2].price = 0;
      catalog.products[2].inventory = 999; catalog.products[2].createdAt = "2020-01-01T00:00:00.000Z";
      catalog.products[2].updatedAt = "2030-01-01T00:00:00.000Z";
      assert.deepEqual(slugs(selectPublicStoreIndex(catalog).products.items), ["alpha", "bravo", "charlie"]);
    });

    await test("No filters returns all public Sections Categories Products", () => {
      const index = selectPublicStoreIndex(fixture());
      assert.equal(index.filterStatus, "valid"); assert.equal(index.selectedSection, null); assert.equal(index.selectedCategory, null);
      assert.equal(index.sections.length, 2); assert.equal(index.categories.length, 3); assert.equal(index.products.totalItems, 3);
    });
    await test("Section filter restricts Products and Category options", () => {
      const index = selectPublicStoreIndex(fixture(), { sectionSlug: "section-a" });
      assert.equal(index.filterStatus, "valid"); assert.equal(index.selectedSection?.slug, "section-a");
      assert.equal(index.sections.length, 2); assert.deepEqual(index.categories.map(item => item.sectionSlug), ["section-a", "section-a"]);
      assert.deepEqual(slugs(index.products.items), ["alpha", "charlie"]);
    });
    await test("Section plus Category filter uses assigned relation", () => {
      const index = selectPublicStoreIndex(fixture(), { sectionSlug: "section-a", categorySlug: "shared" });
      assert.equal(index.selectedCategory?.sectionSlug, "section-a"); assert.equal(index.filterStatus, "valid");
      assert.deepEqual(slugs(index.products.items), ["alpha"]); assert.equal(index.categories.length, 2);
    });
    await test("Duplicate Category slugs across Sections stay independent", () => {
      assert.deepEqual(slugs(selectPublicStoreIndex(fixture(), { sectionSlug: "section-b", categorySlug: "shared" }).products.items), ["bravo"]);
      assert.deepEqual(slugs(selectPublicStoreIndex(fixture(), { sectionSlug: "section-a", categorySlug: "shared" }).products.items), ["alpha"]);
    });
    await test("Unknown Section does not widen results", () => {
      const index = selectPublicStoreIndex(fixture(), { sectionSlug: "unknown" });
      assert.equal(index.filterStatus, "unknown-section"); assert.equal(index.selectedSection, null);
      assert.equal(index.selectedCategory, null); assert.deepEqual(index.categories, []); assert.equal(index.products.totalItems, 0);
    });
    await test("Category without Section is invalid with no cross-Section match", () => {
      const index = selectPublicStoreIndex(fixture(), { categorySlug: "shared" });
      assert.equal(index.filterStatus, "category-requires-section"); assert.deepEqual(index.categories, []);
      assert.equal(index.selectedCategory, null); assert.equal(index.products.totalItems, 0);
    });
    await test("Category with unknown Section keeps unknown-section status", () => {
      const index = selectPublicStoreIndex(fixture(), { sectionSlug: "missing", categorySlug: "shared" });
      assert.equal(index.filterStatus, "unknown-section"); assert.equal(index.products.totalItems, 0);
    });
    await test("Unknown Category retains valid Section options but zero Products", () => {
      const index = selectPublicStoreIndex(fixture(), { sectionSlug: "section-a", categorySlug: "missing" });
      assert.equal(index.filterStatus, "unknown-category"); assert.equal(index.selectedSection?.slug, "section-a");
      assert.equal(index.selectedCategory, null); assert.equal(index.categories.length, 2); assert.equal(index.products.totalItems, 0);
    });
    await test("Category from another Section cannot match", () => {
      const catalog = fixture(); catalog.categories[0].slug = "only-b";
      const index = selectPublicStoreIndex(catalog, { sectionSlug: "section-a", categorySlug: "only-b" });
      assert.equal(index.filterStatus, "unknown-category"); assert.equal(index.products.totalItems, 0);
    });
    await test("Hidden Section filter cannot reveal children", () => {
      const catalog = fixture(); catalog.sections[1].published = false;
      const index = selectPublicStoreIndex(catalog, { sectionSlug: "section-a" });
      assert.equal(index.filterStatus, "unknown-section"); assert.deepEqual(index.categories, []); assert.equal(index.products.totalItems, 0);
    });
    await test("Hidden Category filter cannot reveal assigned Product", () => {
      const catalog = fixture(); catalog.categories[1].active = false;
      const index = selectPublicStoreIndex(catalog, { sectionSlug: "section-a", categorySlug: "shared" });
      assert.equal(index.filterStatus, "unknown-category"); assert.equal(index.products.totalItems, 0);
    });
    await test("Empty supplied filter is invalid rather than unfiltered", () => {
      assert.equal(selectPublicStoreIndex(fixture(), { sectionSlug: "" }).filterStatus, "unknown-section");
      assert.equal(selectPublicStoreIndex(fixture(), { sectionSlug: "section-a", categorySlug: "" }).filterStatus, "unknown-category");
    });

    await test("Recursive index DTO excludes persistence reward inventory and placement internals", () => assertPublic(selectPublicStoreIndex(fixture())));
    await test("Recursive detail DTO excludes persistence reward inventory SKU and manual SEO", () => assertPublic(detail()));
    await test("Section DTO has only four public fields", () => assert.deepEqual(Object.keys(selectPublicStoreIndex(fixture()).sections[0]).sort(),
      ["description", "name", "shortDescription", "slug"]));
    await test("Category DTO uses sectionSlug and no persistence identity", () => assert.deepEqual(Object.keys(selectPublicStoreIndex(fixture()).categories[0]).sort(),
      ["description", "name", "sectionSlug", "slug"]));
    await test("Card relation summaries contain only slug/name", () => {
      const card = selectPublicStoreIndex(fixture()).products.items[0];
      assert.deepEqual(Object.keys(card.section).sort(), ["name", "slug"]); assert.deepEqual(Object.keys(card.category!).sort(), ["name", "slug"]);
      assert.ok(!("description" in card) && !("gallery" in card) && !("specifications" in card));
    });
    await test("Extra source internals are not copied into public DTO", () => {
      const catalog = fixture();
      Object.assign(catalog.products[1], { catalogPath: "private", secret: "never" });
      Object.assign(catalog.products[1].heroMedia!, { id: "media-private", secret: "never" });
      assertPublic(detail(catalog)); assert.ok(!JSON.stringify(detail(catalog)).includes("never"));
    });
    await test("price zero preserved numerically", () => assert.equal(detail(fixture(), "bravo").price, 0));
    await test("salePrice zero preserved as an own numeric field", () => {
      const value = detail(); assert.ok(Object.hasOwn(value, "salePrice")); assert.equal(value.salePrice, 0);
    });
    await test("Absent salePrice remains absent", () => assert.ok(!Object.hasOwn(detail(fixture(), "bravo"), "salePrice")));
    await test("salePrice equal to price is retained without discount fields", () => {
      const value = detail(fixture(), "charlie"); assert.equal(value.price, 50); assert.equal(value.salePrice, 50);
      assert.ok(!("discount" in value) && !("discountPercent" in value));
    });
    await test("Decimal price is not rounded or currency-formatted", () => assert.equal(detail().price, 125.5));
    await test("Missing hero is allowed and remains absent", () => assert.ok(!Object.hasOwn(detail(fixture(), "bravo"), "heroMedia")));
    await test("Hero preserves the existing media shape", () => assert.deepEqual(detail().heroMedia, hero));
    await test("Gallery preserves stored image video YouTube order and fields", () => assert.deepEqual(detail().gallery, gallery));
    await test("ALT stays exact including whitespace and empty text", () => {
      assert.equal(detail().heroMedia?.alt, "  stored ALT  "); assert.equal(detail().gallery[0].alt, "");
    });
    await test("Empty gallery and specifications remain valid empty arrays", () => {
      const value = detail(fixture(), "bravo"); assert.deepEqual(value.gallery, []); assert.deepEqual(value.specifications, []);
    });
    await test("Specification ordering preserves stored order for ties", () => assert.deepEqual(detail().specifications,
      [{ label: "First", value: "1" }, { label: "Tied", value: "2" }, { label: "Last", value: "3" }]));
    await test("Descriptions stay exact plain source strings", () => assert.equal(detail().description, fixture().products[1].description));
    await test("Selectors accept a deeply frozen catalog without mutation", () => {
      const catalog = deepFreeze(fixture()); const before = JSON.stringify(catalog);
      selectPublicStoreIndex(catalog); selectPublicStoreIndex(catalog, { sectionSlug: "section-a", categorySlug: "shared" });
      detail(catalog); assert.equal(JSON.stringify(catalog), before);
    });
    await test("Changing returned nested DTOs cannot mutate source catalog", () => {
      const catalog = fixture(); const before = JSON.stringify(catalog); const value = detail(catalog);
      value.heroMedia!.alt = "changed"; value.gallery[0].alt = "changed"; value.gallery.reverse();
      value.specifications[0].label = "changed"; value.section.name = "changed"; value.category!.name = "changed";
      const index = selectPublicStoreIndex(catalog); index.sections[0].name = "changed"; index.categories[0].name = "changed";
      index.products.items[0].heroMedia!.alt = "changed"; assert.equal(JSON.stringify(catalog), before);
    });
    await test("Visible slug returns exact detail identity", () => assert.equal(detail().slug, "alpha"));
    await test("Unknown slug returns null", () => assert.equal(findPublicStoreProductBySlug(fixture(), "unknown"), null));
    await test("Slug lookup does not guess or normalize identities", () => {
      assert.equal(findPublicStoreProductBySlug(fixture(), "ALPHA"), null); assert.equal(findPublicStoreProductBySlug(fixture(), " alpha "), null);
    });

    const pageItems = Array.from({ length: 50 }, (_, index) => index);
    await test("First page defaults to 24 with stable total counts", () => assert.deepEqual(paginatePublicStoreProducts(pageItems), {
      items: pageItems.slice(0, 24), page: 1, pageSize: 24, totalItems: 50, totalPages: 3,
    }));
    await test("Last partial page retains exact remaining order", () => assert.deepEqual(paginatePublicStoreProducts(pageItems, 3).items, [48, 49]));
    await test("Oversized page clamps to last page", () => assert.equal(paginatePublicStoreProducts(pageItems, 999).page, 3));
    for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "2", null] as unknown[])
      await test(`Invalid page ${String(value)} normalizes to first page`, () => assert.equal(paginatePublicStoreProducts(pageItems, value as number).page, 1));
    await test("Oversized pageSize is bounded to 24", () => assert.equal(paginatePublicStoreProducts(pageItems, 1, 100).pageSize, 24));
    await test("Positive smaller pageSize is respected", () => {
      const page = paginatePublicStoreProducts(pageItems, 2, 10); assert.equal(page.pageSize, 10);
      assert.equal(page.totalPages, 5); assert.deepEqual(page.items, pageItems.slice(10, 20));
    });
    for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "10", null] as unknown[])
      await test(`Invalid pageSize ${String(value)} normalizes to 24`, () => assert.equal(paginatePublicStoreProducts(pageItems, 1, value as number).pageSize, 24));
    await test("Empty pagination has page 1 and totalPages 0", () => assert.deepEqual(paginatePublicStoreProducts([], 9), {
      items: [], page: 1, pageSize: 24, totalItems: 0, totalPages: 0,
    }));
    await test("Index pagination uses filtered totals and preserves Owner order", () => {
      const index = selectPublicStoreIndex(fixture(), { sectionSlug: "section-a", page: 2, pageSize: 1 });
      assert.equal(index.products.totalItems, 2); assert.equal(index.products.totalPages, 2);
      assert.deepEqual(slugs(index.products.items), ["charlie"]);
    });
    await test("Pagination leaves original collection order intact", () => {
      const frozen = Object.freeze([...pageItems]); paginatePublicStoreProducts(frozen, 2); assert.deepEqual(frozen, pageItems);
    });

    await test("Healthy absent catalog returns valid empty model and null detail", async () => {
      assert.deepEqual(await diskSnapshot(), {});
      const index = await readPublicStoreIndex();
      assert.equal(index.filterStatus, "valid"); assert.deepEqual(index.sections, []); assert.deepEqual(index.categories, []);
      assert.equal(index.products.totalItems, 0); assert.equal(await readPublicStoreProductBySlug("alpha"), null);
      assert.deepEqual(await diskSnapshot(), {});
    });
    await test("Absent catalog read creates no catalog lock backup upload temp or domain directory", async () => {
      await readPublicStoreIndex({ sectionSlug: "missing" }); await readPublicStoreProductBySlug("missing");
      assert.deepEqual(await diskSnapshot(), {});
      await assert.rejects(fs.access(repository.catalogPath), { code: "ENOENT" });
      await assert.rejects(fs.access(path.dirname(repository.catalogPath)), { code: "ENOENT" });
    });
    const domainDirectory = path.dirname(repository.catalogPath);
    await fs.mkdir(domainDirectory);
    await test("Existing empty domain directory also stays unchanged on reads", async () => {
      const before = await diskSnapshot(); await readPublicStoreIndex(); await readPublicStoreProductBySlug("alpha");
      assert.deepEqual(await diskSnapshot(), before);
    });
    const healthy = fixture(); validateStoreCatalog(healthy);
    const healthyBytes = JSON.stringify(healthy, null, 2) + "\n";
    await fs.writeFile(repository.catalogPath, healthyBytes);
    await test("Healthy repository returns public index through real read path", async () => {
      assert.deepEqual(await readPublicStoreIndex(), selectPublicStoreIndex(healthy));
      assert.deepEqual(await readPublicStoreIndex({ sectionSlug: "section-b", categorySlug: "shared" }),
        selectPublicStoreIndex(healthy, { sectionSlug: "section-b", categorySlug: "shared" }));
    });
    await test("Server detail separates exact manual SEO from public product", async () => {
      const model = await readPublicStoreProductBySlug("alpha"); assert.ok(model);
      assert.deepEqual(model.product, detail(healthy)); assertPublic(model.product);
      assert.deepEqual(model.manualSeo, { seoTitle: "  Owner title  ", seoDescription: "  Owner description  " });
    });
    await test("Absent manual SEO stays absent with no computed fallback", async () => {
      const model = await readPublicStoreProductBySlug("bravo"); assert.ok(model); assert.deepEqual(model.manualSeo, {});
    });
    await test("Public reads leave healthy catalog bytes and filesystem tree identical", async () => {
      const before = await diskSnapshot();
      await readPublicStoreIndex(); await readPublicStoreProductBySlug("alpha"); await readPublicStoreProductBySlug("missing");
      assert.equal(await fs.readFile(repository.catalogPath, "utf8"), healthyBytes);
      assert.deepEqual(await diskSnapshot(), before);
    });
    await test("Repository reads do not mutate protected production fixture/source hashes", async () => assert.deepEqual(await protectedHashes(), beforeHashes));
    await test("Later read reflects changed isolated catalog without persistent read cache", async () => {
      const changed = fixture(); changed.products[1].name = "Owner changed"; changed.products[1].seoTitle = "Changed SEO";
      await fs.writeFile(repository.catalogPath, JSON.stringify(changed));
      const before = await diskSnapshot(); const model = await readPublicStoreProductBySlug("alpha"); assert.ok(model);
      assert.equal(model.product.name, "Owner changed"); assert.equal(model.manualSeo.seoTitle, "Changed SEO");
      assert.equal((await readPublicStoreIndex()).products.items[0].name, "Owner changed");
      assert.deepEqual(await diskSnapshot(), before);
    });
    await test("Direct server lookup cannot leak unpublished Product or its manual SEO", async () => {
      const changed = fixture(); changed.products[1].published = false;
      await fs.writeFile(repository.catalogPath, JSON.stringify(changed));
      assert.equal(await readPublicStoreProductBySlug("alpha"), null);
    });
    await test("Direct server lookup cannot leak inactive parent Section", async () => {
      const changed = fixture(); changed.sections[1].active = false; changed.sections[1].published = false;
      changed.products.filter(item => item.sectionId === "section-a").forEach(item => { item.published = false; });
      await fs.writeFile(repository.catalogPath, JSON.stringify(changed));
      assert.equal(await readPublicStoreProductBySlug("alpha"), null);
    });
    await test("Corrupt JSON propagates integrity error and preserves bytes with no writes", async () => {
      const bytes = "{broken"; await fs.writeFile(repository.catalogPath, bytes); const before = await diskSnapshot();
      await assert.rejects(() => readPublicStoreIndex(), StoreRepositoryIntegrityError);
      await assert.rejects(() => readPublicStoreProductBySlug("alpha"), StoreRepositoryIntegrityError);
      assert.equal(await fs.readFile(repository.catalogPath, "utf8"), bytes); assert.deepEqual(await diskSnapshot(), before);
    });
    await test("Incompatible schema propagates integrity error with unchanged bytes", async () => {
      const bytes = JSON.stringify({ ...fixture(), schemaVersion: 2 }); await fs.writeFile(repository.catalogPath, bytes);
      const before = await diskSnapshot();
      await assert.rejects(() => readPublicStoreIndex(), StoreRepositoryIntegrityError);
      await assert.rejects(() => readPublicStoreProductBySlug("alpha"), StoreRepositoryIntegrityError);
      assert.equal(await fs.readFile(repository.catalogPath, "utf8"), bytes); assert.deepEqual(await diskSnapshot(), before);
    });
    await test("Invalid persisted relationship fails closed instead of producing partial data", async () => {
      const changed = fixture(); changed.products[1].categoryId = "category-b";
      await fs.writeFile(repository.catalogPath, JSON.stringify(changed)); const before = await diskSnapshot();
      await assert.rejects(() => readPublicStoreIndex(), StoreRepositoryIntegrityError);
      assert.deepEqual(await diskSnapshot(), before);
    });
    await test("Non-file catalog integrity failure propagates with no bootstrap or backup", async () => {
      await fs.unlink(repository.catalogPath); await fs.mkdir(repository.catalogPath); const before = await diskSnapshot();
      await assert.rejects(() => readPublicStoreIndex(), StoreRepositoryIntegrityError);
      await assert.rejects(() => readPublicStoreProductBySlug("alpha"), StoreRepositoryIntegrityError);
      assert.deepEqual(await diskSnapshot(), before);
    });

    await test("Public Store landing has no detail route, public API or commerce wiring", async () => {
      await fs.access("app/store/page.tsx");
      await assert.rejects(fs.access("app/store/[slug]"), { code: "ENOENT" });
      await assert.rejects(fs.access("app/api/store"), { code: "ENOENT" });
      const publicSource = (await Promise.all([
        "app/store/layout.tsx", "app/store/page.tsx", "app/store/error.tsx",
        "components/store/StoreFilters.tsx", "components/store/StoreProductCard.tsx", "lib/storePublicMetadata.ts",
      ].map(file => fs.readFile(file, "utf8")))).join("\n");
      assert.doesNotMatch(publicSource, /AddToCart|CartProvider|\/api\/orders|membershipCommerce|referralPv|checkout|wallet|subscription/i);
    });
    await test("Pure selectors import only domain types and contain no environment filesystem or repository access", async () => {
      const source = await fs.readFile("lib/storePublicSelectors.ts", "utf8");
      const imports = source.match(/^import[^\n]+/gm) ?? [];
      assert.equal(imports.length, 1); assert.match(imports[0], /^import type .* from "\.\/storeTypes";$/);
      assert.doesNotMatch(source, /server-only|process\.env|node:|createStoreRepository|fetch\s*\(/);
    });
    await test("Server read model contains only read calls and no commerce or mutation wiring", async () => {
      const source = await fs.readFile("lib/storePublicReadModel.ts", "utf8");
      assert.match(source, /import "server-only"/);
      assert.equal((source.match(/createStoreRepository\(\)\.read\(\)/g) ?? []).length, 2);
      assert.doesNotMatch(source, /\.initialize\(|\.create(?:Product|Section|Category)\(|\.update|\.archive|withCatalogLock|atomicWrite|writeFile|fetch\(|catch\s*\(/);
      assert.doesNotMatch(source, /AddToCart|CartProvider|checkout|\/api\/orders|membershipCommerce|referral|reward|cloudinary/i);
      const dependencies = [...source.matchAll(/(?:from\s+|import\s+)["']([^"']+)["']/g)].map(match => match[1]);
      assert.deepEqual([...new Set(dependencies)].sort(), ["./storeHero", "./storePublicSelectors", "./storeRepository", "server-only"].sort());
    });
    await test("Protected sources production fixture and package manifests remain unchanged", async () => assert.deepEqual(await protectedHashes(), beforeHashes));
    console.log(`J.6D.1 Public Store Read Model: ${passed}/${passed} PASS; ${protectedFiles.length} protected file hashes unchanged; isolated fixtures only.`);
  } finally {
    if (previousDataRoot === undefined) delete process.env.KD_DATA_DIR; else process.env.KD_DATA_DIR = previousDataRoot;
    if (previousRailwayRoot === undefined) delete process.env.RAILWAY_VOLUME_MOUNT_PATH; else process.env.RAILWAY_VOLUME_MOUNT_PATH = previousRailwayRoot;
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
}
await main().catch(error => { console.error(error); process.exitCode = 1; });
