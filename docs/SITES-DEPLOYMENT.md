# Cloudflare frontend hosting and releases

Production runs two independently deployable Workers on the same Cloudflare zone:

- `saladfinder-frontend` serves the Vite React SPA and hashed assets from
  Workers Static Assets on `saladfinder.com/*`.
- `daywork` serves the API on the more-specific `saladfinder.com/api/*`
  route and handles the `www` to root redirect.

Cloudflare routes the most specific matching route to its Worker. This keeps
browser API calls same-origin, including auth cookies and CSRF checks. If the
frontend Worker has a deployment or runtime issue, the API route remains mapped
to the API Worker; if the API Worker has an issue, the static frontend remains
available and can show its API error state. Both services still share the same
Cloudflare zone, DNS, account and control plane.

Staging intentionally serves both parts from `saladfinder-staging` to retain a
single same-origin staging URL. The production frontend and API builds use the
same source revision but have independent deployment targets and workflow path
filters.

## GitHub release pipeline

`.github/workflows/ci.yml` runs generated binding checks, TypeScript checks,
coverage tests, frontend and gateway builds, deployment parity checks, and
Playwright end-to-end tests on pull requests and pushes to `main`. A successful
push to `main` deploys the API Worker when backend files change, the frontend
Worker when frontend files change, and the Pages redirect gateway when its code
changes. Remote D1 migrations run only when migration files change. Deployment
requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the GitHub
`production` environment. Pull requests do not receive deployment credentials.

## SPA routes and assets

`wrangler.frontend.jsonc` builds from `dist/`; its Static Assets binding uses the
SPA fallback for browser routes such as `/sign-in`, `/jobs/:id`, and
`/dashboard`. The frontend Worker adds cache and browser security headers. The
API Worker's `wrangler.jsonc` does not bind production static assets. Local and
staging environments retain their asset binding for same-origin development and
acceptance flows.

Historical Sites migration records remain in `docs/VERIFICATION.md` as a record
of past releases. ChatGPT Sites is no longer intended to serve production
requests after the verified Cloudflare cutover.
