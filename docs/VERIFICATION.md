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

## Cloudflare deployment

- App: https://daywork.defcronyke.workers.dev
- Worker: `daywork`; one dedicated D1 database, two migrations applied.
- Mode: **preview**. `authReady=false` and `paymentsReady=false` are intentional and observed.
- Initial code version: `36b47b1a-4815-4fe9-9bb1-28e65edac343`.
- Active version after installing the Turnstile secret: `a6d0ad97-95eb-4a0e-a391-f74d4a4842a9`.
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
- No custom domain purchased or attached.
- No Cloudflare deployment token installed in GitHub. The app was deployed through the owner's existing local Wrangler authorization; the included manual GitHub deploy workflow requires a separate scoped token.
- No full browser matrix, screen-reader audit, sustained load test, penetration test, independent bank-receipt evidence, automated dispute-evidence submission, or external on-call alerting service.
- No revenue, user demand or profitability has been demonstrated.

Complete [LAUNCH.md](LAUNCH.md) before enabling paid bookings. Source publication and a working preview are concrete deliverables, not a claim that the regulated/provider-dependent business launch is complete.
