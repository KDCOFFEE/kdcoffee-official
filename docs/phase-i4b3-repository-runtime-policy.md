# Phase I.4B.3 Repository, Runtime, and Archive Policy

## Source-of-truth matrix

| Domain | Class | Repository source of truth | Local/runtime source of truth | Production source of truth | Policy |
| --- | --- | --- | --- | --- | --- |
| Website catalog, CMS, and inventory | A — immutable bootstrap | `bootstrap/store/website-data.json` | `public/data/website-data.json` until tracked-runtime index migration | `/data/store/website-data.json` | One complete file; production opening stock requires Owner approval before first bootstrap. |
| Homepage | A — immutable bootstrap | `bootstrap/store/homepage.json` | `public/data/homepage.json` until index migration | `/data/store/homepage.json` | Seed only when absent; persistent target is authoritative. |
| Asset metadata | A — immutable bootstrap | `bootstrap/store/assets.json` | `public/data/assets.json` until index migration | `/data/store/assets.json` | Seed only when absent; Admin writes are locked and atomic. |
| Monthly menus | A — immutable bootstrap | `bootstrap/store/monthly-menus.json` | `public/data/monthly-menus.json` until index migration | `/data/store/monthly-menus.json` | Seed only when absent. |
| Pages | A — immutable bootstrap | `bootstrap/store/pages.json` | `public/data/pages.json` until index migration | `/data/store/pages.json` | Seed only when absent. |
| Membership business rules | B — runtime configuration, future approved seed | No approved seed yet | `data/membership-commerce/business-rules.json` | `/data/membership-commerce/business-rules.json` | Current tracked file contains history and is not a production seed. Create a separate approved seed only after Owner decisions. |
| Membership commerce state | B — runtime only | None | `data/membership-commerce/commerce-state.json` | `/data/membership-commerce/commerce-state.json` | Never seed. Canonical empty state is created by code on the first transaction. |
| Fulfillment state | B — runtime only | Empty schema in `lib/fulfillment.ts` | `data/fulfillment/state.json` | `/data/fulfillment/state.json` | Never seed. Missing state reads as empty and is persisted on first mutation. |
| Fulfillment settings | B — runtime only | Default settings in `lib/fulfillment.ts` | `data/fulfillment/settings.json` | `/data/fulfillment/settings.json` | Never seed. Missing settings use the code default and persist only after an approved change. |
| Orders | B — runtime only | Empty directory marker only | `data/orders` | `/data/orders` | Never seed or migrate acceptance orders. |
| Members | B — runtime only | Empty directory marker only | `data/members` | `/data/members` | Empty for first production bootstrap unless real production members receive separate approval. |
| Member identity | B — runtime only | None | `data/member-identity` | `/data/member-identity` | Never seed. |
| Persistent uploads | A/B by reference | Required seed media remains under `public` | Mutable uploads under `public/uploads` in local development | `/data/uploads` | Copy only media deterministically referenced by immutable store seeds and served through storage-aware routes; runtime uploads are never seeds. |
| Cloudinary media | C — external | URL/public ID in approved configuration | Cloudinary | Cloudinary | Never copy into the volume. |
| Static public media | C — Git static | `public` | `public` | Deployment image | Remains Git-served and is not copied into `/data`. |
| 7-ELEVEN store dataset | C — Git static external dataset | `public/data/711-stores.json` | Same | Deployment image | Read-only static dataset; not persistent runtime state and not copied to `/data`. Raw/pending update artifacts are not production sources. |
| Phase I.4A orders, commerce, and fulfillment lifecycle | D — local acceptance archive | Verified Phase I.4A backup only | Protected local files | None | Never bootstrap or migrate to production. |
| Environment configuration and secrets | E — environment/secrets | `.env.example` contains names/placeholders only | Untracked `.env*` | Railway variables | Never store real credentials in Git or migration artifacts. |

## Immutable store seed provenance

The five files under `bootstrap/store` are byte-for-byte copies of the corresponding blobs at baseline commit `0b0e23266da21d9e267156045d969cf60d531e9c`. In particular, `bootstrap/store/website-data.json` was not copied from the protected dirty `public/data/website-data.json`.

The initializer reads `bootstrap/store` by default. `public` remains the source root only for media referenced by those immutable JSON documents. Test-only options may point both roots to disposable fixtures.

## Business-rules audit and Owner decisions

`data/membership-commerce/business-rules.json` first entered Git in commit `b39793ed41161123cd46406853c2f3eadf12e238`. It contains five timestamped versions, revision 4, and Owner/system audit history. It is therefore runtime history rather than an immutable default.

The active version cannot be promoted silently:

| Rule | Approved semantic constraint | Current active tracked value | Required decision |
| --- | --- | --- | --- |
| Opening-year 7-ELEVEN free shipping | Site launch-year promotion, not one year per member | Disabled with blank start/end dates | Owner must approve enabled state and exact launch-year dates. |
| Subscription 7-ELEVEN shipping | Free regardless of amount | `subscriptionFreeShipping: true` | Compatible; confirm for production seed. |
| First subscription purchase / activation | First purchase full price; successful first pickup activates | Implemented in commerce behavior, not represented as an editable rule | No seed normalization; retain accepted code semantics. |
| Custom subscription cycle | Owner configurable | Enabled, 14–120 days in active version; code default is 20–120 | Owner must select production minimum and enabled quick intervals. |
| Referral qualification window | Owner configurable | Missing from historical active payload and inherited as 30 days by code normalization | Owner must explicitly approve the production value. |
| Referral waiting and return protection | Preserve accepted snapshot/live semantics | Legacy 7-day field; normalized code supplies 7 base + 3 return-protection days | Owner must explicitly approve 7 and 3 for a new seed. |
| Referrer eligibility | Qualification must not depend on active subscription | Active historical value is `active-subscription`; code default is `none` | Conflict: Owner must approve the accepted production setting; do not seed active history. |
| Reward calculation / PV display | Owner configuration | Active history uses PV and shows PV; earlier versions differ | Owner must approve production mode and display choice. |
| Credit expiry/redemption | Owner configuration | Active history uses 6 months, 30-day reminder, minimum payable 100; code default differs | Owner must approve production values. |

After approval, create a new immutable business-rules seed containing one initial version with an approval record. Do not copy the five-version acceptance/admin history.
