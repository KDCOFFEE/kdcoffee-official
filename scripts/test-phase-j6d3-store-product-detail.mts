import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import * as nodeModule from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StoreCatalog, StoreMediaReference } from "../lib/storeTypes";
import { findPublicStoreProductBySlug } from "../lib/storePublicSelectors";
import { validateStoreCatalog } from "../lib/storeValidation";
import { storeProductMetadata, storeProductHref, isStoreProductSlug } from "../lib/storePublicMetadata";

// Local compatibility for the Node 24 synchronous API absent from installed Node 20 typings.
type TestResolveContext = { parentURL?: string };
type TestResolveResult = { url: string; shortCircuit?: boolean };
type TestNextResolve = (specifier: string, context: TestResolveContext) => TestResolveResult;
type TestRegisterHooks = (hooks: {
  resolve: (specifier: string, context: TestResolveContext, nextResolve: TestNextResolve) => TestResolveResult;
}) => unknown;
const registerHooks = (nodeModule as typeof nodeModule & {
  registerHooks?: TestRegisterHooks;
}).registerHooks;
if (typeof registerHooks !== "function") {
  throw new Error("This J.6D.3 test requires Node runtime support for module.registerHooks.");
}

declare global {
  var __storeDetailRequest: Map<string, Promise<unknown>> | undefined;
  var __storeGalleryState: { value: { index: number; activated: boolean } } | undefined;
}
const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve("react")).href;
registerHooks({
  resolve(specifier: string, context: TestResolveContext, nextResolve: TestNextResolve) {
    const parent = context.parentURL?.startsWith("file:") ? fileURLToPath(context.parentURL).replace(/\\/g, "/") : "";
    if (specifier === "next/navigation" && parent.endsWith("/app/store/[slug]/page.tsx")) {
      return nextResolve("next/navigation.js", context);
    }
    // Standalone SSR lacks the RSC dispatcher. Emulate only its per-request cache
    // boundary; repository/selectors/metadata/notFound remain their real modules.
    if (specifier === "react" && parent.endsWith("/app/store/[slug]/page.tsx")) return {
      url: "data:text/javascript," + encodeURIComponent(`export * from ${JSON.stringify(reactUrl)};export const cache=(fn)=>(...args)=>{const request=globalThis.__storeDetailRequest;if(!request)return fn(...args);const key=JSON.stringify(args);if(!request.has(key))request.set(key,fn(...args));return request.get(key);};`),
      shortCircuit: true,
    };
    if (specifier === "react" && parent.endsWith("/components/store/StoreProductGallery.tsx")) return {
      url: "data:text/javascript," + encodeURIComponent(`import React from ${JSON.stringify(reactUrl)};export * from ${JSON.stringify(reactUrl)};export const useState=(initial)=>{const fixture=globalThis.__storeGalleryState;if(!fixture)return React.useState(initial);return [fixture.value,(value)=>{fixture.value=typeof value==='function'?value(fixture.value):value;}];};`),
      shortCircuit: true,
    };
    return nextResolve(specifier, context);
  },
});

const protectedFiles = [
  "components/commerce/CartProvider.tsx", "components/commerce/AddToCart.tsx", "components/commerce/FloatingCart.tsx",
  "app/cart/page.tsx", "app/checkout/page.tsx", "app/api/orders/route.ts", "app/layout.tsx", "app/globals.css",
  "lib/orderPricing.ts", "lib/orderInventoryTransaction.ts", "lib/orderInventoryReturn.ts", "lib/fulfillment.ts",
  "lib/membershipCommerce.ts", "lib/referralPv.ts", "lib/membershipBusinessRules.ts", "lib/subscriptionSkuModel.ts",
  "components/admin/HomepageManager.tsx", "components/home/HomepageV3.tsx", "data/homepageData.ts",
  "app/works/[slug]/page.tsx", "components/admin/ProductManager.tsx", "components/media/KdMedia.tsx",
  "lib/storeTypes.ts", "lib/storeValidation.ts", "lib/storeRepository.ts", "lib/storePublicSelectors.ts", "lib/storePublicReadModel.ts",
  "package.json", "package-lock.json", ".env.local", "public/data/website-data.json",
  "public/data/homepage.json", "public/data/assets.json", "public/data/pages.json", "data/store-domain/catalog.json",
];
async function hashes() {
  return Object.fromEntries(await Promise.all(protectedFiles.map(async file => {
    try { return [file, createHash("sha256").update(await fs.readFile(file)).digest("hex")]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return [file, null]; throw error; }
  })));
}
const before = await hashes();
const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6d3-detail-"));
const previousData = process.env.KD_DATA_DIR, previousMount = process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
const catalogPath = path.join(root, "store-domain", "catalog.json");
const timestamp = "2026-10-10T00:00:00.000Z";
const entity = (id: string) => ({ id, revision: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null });
const hero: StoreMediaReference = { type: "image", url: "/images/dripper.webp", alt: "白色濾杯", publicId: "PRIVATE-MEDIA-87432", bytes: 34871 };
const video: StoreMediaReference = { type: "video", url: "https://example.com/demo.mp4", posterUrl: "/images/video-poster.webp", alt: "濾杯介紹影片" };
const youtube: StoreMediaReference = { type: "youtube", url: "https://youtu.be/abcdefghijk", videoId: "abcdefghijk", alt: "濾杯操作影片" };
function fixture(): StoreCatalog {
  return {
    schemaVersion: 1, revision: 1, updatedAt: timestamp,
    sections: [{ ...entity("PRIVATE-SECTION-87432"), name: "器具", slug: "equipment", shortDescription: "", description: "",
      active: true, published: true, sortOrder: 0, showOnHomepage: false, homepageSortOrder: 0, showInNavigation: false, navigationSortOrder: 0,
      seoTitle: "", seoDescription: "" }],
    categories: [{ ...entity("PRIVATE-CATEGORY-87432"), sectionId: "PRIVATE-SECTION-87432", name: "濾杯", slug: "drippers", description: "", active: true, sortOrder: 0 }],
    products: [{ ...entity("PRIVATE-PRODUCT-87432"), sectionId: "PRIVATE-SECTION-87432", categoryId: "PRIVATE-CATEGORY-87432",
      slug: "v60-dripper", name: "V60 手沖濾杯", shortDescription: "讓日常沖煮，更從容。", description: "第一段商品介紹。\n保留這個換行。\n\n第二段商品介紹。",
      productType: "equipment", sku: "PRIVATE-SKU-87432", price: 125.5, salePrice: 100, inventory: 37,
      active: true, published: true, sortOrder: 0, featured: false, heroMedia: structuredClone(hero),
      gallery: [{ type: "image", url: "/images/side.webp", alt: "側面" }, structuredClone(video), structuredClone(youtube)],
      specifications: [{ key: "private_spec_key", label: "材質", value: "陶瓷", sortOrder: 2 }, { key: "capacity", label: "容量", value: "1–2 杯", sortOrder: 1 }],
      seoTitle: "Owner 濾杯標題", seoDescription: "Owner 濾杯描述", pvValue: 123.75, kdRedemption: { mode: "disabled" }, subscriptionEligible: false }],
  };
}
async function writeFixture(catalog = fixture(), validate = true) {
  if (validate) validateStoreCatalog(catalog);
  await fs.mkdir(path.dirname(catalogPath), { recursive: true });
  await fs.writeFile(catalogPath, JSON.stringify(catalog));
}
function props(slug = "v60-dripper") { return { params: Promise.resolve({ slug }) }; }
function isNotFound(error: unknown) {
  return error instanceof Error && "digest" in error && error.digest === "NEXT_HTTP_ERROR_FALLBACK;404";
}
type ElementNode = { type: unknown; props: Record<string, unknown> };
function nodes(tree: unknown, predicate: (node: ElementNode) => boolean, result: ElementNode[] = []): ElementNode[] {
  if (Array.isArray(tree)) { for (const child of tree) nodes(child, predicate, result); return result; }
  if (!tree || typeof tree !== "object" || !("props" in tree)) return result;
  const node = tree as ElementNode;
  if (predicate(node)) result.push(node);
  nodes(node.props.children, predicate, result);
  return result;
}
function click(tree: unknown, label: string) {
  const node = nodes(tree, node => node.type === "button" && node.props["aria-label"] === label)[0];
  assert.ok(node, "Missing button: " + label);
  (node.props.onClick as () => void)();
}
let passed = 0;
async function test(label: string, run: () => unknown | Promise<unknown>) {
  globalThis.__storeDetailRequest = new Map();
  delete globalThis.__storeGalleryState;
  try { await run(); console.log(`PASS ${String(++passed).padStart(3, "0")} ${label}`); }
  catch (error) { console.error("FAIL " + label); throw error; }
}
try {
  const { default: Page, generateMetadata } = await import("../app/store/[slug]/page");
  const { default: NotFound } = await import("../app/store/[slug]/not-found");
  const { default: Gallery, storeProductMediaItems, storeProductMediaPreview } = await import("../components/store/StoreProductGallery");
  const { default: KdMedia } = await import("../components/media/KdMedia");
  const { default: Card } = await import("../components/store/StoreProductCard");
  const { StoreRepositoryIntegrityError } = await import("../lib/storeRepository");
  const { readPublicStoreProductBySlug } = await import("../lib/storePublicReadModel");
  const pageSource = await fs.readFile("app/store/[slug]/page.tsx", "utf8");
  const gallerySource = await fs.readFile("components/store/StoreProductGallery.tsx", "utf8");
  const css = await fs.readFile("components/store/StoreProductDetail.module.css", "utf8");
  const notFoundSource = await fs.readFile("app/store/[slug]/not-found.tsx", "utf8");
  const render = async (slug = "v60-dripper") => renderToStaticMarkup(await Page(props(slug)));
  const publicProduct = () => {
    const product = findPublicStoreProductBySlug(fixture(), "v60-dripper");
    assert.ok(product); return product;
  };
  const galleryProps = () => { const product = publicProduct(); return { name: product.name, heroMedia: product.heroMedia, gallery: product.gallery }; };
  const galleryTree = () => Gallery(galleryProps());
  const activeMedia = (tree: unknown) => nodes(tree, node => node.type === KdMedia);

  await test("Absent catalog returns real notFound without creating catalog or directory", async () => {
    await assert.rejects(async () => Page(props()), isNotFound);
    await assert.rejects(async () => generateMetadata(props()), isNotFound);
    assert.deepEqual(await fs.readdir(root), []);
  });
  await writeFixture();
  await test("Valid public product renders through the real read model", async () => assert.match(await render(), /<h1>V60 手沖濾杯<\/h1>/));
  await test("Missing product returns real Next notFound in page and metadata", async () => {
    await assert.rejects(async () => Page(props("missing")), isNotFound);
    await assert.rejects(async () => generateMetadata(props("missing")), isNotFound);
  });
  for (const slug of ["", "UPPER", "v60 dripper", "../private", "a/b", "%76%36%30", "a".repeat(81)]) {
    await test("Invalid already-decoded slug is not normalized: " + JSON.stringify(slug), async () => {
      assert.equal(isStoreProductSlug(slug), false);
      await assert.rejects(async () => Page(props(slug)), isNotFound);
      await assert.rejects(async () => generateMetadata(props(slug)), isNotFound);
    });
  }
  for (const [label, patch] of [
    ["unpublished", { published: false }],
    ["inactive", { active: false, published: false }],
    ["archived", { active: false, published: false, archivedAt: timestamp }],
  ] as const) {
    await test(label + " Product cannot render or leak manual SEO", async () => {
      const catalog = fixture(); Object.assign(catalog.products[0], patch); await writeFixture(catalog);
      await assert.rejects(async () => Page(props()), isNotFound);
      await assert.rejects(async () => generateMetadata(props()), isNotFound);
    });
  }
  for (const [label, patch] of [
    ["unpublished", { published: false }],
    ["inactive", { active: false, published: false }],
    ["archived", { active: false, published: false, archivedAt: timestamp }],
  ] as const) {
    await test(label + " Section hides direct product detail", async () => {
      const catalog = fixture(); Object.assign(catalog.sections[0], patch); catalog.products[0].published = false;
      if ("archivedAt" in patch) {
        Object.assign(catalog.categories[0], { active: false, archivedAt: timestamp });
        Object.assign(catalog.products[0], { active: false, archivedAt: timestamp });
      }
      await writeFixture(catalog);
      await assert.rejects(async () => Page(props()), isNotFound);
      await assert.rejects(async () => generateMetadata(props()), isNotFound);
    });
  }
  for (const archived of [false, true]) {
    await test((archived ? "Archived" : "Inactive") + " Category excludes assigned Product", async () => {
      const catalog = fixture(); catalog.categories[0].active = false;
      if (archived) catalog.categories[0].archivedAt = timestamp;
      assert.equal(findPublicStoreProductBySlug(catalog, "v60-dripper"), null);
      catalog.products[0].published = false;
      if (archived) Object.assign(catalog.products[0], { active: false, archivedAt: timestamp });
      await writeFixture(catalog);
      await assert.rejects(async () => Page(props()), isNotFound);
    });
  }
  await test("Invalid Category graph is excluded by selectors and corrupt persistence propagates integrity failure", async () => {
    const catalog = fixture(); catalog.products[0].categoryId = "MISSING-PRIVATE-CATEGORY";
    assert.equal(findPublicStoreProductBySlug(catalog, "v60-dripper"), null);
    await writeFixture(catalog, false);
    await assert.rejects(async () => Page(props()), StoreRepositoryIntegrityError);
    await assert.rejects(async () => generateMetadata(props()), StoreRepositoryIntegrityError);
  });
  await test("Inventory zero remains rendered and indexable with no count", async () => {
    const catalog = fixture(); catalog.products[0].inventory = 0; await writeFixture(catalog);
    assert.match(await render(), /目前無庫存/);
    assert.deepEqual((await generateMetadata(props())).robots, { index: true, follow: true });
  });
  await writeFixture();
  await test("Name and short description are present", async () => {
    const html = await render(); assert.match(html, /V60 手沖濾杯/); assert.match(html, /讓日常沖煮，更從容。/);
  });
  await test("Description preserves paragraphs and single line breaks", async () => {
    const html = await render(); assert.match(html, /第一段商品介紹。\n保留這個換行。/); assert.match(html, /<p>第二段商品介紹。<\/p>/);
    assert.match(css, /\.description p\s*\{[^}]*white-space: pre-line/);
  });
  await test("Descriptions and names escape HTML without a rich-text parser", async () => {
    const catalog = fixture(); catalog.products[0].name = "<script>name</script>";
    catalog.products[0].shortDescription = "<b>short</b>"; catalog.products[0].description = "<img src=x onerror=bad>\n\n<script>bad</script>";
    await writeFixture(catalog); const html = await render();
    assert.match(html, /&lt;script&gt;name/); assert.match(html, /&lt;b&gt;short/);
    assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<script>|onerror="bad"/);
    assert.doesNotMatch(pageSource, /dangerouslySetInnerHTML|DOMParser|marked|markdown/);
  });
  for (const [label, price, salePrice, discount] of [
    ["regular", 125.5, undefined, false], ["discount", 125.5, 100, true],
    ["equal sale", 125.5, 125.5, false], ["zero sale", 125.5, 0, true], ["zero regular", 0, undefined, false],
  ] as const) {
    await test(label + " price preserves exact Store display semantics", async () => {
      const catalog = fixture(); catalog.products[0].price = price;
      if (salePrice === undefined) delete catalog.products[0].salePrice; else catalog.products[0].salePrice = salePrice;
      await writeFixture(catalog); const html = await render();
      const amount = discount ? salePrice : price;
      assert.match(html, new RegExp("<strong>NT\\$ " + String(amount).replace(".", "\\.") + "</strong>"));
      assert.equal(html.includes("<del>"), discount);
    });
  }
  await test("Above-regular sale price cannot become a discount and persisted invalid value fails closed", async () => {
    const catalog = fixture(); catalog.products[0].salePrice = 200; await writeFixture(catalog, false);
    await assert.rejects(async () => Page(props()), StoreRepositoryIntegrityError);
    assert.match(pageSource, /product\.salePrice !== undefined && product\.salePrice < product\.price/);
  });
  await writeFixture();
  await test("In-stock state is public but exact inventory is private", async () => {
    const html = await render(); assert.match(html, /有庫存/); assert.doesNotMatch(html, /剩餘|inventory|現貨.*37/);
  });
  await test("Specifications follow validated order without internal key", async () => {
    const html = await render(); assert.ok(html.indexOf("<dt>容量</dt>") < html.indexOf("<dt>材質</dt>"));
    assert.match(html, /<dd>1–2 杯<\/dd>/); assert.doesNotMatch(html, /private_spec_key|sortOrder/);
  });
  await test("Empty specifications and full description render no empty sections", async () => {
    const catalog = fixture(); catalog.products[0].specifications = []; catalog.products[0].description = "  ";
    await writeFixture(catalog); const html = await render();
    assert.doesNotMatch(html, /id="store-specifications-heading"|id="store-description-heading"/);
  });
  await writeFixture();
  await test("Breadcrumb links use deterministic Section/Category URL context", async () => {
    const html = await render(); assert.match(html, /aria-label="商品路徑"/);
    assert.match(html, /href="\/store\?section=equipment"/);
    assert.match(html, /href="\/store\?section=equipment&amp;category=drippers"/);
    assert.match(html, /<li aria-current="page">V60 手沖濾杯<\/li>/);
    assert.match(html, /href="\/store">返回商店<\/a>/);
  });
  await test("Uncategorized Product omits Category breadcrumb and uses Section browse link", async () => {
    const catalog = fixture(); delete catalog.products[0].categoryId; await writeFixture(catalog);
    const tree = await Page(props()); const breadcrumb = nodes(tree, node => node.props["aria-label"] === "商品路徑")[0];
    assert.equal(nodes(breadcrumb, node => node.type === "li").length, 3);
    assert.doesNotMatch(await render(), /category=drippers/);
  });
  await test("Route-local not-found is generic and returns deterministically to Store", () => {
    const html = renderToStaticMarkup(createElement(NotFound));
    assert.match(html, /找不到這件商品/); assert.match(html, /href="\/store"/);
    assert.doesNotMatch(notFoundSource, /history|useRouter|slug|error\.message/);
  });
  await writeFixture();
  await test("Manual SEO uses only the server wrapper and canonical product path", async () => {
    const metadata = await generateMetadata(props());
    assert.equal(metadata.title, "Owner 濾杯標題"); assert.equal(metadata.description, "Owner 濾杯描述");
    assert.deepEqual(metadata.alternates, { canonical: "/store/v60-dripper" });
    assert.doesNotMatch(await render(), /Owner 濾杯標題|Owner 濾杯描述|manualSeo|seoTitle|seoDescription/);
  });
  await test("Fallback SEO uses name and short description without persistence", async () => {
    const catalog = fixture(); delete catalog.products[0].seoTitle; delete catalog.products[0].seoDescription; await writeFixture(catalog);
    const bytes = await fs.readFile(catalogPath, "utf8"); const metadata = await generateMetadata(props());
    assert.equal(metadata.title, catalog.products[0].name); assert.equal(metadata.description, catalog.products[0].shortDescription);
    assert.equal(await fs.readFile(catalogPath, "utf8"), bytes);
  });
  await test("Full description is the secondary SEO fallback", async () => {
    const catalog = fixture(); delete catalog.products[0].seoDescription; catalog.products[0].shortDescription = ""; await writeFixture(catalog);
    assert.equal((await generateMetadata(props())).description, catalog.products[0].description);
  });
  await writeFixture();
  await test("Open Graph and Twitter use safe image metadata and product canonical", async () => {
    const metadata = await generateMetadata(props());
    const og = metadata.openGraph as { url?: string; images?: unknown };
    assert.equal(og.url, "/store/v60-dripper"); assert.deepEqual(og.images, [{ url: hero.url, alt: "V60 手沖濾杯" }]);
    assert.equal((metadata.twitter as { card?: string }).card, "summary_large_image");
  });
  await test("Video hero poster is used for share metadata", () => {
    const product = publicProduct(); product.heroMedia = video;
    const metadata = storeProductMetadata({ product, manualSeo: {} });
    assert.deepEqual((metadata.openGraph as { images?: unknown }).images, [{ url: video.posterUrl, alt: product.name }]);
  });
  await test("Gallery image supplies SEO fallback when hero has no image/poster", () => {
    const product = publicProduct(); product.heroMedia = youtube;
    assert.deepEqual((storeProductMetadata({ product, manualSeo: {} }).openGraph as { images?: unknown }).images,
      [{ url: "/images/side.webp", alt: product.name }]);
  });
  await test("No image produces Twitter summary and no fabricated share image", () => {
    const product = publicProduct(); delete product.heroMedia; product.gallery = [];
    const metadata = storeProductMetadata({ product, manualSeo: {} });
    assert.equal((metadata.twitter as { card?: string }).card, "summary"); assert.deepEqual((metadata.openGraph as { images?: unknown }).images, []);
  });
  await test("Unsafe synthetic share image is not emitted", () => {
    const product = publicProduct(); product.heroMedia = { type: "image", url: "javascript:bad", alt: "" }; product.gallery = [];
    assert.deepEqual((storeProductMetadata({ product, manualSeo: {} }).openGraph as { images?: unknown }).images, []);
  });
  await test("Product URL helper encodes input without query contamination", () => {
    assert.equal(storeProductHref("v60-dripper"), "/store/v60-dripper");
    assert.equal(storeProductHref("a?b/c"), "/store/a%3Fb%2Fc");
  });
  await test("Metadata and page share one request snapshot; a new request sees updates", async () => {
    await writeFixture(); await generateMetadata(props());
    const changed = fixture(); changed.products[0].name = "Updated next request"; await writeFixture(changed);
    assert.match(await render(), /<h1>V60 手沖濾杯<\/h1>/);
    globalThis.__storeDetailRequest = new Map();
    assert.match(await render(), /<h1>Updated next request<\/h1>/);
  });
  await writeFixture();
  await test("Hero has priority and gallery retains stored mixed-media order", () => {
    const product = publicProduct(); const items = storeProductMediaItems(product.heroMedia, product.gallery);
    assert.deepEqual(items.map(media => media.type), ["image", "image", "video", "youtube"]);
    assert.deepEqual(items[0], product.heroMedia); assert.deepEqual(items.slice(1), product.gallery);
  });
  await test("Missing hero falls back to the first gallery item without changing order", () => {
    const product = publicProduct(); assert.deepEqual(storeProductMediaItems(undefined, product.gallery), product.gallery);
  });
  await test("Initial image uses KdMedia; thumbnails instantiate no active media", () => {
    globalThis.__storeGalleryState = { value: { index: 0, activated: false } };
    const tree = galleryTree(); assert.equal(activeMedia(tree).length, 1);
    const html = renderToStaticMarkup(tree); assert.match(html, /src="\/images\/dripper.webp"/);
    assert.doesNotMatch(html, /<video|<iframe/);
  });
  await test("Video selection shows poster before explicit playback and mounts no player", () => {
    globalThis.__storeGalleryState = { value: { index: 0, activated: false } };
    click(galleryTree(), "V60 手沖濾杯：影片 3 / 4");
    const tree = galleryTree(); assert.equal(activeMedia(tree).length, 0);
    assert.match(renderToStaticMarkup(tree), /src="\/images\/video-poster.webp"/);
  });
  await test("Explicit video activation mounts exactly one ordinary selected player", () => {
    globalThis.__storeGalleryState = { value: { index: 2, activated: false } };
    click(galleryTree(), "播放V60 手沖濾杯的影片");
    const active = activeMedia(galleryTree()); assert.equal(active.length, 1);
    assert.equal(active[0].props.backgroundVideo, false);
    const html = renderToStaticMarkup(createElement(KdMedia, { ...(active[0].props as ComponentProps<typeof KdMedia>), eager: true }));
    assert.equal((html.match(/<video/g) ?? []).length, 1); assert.match(html, /poster="\/images\/video-poster.webp"/);
    assert.match(html, /controls=""/); assert.match(html, /preload="metadata"/); assert.doesNotMatch(html, /autoPlay|autoplay|loop=""/);
  });
  await test("YouTube initially stays a static thumbnail and uses validated video ID", () => {
    globalThis.__storeGalleryState = { value: { index: 3, activated: false } };
    const html = renderToStaticMarkup(galleryTree());
    assert.equal(activeMedia(galleryTree()).length, 0); assert.doesNotMatch(html, /<iframe/);
    assert.match(html, /i\.ytimg\.com\/vi\/abcdefghijk\/hqdefault\.jpg/);
    assert.equal(storeProductMediaPreview({ ...youtube, videoId: "invalid" }), undefined);
  });
  await test("Explicit YouTube activation retains existing nocookie embed path", () => {
    globalThis.__storeGalleryState = { value: { index: 3, activated: false } };
    click(galleryTree(), "播放V60 手沖濾杯的YouTube影片");
    const active = activeMedia(galleryTree()); assert.equal(active.length, 1);
    const html = renderToStaticMarkup(createElement(KdMedia, { ...(active[0].props as ComponentProps<typeof KdMedia>), eager: true }));
    assert.equal((html.match(/<iframe/g) ?? []).length, 1); assert.match(html, /www\.youtube-nocookie\.com\/embed\/abcdefghijk/);
    assert.doesNotMatch(html, /autoplay=1/);
  });
  await test("Changing selection unmounts prior player and resets playback activation", () => {
    globalThis.__storeGalleryState = { value: { index: 2, activated: true } };
    click(galleryTree(), "V60 手沖濾杯：影片 4 / 4");
    assert.deepEqual(globalThis.__storeGalleryState.value, { index: 3, activated: false });
    assert.equal(activeMedia(galleryTree()).length, 0);
  });
  await test("Previous/next navigation stays bounded with explicit controls", () => {
    globalThis.__storeGalleryState = { value: { index: 0, activated: false } };
    const previous = nodes(galleryTree(), node => node.props["aria-label"] === "上一個商品媒體")[0];
    assert.equal(previous.props.disabled, true);
    click(galleryTree(), "下一個商品媒體"); assert.equal(globalThis.__storeGalleryState.value.index, 1);
    globalThis.__storeGalleryState.value = { index: 3, activated: false };
    assert.equal(nodes(galleryTree(), node => node.props["aria-label"] === "下一個商品媒體")[0].props.disabled, true);
  });
  await test("Empty media uses a tasteful accessible placeholder without controls", () => {
    globalThis.__storeGalleryState = { value: { index: 0, activated: false } };
    const tree = Gallery({ name: "無媒體商品", gallery: [] });
    const html = renderToStaticMarkup(tree); assert.match(html, /商品圖片尚未提供/); assert.match(html, /role="img"/);
    assert.equal(activeMedia(tree).length, 0); assert.doesNotMatch(html, /<button|<video|<iframe/);
  });
  await test("Thumbnail controls are keyboard-native with useful labels and selected state", () => {
    globalThis.__storeGalleryState = { value: { index: 0, activated: false } };
    const thumbs = nodes(galleryTree(), node => node.type === "button" && "aria-pressed" in node.props);
    assert.equal(thumbs.length, 4); assert.equal(thumbs[0].props["aria-pressed"], true);
    assert.ok(thumbs.every(node => node.props.type === "button" && String(node.props["aria-label"]).includes("V60")));
    assert.match(css, /:focus-visible/); assert.match(css, /outline: 3px solid/); assert.match(css, /min-height: 44px/);
  });
  await test("Gallery has no autoplay carousel timer or new media mutation wiring", () => {
    assert.doesNotMatch(gallerySource, /setInterval|setTimeout|autoPlay|requestAnimationFrame|fetch\(|localStorage|upload|deleteMedia/);
    assert.match(gallerySource, /backgroundVideo=\{false\}/);
  });
  await test("Public DOM and client gallery props exclude private domain fields", async () => {
    const tree = await Page(props()); const html = renderToStaticMarkup(tree);
    assert.doesNotMatch(html, /PRIVATE-(?:SECTION|CATEGORY|PRODUCT|SKU|MEDIA)-87432|private_spec_key|pvValue|123\.75|kdRedemption|subscriptionEligible|archivedAt|manualSeo/);
    const clientGallery = nodes(tree, node => node.type === Gallery)[0];
    assert.deepEqual(Object.keys(clientGallery.props).sort(), ["gallery", "heroMedia", "name"]);
    assert.doesNotMatch(JSON.stringify(clientGallery.props), /pvValue|inventory|sectionId|categoryId|subscriptionEligible|seoTitle|seoDescription/);
  });
  await test("Public card has exactly one semantic named detail link without nested links", () => {
    const html = renderToStaticMarkup(createElement(Card, { product: publicProduct() }));
    assert.equal((html.match(/<a\b/g) ?? []).length, 1); assert.match(html, /href="\/store\/v60-dripper"/);
    assert.match(html, /V60 手沖濾杯<\/a><\/h3>/); assert.doesNotMatch(html, /<button/);
  });
  await test("Server route is dynamic Node with awaited params and real read model boundary", () => {
    assert.match(pageSource, /export const runtime = "nodejs"/); assert.match(pageSource, /export const dynamic = "force-dynamic"/);
    assert.match(pageSource, /params: Promise</); assert.match(pageSource, /await params/); assert.match(pageSource, /cache\(async/);
    assert.doesNotMatch(pageSource, /createStoreRepository|storeRepository|revalidate|unstable_cache|use cache|catch\s*\(/);
  });
  await test("Purchase area contains only pricing/availability and no functional transaction CTA", async () => {
    assert.match(await render(), /aria-label="商品價格與供應狀態"/);
    assert.doesNotMatch(await render(), /加入購物車|立即結帳|Add.to.Cart/);
    for (const source of [pageSource, gallerySource, notFoundSource]) {
      assert.doesNotMatch(source, /CartProvider|addItem|addToCart|AddToCart|\/checkout|\/api\/orders|orderPricing|membershipCommerce|reward|referral|subscription|wallet|process\.env|writeFile|atomicWrite/i);
    }
  });
  await test("Responsive layout is media-dominant desktop and media-first single-column mobile", () => {
    assert.match(css, /grid-template-columns: minmax\(0, 1\.35fr\) minmax\(0, 1fr\)/);
    assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.presentation \{ grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(css, /\.stage\s*\{[^}]*aspect-ratio: 1 \/ 1/);
    assert.match(css, /\.thumbnails\s*\{[^}]*max-width: 100%[^}]*overflow-x: auto/);
    assert.doesNotMatch(css, /animation:|100vw/);
  });
  await test("Healthy page and metadata reads leave catalog bytes/tree untouched", async () => {
    await writeFixture(); const bytes = await fs.readFile(catalogPath, "utf8");
    const files = await fs.readdir(path.dirname(catalogPath));
    await render(); await generateMetadata(props()); await readPublicStoreProductBySlug("v60-dripper");
    assert.equal(await fs.readFile(catalogPath, "utf8"), bytes); assert.deepEqual(await fs.readdir(path.dirname(catalogPath)), files);
  });
  await test("Corrupt JSON remains an integrity error with unchanged bytes", async () => {
    await fs.writeFile(catalogPath, "{broken"); const bytes = await fs.readFile(catalogPath, "utf8");
    await assert.rejects(async () => Page(props()), StoreRepositoryIntegrityError);
    await assert.rejects(async () => generateMetadata(props()), StoreRepositoryIntegrityError);
    assert.equal(await fs.readFile(catalogPath, "utf8"), bytes);
  });
  await test("Filesystem integrity failure propagates without fake notFound or replacement", async () => {
    await fs.unlink(catalogPath); await fs.mkdir(catalogPath);
    await assert.rejects(async () => Page(props()), StoreRepositoryIntegrityError);
    await assert.rejects(async () => generateMetadata(props()), StoreRepositoryIntegrityError);
    assert.equal((await fs.stat(catalogPath)).isDirectory(), true);
  });
  await test("Protected production/domain/commerce/Homepage/Artwork/media/packages remain unchanged", async () => assert.deepEqual(await hashes(), before));
  console.log(`J.6D.3 Store product detail: ${passed}/${passed} PASS; isolated fixtures only; ${protectedFiles.length} protected hashes unchanged.`);
} finally {
  delete globalThis.__storeDetailRequest; delete globalThis.__storeGalleryState;
  if (previousData === undefined) delete process.env.KD_DATA_DIR; else process.env.KD_DATA_DIR = previousData;
  if (previousMount === undefined) delete process.env.RAILWAY_VOLUME_MOUNT_PATH; else process.env.RAILWAY_VOLUME_MOUNT_PATH = previousMount;
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("kd-j6d3-detail-")) throw new Error("Unsafe fixture cleanup");
  await fs.rm(root, { recursive: true, force: true });
}
