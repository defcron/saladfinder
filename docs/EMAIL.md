# Transactional email and domain authentication

Status recorded on 2026-11-04: **Cloudflare forwarding and sending have passed actual delivery checks. The app's restricted native email binding is deployed, and its actual sending function has passed provider and inbox acceptance. The complete production account sign-in and token-reuse cycle remains unverified.** The canonical app is in preview at `https://www.saladfinder.com`.

The operator explicitly authorized Cloudflare nameservers for `saladfinder.com`, superseding the earlier requirement to retain Netfirms authoritative DNS for this domain. The registry and authoritative nameservers confirm the Cloudflare delegation; recursive caches are still mixed. This meets the authoritative DNS prerequisite for the selected Cloudflare email services. [Cloudflare sending prerequisites](https://developers.cloudflare.com/email-service/get-started/send-emails/), [Cloudflare routing prerequisites](https://developers.cloudflare.com/email-service/get-started/route-emails/)

## Receiving and forwarding

Cloudflare Email Routing is enabled, ready and synchronized. These explicit addresses forward to the operator-approved, verified Workspace destination:

- `support@saladfinder.com`
- `hello@saladfinder.com`
- `privacy@saladfinder.com`
- `security@saladfinder.com`
- `postmaster@saladfinder.com`
- `abuse@saladfinder.com`
- `login@saladfinder.com`, so replies to the app’s sign-in sender have a destination

Catch-all routing is disabled. The chosen private plus-address, including its two plus signs, was verified through an actual Workspace verification message. Its address and verification link are deliberately omitted from this public repository.

The three provider-managed receiving MX records, routing DKIM selector `cf2024-1`, and one root SPF policy are installed:

```text
v=spf1 include:_spf.mx.cloudflare.net ~all
```

This replaces the suspended Netfirms receiving service and its root SPF policy. Cloudflare and Google resolvers returned the new MX records; Quad9 still returned cached old MX/SPF records at the last check. NS responses also showed residual cache differences, as recorded in [domain status](DOMAIN.md). The obsolete Netfirms A records for `email`, `imap`, `mail`, both `mx` addresses, `pop`, `smtp`, and `webmail` were removed. The original root hosting address, `ftp`, the legacy Google service and Google verification records remain preserved. The old Netfirms ACME CNAME was separately replaced by Cloudflare’s exact certificate-validation TXT records; that website TLS change does not configure mail TLS.

## Sending domain and delivery evidence

The Cloudflare sending domain `saladfinder.com` reports ready. Its generated `cf-bounce` MX/SPF and sending DKIM records are installed. The existing root DMARC monitoring policy, `p=none` with Cloudflare reporting, is preserved. Receiving MX, bounce-domain SPF and sending DKIM serve different purposes; retain the provider-generated records and only one SPF policy per hostname.

Two initial setup messages between operator-controlled accounts established the forwarding and sending paths:

1. A message sent from `support@saladfinder.com` reached the Workspace inbox with **SPF, DKIM and DMARC passing**.
2. A separate Gmail message addressed to `support@saladfinder.com` reached the approved private forwarding destination in approximately **seven seconds**, with **Google ARC and Cloudflare/routing DKIM passing**.

These are observed delivery results, not a promise about future latency. They established provider sending and forwarding separately from the native application-code test below. Private message IDs, recipient addresses and full header dumps are not published. The account's observed sending allowance was 200 messages per day; no quota increase or purchase was made. Check the provider's current account allowance before launch. [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)

Provider activity-log message previews are disabled (`preview_enabled=false`) so sent authentication message bodies and sign-in links cannot be viewed through that preview feature. This setting is separate from the application's `LAUNCH_MODE=preview` and does not imply that all provider metadata or logs are disabled.

## Deployed app integration and native delivery acceptance

Production Worker version `30875c46-fa9c-4da5-a3cf-eeca32254327` retains the deployed settings:

```text
APP_URL=https://www.saladfinder.com
EMAIL_PROVIDER=cloudflare
EMAIL_FROM=SaladFinder <login@saladfinder.com>
SUPPORT_EMAIL=support@saladfinder.com
```

The deployed listing pilot adds `LISTINGS_ENABLED=true` while keeping `LAUNCH_MODE=preview`. Live configuration reports listings and authentication ready, with payments disabled. Enabling listings does not constitute email delivery acceptance.

The native `EMAIL` binding is restricted with `allowed_sender_addresses` containing only `login@saladfinder.com`. Canonical activation shipped with email so submissions from `www` use the expected origin. `LAUNCH_MODE` remains `preview`; local and staging mail remain disabled, and remote development sending is not enabled.

Live `/api/config` reports `authReady=true`, `paymentsReady=false` and the expected support address; `/api/health` and `/sign-in` return 200. An empty sign-in request from the canonical origin reached input validation (400), and a hostile origin was rejected (403). These probes did not create a production account or submit consent. A subsequent read-only Chrome check displayed the enabled email/name/role form, correct support link and successful Turnstile challenge, while leaving terms unchecked and submitting nothing. These observations establish configuration, rendering and origin behavior, not actual login delivery.

The actual `sendSignInEmail` function was then tested through a temporary authenticated diagnostic Worker with a fixed, authorized recipient and the native `EMAIL` binding. The provider accepted the message, and the exact test message was observed in the Workspace inbox. The temporary Worker was deleted after the check, with deletion confirmed through the provider API. Its link was harmless and did not contain a real sign-in credential; no production account was created.

This establishes native application-code delivery through the configured provider. It does not establish the complete `/auth/request` → inbox → `/auth/verify` account flow. Before recording that flow as accepted, verify a real requested message's sender, authentication alignment, canonical hostname, successful token use and rejection of reuse. Local automated tests cover token behavior, but they do not replace the complete production login test. The earlier support-message authentication results must not be assumed to be an inspection of the native test message's full headers.

Implemented behavior:

- `EMAIL_PROVIDER=cloudflare` uses the native `EMAIL` binding and an onboarded sending domain.
- `EMAIL_PROVIDER=resend` remains an alternative integration requiring a verified `EMAIL_FROM` and a securely installed `RESEND_API_KEY`; it is not the active provider chosen here.
- An omitted provider preserves older Resend configurations. An explicitly disabled, blank or unknown provider fails closed.
- A failed send invalidates its sign-in token and returns a generic error. The app never silently tries a second provider after an uncertain delivery result.

Keep the forwarding destination, provider secrets, sign-in tokens, full email headers and verification links out of the public repository. [Cloudflare Worker sending API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)

## Authentication and mailbox limits

DMARC is currently monitoring, not enforcement. Move to a stricter policy only after legitimate sending paths and alignment are verified. ARC is authentication history carried in message headers by forwarding infrastructure, not an `_arc` DNS policy to invent. DKIM keys must match the service actually signing the messages. [Email authentication](https://developers.cloudflare.com/email-service/concepts/email-authentication/), [Cloudflare postmaster and ARC reference](https://developers.cloudflare.com/email-service/reference/postmaster/)

Forwarding does not create an IMAP mailbox, and no Gmail “Send mail as” identity was configured. The current native Worker sending integration does not require a fabricated `smtp.saladfinder.com` hostname. Web HTTPS certificates do not secure SMTP or IMAP. MTA-STS or TLS-reporting policies still require a verified receiving-service policy and working policy endpoint before activation.

A direct TLS connection to the provider's `smtp.mx.cloudflare.net:465` endpoint passed normal CA and hostname verification, negotiating TLS 1.2 with a certificate expiring 2026-12-08. This verifies that provider endpoint's certificate; it does not mean SMTP credentials or a mail client were configured. A separate local connection attempt to `route2.mx.cloudflare.net:25` timed out, so it establishes neither successful inbound TLS nor a provider failure. Actual forwarding delivery was verified separately. No Certbot setup is required for the provider-managed endpoint.

## References

- [Domain status](DOMAIN.md)
- [Resumption and pending acceptance](PAUSED.md)
- [Cloudflare destination verification](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/)
- [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction)
