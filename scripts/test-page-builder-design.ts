import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// @ts-expect-error -- Node's type-stripping runner requires explicit extensions.
import { PAGE_BUILDER_QA_FIXTURE } from "../lib/pageBuilderQaFixture.ts";
// @ts-expect-error -- Node's type-stripping runner requires explicit extensions.
import { createSection, PAGE_MOBILE_MEDIA_LAYOUTS, PAGE_PRESENTATION_PRESETS, resolveMobileMediaLayout, resolveSectionPresentation, validatePageDraft } from "../lib/pageBuilder.ts";

const productSlugs = new Set(["giotto-awakening", "davinci-feast", "monet-floral"]);
assert.doesNotThrow(() => validatePageDraft(PAGE_BUILDER_QA_FIXTURE, productSlugs), "QA fixture satisfies the production Page Builder contract");
assert.deepEqual(PAGE_BUILDER_QA_FIXTURE.sections.map((section) => section.type), ["hero", "mediaText", "gallery", "features", "products", "cta"], "fixture covers the required campaign narrative");
assert.equal(PAGE_BUILDER_QA_FIXTURE.sections.some((section) => section.media.some((item) => item.media.type === "video")), true, "fixture includes video");
assert.equal(PAGE_BUILDER_QA_FIXTURE.sections.some((section) => section.media.some((item) => (item.media.height || 0) > (item.media.width || 0))), true, "fixture includes portrait media");
assert.equal(PAGE_BUILDER_QA_FIXTURE.sections.at(-1)?.ctas.length, 3, "closing provides three controlled CTA choices");

for (const type of ["hero", "text", "mediaText", "gallery", "products", "features", "cta"] as const) {
  const section = createSection(type);
  assert.ok(PAGE_PRESENTATION_PRESETS.includes(resolveSectionPresentation(section)), `${type} gets a valid presentation`);
  delete section.presentation;
  assert.ok(PAGE_PRESENTATION_PRESETS.includes(resolveSectionPresentation(section)), `${type} legacy content gets a safe fallback`);
}

const empty = createSection("hero");
empty.presentation = undefined;
assert.equal(resolveSectionPresentation(empty), "hero-minimal", "empty legacy hero becomes a text-safe minimal composition");
const longTitle = createSection("text");
longTitle.title = "一段用來驗證長標題仍在受控閱讀寬度內自然換行而不造成頁面橫向溢位的咖啡策展文字";
assert.doesNotThrow(() => validatePageDraft({ title: "Long title QA", seoTitle: "", seoDescription: "", sections: [longTitle] }));
const mobileStory=createSection("mediaText");
for(const layout of PAGE_MOBILE_MEDIA_LAYOUTS){mobileStory.mobileMediaLayout=layout;assert.equal(resolveMobileMediaLayout(mobileStory),layout,`${layout} resolves as an intentional mobile composition`);}
mobileStory.mobileMediaLayout=undefined;
assert.equal(resolveMobileMediaLayout(mobileStory),"text-first","legacy Media + Text gets the owner-safe mobile layout");

const [previewSource, publicSource, rendererSource, listManagerSource, editorSource, pageApiSource, css] = await Promise.all([
  readFile(new URL("../app/admin/pages/[id]/preview/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/pages/[slug]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/page-builder/PageBuilderRenderer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/admin/PageListManager.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/admin/PageBuilderManager.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/admin/pages/[id]/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);
assert.match(previewSource, /PageBuilderRenderer/u, "Preview uses the shared renderer");
assert.match(publicSource, /PageBuilderRenderer/u, "Published Page uses the shared renderer");
assert.match(publicSource, /page=\{page\.publishedSnapshot\}/u, "public route renders the immutable published snapshot");
assert.doesNotMatch(publicSource, /page=\{page\.draft\}/u, "public route never renders unsaved draft data");
for (const preset of PAGE_PRESENTATION_PRESETS) assert.match(css, new RegExp(preset.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"), `${preset} has an explicit design-system selector`);
assert.match(rendererSource, /data-presentation/u, "renderer exposes presentation choices to the design system");
assert.match(rendererSource, /data-mobile-layout/u, "renderer exposes the independent mobile Media + Text composition");
for(const layout of PAGE_MOBILE_MEDIA_LAYOUTS)assert.match(editorSource,new RegExp(layout,"u"),`${layout} has a visual owner selection`);
assert.match(css, /overflow:clip/u, "Page Builder contains page-level overflow");
assert.match(listManagerSource, /預覽草稿/u, "Page Management uses unambiguous draft-preview terminology");
assert.match(listManagerSource, /查看正式頁 ↗/u, "published Page Management rows expose a first-class public action");
assert.match(editorSource, /查看正式頁 ↗/u, "published Page Builder editor exposes the public action");
assert.match(listManagerSource, /resolveCmsLink\(\{type:"page",target:page\.id\}/u, "Page Management resolves the canonical route from the published registry");
assert.match(editorSource, /resolveCmsLink\(\{type:"page",target:page\.id\}/u, "editor resolves the canonical route from the published registry");
assert.doesNotMatch(`${listManagerSource}\n${editorSource}`, /href:`\/pages\/\$\{/u, "Admin UI never guesses a public slug route");
assert.match(pageApiSource, /publishedPages: publishedPageRegistry\(store\)/u, "save response refreshes the canonical published-page registry");

console.log("Page Builder design-system assertions: PASS (fixture, presets, fallbacks, shared renderer, overflow contract)");
