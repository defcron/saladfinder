# Operations

## Release procedure

Use the exact commit whose CI passed. Run `npm ci`, `npm run check`, `npm run coverage`, `npm run test:e2e` and `npm run deploy:check`. Apply migrations and deploy with Wrangler. Verify `/api/health`, `/api/config`, one public page, authentication rejection, and webhook signature rejection at the deployed URL. Record version ID, commit and evidence in VERIFICATION.md. A health check alone is not payment acceptance.

After merging a PR, pull current `main` before publishing. Never deploy a stale pre-merge checkout. The GitHub Deploy workflow is manually triggered and needs a scoped Cloudflare token in the protected production environment. CI itself uses no secrets.

## Data and recovery

D1 migrations are forward-only versioned SQL. Take an encrypted/protected export outside the repository before a risky migration:

```bash
npx wrangler d1 export DB --remote --output /secure-backup-location/daywork.sql
```

The operator must replace the example backup path with an access-controlled location. D1 Time Travel can restore a prior database state; inspect the current official [Time Travel documentation](https://developers.cloudflare.com/d1/reference/time-travel/) before a restore. A database rollback never reverses Stripe payments. Reconcile money state against Stripe before reopening writes. Prefer a forward fix to deleting financial history.

Worker rollback uses `npx wrangler rollback`. Ensure the older code understands the current schema. Keep payment mutation disabled if state is uncertain.

## Payment incidents

Admin pages show reports and payment incidents. Inspect the canonical Checkout Session, PaymentIntent, charge, connected account, refund and payout in Stripe. Match the locally persisted attempt/operation ID and idempotency key. Do not create a new operation merely because a browser request timed out. Stripe may prune idempotency keys after 24 hours; ambiguous attempts older than the retry window require operator reconciliation.

A reported job blocks new payment and payout requests in the app. Known open Checkout Sessions are expired on a best-effort basis; an already-completed or concurrently-completing charge can still land. Webhooks flag that state for review. Holds in this database cannot freeze money already sent to a bank or controls independently exposed by Stripe. Do not advertise escrow or chargeback protection.

Refunds reverse the destination transfer and application fee. Stripe's original processing fees and unrecoverable negative balances can remain an operator expense. The initial admin action is a full refund; partial adjustments require a documented Stripe-side decision and reconciliation. Never resolve a report without recording a resolution reason. Recheck all affected milestone and payment states after any manual Stripe change.

Monitor failed webhook deliveries and retry them from Stripe once the underlying error is fixed. Signature mismatch is an error, not an event to accept. Duplicate deliveries are expected. Payout `paid` is provider-reported state, not independently verified bank-account evidence.

## Security and privacy

- Use separate live/test secrets and databases. Never run local development authentication on a public hostname.
- Sessions and magic links are random 256-bit tokens, stored as SHA-256 digests. Production session cookies are `__Host-` scoped, Secure, HttpOnly and SameSite=Lax.
- Every unsafe browser API request requires the configured same origin and JSON. Signed webhook endpoints are the explicit exception.
- Auth and waitlist forms require server-verified Turnstile with matching hostname and action. D1-backed limits bound abuse. Keep Turnstile secrets only in Worker secrets.
- Review ADMIN_EMAILS carefully: authority is assigned only after verified email login. Do not make an unverified or temporary address an administrator.
- No API logs should contain sign-in links, cookies, request bodies, payment provider data or email addresses. Query strings are redacted in Cloudflare observability configuration.
- Profiles store ordinary service information. Do not solicit SINs, ID-document images, banking details or private addresses in public job descriptions or chat.
- Provide the operator's privacy contact, retention schedule and lawful disclosure policy before a public paid launch. The export endpoint provides an account holder's stored records; financial retention obligations can limit deletion. Export files contain personal data and must be protected.
- Daily cleanup deletes expired authentication and throttle records. It does not delete financial ledger or consent records.

## Costs and capacity

One Worker serves static assets and the API. One D1 database stores the application. The app does not require an always-on server, AI model, object storage bucket or paid map API. Existing paid-account allowances are shared with other apps. Request-volume abuse can cost money despite CPU limits; set Cloudflare usage/budget notifications and monitor D1 rows scanned. Stripe, domain, email, insurance, support and customer acquisition are separate costs.

## Support and moderation

Set a real SUPPORT_EMAIL and monitor it. Reports are not emergency assistance. For urgent danger, the interface directs people to local emergency services. Review open reports daily during a pilot, freeze suspect accounts, preserve the audit log, and give affected users a documented response. Never promise background checks or insurance that have not actually been obtained.
