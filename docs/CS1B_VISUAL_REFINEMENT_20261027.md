# CS.1B — Public customer-service visual refinement

## Result and baseline

**CS.1B VISUAL REFINEMENT COMPLETE — OWNER VISUAL QA REQUIRED**

The accepted CS.1 implementation remains the functional baseline. HEAD is still `3b93f3eb7c41ceba4565bfe343ce6a986f035274`, on `codex/cs1-customer-service-center-20261027`, in the isolated CS.1 worktree. No commit, push or deployment was performed.

This phase changes public presentation and visual-QA tooling only. The existing CMS, auth, FAQ model/search/filter/accordion state, order reader, authoritative rule integrations and all commerce implementation remain unchanged.

## Visual changes

- Hero: a 42% image / 58% service composition on desktop, using the site's existing coffee-environment image. The mobile image band is compact; the 390px Hero measures 476px. Search remains the same working tool, with a more prominent input and CTA.
- Quick services: restrained SVG symbols, clear titles/descriptions and arrows, subtle depth and hover, and visible focus. Default ten-card layout is 5 × 2 from 1080px and 2 × 5 below that breakpoint. No blank two-cell area after Gifts.
- FAQ: stronger espresso active category, clearer question weight, quieter Q markers, refined circular plus/minus controls, subtle open/hover surfaces and tighter answer rhythm. Existing interaction handlers and keyboard navigation are preserved.
- Recent orders: the logged-out section is one compact service panel with login and order-help links. Logged-in rendering keeps the exact existing read-only result and fields.
- Contact: channel icons, purpose, exact configured value and explicit CTA. No hours were invented; the original unannounced message remains.
- Chrome: removed the CS-specific Header background and Logo filter overrides. No shared Header/Footer, navigation resolver, global stylesheet or asset mapping implementation was changed.

## Production visual sources and local QA

The previously approved strategy is retained:

- `<local-qa-directory>` is gitignored.
- Only the preview process sets `KD_DATA_DIR` to that directory; `.env.local` is unchanged.
- Shared Header reads `LOGO001` and current CMS navigation; shared Footer reads `LOGO002`.
- The snapshot came from existing authenticated CMS **GET** endpoints through normal Owner authentication. No forged session, CMS write or production data change was used.
- Original seven navigation records are passed through the existing resolver; the four published links match the production page exactly.
- Original `v08.svg` Header and `v04.svg` Footer assets are served byte-for-byte through the existing upload route.
- Hero image: the already-published `/images/home003/kd-coffee-choose-coffee-by-flavor-v01.webp`. Its original bytes remain in the ignored runtime. No new image was generated, no product image was edited, and no asset was written to protected uploads.
- Other snapshot fields remain explicitly identified baseline fallbacks; this is a minimal chrome/visual preview, not a claim that the full production catalog or customer data has been synchronized.

Source evidence: `<local-qa-directory>/chrome-source-manifest.json`, `<local-qa-directory>/local-source-verification.json`, and `<local-qa-directory>/visual-source.json`.

## Exact CS.1B file list

These are the **incremental CS.1B changes**, separate from the previously accepted uncommitted CS.1 work:

| File | Change |
| --- | --- |
| `app/customer-service/page.tsx` | Hero visual, service symbols/card markup, contact card presentation. Existing content loader and metadata logic retained. |
| `components/customer-service/ServiceExplorer.tsx` | Hero visual slot and FAQ presentation markup. Existing search/category/accordion handlers unchanged. |
| `components/customer-service/RecentServiceOrders.tsx` | Compact guest panel and visual order presentation; original reader and result logic retained. |
| `components/customer-service/CustomerService.module.css` | Public visual redesign, responsive grids, focus/hover/reduced-motion styling; remove Header/Logo appearance overrides. |
| `components/customer-service/ServiceIcon.tsx` | New small presentation-only SVG symbols; no dependency. |
| `scripts/test-customer-service-browser.mjs` | Reuse approved snapshot in isolated test fixtures, visual grid/Hero/chrome checks, section screenshots and document-coordinate capture. Existing functional assertions retained. |
| `docs/CS1B_VISUAL_REFINEMENT_20261027.md` | This report. |

No Admin component/API/model, package manifest/lockfile, shared chrome source, business-rule test, production JSON or production upload was changed in CS.1B.

Before copies are stored with non-source `.snapshot` extensions in ignored `<local-qa-directory>`. Protected before/after hashes are recorded in `protected-before.json` and `protected-after.json`.

## Validation

| Check | Result | Evidence under `<local-qa-directory>` |
| --- | --- | --- |
| Existing CS.1 tests | 15 PASS | `unit-test.log` |
| Production-browser suite | 22 PASS | `browser-test.log`, `browser-results.json` |
| Original functional checks | Retained and PASS | Search, category, keyboard accordion, empty state, auth/privacy, read-only recent orders, full Owner CMS editing, revision conflict, input safety and commerce data fingerprints |
| Viewports | 360 / 390 / 430 / 768 / 1280 / 1440 / 1600 PASS | Document width equals viewport at every size |
| Ten-card balance | PASS | Every row has five cards on desktop or two on tablet/mobile |
| Axe WCAG 2 A/AA and 2.1 AA | 0 violations in the new main content at 390 / 768 / 1440 | `browser-results.json` |
| Long expanded mobile answer | PASS | `faq-expanded-390.png`; no overflow |
| Browser JavaScript/hydration errors | 0 | `browser-results.json` |
| TypeScript | PASS | `typescript.log` |
| Scoped ESLint | PASS | `lint.log` |
| Production build | PASS | `build.log` |
| Existing Homepage CMS regression | PASS | `homepage-cms-regression.log` |
| Existing Store rendering regression | 71 PASS; 35 protected hashes unchanged | `store-rendering-regression.log` |
| Protected tracked-source diff | Empty | Existing commerce, business rules, global UI, JSON and uploads |
| CS.1 functional/CMS source hashes | Unchanged | `protected-after.json` |

The build emits 10 NFT warnings with the same unchanged Store import origin as the previously audited baseline (10); no new warning origin was found. Classification: **BASELINE / NON-CS1 — NON-BLOCKING**. See `build-warning-comparison.json`. Store was not changed.

Automated accessibility coverage targets `#service-main`; it does not replace Owner visual review or certify unrelated inherited components.

## Screenshots

All final screenshots are from the production build with the approved chrome snapshot. Full-page captures start at page top; close-ups use document-coordinate clipping so sticky chrome is not duplicated in the middle of an image. The page and its styles are not altered for capture.

Full pages:

- Desktop 1440 (local QA artifact; not committed)
- Tablet 768 (local QA artifact; not committed)
- Mobile 390 (local QA artifact; not committed)

Desktop close-ups:

- Hero (local QA artifact; not committed)
- Quick services (local QA artifact; not committed)
- FAQ (local QA artifact; not committed)
- Recent orders (local QA artifact; not committed)
- Contact (local QA artifact; not committed)
- Header / original Logo (local QA artifact; not committed)

Mobile close-ups:

- Hero (local QA artifact; not committed)
- Quick services (local QA artifact; not committed)
- FAQ (local QA artifact; not committed)
- Long expanded answer (local QA artifact; not committed)
- Recent orders (local QA artifact; not committed)
- Contact (local QA artifact; not committed)
- Header / original Logo (local QA artifact; not committed)

Signed-in fixture orders are also captured in `customer-service-member-1440.png` and `customer-service-member-390.png`. These contain synthetic test orders only. Owner preview uses the original local Owner authentication and the approved separate runtime; browser test accounts/keys are confined to test fixtures.

## Safety and handoff

- Cancellation, returns/refunds, fulfillment/order states, cart, checkout, pricing, inventory, KD, reward ledger, membership/subscription commerce, Store and Gift commerce/publication: **untouched**.
- FAQ/contact/quick-service CMS, auth, search behavior and recent-order reader: **untouched**.
- Protected `public/data/*.json`, production uploads, production CMS and J6 data: **untouched**.
- `.env.local`: remains ignored and unstaged; no secret values were printed or saved in QA reports.
- All work remains uncommitted in the isolated worktree. No push or deployment.

Owner preview: Customer Service (`/customer-service` on the configured preview server) and Owner editor (`/admin/customer-service` on the configured preview server), using the approved process-level runtime configuration.

**CS.1B VISUAL REFINEMENT COMPLETE — OWNER VISUAL QA REQUIRED**
