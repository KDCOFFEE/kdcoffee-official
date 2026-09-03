import assert from "node:assert/strict";

// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { validatePageStore, type PageStore } from "../lib/pageBuilder.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { DEFAULT_WORKS_PAGE_CMS_CONFIG, resolveWorksPageCms, validateWorksPageCms, type WorksPageCmsConfig } from "../lib/worksPageCms.ts";

let passed = 0;
function test(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

function rejects(name: string, value: unknown) {
  test(name, () => assert.throws(() => validateWorksPageCms(value)));
}

const live = { monthLabel: "九月精選", intro: "九月的現場豆單說明。" };

test("no config resolves exact legacy copy, CTAs, SEO, media and visuals", () => {
  const value = resolveWorksPageCms(undefined, live);
  assert.equal(value.hero.eyebrow, live.monthLabel);
  assert.equal(value.hero.headlineLines[0], "不用先懂咖啡，");
  assert.equal(value.hero.headlineLines[1], "先從你喜歡的味道開始。");
  assert.equal(value.hero.description, live.intro);
  assert.deepEqual(value.hero.primaryCta, { enabled: true, label: "查看全部作品", link: "#catalog" });
  assert.deepEqual(value.hero.secondaryCta, { enabled: true, label: "不知道怎麼選？看入門推薦", link: "/#beginner" });
  assert.equal(value.catalog.countPrefix, "本月共");
  assert.equal(value.catalog.countSuffix, "件作品");
  assert.equal(value.catalog.helperText, "每張卡片都直接顯示風味、價格與供應狀態。");
  assert.equal(value.catalog.emptyStateText, "");
  assert.equal(value.hero.desktopMedia, undefined);
  assert.equal(value.hero.mobileMedia, undefined);
  assert.equal(value.hero.overlayPreset, "current-gradient");
  assert.equal(value.seo.title, "本月咖啡作品｜KD Coffee 咖啡藝術工坊");
  assert.equal(value.seo.description, "查看 KD Coffee 本月咖啡作品、風味、價格與購買規格。第一次喝精品咖啡，也能快速找到適合自己的味道。");
});

test("monthLabel remains live and is not frozen into defaults", () => {
  const first = resolveWorksPageCms(undefined, { ...live, monthLabel: "A 月" });
  const second = resolveWorksPageCms(undefined, { ...live, monthLabel: "B 月" });
  assert.equal(first.hero.eyebrow, "A 月");
  assert.equal(second.hero.eyebrow, "B 月");
  assert.equal(JSON.stringify(DEFAULT_WORKS_PAGE_CMS_CONFIG).includes("A 月"), false);
});

test("menu intro remains live and is not frozen into defaults", () => {
  assert.equal(resolveWorksPageCms(undefined, { ...live, intro: "更新說明" }).hero.description, "更新說明");
});

test("partial Hero config preserves all unspecified legacy fields", () => {
  const config: WorksPageCmsConfig = { schemaVersion: 1, hero: { headlineLines: ["自訂第一行", "自訂第二行"] } };
  const value = resolveWorksPageCms(config, live);
  assert.deepEqual(value.hero.headlineLines, ["自訂第一行", "自訂第二行"]);
  assert.equal(value.hero.eyebrow, live.monthLabel);
  assert.equal(value.hero.description, live.intro);
  assert.equal(value.hero.primaryCta.link, "#catalog");
  assert.equal(value.catalog.presentation.cardPreset, "current");
});

test("custom eyebrow overrides live month only in custom mode", () => {
  const custom = resolveWorksPageCms({ schemaVersion: 1, hero: { eyebrowSource: "custom", customEyebrow: "Owner 小標" } }, live);
  const monthly = resolveWorksPageCms({ schemaVersion: 1, hero: { eyebrowSource: "monthly-menu", customEyebrow: "過期小標" } }, live);
  assert.equal(custom.hero.eyebrow, "Owner 小標");
  assert.equal(monthly.hero.eyebrow, live.monthLabel);
});

test("custom description overrides live intro only in custom mode", () => {
  const custom = resolveWorksPageCms({ schemaVersion: 1, hero: { descriptionSource: "custom", customDescription: "Owner 說明" } }, live);
  const monthly = resolveWorksPageCms({ schemaVersion: 1, hero: { descriptionSource: "monthly-menu", customDescription: "過期說明" } }, live);
  assert.equal(custom.hero.description, "Owner 說明");
  assert.equal(monthly.hero.description, live.intro);
});

test("all entrance motion is disabled while current card hover is retained", () => {
  const value = resolveWorksPageCms(undefined, live);
  for (const motion of [value.motion.hero, value.motion.catalogIntro, value.motion.productGrid]) {
    assert.equal(motion.enabled, false);
    assert.equal(motion.preset, "none");
    assert.equal(motion.staggerMs, 0);
  }
  assert.deepEqual(value.motion.cardHover, { enabled: true, preset: "current-scale", durationMs: 500 });
});

test("invalid optional values normalize to safe legacy fallback", () => {
  const value = resolveWorksPageCms({ schemaVersion: 1, colors: { pageBackground: "url(javascript:alert(1))" }, motion: { hero: { enabled: true, preset: "spin", delayMs: -1 } }, hero: { primaryCta: { link: "javascript:alert(1)" }, desktopMedia: { media: { type: "image", url: "javascript:alert(1)" }, alt: "x" } } }, live);
  assert.equal(value.colors.pageBackground, "#15110f");
  assert.equal(value.motion.hero.preset, "none");
  assert.equal(value.motion.hero.delayMs, 0);
  assert.equal(value.hero.primaryCta.link, "#catalog");
  assert.equal(value.hero.desktopMedia, undefined);
});

rejects("strict validation rejects an unsafe color", { schemaVersion: 1, colors: { pageBackground: "rgb(0,0,0)" } });
rejects("strict validation rejects an unknown motion preset", { schemaVersion: 1, motion: { hero: { preset: "spin" } } });
rejects("strict validation rejects an unsafe CTA link", { schemaVersion: 1, hero: { primaryCta: { link: "javascript:alert(1)" } } });
rejects("strict validation rejects malformed or unsafe media", { schemaVersion: 1, hero: { desktopMedia: { media: { type: "image", url: "javascript:alert(1)" }, alt: "圖片" } } });
rejects("strict validation rejects image media without alt text", { schemaVersion: 1, seo: { shareImage: { media: { type: "image", url: "/images/share.jpg" }, alt: "" } } });
rejects("strict validation rejects unknown commerce authority fields", { schemaVersion: 1, productSlugs: ["forbidden"] });

test("missing systemPages remains a valid PageStore", () => {
  const store: PageStore = { version: 7, updatedAt: "2026-09-01T00:00:00.000Z", pages: [] };
  assert.equal(validatePageStore(store), undefined);
});

test("existing PageStore fields survive validation without mutation", () => {
  const store: PageStore = { version: 8, updatedAt: "2026-09-01T00:00:00.000Z", pages: [], visualStyle: undefined };
  const before = JSON.stringify(store);
  validatePageStore(store);
  assert.equal(JSON.stringify(store), before);
});

test("optional valid systemPages.works validates without rewriting the store", () => {
  const store: PageStore = { version: 9, updatedAt: "2026-09-01T00:00:00.000Z", pages: [], systemPages: { works: { schemaVersion: 1, hero: { headlineLines: ["A", "B"] } } } };
  const before = structuredClone(store);
  validatePageStore(store);
  assert.deepEqual(store, before);
});

test("the complete canonical legacy default passes strict validation", () => {
  assert.equal(validateWorksPageCms(DEFAULT_WORKS_PAGE_CMS_CONFIG), true);
});

test("resolved config contains presentation only and no commerce authority", () => {
  const value = resolveWorksPageCms(undefined, live) as unknown as Record<string, unknown>;
  const serialized = JSON.stringify(value);
  for (const forbidden of ["productSlugs", "sku", "price", "inventory", "checkout", "shipping", "listAsset"]) assert.equal(serialized.includes(forbidden), false);
});

test("resolver is pure and does not mutate its inputs", () => {
  const config: WorksPageCmsConfig = { schemaVersion: 1, hero: { customEyebrow: "保留", headlineLines: ["一", "二"] } };
  const inputLive = { ...live };
  const beforeConfig = structuredClone(config);
  const beforeLive = structuredClone(inputLive);
  resolveWorksPageCms(config, inputLive);
  assert.deepEqual(config, beforeConfig);
  assert.deepEqual(inputLive, beforeLive);
});

console.log(`Phase J.1B Works CMS: ${passed} PASS`);
