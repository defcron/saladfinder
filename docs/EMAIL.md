# Transactional email and domain authentication

Status recorded on 2026-11-04: **incoming business-mail routing and outgoing transactional sending are not enabled**. The app supports Cloudflare Email Sending and Resend, but every checked-in environment deliberately uses `EMAIL_PROVIDER=disabled`. The app remains in preview at `https://daywork.defcronyke.workers.dev`.

## Verified destination and unchanged mail service

The operator-approved forwarding destination was verified using the actual verification message received in the Workspace inbox. The exact chosen plus-address, including its two plus signs, worked. Its private address and verification link are intentionally omitted from this public repository.

Destination verification proves control of that inbox; it does not enable incoming routing, configure a sending domain, or prove delivery from a SaladFinder address. Authoritative root MX and SPF records at Netfirms remain unchanged. No new support/privacy forwarding rules, catch-all route, or production sending identity are active.

The brief nameserver switch was reversed. Netfirms remains authoritative; the Cloudflare zone activated during the brief switch but is now undelegated. Keep its restored DNS records available while cached delegations expire, as recorded in the [domain status](DOMAIN.md). Staged Cloudflare settings are not evidence of an active authoritative mail configuration.

## Provider choice under the Netfirms requirement

Cloudflare's current instructions require Cloudflare DNS for both Email Sending and Email Routing. Standard Cloudflare email onboarding is therefore **not the current activation path while Netfirms must remain authoritative**. An active-looking Cloudflare dashboard zone alone does not satisfy that requirement. Do not switch nameservers to enable mail without an explicit change in scope. [Cloudflare sending prerequisites](https://developers.cloudflare.com/email-service/get-started/send-emails/), [Cloudflare routing prerequisites](https://developers.cloudflare.com/email-service/get-started/route-emails/)

The next mail setup needs a provider that supports records managed at an external DNS host. The existing Resend integration is one candidate for transactional sending: its documented setup supplies DKIM and SPF records to add at the existing DNS provider. It has not been activated for SaladFinder. Incoming forwarding or mailbox hosting must also be selected and verified separately. [Resend domain verification](https://resend.com/docs/add-a-domain)

Only after selecting the provider should its exact generated DNS records be installed at Netfirms. Preserve the existing MX/SPF records until a coordinated receiving-service replacement is ready. Use one SPF policy per hostname, and keep sending-domain authentication distinct from root-domain receiving records. Do not remove the existing `mail` host or invent SMTP/IMAP aliases before the replacement service is established.

## Implemented sending integration

- `EMAIL_PROVIDER=resend` requires a verified `EMAIL_FROM` and `RESEND_API_KEY` installed through Wrangler's secure secret prompt.
- `EMAIL_PROVIDER=cloudflare` uses the native `EMAIL` binding and requires a properly onboarded sending domain. This path remains implemented but inactive under the current DNS requirement.
- An omitted provider preserves older Resend configurations. An explicitly disabled, blank or unknown provider fails closed.
- A failed send invalidates its sign-in token and returns a generic error. The app never silently tries a second provider after an uncertain delivery result.
- Provider acceptance is not evidence of inbox delivery. Before enabling production sign-in, inspect a real received message's aligned authentication results and verify that its fragment-based sign-in link works once and then expires or rejects reuse.

Keep the forwarding destination, provider secrets, sign-in tokens, complete email header dumps and verification links out of the public repository. Keep local and staging mail isolated. Do not enable remote development sending in checked-in configuration.

## Authentication and TLS status

DMARC reporting was staged in the Cloudflare zone with an initial `p=none` monitoring policy. Because that zone is now undelegated, do not describe its staged records as the domain's authoritative policy. Any final DMARC changes must be coordinated with the selected sender and published at Netfirms. Move to enforcement only after legitimate sending paths and alignment are verified.

ARC is authentication history carried in message headers by forwarding infrastructure, not an invented `_arc` DNS policy. Check the selected forwarder's actual results. DKIM DNS keys must match that service's signing keys. [Email authentication](https://developers.cloudflare.com/email-service/concepts/email-authentication/), [Cloudflare postmaster and ARC reference](https://developers.cloudflare.com/email-service/reference/postmaster/)

Web HTTPS certificates do not secure SMTP or IMAP. The eventual email provider must supply the correct mail endpoints, authentication and TLS certificates. Forwarding alone does not create an IMAP mailbox or authorize replying from a SaladFinder address in Gmail. MTA-STS or TLS-reporting settings must wait for the receiving service and working policy endpoint to be established.

## References

- [Domain and rollback status](DOMAIN.md)
- [Cloudflare Worker sending API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)
- [Cloudflare destination verification](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/)
- [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
- [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction)
