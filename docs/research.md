# Payment and launch research

Checked against official sources on 2026-11-04 UTC (2026-11-03 in Toronto). Prices and provider eligibility must be reconfirmed before accepting live payments. Ontario/CAD is the initial planning assumption, not a statement that the operator has completed registration or regulatory review.

## Payment architecture

Use Stripe Connect Accounts v2 for each worker, Stripe-hosted onboarding, and an Express dashboard. Explicitly configure the platform's fee and negative-balance responsibilities. The recipient configuration needs `stripe_balance.stripe_transfers` for destination charges. Stripe collects identity requirements in the hosted flow; the application should not store bank details or identity documents. Account capabilities and outstanding requirements must be checked before payment is offered. [Account configuration](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration), [marketplace account creation](https://docs.stripe.com/connect/marketplace/tasks/create).

A client pays each approved milestone through a Stripe Checkout Session. The server supplies the immutable amount, currency, connected account, and application fee. A destination charge transfers the worker's share when payment succeeds; the platform bears Stripe fees, refunds, and chargebacks. This supports payment during work through agreed milestones and a final payment after completion. It is not escrow, a prepaid guarantee, or credit. [Destination charges with hosted Checkout](https://docs.stripe.com/connect/destination-charges.md?platform=web&ui=stripe-hosted).

Persist a payment attempt before calling Stripe, reuse its idempotency key, and reconcile signed webhooks against its expected account, mode, currency, amount, and job. Browser redirects never prove payment. Retries and duplicate or out-of-order events must not release a second payment. Store refunds and disputes as additional financial states rather than rewriting the original amount. These are application engineering decisions based on the funds flow above.

## Bank arrival and the same-day promise

Connect Instant Payouts support Canada, but **Canada's listed eligible external account type is a debit card**, which routes funds to its associated bank account. Arbitrary Canadian bank accounts cannot be advertised as instant-capable. The platform needs an active daily instant-payout allowance; workers need an eligible external destination, local currency and full Stripe terms. Card proceeds can be instantly available after successful payment; bank debit proceeds must first settle. Check `available_payout_methods`, actual `instant_available` balance and, when collecting a payout application fee, expanded `net_available`. Stripe says arrival is typically within 30 minutes, with possible delays. [Connect Instant Payouts](https://docs.stripe.com/connect/instant-payouts).

Ordinary payouts follow settlement timing and the account's payout schedule. Stripe describes initial payouts as typically taking 7–14 days, with account and country variations. Display payment received, funds pending, payout requested, and bank arrival as distinct states. Never turn a successful charge into a “paid to bank” claim. [Stripe payout timing](https://docs.stripe.com/payouts).

Recommended product copy: “Get paid at agreed milestones. Eligible workers can request an instant payout to a supported debit card; standard bank payouts follow Stripe's schedule.” Eligibility should be visible before accepting a job. A new business cannot guarantee every worker receives every payment in their bank that day.

## Unit economics

Published Canadian domestic-card pricing is 2.9% plus CA$0.30 per successful payment. International cards, currency conversion, disputes, and some optional products add costs. [Canadian payments pricing](https://stripe.com/en-ca/pricing).

For platform-controlled Connect pricing, published charges include CA$2 per monthly active worker account and 0.25% plus CA$0.25 per payout. Instant Payouts cost 1% of payout volume. The feature comparison also lists a separate 0.25% funds-routing/management volume charge: reserve for that conservatively until the business's Stripe pricing agreement confirms the applicable combination. [Canadian Connect pricing](https://stripe.com/en-ca/connect/pricing).

The following is a **proposed pricing model and sensitivity calculation**, not verified revenue or a provider quote: charge the client 12% of the worker amount plus CA$1 per milestone, with a CA$3 minimum fee. Do not subtract this marketplace fee from the agreed worker amount. The implementation may choose a different launch rate; it must keep UI, server calculation, and terms consistent.

For a CA$100 milestone, a CA$13 client fee produces a CA$113 charge:

| Item                                             |      CAD |
| ------------------------------------------------ | -------: |
| Marketplace fee collected                        |    13.00 |
| Domestic card processing, rounded                |    -3.58 |
| Standard payout charge assumption                |    -0.50 |
| Conservative extra routing allowance             |    -0.25 |
| Instant payout, if used and absorbed             |    -1.00 |
| Active-account allocation at four payments/month |    -0.50 |
| Contribution before other business expenses      | **7.17** |

At one payment per worker per month, the active-account allocation is CA$2 and contribution falls to CA$5.67. Splitting a job into many milestones increases fixed payment and payout fees. Refunds, chargeback losses, customer acquisition, support time, insurance, legal/accounting work, tax and other expenses are excluded. There is no basis to promise profitability before measuring repeat demand and loss rates.

Illustratively, allocating CA$1.50 per milestone for support and losses leaves CA$5.67 from the four-payments scenario. With CA$25 fixed monthly costs, about five such milestones cover that narrow operating budget; around 93 support approximately CA$500 before income tax. These are arithmetic scenarios, not a forecast, and exclude the founder's labour and acquisition spending.

## Hosting costs

Workers Paid has a US$5 account minimum, including 10 million requests and 30 million CPU milliseconds monthly. Static asset requests are free. Since the account is already paid, incremental cost can be small if shared account allowances remain available. Set explicit CPU limits, paginate reads, and monitor usage. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

D1's paid allowance includes 25 billion rows read, 50 million rows written, and 5 GB storage monthly. Indexes matter because billing counts scanned rows. A Worker with static assets and one indexed D1 database is sufficient for the initial workload; no always-on server is required. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

## Ontario and Canadian launch scope

Ontario's Digital Platform Workers' Rights Act came into force July 1, 2025. The province's current explanation applies to ride-share, delivery and courier work, regardless of employee status. Those services carry written-information, pay-period, minimum-wage, deduction, removal and dispute obligations. Do not generalize this Act to every home-service task or assume that a contractor label avoids other laws. A narrow home-service launch should exclude ride-share, courier and delivery until those workflows are specifically reviewed. [Ontario digital platform worker rights](https://www.ontario.ca/page/rights-and-protections-digital-platform-workers).

Ontario separately requires licensing for temporary help agencies and recruiters. The recruiter definition covers finding employment or employees for a fee; payment by the hiring party does not by itself avoid that definition. Whether a particular independent-service marketplace falls within it depends on its actual activity and relationships. Establish the business's classification before advertising employment placement or staffing. [Ontario licensing](https://www.ontario.ca/page/licensing-temporary-help-agencies-and-recruiters), [fee definition](https://www.ontario.ca/document/your-guide-employment-standards-act-0/licensing-temporary-help-agencies-and-recruiters).

CRA digital-platform reporting rules explicitly include time/task-based personal services such as housekeeping, gardening and manual labour. A platform that matches workers and handles payment is different from software exclusively listing advertisements or processing payment. Reporting operators must collect and verify reportable seller information and report annually; Stripe payment onboarding alone does not prove these obligations are met. Determine the operator's obligations, secure collection method and reporting process before live trading. [CRA scope and personal services](https://www.canada.ca/en/revenue-agency/programs/about-canada-revenue-agency-cra/compliance/reporting-rules-digital-platforms/guidance-on-reporting-rules.html), [CRA overview](https://www.canada.ca/en/revenue-agency/programs/about-canada-revenue-agency-cra/compliance/reporting-rules-digital-platforms.html).

CRA says reporting platform operators file the prior calendar year's Part XX return by January 31. Store a durable ledger suitable for reporting; avoid collecting tax identifiers casually in an ordinary profile or chat field. [CRA filing](https://www.canada.ca/en/revenue-agency/programs/about-canada-revenue-agency-cra/compliance/reporting-rules-digital-platforms/filing-information-returns.html).

GST/HST registration and collection depend on the business's actual supplies and status; the general small-supplier threshold is CA$30,000, with timing rules and exceptions. The operator must determine who supplies each service and what tax applies to the work and platform fee. A fee calculator alone is not a tax determination. [CRA registration rules](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html).

## Evidence required before live payments

- Business operator identity, service area, support contact, privacy terms, cancellation/refund rules and fee disclosures are real and reviewed.
- Stripe approves the platform, live keys and webhook secrets are installed securely, connected workers complete onboarding, and account capabilities are verified.
- Test-mode evidence covers checkout success, asynchronous failure, replay, refund, dispute, payout failure and reconciliation; a genuine live payment and bank payout require separately observed evidence.
- The operator decides the legal, tax, reporting, insurance and worker-classification treatment of the actual launch categories.
- A funded operating reserve and dispute process exist. Instant payouts transfer money before dispute risk ends.

Publishing code or deploying a payment-disabled app does not establish any of these external facts.
