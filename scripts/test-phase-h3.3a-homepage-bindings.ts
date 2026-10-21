import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createElement, type ComponentProps, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import ts from "typescript";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { createHomepagePresentationBindings, homepagePresentationProps } from "../lib/homepagePresentationBindings.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { HOMEPAGE_SECTION_CAPABILITIES, HOMEPAGE_PRESENTATION_SECTION_KEYS, HOMEPAGE_TEXT_SLOTS } from "../lib/homepagePresentation.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { LEGACY_HOME002_CLOSING_TEXT, validateHomepageCms } from "../lib/homepageCms.ts";
import type { HomepagePresentationKey, HomepagePresentationPatch } from "../lib/homepagePresentation.ts";
import type { HomepageViewData } from "../components/home/HomepageV3";

const root = process.cwd();
const baseline = "1c7e2e957506cf2edb8eb57ff241188fc8a9ca01";
const jiti = createJiti(import.meta.url, { alias: { "@": root }, jsx: { runtime: "automatic" }, fsCache: false });
type HomeProps = ComponentProps<typeof import("../components/home/HomepageV3").default>;
const { default: Home } = await jiti.import<{ default: ComponentType<HomeProps> }>(path.join(root, "components/home/HomepageV3.tsx"));
const gitSource = (file: string) => execFileSync("git", ["--no-optional-locks", "show", `${baseline}:${file}`], { cwd: root, encoding: "utf8" });
// Compile accepted source in memory. No checkout, cache files or baseline writes.
function legacyComponent(file: string, overrides: Record<string, unknown> = {}) {
  const output = ts.transpileModule(gitSource(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  const localRequire = (id: string) => Object.hasOwn(overrides, id) ? overrides[id] : jiti(id.startsWith("@/") ? path.join(root, id.slice(2)) : id);
  new Function("require", "module", "exports", output)(localRequire, module, module.exports);
  return module.exports.default;
}
const oldCampaign = legacyComponent("components/home/MonthlyCampaign.tsx");
const LegacyHome = legacyComponent("components/home/HomepageV3.tsx", { "@/components/home/MonthlyCampaign": { __esModule: true, default: oldCampaign } }) as ComponentType<HomeProps>;
const stored = await readFile(path.join(root, "public/data/homepage.json"), "utf8");
// Presentation parity uses accepted valid-CTA content, independent of Owner QA
// edits. Explicit CTA clearing is covered by test-homepage-cta-empty.ts.
const acceptedStored = execFileSync("git", ["show", "42e79db:public/data/homepage.json"], { cwd: root, encoding: "utf8" });
const seed = await readFile(path.join(root, "bootstrap/store/homepage.json"), "utf8");
const products: HomeProps["products"] = [1, 2, 3].map((n) => ({ slug: `h33a-${n}`, name: `作品${n}`, subtitle: `說明${n}`, active: true, status: "active", purchasable: true, inMonthlyMenu: true, skus: [{ enabled: true, stock: n }], purchase: [{ label: "半磅", detail: "fixture", price: 300 + n }] }));
function fixture(): HomepageViewData {
  const data: HomepageViewData = JSON.parse(acceptedStored);
  for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) data[key].enabled = true;
  data.home004.productSlugs = products.map((p) => p.slug);
  data.home009.items = [{ id: "REVIEW-H33A", text: "真實回饋", name: "測試者", source: "Google" }];
  data.campaigns = [{ id: "CAMPAIGN-H33A", enabled: true, eyebrow: "本月小標", title: "本月活動測試", description: "活動說明", details: ["活動細節"], ctaLabel: "活動按鈕", ctaHref: "/works", note: "活動註記", image: "/images/h33a-campaign.webp", startDate: "", endDate: "" }];
  return data;
}
const renderRaw = (data: HomepageViewData, component = Home) => renderToStaticMarkup(createElement(component, { homepageData: data, products, pages: [] }));
// The stable, layout-transparent HOME006 frame is the intentional DOM correction.
// Normalize only that unconfigured grouping element for legacy content comparisons.
function withoutTransparentFrame(html: string) {
  const opening = '<div class="homepage-base-content-grid">';
  const start = html.indexOf(opening);
  if (start < 0) return html;
  const after = start + opening.length;
  const tags = /<\/?div\b[^>]*>/gu;
  tags.lastIndex = after;
  let depth = 1;
  for (let tag; (tag = tags.exec(html));) {
    depth += tag[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(0, start) + html.slice(after, tag.index) + html.slice(tags.lastIndex);
  }
  throw new Error("Unbalanced HOME006 frame");
}
// Campaign now has a canonical integer flex rank instead of HOME003 + 0.5.
// Presentation parity ignores ONLY that root declaration; actual ordering is
// exercised independently by test-homepage-campaign-ordering.mts.
function withoutCampaignRank(html: string) {
  return html.replace(/<section\b(?=[^>]*\bid="monthly-campaign")[^>]*>/gu,
    tag => tag.replace(/((?:style="|;)order:)[-\d.]+/u, "$1CAMPAIGN_ORDER"));
}
const render = (data: HomepageViewData, component = Home) => withoutCampaignRank(withoutTransparentFrame(renderRaw(data, component)));
const ids: Record<HomepagePresentationKey, string> = { hero: "top", campaignSection: "monthly-campaign", home002: "home002", home003: "home003", home004: "home004", home005: "home005", home006: "home006", home007: "home007", home008: "home008", home009: "home009", home010: "home010" };
function section(html: string, key: HomepagePresentationKey) { return html.match(new RegExp('<section\\b(?=[^>]*\\bid="' + ids[key] + '")[^>]*>[\\s\\S]*?</section>'))?.[0] ?? ""; }
function configured(key: HomepagePresentationKey, base: HomepagePresentationPatch) { const data = fixture(); data.presentation = { schemaVersion: 3, sections: { [key]: { base } } }; return data; }
const legacyFixtureMarkup = render(fixture());
const noStyles = (html: string) => html.replace(/ style="[^"]*"/gu, "").replace(/ data-homepage-[a-z-]+="[^"]*"/gu, "");
const value = (style: Parameters<typeof homepagePresentationProps>[0], name: string) => Reflect.get(style ?? {}, name);
let passed = 0;
function check(name: string, run: () => void) { run(); passed += 1; console.log("PASS " + name); }

check("accepted legacy data validates and matches accepted SSR after transparent-frame normalization", () => {
  const data: HomepageViewData = JSON.parse(acceptedStored);
  assert.equal(validateHomepageCms(data), true);
  assert.equal(render(data), render(data, LegacyHome));
});
check("all-section legacy fixture preserves content/markup except the transparent frame", () => {
  const data = fixture();
  assert.equal(render(data), render(data, LegacyHome));
  assert.ok(!render(data).includes("data-homepage-"));
});
check("absence produces no new section/text/content style values", () => {
  const bind = createHomepagePresentationBindings(undefined);
  for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) {
    const p = bind(key);
    assert.equal(p.sectionStyle, undefined);
    assert.equal(p.contentStyle(), undefined);
    for (const slot of HOMEPAGE_TEXT_SLOTS) assert.equal(p.textStyle(slot), undefined);
  }
});
check("capabilities cover all keys and finite semantic names only", () => {
  assert.deepEqual(Object.keys(HOMEPAGE_SECTION_CAPABILITIES).sort(), [...HOMEPAGE_PRESENTATION_SECTION_KEYS].sort());
  for (const slots of Object.values(HOMEPAGE_SECTION_CAPABILITIES)) for (const slot of slots) assert.ok((HOMEPAGE_TEXT_SLOTS as readonly string[]).includes(slot));
  assert.ok(HOMEPAGE_SECTION_CAPABILITIES.home002.includes("closing"));
});
check("unsupported section-slot combinations never bind", () => {
  const data = configured("home008", { text: { closing: { fontSizePx: 40 } } });
  assert.equal(createHomepagePresentationBindings(data.presentation)("home008").textStyle("closing"), undefined);
  assert.equal(render(data), legacyFixtureMarkup);
});
for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) check(key + ": every declared slot reaches a semantic node without section leakage", () => {
  assert.ok(section(legacyFixtureMarkup, key));
  for (const slot of HOMEPAGE_SECTION_CAPABILITIES[key]) {
    const html = render(configured(key, { text: { [slot]: { fontSizePx: 47 } } }));
    assert.ok(section(html, key).includes("--homepage-text-font-size-base:47px"), key + "." + slot);
    assert.ok(section(html, key).includes('data-homepage-text-base="font-size"'));
    for (const other of HOMEPAGE_PRESENTATION_SECTION_KEYS) if (other !== key) assert.equal(section(html, other), section(legacyFixtureMarkup, other));
  }
});
check("typography maps every safe leaf and leaves unrelated slots unset", () => {
  const p = createHomepagePresentationBindings(configured("home002", { text: { title: { fontSizePx: 48, fontWeight: "semibold", color: "gold", lineHeight: 1.2, letterSpacingEm: 0, alignment: "center", maxWidthCh: 60 } } }).presentation)("home002");
  assert.deepEqual(p.textStyle("title"), { "--homepage-text-font-size-base": "48px", "--homepage-text-font-weight-base": 600, "--homepage-text-color-base": "#b7905a", "--homepage-text-line-height-base": 1.2, "--homepage-text-letter-spacing-base": "0em", "--homepage-text-alignment-base": "center", "--homepage-text-max-width-base": "60ch" });
  assert.equal(p.textStyle("intro"), undefined);
});
check("weights retain the approved 400/500/600/700 mapping", () => {
  for (const [fontWeight, expected] of [["light", 400], ["regular", 500], ["semibold", 600], ["bold", 700]] as const) assert.equal(value(createHomepagePresentationBindings(configured("hero", { text: { title: { fontWeight } } }).presentation)("hero").textStyle("title"), "--homepage-text-font-weight-base"), expected);
});
check("HEX resolves safely and invalid colors fail", () => {
  assert.equal(value(createHomepagePresentationBindings(configured("hero", { text: { title: { color: "#Aa12EF" } } }).presentation)("hero").textStyle("title"), "--homepage-text-color-base"), "#aa12ef");
  assert.throws(() => createHomepagePresentationBindings({ schemaVersion: 3, sections: { hero: { base: { text: { title: { color: "url(x)" } } } } } }), /顏色/u);
});
check("SSR title carries all typography variables without constraining its grid", () => {
  const html = section(render(configured("home002", { text: { title: { fontSizePx: 48, fontWeight: "bold", color: "gold", lineHeight: 1.2, letterSpacingEm: -0.02, alignment: "right", maxWidthCh: 35 } } })), "home002");
  assert.match(html, /<h2 style="--homepage-text-font-size-base:48px;--homepage-text-font-weight-base:700;--homepage-text-color-base:#b7905a;--homepage-text-line-height-base:1.2;--homepage-text-letter-spacing-base:-0.02em;--homepage-text-alignment-base:right;--homepage-text-max-width-base:35ch" data-homepage-text-base=/u);
  assert.doesNotMatch(html, /class="v3-value-grid[^"]*" style=/u);
});
for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) check(key + ": layout caps inner content and preserves zero root padding", () => {
  const html = section(render(configured(key, { layout: { contentMaxWidthPx: 640, paddingTopPx: 0, paddingBottomPx: 0 } })), key);
  const opening = html.slice(0, html.indexOf(">") + 1);
  assert.ok(opening.includes("--homepage-section-padding-top-base:0px") && opening.includes("--homepage-section-padding-bottom-base:0px"));
  assert.ok(!opening.includes("--homepage-content-width-base"));
  assert.ok(html.includes("--homepage-content-width-base:640px"));
});
check("content/text widths remain independent inputs to a CSS minimum", () => {
  const p = createHomepagePresentationBindings(configured("home002", { layout: { contentMaxWidthPx: 640 }, text: { closing: { maxWidthCh: 35 } } }).presentation)("home002");
  assert.deepEqual(p.contentStyle(p.textStyle("closing")), { "--homepage-text-max-width-base": "35ch", "--homepage-content-width-base": "640px" });
});
check("layout preserves horizontal padding and full-bleed Hero media", () => {
  const html = section(render(configured("hero", { layout: { contentMaxWidthPx: 640, paddingTopPx: 0 } })), "hero");
  assert.doesNotMatch(html, /padding-left:|padding-right:|padding-inline:/u);
  assert.match(html, /class="v3-hero-content"[^>]*--homepage-content-width-base:640px/u);
  assert.doesNotMatch(html, /class="v3-hero-video[^"]*"[^>]*--homepage-content-width-base/u);
});
check("HOME006 uses one stable frame with and without Base width", () => {
  for (const data of [fixture(), configured("home006", { layout: { contentMaxWidthPx: 640 } })]) assert.equal(section(renderRaw(data), "home006").split('class="homepage-base-content-grid"').length - 1, 1);
});
check("background absence/legacy is inert; none/color are safe custom properties", () => {
  for (const background of [{}, { mode: "legacy" }, { mode: "color" }]) assert.equal(createHomepagePresentationBindings({ schemaVersion: 3, sections: { home002: { base: { background } } } })("home002").sectionStyle, undefined);
  assert.deepEqual(createHomepagePresentationBindings(configured("home002", { background: { mode: "none" } }).presentation)("home002").sectionStyle, { "--homepage-section-background-base": "transparent" });
  assert.deepEqual(createHomepagePresentationBindings(configured("home002", { background: { mode: "color", color: "gold" } }).presentation)("home002").sectionStyle, { "--homepage-section-background-base": "#b7905a" });
  assert.throws(() => createHomepagePresentationBindings({ schemaVersion: 3, sections: { home002: { base: { background: { image: "/x.png" } } } } }), /不支援/u);
});
check("background reaches only its owning root", () => {
  const html = render(configured("home002", { background: { mode: "color", color: "gold" } }));
  assert.ok(section(html, "home002").split(">")[0].includes("--homepage-section-background-base:#b7905a"));
  for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) if (key !== "home002") assert.equal(section(html, key), section(legacyFixtureMarkup, key));
});
for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) check(key + ": presentation hides through CSS; master disable still omits DOM", () => {
  const hidden = section(render(configured(key, { visible: false })), key);
  assert.ok(hidden && hidden.split(">")[0].includes("--homepage-section-visibility-base:none"));
  const data = configured(key, { visible: true });
  data[key].enabled = false;
  assert.equal(section(render(data), key), "");
});
check("undefined visibility preserves empty-content gates", () => {
  const data = fixture();
  data.home002.cards = []; data.home003.cards = []; data.home005.steps = []; data.home007.cards = []; data.home008.images = []; data.home009.items = [];
  assert.equal(render(data), render(data, LegacyHome));
});
check("H3.1 closing fallback/custom/empty/disabled semantics remain", () => {
  for (const closing of [{}, { closingText: "自訂結尾" }, { closingText: "" }, { closingEnabled: false }]) { const data = fixture(); Object.assign(data.home002, closing); assert.equal(render(data), render(data, LegacyHome)); }
  assert.ok(legacyFixtureMarkup.includes(LEGACY_HOME002_CLOSING_TEXT));
  const data = configured("home002", { text: { closing: { fontSizePx: 22 } } }); data.home002.closingEnabled = false;
  assert.doesNotMatch(section(render(data), "home002"), /v3-why-closing/u);
});
check("section order and navigation data remain unchanged", () => {
  const data = fixture();
  data.sectionOrder = [...HOMEPAGE_PRESENTATION_SECTION_KEYS.filter((key) => key.startsWith("home"))].reverse().map((key, order) => ({ key, order })) as NonNullable<HomepageViewData["sectionOrder"]>;
  const before = structuredClone(data); assert.equal(render(data), render(data, LegacyHome)); assert.deepEqual(data, before);
});
check("legacy/configured motion stays intact and presentation animation/presets stay inactive", () => {
  for (const configuredMotion of [true, false]) {
    const data = fixture(); if (!configuredMotion) for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) Reflect.deleteProperty(data[key], "motion");
    const expected = render(data, LegacyHome);
    data.presentation = { schemaVersion: 3, sections: Object.fromEntries(HOMEPAGE_PRESENTATION_SECTION_KEYS.map((key) => [key, { preset: "editorial", base: { animation: { enabled: false, preset: "none", durationMs: 500 } } }])) };
    assert.equal(render(data), expected);
  }
});
check("enabled Mobile adds only scoped CSS bindings while preserving content", () => {
  const data = fixture();
  data.presentation = { schemaVersion: 3, sections: Object.fromEntries(HOMEPAGE_PRESENTATION_SECTION_KEYS.map((key) => [key, { mobile: { overrideEnabled: true, overrides: { visible: false, text: { title: { fontSizePx: 90 } }, layout: { paddingTopPx: 0 } } } }])) };
  assert.equal(noStyles(render(data)), noStyles(render(fixture(), LegacyHome)));
  assert.ok(render(data).includes("data-homepage-section-mobile"));
});
check("Hero legacy and desktop/mobile media branches preserve SSR", () => {
  for (const settings of [{}, { desktopMedia: { type: "image", provider: "local", url: "/images/desktop.webp" }, mobileMedia: { type: "image", provider: "local", url: "/images/mobile.webp" } }, { media: { type: "image", provider: "local", url: "/images/legacy.webp" } }]) {
    const data = fixture(); Object.assign(data.hero, settings); assert.equal(render(data), render(data, LegacyHome));
  }
});
check("HOME004 product content/prices/availability/links are unchanged", () => {
  const html = section(render(configured("home004", { text: { title: { fontSizePx: 40 }, cardTitle: { fontWeight: "bold" }, cardBody: { color: "gold" }, cta: { alignment: "center" } }, layout: { paddingTopPx: 0 } })), "home004");
  assert.equal(noStyles(html), noStyles(section(render(fixture(), LegacyHome), "home004")));
});
check("Campaign selection/limits/eligibility/placement match baseline", () => {
  const data = fixture(); data.campaigns.push({ ...data.campaigns[0], id: "CAMPAIGN-OFF", enabled: false }); data.campaignSection.displayLimit = 1;
  assert.equal(render(data), render(data, LegacyHome));
});
const css = await readFile(path.join(root, "app/globals.css"), "utf8");
const oldCss = gitSource("app/globals.css");
const bindingCss = css.slice(css.indexOf("/* H3.3A.1 responsive-ready bindings:"));
check("legacy CSS retains every original breakpoint fallback", () => {
  const extra = ',.v3-roast-service>.homepage-base-content-grid>[data-home-reveal="media"]>.v3-media';
  assert.equal(css.split(extra).length - 1, 2);
  let unbound = css.slice(0, css.indexOf("/* H3.3A.1 responsive-ready bindings:")).replaceAll(extra, "");
  for (const [vertical, horizontal] of [["82px", "6vw"], ["58px", "0"], ["72px", "6vw"], ["54px", "0"]]) {
    const bound = ".monthly-campaign{padding:var(--homepage-section-padding-top," + vertical + ") " + horizontal + " var(--homepage-section-padding-bottom," + vertical + ")!important}";
    assert.ok(unbound.includes(bound));
    unbound = unbound.replace(bound, ".monthly-campaign{padding:" + vertical + " " + horizontal + "!important}");
  }
  unbound = unbound.replace("color:var(--homepage-text-color,#251b16)!important", "color:#251b16!important");
  assert.equal(unbound.replace(/\r\n/gu, "\n").trimEnd(), oldCss.replace(/\r\n/gu, "\n").trimEnd());
});
check("important Campaign spacing uses overridable stylesheet variables", () => {
  const p = createHomepagePresentationBindings(configured("campaignSection", { layout: { paddingTopPx: 0 } }).presentation)("campaignSection");
  assert.deepEqual(p.sectionStyle, { "--homepage-section-padding-top-base": "0px" });
  assert.equal(p.contentStyle()?.marginInline, undefined);
  assert.ok(section(render(configured("campaignSection", { layout: { paddingTopPx: 0, paddingBottomPx: 13 } })), "campaignSection").includes("--homepage-section-padding-top-base:0px;--homepage-section-padding-bottom-base:13px"));
});
check("content caps preserve legacy horizontal margin/padding declarations", () => {
  for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) assert.deepEqual(createHomepagePresentationBindings(configured(key, { layout: { contentMaxWidthPx: 640 } }).presentation)(key).contentStyle(), { "--homepage-content-width-base": "640px" });
});
const helperSource = await readFile(path.join(root, "lib/homepagePresentationBindings.ts"), "utf8");
check("helper has no viewport detection/merged Mobile resolution/animation or preset expansion", () => {
  assert.doesNotMatch(helperSource, /window\.|document\.|matchMedia|useEffect|sectionKey, "mobile"|resolved\.animation|resolved\.preset/u);
  assert.match(helperSource, /sectionKey, "desktop"/u);
});
assert.equal(passed, 59, "Retain all 59 H3.3A regression scenarios, adapting mechanism assertions to H3.3A.1.");
console.log("H3.3A retained regression scenarios: 59 PASS.");

check("every presentation field emits custom properties only", () => {
  const p = createHomepagePresentationBindings(configured("home002", { visible: false, layout: { paddingTopPx: 0, paddingBottomPx: 40, contentMaxWidthPx: 800 }, background: { mode: "color", color: "gold" }, text: { title: { fontSizePx: 48, fontWeight: "bold", color: "ink", lineHeight: 1.2, letterSpacingEm: 0, alignment: "center", maxWidthCh: 40 } } }).presentation)("home002");
  for (const style of [p.sectionStyle, p.contentStyle(), p.textStyle("title")]) for (const key of Object.keys(style ?? {})) assert.ok(key.startsWith("--homepage-"));
});
check("data tokens activate the exact explicitly bound fields", () => {
  const p = createHomepagePresentationBindings(configured("hero", { text: { title: { fontSizePx: 48, alignment: "center" } } }).presentation)("hero");
  const props = homepagePresentationProps(p.textStyle("title"));
  assert.equal(props["data-homepage-text-base"], "font-size alignment");
  assert.deepEqual(homepagePresentationProps(undefined), {});
});
check("all seven text fields have scoped stylesheet consumers", () => {
  for (const field of ["font-size", "font-weight", "color", "line-height", "letter-spacing", "alignment", "max-width"]) assert.ok(bindingCss.includes('[data-homepage-text-base~="' + field + '"]') && bindingCss.includes("var(--homepage-text-" + field + "-base)"));
});
check("Base spacing is controlled by stylesheet active variables", () => {
  for (const field of ["padding-top", "padding-bottom"]) assert.ok(bindingCss.includes(field + ":var(--homepage-section-" + field + ")"));
  assert.doesNotMatch(bindingCss, /padding-inline|padding-left|padding-right/u);
});
check("Base background is stylesheet-controlled without added important", () => {
  assert.ok(bindingCss.includes("background:var(--homepage-section-background)"));
  assert.doesNotMatch(bindingCss, /!important/u);
});
check("content width and reading width use independently overridable variables", () => {
  assert.ok(bindingCss.includes("max-width:min(var(--homepage-content-width),var(--homepage-text-max-width,var(--homepage-content-width)))"));
});
check("presentation-hidden section retains its content and CTA DOM", () => {
  const hidden = section(render(configured("home010", { visible: false })), "home010");
  assert.ok(hidden.includes("<h2") && hidden.includes("v3-button"));
});
check("visibility true restores each section's native layout display", () => {
  assert.ok(bindingCss.includes(".v3-hero{--homepage-visible-display:flex}") && bindingCss.includes(".v3-roast-service{--homepage-visible-display:grid}"));
  assert.equal(value(createHomepagePresentationBindings(configured("home006", { visible: true }).presentation)("home006").sectionStyle, "--homepage-section-visibility-base"), "var(--homepage-visible-display, block)");
});
check("Base absent and Mobile-only width share the same stable frame DOM", () => {
  const data = fixture();
  data.presentation = { schemaVersion: 3, sections: { home006: { mobile: { overrideEnabled: true, overrides: { layout: { contentMaxWidthPx: 300 } } } } } };
  assert.equal(noStyles(renderRaw(data)), noStyles(renderRaw(fixture())));
  assert.ok(renderRaw(data).includes('data-homepage-content-mobile="width"'));
  assert.ok(section(renderRaw(data), "home006").includes('class="homepage-base-content-grid"'));
});
check("frame has no conditional markup and is layout-transparent without width", () => {
  assert.ok(bindingCss.includes(".v3-roast-service>.homepage-base-content-grid{display:contents}"));
  assert.ok(bindingCss.includes('.homepage-base-content-grid[data-homepage-content-base~="width"]{display:grid'));
});
check("legacy Desktop and all Mobile media queries remain in order", () => {
  const queries = (source: string) => [...source.matchAll(/@media[^{]+/gu)].map((match) => match[0]);
  assert.deepEqual(queries(css.slice(0, css.indexOf("/* H3.4B CMS Presentation only:"))), queries(oldCss));
  assert.deepEqual(queries(css.slice(css.indexOf("/* H3.4B CMS Presentation only:"))), ["@media (max-width: 600px)"]);
});
check("no important escalation was introduced", () => {
  assert.equal((css.match(/!important/gu) ?? []).length, (oldCss.match(/!important/gu) ?? []).length);
});
const homeSource = await readFile(path.join(root, "components/home/HomepageV3.tsx"), "utf8");
const campaignSource = await readFile(path.join(root, "components/home/MonthlyCampaign.tsx"), "utf8");
const frameSource = await readFile(path.join(root, "components/home/HomepageContentWidth.tsx"), "utf8");
check("renderer/frame have no presentation visibility render gate or viewport branching", () => {
  for (const source of [homeSource, campaignSource, frameSource]) assert.doesNotMatch(source, /presentation(?:\.\w+)?\.visible|window\.|document\.|matchMedia|useEffect|\.mobile\.|mobile\.overrides/u);
  assert.doesNotMatch(frameSource, /if\s*\(/u);
});
check("future sparse CSS override needs no inline property or renderer replacement", () => {
  const p = createHomepagePresentationBindings(configured("home002", { layout: { paddingTopPx: 100 }, text: { title: { fontSizePx: 48, alignment: "center" } } }).presentation)("home002");
  assert.deepEqual(p.textStyle("title"), { "--homepage-text-font-size-base": "48px", "--homepage-text-alignment-base": "center" });
  assert.deepEqual(p.sectionStyle, { "--homepage-section-padding-top-base": "100px" });
  // A future media rule can set --homepage-text-font-size:30px and
  // --homepage-section-padding-top:40px. Unset alignment retains the Base rule.
  assert.ok(bindingCss.includes("font-size:var(--homepage-text-font-size)") && bindingCss.includes("text-align:var(--homepage-text-alignment)"));
});
check("configured HOME006 columns and aspect-ratio media stay inside a narrow cap", () => {
  assert.ok(bindingCss.includes('width:100%;min-width:0;max-width:100%'));
  assert.ok(bindingCss.includes('.v3-roast-service>.homepage-base-content-grid[data-homepage-content-base~="width"]>*{min-width:0}'));
});
assert.equal(await readFile(path.join(root, "public/data/homepage.json"), "utf8"), stored);
assert.equal(await readFile(path.join(root, "bootstrap/store/homepage.json"), "utf8"), seed);
console.log("H3.3A.1 responsive-ready bindings: " + passed + " checks PASS (59 retained + 15 readiness); no persisted JSON writes.");
