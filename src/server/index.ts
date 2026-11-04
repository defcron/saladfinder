import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { auth, loadUser } from "./auth";
import { marketplace } from "./marketplace";
import { isLocal, originGuard } from "./middleware";
import { payments } from "./payments";
import type { AppEnv } from "./types";

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
  return c.json({ status: "ok", service: "daywork", mode: c.env.LAUNCH_MODE });
});
app.get("/api/config", (c) =>
  c.json({
    launchMode: c.env.LAUNCH_MODE,
    currency: "CAD",
    region: "Ontario",
    authReady:
      isLocal(c.env, c.req.url) ||
      Boolean(
        c.env.RESEND_API_KEY &&
        c.env.EMAIL_FROM &&
        c.env.TURNSTILE_SECRET_KEY &&
        c.env.TURNSTILE_SITE_KEY,
      ),
    paymentsReady:
      c.env.LAUNCH_MODE === "live" &&
      Boolean(
        c.env.STRIPE_SECRET_KEY &&
        c.env.STRIPE_WEBHOOK_SECRET &&
        c.env.STRIPE_CONNECT_WEBHOOK_SECRET,
      ) &&
      (isLocal(c.env, c.req.url) ||
        (c.env.APP_ENV === "staging"
          ? /^(sk|rk)_test_/.test(c.env.STRIPE_SECRET_KEY || "")
          : /^(sk|rk)_live_/.test(c.env.STRIPE_SECRET_KEY || ""))),
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
  fetch: app.fetch,
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
