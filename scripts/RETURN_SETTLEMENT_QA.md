# J.6F.2A/B return settlement and isolated Owner QA

Base: f596a97c98a641d2dfba6e5e8a0163cf564282cc. J.6F.2A and J.6F.2B are Owner accepted for local closeout. Payment refund remains unimplemented; push/deploy and J.6F.2C are outside this milestone.

## Accepted J.6F.2A inventory foundation

This section records the original inventory-only foundation. The J.6F.2B credit behavior below supersedes its financial placeholders.

The approval transaction appends RETURN_APPROVED and deterministic settlement PLANNED events in the same membership-commerce atomic write. A plan is per approved line, plus non-executing member_credit_restore/payment_refund placeholders. Plans and outcomes form a validated hash-linked append-only log; IDs depend on the preserved approval event, effect kind and returnLineRef. No payment or member-credit effect can be applied in 2A.

The worker reuses createCoffeeInventoryParticipant / createStoreInventoryParticipant, their atomic stock+receipt writes, original APPLY receipt linkage and cumulative restore budget. Modern N-domain targets are proven by the original PREPARED/FINALIZED journal, intent hash, participant receipt hash and exact frozen order lines. Legacy Coffee is supported only where its private coffee-apply receipt, aggregate inventoryTransaction changes and every frozen optionId/slug/quantity agree. Hash-only/public/ambiguous/non-stock/unsupported subscription evidence never creates or guesses inventory; it becomes manual_review_required.

Lock order: settlement operation rank 0 -> existing order gate rank 1 -> existing Coffee/Store inventory rank 2 -> source order rank 3 -> commerce rank 5. All locks are declared before acquisition. Approval releases its order/commerce locks before starting the effect worker. No cancellation status helper or cancellation side effect is invoked.

A transient inventory failure appends FAILED without losing approval. applyApprovedReturnInventory can safely retry: the existing inventory participant returns the original durable receipt after a stock write, even if the APPLIED outcome was never saved. Hard termination preserves stale locks according to the existing lock protocol: production does NOT auto-delete them. Following explicit operator recovery of confirmed-dead locks, retry recognizes the same receipt. Tests remove only their own dead-worker fixture locks, matching existing inventory crash tests.

Partial approval supplies approvedLines; omitted selections retain historical full-request approval. The remainder is rejected and released from pending quantity. D/D1 consumption and reward consequences read approved quantities, not requested quantities. The original request/confirmation is never rewritten. Positive source-credit partial decisions remain manual financial review for later phases; 2A does not invent a partial-credit settlement allocation or expiry rule.

Admin shows inventory applied quantity and pending/failed/manual review state. Members see their approval decision and partial approved/rejected counts; no ledger IDs or retry internals are sent to member DTOs. No payment/credit execution buttons exist.

Focused test command (Node 24, existing dependencies):

    node --experimental-strip-types --import ./scripts/return-settlement-test-bootstrap.mjs scripts/test-phase-j6f2a-return-settlement.mts

Tests use isolated mkdtemp data only. Source order/payment bytes, member credit entries/reservations, protected repository files and all non-generated files of the dirty J.6F.1 worktree are checked unchanged. The final closeout additionally runs the requested regression set and one isolated production-build attempt; generated logs stay in qa-output.

## J.6F.2B current credit execution

Approval now runs inventory, then an independent member-credit effect. Payment remains pending_future_settlement and cannot receive outcomes. The existing creditEntries ledger, issueCreditInState, effective available balance and credit:issue keys are reused; a compensation entry is appended per valid original source with exact original expiresAt and order/request/approval/effect/source attribution. The private original-expiry parameter is unavailable to the public issueCredit API, which rejects reserved return references. Existing issuer expiry rules remain unchanged.

Credit entries and APPLIED evidence commit atomically to the existing commerce-state file under order gate -> order -> commerce locks. Any pre-commit failure leaves no wallet changes and appends a retryable FAILED outcome. Exact source/expiry proof failures require manual review. A settled effect is never applied twice, including across processes. The existing hard-crash stale-lock/operator-recovery policy remains unchanged. Member maintenance removes unrelated rows while retaining exact credit dependencies collected from persisted approvals/effects. Pending, retryable, applied and manual-review effects keep their original consumed reservation, its source entries, restored entries, source consumption/qualification evidence and exact operation keys. Connected reservations and explicit debit/reversal allocations remain intact; no member/global block is used. Both selective and all cleanup validate the retained state before writing. Missing exact dependency proof fails before any write.

Request previews retain selected original consumed sources, later-expiry-first. New snapshots also freeze per-unit credit contributions for partial approval; rejected units release only their unapproved slices. Approved expired/non-restored slices remain occupied and auditable. Legacy full approvals use the original snapshot; historical partial approvals lacking per-unit proof require manual review rather than an invented allocation.

Existing membership business rules now contain credit.returnCreditExpiryWarningDays, default 7, integer 0..365, editable in the existing Admin credit rules card and documented by its existing help system. A valid credit is near-expiry if its last usable Asia/Taipei date (exclusive expiresAt minus one millisecond) is at most today + N calendar days. Zero means last usable today. Expired sources never enter this warning. New previews use current settings; confirmed snapshots keep their original warning calculation. Warnings do not block submission.

Final eligibility is evaluated inside the credit execution lock using actual execution time, even when approval was earlier. Expired selected sources restore zero; there is no source substitution or expiry extension. Preview and actual result remain separate. Member/Admin summaries use member.rewards.storeCredit.title through the existing shared copy provider; source expiry details are collapsed. New warning/result/passbook labels are editable in /admin/member-center/copy. No internal source, ledger or effect IDs appear in the safe credit result.

Focused credit command:

    node --experimental-strip-types --import ./scripts/return-settlement-test-bootstrap.mjs scripts/test-phase-j6f2b-credit-restoration.mts

NO PAYMENT REFUND EXECUTED. All fixtures use isolated temporary data. All commands below use disposable QA data and do not authorize production data mutation, push or deployment.

Focused dependency-cleanup regression:

    node --experimental-strip-types --import ./scripts/return-settlement-test-bootstrap.mjs scripts/test-phase-j6f2b-cleanup-protection.mts

## Owner QA and final result presentation

Run from the repository root with Node 24 and the existing dependencies:

    node --experimental-strip-types --import ./scripts/return-settlement-test-bootstrap.mjs scripts/serve-return-credit-owner-qa.mts

The launcher creates a fresh OS temporary storage root and listens only on loopback: Owner portal http://localhost:3162/__qa, Next development backend 127.0.0.1:3163. Case links switch to separate disposable member accounts. Generated session tokens, fixture files, HTTP snapshots and logs are never source files and must remain outside commits. The default test passwords in the launcher are QA-only; session signing secrets are generated per run.

Orders KD20261029-9201..9205 cover normal +50, non-blocking near-expiry 20, historical estimate 50 / actual 0 / expired 50, mixed 60 / actual 30 / expired 30, and same-settlement retry +0. The launcher also rechecks cleanup isolation. Credit labels use member.rewards.storeCredit.title; change the shared name through the existing /admin/member-center/copy page. No second return-unit setting exists.

Before settlement the estimate/warning is primary. Applied settlements show only actual restored and expired/non-restored totals in the primary card. Source/result expiry explanation and original request estimate are separate closed disclosures, shared by Member/Admin. They do not rewrite ledger/evidence values.

Focused UI/copy command:

    node --experimental-strip-types --import ./scripts/member-copy-test-bootstrap.mjs scripts/test-phase-j6f2b-result-ui.mts
