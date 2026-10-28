# CS.1F shared media safety refactor — 2026-10-28

**CS.1F SHARED MEDIA SAFETY REFACTOR COMPLETE — OWNER QA REQUIRED**

Production baseline / unchanged HEAD: `3b93f3eb7c41ceba4565bfe343ce6a986f035274`.
Branch: `codex/cs1-customer-service-center-20261027`.
Implementation remains in the dedicated CS.1 worktree. No commit, push, deployment, production CMS/data access for writes, or J6/old-workspace content modification.

## Shared architecture and access policy

`lib/websiteImages.ts` owns generic decoded-image safety, the extracted existing optimizer, filename identity and AssetRecord construction. The optimizer is moved unchanged: rotate; resize inside 1800 × 1800 without enlargement; WebP quality 84, effort 4. `lib/pageBuilderImages.ts` is a compatibility re-export; no second Sharp implementation exists.

`lib/assetImageUploads.ts` owns the extracted canonical storage/registration flow: existing storage helpers, UUID identity, immutable wx write, existing AssetRecord, existing withFileLock + atomicWriteJson, registry version update and failure cleanup. It contains no authentication or Customer Service policy.

`lib/assetImages.ts` owns registered-asset existence/path resolution and shared validation. `lib/media.ts` contains the pure local raster-reference guard, moved without expanding accepted paths. Private/order/member paths and arbitrary URLs remain excluded.

Final new CS Hero flow:

Owner Admin → existing Customer Service API POST → existing requireAdminAuthenticated + Owner role gate → existing isSameOriginRequest plus required Origin / same-origin fetch metadata → uploadWebsiteImageAsset(validateSafety: true) → shared inspectUploadedImage → the existing shared optimizer → shared canonical storage + AssetRecord + atomic persistence → returned canonical asset → existing shared picker/preview → explicit CMS Save stores only `{ src, alt, position }`.

The POST is an access adapter on the existing Customer Service endpoint, not a second upload engine. Upload alone does not save Customer Service content. Page Builder / Works retain isAdminAuthenticated(), including non-Owner Admin acceptance and no Origin requirement; their historical input rules remain JPG/PNG/WebP up to 15 MB. New strict validation is opt-in and is not applied to those callers.

Customer Service retains its 12 MB file limit, MIME/extension/actual format agreement, valid decode, 40M pixels, 12000px per dimension, single frame, safe filename and canonical path restrictions. A missing persistent root still fails closed. Tests exercise actual 40M-limit and multi-frame inputs, authorization and missing/foreign/cross-site Origin, immutable create-only behavior, decode failure and atomic rename failure.

## CS-specific processing removed

- customerServiceHeroServer.ts retains only presentation fallback and adapts shared errors; no decoder, filesystem path engine, upload guard or thresholds.
- customerServiceHero.ts retains only presentation defaults, alt/position and crop behavior; its path allowlist moved to the shared media module.
- AssetUploadButton uses a generic uploadUrl prop, with its existing raw API default unchanged; no customer-service-hero processing knowledge.
- /api/admin/assets/upload is restored byte-for-byte to the production-baseline implementation. Gifts continues using that unchanged raw pipeline.
- No Customer Service compression, SEO, naming, storage or registry engine remains. Hero alt remains Owner editable. No schema or model changed.

## Permanent Owner media rule

> New KD Coffee image/video features must reuse existing shared Media / Asset infrastructure. Feature-specific upload, compression, SEO, storage, or media-processing engines are prohibited. If existing shared capability is insufficient, STOP for Owner approval before extending the shared system.

Access policy belongs to the calling surface. Sharing media processing does not require identical authorization across existing Admin surfaces. Historical raw Asset, Homepage optimized and Cloudinary video paths are not consolidated in this phase. Protected README files are unchanged.

## Isolated image evidence

Synthetic test input, not a KD Coffee product or production image:

| | Format | Dimensions | Bytes |
|---|---|---|---:|
| Original | JPEG | 3600 × 2400 | 3,309,685 |
| Actual Owner API upload | WebP | 1800 × 1200 | 31,976 |

The new shared output equals the captured pre-extraction Page Builder output byte-for-byte. Fixed-UUID filename identity and every AssetRecord field also match. Actual Owner POST returns the canonical PAGEIMG asset and matching local media reference. Evidence: `<local-qa-directory>/shared-image-evidence.json` and `legacy-image-evidence.json`.

No existing Hero was re-uploaded or converted. Default public screenshots at 1440 and 390 compare to CS.1E with **zero differing pixels**. Existing Hero URL/source and visual remain unchanged until an Owner explicitly chooses and saves another image.

## Validation

| Check | Result |
|---|---|
| Customer Service unit | 15 PASS |
| Hero security/config/upload | 14 PASS |
| Shared optimizer / validator / access / persistence | 10 PASS |
| Customer Service production browser | 42 PASS |
| Canonical Asset upload | 10 PASS |
| Gifts inline upload browser | 13 PASS; synthetic 11-draft catalog byte-identical |
| Asset failure atomicity | 21 PASS |
| Owner authorization | 15 PASS |
| Page Builder image optimization/metadata/mixed-media/reorder/visibility | PASS |
| Works Admin Hero preview J1E1 | 18 PASS |
| Works Hero motion J1F5C / final state J1F5D | 6 / 33 PASS |
| Current Works SEO J1F6 | 15 PASS |
| TypeScript | PASS |
| ESLint, all 16 CS.1F source/test files | PASS, zero diagnostics |
| Full repository npm run lint | FAIL: 226 existing errors / 147 warnings, zero errors in CS.1F files |
| Production build | PASS |
| Public browser console / React key warning | 0 / 0 |
| Public + Admin accessibility | Zero Axe WCAG A/AA violations in tested scopes |
| Responsive / overflow | 360, 390, 430, 768, 1280, 1440, 1600 tested; no horizontal overflow |
| Owner dev preview / existing auth | Public 200, Admin 200, API 200; 5 tabs; read-only runtime hashes unchanged |

Additional legacy Works J1F1 script was run and fails at line 62 because it expects Works SEO to remain disconnected. The later Works SEO implementation and its test already exist in the baseline; J1F6 passes 15 tests. The failing script, Works page and dependencies were not changed. This is a baseline test-contract mismatch, not reported as a pass and not repaired in this phase.

Full-repository lint errors occur in unchanged historical files and are not repaired here. Phase files pass. Existing Store tracing diagnostics have 11 repeated generated traces, all from next.config.ts → unchanged Store repository/offer paths; no new diagnostic origin. Prior evidence recorded counts 8 and 5 with the same origin. Classification: **BASELINE / NON-CS1 — NON-BLOCKING**. Count and origin evidence is in build-warning-classification.json.

A local incomplete Sharp install initially prevented resolution; the already-locked Sharp 0.34.5 was restored from npm cache without modifying package.json or package-lock.json. The final production build and browser suites passed.

## Exact CS.1F changed files

These are changes relative to the captured CS.1E working state, not all accumulated uncommitted CS.1 files. The restored raw upload file is included because its CS.1E feature gate was removed; it now has no diff from production HEAD. Existing data/customer-service/.gitignore predates this phase.

- [app/api/admin/customer-service/route.ts](../app/api/admin/customer-service/route.ts)
- [components/admin/CustomerServiceHeroEditor.tsx](../components/admin/CustomerServiceHeroEditor.tsx)
- [lib/customerServiceContent.ts](../lib/customerServiceContent.ts)
- [lib/customerServiceHero.ts](../lib/customerServiceHero.ts)
- [lib/customerServiceHeroServer.ts](../lib/customerServiceHeroServer.ts)
- [scripts/test-customer-service-browser.mjs](../scripts/test-customer-service-browser.mjs)
- [scripts/test-customer-service-hero.mts](../scripts/test-customer-service-hero.mts)
- [app/api/admin/assets/upload/route.ts](../app/api/admin/assets/upload/route.ts)
- [app/api/admin/pages/images/route.ts](../app/api/admin/pages/images/route.ts)
- [components/admin/AssetUploadButton.tsx](../components/admin/AssetUploadButton.tsx)
- [lib/media.ts](../lib/media.ts)
- [lib/pageBuilderImages.ts](../lib/pageBuilderImages.ts)
- [lib/assetImageUploads.ts](../lib/assetImageUploads.ts)
- [lib/assetImages.ts](../lib/assetImages.ts)
- [lib/websiteImages.ts](../lib/websiteImages.ts)
- [scripts/test-shared-website-images.mjs](../scripts/test-shared-website-images.mjs)
- [docs/CS1F_SHARED_MEDIA_SAFETY_20261028.md](CS1F_SHARED_MEDIA_SAFETY_20261028.md)

## Safety and review

All 971 source hashes captured at phase start were checked. Only the listed source changes/new shared modules, regression and report belong to this phase. Existing business logic, authoritative cancellation/return/refund/KD/reward/order/fulfillment/commerce, auth engine, CMS schema, data models, protected JSON, production data and production uploads remain unchanged. Existing static photos are read only. No production or J6 dirty data was copied. .env.local, runtime snapshot, synthetic fixtures, credentials and QA evidence remain gitignored. No staging entries; branch and HEAD unchanged; git diff --check passes.

Owner preview: Customer Service (`/customer-service` on the configured preview server) and Admin Customer Service (`/admin/customer-service` on the configured preview server), using existing Owner authentication. No account or authentication bypass was created.

Screenshots and evidence:

- customer-service-1440.png (local QA artifact; not committed)
- customer-service-768.png (local QA artifact; not committed)
- customer-service-390.png (local QA artifact; not committed)
- admin-page-hero-1440.png (local QA artifact; not committed)
- admin-page-hero-390.png (local QA artifact; not committed)
- admin-hero-asset-picker.png (local QA artifact; not committed)
- public-selected-hero-1440.png (local QA artifact; not committed)
- public-selected-hero-390.png (local QA artifact; not committed)
- boundary.json (local QA artifact; not committed)
- shared-image-evidence.json (local QA artifact; not committed)
- browser-results.json (local QA artifact; not committed)
- inline-browser-results.json (local QA artifact; not committed)
- build-warning-classification.json (local QA artifact; not committed)
- owner-preview-check.json (local QA artifact; not committed)
