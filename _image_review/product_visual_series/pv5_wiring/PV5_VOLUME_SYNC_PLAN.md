# PV.5 Volume sync plan — explicit apply only

Status: isolated simulation complete; NO Railway volume access/apply, deploy, commit or push performed. Production: kdcoffee-official / production / CLI deployment, no tracked GitHub branch; persistent root /data.

| REPOSITORY SOURCE | LIVE VOLUME TARGET | SYNC REQUIRED | MERGE STRATEGY | CONFLICT RULE | BACKUP / ROLLBACK |
| --- | --- | --- | --- | --- | --- |
| bootstrap/patches/pv5-approved-product-visuals-v01.json | /data/store/website-data.json | YES, explicit reviewed migration | Append only absent P00024/P00025; add eight assets.productVisual; select listAsset only | 23 known ID/slug baseline; duplicate keys/IDs/slugs; unsafe existing drafts; different productVisual/list role → STOP | Exact snapshot before write; CAS rollback |
| public/uploads/artworks/*/kdcoffee-*-product-visual-v01.webp | /data/uploads/artworks/*/same filenames | YES for persistent upload architecture / route fallback; repository public match can already serve these URLs before apply | COPY_MISSING or KEEP_IDENTICAL by approved SHA256; no recompression | Different target bytes or incorrect source SHA → STOP before backup/write | Existing files never overwritten; rollback leaves newly copied immutable media unreferenced |
| Four committed Eyck/La Tour product-photo-v01.webp and package-label-v01.png | /data/uploads/artworks/eyck-soft-shadow and la-tour-dawn | YES when missing | Same SHA256 copy-only strategy; original Hero/label references remain | Any different existing bytes → STOP | Same preflight and receipt; no deleting existing media |
| bootstrap/store/*.json / public/data/*.json | Existing /data/store/*.json | NO blanket sync | Never copy repository canonical JSON over the live file | No bootstrap overwrite or unrelated metadata replacement | Preserve exact existing bytes outside surgical allowed edits |
| Orders, membership, identity, fulfillment, rewards, subscriptions, avatars | All corresponding /data runtime paths | NO | No traversal or writes by this migration | Any unrelated mutation is FAIL | 61 original other files stayed byte-identical in isolated simulation |

## Tool and authorization boundaries

scripts/migrate-pv5-product-visuals.mjs is standalone Node ESM with built-in modules only. Run from the reviewed clean repository/deployment source containing the manifest and promoted assets. No environment-driven implicit target. --volume-root must be explicit and absolute; --snapshot is a read-only snapshot alternative. Default is dry-run: no data, directory, lock, media, receipt or backup is created. This phase did not execute any command against /data.

Future operator commands (NOT executed on production):

```sh
node scripts/migrate-pv5-product-visuals.mjs --volume-root /data
node scripts/migrate-pv5-product-visuals.mjs --snapshot /operator-snapshot/website-data.json
# Only after separate Owner approval and reviewed dry-run SHA:
node scripts/migrate-pv5-product-visuals.mjs --volume-root /data --apply --expect-sha256 <reviewed-beforeSHA256>
# Rollback dry-run, then separately authorized rollback:
node scripts/migrate-pv5-product-visuals.mjs --volume-root /data --rollback /data/backups/<patch-id>/<receipt-dir>
node scripts/migrate-pv5-product-visuals.mjs --volume-root /data --rollback /data/backups/<patch-id>/<receipt-dir> --apply --expect-sha256 <current-reviewedSHA256>
```

## Apply, conflicts, and preservation

1. Acquire canonical website-data.json.lock using exclusive create, the existing application convention. A held/stale lock stops; another writer’s lock is never removed. Pause Admin writes for the short operator migration window. Dry-run does not acquire a lock and cannot be treated as authorization.
2. Under lock, compare expected raw SHA256 against current canonical bytes. Revalidate baseline identities and the two draft safety flags, all eight allowed-field changes and all twelve media targets. Reject symlink/escaping targets. Do not overwrite a conflicting media file or silently accept a different existing visual/role.
3. Plan against CURRENT runtime values, not repository originals. Preserve current prices, sale SKUs, stock, copy, ordering, unknown product fields, root settings and all unrelated assets. Append drafts last without reordering existing products. JSON span edits preserve key order, original line endings and unaffected text; no whole-file formatting. Exact semantic assertions project away only the added visual and list selector and prove equality to the current input.
4. Before media/data publication, write /data/backups/pv5-approved-product-visuals-v01/<timestamp-uuid>/website-data.before.json and receipt.json with verified before/after hashes. Publish verified missing media first through exclusive temp/hard-link operations. Recheck canonical hash and atomically rename a verified JSON temp into place. An interrupted media copy may leave harmless unreferenced new media; existing business data is not replaced by a baseline.
5. Second apply to the identical target is a no-op: no duplicate drafts, references, asset copies or backup. Rollback is allowed only while current canonical hash equals the receipt after-hash; later live edits require reconciliation. Restore exact original JSON bytes; retain copied media. Re-deploying old code does NOT roll back volume data. Existing unsafe/conflicting records require Owner reconciliation; do not guess or overwrite them.

## Isolated evidence

Candidate = clean 5026097 archive with exactly 16 selected code/manifest/test/asset overlays; physical dependencies, separate .next and separate KD_DATA_DIR. Original working-tree .next and protected data were not used for the build or modified. Simulation directory is local and excluded from staging.

23 → 25; P00024/P00025 safe drafts appended; eight correct visual references; only the list selector changed. Exact business projection for 23 existing records PASS; 17 untargeted records exact. Original 61 other volume files SHA256 PASS, including store assets/homepage/pages, membership rules, protected sentinels and old uploaded assets. Twelve target files include eight approved masters plus four original draft support files. Tested dry-run no writes, conflict/stale stop, held lock, idempotence, backup and exact CAS rollback. Source/promotion/isolated URL SHA256 8/8 PASS.

No live snapshot was obtained in this phase. These results prove the tool and isolated candidate, not that live production currently satisfies every baseline/conflict check. The actual reviewed live dry-run remains mandatory before any production apply. Next public-static matching takes precedence when the exact repository asset exists; actual HTTP 8/8 used public files (max-age=0). The volume route handler was separately verified 8/8 status/hash (max-age=3600). Copying the volume files retains the existing persistent architecture/fallback, while canonical reference changes are what activate the visuals in cards. Code alone can make the URLs available but does not change existing canonical product selections.

## Safe next order

Owner PV.5 review → separately authorized commit → separately authorized push → separately authorized CLI deploy of that clean reviewed commit → obtain/review current live dry-run → separately authorized production migration apply → live URL / cards / draft-safety verification. Code deploy precedes apply because it installs the clipping opt-outs; applying new list references under old code could route masters into cropped Related/thumbnail frames. Code-only deploy does not activate the new images on an existing volume. No automatic migration or branch connection is introduced.
