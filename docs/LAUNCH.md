# Operator launch runbook

SaladFinder is an Ontario/CAD local-services marketplace. The checked-in deployment deliberately starts with `LAUNCH_MODE=preview`. Deploying code does not activate a payments business. Complete the external setup and acceptance below before changing that flag.

## 1. Establish the business

The selected product name is SaladFinder and the operator owns `saladfinder.com`. Complete business-name clearance and registration, and establish the legal operator, service area, support email and privacy contact. Domain ownership and this branding change are not trademark clearance. Review the terms/privacy text against your real business. Decide worker classification, insurance, provincial licensing and CRA platform reporting. Assess GST/HST treatment of both the worker service and the platform service. Read [research.md](research.md) for official sources and unresolved questions. The application does not collect SINs or file CRA platform returns.

The initial categories are cleaning, yard work, moving help, furniture assembly and general help. Prohibit licensed trades, dangerous work, delivery, courier, ride-share, adult services and employment-placement listings until there is a specific supported workflow and review. A marketplace label alone does not establish legal classification.

## 2. Set up transactional sign-in email

Current deployment: the Cloudflare sending domain and forwarding paths have passed actual delivery checks, and the restricted app email binding is enabled on `www.saladfinder.com`. Production app-generated sign-in and token acceptance remain pending. Follow the current evidence in [EMAIL.md](EMAIL.md); the setup instructions below also apply to new environments.

Follow [EMAIL.md](EMAIL.md) to configure Cloudflare Email Sending with a restricted native binding, or select the supported Resend alternative. Keep `EMAIL_PROVIDER=disabled` until the sending domain is verified. Configure `EMAIL_FROM`, a working `SUPPORT_EMAIL`, and an administrator's verified email in `ADMIN_EMAILS`. Resend configurations require installing `RESEND_API_KEY` through Wrangler's secure secret prompt. Never paste secrets into issues, commits or chat. Only transactional login emails are sent by the application; waitlist consent is recorded without sending a campaign.

Verify SPF/DKIM/DMARC and delivery using a mailbox you control. A generic API response is not delivery evidence. Keep magic links out of access logs and referrers; the frontend consumes the fragment token and removes it from browser history. Links are single-use and expire after 15 minutes. Production never returns the local development token.

## 3. Stripe account and Connect configuration

1. Create/activate the Canadian Stripe business account, complete operator verification, and enable Connect for a marketplace. Accept platform responsibility for Stripe fees, losses, refunds and disputes only after understanding the exposure.
2. Use test mode first. Accounts v2 creates a recipient account, requests transfers, and uses Stripe-hosted onboarding with Express dashboard access. The app never collects card numbers, bank details or identity documents itself.
3. Enable debit-card collection in Connect external-account settings if Instant Payouts will be offered. Confirm the platform's Instant Payouts daily limit with Stripe. Canadian eligibility is checked at runtime; it cannot be promised for every worker.
4. Install secrets using Wrangler's secure prompt: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`. The latter two must come from the exact endpoints and correct mode.
5. Configure platform webhook URL `https://www.saladfinder.com/api/webhooks/stripe` and connected-account webhook URL `https://www.saladfinder.com/api/webhooks/stripe-connect`. See [STRIPE.md](STRIPE.md) for events and integration details.
6. Review Checkout payment-method configuration, tax handling, receipts, statement descriptor, payout schedules and fee disclosures. Worker amounts are agreed gross service amounts; the app does not decide a worker's income tax or GST/HST obligations.
7. Keep a funded reserve. A successful payment or instant payout does not eliminate later refund or chargeback liability.

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

The configuration binds one D1 database and serves the Vite output from Workers Static Assets. Static paths have browser security headers; API paths have their own no-store/security headers. Turnstile permits the SaladFinder domain and the original Workers hostname. The Pages gateway and HTTPS for `www.saladfinder.com` are active; the canonical URL and email release checkpoint is recorded in [domain connection](DOMAIN.md). Before paid launch, verify `APP_URL`, Turnstile, Stripe return/webhook URLs and same-origin flows on the canonical hostname together. The apex still uses its original hosting record and needs a separate verified HTTPS redirect.

GitHub's manual Deploy workflow expects a scoped `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the production environment. Never upload a personal Wrangler OAuth session as a CI secret. Restrict production deployment access and enable GitHub account 2FA. The ordinary CI workflow needs no cloud or payment secrets.

Monitor Worker errors, D1 usage, Stripe webhook delivery and payout failures. The CPU ceiling bounds CPU per request, not total spend. Set budget/usage alerts in Cloudflare. D1's location hint is eastern North America, not a guarantee of Canadian-only data residency; disclose cross-border processing accurately.

Use D1 Time Travel and take protected exports before migrations. Exports contain personal data and must never enter the public repository. See [OPERATIONS.md](OPERATIONS.md).

## 5. Acceptance before live launch

- Verify two separate users through real email, then post a job, apply, hire, exchange messages and submit/approve milestones.
- With Stripe test accounts, complete worker onboarding and execute Checkout success/cancel/failure, repeated clicks, duplicate and reordered webhooks, refund, chargeback and payout failure. Observe final DB state and Stripe records, not just browser success pages.
- Check Stripe account capabilities and real payout eligibility before advertising a specific worker as ready to receive payment. Verify card/bank settlement timing in the actual Canadian account.
- Test support/report handling, suspension, record access and retention workflows. Publish real operator/contact details and reviewed policies.
- Record the tests and outstanding limitations in [VERIFICATION.md](VERIFICATION.md).
- Change `LAUNCH_MODE` to `live` only after these requirements are satisfied. Rerun checks, deploy and observe one controlled real transaction/payout. Do not treat test-mode success as live-bank evidence.

## Business viability

Default fee: customer pays 12% + CA$1 per approved milestone (minimum CA$3), added to worker pay. Initial app minimum is CA$25 per milestone. A worker receives the displayed gross milestone amount; the platform absorbs its published Stripe payment/payout fees under this proposed model. Confirm the contract before launch.

The illustrative CA$100 milestone contribution is about CA$7.17 before other expenses with a worker paid four times that month. It is a model, not earned income. Start in one neighbourhood/category, manually recruit a small customer/worker cohort, and measure completed paid milestones, repeat use, acquisition cost, time spent on support and net loss rate. Neither code nor low hosting cost creates demand.
