# Staging and production use one payment implementation

SaladFinder runs the same Worker entry point, payment router, Stripe SDK, SQL
migrations and React application in staging and production. Stripe's managed
sandbox simulates financial operations. There is no deployed fake Stripe server,
staging payment engine, synthetic-success switch or shortcut around reconciliation.

```mermaid
flowchart LR
  U[Same application and payment handlers] --> S[Same Stripe SDK requests]
  S -->|Sandbox credential| T[Stripe sandbox: simulated money]
  S -->|Live credential| P[Stripe production: real money]
  T --> W[Signed webhook verification and canonical Stripe reads]
  P --> W
  W --> D[Same conditional ledger updates in isolated D1 databases]
```

## Configuration boundary

| Setting | Staging | Production |
| --- | --- | --- |
| Worker | `saladfinder-staging` | `saladfinder` |
| Entry point | `src/server/index.ts` | `src/server/index.ts` |
| `STRIPE_MODE` | `test` | `live` |
| Stripe credential | Restricted key from managed `SaladFinder staging` sandbox | Restricted live key for the account inside `saladfinder` |
| Stripe API and SDK | Same version and endpoints | Same version and endpoints |
| D1 | `daywork-staging` | `daywork-production` |
| Signing secrets and callback URLs | Staging only | Production only |
| `LAUNCH_MODE` currently | `live` enables sandbox workflows | `live` for the operator-authorized paid pilot |
| `INSTANT_PAYOUTS_ENABLED` currently | `true` to exercise eligibility checks | `false` while the platform limit is CA$0/day |

The word `live` in `LAUNCH_MODE` is an existing application feature gate; it does
not select Stripe live mode. `STRIPE_MODE` specifies the expected credential mode,
and Stripe's credential determines which provider environment receives requests.
A missing, unknown or mismatched mode fails closed before contacting Stripe.
Both webhook handlers and held-checkout expiry enforce this boundary even when
new payments are disabled. Preview continues to reconcile already-created
operations when credentials are valid.

No payment handler branches on `APP_ENV` or the word `staging`. The same code
performs authorization, input validation, Canadian capability checks, fee and
amount calculation, manual payout setup, durable idempotency, destination
selection, refunds, dispute holds and signed webhook reconciliation. Test and live
webhook payload modes must match the configured provider mode. The shared UI
displays a simulation notice whenever the API reports test payment mode.

Application flags deliberately use the same gates in both deployments. To compare
a particular behavior, use the same gate values and equivalent provider account
capabilities. A disabled production instant option and an eligible sandbox instant
option are different configuration inputs, not different implementations.

Production separates the API Worker (`saladfinder`) from the frontend Worker
(`saladfinder-frontend`). Staging serves both through its isolated Worker and
Workers Static Assets binding so the staging hostname remains same-origin.
Hosting configuration, domains, credentials, account IDs and database contents
differ; the deployment environments remain isolated. This payment design does
not imply identical account permissions or capabilities.

## Test and release discipline

1. Build and test a single source revision with `npm run check`,
   `npm run coverage` and `npm run test:e2e`. Run
   `npm run check:deployment-parity` to build both deployment targets without
   uploading and require identical SHA-256 hashes of their Worker executables.
   GitHub CI enforces this comparison.
2. Deploy that revision with `npx wrangler deploy --env staging`. Keep sandbox
   keys encrypted on that Worker. Never copy production users, sessions, bank
   details or database contents into test fixtures.
3. Exercise real application routes using clearly marked synthetic accounts and
   Stripe's documented test identities, cards and payout destinations. Observe
   signed webhook delivery and the resulting ledger; redirects alone are not
   evidence of payment.
4. Promote the same source revision and frontend build to production. Do not
   rewrite payment logic or substitute a provider implementation when promoting.
   GitHub Actions builds and deploys the frontend with the same Worker release.
5. Keep production in preview until [LAUNCH.md](LAUNCH.md) is satisfied. Sandbox
   acceptance cannot establish bank arrival, live eligibility, limits or fees.

Unit tests can inject a deterministic provider fixture into the same router to
reproduce failures, timing races and reordered events. That fixture exists only in
`tests/`; neither deployed environment imports it. The parameterized payment
lifecycle runs unchanged with test and live provider-object modes and verifies
onboarding, server fees, ownership denial, duplicate Checkout, signed payment
events, both payout methods, duplicate/reordered payout events and full refunds.
Additional tests reject mismatched credentials before provider calls and check
that deployment configuration keeps the shared entry point and isolated storage.
These local tests simulate the provider and do not move live money.

## Staging hostname migration — 2026-11-05

The existing Worker was renamed in place to `saladfinder-staging` and redeployed
at <https://saladfinder-staging.defcronyke.workers.dev>. Its immutable Worker ID,
encrypted secrets and D1 binding were preserved. The D1 database keeps its legacy
name `daywork-staging`; no records were migrated. Turnstile permits the new host.

Both Stripe sandbox webhook destinations now use the new hostname, with their
existing destination IDs and signing secrets preserved. The expired dashboard
session was restored and both saved URLs were verified. Existing synthetic users
were reauthenticated on the new host and a fresh hosted onboarding link was
created. Actual payment and payout delivery acceptance is recorded below.

## Provider acceptance checkpoint — 2026-11-05

The managed sandbox and restricted credential are created. Both snapshot webhook
destinations are active, use API version `2026-10-28.endive`, and have distinct
encrypted signing secrets on `saladfinder-staging`. The deployed staging app created
a Canadian Accounts v2 recipient, set manual payouts and generated hosted
onboarding links. Its status route retrieved recipient capabilities, connected
balance, payout history, external accounts and payout settings using the
restricted key. Synthetic app users completed posting, application, hiring,
starting work, milestone submission and approval through the actual API.

Hosted onboarding completed with a synthetic identity, test CAD bank and instant-
eligible test debit card. Two CA$29 Checkout payments each contained CA$25 worker
pay and CA$4 platform fee. A declined test card recovered within the same second
Checkout session. Signed provider webhooks marked both payments paid. The worker
received CA$10 instant and CA$10 standard simulated payouts; both reconciled to
`paid`. Repeating the original requests returned the same payout IDs, and the
poster was denied access to the worker's payout operation.

A full CA$29 refund initiated in the Stripe sandbox Dashboard reversed the
associated transfer and refunded the application fee. Its signed event changed
the app milestone to `refunded`. This verifies external-refund reconciliation;
it does not establish provider acceptance of the app's admin refund creation
route. Disputes, failed payouts and reordered event cases additionally pass the
local regression suite but are not all provider-tested. No real charge or payout
was made. Clearly marked synthetic records remain only in staging.

References: [Stripe sandboxes](https://docs.stripe.com/sandboxes),
[Connect testing](https://docs.stripe.com/connect/testing),
[test cards and simulated settlement](https://docs.stripe.com/testing), and
[webhook verification](https://docs.stripe.com/webhooks).
