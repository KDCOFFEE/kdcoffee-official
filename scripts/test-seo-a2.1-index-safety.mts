import "./member-copy-test-bootstrap.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as nodeModule from "node:module";
import type { StoreCatalog, StoreProduct } from "../lib/storeTypes";

// Keep real Next notFound and production metadata/read models. The shared test
// loader only supplies TSX/CSS support and presentation-only browser hooks.
type RegisterHooks = (hooks: {
  resolve: (specifier: string, context: { parentURL?: string },
    nextResolve: (specifier: string, context: { parentURL?: string }) => { url: string }) => { url: string };
  load: (url: string, context: object, nextLoad: (url: string, context: object) => object) => object;
}) => unknown;
(nodeModule as typeof nodeModule & { registerHooks: RegisterHooks }).registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/navigation") return nextResolve("next/navigation.js", context);
    if (specifier === "next/headers") return nextResolve("next/headers.js", context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) return { format: "module", source: "export default " + readFileSync(fileURLToPath(url), "utf8"), shortCircuit: true };
    return nextLoad(url, context);
  },
});

const REVIEWED_SITEMAP_PATH = /^(?:\/|\/works(?:\/[^/?]+)?|\/monthly-menu|\/pages\/[^/?]+|\/store(?:\/[^/?]+)?|\/gifts)$/u;

const project = process.cwd();
async function jsonHashes() {
  const result: Record<string, string> = {};
  async function visit(directory: string) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && entry.name.endsWith(".json"))
        result[path.relative(project, file).replaceAll("\\", "/")] = createHash("sha256").update(await fs.readFile(file)).digest("hex");
    }
  }
  for (const directory of ["data", "public/data"]) await visit(path.join(project, directory));
  return result;
}
const before = await jsonHashes();
const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-seo-a21-"));
const keys = ["KD_DATA_DIR", "RAILWAY_VOLUME_MOUNT_PATH", "STORE_SEO_PUBLIC_ENABLED", "STORE_COMMERCE_ENABLED"] as const;
const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Network is forbidden in SEO fixtures"); };
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
delete process.env.STORE_SEO_PUBLIC_ENABLED;
let passed = 0;
async function test(label: string, run: () => unknown | Promise<unknown>) {
  await run();
  console.log("PASS " + (++passed) + ": " + label);
}
async function moduleAt(file: string) { return import(pathToFileURL(path.join(project, file)).href); }
async function writeJson(file: string, value: unknown) {
  const relative = path.relative(root, file);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Fixture write escaped TEMP");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value));
}
const timestamp = "2026-10-21T00:00:00.000Z";
const entity = (id: string) => ({ id, revision: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null });
function catalogFixture(): StoreCatalog {
  const section = {
    ...entity("public-section"), name: "器具", slug: "equipment", shortDescription: "", description: "",
    active: true, published: true, sortOrder: 0, showOnHomepage: false, homepageSortOrder: 0,
    showInNavigation: false, navigationSortOrder: 0, seoTitle: "", seoDescription: "",
  };
  const product: StoreProduct = {
    ...entity("public-product"), sectionId: section.id, slug: "public-product", name: "公開商品", shortDescription: "",
    description: "", productType: "equipment" as const, sku: "FIXTURE-0", price: 100, inventory: 0,
    active: true, published: true, sortOrder: 0, featured: false, gallery: [], specifications: [],
    pvValue: 0, kdRedemption: { mode: "disabled" as const }, subscriptionEligible: false,
  };
  const products: StoreProduct[] = Array.from({ length: 27 }, (_, index) => ({
    ...structuredClone(product), id: "product-" + index, slug: "product-" + index, sku: "FIXTURE-" + index,
  }));
  const variants: Partial<StoreProduct>[] = [
    { active: false, published: false }, { published: false }, { archivedAt: timestamp, active: false, published: false },
    { sectionId: "private-section", published: false }, { categoryId: "private-category", published: false },
  ];
  variants.forEach((variant, index) => products.push({
    ...structuredClone(product), ...variant, id: "excluded-" + index, slug: "excluded-" + index, sku: "EXCLUDED-" + index,
  }));
  return {
    schemaVersion: 1, revision: 1, updatedAt: timestamp,
    sections: [section, { ...section, id: "private-section", slug: "private-section", published: false }],
    categories: [{ ...entity("private-category"), sectionId: section.id, name: "隱藏分類", slug: "private-category", description: "", active: false, sortOrder: 0 }],
    products,
  };
}
try {
  const paths = await moduleAt("lib/storagePaths.ts");
  const websiteFile: string = paths.getWebsiteDataFile();
  const pagesFile: string = paths.getPagesDataFile();
  const catalogFile = path.join(root, "store-domain/catalog.json");
  await test("Real storage resolver is inside unique TEMP before writes", () => {
    for (const file of [websiteFile, pagesFile, catalogFile]) {
      const relative = path.relative(root, file);
      assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
      assert.ok(!path.resolve(file).startsWith(path.resolve(project, "public/data")));
      assert.ok(!/^\/data(?:\/|$)/u.test(file));
    }
    console.log("TEMP website-data: " + websiteFile);
  });
  const website = JSON.parse(await fs.readFile(path.join(project, "public/data/website-data.json"), "utf8"));
  const pages = JSON.parse(await fs.readFile(path.join(project, "public/data/pages.json"), "utf8"));
  await writeJson(websiteFile, website);
  await writeJson(pagesFile, pages);
  const store = catalogFixture();
  const { validateStoreCatalog } = await moduleAt("lib/storeValidation.ts");
  validateStoreCatalog(store);
  await writeJson(catalogFile, store);
  const gate = await moduleAt("lib/storeSeoPublication.ts");
  const { generateMetadata: landingMetadata } = await moduleAt("app/store/page.tsx");
  const { generateMetadata: detailMetadata } = await moduleAt("app/store/[slug]/page.tsx");
  const { generateMetadata: giftMetadata } = await moduleAt("app/gifts/page.tsx");
  const { default: sitemap, dynamic: sitemapDynamic } = await moduleAt("app/sitemap.ts");
  const { default: robots, dynamic: robotsDynamic } = await moduleAt("app/robots.ts");
  const { getCanonicalPublicSiteOrigin } = await moduleAt("lib/publicSiteOrigin.ts");
  const { selectPublicStoreIndex, findPublicStoreProductBySlug } = await moduleAt("lib/storePublicSelectors.ts");
  const { resolveWorksProductListing } = await moduleAt("lib/productListing.ts");
  const { publishedPageRegistry, createPage } = await moduleAt("lib/pageBuilder.ts");
  const origin = getCanonicalPublicSiteOrigin();
  const landing = (query = {}) => landingMetadata({ searchParams: Promise.resolve(query) });
  const detail = (slug = "product-0") => detailMetadata({ params: Promise.resolve({ slug }) });
  const sitemapPaths = async (): Promise<string[]> => (await sitemap()).map((entry: { url: string }) => {
    const url = new URL(entry.url); assert.equal(url.origin, origin); assert.equal(url.search, ""); return url.pathname;
  });
  await test("Absent Store SEO capability is SAFE OFF", () => assert.equal(gate.isStoreSeoPublicEnabled(), false));
  for (const value of ["false", "TRUE", "True", "1", " true", "true ", ""]) {
    await test("Strict Store capability rejects " + JSON.stringify(value), () => {
      process.env.STORE_SEO_PUBLIC_ENABLED = value; assert.equal(gate.isStoreSeoPublicEnabled(), false);
    });
  }
  delete process.env.STORE_SEO_PUBLIC_ENABLED;
  await test("Commerce enabled cannot enable SEO publication", async () => {
    process.env.STORE_COMMERCE_ENABLED = "true";
    assert.equal(gate.isStoreSeoPublicEnabled(), false);
    assert.deepEqual((await landing()).robots, { index: false, follow: true });
  });
  await test("Gate OFF keeps public detail noindex without changing content metadata", async () => {
    const meta = await detail();
    assert.deepEqual(meta.robots, { index: false, follow: true });
    assert.deepEqual(meta.alternates, { canonical: "/store/product-0" });
  });
  await test("Gate OFF keeps Gifts noindex and outside sitemap", async () => {
    const metadata = await giftMetadata();
    assert.deepEqual(metadata.alternates, { canonical: "/gifts" });
    assert.deepEqual(metadata.robots, { index: false, follow: true });
    assert.ok(!(await sitemapPaths()).includes("/gifts"));
  });
  await test("Gate OFF excludes every Store URL from sitemap", async () =>
    assert.ok((await sitemapPaths()).every(url => !url.startsWith("/store"))));
  await test("Gate OFF does not read unavailable Store storage", async () => {
    await fs.writeFile(catalogFile, "{broken");
    try { assert.ok((await sitemapPaths()).includes("/works")); }
    finally { await writeJson(catalogFile, store); }
  });
  process.env.STORE_SEO_PUBLIC_ENABLED = "true";
  delete process.env.STORE_COMMERCE_ENABLED;
  await test("Gate ON is independent of disabled commerce", () => assert.equal(gate.isStoreSeoPublicEnabled(), true));
  await test("Gate ON canonical landing is indexable", async () =>
    assert.deepEqual((await landing()).robots, { index: true, follow: true }));
  await test("Gate ON indexes canonical Gifts and includes its landing URL", async () => {
    assert.deepEqual((await giftMetadata()).robots, { index: true, follow: true });
    assert.ok((await sitemapPaths()).includes("/gifts"));
  });
  for (const query of [{ q: "coffee" }, { section: "equipment" }, { category: "cups" }, { sort: "price" }, { page: "1" }, { unknown: "" }]) {
    await test("Gate ON preserves query noindex " + Object.keys(query)[0], async () =>
      assert.deepEqual((await landing(query)).robots, { index: false, follow: true }));
  }
  await test("Gate ON public sold-out detail remains indexable", async () => {
    assert.deepEqual((await detail()).robots, { index: true, follow: true });
    assert.equal(store.products[0].inventory, 0);
  });
  for (const product of store.products.filter(item => item.slug.startsWith("excluded-"))) {
    await test("Existing canonical selector/route reject " + product.slug, async () => {
      assert.equal(findPublicStoreProductBySlug(store, product.slug), null);
      await assert.rejects(() => detail(product.slug), (error: unknown) =>
        !!error && typeof error === "object" && "digest" in error && error.digest === "NEXT_HTTP_ERROR_FALLBACK;404");
    });
  }
  await test("Invalid and unknown slugs retain notFound", async () => {
    for (const slug of ["bad/slug", "not-a-product"])
      await assert.rejects(() => detail(slug), (error: unknown) =>
        !!error && typeof error === "object" && "digest" in error && error.digest === "NEXT_HTTP_ERROR_FALLBACK;404");
  });
  await test("Sitemap enumerates canonical public Store across pagination without raw/private products", async () => {
    const first = selectPublicStoreIndex(store).products;
    assert.ok(first.totalPages > 1);
    const expected: string[] = [];
    for (let page = 1; page <= first.totalPages; page++)
      expected.push(...selectPublicStoreIndex(store, { page }).products.items.map((product: { slug: string }) => "/store/" + product.slug));
    const actual = (await sitemapPaths()).filter(url => url.startsWith("/store/"));
    assert.deepEqual(actual, expected);
    assert.ok((await sitemapPaths()).includes("/store"));
  });
  await test("Works sitemap derives exactly from current canonical public catalog", async () => {
    assert.deepEqual((await sitemapPaths()).filter(url => url.startsWith("/works/")),
      resolveWorksProductListing(website.menu.products).map((product: { slug: string }) => "/works/" + encodeURIComponent(product.slug)));
  });
  await test("Works hidden/discontinued/not-listed/suppressed-sold-out never enter sitemap", async () => {
    const copy = structuredClone(website);
    const base = copy.menu.products[0];
    for (const [index, changes] of [
      { status: "hidden" }, { status: "discontinued" }, { inMonthlyMenu: false },
      { status: "sold_out", showWhenSoldOut: false },
    ].entries()) copy.menu.products.push({ ...base, ...changes, id: "hidden-" + index, slug: "hidden-" + index });
    await writeJson(websiteFile, copy);
    try { assert.ok((await sitemapPaths()).every(url => !url.startsWith("/works/hidden-"))); }
    finally { await writeJson(websiteFile, website); }
  });
  await test("Page Builder requires published status AND snapshot, never draft or withdrawn", async () => {
    const copy = structuredClone(pages);
    for (const [index, [status, snapshot]] of ([
      ["draft", false], ["draft", true], ["published", false], ["published", true], ["unpublished", true],
    ] as const).entries()) {
      const page = createPage("SEO fixture " + index, copy.pages, new Date(timestamp));
      page.slug = "seo-fixture-" + index; page.status = status;
      if (snapshot) page.publishedSnapshot = structuredClone(page.draft);
      copy.pages.push(page);
    }
    await writeJson(pagesFile, copy);
    try {
      const actual = (await sitemapPaths()).filter(url => url.startsWith("/pages/"));
      assert.deepEqual(actual, publishedPageRegistry(copy).filter((page: { published: boolean }) => page.published).map((page: { href: string }) => page.href));
      assert.deepEqual(actual.filter(url => url.includes("seo-fixture-")), ["/pages/seo-fixture-3"]);
    } finally { await writeJson(pagesFile, pages); }
  });
  await test("Reviewed sitemap guard accepts only the exact Gifts landing path", () => {
    assert.match("/gifts", REVIEWED_SITEMAP_PATH);
  });
  await test("Reviewed sitemap guard still rejects unknown/private/query Gift routes", () => {
    for (const path of ["/unapproved", "/giftz", "/gifts/not-approved", "/admin/gifts", "/gifts?preview=true"])
      assert.doesNotMatch(path, REVIEWED_SITEMAP_PATH);
  });
  await test("Gifts adds no changes to existing canonical sitemap URLs", async () => {
    const products = selectPublicStoreIndex(store).products;
    const storePaths: string[] = [];
    for (let page = 1; page <= products.totalPages; page++)
      storePaths.push(...selectPublicStoreIndex(store, { page }).products.items.map((product: { slug: string }) => "/store/" + product.slug));
    const expected = [...new Set(["/", "/works", "/monthly-menu",
      ...resolveWorksProductListing(website.menu.products).map((product: { slug: string }) => "/works/" + encodeURIComponent(product.slug)),
      ...publishedPageRegistry(pages).filter((page: { published: boolean }) => page.published).map((page: { href: string }) => page.href),
      "/store", ...storePaths])];
    assert.deepEqual((await sitemapPaths()).filter(path => path !== "/gifts"), expected);
  });
  await test("Gifts landing inclusion never publishes DRAFT Gift product URLs", async () => {
    const copy = structuredClone(store);
    copy.products.push({ ...structuredClone(copy.products[0]), id: "draft-gift", slug: "draft-gift", sku: "DRAFT-GIFT-FIXTURE", productType: "gift", published: false });
    validateStoreCatalog(copy);
    await writeJson(catalogFile, copy);
    try {
      assert.equal(findPublicStoreProductBySlug(copy, "draft-gift"), null);
      const urls = await sitemapPaths();
      assert.ok(urls.includes("/gifts"));
      assert.ok(!urls.includes("/store/draft-gift"));
    } finally { await writeJson(catalogFile, store); }
  });
  await test("Sitemap has only reviewed public route families, no private/auth/query URLs", async () => {
    const urls = await sitemapPaths();
    assert.ok(urls.includes("/") && urls.includes("/works") && urls.includes("/monthly-menu"));
    for (const url of urls) assert.match(url, REVIEWED_SITEMAP_PATH);
    assert.equal(new Set(urls).size, urls.length);
  });
  await test("robots allows crawling, points to official sitemap, and does not hide noindex via Disallow", () => {
    assert.deepEqual(robots(), { rules: { userAgent: "*", allow: "/" }, sitemap: origin + "/sitemap.xml" });
    assert.equal(robotsDynamic, "force-dynamic"); assert.equal(sitemapDynamic, "force-dynamic");
  });
  const privateSections = ["admin", "member", "cart", "checkout", "orders", "order-complete", "member-backup", "gmail-fulfillment"];
  for (const section of privateSections) {
    await test("Private " + section + " layout exports noindex,nofollow", async () => {
      const { metadata } = await moduleAt("app/" + section + "/layout.tsx");
      assert.deepEqual(metadata.robots, { index: false, follow: false });
    });
  }
  await test("Every actual private page inherits noindex; child robots never override it to index/follow", async () => {
    let count = 0;
    async function visit(directory: string) {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(file);
        else if (/^(?:page|layout)\.tsx$/u.test(entry.name)) {
          if (entry.name === "page.tsx") count++;
          const source = await fs.readFile(file, "utf8");
          for (const match of source.matchAll(/robots:\s*\{([^}]+)\}/gu)) {
            assert.match(match[1], /index:\s*false/u, file);
            assert.match(match[1], /follow:\s*false/u, file);
          }
        }
      }
    }
    for (const section of privateSections) await visit(path.join(project, "app", section));
    assert.ok(count > privateSections.length);
    console.log("Private pages covered by section layouts: " + count);
  });
  await test("Metadata reads leave isolated canonical fixtures byte-identical", async () => {
    const files = [websiteFile, pagesFile, catalogFile];
    const bytes = await Promise.all(files.map(file => fs.readFile(file)));
    await sitemap(); await landing(); await detail(); robots();
    assert.deepEqual(await Promise.all(files.map(file => fs.readFile(file))), bytes);
  });
  await test("Protected real JSON fingerprints unchanged", async () => assert.deepEqual(await jsonHashes(), before));
  console.log("SEO-A2.1: " + passed + " PASS / 0 FAIL; protected JSON " + Object.keys(before).length + "/" + Object.keys(before).length + " unchanged; TEMP only.");
} finally {
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
  globalThis.fetch = previousFetch;
  assert.deepEqual(await jsonHashes(), before, "Real project JSON changed");
  assert.equal(path.dirname(await fs.realpath(root)).toLowerCase(), (await fs.realpath(os.tmpdir())).toLowerCase());
  assert.ok(path.basename(root).startsWith("kd-seo-a21-"));
  await fs.rm(root, { recursive: true, force: true });
}
