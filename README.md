# SaladFinder

**Current checkpoint:** the canonical preview and email binding are deployed at `www.saladfinder.com`, and the apex now redirects there with verified HTTPS. The real posting-and-application pilot is deployed. Hiring, work and money movement remain disabled; native email-code delivery is verified, while the complete production account sign-in cycle remains unverified. See [the current checkpoint](docs/PAUSED.md).

An Ontario/CAD local-services marketplace built with React, Cloudflare Workers, D1 and Stripe Connect. Its implemented workflow covers job listings, applications and agreed milestones. Once the paid-launch requirements are met, customers can pay approved milestones through Stripe Checkout and eligible workers can request Instant Payouts or choose standard bank payouts, subject to Stripe's actual timing.

**Launch status: public preview.** Real-money transactions are disabled. Stripe owner verification, full Connect/payment-provider acceptance, complete production account sign-in acceptance and reviewed operator details/policies are required before paid launch. This repository is not evidence that those external steps are complete. See [launch runbook](docs/LAUNCH.md) and [verification record](docs/VERIFICATION.md).

- App: https://www.saladfinder.com
- Apex HTTP/HTTPS and previous Workers/Pages page URLs redirect to the canonical `www` hostname, preserving paths and queries ([domain status](docs/DOMAIN.md)).
- Source: https://github.com/defcron/saladfinder
- License: [MIT](LICENSE)

The deployed listing pilot uses `LISTINGS_ENABLED=true` with `LAUNCH_MODE=preview`: real posting, applications, withdrawal, open-listing cancellation and reporting are enabled; hiring, starting/submitting work and all money actions remain blocked. The listing gate does not override the paid-launch requirements.

## Included

- Responsive job search with category, city and payment-schedule filters. Preview examples are visibly labelled and never inserted as real jobs.
- Verified email magic-link accounts with Cloudflare Email Sending or Resend, profiles, session revocation and data export. Cloudflare provider sending and forwarding are verified, and the restricted app email binding is deployed; the native email function has passed provider and inbox checks, while the full account sign-in cycle remains unverified. See [email operations](docs/EMAIL.md).
- Job creation with a server-calculated milestone budget and fee disclosure; applications, single-worker hiring, private job messages, submissions, approvals, reports and reviews.
- Stripe Accounts v2 hosted onboarding, hosted Checkout destination charges, balances and eligible payout requests; durable operation records and signed, replay-safe webhook reconciliation. Instant is the initial eligible payout choice, with an explicit standard-bank alternative and no automatic payout. Ambiguous requests retain the same operation reference across reloads.
- Administrator reports, suspension, payment incidents and full refunds.
- Early access registration with Turnstile and consent records.
- D1 migrations, security headers, CSRF protection, rate limits, server authorization, audit records, bounded API results, expired-session cleanup, CI and browser tests.

A payment approval is not a funded guarantee. Bank receipt is distinct from customer payment and payout initiation. In Canada, Stripe currently lists Instant Payouts through eligible debit cards attached to bank accounts; an arbitrary bank account cannot be promised same-day arrival. [Official Stripe explanation](https://docs.stripe.com/connect/instant-payouts).

## Local development

Requires Node.js 24 or later.

```bash
npm ci
npm run cf:types
npm run db:local
npm run build
npm run dev:api
```

Open `http://127.0.0.1:8787`. For UI hot reload run `npm run dev` separately. API authentication and state-changing requests use the same origin; the normal built app is the most faithful environment for browser acceptance.

Local auth deliberately returns a single-use `devToken` only when `APP_ENV=local` **and** the request hostname is loopback. The UI shows a local-development sign-in action. This is not available on production/staging hosts. Use addresses under `example.test` locally; no external mail is sent. Local marketplace workflows can run without Stripe, but money never becomes “paid” without payment evidence. The default production configuration keeps transactions disabled.

For Stripe sandbox testing, follow [Stripe integration](docs/STRIPE.md). Set secrets in a gitignored `.dev.vars.local`; never commit a key. Sandbox CAD Checkout create/replay/retrieve/expire and webhook endpoint creation have been accepted; Accounts v2 Connect was blocked by restricted-key permissions. Successful onboarding, actual webhook delivery, charges and payouts remain unaccepted. Local examples and automated provider fixtures do not establish those results.

```bash
npm run typecheck
npm test
npm run coverage
npx playwright install chromium
npm run test:e2e
npm run deploy:check
```

Browser tests use an isolated temporary D1 store on port 8788. They do not modify the production database or charge a card.

## Deploy

The deployed Worker and D1 database retain the internal names `daywork` and `daywork-production` to preserve existing bindings and data. Session cookie names, Stripe metadata keys and the waitlist removal-link storage key also remain compatible with the original preview. These are technical identifiers; the public product is SaladFinder.

The checked-in `wrangler.jsonc` targets the owner's provisioned D1 database. For a fork, create your own D1 database and replace the database ID, APP_URL, widget key and worker name. Keep staging and production databases separate.

```bash
npx wrangler login
npm run check
npm run test:e2e
npm run db:remote
npx wrangler deploy
```

Install secrets with `npx wrangler secret put SECRET_NAME`. The public site key and D1 ID are not secrets; payment keys, session tokens and Turnstile secret keys are. `npm run deploy` performs checks and migrations before deployment. The manual GitHub deployment workflow additionally requires scoped Cloudflare secrets in the production environment. Never put a personal OAuth token in CI.

## Revenue model and limits

The customer pays a service fee of **12% + CA$1 per milestone**, minimum CA$3, in addition to the worker's agreed gross amount. At the initial CA$25 minimum milestone, the fee is CA$4. Workers have no SaladFinder platform fee. The initial model absorbs platform Stripe payment/payout fees. Taxes and worker service invoicing require operator configuration/review before launch.

A modelled CA$100 milestone yields about CA$7.17 after the published domestic-card/Connect cost assumptions and active-worker allocation. Support, acquisition, losses, tax and founder labour are excluded; profitability depends on real volume and costs. Details, sensitivities and official sources are in [research](docs/research.md).

## Architecture and operations

`src/client` contains the React interface, `src/server` the Hono API, and `src/shared` shared types/fee helpers. `migrations` contains D1 schema versions. Vite builds static assets; Wrangler deploys one Worker with D1 and static-asset bindings. Identity and payment details are collected by Stripe; the app stores only the required provider IDs and operational ledger.

Read [API](docs/API.md), [operations](docs/OPERATIONS.md), [launch](docs/LAUNCH.md), [security](SECURITY.md), and [verification](docs/VERIFICATION.md). Product terms and privacy pages start as prelaunch disclosures, not a claim of legal review. SaladFinder is the selected product name; business registration and trademark clearance are still outstanding.
