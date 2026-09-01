# Phase I.4B.1–I.4B.2 Storage Root and Bootstrap Contract

## Runtime storage root

- `KD_DATA_DIR` is the canonical KD Coffee persistent-storage setting.
- Local development may leave it unset; existing repository-local development paths remain unchanged.
- Production Railway should mount one volume at `/data` and set `KD_DATA_DIR=/data`.
- When `RAILWAY_VOLUME_MOUNT_PATH` is present, it is accepted as the root if `KD_DATA_DIR` is absent. If both are present, `KD_DATA_DIR` must equal the mount or be beneath it.
- Explicit roots must be absolute and may not be a filesystem root such as `/` or `C:\`.
- A detected Railway production runtime without either storage root fails startup instead of using ephemeral repository-local transaction paths.

Railway volumes are runtime resources. Bootstrap is performed by the Node.js startup instrumentation, not by the build or pre-deploy command.

## Empty-volume bootstrap

An empty persistent root receives only the five immutable repository store seeds from `bootstrap/store`:

- `website-data.json`
- `homepage.json`
- `assets.json`
- `monthly-menus.json`
- `pages.json`

The initializer validates seed JSON, derives persistent media references from those documents, validates every required repository media source under `public`, and then publishes complete files with exclusive atomic creation. Existing persistent files are authoritative and are validated but never overwritten. The legacy mutable local files under `public/data` are not production bootstrap inputs.

Media copied into the volume is limited to paths served through storage-root-aware routes:

- `/uploads/assets/{category}/{file}`
- `/uploads/artworks/{slug}/{file}`
- `/images/campaigns/{file}` → `/data/uploads/campaigns/{file}`
- `/images/home003/{file}` → `/data/uploads/home003/{file}`

External URLs and ordinary static public paths remain external/Git-served and are not copied. Unsafe traversal, missing source media, corrupt JSON, and corrupt existing targets fail startup clearly.

Bootstrap never initializes orders, members, member identity, commerce transaction state, fulfillment state, notification photos, or Membership Test Lab data. The tracked membership business-rules history remains outside automatic bootstrap until Phase I.4B.3 approves its explicit repository/runtime seed policy.

## Production operating constraints

- The file-backed deployment remains single replica.
- Do not mount or populate the production volume until isolated empty-volume, restart, backup, and restore tests have passed.
- Existing volume data must never be refreshed from a newer Git seed.
- Backup policy remains: daily Railway volume backup, manual pre-change backup, weekly encrypted off-volume copy, and a restore rehearsal before production approval.
