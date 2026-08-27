import assert from "node:assert/strict";
// @ts-expect-error -- Node's type-stripping runner requires explicit extensions.
import { createPage, createSection, duplicatePage, duplicateSection, newBuilderId, pageReferenceCount, publishedPageRegistry, validatePageDraft, validatePageStore } from "../lib/pageBuilder.ts";
// @ts-expect-error -- Node's type-stripping runner requires explicit extensions.
import { resolveCmsLink, validateCmsLinkValue } from "../lib/cmsLinks.ts";

const now = new Date("2026-08-26T08:00:00.000Z");
const page = createPage("2026 中秋限定禮盒", [], now);
assert.equal(page.status, "draft", "new page starts as draft");
assert.match(page.id, /^page-/u, "stable page ID");
assert.match(page.slug, /^story-20260826-/u, "safe generated route");

const hero = createSection("hero");
hero.title = "月光限定";
hero.motion.delayMs = 10_000;
hero.ctas = [
  { id: newBuilderId("cta"), enabled: true, label: "立即購買", stylePreset: "primary", link: { type: "product", target: "coffee-a" } },
  { id: newBuilderId("cta"), enabled: false, label: "聯絡客服", stylePreset: "secondary", link: { type: "line", url: "https://line.me/example" } },
  { id: newBuilderId("cta"), enabled: true, label: "直接來電", stylePreset: "text", link: { type: "telephone", url: "08-777-6335" } },
];
page.draft.sections.push(hero);
validatePageDraft(page.draft, new Set(["coffee-a"]));
assert.equal(hero.ctas[1].label, "聯絡客服", "hidden CTA retains content");
assert.equal(resolveCmsLink(hero.ctas[2].link).href, "tel:087776335", "telephone normalized safely");
assert.equal(resolveCmsLink({ type: "email", url: "hello@example.com" }).href, "mailto:hello@example.com", "email destination");
assert.equal(resolveCmsLink({ type: "line", url: "https://line.me/example" }).valid, true, "LINE HTTPS destination");
assert.throws(() => validateCmsLinkValue({ type: "line", url: "javascript:alert(1)" }, "LINE"), /https/u, "executable protocol rejected");

const copy = duplicateSection(hero);
assert.notEqual(copy.id, hero.id, "duplicate section gets new ID");
assert.notEqual(copy.ctas[0].id, hero.ctas[0].id, "duplicate CTA gets new ID");
const duplicate = duplicatePage(page, [page], now);
assert.equal(duplicate.status, "draft", "duplicate page is draft");
assert.notEqual(duplicate.id, page.id, "duplicate page gets new ID");
assert.notEqual(duplicate.slug, page.slug, "duplicate page gets new route");

page.publishedSnapshot = structuredClone(page.draft);
page.status = "published";
const oldTitle = page.publishedSnapshot.title;
page.draft.title = "2026 中秋禮盒・月光限定";
assert.equal(page.publishedSnapshot.title, oldTitle, "draft edit does not mutate published snapshot");
const registry = publishedPageRegistry({ version: 1, updatedAt: now.toISOString(), pages: [page] });
assert.equal(resolveCmsLink({ type: "page", target: page.id }, { pages: registry }).href, `/pages/${page.slug}`, "stable page reference survives rename");
page.status = "unpublished";
assert.equal(resolveCmsLink({ type: "page", target: page.id }, { pages: publishedPageRegistry({ version: 1, updatedAt: now.toISOString(), pages: [page] }) }).valid, false, "unpublished reference fails safely");
assert.equal(pageReferenceCount({ cta: { type: "page", target: page.id } }, page.id), 1, "delete reference detection");

const tooMany = createSection("cta");
tooMany.ctas = Array.from({ length: 5 }, (_, index) => ({ id: newBuilderId("cta"), enabled: true, label: `CTA ${index}`, stylePreset: "primary" as const, link: { type: "none" as const } }));
assert.throws(() => validatePageDraft({ title: "Test", seoTitle: "", seoDescription: "", sections: [tooMany] }), /最多 4/u, "CTA hard maximum");

const unknown = structuredClone(page);
unknown.draft.sections = [{ ...createSection("text"), type: "future-section" }] as unknown as typeof unknown.draft.sections;
assert.doesNotThrow(() => validatePageStore({ version: 1, updatedAt: now.toISOString(), pages: [unknown] }), "unknown stored section is read-safe");

console.log("Page Builder contract assertions: PASS (draft/publish identity, links, visibility retention, duplication, limits, unknown safety)");
