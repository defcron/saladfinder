## 2026-11-05 staging Worker rename

- Renamed the existing Cloudflare Worker to `saladfinder-staging` in place; preserved its immutable ID, five encrypted secrets and isolated D1 binding. The database retains its legacy `daywork-staging` name and data.
- Updated Wrangler staging name and `APP_URL`, Turnstile allowed hostname and the routing regression fixture. Deployed version `a3c0b8c5-8d83-4a7b-a32b-f2ab38c62be4` at <https://saladfinder-staging.defcronyke.workers.dev>.
- `npm run check` passed 195 tests, typechecking and build; coverage passed at 93.65% lines; all 18 desktop/mobile browser tests passed. Deployment parity passed with unchanged executable SHA-256 `4ba249e28540e5fa2238cdb870b3fefb9122f2b812320e9cbe2cfee829253aac`.
- New staging `/api/config` returned HTTP 200 with `paymentMode=test`, `launchMode=live`, `authReady=true` and `paymentsReady=true`. These configuration flags do not prove webhook delivery or completed financial operations.
- Updating the Stripe sandbox payment webhook URL failed with HTTP 403. Refresh revealed an expired dashboard session. Both sandbox destination URLs remain on the old hostname pending sign-in; do not claim end-to-end staging payment acceptance until they are updated and tested.
- Production remains `LAUNCH_MODE=preview`, `paymentMode=live`, `paymentsReady=false`. The operator launch requirements and actual sandbox financial acceptance are unresolved; no real charge or payout was made.

## 2026-11-05 shared payment runtime and isolated sandbox deployment

- Removed environment-name branches from the financial handlers. The same Stripe SDK, payment router and ledger run in both deployments. `STRIPE_MODE=test|live` is a deployment-level credential guard; Stripe's sandbox supplies the simulation. No fake provider is deployed.
- Centralized mode validation for API readiness, payment mutations, provider reads, both signed webhook handlers and held-checkout expiry. Missing/unknown modes and cross-mode keys fail closed before provider calls. Valid preview-mode webhook reconciliation remains available.
- Added a single parameterized test/live lifecycle covering Accounts v2 onboarding, duplicate Checkout, server-calculated fees, owner checks, signature/mode denial, both payout methods, duplicate/reordered payout events, full refunds and late payment events after refunds. Fixtures remain test-only.
- `npm run check` passed 195 tests, typechecking and build. Coverage passed: **93.65% lines**, **92.37% statements**, **88.13% branches**, **93.93% functions**. All **18 desktop/mobile browser tests** passed.
- Generated production and staging Worker executables are byte-identical: SHA-256 `4ba249e28540e5fa2238cdb870b3fefb9122f2b812320e9cbe2cfee829253aac`. `npm run check:deployment-parity` now enforces executable parity in CI.
- Deployed staging Worker version `0e3b4136-0c24-4ade-89ed-600282706c87`; configuration reports `paymentMode=test`, `paymentsReady=true`. Its real provider-backed status read succeeds and reports manual scheduling; the test recipient is still awaiting final onboarding submission.
- Deployed production Worker version `62eb18b4-5080-4c86-8a22-b8e4e2af1710`; configuration reports `paymentMode=live`, `paymentsReady=false`, `LAUNCH_MODE=preview`. The signed-in read-only Stripe connection diagnostic passed all four checks again at 15:53 UTC.
- Published Sites version **2**, frontend artifact commit `e390c46337baa8426b0071feea335b95a4d19cca`, and mirrored it to `frontend-deploy`. The canonical production page and staging use the same JavaScript/CSS build. Native Chrome confirmed the generic test-mode notice on staging; production stays on its live-mode configuration without this notice.
- The managed sandbox, restricted test credential and both webhook signing secrets are installed. Initial app-to-provider onboarding writes and connected-account reads passed. Hosted test onboarding reached final review. No completed sandbox charge/refund/payout, actual webhook delivery or live money movement is claimed. See [STAGING.md](STAGING.md).

## 2026-11-05 Connect configuration and deployed credential verification

- The operator reported finishing the bank settings update. Stripe now shows Connect's normal overview and an enabled connected account with payments and payouts active. This is dashboard evidence, not an app-created onboarding acceptance test.
- Created the active connected-account snapshot webhook at `https://saladfinder.com/api/webhooks/stripe-connect`, API version `2026-10-28.endive`, for `payout.created`, `payout.updated`, `payout.paid`, `payout.failed` and `payout.canceled`. Installed its encrypted `STRIPE_CONNECT_WEBHOOK_SECRET`; Wrangler independently confirmed all three Stripe secret names in production.
- Saved and reread Connect external-account settings: require a bank account, allow debit cards, and allow multiple external accounts per currency. These settings support collecting both standard-bank and eligible instant-card destinations.
- The platform's Instant Payouts dashboard shows **CA$0/day**. Deployed `INSTANT_PAYOUTS_ENABLED=false`; the status response cannot select instant, and the server rejects new instant requests. Standard payouts remain implemented. Enabling instant later requires a positive provider limit and acceptance checks, not merely flipping this setting.
- Added an administrator-only, rate-limited, read-only `/api/admin/payments/readiness` check. From the actual production deployment, all four checks passed: the Canadian platform account has charges/payouts enabled and details submitted; Accounts v2 list access works; the live balance endpoint works; both enabled webhook configurations contain the expected events/version. The response excludes balances, identity data, keys and raw provider errors.
- Production Worker `cdf37ecb-3b51-4c81-b52c-1c0b0cefb9fb` deployed successfully. `LAUNCH_MODE=preview` remains. Sites frontend assets were unchanged.
- `npm run check` passed (178 tests, typecheck and build); `npm run coverage` passed (93.48% lines); `npm run test:e2e` passed all 18 desktop/mobile tests. New regression coverage includes administrator denial, rate limiting, configuration failures, sanitized provider errors and instant-disable enforcement without disabling standard payouts.
- After operator approval, created managed `SaladFinder staging`, its restricted test key and two separate signed snapshot webhook destinations. All three secrets are encrypted only on `daywork-staging`. The app created a Canadian v2 recipient and manual payout schedule, and retrieved connected account/balance/payout/destination settings. Hosted test onboarding reached final review. See [STAGING.md](STAGING.md) for the precise provider checkpoint; no paid Checkout or payout acceptance is claimed.
- Outstanding: end-to-end sandbox onboarding, destination charges, refund/payout reconciliation and actual webhook delivery; operator launch checklist; authorized controlled live transaction/payout. Read access and configuration checks do not establish write permissions or bank arrival. No live money action was performed.

## 2026-11-04 live Stripe credential setup

- Verified the lowercase `saladfinder` organization and selected its enabled Canadian member account. The organization itself is not the payment account.
- After operator-approved key creation and operator-completed authentication, installed the restricted production credential as encrypted `STRIPE_SECRET_KEY` on the production Worker.
- Created the active platform snapshot webhook at `https://saladfinder.com/api/webhooks/stripe`, using API version `2026-10-28.endive` and the 11 Checkout, refund and dispute events documented in [STRIPE.md](STRIPE.md). Installed its encrypted `STRIPE_WEBHOOK_SECRET`. Cloudflare secret-name inventory independently confirmed both bindings; secret values are not retained in tracked files.
- The operator explicitly approved the displayed Connect liability acknowledgement and Radar fees; the acknowledgement was checked and Continue submitted. Completion of the remaining Connect wizard is not yet verified.
- Opened the member account's linked-bank-account settings for the operator to update directly. No bank details were changed by the agent.
- `STRIPE_CONNECT_WEBHOOK_SECRET`, connected-account payout destination setup and provider acceptance remain outstanding. Production remains `LAUNCH_MODE=preview`. No live payment, transfer, refund or payout was performed. An active webhook configuration is not evidence of a successful webhook delivery.

## 2026-11-04 Sites frontend migration

- Public Sites project `appgprj_6aebb054ec9081918311eca3ede0063e`, version 1, published successfully at https://saladfinder.defcron.chatgpt.site.
- Artifact commit `9412b7d232f58dce51560aab4702bf5daa4cc6de` is also published to GitHub branch `frontend-deploy`. Sites uses its own managed source repository in addition to this mirror; GitHub pushes alone do not deploy Sites.
- Production gateway version `861d689f-f3d1-41b9-ac01-b248bb770b82` serves Sites pages/assets at https://saladfinder.com. APIs remain on the existing Worker/D1. DNS and www canonical redirects are unchanged.
- Deploy-first validation, as requested: initial `/index.html` request encountered Sites' 307 redirect; gateway corrected to request `/` and redeployed. Live root/sign-in return 200 with `X-SaladFinder-Frontend: sites`; API health returns 200; missing static assets return 404.
- `npm run check`, `npm run coverage` (166 tests, 93.22% lines), and `npm run test:e2e` (18 tests) passed. Focused gateway regression rerun passed after the root-path correction.
- Browser plugin not available; regular Playwright checked the canonical live host at 1440px and 390px: meaningful content, all brand images decoded, no horizontal overflow, sign-in and unknown-route recovery, and no JavaScript page errors. The pre-existing blocked Cloudflare analytics beacon remains separate from app functionality. Direct Sites-origin visits redirect to the canonical domain.
- At the time of this frontend migration, production remained preview and Stripe credentials were not yet installed; the later credential setup is recorded above. No live payment, transfer or payout was made.

# Brand integration — 2026-11-04

Production Worker version: `813ef48d-b0a7-4a48-9f8f-96b3aea9aa4f`.

Integrated vector wordmark in shared header/footer, square logo on sign-in, responsive homepage banner, full square favicon and touch icon, and Open Graph/social share image. Optimized delivery assets accompany the original PNG/SVG masters and brand guide. Sign-in mail now contains escaped HTML, a compatible PNG logo, accessible text links and its existing plain-text alternative. Stripe-hosted branding remains separate and unchanged.

Validation: `npm run check` passed 154 tests plus typechecking/build; coverage passed (93.04% lines); all 18 browser tests passed. Live 1440px and 390px pages loaded the new assets without horizontal overflow or JavaScript runtime errors; menu/post navigation and sign-in branding were checked. Browser plugin was unavailable, so Playwright performed rendered app checks. One Cloudflare-injected analytics beacon was blocked by the existing CSP; application functionality was unaffected and CSP was not relaxed.

The actual email function was exercised through a temporary authenticated fixed-recipient Worker. Cloudflare accepted the message, and the HTML brand message was observed in the operator's Workspace inbox through native Chrome. Its harmless diagnostic URL was not a real sign-in token. The temporary Worker and credential were deleted. Mobile/desktop HTML email previews were inspected; this does not establish all email-client compatibility.

Earlier records below are historical.

# Root-domain release — 2026-11-04

Deployed Worker `2bc1c782-e35f-4dfa-9c65-930013959863` with root APP_URL and explicit root/www routes. Local and staging routes are explicitly empty to prevent production-route inheritance. Check/typecheck/build and all 153 unit tests passed; coverage passed (93% lines); all 18 browser tests passed after isolating local routes. Live root home, sign-in and pricing returned 200 over verified HTTPS. www returned 308 to root preserving paths/queries. Root-origin invalid auth input returned 400 and hostile origin returned 403. Full real-user sign-in was not repeated.

Earlier checkpoints below are historical.

# Verification record

Updated on **2026-11-04**. This record distinguishes implementation, local regression tests, deployed preview checks and provider acceptance. Completed checks are recorded separately from pending release work. Historical snapshots below describe the state at their original checkpoints.

## Listings pilot and payout hardening — 2026-11-04

The current release is deployed with `LISTINGS_ENABLED=true` and `LAUNCH_MODE=preview`. That combination allows verified posting, applications, withdrawal, cancellation and reports while keeping hiring, work progression and money routes blocked. Production paid launch remains blocked by incomplete Stripe owner verification and outstanding Connect acceptance; no private account requirements or identifiers are published here.

Implemented changes include conditional instant-payout default selection, an explicit standard CAD bank destination, Accounts v2 capability readiness, user-initiated manual payout setup, destination-specific instant balance checks, financial-hold checks independent of a local report, and durable payout-request recovery across reloads. Ambiguous requests retain their original identifier; a new request is permitted only after a definitive rejection is recorded without racing a concurrent creation. The administrator allowlist is installed as a Cloudflare secret; private administrator addresses are not published.

| Release check                        | Result                                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                      | Passed typecheck, all 151 automated tests and application build                                                                                 |
| `npm run coverage`                   | All 151 tests passed; 91.52% statements, 85.29% branches, 93.04% functions, 93.00% lines                                                        |
| `npm run test:e2e`                   | All 18 Playwright desktop/mobile tests passed                                                                                                   |
| Pages gateway build                  | Passed                                                                                                                                          |
| Production Worker deployment dry run | Passed                                                                                                                                          |
| Apex HTTPS and redirect              | Valid certificate; root, path and query redirected with 308 to `www.saladfinder.com`; preserved `kycaml` configuration                          |
| Production Worker deployment         | Version `30875c46-fa9c-4da5-a3cf-eeca32254327` serving 100% after administrator secret installation at 11:40:55 UTC                             |
| Live configuration                   | `authReady=true`, `listingsReady=true`, `paymentsReady=false`, `LAUNCH_MODE=preview`                                                            |
| Canonical-host browser checks        | Desktop 1440px and mobile 390px: home, example listing and post-to-sign-in flow passed without page errors or authentication writes             |
| Native app email function            | Actual `sendSignInEmail` function accepted by the native binding at 11:41:40 UTC; exact test message observed in the designated Workspace inbox |

The email check imported the application's real sending function into a temporary authenticated Worker restricted to a fixed recipient. It established native payload acceptance and actual delivery; it did not submit the production sign-in form, create an account, accept legal consent or consume a real sign-in token. The temporary Worker was deleted and deletion confirmed. End-to-end production sign-in, token reuse rejection and the authenticated listings pilot still require acceptance. No private recipient, authentication token or message content is published.

Isolated staging is deployed at <https://daywork-staging.defcronyke.workers.dev>, version `8f415e8a-2f56-4582-a1b2-2aa803175f26` serving 100%. Its remote D1 migrations are applied, and configuration returns `authReady=true`, `listingsReady=true`, `paymentsReady=false` in preview mode. Its hostname is allowed by Turnstile, and administrator/Turnstile secrets are installed. No Stripe key is installed there.

All **41 remote staging HTTP assertions passed** using synthetic staging-only fixtures: one-time token verification and reuse rejection, secure cookie/session handling, posting, applying, ownership checks, reports, withdrawal and cancellation. Paid, hiring and work routes returned 503; hostile-origin requests returned 403. No financial intents were created, and no emails were sent to the synthetic addresses. These checks exercise the deployed application endpoints without claiming real email sign-in or production account acceptance.

Scoped cleanup was verified with zero remaining fixture users, authentication tokens, sessions, jobs, milestones, applications, reports, messages, reviews and audit rows. Exact per-user rate-limit keys were removed; the shared IP verification bucket was left to expire normally rather than deleting other callers' rate-limit state. No financial intents were present. The private staging acceptance report is retained outside tracked files.

Formatting checks and a scan of 27 changed files for the known private Stripe credential and common credential patterns passed. Credentials and private fixture evidence remain outside tracked files.

Direct deployment and canonical-host observations are established above. GitHub CI is tracked separately in the repository's [Actions workflow](https://github.com/defcron/saladfinder/actions/workflows/ci.yml); direct deployment does not imply CI success. Local suites, deployed configuration and email delivery do not establish Stripe Connect or bank-payout acceptance; provider evidence is independently recorded in the next section.

## Actual Stripe sandbox probe — 2026-11-04

The official Stripe CLI created an isolated, unclaimed temporary sandbox. The probe used `stripe@23.1.0` with API version `2026-10-28.endive`; every accepted object was test mode. The sandbox expires after seven days. No account claim, agreement acceptance or live-money action was performed.

| Provider operation                          | Observed result                                              | What it establishes                                                                              |
| ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Accounts v2 Canadian recipient creation     | Rejected with HTTP 403: credential lacked Accounts v2 access | Connect access is blocked; recipient payload validation and account creation are not established |
| Platform hosted Checkout creation           | Accepted CAD 2,900 cents; session open and unpaid            | Basic Checkout request accepted by Stripe, with card and Link selected dynamically               |
| Same Checkout idempotency key and request   | Returned the same session                                    | Provider idempotent replay for that request                                                      |
| Checkout retrieval and expiry               | Retrieved, then expired while unpaid                         | Basic object read and cleanup accepted                                                           |
| Platform snapshot webhook endpoint creation | Accepted and issued a signing secret                         | Endpoint configuration accepted; reserved `.invalid` target means no delivery was tested         |
| Webhook disable and delete                  | Both accepted                                                | Temporary endpoint cleaned up                                                                    |

No connected account was created. The Checkout probe did not include an application fee or destination transfer, and no payment was confirmed. No charge, refund, dispute, payout or bank receipt was tested. The temporary endpoint was disabled and deleted; the only retained Checkout session is expired and unpaid. The local redacted evidence is `.local/stripe-provider-acceptance.json`, excluded from the public repository. Keys, signing secrets, claim links, account identifiers and private identity information are not published.

A managed or claimed Canadian sandbox with Connect access is still required for hosted onboarding, destination-charge and payout acceptance. Provider-fixture tests and basic platform Checkout acceptance cannot substitute for those checks. See [STRIPE.md](STRIPE.md).

## Cloudflare DNS and email activation — 2026-11-04 (historical checkpoint)

- The operator explicitly authorized Cloudflare nameservers for `saladfinder.com`. Netfirms remains the registrar. Its saved nameservers, the `.com` registry and both Cloudflare authoritative servers confirm `maciej.ns.cloudflare.com` and `rihana.ns.cloudflare.com`. Recursive caches still returned mixed old and new answers; global cache expiry is not claimed.
- Preserved the `kycaml` Google service CNAME, Google verification, original apex/FTP hosting and existing ACME delegation. Replaced the suspended Netfirms mail configuration with Cloudflare receiving MX, SPF and provider-generated DKIM. The apex still points to its original hosting; no new apex redirect was configured.
- Cloudflare routing reports enabled, ready and synchronized. Seven explicit aliases forward to the verified operator-controlled Workspace destination; catch-all is disabled. The exact destination and private message headers are omitted from the public repository.
- Actual provider sending from `support@saladfinder.com` reached Workspace with SPF, DKIM and DMARC passing. A separate message to that support alias reached the forwarding destination in approximately seven seconds, with forwarding DKIM and ARC passing. This establishes both mail paths, not an app-generated sign-in or token acceptance.
- Sending-domain DNS reports ready with no errors. DMARC remains `p=none` monitoring. Provider message-body previews are disabled. The provider SMTP endpoint on port 465 passed normal CA/hostname TLS validation; no mail-client credentials or Gmail “Send mail as” identity were configured.
- `npm run check`, `npm run coverage` and `npm run test:e2e` passed: **123 automated tests and 8 desktop/mobile browser tests**. Coverage was **89.75% statements, 82.29% branches, 92.30% functions and 91.31% lines**. After the canonical URL update, binding types were regenerated and typechecking and the final Worker dry run passed.
- The previous GitHub run exposed a fresh-checkout gateway build failure because `.local` did not exist. The gateway build now creates its output parent directory with a portable Node prebuild step; no tests or coverage checks were removed. The corrected build passes both in the workspace and in an isolated copy of the tracked files with no initial `.local` directory, producing the compiled Worker and routes file.
- Direct Wrangler deployment succeeded with Worker version `7d17b829-58d1-4abe-8a3b-b481c5511230` and 17 ms startup. Production uses `APP_URL=https://www.saladfinder.com`, `EMAIL_PROVIDER=cloudflare` and an `EMAIL` binding restricted to `login@saladfinder.com`. Local/staging mail remain disabled. No database migration or Stripe change was made.
- Live health, configuration and `/sign-in` returned 200 over validated HTTPS. Configuration reports Ontario/CAD, `authReady=true`, `paymentsReady=false` and the support address. `LAUNCH_MODE=preview` remains in effect.
- Workers and Pages old-host requests to `/pricing?source=dns-check` returned 308 to the same path/query on `www`. An empty authentication request from the canonical origin reached input validation (400); the same request from a hostile origin was rejected (403). These probes created no account and sent no email.
- Native Chrome visual inspection confirmed the enabled sign-in form, correct support link and an automatically successful Turnstile widget on `www`. No account details or consent were submitted. A real app-generated sign-in email, successful first use and token reuse rejection remain pending production acceptance; local tests cover the authentication behavior.
- The Pages custom domain and its Google-issued certificate are active. A separate Cloudflare Universal SSL Let's Encrypt apex/wildcard certificate remains pending validation. These are distinct certificate paths.

This checkpoint records direct deployment, local suites and live observations. GitHub CI history is tracked separately in the repository's Actions workflow linked above; deployment alone does not establish CI success.

## Initial implementation verification (historical)

| Check                             | Result                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript strict check           | Passed                                                                                                                                                                                            |
| Generated Worker binding types    | Passed `wrangler types --strict-vars=false --check`                                                                                                                                               |
| Unit/integration regression suite | 55 passed: 18 authentication/marketplace, 32 payment, 5 assembled Worker                                                                                                                          |
| Database                          | Real Miniflare D1, both migrations applied per isolated test environment                                                                                                                          |
| Stripe webhook verification       | Real Stripe SDK signature verification; Stripe API operations use explicit test fixtures                                                                                                          |
| Desktop/mobile browser suite      | 8 passed, Chromium desktop and 390px mobile emulation                                                                                                                                             |
| Browser workflow                  | Email-link local login, job posting, search, application, hire, worker start, private messaging, milestone submission/approval, profile update; payment correctly disabled without provider setup |
| Early access                      | Local registration/consent persistence, private removal link and deletion verified                                                                                                                |
| Accessibility                     | Axe WCAG 2A/AA + 2.1AA checks passed on tested home and job screens; this is not a full accessibility certification                                                                               |
| Build and Worker dry run          | Passed                                                                                                                                                                                            |
| Dependency audit                  | No known vulnerabilities reported by npm audit at verification time                                                                                                                               |
| Formatting and whitespace         | Prettier and git whitespace checks passed                                                                                                                                                         |
| Credential hygiene                | Secret-bearing setup file ignored and removed after upload; no suspected live credentials in source/docs/tests; no production user data committed                                                 |

Combined coverage after source formatting: **88.87% statements, 80.47% branches, 91.75% functions, 90.46% lines**. Enforced project floors are 85%, 75%, 90%, and 90% respectively. Coverage does not prove external payment correctness. CI reruns the checks on the published commit.

The regression suite covers account/session/token authorization, one-use links, production development-token rejection, Turnstile hostname/action checks, CSRF, atomic concurrent hiring, private-data separation, suspended accounts, reports/moderation, owner-only milestones, immutable/idempotent payment attempts, duplicate/reordered events, refund-before-payment ordering, insufficient or ineligible payouts, ambiguous-operation retries and admin access.

## Cloudflare email preparation — 2026-11-04

- Added optional native Cloudflare Email Sending alongside Resend, with explicit provider selection and shared readiness checks. All deployment configurations set `EMAIL_PROVIDER=disabled` pending domain activation and actual provider delivery acceptance.
- Added 15 provider/authentication integration cases. `npm run check`, `npm run coverage`, `npm run test:e2e`, binding-type validation, formatting and deployment dry run passed: 70 backend tests and 8 browser tests. Combined coverage: 89.28% statements, 81.48% branches, 92.07% functions, 90.92% lines.
- Direct deployment succeeded with Worker version `38854373-1704-4511-a107-b54a4e23f03d` and 30 ms startup. Live health remains OK/preview, authentication and payments readiness remain false, and a production sign-in attempt returns 503 before sending email or creating a token.
- Preserved the user-confirmed legacy `kycaml` CNAME in the pending DNS zone, configured Full (strict), minimum TLS 1.2 and HTTPS redirection, and enabled DMARC aggregate reporting with an initial monitoring policy. These zone settings do not establish authoritative DNS activation or issued certificates.
- Provider verification was requested for the operator-designated forwarding inbox. Incoming routing, sender onboarding, signed-message/header acceptance and custom-domain TLS are still pending. Cloudflare rejected sender onboarding with `Active zone required`.
- The preserved legacy Google-hosted service independently presents an expired certificate and HTTP 503. Its existing routing is preserved; that hosting failure was not introduced by this change.

## SaladFinder rename release — 2026-11-04

- Product branding, browser title/metadata, accessible navigation labels, emails, fee labels, exports and current documentation now use SaladFinder.
- Public MIT repository renamed to <https://github.com/defcron/saladfinder>; GitHub resolves the previous `defcron/daywork` repository address to it.
- Existing Worker/D1 names, cookies, Stripe metadata and waitlist-removal storage key were retained. No production records or secrets were migrated or exported.
- The longer wordmark exposed header overflow at intermediate widths. Only header breakpoints were adjusted: compact desktop through 1350px, disclosure navigation through 960px. A focused header fixture passed 68 combinations across 17 widths, authentication states and menu states.
- `npm run check`, `npm run coverage`, `npm run test:e2e`, generated binding-type validation, deployment dry run, changed-file formatting and whitespace checks passed. All 55 backend tests and 8 browser tests passed; coverage remained 88.87% statements, 80.47% branches, 91.75% functions and 90.46% lines.
- Direct Wrangler deployment succeeded with version `f0c49b85-e369-4d77-a74d-91c88b155d47`; startup measured 35 ms. The Worker still serves <https://daywork.defcronyke.workers.dev> in preview mode.
- Live Chromium acceptance at 1440px, 850px and 390px observed HTTP 200, SaladFinder title/wordmark, visible preview notice, working responsive menu, no horizontal overflow and no console/page errors. Desktop/mobile screenshots were visually inspected. `/api/health` returns `service: "saladfinder"`; live config still reports `authReady=false` and `paymentsReady=false`.
- The owner supplied `saladfinder.com`, registered at Netfirms. A free Cloudflare DNS zone was prepared and 14 discovered records imported, but its nameserver activation and Worker custom-domain attachment are pending. The existing Turnstile widget now allows the intended domain. See [domain connection](DOMAIN.md) for the exact state and remaining steps.

## Initial Daywork preview deployment

- App: https://daywork.defcronyke.workers.dev
- Worker: `daywork`; one dedicated D1 database, two migrations applied.
- Mode: **preview**. `authReady=false` and `paymentsReady=false` are intentional and observed.
- Initial code version: `36b47b1a-4815-4fe9-9bb1-28e65edac343`.
- Initial version after installing the Turnstile secret: `a6d0ad97-95eb-4a0e-a391-f74d4a4842a9`.
- Worker startup measured by deployment: 27 ms.
- Daily cleanup trigger: `17 4 * * *` UTC.
- No live jobs seeded. `/api/jobs` returns an empty real database; the visible examples are separate, labelled client-side illustrations.

Live HTTP acceptance observed: homepage 200 with CSP/nosniff; database health 200; config shows Ontario/CAD preview; public job list 200/empty; anonymous account is null; admin/payout routes reject anonymous requests; waitlist rejects a request missing its Turnstile token; sign-in reports unconfigured email service with 503. Private API responses use `Cache-Control: no-store`.

## Visual verification

Primary reference: [Daywork concept](design/daywork-concept.png), generated with the built-in image tool. [Design system and fidelity ledger](design/design-system.md) records the visual decisions and functional extensions.

Built-in browser use was unavailable: Work settings disabled local browser access and the Mac was locked. Playwright Chromium was used for browser testing and screenshots. The concept and latest rendered desktop/mobile screenshots were inspected with `view_image`. Desktop was checked at the concept's native 1487 × 1058 viewport and mobile at 390 × 844. Screenshot files are temporary QA output, excluded from the repository.

Inspected comparison points: headline/navigation/CTA copy; two-column filter/list structure; serif heading and sans-serif control hierarchy; ivory/forest/lime palette; divider-based listing rows and price alignment; spacing and borders; native vector mark/icons; mobile stacking and no horizontal overflow. The fieldset legend overlap, desktop sidebar/price-column alignment, header height and example milestone count were repaired. Above-the-fold copy matches the concept; a functional payout-explanation link and responsive navigation are intentional extensions. No known material clipping or layout defect remains in the checked views.

## Remaining acceptance

- No successful Stripe Accounts v2 recipient creation, hosted onboarding, destination charge, application fee, test charge/refund, Connect approval, live charge or bank payout. The actual temporary sandbox probe established only the limited platform operations recorded above.
- The application's actual email function has passed native-binding delivery through an isolated fixed-recipient Worker. Production sign-in form submission, first-use/reuse token acceptance and authenticated posting/applying remain pending; they were not exercised by that delivery check. Local regression/browser tests and the 41 staging HTTP assertions cover those application flows separately.
- No business registration, name/trademark clearance, approved legal/tax/insurance decision, CRA reporting implementation, staffed support contact, or final transaction policies.
- The apex has verified HTTPS forwarding to the active canonical `www` hostname. The latest application release is deployed as recorded above.
- No Cloudflare deployment token installed in GitHub. The app was deployed through the owner's existing local Wrangler authorization; the included manual GitHub deploy workflow requires a separate scoped token.
- No full browser matrix, screen-reader audit, sustained load test, penetration test, independent bank-receipt evidence, automated dispute-evidence submission, or external on-call alerting service.
- No revenue, user demand or profitability has been demonstrated.

Complete the paid-launch requirements in [LAUNCH.md](LAUNCH.md) before enabling paid bookings. Source publication, a working preview and a listings pilot do not establish payment-provider approval, bank arrival or a commercially operating marketplace.
