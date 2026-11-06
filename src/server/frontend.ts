import type { AppBindings } from "./types";

const SITE_ORIGIN = "https://saladfinder.defcron.chatgpt.site";

export async function frontend(request: Request, env: AppBindings): Promise<Response> {
  if (env.APP_ENV !== "production" || env.FRONTEND_ORIGIN !== SITE_ORIGIN)
    return env.ASSETS.fetch(request);
  const path = new URL(request.url).pathname;
  const asset = path.startsWith("/assets/") || path.startsWith("/brand/") ||
    ["/favicon.svg", "/apple-touch-icon.png", "/robots.txt", "/sites-canonical.js"].includes(path);
  const pageRoute = /^\/(?:sign-in|auth\/verify|post|jobs\/[^/]+|dashboard|account|admin|early-access|pricing|how-it-works|trust|terms|privacy)?\/?$/i.test(path);
  const target = new URL(SITE_ORIGIN);
  target.pathname = asset ? path : "/";
  // Never send visitor cookies, auth headers, query tokens, or referers to Sites.
  const upstream = await fetch(target, { method: request.method, redirect: "manual" });
  if (upstream.status >= 300 && upstream.status !== 404) {
    return new Response("The frontend is temporarily unavailable. Please try again shortly.", {
      status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" },
    });
  }
  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") || "application/octet-stream");
  headers.set("Cache-Control", upstream.ok && path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : asset ? "no-cache" : "no-cache, no-transform");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  headers.set("X-SaladFinder-Frontend", "sites");
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.ok && !asset && !pageRoute ? 404 : upstream.status, headers });
}
