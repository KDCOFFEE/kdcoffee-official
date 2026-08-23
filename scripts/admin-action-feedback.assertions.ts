import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createAdminCustomSectionDraft, isYouTubeAdminActionReady } from "../lib/customSectionAdminActionFeedback";
import { normalizeProductCustomSections } from "../lib/productCustomSectionsValidation";

const VIDEO_ID = "dQw4w9WgXcQ";
const SECTION_ID = "cs-44444444-4444-4444-8444-444444444444";
const FEATURE_ID = "fi-44444444-4444-4444-8444-444444444444";
const existing = normalizeProductCustomSections([{
  id: "cs-11111111-1111-4111-8111-111111111111",
  adminName: "Existing",
  enabled: true,
  type: "text",
  placement: "after_profile",
  order: 20,
  layout: "standard",
  content: { heading: "Existing Section" },
}]);

// A–C. Action readiness follows URL validity and required accessible title.
assert.equal(isYouTubeAdminActionReady("not-a-url", "Video title"), false);
assert.equal(isYouTubeAdminActionReady(`https://youtu.be/${VIDEO_ID}`, "  "), false);
assert.equal(isYouTubeAdminActionReady(`https://youtu.be/${VIDEO_ID}?t=20`, "Video title"), true);

// D. UI readiness does not alter the canonical provider normalization contract.
const canonical = normalizeProductCustomSections([{ ...existing[0], media: { provider: "youtube", videoId: VIDEO_ID, title: "Video title", position: "media-top" } }])[0];
assert.deepEqual(canonical.media, { provider: "youtube", videoId: VIDEO_ID, title: "Video title", position: "media-top" });

// E/G/J/K. One draft is added with one stable ID, hidden default, and no mutation.
const existingBefore = JSON.stringify(existing);
let sectionIdCalls = 0;
const draft = createAdminCustomSectionDraft({
  type: "features",
  sections: existing,
  createSectionId: () => { sectionIdCalls += 1; return SECTION_ID; },
  createFeatureId: () => FEATURE_ID,
});
const next = [...existing, draft];
assert.equal(next.length, existing.length + 1);
assert.equal(sectionIdCalls, 1);
assert.equal(draft.id, SECTION_ID);
assert.equal(draft.enabled, false);
assert.equal(JSON.stringify(existing), existingBefore);

// I. The established ten-Section maximum remains enforced.
const tenSections = Array.from({ length: 10 }, (_, index) => ({ ...existing[0], id: `cs-${String(index).padStart(8, "0")}-1111-4111-8111-111111111111` }));
assert.throws(() => createAdminCustomSectionDraft({ type: "text", sections: tenSections }));

const managerSource = readFileSync("components/admin/CustomProductSectionManager.tsx", "utf8");
const mediaEditorSource = readFileSync("components/admin/CustomSectionMediaEditor.tsx", "utf8");
const cssSource = readFileSync("app/globals.css", "utf8");

// F/H. Immediate duplicate guard and expanded-ID registration are explicit local UI state.
assert.match(managerSource, /if \(creatingRef\.current \|\| atLimit\) return;/u);
assert.match(managerSource, /creatingRef\.current = true;/u);
assert.match(managerSource, /new Set\(current\)\.add\(section\.id\)/u);
assert.match(managerSource, /open=\{expandedSectionIds\.has\(section\.id\)\}/u);
assert.match(managerSource, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/u);
assert.match(managerSource, /is-newly-created/u);

// Shared affordance, disabled semantics, helper, and success status remain visible contracts.
assert.match(mediaEditorSource, /disabled=\{!youtubeActionReady\}/u);
assert.match(mediaEditorSource, /加入 YouTube 影片/u);
assert.match(mediaEditorSource, /✓ YouTube 影片已加入/u);
assert.match(managerSource, /aria-live="polite"/u);
assert.match(cssSource, /\.custom-section-primary-action\s*\{/u);
assert.match(cssSource, /\.custom-section-primary-action:hover:not\(:disabled\)/u);
assert.match(cssSource, /\.custom-section-primary-action:active:not\(:disabled\)/u);
assert.match(cssSource, /\.custom-section-primary-action:focus-visible/u);
assert.match(cssSource, /\.custom-section-primary-action:disabled/u);

// L. This Admin-only phase must not alter frontend renderer output.
const rendererSource = readFileSync("components/commerce/CustomProductSectionRenderer.tsx", "utf8");
assert.equal(createHash("sha256").update(rendererSource).digest("hex").toUpperCase(), "E92C385060160748CE23B51DD439E3740A4D53BE541F09212134DD0D1F9283E2");
assert.doesNotMatch(rendererSource, /custom-section-action|is-newly-created/u);

console.log("Admin action feedback assertions passed.");
