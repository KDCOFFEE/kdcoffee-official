# J.6F.2C isolated Owner QA

Run from the J6F2 settlement worktree with existing dependencies:

    node --experimental-strip-types --import ./scripts/return-workflow-qa-bootstrap.mjs scripts/serve-return-refund-owner-qa.mts

Open http://localhost:3162/__qa. Backend is loopback port 3163. The launcher creates fresh OS temporary data, disposable members and random signing secrets. It clears Railway data roots and LINE tokens; no real bank transfer or LINE delivery occurs. The enabled LINE setting deliberately produces a visible failed/retryable notification state with empty credentials.

Cases 1..4: on-site, ATM, home COD, 7-ELEVEN payment. Every case starts with a completed source order and no return request. Source orders are KD20261030-9301..9304. Each eligible merchandise refund is NT$500; home shipping and COD fees remain separate and non-refundable.

Member password: Return-QA-Member-2026. Admin password: Return-QA-Owner-2026. Portal links apply only the matching disposable session. Generated session cookies and fixture files stay in ignored qa-output/ or the OS temporary root.

Workflow: Member selects an enabled handoff and fills a bank account only for bank refunds. Admin approves, then postpones or processes the manual refund. The confirmation records a payment already made outside the site. It never transfers funds. Proof uses the existing order-photo validator/storage. Notifications currently send text only; bank/proof details are excluded from LINE.

Settings: /admin/membership, return/refund section; customer wording: /admin/member-center/copy. Destination fields and enable flags have a single membership business rules source. Return requests retain their own snapshots. Refund amount comes only from returnPaymentAllocation.ts; active fee changes cannot rewrite historical paid fees.

Focused integration tests:

    node --experimental-strip-types --import ./scripts/return-settlement-test-bootstrap.mjs scripts/test-phase-j6f2c-refund-workflow.mts
    node --experimental-strip-types --import ./scripts/return-settlement-test-bootstrap.mjs scripts/test-phase-j6f2c-refund-ui.mts

Optional live smoke test against this disposable server only:

    node --experimental-strip-types --import ./scripts/return-workflow-qa-bootstrap.mjs scripts/test-phase-j6f2c-live-qa.mts

The smoke test creates an additional temporary order and leaves the four Owner cases untouched. Do not run it against production or another server.

Set RETURN_REFUND_QA_PORT to a different loopback port when verifying an integration checkout alongside the existing Owner server. The backend uses port+1; use the same variable for optional live scripts. The Next child uses real authentication/runtime, never the SSR fixture loader.
