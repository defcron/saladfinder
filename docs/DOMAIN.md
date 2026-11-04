# SaladFinder domain connection

Status recorded on 2026-11-04: the owner selected SaladFinder and reported owning `saladfinder.com` at Netfirms. The app is deployed in preview at `https://daywork.defcronyke.workers.dev`. The domain still uses Netfirms nameservers and serves its default parking page; it is not yet the app's live address.

## Prepared in Cloudflare

- A Free Website DNS zone for `saladfinder.com`, currently pending activation.
- Assigned nameservers: `maciej.ns.cloudflare.com` and `rihana.ns.cloudflare.com`.
- All 14 records discovered by Cloudflare's DNS scan were imported with proxying disabled, including the existing MX/SPF records, mail hosts, parking-page address and `www` alias. This scan is not a complete export of Netfirms DNS and cannot establish that every custom record was found.
- The existing Turnstile widget is named SaladFinder preview and allows both `daywork.defcronyke.workers.dev` and `saladfinder.com` (including its subdomains). Its secret was retained.
- No paid plan or domain transfer was ordered. No Netfirms nameserver change has been made.
- Preserved `kycaml.saladfinder.com CNAME ghs.googlehosted.com`, DNS-only, TTL 3600. Both authoritative Netfirms nameservers returned this record; the initial DNS scan missed it. The user confirmed this is the legacy hostname.
- Universal SSL is enabled. The pending zone now uses Full (strict), minimum TLS 1.2, TLS 1.3 enabled, and Always Use HTTPS. No certificate has been issued for the new app domain yet.
- DMARC reporting is enabled with the provider-assigned aggregate-report address and an initial `p=none` monitoring policy. Sending-domain onboarding is blocked until the zone becomes active. See [email setup](EMAIL.md).

## Complete the connection

1. Preserve the legacy `kycaml` CNAME and compare the full DNS list in Netfirms with Cloudflare before switching. The operator authorized replacing Netfirms defaults. Replace the parking-page A record and `www` alias with the app's custom domains, and replace old mail records only when the new routing/sending services are configured. A forwarding destination has been submitted for provider verification; the private destination is intentionally not stored in this public repository.
2. In Netfirms, change the domain's authoritative nameservers from `ns1.netfirms.com` / `ns2.netfirms.com` to the two Cloudflare nameservers above. Keep the domain registered at Netfirms. Verify any DNSSEC delegation before switching; do not leave a DS record pointing at the former DNS provider.
3. Wait until Cloudflare reports the zone as active. Attach `saladfinder.com` and, if desired, `www.saladfinder.com` as custom domains to the existing `daywork` Worker. Put those custom domains in `wrangler.jsonc` so later deploys preserve them.
4. Change production `APP_URL` to `https://saladfinder.com`. Implement and verify canonical routing from the old Workers address and `www` before advertising those aliases. The API currently checks the configured origin, so simply adding another hostname without this coordinated update is insufficient for form submissions.
5. Verify public DNS, HTTPS, the rendered app, `/api/health`, `/api/config`, Turnstile and consent-backed early access on the actual new hostname. Update README, GitHub homepage, deployment health check and the Stripe endpoint instructions to the verified canonical URL. Keep `LAUNCH_MODE=preview`.

Registrar activation is still pending: after the operator unlocked native browser access, the saved Netfirms login was rejected. A working authenticated registrar session is required. Do not send registrar credentials through the public Servo service or commit them to this repository.

The preserved legacy `kycaml` host already has an expired Google Trust Services certificate (expired 2024-10-02) and returns HTTP 503 from Google Frontend. Its DNS route was preserved; this pre-existing service failure requires access to its Google-hosted deployment. The separate GitHub Pages demo has HTTPS enforcement enabled and no custom domain. Do not repoint the legacy hostname to that demo without a separate migration decision.
