import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  HOMEPAGE_MOTION_PRESETS,
  HOMEPAGE_SECTION_MOTION_DEFAULTS,
  PREMIUM_HERO_TIMING,
  homepageMotionCssVariables,
  orderedEnabledItems,
  primaryEnabledIndex,
  resolveHeroTiming,
  resolveHomepageMotion,
  resolveSectionMotion,
  validateHomepageCms,
// @ts-expect-error -- Node's type-stripping runtime needs the explicit TypeScript extension.
} from "../lib/homepageCms.ts";

const production = JSON.parse(await readFile(new URL("../public/data/homepage.json", import.meta.url), "utf8"));
const motionCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const motionRuntime = await readFile(new URL("../components/home/HomepageMotion.tsx", import.meta.url), "utf8");
assert.equal(validateHomepageCms(structuredClone(production)), true, "existing homepage must validate");
assert.match(motionCss, /is-home-motion-pending[^}]*opacity:0/u, "only pending descendants receive the hidden entrance state");
assert.match(motionCss, /is-home-motion-entered[^}]*opacity:1[^}]*transform:none/u, "entered state is permanently visible and neutral");
assert.doesNotMatch(motionCss, /\[data-home-motion\]:not\([^}]*\)\{opacity:0/u, "configured roots cannot remain matched by a classless hidden rule");
assert.match(motionRuntime, /classList\.remove\("is-home-motion-pending"\)[\s\S]*classList\.add\("is-home-motion-entered"\)/u, "reveal atomically replaces pending with entered");
assert.match(motionRuntime, /observer\?\.unobserve\(entry\.target\)/u, "entrance targets are unobserved after their first reveal");
assert.deepEqual(resolveHeroTiming(undefined), PREMIUM_HERO_TIMING, "legacy timing uses premium defaults");

const slower = { ...PREMIUM_HERO_TIMING, headlineLine2Start: 2200, leadStart: 2500, primaryCtaStart: 2900, secondaryCtaStart: 3100, trustStart: 3300 };
assert.deepEqual(resolveHeroTiming(slower), slower, "slower owner sequence stays intact");
for (const edge of [0, 100, 5000, 5100, 7500, 9900, 10000]) {
  const fixture = structuredClone(production);
  fixture.hero.timing = Object.fromEntries(Object.keys(PREMIUM_HERO_TIMING).map((key) => [key, edge]));
  assert.equal(validateHomepageCms(fixture), true, `timing edge ${edge} validates`);
}
for (const invalid of [-100, Number.NaN, 10100, "later"]) {
  const fixture = structuredClone(production);
  fixture.hero.timing = { ...PREMIUM_HERO_TIMING, trustStart: invalid };
  assert.throws(() => validateHomepageCms(fixture), /進場時間/u);
}
assert.deepEqual(resolveHeroTiming(undefined), PREMIUM_HERO_TIMING, "premium reset remains unchanged");
const unordered = structuredClone(production);
unordered.hero.timing = { ...PREMIUM_HERO_TIMING, leadStart: 9000, primaryCtaStart: 8000 };
assert.throws(() => validateHomepageCms(unordered), /順序/u, "invalid Hero order is rejected");

for (const count of [1, 3, 6, 8]) {
  const steps = Array.from({ length: count }, (_, index) => ({ id: `STEP-${index}`, enabled: true, order: index }));
  assert.equal(orderedEnabledItems(steps).length, count, `${count}-step collection remains variable`);
}

assert.deepEqual(resolveSectionMotion(undefined, "home005"), HOMEPAGE_SECTION_MOTION_DEFAULTS.home005, "missing motion uses canonical runtime fallback");
const oldFixture = structuredClone(production);
for (const key of ["campaignSection", "home002", "home003", "home004", "home005", "home006", "home007", "home008", "home009", "home010"]) delete oldFixture[key].motion;
assert.equal(validateHomepageCms(oldFixture), true, "old homepage data without motion remains valid");

for (const preset of HOMEPAGE_MOTION_PRESETS) {
  const fixture = structuredClone(production);
  fixture.home005.motion = { enabled: preset !== "none", preset, delayMs: 0, durationMs: 100, distancePx: 0, staggerMs: 0 };
  assert.equal(validateHomepageCms(fixture), true, `${preset} preset validates`);
}
const parityFixture = { enabled: true, preset: "slide-right", delayMs: 1000, durationMs: 1700, distancePx: 18, staggerMs: 500 } as const;
const ownerMotion = resolveHomepageMotion(parityFixture, "home002");
assert.deepEqual(ownerMotion, { ...parityFixture, activePreset: "slide-right", initialX: 18, initialY: 0, initialScale: 1 }, "owner slide-right semantics normalize once for Preview and Frontend");
assert.deepEqual(homepageMotionCssVariables(ownerMotion), { "--home-motion-delay": "1000ms", "--home-motion-duration": "1700ms", "--home-motion-distance": "18px", "--home-motion-stagger": "500ms", "--home-motion-initial-x": "18px", "--home-motion-initial-y": "0px", "--home-motion-initial-scale": "1" }, "shared CSS variables preserve timing units and direction");
const presetDirections = {
  none: [0, 0, 1], fade: [0, 0, 1], "fade-up": [0, 18, 1], "slide-left": [-18, 0, 1],
  "slide-right": [18, 0, 1], "scale-reveal": [0, 0, 0.97], editorial: [0, 12.6, 1],
} as const;
for (const preset of HOMEPAGE_MOTION_PRESETS) {
  const resolved = resolveHomepageMotion({ ...parityFixture, preset }, "home002");
  assert.deepEqual([resolved.initialX, resolved.initialY, resolved.initialScale], presetDirections[preset], `${preset} initial state follows the shared preset contract`);
}
for (const delayMs of [0, 1000, 5000, 7500, 10000]) {
  const resolved = resolveHomepageMotion({ ...parityFixture, delayMs }, "home002");
  assert.equal(homepageMotionCssVariables(resolved)["--home-motion-delay"], `${delayMs}ms`, `${delayMs}ms delay reaches both runtimes unchanged`);
}
for (const motion of [
  { enabled: false, preset: "editorial", delayMs: 0, durationMs: 100, distancePx: 0, staggerMs: 0 },
  { enabled: true, preset: "editorial", delayMs: 10000, durationMs: 5000, distancePx: 80, staggerMs: 2000 },
]) {
  const fixture = structuredClone(production); fixture.home002.motion = motion;
  assert.equal(validateHomepageCms(fixture), true, "motion range boundary validates");
}
for (const invalidMotion of [
  { enabled: true, preset: "bounce", delayMs: 0, durationMs: 800, distancePx: 20, staggerMs: 100 },
  { enabled: true, preset: "fade", delayMs: -100, durationMs: 800, distancePx: 20, staggerMs: 100 },
  { enabled: true, preset: "fade", delayMs: 0, durationMs: 0, distancePx: 20, staggerMs: 100 },
  { enabled: true, preset: "fade", delayMs: 0, durationMs: 800, distancePx: 81, staggerMs: 100 },
  { enabled: true, preset: "fade", delayMs: 0, durationMs: 800, distancePx: 20, staggerMs: 2100 },
]) {
  const fixture = structuredClone(production); fixture.home010.motion = invalidMotion;
  assert.throws(() => validateHomepageCms(fixture), /動畫|進場方式|安全範圍/u, "invalid motion is rejected");
}

const mixedMedia = Array.from({ length: 12 }, (_, index) => ({
  id: `MEDIA-${String(index).padStart(2, "0")}`,
  enabled: index !== 4,
  primary: index === 4,
  order: 11 - index,
  alt: `Studio ${index + 1}`,
  media: index % 3 === 0
    ? { type: "video", provider: "cloudinary", publicId: `fixture/video-${index}`, url: `https://example.com/${index}.mp4` }
    : index % 3 === 1
      ? { type: "youtube", videoId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
      : { type: "image", provider: "local", url: `/images/fixture-${index}.webp` },
}));
const largeFixture = structuredClone(production);
largeFixture.home008 = { ...largeFixture.home008, images: mixedMedia };
assert.equal(validateHomepageCms(largeFixture), true, "12-item mixed Studio collection validates");
const visible = orderedEnabledItems(mixedMedia);
assert.equal(visible.length, 11, "hidden Studio media is filtered");
assert.equal(visible[0].order, 0, "Studio media order is honored");
assert.equal(primaryEnabledIndex(visible), 0, "disabled primary falls back to first enabled media");

const nestedFixture = structuredClone(production);
nestedFixture.home005.steps[0].mediaItems = [];
nestedFixture.home005.steps[1].mediaItems = mixedMedia.slice(0, 3).map((item, index) => ({ ...item, id: `NESTED-${index}`, primary: index === 0, enabled: true }));
assert.equal(validateHomepageCms(nestedFixture), true, "HOME005 accepts zero and multiple media");
const singleMediaFixture = structuredClone(production);
singleMediaFixture.home005.steps[0].mediaItems = [{ id: "SINGLE-MEDIA", enabled: true, primary: true, order: 0, alt: "Single fixture", media: { type: "image", provider: "local", url: "/images/single-fixture.webp" } }];
assert.equal(validateHomepageCms(singleMediaFixture), true, "HOME005 accepts one media");

console.log("Homepage CMS fixture assertions: PASS");
