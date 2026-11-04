const PUBLIC_ORIGIN = "https://www.saladfinder.com";
const PUBLIC_HOSTS = new Set([
  "saladfinder.pages.dev",
  "www.saladfinder.com",
  "daywork.defcronyke.workers.dev",
]);

export function canonicalRedirect(request: Request, env: Env): Response | null {
  if (env.APP_ENV !== "production" || !["GET", "HEAD"].includes(request.method))
    return null;
  let configured: URL;
  try {
    configured = new URL(env.APP_URL);
  } catch {
    return null;
  }
  // The domain migration is enabled by APP_URL only after DNS/TLS are ready.
  // Do not canonicalize staging, local development, or arbitrary custom hosts.
  if (
    configured.origin !== PUBLIC_ORIGIN ||
    configured.username ||
    configured.password
  )
    return null;
  const incoming = new URL(request.url);
  if (
    !PUBLIC_HOSTS.has(incoming.hostname) ||
    incoming.port ||
    incoming.origin === PUBLIC_ORIGIN
  )
    return null;
  const target = new URL(PUBLIC_ORIGIN);
  // Assign path and query separately so a //path cannot change the destination.
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  return new Response(null, {
    status: 308,
    headers: {
      Location: target.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
