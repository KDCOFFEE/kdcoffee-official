import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveWorksProductListing } from "../lib/productListing.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveListAsset } from "../lib/productVisualAssets.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveWorksPageCms, validateWorksPageCms } from "../lib/worksPageCms.ts";

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

const defaults = resolveWorksPageCms(undefined, { monthLabel: "九月", intro: "九月豆單" });
check("default catalog preserves exact legacy intro copy", defaults.catalog.introEnabled && defaults.catalog.countPrefix === "本月共" && defaults.catalog.countSuffix === "件作品" && defaults.catalog.helperText === "每張卡片都直接顯示風味、價格與供應狀態。");
check("default card presentation preserves every legacy field", Object.entries(defaults.catalog.presentation).every(([key, value]) => key === "cardPreset" ? value === "current" : value === true));

const partial = resolveWorksPageCms({ schemaVersion: 1, hero: { headlineLines: ["只改 Hero", "商品卡不變"] } }, { monthLabel: "九月", intro: "九月豆單" });
check("unrelated Hero save cannot hide catalog or card fields", partial.catalog.introEnabled && partial.catalog.presentation.showIndex && partial.catalog.presentation.showArtist && partial.catalog.presentation.showTag && partial.catalog.presentation.showFlavors && partial.catalog.presentation.showFacts && partial.catalog.presentation.showCommerceSummary);

const custom = resolveWorksPageCms({ schemaVersion: 1, catalog: { introEnabled: false, countPrefix: "精選", countSuffix: "款", helperText: "Owner 說明", emptyStateText: "目前沒有作品", presentation: { showIndex: false, showArtist: false, showTag: false, showFlavors: false, showFacts: false, showCommerceSummary: false, cardPreset: "bordered" } } }, { monthLabel: "九月", intro: "九月豆單" });
check("custom catalog copy and intro visibility resolve", !custom.catalog.introEnabled && custom.catalog.countPrefix === "精選" && custom.catalog.countSuffix === "款" && custom.catalog.helperText === "Owner 說明" && custom.catalog.emptyStateText === "目前沒有作品");
check("all six presentation toggles and safe preset resolve", !custom.catalog.presentation.showIndex && !custom.catalog.presentation.showArtist && !custom.catalog.presentation.showTag && !custom.catalog.presentation.showFlavors && !custom.catalog.presentation.showFacts && !custom.catalog.presentation.showCommerceSummary && custom.catalog.presentation.cardPreset === "bordered");

let countAuthorityRejected = false;
try { validateWorksPageCms({ schemaVersion: 1, catalog: { count: 999 } } as never); } catch { countAuthorityRejected = true; }
check("Works CMS cannot store numeric product count authority", countAuthorityRejected);

const source = await readFile(files.publicWorks, "utf8");
const css = await readFile(files.css, "utf8");
check("public count always derives from canonical products length", source.includes("{works.catalog.countPrefix} {products.length} {works.catalog.countSuffix}") && !source.includes("works.catalog.count}"));
check("introEnabled hides only the intro while the product grid remains independent", source.includes("works.catalog.introEnabled?<div data-works-motion-target=\"catalogIntro\"") && source.includes('<div id="catalog" className="works-grid'));
check("configured helper and empty state are connected", source.includes("{works.catalog.helperText}") && source.includes("!products.length&&works.catalog.emptyStateText") && source.includes("{works.catalog.emptyStateText}"));
check("showIndex suppresses only the existing work number", source.includes('presentation.showIndex?<span className="cover-index"'));
check("showArtist suppresses only the canonical artist presentation", source.includes('presentation.showArtist?<span className="cover-artist">{product.artist}'));
check("showTag suppresses only the canonical tag presentation", source.includes('presentation.showTag&&product.tag?<span className="cover-tag"'));
check("showFlavors suppresses only the canonical flavor presentation", source.includes('presentation.showFlavors&&product.flavors?.length?<div className="catalog-flavors"'));
check("showFacts suppresses only the existing facts presentation", source.includes("presentation.showFacts&&facts.length?<small style={colorBindings?.cardText}>{facts.join(' · ')}</small>"));
check("showCommerceSummary suppresses price and sold-out presentation only", source.includes("presentation.showCommerceSummary?<p>") && source.includes("presentation.showCommerceSummary&&soldOut?<span className=\"sold-out-overlay\"") && source.includes("presentation.showCommerceSummary?'':'is-action-only'"));
check("product identity and both canonical links remain unconditional", source.includes("<h2>{product.name}</h2>") && (source.match(/href=\{`\/works\/\$\{product\.slug\}`\}/gu) || []).length === 2);
check("product image authority remains resolveListAsset and ProductVisualMedia", source.includes("const listAsset=resolveListAsset(product)") && source.includes("<ProductVisualMedia src={listAsset?.path}"));
check("product listing authority remains the shared canonical helper", source.includes("resolveWorksProductListing(live.menu.products)"));
check("default current preset adds no CSS override", source.includes("works-card-preset-${presentation.cardPreset}") && !css.includes(".works-card-preset-current{"));
check("safe minimal and bordered presets use bounded classes only", css.includes(".works-card-preset-minimal{") && css.includes(".works-card-preset-bordered{") && !source.includes("style={works.catalog"));
// J1F3 was an incremental catalog patch. The same dd13a327 checkpoint later
// connected SEO in J1F6; keep catalog/motion ownership separate from metadata,
// rather than requiring SEO to remain permanently disconnected.
const metadataStart = source.indexOf("export async function generateMetadata");
const catalogStart = source.indexOf("export default async function WorksPage");
const metadataSource = source.slice(metadataStart, catalogStart);
const catalogSource = source.slice(catalogStart);
check("catalog and motion presentation stay separate from Works SEO metadata",
  metadataStart >= 0 && catalogStart > metadataStart && metadataSource.includes("works.seo") &&
  !metadataSource.includes("works.catalog") && !metadataSource.includes("works.motion") &&
  !catalogSource.includes("works.seo") && catalogSource.includes("resolveWorksPublicMotionBindings"));
const ownedSeo = { title: "獨立 SEO 標題", description: "獨立 SEO 說明" };
const seoOnly = resolveWorksPageCms({ schemaVersion: 1, seo: ownedSeo }, { monthLabel: "九月", intro: "豆單" });
const catalogAndSeo = resolveWorksPageCms({ schemaVersion: 1, seo: ownedSeo, catalog: { presentation: { showCommerceSummary: false, cardPreset: "minimal" } } }, { monthLabel: "九月", intro: "豆單" });
check("catalog settings cannot overwrite the separately owned SEO values",
  catalogAndSeo.seo.title === ownedSeo.title && catalogAndSeo.seo.description === ownedSeo.description &&
  JSON.stringify(catalogAndSeo.seo) === JSON.stringify(seoOnly.seo));

const website = JSON.parse(await readFile(files.website, "utf8"));
// Catalog size and slugs are Owner data, not permanent presentation invariants.
// Derive the eligible identity set from canonical fields; check ordering and
// input immutability independently of resolveWorksProductListing's output.
const canonical = website.menu.products as Array<Record<string, unknown>>;
const canonicalBefore = JSON.stringify(canonical);
const products = resolveWorksProductListing(canonical);
const expectedCandidates = canonical.filter(product =>
  product.inMonthlyMenu === true && product.status !== "hidden" &&
  product.status !== "discontinued" &&
  !(product.status === "sold_out" && product.showWhenSoldOut === false));
check("current Works candidates match the canonical eligibility set exactly",
  products.length === expectedCandidates.length &&
  products.every(product => expectedCandidates.includes(product)) &&
  expectedCandidates.every(product => products.includes(product)));
check("current canonical ordering follows numeric sort with stable source-order ties",
  products.every((product, index) => {
    if (index === 0) return true;
    const previous = products[index - 1];
    const difference = Number(product.sort || 0) - Number(previous.sort || 0);
    return difference > 0 || (difference === 0 && canonical.indexOf(previous) < canonical.indexOf(product));
  }));
check("listing resolution never rewrites or reorders canonical Product input",
  JSON.stringify(canonical) === canonicalBefore);
const listingFixture = [
  { slug: "active", inMonthlyMenu: true, status: "active", sort: 30 },
  { slug: "hidden", inMonthlyMenu: true, status: "hidden", sort: 0 },
  { slug: "discontinued", inMonthlyMenu: true, status: "discontinued", sort: 0 },
  { slug: "not-monthly", inMonthlyMenu: false, status: "active", sort: 0 },
  { slug: "sold-hidden", inMonthlyMenu: true, status: "sold_out", showWhenSoldOut: false, sort: 0 },
  { slug: "sold-default", inMonthlyMenu: true, status: "sold_out", sort: 10 },
  { slug: "available-not-purchasable", inMonthlyMenu: true, status: "active", purchasable: false, sort: 10 },
  { slug: "sold-shown", inMonthlyMenu: true, status: "sold_out", showWhenSoldOut: true, sort: 20 },
];
check("listing respects monthly/status/sold-out filtering and stable order without a fixed catalog size",
  resolveWorksProductListing(listingFixture).map(product => product.slug).join("|") ===
  "sold-default|available-not-purchasable|sold-shown|active");
console.log(`Canonical catalog: ${canonical.length} Products / ${products.length} current Works candidates`);
check("all current product list images still use canonical resolution", products.every((product) => Boolean(resolveListAsset(product)?.path)));

const protectedAfter = Object.fromEntries(await Promise.all(protectedKeys.map(async (key) => [key, hash(await readFile(files[key]))]))) as Record<string, string>;
check("all runtime data remains byte-identical", protectedKeys.every((key) => protectedBefore[key] === protectedAfter[key]));

console.log(`Phase J.1F.3 public Works catalog presentation: ${passed} PASS`);
