import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import ts from "typescript";
import { firstStoreQueryValue, parseStorePublicQuery, storeBrowseHref, storeLandingMetadata } from "../lib/storePublicMetadata";
import type { PublicStoreProductCard } from "../lib/storePublicSelectors";

const paths = {
  layout: "app/store/layout.tsx", page: "app/store/page.tsx", error: "app/store/error.tsx",
  filters: "components/store/StoreFilters.tsx", card: "components/store/StoreProductCard.tsx",
  css: "components/store/StorePublic.module.css", metadata: "lib/storePublicMetadata.ts",
};
const protectedFiles = [
  "components/layout/Header.tsx", "components/layout/HeaderNavigation.tsx", "components/layout/Footer.tsx",
  "app/layout.tsx", "app/globals.css", "app/works/page.tsx", "app/works/[slug]/page.tsx",
  "app/cart/page.tsx", "app/checkout/page.tsx", "app/api/orders/route.ts",
  "components/commerce/AddToCart.tsx", "components/commerce/CartProvider.tsx", "components/media/KdMedia.tsx",
  "lib/storeTypes.ts", "lib/storeValidation.ts", "lib/storeRepository.ts", "lib/storeSeo.ts",
  "lib/storePublicSelectors.ts", "lib/storePublicReadModel.ts", "lib/membershipCommerce.ts",
  "lib/referralPv.ts", "lib/membershipBusinessRules.ts", "lib/adminAuth.ts",
  "scripts/member-auth-test-bootstrap.mjs", "scripts/member-copy-test-bootstrap.mjs", "scripts/test-phase-j6c-store-admin.mjs",
  "package.json", "package-lock.json",
  "public/data/website-data.json", "public/data/homepage.json", "public/data/assets.json", "public/data/pages.json",
  "data/store-domain/catalog.json",
];
async function hashes() {
  return Object.fromEntries(await Promise.all(protectedFiles.map(async file =>
    [file, createHash("sha256").update(await fs.readFile(file)).digest("hex")])));
}
function nodes(root: ts.Node): ts.Node[] {
  const result = [root];
  ts.forEachChild(root, child => { result.push(...nodes(child)); });
  return result;
}
function initializer(root: ts.SourceFile, name: string): ts.Expression {
  const declaration = nodes(root).find(node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name);
  assert.ok(declaration && ts.isVariableDeclaration(declaration) && declaration.initializer, `Missing initializer: ${name}`);
  return declaration.initializer;
}
/** Evaluate only ordinary JS expressions extracted from the source AST, never TSX modules or JSX. */
function expressionValue(expression: ts.Expression, context: Record<string, unknown> = {}): unknown {
  return new Function(...Object.keys(context), `return (${expression.getText()});`)(...Object.values(context));
}
function jsxTag(node: ts.Node): string | null {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText();
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText();
  return null;
}
function jsxAttributes(node: ts.Node): ts.JsxAttributes | null {
  if (ts.isJsxElement(node)) return node.openingElement.attributes;
  if (ts.isJsxSelfClosingElement(node)) return node.attributes;
  return null;
}
function attribute(node: ts.Node, name: string): ts.JsxAttribute | undefined {
  return jsxAttributes(node)?.properties.find((item): item is ts.JsxAttribute =>
    ts.isJsxAttribute(item) && item.name.getText() === name);
}
function importPaths(root: ts.SourceFile) {
  return root.statements.filter(ts.isImportDeclaration).map(node => (node.moduleSpecifier as ts.StringLiteral).text);
}
function cardFixture(overrides: Partial<PublicStoreProductCard> = {}): PublicStoreProductCard {
  return { slug: "review-product", name: "測試商品", shortDescription: "", price: 100, inStock: true, featured: false,
    section: { slug: "equipment", name: "器具" }, ...overrides };
}

async function main() {
  const before = await hashes();
  const source = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, file]) => [key, await fs.readFile(file, "utf8")]))) as Record<keyof typeof paths, string>;
  const ast = Object.fromEntries(Object.entries(paths).filter(([key]) => key !== "css").map(([key, file]) =>
    [key, ts.createSourceFile(file, source[key as keyof typeof paths], ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)])) as Record<Exclude<keyof typeof paths, "css">, ts.SourceFile>;
  let passed = 0;
  async function test(label: string, operation: () => unknown | Promise<unknown>) {
    try { await operation(); passed++; console.log(`PASS ${String(passed).padStart(3, "0")} ${label}`); }
    catch (error) { console.error(`FAIL ${label}`); throw error; }
  }
  function presentation(product: PublicStoreProductCard) {
    const context: Record<string, unknown> = { product };
    for (const name of ["media", "imageUrl", "alt", "onSale", "currentPrice"]) {
      context[name] = expressionValue(initializer(ast.card, name), context);
    }
    return context;
  }

  await test("Landing layout page and error boundary exist", async () => {
    for (const file of [paths.layout, paths.page, paths.error]) await fs.access(file);
  });
  await test("Store route contains exactly the approved three files", async () =>
    assert.deepEqual((await fs.readdir("app/store")).sort(), ["error.tsx", "layout.tsx", "page.tsx"]));
  await test("Product detail route remains absent", async () => assert.rejects(fs.access("app/store/[slug]"), { code: "ENOENT" }));
  await test("Public Store API remains absent", async () => assert.rejects(fs.access("app/api/store"), { code: "ENOENT" }));
  await test("Page is a dynamic Node Server Component", () => {
    assert.match(source.page, /export const runtime = "nodejs"/); assert.match(source.page, /export const dynamic = "force-dynamic"/);
    assert.ok(!source.page.startsWith('"use client"'));
  });
  await test("Next 16 page awaits Promise searchParams", () => {
    assert.match(source.page, /searchParams: Promise<StoreSearchParams>/);
    assert.match(source.page, /const query = await searchParams/);
  });
  await test("Page reads only via readPublicStoreIndex with the shared query parser", () => {
    assert.match(source.page, /await readPublicStoreIndex\(parseStorePublicQuery\(query\)\)/);
    assert.equal((source.page.match(/readPublicStoreIndex\(/g) ?? []).length, 1);
    assert.ok(importPaths(ast.page).includes("@/lib/storePublicReadModel"));
    assert.doesNotMatch(source.page, /storeRepository|createStoreRepository|fetch\(|\/api\/admin|catch\s*\(/);
  });
  await test("Store presentation contains no mutation transaction or protected integrations", () => {
    for (const value of Object.values(source)) assert.doesNotMatch(value, /AddToCart|CartProvider|\/api\/orders|membershipCommerce|referralPv|checkout|wallet|subscription|\.initialize\(|writeFile|atomicWrite|\.archive\(/i);
  });
  await test("Page does not duplicate domain visibility or repaginate", () => {
    assert.doesNotMatch(source.page, /\.active|\.published|\.archivedAt|\.inventory|\.sort\(|\.slice\(/);
    assert.match(source.page, /const \{ items, page, totalItems, totalPages \} = model\.products/);
  });
  await test("Existing Header/Footer mount once with page-owned main", () => {
    assert.equal(nodes(ast.layout).filter(node => jsxTag(node) === "Header").length, 1);
    assert.equal(nodes(ast.layout).filter(node => jsxTag(node) === "Footer").length, 1);
    assert.equal(nodes(ast.layout).filter(node => jsxTag(node) === "main").length, 0);
    assert.equal(nodes(ast.page).filter(node => jsxTag(node) === "main").length, 1);
    assert.match(source.layout, /id="top"/);
  });
  await test("No public Store header-navigation infrastructure is modified or replaced", () => {
    assert.deepEqual(importPaths(ast.layout), ["react", "@/components/layout/Header", "@/components/layout/Footer", "@/components/store/StorePublic.module.css"]);
    assert.doesNotMatch(source.layout, /HeaderNavigation|navigation=|menuItems|StoreHeader/);
  });

  await test("First scalar query value is used without silently trimming slugs", () => {
    assert.equal(firstStoreQueryValue(["equipment", "hidden"]), "equipment");
    assert.equal(firstStoreQueryValue(" equipment "), " equipment ");
    assert.equal(firstStoreQueryValue([]), undefined);
  });
  await test("No query uses page 1 and leaves both filters absent", () => assert.deepEqual(parseStorePublicQuery({}), { page: 1 }));
  await test("Repeated query values use first Section Category and page", () => assert.deepEqual(
    parseStorePublicQuery({ section: ["equipment", "food"], category: ["drippers", "cups"], page: ["2", "9"] }),
    { sectionSlug: "equipment", categorySlug: "drippers", page: 2 }));
  await test("Empty supplied slugs remain invalid inputs rather than becoming unfiltered", () =>
    assert.deepEqual(parseStorePublicQuery({ section: "", category: "" }), { sectionSlug: "", categorySlug: "", page: 1 }));
  await test("Category-only query is passed intact to established invalid-filter semantics", () =>
    assert.deepEqual(parseStorePublicQuery({ category: "shared" }), { categorySlug: "shared", page: 1 }));
  await test("Query parser does not create pageSize or other request-controlled domain options", () => {
    assert.deepEqual(parseStorePublicQuery({ pageSize: "999", sort: "price", published: "false" }), { page: 1 });
  });
  await test("Valid integer page including leading zero normalizes numerically", () => {
    assert.equal(parseStorePublicQuery({ page: "02" }).page, 2);
    assert.equal(parseStorePublicQuery({ page: "9007199254740991" }).page, Number.MAX_SAFE_INTEGER);
  });
  for (const value of ["", "0", "-1", "1.5", "2e0", "+2", " 2", "NaN", "Infinity", "9007199254740992"])
    await test(`Invalid URL page '${value}' defaults to 1`, () => assert.equal(parseStorePublicQuery({ page: value }).page, 1));
  await test("Clear filter URL is exactly /store", () => assert.equal(storeBrowseHref(), "/store"));
  await test("Section URL includes only its public slug", () => assert.equal(storeBrowseHref({ sectionSlug: "equipment" }), "/store?section=equipment"));
  await test("Category links always include selected Section", () =>
    assert.equal(storeBrowseHref({ sectionSlug: "equipment", categorySlug: "drippers" }), "/store?section=equipment&category=drippers"));
  await test("URL builder does not emit Category without a Section", () => assert.equal(storeBrowseHref({ categorySlug: "shared" }), "/store"));
  await test("Duplicate Category slug produces distinct Section-scoped URLs", () =>
    assert.notEqual(storeBrowseHref({ sectionSlug: "equipment", categorySlug: "shared" }), storeBrowseHref({ sectionSlug: "food", categorySlug: "shared" })));
  await test("Pagination links preserve Section and Category", () =>
    assert.equal(storeBrowseHref({ sectionSlug: "equipment", categorySlug: "drippers", page: 2 }), "/store?section=equipment&category=drippers&page=2"));
  await test("Page 1 and invalid link page values are omitted", () => {
    assert.equal(storeBrowseHref({ sectionSlug: "equipment", page: 1 }), "/store?section=equipment");
    assert.equal(storeBrowseHref({ page: NaN }), "/store");
  });
  await test("URL values are encoded as query data rather than injected parameters", () =>
    assert.equal(storeBrowseHref({ sectionSlug: "equipment&category=hidden" }), "/store?section=equipment%26category%3Dhidden"));
  await test("Section and Category UI use the tested URL helper with public slugs", () => {
    assert.match(source.filters, /storeBrowseHref\(\{ sectionSlug: item\.slug \}\)/);
    assert.match(source.filters, /storeBrowseHref\(\{ sectionSlug: section\.slug, categorySlug: item\.slug \}\)/);
    assert.doesNotMatch(source.filters, /\.id|\?category=/);
  });
  await test("Category controls require valid selected Section and returned Category options", () =>
    assert.match(source.filters, /section && model\.categories\.length > 0 \?/));

  const messages = expressionValue(initializer(ast.page, "messages"));
  for (const [status, expected] of [
    ["unknown-section", "找不到此銷售專區。"], ["category-requires-section", "請先選擇銷售專區。"], ["unknown-category", "找不到此商品分類。"],
  ]) await test(`Invalid filter status ${status} uses the exact controlled message`, () => {
    assert.equal(expressionValue(initializer(ast.page, "invalidMessage"), { model: { filterStatus: status }, messages }), expected);
  });
  await test("Valid filter has no invalid-state message", () =>
    assert.equal(expressionValue(initializer(ast.page, "invalidMessage"), { model: { filterStatus: "valid" }, messages }), null));
  await test("Unknown Category reset retains valid Section context", () =>
    assert.equal(expressionValue(initializer(ast.page, "clearHref"), { model: { filterStatus: "unknown-category", selectedSection: { slug: "equipment" } }, storeBrowseHref }), "/store?section=equipment"));
  await test("Unknown Section and Category-only reset go to /store", () => {
    for (const filterStatus of ["unknown-section", "category-requires-section"]) {
      assert.equal(expressionValue(initializer(ast.page, "clearHref"), { model: { filterStatus, selectedSection: null }, storeBrowseHref }), "/store");
    }
  });
  await test("Invalid and empty states gate grid rendering rather than widen results", () => {
    const grid = nodes(ast.page).find(node => jsxTag(node) === "div" && attribute(node, "className")?.initializer?.getText() === "{styles.grid}");
    assert.ok(grid);
    const conditions: string[] = [];
    for (let parent = grid.parent; parent; parent = parent.parent) {
      if (ts.isConditionalExpression(parent)) conditions.push(parent.condition.getText());
    }
    assert.deepEqual(conditions.slice(0, 2), ["totalItems === 0", "invalidMessage"]);
    assert.match(source.page, /目前尚無公開商品。/); assert.match(source.page, /此分類目前沒有商品。/);
  });
  await test("Grid uses returned item order without featured reordering", () => {
    assert.match(source.page, /items\.map\(product => <StoreProductCard key=\{product\.slug\} product=\{product\}/);
    assert.doesNotMatch(source.page, /\.featured|\.sort\(/);
  });

  await test("Cards are non-clickable semantic articles with no fake CTA", () => {
    assert.equal(nodes(ast.card).filter(node => jsxTag(node) === "article").length, 1);
    for (const tag of ["a", "Link", "button"]) assert.equal(nodes(ast.card).filter(node => jsxTag(node) === tag).length, 0);
    assert.doesNotMatch(source.card, /\/store\/|coming soon|即將推出|next\/link/i);
  });
  await test("Cards render no live video iframe YouTube embed or KdMedia", () => {
    for (const tag of ["video", "iframe"]) assert.equal(nodes(ast.card).filter(node => jsxTag(node) === tag).length, 0);
    assert.ok(!importPaths(ast.card).some(value => /KdMedia|youtube|media\//i.test(value)));
  });
  await test("Image hero projects only its static URL", () => assert.equal(presentation(cardFixture({
    heroMedia: { type: "image", url: "https://example.com/item.webp", alt: "stored", publicId: "not-html", bytes: 999 },
  })).imageUrl, "https://example.com/item.webp"));
  await test("Video hero projects poster URL without the video URL", () => assert.equal(presentation(cardFixture({
    heroMedia: { type: "video", url: "https://example.com/item.mp4", posterUrl: "https://example.com/poster.webp", alt: "poster" },
  })).imageUrl, "https://example.com/poster.webp"));
  await test("Video without poster uses placeholder", () => assert.equal(presentation(cardFixture({
    heroMedia: { type: "video", url: "https://example.com/item.mp4", alt: "" },
  })).imageUrl, undefined));
  await test("YouTube hero uses placeholder with no external thumbnail requirement", () => assert.equal(presentation(cardFixture({
    heroMedia: { type: "youtube", url: "https://www.youtube.com/watch?v=abcdefghijk", videoId: "abcdefghijk", alt: "movie" },
  })).imageUrl, undefined));
  await test("Missing hero uses placeholder", () => assert.equal(presentation(cardFixture()).imageUrl, undefined));
  await test("Stored nonempty ALT is preserved exactly for display", () => assert.equal(presentation(cardFixture({
    heroMedia: { type: "image", url: "/uploads/a.webp", alt: "  Owner ALT  " },
  })).alt, "  Owner ALT  "));
  await test("Blank ALT uses Product name only as presentation fallback", () => {
    const product = cardFixture({ heroMedia: { type: "image", url: "/uploads/a.webp", alt: "  " } });
    const beforeProduct = JSON.stringify(product); assert.equal(presentation(product).alt, product.name);
    assert.equal(JSON.stringify(product), beforeProduct);
  });
  await test("Image attributes expose no media implementation metadata", () => {
    const image = nodes(ast.card).find(node => jsxTag(node) === "img"); assert.ok(image);
    const attrs = jsxAttributes(image)!;
    assert.deepEqual(attrs.properties.map(item => ts.isJsxAttribute(item) ? item.name.getText() : "spread").sort(), ["alt", "decoding", "loading", "src"]);
    for (const node of nodes(ast.card)) {
      if (ts.isPropertyAccessExpression(node)) {
        assert.ok(!["publicId", "bytes", "duration", "format"].includes(node.name.text) || (node.name.text === "format" && node.expression.getText() === "money"), "Unexpected media property " + node.getText());
      }
    }
    assert.doesNotMatch(source.card, /data-/);
  });
  await test("Placeholder retains accessible explanatory text and decorative presentation", () => {
    assert.match(source.card, /aria-hidden="true"/); assert.match(source.card, /商品圖片尚未提供/);
  });
  await test("Cards remain Server Components and do not serialize complete media into client components", () => {
    assert.ok(!source.card.startsWith('"use client"')); assert.doesNotMatch(source.card, /\{\.\.\.product|\{\.\.\.media/);
  });
  await test("No persistence status PV KD SKU or exact inventory properties displayed", () => {
    const forbidden = new Set(["id", "revision", "createdAt", "updatedAt", "archivedAt", "pvValue", "kdRedemption", "subscriptionEligible", "sku", "inventory", "active", "published", "publicId", "bytes", "duration"]);
    for (const file of [ast.page, ast.filters, ast.card]) {
      for (const node of nodes(file)) if (ts.isPropertyAccessExpression(node)) assert.ok(!forbidden.has(node.name.text), `Forbidden presentation property ${node.name.text}`);
    }
  });
  await test("Descriptions use React text and presentation clamping rather than HTML injection", () => {
    assert.match(source.card, /\{product\.shortDescription\}/); assert.match(source.card, /product\.shortDescription\.trim\(\)/);
    for (const value of Object.values(source)) assert.doesNotMatch(value, /dangerouslySetInnerHTML|innerHTML/);
    assert.match(source.css, /\.cardDescription\s*\{[^}]*-webkit-line-clamp:\s*3/);
  });
  await test("Zero regular price is retained as numeric zero", () => {
    const view = presentation(cardFixture({ price: 0 })); assert.equal(view.currentPrice, 0); assert.equal(view.onSale, false);
  });
  await test("Zero salePrice is shown when lower than original", () => {
    const view = presentation(cardFixture({ salePrice: 0 })); assert.equal(view.currentPrice, 0); assert.equal(view.onSale, true);
  });
  await test("Absent salePrice shows only regular price", () => {
    const view = presentation(cardFixture()); assert.equal(view.currentPrice, 100); assert.equal(view.onSale, false);
  });
  await test("Equal salePrice shows one price without discount", () => {
    const view = presentation(cardFixture({ salePrice: 100 })); assert.equal(view.currentPrice, 100); assert.equal(view.onSale, false);
  });
  await test("Struck-through original is conditional only on a lower salePrice", () => {
    const originalPrice = nodes(ast.card).find(node => jsxTag(node) === "del"); assert.ok(originalPrice);
    let parent = originalPrice.parent;
    while (parent && !ts.isConditionalExpression(parent)) parent = parent.parent;
    assert.ok(parent && ts.isConditionalExpression(parent)); assert.equal(parent.condition.getText(), "onSale");
    assert.doesNotMatch(source.card, /discountPercent|折扣|限時|%/);
  });
  const money = expressionValue(initializer(ast.card, "money")) as Intl.NumberFormat;
  for (const value of [0, 125.5123456789012, 1e-25, 5e-324])
    await test(`Displayed price preserves numeric precision for ${value}`, () => assert.equal(Number(money.format(value).replace(/,/g, "")), value));
  await test("Price uses NT$ and sale-first accessible reading order", () => {
    assert.match(source.card, /NT\$ \{money\.format\(currentPrice\)\}/);
    assert.ok(source.card.indexOf("目前售價：") < source.card.indexOf("原價："));
  });
  await test("Stock text uses only inStock with no exact quantity", () => {
    assert.match(source.card, /product\.inStock \? "有庫存" : "目前無庫存"/); assert.doesNotMatch(source.card, /剩餘|\.inventory/);
  });

  await test("Pagination is rendered only for valid multi-page results", () => assert.match(source.page, /model\.filterStatus === "valid" && totalPages > 1 \?/));
  await test("Previous and next controls are absent beyond boundaries", () => {
    assert.match(source.page, /page > 1 \? <Link/); assert.match(source.page, /page < totalPages \? <Link/);
    assert.match(source.page, /rel="prev"/); assert.match(source.page, /rel="next"/);
  });
  await test("Page links preserve selected public slugs and use read-model page", () => {
    assert.match(source.page, /sectionSlug: model\.selectedSection\.slug/); assert.match(source.page, /categorySlug: model\.selectedCategory\.slug/);
    assert.match(source.page, /storeBrowseHref\(\{ \.\.\.browseOptions, page: page - 1 \}\)/);
    assert.match(source.page, /storeBrowseHref\(\{ \.\.\.browseOptions, page: page \+ 1 \}\)/);
  });

  await test("Landing metadata has correct Store title description and canonical", () => {
    const meta = storeLandingMetadata();
    assert.equal(meta.title, "商店"); assert.equal(meta.description, "探索 KD Coffee 精選商品。");
    assert.deepEqual(meta.alternates, { canonical: "/store" });
  });
  await test("No-query Store metadata is index follow", () => assert.deepEqual(storeLandingMetadata().robots, { index: true, follow: true }));
  for (const query of [{ section: "equipment" }, { category: "shared" }, { page: "2" }, { page: "invalid" }, { section: "" }, { ref: "unrelated-query" }])
    await test(`Query metadata noindex follow: ${Object.keys(query)[0]}=${Object.values(query)[0]}`, () => {
      const meta = storeLandingMetadata(query); assert.deepEqual(meta.robots, { index: false, follow: true });
      assert.deepEqual(meta.alternates, { canonical: "/store" });
    });
  await test("OpenGraph/Twitter are Store-specific without invented image or offer", () => {
    const meta = storeLandingMetadata();
    assert.deepEqual(meta.openGraph, { title: "商店｜KD Coffee", description: "探索 KD Coffee 精選商品。", url: "/store", siteName: "KD Coffee", locale: "zh_TW", type: "website" });
    assert.deepEqual(meta.twitter, { card: "summary", title: "商店｜KD Coffee", description: "探索 KD Coffee 精選商品。" });
  });
  await test("Metadata/query module has only erased type imports and no persistence dependency", () => {
    for (const node of ast.metadata.statements.filter(ts.isImportDeclaration)) assert.ok(node.importClause?.isTypeOnly);
    assert.doesNotMatch(source.metadata, /storeRepository|readPublicStoreIndex|process\.env|node:|fetch\(|write|canonical.*=/);
  });
  await test("Route metadata uses the complete awaited query, with no catalog read", () =>
    assert.match(source.page, /return storeLandingMetadata\(await searchParams\)/));

  await test("Error boundary is client-only and uses current Next retry API", () => {
    assert.ok(source.error.startsWith('"use client"')); assert.match(source.error, /onClick=\{\(\) => unstable_retry\(\)\}/);
  });
  await test("Error UI is generic with retry and home link, not an empty-store fallback", () => {
    assert.match(source.error, /商店目前暫時無法載入，請稍後再試。/); assert.match(source.error, /href="\/"/);
    assert.doesNotMatch(source.error, /error\.message|error\.stack|error\.digest|JSON\.stringify|console\.|目前尚無公開商品/);
  });
  await test("Landing has one h1 and meaningful results/card hierarchy", () => {
    assert.equal(nodes(ast.page).filter(node => jsxTag(node) === "h1").length, 1);
    assert.ok(nodes(ast.page).some(node => jsxTag(node) === "h2")); assert.ok(nodes(ast.card).some(node => jsxTag(node) === "h3"));
  });
  await test("Navigation labels and semantic selected state are present", () => {
    assert.match(source.filters, /aria-label="銷售專區"/); assert.match(source.filters, /aria-label="商品分類"/);
    assert.match(source.filters, /aria-current=/); assert.match(source.page, /aria-label="商品分頁"/);
    assert.match(source.css, /\[aria-current="page"\][^{]*\{[^}]*text-decoration:\s*underline/);
  });
  await test("Keyboard focus and comfortable touch targets are explicit", () => {
    assert.match(source.css, /:focus-visible/); assert.match(source.css, /outline:\s*3px solid/);
    assert.match(source.css, /min-height:\s*44px/); assert.match(source.layout, /href="#store-main"/);
  });
  await test("No hover-only essential action or entrance animation", () => {
    assert.doesNotMatch(source.css, /:hover|animation:|transition:/);
    assert.doesNotMatch(source.page, /MotionRuntime|SectionReveal|carousel|drawer/i);
  });
  await test("Desktop grid is three equal min-width-safe columns", () =>
    assert.match(source.css, /\.grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/));
  await test("Tablet grid is two columns at 1024px", () =>
    assert.match(source.css, /@media \(max-width: 1024px\)[\s\S]*?\.grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/));
  await test("Mobile grid is one column at 640px", () =>
    assert.match(source.css, /@media \(max-width: 640px\)[\s\S]*?\.grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/));
  await test("Card media has stable 4:3 space with cover images", () => {
    assert.match(source.css, /\.cardMedia\s*\{[^}]*aspect-ratio:\s*4 \/ 3/);
    assert.match(source.css, /\.cardMedia > img\s*\{[^}]*object-fit:\s*cover/);
  });
  await test("Mobile navigation can scroll without widening the page", () => {
    assert.match(source.css, /\.sectionNav, \.categoryNav\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/);
    assert.match(source.css, /\.main\s*\{[^}]*width:\s*min\(100%,/);
    assert.match(source.css, /overflow-wrap:\s*anywhere/);
  });
  await test("Store styling is scoped and uses existing brand tokens without new global rules", () => {
    assert.match(source.css, /var\(--color-page-background/); assert.match(source.css, /var\(--font-display/);
    assert.doesNotMatch(source.css, /:root|:global|box-shadow|backdrop-filter|linear-gradient/);
  });
  await test("Header Artwork commerce Store foundations packages and production data hashes unchanged", async () => assert.deepEqual(await hashes(), before));
  console.log(`J.6D.2 Store Landing: ${passed}/${passed} PASS; ${protectedFiles.length} protected hashes unchanged; no TSX imports or runtime data writes.`);
}
await main().catch(error => { console.error(error); process.exitCode = 1; });
