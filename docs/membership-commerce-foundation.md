# KD Coffee Membership Commerce Foundation (Phase I.1)

Phase I.1 adds the commerce domain foundation without launching subscriptions, workers, LINE push, production credits, or production subscriptions. It reuses the Phase I.0A canonical `memberId`; login identities and member numbers remain owned by the identity registry.

## Storage and transaction boundary

- `membership-commerce/business-rules.json` keeps immutable, validated rule versions. A save appends a new version and uses an optimistic revision check plus file lock.
- `membership-commerce/commerce-state.json` keeps subscriptions, cycles, referrals, referral conversions, credit entries/reservations, gift events, notifications, audit, and idempotency receipts.
- Commerce mutations share one file lock and one atomic rename. This deliberately provides a single transaction boundary for referral conversion + reward issuance and for credit allocation.
- Missing files are read as in-memory defaults. Reads and application startup do not seed either file. Tests set `KD_DATA_DIR` to a disposable isolated directory.

## Business safety

- Rules are grouped by membership, shipping, subscription, gift, referral, credit, campaign, notification, money, and date/time.
- A locked cycle contains full item/composition, current unit price, discount, campaign, credit, shipping, gift, and rules snapshots.
- The lifecycle separates the modification deadline (default 7 days before shipping) from order creation (default 3 days before shipping).
- Legal cycle transitions are enumerated. Stock shortage blocks the cycle; discontinuation cancels that product cycle and requires reselection.
- One pound is two explicit half-pound components, supporting A+A and A+B.
- Gift progress is derived from fulfillment/reset events. Uncollected termination emits a reset event and member/admin notifications.
- Referral relationships never expose email, phone, address, or login identifiers. Each successful qualifying order is a separate conversion and unique credit source.
- Credit reservation uses FEFO, then issue time and entry ID. Reserve, consume, and release are idempotent and locked.
- Currency is integer TWD. Percentage math uses integer numerators. If a result needs rounding and the Owner has not selected a policy, the calculation stops.
- Calendar dates use the centralized Taiwan business-date policy. Month-end expiry clamps to the last valid day (for example January 31 + 3 months becomes April 30, expiring at the next Taiwan midnight).

## Owner decisions still required before launch

The default configuration intentionally does not issue rewards or make ambiguous monetary/scheduling decisions until the Owner chooses:

1. Whether the referrer must have qualifying purchases.
2. Referral reward amount and mode.
3. Whether credit applies to shipping.
4. Eligible campaign pricing behavior.
5. Pause/resume anchor behavior.
6. Monetary rounding behavior.

The Traditional Chinese Admin page at `/admin/membership` presents these as friendly choices and states that saved rules only affect future unlocked cycles.

## Phase boundary

Not included: final member subscription UI, scheduled generation worker, payment/logistics automation, LINE delivery, production data migration, production subscription creation, or production credit issuance.
