# KD Coffee Studio Phase I.2 Engineering Validation Report

**Scope:** Member Subscription Experience + Owner Business Controls  
**Validation date:** 2026-08-28 (Asia/Taipei)  
**Branch / baseline:** `main` / `a3135ff0c4c124ccb2038952336a8ee879bf654c`  
**Release decision:** Ready for Owner acceptance; not authorized or ready to begin Phase I.3.

## Numbered validation record

1. PASS — Continued from the existing interrupted worktree; no restart, reset, or replacement implementation was performed.
2. PASS — Phase I.0A unified member identity changes remain present.
3. PASS — Phase I.1 membership commerce foundation changes remain present.
4. PASS — Phase I.2 work was completed in the same worktree and branch.
5. PASS — No files were staged.
6. PASS — No commit was created.
7. PASS — No push was performed.
8. PASS — No deployment was performed.
9. PASS — Phase I.3 was not started.
10. PASS — Owner artifacts and backups were preserved without modification or deletion.
11. PASS — Member identity is resolved through the canonical member record.
12. PASS — Email and LINE identities remain linkable to the same canonical member.
13. PASS — Subscription reads and mutations require an authenticated canonical member.
14. PASS — Cross-member subscription mutation is rejected.
15. PASS — Member identity foundation test passed 32 assertions.
16. PASS — Member authentication compatibility test passed 24 assertions.
17. PASS — The no-subscription state is represented in the member experience.
18. PASS — First original-price enrollment creates a pending subscription.
19. PASS — First successful pickup activates the subscription.
20. PASS — The first renewal applies the configured 95% subscription price.
21. PASS — Subscription enrollment is explicit and requires member consent.
22. PASS — Enrollment captures the selected 30/45/60-day interval.
23. PASS — Enrollment captures the first renewal date.
24. PASS — Checkout explains that the first order remains at original price.
25. PASS — Checkout persists subscription intent into the order request.
26. PASS — Order idempotency hashing includes subscription intent.
27. PASS — A successful order can create one subscription without duplicate creation.
28. PASS — Member subscription summary shows current status.
29. PASS — Member subscription summary shows next shipment date.
30. PASS — Member subscription summary shows coffee names.
31. PASS — Member subscription summary shows the modification deadline.
32. PASS — Member subscription summary shows expected payment.
33. PASS — Member actions operate on the next cycle, not past fulfilled cycles.
34. PASS — Members can advance the next cycle once without moving the anchor.
35. PASS — Members can advance and recalculate the schedule anchor.
36. PASS — Members can delay the next cycle once without moving the anchor.
37. PASS — Members can delay and recalculate the schedule anchor.
38. PASS — Members can skip one cycle without terminating the subscription.
39. PASS — Members can pause future cycle generation.
40. PASS — Resume requires a chosen date and interval and establishes a new anchor.
41. PASS — Resume enforces the configured preparation lead time.
42. PASS — Members can terminate a subscription.
43. PASS — Terminated subscriptions cannot generate future cycles.
44. PASS — Members can request immediate replenishment as an extra cycle.
45. PASS — Immediate replenishment does not change the recurring anchor.
46. PASS — Members can edit the next-cycle coffee selection.
47. PASS — Members can edit next-cycle quantity.
48. PASS — Members can edit next-cycle roast selection.
49. PASS — Half-pound single-coffee composition is supported.
50. PASS — One-pound A+A composition is supported.
51. PASS — One-pound A+B composition is supported.
52. PASS — Server-side item changes resolve products and SKU prices from the live catalog.
53. PASS — Client-supplied subscription item prices are not trusted.
54. PASS — Unavailable products, SKUs, quantities, and roast values are rejected.
55. PASS — Locked cycles reject late modification.
56. PASS — Stale cycle revisions return a conflict instead of overwriting newer state.
57. PASS — Locked price snapshots remain stable when business rules later change.
58. PASS — Future unlocked cycles use the then-current business rules.
59. PASS — Default currency rounding is round-half-up.
60. PASS — A computed value of 1320.5 rounds to 1321.
61. PASS — Campaign pricing uses best-price selection.
62. PASS — Campaign and subscription discounts do not stack.
63. PASS — Credit can apply to merchandise and shipping by default.
64. PASS — Credit policy can disable shipping redemption.
65. PASS — Redemption preserves the configured minimum payable amount.
66. PASS — Zero-pay calculation is explicitly representable.
67. PASS — Credit uses earliest-expiry-first allocation.
68. PASS — Credit reservation, release, and consumption are idempotent.
69. PASS — Concurrent redemption cannot overspend the ledger.
70. PASS — Referral registration alone issues no reward.
71. PASS — Referred-member ordering alone issues no reward.
72. PASS — A successful qualifying pickup issues the configured 5% referrer reward.
73. PASS — Referral value excludes shipping and uses merchandise after discounts.
74. PASS — Credit use does not reduce the referral reward base.
75. PASS — Repeated qualifying rewards are enabled by default.
76. PASS — Replayed completion cannot duplicate a referral reward.
77. PASS — Uncollected orders issue no referral reward.
78. PASS — Referral eligibility defaults to at least one completed order.
79. PASS — Ineligible referral rewards remain pending until eligibility is met.
80. PASS — Every third qualifying fulfillment includes the configured gift in that shipment.
81. PASS — Skipped cycles do not increment gift progress.
82. PASS — Uncollected fulfillment terminates the subscription and resets gift progress.
83. PASS — Owner membership controls expose six rule groups and 37 editable controls.
84. PASS — Owner rules are versioned and validated before activation.
85. PASS — Rules cover rounding, eligibility, referral, credit, campaign, and pause/resume decisions A–F.
86. PASS — Membership commerce foundation passed 41 assertions.
87. PASS — Phase I.2 experience suite passed scenarios A–AJ (36 scenarios).
88. PASS — Order/cart/checkout regression passed 20 assertions, including live repricing and stale-price rejection.
89. PASS — TypeScript validation passed and the optimized Next.js production build passed.
90. PASS WITH BASELINE NOTE — Targeted Phase I.2 ESLint has 0 errors and one existing `<img>` warning; repository-wide lint remains at 27 unrelated errors and 43 warnings.
91. PASS WITH BASELINE NOTE — Homepage, Smart Link, Page Builder, media, YouTube, product content, admin feedback, health, and 7-ELEVEN parser regressions passed; the known pre-existing admin-section hash baseline mismatch remains unrelated to Phase I.2.
92. PASS — Responsive browser QA passed member and Owner pages at 1440×900, 1280×800, 1024×768, 430×932, 390×844, and 375×812 with no horizontal overflow and usable mobile controls.
93. PASS — Temporary credentials, `.env.qa`, QA data roots, QA server roots, browser QA state, and ports were cleaned; production data hashes match preflight and no real member/order/subscription/credit/referral/reward record was created or modified.

## Owner decisions encoded in shared rules

| Decision | Default |
|---|---|
| A — currency rounding | Round half up |
| B — referral eligibility | At least 1 completed order |
| C — referral reward | 5%, repeatable; merchandise after discounts; shipping excluded; credit does not lower base |
| D — credit scope | Merchandise and shipping |
| E — campaign pricing | Best price, locked per cycle, no stacking |
| F — pause/resume anchor | Member chooses resume date and interval; preparation lead time enforced |

## Final PASS/FAIL matrix

| Area | Result | Evidence / note |
|---|---|---|
| Worktree continuity and scope | PASS | Existing I.0A/I.1/I.2 work preserved; no I.3 |
| Canonical member identity | PASS | 32 assertions |
| Authentication compatibility | PASS | 24 assertions |
| Subscription commerce domain | PASS | 41 assertions |
| Phase I.2 member experience | PASS | A–AJ, 36 scenarios |
| Member next-cycle editor | PASS | Live-catalog server validation plus responsive browser QA |
| Owner business controls | PASS | Six rule groups, 37 controls |
| Order/cart/checkout regression | PASS | 20 assertions |
| 7-ELEVEN parser regression | PASS | Seven parser cases |
| TypeScript | PASS | `tsc --noEmit` |
| Targeted ESLint | PASS | 0 errors, 1 known image warning |
| Repository-wide ESLint | BASELINE FAIL | 27 unrelated errors, 43 warnings; not expanded into out-of-scope cleanup |
| Production build | PASS | Next.js 16.2.10 optimized build |
| Existing site regressions | PASS WITH NOTE | Known pre-existing admin-section hash mismatch only |
| Responsive member UI | PASS | Six required viewport sizes |
| Responsive Owner UI | PASS | Six required viewport sizes |
| Production content integrity | PASS | Six public-data SHA-256 values match preflight |
| Production member integrity | PASS | All three member-file hashes match preflight |
| Production order integrity | PASS | All six order-file hashes match preflight |
| QA cleanup | PASS | QA roots removed; QA ports closed; environment markers absent |
| Deployment / release mutation | PASS | None performed |

## Production-data integrity answers

- **REAL MEMBER DATA MODIFIED?** NO
- **REAL ORDER DATA MODIFIED?** NO
- **REAL SUBSCRIPTIONS CREATED?** NO
- **REAL CREDITS ISSUED?** NO
- **REAL REFERRALS CREATED?** NO
- **REAL REWARDS ISSUED?** NO

Production membership files remain absent: `data/member-identity/registry.json`, `data/membership-commerce/business-rules.json`, and `data/membership-commerce/commerce-state.json`. No Phase I.2 QA identifier remains under `data` or `public/data`.

## Known boundaries and acceptance recommendation

The implementation establishes the application and domain foundation; it does not launch a production scheduler, production referral outreach, LINE automation, 7-ELEVEN shipment automation, or gift-fulfillment automation. Zero-pay arithmetic is covered, while production payment/logistics compatibility remains a launch-phase integration check.

**Recommendation:** approve Phase I.2 for Owner acceptance. Do not begin Phase I.3 until Owner acceptance and explicit authorization are received.
