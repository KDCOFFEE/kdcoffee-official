# KD Coffee J.5D.5 — Member Backup & Disaster Recovery

This implementation is intentionally isolated from J.5D.4F-4 and does not
change member, subscription, order, checkout, fulfillment, or referral-reward
mutation logic.

## What it backs up

- `members/**`
- `member-identity/registry.json`
- `membership-commerce/commerce-state.json`
- `membership-commerce/business-rules.json`
- `orders/**`
- `fulfillment/state.json`
- `fulfillment/settings.json`
- `uploads/member-avatars/**`
- `uploads/order-notifications/**`
- `store/website-data.json`
- human-readable `members.csv`
- human-readable `organization.csv`
- reconstructable `organization-tree.json`
- offline visual `organization.html`
- `manifest.json`
- `checksums.sha256`

Production backup root:

`/data/backups/members/<backupId>/`

Every dataset above is critical. A missing dataset or malformed critical JSON
fails the backup, except that a missing `member-avatars` directory is recorded
as `valid-empty` only when canonical member profiles contain no non-empty
`avatarUrl`. Provider `pictureUrl` values do not refer to this local directory.

## Safety properties

- Read-only against production member/order/commerce sources.
- Production execution fails closed unless `NODE_ENV=production`,
  `KD_DATA_DIR=/data`, `RAILWAY_VOLUME_MOUNT_PATH=/data`, and the resolved
  mounted directory exists at `/data`.
- Tests require the explicit code-only test override, `NODE_ENV=test`, and an
  explicit temporary `KD_DATA_DIR`. Routes never expose that override.
- Every critical source is inventoried and hash-checked before and after copy.
  Any changed, added, or removed source file fails the snapshot.
- Every critical JSON file is parsed before publication.
- Backup is first created in a hidden staging directory and only renamed into a visible backup after verification.
- The global referral graph is preserved without the Member UI depth or
  per-parent display limits. Integrity findings are recorded in
  `organization-tree.json` and the manifest.
- `organization.html` embeds a private member index and remains a single-file,
  fully offline viewer. It can search by name, normalized phone, normalized
  email, member number, or Member ID; duplicate matches are shown as a result
  list instead of silently selecting the first member.
- Graph nodes and search results show masked contact data only. Selecting a
  member opens an explicitly labelled private detail panel with canonical-ID
  joins for identity, organization, subscriptions, recorded commerce rights,
  orders, and fulfillment. Unresolvable records are not guessed from names,
  phone numbers, or email addresses.
- The offline viewer makes no API, CDN, font, fetch, or XHR request. Search,
  profile inspection, copy controls, expand/collapse, zoom, pan, reset, and
  root navigation all run from data embedded in the backup HTML.
- No restore endpoint is included.
- ZIP download is Admin-authenticated, backup-ID-only, path-boundary checked,
  checksum-revalidated, private, and `no-store`.
- The verifier continues to accept immutable `J.5D.5A-H1-v1` backups while
  newly generated snapshots identify the enhanced offline viewer as
  `J.5D.5A-H2-v1`.
- Admin API requires existing Admin authentication.
- Cron API requires a dedicated `MEMBER_BACKUP_CRON_SECRET`.
- Retention defaults to 90 days and never accepts less than 7 days.

## Endpoints

- `GET /api/admin/member-backups` — list verified backups
- `POST /api/admin/member-backups` — create a manual verified backup; does not
  run retention pruning, including the first Production backup
- `GET /api/admin/member-backups/<backupId>/download` — download a revalidated ZIP
- `POST /api/internal/member-backup` — create a cron backup with Bearer auth

## Railway variables

- `KD_DATA_DIR=/data`
- `RAILWAY_VOLUME_MOUNT_PATH=/data`
- `MEMBER_BACKUP_CRON_SECRET=<long random secret>` (needed only for the future cron route)
- optional: `MEMBER_BACKUP_RETENTION_DAYS=90`

A scheduler can POST once daily to:
`https://www.kdcoffee1962.com/api/internal/member-backup`

with:
`Authorization: Bearer <MEMBER_BACKUP_CRON_SECRET>`

## Important

Before the first Production run, the Owner should review the diff, deploy it,
sign in as Admin, make exactly one Admin POST, inspect the returned Production
provenance and counts, download the ZIP, and verify the ZIP off Railway. This
phase does not call that endpoint and does not upload offsite automatically.
