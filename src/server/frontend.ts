const PAGE_ROUTE = /^\/(?:sign-in|auth\/verify|post|jobs\/[^/]+|dashboard|account|admin|early-access|pricing|how-it-works|trust|terms|privacy)?\/?$/i;

type StaticBindings = { ASSETS: Pick<Fetcher, "fetch"> };

/** Serve the SPA from this Worker’s Cloudflare Static Assets binding. */
export async function frontend(
  request: Request,
  env: StaticBindings,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  const immutableAsset =
    response.ok &&
    /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(path);

  headers.set(
    "Cache-Control",
    immutableAsset ? "public, max-age=31536000, immutable" : "no-cache, no-transform",
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  );
  headers.set("X-SaladFinder-Frontend", "workers-static-assets");

  const isHtml = headers
    .get("Content-Type")
    ?.toLowerCase()
    .includes("text/html");
  const spaFallbackForMissingAsset =
    path.startsWith("/assets/") && response.ok && isHtml;
  const spaFallbackForUnknownRoute =
    !path.startsWith("/assets/") &&
    response.ok &&
    isHtml &&
    !PAGE_ROUTE.test(path);
  const status =
    spaFallbackForMissingAsset || spaFallbackForUnknownRoute
      ? 404
      : response.status;
  return new Response(request.method === "HEAD" ? null : response.body, {
    status,
    statusText: response.statusText,
    headers,
  });
}
