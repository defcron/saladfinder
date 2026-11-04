# SaladFinder domain connection

Status recorded on 2026-11-04: the owner selected SaladFinder and reported owning `saladfinder.com` at Netfirms. The app is deployed in preview at `https://daywork.defcronyke.workers.dev`. The domain still uses Netfirms nameservers and serves its default parking page; it is not yet the app's live address.

## Prepared in Cloudflare

- A Free Website DNS zone for `saladfinder.com`, currently pending activation.
- Assigned nameservers: `maciej.ns.cloudflare.com` and `rihana.ns.cloudflare.com`.
- All 14 records discovered by Cloudflare's DNS scan were imported with proxying disabled, including the existing MX/SPF records, mail hosts, parking-page address and `www` alias. This scan is not a complete export of Netfirms DNS and cannot establish that every custom record was found.
- The existing Turnstile widget is named SaladFinder preview and allows both `daywork.defcronyke.workers.dev` and `saladfinder.com` (including its subdomains). Its secret was retained.
- No paid plan or domain transfer was ordered. No Netfirms nameserver change has been made.

## Complete the connection

1. Confirm whether the domain has active email or other services. If it does, compare the full DNS list in Netfirms with Cloudflare, including any DKIM, DMARC, verification and custom subdomain records. Preserve mail records as DNS-only. The current parking-page A record and `www` alias will be replaced by the app's custom domains.
2. In Netfirms, change the domain's authoritative nameservers from `ns1.netfirms.com` / `ns2.netfirms.com` to the two Cloudflare nameservers above. Keep the domain registered at Netfirms. Verify any DNSSEC delegation before switching; do not leave a DS record pointing at the former DNS provider.
3. Wait until Cloudflare reports the zone as active. Attach `saladfinder.com` and, if desired, `www.saladfinder.com` as custom domains to the existing `daywork` Worker. Put those custom domains in `wrangler.jsonc` so later deploys preserve them.
4. Change production `APP_URL` to `https://saladfinder.com`. Implement and verify canonical routing from the old Workers address and `www` before advertising those aliases. The API currently checks the configured origin, so simply adding another hostname without this coordinated update is insufficient for form submissions.
5. Verify public DNS, HTTPS, the rendered app, `/api/health`, `/api/config`, Turnstile and consent-backed early access on the actual new hostname. Update README, GitHub homepage, deployment health check and the Stripe endpoint instructions to the verified canonical URL. Keep `LAUNCH_MODE=preview`.

Authenticated Netfirms access was unavailable during preparation: local browser access was disabled and the Mac was locked. Do not send registrar credentials through the public Servo service or commit them to this repository.
