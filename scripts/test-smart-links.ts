import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildCmsDestinationRegistry,
  inferCmsLink,
  resolveCmsLink,
  validateCmsLinkValue,
// @ts-expect-error -- Node's type-stripping runtime needs the explicit TypeScript extension.
} from "../lib/cmsLinks.ts";
// @ts-expect-error -- Node's type-stripping runtime needs the explicit TypeScript extension.
import { validateHomepageCms } from "../lib/homepageCms.ts";

const homepage = JSON.parse(await readFile(new URL("../public/data/homepage.json", import.meta.url), "utf8"));
const website = JSON.parse(await readFile(new URL("../public/data/website-data.json", import.meta.url), "utf8"));
const pickerSource = await readFile(new URL("../components/admin/SmartLinkPicker.tsx", import.meta.url), "utf8");
const managerSource = await readFile(new URL("../components/admin/HomepageManager.tsx", import.meta.url), "utf8");
const adminCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const products = website.menu.products.map((product: Record<string, unknown>) => ({ slug: product.slug, name: product.name, active: product.active, status: product.status }));
const longProductName = "衣索比亞 耶加雪菲 日曬｜花香、白桃與蜂蜜般悠長尾韻的季節限定咖啡作品";
const pages = [{ id: "PAGE-ABOUT", title: "關於工作室", href: "/about-kd", published: true }];
const input = { products, pages };
const firstProduct = products.find((product: { slug: string; active?: boolean; status?: string }) => product.active !== false && product.status !== "hidden");
assert.ok(firstProduct, "production fixture contains at least one public product");

assert.match(pickerSource, /smart-link-summary-card[\s\S]*onClick=\{open\}[\s\S]*smart-link-cancel[\s\S]*onClick=\{cancel\}/u, "1 summary → Modify → Cancel is available");
assert.match(pickerSource, /chooseCategory\(item\.type\)[\s\S]*onBack=\{\(\) => setStep\("type"\)\}[\s\S]*onCancel=\{cancel\}[\s\S]*smart-link-back/u, "2 Modify → category → Back → Cancel stays navigable");
assert.match(pickerSource, /type === "product" \? \{ type: "internal", target: "works" \}[\s\S]*const confirm = \(\) => \{ if \(draftResolution\.valid\) \{ onChange\(draft\)/u, "3 product selection commits only through Confirm");
assert.equal(resolveCmsLink({ type: "internal", target: "works" }, input).href, "/works", "4 website destination resolves");
assert.equal(resolveCmsLink({ type: "section", target: "home006" }, input).href, "/#home006", "5 homepage section resolves");
assert.equal(buildCmsDestinationRegistry({ products, pages: [] }).some((entry) => entry.category === "page"), false, "6 no published activity pages is a valid empty registry");
assert.match(resolveCmsLink({ type: "page", target: "PAGE-DELETED" }, input).warning || "", /PAGE-DELETED/u, "7 broken page reference stays readable");
assert.match(resolveCmsLink({ type: "product", target: "deleted-coffee" }, input).warning || "", /deleted-coffee/u, "8 broken product reference stays readable");
assert.equal(resolveCmsLink({ type: "external", url: "https://example.com/kd" }, input).href, "https://example.com/kd", "9 valid external HTTPS destination resolves");
assert.equal(resolveCmsLink({ type: "external", url: "http://example.com" }, input).valid, false, "10 invalid external URL is rejected");
assert.equal(resolveCmsLink({ type: "custom", url: "/works?roast=light" }, input).href, "/works?roast=light", "11 custom destination resolves");
assert.equal(resolveCmsLink({ type: "none" }, input).href, undefined, "12 none suppresses navigation");
assert.match(managerSource, /campaign-\$\{campaign\.id\}-primary[\s\S]*ctaHref[\s\S]*campaign-\$\{campaign\.id\}-secondary[\s\S]*secondaryHref/u, "13 Campaign primary destination uses Smart Link");
assert.match(managerSource, /hero-secondary[\s\S]*secondaryHref/u, "14 secondary CTA destination uses Smart Link");
assert.match(pickerSource, /activeId === id[\s\S]*setActiveId\(next \? id : null\)/u, "15 switching editors leaves only one editor open");
assert.doesNotMatch(pickerSource, /\bfetch\s*\(/u, "16 picker has no autosave or production write");
assert.match(managerSource, /JSON\.stringify\(data\?\.homepage\) !== baseline[\s\S]*onChange=\{\(link\) => setPath/u, "17 Confirm feeds the existing dirty-state path");
assert.match(pickerSource, /const cancel = \(\) => \{ setDraft\(savedLink\); setExpanded\(false\); \}/u, "18 Cancel closes without calling onChange");
assert.match(pickerSource, /const open = \(\) => \{[\s\S]*setExpanded\(true\);[\s\S]*const cancel/u, "19 opening only initializes local draft state");
assert.deepEqual(inferCmsLink("#home004", input), { type: "section", target: "home004" }, "20 legacy homepage anchor remains readable");
assert.equal(resolveCmsLink({ type: "product", target: "long-title" }, { products: [{ slug: "long-title", name: longProductName, active: true }], pages: [] }).label, longProductName, "21 long Chinese product title remains intact");
assert.equal(resolveCmsLink({ type: "page", target: "PAGE-ABOUT" }, input).href, "/about-kd", "22 future Page Builder registry fixture resolves");

assert.match(pickerSource, /全部咖啡作品/u, "product flow includes the all-products destination");
assert.match(pickerSource, /目前還沒有活動／專題頁面/u, "empty Page Builder state has calm owner-facing guidance");
assert.match(pickerSource, /<details className="smart-link-diagnostic">/u, "broken-reference diagnostics are optional details");
assert.match(adminCss, /smart-link-category-grid\{[^}]*repeat\(2,/u, "desktop category selection uses two columns");
assert.match(adminCss, /@media\(max-width:700px\)[\s\S]*smart-link-category-grid\{grid-template-columns:1fr/u, "mobile category selection uses one column");
assert.match(adminCss, /smart-link-summary-card>button\{[^}]*min-height:44px/u, "summary action keeps a practical touch target");
assert.throws(() => validateCmsLinkValue({ type: "custom", url: "javascript:alert(1)" }, "測試連結"), /安全/u, "unsafe custom URL remains rejected");
assert.equal(buildCmsDestinationRegistry(input).some((entry) => /HOME00\d/u.test(entry.label)), false, "owner-facing labels do not leak internal HOME ids");
assert.equal(validateHomepageCms(structuredClone(homepage)), true, "existing production homepage still validates");

const structuredFixture = structuredClone(homepage);
structuredFixture.hero.buttonHref = { type: "product", target: firstProduct.slug };
structuredFixture.hero.secondaryHref = { type: "none" };
structuredFixture.campaigns[0].ctaHref = { type: "page", target: "PAGE-ABOUT" };
structuredFixture.home003.cards[0].href = { type: "section", target: "home004" };
structuredFixture.home006.href = { type: "external", url: "https://example.com/service" };
structuredFixture.home010.href = { type: "custom", url: "/works?from=homepage" };
assert.equal(validateHomepageCms(structuredFixture), true, "all integrated fields accept the shared structured model");

const existingLinks = [homepage.hero.buttonHref, homepage.hero.secondaryHref, ...homepage.campaigns.flatMap((campaign: Record<string, unknown>) => [campaign.ctaHref, campaign.secondaryHref]).filter(Boolean), ...homepage.home003.cards.map((card: Record<string, unknown>) => card.href), homepage.home006.href, homepage.home010.href];
for (const link of existingLinks) assert.equal(resolveCmsLink(link, input).valid, true, `existing CTA destination ${JSON.stringify(link)} remains valid`);

console.log(`Smart Link owner UX tests passed: 22 required cases + ${existingLinks.length} existing CTA destinations.`);
