import Stripe from "stripe";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { requireUser, requireLive, rateLimit, jsonInput } from "./middleware";
import { assertStripeMode, stripeConfigured } from "./stripe-environment";
import { PLANS, type Plan } from "../shared/pricing";
import type { AppEnv } from "./types";

type Account = {
  user_id: string;
  customer_id: string | null;
  customer_operation: string;
  customer_started_at: number;
  subscription_id: string | null;
  plan: Plan;
  paid_until: number;
  status: string;
  cancel_at_period_end: number;
  blocked: number;
};
const seconds = () => Math.floor(Date.now() / 1000);
const idOf = (v: string | { id: string } | null | undefined) =>
  typeof v === "string" ? v : v?.id;
export const billingReady = (env: Env) =>
  env.SUBSCRIPTIONS_ENABLED === "true" &&
  stripeConfigured(env) &&
  Boolean(env.STRIPE_ECONOMY_PRICE && env.STRIPE_PREMIUM_PRICE);
export async function currentPlan(
  db: D1Database,
  userId: string,
): Promise<Plan> {
  const row = await db
    .prepare(
      "SELECT plan,paid_until,blocked FROM billing_accounts WHERE user_id=?",
    )
    .bind(userId)
    .first<Account>();
  return row && !row.blocked && row.paid_until > seconds()
    ? row.plan
    : "standard";
}
function planForPrice(env: Env, price: string): Plan {
  if (price === env.STRIPE_ECONOMY_PRICE) return "economy";
  if (price === env.STRIPE_PREMIUM_PRICE) return "premium";
  return "standard";
}
export async function syncSubscription(
  env: Env,
  stripe: Stripe,
  subscriptionId: string,
  customerId: string,
) {
  const account = await env.DB.prepare(
    "SELECT * FROM billing_accounts WHERE customer_id=?",
  )
    .bind(customerId)
    .first<Account>();
  if (!account)
    throw new HTTPException(409, { message: "Unknown billing customer." });
  const lock = crypto.randomUUID();
  const acquired = await env.DB.prepare(
    "UPDATE billing_accounts SET sync_lock=?,sync_until=? WHERE user_id=? AND sync_until<?",
  )
    .bind(lock, seconds() + 90, account.user_id, seconds())
    .run();
  if (!acquired.meta.changes)
    throw new HTTPException(503, {
      message: "Billing reconciliation is busy. Retry delivery.",
    });
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["latest_invoice"],
    });
    if (
      idOf(sub.customer) !== customerId ||
      sub.livemode !== (assertStripeMode(env) === "live")
    )
      throw new HTTPException(400, {
        message: "Billing ownership or mode mismatch.",
      });
    // An older canceled subscription cannot replace a later subscription.
    if (account.subscription_id && account.subscription_id !== sub.id) {
      const previous = await stripe.subscriptions.retrieve(
        account.subscription_id,
      );
      if (
        previous.created >= sub.created ||
        !["canceled", "incomplete_expired"].includes(previous.status)
      )
        return;
    }
    const item = sub.items.data[0];
    const plan = item ? planForPrice(env, item.price.id) : "standard";
    const invoice =
      typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
    const paid =
      sub.status === "active" &&
      invoice?.status === "paid" &&
      sub.items.data.length === 1 &&
      plan !== "standard";
    const until = paid ? item.current_period_end : 0;
    const saved = await env.DB.prepare(
      "UPDATE billing_accounts SET subscription_id=?,plan=?,paid_until=?,status=?,cancel_at_period_end=?,updated_at=? WHERE user_id=? AND sync_lock=? AND sync_until>?",
    )
      .bind(
        sub.id,
        plan,
        until,
        sub.status,
        sub.cancel_at_period_end ? 1 : 0,
        seconds(),
        account.user_id,
        lock,
        seconds(),
      )
      .run();
    if (!saved.meta.changes)
      throw new HTTPException(503, {
        message: "Billing reconciliation lease expired. Retry delivery.",
      });
  } finally {
    await env.DB.prepare(
      "UPDATE billing_accounts SET sync_lock=NULL,sync_until=0 WHERE user_id=? AND sync_lock=?",
    )
      .bind(account.user_id, lock)
      .run();
  }
}
export async function billingEvent(
  env: Env,
  stripe: Stripe,
  event: Stripe.Event,
): Promise<boolean> {
  if (event.account) return false;
  if (event.type.startsWith("customer.subscription.")) {
    const sub = event.data.object as Stripe.Subscription;
    const customer = idOf(sub.customer);
    if (!customer)
      throw new HTTPException(400, { message: "Missing billing customer." });
    await syncSubscription(env, stripe, sub.id, customer);
    return true;
  }
  if (
    event.type === "invoice.paid" ||
    event.type === "invoice.payment_failed"
  ) {
    const invoice = event.data.object as Stripe.Invoice;
    const sub = idOf(invoice.parent?.subscription_details?.subscription);
    const customer = idOf(invoice.customer);
    if (!sub || !customer) return false;
    await syncSubscription(env, stripe, sub, customer);
    return true;
  }
  if (event.type.startsWith("checkout.session.")) {
    const session = event.data.object as Stripe.Checkout.Session;
    if (
      session.mode !== "subscription" ||
      session.metadata?.purpose !== "saladfinder_subscription"
    )
      return false;
    const checkout = await env.DB.prepare(
      "SELECT user_id,session_id FROM billing_checkouts WHERE id=?",
    )
      .bind(session.metadata.billing_checkout_id ?? "")
      .first<{ user_id: string; session_id: string | null }>();
    const customer = idOf(session.customer);
    const account = customer
      ? await env.DB.prepare(
          "SELECT user_id FROM billing_accounts WHERE customer_id=?",
        )
          .bind(customer)
          .first<{ user_id: string }>()
      : null;
    if (
      !checkout ||
      checkout.user_id !== account?.user_id ||
      (checkout.session_id && checkout.session_id !== session.id)
    )
      throw new HTTPException(400, { message: "Billing checkout mismatch." });
    if (event.type === "checkout.session.expired") {
      await env.DB.prepare(
        "UPDATE billing_checkouts SET status='expired' WHERE id=? AND status IN ('creating','open')",
      )
        .bind(session.metadata.billing_checkout_id)
        .run();
    } else if (
      session.payment_status === "paid" &&
      idOf(session.subscription)
    ) {
      await syncSubscription(
        env,
        stripe,
        idOf(session.subscription)!,
        customer!,
      );
      await env.DB.prepare(
        "UPDATE billing_checkouts SET status='complete',session_id=? WHERE id=?",
      )
        .bind(session.id, session.metadata.billing_checkout_id)
        .run();
    }
    return true;
  }
  if (
    [
      "charge.refunded",
      "charge.dispute.created",
      "radar.early_fraud_warning.created",
    ].includes(event.type)
  ) {
    const paymentIntent = idOf(
      (event.data.object as unknown as { payment_intent?: string })
        .payment_intent,
    );
    if (
      paymentIntent &&
      (await env.DB.prepare(
        "SELECT id FROM payment_attempts WHERE payment_intent_id=?",
      )
        .bind(paymentIntent)
        .first())
    )
      return false;
    const object = event.data.object as unknown as {
      id: string;
      charge?: string | { id: string };
    };
    if (event.type !== "charge.refunded" && !idOf(object.charge)) return false;
    const charge =
      event.type === "charge.refunded"
        ? (event.data.object as Stripe.Charge)
        : await stripe.charges.retrieve(idOf(object.charge)!);
    const customer = idOf(charge.customer);
    if (!customer) return false;
    const account = await env.DB.prepare(
      "SELECT user_id FROM billing_accounts WHERE customer_id=?",
    )
      .bind(customer)
      .first<{ user_id: string }>();
    if (!account) return false;
    // Platform subscription customers are separate from destination-charge customers.
    // Freeze benefits for operator review on any financial risk tied to that billing customer.
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE billing_accounts SET blocked=1 WHERE user_id=?",
      ).bind(account.user_id),
      env.DB.prepare(
        "INSERT OR IGNORE INTO billing_risk_events(event_id,user_id,event_type,created_at) VALUES(?,?,?,?)",
      ).bind(event.id, account.user_id, event.type, seconds()),
    ]);
    return true;
  }
  return false;
}
export function createBillingRouter(
  makeStripe = (env: Env) =>
    new Stripe(env.STRIPE_SECRET_KEY!, {
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 2,
      timeout: 20000,
    }),
) {
  const router = new Hono<AppEnv>();
  router.get("/billing/status", requireUser, async (c) => {
    const account = await c.env.DB.prepare(
      "SELECT plan,paid_until,status,cancel_at_period_end,blocked,customer_id FROM billing_accounts WHERE user_id=?",
    )
      .bind(c.get("user")!.id)
      .first<Account>();
    return c.json({
      ready: billingReady(c.env),
      plan: await currentPlan(c.env.DB, c.get("user")!.id),
      paidUntil: account?.paid_until ?? 0,
      status: account?.status ?? "none",
      cancelAtPeriodEnd: Boolean(account?.cancel_at_period_end),
      blocked: Boolean(account?.blocked),
      canManage: Boolean(account?.customer_id),
    });
  });
  router.post("/billing/checkout", requireUser, requireLive, async (c) => {
    if (!billingReady(c.env))
      throw new HTTPException(503, {
        message: "Subscription checkout is not available yet.",
      });
    assertStripeMode(c.env);
    const { plan } = await jsonInput(
      c,
      z.object({ plan: z.enum(["economy", "premium"]) }),
    );
    const user = c.get("user")!;
    await rateLimit(c, "billing-checkout", user.id, 10, 3600);
    const stripe = makeStripe(c.env);
    const priceId =
      plan === "economy"
        ? c.env.STRIPE_ECONOMY_PRICE!
        : c.env.STRIPE_PREMIUM_PRICE!;
    const price = await stripe.prices.retrieve(priceId);
    if (
      !price.active ||
      price.livemode !== (assertStripeMode(c.env) === "live") ||
      price.currency !== "cad" ||
      price.unit_amount !== PLANS[plan].monthlyCents ||
      price.recurring?.interval !== "month" ||
      price.recurring.interval_count !== 1
    )
      throw new HTTPException(503, {
        message: "Subscription price configuration needs review.",
      });
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO billing_accounts(user_id,customer_operation,customer_started_at) VALUES(?,?,?)",
    )
      .bind(user.id, crypto.randomUUID(), seconds())
      .run();
    let account = (await c.env.DB.prepare(
      "SELECT * FROM billing_accounts WHERE user_id=?",
    )
      .bind(user.id)
      .first<Account>())!;
    if (account.blocked)
      throw new HTTPException(409, {
        message:
          "Contact support about your billing account before subscribing.",
      });
    if (!account.customer_id) {
      if (seconds() - account.customer_started_at > 23 * 3600)
        throw new HTTPException(409, {
          message: "Customer setup needs support reconciliation.",
        });
      const customer = await stripe.customers.create(
        { metadata: { saladfinder_user_id: user.id } },
        { idempotencyKey: `billing-customer:${account.customer_operation}` },
      );
      await c.env.DB.prepare(
        "UPDATE billing_accounts SET customer_id=? WHERE user_id=? AND customer_id IS NULL",
      )
        .bind(customer.id, user.id)
        .run();
      account = (await c.env.DB.prepare(
        "SELECT * FROM billing_accounts WHERE user_id=?",
      )
        .bind(user.id)
        .first<Account>())!;
    }
    const subscriptions = await stripe.subscriptions.list({
      customer: account.customer_id!,
      status: "all",
      limit: 100,
    });
    if (
      subscriptions.has_more ||
      subscriptions.data.some(
        (s) => !["canceled", "incomplete_expired"].includes(s.status),
      )
    )
      throw new HTTPException(409, {
        message:
          "You already have a subscription. Manage it from your account.",
      });
    type Attempt = {
      id: string;
      plan: "economy" | "premium";
      session_id: string | null;
      url: string | null;
      created_at: number;
      request_json: string | null;
    };
    let attempt = await c.env.DB.prepare(
      "SELECT * FROM billing_checkouts WHERE user_id=? AND status IN ('creating','open') LIMIT 1",
    )
      .bind(user.id)
      .first<Attempt>();
    if (attempt?.session_id) {
      const session = await stripe.checkout.sessions.retrieve(
        attempt.session_id,
      );
      if (session.status === "open" && session.url) {
        if (attempt.plan !== plan)
          throw new HTTPException(409, {
            message:
              "Finish or allow your existing plan checkout to expire before choosing another plan.",
          });
        return c.json({ url: session.url });
      }
      if (session.status !== "expired")
        throw new HTTPException(409, {
          message:
            "Subscription payment is processing. Refresh your account shortly.",
        });
      await c.env.DB.prepare(
        "UPDATE billing_checkouts SET status='expired' WHERE id=? AND status='open'",
      )
        .bind(attempt.id)
        .run();
      attempt = null;
    }
    if (!attempt) {
      await c.env.DB.prepare(
        "INSERT OR IGNORE INTO billing_checkouts(id,user_id,plan,created_at) VALUES(?,?,?,?)",
      )
        .bind(crypto.randomUUID(), user.id, plan, seconds())
        .run();
      attempt = await c.env.DB.prepare(
        "SELECT * FROM billing_checkouts WHERE user_id=? AND status IN ('creating','open') LIMIT 1",
      )
        .bind(user.id)
        .first<Attempt>();
    }
    if (
      !attempt ||
      attempt.plan !== plan ||
      seconds() - attempt.created_at > 23 * 3600
    )
      throw new HTTPException(409, {
        message:
          "An existing subscription request needs reconciliation before another can start.",
      });
    const proposedRequest: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      integration_identifier:
        "saladfinder_membership_" +
        attempt.id
          .replace(/-/g, "")
          .slice(0, 8)
          .split("")
          .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
          .join(""),
      customer: account.customer_id!,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      metadata: {
        purpose: "saladfinder_subscription",
        billing_checkout_id: attempt.id,
      },
      subscription_data: { metadata: { saladfinder_user_id: user.id } },
      success_url: `${c.env.APP_URL}/account?billing=returned`,
      cancel_url: `${c.env.APP_URL}/account?billing=cancelled`,
      expires_at: attempt.created_at + 23 * 3600,
    };
    await c.env.DB.prepare(
      "UPDATE billing_checkouts SET request_json=? WHERE id=? AND request_json IS NULL",
    )
      .bind(JSON.stringify(proposedRequest), attempt.id)
      .run();
    const frozen = await c.env.DB.prepare(
      "SELECT request_json FROM billing_checkouts WHERE id=?",
    )
      .bind(attempt.id)
      .first<{ request_json: string }>();
    if (!frozen?.request_json)
      throw new HTTPException(503, {
        message: "Billing request could not be recorded.",
      });
    const session = await stripe.checkout.sessions.create(
      JSON.parse(frozen.request_json) as Stripe.Checkout.SessionCreateParams,
      { idempotencyKey: `billing-checkout:${attempt.id}` },
    );
    await c.env.DB.prepare(
      "UPDATE billing_checkouts SET session_id=?,url=?,status=CASE WHEN status='creating' THEN 'open' ELSE status END WHERE id=?",
    )
      .bind(session.id, session.url, attempt.id)
      .run();
    return c.json({ url: session.url });
  });
  router.post("/billing/portal", requireUser, async (c) => {
    assertStripeMode(c.env);
    await rateLimit(c, "billing-portal", c.get("user")!.id, 10, 3600);
    const account = await c.env.DB.prepare(
      "SELECT customer_id FROM billing_accounts WHERE user_id=?",
    )
      .bind(c.get("user")!.id)
      .first<Account>();
    if (!account?.customer_id)
      throw new HTTPException(409, {
        message: "No billing account to manage.",
      });
    const session = await makeStripe(c.env).billingPortal.sessions.create({
      customer: account.customer_id,
      return_url: `${c.env.APP_URL}/account`,
    });
    return c.json({ url: session.url });
  });
  return router;
}
export const billing = createBillingRouter();
