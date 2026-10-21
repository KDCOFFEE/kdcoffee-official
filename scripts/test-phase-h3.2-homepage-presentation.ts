import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// @ts-expect-error -- the Node regression runner needs explicit TypeScript extensions.
import { HOMEPAGE_MOTION_PRESETS, HOMEPAGE_SECTION_KEYS, validateHomepageCms, validateHomepagePresentation } from "../lib/homepageCms.ts";
// @ts-expect-error -- the Node regression runner needs explicit TypeScript extensions.
import { HOMEPAGE_BACKGROUND_MODES, HOMEPAGE_PRESENTATION_NUMBER_RULES, HOMEPAGE_PRESENTATION_PRESETS, HOMEPAGE_PRESENTATION_SECTION_KEYS, HOMEPAGE_TEXT_SLOTS, resolveHomepageSectionPresentation } from "../lib/homepagePresentation.ts";
import type { HomepagePresentationPatch, HomepagePresentationV3, HomepageSectionPresentation } from "../lib/homepagePresentation.ts";

let passed = 0;
function check(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`PASS ${name}`);
}
function config(section: HomepageSectionPresentation = {}): HomepagePresentationV3 {
  return { schemaVersion: 3, sections: { home002: section } };
}
function deepFreeze(value: object) {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object") deepFreeze(child);
  }
  Object.freeze(value);
}
const homepagePath = new URL("../public/data/homepage.json", import.meta.url);
const seedPath = new URL("../bootstrap/store/homepage.json", import.meta.url);
const homepageBefore = await readFile(homepagePath, "utf8");
const seedBefore = await readFile(seedPath, "utf8");
const legacy = JSON.parse(homepageBefore);
const legacySnapshot = structuredClone(legacy);

const base: HomepagePresentationPatch = {
  text: {
    title: { fontSizePx: 48, fontWeight: "semibold", alignment: "center", lineHeight: 1.2, maxWidthCh: 60, letterSpacingEm: 0, color: "coffee" },
    body: { fontSizePx: 16, color: "ink" },
  },
  layout: { contentMaxWidthPx: 1200, paddingTopPx: 100, paddingBottomPx: 80 },
  background: { mode: "color", color: "ivory" },
  visible: false,
  animation: { enabled: true, preset: "fade-up", durationMs: 800, delayMs: 200, distancePx: 18, staggerMs: 100 },
};
const overrides: HomepagePresentationPatch = {
  text: { title: { fontSizePx: 30, alignment: "left" }, closing: { fontSizePx: 18 } },
  layout: { paddingTopPx: 0 },
  background: { mode: "none" },
  visible: true,
  animation: { durationMs: 500 },
};
const desktop = resolveHomepageSectionPresentation(config({ base }), "home002", "desktop");
const mobileConfig = config({ base, mobile: { overrideEnabled: true, overrides } });
const mobile = resolveHomepageSectionPresentation(mobileConfig, "home002", "mobile");

check("legacy homepage without presentation validates", () => assert.equal(validateHomepageCms(legacy), true));
check("absent presentation produces no desktop or mobile bindings", () => {
  assert.deepEqual(resolveHomepageSectionPresentation(undefined, "home002", "desktop"), {});
  assert.deepEqual(resolveHomepageSectionPresentation(undefined, "home002", "mobile"), {});
});
check("legacy validation and resolution do not mutate homepage data", () => assert.deepEqual(legacy, legacySnapshot));
check("desktop resolves Base typography", () => assert.deepEqual(desktop.text, base.text));
check("desktop resolves Base layout", () => assert.deepEqual(desktop.layout, base.layout));
check("desktop resolves Base background", () => assert.deepEqual(desktop.background, base.background));
check("desktop preserves false visibility", () => assert.equal(desktop.visible, false));
check("desktop preserves permitted zero values", () => {
  const zeros: HomepagePresentationPatch = { text: { body: { letterSpacingEm: 0 } }, layout: { paddingTopPx: 0, paddingBottomPx: 0 }, animation: { delayMs: 0, distancePx: 0, staggerMs: 0 } };
  validateHomepagePresentation(config({ base: zeros }));
  assert.deepEqual(resolveHomepageSectionPresentation(config({ base: zeros }), "home002", "desktop"), zeros);
});
check("disabled Mobile ignores stored overrides completely", () => {
  const disabled = config({ base, mobile: { overrideEnabled: false, overrides } });
  validateHomepagePresentation(disabled);
  assert.deepEqual(resolveHomepageSectionPresentation(disabled, "home002", "mobile"), desktop);
});
check("enabled Mobile applies sparse typography", () => {
  assert.equal(mobile.text?.title?.fontSizePx, 30);
  assert.equal(mobile.text?.title?.alignment, "left");
});
check("unset Mobile leaves inherit Base", () => {
  assert.equal(mobile.text?.title?.maxWidthCh, 60);
  assert.equal(mobile.layout?.paddingBottomPx, 80);
  assert.deepEqual(mobile.text?.body, base.text?.body);
});
check("nested text slots merge at leaf level and may add a slot", () => {
  assert.deepEqual(mobile.text?.title, { ...base.text?.title, fontSizePx: 30, alignment: "left" });
  assert.deepEqual(mobile.text?.closing, { fontSizePx: 18 });
});
check("nested animation merges at leaf level without filling defaults", () => {
  assert.deepEqual(mobile.animation, { ...base.animation, durationMs: 500 });
  const sparse = config({ base: { animation: { delayMs: 0 } } });
  assert.deepEqual(resolveHomepageSectionPresentation(sparse, "home002", "mobile"), { animation: { delayMs: 0 } });
});
check("layout and background deep merge preserve inherited leaves", () => {
  assert.deepEqual(mobile.layout, { contentMaxWidthPx: 1200, paddingTopPx: 0, paddingBottomPx: 80 });
  assert.deepEqual(mobile.background, { mode: "none", color: "ivory" });
});
check("Mobile false visibility and animation enabled survive merge", () => {
  const value = config({ base: { visible: true, animation: { enabled: true } }, mobile: { overrideEnabled: true, overrides: { visible: false, animation: { enabled: false } } } });
  validateHomepagePresentation(value);
  assert.deepEqual(resolveHomepageSectionPresentation(value, "home002", "mobile"), { visible: false, animation: { enabled: false } });
});
check("Mobile zero spacing, tracking and animation leaves survive merge", () => {
  const patch: HomepagePresentationPatch = { layout: { paddingTopPx: 0, paddingBottomPx: 0 }, text: { title: { letterSpacingEm: 0 } }, animation: { delayMs: 0, distancePx: 0, staggerMs: 0 } };
  const value = config({ base, mobile: { overrideEnabled: true, overrides: patch } });
  validateHomepagePresentation(value);
  const result = resolveHomepageSectionPresentation(value, "home002", "mobile");
  assert.equal(result.layout?.paddingTopPx, 0);
  assert.equal(result.layout?.paddingBottomPx, 0);
  assert.equal(result.text?.title?.letterSpacingEm, 0);
  assert.deepEqual(result.animation, { ...base.animation, delayMs: 0, distancePx: 0, staggerMs: 0 });
});
check("undefined nested Mobile leaves inherit instead of erasing Base", () => {
  const value = config({ base, mobile: { overrideEnabled: true, overrides: { text: { title: { fontSizePx: undefined }, body: undefined }, layout: { paddingTopPx: undefined }, background: { color: undefined }, animation: { enabled: undefined }, visible: undefined } } });
  validateHomepagePresentation(value);
  assert.deepEqual(resolveHomepageSectionPresentation(value, "home002", "mobile"), desktop);
});
check("resolution and validation accept frozen input without mutation", () => {
  const value = structuredClone(mobileConfig);
  const before = structuredClone(value);
  deepFreeze(value);
  validateHomepagePresentation(value);
  resolveHomepageSectionPresentation(value, "home002", "desktop");
  resolveHomepageSectionPresentation(value, "home002", "mobile");
  assert.deepEqual(value, before);
});
check("returned nested objects do not alias input or other results", () => {
  const value = structuredClone(mobileConfig);
  const before = structuredClone(value);
  const first = resolveHomepageSectionPresentation(value, "home002", "mobile");
  first.text!.title!.fontSizePx = 60;
  first.layout!.paddingTopPx = 200;
  first.background!.color = "gold";
  first.animation!.durationMs = 1000;
  first.text!.body!.color = "white";
  assert.deepEqual(value, before);
  assert.deepEqual(resolveHomepageSectionPresentation(value, "home002", "mobile"), mobile);
});
check("schemaVersion 3 and CMS integration pass without rewriting file version", () => {
  validateHomepagePresentation(mobileConfig);
  const value = { ...legacy, presentation: structuredClone(mobileConfig) };
  const before = structuredClone(value);
  assert.equal(validateHomepageCms(value), true);
  assert.deepEqual(value, before);
});
check("wrong or missing schemaVersion fails", () => {
  for (const version of [undefined, 1, 2, 4, "3", null, true]) assert.throws(() => validateHomepagePresentation({ schemaVersion: version }), /schemaVersion/u);
});
check("unknown section identifiers fail", () => {
  for (const key of ["home001", "top", "monthly-campaign", "home011", "store"]) assert.throws(() => validateHomepagePresentation({ schemaVersion: 3, sections: { [key]: {} } }), /不支援/u);
});
check("unknown text slots including selectors and DOM paths fail", () => {
  for (const slot of ["h2", ".v3-why-closing", "text.title", "custom"]) assert.throws(() => validateHomepagePresentation(config({ base: { text: { [slot]: {} } } })), /不支援/u);
});
check("invalid alignment fails", () => {
  assert.throws(() => validateHomepagePresentation({ schemaVersion: 3, sections: { hero: { base: { text: { title: { alignment: "justify" } } } } } }), /alignment/u);
});
check("colors use existing named tokens or six-digit HEX only", () => {
  for (const color of ["ink", "coffee", "warm-gray", "ivory", "gold", "white", "#Aa12EF"]) {
    const value = { schemaVersion: 3, sections: { home002: { base: { text: { title: { color } }, background: { color } } } } };
    const before = structuredClone(value);
    validateHomepagePresentation(value);
    assert.deepEqual(value, before);
  }
  for (const color of ["red", "INK", "#fff", "#12345g", "url(x)", "linear-gradient(red,blue)", null, 123]) {
    assert.throws(() => validateHomepagePresentation({ schemaVersion: 3, sections: { home002: { base: { text: { body: { color } } } } } }), /顏色/u);
    assert.throws(() => validateHomepagePresentation({ schemaVersion: 3, sections: { home002: { base: { background: { color } } } } }), /顏色/u);
  }
});
const textNumbers = new Set(["fontSizePx", "lineHeight", "letterSpacingEm", "maxWidthCh"]);
const layoutNumbers = new Set(["contentMaxWidthPx", "paddingTopPx", "paddingBottomPx"]);
function numericConfig(key: string, value: unknown, asMobile = false) {
  const patch = textNumbers.has(key) ? { text: { title: { [key]: value } } }
    : layoutNumbers.has(key) ? { layout: { [key]: value } } : { animation: { [key]: value } };
  return { schemaVersion: 3, sections: { home002: asMobile ? { mobile: { overrideEnabled: true, overrides: patch } } : { base: patch } } };
}
for (const [key, rule] of Object.entries(HOMEPAGE_PRESENTATION_NUMBER_RULES)) {
  check(`numeric safety: ${key} bounds, primitives, finite values and step`, () => {
    for (const asMobile of [false, true]) {
      for (const value of [rule.min, rule.max]) validateHomepagePresentation(numericConfig(key, value, asMobile));
      for (const value of [rule.min - 1, rule.max + 1, NaN, Infinity, -Infinity, "12", null, true]) {
        assert.throws(() => validateHomepagePresentation(numericConfig(key, value, asMobile)), /安全範圍/u);
      }
      if ("step" in rule) assert.throws(() => validateHomepagePresentation(numericConfig(key, rule.min + rule.step / 2, asMobile)), /安全範圍/u);
    }
  });
}
check("Mobile overrideEnabled is required and must be boolean", () => {
  for (const value of [undefined, null, 0, 1, "false", {}]) assert.throws(() => validateHomepagePresentation({ schemaVersion: 3, sections: { home002: { mobile: { overrideEnabled: value } } } }), /overrideEnabled/u);
});
check("unknown nested keys, media and CSS escape hatches fail", () => {
  const bad = [
    { schemaVersion: 3, css: "x" },
    { schemaVersion: 3, sections: { home002: { enabled: true } } },
    { schemaVersion: 3, sections: { home002: { mobile: { overrideEnabled: true, enabled: true } } } },
    { schemaVersion: 3, sections: { home002: { base: { media: {} } } } },
    { schemaVersion: 3, sections: { home002: { base: { text: { title: { className: "x" } } } } } },
    { schemaVersion: 3, sections: { home002: { base: { layout: { marginTopPx: 1 } } } } },
    { schemaVersion: 3, sections: { home002: { base: { background: { image: "/x.png" } } } } },
    { schemaVersion: 3, sections: { home002: { base: { animation: { effect: "fade" } } } } },
    { schemaVersion: 3, sections: { home002: { mobile: { overrideEnabled: false, overrides: { rawCss: "x" } } } } },
    JSON.parse('{"schemaVersion":3,"sections":{"home002":{"base":{"text":{"__proto__":{}}}}}}'),
  ];
  for (const value of bad) {
    assert.throws(() => validateHomepagePresentation(value), /不支援/u);
    assert.throws(() => validateHomepageCms({ ...legacy, presentation: value }), /不支援/u);
  }
});
check("null, arrays and non-object structures are rejected at every object boundary", () => {
  for (const bad of [null, [], "x", 1, true, new Date()]) {
    for (const value of [bad, { schemaVersion: 3, sections: bad }, { schemaVersion: 3, sections: { home002: bad } }, { schemaVersion: 3, sections: { home002: { base: bad } } }, { schemaVersion: 3, sections: { home002: { mobile: bad } } }]) {
      assert.throws(() => validateHomepagePresentation(value), /格式/u);
    }
    for (const key of ["text", "layout", "background", "animation"]) assert.throws(() => validateHomepagePresentation({ schemaVersion: 3, sections: { home002: { base: { [key]: bad } } } }), /格式/u);
    assert.throws(() => validateHomepagePresentation({ schemaVersion: 3, sections: { home002: { base: { text: { title: bad } } } } }), /格式/u);
    assert.throws(() => validateHomepagePresentation({ schemaVersion: 3, sections: { home002: { mobile: { overrideEnabled: true, overrides: bad } } } }), /格式/u);
  }
});
check("invalid visibility, weight, background and animation primitives fail", () => {
  for (const value of ["false", 0, null, {}]) {
    assert.throws(() => validateHomepagePresentation({ schemaVersion: 3, sections: { home002: { base: { visible: value } } } }), /visible/u);
    assert.throws(() => validateHomepagePresentation({ schemaVersion: 3, sections: { home002: { base: { animation: { enabled: value } } } } }), /enabled/u);
  }
  for (const patch of [{ text: { title: { fontWeight: 700 } } }, { background: { mode: "gradient" } }, { animation: { preset: "bounce" } }]) assert.throws(() => validateHomepagePresentation({ schemaVersion: 3, sections: { home002: { base: patch } } }), /不支援/u);
  assert.throws(() => validateHomepagePresentation({ schemaVersion: 3, sections: { home002: { preset: "freeform" } } }), /不支援/u);
});
check("all supported section keys, text slots and canonical animation presets validate", () => {
  // Ordering now includes Campaign; presentation membership remains unique and order-independent.
  assert.equal(new Set(HOMEPAGE_PRESENTATION_SECTION_KEYS).size, HOMEPAGE_PRESENTATION_SECTION_KEYS.length);
  assert.deepEqual([...HOMEPAGE_PRESENTATION_SECTION_KEYS].sort(), ["hero", ...HOMEPAGE_SECTION_KEYS].sort());
  for (const section of HOMEPAGE_PRESENTATION_SECTION_KEYS) {
    const value: HomepagePresentationV3 = { schemaVersion: 3, sections: { [section]: { base: { visible: false } } } };
    validateHomepagePresentation(value);
    assert.deepEqual(resolveHomepageSectionPresentation(value, section, "desktop"), { visible: false });
  }
  for (const slot of HOMEPAGE_TEXT_SLOTS) validateHomepagePresentation(config({ base: { text: { [slot]: { fontSizePx: 16 } } } }));
  for (const preset of HOMEPAGE_MOTION_PRESETS) validateHomepagePresentation(config({ base: { animation: { preset } } }));
  for (const mode of HOMEPAGE_BACKGROUND_MODES) validateHomepagePresentation(config({ base: { background: { mode } } }));
  for (const weight of ["light", "regular", "semibold", "bold"]) validateHomepagePresentation({ schemaVersion: 3, sections: { hero: { base: { text: { title: { fontWeight: weight } } } } } });
  for (const alignment of ["left", "center", "right"]) validateHomepagePresentation({ schemaVersion: 3, sections: { hero: { base: { text: { title: { alignment } } } } } });
});
check("presets remain metadata and do not generate presentation leaves", () => {
  for (const preset of HOMEPAGE_PRESENTATION_PRESETS) {
    const value = config({ preset });
    validateHomepagePresentation(value);
    assert.deepEqual(resolveHomepageSectionPresentation(value, "home002", "desktop"), { preset });
    assert.deepEqual(resolveHomepageSectionPresentation(value, "home002", "mobile"), { preset });
  }
});
check("empty or unconfigured sections produce no synthetic defaults", () => {
  for (const value of [{ schemaVersion: 3 }, { schemaVersion: 3, sections: {} }, config(), config({ base: { text: { title: {} }, layout: {}, background: {}, animation: {} } })] satisfies HomepagePresentationV3[]) {
    validateHomepagePresentation(value);
    assert.deepEqual(resolveHomepageSectionPresentation(value, "home002", "desktop"), {});
    assert.deepEqual(resolveHomepageSectionPresentation(value, "home002", "mobile"), {});
  }
});
check("Mobile-only overrides do not leak into Desktop", () => {
  const value = config({ mobile: { overrideEnabled: true, overrides: { text: { title: { fontSizePx: 30 } } } } });
  validateHomepagePresentation(value);
  assert.deepEqual(resolveHomepageSectionPresentation(value, "home002", "desktop"), {});
  assert.deepEqual(resolveHomepageSectionPresentation(value, "home002", "mobile"), { text: { title: { fontSizePx: 30 } } });
});
check("enabling Mobile without override leaves simply inherits Base", () => {
  assert.deepEqual(resolveHomepageSectionPresentation(config({ base, mobile: { overrideEnabled: true } }), "home002", "mobile"), desktop);
});
check("master section disable remains independent of resolved visibility", () => {
  const value = { ...legacy, home002: { ...legacy.home002, enabled: false }, presentation: mobileConfig };
  const before = structuredClone(value);
  assert.equal(validateHomepageCms(value), true);
  const result = resolveHomepageSectionPresentation(value.presentation, "home002", "mobile");
  const passesMasterGate = value.home002.enabled !== false && result.visible !== false;
  assert.equal(result.visible, true);
  assert.equal(passesMasterGate, false, "future rendering must AND the existing master gate");
  assert.deepEqual(value, before);
});
assert.equal(await readFile(homepagePath, "utf8"), homepageBefore);
assert.equal(await readFile(seedPath, "utf8"), seedBefore);
console.log(`H3.2 Homepage presentation foundation: ${passed} checks PASS; homepage and bootstrap JSON byte-identical.`);
