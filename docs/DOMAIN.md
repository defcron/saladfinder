# SaladFinder domain connection

Status recorded on 2026-11-04: the operator explicitly authorized Cloudflare authoritative DNS for **saladfinder.com**, superseding the earlier Netfirms-nameserver requirement for this domain. Netfirms remains the registrar. The production app is in preview at **https://www.saladfinder.com**, with the canonical `APP_URL` now set to that origin. The [resumption checkpoint](PAUSED.md) records the deployed version and remaining app-generated login acceptance.

## Current authoritative DNS

The registrar nameservers, registry delegation and both Cloudflare authoritative nameservers confirm:

- `maciej.ns.cloudflare.com`
- `rihana.ns.cloudflare.com`

The Cloudflare zone is active and authoritative. An earlier brief switch was reversed before the operator later approved this migration; that reversal is no longer the current DNS state. Recursive resolver caches remain mixed. The final check returned Cloudflare nameservers from Google, Cloudflare 1.1.1.1 and Quad9; Google and 1.1.1.1 returned Cloudflare MX records, while Quad9 still returned the old MX. Earlier checks also saw cached Netfirms NS/SPF answers. These observations do not establish uniform global propagation.

Current records preserve the following services:

| Host or purpose               | Current state                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| Apex `saladfinder.com`        | Original A record `66.96.160.136`; not the app and no new apex redirect configured |
| `www`                         | CNAME `saladfinder.pages.dev`; Pages custom domain active                          |
| `kycaml`                      | CNAME `ghs.googlehosted.com`, TTL 3600; existing Google service route preserved    |
| Google ownership verification | Existing CNAME preserved                                                           |
| `ftp`                         | Existing A record preserved                                                        |
| ACME certificate delegation   | Existing Netfirms delegation preserved                                             |
| Email                         | Cloudflare receiving and sending records installed; see [email status](EMAIL.md)   |

Obsolete A records for the suspended Netfirms email service were removed: `email`, `imap`, `mail`, both `mx` addresses, `pop`, `smtp`, and `webmail`. No substitute IMAP host was created. The original Cloudflare scan missed `kycaml`; that record was discovered and preserved separately, so the scan must not be treated as a complete backup.

## Website and certificate acceptance

The **saladfinder** Pages gateway is deployed at <https://saladfinder.pages.dev> and forwards requests through a service binding to the existing `daywork` Worker. The provider reports `www.saladfinder.com` and its Google-issued Pages certificate active, and an actual HTTPS GET returned 200 without bypassing certificate checks. The gateway's allowed public hosts are `www.saladfinder.com` and `saladfinder.pages.dev`; deployment-hash and other unknown hosts return 421 before reaching the application.

The gateway passed read-only desktop/mobile checks for deep SPA routes, assets, security headers, filtering, navigation and API protection. Those gateway browser checks occurred before canonical activation. Production Worker version `7d17b829-58d1-4abe-8a3b-b481c5511230` now sets `APP_URL=https://www.saladfinder.com`. Live health/configuration and `/sign-in` return 200; configuration reports authentication ready and payments disabled. Both old Workers and Pages `/pricing?source=dns-check` requests return 308 to the same path and query on `www`.

An empty sign-in request from the canonical origin reached input validation (400), while a hostile origin was rejected (403). Neither probe created a production account. These checks establish canonical routing and API-origin behavior; an actual app-generated sign-in email and one-time token acceptance remain pending. HTTPS reachability and readiness flags alone do not prove a completed login, consent-backed form submission or payment return.

The apex still points to its original hosting address. A Netfirms certificate covering the apex and `*.saladfinder.com`, expiring 2026-12-15, was observed before the current delegation change; that earlier observation is not a new acceptance test of the apex's current behavior. The separate Cloudflare Universal SSL Let's Encrypt root/wildcard certificate is **pending validation**, with the existing Netfirms ACME delegation preserved. Its state is distinct from the active Pages certificate for `www`.

Both temporary Worker Custom Domains were detached during the earlier rollback. The gateway is reachable at `www` through Pages, not through those old attachments. No paid plan or domain transfer was ordered. Cloudflare documents the Pages project/domain association and DNS requirements separately from certificate issuance. [Cloudflare Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)

## Remaining acceptance and apex behavior

Keep `LAUNCH_MODE=preview`. The canonical URL and Cloudflare email binding shipped together because enabling forms on `www` with the old canonical origin would have caused legitimate submissions to fail origin protection. Existing routing preserves the API and webhook paths under their normal protections; page redirects are limited by the canonical-routing rules.

Complete the real app-generated sign-in acceptance on `www.saladfinder.com`, including the expected sender/link, authentication alignment and token reuse rejection. Consent-backed early-access submissions and payment provider acceptance must be verified in their appropriate workflows; the read-only gateway checks did not create production consent records or payments.

Treat apex HTTPS forwarding as a separate remaining change. The apex A record remains `66.96.160.136`, and a DNS record alone is not an HTTP redirect. The Turnstile widget allows the Workers hostname and `saladfinder.com`, including its subdomains; its existing secret was retained. This website and email release does not complete Stripe setup, legal review or a commercial launch.

## Preserved legacy service

The `kycaml` hostname points to Google hosting, not GitHub Pages. The [public project README](https://github.com/defcronyke/kycaml-app/blob/master/README.md#L21) identifies it as an online mirror and lists a separate GitHub Pages demo. The Pages configuration has HTTPS enforcement enabled and no custom domain.

Direct checks found a pre-existing expired Google Trust Services certificate on `kycaml.saladfinder.com` (expired 2024-10-02) and HTTP 503 from Google Frontend. Preserving the CNAME preserves its route; repairing the service requires access to its Google-hosted deployment. Keep this hostname outside the new app's routing and do not repoint it to the demo without a separate migration decision.
