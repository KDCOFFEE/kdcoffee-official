# KD COFFEE PHASE I.1 — MEMBERSHIP COMMERCE FOUNDATION

## Engineering Validation Report

Validation date: 2026-08-28 (Asia/Taipei)

### Baseline and files

1. **Branch:** `main`.
2. **HEAD:** `a3135ff0c4c124ccb2038952336a8ee879bf654c`.
3. **Existing I.0A preserved?** Yes. The accepted, uncommitted canonical identity work remains intact and is reused.
4. **Initial status:** I.0A modified/untracked files plus the five previously identified Owner artifacts; nothing staged.
5. **Files modified by I.1:** `app/admin/page.tsx`, `app/globals.css`, `lib/persistentStorageInit.ts`, `lib/storagePaths.ts`, and `package.json`.
6. **Files added by I.1:** Admin page/API/component/CSS, four commerce/rule/policy modules plus client-safe rule types, the isolated domain test, architecture document, and this report.
7. **Files deleted:** None.

### Architecture

8. **Business Rules store:** `membership-commerce/business-rules.json`, read as in-memory defaults when absent and only created by an authorized save.
9. **Rules versioning:** Immutable appended versions with `rulesVersion`, effective time, active version, and optimistic store revision.
10. **Rules validation:** Runtime validation covers all domains, ranges, modes, dates, ordering, and lifecycle timing consistency.
11. **Money policy:** Integer TWD and integer-rational percentage math. Ambiguous fractional results stop until Owner selects rounding.
12. **Date/time policy:** Central Taiwan calendar-date policy, explicit `Asia/Taipei`, deterministic day math and month-end clamping.
13. **Subscription model:** Canonical I.0A member ID, source order, anchor, interval, shipping/store, items, rules reference, and reasoned status.
14. **Cycle model:** Subscription and delivery cycles are separate records with sequence, kind, dates, drafts, snapshots, order reference, and timestamps.
15. **Cycle state machine:** Enumerated states and legal transitions; arbitrary mutation is rejected.
16. **Cycle lock:** Lock is idempotent and stores final immutable snapshots under the shared commerce lock.
17. **Price snapshot:** Original merchandise, subscription percent/price, campaign adjustment, credit, shipping, final amount, currency, and rounding mode.
18. **Shipping snapshot:** Method, safe store selection, and free-shipping result.
19. **Gift snapshot:** Entitlement/quantity at cycle lock and selected substitute/packing lock later.
20. **Product composition:** Half-pound A, one-pound A+A, and one-pound A+B are explicit component arrays.

### Referral

21. **Referral relationship:** Persistent one-referrer relationship with non-PII code and safe display data.
22. **Repeated conversion rewards:** Every future qualifying successful pickup can create a separate conversion/reward.
23. **Referral idempotency:** Relationship/order source references and idempotency receipts prevent retries from issuing twice.
24. **Referral privacy:** Member-facing projection contains no email, phone, address, or login identity.

### Credit

25. **Credit ledger:** Source entries plus separately auditable reservations; no balance-only source of truth.
26. **Expiration:** Calendar months, clamped to the last valid day, expiring at the next Taiwan midnight.
27. **FEFO:** Expiry, then issue time, then entry ID provide stable ordering.
28. **Reserve:** Atomic allocation under one lock; the member explicitly requests an amount.
29. **Consume:** Final successful order settlement is idempotent.
30. **Release:** Failed/cancelled order returns allocated amounts safely, respecting expiry.
31. **Redemption limits:** Unlimited, maximum fixed, minimum payable, or maximum merchandise percentage.
32. **Credit idempotency:** Unique source reference and operation receipts prevent double issue/settlement.

### Gift

33. **First purchase count:** Successful original-price pickup activates and records fulfillment 1.
34. **Third shipment gift:** The third qualifying shipment snapshot includes the gift.
35. **Every shipment after threshold:** Default repeat interval 1 includes the fourth and later shipments.
36. **Uncollected reset:** An explicit audit event resets derived progress to zero.
37. **Gift pool foundation:** Owner-prioritized product pool, availability substitution, and packing snapshot; no missing gift blocks the coffee order.

### Subscription

38. **First order activation:** Created pending; activates only on successful pickup.
39. **30/45/60 cycles:** Central configurable list; all three date calculations tested.
40. **Modification deadline:** Separate date, default seven days before shipping.
41. **Lock date:** The modification deadline locks the cycle.
42. **Order creation date:** Separate date, default three days before shipping.
43. **Early delivery:** One-time keeps anchor; recalculation updates anchor.
44. **Delay:** One-time keeps anchor; recalculation updates anchor.
45. **Skip:** Terminal cycle state; no fulfillment/gift/referral count.
46. **Pause:** Prevents future generation and preserves already locked/created cycles.
47. **Terminate:** Prevents future cycles without deleting existing formal orders.
48. **Immediate replenishment:** Explicit `manual_replenishment` kind, separate from scheduled sequence/anchor.
49. **Stock blocked:** Explicit blocked state and member notification foundation.
50. **Discontinued product:** Explicit cancellation/reselection path, distinct from temporary shortage.

### Admin

51. **Business rule UI:** `/admin/membership` plus authenticated GET/PUT API.
52. **Traditional Chinese:** All visible settings, guidance, units, state, and errors are Owner-facing Traditional Chinese.
53. **Owner technical knowledge required?** No.
54. **Save feedback:** Dirty state, disabled/enabled save button, pending state, success/error text, and conflict response.
55. **Rules effective messaging:** Clearly states new rules only affect future unlocked cycles.

### Security and data

56. **Locking:** Existing exclusive-file lock plus atomic temporary-file rename reused.
57. **Idempotency:** Activation, generation, lock, order, completion, conversion, issue, gift reset, and termination carry deterministic receipts.
58. **Audit:** Safe actor/action/entity/before-after/reason/source records; secret/PII regression assertion passed.
59. **Runtime validation:** Rules, money, composition, state structure, and transitions validate before write.
60. **I.0A identity integration:** Commerce creation requires a live canonical I.0A member record.
61. **Production data hashes:** Listed below; all match pre-flight.
62. **Production data modified?** No. Existing files unchanged; both new production stores remain absent.
63. **Concurrent Owner changes?** None observed. Rules save rejects stale revisions with a clear refresh message.

### Regression

64. **Email auth:** PASS — member auth compatibility suite, 24 assertions.
65. **LINE auth:** PASS — member auth/I.0A suites and production build.
66. **Member Center:** PASS — identity/auth suites and build.
67. **Orders:** PASS — order data hashes unchanged, build and existing admin feedback assertions.
68. **Cart:** PASS — build and unchanged commerce source.
69. **Checkout:** PASS — build and unchanged pricing/checkout source.
70. **Homepage:** PASS — Homepage CMS fixture assertions.
71. **Products:** PASS — content, custom section, YouTube, media, and lifecycle assertions.
72. **Admin:** PASS for I.1 and admin feedback; one known pre-existing section-management fixture hash mismatch remains unchanged.
73. **Homepage CMS:** PASS.
74. **Page Builder:** PASS — core, design, image, and visual-style suites.
75. **Campaign:** PASS — existing campaign build/regression paths preserved; subscription eligibility/pricing mode modeled without selecting the open policy.
76. **Cloudinary:** PASS — product media/video lifecycle regressions and build.
77. **Smart Link:** PASS — 22 required cases plus 10 existing destinations.

### Engineering

78. **TypeScript:** `npx tsc --noEmit` PASS.
79. **Build:** Next.js 16.2.10 production build PASS.
80. **ESLint:** I.1 targeted lint PASS. Repository-wide lint remains at the known baseline of 28 errors and 43 warnings, none in I.1 files.
81. **Domain tests:** 41 assertions PASS, covering all 37 required cases.
82. **Concurrency tests:** Cycle generation, order creation, referral reward, and credit overspend PASS.
83. **git diff --check:** PASS (line-ending notices only).

### Git and delivery

84. **Staged:** No.
85. **Committed:** No.
86. **Pushed:** No.
87. **Deployed:** No.

## Browser QA

Authenticated local QA passed at 1440×900, 1280×800, 1024×768, 430×932, 390×844, and 375×812. Every viewport was styled, usable, and free of horizontal overflow. Visible text contained no JSON, internal enum values, `rulesVersion`, idempotency, or FEFO terminology. Dirty-state feedback and save enablement were verified; the edit was discarded without saving.

## Production hash verification

| Data | SHA-256 after I.1 |
|---|---|
| Homepage | `0c9660407b870d059a5a16e1b5072a1e475e9597f1144d767a07221cafbed968` |
| Products / website data | `e9c683f7024627c331025361110fedc7706f38944a08bdd0062e65daf516ef81` |
| Assets | `7c80ff7228503a771429a9e4c1fdacaa933ffc72f8130644ea6d88064638a044` |
| Pages | `af73752016cd03caee0f1ccb40c590f8366fb97f8ce76d4c8a2da4df3b89e1db` |
| Monthly menus | `82ec6269e0622dfccf919e777a6b8188e823251e0d73a08e1981a88b9a2f84c1` |
| 7-ELEVEN stores | `eef03805b488846557801b4bf22bf91e6349e72d7620f4e7d43511353c6d389a` |
| Member identity registry | ABSENT |
| Membership business rules | ABSENT |
| Membership commerce state | ABSENT |

All three real member JSON hashes and all six real order JSON hashes match pre-flight. No production subscription, referral, gift progress, or credit was created.

## Owner decisions required before launch

- A. Referrer purchase eligibility.
- B. Referral reward amount/mode.
- C. Whether credit can apply to shipping.
- D. Eligible campaign pricing mode.
- E. Pause/resume anchor policy.
- F. Fractional TWD rounding policy (no established discount-rounding convention was found).

The safe defaults do not issue ambiguous rewards or perform ambiguous monetary/scheduling calculations.

## Final matrix

| Requirement | Result |
|---|---|
| PHASE I.1 MEMBERSHIP COMMERCE FOUNDATION | PASS |
| I.0A IDENTITY REUSED | PASS |
| SECOND MEMBER SYSTEM CREATED | NO |
| BUSINESS RULES CENTRALIZED | PASS |
| BUSINESS RULES VERSIONED | PASS |
| LOCKED CYCLE SNAPSHOT | PASS |
| MONEY POLICY | OWNER DECISION REQUIRED |
| DATE POLICY | PASS |
| SUBSCRIPTION MODEL | PASS |
| SUBSCRIPTION CYCLE | PASS |
| CYCLE STATE MACHINE | PASS |
| 30 DAY / 45 DAY / 60 DAY | PASS / PASS / PASS |
| EARLY DELIVERY / DELAY DELIVERY | PASS / PASS |
| SKIP / PAUSE / TERMINATE | PASS / PASS / PASS |
| IMMEDIATE REPLENISHMENT | PASS |
| HALF-POUND / ONE-POUND A+A / ONE-POUND A+B | PASS / PASS / PASS |
| FIRST ORIGINAL-PRICE PURCHASE | PASS |
| FIRST PURCHASE COUNTS FOR GIFT | PASS |
| THIRD DELIVERY GIFT | PASS |
| EVERY DELIVERY AFTER THIRD | PASS |
| UNCOLLECTED TERMINATES / RESETS GIFT | PASS / PASS |
| REFERRAL RELATIONSHIP / REPEATED REWARDS / IDEMPOTENCY | PASS / PASS / PASS |
| CREDIT LEDGER / EXPIRY / FEFO | PASS / PASS / PASS |
| CREDIT RESERVE / CONSUME / RELEASE | PASS / PASS / PASS |
| CREDIT OVERSPEND PROTECTION | PASS |
| ADMIN BUSINESS RULE UI | PASS |
| TRADITIONAL CHINESE ADMIN | PASS |
| OWNER NEEDS ENGINEERING KNOWLEDGE | NO |
| OWNER-FACING TECHNICAL STRINGS | 0 FOUND |
| IDENTITY / EMAIL / LINE REGRESSION | NONE FOUND |
| ORDER / CHECKOUT / HOMEPAGE / PAGE BUILDER / CLOUDINARY REGRESSION | NONE FOUND |
| PRODUCTION MEMBER DATA MODIFIED | NO |
| PRODUCTION ORDER DATA MODIFIED | NO |
| PRODUCTION CREDIT ISSUED | NO |
| PRODUCTION SUBSCRIPTION CREATED | NO |
| STAGED / COMMITTED / PUSHED / DEPLOYED | NO / NO / NO / NO |
| READY FOR OWNER ACCEPTANCE | YES |
| READY FOR PHASE I.2 | NO — WAIT FOR OWNER ACCEPTANCE |
