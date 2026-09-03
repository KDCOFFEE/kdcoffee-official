import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { visualColorHex } from "../lib/pageBuilderVisualStyle.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveWorksPageCms, resolveWorksPublicColorBindings, validateWorksPageCms } from "../lib/worksPageCms.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveWorksProductListing } from "../lib/productListing.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveListAsset } from "../lib/productVisualAssets.ts";

let passed = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const files = {
  publicWorks: path.join(process.cwd(), "app", "works", "page.tsx"),
  css: path.join(process.cwd(), "app", "globals.css"),
  website: path.join(process.cwd(), "public", "data", "website-data.json"),
  pages: path.join(process.cwd(), "public", "data", "pages.json"),
  assets: path.join(process.cwd(), "public", "data", "assets.json"),
  homepage: path.join(process.cwd(), "public", "data", "homepage.json"),
  monthly: path.join(process.cwd(), "public", "data", "monthly-menus.json"),
};
const protectedKeys = ["website", "pages", "assets", "homepage", "monthly"] as const;
const protectedBefore = Object.fromEntries(await Promise.all(protectedKeys.map(async (key) => [key, hash(await readFile(files[key]))]))) as Record<string, string>;

const legacy = resolveWorksPageCms(undefined, { monthLabel: "九月", intro: "豆單" });
check("no Works config resolves exact legacy color defaults", legacy.colors.pageBackground === "#15110f" && legacy.colors.heroBackground === "#15110f" && legacy.colors.heroText === "#f7f2ea" && legacy.colors.catalogBackground === "#f4efe7" && legacy.colors.cardSurface === "#ffffff");

const custom = resolveWorksPageCms({ schemaVersion: 1, colors: {
  pageBackground: "warm-gray", heroBackground: "#112233", heroText: "white", heroSecondaryText: "#ddeeff", accent: "gold",
  primaryCtaBackground: "#445566", primaryCtaText: "ivory", catalogBackground: "#778899", catalogText: "ink",
  cardSurface: "#aabbcc", cardText: "coffee", border: "#ddee11",
} }, { monthLabel: "九月", intro: "豆單" });
check("all twelve safe color values resolve through the existing canonical resolver", visualColorHex(custom.colors.pageBackground) === "#6f6259" && visualColorHex(custom.colors.heroBackground) === "#112233" && visualColorHex(custom.colors.heroText) === "#fff8ef" && visualColorHex(custom.colors.heroSecondaryText) === "#ddeeff" && visualColorHex(custom.colors.accent) === "#b7905a" && visualColorHex(custom.colors.primaryCtaBackground) === "#445566" && visualColorHex(custom.colors.primaryCtaText) === "#f6f0e7" && visualColorHex(custom.colors.catalogBackground) === "#778899" && visualColorHex(custom.colors.catalogText) === "#2b211b" && visualColorHex(custom.colors.cardSurface) === "#aabbcc" && visualColorHex(custom.colors.cardText) === "#1c1714" && visualColorHex(custom.colors.border) === "#ddee11");

const currentPageStore = JSON.parse(await readFile(files.pages, "utf8"));
const currentResolved = resolveWorksPageCms(currentPageStore.systemPages?.works, { monthLabel: "目前月標", intro: "目前豆單" });
const currentBindings = resolveWorksPublicColorBindings(currentResolved.colors);
check("saved Owner colors resolve into public root, Hero, catalog, and card bindings", currentBindings.root["--works-hero-text"] === visualColorHex(currentResolved.colors.heroText) && currentBindings.heroHeading.color === "var(--works-hero-text)" && currentBindings.catalog.backgroundColor === "var(--works-catalog-background)" && currentBindings.card.backgroundColor === "var(--works-card-surface)");
const renderedBindings = resolveWorksPublicColorBindings(custom.colors);
check("public binding helper consumes exact CSS variables for Hero text, catalog background, and card surface", renderedBindings.heroHeading.color === "var(--works-hero-text)" && renderedBindings.catalog.backgroundColor === "var(--works-catalog-background)" && renderedBindings.card.backgroundColor === "var(--works-card-surface)" && renderedBindings.root["--works-hero-text"] === "#fff8ef" && renderedBindings.root["--works-catalog-background"] === "#778899" && renderedBindings.root["--works-card-surface"] === "#aabbcc");

let unsafeRejected = false;
try { validateWorksPageCms({ schemaVersion: 1, colors: { heroBackground: "linear-gradient(red,blue)" } } as never); } catch { unsafeRejected = true; }
check("raw CSS gradients and scriptable colors are rejected before public rendering", unsafeRejected);

const source = await readFile(files.publicWorks, "utf8");
const css = await readFile(files.css, "utf8");
check("color bindings are applied only when a saved Works colors object exists", source.includes("const colorsEnabled=pageStore.systemPages?.works?.colors!==undefined") && source.includes("resolveWorksPublicColorBindings(works.colors)") && source.includes("style={colorBindings?.root as CSSProperties}"));
check("page background stays scoped to the Works root", css.includes('.works-page[data-works-colors="enabled"]{background:var(--works-page-background)}'));
check("hero background text secondary text and accent use scoped safe variables", css.includes("--works-hero-background") && css.includes("--works-hero-text") && css.includes("--works-hero-secondary-text") && css.includes("--works-accent"));
check("primary CTA uses saved background and text variables", css.includes("--works-primary-cta-background") && css.includes("--works-primary-cta-text"));
check("catalog colors and border use scoped variables", css.includes("--works-catalog-background") && css.includes("--works-catalog-text") && css.includes("--works-border"));
check("card surface text and border use scoped variables", css.includes("--works-card-surface") && css.includes("--works-card-text") && css.includes(".sales-catalog-card{background:var(--works-card-surface)"));
check("public styles contain no raw saved CSS injection path", !source.includes("dangerouslySetInnerHTML") && !source.includes("<style") && source.includes("resolveWorksPublicColorBindings"));
check("Hero media and overlay integrations remain intact", source.includes("<WorksHeroMedia") && source.includes("overlay={works.hero.overlayPreset}"));
check("J.1F.3 catalog and card presentation integrations remain intact", source.includes("works.catalog.introEnabled") && source.includes("presentation.showCommerceSummary") && source.includes("works-card-preset-${presentation.cardPreset}"));
check("SEO remains out of public Works rendering", !source.includes("works.seo"));

const website = JSON.parse(await readFile(files.website, "utf8"));
const products = resolveWorksProductListing(website.menu.products as Array<Record<string, unknown>>);
const expectedOrder = ["giotto-awakening", "davinci-feast", "monet-floral", "turner-sunset", "vandyck-knight", "degas-melody", "raphael-kiss", "vangogh-enchantment"];
check("canonical product count remains eight", products.length === 8);
check("canonical product order remains unchanged", products.map((product) => String(product.slug)).join("|") === expectedOrder.join("|"));
check("canonical list image resolution remains unchanged", products.every((product) => Boolean(resolveListAsset(product)?.path)));
check("public product links remain canonical slug routes", (source.match(/href=\{`\/works\/\$\{product\.slug\}`\}/gu) || []).length === 2);

const protectedAfter = Object.fromEntries(await Promise.all(protectedKeys.map(async (key) => [key, hash(await readFile(files[key]))]))) as Record<string, string>;
check("all protected runtime data remains byte-identical", protectedKeys.every((key) => protectedBefore[key] === protectedAfter[key]));

console.log(`Phase J.1F.4 public Works colors: ${passed} PASS`);
