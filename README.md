> Current domain update (2026-11-04): the canonical site is **https://saladfinder.com**. The `www` CNAME points to the root and redirects there. Earlier www-canonical deployment notes below are historical. See [domain migration](docs/DOMAIN.md).

# SaladFinder

A multilingual local-services marketplace with CAD pricing built with React, Cloudflare Workers, D1 and Stripe Connect. Customers can post jobs, choose workers and pay approved milestones through Stripe Checkout. Workers can apply for jobs and request standard bank payouts when their account and funds are eligible.

People can post and apply from all supported country and territory locations. The pricing page lists where paid hiring is enabled. Language selection, settlement coverage and rollout details are in [international operations](docs/INTERNATIONAL.md).

**Launch status: live paid pilot.** Posting, applications, hiring, work messages, milestones, live Checkout and standard bank payout requests are enabled. **Instant Payouts: Coming later** — disabled in production pending Stripe eligibility. No activation date or same-day bank arrival is promised.

The operator attested completion of the launch obligations. Core financial flows passed actual managed-sandbox testing; real bank receipt has not yet been observed. See [launch runbook](docs/LAUNCH.md) and [verification record](docs/VERIFICATION.md) for exact coverage and remaining provider checks.

- App: https://saladfinder.com
- The `www` subdomain redirects to the root, preserving paths and queries ([domain status](docs/DOMAIN.md)).
- Source: https://github.com/defcron/saladfinder
- License: [MIT](LICENSE)

The operator-authorized paid pilot uses `LISTINGS_ENABLED=true`, `LAUNCH_MODE=live` and live Stripe credentials. Posting, applications, hiring, work messages, milestones, Checkout and standard bank payout requests are enabled. Production instant payouts remain disabled while Stripe’s verified daily limit is CA$0. Core money flows passed managed-sandbox acceptance; no live charge or bank arrival has yet been observed. See [verification](docs/VERIFICATION.md) for exact test coverage and remaining provider checks.

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

The current production API Worker is still `daywork`; the independent static frontend Worker is `saladfinder-frontend`. The existing D1 database keeps its legacy name `daywork-production` to preserve data. Session cookie names, Stripe metadata keys and the waitlist removal-link storage key also remain compatible with the original preview. These are technical identifiers; the public product is SaladFinder.

The checked-in `wrangler.jsonc` targets the owner's provisioned D1 database and current API Worker. `wrangler.frontend.jsonc` targets the separate frontend Worker. For a fork, create your own D1 database and replace the database ID, APP_URL, widget key and worker names. Keep staging and production databases separate.

```bash
npx wrangler login
npm run check
npm run test:e2e
npm run db:remote
npx wrangler deploy
```

Install secrets with `npx wrangler secret put SECRET_NAME`. The public site key and D1 ID are not secrets; payment keys, session tokens and Turnstile secret keys are. `npm run deploy` performs checks and migrations before deployment. The manual GitHub deployment workflow additionally requires scoped Cloudflare secrets in the production environment. Never put a personal OAuth token in CI.

## Revenue model and limits

New agreements use the following configured CAD fees. Each account's own plan applies independently to its poster and worker fees.

| Plan | Monthly | Poster fee per milestone | Worker fee per milestone |
| --- | ---: | --- | --- |
| Standard | Free | 14.9% + $1, minimum $3 | 7.9% + $1 |
| Economy | $10 | 8.9% + $0.50, minimum $1.50 | 5.4% + $0.50 |
| Premium | $25 | 3.9% + $1.30 | 3.9% + $1.30 |

The poster pays gross work value plus their fee; the worker receives gross minus their fee. There is no additional SaladFinder fee on withdrawal. All tiers include unlimited postings and applications, subject to abuse controls. Paid plans renew monthly until canceled. Benefits apply to new postings/applications after verified payment; existing agreements retain their recorded fees. Legacy jobs retain the original 12% + $1 poster fee (minimum $3) and zero worker fee.

These are fixed service rates, not a reimbursement of each payment's actual Stripe costs. Revenue must also cover processing, Connect, hosting, support, refunds/losses and taxes; profitability is not guaranteed. Earlier financial modelling in [research](docs/research.md) describes the original pricing and is not a forecast for these tiers. See [subscription implementation and operations](docs/SUBSCRIPTIONS-DESIGN.md) for activation gates and verification status.

## Architecture and operations

`src/client` contains the React interface, `src/server` the Hono API, and `src/shared` shared types/fee helpers. `migrations` contains D1 schema versions. Vite builds static assets; Wrangler deploys the API and frontend Workers independently. Identity and payment details are collected by Stripe; the app stores only the required provider IDs and operational ledger.

Read [API](docs/API.md), [operations](docs/OPERATIONS.md), [launch](docs/LAUNCH.md), [security](SECURITY.md), and [verification](docs/VERIFICATION.md). Product terms and privacy pages start as prelaunch disclosures, not a claim of legal review. SaladFinder is the selected product name; business registration and trademark clearance are still outstanding.

Staging uses the same payment handlers, Stripe SDK and ledger as production. Stripe's managed sandbox simulates the financial operations; there is no separate deployed staging payment engine. See [the staging architecture and acceptance checkpoint](docs/STAGING.md).
