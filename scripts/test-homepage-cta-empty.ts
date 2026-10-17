import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createElement, type ComponentProps, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
// @ts-expect-error -- explicit extensions support Node's type-stripping runner.
import { resolveHomepageCta } from "../lib/homepageCta.ts";
// @ts-expect-error -- explicit extensions support Node's type-stripping runner.
import { validateHomepageCms } from "../lib/homepageCms.ts";
// @ts-expect-error -- explicit extensions support Node's type-stripping runner.
import { HOMEPAGE_SECTION_CAPABILITIES } from "../lib/homepagePresentation.ts";
import type { CmsLinkValue } from "../lib/cmsLinks.ts";
import type { HomepageViewData } from "../components/home/HomepageV3";

const stored = await readFile("public/data/homepage.json", "utf8");
const seed = await readFile("bootstrap/store/homepage.json", "utf8");
const accepted = execFileSync("git", ["show", "42e79db:public/data/homepage.json"], { encoding: "utf8" });
const root = process.cwd();
const jiti = createJiti(import.meta.url, { alias: { "@": root }, jsx: { runtime: "automatic" }, fsCache: false });
type HomeProps = ComponentProps<typeof import("../components/home/HomepageV3").default>;
const { default: Home } = await jiti.import<{ default: ComponentType<HomeProps> }>(path.join(root, "components/home/HomepageV3.tsx"));
const products: HomeProps["products"] = [1, 2, 3].map(n => ({ slug: "cta-qa-" + n, name: "測試咖啡 " + n, active: true, status: "active", purchasable: true, inMonthlyMenu: true, skus: [{ enabled: true, stock: n }], purchase: [{ label: "半磅", detail: "fixture", price: 300 + n }] }));
const pages = [{ id: "published", title: "公開頁", href: "/pages/published", published: true }, { id: "draft", title: "草稿", href: "/pages/draft", published: false }];
const registry = { products, pages };
let passed = 0;
function check(name: string, run: () => void) { run(); passed++; console.log("PASS " + name); }
function fixture(): HomepageViewData {
  const data: HomepageViewData = JSON.parse(accepted);
  data.hero.enabled = true; data.hero.primaryCtaEnabled = false; data.hero.secondaryCtaEnabled = false;
  data.campaignSection.enabled = true; data.campaignSection.displayLimit = 2;
  data.campaigns = [{ id: "CTA-QA-CAMPAIGN", enabled: true, eyebrow: "測試", title: "活動內容", description: "活動說明", details: [], ctaLabel: "", ctaHref: { type: "none" }, ctaEnabled: false, secondaryCtaEnabled: false, startDate: "", endDate: "" }];
  data.home003.enabled = true;
  data.home003.cards = [{ id: "CTA-QA-SCENE", imageId: "CTA-QA-MEDIA", image: "/images/cta-qa.webp", title: "情境內容", text: "保留內文", button: "", href: { type: "none" }, ctaEnabled: false }];
  data.home004.enabled = true; data.home004.productSlugs = products.map(p => p.slug);
  data.home006.enabled = true; data.home006.ctaEnabled = false;
  data.home010.enabled = true; data.home010.ctaEnabled = false;
  return data;
}
type Target = { key: string; scope: string; owner: (data: HomepageViewData) => Record<string, unknown>; label: string; href: string; flag: string; css: string; legacy?: string; wrapper?: string };
const record = (value: unknown) => value as Record<string, unknown>;
const targets: Target[] = [
  { key: "hero primary", scope: "top", owner: d => record(d.hero), label: "buttonLabel", href: "buttonHref", flag: "primaryCtaEnabled", css: "v3-hero-primary-action", legacy: "開始挑咖啡", wrapper: "v3-actions" },
  { key: "hero secondary", scope: "top", owner: d => record(d.hero), label: "secondaryLabel", href: "secondaryHref", flag: "secondaryCtaEnabled", css: "v3-hero-secondary-action", legacy: "本月作品", wrapper: "v3-actions" },
  { key: "campaign primary", scope: "monthly-campaign", owner: d => record(d.campaigns[0]), label: "ctaLabel", href: "ctaHref", flag: "ctaEnabled", css: "campaign-primary", wrapper: "campaign-actions" },
  { key: "campaign secondary", scope: "monthly-campaign", owner: d => record(d.campaigns[0]), label: "secondaryLabel", href: "secondaryHref", flag: "secondaryCtaEnabled", css: "campaign-secondary", wrapper: "campaign-actions" },
  { key: "home003", scope: "home003", owner: d => record(d.home003.cards[0]), label: "button", href: "href", flag: "ctaEnabled", css: "v3-scene-navigation", legacy: "開始" },
  { key: "home006", scope: "home006", owner: d => record(d.home006), label: "button", href: "href", flag: "ctaEnabled", css: "v3-button", legacy: "查看適用作品" },
  { key: "home010", scope: "home010", owner: d => record(d.home010), label: "button", href: "href", flag: "ctaEnabled", css: "v3-button", legacy: "開始挑咖啡" },
];
const render = (data: HomepageViewData) => renderToStaticMarkup(createElement(Home, { homepageData: data, products, pages }));
const scope = (html: string, id: string) => html.match(new RegExp('<section\\b(?=[^>]*\\bid="' + id + '")[^>]*>[\\s\\S]*?</section>'))?.[0] ?? "";
const hasCta = (html: string, target: Target) => new RegExp('<a\\b[^>]*\\bclass="[^"]*\\b' + target.css + '\\b').test(html);
function configured(target: Target, label: unknown, href: CmsLinkValue, enabled = true) {
  const data = fixture(), owner = target.owner(data);
  if (label === undefined) delete owner[target.label]; else owner[target.label] = label;
  if (href === undefined) delete owner[target.href]; else owner[target.href] = href;
  owner[target.flag] = enabled;
  return data;
}
function absent(html: string, target: Target) {
  assert.ok(!hasCta(html, target), target.key);
  assert.doesNotMatch(html, /<a\b|<button\b|[→↗]|aria-disabled="true"/u);
  if (target.wrapper) assert.ok(!html.includes('class="' + target.wrapper + '"'));
  if (target.key === "home003") {
    assert.ok(html.includes("情境內容") && html.includes("保留內文"));
    assert.doesNotMatch(html, /v3-scene-hitarea|<b\b/u);
    assert.match(html, /margin-bottom:0/u);
  }
}
check("canonical capability map includes all six CTA sections", () => {
  assert.deepEqual(Object.entries(HOMEPAGE_SECTION_CAPABILITIES).filter(([, slots]) => (slots as readonly string[]).includes("cta")).map(([key]) => key), ["hero", "campaignSection", "home003", "home004", "home006", "home010"]);
});
for (const target of targets) {
  check(target.key + ": explicit label + valid configured link renders", () => {
    const html = scope(render(configured(target, "測試 CTA", "/works")), target.scope);
    assert.ok(hasCta(html, target)); assert.ok(html.includes("測試 CTA"));
    if (target.key === "home003") assert.ok(html.includes("→"));
    if (target.key === "campaign primary") assert.ok(html.includes("↗"));
  });
  for (const [name, label, href] of [
    ["empty + valid link", "", "/works"],
    ["whitespace + valid link", " \t\n\u3000", "/works"],
    ["label + undefined link", "測試 CTA", undefined],
    ["label + null link", "測試 CTA", null],
    ["label + empty link", "測試 CTA", ""],
    ["label + whitespace link", "測試 CTA", " \t "],
    ["label + structured none", "測試 CTA", { type: "none" }],
    ["empty + none (Owner case)", "", { type: "none" }],
    ["unsafe href", "測試 CTA", "javascript:alert(1)"],
    ["stale product reference", "測試 CTA", { type: "product", target: "missing" }],
    ["unpublished page", "測試 CTA", { type: "page", target: "draft" }],
  ] as Array<[string, string, CmsLinkValue]>) check(target.key + ": " + name + " leaves no CTA/decorator/hit area", () => absent(scope(render(configured(target, label, href)), target.scope), target));
  check(target.key + ": explicit false still wins", () => absent(scope(render(configured(target, "測試 CTA", "/works", false)), target.scope), target));
  check(target.key + ": missing legacy label only falls back with configured link", () => {
    const html = scope(render(configured(target, undefined, "/works")), target.scope);
    if (target.legacy) { assert.ok(hasCta(html, target)); assert.ok(html.includes(target.legacy)); } else absent(html, target);
    absent(scope(render(configured(target, undefined, undefined)), target.scope), target);
  });
}
for (const [name, href, expected] of [
  ["legacy internal", "/works", "/works"], ["legacy hash", "#home004", "#home004"],
  ["internal destination", { type: "internal", target: "works" }, "/works"],
  ["published page", { type: "page", target: "published" }, "/pages/published"],
  ["eligible product", { type: "product", target: "cta-qa-1" }, "/works/cta-qa-1"],
  ["external", { type: "external", url: "https://example.com/coffee" }, "https://example.com/coffee"],
  ["telephone", { type: "telephone", url: "+886 2 2345 6789" }, "tel:+886223456789"],
  ["email", { type: "email", url: "coffee@example.com" }, "mailto:coffee@example.com"],
] as Array<[string, CmsLinkValue, string]>) check("shared helper accepts existing " + name + " resolution", () => assert.equal(resolveHomepageCta({ label: "有效按鈕", href }, registry)?.href, expected));
check("non-string/null/false labels never resurrect defaults", () => {
  for (const label of [null, false, 0, {}, []]) assert.equal(resolveHomepageCta({ label, href: "/works", legacyLabel: "開始" }), undefined);
});
check("raw inputs are not mutated or seeded", () => {
  const raw = Object.freeze({ label: "", href: Object.freeze({ type: "none" as const }), legacyLabel: "開始" });
  const before = JSON.stringify(raw); assert.equal(resolveHomepageCta(raw), undefined); assert.equal(JSON.stringify(raw), before);
});
check("Hero one valid sibling keeps only its own CTA and wrapper", () => {
  const data = configured(targets[0], "", { type: "none" }); Object.assign(data.hero, { secondaryCtaEnabled: true, secondaryLabel: "有效次要", secondaryHref: "/works" });
  const html = scope(render(data), "top"); assert.ok(!hasCta(html, targets[0]) && hasCta(html, targets[1])); assert.ok(html.includes('class="v3-actions"')); assert.doesNotMatch(html, /is-disabled/u);
});
check("Campaign one valid sibling keeps only its own CTA and wrapper", () => {
  const data = configured(targets[2], "", { type: "none" }); Object.assign(data.campaigns[0], { secondaryCtaEnabled: true, secondaryLabel: "有效次要", secondaryHref: "/works" });
  const html = scope(render(data), "monthly-campaign"); assert.ok(!hasCta(html, targets[2]) && hasCta(html, targets[3])); assert.ok(html.includes('class="campaign-actions"')); assert.doesNotMatch(html, /[→↗]|is-disabled/u);
});
check("valid external CTA retains safe anchor attributes", () => {
  const html = scope(render(configured(targets[5], "外部服務", { type: "external", url: "https://example.com/coffee" })), "home006");
  assert.match(html, /target="_blank" rel="noopener noreferrer"/u);
});
check("fixed HOME004 CTA/product links/prices remain untouched by other CTA removal", () => {
  const a = fixture(), b = configured(targets[4], "", { type: "none" });
  const before = scope(render(a), "home004"); assert.equal(scope(render(b), "home004"), before);
  assert.equal((before.match(/class="v3-text-link"/gu) ?? []).length, 3); assert.ok(before.includes("查看作品與規格 →") && before.includes("301"));
});
check("Owner edited persisted snapshot respects empty/no-link without modifying it", () => {
  const data: HomepageViewData = JSON.parse(stored); data.home003.enabled = true;
  data.home003.cards = [{ ...data.home003.cards[0], button: "", href: { type: "none" } }];
  const html = scope(render(data), "home003"); assert.doesNotMatch(html, /<a\b|<b\b|[→↗]|v3-scene-hitarea/u);
});
check("CMS validation accepts explicit clearing and render does not write defaults", () => {
  const data = configured(targets[4], "", { type: "none" }); assert.equal(validateHomepageCms(data), true);
  const before = JSON.stringify(data); render(data); assert.equal(JSON.stringify(data), before);
});
assert.equal(await readFile("public/data/homepage.json", "utf8"), stored);
assert.equal(await readFile("bootstrap/store/homepage.json", "utf8"), seed);
console.log("Homepage CTA empty/link-removal: " + passed + " checks PASS; SSR/memory fixtures; no persisted writes.");
