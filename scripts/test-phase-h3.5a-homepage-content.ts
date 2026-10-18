import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { describeHomepageContent, homepageProductCopy, HOMEPAGE_CONTENT_SOURCES } from "../lib/homepageContent.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { HOMEPAGE_PRESENTATION_SECTION_KEYS, HOMEPAGE_SECTION_CAPABILITIES } from "../lib/homepagePresentation.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { LEGACY_HOME002_CLOSING_TEXT } from "../lib/homepageCms.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { activeHomepageCampaigns } from "../lib/homepageCampaigns.ts";
import type { HomepageData } from "../data/homepageData";
import type { HomepageContentProduct } from "../lib/homepageContent";
import type { HomepagePresentationKey } from "../lib/homepagePresentation";

const stored = await readFile("public/data/homepage.json", "utf8");
const website = await readFile("public/data/website-data.json", "utf8");
const products: HomepageContentProduct[] = JSON.parse(website).menu.products;
const fixture = (): HomepageData => JSON.parse(stored);
const now = new Date("2026-10-17T12:00:00");
const describe = (h: HomepageData, key: HomepagePresentationKey, p = products) => describeHomepageContent(h, key, p, [], now);
let passed = 0;
function check(name: string, run: () => void) { run(); passed++; console.log("PASS " + name); }
function freeze(value: unknown) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } }

check("HOME002 title preserves exact text, source, edit location and impact", () => {
  const h = fixture(); h.home002!.title = "精確標題\n第二行"; const d = describe(h, "home002").title!;
  assert.equal(d.examples[0].text, "精確標題\n第二行"); assert.equal(d.examples[0].source, "homepage_content");
  assert.match(d.examples[0].editableWhere, /首頁/u); assert.match(d.impact, /呈現方式/u);
});
check("HOME002 stored closing is Homepage content", () => {
  const h = fixture(); h.home002!.closingText = "Owner 的結尾"; const d = describe(h, "home002").closing!;
  assert.equal(d.examples[0].text, "Owner 的結尾"); assert.equal(d.examples[0].source, "homepage_content");
});
check("HOME002 missing closing is system default and remains absent", () => {
  const h = fixture(); delete h.home002!.closingText; const before = structuredClone(h); const d = describe(h, "home002").closing!;
  assert.equal(d.examples[0].text, LEGACY_HOME002_CLOSING_TEXT); assert.equal(d.examples[0].source, "system_default"); assert.deepEqual(h, before);
});
check("HOME002 explicit empty closing is not replaced", () => {
  const h = fixture(); h.home002!.closingText = ""; const d = describe(h, "home002").closing!;
  assert.equal(d.examples[0].text, ""); assert.equal(d.state, "empty"); assert.equal(d.examples[0].source, "homepage_content");
});
check("HOME002 disabled closing reports its condition", () => {
  const h = fixture(); h.home002!.closingEnabled = false; assert.match(describe(h, "home002").closing!.reason!, /已停用/u);
});
check("HOME004 names use actual selected valid Product reference order", () => {
  const h = fixture(); const expected = (h.home004!.productSlugs as string[]).map(slug => products.find(p => p.slug === slug)!.name);
  assert.deepEqual(describe(h, "home004").cardTitle!.examples.map(x => x.text), expected);
  assert.deepEqual(describe(h, "home004").cardTitle!.sources, ["product_data"]);
});
check("HOME004 reordered references are resolved, never hardcoded", () => {
  const h = fixture(); const refs = [...h.home004!.productSlugs as string[]].reverse(); h.home004!.productSlugs = refs;
  assert.deepEqual(describe(h, "home004").cardTitle!.examples.map(x => x.text), refs.map(slug => products.find(p => p.slug === slug)!.name));
});
check("HOME004 invalid Product eligibility is excluded like public resolver", () => {
  const h = fixture(); const p = structuredClone(products); const first = (h.home004!.productSlugs as string[])[0]; p.find(x => x.slug === first)!.active = false;
  assert.equal(describe(h, "home004", p).cardTitle!.examples.length, 2);
});
check("HOME004 shortCopy wins, empty shortCopy uses subtitle", () => {
  const h = fixture(); const p = structuredClone(products); const refs = h.home004!.productSlugs as string[];
  p.find(x => x.slug === refs[0])!.shortCopy = "精確短文案";
  const second = p.find(x => x.slug === refs[1])!; second.shortCopy = ""; second.subtitle = "精確備用副標";
  const examples = describe(h, "home004", p).cardBody!.examples;
  assert.equal(examples[0].text, "精確短文案"); assert.equal(examples[1].text, "精確備用副標");
});
check("HOME004 fixed CTA reports public copy and no content editor", () => {
  const d = describe(fixture(), "home004").cta!;
  assert.ok(d.examples.length); assert.ok(d.examples.every(x => x.text === "查看作品與規格 →" && x.source === "system_fixed"));
  assert.match(d.impact, /不在此修改/u); assert.match(d.examples[0].editableWhere, /沒有/u);
});
check("HOME004 does not invent price/specification/availability slots", () => {
  assert.deepEqual(Object.keys(describe(fixture(), "home004")), [...HOMEPAGE_SECTION_CAPABILITIES.home004]);
});
for (const [label, href, enabled, reason] of [
  ["", "/works", true, "沒有按鈕文字"], ["   ", "/works", true, "沒有按鈕文字"],
  ["挑選", { type: "none" }, true, "沒有有效連結"], ["挑選", "javascript:alert(1)", true, "沒有有效連結"],
  ["挑選", "/works", false, "已停用"],
] as const) check("HOME003 CTA condition: " + reason + " " + JSON.stringify(label), () => {
  const h = fixture(); h.home003!.cards = [{ title: "卡片", button: label, href, ctaEnabled: enabled }];
  const d = describe(h, "home003").cta!; assert.equal(d.examples[0].text, label); assert.equal(d.state, "not_rendered"); assert.match(d.examples[0].reason!, new RegExp(reason, "u"));
});
check("HOME003 valid CTA remains available", () => {
  const h = fixture(); h.home003!.cards = [{ title: "卡片", button: "挑選", href: "/works" }];
  assert.equal(describe(h, "home003").cta!.state, "available");
});
check("Hero combines titleLines, exposes both CTA roles", () => {
  const h = fixture(); const d = describe(h, "hero");
  assert.equal(d.title!.examples[0].text, h.hero.titleLines.join("\n")); assert.deepEqual(d.cta!.examples.map(x => x.role), ["主要按鈕", "次要按鈕"]);
});
check("Hero trust fallback is system default, configured cues are Homepage content", () => {
  const h = fixture(); delete h.hero.trustCues; assert.deepEqual(describe(h, "hero").metadata!.sources, ["system_default"]);
  h.hero.trustCues = ["Owner 的資訊"]; assert.deepEqual(describe(h, "hero").metadata!.sources, ["homepage_content"]);
  h.hero.trustCues = []; assert.equal(describe(h, "hero").metadata!.total, 0);
});
check("Hero absent label fallback differs from explicit empty label", () => {
  const h = fixture(); delete (h.hero as Partial<typeof h.hero>).buttonLabel; h.hero.buttonHref = "/works";
  assert.equal(describe(h, "hero").cta!.examples[0].source, "system_default");
  h.hero.buttonLabel = ""; assert.equal(describe(h, "hero").cta!.examples[0].text, ""); assert.equal(describe(h, "hero").cta!.examples[0].state, "not_rendered");
});
check("HOME009 no complete reviews suppresses the entire section", () => {
  const h = fixture(); h.home009!.items = [{ text: "不完整", name: "", source: "LINE" }];
  for (const d of Object.values(describe(h, "home009"))) { assert.equal(d!.state, "not_rendered"); assert.match(d!.reason!, /目前沒有有效評價，因此整個區塊未呈現/u); }
});
check("HOME009 only complete public reviews appear with exact name/source", () => {
  const h = fixture(); h.home009!.items = [{ text: "真實回饋", name: "客人", source: "LINE" }, { text: "不完整" }];
  const d = describe(h, "home009"); assert.equal(d.cardBody!.examples[0].text, "「真實回饋」"); assert.deepEqual(d.metadata!.examples.map(x => x.text), ["客人", "LINE"]);
});
for (const key of ["home002", "home005"] as const) check(key + " indexes are system computed", () => {
  assert.ok(describe(fixture(), key).metadata!.examples.every(x => x.source === "system_computed"));
});
check("sorted/enabled collections and shared impact match content order", () => {
  const h = fixture(); h.home007!.cards = [{ title: "後", order: 2 }, { title: "停用", enabled: false }, { title: "先", order: 0 }];
  const d = describe(h, "home007").cardTitle!; assert.deepEqual(d.examples.map(x => x.text), ["先", "後"]); assert.match(d.impact, /所有對應項目/u);
});
check("explicit empty title is reported without placeholder text", () => {
  const h = fixture(); h.home010!.title = ""; const d = describe(h, "home010").title!;
  assert.equal(d.examples[0].text, ""); assert.equal(d.state, "empty"); assert.equal(d.reason, "目前沒有內容");
});
check("HOME010 invalid CTA and disabled master report separate reasons", () => {
  const h = fixture(); h.home010!.button = "開始"; h.home010!.href = { type: "none" };
  assert.match(describe(h, "home010").cta!.examples[0].reason!, /沒有有效連結/u);
  h.home010!.enabled = false; assert.match(describe(h, "home010").title!.reason!, /啟用開關已關閉/u);
});
check("HOME008 valid nested media and empty explicit collection follow content gates", () => {
  const h = fixture(); h.home008!.mediaItems = [{ enabled: true, mediaItems: [{ image: "/images/example.png" }] }];
  assert.equal(describe(h, "home008").title!.state, "available");
  h.home008!.mediaItems = []; assert.equal(describe(h, "home008").title!.state, "not_rendered");
  assert.deepEqual(Object.keys(describe(h, "home008")), ["title", "body"]);
});
check("Campaign uses shared active selector and distinguishes roles/mixed sources", () => {
  const h = fixture(); const original = h.campaigns[0]; h.campaignSection.displayLimit = 1;
  h.campaigns = [
    { ...original, id: "future", title: "未開始", startDate: "2099-01-01" },
    { ...original, id: "wrong", title: "商品頁限定", placements: ["product_pages"] },
    { ...original, id: "off", title: "停用", enabled: false },
    { ...original, id: "later", title: "排序後", sort: 20 },
    { ...original, id: "active", title: "實際活動", sort: 1, note: "活動註記" },
  ];
  assert.deepEqual(activeHomepageCampaigns(h, now).map(x => x.title), ["實際活動"]);
  const d = describe(h, "campaignSection");
  assert.deepEqual(d.cardTitle!.examples.map(x => x.text), ["實際活動"]);
  assert.deepEqual(d.metadata!.sources, ["system_computed", "homepage_content"]);
  assert.equal(d.eyebrow!.examples.length, 2); assert.match(d.eyebrow!.impact, /同時影響/u);
});
check("safe Product copy projection returns exactly two public fields", () => {
  const p = { shortCopy: "公開短文案", subtitle: "公開副標", id: "private", skus: [{ id: "internal" }], history: ["private"] };
  const before = structuredClone(p); assert.deepEqual(homepageProductCopy(p), { shortCopy: "公開短文案", subtitle: "公開副標" }); assert.deepEqual(p, before);
  assert.deepEqual(homepageProductCopy({ shortCopy: 4 }), { subtitle: "", shortCopy: "" });
});
for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) check(key + ": exact canonical slots; immutable inputs; no Base/Mobile nodes", () => {
  const h = fixture(); delete h.presentation; const p = structuredClone(products); const before = structuredClone(h), pBefore = structuredClone(p);
  freeze(h); freeze(p); const result = describe(h, key, p);
  assert.deepEqual(Object.keys(result), [...HOMEPAGE_SECTION_CAPABILITIES[key]]);
  for (const d of Object.values(result)) { assert.ok(d!.label && d!.impact); assert.ok(d!.sources.every(source => source in HOMEPAGE_CONTENT_SOURCES)); }
  assert.deepEqual(h, before); assert.deepEqual(p, pBefore); assert.equal(Object.hasOwn(h, "presentation"), false);
});
check("existing Base and disabled sparse Mobile remain byte-identical", () => {
  const h = fixture(); h.presentation = { schemaVersion: 3, sections: { home004: { base: { text: { cardTitle: { fontSizePx: 48 } } }, mobile: { overrideEnabled: false, overrides: { visible: false, layout: { paddingTopPx: 0 } } } } } };
  const before = structuredClone(h); freeze(h); describe(h, "home004"); assert.deepEqual(h, before);
});
assert.equal(await readFile("public/data/homepage.json", "utf8"), stored);
assert.equal(await readFile("public/data/website-data.json", "utf8"), website);
console.log(`H3.5A content model: ${passed} checks PASS; read-only fixtures; Owner/Product files unchanged.`);
