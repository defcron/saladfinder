# Worker fees and subscriptions

Status (2026-11-05): implemented and deployed to production and staging. New Standard transaction fees are enabled. Economy/Premium purchasing is disabled pending approval of the restricted-key Billing permissions and actual sandbox subscription acceptance. This document is MIT licensed with the rest of the repository.

## Requested behaviour

Operator-selected requirements:

- Standard: add the same checked Stripe domestic-card processing percentage (2.9 percentage points) to both original base rates: poster 12% + 2.9% = 14.9%; worker 5% + 2.9% = 7.9%. Fixed fees remain CA$1; poster minimum remains CA$3.

- Economy: CA$10/month. Operator revised the percentage to the previously proposed half-rate plus the Stripe domestic-card processing percentage. With the checked 2.9% baseline: poster 6% + 2.9% = 8.9%, worker 2.5% + 2.9% = 5.4%. Fixed component remains CA$0.50 per milestone; no extra CA$0.30 is added to Economy. This supersedes the original blanket half-price description.
- Premium: CA$25/month, revised to a percentage one percentage point above Stripe processing plus Stripe's fixed component and an additional CA$1 per transaction (interpretation disclosed to operator).
- Discounts apply to each subscribing account's own fees as a poster and as a worker.
- Unlimited postings and applications; no subscription volume allowance.

At the previously checked domestic-card baseline of 2.9% + CA$0.30, the interpreted Premium fee is 3.9% + CA$1.30 on the milestone gross, per participating Premium account. This is a baseline-derived service fee, not an assertion that all payment methods/cards have the same actual processing cost. Do not advertise exact cost passthrough without a defined rate policy and reconciliation mechanism. Stripe processes the full client charge, including the poster fee, so the processor percentage base differs from the milestone base.

Configured pricing:

| Plan | Monthly CAD | Poster fee | Worker fee |
| --- | ---: | --- | --- |
| Standard | 0 | 14.9% + CA$1, minimum CA$3 | 7.9% + CA$1 |
| Economy | 10 | 8.9% + CA$0.50 | 5.4% + CA$0.50 |
| Premium | 25 | 3.9% + CA$1.30 | 3.9% + CA$1.30 |

Economy's poster minimum retains the previously discussed half-minimum of CA$1.50; it does not bind within the current CA$25 minimum milestone. Premium uses its explicit fixed component without the old CA$3 minimum. The operator revised Standard percentages by adding the processing baseline after the Economy revision. Economy remains 8.9% for posters and 5.4% for workers; do not recalculate it as half the newly revised Standard rate plus processing. New worker fees are enabled in production and staging for new agreements.

The revised Standard worker percentage resolves the previous Economy-versus-Standard transaction-fee inversion; that earlier CA$125 crossover no longer applies. Do not claim every paid tier saves every user money: monthly subscription costs matter, and Premium's higher fixed component can exceed Economy on small milestones. Show exact fee comparisons and monthly charges rather than a blanket savings claim. The current percentages are the operator's explicit choices; do not silently alter them.

## Money model

For new work, quote worker gross, poster fee, worker fee, client total and worker net separately. A worker fee is withheld from earnings, not charged again on bank payout. The fee must be visible before applying/accepting work and in receipts, milestone details and account history. Replace existing statements that all workers receive the full listed amount without a platform fee.

- Client charge = worker gross + poster fee.
- Worker net = worker gross - worker fee.
- Stripe destination-charge application fee = poster fee + worker fee.
- Preserve exact integer-cent amounts and the policy version in durable quote/payment records.
- Existing work retains its original agreed fees. Existing payment attempts, including retries, refunds and webhook reconciliation, use their immutable recorded amounts.
- Freeze each new agreement's fee policy at acceptance; show any changed quote and require renewed acceptance rather than silently repricing an existing application. Document when subscription benefits take effect before sale.
- A full refund reverses the destination transfer and refunds the complete application fee. Ownership, reconciliation and idempotency guarantees remain mandatory.

## Subscription integration

Use platform Stripe Billing subscriptions through hosted Checkout and Customer Portal, isolated live/test Prices and the same application logic in both environments. Use a separate Product for each tier, CAD monthly Prices and a server allowlist of eligible Price IDs. Do not take arbitrary customer IDs, Price IDs, discounts or fee amounts from the browser.

Store the authenticated user-to-Stripe-customer association, subscription ID, verified tier, paid entitlement interval and cancellation state. Enforce unique ownership and prevent duplicate subscription checkout through durable creation records and Stripe idempotency. Customer Portal sessions must belong to the signed-in user.

Signed webhook reconciliation drives benefits. A Checkout return URL alone never activates them. Handle subscription creation/update/deletion, paid and failed invoices, refunds, disputes and early fraud warnings. Reconcile current provider state to tolerate duplicate/out-of-order deliveries; stale events must not restore expired or revoked benefits. A paid cancellation at period end retains the remaining paid term; an unpaid renewal must not grant another term. Recheck expiry at use time so lost webhooks do not grant perpetual discounts.

Keep subscription events distinct from milestone events so the existing charge/refund handler cannot apply subscription activity to job records. Retain audit records and expose actionable billing failures to the operator.

## UI and disclosures

Add a plan comparison, gross-to-net worker fee preview, current plan/renewal/cancellation state and self-service billing controls. Clearly display recurring prices and any applicable tax. Do not enable Stripe automatic tax merely by adding a flag: confirm relevant registrations and product tax treatment first. Existing business attestation does not establish Stripe Tax configuration for this new product.

## Release requirements

Monthly prices, tier names, both-role scope and the revised Standard and Economy percentages have been selected. Use the disclosed domestic-card baseline as a configured pricing policy, not a promise of exact processing-cost reimbursement. Document the tier comparisons above before offering subscriptions. Provision matching sandbox/live Products and Prices, restricted Billing permissions, Customer Portal configuration and webhook event subscriptions. Never publish placeholders as purchasable prices.

Test fee rounding, minimums, all tier combinations in scope, grandfathered agreements, exact worker net/application fees, cross-user denial, duplicate checkout, subscription cancellation/expiry, failed renewal, refund/dispute revocation, duplicate/reordered webhooks and immutable payment retries. Run repository release checks and provider-test subscription purchase/renewal/cancellation plus worker-fee milestone payment/refund in the existing managed sandbox before activation.

## Official references

- https://docs.stripe.com/billing/subscriptions/webhooks
- https://docs.stripe.com/billing/subscriptions/design-an-integration
- https://docs.stripe.com/customer-management/integrate-customer-portal
- https://docs.stripe.com/connect/destination-charges
- https://stripe.com/en-ca/pricing

## Operator configuration and recovery

`PRICING_ENABLED` enables the new agreement pricing; `SUBSCRIPTIONS_ENABLED` separately enables purchases. Both environments run the same code. Configure `STRIPE_ECONOMY_PRICE` and `STRIPE_PREMIUM_PRICE` with their environment-specific monthly CAD Prices. Apply migrations before deploying code that queries billing tables.

Restricted platform key scope: Customers write, Customer Portal write, Prices read, Subscriptions read and Invoices read, in addition to existing Checkout/payment permissions. Connected-account scope is unchanged. Customer Portal must allow payment-method updates, invoice history and cancellation at period end. Keep plan switching disabled until proration/change semantics are explicitly implemented; members can cancel and choose another plan after the current term ends.

Add `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed` and `radar.early_fraud_warning.created` to the existing platform webhook, retaining all existing payment/refund/dispute events. No signing-secret rotation is needed. Existing Connect payout events remain unchanged.

Risk events freeze discounts in `billing_accounts.blocked` and record the event ID/type in `billing_risk_events`. A trusted operator must review the corresponding Stripe charge, dispute or fraud warning, resolve the financial issue and document the decision before conditionally clearing `blocked` for that user. There is no automatic refund/dispute reversal of this safety flag. Review failed webhook deliveries and replay after correcting the underlying issue. Unknown customer, ownership, mode and expired reconciliation-lease failures must never grant benefits.

Customer/Checkout creation requests older than the durable retry window stop for manual reconciliation rather than risk a duplicate charge. Locate the provider object using its metadata/idempotency evidence before correcting local state; never erase an uncertain attempt and retry blindly. Subscription status is visible to its owner, while provider IDs and reconciliation tables remain server-only.

Instant payouts remain disabled in production. Subscription purchase does not unlock them or guarantee bank arrival time. No automatic tax collection is enabled by this release; the operator remains responsible for tax setup and invoicing obligations.

## Release verification — 2026-11-05

- `npm run check`: 226 tests, TypeScript and production build passed.
- `npm run coverage`: passed configured thresholds; lines 94.13%, branches 88.56%.
- `npm run test:e2e`: all 24 desktop/mobile browser tests passed.
- Production/staging executable parity check passed; only environment bindings/configuration differ.
- Actual managed-sandbox Standard milestone paid through hosted Checkout: gross CA$25, poster fee CA$4.73, worker fee CA$2.98, client charge CA$29.73 and worker net CA$22.02. Signed webhook reconciliation marked it paid and retained those amounts. Stripe displayed the combined CA$7.71 application fee. A subsequent full sandbox Dashboard refund, including transfer reversal and application-fee refund, reconciled the application milestone to `refunded`. This verified provider/webhook refund handling; the app's admin refund request path is covered by automated integration tests.
- Local integration tests cover all plan combinations, immutable retries, cross-user denial, failed renewals, cancellation/expiry, risk revocation and reordered events. Actual provider subscription purchase/renewal/cancellation remains pending; it is not implied by the passing mocked integration tests.
- Both live/test Products and monthly CAD Prices exist. Both platform webhook destinations subscribe to 19 events; Customer Portals permit invoice history, payment-method updates and period-end cancellation. Plan switching and quantity changes are disabled.
- Production instant payouts remain disabled. No real-money acceptance transaction was performed for this release.

Frontend published as Sites version 6. Production Worker version `565090fb-90b6-44d3-a1c1-3ef589e6da46`; staging Worker version `c532fc19-899b-4eb4-a7fc-a2e6815b110d`. Subscription purchase activation requires completing the outstanding provider checks and then changing `SUBSCRIPTIONS_ENABLED` in the respective environment; never treat a pre-created Price as evidence of purchase readiness.
