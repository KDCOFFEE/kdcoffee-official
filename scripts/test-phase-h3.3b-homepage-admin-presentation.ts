import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { updateHomepageBasePresentation, type HomepageBasePresentationEdit } from "../lib/homepagePresentationAdmin.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { HOMEPAGE_PRESENTATION_SECTION_KEYS, HOMEPAGE_SECTION_CAPABILITIES, HOMEPAGE_PRESENTATION_NUMBER_RULES } from "../lib/homepagePresentation.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { validateHomepageCms } from "../lib/homepageCms.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { VISUAL_COLOR_PRESETS, VISUAL_WEIGHT_PRESETS, VISUAL_ALIGNMENT_PRESETS } from "../lib/pageBuilderVisualStyle.ts";
import type { HomepageData } from "../data/homepageData";
import type { HomepagePresentationKey, HomepagePresentationV3, HomepageTextSlot } from "../lib/homepagePresentation.ts";

const stored = await readFile(new URL("../public/data/homepage.json", import.meta.url), "utf8");
const seed = await readFile(new URL("../bootstrap/store/homepage.json", import.meta.url), "utf8");
const fixture = (): HomepageData => JSON.parse(stored);
const textEdit = (field: "fontSizePx" | "fontWeight" | "color" | "lineHeight" | "letterSpacingEm" | "alignment" | "maxWidthCh", value: unknown, slot: HomepageTextSlot = "title"): HomepageBasePresentationEdit => ({ group: "text", slot, field, value });
const edit = (data: HomepageData, change: HomepageBasePresentationEdit, key: HomepagePresentationKey = "home002") => updateHomepageBasePresentation(data, key, change);
const base = (data: HomepageData) => data.presentation?.sections?.home002?.base;
let passed = 0;
function check(name: string, run: () => void) { run(); passed += 1; console.log(`PASS ${name}`); }

check("legacy input is valid and has no presentation", () => { assert.equal(validateHomepageCms(fixture()), true); assert.equal(fixture().presentation, undefined); });
check("unrelated content edit does not create presentation", () => { const data = fixture(); data.home002!.title = "內容編輯"; assert.equal(data.presentation, undefined); assert.equal(validateHomepageCms(data), true); });
check("resetting an unset field is an identity no-op", () => { const data = fixture(); assert.equal(edit(data, textEdit("fontSizePx", undefined)), data); });
check("first edit creates schemaVersion 3 and only one exact leaf", () => {
  const data = fixture(); const before = structuredClone(data); const next = edit(data, textEdit("fontSizePx", 48));
  assert.deepEqual(next.presentation, { schemaVersion: 3, sections: { home002: { base: { text: { title: { fontSizePx: 48 } } } } } });
  assert.deepEqual(data, before); assert.equal(validateHomepageCms(next), true);
});
check("one section edit creates no other section", () => { assert.deepEqual(Object.keys(edit(fixture(), textEdit("fontSizePx", 48)).presentation!.sections!), ["home002"]); });
check("one slot edit creates no other slot", () => { assert.deepEqual(Object.keys(base(edit(fixture(), textEdit("fontSizePx", 48)))!.text!), ["title"]); });
check("false visibility survives mutation and JSON serialization", () => { const next = edit(fixture(), { group: "visible", value: false }); assert.equal(base(JSON.parse(JSON.stringify(next)))?.visible, false); });
check("true visibility never edits the master enabled flag", () => { const data = fixture(); data.home002!.enabled = false; const next = edit(data, { group: "visible", value: true }); assert.equal(next.home002!.enabled, false); assert.equal(base(next)?.visible, true); });
for (const field of ["paddingTopPx", "paddingBottomPx"] as const) check(`${field}: explicit zero survives JSON`, () => { const next = edit(fixture(), { group: "layout", field, value: 0 }); assert.equal(base(JSON.parse(JSON.stringify(next)))?.layout?.[field], 0); });
check("zero tracking survives", () => { assert.equal(base(edit(fixture(), textEdit("letterSpacingEm", 0)))?.text?.title?.letterSpacingEm, 0); });
check("reset removes only its leaf, preserving a neighboring value", () => {
  let data = edit(fixture(), textEdit("fontSizePx", 48)); data = edit(data, textEdit("fontWeight", "bold")); data = edit(data, textEdit("fontSizePx", undefined));
  assert.deepEqual(base(data)?.text?.title, { fontWeight: "bold" });
});
check("empty slot is pruned while a different slot survives", () => {
  let data = edit(fixture(), textEdit("fontSizePx", 48)); data = edit(data, textEdit("color", "gold", "closing")); data = edit(data, textEdit("fontSizePx", undefined));
  assert.deepEqual(base(data)?.text, { closing: { color: "gold" } });
});
check("empty text object is pruned while layout survives", () => {
  let data = edit(fixture(), textEdit("fontSizePx", 48)); data = edit(data, { group: "layout", field: "paddingTopPx", value: 0 }); data = edit(data, textEdit("fontSizePx", undefined));
  assert.deepEqual(base(data), { layout: { paddingTopPx: 0 } });
});
check("empty Base is pruned while existing section metadata survives", () => {
  const data = fixture(); data.presentation = { schemaVersion: 3, sections: { home002: { preset: "editorial", base: { visible: false } } } };
  const next = edit(data, { group: "visible", value: undefined }); assert.deepEqual(next.presentation?.sections?.home002, { preset: "editorial" });
});
check("empty section is pruned while a different section survives", () => {
  let data = edit(fixture(), textEdit("fontSizePx", 48)); data = edit(data, { group: "visible", value: false }, "hero"); data = edit(data, textEdit("fontSizePx", undefined));
  assert.deepEqual(nextSections(data), { hero: { base: { visible: false } } });
});
function nextSections(data: HomepageData) { return data.presentation?.sections; }
check("last reset removes the entire presentation root without null/undefined properties", () => {
  const data = edit(edit(fixture(), textEdit("fontSizePx", 48)), textEdit("fontSizePx", undefined));
  assert.ok(!Object.hasOwn(data, "presentation")); assert.deepEqual(data, fixture()); assert.ok(!JSON.stringify(data).includes('"presentation"'));
});
check("existing empty root can be removed by reset without affecting content", () => {
  const data = fixture(); data.presentation = { schemaVersion: 3, sections: {} }; assert.deepEqual(edit(data, textEdit("fontSizePx", undefined)), fixture());
});
check("unrelated Presentation values, presets, Mobile and animation are preserved", () => {
  const data = fixture(); data.presentation = { schemaVersion: 3, sections: { home002: { preset: "editorial", base: { animation: { enabled: false }, text: { closing: { color: "gold" } } }, mobile: { overrideEnabled: true, overrides: { visible: true } } }, hero: { base: { visible: false } } } };
  const before = structuredClone(data); const next = edit(data, textEdit("fontSizePx", 48));
  const expected = structuredClone(before); expected.presentation!.sections!.home002!.base!.text!.title = { fontSizePx: 48 };
  assert.deepEqual(next, expected); assert.deepEqual(data, before);
});
check("all existing Homepage content survives edits", () => {
  const data = fixture(); const next = edit(data, textEdit("color", "gold")); const { presentation: _, ...content } = next;
  assert.deepEqual(content, data);
});
check("H3.1 closing text, empty string and disabled values survive edits/reset", () => {
  const data = fixture(); data.home002!.closingText = ""; data.home002!.closingEnabled = false;
  const next = edit(edit(data, textEdit("color", "gold", "closing")), textEdit("color", undefined, "closing"));
  assert.deepEqual(next, data);
});
check("frozen input and neighboring nodes are never mutated", () => {
  const data = fixture(); Object.freeze(data.home002); Object.freeze(data);
  assert.equal(edit(data, textEdit("fontSizePx", 48)).home002, data.home002);
});
for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) check(`${key}: canonical slots bind without creating Mobile/defaults`, () => {
  const slot = HOMEPAGE_SECTION_CAPABILITIES[key][0]; const next = edit(fixture(), textEdit("fontSizePx", 48, slot), key);
  assert.deepEqual(Object.keys(next.presentation!.sections!), [key]);
  assert.deepEqual(Object.keys(next.presentation!.sections![key]!), ["base"]);
  assert.equal(validateHomepageCms(next), true);
});
check("unsupported slot and HOME004 price/availability are rejected", () => {
  assert.throws(() => edit(fixture(), textEdit("fontSizePx", 48, "closing"), "home008"), /不支援/u);
  for (const slot of ["price", "availability", "metadata", "h2", ".card"]) assert.throws(() => edit(fixture(), { group: "text", slot, field: "fontSizePx", value: 48 } as HomepageBasePresentationEdit, "home004"), /不支援/u);
});
check("unknown sections/fields and prototype paths are rejected", () => {
  assert.throws(() => edit(fixture(), textEdit("fontSizePx", 48), "__proto__" as HomepagePresentationKey), /不支援/u);
  for (const field of ["__proto__", "constructor", "css", "animation", "mobile"]) assert.throws(() => edit(fixture(), { group: "text", slot: "title", field, value: 48 } as HomepageBasePresentationEdit), /不支援/u);
});
for (const field of ["fontSizePx", "lineHeight", "letterSpacingEm", "maxWidthCh", "contentMaxWidthPx", "paddingTopPx", "paddingBottomPx"] as const) {
  const rule = HOMEPAGE_PRESENTATION_NUMBER_RULES[field];
  const numericEdit = (value: unknown): HomepageBasePresentationEdit => field === "contentMaxWidthPx" || field === "paddingTopPx" || field === "paddingBottomPx" ? { group: "layout", field, value } : textEdit(field, value);
  check(`${field}: schema bounds and reset`, () => {
    for (const value of [rule.min, rule.max]) { const data = edit(fixture(), numericEdit(value)); assert.equal(validateHomepageCms(data), true); assert.deepEqual(edit(data, numericEdit(undefined)), fixture()); }
  });
  check(`${field}: invalid primitives, non-finite and out-of-range input fail`, () => {
    for (const value of [rule.min - 1, rule.max + 1, NaN, Infinity, "48", null, false, {}, []]) assert.throws(() => edit(fixture(), numericEdit(value)));
    if ("step" in rule) assert.throws(() => edit(fixture(), numericEdit(rule.min + 0.5)));
  });
}
for (const weight of VISUAL_WEIGHT_PRESETS) check(`weight ${weight}: stores exact enum and resets`, () => { const next = edit(fixture(), textEdit("fontWeight", weight)); assert.equal(base(next)?.text?.title?.fontWeight, weight); assert.deepEqual(edit(next, textEdit("fontWeight", undefined)), fixture()); });
for (const alignment of VISUAL_ALIGNMENT_PRESETS) check(`alignment ${alignment}: stores exact enum and resets`, () => { const next = edit(fixture(), textEdit("alignment", alignment)); assert.equal(base(next)?.text?.title?.alignment, alignment); assert.deepEqual(edit(next, textEdit("alignment", undefined)), fixture()); });
for (const color of [...VISUAL_COLOR_PRESETS, "#Aa12EF"]) check(`color ${color}: safe schema value and reset`, () => { const next = edit(fixture(), textEdit("color", color)); assert.equal(base(next)?.text?.title?.color, color); assert.deepEqual(edit(next, textEdit("color", undefined)), fixture()); });
check("unsafe typography enums/colors and empty numeric strings fail", () => {
  for (const [field, value] of [["fontWeight", "900"], ["alignment", "justify"], ["color", "red"], ["color", "url(x)"], ["color", "#fff"], ["fontSizePx", ""]] as const) assert.throws(() => edit(fixture(), textEdit(field, value)));
});
check("background none has no fabricated color", () => { assert.deepEqual(base(edit(fixture(), { group: "background", value: { mode: "none" } }))?.background, { mode: "none" }); });
check("background color is atomic and requires a safe color", () => {
  const next = edit(fixture(), { group: "background", value: { mode: "color", color: "gold" } }); assert.deepEqual(base(next)?.background, { mode: "color", color: "gold" });
  assert.throws(() => edit(fixture(), { group: "background", value: { mode: "color" } }), /背景顏色/u);
  assert.throws(() => edit(fixture(), { group: "background", value: { mode: "color", color: "url(x)" } } as unknown as HomepageBasePresentationEdit));
});
check("background inherit deletes the whole override and root", () => { const next = edit(fixture(), { group: "background", value: { mode: "color", color: "gold" } }); assert.deepEqual(edit(next, { group: "background", value: { mode: "legacy" } }), fixture()); });
check("background reset clears previous color; none/color switch remains sparse", () => {
  let data = edit(fixture(), { group: "background", value: { mode: "color", color: "gold" } }); data = edit(data, { group: "background", value: { mode: "none" } });
  assert.deepEqual(base(data)?.background, { mode: "none" }); assert.deepEqual(edit(data, { group: "background", value: undefined }), fixture());
});
check("visibility inherit deletes the leaf and prunes the root", () => { assert.deepEqual(edit(edit(fixture(), { group: "visible", value: false }), { group: "visible", value: undefined }), fixture()); });

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, jsx: { runtime: "automatic" }, fsCache: false });
type ProviderProps = { presentation?: HomepagePresentationV3; onEdit: (key: HomepagePresentationKey, edit: HomepageBasePresentationEdit) => void; onValidityChange: (invalid: boolean) => void; children: ReactNode };
const ui = await jiti.import<{ HomepagePresentationProvider: ComponentType<ProviderProps>; HomepagePresentationEditor: ComponentType<{ sectionKey: HomepagePresentationKey }>; HOMEPAGE_TEXT_SLOT_LABELS: Record<HomepageTextSlot, string> }>(path.join(process.cwd(), "components/admin/HomepagePresentationEditor.tsx"));
let edits = 0;
const render = (key: HomepagePresentationKey, presentation?: HomepagePresentationV3) => renderToStaticMarkup(createElement(ui.HomepagePresentationProvider, { presentation, onEdit: () => { edits += 1; }, onValidityChange: () => undefined, children: createElement(ui.HomepagePresentationEditor, { sectionKey: key }) }));
for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) check(`${key}: UI offers exactly canonical slots with Chinese labels`, () => {
  const html = render(key); const summaries = [...html.matchAll(/<summary style="cursor:pointer"><strong>([^<]+)<\/strong>/gu)].map((match) => match[1]);
  assert.deepEqual(summaries, HOMEPAGE_SECTION_CAPABILITIES[key].map((slot) => ui.HOMEPAGE_TEXT_SLOT_LABELS[slot]));
  assert.ok(!/<details[^>]*\sopen(?:[=>\s])/u.test(html));
  const visibleText = html.replace(/<[^>]*>/gu, "");
  for (const raw of ["cardBody", "cardTitle", "fontSizePx", "maxWidthCh", "paddingTopPx", "schemaVersion"]) assert.ok(!visibleText.includes(raw));
});
check("rendering/opening controls does not invoke edits or initialize presentation", () => { const data = fixture(); const before = JSON.stringify(data); render("home002", data.presentation); assert.equal(edits, 0); assert.equal(JSON.stringify(data), before); });
check("HOME002 closing is offered; HOME004 price/availability are absent", () => { assert.ok(render("home002").includes("結尾文字")); assert.ok(!render("home004").includes("結尾文字")); assert.doesNotMatch(render("home004"), /price|availability/u); });
check("explicit values and inheritance are distinguished without computed defaults", () => { const html = render("home002", edit(fixture(), textEdit("fontSizePx", 48)).presentation); assert.match(html, /value="48"/u); assert.match(html, /已設定：48 px/u); assert.match(render("home002"), /placeholder="沿用目前設計"/u); });
for (const field of ["fontSizePx", "lineHeight", "letterSpacingEm", "maxWidthCh", "contentMaxWidthPx", "paddingTopPx", "paddingBottomPx"] as const) check(`${field}: UI uses canonical numeric bounds`, () => {
  const rule = HOMEPAGE_PRESENTATION_NUMBER_RULES[field]; const html = render("home002");
  assert.ok(html.includes(`type="number" min="${rule.min}" max="${rule.max}" step="${"step" in rule ? rule.step : "any"}"`));
});
check("all fields have owner labels and inherit/reset paths", () => {
  const html = render("home002"); for (const label of ["字級", "字重", "文字顏色", "對齊", "行高", "字距", "最大文字寬度", "內容最大寬度", "上方留白", "下方留白", "背景", "共用顯示狀態", "沿用目前設計", "沿用區塊設定"]) assert.ok(html.includes(label));
});
check("visibility distinguishes false and inherit in UI", () => { assert.match(render("home002", edit(fixture(), { group: "visible", value: false }).presentation), /<option value="hide" selected="">隱藏/u); assert.match(render("home002"), /<option value="inherit" selected="">沿用區塊設定/u); });
check("advanced text/layout/background sections start collapsed", () => { const html = render("home002"); assert.ok(html.includes("更多文字設定") && html.includes("版面與留白") && html.includes("背景設定")); assert.doesNotMatch(html, /<details[^>]*\sopen/u); });
const editor = await readFile(new URL("../components/admin/HomepagePresentationEditor.tsx", import.meta.url), "utf8");
const manager = await readFile(new URL("../components/admin/HomepageManager.tsx", import.meta.url), "utf8");
const mutation = await readFile(new URL("../lib/homepagePresentationAdmin.ts", import.meta.url), "utf8");
check("UI imports the single authoritative section capability map", () => { assert.match(editor, /HOMEPAGE_SECTION_CAPABILITIES\[sectionKey\]/u); assert.doesNotMatch(editor, /home002:\s*\[/u); });
check("manager integrates all eleven section editors through Panel", () => {
  for (const key of ["hero", "campaignSection", "home004", "home006", "home008", "home009", "home010"]) assert.ok(manager.includes(`presentationKey="${key}"`));
  assert.ok(manager.includes("presentationKey={sectionKey}")); assert.ok(manager.includes("<HomepagePresentationEditor sectionKey={presentationKey}"));
});
check("save still validates before the same Homepage PUT", () => {
  assert.ok(manager.indexOf("validateHomepageCms(data.homepage)") < manager.indexOf('method: "PUT"'));
  assert.match(manager, /fetch\("\/api\/admin\/homepage", \{ method: "PUT"/u);
  assert.match(manager, /updateHomepageBasePresentation\(current.homepage, sectionKey, edit\)/u);
});
check("invalid numeric/color drafts block save without writing invalid data", () => { assert.match(manager, /disabled=\{saving \|\| !dirty \|\| presentationInvalid\}/u); assert.match(manager, /if \(presentationInvalid\)/u); assert.match(editor, /Number\.isFinite\(number\)/u); assert.match(editor, /needsColor/u); assert.match(editor, /onValidityChange\(invalid\)/u); });
check("existing content/motion/visual controls remain present", () => { for (const name of ["Home002ClosingEditor", "SectionMotionEditor", "HomepageVisualEditor", "HeroEditor", "HomepageNavigationEditor"]) assert.ok(manager.includes(name)); assert.ok(manager.includes("resolveHeroTiming(value.timing)")); });
check("Base retains no Preview/API or direct Mobile mutation; legacy Mobile fields stay absent until enabled", () => {
  assert.doesNotMatch(editor, /presentation\.animation|<iframe|postMessage|fetch\(/u);
  assert.ok(!render("home002").includes('data-presentation-mode="mobile"'));
  // Homepage Studio now explicitly supports validated sparse animation leaves.
  assert.doesNotMatch(mutation.split("// Mobile editing")[0], /\["sections", sectionKey, "mobile"\]/u);
});
check("all edit results serialize to valid Homepage data", () => {
  let data = fixture();
  data = edit(data, textEdit("fontSizePx", 48)); data = edit(data, textEdit("fontWeight", "semibold")); data = edit(data, textEdit("color", "#aabbcc")); data = edit(data, { group: "layout", field: "paddingTopPx", value: 0 }); data = edit(data, { group: "background", value: { mode: "none" } }); data = edit(data, { group: "visible", value: false });
  assert.equal(validateHomepageCms(JSON.parse(JSON.stringify(data))), true);
});
assert.equal(await readFile(new URL("../public/data/homepage.json", import.meta.url), "utf8"), stored);
assert.equal(await readFile(new URL("../bootstrap/store/homepage.json", import.meta.url), "utf8"), seed);
console.log(`H3.3B Base Admin presentation: ${passed} checks PASS; mutation/SSR fixtures only; persisted JSON unchanged.`);
