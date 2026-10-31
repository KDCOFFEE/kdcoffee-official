# J.6F.1E local visual QA

From a fresh PowerShell in `F:\KD_Coffee_Studio_J6F1_RETURN_DEV_20261028`:

```powershell
node .\scripts\start-return-workflow-qa.mjs
```

Verified with Node v24.18.0. No npx, tsx, installation, NODE_OPTIONS, manual
`--import`, or manual file URL is needed. Stop with Ctrl+C before restarting.

The wrapper uses native TypeScript stripping and a QA-only runtime bootstrap.
The bootstrap explicitly resolves and loads its empty virtual `server-only`
module. The Next child process uses real Next headers/auth, not SSR test mocks.
Do not use `return-workflow-test-bootstrap.mjs` to launch this server.

Each launch creates fresh isolated storage under `os.tmpdir()` and prints its
location. Fixture session details are saved in ignored
`qa-output/j6f1e-visual-session.json`. It never uses production/customer data.

- Member: `return-qa@example.test` / `Return-QA-Member-2026`
- Admin password: `Return-QA-Owner-2026`
- Member login: http://localhost:3161/member
- Admin login: http://localhost:3161/admin/login
- `KD20261029-9001`: select 6 units for normal confirmation, cancel, then select
  12 units for expired-credit confirmation. Source A50 is expired; B50 is valid.
  Return60 previews B50 + A10; no credits are restored.
  Return credit balances use the shared Member Center credit name
  (`member.rewards.storeCredit.title`), never the NT$ money formatter.
  Change that field at `/admin/member-center/copy` and refresh Member Center
  and Return: both follow the same label, including expiry details/warnings.
- `KD20261029-9002`: processing return with reward HOLD and one synthetic QA
  photo stored through the existing order-photo helper (not a customer image).
- `KD20261029-9003`: approved partial return, pending POINT reward 10 → 4.
  Preserved basis: 200 points × 5%. The isolated Admin conversion is 2.5 credit
  units per point, so original/adjusted credit equivalents are 25 → 10, not 10 → 4.

J.6F.1F fixtures use actual `self_purchase_direct` self-purchase rewards and
original valid-consumption evidence. The earlier E fixture seeded retail
promotion rewards. The first F self-purchase fixture used a paid-amount basis;
it was not evidence of a 200-point × 5% reward. No real historical reward is relabelled.
The QA launcher always disables outbound return LINE notifications.

For the normal server, `RETURN_REQUEST_LINE_NOTIFICATION_ENABLED=true` enables
return-request alerts through the existing internal LINE token/recipient
configuration. It defaults to off. Failed delivery does not reject a return.

The original fixture's expiry dates are relative to launch time so the two
dialog cases remain reproducible after restarts. No return/reward rules change.

## Recovery diagnosis

The project does not declare/lock tsx and its dependency junction does not
contain tsx. The inspected npx cache contained tsx 4.23.15. Running that CLI
with the SSR test bootstrap reproduced the Windows `data:text\javascript...`
ENOENT: virtual `next/headers` was delegated through both test load hooks to
tsx and then Node's CommonJS `defaultLoadImpl`, which calls `fs.readFileSync`
on what it considers a filename. Native Node 24 ESM loading of those virtual
modules succeeded. Loader interaction/order caused the path conversion, not
the absence of a production `server-only` package. No Node downgrade is needed.

The previously successful seven-route check used native Node with
`member-auth-test-bootstrap.mjs`, not tsx. The wrapper makes that native-runtime
approach explicit, with a dedicated virtual-module load handler and file URLs.
