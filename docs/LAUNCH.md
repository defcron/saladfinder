# Operator launch runbook

SaladFinder is an Ontario/CAD local-services marketplace. The listings pilot uses `LISTINGS_ENABLED=true` with `LAUNCH_MODE=preview`: verified users can post, apply, withdraw applications, cancel their open listings and report issues. Hiring, starting work, private work messages, milestone progression, Checkout and payouts remain blocked. Pilot listings must not invite people to start work before bookings open.

The operator reported Stripe verification and payment activation complete on 2026-11-04. The restricted live API credential and platform webhook signing secret are now installed as encrypted production Worker secrets for the enabled Canadian account inside the `saladfinder` organization. The connected-account payout webhook secret, remaining Connect configuration and provider acceptance are still outstanding. The operator approved the Connect responsibility acknowledgement; completing its wizard is a separate step. Keep `LAUNCH_MODE=preview` until the paid-launch checklist below is complete. [VERIFICATION.md](VERIFICATION.md) distinguishes configuration, deployment and provider evidence.

## 1. Establish the business

The selected product name is SaladFinder and the operator owns `saladfinder.com`. Complete business-name clearance and registration, and establish the legal operator, service area, support email and privacy contact. Domain ownership and this branding change are not trademark clearance. Review the terms/privacy text against your real business. Decide worker classification, insurance, provincial licensing and CRA platform reporting. Assess GST/HST treatment of both the worker service and the platform service. Read [research.md](research.md) for official sources and unresolved questions. The application does not collect SINs or file CRA platform returns.

The initial categories are cleaning, yard work, moving help, furniture assembly and general help. Prohibit licensed trades, dangerous work, delivery, courier, ride-share, adult services and employment-placement listings until there is a specific supported workflow and review. A marketplace label alone does not establish legal classification.

## 2. Set up transactional sign-in email

Current deployment: the Cloudflare sending domain, forwarding paths and application's actual `sendSignInEmail` function have passed delivery checks. The function check used a temporary authenticated Worker with a fixed recipient and the native email binding; the exact message reached the designated Workspace inbox, and the temporary Worker was deleted. The restricted app email binding and secret administrator allowlist are installed for production. Actual production sign-in form submission and first-use/reuse token acceptance remain pending. See [VERIFICATION.md](VERIFICATION.md) for the scope of that evidence and [EMAIL.md](EMAIL.md) for setup instructions.

Follow [EMAIL.md](EMAIL.md) to configure Cloudflare Email Sending with a restricted native binding, or select the supported Resend alternative. Keep `EMAIL_PROVIDER=disabled` until the sending domain is verified. Configure `EMAIL_FROM` and a working `SUPPORT_EMAIL`. Install `ADMIN_EMAILS` as a Cloudflare secret containing only authorized administrators' verified email addresses; do not put their private addresses in public configuration. Administrative access still requires signing in with that verified address. Resend configurations require installing `RESEND_API_KEY` through Wrangler's secure secret prompt. Never paste secrets into issues, commits or chat. Only transactional login emails are sent by the application; waitlist consent is recorded without sending a campaign.

Verify SPF/DKIM/DMARC and delivery using a mailbox you control. A generic API response is not delivery evidence. Keep magic links out of access logs and referrers; the frontend consumes the fragment token and removes it from browser history. Links are single-use and expire after 15 minutes. Production never returns the local development token.

## 3. Stripe account and Connect configuration

1. Create/activate the Canadian Stripe business account, complete operator verification, and enable Connect for a marketplace. Accept platform responsibility for Stripe fees, losses, refunds and disputes only after understanding the exposure.
2. Use an isolated, managed Canadian sandbox with Connect access first. The temporary anonymous sandbox accepted unpaid platform Checkout and webhook configuration but rejected Accounts v2 access; it did not validate destination charges or payouts. Accounts v2 creates a recipient account, requests transfers, and uses Stripe-hosted onboarding with Express dashboard access. Stripe automatically requests the payouts capability when creating the balance. The app requires active transfer and payout capabilities and never collects card numbers, bank details or identity documents itself.
3. Enable debit-card collection in Connect external-account settings for Canadian Instant Payouts and bank-account collection for standard payouts. Instant is the initial UI choice only when an eligible debit card and sufficient destination-specific net balance exist. Standard explicitly targets an eligible CAD bank account. Confirm the platform's Instant Payouts daily limit with Stripe. Eligibility is checked at runtime; it cannot be promised for every worker.
4. Install secrets using Wrangler's secure prompt: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`. The latter two must come from the exact endpoints and correct mode.
5. Configure platform webhook URL `https://saladfinder.com/api/webhooks/stripe` and connected-account webhook URL `https://saladfinder.com/api/webhooks/stripe-connect`. See [STRIPE.md](STRIPE.md) for events and integration details.
6. Review Checkout payment-method configuration, tax handling, receipts, statement descriptor, payout schedules and fee disclosures. Explicit worker payout setup changes scheduling to manual, enabling in-app standard payout requests. Establish daily balance-age monitoring, worker reminders and escalation before Stripe's 90-day Canadian manual holding limit. No automated aging-balance sweep exists. See [STRIPE.md](STRIPE.md) for sources and the reconciliation procedure.
7. Keep a funded reserve. A successful payment or instant payout does not eliminate later refund or chargeback liability. Worker amounts are agreed gross service amounts; the app does not decide a worker's income tax or GST/HST obligations.

## 4. Deployment and operations

Install Node 24+, then:

```bash
npm ci
npm run cf:types
npm run check
npm run coverage
npm run test:e2e
npm run deploy:check
npm run db:remote
npx wrangler deploy
```

The configuration binds one D1 database. Production serves the frontend from ChatGPT Sites through the same-origin Cloudflare gateway; local/staging use Workers Static Assets. See [Sites deployment](SITES-DEPLOYMENT.md) for the separate frontend branch, publishing procedure and rollback. Static paths have browser security headers; API paths have their own no-store/security headers. The canonical root is `https://saladfinder.com`, with `www` redirecting to it while preserving path and query. Before paid launch, verify `APP_URL`, Turnstile, Stripe return/webhook URLs and same-origin flows on the canonical hostname together.

GitHub's manual Deploy workflow expects a scoped `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the production environment. Never upload a personal Wrangler OAuth session as a CI secret. Restrict production deployment access and enable GitHub account 2FA. The ordinary CI workflow needs no cloud or payment secrets.

Monitor Worker errors, D1 usage, Stripe webhook delivery and payout failures. The CPU ceiling bounds CPU per request, not total spend. Set budget/usage alerts in Cloudflare. D1's location hint is eastern North America, not a guarantee of Canadian-only data residency; disclose cross-border processing accurately.

Use D1 Time Travel and take protected exports before migrations. Exports contain personal data and must never enter the public repository. See [OPERATIONS.md](OPERATIONS.md).

## 5. Listings pilot acceptance

- Verify app-generated email delivery, successful first use of a magic link and rejection of token reuse on the canonical production hostname. Keep private links and message headers out of the repository.
- Use separate poster and worker accounts to post a real pilot listing, apply, inspect the authorized application, withdraw, cancel and report. Label any acceptance fixtures and remove them afterward; do not present test demand as genuine demand.
- Confirm hiring, starting work, messaging, milestone approval and all money routes remain unavailable in the production pilot. Verify the same restriction through API requests, not just disabled buttons.
- Verify administrator access through the secret allowlist, unauthorized denial, moderation and support routing. Confirm public job views omit private applicant and payment information.
- Observe `listingsReady=true`, `authReady=true` and `paymentsReady=false` in deployed configuration. Keep `LAUNCH_MODE=preview`; record actual results and any remaining production checks in [VERIFICATION.md](VERIFICATION.md).

## 6. Acceptance before paid launch

- In isolated staging, verify two separate users through real email, then post a job, apply, hire, exchange messages and submit/approve milestones.
- With Canadian Stripe sandbox accounts that have Connect access, complete worker onboarding and execute destination Checkout success/cancel/failure, repeated clicks, duplicate and reordered webhooks, refund, chargeback and payout failure. Test instant default selection, an explicit standard bank payout and reload/timeout recovery using the same payout request identifier. Observe final DB state and Stripe records, not just browser success pages.
- Check Stripe account capabilities and real payout eligibility before advertising a specific worker as ready to receive payment. Verify card/bank settlement timing in the actual Canadian account.
- Test support/report handling, suspension, record access and retention workflows. Publish real operator/contact details and reviewed policies.
- Record the tests and outstanding limitations in [VERIFICATION.md](VERIFICATION.md).
- Complete owner verification and check production account capabilities. Change `LAUNCH_MODE` to `live` only after these requirements are satisfied. Rerun checks, deploy and observe one controlled, authorized real transaction and payout before expanding the paid pilot. Do not treat test-mode success as live-bank evidence.

## Business viability

Default fee: customer pays 12% + CA$1 per approved milestone (minimum CA$3), added to worker pay. Initial app minimum is CA$25 per milestone. A worker receives the displayed gross milestone amount; the platform absorbs its published Stripe payment/payout fees under this proposed model. Confirm the contract before launch.

The illustrative CA$100 milestone contribution is about CA$7.17 before other expenses with a worker paid four times that month. It is a model, not earned income. Start in one neighbourhood/category, manually recruit a small customer/worker cohort, and measure completed paid milestones, repeat use, acquisition cost, time spent on support and net loss rate. Neither code nor low hosting cost creates demand.
