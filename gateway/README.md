# SaladFinder Pages gateway

This isolated Pages project lets `www.saladfinder.com` use a Netfirms CNAME while the existing `daywork` Worker continues to own the app, static assets, D1 data, authentication, Turnstile and payment/email secrets. The gateway forwards every request through the `APP` service binding and returns the Worker's response unchanged. It does not fetch a public origin, parse request bodies, rewrite cookies or duplicate the app's authentication.

Cloudflare supports a Pages **subdomain** with an external DNS provider. Add the custom domain to Pages before creating its CNAME. Cloudflare's normal Pages apex-domain setup requires Cloudflare nameservers, so this plan does not attach `saladfinder.com` itself or change the domain's nameservers. Any apex forwarding is a separate Netfirms configuration. [Official custom-domain instructions](https://developers.cloudflare.com/pages/configuration/custom-domains/)

## Files and isolation

- `functions/[[path]].ts` handles all methods and paths, including `/`, assets and API/webhook routes. Only `www.saladfinder.com`, `saladfinder.pages.dev` and loopback development hostnames are accepted; hash/branch preview URLs and other hosts receive 421 before reaching the app. Missing or failed bindings return a generic 503; application error responses pass through unchanged.
- `public/_routes.json` sends all routes through the Function. `public/404.html` is only an unavailable page if a request ever reaches the static fallback; no application assets or private content live here.
- `wrangler.jsonc` binds production to the existing Worker named `daywork`. Preview deployments deliberately have no service binding. Preview hostnames are rejected with 421; even an allowed-host invocation without the binding returns 503. To enable previews later, bind them to a separately configured staging Worker and explicitly review its hostname allowlist.
- `src/server/routing.ts` in the parent app enables canonical redirects only when production `APP_URL` is `https://www.saladfinder.com`. GET/HEAD on the old Workers URL and the exact `saladfinder.pages.dev` hostname redirect to `www`, preserving paths and query strings. Unsafe methods are not redirected. If the Pages project name changes, update both its config and this fixed alias.

Pages supports this request forwarding directly through service bindings. The request keeps its browser URL, so the application can continue enforcing its configured origin. All gateway requests invoke a Function; account for that usage rather than treating them as unlimited free static requests. [Service bindings](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings), [Function routing and usage](https://developers.cloudflare.com/pages/functions/routing/#functions-invocation-routes)

## Validate without deploying

Run from the repository root after `npm ci`:

```sh
npm run typecheck
npx vitest run tests/gateway.test.ts tests/routing.test.ts tests/app.test.ts
npx wrangler pages functions build --cwd gateway --outdir ../.local/gateway-build --output-routes-path ../.local/gateway-routes.json
```

The focused tests cover byte-preserving mutation forwarding, cookies, signatures, repeated query parameters, upstream errors, failed/missing bindings, a real local D1 sign-in/session/logout through the gateway, origin rejection, and safe canonical redirects. Compilation checks Pages' catch-all route. These checks do not establish public DNS, TLS or production readiness.

To develop both services locally, first run the application's local Worker with `npm run dev:api`. In another terminal, start Pages with an explicit local binding:

```sh
npx wrangler pages dev --cwd gateway public --port 8788 --service APP=daywork-local
```

This uses the application's loopback development behavior and local D1. Do not add a remote production binding for development.

## Production sequence

The commands below create or update remote resources. They are deployment instructions, not steps performed by the gateway build or tests. Keep the main application's current `APP_URL` and preview mode until the custom hostname is ready.

1. Confirm the selected Cloudflare account owns the existing `daywork` Worker and the actual Pages project `saladfinder`. If recreating an absent Pages project, use the explicit Pages creation flag:

   ```sh
   npx wrangler pages project create saladfinder --cwd gateway --production-branch main --force
   ```

   The installed Wrangler 4.157.0 can automatically delegate creation of new Pages projects to Workers when invoked by an agent. Its supported `--force` flag selects actual Pages creation. A Worker-only deployment does not provide the external-DNS Pages custom-domain route required here. Confirm the resource appears as a Pages project before proceeding; creation through Cloudflare's Pages API is another supported route.

2. Deploy this directory as the Pages production branch. This reads the isolated gateway configuration; it does not deploy the parent Worker or its database:

   ```sh
   npx wrangler pages deploy --cwd gateway public --project-name saladfinder --branch main
   ```

3. In Pages **Custom domains**, associate `www.saladfinder.com` with this project. At Netfirms, replace only the existing `www` DNS record with `CNAME www → saladfinder.pages.dev`. Preserve `ns1.netfirms.com` / `ns2.netfirms.com`, the apex, mail records and `kycaml`. Check for conflicting records at `www`; do not add a CNAME alongside an A/AAAA record at the same name. Wait for Pages to report the custom domain and its HTTPS certificate active. A CNAME alone does not associate the custom domain with Pages. [Official setup order](https://developers.cloudflare.com/pages/configuration/custom-domains/#add-a-custom-cname-record)

4. Coordinate the app activation: the parent Worker must include the new wrapper with `ASSETS.fetch()` fallback for the gateway to serve pages. That code can be deployed while retaining the old `APP_URL`, before DNS activation; otherwise the previous API-only handler returns 404 for gateway page requests. Once the custom domain is ready, set the parent Worker's production `APP_URL` to `https://www.saladfinder.com` and `assets.run_worker_first` to `true`, retain `LAUNCH_MODE=preview`, and ensure Turnstile permits the hostname. The wrapper preserves the assets binding's SPA handling and headers. [Worker-first routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/#run-your-worker-script-first)

5. Verify HTTPS and the rendered app on `www`; `/api/health` and `/api/config`; JavaScript/CSS and deep links; original-host and Pages-host GET/HEAD redirects; canonical-origin forms; and rejection of foreign-origin mutations. Verify legacy webhook POSTs continue reaching signature verification. Magic-link fragments must survive a browser redirect, and authenticated responses must retain `Cache-Control: no-store` and secure host-only cookies. Existing cookies on the old Workers host do not migrate to `www`: users sign in again.

6. Update the repository homepage, operator runbooks and provider return/webhook URLs to the verified canonical host. The gateway does not enable payments or email. Cloudflare Email Sending remains disabled until an independently supported sending-domain setup is ready; retaining external DNS does not automatically satisfy Cloudflare's sending-domain requirements.

For a rollback, restore the parent Worker's previous `APP_URL` before withdrawing the `www` gateway. Its old Workers URL remains available, and the canonical redirect gate becomes inactive. Removing or changing the Netfirms `www` record does not require changing nameservers.

Pages reads service bindings and preview overrides from its Wrangler configuration. Manage these settings in this file once adopted. [Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
