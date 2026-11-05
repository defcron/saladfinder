> Superseded checkpoint: SaladFinder resumed and opened its paid pilot on 2026-11-05. See [LAUNCH.md](LAUNCH.md) and [VERIFICATION.md](VERIFICATION.md) for current status. The rest of this file is historical.

> Domain update (2026-11-04): the canonical site is now **https://saladfinder.com**; earlier www-canonical references below are historical. See [DOMAIN.md](DOMAIN.md).

# Project checkpoint — 2026-11-04

The operator resumed SaladFinder and explicitly authorized Cloudflare authoritative DNS for **saladfinder.com**. The earlier pause and Netfirms-nameserver restriction are historical. The canonical website and email configuration are deployed; the current release enables a real listing-and-application pilot while keeping hiring, work and money movement disabled.

## Deployed now

- Public MIT repository: <https://github.com/defcron/saladfinder>. Canonical app: <https://www.saladfinder.com>.
- The final listing-pilot production Worker release, including the administrator secret update, is `30875c46-fa9c-4da5-a3cf-eeca32254327`, with `APP_URL=https://www.saladfinder.com`, `LAUNCH_MODE=preview`, `LISTINGS_ENABLED=true` and the restricted Cloudflare email binding. Live configuration returned 200 with `listingsReady=true`, `authReady=true` and `paymentsReady=false`.
- The Pages gateway forwards to the `daywork` Worker. Old Workers/Pages page URLs redirect to `www` with 308, preserving path and query. Unknown deployment-hash hosts return 421.
- The apex now redirects in one 308 hop to `https://www.saladfinder.com`, preserving path and query. HTTP and HTTPS checks passed with normal TLS validation. Cloudflare's Let's Encrypt apex/wildcard certificate is active; its exact validation TXT records replaced the old Netfirms ACME CNAME. The original apex A address remains as a proxied fallback record. `kycaml` and Google ownership verification remain unchanged. See [domain status](DOMAIN.md).
- Cloudflare receiving and sending are configured. Actual outbound support mail and inbound forwarding passed delivery/authentication checks. The native app binding permits only `login@saladfinder.com`. The actual `sendSignInEmail` function was accepted by the native provider and its message was observed in the Workspace inbox through a temporary authenticated, fixed-recipient diagnostic Worker; that Worker was then deleted. The link was harmless, not a real credential. This verifies the native sending code and delivery, not a complete production account sign-in or token-reuse test. No production account was created by these acceptance checks. See [email operations](EMAIL.md).

## Deployed listing pilot

The production configuration is `LISTINGS_ENABLED=true` with `LAUNCH_MODE=preview`. It enables real posting, applications, application withdrawal, open-listing cancellation and reporting. Hiring, starting/submitting work, milestone approval, reviews and all payment/payout actions remain blocked. The interface explicitly says that posting and applications are open while hiring and payments are unavailable; applications do not authorize work to begin.

Frontend readiness changes preserve job drafts through sign-in, retain report drafts after failure, add job refresh and keyboard-accessible dashboard tabs, and distinguish real search results from examples. The payment UI defaults to Instant Payout when eligible, retains the standard-bank choice and a $0 worker payout fee, and recovers uncertain requests using the same server-checked operation. These payment controls are prepared for a future paid launch, not enabled by the listing pilot.

## Provider acceptance and remaining gates

A Stripe connection exists, but live paid launch remains blocked by owner verification and the remaining payment acceptance requirements. Private account requirement details are not published.

Sandbox CAD Checkout creation, idempotent replay, retrieval and expiry were accepted, as was webhook endpoint creation. The available restricted key returned 403 for Accounts v2 Connect setup. No successful Connect onboarding, actual webhook delivery, charge or payout acceptance is claimed from those checks.

Before paid launch, complete provider verification and end-to-end payment acceptance, operator details/policies, business registration, tax treatment and the other [launch requirements](LAUNCH.md). Keep `LAUNCH_MODE=preview`. Complete the production account sign-in and token-reuse acceptance separately; native code delivery and an enabled form do not prove that complete flow.

## Validation checkpoint

The new frontend readiness suite passed **10 desktop/mobile runs**, covering payout choice and recovery, draft/sign-in navigation, publishing, listing-pilot gates and report error recovery. Rendered payout checks at 1440×1050 and 390×844 showed no horizontal overflow, framework overlay, console errors or failed requests. Payout tests used explicit browser fixtures and do not establish provider acceptance.

The final local release checks passed: `npm run check` (typechecking, **151 tests** and the production build), coverage with **151 tests**, and all **18 desktop/mobile browser runs**. Coverage was **91.52% statements, 85.29% branches, 93.04% functions and 93% lines**. Pages gateway compilation and the production Wrangler dry run also passed. Deployment and public read-only acceptance have now passed; native email function provider/inbox acceptance has also passed, while the complete production account sign-in cycle remains unverified. See the [verification record](VERIFICATION.md) for detailed results.

Read-only live checks on `www.saladfinder.com` passed at 1440×1050 and 390×844. The landing page showed zero actual jobs, the separate example remained explicitly nonbookable, and the posting page linked to `/sign-in?next=%2Fpost`. Labels rendered correctly with no horizontal overflow, framework overlay, console errors or failed requests. Email fields stayed empty, terms stayed unchecked, and no account, consent, CAPTCHA interaction or other application write was submitted. These checks do not establish authenticated production posting or application submission.
