import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { auth, loadUser } from "./auth";
import { marketplace } from "./marketplace";
import { listingsEnabled, originGuard } from "./middleware";
import { payments } from "./payments";
import { stripeConfigured, stripeMode } from "./stripe-environment";
import { isSignInReady } from "./email";
import { canonicalRedirect } from "./routing";
import { frontend } from "./frontend";
import type { AppBindings, AppEnv } from "./types";

export const app = new Hono<AppEnv>();
app.use(
  "/api/*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
    referrerPolicy: "no-referrer",
  }),
);
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Request-ID", crypto.randomUUID());
  await next();
});
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json({ error: "Request is too large." }, 413),
  }),
);
app.use("/api/*", originGuard);
app.use("/api/*", loadUser);
app.get("/api/health", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({
    status: "ok",
    service: "saladfinder",
    mode: c.env.LAUNCH_MODE,
  });
});
app.get("/api/config", (c) =>
  c.json({
    launchMode: c.env.LAUNCH_MODE,
    listingsReady:
      listingsEnabled(c.env, c.req.url) && isSignInReady(c.env, c.req.url),
    currency: "CAD",
    region: "Ontario",
    authReady: isSignInReady(c.env, c.req.url),
    paymentMode: stripeMode(c.env),
    paymentsReady: c.env.LAUNCH_MODE === "live" && stripeConfigured(c.env),
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY,
    supportEmail: c.env.SUPPORT_EMAIL,
    fee: { percent: 12, fixedCents: 100, minimumCents: 300 },
  }),
);
app.route("/api", auth);
app.route("/api", marketplace);
app.route("/api", payments);
app.all("/api/*", (c) => c.json({ error: "API endpoint not found." }, 404));
app.onError((error, c) => {
  if (error instanceof HTTPException)
    return c.json({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return c.json(
      {
        error: "Please check the form fields.",
        fields: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  if (error instanceof SyntaxError)
    return c.json({ error: "Request body must be valid JSON." }, 400);
  // Never log request bodies, authentication links, cookies, provider payloads or payment details.
  console.error(
    JSON.stringify({
      event: "request_failed",
      requestId: c.res.headers.get("X-Request-ID"),
      kind: error.name,
    }),
  );
  return c.json(
    {
      error: "Something went wrong. Please try again.",
      requestId: c.res.headers.get("X-Request-ID"),
    },
    500,
  );
});

export default {
  async fetch(
    request: Request,
    env: AppBindings,
    ctx?: ExecutionContext,
  ): Promise<Response> {
    const redirect = canonicalRedirect(request, env);
    if (redirect) return redirect;
    const { pathname } = new URL(request.url);
    if (pathname === "/api" || pathname.startsWith("/api/"))
      return app.fetch(request, env, ctx);
    // Production serves the Sites frontend through the canonical same-origin gateway.
    // Local/staging continue to use their isolated ASSETS binding.
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed.", {
        status: 405,
        headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
      });
    return frontend(request, env);
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    // Expiring credentials and throttle records never need long-term retention.
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(
        Math.floor(Date.now() / 1000),
      ),
      env.DB.prepare("DELETE FROM auth_tokens WHERE expires_at < ?").bind(
        Math.floor(Date.now() / 1000),
      ),
      env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(
        Math.floor(Date.now() / 1000),
      ),
    ]);
  },
} satisfies ExportedHandler<Env>;
