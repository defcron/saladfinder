export interface GatewayEnv {
  APP?: Pick<Fetcher, "fetch">;
}

const ALLOWED_HOSTS = new Set([
  "www.saladfinder.com",
  "saladfinder.pages.dev",
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

export async function onRequest({
  request,
  env,
}: {
  request: Request;
  env: GatewayEnv;
}): Promise<Response> {
  // Production deployment hashes and branch-preview hosts must not become
  // alternate entry points to the production service. Loopback is local only.
  if (!ALLOWED_HOSTS.has(new URL(request.url).hostname))
    return new Response("This hostname is not configured for SaladFinder.", {
      status: 421,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  try {
    if (!env.APP) throw new Error("Missing application service binding.");
    // Keep the browser URL, method, headers and streaming body intact. The
    // application Worker owns authentication, origin checks and all secrets.
    // Return its Response unchanged, including host-only cookies and redirects.
    return await env.APP.fetch(request);
  } catch {
    // Do not fall back to a public URL or log request/provider details.
    return new Response("SaladFinder is temporarily unavailable.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
