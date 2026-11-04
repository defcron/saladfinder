# Sites frontend deployment

SaladFinder's production frontend is hosted in ChatGPT Sites. The existing
Cloudflare Worker is the canonical-domain gateway and API backend:

```text
Browser -> https://saladfinder.com
  /api/* -> daywork Worker -> D1 / email / Stripe
  pages and assets -> daywork gateway -> public Sites static origin
```

The Sites project is `appgprj_6aebb054ec9081918311eca3ede0063e` and its origin is
https://saladfinder.defcron.chatgpt.site. It is public. Its frontend redirects
direct browser visits to https://saladfinder.com, where same-origin API calls,
session cookies, Turnstile, sign-in links, and payment callbacks continue working.
The domain does not need a DNS change or a Sites custom-domain binding for this
architecture. The existing www redirect and unrelated DNS records are preserved.

## Repository layout

- `main`: application source, backend, tests, and deployment instructions.
- `frontend-deploy`: independently rooted frontend artifact branch in the same
  `defcron/saladfinder` GitHub repository. Contains `dist`, MIT `LICENSE`, and
  `.openai/hosting.json`; no backend source or credentials.
- Sites also requires its own managed source repository. Publish the same
  artifact commit to that repository using the Sites source workflow. A GitHub
  push alone does not publish a Sites version.

## Publish an update

1. Build with `npm run build`, then run `node scripts/prepare-sites.mjs`.
   The prepared checkout is `.local/sites-frontend`. Existing hashed assets are
   retained for already-open browser tabs; periodically prune obsolete versions
   after an appropriate retention period.
2. Use the Sites skill with the existing project ID. Obtain a fresh source write
   credential when necessary. Pass it only through the source helper's hidden
   stdin; never save tokens in files or Git configuration.
3. In the prepared checkout, run the Sites `site-workflow.mjs` helper to commit,
   push to its managed source repository, and package the static directory.
   Use the helper's returned source SHA and archive to save and deploy the public
   Site version. Wait for successful publication before updating the gateway.
4. Mirror that exact artifact commit to GitHub:
   `git -C .local/sites-frontend push https://github.com/defcron/saladfinder.git HEAD:refs/heads/frontend-deploy`
5. For backend changes, regenerate types with `npm run cf:types` and deploy the
   top-level production configuration with `npx wrangler deploy --env ''`.
6. Run `npm run check`, `npm run coverage`, and `npm run test:e2e`, plus live
   desktop/mobile checks of the canonical domain, API health, deep links,
   missing assets, and generated-origin redirect. Normally validate before
   deployment; the initial migration was explicitly requested deploy-first.

## Routing and security

The gateway maps SPA page requests to the Sites root (`/`, not `/index.html`,
which Sites redirects). React Router handles unknown page paths. Static assets
retain their paths and missing assets retain HTTP 404. A `404.html` SPA shell is
also included for direct deep links to the Sites origin.

The gateway constructs fresh upstream requests: cookies, authorization headers,
referers, query strings, and sign-in tokens are not forwarded to Sites. It does
not follow upstream redirects and does not forward Sites cookies. Existing CSP
and framing protections are applied at the gateway. Hashed bundles are immutable;
HTML and other assets revalidate. `X-SaladFinder-Frontend: sites` identifies
responses served through the Sites origin.

The legacy ASSETS binding remains for local/staging operation and rollback. To
disable the Sites origin, remove `FRONTEND_ORIGIN` from production configuration
and redeploy with the desired local frontend build. This does not roll back D1
data. Production stays `LAUNCH_MODE=preview`; this hosting migration does not
enable paid hiring or certify Stripe readiness.
