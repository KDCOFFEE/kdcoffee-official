import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveWorksPageCms, resolveWorksPublicColorBindings, resolveWorksPublicMotionBindings, validateWorksPageCms } from "../lib/worksPageCms.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveWorksProductListing } from "../lib/productListing.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveListAsset } from "../lib/productVisualAssets.ts";

let passed = 0;
function check(name: string, condition: unknown) { assert.ok(condition, name); passed += 1; console.log(`PASS ${passed}: ${name}`); }
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const files = {
  works: path.join(process.cwd(), "app", "works", "page.tsx"), css: path.join(process.cwd(), "app", "globals.css"),
  pages: path.join(process.cwd(), "public", "data", "pages.json"), assets: path.join(process.cwd(), "public", "data", "assets.json"), website: path.join(process.cwd(), "public", "data", "website-data.json"), homepage: path.join(process.cwd(), "public", "data", "homepage.json"), monthly: path.join(process.cwd(), "public", "data", "monthly-menus.json"), fulfillment: path.join(process.cwd(), "data", "fulfillment", "state.json"),
};
const protectedKeys = ["pages", "assets", "website", "homepage", "monthly", "fulfillment"] as const;
const before = Object.fromEntries(await Promise.all(protectedKeys.map(async (key) => [key, hash(await readFile(files[key]))]))) as Record<string, string>;

const legacy = resolveWorksPageCms(undefined, { monthLabel: "九月", intro: "豆單" });
const legacyBindings = resolveWorksPublicMotionBindings(legacy.motion);
check("no motion config preserves disabled entrances and current card hover", !legacy.motion.hero.enabled && !legacy.motion.catalogIntro.enabled && !legacy.motion.productGrid.enabled && legacyBindings.hero.className === "" && legacyBindings.catalogIntro.className === "" && legacyBindings.productGrid.className === "" && legacyBindings.cardHover.className === "works-card-hover-current-scale");

const config = { schemaVersion: 1, motion: {
  hero: { enabled: true, preset: "fade-up", durationMs: 700, delayMs: 120, distancePx: 24, staggerMs: 0 },
  catalogIntro: { enabled: true, preset: "slide-left", durationMs: 800, delayMs: 200, distancePx: 30, staggerMs: 0 },
  productGrid: { enabled: true, preset: "editorial", durationMs: 900, delayMs: 300, distancePx: 32, staggerMs: 150 },
  cardHover: { enabled: true, preset: "current-scale", durationMs: 600 },
} } as const;
validateWorksPageCms(config);
const resolved = resolveWorksPageCms(config, { monthLabel: "九月", intro: "豆單" });
const bindings = resolveWorksPublicMotionBindings(resolved.motion);
check("Hero preset and bounded values reach the public binding", bindings.hero.className === "works-motion works-motion-fade-up" && bindings.hero.style?.["--works-motion-duration"] === "700ms" && bindings.hero.style?.["--works-motion-delay"] === "120ms" && bindings.hero.style?.["--works-motion-distance"] === "24px");
check("catalog preset and bounded values reach the public binding", bindings.catalogIntro.className === "works-motion works-motion-slide-left" && bindings.catalogIntro.style?.["--works-motion-duration"] === "800ms");
check("grid preset and stagger reach per-card public bindings", bindings.productGrid.className === "works-motion works-motion-editorial" && bindings.productGrid.cardStyle(0)?.animationDelay === "300ms" && bindings.productGrid.cardStyle(2)?.animationDelay === "600ms");
check("card hover uses only the existing safe current-scale preset", bindings.cardHover.className === "works-card-hover-current-scale" && bindings.cardHover.style?.["--works-card-hover-duration"] === "600ms");

let unsafeRejected = false;
try { validateWorksPageCms({ schemaVersion: 1, motion: { hero: { enabled: true, preset: "spin" as never, durationMs: 99999, delayMs: 0, distancePx: 0, staggerMs: 0 } } }); } catch { unsafeRejected = true; }
check("unsupported motion values and unbounded timing are rejected", unsafeRejected);

const savedStore = JSON.parse(await readFile(files.pages, "utf8"));
const savedResolved = resolveWorksPageCms(savedStore.systemPages?.works, { monthLabel: "目前", intro: "目前" });
const savedBindings = resolveWorksPublicMotionBindings(savedResolved.motion);
check("saved PageStore motion resolves through the same public binding path", typeof savedBindings.hero.className === "string" && typeof savedBindings.cardHover.className === "string");
check("accepted public color binding remains available alongside motion", Boolean(resolveWorksPublicColorBindings(savedResolved.colors).root["--works-hero-text"]));

const source = await readFile(files.works, "utf8");
const css = await readFile(files.css, "utf8");
check("public page consumes the runtime motion bindings on Hero, catalog, grid, and card hover", source.includes("resolveWorksPublicMotionBindings(works.motion)") && source.includes("motionBindings?.hero.className") && source.includes("motionBindings?.catalogIntro.className") && source.includes("motionBindings?.productGrid.cardStyle(index)") && source.includes("motionBindings?.cardHover.className"));
check("public CSS maps only safe public motion classes to controlled pre-reveal states", css.includes('[data-works-motion-state="pre-reveal"].works-motion-fade') && css.includes('[data-works-motion-state="pre-reveal"].works-motion-editorial') && !css.includes("animation-name:var("));
check("reduced motion forces pending public content visible without animation or transition", css.includes('@media(prefers-reduced-motion:reduce){html[data-works-motion-capable="true"] .works-page [data-works-motion-state="pre-reveal"]{opacity:1!important'));
check("motion CSS is progressive: without its classes SSR content has no hidden state", !css.includes(".works-page .works-grid{opacity:0") && !css.includes(".works-hero{opacity:0"));

const website = JSON.parse(await readFile(files.website, "utf8"));
const products = resolveWorksProductListing(website.menu.products as Array<Record<string, unknown>>);
const order = ["giotto-awakening", "davinci-feast", "monet-floral", "turner-sunset", "vandyck-knight", "degas-melody", "raphael-kiss", "vangogh-enchantment"];
check("all canonical products remain present regardless of motion", products.length === 8);
check("canonical product order and media authority remain unchanged", products.map((product) => String(product.slug)).join("|") === order.join("|") && products.every((product) => Boolean(resolveListAsset(product)?.path)));
check("public product links remain canonical", (source.match(/href=\{`\/works\/\$\{product\.slug\}`\}/gu) || []).length === 2);

const after = Object.fromEntries(await Promise.all(protectedKeys.map(async (key) => [key, hash(await readFile(files[key]))]))) as Record<string, string>;
check("all protected runtime files remain byte-identical", protectedKeys.every((key) => before[key] === after[key]));
console.log(`Phase J.1F.5 public Works motion: ${passed} PASS`);
