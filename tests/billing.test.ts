import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type Stripe from "stripe";
import { makeTestEnv } from "./helpers";
import {
  billingEvent,
  createBillingRouter,
  currentPlan,
  syncSubscription,
  billingReady,
} from "../src/server/billing";
import { transactionFee, milestoneQuote } from "../src/shared/pricing";
import type { AppEnv } from "../src/server/types";

it("calculates exact quotes for every tier, distinct roles and grandfathered agreements", () => {
  expect(milestoneQuote(10000, "standard", "standard")).toEqual({
    grossCents: 10000,
    posterFeeCents: 1590,
    workerFeeCents: 890,
    clientTotalCents: 11590,
    workerNetCents: 9110,
    applicationFeeCents: 2480,
  });
  expect(milestoneQuote(10000, "economy", "premium")).toMatchObject({
    posterFeeCents: 940,
    workerFeeCents: 520,
    workerNetCents: 9480,
  });
  expect(transactionFee(10000, "worker", "economy")).toBe(590);
  expect(transactionFee(10000, "poster", "premium")).toBe(520);
  expect(milestoneQuote(10000, "legacy", "legacy")).toMatchObject({
    posterFeeCents: 1300,
    workerFeeCents: 0,
  });
  expect(transactionFee(1, "poster", "standard")).toBe(300);
  expect(transactionFee(1, "poster", "economy")).toBe(150);
  expect(transactionFee(2501, "worker", "premium")).toBe(228);
  for (const amount of [-1, NaN, 1.1, 500001])
    expect(() => transactionFee(amount, "worker", "standard")).toThrow();
});

describe("subscription ownership, checkout and reconciliation", () => {
  let harness: Awaited<ReturnType<typeof makeTestEnv>>;
  let env: Env;
  let app: Hono<AppEnv>;
  let fake: any;
  const now = () => Math.floor(Date.now() / 1000);
  const sub = (overrides: object = {}) => ({
    id: "sub_one",
    customer: "cus_one",
    livemode: false,
    status: "active",
    created: 100,
    cancel_at_period_end: false,
    items: {
      data: [
        { price: { id: "price_economy" }, current_period_end: now() + 86400 },
      ],
    },
    latest_invoice: { status: "paid" },
    ...overrides,
  });
  const call = (path: string, body?: unknown, user = "one") =>
    app.fetch(
      new Request(`http://localhost${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", "x-user": user },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
    );
  async function account(overrides: object = {}) {
    await env.DB.prepare(
      "INSERT INTO billing_accounts(user_id,customer_id,customer_operation,customer_started_at) VALUES('one','cus_one','op_one',?)",
    )
      .bind(now())
      .run();
    for (const [key, value] of Object.entries(overrides))
      await env.DB.prepare(
        `UPDATE billing_accounts SET ${key}=? WHERE user_id='one'`,
      )
        .bind(value)
        .run();
  }
  beforeAll(async () => {
    harness = await makeTestEnv();
    env = harness.env;
    await env.DB.prepare(
      "INSERT INTO users(id,email,name,role,consent_at) VALUES('one','one@example.test','One','both','now'),('two','two@example.test','Two','both','now')",
    ).run();
  });
  afterAll(async () => harness.dispose());
  beforeEach(async () => {
    await env.DB.batch(
      [
        "billing_risk_events",
        "billing_checkouts",
        "billing_accounts",
        "rate_limits",
      ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
    );
    Object.assign(env, {
      LAUNCH_MODE: "live",
      STRIPE_MODE: "test",
      STRIPE_SECRET_KEY: "rk_test_fixture",
      STRIPE_WEBHOOK_SECRET: "secret",
      STRIPE_CONNECT_WEBHOOK_SECRET: "secret",
      SUBSCRIPTIONS_ENABLED: "true",
      STRIPE_ECONOMY_PRICE: "price_economy",
      STRIPE_PREMIUM_PRICE: "price_premium",
    });
    fake = {
      prices: {
        retrieve: vi.fn().mockResolvedValue({
          active: true,
          livemode: false,
          currency: "cad",
          unit_amount: 1000,
          recurring: { interval: "month", interval_count: 1 },
        }),
      },
      customers: { create: vi.fn().mockResolvedValue({ id: "cus_one" }) },
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue(sub()),
        list: vi.fn().mockResolvedValue({ data: [], has_more: false }),
      },
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({
            id: "cs_one",
            url: "https://checkout.stripe.com/test",
          }),
          retrieve: vi.fn().mockResolvedValue({
            status: "open",
            url: "https://checkout.stripe.com/test",
          }),
        },
      },
      billingPortal: {
        sessions: {
          create: vi
            .fn()
            .mockResolvedValue({ url: "https://billing.stripe.com/test" }),
        },
      },
      charges: {
        retrieve: vi
          .fn()
          .mockResolvedValue({ id: "ch_one", customer: "cus_one" }),
      },
    };
    app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      const id = c.req.header("x-user");
      c.set(
        "user",
        id
          ? {
              id,
              email: `${id}@example.test`,
              name: id,
              role: "both",
              bio: "",
              city: "",
              skills: [],
              created_at: "now",
              stripe_account_id: null,
              suspended_at: null,
            }
          : null,
      );
      await next();
    });
    app.route(
      "/",
      createBillingRouter(() => fake as Stripe),
    );
    app.onError((e, c) =>
      c.json({ error: e.message }, e instanceof HTTPException ? e.status : 500),
    );
  });
  it("reports Standard without an account and never leaks provider IDs", async () => {
    expect(await currentPlan(env.DB, "one")).toBe("standard");
    const r = await call("/billing/status");
    expect(await r.json()).toMatchObject({
      plan: "standard",
      ready: true,
      canManage: false,
    });
  });
  it("creates one customer and reuses immutable checkout and idempotency", async () => {
    expect((await call("/billing/checkout", { plan: "economy" })).status).toBe(
      200,
    );
    expect(fake.checkout.sessions.create.mock.calls[0][0]).toMatchObject({
      mode: "subscription",
      customer: "cus_one",
      line_items: [{ price: "price_economy", quantity: 1 }],
    });
    expect((await call("/billing/checkout", { plan: "economy" })).status).toBe(
      200,
    );
    expect(fake.customers.create).toHaveBeenCalledTimes(1);
    expect(fake.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(await currentPlan(env.DB, "one")).toBe("standard");
    expect((await call("/billing/checkout", { plan: "premium" })).status).toBe(
      503,
    );
  });
  it("does not trust a client customer ID or price ID for portal or purchase", async () => {
    await account();
    expect(
      (await call("/billing/portal", { customer: "cus_one" }, "two")).status,
    ).toBe(409);
    expect((await call("/billing/portal", {})).status).toBe(200);
    expect(fake.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_one",
      return_url: "http://localhost/account",
    });
    expect(
      (
        await call("/billing/checkout", {
          plan: "arbitrary",
          price: "price_economy",
        })
      ).status,
    ).toBe(400);
  });
  it.each([
    { active: false },
    { currency: "usd" },
    { livemode: true },
    { unit_amount: 999 },
    { recurring: { interval: "year", interval_count: 1 } },
    { recurring: { interval: "month", interval_count: 2 } },
  ])("rejects wrong provider price configuration %j", async (change) => {
    fake.prices.retrieve.mockResolvedValue({
      ...(await fake.prices.retrieve()),
      ...change,
    });
    expect((await call("/billing/checkout", { plan: "economy" })).status).toBe(
      503,
    );
    expect(fake.customers.create).not.toHaveBeenCalled();
  });
  it("gates disabled subscriptions and live launch", async () => {
    env.SUBSCRIPTIONS_ENABLED = "false";
    expect(billingReady(env)).toBe(false);
    expect((await call("/billing/checkout", { plan: "economy" })).status).toBe(
      503,
    );
    env.LAUNCH_MODE = "preview";
    expect((await call("/billing/checkout", { plan: "economy" })).status).toBe(
      503,
    );
  });
  it("rejects an existing subscription, blocked account or expired creation intent", async () => {
    await account();
    fake.subscriptions.list.mockResolvedValue({
      data: [{ status: "active" }],
      has_more: false,
    });
    expect((await call("/billing/checkout", { plan: "economy" })).status).toBe(
      409,
    );
    await env.DB.prepare("UPDATE billing_accounts SET blocked=1").run();
    expect((await call("/billing/checkout", { plan: "economy" })).status).toBe(
      409,
    );
    await env.DB.prepare(
      "UPDATE billing_accounts SET blocked=0,customer_id=NULL,customer_started_at=1",
    ).run();
    expect((await call("/billing/checkout", { plan: "economy" })).status).toBe(
      409,
    );
    expect(fake.customers.create).not.toHaveBeenCalled();
  });
  it("retries uncertain checkout creation with the original request key", async () => {
    fake.checkout.sessions.create.mockRejectedValueOnce(
      new Error("lost response"),
    );
    expect((await call("/billing/checkout", { plan: "economy" })).status).toBe(
      500,
    );
    env.STRIPE_ECONOMY_PRICE = "price_replacement";
    env.APP_URL = "http://localhost/new-origin";
    expect((await call("/billing/checkout", { plan: "economy" })).status).toBe(
      200,
    );
    expect(fake.checkout.sessions.create.mock.calls[0]).toEqual(
      fake.checkout.sessions.create.mock.calls[1],
    );
  });
  it("expires an old session before creating another and blocks completed sessions", async () => {
    await call("/billing/checkout", { plan: "economy" });
    fake.checkout.sessions.retrieve.mockResolvedValue({ status: "complete" });
    expect((await call("/billing/checkout", { plan: "economy" })).status).toBe(
      409,
    );
    fake.checkout.sessions.retrieve.mockResolvedValue({ status: "expired" });
    fake.checkout.sessions.create.mockResolvedValue({
      id: "cs_two",
      url: "https://checkout.stripe.com/two",
    });
    expect((await call("/billing/checkout", { plan: "economy" })).status).toBe(
      200,
    );
  });
  it("blocks different-plan or overdue uncertain checkouts", async () => {
    await account();
    await env.DB.prepare(
      "INSERT INTO billing_checkouts(id,user_id,plan,created_at) VALUES('attempt','one','premium',?)",
    )
      .bind(now())
      .run();
    expect((await call("/billing/checkout", { plan: "economy" })).status).toBe(
      409,
    );
    await env.DB.prepare(
      "UPDATE billing_checkouts SET plan='economy',created_at=1",
    ).run();
    expect((await call("/billing/checkout", { plan: "economy" })).status).toBe(
      409,
    );
  });
  it("only grants a paid active allowlisted subscription and expires without a webhook", async () => {
    await account();
    await syncSubscription(env, fake, "sub_one", "cus_one");
    expect(await currentPlan(env.DB, "one")).toBe("economy");
    await env.DB.prepare("UPDATE billing_accounts SET paid_until=1").run();
    expect(await currentPlan(env.DB, "one")).toBe("standard");
    for (const change of [
      { status: "past_due" },
      { latest_invoice: { status: "open" } },
      {
        items: {
          data: [{ price: { id: "unknown" }, current_period_end: now() + 100 }],
        },
      },
    ]) {
      fake.subscriptions.retrieve.mockResolvedValue(sub(change));
      await syncSubscription(env, fake, "sub_one", "cus_one");
      expect(await currentPlan(env.DB, "one")).toBe("standard");
    }
  });
  it("keeps paid cancellation-at-period-end benefits but revokes canceled subscriptions", async () => {
    await account();
    fake.subscriptions.retrieve.mockResolvedValue(
      sub({ cancel_at_period_end: true }),
    );
    await syncSubscription(env, fake, "sub_one", "cus_one");
    expect(await currentPlan(env.DB, "one")).toBe("economy");
    expect(await (await call("/billing/status")).json()).toMatchObject({
      cancelAtPeriodEnd: true,
    });
    fake.subscriptions.retrieve.mockResolvedValue(sub({ status: "canceled" }));
    await syncSubscription(env, fake, "sub_one", "cus_one");
    expect(await currentPlan(env.DB, "one")).toBe("standard");
  });
  it("handles Customer Portal cancel_at timestamps without the period-end flag", async () => {
    await account();
    const cancellation = now() + 3600;
    fake.subscriptions.retrieve.mockResolvedValue(
      sub({ cancel_at: cancellation, cancel_at_period_end: false }),
    );
    await syncSubscription(env, fake, "sub_one", "cus_one");
    expect(await (await call("/billing/status")).json()).toMatchObject({
      plan: "economy",
      paidUntil: cancellation,
      cancelAtPeriodEnd: true,
    });
    fake.subscriptions.retrieve.mockResolvedValue(
      sub({ cancel_at: now() - 1 }),
    );
    await syncSubscription(env, fake, "sub_one", "cus_one");
    expect(await currentPlan(env.DB, "one")).toBe("standard");
  });
  it("rejects missing customers, wrong ownership, mode and overlapping synchronization", async () => {
    await expect(
      syncSubscription(env, fake, "sub_one", "missing"),
    ).rejects.toThrow();
    await account();
    fake.subscriptions.retrieve.mockResolvedValue(sub({ customer: "other" }));
    await expect(
      syncSubscription(env, fake, "sub_one", "cus_one"),
    ).rejects.toThrow();
    fake.subscriptions.retrieve.mockResolvedValue(sub({ livemode: true }));
    await expect(
      syncSubscription(env, fake, "sub_one", "cus_one"),
    ).rejects.toThrow();
    await env.DB.prepare("UPDATE billing_accounts SET sync_until=?")
      .bind(now() + 100)
      .run();
    await expect(
      syncSubscription(env, fake, "sub_one", "cus_one"),
    ).rejects.toThrow();
  });
  it("requires webhook retry when its reconciliation lease expires", async () => {
    await account();
    fake.subscriptions.retrieve.mockImplementationOnce(async () => {
      await env.DB.prepare("UPDATE billing_accounts SET sync_until=0").run();
      return sub();
    });
    await expect(
      syncSubscription(env, fake, "sub_one", "cus_one"),
    ).rejects.toThrow("lease expired");
    expect(await currentPlan(env.DB, "one")).toBe("standard");
  });
  it("does not let a stale subscription replace a newer one", async () => {
    await account({ subscription_id: "sub_new" });
    fake.subscriptions.retrieve.mockImplementation(async (id: string) =>
      sub({
        id,
        created: id === "sub_new" ? 200 : 100,
        status: id === "sub_new" ? "active" : "canceled",
      }),
    );
    await syncSubscription(env, fake, "sub_old", "cus_one");
    expect(
      (
        await env.DB.prepare(
          "SELECT subscription_id FROM billing_accounts",
        ).first()
      )?.subscription_id,
    ).toBe("sub_new");
  });
  it("allows a new subscription after the previous one ended", async () => {
    await account({ subscription_id: "sub_old" });
    fake.subscriptions.retrieve.mockImplementation(async (id: string) =>
      sub({
        id,
        created: id === "sub_new" ? 200 : 100,
        status: id === "sub_old" ? "canceled" : "active",
      }),
    );
    await syncSubscription(env, fake, "sub_new", "cus_one");
    expect(await currentPlan(env.DB, "one")).toBe("economy");
  });
  const event = (type: string, object: object, extra: object = {}) =>
    ({ id: `evt_${type}`, type, data: { object }, ...extra }) as Stripe.Event;
  it("reconciles lifecycle and invoice events from current state rather than stale payloads", async () => {
    await account();
    expect(
      await billingEvent(
        env,
        fake,
        event("customer.subscription.updated", sub({ status: "canceled" })),
      ),
    ).toBe(true);
    expect(await currentPlan(env.DB, "one")).toBe("economy");
    expect(
      await billingEvent(
        env,
        fake,
        event("invoice.paid", {
          customer: "cus_one",
          parent: { subscription_details: { subscription: "sub_one" } },
        }),
      ),
    ).toBe(true);
    expect(
      await billingEvent(
        env,
        fake,
        event("invoice.payment_failed", {
          customer: "cus_one",
          parent: { subscription_details: { subscription: { id: "sub_one" } } },
        }),
      ),
    ).toBe(true);
    expect(await billingEvent(env, fake, event("invoice.paid", {}))).toBe(
      false,
    );
    await expect(
      billingEvent(
        env,
        fake,
        event("customer.subscription.updated", { id: "sub_one" }),
      ),
    ).rejects.toThrow();
  });
  it("verifies checkout ownership before granting benefits", async () => {
    await call("/billing/checkout", { plan: "economy" });
    const row = await env.DB.prepare("SELECT id FROM billing_checkouts").first<{
      id: string;
    }>();
    const object = {
      id: "cs_one",
      mode: "subscription",
      customer: "cus_one",
      subscription: "sub_one",
      payment_status: "paid",
      metadata: {
        purpose: "saladfinder_subscription",
        billing_checkout_id: row!.id,
      },
    };
    await expect(
      billingEvent(
        env,
        fake,
        event("checkout.session.completed", { ...object, customer: "other" }),
      ),
    ).rejects.toThrow();
    expect(
      await billingEvent(
        env,
        fake,
        event("checkout.session.completed", object),
      ),
    ).toBe(true);
    expect(await currentPlan(env.DB, "one")).toBe("economy");
    expect(
      await billingEvent(
        env,
        fake,
        event("checkout.session.completed", object),
      ),
    ).toBe(true);
  });
  it("expiration never grants benefits and unrelated events stay in their own handler", async () => {
    await call("/billing/checkout", { plan: "economy" });
    const row = await env.DB.prepare("SELECT id FROM billing_checkouts").first<{
      id: string;
    }>();
    expect(
      await billingEvent(
        env,
        fake,
        event("checkout.session.expired", {
          id: "cs_one",
          customer: "cus_one",
          mode: "subscription",
          metadata: {
            purpose: "saladfinder_subscription",
            billing_checkout_id: row!.id,
          },
        }),
      ),
    ).toBe(true);
    expect(await currentPlan(env.DB, "one")).toBe("standard");
    expect(
      await billingEvent(
        env,
        fake,
        event("checkout.session.completed", { mode: "payment" }),
      ),
    ).toBe(false);
    expect(
      await billingEvent(
        env,
        fake,
        event("customer.subscription.updated", sub(), {
          account: "acct_connected",
        }),
      ),
    ).toBe(false);
    expect(await billingEvent(env, fake, event("unrelated", {}))).toBe(false);
  });
  it.each([
    "charge.refunded",
    "charge.dispute.created",
    "radar.early_fraud_warning.created",
  ])(
    "freezes discounts on %s without letting later billing events unfreeze them",
    async (type) => {
      await account();
      await syncSubscription(env, fake, "sub_one", "cus_one");
      expect(
        await billingEvent(
          env,
          fake,
          event(type, { id: "ch_one", customer: "cus_one", charge: "ch_one" }),
        ),
      ).toBe(true);
      await syncSubscription(env, fake, "sub_one", "cus_one");
      expect(await currentPlan(env.DB, "one")).toBe("standard");
      expect(
        (
          await env.DB.prepare(
            "SELECT COUNT(*) AS n FROM billing_risk_events",
          ).first()
        )?.n,
      ).toBe(1);
    },
  );
  it("ignores nonbilling refund customers and missing charge references", async () => {
    expect(
      await billingEvent(
        env,
        fake,
        event("charge.refunded", { customer: null }),
      ),
    ).toBe(false);
    expect(
      await billingEvent(
        env,
        fake,
        event("charge.refunded", { customer: "unknown" }),
      ),
    ).toBe(false);
    expect(
      await billingEvent(env, fake, event("charge.dispute.created", {})),
    ).toBe(false);
  });
});
