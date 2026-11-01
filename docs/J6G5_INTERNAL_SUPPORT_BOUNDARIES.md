# J.6G.5 Internal / support boundaries

## Existing transport and identity
All seven production Internal caller locations reuse sendInternalLineNotification: Internal token/recipient first, legacy token/recipient fallback. No second sender, queue, recipient setting or credentials. Internal presentation is resolved once before the existing retry loop; retry keys, attempts, claim gates and timing are unchanged. No text request is appended after an attempted Flex request.

## Internal inventory
| Source | Existing business/text template | Authoritative context | Canonical event | Recipient/token | Identity | CTA / privacy | Flex |
|---|---|---|---|---|---|---|---|
| app/api/orders/route.ts | new order text for 711/home/studio | existing persisted order and checkout text | admin.order.created | shared Internal/legacy resolution | existing checkout identity | Admin order; original contact-rich text unchanged | NO: checkout core excluded from this phase |
| same | corporate gift inquiry | corporateGift order/text | admin.order.gift_inquiry | same | existing checkout identity | Admin order; original free-form text unchanged | NO: same checkout boundary |
| lib/orderCancellation.ts | canonical cancellation alert | existing cancellation transaction | admin.order.cancelled | same | existing cancellation pipeline | Admin order; original reason unchanged | NO: canonical cancellation core left untouched |
| app/api/admin/orders/[orderNumber]/route.ts | existing status-update text | persisted orderNumber, orderStatusLabel(requestedStatus) | admin.order.status_updated | same | existing locked transition, attempts1 | actual Admin order route; no name/contact/tracking forwarded | YES |
| app/api/orders/[orderNumber]/transfer-claim/route.ts | existing ATM report | persisted claim.amount/transferredAt, orderNumber | admin.order.atm_transfer_claim | same | existing persisted claim replay guard, attempts1 | Admin order; NO accountLast5/receipt | YES |
| app/api/orders/[orderNumber]/messages/route.ts | createOrderInquiryLineAlertText | validated orderNumber | admin.order.inquiry_received | same | existing alertClaimed gate, attempts1 | Admin order conversation; NO raw message | YES |
| lib/returnNotificationDelivery.ts | existing return-admin branch text | validated RETURN_REQUESTED lines/time/order | admin.return.request_received | same | existing notificationId hash retryKey, queue claim, attempts1 | Admin return; NO reason/contact/bank/evidence/proof/notes | YES |
| lib/logisticsTracking.ts | logisticsNotificationText, order_created | existing parsed event/record/occurredAt/summary.total | admin.fulfillment.shipment_created | same | durable event retryKey, recipientHash, lock and retry window | existing /admin/fulfillment; NO recipient/raw notes/items | YES |
| same | shipped | same | admin.fulfillment.shipped | same | same | same | YES |
| same | arrived_at_pickup_store | same | admin.fulfillment.arrived | same | same | same | YES |
| same | completed | same | admin.fulfillment.picked_up | same | same | same; informational completion | YES |
| scripts/test-line-notification.mjs | manual diagnostic | manual invocation | none | existing legacy diagnostic env | manual-only | no Studio mode | NO; never executed in QA |

Counts: eight supported canonical Internal events; three canonical text-only groups (new order includes three fulfillment modes), plus separate manual diagnostic. Seven production transport call sites. Other central membership channels.admin markers are not independent Internal PUSH call sites.

## Customer Service inventory
| Flow | Classification | Behavior |
|---|---|---|
| webhook text/postback/follow | INTERACTIVE_REPLY | unchanged replyCustomerLine / replyToken |
| welcome/fallback/unlinked membership | INTERACTIVE_REPLY | existing text and linking behavior |
| v2 compatibility rules | INTERACTIVE_REPLY | unchanged legacy replies |
| v3 nodes/navigation/menus | INTERACTIVE_REPLY | unchanged text/Quick Reply and node navigation |
| customer order inquiry submission | ADMIN_NOTIFICATION | existing Internal alert; eight-event inventory above |
| Admin order inquiry reply | PUSH_NOTIFICATION | existing Customer transport and actionId claim; customer.inquiry.admin_reply now eligible |

Only the standalone Admin-reply PUSH is added to the prior 22 Customer categories. credit_issued and referral_conversion stay text-only. Forty-one interactive support catalog cards remain previews with an explanatory note and no active mode switch.

## Duplicate audit and privacy
No new enqueue or dispatch call. Customer inquiry alert is still claimed only when transitioning from no pending inquiry; Admin reply still uses the existing append/action claim. Return Admin and Customer branches remain separate and return early. Gmail automaticTrackingEnabled, parser, Gmail query, OAuth, state ranking, recipientHash, durable retry keys and 23-hour retry restriction are untouched. Runtime context is never written into Owner card configuration.

Only presentation arguments were added at the status, transfer-claim, inquiry, return and tracking call sites. No checkout, cancellation, pricing, inventory, reward engine, refund settlement, fulfillment-transition, Gmail OAuth/query or webhook routing implementation changes.

## Failure/UI policy
Missing/corrupt/invalid configuration or pre-send render failure yields the exact original text. Unsafe/missing custom image recovers to family image; unsafe/unavailable family or CTA fails to original text. Existing Internal retry loop resends the same resolved presentation only; no immediate extra text fallback. Owner simulation is no-send, synthetic and Owner-only. Return/inquiry/ATM highlight required action; informational completion stays informational. Selector/helper spacing is shared by Customer and Admin editors.
