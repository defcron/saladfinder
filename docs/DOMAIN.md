# SaladFinder domain connection

**Project paused by the operator.** The later deployment and DNS checkpoint in [PAUSED.md](PAUSED.md) supersedes the preparation status below; do not resume setup without the operator's instruction.

Status recorded on 2026-11-04: the owner requires **Netfirms to remain the authoritative DNS provider** for `saladfinder.com`. The production app remains in preview at `https://daywork.defcronyke.workers.dev`; its canonical `APP_URL` has not changed to the custom domain.

## Current authoritative DNS and reversal

A brief change to Cloudflare nameservers was reversed. The registry delegation and subsequent checks through Google Public DNS, Cloudflare DNS and Quad9 returned the original nameservers:

- `ns1.netfirms.com`
- `ns2.netfirms.com`

The original apex A record is `66.96.160.136`. The existing `kycaml.saladfinder.com CNAME ghs.googlehosted.com` remains in place with TTL 3600. The original root and `www` records, existing Google verification CNAME, and mail records were preserved or restored. Authoritative MX and SPF records have not been replaced for a new email service.

Registrar access is no longer the blocker. The remaining work must support external DNS at Netfirms. Do not change the nameservers again without an explicit change to that requirement.

## Cloudflare state retained during cache expiry

- The Free Website DNS zone activated during the brief delegation change. It is now **undelegated**, even if its dashboard status still says active. Its assigned nameservers are `maciej.ns.cloudflare.com` and `rihana.ns.cloudflare.com`.
- Both newly attached Worker Custom Domains, `saladfinder.com` and `www.saladfinder.com`, were detached. They are not the app's active production endpoints.
- The Cloudflare copy of the root and `www` DNS records was restored to the original records for resolvers that still cache the temporary Cloudflare delegation. The legacy `kycaml` CNAME and existing Google verification record are retained there too.
- **Do not delete the staged Cloudflare zone while cached delegations expire.** Dashboard activation does not prove that Cloudflare currently controls the authoritative public DNS.
- The initial Cloudflare scan imported 14 records, but it missed `kycaml`. Treat the scan as a partial discovery aid rather than a complete DNS backup.
- The existing Turnstile widget is named SaladFinder preview and allows the Workers hostname and `saladfinder.com`, including its subdomains. Its secret was retained.
- No paid plan or domain transfer was ordered. Incoming Cloudflare mail routing and outgoing sending are not enabled. See [email status](EMAIL.md).

## Proposed connection while keeping Netfirms DNS

The next proposed route is a **Cloudflare Pages gateway on `www.saladfinder.com`**, connected using an explicit CNAME at Netfirms. Cloudflare documents support for Pages subdomains with an external DNS provider: associate the custom domain with the Pages project first, then point the subdomain to that project's actual `pages.dev` hostname. This route still needs implementation and end-to-end verification; no Pages gateway activation is claimed here. [Cloudflare Pages custom-domain requirements](https://developers.cloudflare.com/pages/configuration/custom-domains/)

An apex Pages domain uses different requirements: Cloudflare documents that it requires Cloudflare nameservers. Under the current Netfirms requirement, **an HTTPS redirect from `saladfinder.com` to `www.saladfinder.com` still needs verification with Netfirms**. Do not assume an ordinary DNS record performs an HTTP redirect or that registrar forwarding includes a valid apex HTTPS certificate. [Cloudflare Pages apex and subdomain requirements](https://developers.cloudflare.com/pages/configuration/custom-domains/)

Before changing the app's canonical URL, verify the actual gateway, HTTPS, same-origin API requests, origin protection, Turnstile, sign-in links, and consent-backed early access on the intended hostname. Update the canonical URL and related deployment/Stripe instructions only as part of that verified migration. Keep `LAUNCH_MODE=preview`.

## Preserved legacy service

The `kycaml` hostname points to Google hosting, not GitHub Pages. The [public project README](https://github.com/defcronyke/kycaml-app/blob/master/README.md#L21) identifies it as an online mirror and lists a separate GitHub Pages demo. The Pages configuration has HTTPS enforcement enabled and no custom domain.

Direct checks found a pre-existing expired Google Trust Services certificate on `kycaml.saladfinder.com` (expired 2024-10-02) and HTTP 503 from Google Frontend. Preserving the CNAME preserves its route; repairing the service requires access to its Google-hosted deployment. Keep this hostname outside the new app's routing and do not repoint it to the demo without a separate migration decision.
