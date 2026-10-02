# Order received confirmation email — LINE.2K.1

New normal checkout orders (studio pickup, 7-ELEVEN, home delivery) schedule a
customer email only after the canonical inventory transaction and existing
internal LINE processing. Next.js `after()` runs delivery after the success
response. Corporate gift inquiries, pending transactions and checkout replays
do not schedule this email. Existing orders are not backfilled.

## Configuration

Reuse `RESEND_API_KEY` and `MEMBER_EMAIL_FROM`; no second sender is introduced.
`MEMBER_SITE_URL`, falling back to `NEXT_PUBLIC_SITE_URL`, supplies the existing
`/orders/{orderNumber}` link. Only HTTP/HTTPS origins without embedded credentials
are accepted. Member authentication / existing guest order access still applies;
no database identifiers, login tokens or guest tokens are included in email.

Set optional `CUSTOMER_SUPPORT_LINE_URL` only to an owner-approved official
customer LINE URL. Accepted URLs use HTTPS on `line.me` or `lin.ee`, without
embedded credentials. Leave it empty until approved. Missing/invalid values
render plain `官方 LINE @kdcoffee` text; they never prevent sending.

The recipient is the trimmed, valid `order.customer.email` snapshot. There is
no account/member email fallback and no change to login email semantics. Existing
checkout input validation remains separate from delivery validation; an already
committed snapshot without a valid email is skipped without mutation.

## Persistent duplicate protection and failures

Reuse the existing per-order file lock and customer notification action/history.
Claim `order_confirmation_email:{orderNumber}` and persist it before contacting
Resend. Send using provider key `order_confirmation_email/{orderNumber}`. Store
the email-only result with event type `order_confirmation_email`; neither LINE
adapter nor the commerce notification queue is invoked by this event.

Every repeated call (including concurrent calls and a new process) sees the
persisted claim and skips. Resend's provider keys expire after 24 hours, so the
durable local claim is the long-term duplicate protection:
https://resend.com/docs/dashboard/emails/idempotency-keys

There are no automatic retries or new cron jobs. A failure / missing provider
configuration is recorded safely. If a process stops after claiming, or result
storage fails after provider acceptance, the claim remains `processing` and
blocks another send. This intentionally favors avoiding duplicate mail over
automatic recovery. Any future controlled retry must first reconcile provider
delivery and the persistent claim; do not delete claims or reuse expired keys
blindly. No retry tool/UI is added in this phase.

Provider calls retain the existing 10-second timeout. Scheduling, claim, network
and result-write failures cannot change the successful checkout response, stock,
order status or membership/fulfillment state. No email warning instructs the
customer to retry checkout. No customer LINE order-created push is added.

## Verification

Run `npm run test:order-confirmation-email`, existing LINE/order/commerce/
fulfillment regressions, TypeScript and production build. Tests use temporary
storage, synthetic credentials, mocked network and queued `after()` callbacks.
Never point tests at production `/data`, copy production credentials, or send to
real recipients. Owner QA is a later controlled step after review; this phase
does not commit, push, deploy, change Railway variables or send email/LINE.
