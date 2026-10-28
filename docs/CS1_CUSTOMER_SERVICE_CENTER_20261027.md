# CS.1 — Customer Service Center

## A. Baseline and workspace boundary

- Active development context: `KD_Coffee_Studio_J6_STORE_DEV_20261007`.
- Common Git metadata / historical checkout: `KD_Coffee_Studio_v15.6.0_UIUX_DEV_20260814`.
- Implementation: `the dedicated CS.1 isolated worktree`.
- Branch: `codex/cs1-customer-service-center-20261027`.
- Baseline and unchanged HEAD: `3b93f3eb7c41ceba4565bfe343ce6a986f035274`.
- Remote `refs/heads/j6-store-workspace` was verified with `git ls-remote` before creating the clean worktree. GitHub's default `main` is a different ref and was not substituted for production.
- No dirty source files were copied from the other workspaces. No push, deployment or production-data operation was performed.
- Read the installed Next 16.2.10 guides for Server/Client Components, Route Handlers, metadata and CSS before implementation.

## B. Audit findings

| Area | Existing source and decision |
| --- | --- |
| Header/navigation | `components/layout/Header.tsx`, `HeaderNavigation.tsx`, `lib/homepageCms.ts`; reuse the existing CMS-resolved navigation and auth/cart UI. |
| Footer/contact | `components/layout/Footer.tsx`, `components/home/ContactSection.tsx`; official LINE, Facebook, Email, phone and location already exist. Seed only these published channels as in-memory defaults. No published service-hours source was found. |
| Member/order entries | `/member#orders`, `#account`, `#rewards`, `#subscription`; order inquiry/details at `/orders/[orderNumber]`. Reuse those destinations. |
| Existing support | `lib/lineSupportPresets.ts` already treats personal services as links and reads existing member display copy. Its missing cancellation/hours explanations are not new policies. No complete existing public customer-service route was found. |
| Reusable UI | Existing Header/Footer, brand tokens, semantic links, native form controls and Admin page/breadcrumb conventions. Add a small accordion/search island with CSS Modules; no FAQ/animation runtime dependency. |
| CMS/Admin | `lib/giftCmsStore.ts`, `giftCmsTransport.ts`, `memberCenterCopyStore.ts`, `jsonFileStore.ts`, `adminAuthorization.ts`, `requestSecurity.ts`; reuse their owner-auth, explicit same-origin, revision, lock, backup and atomic persistence conventions. Do not route CS edits through commerce settings. |
| Recent orders | `getCurrentMember`, `listOrders`, `readFulfillmentStore`, `fulfillmentRecordForOrder`, `fulfillmentStateLabels`; same sources as the existing member/order surfaces. |
| Cancellation | `lib/orderCancellation.ts`, `orderInventoryPolicy.ts`, existing `OrderConversation`; keep eligibility/actions there. CS provides navigation and general assistance, with no copied predicate or alternate eligibility table. |
| Returns/refunds | No confirmed complete member return-request/withdrawal UI or authoritative universal return deadline found. Link to existing order inquiry/contact; do not invent a policy, deadline, entitlement or self-service button. |
| KD/credit | Existing `resolveMemberCopy` and the member/credit catalogs provide safety-waiting and credit lifecycle copy. The point name is read through `readPointDisplayName`; no conversion calculation, ledger projection or reward maturity engine is introduced. |
| Subscription/Coffee | Link to existing member subscription controls and official Works/monthly menu/product/checkout information. Do not calculate cycle availability, custom-roast dates or subscription state in CS. |
| Store/Gifts | `/store`, `/gifts` and existing canonical Store selectors/publication gates remain unchanged. No product/catalog data is loaded into the CS client. |
| SEO | Follow server metadata and canonical-origin helpers. Add CS to the existing sitemap. No duplicate FAQ structured-data policy is introduced. |

## C. Exact engineering files

Added:

- `app/customer-service/page.tsx`
- `app/admin/customer-service/page.tsx`
- `app/api/admin/customer-service/route.ts`
- `components/customer-service/ServiceExplorer.tsx`
- `components/customer-service/RecentServiceOrders.tsx`
- `components/customer-service/CustomerService.module.css`
- `components/admin/CustomerServiceManager.tsx`
- `components/admin/CustomerServiceManager.module.css`
- `lib/customerServiceContent.ts`
- `lib/customerServiceStore.ts`
- `lib/customerServiceSources.ts`
- `lib/customerServiceOrders.ts`
- `data/customer-service/.gitignore`
- `scripts/test-customer-service.mts`
- `scripts/customer-service-qa-fixture.mts`
- `scripts/test-customer-service-browser.mjs`
- `docs/CS1_CUSTOMER_SERVICE_CENTER_20261027.md`

Modified:

- `app/admin/page.tsx`: add the CS editor navigation entry only.
- `app/sitemap.ts`: add `/customer-service` only.
- `components/layout/Footer.tsx`: add the customer-service link only.
- `package.json`: add the two CS test commands; no dependency changes.
- `scripts/test-phase-j6d1-store-public-read-model.mts`: trim the trailing CR in one source-import assertion so the existing regression runs on a Windows CRLF checkout. No Store implementation change.

QA output, installed browser test tools and synthetic runtime data stay under ignored `<local-qa-directory>`. Lockfile and all existing business-rule/commerce source files are unchanged.

## D. Data flow

### Fixed structure

The server page composes Header, the Hero/search/FAQ island, server-rendered quick services, server-rendered recent orders, contact, related links and Footer. Only filtering, category selection, accordion interaction and the owner editor require new client JavaScript.

### Managed presentation content

`ServiceDocument` separates page/contact configuration, quick service cards and FAQ records. Missing CMS returns in-memory defaults and performs no initialization write. Owner edits persist only to:

`<KD_DATA_DIR or RAILWAY_VOLUME_MOUNT_PATH>/customer-service/content.json`

Local fallback: `data/customer-service/content.json`. Runtime files/backups are excluded from Git. Page layout and category definitions remain code-owned.

`GET/PUT /api/admin/customer-service` requires an authenticated Owner. PUT additionally requires an explicit valid same-origin Origin and rejects cross-site fetch metadata. The request stream is bounded to 1 MiB. Unknown fields, invalid/duplicate IDs, HTML/control characters, unsafe links, invalid contact fields, invalid sort values and copied protected answers are rejected. The CMS has no HTML renderer or script field.

Every save validates, acquires the existing file lock, reads the latest revision inside the lock, detects conflicts, creates a backup, then atomically replaces the document. No-op saves preserve the revision. Failed saves retain the editor draft; reloading is explicit. Corrupt content is not repaired or overwritten by a read or save.

The editor supports add/edit/delete, enable/disable, numeric ordering and move controls for cards/FAQs. Questions in protected categories must use their registered source; their stored answer must remain empty. Ordinary help copy is plain text. Channels can be cleared, and missing hours/channels have public empty states.

### Authoritative display sources

- Delivery FAQ: `orderFlowDescription` verbatim for the three existing methods.
- Reward waiting FAQ: member copy keys `member.rewards.reward.afccb6ad2c` and `member.rewards.reward.e44effcabf` through the existing resolver and overrides.
- Credit FAQ: `credit.help.lifecycle` and `credit.help.subscription` through that resolver, including the existing credit-name substitution.
- Cancellation, returns/refunds, subscription and custom roast: navigation to the original functionality, without a copied policy, eligibility calculation, timeframe or conversion rule.
- Per-order state: original fulfillment projection/labels, with the original order-status label as fallback.

### Recent orders and privacy

Authenticate through the existing member helper. Filter original orders by the resolved member ID on the server, sort by the existing stored date, and project at most three rows. Only order number, date, display status and delivery method reach the server-rendered section. No address, contact information, items, pricing, credit, tokens or other members' orders are passed to the search/FAQ client. The route is dynamic and production responses are private/no-store. Guest, member-empty and unavailable states are distinct. Every CTA opens the existing protected order route.

No cancellation, refund, inquiry submission or commerce mutation endpoint is invoked by the CS page.

## E. Safety verification

The engineering diff changes no existing cancellation, return/refund, fulfillment, order state-machine, cart, checkout, pricing, inventory, KD, reward ledger, membership commerce, subscription commerce, Store commerce or Gift commerce/publication implementation. No production file or setting was written. The J6 and historical checkouts were not cleaned, switched, reset or otherwise edited.

The browser suite uses a newly created worktree-local data root, synthetic canonical members/orders, generated test-only session keys and an empty Store catalog. It fingerprints the runtime commerce/catalog/identity data before and after the full page/Admin exercise, excluding only the intended CS content file/backups. No `.env` or production session is copied. Gift isolation tests use synthetic fixture products and verify that CS saves preserve Gift CMS and catalog bytes.

Existing authentication and commerce APIs retain their original behavior. CS does not expose an alternative auth or eligibility implementation.

## F. Validation

- CS unit/integration suite: **15 PASS** (schema/search/Unicode/authoritative copy/persistence/concurrency/corruption/privacy/Gift isolation).
- Existing membership-commerce: **41 PASS**.
- Existing membership-experience: **36 PASS**.
- Existing member cancellation: **36 PASS**.
- Existing fulfillment: **29 PASS**.
- Existing multi-SKU subscription: **26 PASS**.
- Existing Store domain: **158 PASS**.
- Existing Store public read model: **108 PASS**, including unchanged protected source hashes.
- Existing Store product detail: **71 PASS**, including unchanged protected source hashes.
- Existing homepage CMS suite: **PASS**.

The Store detail test runs through the existing `gift-frontend-test-bootstrap.mjs` TSX loader, with `STORE_SEO_PUBLIC_ENABLED=true` only in its local test process to match its expected indexable fixture. No production capability was enabled.

- Production-browser suite: **20 PASS**. Includes SSR/metadata, guest/member isolation, FAQ interactions/keyboard navigation, Owner authorization, same-origin enforcement, invalid-input/size rejection, actual Owner editing/persistence, concurrent revision conflicts, empty states, route smoke tests and unchanged runtime-data fingerprints.
- TypeScript: **PASS**, full `npx tsc --noEmit --pretty false`.
- ESLint: **PASS**, all added CS source and test files.
- Production build: **PASS**, Next 16.2.10 / Turbopack, including framework TypeScript checks and `/customer-service`, `/admin/customer-service`, `/api/admin/customer-service` in the route output. It emits 9 NFT tracing warnings originating in unchanged `storeRepository.ts` dependency traces. No Store implementation was edited to address them.
- `git diff --check`: **PASS**.
- Protected tracked-source diff against the baseline: **empty** for existing `lib`, `bootstrap`, `data`, order/member APIs, cart/checkout, Store/Gifts, member components and commerce components.

Evidence: `<local-qa-directory>/unit-test.log`, `browser-test.log`, `browser-results.json`, `typescript.log`, `lint.log`, `build.log`, and the individual regression logs. The final browser result records `serverMode: start`; screenshots come from the production build.

Reproduction:

```text
npm ci --ignore-scripts --no-audit --no-fund
npm run test:customer-service
npx tsc --noEmit --pretty false
npm run build
npm install --prefix qa-output/cs1/tools --no-save --package-lock=false --ignore-scripts playwright @axe-core/playwright
npm run test:customer-service:browser
```

The browser runner starts/stops its own loopback production server, prepares synthetic fixtures, and writes local screenshots/results. Its default Chrome path can be overridden with `CS1_BROWSER`; the port can be overridden with `CS1_QA_PORT`.

## G. Visual QA

Required viewports: **360, 390, 430, 768, 1280, 1440 and 1600 px**. Check Hero/search, service grid, categories/accordion, contact, related links, member orders and the Owner editor. Screenshots use synthetic orders when logged in. Automated accessibility coverage targets the new public main content; it does not certify every inherited site component or replace manual assistive-technology QA.

- All seven viewport widths: **PASS**, document scroll width equals viewport width.
- Axe WCAG 2 A/AA and WCAG 2.1 AA at 390, 768 and 1440 px: **0 violations** in `#service-main`.
- Desktop: five-column service grid; left categories/right accordion; aligned order rows and split contact layout. **Reviewed**.
- Tablet: three-column services and readable category/sidebar arrangement. **Reviewed**.
- Mobile: two-column services, category selector, single-column contact and member rows. **Reviewed**.
- Hero, quick services, FAQ, contact, guest orders and signed-in orders: **reviewed in production screenshots**.
- Admin desktop/mobile: explicit field labels, usable controls, and no horizontal overflow. **Reviewed**.
- Browser JavaScript/hydration errors: **0**.

Screenshots under `<local-qa-directory>`:

| Surface | File |
| --- | --- |
| Desktop | `customer-service-1440.png` |
| Tablet | `customer-service-768.png` |
| Mobile | `customer-service-390.png` |
| Other requested sizes | `customer-service-360.png`, `customer-service-430.png`, `customer-service-1280.png`, `customer-service-1600.png` |
| Signed-in recent orders | `customer-service-member-1440.png`, `customer-service-member-390.png` |
| Owner editor | `customer-service-admin-1440.png`, `customer-service-admin-viewport-1440.png`, `customer-service-admin-viewport-390.png` |

## Final Git status

HEAD remains the production baseline. All engineering changes remain uncommitted in the isolated CS.1 branch: **5 modified tracked files and 17 added files**. No staged changes, production push or deployment.

```text
 M app/admin/page.tsx
 M app/sitemap.ts
 M components/layout/Footer.tsx
 M package.json
 M scripts/test-phase-j6d1-store-public-read-model.mts
?? app/admin/customer-service/page.tsx
?? app/api/admin/customer-service/route.ts
?? app/customer-service/page.tsx
?? components/admin/CustomerServiceManager.module.css
?? components/admin/CustomerServiceManager.tsx
?? components/customer-service/CustomerService.module.css
?? components/customer-service/RecentServiceOrders.tsx
?? components/customer-service/ServiceExplorer.tsx
?? data/customer-service/.gitignore
?? docs/CS1_CUSTOMER_SERVICE_CENTER_20261027.md
?? lib/customerServiceContent.ts
?? lib/customerServiceOrders.ts
?? lib/customerServiceSources.ts
?? lib/customerServiceStore.ts
?? scripts/customer-service-qa-fixture.mts
?? scripts/test-customer-service-browser.mjs
?? scripts/test-customer-service.mts
```

## H. Final verdict

**CS.1 ENGINEERING COMPLETE — OWNER VISUAL QA REQUIRED**
