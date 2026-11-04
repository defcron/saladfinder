# Operator-requested pause — 2026-11-04

The operator explicitly paused SaladFinder to investigate a separate open-source email project. Do not continue domain activation, email setup, business registration or commercial launch until the operator resumes this project.

## Saved state

- Public MIT repository: <https://github.com/defcron/saladfinder>.
- Canonical app remains <https://daywork.defcronyke.workers.dev>, with `LAUNCH_MODE=preview`, `EMAIL_PROVIDER=disabled`, and no live Stripe setup.
- The preparatory Worker deployment is `3ddbd964-5767-436c-8c7d-e78c5ad298f9`. It adds an assets fallback and dormant canonical routing; `APP_URL` has not changed. Its health check passed.
- The Pages project `saladfinder` is deployed at <https://saladfinder.pages.dev>, forwarding through a service binding to the existing `daywork` Worker. Deployment `739c172f` passed HTTP homepage/health checks. Deployment-hash hostnames return 421 intentionally. Its canonical redirect remains dormant until the parent Worker's `APP_URL` is changed.
- Registrar nameservers are **ns1.netfirms.com and ns2.netfirms.com**. Keeping registrar nameservers is an operator requirement. The earlier brief delegation change was reversed and verified at the registry and public resolvers.
- At Netfirms, the obsolete `www` A record was removed and its CNAME changed to `saladfinder.pages.dev`. Both Netfirms nameservers returned the new CNAME. Some recursive caches still returned the previous alias during verification.
- At the pause, the Pages custom domain `www.saladfinder.com` had active hostname verification but pending certificate validation. This provider process may complete independently. The canonical app URL and apex redirect have NOT been activated. Do not advertise `www` as fully accepted: same-origin form behavior requires the coordinated canonical update.
- The apex still points to `66.96.160.136`. Netfirms serves a valid Let's Encrypt certificate covering the apex and `*.saladfinder.com`, expiring 2026-12-15. Its URL Standard redirect form was inspected but no redirect was saved.
- `kycaml` remains `CNAME ghs.googlehosted.com`. The existing Google ownership-verification CNAME is preserved. The legacy Google endpoint's expired certificate and HTTP 503 predated this work.
- The undelegated Cloudflare zone is temporarily retained for resolvers that cached the brief delegation. Its apex matches Netfirms and its temporary `www` copy was synchronized to the new Netfirms CNAME. This copy is not the authoritative DNS source. Do not delete it during the delegation-cache grace period.
- Netfirms reports its email service suspended and no mailboxes. Authoritative MX/SPF records are unchanged. The operator-approved forwarding destination was received and verified through the existing Workspace inbox; its private address and verification token are deliberately omitted. No Cloudflare forwarding rules or sending domain were activated.
- The email-provider question is superseded by this pause. No Google Workspace domain/alias changes were made.

## Validation completed before pause

`npm run check`, `npm run coverage`, and `npm run test:e2e` passed: **123 automated tests and 8 desktop/mobile browser tests**. Combined coverage was **89.75% statements, 82.29% branches, 92.30% functions, and 91.31% lines**; the new gateway and canonical-routing modules reported 100% coverage. Binding-type validation, formatting, whitespace validation, Worker dry run, and Pages Functions compilation passed.

The gateway preserves original requests, bodies, cookies, signatures, headers, and responses. Unknown/preview hash hosts fail before reaching the application; missing service bindings fail closed. These checks do not establish working custom-domain TLS, real email delivery, Stripe provider acceptance or commercial launch.

On resumption, first re-check the live custom-domain/certificate state and Netfirms delegation. Re-check Pages after the stale Cloudflare zone transitions away: current HTTP validation does not prove future certificate renewal independence from its old zone association. Then complete the canonical URL, apex forwarding, email-provider choice, provider tests and launch runbook in order. Never change registrar nameservers as an implementation shortcut.
