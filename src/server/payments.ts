import Stripe from "stripe";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "./types";
import { requireAdmin, requireUser, rateLimit } from "./middleware";
import { feeCents } from "../shared/types";
import { stripeReadiness } from "./stripe-readiness";
import {
  assertStripeMode,
  stripeConfigured,
  stripeMode,
} from "./stripe-environment";
export { stripeConfigured } from "./stripe-environment";

type Payment = {
  id: string;
  milestone_id: string;
  attempt: number;
  poster_id: string;
  worker_id: string;
  account_id: string;
  amount_cents: number;
  fee_cents: number;
  currency: string;
  status: string;
  checkout_session_id: string | null;
  payment_intent_id: string | null;
  checkout_url: string | null;
  request_json: string | null;
  created_at: string;
};
type Milestone = {
  id: string;
  job_id: string;
  title: string;
  amount_cents: number;
  status: string;
  poster_id: string;
  worker_id: string | null;
  job_status: string;
  account_id: string | null;
  worker_suspended: string | null;
};
type PayoutIntent = {
  request_id: string;
  user_id: string;
  account_id: string;
  method: "instant" | "standard";
  amount_cents: number;
  destination: string | null;
  payout_id: string | null;
  status: string;
  arrival_date: number | null;
  created_at: string;
};
type RefundIntent = {
  payment_attempt_id: string;
  operation_id: string;
  refund_id: string | null;
  status: string;
  amount_cents: number;
  created_at: string;
};
type StripeFactory = (env: Env) => Stripe;
const payoutLimits = {
  instant: { minimum_cents: 60, maximum_cents: 999900 },
  standard: { minimum_cents: 100, maximum_cents: 999900 },
} as const;
const now = () => new Date().toISOString();
const objectId = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;
export const platformFee = feeCents;
const defaultStripe: StripeFactory = (env) => {
  assertStripeMode(env);
  return new Stripe(env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    timeout: 20000,
  });
};
function assertPaymentAccess(env: Env) {
  if (env.LAUNCH_MODE !== "live" || !stripeConfigured(env))
    throw new HTTPException(503, {
      message: "Payments are not enabled. No money has been collected.",
    });
}
function freshRetry(createdAt: string) {
  // Stripe may prune idempotency keys after 24 hours. Never retry an ambiguous creation after that window.
  if (!canRetry(createdAt))
    throw new HTTPException(409, {
      message:
        "This payment operation needs support reconciliation before retrying.",
    });
}
const canRetry = (createdAt: string) =>
  Number.isFinite(Date.parse(createdAt)) &&
  Date.now() - Date.parse(createdAt) <= 23 * 60 * 60 * 1000;

async function connectedAccount(stripe: Stripe, accountId: string) {
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.recipient", "identity", "requirements"],
  });
  const capabilities =
    account.configuration?.recipient?.capabilities?.stripe_balance;
  const canadian =
    account.identity?.country?.toUpperCase() === "CA" && !account.closed;
  return {
    account,
    transfersEnabled:
      canadian && capabilities?.stripe_transfers?.status === "active",
    payoutsEnabled: canadian && capabilities?.payouts?.status === "active",
  };
}

async function externalDestinations(stripe: Stripe, accountId: string) {
  const accounts = await stripe.accounts.listExternalAccounts(accountId, {
    limit: 100,
  });
  // Bound provider work and fail closed rather than choosing from an incomplete list.
  if (accounts.has_more)
    throw new HTTPException(409, {
      message:
        "Review your payout accounts in Stripe before requesting a payout.",
    });
  return accounts.data.filter((destination) => destination.currency === "cad");
}

function eligibleDestinations(
  balance: Stripe.Balance,
  destinations: Stripe.ExternalAccount[],
) {
  const instant = balance.instant_available?.find(
    (value) => value.currency === "cad",
  );
  const instantDestinations = (instant?.net_available ?? [])
    .filter((value) =>
      destinations.some(
        (destination) =>
          destination.id === value.destination &&
          destination.object === "card" &&
          destination.available_payout_methods?.includes("instant"),
      ),
    )
    .sort(
      (a, b) =>
        b.amount - a.amount || a.destination.localeCompare(b.destination),
    );
  const banks = destinations
    .filter(
      (destination): destination is Stripe.BankAccount =>
        destination.object === "bank_account" &&
        !["errored", "verification_failed"].includes(destination.status) &&
        Boolean(destination.available_payout_methods?.includes("standard")),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.default_for_currency)) -
          Number(Boolean(a.default_for_currency)) || a.id.localeCompare(b.id),
    );
  return {
    instant: instantDestinations,
    standard: banks[0] ?? null,
    // Each entry represents the same balance at a different destination, never additive funds.
    instantAmount: Math.max(
      0,
      ...instantDestinations.map((value) => value.amount),
    ),
  };
}
async function body<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    throw new HTTPException(400, {
      message: "Please check the payment information.",
    });
  return parsed.data;
}
async function frozen(db: D1Database, userId: string) {
  return Boolean(
    await db
      .prepare(
        "SELECT j.id FROM jobs j WHERE j.worker_id = ? AND (j.status = 'disputed' OR EXISTS (SELECT 1 FROM payment_attempts p JOIN milestones m ON m.id = p.milestone_id LEFT JOIN refund_intents r ON r.payment_attempt_id = p.id WHERE m.job_id = j.id AND (p.status = 'disputed' OR r.status NOT IN ('succeeded','canceled')))) LIMIT 1",
      )
      .bind(userId)
      .first(),
  );
}
async function milestone(db: D1Database, id: string): Promise<Milestone> {
  const value = await db
    .prepare(
      "SELECT m.*, j.poster_id, j.worker_id, j.status AS job_status, u.stripe_account_id AS account_id, u.suspended_at AS worker_suspended FROM milestones m JOIN jobs j ON j.id = m.job_id LEFT JOIN users u ON u.id = j.worker_id WHERE m.id = ?",
    )
    .bind(id)
    .first<Milestone>();
  if (!value) throw new HTTPException(404, { message: "Milestone not found." });
  return value;
}
function requirePayable(value: Milestone, userId: string) {
  if (value.poster_id !== userId)
    throw new HTTPException(403, {
      message: "Only the client for this job can pay.",
    });
  if (
    value.job_status === "disputed" ||
    value.job_status === "cancelled" ||
    value.worker_suspended
  )
    throw new HTTPException(409, {
      message: "Payments for this job are on hold.",
    });
  if (!value.worker_id || !value.account_id)
    throw new HTTPException(409, {
      message: "The worker must complete Stripe onboarding first.",
    });
  if (!["approved", "checkout_pending"].includes(value.status))
    throw new HTTPException(409, {
      message: "Approve this milestone before payment.",
    });
}
const compactPayout = (p: Stripe.Payout) => ({
  id: p.id,
  amount_cents: p.amount,
  status: p.status,
  method: p.method,
  arrival_date: p.arrival_date || null,
  created: p.created,
});

async function paymentForIntent(
  db: D1Database,
  stripe: Stripe,
  intentId: string | undefined,
) {
  if (!intentId) return null;
  const stored = await db
    .prepare("SELECT * FROM payment_attempts WHERE payment_intent_id = ?")
    .bind(intentId)
    .first<Payment>();
  if (stored) return stored;
  // Refund/dispute notifications can arrive before Checkout's success notification.
  const intent = await stripe.paymentIntents.retrieve(intentId);
  const payment = await db
    .prepare("SELECT * FROM payment_attempts WHERE id = ?")
    .bind(intent.metadata?.payment_attempt_id ?? "")
    .first<Payment>();
  if (
    !payment ||
    intent.currency !== payment.currency ||
    intent.amount !== payment.amount_cents + payment.fee_cents ||
    objectId(intent.transfer_data?.destination) !== payment.account_id
  )
    return null;
  return payment;
}

/** Stop outstanding payment links after a job is held. A payment already completing is reconciled by webhook. */
export async function suspendJobPayments(
  env: Env,
  jobId: string,
  makeStripe: StripeFactory = defaultStripe,
) {
  if (!env.STRIPE_SECRET_KEY) return;
  assertStripeMode(env);
  const stripe = makeStripe(env);
  const active = await env.DB.prepare(
    "SELECT p.* FROM payment_attempts p JOIN milestones m ON m.id = p.milestone_id WHERE m.job_id = ? AND p.status IN ('creating','open') AND p.checkout_session_id IS NOT NULL",
  )
    .bind(jobId)
    .all<Payment>();
  for (const payment of active.results) {
    try {
      const session = await stripe.checkout.sessions.retrieve(
        payment.checkout_session_id!,
      );
      if (session.status === "open")
        await stripe.checkout.sessions.expire(
          session.id,
          {},
          { idempotencyKey: `hold-${payment.id}` },
        );
    } catch {
      await env.DB.prepare(
        "INSERT INTO payment_incidents (id,payment_attempt_id,reason) VALUES (?,?,?)",
      )
        .bind(
          crypto.randomUUID(),
          payment.id,
          "Could not expire a held checkout. Reconcile in Stripe; a concurrent successful payment requires review.",
        )
        .run();
    }
  }
}

/** Check both the Checkout record and the canonical PaymentIntent before recording payment. */
export function validatePaidSession(
  session: Stripe.Checkout.Session,
  intent: Stripe.PaymentIntent,
  payment: Payment,
  live: boolean,
) {
  return (
    session.payment_status === "paid" &&
    session.mode === "payment" &&
    session.livemode === live &&
    intent.livemode === live &&
    session.currency === "cad" &&
    intent.currency === "cad" &&
    session.amount_total === payment.amount_cents + payment.fee_cents &&
    intent.amount === payment.amount_cents + payment.fee_cents &&
    intent.amount_received === payment.amount_cents + payment.fee_cents &&
    intent.status === "succeeded" &&
    intent.application_fee_amount === payment.fee_cents &&
    objectId(intent.transfer_data?.destination) === payment.account_id &&
    objectId(session.payment_intent) === intent.id &&
    session.metadata?.payment_attempt_id === payment.id &&
    session.metadata?.milestone_id === payment.milestone_id &&
    intent.metadata?.payment_attempt_id === payment.id &&
    (!payment.checkout_session_id || payment.checkout_session_id === session.id)
  );
}

export function createPaymentsRouter(
  makeStripe: StripeFactory = defaultStripe,
) {
  const router = new Hono<AppEnv>();

  router.get("/admin/payments/readiness", requireAdmin, async (c) => {
    await rateLimit(c, "stripe-readiness", c.get("user")!.id, 5, 60);
    if (!stripeConfigured(c.env))
      throw new HTTPException(503, {
        message: "Stripe secrets are not fully configured.",
      });
    // This diagnostic works in preview, without opening any money routes.
    assertPaymentAccess({ ...c.env, LAUNCH_MODE: "live" });
    return c.json(await stripeReadiness(makeStripe(c.env), c.env));
  });

  router.get("/admin/payments", requireAdmin, async (c) => {
    const [incidents, unresolvedPayments, payouts, refunds] = await Promise.all(
      [
        c.env.DB.prepare(
          "SELECT i.id,i.event_id,i.payment_attempt_id,i.reason,i.created_at,p.milestone_id,m.job_id FROM payment_incidents i LEFT JOIN payment_attempts p ON p.id = i.payment_attempt_id LEFT JOIN milestones m ON m.id = p.milestone_id ORDER BY i.created_at DESC LIMIT 100",
        ).all(),
        c.env.DB.prepare(
          "SELECT p.id,p.milestone_id,m.job_id,p.status,p.amount_cents,p.fee_cents,p.checkout_session_id,p.payment_intent_id,p.created_at FROM payment_attempts p JOIN milestones m ON m.id = p.milestone_id WHERE p.status IN ('creating','failed','disputed') ORDER BY p.created_at DESC LIMIT 100",
        ).all(),
        c.env.DB.prepare(
          "SELECT request_id,user_id,method,amount_cents,payout_id,status,arrival_date,created_at FROM payout_intents WHERE status != 'paid' ORDER BY created_at DESC LIMIT 100",
        ).all(),
        c.env.DB.prepare(
          "SELECT payment_attempt_id,operation_id,reason,refund_id,status,amount_cents,created_at FROM refund_intents ORDER BY created_at DESC LIMIT 100",
        ).all(),
      ],
    );
    return c.json({
      incidents: incidents.results,
      unresolvedPayments: unresolvedPayments.results,
      payouts: payouts.results,
      refunds: refunds.results,
    });
  });

  router.get("/payments/status", requireUser, async (c) => {
    const user = c.get("user")!;
    await rateLimit(c, "payment-status", user.id, 30, 60);
    const configured = stripeConfigured(c.env) && c.env.LAUNCH_MODE === "live";
    const testMode = stripeMode(c.env) === "test";
    const pending = await c.env.DB.prepare(
      "SELECT * FROM payout_intents WHERE user_id = ? AND status = 'creating' LIMIT 1",
    )
      .bind(user.id)
      .first<PayoutIntent>();
    const base = {
      configured,
      testMode,
      accountReady: false,
      onboardingComplete: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      instantEligible: false,
      standardEligible: false,
      defaultPayoutMethod: null as "instant" | "standard" | null,
      accountId: user.stripe_account_id ?? null,
      payoutSchedule: null as string | null,
      payoutSetupRequired: false,
      payoutLimits,
      pendingPayout: pending
        ? {
            requestId: pending.request_id,
            method: pending.method,
            amount_cents: pending.amount_cents,
            retryable:
              pending.account_id === user.stripe_account_id &&
              canRetry(pending.created_at),
          }
        : null,
      frozen: false,
    };
    if (!configured)
      return c.json({
        ...base,
        message:
          "Payments are not enabled or their configuration needs attention.",
      });
    if (!user.stripe_account_id)
      return c.json({
        ...base,
        message:
          "Connect Stripe to receive payments. Bank arrival depends on eligibility.",
      });
    const stripe = makeStripe(c.env);
    const [readiness, balance, payouts, held, destinations, settings] =
      await Promise.all([
        connectedAccount(stripe, user.stripe_account_id),
        stripe.balance.retrieve(
          { expand: ["instant_available.net_available"] },
          { stripeAccount: user.stripe_account_id },
        ),
        stripe.payouts.list(
          { limit: 20 },
          { stripeAccount: user.stripe_account_id },
        ),
        frozen(c.env.DB, user.id),
        externalDestinations(stripe, user.stripe_account_id),
        stripe.balanceSettings.retrieve(
          {},
          { stripeAccount: user.stripe_account_id },
        ),
      ]);
    const available =
      balance.available.find((x) => x.currency === "cad")?.amount ?? 0;
    const pendingAmount =
      balance.pending.find((x) => x.currency === "cad")?.amount ?? 0;
    const options = eligibleDestinations(balance, destinations);
    const payoutSchedule =
      settings.payments.payouts?.schedule?.interval ?? null;
    const ready = readiness.transfersEnabled && readiness.payoutsEnabled;
    const instantEligible =
      c.env.INSTANT_PAYOUTS_ENABLED === "true" &&
      ready &&
      !held &&
      options.instantAmount >= payoutLimits.instant.minimum_cents;
    const standardEligible =
      ready &&
      !held &&
      payoutSchedule === "manual" &&
      Boolean(options.standard) &&
      available >= payoutLimits.standard.minimum_cents;
    return c.json({
      ...base,
      accountReady: ready,
      onboardingComplete: ready,
      // Recipient accounts receive transfers rather than accepting direct charges.
      chargesEnabled: false,
      payoutsEnabled: readiness.payoutsEnabled,
      instantEligible,
      standardEligible,
      defaultPayoutMethod: instantEligible
        ? "instant"
        : standardEligible
          ? "standard"
          : null,
      payoutSchedule,
      payoutSetupRequired: payoutSchedule !== "manual",
      frozen: held,
      balance: {
        available_cents: available,
        pending_cents: pendingAmount,
        instant_available_cents: options.instantAmount,
        currency: "CAD",
      },
      payouts: payouts.data.map(compactPayout),
      message: held
        ? "In-app payout requests are paused while a reported job is reviewed. Existing Stripe transfers and payouts are not recalled."
        : testMode
          ? "Stripe test mode: no real money moves and no bank payout occurs."
          : c.env.INSTANT_PAYOUTS_ENABLED !== "true"
            ? "Instant payouts are unavailable on this platform. Standard payouts to an eligible bank account remain available; settlement and bank processing times apply."
            : "Request an instant payout to an eligible debit card or a standard payout to a linked bank account. Instant arrival is usually within 30 minutes, but delays can occur. Standard payouts take longer; settlement and bank processing still apply.",
    });
  });

  router.post("/payments/onboard", requireUser, async (c) => {
    assertPaymentAccess(c.env);
    const user = c.get("user")!;
    await rateLimit(c, "connect-onboard", user.id, 10, 3600);
    const stripe = makeStripe(c.env);
    let accountId = user.stripe_account_id;
    if (!accountId) {
      const accountRequest: Stripe.V2.Core.AccountCreateParams = {
        contact_email: user.email,
        display_name: user.name,
        dashboard: "express",
        identity: { country: "ca" },
        defaults: {
          currency: "cad",
          responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
          },
        },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { requested: true } },
            },
          },
        },
        metadata: { daywork_user_id: user.id },
      };
      await c.env.DB.prepare(
        "INSERT OR IGNORE INTO connect_intents (user_id, operation_id, request_json) VALUES (?, ?, ?)",
      )
        .bind(user.id, crypto.randomUUID(), JSON.stringify(accountRequest))
        .run();
      const operation = (await c.env.DB.prepare(
        "SELECT * FROM connect_intents WHERE user_id = ?",
      )
        .bind(user.id)
        .first<{
          operation_id: string;
          account_id: string | null;
          request_json: string;
          created_at: string;
        }>())!;
      accountId = operation.account_id;
      if (!accountId) {
        freshRetry(operation.created_at);
        const account = await stripe.v2.core.accounts.create(
          JSON.parse(
            operation.request_json,
          ) as Stripe.V2.Core.AccountCreateParams,
          { idempotencyKey: `connect-${operation.operation_id}` },
        );
        accountId = account.id;
        await c.env.DB.batch([
          c.env.DB.prepare(
            "UPDATE connect_intents SET account_id = ? WHERE user_id = ?",
          ).bind(accountId, user.id),
          c.env.DB.prepare(
            "UPDATE users SET stripe_account_id = ? WHERE id = ? AND stripe_account_id IS NULL",
          ).bind(accountId, user.id),
        ]);
      }
      await c.env.DB.prepare(
        "UPDATE users SET stripe_account_id = ? WHERE id = ? AND stripe_account_id IS NULL",
      )
        .bind(accountId, user.id)
        .run();
    }
    // Users explicitly enter onboarding to enable in-app withdrawals. Manual
    // scheduling leaves the choice of instant or standard payout with them.
    await stripe.balanceSettings.update(
      { payments: { payouts: { schedule: { interval: "manual" } } } },
      {
        stripeAccount: accountId!,
        idempotencyKey: `manual-payouts-${accountId}-${crypto.randomUUID()}`,
      },
    );
    const link = await stripe.v2.core.accountLinks.create({
      account: accountId!,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          refresh_url: `${c.env.APP_URL}/account?onboarding=refresh`,
          return_url: `${c.env.APP_URL}/account?onboarding=returned`,
        },
      },
    });
    return c.json({ url: link.url });
  });

  router.post("/payments/dashboard", requireUser, async (c) => {
    assertPaymentAccess(c.env);
    await rateLimit(c, "payment-dashboard", c.get("user")!.id, 20, 3600);
    const id = c.get("user")!.stripe_account_id;
    if (!id) throw new HTTPException(409, { message: "Connect Stripe first." });
    const link = await makeStripe(c.env).accounts.createLoginLink(id);
    return c.json({ url: link.url });
  });

  router.post("/milestones/:id/checkout", requireUser, async (c) => {
    assertPaymentAccess(c.env);
    const user = c.get("user")!;
    await rateLimit(c, "checkout", user.id, 30, 3600);
    const item = await milestone(c.env.DB, c.req.param("id"));
    requirePayable(item, user.id);
    const stripe = makeStripe(c.env);
    const readiness = await connectedAccount(stripe, item.account_id!);
    if (!readiness.transfersEnabled || !readiness.payoutsEnabled)
      throw new HTTPException(409, {
        message:
          "The worker’s Stripe account is not ready to receive payments.",
      });
    let attempt = await c.env.DB.prepare(
      "SELECT * FROM payment_attempts WHERE milestone_id = ? ORDER BY attempt DESC LIMIT 1",
    )
      .bind(item.id)
      .first<Payment>();
    if (attempt?.checkout_session_id && attempt.status === "open") {
      const existing = await stripe.checkout.sessions.retrieve(
        attempt.checkout_session_id,
      );
      if (existing.status === "open" && existing.url)
        return c.json({ url: existing.url });
      if (existing.status !== "expired")
        throw new HTTPException(409, {
          message: "Payment is processing. Refresh the job shortly.",
        });
      await c.env.DB.batch([
        c.env.DB.prepare(
          "UPDATE payment_attempts SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'open'",
        ).bind(now(), attempt.id),
        c.env.DB.prepare(
          "UPDATE milestones SET status = 'approved' WHERE id = ? AND status = 'checkout_pending'",
        ).bind(item.id),
      ]);
      attempt.status = "expired";
    }
    if (!attempt || attempt.status === "expired") {
      const next = (attempt?.attempt ?? 0) + 1;
      const id = crypto.randomUUID();
      await c.env.DB.batch([
        c.env.DB.prepare(
          "INSERT OR IGNORE INTO payment_attempts (id,milestone_id,attempt,poster_id,worker_id,account_id,amount_cents,fee_cents) SELECT ?,id,?,?,?,?,amount_cents,? FROM milestones WHERE id = ? AND status = 'approved' AND EXISTS (SELECT 1 FROM jobs WHERE id = milestones.job_id AND status IN ('assigned','in_progress'))",
        ).bind(
          id,
          next,
          user.id,
          item.worker_id,
          item.account_id,
          platformFee(item.amount_cents),
          item.id,
        ),
        c.env.DB.prepare(
          "UPDATE milestones SET status = 'checkout_pending', fee_cents = ? WHERE id = ? AND status = 'approved' AND EXISTS (SELECT 1 FROM payment_attempts WHERE milestone_id = ? AND attempt = ?)",
        ).bind(platformFee(item.amount_cents), item.id, item.id, next),
      ]);
      attempt = await c.env.DB.prepare(
        "SELECT * FROM payment_attempts WHERE milestone_id = ? AND attempt = ?",
      )
        .bind(item.id, next)
        .first<Payment>();
    }
    if (!attempt || !["creating", "open"].includes(attempt.status))
      throw new HTTPException(409, {
        message: "This milestone is not available for checkout.",
      });
    if (attempt.checkout_url && attempt.status === "open")
      return c.json({ url: attempt.checkout_url });
    freshRetry(attempt.created_at);
    requirePayable(await milestone(c.env.DB, item.id), user.id);
    const checkoutRequest: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      customer_email: user.email,
      client_reference_id: attempt.id,
      line_items: [
        {
          price_data: {
            currency: "cad",
            unit_amount: attempt.amount_cents,
            product_data: { name: item.title },
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: "cad",
            unit_amount: attempt.fee_cents,
            product_data: { name: "SaladFinder service fee" },
          },
          quantity: 1,
        },
      ],
      metadata: { payment_attempt_id: attempt.id, milestone_id: item.id },
      payment_intent_data: {
        application_fee_amount: attempt.fee_cents,
        transfer_data: { destination: attempt.account_id },
        metadata: { payment_attempt_id: attempt.id, milestone_id: item.id },
      },
      success_url: `${c.env.APP_URL}/jobs/${item.job_id}?payment=returned`,
      cancel_url: `${c.env.APP_URL}/jobs/${item.job_id}?payment=cancelled`,
      expires_at: Math.floor(Date.parse(attempt.created_at) / 1000) + 23 * 3600,
    };
    await c.env.DB.prepare(
      "UPDATE payment_attempts SET request_json = ? WHERE id = ? AND request_json IS NULL",
    )
      .bind(JSON.stringify(checkoutRequest), attempt.id)
      .run();
    const savedRequest = (await c.env.DB.prepare(
      "SELECT request_json FROM payment_attempts WHERE id = ?",
    )
      .bind(attempt.id)
      .first<{ request_json: string }>())!;
    const session = await stripe.checkout.sessions.create(
      JSON.parse(
        savedRequest.request_json,
      ) as Stripe.Checkout.SessionCreateParams,
      { idempotencyKey: `checkout-${attempt.id}` },
    );
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE payment_attempts SET checkout_session_id = ?, checkout_url = ?, status = CASE WHEN status = 'creating' THEN 'open' ELSE status END, updated_at = ? WHERE id = ?",
      ).bind(session.id, session.url, now(), attempt.id),
      c.env.DB.prepare(
        "UPDATE milestones SET checkout_session_id = ? WHERE id = ?",
      ).bind(session.id, item.id),
    ]);
    // The job could have been reported while Stripe was creating the session.
    const latest = await milestone(c.env.DB, item.id);
    if (["disputed", "cancelled"].includes(latest.job_status)) {
      await suspendJobPayments(c.env, item.job_id, makeStripe);
      throw new HTTPException(409, {
        message: "Payments for this job were put on hold.",
      });
    }
    if (!session.url)
      throw new HTTPException(502, {
        message:
          "Stripe did not return a checkout link. Retry this same milestone.",
      });
    return c.json({ url: session.url });
  });

  router.post("/payments/payout", requireUser, async (c) => {
    const user = c.get("user")!;
    let operation: PayoutIntent | null = null;
    let requestId: string | undefined;
    let payoutInput:
      | {
          method: "instant" | "standard";
          amount_cents: number;
          requestId: string;
        }
      | undefined;
    let firstSubmission = false;
    let knownUncreated = false;
    try {
      assertPaymentAccess(c.env);
      await rateLimit(c, "payout", user.id, 20, 3600);
      const input = await body(
        c.req.raw,
        z.object({
          method: z.enum(["instant", "standard"]),
          amount_cents: z.number().int().positive().max(999900),
          requestId: z.uuid(),
        }),
      );
      requestId = input.requestId;
      payoutInput = input;
      if (!user.stripe_account_id)
        throw new HTTPException(409, { message: "Connect Stripe first." });
      const stripe = makeStripe(c.env);
      const stored = await c.env.DB.prepare(
        "SELECT * FROM payout_intents WHERE request_id = ?",
      )
        .bind(input.requestId)
        .first<PayoutIntent>();
      if (
        stored &&
        (stored.user_id !== user.id ||
          stored.account_id !== user.stripe_account_id ||
          stored.amount_cents !== input.amount_cents ||
          stored.method !== input.method)
      )
        throw new HTTPException(409, {
          message: "This request identifier belongs to a different payout.",
        });
      operation = stored;
      if (!stored) {
        const outstanding = await c.env.DB.prepare(
          "SELECT request_id FROM payout_intents WHERE user_id = ? AND status = 'creating' LIMIT 1",
        )
          .bind(user.id)
          .first();
        knownUncreated = !outstanding;
      }
      if (operation?.status === "rejected")
        throw new HTTPException(409, {
          message:
            "Stripe rejected this payout before creating it. Refresh your balance and start a new request.",
        });
      if (operation?.payout_id) {
        const payout = await stripe.payouts.retrieve(
          operation.payout_id,
          {},
          { stripeAccount: operation.account_id },
        );
        return c.json({ payout: compactPayout(payout) });
      }
      if (
        input.method === "instant" &&
        c.env.INSTANT_PAYOUTS_ENABLED !== "true"
      )
        throw new HTTPException(409, {
          message:
            "Instant payouts are unavailable on this platform. Choose a standard bank payout.",
        });
      if (await frozen(c.env.DB, user.id))
        throw new HTTPException(409, {
          message: "Payouts are paused while a reported job is reviewed.",
        });
      if (input.amount_cents < payoutLimits[input.method].minimum_cents)
        throw new HTTPException(400, {
          message: "The payout amount is below the supported minimum.",
        });
      const readiness = await connectedAccount(stripe, user.stripe_account_id);
      if (!readiness.payoutsEnabled || !readiness.transfersEnabled)
        throw new HTTPException(409, {
          message: "Stripe payouts are not enabled for this account.",
        });
      if (!operation) {
        const [balance, destinations, settings] = await Promise.all([
          stripe.balance.retrieve(
            { expand: ["instant_available.net_available"] },
            { stripeAccount: user.stripe_account_id },
          ),
          externalDestinations(stripe, user.stripe_account_id),
          stripe.balanceSettings.retrieve(
            {},
            { stripeAccount: user.stripe_account_id },
          ),
        ]);
        const options = eligibleDestinations(balance, destinations);
        let destination: string;
        if (input.method === "instant") {
          const eligible = options.instant.find(
            (value) => value.amount >= input.amount_cents,
          );
          if (!eligible)
            throw new HTTPException(409, {
              message:
                "No eligible instant destination has enough available funds. Choose a standard payout or try later.",
            });
          destination = eligible.destination;
        } else {
          if (settings.payments.payouts?.schedule?.interval !== "manual")
            throw new HTTPException(409, {
              message:
                "Complete payout setup to request standard bank payouts in SaladFinder.",
            });
          if (!options.standard)
            throw new HTTPException(409, {
              message:
                "Add an eligible CAD bank account in Stripe to request a standard bank payout.",
            });
          if (
            (balance.available.find((value) => value.currency === "cad")
              ?.amount ?? 0) < input.amount_cents
          )
            throw new HTTPException(409, {
              message: "The payout exceeds your available CAD balance.",
            });
          destination = options.standard.id;
        }
        knownUncreated = false;
        const inserted = await c.env.DB.prepare(
          "INSERT OR IGNORE INTO payout_intents (request_id,user_id,account_id,method,amount_cents,destination) VALUES (?,?,?,?,?,?)",
        )
          .bind(
            input.requestId,
            user.id,
            user.stripe_account_id,
            input.method,
            input.amount_cents,
            destination,
          )
          .run();
        firstSubmission = inserted.meta.changes === 1;
        const claimed = await c.env.DB.prepare(
          "SELECT * FROM payout_intents WHERE request_id = ?",
        )
          .bind(input.requestId)
          .first<PayoutIntent>();
        if (!claimed)
          throw new HTTPException(409, {
            message:
              "Another payout is processing. Retry its original request or contact support.",
          });
        // Another request may have claimed this identifier while Stripe was queried.
        if (
          claimed.user_id !== user.id ||
          claimed.account_id !== user.stripe_account_id ||
          claimed.method !== input.method ||
          claimed.amount_cents !== input.amount_cents
        )
          throw new HTTPException(409, {
            message: "This request identifier belongs to a different payout.",
          });
        operation = claimed;
        knownUncreated = false;
      }
      if (operation.status === "rejected")
        throw new HTTPException(409, {
          message:
            "Stripe rejected this payout before creating it. Refresh your balance and start a new request.",
        });
      freshRetry(operation.created_at);
      let payout: Stripe.Payout;
      try {
        payout = await stripe.payouts.create(
          {
            amount: operation.amount_cents,
            currency: "cad",
            method: operation.method,
            ...(operation.destination
              ? { destination: operation.destination }
              : {}),
            metadata: {
              request_id: operation.request_id,
              daywork_user_id: user.id,
            },
          },
          {
            stripeAccount: operation.account_id,
            idempotencyKey: `payout-${operation.request_id}`,
            // Surface the first ambiguous response so a later retry cannot be
            // mistaken for a definitive rejection of an unattempted payout.
            maxNetworkRetries: 0,
          },
        );
      } catch (error) {
        // Only explicit provider validation failures prove no payout was created.
        // Timeouts, 5xx and unrecognized failures keep the original request locked.
        if (
          firstSubmission &&
          error instanceof Stripe.errors.StripeInvalidRequestError &&
          error.statusCode === 400 &&
          [
            "balance_insufficient",
            "amount_too_small",
            "amount_too_large",
            "instant_payouts_config_disabled",
            "instant_payouts_limit_exceeded",
            "instant_payouts_unsupported",
            "payouts_limit_exceeded",
            "payouts_not_allowed",
          ].includes(error.code ?? "")
        ) {
          await c.env.DB.prepare(
            "UPDATE payout_intents SET status = 'rejected', updated_at = ? WHERE request_id = ? AND status = 'creating' AND payout_id IS NULL",
          )
            .bind(now(), operation.request_id)
            .run();
          operation = await c.env.DB.prepare(
            "SELECT * FROM payout_intents WHERE request_id = ?",
          )
            .bind(operation.request_id)
            .first<PayoutIntent>();
          throw new HTTPException(409, {
            message:
              "Stripe could not create this payout. Refresh your balance and eligibility before choosing a new payout request.",
          });
        }
        throw error;
      }
      if (
        payout.amount !== operation.amount_cents ||
        payout.currency !== "cad" ||
        payout.method !== operation.method ||
        (operation.destination &&
          objectId(payout.destination) !== operation.destination)
      )
        throw new Error("Payout response requires reconciliation.");
      await c.env.DB.prepare(
        "UPDATE payout_intents SET payout_id = ?, status = CASE WHEN status = 'creating' THEN ? ELSE status END, arrival_date = ?, updated_at = ? WHERE request_id = ?",
      )
        .bind(
          payout.id,
          payout.status,
          payout.arrival_date,
          now(),
          operation.request_id,
        )
        .run();
      return c.json({ payout: compactPayout(payout) });
    } catch (error) {
      if (knownUncreated && payoutInput && user.stripe_account_id) {
        // Claim an unsubmitted request as rejected before declaring a new UUID
        // safe. A concurrent caller must see that durable rejection before
        // submitting, or its existing intent wins and remains unresolved here.
        knownUncreated = false;
        try {
          await c.env.DB.prepare(
            "INSERT OR IGNORE INTO payout_intents (request_id,user_id,account_id,method,amount_cents,status) VALUES (?,?,?,?,?,'rejected')",
          )
            .bind(
              payoutInput.requestId,
              user.id,
              user.stripe_account_id,
              payoutInput.method,
              payoutInput.amount_cents,
            )
            .run();
          const winner = await c.env.DB.prepare(
            "SELECT * FROM payout_intents WHERE request_id = ?",
          )
            .bind(payoutInput.requestId)
            .first<PayoutIntent>();
          if (
            winner &&
            winner.user_id === user.id &&
            winner.account_id === user.stripe_account_id &&
            winner.method === payoutInput.method &&
            winner.amount_cents === payoutInput.amount_cents
          )
            operation = winner;
        } catch {
          // A failed lookup/write cannot establish that no payout was created.
        }
      }
      const unresolved = Boolean(
        operation && !operation.payout_id && operation.status !== "rejected",
      );
      const confirmed = Boolean(operation?.payout_id);
      const retryable = unresolved && canRetry(operation!.created_at);
      return c.json(
        {
          error:
            error instanceof HTTPException
              ? error.message
              : unresolved
                ? "The payout result is not yet confirmed. Retry only this same request or contact support; do not start a second payout."
                : "Unable to check payout information. Please try again.",
          payoutRequest: {
            state: unresolved
              ? "unresolved"
              : confirmed
                ? "confirmed"
                : operation?.status === "rejected"
                  ? "rejected"
                  : knownUncreated
                    ? "not_created"
                    : "unknown",
            ...(requestId ? { requestId } : {}),
            retryable,
            safeToRetryNew: knownUncreated || operation?.status === "rejected",
            reconciliationRequired: unresolved && !retryable,
          },
        },
        error instanceof HTTPException ? error.status : 503,
      );
    }
  });

  router.post("/admin/milestones/:id/refund", requireAdmin, async (c) => {
    assertPaymentAccess(c.env);
    const input = await body(
      c.req.raw,
      z.object({ reason: z.string().trim().min(5).max(1000) }),
    );
    const payment = await c.env.DB.prepare(
      "SELECT * FROM payment_attempts WHERE milestone_id = ? AND payment_intent_id IS NOT NULL AND status IN ('paid','disputed','refunded') ORDER BY attempt DESC LIMIT 1",
    )
      .bind(c.req.param("id"))
      .first<Payment>();
    if (!payment)
      throw new HTTPException(409, {
        message: "No successful payment is available to refund.",
      });
    const stripe = makeStripe(c.env);
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO refund_intents (payment_attempt_id,operation_id,requested_by,reason,amount_cents) VALUES (?,?,?,?,?)",
    )
      .bind(
        payment.id,
        crypto.randomUUID(),
        c.get("user")!.id,
        input.reason,
        payment.amount_cents + payment.fee_cents,
      )
      .run();
    const operation = (await c.env.DB.prepare(
      "SELECT * FROM refund_intents WHERE payment_attempt_id = ?",
    )
      .bind(payment.id)
      .first<RefundIntent>())!;
    let refund: Stripe.Refund;
    if (operation.refund_id)
      refund = await stripe.refunds.retrieve(operation.refund_id);
    else {
      freshRetry(operation.created_at);
      refund = await stripe.refunds.create(
        {
          payment_intent: payment.payment_intent_id!,
          reverse_transfer: true,
          refund_application_fee: true,
          metadata: {
            payment_attempt_id: payment.id,
            operation_id: operation.operation_id,
          },
        },
        { idempotencyKey: `refund-${operation.operation_id}` },
      );
    }
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE refund_intents SET refund_id = ?, status = CASE WHEN status = 'succeeded' THEN status ELSE ? END WHERE payment_attempt_id = ?",
      ).bind(refund.id, refund.status, payment.id),
      c.env.DB.prepare(
        "UPDATE jobs SET status = 'disputed' WHERE id = (SELECT job_id FROM milestones WHERE id = ?)",
      ).bind(payment.milestone_id),
      ...(refund.status === "succeeded"
        ? [
            c.env.DB.prepare(
              "UPDATE payment_attempts SET status = 'refunded', updated_at = ? WHERE id = ?",
            ).bind(now(), payment.id),
            c.env.DB.prepare(
              "UPDATE milestones SET status = 'refunded' WHERE id = ?",
            ).bind(payment.milestone_id),
          ]
        : []),
    ]);
    return c.json({
      refund: {
        id: refund.id,
        status: refund.status,
        amount_cents: refund.amount,
      },
    });
  });

  const webhook =
    (connected: boolean) => async (c: import("hono").Context<AppEnv>) => {
      const secret = connected
        ? c.env.STRIPE_CONNECT_WEBHOOK_SECRET
        : c.env.STRIPE_WEBHOOK_SECRET;
      if (!secret || !c.env.STRIPE_SECRET_KEY)
        throw new HTTPException(503, { message: "Webhook not configured." });
      const live = assertStripeMode(c.env) === "live";
      const raw = await c.req.text();
      const stripe = makeStripe(c.env);
      let event: Stripe.Event;
      try {
        event = await stripe.webhooks.constructEventAsync(
          raw,
          c.req.header("stripe-signature") ?? "",
          secret,
          undefined,
          Stripe.createSubtleCryptoProvider(),
        );
      } catch {
        throw new HTTPException(400, { message: "Invalid webhook signature." });
      }
      if (event.livemode !== live || Boolean(event.account) !== connected)
        throw new HTTPException(400, {
          message: "Wrong webhook mode or account scope.",
        });
      if (
        await c.env.DB.prepare("SELECT id FROM stripe_events WHERE id = ?")
          .bind(event.id)
          .first()
      )
        return c.json({ received: true, duplicate: true });
      const statements: D1PreparedStatement[] = [];
      const markEvent = c.env.DB.prepare(
        "INSERT OR IGNORE INTO stripe_events (id,type,account_id,created) VALUES (?,?,?,?)",
      ).bind(event.id, event.type, event.account ?? null, event.created);
      if (
        !connected &&
        (event.type === "checkout.session.completed" ||
          event.type === "checkout.session.async_payment_succeeded")
      ) {
        const session = event.data.object as Stripe.Checkout.Session;
        const payment = await c.env.DB.prepare(
          "SELECT * FROM payment_attempts WHERE id = ?",
        )
          .bind(session.metadata?.payment_attempt_id ?? "")
          .first<Payment>();
        if (payment && session.payment_status === "paid") {
          const intentId = objectId(session.payment_intent);
          if (!intentId)
            throw new HTTPException(400, {
              message: "Missing payment intent.",
            });
          const intent = await stripe.paymentIntents.retrieve(intentId, {
            expand: ["latest_charge"],
          });
          if (!validatePaidSession(session, intent, payment, live))
            throw new HTTPException(400, {
              message: "Payment reconciliation mismatch.",
            });
          const item = await milestone(c.env.DB, payment.milestone_id);
          const charge =
            typeof intent.latest_charge === "object"
              ? intent.latest_charge
              : null;
          if (!charge)
            throw new HTTPException(503, {
              message:
                "Payment charge reconciliation is incomplete. Retry this event.",
            });
          const refunded =
            charge?.amount_refunded ===
            payment.amount_cents + payment.fee_cents;
          const onHold =
            ["disputed", "cancelled"].includes(item.job_status) ||
            !["approved", "checkout_pending", "paid"].includes(item.status) ||
            Boolean(charge?.disputed || charge?.amount_refunded);
          if (onHold && !["refunded", "disputed"].includes(payment.status)) {
            statements.push(
              c.env.DB.prepare(
                "INSERT OR IGNORE INTO payment_incidents (id,event_id,payment_attempt_id,reason) VALUES (?,?,?,?)",
              ).bind(
                crypto.randomUUID(),
                event.id,
                payment.id,
                "Payment completed while job was held; admin review and possible refund required.",
              ),
            );
            statements.push(
              c.env.DB.prepare(
                "UPDATE jobs SET status = 'disputed' WHERE id = ?",
              ).bind(item.job_id),
            );
          }
          // Terminal refund/dispute state wins over a late duplicate payment event.
          statements.push(
            c.env.DB.prepare(
              "UPDATE payment_attempts SET status = CASE WHEN status = 'refunded' THEN status WHEN ? THEN 'refunded' WHEN status = 'disputed' THEN status ELSE ? END, payment_intent_id = ?, checkout_session_id = ?, updated_at = ? WHERE id = ?",
            ).bind(
              refunded ? 1 : 0,
              onHold ? "disputed" : "paid",
              intent.id,
              session.id,
              now(),
              payment.id,
            ),
          );
          statements.push(
            c.env.DB.prepare(
              "UPDATE milestones SET status = CASE WHEN status = 'refunded' OR ? THEN 'refunded' ELSE 'paid' END, payment_intent_id = ?, checkout_session_id = ?, paid_at = COALESCE(paid_at,?) WHERE id = ?",
            ).bind(
              refunded ? 1 : 0,
              intent.id,
              session.id,
              now(),
              payment.milestone_id,
            ),
          );
          statements.push(
            c.env.DB.prepare(
              "UPDATE jobs SET status = 'completed' WHERE id = ? AND status IN ('assigned','in_progress') AND NOT EXISTS (SELECT 1 FROM milestones WHERE job_id = ? AND status != 'paid')",
            ).bind(item.job_id, item.job_id),
          );
        }
      } else if (
        !connected &&
        (event.type === "checkout.session.expired" ||
          event.type === "checkout.session.async_payment_failed")
      ) {
        const session = event.data.object as Stripe.Checkout.Session;
        const payment = await c.env.DB.prepare(
          "SELECT * FROM payment_attempts WHERE checkout_session_id = ?",
        )
          .bind(session.id)
          .first<Payment>();
        if (payment) {
          // Async failure is not automatic permission to charge again: retain it for support reconciliation.
          statements.push(
            c.env.DB.prepare(
              "UPDATE payment_attempts SET status = ?, updated_at = ? WHERE id = ? AND status IN ('open','creating')",
            ).bind(
              event.type.endsWith("expired") ? "expired" : "failed",
              now(),
              payment.id,
            ),
          );
          if (event.type.endsWith("expired"))
            statements.push(
              c.env.DB.prepare(
                "UPDATE milestones SET status = 'approved' WHERE id = ? AND status = 'checkout_pending' AND checkout_session_id = ?",
              ).bind(payment.milestone_id, session.id),
            );
        }
      } else if (!connected && event.type.startsWith("charge.dispute.")) {
        const dispute = event.data.object as Stripe.Dispute;
        const payment = await paymentForIntent(
          c.env.DB,
          stripe,
          objectId(dispute.payment_intent),
        );
        if (payment) {
          statements.push(
            c.env.DB.prepare(
              "UPDATE jobs SET status = 'disputed' WHERE id = (SELECT job_id FROM milestones WHERE id = ?)",
            ).bind(payment.milestone_id),
          );
          statements.push(
            c.env.DB.prepare(
              "UPDATE payment_attempts SET status = CASE WHEN status = 'refunded' THEN status ELSE 'disputed' END, payment_intent_id = ?, updated_at = ? WHERE id = ?",
            ).bind(objectId(dispute.payment_intent), now(), payment.id),
          );
          statements.push(
            c.env.DB.prepare(
              "INSERT OR IGNORE INTO payment_incidents (id,event_id,payment_attempt_id,reason) VALUES (?,?,?,?)",
            ).bind(
              crypto.randomUUID(),
              event.id,
              payment.id,
              `Stripe dispute ${dispute.id}: ${dispute.status}; manual review required.`,
            ),
          );
        }
      } else if (!connected && event.type === "charge.refunded") {
        const notification = event.data.object as Stripe.Charge;
        const payment = await paymentForIntent(
          c.env.DB,
          stripe,
          objectId(notification.payment_intent),
        );
        if (payment) {
          const canonicalIntent = await stripe.paymentIntents.retrieve(
            objectId(notification.payment_intent)!,
            { expand: ["latest_charge"] },
          );
          const charge =
            typeof canonicalIntent.latest_charge === "object" &&
            canonicalIntent.latest_charge
              ? canonicalIntent.latest_charge
              : notification;
          const full =
            charge.amount_refunded === payment.amount_cents + payment.fee_cents;
          statements.push(
            c.env.DB.prepare(
              "UPDATE payment_attempts SET status = CASE WHEN status = 'refunded' THEN status ELSE ? END, payment_intent_id = ?, updated_at = ? WHERE id = ?",
            ).bind(
              full ? "refunded" : "disputed",
              objectId(notification.payment_intent),
              now(),
              payment.id,
            ),
          );
          if (full)
            statements.push(
              c.env.DB.prepare(
                "UPDATE milestones SET status = 'refunded' WHERE id = ?",
              ).bind(payment.milestone_id),
            );
          statements.push(
            c.env.DB.prepare(
              "UPDATE jobs SET status = 'disputed' WHERE id = (SELECT job_id FROM milestones WHERE id = ?)",
            ).bind(payment.milestone_id),
          );
        }
      } else if (
        !connected &&
        (event.type === "refund.updated" ||
          event.type === "refund.failed" ||
          event.type === "refund.created")
      ) {
        const notification = event.data.object as Stripe.Refund;
        const refund = await stripe.refunds.retrieve(notification.id);
        const operation = await c.env.DB.prepare(
          "SELECT * FROM refund_intents WHERE refund_id = ? OR operation_id = ?",
        )
          .bind(refund.id, refund.metadata?.operation_id ?? "")
          .first<RefundIntent>();
        if (operation) {
          statements.push(
            c.env.DB.prepare(
              "UPDATE refund_intents SET refund_id = ?, status = CASE WHEN status = 'succeeded' THEN status ELSE ? END WHERE payment_attempt_id = ?",
            ).bind(refund.id, refund.status, operation.payment_attempt_id),
          );
          if (refund.status === "succeeded") {
            statements.push(
              c.env.DB.prepare(
                "UPDATE payment_attempts SET status = 'refunded' WHERE id = ?",
              ).bind(operation.payment_attempt_id),
            );
            statements.push(
              c.env.DB.prepare(
                "UPDATE milestones SET status = 'refunded' WHERE id = (SELECT milestone_id FROM payment_attempts WHERE id = ?)",
              ).bind(operation.payment_attempt_id),
            );
          }
        }
      } else if (connected && event.type.startsWith("payout.")) {
        const notification = event.data.object as Stripe.Payout;
        const operation = await c.env.DB.prepare(
          "SELECT * FROM payout_intents WHERE payout_id = ? OR request_id = ?",
        )
          .bind(notification.id, notification.metadata?.request_id ?? "")
          .first<PayoutIntent>();
        if (operation && operation.account_id === event.account) {
          // Retrieve current Stripe state to prevent an older delivery from regressing a paid/failed payout.
          const payout = await stripe.payouts.retrieve(
            notification.id,
            {},
            { stripeAccount: event.account },
          );
          if (
            payout.amount !== operation.amount_cents ||
            payout.currency !== "cad" ||
            payout.method !== operation.method ||
            (operation.payout_id && payout.id !== operation.payout_id) ||
            (operation.destination &&
              objectId(payout.destination) !== operation.destination) ||
            payout.metadata?.request_id !== operation.request_id ||
            payout.metadata?.daywork_user_id !== operation.user_id
          )
            throw new HTTPException(400, {
              message: "Payout reconciliation mismatch.",
            });
          statements.push(
            c.env.DB.prepare(
              "UPDATE payout_intents SET payout_id = ?, status = ?, arrival_date = ?, updated_at = ? WHERE request_id = ?",
            ).bind(
              payout.id,
              payout.status,
              payout.arrival_date,
              now(),
              operation.request_id,
            ),
          );
        }
      }
      await c.env.DB.batch([...statements, markEvent]);
      return c.json({ received: true });
    };
  router.post("/webhooks/stripe", webhook(false));
  router.post("/webhooks/stripe-connect", webhook(true));
  return router;
}

export const payments = createPaymentsRouter();
