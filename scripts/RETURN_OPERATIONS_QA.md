# Return operations QA (J.6F.3)

Use only a fresh temporary QA root created by the existing launcher. It clears real LINE/Email credentials. No actual transfer, customer message or Production mutation is performed.

From this worktree, start the already-built application in a fresh PowerShell:

```powershell
$env:RETURN_REFUND_QA_PORT='3193'
$env:RETURN_REFUND_QA_SERVER_MODE='start'
node --experimental-strip-types --import ./scripts/return-workflow-qa-bootstrap.mjs scripts/serve-return-refund-owner-qa.mts
```

In another PowerShell, with the same port configured, run:

```powershell
node --experimental-strip-types --import ./scripts/return-workflow-qa-bootstrap.mjs scripts/test-phase-j6f3-live-qa.mts
```

This creates three new synthetic orders: completed NT$500 cash, completed NT$500 bank, and an approved NT$500 request awaiting Owner routing review. Existing Owner orders and ledger prefixes are preserved. Current URLs are written to ignored `qa-output/j6f3-final/owner-cases.json`. Synthetic sign-in helpers: `/__qa/admin/4`, `/__qa/member/4`.

Notification policy lives in `/admin/membership`, section 08. The central refund-completed event takes precedence; saved rules mirror its value to the retained legacy `returnRefund.lineEnabled` field. Member lifecycle wording and the existing refund notification body use Member Center copy management.

Isolated tests use `return-settlement-test-bootstrap.mjs`; real HTTP tests use `return-workflow-qa-bootstrap.mjs`. The HTTP privacy suite additionally requires a completed proof fixture; `test-v3-live-return-settlement.mts` creates one while verifying original-expiry credit restoration.

Manual review can select a routing method only after the canonical allocation proves a safe amount. It never accepts an amount override or changes original payment/request evidence. New bank information requires explicit member-provided acknowledgement and remains masked outside the existing authenticated processing action.
