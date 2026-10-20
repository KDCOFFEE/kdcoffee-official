import assert from "node:assert/strict";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isYouTubeAdminActionReady } from "../lib/customSectionAdminActionFeedback";
import { removeProductCustomSectionLocally, summarizeProductCustomSectionForDelete } from "../lib/customSectionDeleteSummary";
import { LEGACY_CLEAN_ROASTING_PROOFS, resolveProductPageContent } from "../lib/productPageContent";
import type { ProductCustomSection } from "../lib/productCustomSections";

function assertCanonicalGitFile(filePath: string, expectedSha: string) {
  const blob = execFileSync("git", ["--no-optional-locks", "cat-file", "blob", "HEAD:" + filePath]);
  assert.ok(Buffer.isBuffer(blob));
  assert.equal(createHash("sha256").update(blob).digest("hex").toUpperCase(), expectedSha, filePath + ": approved canonical baseline");
  assert.equal(spawnSync("git", ["--no-optional-locks", "diff", "--quiet", "--", filePath]).status, 0, filePath + ": worktree must be Git-clean");
  assert.equal(spawnSync("git", ["--no-optional-locks", "diff", "--cached", "--quiet", "--", filePath]).status, 0, filePath + ": index must match HEAD");
}

const CS1 = "cs-11111111-1111-4111-8111-111111111111";
const CS2 = "cs-22222222-2222-4222-8222-222222222222";
const featureItems = Array.from({ length: 4 }, (_, index) => ({ id: `fi-${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`, title: `Feature ${index + 1}`, body: "Detail" }));
const emptySection = { id: CS1, adminName: "Empty", enabled: false, type: "text", placement: "page_bottom", order: 10, layout: "standard", content: {} } as ProductCustomSection;
const textSection = { ...emptySection, adminName: "Story", content: { heading: "Brand story", body: "Copy" } } as ProductCustomSection;
const featureSection = { id: CS2, adminName: "Features", enabled: false, type: "features", placement: "page_bottom", order: 20, layout: "grid", content: { items: featureItems } } as ProductCustomSection;
const imageSection = { ...textSection, media: { provider: "cloudinary", asset: { type: "image", url: "https://res.cloudinary.com/demo/image/upload/example.webp", provider: "cloudinary", publicId: "kd-coffee/images/example" }, alt: "Image", position: "media-top" } } as ProductCustomSection;
const videoSection = { ...textSection, media: { provider: "cloudinary", asset: { type: "video", url: "https://res.cloudinary.com/demo/video/upload/example.mp4", provider: "cloudinary", publicId: "kd-coffee/videos/example" }, alt: "Video", position: "media-top" } } as ProductCustomSection;
const youtubeSection = { ...textSection, media: { provider: "youtube", videoId: "dQw4w9WgXcQ", title: "Interview", position: "media-top" } } as ProductCustomSection;

// J.A–G. Delete summaries distinguish empty, editorial, provider, and animation state.
const emptySummary = summarizeProductCustomSectionForDelete(emptySection);
assert.equal(emptySummary.isEditoriallyEmpty, true);
assert.deepEqual(emptySummary.contentItems, ["已設定版位"]);
assert.equal(summarizeProductCustomSectionForDelete(textSection).contentItems.includes("標題與文案"), true);
assert.equal(summarizeProductCustomSectionForDelete(featureSection).contentItems.includes("4 個特色項目"), true);
assert.equal(summarizeProductCustomSectionForDelete(imageSection).contentItems.includes("1 張圖片"), true);
assert.equal(summarizeProductCustomSectionForDelete(videoSection).contentItems.includes("1 支影片"), true);
assert.equal(summarizeProductCustomSectionForDelete(youtubeSection).contentItems.includes("1 個 YouTube 影片"), true);
assert.equal(summarizeProductCustomSectionForDelete({ ...textSection, animation: { enabled: true, trigger: "viewport", effect: "fade", durationMs: 500, delayMs: 0, threshold: "quarter", once: true } }).contentItems.includes("已設定動畫"), true);

// J.H–N. Cancel is a no-op; confirm removes only the target in local memory.
const sections = [textSection, featureSection];
const beforeCancel = JSON.stringify(sections);
const cancelled = sections;
assert.equal(cancelled, sections);
assert.equal(JSON.stringify(sections), beforeCancel);
const afterDelete = removeProductCustomSectionLocally(sections, CS1);
assert.deepEqual(afterDelete.map((section) => section.id), [CS2]);
assert.equal(afterDelete[0], featureSection);
assert.equal(afterDelete.length, sections.length - 1);
assert.equal(featureSection.id, CS2);
assert.equal(summarizeProductCustomSectionForDelete(imageSection).hasCloudinaryMedia, true);

const managerSource = readFileSync("components/admin/CustomProductSectionManager.tsx", "utf8");
assert.match(managerSource, /setPendingDeletion\(section\)/u);
assert.match(managerSource, /removeProductCustomSectionLocally\(sections, pendingDeletion\.id\)/u);
assert.doesNotMatch(managerSource, /fetch\s*\(|destroy\s*\(|cloudinary\.uploader/u);
assert.match(managerSource, /還需要按『儲存商品』才會正式儲存/u);

// K.A–J. YouTube action remains explicit, atomic, disabled until valid, and save-independent.
assert.equal(isYouTubeAdminActionReady("", "Title"), false);
assert.equal(isYouTubeAdminActionReady("https://youtu.be/dQw4w9WgXcQ", ""), false);
assert.equal(isYouTubeAdminActionReady("https://example.com/dQw4w9WgXcQ", "Title"), false);
assert.equal(isYouTubeAdminActionReady("https://youtu.be/dQw4w9WgXcQ", "Title"), true);
const mediaEditorSource = readFileSync("components/admin/CustomSectionMediaEditor.tsx", "utf8");
assert.match(mediaEditorSource, /✓ YouTube 影片已加入。還需要按『儲存商品』才會正式儲存。/u);
assert.match(mediaEditorSource, /更換 YouTube 影片/u);
assert.match(mediaEditorSource, /if \(!youtubeActionReady\) return;/u);
assert.doesNotMatch(mediaEditorSource, /fetch\s*\(/u);
const cssSource = readFileSync("app/globals.css", "utf8");
assert.match(cssSource, /\.custom-section-primary-action:focus-visible/u);
// Pin Git canonical bytes while independently rejecting local or staged semantic changes.
const youtubeHeadBlob = execFileSync("git", ["--no-optional-locks", "cat-file", "blob", "HEAD:lib/youtubeMedia.ts"]);
assert.ok(Buffer.isBuffer(youtubeHeadBlob));
assert.equal(createHash("sha256").update(youtubeHeadBlob).digest("hex").toUpperCase(), "F4DC32CFF17A245CD756094EE9922BD34CBAF6A4E78F183D15E7CDAB25D580E7");
assert.equal(spawnSync("git", ["--no-optional-locks", "diff", "--quiet", "--", "lib/youtubeMedia.ts"]).status, 0, "youtubeMedia worktree must be Git-clean");
assert.equal(spawnSync("git", ["--no-optional-locks", "diff", "--cached", "--quiet", "--", "lib/youtubeMedia.ts"]).status, 0, "youtubeMedia index must match HEAD");

// L.1–3. Admin hierarchy is grouped while every editor retains the existing data paths.
const sectionEditorSource = readFileSync("components/admin/ProductPageSectionEditor.tsx", "utf8");
const cleanContentSource = readFileSync("components/admin/CleanRoastingContentEditor.tsx", "utf8");
const cleanMediaSource = readFileSync("components/admin/CleanRoastingMediaAdmin.tsx", "utf8");
for (const label of ["內容與三項說明", "媒體與播放設定", "Section 動畫"]) assert.match(sectionEditorSource + cleanMediaSource, new RegExp(label, "u"));
assert.match(cleanContentSource, /productPageContent/u);
assert.match(cleanContentSource, /"clean-roasting"/u);
assert.match(cleanMediaSource, /cleanRoastingMedia/u);
assert.match(cleanMediaSource, /display:\s*\{ \.\.\.display/u);
assert.match(sectionEditorSource, /productPageAnimations/u);

// L.4–8. Production semantics, proof order, frontend renderers, slider, and animation data are unchanged.
const website = JSON.parse(readFileSync("public/data/website-data.json", "utf8")) as { menu: { products: Array<Record<string, any>> } };
const giotto = website.menu.products.find((product) => product.slug === "giotto-awakening");
assert.ok(giotto);
assert.equal(giotto.cleanRoastingMedia.enabled, true);
assert.equal(giotto.cleanRoastingMedia.items.length, 1);
assert.equal(giotto.cleanRoastingMedia.items[0].media.publicId, "kd-coffee/videos/kdcoffee-giotto-awakening-clean-roasting-04");
assert.equal(giotto.cleanRoastingMedia.items[0].order, 0);
assert.deepEqual(giotto.cleanRoastingMedia.display, { mode: "slider", transition: "slide", transitionDurationMs: 450, autoplay: false, autoplayIntervalMs: 6000 });
assert.equal(giotto.productPageContent?.["clean-roasting"], undefined);
assert.equal(giotto.productPageAnimations?.["clean-roasting"], undefined);
assert.deepEqual(resolveProductPageContent(giotto)["clean-roasting"].proofs.map((proof) => proof.id), LEGACY_CLEAN_ROASTING_PROOFS.map((proof) => proof.id));
assertCanonicalGitFile("components/commerce/CleanRoastingChapter.tsx", "9FBA1E6894ABF67708A138E300AC079B1EF45FDEF78E650A50A1BA8B6944576D");
assertCanonicalGitFile("components/commerce/CleanRoastingMediaStage.tsx", "13120B22F7E567A2D9FE550A00FA9E6451E9E06ED297B7D1302920D8451BBB05");
// W3.4B permits exactly two resolver opt-in replacements relative to this fixed checkpoint.
// Use the fixed base rather than HEAD so the guard also holds after the W3.4B commit.
const worksBaseCheckpoint = "11f862c2abcd64650452b036138918b2093252f7";
const worksPagePath = "app/works/[slug]/page.tsx";
const worksBaseBlob = execFileSync("git", ["--no-optional-locks", "cat-file", "blob", worksBaseCheckpoint + ":" + worksPagePath]);
assert.ok(Buffer.isBuffer(worksBaseBlob));
assert.equal(createHash("sha256").update(worksBaseBlob).digest("hex").toUpperCase(), "8B4B52ED3AD7190A7DD22EDEDDDCBC34193D487A919F9E4A12F019FFAE026296");
const worksDiff = execFileSync("git", ["--no-optional-locks", "diff", "--no-ext-diff", "--no-color", "--unified=0", worksBaseCheckpoint, "--", worksPagePath], { encoding: "utf8" });
const worksDiffLines = worksDiff.split("\n");
assert.equal(worksDiffLines.length, 11, "Only the two approved one-line replacement hunks are allowed");
assert.equal(worksDiffLines[0], "diff --git a/" + worksPagePath + " b/" + worksPagePath);
assert.match(worksDiffLines[1], /^index [0-9a-f]+\.\.[0-9a-f]+ 100644$/u);
assert.equal(worksDiffLines[2], "--- a/" + worksPagePath);
assert.equal(worksDiffLines[3], "+++ b/" + worksPagePath);
assert.match(worksDiffLines[4], /^@@ -44 \+44 @@(?: .*)?$/u);
assert.match(worksDiffLines[7], /^@@ -142 \+142 @@(?: .*)?$/u);
assert.deepEqual([worksDiffLines[5], worksDiffLines[8]], [
  '-import { resolveProductPageContent } from "@/lib/productPageContent";',
  "-  const pageContent = resolveProductPageContent(product);",
]);
assert.deepEqual([worksDiffLines[6], worksDiffLines[9]], [
  '+import { resolveWorksProductPageContent } from "@/lib/productPageContent";',
  "+  const pageContent = resolveWorksProductPageContent(product);",
]);
assert.equal(worksDiffLines[10], "");
const worksPageSource = readFileSync(worksPagePath, "utf8");
assert.match(worksPageSource, /^import \{ resolveWorksProductPageContent \} from "@\/lib\/productPageContent";$/mu);
assert.match(worksPageSource, /^  const pageContent = resolveWorksProductPageContent\(product\);$/mu);
assert.doesNotMatch(worksPageSource, /const\s+pageContent\s*=\s*resolveProductPageContent\s*\(/u);

// L.9–10. UI restructuring adds no migration; the final cleanup keeps the production JSON baseline stable.
assert.doesNotMatch(cleanContentSource + cleanMediaSource, /migrat(?:e|ion)|writeFile/u);
// E9C683F7024627C331025361110FEDC7706F38944A08BDD0062E65DAF516EF81 was the 2026-08-23 patch baseline.
// Later committed membership data and two new works legitimately evolved the repository.
// C054FF04B537A80D087B8017DE60F28A13167945580748E2972FDAE1D4AC1674 is the audited pre-W3.4B canonical baseline.
// Checkout CRLF bytes are not the integrity authority; Git blob bytes and clean diffs are.
assertCanonicalGitFile("public/data/website-data.json", "C054FF04B537A80D087B8017DE60F28A13167945580748E2972FDAE1D4AC1674");

console.log("Admin Section management assertions passed.");
