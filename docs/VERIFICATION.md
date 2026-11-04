# Verification record

Verified on **2026-11-04**. This record distinguishes local regression tests, deployed preview checks, and provider acceptance that has not yet occurred.

## Implemented and locally verified

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

## Not yet verified or enabled

- No actual Stripe sandbox account, hosted onboarding, test charge/refund, Connect approval, live charge or bank payout. Provider fixtures cannot establish these.
- No live transactional sign-in email delivery. No sending domain was configured in the connected Cloudflare account; the current integration has a documented verified-email provider setup path.
- No business registration, name/trademark clearance, approved legal/tax/insurance decision, CRA reporting implementation, staffed support contact, or final transaction policies.
- The owner already owns `saladfinder.com`; its Cloudflare DNS zone is prepared, but no custom domain is attached to the Worker yet.
- No Cloudflare deployment token installed in GitHub. The app was deployed through the owner's existing local Wrangler authorization; the included manual GitHub deploy workflow requires a separate scoped token.
- No full browser matrix, screen-reader audit, sustained load test, penetration test, independent bank-receipt evidence, automated dispute-evidence submission, or external on-call alerting service.
- No revenue, user demand or profitability has been demonstrated.

Complete [LAUNCH.md](LAUNCH.md) before enabling paid bookings. Source publication and a working preview are concrete deliverables, not a claim that the regulated/provider-dependent business launch is complete.
