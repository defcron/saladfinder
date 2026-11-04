# Stripe operations and verification

The implementation uses `stripe@23.1.0`, whose generated default API version is `2026-10-28.endive`. It creates Connect accounts through Accounts v2 and uses the documented v1 compatibility endpoints for their balances and payouts. Server credentials are Cloudflare secrets; no client code receives secret keys, identity documents or bank details.

No Stripe account or credentials were supplied during development. The integration tests use a provider fixture, real D1 through Miniflare, and Stripe's real webhook signature verifier. **Those tests are not evidence of acceptance by a Stripe sandbox, Connect approval, a live charge, or money arriving at a bank.**

## Configuration

1. Create the Canadian business's Stripe platform and complete its Connect setup, identity, business and banking requirements. Choose the supported marketplace configuration and confirm fee/loss responsibility with Stripe.
2. Create an isolated sandbox for staging. Set `APP_ENV=staging`, `LAUNCH_MODE=live` only on the isolated staging Worker, and install test-mode secrets. Staging rejects live keys; production rejects test keys. The `live` launch-mode flag enables marketplace routes, while Stripe's key mode determines whether provider operations are test or real.
3. Install `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET` with `wrangler secret put` or secure CI secret management. Do not put credentials in the repository or paste them into support messages.
4. Configure a platform-account **snapshot webhook** at `/api/webhooks/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `refund.created`, `refund.updated` and `refund.failed`.
5. Configure a connected-account **snapshot webhook** at `/api/webhooks/stripe-connect` for payout events, including `payout.created`, `payout.updated`, `payout.paid`, `payout.failed` and `payout.canceled`. Each endpoint needs its own signing secret. This handler does not consume Accounts v2 thin-event notifications; account readiness is read from Stripe on demand.
6. Enable eligible debit-card collection in Connect external account settings if offering Canadian Instant Payouts. Confirm the platform's daily instant limit and pricing. Keep payout application-fee pricing at zero for the launch model: SaladFinder absorbs payout fees through its client service fee.
7. Set the verified production `APP_URL`, real support identity, approved terms and applicable tax configuration. Complete the business decisions in [research.md](./research.md) and the launch checklist before opening real bookings.

The owner must configure which payment methods Checkout presents. The application permits Stripe's dynamic selection; bank-debit and other asynchronous methods cannot promise immediate availability. Local development can use a test key; it never substitutes a fake provider automatically. Without the required secrets, money routes return 503.

## Flow and records

A client approves a milestone, then pays its worker amount plus `max(CA$3, 12% + CA$1)` through hosted Checkout. The shared `feeCents` function is used by server and client. The server stores the exact request payload and idempotency key before calling Stripe; a request retry uses that payload, even if application settings change. One milestone can have another attempt only after the prior Checkout session is definitively expired.

The redirect from Checkout merely returns the client to the job. A signed webhook verifies the canonical PaymentIntent, paid amount, currency, fee, destination, metadata and mode before updating the ledger. Full refunds take precedence over late success notifications. Refunds and disputes delivered before Checkout success are linked through canonical PaymentIntent metadata. Payout notifications retrieve current Stripe state to prevent stale events from regressing the ledger.

`payment_attempts`, `payout_intents`, `refund_intents`, `connect_intents`, `stripe_events` and `payment_incidents` preserve operational evidence. Do not manually delete an unresolved intent to “unstick” a payment: that can remove the duplicate-payment guard.

The app supports full admin refunds, reversing the worker transfer and application fee. Refund initiation is not always refund completion. Pending or failed provider refunds require reconciliation; a refund after funds leave the connected account can create a liability for the platform. Partial refunds performed in Stripe are treated as disputes for manual review rather than silently treating the milestone as unpaid.

## Holds and limitations

Reporting by a job participant blocks new checkouts and in-app payout requests for that worker while the job is disputed. SaladFinder attempts to expire known open Checkout sessions and checks the job again after creating a session. If a payment completes concurrently, the ledger records the payment and an incident for review.

**This is not escrow or a bank-level freeze.** Destination charges immediately move the worker share to the connected Stripe account. An in-flight charge, an already initiated payout, a Stripe automatic payout or a payout initiated in the worker's Stripe dashboard is not recalled by a SaladFinder report. Never describe these controls as guaranteeing that disputed funds remain available. The operator needs a dispute process and a funded reserve.

Account onboarding does not guarantee instant payout eligibility. The API uses expanded `instant_available.net_available` for actual eligible destinations and never sums multiple destinations holding the same balance. It refuses an instant request with no eligible sufficient balance. Standard requests require enough available CAD. Stripe ultimately enforces platform daily limits and account eligibility. Bank arrival and payout-request success are separate facts.

An ambiguous create request remains retryable only within a conservative 23-hour window. Stripe's retained idempotency keys have a limited lifetime, so the app refuses an uncertain old request instead of risking another charge. A known asynchronous payment failure is held for support reconciliation; the current UI does not automatically generate a replacement for it. Repeated deterministic provider failures can likewise require support to clear an intent after confirming no money operation was created.

## Reconciliation runbook

1. Locate the job, milestone and intent in D1; use its Stripe identifier or idempotency key to locate the exact provider request. Do not use customer names or amount alone to infer identity.
2. Compare Stripe's canonical object and request logs with the expected amount, CAD currency, recipient, application fee and metadata. For a missing response, determine whether the provider created an object before making any new request.
3. Redeliver the relevant Stripe webhook after fixing a transient failure. Signature failures or mismatched amount/destination return a non-2xx status; do not bypass those validations to clear a retry queue.
4. Review `payment_incidents`, failed or pending payouts, refunds and disputes. Confirm bank arrival through Stripe's payout evidence; a Checkout success is insufficient.
5. If manual intervention is required, preserve an audit record identifying the operator, provider evidence, original intent and exact repair. An old ambiguous intent must be reconciled before a replacement operation is issued.
6. Review Stripe's dashboard and webhook delivery health daily during a controlled pilot. The current app has an admin review interface, but does not supply an external on-call alerting service or an automated dispute-evidence submission system.

## Acceptance before enabling production money

Run `npx vitest run tests/payments.test.ts` for the local financial regression suite. Then, with an actual Stripe sandbox, verify hosted onboarding and account capabilities, Checkout including 3DS, delayed success/failure, duplicate and reordered webhook delivery, checkout expiry, full refund, dispute, standard payout failure, instant eligibility rejection and retry recovery. Use the Stripe CLI's webhook forwarding or deployed staging endpoints; keep platform and Connect signatures separate.

After those checks, a small explicitly authorized real transaction and bank payout are still required to verify the production integration and actual payout timing. The business's tax, reporting, legal classification, support operations and cash reserve are separate launch requirements that cannot be proven by automated tests.

Provider references: [Accounts v2 compatibility](https://docs.stripe.com/connect/accounts-v2), [destination charges](https://docs.stripe.com/connect/destination-charges.md?platform=web&ui=stripe-hosted), [Connect Instant Payouts](https://docs.stripe.com/connect/instant-payouts), [webhook handling](https://docs.stripe.com/webhooks), [idempotent requests](https://docs.stripe.com/api/idempotent_requests).
