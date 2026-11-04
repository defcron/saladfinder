# Transactional email and domain authentication

SaladFinder supports Cloudflare Email Sending and Resend. The checked-in configuration deliberately sets `EMAIL_PROVIDER=disabled` until domain ownership, provider onboarding and real delivery are verified. The native Cloudflare integration needs no API key in the Worker. Provider acceptance is not evidence of inbox delivery.

## Activate Cloudflare sending

1. Activate `saladfinder.com` on Cloudflare DNS using the [domain runbook](DOMAIN.md). Cloudflare currently rejects sending-domain onboarding while the zone is pending.
2. Run `npx wrangler email sending enable mail.saladfinder.com`. Let Cloudflare create its real bounce MX/SPF, DKIM selector/key and sending-domain DMARC records; do not copy an illustrative or preview key. Check `npx wrangler email sending dns get mail.saladfinder.com` and the domain's sending status.
3. Remove the obsolete Netfirms A record at `mail.saladfinder.com` when replacing that service. The new hostname is a sending identity, not a self-hosted SMTP/IMAP server.
4. Add the production binding to `wrangler.jsonc`:

   ```jsonc
   "send_email": [
     {
       "name": "EMAIL",
       "allowed_sender_addresses": ["sign-in@mail.saladfinder.com"]
     }
   ]
   ```

   Set production `EMAIL_PROVIDER=cloudflare` and `EMAIL_FROM="SaladFinder <sign-in@mail.saladfinder.com>"` only after onboarding succeeds. Keep staging and local mail isolated; do not set `remote: true` in the checked-in configuration.

5. Set the verified support address and configure Turnstile for the final app hostname. Regenerate binding types and run the required checks before deployment.
6. Test delivery to a controlled, confirmed mailbox. Inspect the received message's authentication results for aligned DKIM/SPF and DMARC, confirm the fragment-based sign-in link is single-use, and verify account readiness at the real hostname. Never put a sign-in token, provider secret, complete email header dump or personal destination address in the public repository.

A failed send invalidates its token and returns a generic error. The app never silently tries another provider after an uncertain delivery result. Keep Cloudflare's suppressed-recipient dropping disabled for authentication email, so a suppressed send raises an error instead of silently disappearing.

## Incoming business mail

Use Cloudflare Email Routing for explicit addresses such as `support@saladfinder.com`, `privacy@saladfinder.com`, `postmaster@saladfinder.com` and `abuse@saladfinder.com`, forwarding to the operator-approved existing inbox. Verify that exact destination first. Keep catch-all disabled unless the operator intentionally chooses it.

Replace the old root MX/SPF records only when activating the new routing configuration. Cloudflare supplies the exact root MX, SPF and forwarding DKIM records. These differ from the records under `cf-bounce.mail.saladfinder.com` used for outgoing transactions. There must be only one SPF policy at each hostname.

Forwarding does not create an IMAP mailbox or automatically authorize replying from a SaladFinder address in Gmail. Those are separate mailbox/client settings. Do not create fake `smtp` or `imap` DNS aliases to a service whose certificate and authentication do not support them.

## DMARC, ARC and TLS

DMARC reporting has been enabled in the pending Cloudflare zone. Its initial root policy is `p=none`, with Cloudflare's assigned aggregate-report destination. After confirming every legitimate sender and aligned delivery, move the root policy to quarantine and then reject; preserve provider-managed sending-domain policies. Monitoring is not an anti-spoofing enforcement policy.

ARC is signed authentication history carried in email headers by forwarding infrastructure. Cloudflare documents ARC support. Do not invent an `_arc` policy record; check the actual forwarded message's ARC results. DKIM keys must correspond to the signing service's private keys.

Cloudflare manages certificates for the Worker custom domains. Hosted email uses its provider's SMTP TLS endpoint and certificates; a web-edge wildcard certificate does not secure SMTP/IMAP. No Certbot installation or local private-key generation is needed for this architecture. Any future MTA-STS/TLS reporting configuration must match the final receiving MX service and a working HTTPS policy endpoint.

## Resend alternative

Set `EMAIL_PROVIDER=resend`, configure a verified `EMAIL_FROM`, and install `RESEND_API_KEY` through Wrangler's secure secret prompt. An omitted provider preserves older Resend configurations; an explicit disabled, blank or unknown provider fails closed. Do not enable both as automatic fallback transports.

## Cost and references

As checked on 2026-11-04, Workers Paid includes 3,000 outbound emails per account per month, then US$0.35 per 1,000. Incoming routing is unlimited; Email Workers execution has its own Workers usage costs. Email Sending is beta and restricted to transactional messages, so do not use it for waitlist campaigns.

- [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
- [Sending-domain setup](https://developers.cloudflare.com/email-service/get-started/send-emails/)
- [Worker sending API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)
- [Email authentication](https://developers.cloudflare.com/email-service/concepts/email-authentication/)
- [Destination verification](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/)
- [Postmaster and ARC](https://developers.cloudflare.com/email-service/reference/postmaster/)
- [Worker Custom Domain certificates](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
