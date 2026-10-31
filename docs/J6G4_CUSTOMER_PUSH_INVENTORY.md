# J.6G.4 Customer PUSH inventory

Four actual Customer transport call sites. 25 customer business/template types; 22 Flex-capable, three text-only. Internal return alert and uncollected-termination Admin-only event are excluded from Customer counts. The 41 Customer Service preview cards are not live Customer PUSH candidates.

| Source | Existing event | Canonical event | Authoritative fields | Unit | CTA | Separate image | Identity | Flex |
|---|---|---|---|---|---|---|---|---|
| Admin order customer-notifications route | order_confirmed | customer.order.confirmed | StoredOrder.orderNumber | none | member order | existing optional photo preserved | existing locked actionId claim | YES |
| same | order_shipped | customer.order.shipped | orderNumber, store.name, trackingNumber | none | member order | preserved | actionId | YES |
| same | shipment_created | customer.order.shipment_created | orderNumber, trackingNumber | none | member order | preserved | actionId | YES |
| same | order_completed | customer.order.completed | orderNumber | none | member order | preserved | actionId | YES |
| same | studio_ready_for_pickup | customer.order.ready_for_pickup.studio | orderNumber, studioPickup preferredDate/time | none | member order | preserved | actionId | YES |
| same | seven_eleven_ready_for_pickup | customer.order.ready_for_pickup.711 | orderNumber | none | member order | preserved | actionId | YES |
| Admin order messages route | order reply | preview only; no live mapping | existing reply template | none | unchanged | unchanged | existing action claim | NO: keep inquiry behavior unchanged |
| memberNotificationAutomation | modification_window | customer.subscription.next_cycle | safeData.plannedDate/modificationDeadline from cycle | calendar dates | member subscription | none | queue notificationId/claim | YES |
| same | deadline_tomorrow | customer.subscription.modification_cutoff | same cycle snapshots | calendar dates | member subscription | none | queue claim | YES |
| same | order_created | customer.subscription.order_created | existing event, no added lookup | none | member subscription | none | queue claim | YES |
| same | shipped | customer.subscription.shipped | existing event, optional fields omitted | none | member subscription | none | queue claim | YES |
| same | ready_for_pickup | customer.subscription.ready_for_pickup | existing event, optional fields omitted | none | member subscription | none | queue claim | YES |
| same | stock_blocked | customer.subscription.stock_blocked | existing event | none | member subscription | none | queue claim | YES |
| same | subscription_paused | customer.subscription.paused | existing event | none | member subscription | none | queue claim | YES |
| same | subscription_resumed | customer.subscription.resumed | existing event | none | member subscription | none | queue claim | YES |
| same | subscription_terminated | customer.subscription.terminated | existing event | none | member subscription | none | queue claim | YES |
| same | cycle_skipped | customer.subscription.skipped | existing event | none | member subscription | none | queue claim | YES |
| same | gift_eligible | customer.reward.gift_milestone | safeData.fulfillmentNumber from completed-delivery count | count, no monetary conversion | member rewards | none | queue claim | YES |
| same | credit_expiring | customer.reward.credit_expiring | effectiveCreditRemaining(creditEntry), finalUsableDate | Member Credit balance; shared creditDisplayName | member rewards | none | queue claim | YES |
| same | credit_issued | none live | multiple producers incl referralPayout/retailPromotion/manual credits | producer-dependent; not universally proven | unchanged text | none | queue claim | NO |
| same | referral_conversion | none live | rewardAmount varies across qualification/reversal/self-purchase contexts | not universally proven | unchanged text | none | queue claim | NO |
| returnNotificationDelivery | return_request_received | customer.return.received | validated RETURN_REQUESTED orderNumber | none | member return | none | queue claim + existing retryKey | YES |
| same | return_request_approved | customer.return.approved | validated RETURN_APPROVED orderNumber | none | member return | none | same | YES |
| same | return_request_rejected | customer.return.rejected | validated RETURN_REJECTED orderNumber | none | member return | none | same | YES |
| same | return_refund_completed | customer.return.refund_completed | applied paymentResult.amount/method/confirmedAt, orderNumber | TWD settlement; never credit | member return | no proof attachment | same | YES |

## Duplicate/overlap audit
Order notices are explicit Admin actions identified by actionId. Central subscription notices are existing cycle/transition notifications identified by notificationId/sourceEvent. They may concern the same order journey but are distinct existing triggers; no new trigger/enqueue is introduced. Return notices dispatch through the central worker's return branch, which returns immediately: they do not also execute the general membership branch. Refund evidence and retry key continue to reference the same settlement effect. Presentation mode is never included in business identity.

## Units/privacy
credit_issued and referral_conversion intentionally remain text. No balance, multiplier, reward calculation, settlement or scheduling code changes. Expiry producer is the creditEntries loop using effectiveCreditRemaining, not a parsed message. Shared Member Center credit name is used for both Studio and delivery. Refund adapter selects four safe values and never spreads paymentResult (which contains private account/proof/admin notes).

## Failure policy
One pre-send configuration snapshot. Missing/corrupt config or render error returns original template text. Missing custom asset tries family image; unavailable family file or unsafe HTTPS/CTA falls back to text before HTTP. After any LINE request, no automatic text retry is added: definitive rejection and ambiguous failures follow existing retry policy. Existing photo and Email paths remain intact.
