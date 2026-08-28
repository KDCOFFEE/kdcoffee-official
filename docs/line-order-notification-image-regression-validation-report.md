# KD Coffee — LINE Order Notification Image Regression Engineering Validation Report

Date: 2026-08-28  
Repository: `F:\KD_Coffee_Studio_v15.6.0_UIUX_DEV_20260814`  
Branch: `main`  
HEAD: `a3135ff0c4c124ccb2038952336a8ee879bf654c`

## 1. Root cause

The regression had two independently proven causes:

1. **Primary cause of the observed text-only payload:** `lib/customerNotificationDelivery.ts` read only `MEMBER_SITE_URL`. The live local configuration had `NEXT_PUBLIC_SITE_URL=https://slit-gorged-decibel.ngrok-free.dev/` and no `MEMBER_SITE_URL`. `absolutePhotoUrl()` therefore returned `undefined`, the image object was omitted, and LINE received a valid one-message text payload. LINE HTTP 200 was then persisted as a full success even though no image had been requested.
2. **Secondary blocker after restoring the URL:** the dedicated notification upload path always transformed attachments to real WebP and used that same `.webp` URL for both `originalContentUrl` and `previewImageUrl`. LINE's current image-message contract accepts HTTPS JPEG or PNG, up to 10 MB for the original and 1 MB for the preview. A WebP URL is not compliant.

The official requirements are documented in the [LINE Messaging API reference](https://developers.line.biz/en/reference/messaging-api/#image-message).

## 2. When and where the behavior entered

Git history identifies commit `aff206acf0d5eb3625187f89c4c52013d73c0ac2` (`Add customer order progress notifications`, 2026-08-14) as the original introduction of both behaviors:

- `validateAndStoreOrderNotificationPhoto()` always wrote `${actionId}.webp`.
- `sendCustomerLineNotification()` only read `MEMBER_SITE_URL` and reused one URL as both LINE image URLs.

There is no evidence that a later global Homepage/Product/Page Builder optimizer caused this regression. The notification feature had its own WebP conversion from its first commit. The immediate text-only symptom became reproducible under the current environment because the configured public-site variable is `NEXT_PUBLIC_SITE_URL`, not `MEMBER_SITE_URL`.

## 3. Current attachment and LINE formats

- Admin/history attachment: retained as optimized `image/webp` for backward compatibility.
- LINE original derivative: real JPEG bytes, `.jpg`, max 1600×1600, enforced maximum 10 MB.
- LINE preview derivative: separate real JPEG bytes, `.jpg`, max 900×900, enforced maximum 1 MB.
- Transparent PNG input is flattened over white only for the LINE JPEG derivative.
- Accepted Owner uploads remain JPEG, PNG, or WebP.
- Existing historical WebP files are never rewritten or deleted.

## 4. URL construction and public validation

Public-origin resolution is centralized and ordered as:

1. explicit test/adapter override;
2. `MEMBER_SITE_URL`;
3. the repository's active `NEXT_PUBLIC_SITE_URL` architecture.

The helper rejects missing, non-HTTPS, cross-origin, over-2000-character, and unexpected attachment paths. It never accepts localhost as a LINE delivery URL unless it were HTTPS and deliberately configured, and no host is hard-coded in application code.

Before the LINE API call, the server fetches both public derivative URLs and verifies:

- HTTP success;
- no redirect;
- `Content-Type: image/jpeg`;
- JPEG magic bytes rather than a renamed WebP or HTML warning page;
- original and preview byte limits.

### Real configured URL evidence

One Owner-runtime-generated pair was checked by headers only, without displaying or retaining its content:

- `https://slit-gorged-decibel.ngrok-free.dev/uploads/order-notifications/7d309e4e-f0a5-4802-a713-847ce4641f18-line.jpg`
  - HTTP 200
  - `Content-Type: image/jpeg`
  - 197,731 bytes
- `https://slit-gorged-decibel.ngrok-free.dev/uploads/order-notifications/7d309e4e-f0a5-4802-a713-847ce4641f18-line-preview.jpg`
  - HTTP 200
  - `Content-Type: image/jpeg`
  - 82,962 bytes

There was no redirect, login response, or ngrok warning HTML. A separate fully synthetic original/preview pair also returned HTTP 200 `image/jpeg` through the same public HTTPS host and was deleted immediately afterward.

## 5. LINE payload before and after

### Before — actual observed environment

Because `MEMBER_SITE_URL` was absent:

```json
{
  "messages": [
    { "type": "text", "text": "…" }
  ]
}
```

The stored Admin photo did not prove an image was in the payload. LINE returned 200 for the text request, and history incorrectly displayed complete success.

Had `MEMBER_SITE_URL` existed, the old implementation would have added a non-compliant WebP image using the same URL for original and preview.

### After

```json
{
  "messages": [
    { "type": "text", "text": "…" },
    {
      "type": "image",
      "originalContentUrl": "https://<configured-public-host>/uploads/order-notifications/<uuid>-line.jpg",
      "previewImageUrl": "https://<configured-public-host>/uploads/order-notifications/<uuid>-line-preview.jpg"
    }
  ]
}
```

Text and image remain in one intended LINE push request. The existing action-ID claim is unchanged, so this repair does not duplicate notifications or LINE messages.

## 6. Conversion and preview behavior

`prepareLineImageAttachment()` in `lib/orderNotificationPhotos.ts` is the single compatibility boundary. It securely resolves only files in the notification upload directory, validates the decoded source, creates or reuses deterministic derivatives, validates the resulting JPEG format/limits, and returns HTTPS URLs.

The preview is separately resized and encoded rather than reusing the original URL. Existing deterministic derivative files are reused for a replay/resend; the original history WebP remains the Admin thumbnail/link.

## 7. Partial-success and history behavior

- Text-only notification without a photo remains a normal success.
- If an attachment cannot be decoded, converted, publicly fetched, or MIME-validated, LINE receives only the text and the result is `partial`, not `sent`.
- If the LINE push API itself rejects the combined payload, the channel result is `failed`.
- Safe diagnostics retain only message types, image MIME, public host, and LINE HTTP status. Tokens, LINE user IDs, and customer data are not logged.
- Admin history now distinguishes `成功`, `部分成功`, and `失敗`.
- Timeline logic treats a channel-level `partial` result as partial delivery.
- Historical success/failure entries remain readable without migration.

## 8. Files changed by this regression repair

### Modified

- `app/admin/orders/[orderNumber]/page.tsx`
- `app/api/admin/orders/[orderNumber]/customer-notifications/route.ts`
- `app/globals.css`
- `app/uploads/order-notifications/[fileName]/route.ts`
- `lib/customerNotificationDelivery.ts`
- `lib/customerNotifications.ts`
- `lib/orderNotificationPhotos.ts`
- `lib/orderTimeline.ts`
- `package.json`

### Added

- `scripts/test-line-order-notification-image.ts`
- `scripts/prepare-line-order-image-qa.ts`
- `docs/line-order-notification-image-regression-validation-report.md`

No Phase I.0A/I.1/I.2/I.2A file was reset, restored, or replaced. Changes in shared Admin order/timeline files were narrow additions on top of the surviving fulfillment work.

## 9. Interrupted work versus recovery completion

The surviving interrupted work had already completed:

- root-cause trace;
- centralized public-origin fallback;
- LINE-only JPEG original/preview generation;
- actual MIME/byte validation;
- public-fetch validation before LINE push;
- text+image payload construction;
- partial-success result/history UI;
- A–K targeted tests;
- isolated production build;
- synthetic public HTTPS checks;
- isolated Browser QA of history and attachment rendering.

After recovery, the worktree was re-read rather than reconstructed. The remaining work completed was:

- current diff and generated-asset audit;
- external concurrent Owner-runtime change attribution;
- real generated original/preview public header validation;
- complete requested regression suite;
- final TypeScript and targeted ESLint reruns;
- production-data fingerprint comparison;
- QA process/directory cleanup confirmation;
- this permanent report.

## 10. Tests and validation

| Validation | Result |
|---|---|
| LINE image A–K targeted suite | PASS — 11 assertions |
| JPEG upload → LINE JPEG | PASS |
| PNG upload → LINE JPEG | PASS |
| WebP history → actual JPEG derivative | PASS |
| HTTPS original/preview | PASS |
| Original 10 MB / preview 1 MB guards | PASS |
| Conversion/public-fetch failure → partial | PASS |
| Text only | PASS |
| Text + image payload | PASS |
| Existing WebP history | PASS |
| Route MIME for WebP/JPEG | PASS |
| TypeScript `npx.cmd tsc --noEmit` | PASS |
| Targeted ESLint | PASS — 0 errors, 1 existing `<img>` warning |
| Production build with isolated data root | PASS — Next.js 16.2.10, 22 pages |
| Order/cart/checkout | PASS — 20 assertions |
| Admin action feedback | PASS |
| Phase I.0A identity | PASS — 32 assertions |
| Member authentication | PASS — 24 assertions |
| Phase I.1 commerce | PASS — 41 assertions |
| Phase I.2 experience | PASS — 36 scenarios |
| Phase I.2A fulfillment | PASS — 28 assertions |
| Page Builder images | PASS |
| Product custom sections/media/YouTube/video | PASS |
| Product page content | PASS |
| Page Builder contract/design/visual style | PASS |
| Smart Link | PASS — 22 required + 10 CTA destinations |
| Health | PASS — 100/100 |
| `git diff --check` | PASS; only existing LF/CRLF notices |

The credentialed `npm run test:line` command was deliberately not executed because it would send a real production LINE message.

## 11. Browser/runtime QA

QA used `C:\Users\felix\AppData\Local\Temp\kd-line-order-image-qa-20260828` and port 3117 with a synthetic order/member/token. It did not submit the send action.

Observed in the production build:

- one `成功` and one `部分成功` history row;
- two historical WebP thumbnails loaded completely at their real 640×480 decoded size;
- no page-level horizontal overflow;
- the attachment input still accepts JPEG, PNG, and WebP;
- history remained unchanged because no form was submitted.

The Browser tab was closed, port 3117 has zero listeners, and the isolated QA directory was removed.

## 12. Global image and order regression

The global WebP strategy is preserved. Homepage, Product, Page Builder, Asset Library, Cloudinary/media, and other upload paths were not altered. Only order-notification delivery generates the JPEG derivatives required by LINE.

Order claim/history idempotency remains unchanged. A repeated action ID is still replayed rather than delivered twice.

## 13. Production data safety and concurrent Owner activity

Automated tests, build, and Browser QA used isolated storage. The agent sent no production LINE message and wrote no production order/member/subscription/credit/referral data.

During validation, the pre-existing background dev runtime recorded two Owner-initiated real notifications at 13:55–13:56. This externally changed `data/orders/KD20260807-7209.json` and added two WebP attachments plus their two JPEG original/preview pairs. Sanitized results show:

- `messageTypes: ["text", "image"]`
- `imageMimeType: "image/jpeg"`
- public host `slit-gorged-decibel.ngrok-free.dev`
- LINE HTTP 200

Those Owner-generated records/files were preserved and were not created, edited, or deleted by automated QA. API 200 plus public fetching proves a compliant requested payload, but final display on the Owner's LINE device still requires Owner observation.

All production members, all other orders, fulfillment state, Homepage, Products, Assets, Pages, and monthly-menu hashes matched this task's preflight values. Membership identity/commerce production files remained absent.

## 14. Git and cleanup

- Temporary build root: removed.
- Temporary Browser QA root: removed.
- Synthetic public JPEG QA pair: removed.
- QA server port 3117: zero listeners.
- Existing Owner notification WebP/JPEG files: preserved.
- Staged: NO.
- Committed: NO.
- Pushed: NO.
- Deployed: NO.

## 15. Final matrix

| Requirement | Status |
|---|---|
| LINE TEXT MESSAGE | PASS |
| LINE IMAGE MESSAGE | OWNER REAL-SEND REQUIRED |
| WEBP ROOT CAUSE | CONFIRMED — secondary format blocker; primary omission was public URL env mismatch |
| LINE JPEG/PNG DERIVATIVE | PASS |
| PUBLIC HTTPS IMAGE URL | PASS |
| ORIGINAL IMAGE MIME | PASS — `image/jpeg` |
| PREVIEW IMAGE MIME | PASS — `image/jpeg` |
| FALSE FULL-SUCCESS STATUS | FIXED |
| ADMIN NOTIFICATION HISTORY | PASS |
| EXISTING WEBP HISTORY | PASS |
| GLOBAL WEBP OPTIMIZATION | PRESERVED |
| ORDER REGRESSION | NONE |
| PHASE I.0A REGRESSION | NONE |
| PHASE I.1 REGRESSION | NONE |
| PHASE I.2 REGRESSION | NONE |
| PHASE I.2A REGRESSION | NONE |
| PRODUCTION DATA MODIFIED | YES — two concurrent Owner-runtime sends; automated QA/agent modified none |
| PRODUCTION LINE MESSAGE SENT | YES — two Owner-initiated runtime sends; agent sent none |
| STAGED | NO |
| COMMITTED | NO |
| PUSHED | NO |
| DEPLOYED | NO |
| READY FOR OWNER REAL-LINE RECHECK | YES |
