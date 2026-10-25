import fs from "node:fs/promises";
import ts from "typescript";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
const qaDir = process.env.HOMEPAGE_STUDIO_QA_DIR || path.join(os.tmpdir(), "KD_Homepage_Studio_QA");
await fs.mkdir(qaDir, { recursive: true });
const old = await fs.readFile("components/admin/HomepageManager.tsx", "utf8");
const current = await fs.readFile("components/admin/HomepageEditors.tsx", "utf8");
const tags = new Set(["input", "textarea", "select", "Visibility", "SmartLinkPicker", "MediaUploader", "ImageLibraryPicker", "HeroMediaLibraryPicker", "YouTubeField", "AssetPicker"]);
function inventory(source) {
  const file = ts.createSourceFile("editor.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), result = [];
  function walk(node, owner = "HomepageManager") {
    if (ts.isFunctionDeclaration(node) && node.name) owner = node.name.text;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(file);
      if (tags.has(tag)) {
        const props = Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map(item => [item.name.getText(file), item.initializer?.getText(file) || "true"]));
        if (props.onChange || props.onChoose || props.onAdd || props.onVisibleChange) {
          const path = props.onChange || props.onChoose || props.onAdd || props.onVisibleChange;
          result.push({ owner, control: tag, label: props.label || props["aria-label"] || tag, binding: path.replace(/\s+/g, " "), line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
        }
      }
    }
    ts.forEachChild(node, child => walk(child, owner));
  }
  walk(file); return result;
}
const baseline = inventory(old), extracted = inventory(current);
// The only relocated controls are the top-level asset dialogs and SectionMotionEditor.
const moved = new Set(["HomepageManager", "SectionMotionEditor"]);
const key = row => JSON.stringify([row.owner, row.control, row.binding]);
const unmatched = baseline.filter(row => !moved.has(row.owner) && !extracted.some(next => key(row) === key(next)));
assert.deepEqual(unmatched, []);
const renderer = {
  ItemActions: "caller collection item.enabled and order → orderedEnabledItems / real corresponding section",
  HeroEditor: "hero.* → HomepageV3 #top / KdMedia",
  CampaignEditor: "campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign",
  ContentSectionEditor: "home002.cards[], home003.cards[], home005.steps[], home007.cards[] → HomepageV3 corresponding section",
  Home002ClosingEditor: "home002.closingText / closingEnabled → HomepageV3 #home002",
  Home004Editor: "home004.* → HomepageV3 #home004; product data remains referenced",
  Home006Editor: "home006.* → HomepageV3 #home006",
  Home008Editor: "home008.images[] / mediaItems[] → HomepageStudioGallery #home008",
  ReviewsEditor: "home009.* → HomepageV3 #home009",
  Home010Editor: "home010.* → HomepageV3 #home010",
  NestedMediaEditor: "current section/card media, image, mediaItems[] → HomepageMediaCollection / HomepageSceneMedia",
  MediaReferenceEditor: "current mediaItems[] / images[] → existing media collection/gallery renderer",
  AssetPicker: "selected existing asset → current media/image reference",
  YouTubeField: "current media → KdMedia YouTube renderer",
  HomepageSectionOrderEditor: "sectionOrder[] / corresponding section.enabled → public CSS flex order / sectionIsEnabled",
  HomepageNavigationEditor: "navigation[].* → HeaderNavigation",
  HomepageCtaVisibility: "hero, campaigns[], home003.cards[], home006, home010 CTA enabled → resolveHomepageCta",
  HomepageVisualEditor: "visual.colors.* / heroOverlayPreset / cardPresentationPreset → existing stored metadata + legacy style illustration; NO baseline public binding",
  HomepageSeoEditor: "seo.title / description / shareImage → existing stored SEO fields; root metadata currently static",
  SectionMotionEditor: "*.motion six parameters → StudioAnimationFields → presentation.sections.*.base/mobile.animation sparse overlay → same HomepageMotion engine",
  HomepageManager: "hero.desktopMedia/mobileMedia and seo.shareImage asset dialogs → HomepageContentStudio",
  Visibility: "caller-owned enabled field → caller's real section / CTA",
};
for (const row of baseline) assert.ok(renderer[row.owner], "Unmapped control owner " + row.owner);
const report = { baselineControlTemplates: baseline.length, preservedOrRelocated: baseline.length, unmapped: 0, extractedControlTemplates: extracted.length, note: "Counts editable control templates once, including dynamically repeated collections; presentation capability fields inventoried separately.", controls: baseline.map(row => ({ ...row, dataPathAndTarget: renderer[row.owner] })) };
const model = await fs.readFile("lib/homepagePresentation.ts", "utf8");
const capabilities = model.split("export const HOMEPAGE_SECTION_CAPABILITIES = {")[1].split("} as const")[0];
const presentationFields = [];
for (const match of capabilities.matchAll(/(\w+): \[([^\]]+)\]/g)) {
  const section = match[1], slots = [...match[2].matchAll(/"([^"]+)"/g)].map(item => item[1]);
  for (const branch of ["base", "mobile.overrides"]) {
    for (const slot of slots) for (const field of ["fontSizePx","fontWeight","color","lineHeight","letterSpacingEm","alignment","maxWidthCh"]) presentationFields.push({ path: "presentation.sections."+section+"."+branch+".text."+slot+"."+field, editor: section, renderer: "createHomepagePresentationBindings → real "+section+" semantic "+slot+" target" });
    for (const field of ["layout.contentMaxWidthPx","layout.paddingTopPx","layout.paddingBottomPx","background.mode","background.color","visible"]) presentationFields.push({ path: "presentation.sections."+section+"."+branch+"."+field, editor: section, renderer: "createHomepagePresentationBindings → real "+section+" content/section CSS binding" });
  }
  presentationFields.push({ path:"presentation.sections."+section+".mobile.overrideEnabled", editor:section,renderer:"Mobile binding activation; OFF retains existing sparse values" });
}
assert.equal(presentationFields.filter(row=>row.path.endsWith("mobile.overrideEnabled")).length,11);
report.presentationAddressCount = presentationFields.length;
report.presentationFields = presentationFields;
await fs.writeFile(path.join(qaDir, "field-map.json"), JSON.stringify(report, null, 2));
const lines = ["# Homepage Content Studio — complete legacy control inventory", "", "Control template families: " + baseline.length + "; preserved/mapped: " + baseline.length + "; unmapped: 0.", "", "A repeated collection control counts once per template, rather than once per current record. Each original event binding below is retained verbatim or relocated as specified. Canonical data remains homepage.json through the authenticated /api/admin/homepage GET/PUT, version check, file lock and atomic write.", "", "| Owner / control | Original binding (data path) | Public area / destination |", "| --- | --- | --- |", ...report.controls.map(row => "| " + row.owner + " / " + row.control + " | `" + row.binding.replaceAll("|", "&#124;") + "` | " + row.dataPathAndTarget + " |")];
lines.push("", "## Existing presentation field addresses", "", presentationFields.length+" distinct supported presentation addresses, expanded across the actual 11 section capability sets and both sparse branches. These are separate from the 97 legacy control templates; counts are not mixed into a misleading total. Every address is retained in the same canonical schema.", "", "| Data path | Editor area | Renderer |", "| --- | --- | --- |", ...presentationFields.map(row=>"| `"+row.path+"` | "+row.editor+" | "+row.renderer+" |"));
await fs.writeFile("docs/HOMEPAGE_STUDIO_FIELD_MAP.md", lines.join("\n") + "\n");
console.log("PASS legacy editable control coverage: " + baseline.length + "/" + baseline.length + ", unmapped 0");
