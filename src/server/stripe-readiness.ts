import type Stripe from "stripe";
import { assertStripeMode } from "./stripe-environment";

const paymentEvents = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "refund.created",
  "refund.updated",
  "refund.failed",
];
const payoutEvents = [
  "payout.created",
  "payout.updated",
  "payout.paid",
  "payout.failed",
  "payout.canceled",
];

/** Bounded, read-only diagnostics. Never return provider payloads, secrets or error messages. */
export async function stripeReadiness(stripe: Stripe, env: Env) {
  const live = assertStripeMode(env) === "live";
  const origin = new URL(env.APP_URL).origin;
  const probes = {
    platform: async () => {
      const account = await stripe.accounts.retrieve(null);
      return {
        ok:
          account.country === "CA" &&
          account.charges_enabled &&
          account.payouts_enabled,
        country: account.country,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
      };
    },
    accountsV2: async () => {
      await stripe.v2.core.accounts.list({ limit: 1 });
      return { ok: true };
    },
    balance: async () => {
      const balance = await stripe.balance.retrieve();
      return { ok: balance.livemode === live };
    },
    webhooks: async () => {
      const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
      const matches = (path: string, events: string[]) =>
        endpoints.data.some(
          (e) =>
            e.url === `${origin}${path}` &&
            e.status === "enabled" &&
            e.livemode === live &&
            e.api_version === "2026-10-28.endive" &&
            events.every(
              (event) =>
                e.enabled_events.includes("*") ||
                (e.enabled_events as string[]).includes(event),
            ),
        );
      const payments = matches("/api/webhooks/stripe", paymentEvents);
      const payouts = matches("/api/webhooks/stripe-connect", payoutEvents);
      return {
        ok: !endpoints.has_more && payments && payouts,
        payments,
        payouts,
        inventoryComplete: !endpoints.has_more,
      };
    },
  };
  const checks = Object.fromEntries(
    await Promise.all(
      Object.entries(probes).map(async ([name, probe]) => {
        try {
          return [name, await probe()] as const;
        } catch (error) {
          const status = (error as { statusCode?: unknown })?.statusCode;
          return [
            name,
            { ok: false, status: typeof status === "number" ? status : null },
          ] as const;
        }
      }),
    ),
  );
  return {
    checkedAt: new Date().toISOString(),
    liveMode: live,
    launchMode: env.LAUNCH_MODE,
    connectionChecksPassed: Object.values(checks).every((check) => check.ok),
    checks,
    limitation:
      "Read access and endpoint configuration only. This does not verify webhook delivery, write permissions, onboarding, charges, refunds, payouts or bank arrival.",
  };
}
