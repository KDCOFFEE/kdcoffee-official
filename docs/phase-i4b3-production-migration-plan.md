# Phase I.4B.3 Controlled Production Migration Plan

This is a future procedure only. It does not authorize Railway access, volume population, deployment, real transactions, or Git index changes.

## Migration manifest gate

Use `config/production-migration-manifest.json` as the machine-readable allowlist. Migration must stop while either `OPENING_INVENTORY_REQUIRED` or `BUSINESS_RULES_REQUIRED` remains in the manifest. No path outside its bootstrap section may be copied into a new production volume.

## First Railway volume procedure

1. **Owner approval required — pre-deploy checkpoint.** Confirm the Phase I.4A verified backup remains readable, create a fresh manual repository/configuration checkpoint, record baseline commit and protected hashes, and confirm staging/deployment scope contains no runtime evidence.
2. **Owner approval required — opening inventory.** Complete every `OWNER REQUIRED` cell in `phase-i4b3-opening-inventory-owner-review.md`. Apply only those approved integers to a review copy of the immutable website seed. Record its new SHA256 in the migration manifest.
3. **Owner approval required — business rules.** Resolve every row in the business-rules decision table. Generate and review a new one-version immutable business-rules seed; do not copy the current five-version history. Enable its manifest entry and record its SHA256 only after approval.
4. **Owner/infrastructure approval required — volume.** Create one Railway persistent volume for the single service and attach it at `/data`. Do not add a second application replica.
5. Set `KD_DATA_DIR=/data`. Keep secrets in Railway variables only. Do not upload local `.env` files.
6. Verify the runtime-provided `RAILWAY_VOLUME_MOUNT_PATH`. It must be `/data`, or `KD_DATA_DIR` must be an absolute descendant of that mount. Start must fail on mismatch.
7. **Owner approval required — first bootstrap.** Confirm `/data` is empty, then start exactly one application instance. Allow startup instrumentation to perform the exclusive one-way bootstrap.
8. Compare all five store JSON SHA256 values and every derived persistent-media destination against the approved manifest/seed plan. Validate JSON schemas and confirm no temporary bootstrap files remain.
9. Prove `/data/orders` and `/data/members` are empty; member identity is empty; `commerce-state.json`, fulfillment `state.json`, and fulfillment `settings.json` are absent; and no acceptance identifiers or lifecycle records exist anywhere under `/data`.
10. Restart the same single instance. Recalculate every bootstrapped JSON/media hash and prove all values are unchanged.
11. Perform controlled read-only smoke QA: health, catalog, homepage, pages, monthly menus, local seed media, Admin read views, membership rule display, and 7-ELEVEN dataset lookup. Do not submit an order or change Admin data.
12. **Owner approval required — mutation smoke QA.** If read-only QA passes, perform only explicitly approved configuration/mutation checks using a documented disposable test identity, then verify expected file creation and audit output. Do not use acceptance identities or transactions.
13. **Owner approval required — first real transaction.** Enable a real production transaction only after backup/restore readiness, payment/fulfillment readiness, approved inventory, approved rules, and smoke evidence are signed off.
14. Immediately create and verify a post-initialization volume backup. Record JSON/media hashes and the single-replica deployment revision. Schedule the accepted daily and weekly backup policy and complete a restore rehearsal before production approval.

Any unexpected pre-existing `/data` file, hash mismatch, acceptance evidence, second replica, corrupt seed, missing media, or configuration mismatch is a stop condition. Never solve it by overwriting persistent data.

## Future tracked-runtime index migration procedure

Execute only at a separately approved checkpoint. `git rm --cached` removes paths from the index while preserving their physical local files; verify those files before and after.

1. Close application processes that could mutate runtime files.
2. Recalculate the five protected hashes and compare them to the accepted values.
3. Verify the Phase I.4A backup path and create an additional read-only copy/checkpoint of all tracked runtime and notification evidence.
4. Confirm the immutable `bootstrap/store` blobs and manifest hashes are reviewed. Confirm an approved business-rules seed exists before removing the tracked rules history.
5. Run only these explicit index operations—never `git add .`:

```powershell
git rm --cached -- data/fulfillment/state.json
git rm --cached -- data/membership-commerce/business-rules.json
git rm --cached -- public/data/website-data.json public/data/homepage.json public/data/assets.json public/data/monthly-menus.json public/data/pages.json
git rm --cached -- public/uploads/order-notifications
```

6. Verify every physical path still exists with `Test-Path`; recalculate protected hashes and compare again.
7. Stage only the approved policy, immutable seeds, manifest, code, tests, and documentation with explicit paths. Example shape:

```powershell
git add -- .gitignore .env.example bootstrap/store config/production-migration-manifest.json docs/phase-i4b3-repository-runtime-policy.md docs/phase-i4b3-opening-inventory-owner-review.md docs/phase-i4b3-production-migration-plan.md
```

Add implementation/test paths explicitly in the same manner after reviewing their diffs. Do not stage protected runtime contents as additions.

8. Inspect `git diff --cached --name-status` and `git diff --cached`. The intended deletions are index-only removals of legacy runtime/evidence locations; immutable replacements must appear under `bootstrap`, never as acceptance-derived content.
9. Run the complete Phase I.4B and regression gates from a clean disposable test root. Recalculate protected hashes a third time.
10. Request Owner approval of the exact staged patch before commit. Never use `git clean`, `git reset`, or `git restore` in this procedure.

The legacy `public/data/*.pre-*` files and `public/data/711-stores.pending.json` require a separate archive/tooling review. They are not production bootstrap sources and are deliberately omitted from the initial index-removal command until their archival value is decided.
