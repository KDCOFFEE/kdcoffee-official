import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { updateHomepageBasePresentation as baseEdit, updateHomepageMobileEnabled as toggle, updateHomepageMobilePresentation as mobileEdit, type HomepageBasePresentationEdit } from "../lib/homepagePresentationAdmin.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { HOMEPAGE_PRESENTATION_SECTION_KEYS, HOMEPAGE_SECTION_CAPABILITIES, HOMEPAGE_PRESENTATION_NUMBER_RULES, resolveHomepageSectionPresentation } from "../lib/homepagePresentation.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { validateHomepageCms } from "../lib/homepageCms.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { VISUAL_COLOR_PRESETS, VISUAL_WEIGHT_PRESETS, VISUAL_ALIGNMENT_PRESETS } from "../lib/pageBuilderVisualStyle.ts";
import type { HomepageData } from "../data/homepageData";
import type { HomepagePresentationKey, HomepagePresentationPatch, HomepagePresentationV3, HomepageTextPresentation, HomepageTextSlot } from "../lib/homepagePresentation.ts";

const stored = await readFile(new URL("../public/data/homepage.json", import.meta.url), "utf8");
const seed = await readFile(new URL("../bootstrap/store/homepage.json", import.meta.url), "utf8");
const fixture = (): HomepageData => JSON.parse(stored);
const text = (field: keyof HomepageTextPresentation, value: unknown, slot: HomepageTextSlot = "title"): HomepageBasePresentationEdit => ({ group: "text", slot, field, value });
const edit = (data: HomepageData, change: HomepageBasePresentationEdit, key: HomepagePresentationKey = "home002") => mobileEdit(data, key, change);
const section = (data: HomepageData) => data.presentation?.sections?.home002;
const mobile = (data: HomepageData) => section(data)?.mobile;
const overrides = (data: HomepageData) => mobile(data)?.overrides;
const baseFixture = () => baseEdit(baseEdit(fixture(), "home002", text("fontSizePx", 48)), "home002", text("alignment", "center"));
const withMobile = (values?: HomepagePresentationPatch, enabled = true) => {
  const data = baseFixture(); section(data)!.mobile = { overrideEnabled: enabled, ...(values ? { overrides: values } : {}) }; return data;
};
let passed = 0;
function check(name: string, run: () => void) { run(); passed++; console.log("PASS " + name); }

check("legacy has no Mobile", () => { assert.equal(fixture().presentation, undefined); assert.equal(validateHomepageCms(fixture()), true); });
check("ON creates exact minimum Mobile ancestors", () => {
  const data = fixture(); assert.deepEqual(toggle(data, "home002", true).presentation, { schemaVersion: 3, sections: { home002: { mobile: { overrideEnabled: true } } } }); assert.equal(data.presentation, undefined);
});
check("ON does not copy Base", () => { const data = baseFixture(); const next = toggle(data, "home002", true); assert.deepEqual(mobile(next), { overrideEnabled: true }); assert.equal(section(next)?.base, section(data)?.base); });
check("OFF absent state is identity", () => { const data = fixture(); assert.equal(toggle(data, "home002", false), data); });
check("repeated ON is identity", () => { const data = toggle(fixture(), "home002", true); assert.equal(toggle(data, "home002", true), data); });
check("OFF empty state prunes Mobile/section/root", () => { assert.deepEqual(toggle(toggle(fixture(), "home002", true), "home002", false), fixture()); });
check("OFF empty state preserves Base", () => { const data = baseFixture(); assert.deepEqual(toggle(toggle(data, "home002", true), "home002", false), data); });
check("OFF preserves draft bytes, structure and reference", () => {
  const data = withMobile({ text: { title: { fontSizePx: 30 } } }); const before = structuredClone(data); const next = toggle(data, "home002", false);
  assert.deepEqual(mobile(next), { overrideEnabled: false, overrides: { text: { title: { fontSizePx: 30 } } } });
  assert.equal(mobile(next)?.overrides, mobile(data)?.overrides); assert.equal(JSON.stringify(overrides(next)), JSON.stringify(overrides(data))); assert.deepEqual(data, before);
});
check("ON after OFF restores exact draft", () => { const data = withMobile({ text: { title: { fontSizePx: 30 } } }); assert.deepEqual(toggle(toggle(data, "home002", false), "home002", true), data); });
check("disabled resolver ignores overrides without deleting draft", () => { const data = withMobile({ text: { title: { fontSizePx: 30 } } }, false); assert.equal(resolveHomepageSectionPresentation(data.presentation, "home002", "mobile").text?.title?.fontSizePx, 48); assert.equal(overrides(data)?.text?.title?.fontSizePx, 30); });
check("first leaf creates exact sparse Mobile and no Base", () => { assert.deepEqual(edit(fixture(), text("fontSizePx", 30)).presentation, { schemaVersion: 3, sections: { home002: { mobile: { overrideEnabled: true, overrides: { text: { title: { fontSizePx: 30 } } } } } } }); });
check("Mobile 30 preserves Base 48; inherited alignment remains absent", () => { const data = baseFixture(); const next = edit(data, text("fontSizePx", 30)); assert.equal(section(next)?.base, section(data)?.base); assert.equal(section(next)?.base?.text?.title?.fontSizePx, 48); assert.deepEqual(overrides(next), { text: { title: { fontSizePx: 30 } } }); });
check("one edit creates no other slots/sections", () => { const next = edit(fixture(), text("fontSizePx", 30)); assert.deepEqual(Object.keys(next.presentation!.sections!), ["home002"]); assert.deepEqual(Object.keys(overrides(next)!.text!), ["title"]); });
check("unset reset never enables/materializes Mobile", () => { const data = baseFixture(); assert.equal(edit(data, text("fontSizePx", undefined)), data); });
check("false survives JSON", () => { assert.equal(overrides(JSON.parse(JSON.stringify(edit(fixture(), { group: "visible", value: false }))))?.visible, false); });
for (const field of ["paddingTopPx", "paddingBottomPx"] as const) check(field + ": zero survives and reset prunes", () => {
  const next = edit(fixture(), { group: "layout", field, value: 0 }); assert.equal(overrides(JSON.parse(JSON.stringify(next)))?.layout?.[field], 0);
  assert.deepEqual(mobile(edit(next, { group: "layout", field, value: undefined })), { overrideEnabled: true });
});
check("reset leaf preserves sibling and Base", () => { const data = withMobile({ text: { title: { fontSizePx: 30, fontWeight: "bold" } } }); const next = edit(data, text("fontSizePx", undefined)); assert.deepEqual(overrides(next)?.text?.title, { fontWeight: "bold" }); assert.equal(section(next)?.base, section(data)?.base); });
check("empty slot prunes; other slot remains", () => { assert.deepEqual(overrides(edit(withMobile({ text: { title: { fontSizePx: 30 }, closing: { color: "gold" } } }), text("fontSizePx", undefined)))?.text, { closing: { color: "gold" } }); });
check("empty text prunes; layout remains", () => { assert.deepEqual(overrides(edit(withMobile({ text: { title: { fontSizePx: 30 } }, layout: { paddingTopPx: 0 } }), text("fontSizePx", undefined))), { layout: { paddingTopPx: 0 } }); });
check("last active reset retains enabled toggle and Base", () => { const data = withMobile({ text: { title: { fontSizePx: 30 } } }); const next = edit(data, text("fontSizePx", undefined)); assert.deepEqual(mobile(next), { overrideEnabled: true }); assert.equal(section(next)?.base, section(data)?.base); });
check("last disabled reset removes Mobile; Base intact", () => { assert.deepEqual(edit(withMobile({ text: { title: { fontSizePx: 30 } } }, false), text("fontSizePx", undefined)), baseFixture()); });
check("last disabled reset prunes section/root without Base", () => { assert.deepEqual(edit(toggle(edit(fixture(), text("fontSizePx", 30)), "home002", false), text("fontSizePx", undefined)), fixture()); });
check("editing disabled draft never enables it", () => { assert.equal(mobile(edit(withMobile({ text: { title: { fontSizePx: 30 } } }, false), text("fontSizePx", 31)))?.overrideEnabled, false); });
check("OFF removes semantically empty override objects", () => { assert.deepEqual(toggle(withMobile({ text: { title: {} }, layout: {} }), "home002", false), baseFixture()); });
check("OFF preserves false/zero/existing animation values", () => { const data = withMobile({ visible: false, layout: { paddingTopPx: 0 }, animation: { enabled: false } }); assert.deepEqual(overrides(toggle(data, "home002", false)), overrides(data)); });
check("Mobile changes preserve other sections, preset, Base animation and content", () => {
  const data = baseFixture(); data.presentation!.sections!.hero = { preset: "editorial", base: { visible: false } }; section(data)!.preset = "comfortable"; section(data)!.base!.animation = { enabled: false };
  const before = structuredClone(data); const expected = structuredClone(data); section(expected)!.mobile = { overrideEnabled: true, overrides: { text: { title: { fontSizePx: 30 } } } };
  assert.deepEqual(edit(data, text("fontSizePx", 30)), expected); assert.deepEqual(data, before);
});
check("Base edit and full Base reset preserve exact Mobile and ancestors", () => {
  const data = withMobile({ text: { title: { fontSizePx: 30 } } }, false); const before = JSON.stringify(mobile(data));
  let next = baseEdit(data, "home002", text("fontSizePx", 60)); next = baseEdit(next, "home002", text("fontSizePx", undefined)); next = baseEdit(next, "home002", text("alignment", undefined));
  assert.equal(section(next)?.base, undefined); assert.equal(JSON.stringify(mobile(next)), before); assert.equal(mobile(next), mobile(data)); assert.ok(next.presentation?.sections?.home002);
});
check("H3.1 empty closing text and disabled closing survive", () => { const data = fixture(); data.home002!.closingText = ""; data.home002!.closingEnabled = false; const next = edit(toggle(edit(data, text("color", "gold", "closing")), "home002", false), text("color", undefined, "closing")); assert.deepEqual(next, data); });
check("frozen input remains untouched", () => { const data = withMobile({ text: { title: { fontSizePx: 30 } } }); const before = JSON.stringify(data); Object.freeze(overrides(data)?.text?.title); Object.freeze(mobile(data)); Object.freeze(section(data)); Object.freeze(data.presentation?.sections); Object.freeze(data.presentation); Object.freeze(data); edit(data, text("fontSizePx", 31)); toggle(data, "home002", false); assert.equal(JSON.stringify(data), before); });
check("background inherit removes group and preserves Base background", () => { const data = withMobile({ background: { mode: "color", color: "gold" } }); section(data)!.base!.background = { mode: "color", color: "coffee" }; const next = edit(data, { group: "background", value: undefined }); assert.deepEqual(mobile(next), { overrideEnabled: true }); assert.equal(section(next)?.base, section(data)?.base); });
check("background none stores only mode; legacy removes it", () => { const next = edit(fixture(), { group: "background", value: { mode: "none" } }); assert.deepEqual(overrides(next), { background: { mode: "none" } }); assert.deepEqual(mobile(edit(next, { group: "background", value: { mode: "legacy" } })), { overrideEnabled: true }); });
check("background safe color atomic; invalid/missing color fails", () => {
  assert.deepEqual(overrides(edit(fixture(), { group: "background", value: { mode: "color", color: "#aAbB22" } })), { background: { mode: "color", color: "#aAbB22" } });
  for (const value of [{ mode: "color" }, { mode: "color", color: "url(x)" }, { mode: "gradient" }]) assert.throws(() => edit(fixture(), { group: "background", value } as unknown as HomepageBasePresentationEdit));
});
for (const value of [true, false]) check("visibility " + value + " reset keeps master/Base unchanged", () => { const data = baseFixture(); data.home002!.enabled = false; const next = edit(data, { group: "visible", value }); assert.equal(overrides(next)?.visible, value); assert.equal(next.home002!.enabled, false); assert.equal(section(next)?.base, section(data)?.base); assert.deepEqual(mobile(edit(next, { group: "visible", value: undefined })), { overrideEnabled: true }); });
for (const field of ["fontSizePx", "lineHeight", "letterSpacingEm", "maxWidthCh", "contentMaxWidthPx", "paddingTopPx", "paddingBottomPx"] as const) {
  const rule = HOMEPAGE_PRESENTATION_NUMBER_RULES[field]; const change = (value: unknown): HomepageBasePresentationEdit => field === "contentMaxWidthPx" || field === "paddingTopPx" || field === "paddingBottomPx" ? { group: "layout", field, value } : text(field, value);
  check(field + ": canonical bounds and reset", () => { for (const value of [rule.min, rule.max]) { const next = edit(baseFixture(), change(value)); assert.equal(validateHomepageCms(next), true); assert.deepEqual(mobile(edit(next, change(undefined))), { overrideEnabled: true }); } });
  check(field + ": invalid numeric primitives rejected", () => { const data = baseFixture(); const before = JSON.stringify(data); for (const value of [rule.min - 1, rule.max + 1, Infinity, NaN, null, "", false]) assert.throws(() => edit(data, change(value))); assert.equal(JSON.stringify(data), before); });
}
for (const [field, values] of [["fontWeight", VISUAL_WEIGHT_PRESETS], ["alignment", VISUAL_ALIGNMENT_PRESETS], ["color", [...VISUAL_COLOR_PRESETS, "#Aa12ef"]]] as const) check(field + ": safe enums/colors and reset", () => { for (const value of values) { const next = edit(baseFixture(), text(field, value)); assert.equal(overrides(next)?.text?.title?.[field], value); assert.deepEqual(mobile(edit(next, text(field, undefined))), { overrideEnabled: true }); } });
check("invalid enums/slots/prototype/animation paths rejected", () => {
  for (const [field, value] of [["fontWeight", "900"], ["alignment", "justify"], ["color", "red"]] as const) assert.throws(() => edit(fixture(), text(field, value)));
  for (const slot of ["closing", "price", "availability", "metadata"]) assert.throws(() => edit(fixture(), text("fontSizePx", 30, slot as HomepageTextSlot), "home004"));
  assert.throws(() => toggle(fixture(), "__proto__" as HomepagePresentationKey, true));
  assert.throws(() => edit(fixture(), { group: "text", slot: "title", field: "__proto__", value: {} } as unknown as HomepageBasePresentationEdit));
  assert.throws(() => edit(fixture(), { group: "animation", value: {} } as unknown as HomepageBasePresentationEdit));
});
for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) check(key + ": canonical slots produce only sparse Mobile", () => { for (const slot of HOMEPAGE_SECTION_CAPABILITIES[key]) { const next = edit(fixture(), text("fontSizePx", 30, slot), key); assert.deepEqual(next.presentation?.sections, { [key]: { mobile: { overrideEnabled: true, overrides: { text: { [slot]: { fontSizePx: 30 } } } } } }); assert.equal(validateHomepageCms(next), true); } });

type ProviderProps = { presentation?: HomepagePresentationV3; onEdit: (key: HomepagePresentationKey, edit: HomepageBasePresentationEdit) => void; onMobileEdit: (key: HomepagePresentationKey, edit: HomepageBasePresentationEdit) => void; onMobileToggle: (key: HomepagePresentationKey, enabled: boolean) => void; onValidityChange: (invalid: boolean) => void; children: ReactNode };
const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, jsx: { runtime: "automatic" }, fsCache: false });
const ui = await jiti.import<{ HomepagePresentationProvider: ComponentType<ProviderProps>; HomepagePresentationEditor: ComponentType<{ sectionKey: HomepagePresentationKey }>; HOMEPAGE_TEXT_SLOT_LABELS: Record<HomepageTextSlot, string> }>(path.join(process.cwd(), "components/admin/HomepagePresentationEditor.tsx"));
let mutations = 0;
const render = (data = fixture(), key: HomepagePresentationKey = "home002") => renderToStaticMarkup(createElement(ui.HomepagePresentationProvider, { presentation: data.presentation, onEdit: () => { mutations++; }, onMobileEdit: () => { mutations++; }, onMobileToggle: () => { mutations++; }, onValidityChange: () => undefined, children: createElement(ui.HomepagePresentationEditor, { sectionKey: key }) }));
const mobileHtml = (data: HomepageData, key: HomepagePresentationKey = "home002") => render(data, key).split('data-presentation-mode="mobile"')[1] ?? "";
check("OFF UI simple: toggle present, no Mobile fields", () => { const html = render(); assert.match(html, /啟用手機自訂/u); assert.match(html, /目前沿用 Desktop／共用設定/u); assert.ok(!html.includes('data-presentation-mode="mobile"')); assert.doesNotMatch(html, /type="checkbox"[^>]*checked/u); });
check("ON reveals checked toggle and collapsed Mobile cards", () => { const data = toggle(fixture(), "home002", true); const html = render(data); assert.match(html, /type="checkbox"[^>]*checked/u); assert.ok(mobileHtml(data)); assert.doesNotMatch(html, /<details[^>]*\sopen/u); });
check("inherited 48/center are hints, never Mobile input values", () => { const html = mobileHtml(toggle(baseFixture(), "home002", true)); assert.match(html, /沿用 Desktop：48 px/u); assert.match(html, /沿用 Desktop：置中/u); assert.ok(!html.includes('value="48"')); assert.match(html, /<option value="" selected="">沿用 Desktop/u); assert.match(html, /placeholder="沿用 Desktop"/u); assert.match(html, /沿用 Desktop／網站設計/u); });
check("active existing 30/zero/false display explicitly", () => { const html = mobileHtml(withMobile({ text: { title: { fontSizePx: 30 } }, layout: { paddingTopPx: 0 }, visible: false })); assert.match(html, /value="30"/u); assert.match(html, /手機自訂：30 px/u); assert.match(html, /手機自訂：0 px/u); assert.match(html, /<option value="hide" selected="">隱藏/u); });
check("disabled existing draft stays OFF and unchanged on render", () => { const data = withMobile({ text: { title: { fontSizePx: 30 } } }, false); const before = JSON.stringify(data); const html = render(data); assert.ok(!html.includes('data-presentation-mode="mobile"')); assert.match(html, /重新啟用即可繼續編輯/u); assert.equal(JSON.stringify(data), before); assert.equal(mutations, 0); });
check("active render never mutates/enables/copies data", () => { const data = toggle(baseFixture(), "home002", true); const before = JSON.stringify(data); render(data); assert.equal(JSON.stringify(data), before); assert.equal(mutations, 0); });
for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) check(key + ": Mobile UI exact canonical Chinese slots", () => {
  const html = mobileHtml(toggle(fixture(), key, true), key); const labels = [...html.matchAll(/<summary style="cursor:pointer"><strong>([^<]+)<\/strong>/gu)].map(match => match[1]);
  assert.deepEqual(labels, HOMEPAGE_SECTION_CAPABILITIES[key].map(slot => ui.HOMEPAGE_TEXT_SLOT_LABELS[slot]));
  const ownerText = html.replace(/<[^>]*>/gu, ""); for (const raw of ["overrideEnabled", "overrides", "schemaVersion", "fontSizePx", "paddingTopPx", "cardBody", "maxWidthCh"]) assert.ok(!ownerText.includes(raw));
});
check("HOME002 closing available; HOME004 commerce slots absent", () => { assert.match(mobileHtml(toggle(fixture(), "home002", true)), /結尾文字/u); assert.doesNotMatch(mobileHtml(toggle(fixture(), "home004", true), "home004"), /price|availability|結尾文字/u); });
check("Mobile field labels/inherit paths/ranges, no animation/media form", () => {
  const html = mobileHtml(toggle(fixture(), "home002", true)); for (const label of ["字級", "字重", "對齊", "文字顏色", "行高", "字距", "最大文字寬度", "內容最大寬度", "上方留白", "下方留白", "背景設定", "手機顯示狀態", "沿用 Desktop"]) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /進場方式|動畫時間|圖片|影片|漸層|上傳/u);
  for (const field of ["fontSizePx", "lineHeight", "letterSpacingEm", "maxWidthCh", "contentMaxWidthPx", "paddingTopPx", "paddingBottomPx"] as const) { const rule = HOMEPAGE_PRESENTATION_NUMBER_RULES[field]; assert.ok(html.includes('type="number" min="' + rule.min + '" max="' + rule.max + '"')); }
});
const editor = await readFile(new URL("../components/admin/HomepagePresentationEditor.tsx", import.meta.url), "utf8");
const manager = await readFile(new URL("../components/admin/HomepageManager.tsx", import.meta.url), "utf8");
check("one shared field editor/capability map for both modes", () => { assert.equal((editor.match(/function PresentationFields\(/gu) ?? []).length, 1); assert.match(editor, /HOMEPAGE_SECTION_CAPABILITIES\[sectionKey\]/u); assert.ok(editor.includes('mode="base"') && editor.includes('mode="mobile"')); });
check("Manager Mobile helpers use existing validated PUT", () => { assert.match(manager, /updateHomepageMobilePresentation\(current.homepage, sectionKey, edit\)/u); assert.match(manager, /updateHomepageMobileEnabled\(current.homepage, sectionKey, enabled\)/u); assert.ok(manager.indexOf("validateHomepageCms(data.homepage)") < manager.indexOf('method: "PUT"')); });
check("mode-specific issue identities and existing Save guard", () => { assert.ok(editor.includes('${sectionKey}.${mode}')); assert.match(editor, /onMobileEdit\?\.\(sectionKey, value\)/u); assert.match(manager, /disabled=\{saving \|\| !dirty \|\| presentationInvalid\}/u); });
check("no Preview/media/animation/breakpoint runtime in shared UI", () => { assert.doesNotMatch(editor, /<iframe|postMessage|fetch\(|matchMedia|@media|presentation\.animation|MediaUploader|KdMedia/u); assert.doesNotMatch(editor, /尚未套用至公開首頁/u); for (const html of [render(), render(toggle(fixture(), "home002", true))]) { assert.doesNotMatch(html, /尚未套用至公開首頁/u); for (const phrase of ["儲存後", "600px", "沿用 Desktop／共用設定"]) assert.ok(html.includes(phrase)); } });
check("combined disabled draft serializes as CMS-valid with Base intact", () => {
  let data = toggle(baseFixture(), "home002", true);
  for (const change of [text("fontSizePx", 30), text("color", "gold"), { group: "visible", value: false }, { group: "layout", field: "paddingTopPx", value: 0 }, { group: "background", value: { mode: "color", color: "coffee" } }] as HomepageBasePresentationEdit[]) data = edit(data, change);
  data = toggle(data, "home002", false); assert.equal(validateHomepageCms(JSON.parse(JSON.stringify(data))), true); assert.equal(section(data)?.base?.text?.title?.fontSizePx, 48);
});
assert.equal(await readFile(new URL("../public/data/homepage.json", import.meta.url), "utf8"), stored);
assert.equal(await readFile(new URL("../bootstrap/store/homepage.json", import.meta.url), "utf8"), seed);
console.log("H3.4A Mobile Admin: " + passed + " checks PASS; fixture/SSR only; persisted JSON unchanged.");
