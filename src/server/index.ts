import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { enabledCountries } from "../shared/regions";
import { translations } from "./translations";
import { auth, loadUser } from "./auth";
import { marketplace } from "./marketplace";
import { listingsEnabled, originGuard } from "./middleware";
import { billing, billingReady, currentPlan } from "./billing";
import { PLANS, PRICING_VERSION } from "../shared/pricing";
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
app.route("/api", translations);
app.get("/api/health", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({
    status: "ok",
    service: "saladfinder",
    mode: c.env.LAUNCH_MODE,
  });
});
app.get("/api/config", async (c) =>
  c.json({
    launchMode: c.env.LAUNCH_MODE,
    listingsReady:
      listingsEnabled(c.env, c.req.url) && isSignInReady(c.env, c.req.url),
    currency: "CAD",
    region: "Global",
    workerPayoutCountries:
      enabledCountries(c.env.CROSS_BORDER_PAYOUTS_ENABLED),
    authReady: isSignInReady(c.env, c.req.url),
    paymentMode: stripeMode(c.env),
    instantPayoutsEnabled: c.env.INSTANT_PAYOUTS_ENABLED === "true",
    paymentsReady: c.env.LAUNCH_MODE === "live" && stripeConfigured(c.env),
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY,
    supportEmail: c.env.SUPPORT_EMAIL,
    pricingEnabled: c.env.PRICING_ENABLED === "true",
    pricingVersion: PRICING_VERSION,
    plans: PLANS,
    subscriptionsReady: billingReady(c.env),
    plan: c.get("user")
      ? await currentPlan(c.env.DB, c.get("user")!.id)
      : "standard",
    fee:
      c.env.PRICING_ENABLED === "true"
        ? { percent: 14.9, fixedCents: 100, minimumCents: 300 }
        : { percent: 12, fixedCents: 100, minimumCents: 300 },
  }),
);
app.route("/api", auth);
app.route("/api", marketplace);
app.route("/api", payments);
app.route("/api", billing);
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
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed.", {
        status: 405,
        headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
      });
    if (env.ASSETS) return frontend(request, { ASSETS: env.ASSETS });
    return new Response("Not found.", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
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
