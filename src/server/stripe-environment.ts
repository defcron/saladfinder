import { HTTPException } from "hono/http-exception";

export type StripeMode = "test" | "live";

/** Deployment policy only: every mode uses the same Stripe SDK and payment handlers. */
export function stripeMode(env: Env): StripeMode | null {
  const mode = env.STRIPE_MODE;
  if (mode !== "test" && mode !== "live") return null;
  const key = env.STRIPE_SECRET_KEY ?? "";
  const matches =
    mode === "live"
      ? /^(sk|rk)_live_[A-Za-z0-9_]+$/.test(key)
      : /^(sk|rk|rkcs)_test_[A-Za-z0-9_]+$/.test(key);
  return matches ? mode : null;
}

export function assertStripeMode(env: Env): StripeMode {
  const mode = stripeMode(env);
  if (!mode)
    throw new HTTPException(503, {
      message: "Stripe credentials do not match the configured payment mode.",
    });
  return mode;
}

export const stripeConfigured = (env: Env) =>
  Boolean(
    stripeMode(env) &&
    env.STRIPE_WEBHOOK_SECRET &&
    env.STRIPE_CONNECT_WEBHOOK_SECRET,
  );
