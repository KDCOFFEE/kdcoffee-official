# KD Coffee Studio Phase I.2A Engineering Validation Report

Date: 2026-08-28  
Phase: I.2A — Order Fulfillment & Completion Tracking  
Result: Ready for Owner acceptance; Phase I.3 must not begin before acceptance.

## Repository and initial worktree

- Repository: `F:\KD_Coffee_Studio_v15.6.0_UIUX_DEV_20260814`
- Branch: `main`
- Initial HEAD: `a3135ff0c4c124ccb2038952336a8ee879bf654c`
- The initial worktree was already dirty with accepted Phase I.0A, I.1, I.2, Owner artifacts, launcher artifacts, and unrelated backups.
- No reset, restore, clean, stash, stage, commit, push, or deploy operation was performed. Existing work was preserved.
- Next.js 16.2.10 route-handler, server/client component, and dynamic-route documentation in the installed `node_modules/next/dist/docs/` was consulted before implementation.

## Phase I.2A files

### Modified

- `app/admin/orders/[orderNumber]/page.tsx`
- `app/admin/page.tsx`
- `app/globals.css`
- `app/member/page.tsx`
- `components/orders/OrderTimeline.tsx`
- `lib/membershipCommerce.ts`
- `lib/orderTimeline.ts`
- `lib/persistentStorageInit.ts`
- `lib/storagePaths.ts`
- `package.json`
- `scripts/member-auth-test-bootstrap.mjs`

### Added

- `app/admin/fulfillment/page.tsx`
- `app/api/admin/fulfillment/email-evidence/route.ts`
- `app/api/admin/fulfillment/orders/[orderNumber]/route.ts`
- `app/api/admin/fulfillment/settings/route.ts`
- `components/admin/FulfillmentOrderControls.tsx`
- `components/admin/LogisticsSettingsForm.tsx`
- `lib/fulfillment.ts`
- `lib/fulfillmentTypes.ts`
- `lib/sevenElevenEmailParser.ts`
- `scripts/prepare-fulfillment-qa.ts`
- `scripts/test-fulfillment.ts`
- `docs/phase-i2a-engineering-validation-report.md`

### Deleted

- None from the implementation or pre-existing worktree.
- A runtime-generated `data/member-identity/registry.json`, absent at preflight and produced while rendering against local production storage, was removed during cleanup to restore the exact preflight state.

## Fulfillment architecture

### Canonical states

The central domain defines these states in `lib/fulfillmentTypes.ts`:

1. `order_created`
2. `preparing`
3. `shipped`
4. `in_transit`
5. `arrived_at_pickup_store`
6. `ready_for_store_pickup`
7. `completed`
8. `suspected_uncollected`
9. `uncollected`
10. `cancelled`
11. `exception_requires_review`

All normal Owner/member labels are Traditional Chinese.

### Transition rules

- Progress is monotonic. Provider evidence older than the current state is recorded as ignored/stale and cannot regress the order.
- `completed`, `uncollected`, and `cancelled` are terminal.
- Provider evidence cannot reverse a terminal state. Admin terminal reversal is also blocked.
- `exception_requires_review` requires Admin resolution.
- `uncollected` is reachable only from an eligible pickup state through an Admin or explicit system policy; the default deadline policy does not select it.
- Every Admin mutation carries an expected revision. Stale revisions return a conflict rather than overwriting newer state.

### Event ledger

- The fulfillment store is central and append-only at event level.
- Events retain safe evidence: event ID, order ID, normalized state, source, fingerprint, external reference, occurrence/recording time, actor, reason, and revision.
- Customer contact data is not copied into the ledger.
- Fulfillment storage uses the existing file-lock and atomic JSON-write primitives.
- External order/shipment identifiers are unique, replay fingerprints are retained, and consequence execution has pending/completed/failed retry state.

## 7-ELEVEN parsing

The parser is pure evidence normalization. It imports neither membership nor commerce code and never activates subscriptions, changes gift progress, grants referral rewards, issues credits, or changes commercial state.

Trusted sender: `no-reply@sp88.com`.

Supported observed formats only:

1. 賣貨便：訂單成立通知
2. 賣貨便：賣家完成寄貨訂單通知
3. 賣貨便：您的訂單(CM...)已送達
4. 賣貨便：買家完成取貨訂單通知

Recognition requires multiple signals: exact sender, matching subject format, a valid `CM...` reference, and compatible body text. Conflicting or malformed evidence is rejected. Unknown and ambiguous mappings enter manual review. A SHA-256 source fingerprint prevents replay.

Unsupported/unobserved message types are not guessed. In particular:

**7-ELEVEN UNCOLLECTED PARSER: NOT IMPLEMENTED — NO REAL SAMPLE**

## Gmail integration status

**GMAIL PRODUCTION CONNECTION: DEFERRED**

- No real Gmail connection was made and no real message was read during QA.
- No OAuth client ID, client secret, refresh token, access token, or fake connected state was introduced.
- The Admin evidence route is a safe future adapter boundary that accepts normalized evidence after Admin authentication.
- Default connection state is `not_connected`; the Owner UI says `待 OAuth 設定` and cannot claim successful connection.

## Owner logistics settings

- Default/configurable notification mailbox: `kdcoffee.tw@gmail.com`
- Automatic tracking toggle; default disabled/read-only-safe until deliberately enabled.
- Per-event toggles for order created, shipped, arrived, and completed messages.
- Pickup deadline defaults to 7 days and is Owner-configurable.
- Default expiry policy is manual review; an explicit Owner setting can select confirmed-uncollected handling.
- Settings updates are revision protected.

## Store pickup workflow

Admin can associate external references, mark preparation, mark 7-ELEVEN shipment/arrival, mark studio pickup ready, confirm successful pickup, confirm uncollected, and recheck deadlines. Terminal actions require explicit browser confirmation. Studio pickup and 7-ELEVEN completion converge on the same canonical event service.

## ORDER_COMPLETED integration

There is one canonical consequence entry point: `handleCanonicalOrderOutcome(... outcome: "completed")` in `lib/membershipCommerce.ts`. 7-ELEVEN completion evidence, Admin studio-pickup completion, and verified Admin correction all first append the same canonical fulfillment event and then call this entry point.

That entry point delegates to the accepted I.1/I.2 primitives for pending subscription activation, cycle fulfillment/gift progress, and referral outcome processing. Deterministic event-derived idempotency keys prevent duplicate activation, fulfillment count, gift progress, referral qualification, reward, or credit effects.

## ORDER_UNCOLLECTED integration

There is one equivalent canonical path using `handleCanonicalOrderOutcome(... outcome: "uncollected")`. It delegates commercial consequences to the existing Membership `markUncollected` and referral policy functions. Logistics and parser code contain no duplicate hard-coded membership policy. Confirmed uncollected outcomes are idempotent and do not issue referral rewards.

## Idempotency and concurrency

- Email replay: source fingerprint uniqueness.
- Canonical events: deterministic source fingerprints and state replay detection.
- External mappings: central uniqueness enforcement.
- Membership consequences: deterministic child idempotency keys.
- File mutation: shared lock plus atomic replacement.
- Admin updates: optimistic revision checks.
- A concurrent Admin/email completion test proved one completion event and one commercial outcome.

## Deadline handling

- Arrival records `arrivedAt` and calculates `pickupDeadline` using the active Owner setting.
- The 7-day default was tested deterministically.
- Default expiry changes the order to `suspected_uncollected` and creates a review path only.
- Suspected uncollected does not punish the member, terminate a subscription, reset gift progress, or alter referral state.
- Only an explicit confirmed uncollected event reaches Membership consequences.

## Admin fulfillment workspace

`/admin/fulfillment` provides five summary cards, a next-action order list, manual-review queue, Gmail connection state, and Owner logistics settings. `/admin/orders/[orderNumber]` retains the accepted order/customer/product/notification/inventory functions and adds external-reference management, state controls, deadlines, and an auditable human-readable fulfillment timeline.

## Member tracking

Member Center order cards now show the canonical Traditional Chinese status, pickup deadline where applicable, a compact fulfillment history, and an accessible order-detail link. The customer order detail timeline mirrors only safe fulfillment events and does not expose internal evidence, actor identifiers, or customer PII.

## Traditional Chinese UI

- Normal Admin/Owner controls, states, validation messages, confirmations, settings, and review actions are Traditional Chinese.
- Member statuses and timeline copy are Traditional Chinese.
- Owner-facing technical implementation strings found in normal operation: **0**. English eyebrow labels are decorative navigation typography, not technical error/state leakage.

## Responsive browser QA

QA used a dedicated temporary data root and the production build. It did not use production members/orders or real Gmail.

Validated sizes:

| Viewport | Admin dashboard | Admin detail | Member Center | Order tracking | Cart | Checkout | Horizontal overflow |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1440×900 | PASS | PASS | PASS | PASS | PASS | PASS | None |
| 1280×800 | PASS | PASS | PASS | PASS | PASS | PASS | None |
| 1024×768 | PASS | PASS | PASS | PASS | PASS | PASS | None |
| 430×932 | PASS | PASS | PASS | PASS | PASS | PASS | None |
| 390×844 | PASS | PASS | PASS | PASS | PASS | PASS | None |
| 375×812 | PASS | PASS | PASS | PASS | PASS | PASS | None |

Evidence across every size: 5 summary cards, 2 QA orders, 10 logistics controls, 7 fulfillment actions, 2 external-ID inputs, 4 Admin fulfillment events, 2 member fulfillment summaries, and 5 customer timeline entries. Minimum measured key action/link height was effectively 44 CSS pixels (`43.997` due browser subpixel rounding). A stale IPv6 QA server from the interrupted run was identified and stopped before the final measurements, ensuring the latest build was tested.

## Domain and regression results

| Validation | Result |
|---|---|
| Phase I.2A A–Z plus AA/AB | PASS — 28 assertions |
| TypeScript `tsc --noEmit` | PASS |
| Next.js production build | PASS — 22 pages generated; fulfillment routes present |
| Phase I.2A targeted ESLint | PASS — 0 errors; 3 existing `<img>` warnings in touched legacy renderers |
| Phase I.0A member identity | PASS — 32 assertions |
| Member auth compatibility | PASS — 24 assertions |
| Phase I.1 membership commerce | PASS — 41 assertions |
| Phase I.2 membership experience | PASS — 36 scenarios |
| Order/cart/checkout | PASS — 20 assertions |
| 7-ELEVEN store parser self-test | PASS — 7 cases |
| Health check | PASS — 100/100 |
| Smart Link | PASS — 22 required cases + 10 existing CTA destinations |
| Page Builder contract | PASS |
| Page Builder design system | PASS |
| Page Builder images/media | PASS |
| Page Builder visual style | PASS |
| Product custom sections | PASS |
| Product custom-section media | PASS |
| Product YouTube | PASS |
| Video lifecycle | PASS |
| Admin action feedback | PASS |
| Product page content | PASS |

Repository-wide ESLint remains at the pre-existing baseline: **27 errors and 43 warnings**. Phase I.2A did not expand scope to repair unrelated legacy lint. The known `admin-section-management.assertions.ts` fixture hash mismatch also remains: actual `624F6869326B471014AC0BC5F4F248575F8005FD469BA52B3EF1FA9ED8B363BF`, expected `C9ABE88868AA59A7E42617F0B6C5735E4D51BDAAABCAAA804D019D99913A0546`. This same unrelated baseline issue was present in prior accepted phases.

## Production data hashes

All post-QA hashes match the recorded preflight hashes exactly:

| Protected file | SHA-256 | Result |
|---|---|---|
| `data/members/9504413b1e72b2eed8e68261.json` | `5b92b317c1e8e3b36983c4a81c39aab0062973d2a55e72cbf13bec20b5102dca` | unchanged |
| `data/members/ed09766576c3858ce2b12c89.json` | `fb903c01de5fcb31206554889a171ac73af32fdc0d34fd895c1e8f232f0d1f30` | unchanged |
| `data/members/fce903ab4fc9ab82bc6f81c0.json` | `2a6ec40f129d2460c20727d3c1d3ad3487e228078149e68e82dc7094e0462fe8` | unchanged |
| `data/orders/KD20260807-4996.json` | `088c5791f148f1f3e5b7b83df08b242dc7a9a4c2081293ddb93dd86502f012c2` | unchanged |
| `data/orders/KD20260807-6851.json` | `a2c27759f7ff3a11dc674297bc759d55a96649795449518b762b2d6aa770a884` | unchanged |
| `data/orders/KD20260807-7209.json` | `9625b5c644743ec76ddd0ed4a29c9a7ed07e380db5ec6314c439174e6782887c` | unchanged |
| `data/orders/KD20260807-8081.json` | `7a08c5e5fb31af1f36b587caf463523dd40e07d3651ff58ebabff86874f09a4d` | unchanged |
| `data/orders/KD20260807-8543.json` | `5c6a56e796277bebce840a4b318699559eb7e1fdc494e95bb188b95138cead00` | unchanged |
| `data/orders/KD20260810-6103.json` | `a8a7a4e7e8e58ad29860a42266e3e935033a9cf7ed0ae340769d89bd4c1881e4` | unchanged |
| `public/data/711-stores.json` | `eef03805b488846557801b4bf22bf91e6349e72d7620f4e7d43511353c6d389a` | unchanged |
| `public/data/assets.json` | `7c80ff7228503a771429a9e4c1fdacaa933ffc72f8130644ea6d88064638a044` | unchanged |
| `public/data/homepage.json` | `0c9660407b870d059a5a16e1b5072a1e475e9597f1144d767a07221cafbed968` | unchanged |
| `public/data/monthly-menus.json` | `82ec6269e0622dfccf919e777a6b8188e823251e0d73a08e1981a88b9a2f84c1` | unchanged |
| `public/data/pages.json` | `af73752016cd03caee0f1ccb40c590f8366fb97f8ce76d4c8a2da4df3b89e1db` | unchanged |
| `public/data/website-data.json` | `e9c683f7024627c331025361110fedc7706f38944a08bdd0062e65daf516ef81` | unchanged |

Files absent at preflight and absent after cleanup:

- `data/member-identity/registry.json`
- `data/membership-commerce/business-rules.json`
- `data/membership-commerce/commerce-state.json`
- `data/fulfillment/settings.json`
- `data/fulfillment/state.json`

Therefore no real membership rules, subscriptions, cycles, referrals, rewards, credits, gift state, or fulfillment state was created or changed.

## QA cleanup and Git safety

- Removed isolated QA root `C:\Users\felix\AppData\Local\Temp\kd-fulfillment-i2a-qa-20260828` after validation.
- Stopped both the current QA server and the stale interrupted IPv6 server; port 3116 has zero listeners.
- Reset the temporary Browser viewport override and closed the QA tab.
- No QA order/member/external identifiers remain under production `data/`.
- `git diff --check`: PASS; only existing LF/CRLF conversion notices were printed.
- Staged: NO. Committed: NO. Pushed: NO. Deployed: NO.

## Known deferred work

- Production Gmail OAuth connection: DEFERRED pending a production-safe credential and consent flow.
- 7-ELEVEN uncollected/return email parser: NOT IMPLEMENTED — NO REAL SAMPLE.
- Phase I.3: not started and not authorized before Owner acceptance.

## Required final matrix

| Requirement | Final status |
|---|---|
| PHASE I.2A ORDER FULFILLMENT FOUNDATION | PASS |
| CANONICAL FULFILLMENT STATE | PASS |
| FULFILLMENT EVENT LEDGER | PASS |
| 7-ELEVEN ORDER CREATED PARSER | PASS |
| 7-ELEVEN SHIPPED PARSER | PASS |
| 7-ELEVEN ARRIVED PARSER | PASS |
| 7-ELEVEN COMPLETED PICKUP PARSER | PASS |
| 7-ELEVEN UNCOLLECTED PARSER | NOT IMPLEMENTED — NO REAL SAMPLE |
| WRONG SENDER PROTECTION | PASS |
| EMAIL REPLAY IDEMPOTENCY | PASS |
| OUT-OF-ORDER PROTECTION | PASS |
| EXTERNAL ORDER MAPPING | PASS |
| STORE PICKUP MANUAL FLOW | PASS |
| ORDER_COMPLETED | PASS |
| ORDER_UNCOLLECTED | PASS |
| SUSPECTED UNCOLLECTED | PASS |
| 7-DAY DEFAULT | PASS |
| 7-DAY OWNER CONFIGURABLE | PASS |
| UNCONFIRMED EXPIRY AUTO-PUNISHMENT | NO |
| MEMBERSHIP COMPLETION INTEGRATION | PASS |
| SUBSCRIPTION ACTIVATION | PASS |
| GIFT INTEGRATION | PASS |
| REFERRAL INTEGRATION | PASS |
| DUPLICATE REWARD | NONE |
| OWNER LOGISTICS SETTINGS | PASS |
| LOGISTICS EMAIL OWNER CONFIGURABLE | PASS |
| DEFAULT LOGISTICS EMAIL | kdcoffee.tw@gmail.com |
| GMAIL PRODUCTION CONNECTION | DEFERRED |
| ADMIN FULFILLMENT WORKSPACE | PASS |
| MEMBER ORDER TRACKING | PASS |
| FULFILLMENT TIMELINE | PASS |
| MANUAL CORRECTION AUDIT | PASS |
| TRADITIONAL CHINESE ADMIN | PASS |
| TRADITIONAL CHINESE MEMBER UI | PASS |
| OWNER-FACING TECHNICAL STRINGS | 0 |
| RESPONSIVE QA | PASS |
| HOMEPAGE REGRESSION | NONE |
| PRODUCT REGRESSION | NONE |
| CART REGRESSION | NONE |
| CHECKOUT REGRESSION | NONE |
| MEMBER REGRESSION | NONE |
| MEMBERSHIP I.0A REGRESSION | NONE |
| MEMBERSHIP I.1 REGRESSION | NONE |
| MEMBERSHIP I.2 REGRESSION | NONE |
| PAGE BUILDER REGRESSION | NONE |
| CLOUDINARY REGRESSION | NONE |
| REAL MEMBER DATA MODIFIED | NO |
| REAL ORDER DATA MODIFIED | NO |
| REAL SUBSCRIPTION DATA MODIFIED | NO |
| REAL CREDIT DATA MODIFIED | NO |
| REAL REFERRAL DATA MODIFIED | NO |
| REAL FULFILLMENT DATA CREATED | NO |
| STAGED | NO |
| COMMITTED | NO |
| PUSHED | NO |
| DEPLOYED | NO |
| READY FOR OWNER ACCEPTANCE | YES |
| READY FOR PHASE I.3 | NO — WAIT FOR OWNER ACCEPTANCE |
