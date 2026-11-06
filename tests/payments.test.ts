import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import Stripe from "stripe";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../src/server/types";
import type { User } from "../src/shared/types";
import {
  createPaymentsRouter,
  platformFee,
  suspendJobPayments,
} from "../src/server/payments";
import { originGuard } from "../src/server/middleware";
import { makeTestEnv } from "./helpers";

const provider = new Stripe("sk_test_payment_fixture");
const worker: User = {
  id: "worker",
  email: "worker@example.test",
  name: "Worker",
  role: "worker",
  bio: "",
  city: "Toronto",
  skills: [],
  created_at: "",
  stripe_account_id: "acct_worker",
  country: "CA",
  suspended_at: null,
};
const poster: User = {
  ...worker,
  id: "poster",
  email: "poster@example.test",
  name: "Client",
  role: "poster",
  stripe_account_id: null,
};
const admin: User = {
  ...poster,
  id: "admin",
  email: "admin@example.test",
  name: "Admin",
};
const people: Record<string, User> = { worker, poster, admin };

function fakeStripe(live = false) {
  const sessions = new Map<string, Stripe.Checkout.Session>();
  const intents = new Map<string, Stripe.PaymentIntent>();
  const payouts = new Map<string, Stripe.Payout>();
  const refunds = new Map<string, Stripe.Refund>();
  const accounts = new Map<string, { id: string }>();
  const stripe = {
    accounts: {
      retrieve: vi.fn(async () => ({
        id: "acct_worker",
        country: "CA",
        capabilities: { transfers: "active" },
        payouts_enabled: true,
        charges_enabled: false,
        details_submitted: true,
      })),
      createLoginLink: vi.fn(async () => ({
        url: "https://connect.stripe.com/fixture-dashboard",
      })),
      listExternalAccounts: vi.fn(async () => ({
        data: [
          {
            id: "card_eligible",
            object: "card",
            currency: "cad",
            available_payout_methods: ["instant", "standard"],
            default_for_currency: true,
          },
          {
            id: "ba_standard",
            object: "bank_account",
            currency: "cad",
            status: "new",
            available_payout_methods: ["standard"],
            default_for_currency: false,
          },
        ] as Stripe.ExternalAccount[],
        has_more: false,
      })),
    },
    v2: {
      core: {
        accounts: {
          retrieve: vi.fn(async () => ({
            id: "acct_worker",
            identity: { country: "ca" },
            configuration: {
              recipient: {
                capabilities: {
                  stripe_balance: {
                    stripe_transfers: { status: "active" },
                    payouts: { status: "active" },
                  },
                },
              },
            },
          })),
          create: vi.fn(
            async (_params: unknown, options: { idempotencyKey: string }) => {
              if (!accounts.has(options.idempotencyKey))
                accounts.set(options.idempotencyKey, { id: "acct_worker" });
              return accounts.get(options.idempotencyKey)!;
            },
          ),
        },
        accountLinks: {
          create: vi.fn(async () => ({
            url: "https://connect.stripe.com/fixture-onboarding",
          })),
        },
      },
    },
    balance: {
      retrieve: vi.fn(async () => ({
        available: [{ currency: "cad", amount: 100000 }],
        pending: [{ currency: "cad", amount: 5000 }],
        instant_available: [
          {
            currency: "cad",
            amount: 100000,
            net_available: [{ destination: "card_eligible", amount: 100000 }],
          },
        ],
        livemode: live,
      })),
    },
    balanceSettings: {
      retrieve: vi.fn(async () => ({
        payments: { payouts: { schedule: { interval: "manual" } } },
      })),
      update: vi.fn(async (_params: unknown, _options: unknown) => ({
        payments: { payouts: { schedule: { interval: "manual" } } },
      })),
    },
    checkout: {
      sessions: {
        create: vi.fn(
          async (
            params: Stripe.Checkout.SessionCreateParams,
            options: { idempotencyKey: string },
          ) => {
            const existing = [...sessions.values()].find(
              (s) => s.client_reference_id === options.idempotencyKey,
            );
            if (existing) return existing;
            const attempt = params.metadata!.payment_attempt_id as string;
            const intent = {
              id: `pi_${attempt}`,
              object: "payment_intent",
              amount: 11300,
              amount_received: 11300,
              currency: "cad",
              livemode: live,
              status: "succeeded",
              application_fee_amount:
                params.payment_intent_data!.application_fee_amount,
              transfer_data: params.payment_intent_data!.transfer_data,
              metadata: params.payment_intent_data!.metadata,
              latest_charge: {
                id: `ch_${attempt}`,
                amount_refunded: 0,
                disputed: false,
              },
            } as unknown as Stripe.PaymentIntent;
            intents.set(intent.id, intent);
            const session = {
              id: `cs_${attempt}`,
              object: "checkout.session",
              client_reference_id: options.idempotencyKey,
              status: "open",
              payment_status: "paid",
              mode: "payment",
              amount_total: 11300,
              currency: "cad",
              livemode: live,
              payment_intent: intent.id,
              metadata: params.metadata,
              url: `https://checkout.stripe.com/c/pay/${attempt}`,
            } as unknown as Stripe.Checkout.Session;
            sessions.set(session.id, session);
            return session;
          },
        ),
        retrieve: vi.fn(async (id: string) => sessions.get(id)!),
        expire: vi.fn(async (id: string) => {
          const session = sessions.get(id)!;
          session.status = "expired";
          return session;
        }),
      },
    },
    paymentIntents: { retrieve: vi.fn(async (id: string) => intents.get(id)!) },
    payouts: {
      create: vi.fn(
        async (
          params: Stripe.PayoutCreateParams,
          options: { idempotencyKey: string },
        ) => {
          const id = `po_${options.idempotencyKey}`;
          if (!payouts.has(id))
            payouts.set(id, {
              id,
              amount: params.amount,
              currency: "cad",
              method: params.method,
              destination: params.destination ?? "ba_standard",
              status: "pending",
              arrival_date: Math.floor(Date.now() / 1000) + 86400,
              created: Math.floor(Date.now() / 1000),
              metadata: params.metadata,
            } as Stripe.Payout);
          return payouts.get(id)!;
        },
      ),
      retrieve: vi.fn(async (id: string) => payouts.get(id)!),
      list: vi.fn(async () => ({ data: [...payouts.values()] })),
    },
    refunds: {
      create: vi.fn(
        async (
          params: Stripe.RefundCreateParams,
          options: { idempotencyKey: string },
        ) => {
          const id = `re_${options.idempotencyKey}`;
          if (!refunds.has(id))
            refunds.set(id, {
              id,
              status: "succeeded",
              amount: 11300,
              currency: "cad",
              payment_intent: params.payment_intent,
              metadata: params.metadata,
            } as Stripe.Refund);
          return refunds.get(id)!;
        },
      ),
      retrieve: vi.fn(async (id: string) => refunds.get(id)!),
    },
    webhooks: provider.webhooks,
  };
  return {
    stripe,
    sessions,
    intents,
    payouts,
    refunds,
    accounts,
    client: stripe as unknown as Stripe,
  };
}

describe("payment ownership, ledger and Stripe event reconciliation", () => {
  let harness: Awaited<ReturnType<typeof makeTestEnv>>;
  let env: Env;
  let fixture: ReturnType<typeof fakeStripe>;
  let app: Hono<AppEnv>;
  beforeAll(async () => {
    harness = await makeTestEnv();
    env = harness.env;
  });
  afterAll(async () => {
    await harness.dispose();
  });
  beforeEach(async () => {
    Object.assign(env, {
      APP_ENV: "local",
      STRIPE_MODE: "test",
      APP_URL: "http://localhost",
      LAUNCH_MODE: "live",
      INSTANT_PAYOUTS_ENABLED: "true",
      STRIPE_SECRET_KEY: "sk_test_payment_fixture",
      STRIPE_WEBHOOK_SECRET: "whsec_platform_fixture",
      STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_connect_fixture",
      ADMIN_EMAILS: admin.email,
    });
    await env.DB.batch(
      [
        "stripe_events",
        "payment_incidents",
        "refund_intents",
        "payout_intents",
        "payment_attempts",
        "connect_intents",
        "milestones",
        "jobs",
        "users",
        "rate_limits",
      ].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
    );
    await env.DB.batch(
      Object.values(people).map((u) =>
        env.DB.prepare(
          "INSERT INTO users (id,email,name,role,stripe_account_id,consent_at,country) VALUES (?,?,?,?,?,?,'CA')",
        ).bind(
          u.id,
          u.email,
          u.name,
          u.role,
          u.stripe_account_id,
          new Date().toISOString(),
        ),
      ),
    );
    await env.DB.prepare(
      "INSERT INTO jobs (id,poster_id,worker_id,title,description,category,city,start_date,estimated_hours,budget_cents,status,payment_schedule) VALUES ('job','poster','worker','Clean kitchen','Clean kitchen thoroughly','Cleaning','Toronto','2026-12-01',3,10000,'in_progress','completion')",
    ).run();
    await env.DB.prepare(
      "INSERT INTO milestones (id,job_id,title,amount_cents,position,status) VALUES ('milestone','job','Completed clean',10000,1,'approved')",
    ).run();
    fixture = fakeStripe();
    app = new Hono<AppEnv>();
    app.use("*", originGuard);
    app.use("*", async (c, next) => {
      const id = c.req.header("X-Test-User");
      c.set("user", id ? (people[id] ?? null) : null);
      await next();
    });
    app.route(
      "/api",
      createPaymentsRouter(() => fixture.client),
    );
    app.onError((error, c) =>
      error instanceof HTTPException
        ? c.json({ error: error.message }, error.status)
        : c.json({ error: error.message }, 500),
    );
  });
  const request = (
    path: string,
    user = "poster",
    body: unknown = {},
    method = "POST",
  ) =>
    app.request(
      `http://localhost/api${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
          "X-Test-User": user,
        },
        ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
      },
      env,
    );
  const row = <T = { status: string }>(query: string) =>
    env.DB.prepare(query).first<T>();
  async function checkout() {
    const response = await request("/milestones/milestone/checkout");
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      200,
    );
    return [...fixture.sessions.values()][0]!;
  }
  async function notify(
    type: string,
    object: unknown,
    options: {
      id?: string;
      account?: string;
      live?: boolean;
      connected?: boolean;
      invalidSignature?: boolean;
    } = {},
  ) {
    const payload = JSON.stringify({
      id: options.id ?? crypto.randomUUID(),
      object: "event",
      type,
      created: Math.floor(Date.now() / 1000),
      livemode: options.live ?? false,
      ...(options.account ? { account: options.account } : {}),
      data: { object },
    });
    const signature = provider.webhooks.generateTestHeaderString({
      payload,
      secret: options.invalidSignature
        ? "wrong"
        : options.connected
          ? env.STRIPE_CONNECT_WEBHOOK_SECRET!
          : env.STRIPE_WEBHOOK_SECRET!,
    });
    return app.request(
      `http://localhost/api/webhooks/stripe${options.connected ? "-connect" : ""}`,
      {
        method: "POST",
        body: payload,
        headers: { "Stripe-Signature": signature },
      },
      env,
    );
  }

  it("collects both recorded fees, preserves retries, and reconciles the exact combined application fee", async () => {
    await env.DB.prepare(
      "UPDATE milestones SET fee_cents=1590,worker_fee_cents=890 WHERE id='milestone'",
    ).run();
    const session = await checkout();
    const params = fixture.stripe.checkout.sessions.create.mock.calls[0]![0];
    expect(params.payment_intent_data?.application_fee_amount).toBe(2480);
    expect(params.line_items?.[1].price_data?.unit_amount).toBe(1590);
    expect(
      await row(
        "SELECT amount_cents,fee_cents,worker_fee_cents FROM payment_attempts",
      ),
    ).toMatchObject({
      amount_cents: 10000,
      fee_cents: 1590,
      worker_fee_cents: 890,
    });
    await env.DB.prepare(
      "UPDATE milestones SET fee_cents=9999,worker_fee_cents=9999 WHERE id='milestone'",
    ).run();
    expect((await request("/milestones/milestone/checkout")).status).toBe(200);
    expect(fixture.stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    session.amount_total = 11590;
    const intent = fixture.intents.get(session.payment_intent as string)!;
    intent.amount = 11590;
    intent.amount_received = 11590;
    expect((await notify("checkout.session.completed", session)).status).toBe(
      200,
    );
    expect(await row("SELECT status FROM payment_attempts")).toMatchObject({
      status: "paid",
    });
  });

  // One scenario, one router and one ledger implementation. Only the deployment
  // mode, credential and provider object mode change; no real Stripe calls here.
  it.each(["test", "live"] as const)(
    "runs the identical onboarding, Checkout, payout and refund lifecycle in %s mode",
    async (mode) => {
      const live = mode === "live";
      env.APP_ENV = live ? "production" : "staging";
      env.STRIPE_MODE = mode;
      env.STRIPE_SECRET_KEY = `rk_${mode}_parity_fixture`;
      fixture = fakeStripe(live);
      const originalAccount = worker.stripe_account_id;
      try {
        worker.stripe_account_id = null;
        await env.DB.prepare(
          "UPDATE users SET stripe_account_id = NULL WHERE id = 'worker'",
        ).run();
        expect((await request("/payments/onboard", "worker")).status).toBe(200);
        expect((await request("/payments/onboard", "worker")).status).toBe(200);
        expect(fixture.accounts.size).toBe(1);
        expect(fixture.stripe.v2.core.accounts.create).toHaveBeenCalledTimes(1);
        expect(
          fixture.stripe.v2.core.accounts.create.mock.calls[0]![0],
        ).toMatchObject({
          dashboard: "express",
          identity: { country: "ca" },
          configuration: {
            recipient: {
              capabilities: {
                stripe_balance: { stripe_transfers: { requested: true } },
              },
            },
          },
        });
        expect(
          await row(
            "SELECT account_id FROM connect_intents WHERE user_id = 'worker'",
          ),
        ).toMatchObject({ account_id: "acct_worker" });
      } finally {
        worker.stripe_account_id = originalAccount;
      }
      const status = await (
        await request("/payments/status", "worker", {}, "GET")
      ).json();
      expect(status).toMatchObject({
        configured: true,
        testMode: !live,
        accountReady: true,
        defaultPayoutMethod: "instant",
        standardEligible: true,
      });
      expect(
        (await request("/milestones/milestone/checkout", "worker")).status,
      ).toBe(403);
      const session = await checkout();
      await checkout();
      expect(fixture.sessions.size).toBe(1);
      expect(
        fixture.stripe.checkout.sessions.create.mock.calls[0]![0]
          .payment_intent_data,
      ).toMatchObject({
        application_fee_amount: 1300,
        transfer_data: { destination: "acct_worker" },
      });
      expect(await row("SELECT status FROM milestones")).toMatchObject({
        status: "checkout_pending",
      });
      expect(
        (await notify("checkout.session.completed", session, { live: !live }))
          .status,
      ).toBe(400);
      expect(
        (
          await notify("checkout.session.completed", session, {
            live,
            invalidSignature: true,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await notify("checkout.session.completed", session, {
            live,
            id: "evt_parity_paid",
          })
        ).status,
      ).toBe(200);
      expect(
        await (
          await notify("checkout.session.completed", session, {
            live,
            id: "evt_parity_paid",
          })
        ).json(),
      ).toMatchObject({ duplicate: true });
      expect(await row("SELECT status FROM payment_attempts")).toMatchObject({
        status: "paid",
      });
      expect(await row("SELECT status FROM jobs")).toMatchObject({
        status: "completed",
      });
      for (const method of ["instant", "standard"] as const) {
        const input = {
          method,
          amount_cents: 1000,
          requestId: crypto.randomUUID(),
        };
        expect(
          (await request("/payments/payout", "poster", input)).status,
        ).toBe(409);
        expect(
          (await request("/payments/payout", "worker", input)).status,
        ).toBe(200);
        expect(
          (await request("/payments/payout", "worker", input)).status,
        ).toBe(200);
        const payout = [...fixture.payouts.values()].find(
          (p) => p.method === method,
        )!;
        expect(payout.destination).toBe(
          method === "instant" ? "card_eligible" : "ba_standard",
        );
        payout.status = "paid";
        const event = {
          live,
          connected: true,
          account: "acct_worker",
          id: `evt_parity_${method}`,
        };
        expect((await notify("payout.paid", payout, event)).status).toBe(200);
        expect(
          await (await notify("payout.paid", payout, event)).json(),
        ).toMatchObject({ duplicate: true });
        // An older event cannot regress canonical provider state.
        expect(
          (
            await notify(
              "payout.created",
              { ...payout, status: "pending" },
              { ...event, id: event.id + "_late" },
            )
          ).status,
        ).toBe(200);
        expect(
          await row(
            `SELECT status FROM payout_intents WHERE request_id = '${input.requestId}'`,
          ),
        ).toMatchObject({ status: "paid" });
      }
      expect(fixture.payouts.size).toBe(2);
      expect(
        (
          await request("/admin/milestones/milestone/refund", "poster", {
            reason: "Parity refund",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await request("/admin/milestones/milestone/refund", "admin", {
            reason: "Parity refund",
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await request("/admin/milestones/milestone/refund", "admin", {
            reason: "Parity refund retry",
          })
        ).status,
      ).toBe(200);
      expect(fixture.refunds.size).toBe(1);
      expect(fixture.stripe.refunds.create.mock.calls[0]![0]).toMatchObject({
        reverse_transfer: true,
        refund_application_fee: true,
      });
      expect(await row("SELECT status FROM refund_intents")).toMatchObject({
        status: "succeeded",
      });
      expect(await row("SELECT status FROM milestones")).toMatchObject({
        status: "refunded",
      });
      expect(
        (await notify("checkout.session.completed", session, { live })).status,
      ).toBe(200);
      expect(await row("SELECT status FROM milestones")).toMatchObject({
        status: "refunded",
      });
    },
  );

  it.each(["test", "live"] as const)(
    "rejects mismatched credentials before any provider call in %s mode, including preview reconciliation",
    async (mode) => {
      env.STRIPE_MODE = mode;
      env.STRIPE_SECRET_KEY =
        mode === "test" ? "rk_live_fixture" : "rk_test_fixture";
      for (const path of [
        "/payments/onboard",
        "/payments/dashboard",
        "/milestones/milestone/checkout",
      ]) {
        expect((await request(path, "worker")).status).toBe(503);
      }
      expect(
        await (await request("/payments/status", "worker", {}, "GET")).json(),
      ).toMatchObject({ configured: false, accountReady: false });
      env.LAUNCH_MODE = "preview";
      expect(
        (await notify("customer.created", { id: "cus_fake" })).status,
      ).toBe(503);
      await expect(
        suspendJobPayments(env, "job", () => fixture.client),
      ).rejects.toThrow("configured payment mode");
      expect(fixture.stripe.v2.core.accounts.retrieve).not.toHaveBeenCalled();
      expect(fixture.stripe.balance.retrieve).not.toHaveBeenCalled();
      expect(fixture.stripe.checkout.sessions.create).not.toHaveBeenCalled();
      expect(fixture.stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
      expect(
        await row("SELECT COUNT(*) AS count FROM stripe_events"),
      ).toMatchObject({ count: 0 });
    },
  );

  it("calculates the posted fee in integer cents including its minimum", () => {
    expect(platformFee(10000)).toBe(1300);
    expect(platformFee(100)).toBe(300);
    expect(platformFee(2501)).toBe(400);
  });

  it("fails closed without a session, in preview, or with test keys in production", async () => {
    expect((await request("/milestones/milestone/checkout", "")).status).toBe(
      401,
    );
    env.LAUNCH_MODE = "preview";
    expect((await request("/milestones/milestone/checkout")).status).toBe(503);
    env.LAUNCH_MODE = "live";
    env.APP_ENV = "production";
    env.STRIPE_MODE = "live";
    expect((await request("/milestones/milestone/checkout")).status).toBe(503);
    expect(fixture.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("blocks a foreign origin and prevents workers paying their own assigned milestone", async () => {
    expect(
      (
        await app.request(
          "http://localhost/api/milestones/milestone/checkout",
          {
            method: "POST",
            headers: {
              Origin: "https://attacker.example",
              "Content-Type": "application/json",
              "X-Test-User": "poster",
            },
            body: "{}",
          },
          env,
        )
      ).status,
    ).toBe(403);
    expect(
      (await request("/milestones/milestone/checkout", "worker")).status,
    ).toBe(403);
    expect(fixture.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("requires approval and a payout-ready Canadian worker account", async () => {
    await env.DB.prepare("UPDATE milestones SET status = 'submitted'").run();
    expect((await request("/milestones/milestone/checkout")).status).toBe(409);
    await env.DB.prepare("UPDATE milestones SET status = 'approved'").run();
    fixture.stripe.v2.core.accounts.retrieve.mockResolvedValue({
      id: "acct_worker",
      identity: { country: "ca" },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { status: "active" },
              payouts: { status: "restricted" },
            },
          },
        },
      },
    });
    expect((await request("/milestones/milestone/checkout")).status).toBe(409);
  });

  it("persists a single attempt under concurrent checkout requests and charges the server-computed amount", async () => {
    const responses = await Promise.all([
      request("/milestones/milestone/checkout"),
      request("/milestones/milestone/checkout"),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(
      (await row<{ count: number }>(
        "SELECT COUNT(*) AS count FROM payment_attempts",
      ))!.count,
    ).toBe(1);
    expect(fixture.sessions.size).toBe(1);
    expect(
      fixture.stripe.checkout.sessions.create.mock.calls[0]![0]
        .payment_intent_data,
    ).toMatchObject({
      application_fee_amount: 1300,
      transfer_data: { destination: "acct_worker" },
    });
    expect(
      (await row("SELECT status FROM milestones WHERE id = 'milestone'"))!
        .status,
    ).toBe("checkout_pending");
  });

  it("marks the job complete only after a signed verified payment and tolerates duplicate delivery", async () => {
    const session = await checkout();
    const response = await notify("checkout.session.completed", session, {
      id: "evt_paid",
    });
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      200,
    );
    expect(
      (await row("SELECT status FROM milestones WHERE id = 'milestone'"))!
        .status,
    ).toBe("paid");
    expect(
      (await row("SELECT status FROM jobs WHERE id = 'job'"))!.status,
    ).toBe("completed");
    const duplicate = await notify("checkout.session.completed", session, {
      id: "evt_paid",
    });
    expect(await duplicate.json()).toMatchObject({
      received: true,
      duplicate: true,
    });
    expect(
      (await row<{ count: number }>(
        "SELECT COUNT(*) AS count FROM stripe_events",
      ))!.count,
    ).toBe(1);
  });

  it("rejects signature, mode and account-scope violations", async () => {
    const session = await checkout();
    expect(
      (
        await notify("checkout.session.completed", session, {
          invalidSignature: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (await notify("checkout.session.completed", session, { live: true }))
        .status,
    ).toBe(400);
    expect(
      (
        await notify("checkout.session.completed", session, {
          account: "acct_foreign",
        })
      ).status,
    ).toBe(400);
    expect(
      (await row("SELECT status FROM milestones WHERE id = 'milestone'"))!
        .status,
    ).toBe("checkout_pending");
  });

  it.each(["amount", "currency", "destination", "fee"])(
    "rejects a %s mismatch against the durable checkout intent",
    async (field) => {
      const session = await checkout();
      const intent = fixture.intents.get(session.payment_intent as string)!;
      if (field === "amount") intent.amount_received = 1;
      if (field === "currency") intent.currency = "usd";
      if (field === "destination")
        intent.transfer_data!.destination = "acct_attacker";
      if (field === "fee") intent.application_fee_amount = 1;
      expect((await notify("checkout.session.completed", session)).status).toBe(
        400,
      );
      expect(
        (await row("SELECT status FROM milestones WHERE id = 'milestone'"))!
          .status,
      ).toBe("checkout_pending");
    },
  );

  it("handles a full refund delivered before Checkout success without resurrecting payment", async () => {
    const session = await checkout();
    const intent = fixture.intents.get(session.payment_intent as string)!;
    const charge = {
      id: "ch_refunded",
      payment_intent: intent.id,
      amount_refunded: 11300,
      disputed: false,
    } as Stripe.Charge;
    intent.latest_charge = charge;
    expect((await notify("charge.refunded", charge)).status).toBe(200);
    expect((await notify("checkout.session.completed", session)).status).toBe(
      200,
    );
    expect((await row("SELECT status FROM payment_attempts"))!.status).toBe(
      "refunded",
    );
    expect((await row("SELECT status FROM milestones"))!.status).toBe(
      "refunded",
    );
    expect((await row("SELECT status FROM jobs"))!.status).toBe("disputed");
  });

  it("freezes a disputed payment even when the dispute arrives before payment success", async () => {
    const session = await checkout();
    const intent = fixture.intents.get(session.payment_intent as string)!;
    (intent.latest_charge as Stripe.Charge).disputed = true;
    expect(
      (
        await notify("charge.dispute.created", {
          id: "dp_one",
          payment_intent: intent.id,
          status: "needs_response",
        })
      ).status,
    ).toBe(200);
    expect((await notify("checkout.session.completed", session)).status).toBe(
      200,
    );
    expect((await row("SELECT status FROM payment_attempts"))!.status).toBe(
      "disputed",
    );
    expect((await row("SELECT status FROM jobs"))!.status).toBe("disputed");
    expect(
      (
        await request("/payments/payout", "worker", {
          method: "standard",
          amount_cents: 1000,
          requestId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(409);
  });

  it("expires a held checkout and records a concurrent completed charge for review", async () => {
    const session = await checkout();
    await env.DB.prepare("UPDATE jobs SET status = 'disputed'").run();
    await suspendJobPayments(env, "job", () => fixture.client);
    expect(fixture.stripe.checkout.sessions.expire).toHaveBeenCalledWith(
      session.id,
      {},
      expect.anything(),
    );
    expect((await request("/milestones/milestone/checkout")).status).toBe(409);
    expect((await notify("checkout.session.completed", session)).status).toBe(
      200,
    );
    expect(
      (await row<{ count: number }>(
        "SELECT COUNT(*) AS count FROM payment_incidents",
      ))!.count,
    ).toBe(1);
    expect((await row("SELECT status FROM jobs"))!.status).toBe("disputed");
  });

  it("creates a replacement only after the existing Checkout session is confirmed expired", async () => {
    const session = await checkout();
    session.status = "complete";
    expect((await request("/milestones/milestone/checkout")).status).toBe(409);
    session.status = "expired";
    expect((await request("/milestones/milestone/checkout")).status).toBe(200);
    expect(fixture.sessions.size).toBe(2);
  });

  it("blocks ambiguous retries outside Stripe’s idempotency retention window", async () => {
    fixture.stripe.checkout.sessions.create.mockRejectedValueOnce(
      new Error("ambiguous network timeout"),
    );
    expect((await request("/milestones/milestone/checkout")).status).toBe(500);
    await env.DB.prepare(
      "UPDATE payment_attempts SET created_at = '2026-01-01T00:00:00Z'",
    ).run();
    expect((await request("/milestones/milestone/checkout")).status).toBe(409);
    expect(fixture.stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it("retries the exact saved Checkout payload after a timeout even if the app URL changes", async () => {
    fixture.stripe.checkout.sessions.create.mockRejectedValueOnce(
      new Error("network timeout"),
    );
    expect((await request("/milestones/milestone/checkout")).status).toBe(500);
    const firstPayload =
      fixture.stripe.checkout.sessions.create.mock.calls[0]![0];
    env.APP_URL = "https://new.example.test";
    expect((await request("/milestones/milestone/checkout")).status).toBe(200);
    expect(fixture.stripe.checkout.sessions.create.mock.calls[1]![0]).toEqual(
      firstPayload,
    );
    expect(fixture.stripe.checkout.sessions.create.mock.calls[1]![1]).toEqual(
      fixture.stripe.checkout.sessions.create.mock.calls[0]![1],
    );
  });

  it("does not let a delayed expiration event reset the replacement checkout", async () => {
    const first = await checkout();
    first.status = "expired";
    expect((await request("/milestones/milestone/checkout")).status).toBe(200);
    expect((await notify("checkout.session.expired", first)).status).toBe(200);
    expect((await row("SELECT status FROM milestones"))!.status).toBe(
      "checkout_pending",
    );
  });

  it("holds failed asynchronous payments for reconciliation without creating another charge", async () => {
    const session = await checkout();
    expect(
      (await notify("checkout.session.async_payment_failed", session)).status,
    ).toBe(200);
    expect((await request("/milestones/milestone/checkout")).status).toBe(409);
    expect((await row("SELECT status FROM payment_attempts"))!.status).toBe(
      "failed",
    );
    expect(fixture.sessions.size).toBe(1);
  });

  it("checks payout balance and instant destination eligibility before making a payout", async () => {
    expect(
      (
        await request("/payments/payout", "worker", {
          method: "standard",
          amount_cents: 100001,
          requestId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(409);
    fixture.stripe.balance.retrieve.mockResolvedValue({
      available: [{ currency: "cad", amount: 100000 }],
      pending: [],
      instant_available: [],
      livemode: false,
    });
    expect(
      (
        await request("/payments/payout", "worker", {
          method: "instant",
          amount_cents: 1000,
          requestId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect(fixture.stripe.payouts.create).not.toHaveBeenCalled();
  });

  it("pays an eligible instant destination once and rejects reuse with a different amount", async () => {
    const input = {
      method: "instant",
      amount_cents: 1000,
      requestId: crypto.randomUUID(),
    };
    expect((await request("/payments/payout", "worker", input)).status).toBe(
      200,
    );
    expect((await request("/payments/payout", "worker", input)).status).toBe(
      200,
    );
    expect(
      (
        await request("/payments/payout", "worker", {
          ...input,
          amount_cents: 2000,
        })
      ).status,
    ).toBe(409);
    expect(fixture.stripe.payouts.create).toHaveBeenCalledTimes(1);
    expect(fixture.stripe.payouts.create.mock.calls[0]![0]).toMatchObject({
      destination: "card_eligible",
      amount: 1000,
      currency: "cad",
      method: "instant",
    });
  });

  it("rejects concurrent reuse of a payout request identifier for different amounts", async () => {
    const requestId = crypto.randomUUID();
    const responses = await Promise.all([
      request("/payments/payout", "worker", {
        method: "standard",
        amount_cents: 1000,
        requestId,
      }),
      request("/payments/payout", "worker", {
        method: "standard",
        amount_cents: 2000,
        requestId,
      }),
    ]);
    expect(responses.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(fixture.payouts.size).toBe(1);
  });

  it("retains a durable payout request on ambiguity and refuses a second outstanding request", async () => {
    fixture.stripe.payouts.create.mockRejectedValueOnce(
      new Error("network timeout"),
    );
    const input = {
      method: "standard",
      amount_cents: 1000,
      requestId: crypto.randomUUID(),
    };
    expect((await request("/payments/payout", "worker", input)).status).toBe(
      503,
    );
    expect(
      (
        await request("/payments/payout", "worker", {
          ...input,
          requestId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect((await request("/payments/payout", "worker", input)).status).toBe(
      200,
    );
    expect(fixture.stripe.payouts.create.mock.calls[1]![1]).toEqual(
      fixture.stripe.payouts.create.mock.calls[0]![1],
    );
    expect(fixture.payouts.size).toBe(1);
  });

  it("rejects invalid payout sizes, malformed identifiers and requests without an account", async () => {
    expect(
      (
        await request("/payments/payout", "worker", {
          method: "instant",
          amount_cents: 50,
          requestId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/payments/payout", "worker", {
          method: "standard",
          amount_cents: 500,
          requestId: "not-uuid",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/payments/payout", "poster", {
          method: "standard",
          amount_cents: 1000,
          requestId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(409);
  });

  it("reconciles an out-of-order payout notification against current Stripe state", async () => {
    await request("/payments/payout", "worker", {
      method: "standard",
      amount_cents: 1000,
      requestId: crypto.randomUUID(),
    });
    const payout = [...fixture.payouts.values()][0]!;
    payout.status = "paid";
    expect(
      (
        await notify(
          "payout.created",
          { ...payout, status: "pending" },
          { account: "acct_worker", connected: true },
        )
      ).status,
    ).toBe(200);
    expect((await row("SELECT status FROM payout_intents"))!.status).toBe(
      "paid",
    );
  });

  it("allows only admins to refund and reverses both the transfer and platform fee", async () => {
    const session = await checkout();
    await notify("checkout.session.completed", session);
    expect(
      (
        await request("/admin/milestones/milestone/refund", "poster", {
          reason: "Agreed cancellation",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/admin/milestones/milestone/refund", "admin", {
          reason: "Agreed cancellation",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("/admin/milestones/milestone/refund", "admin", {
          reason: "Agreed cancellation",
        })
      ).status,
    ).toBe(200);
    expect(fixture.stripe.refunds.create).toHaveBeenCalledTimes(1);
    expect(fixture.stripe.refunds.create.mock.calls[0]![0]).toMatchObject({
      reverse_transfer: true,
      refund_application_fee: true,
    });
    const refund = [...fixture.refunds.values()][0]!;
    expect(
      (await notify("refund.updated", { ...refund, status: "pending" })).status,
    ).toBe(200);
    expect((await row("SELECT status FROM refund_intents"))!.status).toBe(
      "succeeded",
    );
    expect((await row("SELECT status FROM milestones"))!.status).toBe(
      "refunded",
    );
  });

  it("gates foreign onboarding and keeps international settlement outside the CAD payout form", async () => {
    const original = worker.stripe_account_id;
    const flag = env.CROSS_BORDER_PAYOUTS_ENABLED;
    try {
      worker.country = "FR";
      worker.stripe_account_id = null;
      await env.DB.prepare("UPDATE users SET stripe_account_id=NULL,country='FR' WHERE id='worker'").run();
      env.CROSS_BORDER_PAYOUTS_ENABLED = "false";
      expect((await request("/payments/onboard","worker")).status).toBe(409);
      expect(fixture.stripe.v2.core.accounts.create).not.toHaveBeenCalled();
      env.CROSS_BORDER_PAYOUTS_ENABLED = "true";
      expect((await request("/payments/onboard","worker")).status).toBe(200);
      expect(fixture.stripe.v2.core.accounts.create.mock.calls[0]![0]).toMatchObject({
        identity:{country:"fr"},configuration:{merchant:{capabilities:{card_payments:{requested:true}}},recipient:{capabilities:{stripe_balance:{stripe_transfers:{requested:true}}}}}
      });
      expect(fixture.stripe.balanceSettings.update).not.toHaveBeenCalled();
      worker.stripe_account_id=original;
      expect((await request("/payments/payout","worker",{method:"standard",amount_cents:2500,requestId:crypto.randomUUID()})).status).toBe(409);
      expect(fixture.stripe.payouts.create).not.toHaveBeenCalled();
    }finally{worker.country="CA";worker.stripe_account_id=original;env.CROSS_BORDER_PAYOUTS_ENABLED=flag;}
  });

  it("onboards through Accounts v2 and never collects bank data in the application", async () => {
    const original = worker.stripe_account_id;
    worker.stripe_account_id = null;
    await env.DB.prepare(
      "UPDATE users SET stripe_account_id = NULL WHERE id = 'worker'",
    ).run();
    try {
      expect((await request("/payments/onboard", "worker")).status).toBe(200);
      expect((await request("/payments/onboard", "worker")).status).toBe(200);
      expect(fixture.stripe.v2.core.accounts.create).toHaveBeenCalledTimes(1);
      expect(
        fixture.stripe.v2.core.accounts.create.mock.calls[0]![0],
      ).toMatchObject({
        dashboard: "express",
        identity: { country: "ca" },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { requested: true } },
            },
          },
        },
      });
    } finally {
      worker.stripe_account_id = original;
    }
  });

  it("allows members who chose posting to onboard for work and requires their own account for dashboard access", async () => {
    expect((await request("/payments/dashboard", "poster")).status).toBe(409);
    fixture.stripe.v2.core.accounts.create.mockResolvedValueOnce({
      id: "acct_poster",
    });
    expect((await request("/payments/onboard", "poster")).status).toBe(200);
    expect(
      fixture.stripe.v2.core.accounts.create.mock.calls[0]![0],
    ).toMatchObject({ contact_email: poster.email });
    expect(fixture.stripe.balanceSettings.update).toHaveBeenCalledWith(
      { payments: { payouts: { schedule: { interval: "manual" } } } },
      {
        stripeAccount: "acct_poster",
        idempotencyKey: expect.stringMatching(/^manual-payouts-acct_poster-/),
      },
    );
    expect((await request("/payments/dashboard", "worker")).status).toBe(200);
  });

  it("keeps staging test-only and shows unconfigured and onboarding-required states", async () => {
    env.APP_ENV = "staging";
    env.STRIPE_SECRET_KEY = "sk_live_fixture";
    expect((await request("/payments/dashboard", "worker")).status).toBe(503);
    env.STRIPE_SECRET_KEY = "rkcs_test_fixture";
    expect((await request("/payments/dashboard", "worker")).status).toBe(200);
    env.APP_ENV = "local";
    env.STRIPE_SECRET_KEY = "sk_test_fixture";
    expect(
      await (await request("/payments/status", "poster", {}, "GET")).json(),
    ).toMatchObject({ accountReady: false, configured: true });
    env.LAUNCH_MODE = "preview";
    expect(
      await (await request("/payments/status", "worker", {}, "GET")).json(),
    ).toMatchObject({ accountReady: false, configured: false });
  });

  it("acknowledges irrelevant signed events without changing the financial ledger", async () => {
    expect(
      (await notify("customer.created", { id: "cus_unrelated" })).status,
    ).toBe(200);
    expect(
      (await row<{ count: number }>(
        "SELECT COUNT(*) AS count FROM payment_attempts",
      ))!.count,
    ).toBe(0);
    expect((await row("SELECT status FROM milestones"))!.status).toBe(
      "approved",
    );
  });

  it("exposes reconciliation records only to a configured administrator", async () => {
    expect((await request("/admin/payments", "poster", {}, "GET")).status).toBe(
      403,
    );
    const session = await checkout();
    await env.DB.prepare("UPDATE jobs SET status = 'disputed'").run();
    await notify("checkout.session.completed", session);
    const response = await request("/admin/payments", "admin", {}, "GET");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      incidents: [expect.objectContaining({ job_id: "job" })],
      unresolvedPayments: [
        expect.objectContaining({
          status: "disputed",
          milestone_id: "milestone",
        }),
      ],
      payouts: [],
      refunds: [],
    });
  });

  it("denies connection diagnostics to anonymous users and other members before contacting Stripe", async () => {
    for (const [user, status] of [
      ["", 401],
      ["poster", 403],
      ["worker", 403],
    ] as const) {
      expect(
        (await request("/admin/payments/readiness", user, {}, "GET")).status,
      ).toBe(status);
    }
    expect(fixture.stripe.accounts.retrieve).not.toHaveBeenCalled();
  });

  it("blocks diagnostic provider calls when secrets are incomplete or use the wrong mode", async () => {
    env.STRIPE_CONNECT_WEBHOOK_SECRET = "";
    expect(
      (await request("/admin/payments/readiness", "admin", {}, "GET")).status,
    ).toBe(503);
    env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_fixture";
    env.APP_ENV = "production";
    env.STRIPE_MODE = "live";
    expect(
      (await request("/admin/payments/readiness", "admin", {}, "GET")).status,
    ).toBe(503);
    expect(fixture.stripe.accounts.retrieve).not.toHaveBeenCalled();
  });

  it("allows bounded administrator diagnostics in preview without opening payment routes", async () => {
    env.LAUNCH_MODE = "preview";
    for (let i = 0; i < 5; i++) {
      const response = await request(
        "/admin/payments/readiness",
        "admin",
        {},
        "GET",
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ launchMode: "preview" });
    }
    expect(
      (await request("/admin/payments/readiness", "admin", {}, "GET")).status,
    ).toBe(429);
    expect((await request("/milestones/milestone/checkout")).status).toBe(503);
    expect(fixture.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("enforces the platform instant-payout switch while preserving standard payouts", async () => {
    env.INSTANT_PAYOUTS_ENABLED = "false";
    const status = await (
      await request("/payments/status", "worker", {}, "GET")
    ).json();
    expect(status).toMatchObject({
      instantPayoutsEnabled: false,
      instantEligible: false,
      standardEligible: true,
      defaultPayoutMethod: "standard",
    });
    const instant = await request("/payments/payout", "worker", {
      method: "instant",
      amount_cents: 1000,
      requestId: crypto.randomUUID(),
    });
    expect(instant.status).toBe(409);
    expect(fixture.stripe.payouts.create).not.toHaveBeenCalled();
    const standard = await request("/payments/payout", "worker", {
      method: "standard",
      amount_cents: 1000,
      requestId: crypto.randomUUID(),
    });
    expect(standard.status).toBe(200);
    env.STRIPE_SECRET_KEY = "rk_live_fixture";
    env.STRIPE_MODE = "live";
    const liveStatus = await (
      await request("/payments/status", "worker", {}, "GET")
    ).json();
    expect((liveStatus as { message: string }).message).toContain(
      "Instant Payouts are coming later",
    );
  });

  it("prefers eligible instant payouts and explicitly routes standard payouts to a bank rather than the default card", async () => {
    const status = await (
      await request("/payments/status", "worker", {}, "GET")
    ).json();
    expect(status).toMatchObject({
      accountId: "acct_worker",
      defaultPayoutMethod: "instant",
      instantEligible: true,
      standardEligible: true,
      payoutSchedule: "manual",
      payoutSetupRequired: false,
      pendingPayout: null,
    });
    expect(status).toMatchObject({
      payoutLimits: {
        instant: {
          minimum_cents: 60,
          maximum_cents: 999900,
        },
      },
    });
    const response = await request("/payments/payout", "worker", {
      method: "standard",
      amount_cents: 1000,
      requestId: crypto.randomUUID(),
    });
    expect(response.status).toBe(200);
    expect(fixture.stripe.payouts.create.mock.calls[0]![0]).toMatchObject({
      method: "standard",
      destination: "ba_standard",
      amount: 1000,
    });
    expect(fixture.stripe.accounts.retrieve).not.toHaveBeenCalled();
    expect(fixture.stripe.v2.core.accounts.retrieve.mock.calls[0]).toEqual([
      "acct_worker",
      { include: ["configuration.recipient", "identity", "requirements"] },
    ]);
  });

  it("cross-checks instant net balances against eligible CAD debit-card destinations and never sums destinations", async () => {
    fixture.stripe.balance.retrieve.mockResolvedValue({
      available: [{ currency: "cad", amount: 100000 }],
      pending: [],
      livemode: false,
      instant_available: [
        {
          currency: "cad",
          amount: 100000,
          net_available: [
            { destination: "card_eligible", amount: 750 },
            { destination: "ba_standard", amount: 90000 },
            { destination: "card_missing", amount: 99000 },
          ],
        },
      ],
    });
    const status = await (
      await request("/payments/status", "worker", {}, "GET")
    ).json();
    expect(status).toMatchObject({ balance: { instant_available_cents: 750 } });
    const response = await request("/payments/payout", "worker", {
      method: "instant",
      amount_cents: 751,
      requestId: crypto.randomUUID(),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      payoutRequest: { state: "rejected", safeToRetryNew: true },
    });
    expect(fixture.stripe.payouts.create).not.toHaveBeenCalled();
    fixture.stripe.accounts.listExternalAccounts.mockResolvedValue({
      data: [
        {
          id: "ba_standard",
          object: "bank_account",
          currency: "cad",
          status: "new",
          available_payout_methods: ["standard"],
        },
      ] as Stripe.ExternalAccount[],
      has_more: false,
    });
    expect(
      await (await request("/payments/status", "worker", {}, "GET")).json(),
    ).toMatchObject({
      instantPayoutsEnabled: true,
      instantEligible: false,
      standardEligible: true,
      defaultPayoutMethod: "standard",
      balance: { instant_available_cents: 0 },
    });
  });

  it("does not substitute a card, foreign-currency bank or errored bank for a standard bank payout", async () => {
    fixture.stripe.accounts.listExternalAccounts.mockResolvedValue({
      data: [
        {
          id: "card_eligible",
          object: "card",
          currency: "cad",
          available_payout_methods: ["instant", "standard"],
        },
        {
          id: "ba_usd",
          object: "bank_account",
          currency: "usd",
          status: "new",
          available_payout_methods: ["standard"],
        },
        {
          id: "ba_error",
          object: "bank_account",
          currency: "cad",
          status: "errored",
          available_payout_methods: ["standard"],
        },
      ] as Stripe.ExternalAccount[],
      has_more: false,
    });
    expect(
      await (await request("/payments/status", "worker", {}, "GET")).json(),
    ).toMatchObject({ standardEligible: false });
    expect(
      (
        await request("/payments/payout", "worker", {
          method: "standard",
          amount_cents: 1000,
          requestId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect(fixture.stripe.payouts.create).not.toHaveBeenCalled();
  });

  it("fails closed when external account pagination is incomplete", async () => {
    fixture.stripe.accounts.listExternalAccounts.mockResolvedValue({
      data: [],
      has_more: true,
    });
    expect(
      (
        await request("/payments/payout", "worker", {
          method: "instant",
          amount_cents: 1000,
          requestId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect(fixture.stripe.payouts.create).not.toHaveBeenCalled();
  });

  it.each(["stripe_transfers", "payouts"] as const)(
    "requires active v2 %s capability even when legacy flags say ready",
    async (capability) => {
      const account = await fixture.stripe.v2.core.accounts.retrieve();
      account.configuration.recipient.capabilities.stripe_balance[
        capability
      ].status = "restricted";
      fixture.stripe.v2.core.accounts.retrieve.mockResolvedValue(account);
      expect(
        await (await request("/payments/status", "worker", {}, "GET")).json(),
      ).toMatchObject({
        accountReady: false,
        instantEligible: false,
        standardEligible: false,
        defaultPayoutMethod: null,
      });
      expect(
        (
          await request("/payments/payout", "worker", {
            method: "standard",
            amount_cents: 1000,
            requestId: crypto.randomUUID(),
          })
        ).status,
      ).toBe(409);
      expect((await request("/milestones/milestone/checkout")).status).toBe(
        409,
      );
      expect(fixture.stripe.payouts.create).not.toHaveBeenCalled();
    },
  );

  it("keeps status read-only and requires explicit setup before manual standard withdrawals", async () => {
    fixture.stripe.balanceSettings.retrieve.mockResolvedValue({
      payments: { payouts: { schedule: { interval: "daily" } } },
    });
    expect(
      await (await request("/payments/status", "worker", {}, "GET")).json(),
    ).toMatchObject({
      payoutSchedule: "daily",
      payoutSetupRequired: true,
      standardEligible: false,
    });
    expect(fixture.stripe.balanceSettings.update).not.toHaveBeenCalled();
    expect(
      (
        await request("/payments/payout", "worker", {
          method: "standard",
          amount_cents: 1000,
          requestId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect((await request("/payments/onboard", "worker")).status).toBe(200);
    expect((await request("/payments/onboard", "worker")).status).toBe(200);
    const calls = fixture.stripe.balanceSettings.update.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![0]).toEqual({
      payments: { payouts: { schedule: { interval: "manual" } } },
    });
    expect(calls[1]![1]).not.toEqual(calls[0]![1]);
  });

  it("recovers an unresolved payout across page reloads and refuses expired idempotency retries", async () => {
    fixture.stripe.payouts.create.mockRejectedValueOnce(new Error("timeout"));
    const input = {
      method: "instant",
      amount_cents: 1000,
      requestId: crypto.randomUUID(),
    };
    const response = await request("/payments/payout", "worker", input);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      payoutRequest: {
        state: "unresolved",
        requestId: input.requestId,
        safeToRetryNew: false,
        retryable: true,
      },
    });
    expect(
      await (await request("/payments/status", "worker", {}, "GET")).json(),
    ).toMatchObject({ pendingPayout: { ...input, retryable: true } });
    expect(
      await (await request("/payments/status", "poster", {}, "GET")).json(),
    ).toMatchObject({ pendingPayout: null });
    await env.DB.prepare("UPDATE payout_intents SET created_at = ?")
      .bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .run();
    expect(
      await (await request("/payments/status", "worker", {}, "GET")).json(),
    ).toMatchObject({ pendingPayout: { retryable: false } });
    const expired = await request("/payments/payout", "worker", input);
    expect(expired.status).toBe(409);
    expect(await expired.json()).toMatchObject({
      payoutRequest: {
        state: "unresolved",
        safeToRetryNew: false,
        retryable: false,
        reconciliationRequired: true,
      },
    });
    expect(fixture.stripe.payouts.create).toHaveBeenCalledTimes(1);
  });

  it("allows a new standard request only after a definitive first-attempt instant refusal", async () => {
    fixture.stripe.payouts.create.mockRejectedValueOnce(
      new Stripe.errors.StripeInvalidRequestError({
        message: "Limit exceeded",
        statusCode: 400,
        code: "instant_payouts_limit_exceeded",
      }),
    );
    const input = {
      method: "instant",
      amount_cents: 1000,
      requestId: crypto.randomUUID(),
    };
    const refused = await request("/payments/payout", "worker", input);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      payoutRequest: { state: "rejected", safeToRetryNew: true },
    });
    expect((await row("SELECT status FROM payout_intents"))!.status).toBe(
      "rejected",
    );
    expect((await request("/payments/payout", "worker", input)).status).toBe(
      409,
    );
    expect(fixture.stripe.payouts.create).toHaveBeenCalledTimes(1);
    expect(
      (
        await request("/payments/payout", "worker", {
          ...input,
          method: "standard",
          requestId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(200);
    expect(fixture.payouts.size).toBe(1);
    expect(fixture.stripe.payouts.create.mock.calls[1]![0]).toMatchObject({
      method: "standard",
      destination: "ba_standard",
    });
  });

  it("preserves an ambiguous original request even if a later retry returns a known 400 refusal", async () => {
    fixture.stripe.payouts.create.mockRejectedValueOnce(new Error("timeout"));
    fixture.stripe.payouts.create.mockRejectedValueOnce(
      new Stripe.errors.StripeInvalidRequestError({
        message: "Unavailable",
        statusCode: 400,
        code: "balance_insufficient",
      }),
    );
    const input = {
      method: "instant",
      amount_cents: 1000,
      requestId: crypto.randomUUID(),
    };
    await request("/payments/payout", "worker", input);
    const retried = await request("/payments/payout", "worker", input);
    expect(await retried.json()).toMatchObject({
      payoutRequest: { state: "unresolved", safeToRetryNew: false },
    });
    expect((await row("SELECT status FROM payout_intents"))!.status).toBe(
      "creating",
    );
    expect(
      (
        await request("/payments/payout", "worker", {
          ...input,
          method: "standard",
          requestId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect(fixture.stripe.payouts.create).toHaveBeenCalledTimes(2);
  });

  it("does not unlock a new UUID when a concurrent request already created the payout", async () => {
    let releaseBalance!: (
      balance: Awaited<ReturnType<typeof fixture.stripe.balance.retrieve>>,
    ) => void;
    let enteredBalance!: () => void;
    const entered = new Promise<void>((resolve) => {
      enteredBalance = resolve;
    });
    const delayed = new Promise<
      Awaited<ReturnType<typeof fixture.stripe.balance.retrieve>>
    >((resolve) => {
      releaseBalance = resolve;
    });
    fixture.stripe.balance.retrieve.mockImplementationOnce(() => {
      enteredBalance();
      return delayed;
    });
    const input = {
      method: "standard",
      amount_cents: 1000,
      requestId: crypto.randomUUID(),
    };
    const slower = request("/payments/payout", "worker", input);
    await entered;
    expect((await request("/payments/payout", "worker", input)).status).toBe(
      200,
    );
    releaseBalance({
      available: [],
      pending: [],
      instant_available: [],
      livemode: false,
    });
    const stale = await slower;
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      payoutRequest: { state: "confirmed", safeToRetryNew: false },
    });
    expect(fixture.payouts.size).toBe(1);
    expect((await row("SELECT status FROM payout_intents"))!.status).toBe(
      "pending",
    );
  });

  it("prevents a delayed concurrent submission after its UUID was durably rejected by preflight", async () => {
    const goodBalance = await fixture.stripe.balance.retrieve();
    let releaseBalance!: (balance: typeof goodBalance) => void;
    let enteredBalance!: () => void;
    const entered = new Promise<void>((resolve) => {
      enteredBalance = resolve;
    });
    const delayed = new Promise<typeof goodBalance>((resolve) => {
      releaseBalance = resolve;
    });
    fixture.stripe.balance.retrieve.mockImplementationOnce(() => {
      enteredBalance();
      return delayed;
    });
    fixture.stripe.balance.retrieve.mockResolvedValueOnce({
      available: [],
      pending: [],
      instant_available: [],
      livemode: false,
    });
    const input = {
      method: "standard",
      amount_cents: 1000,
      requestId: crypto.randomUUID(),
    };
    const slower = request("/payments/payout", "worker", input);
    await entered;
    const rejected = await request("/payments/payout", "worker", input);
    expect(await rejected.json()).toMatchObject({
      payoutRequest: { state: "rejected", safeToRetryNew: true },
    });
    releaseBalance(goodBalance);
    expect((await slower).status).toBe(409);
    expect(fixture.stripe.payouts.create).not.toHaveBeenCalled();
    expect((await row("SELECT status FROM payout_intents"))!.status).toBe(
      "rejected",
    );
  });

  it("reuses the exact provider request after Stripe acceptance but before the local receipt was saved", async () => {
    const originalDb = env.DB;
    let failReceipt = true;
    env.DB = new Proxy(originalDb, {
      get(target, property) {
        if (property === "prepare")
          return (sql: string) => {
            const statement = target.prepare(sql);
            if (
              sql.startsWith("UPDATE payout_intents SET payout_id =") &&
              failReceipt
            ) {
              failReceipt = false;
              return {
                bind: () => ({
                  run: async () => {
                    throw new Error("D1 receipt unavailable");
                  },
                }),
              } as unknown as D1PreparedStatement;
            }
            return statement;
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const input = {
      method: "instant",
      amount_cents: 1000,
      requestId: crypto.randomUUID(),
    };
    try {
      const interrupted = await request("/payments/payout", "worker", input);
      expect(interrupted.status).toBe(503);
      expect(await interrupted.json()).toMatchObject({
        payoutRequest: { state: "unresolved", safeToRetryNew: false },
      });
      expect(fixture.payouts.size).toBe(1);
      expect(
        await row("SELECT payout_id,status FROM payout_intents"),
      ).toMatchObject({ payout_id: null, status: "creating" });
      fixture.stripe.accounts.listExternalAccounts.mockResolvedValue({
        data: [],
        has_more: false,
      });
      fixture.stripe.balance.retrieve.mockResolvedValue({
        available: [],
        pending: [],
        instant_available: [],
        livemode: false,
      });
      expect((await request("/payments/payout", "worker", input)).status).toBe(
        200,
      );
      expect(fixture.payouts.size).toBe(1);
      expect(fixture.stripe.payouts.create.mock.calls[1]).toEqual(
        fixture.stripe.payouts.create.mock.calls[0],
      );
      expect((await row("SELECT status FROM payout_intents"))!.status).toBe(
        "pending",
      );
    } finally {
      env.DB = originalDb;
    }
  });

  it("does not declare an existing payout reference unused when its database lookup fails", async () => {
    const input = {
      method: "standard",
      amount_cents: 1000,
      requestId: crypto.randomUUID(),
    };
    await request("/payments/payout", "worker", input);
    const originalDb = env.DB;
    env.DB = new Proxy(originalDb, {
      get(target, property) {
        if (property === "prepare")
          return (sql: string) => {
            if (sql === "SELECT * FROM payout_intents WHERE request_id = ?")
              throw new Error("D1 lookup unavailable");
            return target.prepare(sql);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      const response = await request("/payments/payout", "worker", input);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        payoutRequest: {
          state: "unknown",
          requestId: input.requestId,
          safeToRetryNew: false,
        },
      });
      expect(fixture.payouts.size).toBe(1);
    } finally {
      env.DB = originalDb;
    }
  });

  it.each(["rate limit", "disabled config"])(
    "never claims a retry UUID is unused when %s stops its lookup",
    async (condition) => {
      const input = {
        method: "standard",
        amount_cents: 1000,
        requestId: crypto.randomUUID(),
      };
      expect((await request("/payments/payout", "worker", input)).status).toBe(
        200,
      );
      if (condition === "rate limit")
        await env.DB.prepare(
          "UPDATE rate_limits SET count = 20 WHERE key LIKE 'payout:%'",
        ).run();
      else env.LAUNCH_MODE = "preview";
      const retry = await request("/payments/payout", "worker", input);
      expect(retry.status).toBe(condition === "rate limit" ? 429 : 503);
      expect(await retry.json()).toMatchObject({
        payoutRequest: { state: "unknown", safeToRetryNew: false },
      });
      expect(fixture.payouts.size).toBe(1);
    },
  );

  it("keeps completed payout references private across accounts and denies suspended members", async () => {
    const input = {
      method: "standard",
      amount_cents: 1000,
      requestId: crypto.randomUUID(),
    };
    await request("/payments/payout", "worker", input);
    const previous = poster.stripe_account_id;
    poster.stripe_account_id = "acct_poster";
    try {
      expect((await request("/payments/payout", "poster", input)).status).toBe(
        409,
      );
      expect(fixture.stripe.payouts.retrieve).not.toHaveBeenCalled();
    } finally {
      poster.stripe_account_id = previous;
    }
    worker.suspended_at = new Date().toISOString();
    try {
      expect((await request("/payments/payout", "worker", input)).status).toBe(
        403,
      );
    } finally {
      worker.suspended_at = null;
    }
  });

  it.each(["disputed", "pending", "failed"])(
    "keeps financial %s holds even if a job status is restored",
    async (hold) => {
      await checkout();
      const payment = (await row<{ id: string }>(
        "SELECT id FROM payment_attempts",
      ))!;
      if (hold === "disputed")
        await env.DB.prepare(
          "UPDATE payment_attempts SET status = 'disputed'",
        ).run();
      else
        await env.DB.prepare(
          "INSERT INTO refund_intents (payment_attempt_id,operation_id,requested_by,reason,status,amount_cents) VALUES (?,?,'admin','Review',?,11300)",
        )
          .bind(payment.id, crypto.randomUUID(), hold)
          .run();
      await env.DB.prepare("UPDATE jobs SET status = 'in_progress'").run();
      expect(
        await (await request("/payments/status", "worker", {}, "GET")).json(),
      ).toMatchObject({
        frozen: true,
        instantEligible: false,
        standardEligible: false,
      });
      expect(
        (
          await request("/payments/payout", "worker", {
            method: "standard",
            amount_cents: 1000,
            requestId: crypto.randomUUID(),
          })
        ).status,
      ).toBe(409);
      expect(fixture.stripe.payouts.create).not.toHaveBeenCalled();
    },
  );

  it.each(["destination", "method", "metadata"])(
    "rejects a signed payout webhook whose canonical %s differs from the durable request",
    async (field) => {
      await request("/payments/payout", "worker", {
        method: "standard",
        amount_cents: 1000,
        requestId: crypto.randomUUID(),
      });
      const payout = [...fixture.payouts.values()][0]!;
      if (field === "destination") payout.destination = "ba_unrelated";
      if (field === "method") payout.method = "instant";
      if (field === "metadata") payout.metadata!.daywork_user_id = "other";
      payout.status = "paid";
      expect(
        (
          await notify("payout.paid", payout, {
            account: "acct_worker",
            connected: true,
          })
        ).status,
      ).toBe(400);
      expect((await row("SELECT status FROM payout_intents"))!.status).toBe(
        "pending",
      );
    },
  );

  it("reports test mode and balances separately without claiming funds have arrived at a bank", async () => {
    const response = await request("/payments/status", "worker", {}, "GET");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      testMode: true,
      accountReady: true,
      chargesEnabled: false,
      payoutsEnabled: true,
      instantEligible: true,
      balance: {
        available_cents: 100000,
        pending_cents: 5000,
        instant_available_cents: 100000,
      },
      message: expect.stringContaining("no real money"),
    });
  });
});
