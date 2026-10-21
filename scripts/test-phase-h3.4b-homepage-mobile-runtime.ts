import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createElement, type ComponentType, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import postcss from "postcss";
// @ts-expect-error -- explicit extensions support the Node type-stripping runner.
import { createHomepagePresentationBindings, homepagePresentationProps } from "../lib/homepagePresentationBindings.ts";
// @ts-expect-error -- explicit extensions support the Node type-stripping runner.
import { HOMEPAGE_PRESENTATION_MOBILE_MAX_PX, HOMEPAGE_PRESENTATION_SECTION_KEYS, HOMEPAGE_SECTION_CAPABILITIES } from "../lib/homepagePresentation.ts";
import type { HomepagePresentationPatch as Patch, HomepageSectionPresentation, HomepagePresentationKey } from "../lib/homepagePresentation.ts";
import type { HomepageViewData } from "../components/home/HomepageV3";

let passed = 0;
function check(name: string, run: () => void) { run(); passed++; console.log("PASS " + name); }
function binding(section: HomepageSectionPresentation = {}, key: HomepagePresentationKey = "home002") {
  return createHomepagePresentationBindings({ schemaVersion: 3, sections: { [key]: section } })(key);
}
const mobile = (overrides?: Patch, base?: Patch, overrideEnabled = true) => binding({ base, mobile: { overrideEnabled, overrides } });
const get = (style: Parameters<typeof homepagePresentationProps>[0], name: string) => Reflect.get(style ?? {}, name);
const all = (value: ReturnType<typeof binding>) => ({ ...value.sectionStyle, ...value.contentStyle(), ...value.textStyle("title") });
const base: Patch = { text: { title: { fontSizePx: 48, alignment: "center" }, intro: { fontSizePx: 19 } }, layout: { paddingTopPx: 100, paddingBottomPx: 80, contentMaxWidthPx: 900 }, background: { mode: "color", color: "gold" }, visible: false };
check("OFF emits no Mobile vars or tokens, preserves Base", () => {
  const p = mobile({ text: { title: { fontSizePx: 30 } }, visible: true }, base, false);
  assert.ok(Object.keys(all(p)).every(key => !key.endsWith("-mobile")));
  assert.ok(Object.keys(homepagePresentationProps(p.sectionStyle)).every(key => !key.endsWith("-mobile")));
  assert.deepEqual(all(p), all(binding({ base })));
});
check("ON empty overrides emits no Mobile variables/tokens", () => { assert.deepEqual(all(mobile({})), {}); assert.deepEqual(homepagePresentationProps(mobile({}).textStyle("title")), {}); });
check("ON one leaf serializes only that Mobile leaf", () => { assert.deepEqual(mobile({ text: { title: { fontSizePx: 30 } } }).textStyle("title"), { "--homepage-text-font-size-mobile": "30px" }); });
check("Base inheritance is not materialized as Mobile", () => {
  const p = mobile({ text: { title: { fontSizePx: 30 } } }, base);
  assert.deepEqual(Object.keys(all(p)).filter(key => key.endsWith("-mobile")), ["--homepage-text-font-size-mobile"]);
  assert.equal(homepagePresentationProps(p.textStyle("title"))["data-homepage-text-mobile"], "font-size");
  assert.equal(get(p.textStyle("title"), "--homepage-text-alignment-base"), "center");
});
check("reset/inherit removes Mobile leaf but keeps Base", () => { assert.deepEqual(all(mobile({ text: { title: {} } }, base)), all(binding({ base }))); });
check("hidden Base/Mobile animation and presets emit nothing", () => { assert.deepEqual(all(binding({ preset: "editorial", base: { animation: { durationMs: 500 } }, mobile: { overrideEnabled: true, overrides: { animation: { enabled: false, delayMs: 0 } } } })), {}); });
check("unknown/invalid even disabled input still fails validation", () => {
  for (const overrides of [{ css: "red" }, { text: { title: { fontSizePx: 999 } } }, { visible: 0 }, { background: { color: "url(x)" } }]) assert.throws(() => createHomepagePresentationBindings({ schemaVersion: 3, sections: { hero: { mobile: { overrideEnabled: false, overrides } } } }));
});
for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) check(key + ": every canonical Mobile slot binds independently", () => {
  for (const slot of HOMEPAGE_SECTION_CAPABILITIES[key]) {
    const p = binding({ mobile: { overrideEnabled: true, overrides: { text: { [slot]: { fontSizePx: 30 } } } } }, key);
    assert.equal(get(p.textStyle(slot), "--homepage-text-font-size-mobile"), "30px");
    for (const other of HOMEPAGE_SECTION_CAPABILITIES[key]) if (other !== slot) assert.equal(p.textStyle(other), undefined);
  }
});
check("all safe typography leaves and zero tracking map correctly", () => {
  assert.deepEqual(mobile({ text: { title: { fontSizePx: 30, fontWeight: "bold", color: "#Ab12EF", lineHeight: 1.4, letterSpacingEm: 0, alignment: "right", maxWidthCh: 24 } } }).textStyle("title"), {
    "--homepage-text-font-size-mobile": "30px", "--homepage-text-font-weight-mobile": 700, "--homepage-text-color-mobile": "#ab12ef", "--homepage-text-line-height-mobile": 1.4, "--homepage-text-letter-spacing-mobile": "0em", "--homepage-text-alignment-mobile": "right", "--homepage-text-max-width-mobile": "24ch",
  });
});
for (const field of ["paddingTopPx", "paddingBottomPx"] as const) check(field + ": explicit zero survives", () => { assert.equal(get(mobile({ layout: { [field]: 0 } }).sectionStyle, "--homepage-section-" + (field === "paddingTopPx" ? "padding-top" : "padding-bottom") + "-mobile"), "0px"); });
for (const [baseVisible, mobileVisible] of [[true, false], [false, true], [false, undefined], [undefined, false], [undefined, true]] as const) check("visibility sparse " + baseVisible + " -> " + mobileVisible, () => {
  const p = mobile({ visible: mobileVisible }, { visible: baseVisible });
  for (const [viewport, value] of [["base", baseVisible], ["mobile", mobileVisible]] as const) assert.equal(get(p.sectionStyle, "--homepage-section-visibility-" + viewport), value === undefined ? undefined : value ? "var(--homepage-visible-display, block)" : "none");
});
for (const [baseWidth, mobileWidth] of [[900, undefined], [900, 300], [undefined, 300], [undefined, undefined]] as const) check("width sparse " + baseWidth + " -> " + mobileWidth, () => {
  const p = mobile({ layout: { contentMaxWidthPx: mobileWidth } }, { layout: { contentMaxWidthPx: baseWidth } });
  assert.equal(get(p.contentStyle(), "--homepage-content-width-base"), baseWidth === undefined ? undefined : baseWidth + "px");
  assert.equal(get(p.contentStyle(), "--homepage-content-width-mobile"), mobileWidth === undefined ? undefined : mobileWidth + "px");
  assert.equal(p.contentStyle()?.marginInline, undefined);
});
for (const [name, baseBackground, mobileBackground, expectedBase, expectedMobile] of [
  ["color to none", { mode: "color", color: "gold" }, { mode: "none" }, "#b7905a", "transparent"],
  ["none to color", { mode: "none" }, { mode: "color", color: "ink" }, "transparent", "#2b211b"],
  ["A to B", { mode: "color", color: "gold" }, { mode: "color", color: "#112233" }, "#b7905a", "#112233"],
  ["Mobile only", undefined, { mode: "color", color: "#112233" }, undefined, "#112233"],
  ["Base only", { mode: "color", color: "gold" }, undefined, "#b7905a", undefined],
  ["both absent", undefined, undefined, undefined, undefined],
  ["legacy reset inherits Base", { mode: "color", color: "gold" }, { mode: "legacy" }, "#b7905a", undefined],
  ["partial color inherits color mode", { mode: "color", color: "gold" }, { color: "#112233" }, "#b7905a", "#112233"],
  ["partial mode references Base color without copying", { mode: "color", color: "gold" }, { mode: "color" }, "#b7905a", "var(--homepage-section-background-color-base)"],
  ["mode-only Mobile color reuses stored Base color under none", { mode: "none", color: "gold" }, { mode: "color" }, "transparent", "var(--homepage-section-background-color-base)"],
  ["mode-only Mobile color reuses stored Base color without Base mode", { color: "gold" }, { mode: "color" }, undefined, "var(--homepage-section-background-color-base)"],
  ["incomplete color is inert", undefined, { mode: "color" }, undefined, undefined],
  ["color does not defeat inherited none", { mode: "none", color: "gold" }, { color: "#112233" }, "transparent", undefined],
] as const) check("background: " + name, () => {
  const p = mobile({ background: mobileBackground }, { background: baseBackground });
  assert.equal(get(p.sectionStyle, "--homepage-section-background-base"), expectedBase);
  assert.equal(get(p.sectionStyle, "--homepage-section-background-mobile"), expectedMobile);
  if (expectedMobile === "var(--homepage-section-background-color-base)") assert.equal(get(p.sectionStyle, "--homepage-section-background-color-base"), "#b7905a");
});
const root = process.cwd();
const stored = await readFile("public/data/homepage.json", "utf8");
const seed = await readFile("bootstrap/store/homepage.json", "utf8");
const jiti = createJiti(import.meta.url, { alias: { "@": root }, jsx: { runtime: "automatic" }, fsCache: false });
type HomeProps = ComponentProps<typeof import("../components/home/HomepageV3").default>;
const { default: Home } = await jiti.import<{ default: ComponentType<HomeProps> }>(path.join(root, "components/home/HomepageV3.tsx"));
const products: HomeProps["products"] = [{ slug: "qa-coffee", name: "測試作品", active: true, status: "active", purchasable: true, inMonthlyMenu: true, skus: [{ enabled: true, stock: 2 }], purchase: [{ label: "半磅", detail: "fixture", price: 345 }] }];
function fixture(): HomepageViewData {
  const data: HomepageViewData = JSON.parse(stored);
  for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) data[key].enabled = true;
  data.home004.productSlugs = products.map(p => p.slug);
  data.home009.items = [{ id: "QA-REVIEW", text: "測試回饋", name: "測試者", source: "Google" }];
  data.campaigns = [{ id: "QA-CAMPAIGN", enabled: true, eyebrow: "測試", details: [], title: "測試活動", description: "活動說明", ctaLabel: "查看", ctaHref: "/works", image: "/images/qa.webp", startDate: "", endDate: "" }];
  return data;
}
const render = (data: HomepageViewData) => renderToStaticMarkup(createElement(Home, { homepageData: data, products, pages: [] }));
const ids = { hero: "top", campaignSection: "monthly-campaign", home002: "home002", home003: "home003", home004: "home004", home005: "home005", home006: "home006", home007: "home007", home008: "home008", home009: "home009", home010: "home010" };
for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) check(key + ": Mobile cannot revive master-disabled DOM", () => {
  const data = fixture(); data[key].enabled = false; data.presentation = { schemaVersion: 3, sections: { [key]: { mobile: { overrideEnabled: true, overrides: { visible: true } } } } };
  assert.ok(!render(data).includes('id="' + ids[key] + '"'));
});
check("presentation-hidden DOM and child links remain mounted", () => { const data = fixture(); data.presentation = { schemaVersion: 3, sections: { home010: { base: { visible: false }, mobile: { overrideEnabled: true, overrides: { visible: true } } } } }; const html = render(data); assert.match(html, /id="home010"[^>]*data-homepage-section-mobile="visibility"/u); assert.ok(html.includes("v3-final") && html.includes("v3-button")); });
check("missing campaign and reviews remain absent with Mobile visible", () => {
  const data = fixture(); data.campaigns = []; data.home009.items = [];
  data.presentation = { schemaVersion: 3, sections: { campaignSection: { mobile: { overrideEnabled: true, overrides: { visible: true } } }, home009: { mobile: { overrideEnabled: true, overrides: { visible: true } } } } };
  const html = render(data); assert.ok(!html.includes('id="monthly-campaign"') && !html.includes('id="home009"'));
});
check("HOME006 stable wrapper carries Mobile-only width, no Base width", () => {
  const data = fixture(); data.presentation = { schemaVersion: 3, sections: { home006: { mobile: { overrideEnabled: true, overrides: { layout: { contentMaxWidthPx: 300 } } } } } };
  assert.match(render(data), /class="homepage-base-content-grid" style="--homepage-content-width-mobile:300px" data-homepage-content-mobile="width"/u);
});
check("HOME004 commerce content stays byte-identical after presentation attributes removed", () => {
  const data = fixture(); const before = render(data); data.presentation = { schemaVersion: 3, sections: { home004: { mobile: { overrideEnabled: true, overrides: { text: { title: { fontSizePx: 30 }, cardBody: { color: "gold" } }, layout: { paddingTopPx: 0 } } } } } };
  const strip = (html: string) => html.replace(/ style="[^"]*"/gu, "").replace(/ data-homepage-[a-z-]+="[^"]*"/gu, "");
  assert.equal(strip(render(data)), strip(before));
});
const css = await readFile("app/globals.css", "utf8");
const marker = "/* H3.4B CMS Presentation only:";
const mobileStart = css.indexOf(marker);
const mobileEnd = css.indexOf("/* End H3.4B Mobile presentation bindings. */", mobileStart);
assert.ok(mobileStart >= 0 && mobileEnd > mobileStart, "Mobile CSS scope markers must exist");
const mobileCss = css.slice(mobileStart, mobileEnd);
const oldCss = execFileSync("git", ["show", "29f06b6:app/globals.css"], { encoding: "utf8" });
check("legacy CSS and all original breakpoints unchanged byte-for-byte", () => { assert.equal(css.slice(0, css.indexOf(marker)).replaceAll("\r\n", "\n").trimEnd(), oldCss.replaceAll("\r\n", "\n").trimEnd()); });
check("canonical constant and sole CMS media query cannot drift", () => {
  assert.equal(HOMEPAGE_PRESENTATION_MOBILE_MAX_PX, 600);
  const media: string[] = []; postcss.parse(mobileCss).walkAtRules("media", rule => { media.push(rule.params); });
  assert.deepEqual(media, ["(max-width: " + HOMEPAGE_PRESENTATION_MOBILE_MAX_PX + "px)"]);
});
for (const width of [599, 600, 601]) check(width + ": documented inclusive boundary", () => { assert.equal(width <= HOMEPAGE_PRESENTATION_MOBILE_MAX_PX, width !== 601); });
check("every Mobile consumer is field-token gated inside CMS media query", () => {
  postcss.parse(mobileCss).walkRules(rule => {
    assert.ok(rule.selector.includes("data-homepage-") && rule.selector.includes("-mobile"));
    assert.equal(rule.parent?.type, "atrule");
    assert.equal((rule.parent as postcss.AtRule).params, "(max-width: 600px)");
    rule.walkDecls(decl => { assert.equal(decl.important, undefined); assert.doesNotMatch(decl.value, /\b(initial|unset|revert|revert-layer)\b/u); });
  });
});
check("text and section consumers override active aliases at matching Base specificity", () => {
  for (const field of ["font-size", "font-weight", "color", "line-height", "letter-spacing", "alignment", "max-width"]) assert.ok(mobileCss.includes('[data-homepage-text-mobile~="' + field + '"]') && mobileCss.includes("--homepage-text-" + field + ":var(--homepage-text-" + field + "-mobile)"));
  for (const field of ["padding-top", "padding-bottom", "visibility", "background"]) assert.ok(mobileCss.includes('[data-homepage-section-mobile~="' + field + '"]'));
});
check("Campaign important padding still consumes the active aliases", () => { assert.match(css, /padding:var\(--homepage-section-padding-top,54px\) 0 var\(--homepage-section-padding-bottom,54px\)!important/u); assert.doesNotMatch(mobileCss, /!important/u); });
check("display restores Hero flex, Roast grid, ordinary fallback block", () => { assert.ok(css.includes(".v3-hero{--homepage-visible-display:flex}") && css.includes(".v3-roast-service{--homepage-visible-display:grid}")); assert.ok(mobileCss.includes("display:var(--homepage-section-visibility)")); });
check("Mobile-only HOME006 grid activates only in the media query", () => { assert.ok(mobileCss.includes('.homepage-base-content-grid[data-homepage-content-mobile~="width"]{display:grid')); assert.ok(oldCss.includes(".v3-roast-service>.homepage-base-content-grid{display:contents}")); });
check("Mobile reading width retains an existing Base content cap", () => { assert.ok(mobileCss.includes('[data-homepage-content-base~="width"][data-homepage-text-mobile~="max-width"]{max-width:min(')); });
check("no centering, structural rail or animation rules in Mobile addition", () => { assert.doesNotMatch(mobileCss, /80vw|scroll-snap|filmstrip|animation:|transition:|padding-inline|margin-inline:(?!auto)/u); });
const helper = await readFile("lib/homepagePresentationBindings.ts", "utf8");
check("raw enabled Mobile source, no merged Mobile resolution, no viewport JS", () => {
  assert.match(helper, /overrideEnabled === true/u);
  assert.match(helper, /stored\.mobile\.overrides/u);
  assert.doesNotMatch(helper, /sectionKey, "mobile"|window\.|document\.|matchMedia|useEffect|\.animation\b|\.preset\b/u);
});
check("input and persisted JSON remain unchanged", () => {
  const data = fixture(); data.presentation = { schemaVersion: 3, sections: { home002: { base, mobile: { overrideEnabled: true, overrides: { text: { title: { fontSizePx: 30 } } } } } } };
  const before = JSON.stringify(data); render(data); assert.equal(JSON.stringify(data), before);
});
assert.equal(await readFile("public/data/homepage.json", "utf8"), stored);
assert.equal(await readFile("bootstrap/store/homepage.json", "utf8"), seed);
console.log("H3.4B sparse Mobile runtime: " + passed + " checks PASS; browser computed-style/resize QA reported separately; no persisted writes.");
