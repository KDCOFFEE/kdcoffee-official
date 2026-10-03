# LINE.AUTO.1 — Admin-managed customer replies

This phase adds a deterministic text-only customer webhook and an owner-managed editor. It does not configure or enable any production channel.

## Owner setup after a separately authorized deployment

- Open `/admin/line-auto-reply` with the existing owner session.
- Configure all customer copy, labels, keywords, rules and product selections; preview the draft before saving.
- A missing settings file is disabled with empty copy, no rules, no selected products and no enabled fields. Publishing code alone cannot enable replies.
- The customer Messaging API channel requires `LINE_CUSTOMER_CHANNEL_SECRET` and `LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN`. The LINE Login secret and internal/legacy messaging tokens are never used by this feature.
- Register `/api/webhooks/line/customer` only in a future authorized setup. This phase does not change LINE Developers settings.
- Canonical product links use the existing `MEMBER_SITE_URL`, then `NEXT_PUBLIC_SITE_URL`. Missing or non-HTTPS origins omit product links; no request-host or guessed-domain fallback is used.

## Matching and display

Text normalization is Unicode NFKC, trimming, collapsing whitespace and lowercasing. Modes are exact and contains, with no regex, AI or semantic matching.

The bean-menu trigger wins first. General rules are sorted by numeric order, with ID as a tie-breaker; the first matching enabled rule with nonblank text wins. Editable fallback is last. A matched bean menu with no valid products uses its editable empty state; a blank empty state produces no reply, rather than falling through to other rules.

All customer explanations, trigger words, field labels, availability text, title, intro, help, footer, descriptions and CTA text/URL are editable. Blank labels hide the field. A blank CTA URL hides its section; a nonblank URL with blank label displays the URL alone. Product names, canonical descriptions and SKU package labels remain controlled by the existing Product Admin.

## Canonical coffee data

The resolver reads the same `getWebsiteDataFile()` JSON used by `getLiveWebsiteData()` and Product Admin. It never writes it. Settings store only `productId` (canonical id, or slug when id is absent), enabled, order and lineDescriptionOverride.

Only selected products that pass the existing Works monthly-menu visibility check and are active, not explicitly disabled, not explicitly nonpurchasable and have a current enabled, valid-priced, positive-stock SKU are shown. Status must be active. Sold-out, hidden, discontinued, coming-soon, removed, ambiguous-ID and zero-stock products are omitted. SKU selection mirrors the existing skus-first/purchase-fallback convention and product-stock fallback.

LINE description override wins, then canonical shortCopy, then canonical mood. No marketing sentence is synthesized. Prices show the currently available SKU labels and prices; a currency marker can be put in the editable price label. Product data resolution is separate from plain-text formatting.

## Storage and authentication

- Production `KD_DATA_DIR=/data`: `/data/line-auto-reply/settings.json` and `event-claims.json`.
- Local fallback: `data/line-auto-reply/` in the isolated/current application root.
- Existing root validation, directory-on-first-write, file locks and atomic JSON replace utilities are reused. No settings seed is inserted into existing persistent bootstrap or bundled public/data.
- Validation precedes replacement, revision checks reject stale saves, and malformed existing JSON fails closed. Admin save cannot silently reset a corrupt file.
- Owner authentication and same-origin policy are reused from the existing owner copy editor. The UI page, settings GET/PUT and simulator are protected server-side.
- Simulator uses the exact production normalizer, matcher, resolver and formatter. It previews draft settings, reads live products, does not save, and never imports or invokes LINE delivery.

Settings are bounded to 100 rules, 30 keywords per trigger, 50 selected products, 4500-character ordinary/empty/fallback replies and a 256000-character API request. Per-field limits are enforced server-side. HTTPS CTA URLs, ID syntax, duplicate IDs, booleans, arrays, match modes, orders, timestamps and display labels are validated.

Every saved rule, including disabled rules, needs a nonblank name, at least one nonblank keyword and nonblank reply text. Unfinished rules remain browser drafts. Keywords must be unique after the same production normalization. Enabled bean menus need triggers; enabled fallback needs text. Disabled empty bean/fallback settings and missing defaults remain valid. Validation errors are Admin-only; no customer wording is invented.

## Webhook and delivery

The raw byte stream is limited to 256000 bytes and verified using HMAC-SHA256 and timing-safe comparison before JSON parsing, settings reads or event processing. Invalid signatures return 401, malformed signed payloads 400, missing channel secret 503. Only active-mode text message events are handled; follow, image, standby and other events are acknowledged without replies.

Replies use one customer Reply API request per eligible event, with at most five text messages of at most 5000 UTF-16 code units each. Surrogate pairs are not split. Oversized aggregate replies fail closed and are explained in the simulator. The sender has an eight-second timeout, returns only fixed diagnostic codes/status and never emits response bodies, tokens, user IDs or reply tokens to logs. No push or blind retry occurs.

Persistent dedupe claims use SHA-256 of webhookEventId; message ID is the fallback, then reply token only when neither stable ID exists. No raw event/user/reply IDs or message content are stored. Claims are locked and atomically written before the external attempt. Failed or uncertain attempts remain claimed, preferring a missed reply over a duplicate. Without stable event/message metadata, redelivery protection is best effort for an identical reply token.

LINE event claims alone use a dedicated SQLite transaction mutex in event-claims-lock.sqlite. It contains no application records, products or event claims: event-claims.json remains the atomic JSON store. The mutex uses the Node built-in node:sqlite API; the future server runtime must support it without an experimental flag (Node 22.13+ on the 22 LTS line or Node 24+). Local verification uses Node 24.18.0. Unsupported runtimes fail closed; no Railway runtime or variable is changed by this phase.

BEGIN IMMEDIATE holds the OS-backed write lock through the entire asynchronous claim operation. Busy acquisition retries asynchronously at 50ms, for at most five seconds; SQLite busy_timeout is zero, so waiting does not block the Node event loop. The database inode is never deleted/replaced. A running owner cannot be evicted, even if acquiredAt is very old: recovery cannot enter its transaction. Process death releases the OS lock automatically, including restart with a different hostname or reused PID.

The fixed event-claims.json.lock metadata carries protocol, UUID owner token, PID, hostname and acquiredAt. Once the kernel mutex is acquired, abandoned current-protocol metadata can be removed only after five minutes. Fresh, future-dated or malformed metadata fails closed. A crash therefore may pause replies for the remainder of five minutes, plus a bounded request wait, but cannot leave a permanent current-protocol stale lockout. All recovery and acquisition run inside the same kernel transaction, avoiding two recoverers deleting a newly acquired lock. Cleanup checks the owner token and releases metadata before the transaction. No heartbeat lease or age-only eviction is used.

Legacy/unrecognized metadata is not guessed safe: an old lock is recoverable only when its hostname is explicitly the local hostname, its PID is confirmed absent, and its acquired time exceeds five minutes. Legacy metadata without host identity remains protected and requires operator inspection; LINE.AUTO.1 has not been deployed, so no production legacy lock migration is assumed. The shared withFileLock helper and ordinary Admin settings locks retain their existing behavior. Only two fixed LINE mutex files (plus SQLite's bounded transient rollback journal) are added; no recovery/quarantine history grows. The filesystem must support SQLite's ordinary OS file locking.

Retention is seven days with a maximum of 5000 live claims. Expired claims are pruned during new claims. Capacity and corrupt claim state fail closed with 503; live entries are not evicted to admit new ones. No order, member or commerce data is touched.

## Verification

`npm run test:line-auto-reply` uses synthetic fixtures, injected Reply API mocks and a network-blocking bootstrap. Temporary settings, catalog and claims use only the suite-owned OS temp directory. Also run the existing LINE messaging split, member authentication and J.5D.7B Member Center IA regressions, TypeScript, production build and diff checks.

The canonical proxy is unchanged; its existing matcher excludes /api and non-GET/HEAD requests are passed through. LINE Login, account linking, order notifications, internal alerts, commerce, products, inventory, Gmail, backups and all cron implementations are unchanged.

Protocol references: [LINE signature verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/) and [Reply API](https://developers.line.biz/en/reference/messaging-api/#send-reply-message).
