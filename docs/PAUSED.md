# Project resumption checkpoint — 2026-11-04

The operator's earlier pause has been superseded by explicit authorization to resume SaladFinder's DNS and email setup. For **saladfinder.com only**, the operator approved replacing Netfirms nameservers with Cloudflare's. The earlier requirement to retain Netfirms authoritative DNS no longer applies to this domain. The canonical website and email configuration are now deployed; app-generated sign-in delivery acceptance and the paid-launch requirements remain outstanding.

## Current application checkpoint

- Public MIT repository: <https://github.com/defcron/saladfinder>.
- The canonical app is now <https://www.saladfinder.com>, with `LAUNCH_MODE=preview` and no live Stripe setup. Production Worker version `7d17b829-58d1-4abe-8a3b-b481c5511230` is deployed with `APP_URL=https://www.saladfinder.com` and Cloudflare email enabled.
- The original Workers and Pages hostnames redirect eligible page requests to `www` with HTTP 308, preserving the path and query. Both old-host `/pricing?source=dns-check` checks returned the expected canonical destination.
- The Pages project `saladfinder` is deployed at <https://saladfinder.pages.dev>, forwarding through a service binding to the existing `daywork` Worker. Deployment `739c172f` passed live desktop/mobile checks. Deployment-hash hostnames return 421 intentionally. Canonical routing is now active in the parent Worker.
- The Pages custom domain **www.saladfinder.com** and its Google-issued certificate are active. Live `/api/health`, `/api/config` and `/sign-in` requests returned 200. Configuration reports `authReady=true`, `paymentsReady=false`, Ontario/CAD and `support@saladfinder.com`.
- Production uses `EMAIL_PROVIDER=cloudflare`, `EMAIL_FROM=SaladFinder <login@saladfinder.com>`, `SUPPORT_EMAIL=support@saladfinder.com`, and a native `EMAIL` binding restricted to `login@saladfinder.com`. Canonical activation and email shipped together so `www` submissions use the expected origin. An empty sign-in request with the canonical origin reached input validation (400); the same route rejected a hostile origin (403). Neither probe created an account or submitted consent. Local and staging mail remain disabled.
- No production account has been created for login acceptance. An actual app-generated email and its first-use/reuse behavior remain to be tested against production; local automated tests cover the token behavior.

## Current DNS and email checkpoint

- Netfirms remains the registrar. The registry delegation and both Cloudflare authoritative nameservers confirm **maciej.ns.cloudflare.com** and **rihana.ns.cloudflare.com**. The Cloudflare zone is active and authoritative. The earlier brief switch and reversal are historical events, not the current delegation.
- Public resolver caches are mixed. The final check returned Cloudflare nameservers from Google, Cloudflare 1.1.1.1 and Quad9; Google and 1.1.1.1 returned Cloudflare MX records, while Quad9 still returned the old MX. Earlier checks also saw cached Netfirms NS/SPF answers. Do not assume global propagation is complete.
- The apex A record remains `66.96.160.136`; `www` is a CNAME to `saladfinder.pages.dev`. The existing `ftp` A record, ACME delegation, `kycaml CNAME ghs.googlehosted.com`, and Google verification CNAME are preserved. The apex has not become the app or a newly configured redirect.
- Obsolete suspended-Netfirms service A records for `email`, `imap`, `mail`, both `mx` addresses, `pop`, `smtp`, and `webmail` were removed. No replacement IMAP or SMTP hostname was invented.
- The Pages certificate for `www` is active. A separate Cloudflare Universal SSL Let's Encrypt root/wildcard certificate remains pending validation with the existing Netfirms ACME delegation preserved; do not describe that certificate as active.
- Cloudflare Email Routing is enabled, ready and synchronized. Explicit aliases `support`, `hello`, `privacy`, `security`, `postmaster`, `abuse`, and `login` forward to the operator-approved, verified Workspace plus-address. Catch-all routing is disabled. The private destination is omitted from this repository.
- Root receiving MX, the single root SPF policy `v=spf1 include:_spf.mx.cloudflare.net ~all`, and routing DKIM `cf2024-1` are installed. The sending domain is ready, with its generated `cf-bounce` MX/SPF and sending DKIM records. The existing DMARC `p=none` monitoring policy with Cloudflare reports is preserved.
- Two operator-controlled setup messages established delivery: an outbound message from `support@saladfinder.com` arrived in Workspace with SPF, DKIM and DMARC passing; a separate Gmail message to `support@saladfinder.com` reached the approved forwarding destination in approximately seven seconds with Google ARC and Cloudflare/routing DKIM passing. Private addresses, message IDs and full headers are not published.
- Those tests establish the configured provider's sending and forwarding paths. They do not yet establish an app-generated message from `login@saladfinder.com` or successful single-use app authentication. No IMAP mailbox or Gmail “Send mail as” configuration was created.
- Provider activity-log message previews are disabled (`preview_enabled=false`) to prevent previewing sent authentication message bodies and links there. This setting is separate from the app's `LAUNCH_MODE=preview`.

## Validation already completed

For this release, `npm run check`, `npm run coverage`, and `npm run test:e2e` passed: **123 automated tests and 8 desktop/mobile browser tests**. Binding types were regenerated, and typechecking and the Worker dry run passed after the canonical URL change. The recorded coverage baseline was **89.75% statements, 82.29% branches, 92.30% functions, and 91.31% lines**, with the gateway and canonical-routing modules at 100%. Earlier Pages Functions compilation and live gateway checks also passed; they are separate from the current email deployment acceptance.

Read-only live gateway acceptance at 1440-pixel desktop and 390-pixel mobile widths covered the homepage, deep job links, pricing, disabled sign-in, category filtering and mobile navigation. Assets and security headers loaded correctly, with no horizontal overflow, browser console errors or failed requests. Public health/configuration and unauthenticated API protection behaved as expected. No production forms, messages, mail or payment requests were submitted during these checks. The original Worker sign-in page remained disabled at that checkpoint.

## Remaining work

Complete production app-generated sign-in acceptance: verify the received message, authentication alignment, intended canonical link, successful first use and rejection of token reuse. Canonical deployment, redirects and API-origin probes have passed; they do not replace that end-to-end login test. Decide and verify the apex's HTTPS behavior separately. Preserve the legacy Google service route. Stripe setup and provider acceptance, reviewed operator details and policies, business registration, tax treatment and the other [paid-launch requirements](LAUNCH.md) remain outstanding. Keep `LAUNCH_MODE=preview`.

See [domain status](DOMAIN.md) and [email operations](EMAIL.md) for the current setup and its limits.
