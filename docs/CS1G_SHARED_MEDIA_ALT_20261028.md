# CS.1G shared media ALT / SEO metadata fix — 2026-10-28

**CS.1G SHARED MEDIA ALT / SEO METADATA FIX COMPLETE — OWNER QA REQUIRED**

Unchanged branch: `codex/cs1-customer-service-center-20261027`.
Unchanged production-baseline HEAD: `3b93f3eb7c41ceba4565bfe343ce6a986f035274`.
All implementation is in the existing isolated CS.1 worktree. No commit, push or deployment.

## Exact root cause and old chain

The Owner-reported record was inspected read-only in the approved local runtime Asset Library. Its ID is `PAGEIMG-C5BEBE6CDFE0`; its original filename is `00000000-0000-4000-8000-000000000001.png`. Both name and alt contain that filename's UUID stem. Its canonical optimized path contains the original UUID plus the separate generated Asset ID suffix.

The offending UUID came from the **original uploaded filename**, not from the optimizer replacing meaningful filename metadata with its newly generated Asset ID.

Old chain:

`File.name` → uploadWebsiteImageAsset forwards originalFileName → createWebsiteImageAsset uses `path.parse(originalFileName).name.trim()` → copies readableName to both AssetRecord.name and AssetRecord.alt → upload response returns that record → CustomerServiceHeroEditor upload callback uses `asset.alt || asset.name` → UUID copied into Hero ALT.

The picker used the same unguarded `asset.alt || asset.name` in its choose callback; ImageLibraryPicker also used that expression for its thumbnail ALT. Thus legacy UUID metadata could re-enter through either upload or selection.

The original filename was already preserved correctly. For this actual file it contains no human description, and its seoStem is also an internal canonical filename derived from that UUID. There is no meaningful description to recover automatically. The correct initial ALT is empty until the Owner describes the image.

## Audit of existing metadata conventions

| Surface | Established behavior found |
|---|---|
| Homepage upload | Keeps originalFileName; desiredName/seoStem control canonical filenames. Share-image/media editors use asset.alt then asset.name. |
| Page Builder optimized upload | Original filename stem supplies display name and initial alt; full originalFileName remains on AssetRecord. Canonical UUID-bearing filename is a separate concern. |
| Works / Coffee | Works picker retains an existing page ALT, then uses asset.alt/name. Artwork ProductManager has contextual product/purpose ALT, title and caption; that product-specific generator is not applicable to Customer Service. |
| Store | storeHeroLibraryAssets already rejects UUID / opaque hex names from readable title fallback and preserves filename search metadata. This existing guard was extracted into the shared metadata module. |
| Gifts | Existing raw Asset upload retains original filename and editable metadata; picker/upload initialization uses asset.alt/name. Its upload/commerce/publication pipeline is unchanged. |
| Asset Library | AssetRecord already has name, alt, seoStem and optional originalFileName. AssetManager edits ALT/SEO explicitly. No shared AssetRecord title/caption field or generic automatic SEO-stem-to-description service exists. |

The fix centralizes the existing alt/name/original-filename conventions and extends the existing opaque-name guard. It does not add a description generator, infer image content, translate slugs, or derive ALT from storage names/seoStem.

## Corrected shared chain

`lib/assetMetadata.ts` is a pure, client/server-safe shared utility:

1. meaningful explicit asset.alt;
2. meaningful AssetRecord.name;
3. meaningful originalFileName stem, using the existing filename-stem convention;
4. empty string; Owner must enter a description before Customer Service Save.

isMeaningfulAssetText rejects UUIDs (including UUID filenames), opaque hex hashes, known internal Asset IDs, the asset's exact internal id/path/seoStem, canonical generated filenames, storage paths, media-extension-only values, markup and URL/data values. Meaningful descriptions, including Chinese filenames and descriptions with a colon, remain usable. It does not invent content.

createWebsiteImageAsset now uses resolveAssetAlt for initial metadata. Filename identity, name, originalFileName, canonical path, AssetRecord structure and registration are unchanged. CustomerServiceHeroEditor calls the same resolver for upload and selection. ImageLibraryPicker thumbnail ALT uses the resolver too. Store's existing display-label logic calls the extracted shared guard; its source/filter/search and media references remain unchanged.

Owner-entered meaningful Hero ALT is not re-generated on save/reload. Customer Service Save rejects opaque identifiers using the shared guard. Public Hero resolution uses that same guard to suppress legacy opaque ALT in memory, retaining the selected image and leaving stored CMS/AssetRecord bytes untouched. No historical metadata migration or bulk rewrite occurs.

There is no Customer Service ALT generator or SEO helper. Hero configuration still stores only `{ src, alt, position }`; CMS schema and data models are unchanged. A small field hint explains that a missing description requires Owner input.

## Required cases and public verification

- A: explicit `KD Coffee 禮盒` wins over other metadata.
- B: meaningful display name is reused; if it is unavailable, `KD咖啡禮盒秋日限定.jpg` supplies its existing filename stem.
- C: `00000000-0000-4000-8000-000000000001` and its extension variants initialize empty ALT. Hash/ID/path-only cases also remain empty.
- D: `KD Coffee 精品咖啡禮盒` survives actual Admin Save → reload → public rendered Hero exactly.
- E: the real Asset Picker exercises explicit ALT, display name, meaningful original filename and UUID-only fallback with the same shared behavior as upload. Historical library bytes remain unchanged.

Browser checks inspect public image ALT attributes and the rendered response HTML. The reported UUID, Asset ID and /uploads path do not appear as image ALT. The UUID may legitimately remain in the canonical src URL; src is not rewritten. Legacy saved UUID ALT renders as empty without a GET migration. Empty/opaque submissions do not save over the existing CMS document.

## Regression results

| Check | Result |
|---|---|
| New shared metadata cases / actual Owner upload / save / legacy rendering | 9 PASS |
| Customer Service unit | 15 PASS |
| Hero | 14 PASS |
| Shared media safety / optimizer / access / atomic failure | 10 PASS |
| Canonical Asset Library upload | 10 PASS |
| Page Builder images / metadata / mixed media / reorder / visibility | PASS |
| Works media preview J1E1 | 18 PASS |
| Gifts inline upload browser | 13 PASS; synthetic 11-draft catalog unchanged |
| Customer Service production browser, including real Asset Picker | 46 PASS |
| Public console / React key warnings | 0 / 0 |
| Responsive and accessibility | No horizontal overflow at tested widths; existing public/Admin Axe scopes have zero WCAG A/AA violations |
| TypeScript | PASS |
| Changed-file ESLint (all 9 source/test files) | PASS |
| Final production build | PASS |

An additional historical Store Hero script, test-phase-j6d2a-store-hero.mjs, cannot start because this isolated baseline lacks `data/store-domain/catalog.json`, which it hashes before setting up its test fixtures. No protected catalog was created/copied to satisfy that unrelated prerequisite. Store's shared guard is covered by the new metadata unit suite; actual Asset Picker behavior is covered by the production-browser suite. This extra script is not reported as passing.

The final 7 Store tracing warnings are baseline/non-CS1 and non-blocking; every warning has the existing next.config.ts / Store trace origin. No unrelated historical lint/test failure was repaired. The browser harness now waits for the existing animation-frame focus transfer and scopes the validation alert away from Next's route announcer; no FAQ implementation was changed.

## CS.1F optimization and safety unchanged

The optimizeWebsiteImage function is byte-for-byte unchanged: rotate → inside 1800 × 1800 without enlargement → WebP quality 84 / effort 4. Actual UUID-named upload in the new tests produces the same stored bytes as the pre-CS.1F extraction evidence (JPEG 3600 × 2400 / 3,309,685 bytes → WebP 1800 × 1200 / 31,976 bytes).

The source hashes of uploadWebsiteImageAsset, storage helpers, atomic persistence, raw upload API, Page Builder API, Customer Service API, Owner auth, same-origin helper, package.json and package-lock.json remain unchanged in CS.1G. The shared safety validator function bodies are unchanged. The 12 MB / 40M pixels / 12000px / single-frame safety policy is unchanged. No compression, registration, access-policy or business-rule change.

## Exact CS.1G files

Relative to the captured CS.1F working state (not all accumulated CS.1 changes):

- [components/admin/CustomerServiceHeroEditor.tsx](../components/admin/CustomerServiceHeroEditor.tsx)
- [lib/customerServiceHeroServer.ts](../lib/customerServiceHeroServer.ts)
- [lib/customerServiceStore.ts](../lib/customerServiceStore.ts)
- [lib/websiteImages.ts](../lib/websiteImages.ts)
- [scripts/test-customer-service-browser.mjs](../scripts/test-customer-service-browser.mjs)
- [components/admin/ImageLibraryPicker.tsx](../components/admin/ImageLibraryPicker.tsx)
- [lib/storeHeroMedia.ts](../lib/storeHeroMedia.ts)
- [lib/assetMetadata.ts](../lib/assetMetadata.ts)
- [scripts/test-asset-metadata.mjs](../scripts/test-asset-metadata.mjs)
- [docs/CS1G_SHARED_MEDIA_ALT_20261028.md](CS1G_SHARED_MEDIA_ALT_20261028.md)

## Safety and Owner QA

All 977 captured source-file hashes were checked. Only the files listed above changed or were added in this phase. No business rules, orders, fulfillment, KD, rewards, Store/Gift commerce, protected JSON, production data, production uploads, auth engine or CMS schema were modified. No J6 or old-workspace files were modified. The actual historical Owner QA UUID AssetRecord remains unchanged; no bulk rewrite/migration occurred. A final check used existing Owner authentication to select that exact reported record in the real local Admin: its picker thumbnail and Hero draft ALT are both empty. No Save was performed, and runtime CMS/Asset Library hashes stayed unchanged.

All synthetic upload/save/picker tests use isolated, ignored QA data. .env.local, approved runtime snapshot, test sessions and QA evidence stay gitignored. Existing Owner auth is used for local review. Staging is empty, HEAD/branch unchanged, git diff --check passes. No commit/push/deploy.

Owner preview: Customer Service (`/customer-service` on the configured preview server) / Admin Customer Service (`/admin/customer-service` on the configured preview server).

Evidence and captures:

- source-audit.json (local QA artifact; not committed)
- metadata-results.json (local QA artifact; not committed)
- browser-results.json (local QA artifact; not committed)
- boundary.json (local QA artifact; not committed)
- inline-browser-results.json (local QA artifact; not committed)
- customer-service-1440.png (local QA artifact; not committed)
- customer-service-768.png (local QA artifact; not committed)
- customer-service-390.png (local QA artifact; not committed)
- owner-approved-alt-1440.png (local QA artifact; not committed)
- owner-approved-alt-390.png (local QA artifact; not committed)
- build.log (local QA artifact; not committed)

Final Owner read-only verification: owner-preview-check.json (local QA artifact; not committed). Final full status: final-git-status.txt (local QA artifact; not committed).
