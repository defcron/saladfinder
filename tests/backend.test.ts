import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { makeTestEnv, testApp, request, login, jobBody } from "./helpers";
import type { User, Job, Milestone, Application } from "../src/shared/types";
import { digest } from "../src/server/middleware";

describe("verified authentication and privacy", () => {
  let ctx: Awaited<ReturnType<typeof makeTestEnv>>;
  let app: ReturnType<typeof testApp>;
  beforeEach(async () => {
    ctx = await makeTestEnv();
    app = testApp();
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await ctx?.dispose();
  });
  it("consumes magic links once, hashes credentials, applies session cookies and revokes logout", async () => {
    const signed = await login(app, ctx.env, "worker@example.test");
    expect(signed.cookie).toMatch(/^daywork_local=[a-f0-9]{64}$/);
    expect(
      (
        await ctx.env.DB.prepare("SELECT terms_version FROM users WHERE id=?")
          .bind(signed.user.id)
          .first<{ terms_version: string }>()
      )?.terms_version,
    ).toBe("2026-11-04");
    expect(
      (await request(app, ctx.env, "/me", "GET", undefined, signed.cookie))
        .status,
    ).toBe(200);
    expect(
      (
        (await (
          await request(app, ctx.env, "/me", "GET", undefined, signed.cookie)
        ).json()) as { user: User }
      ).user.email,
    ).toBe("worker@example.test");
    const replay = await request(app, ctx.env, "/auth/verify", "POST", {
      token: signed.token,
    });
    expect(replay.status).toBe(400);
    const stored = await ctx.env.DB.prepare(
      "SELECT token_hash FROM sessions",
    ).first<{ token_hash: string }>();
    expect(stored?.token_hash).not.toBe(signed.cookie.split("=")[1]);
    expect(stored?.token_hash).toBe(await digest(signed.cookie.split("=")[1]));
    expect(
      (await request(app, ctx.env, "/auth/logout", "POST", {}, signed.cookie))
        .status,
    ).toBe(200);
    expect(
      (
        (await (
          await request(app, ctx.env, "/me", "GET", undefined, signed.cookie)
        ).json()) as { user: null }
      ).user,
    ).toBeNull();
  });
  it("rejects forged cross-origin mutations and rejects expired or random tokens", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/request", {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "x@example.test", consent: true }),
      }),
      ctx.env,
    );
    expect(res.status).toBe(403);
    const token = "a".repeat(64);
    await ctx.env.DB.prepare(
      "INSERT INTO auth_tokens(token_hash,email,name,role,expires_at,created_at) VALUES (?,?,?,?,?,?)",
    )
      .bind(await digest(token), "x@example.test", "X person", "both", 1, 1)
      .run();
    expect(
      (await request(app, ctx.env, "/auth/verify", "POST", { token })).status,
    ).toBe(400);
    expect(
      (
        await request(app, ctx.env, "/auth/verify", "POST", {
          token: "b".repeat(64),
        })
      ).status,
    ).toBe(400);
  });
  it("fails closed without production email setup and never exposes a development token on a public hostname", async () => {
    ctx.env.APP_ENV = "production";
    ctx.env.APP_URL = "http://localhost";
    const res = await request(app, ctx.env, "/auth/request", "POST", {
      email: "x@example.test",
      name: "Test User",
      role: "both",
      consent: true,
    });
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("devToken");
    ctx.env.APP_ENV = "local";
    ctx.env.APP_URL = "https://app.example";
    const publicRes = await app.fetch(
      new Request("https://app.example/api/auth/request", {
        method: "POST",
        headers: {
          Origin: "https://app.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "x@example.test", consent: true }),
      }),
      ctx.env,
    );
    expect(publicRes.status).toBe(503);
    expect(await publicRes.text()).not.toContain("devToken");
  });
  it("delivers only a fragment-based link in production and sets a Secure host-only session cookie", async () => {
    ctx.env.APP_ENV = "production";
    ctx.env.APP_URL = "http://localhost";
    ctx.env.EMAIL_FROM = "SaladFinder <noreply@example.test>";
    ctx.env.RESEND_API_KEY = "test-mail-secret";
    ctx.env.TURNSTILE_SITE_KEY = "test-site";
    ctx.env.TURNSTILE_SECRET_KEY = "test-turnstile-secret";
    let deliveredBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        if (String(url).includes("turnstile"))
          return new Response(
            JSON.stringify({
              success: true,
              hostname: "localhost",
              action: "auth",
            }),
          );
        deliveredBody = String(init?.body);
        return new Response(JSON.stringify({ id: "mail-1" }));
      }),
    );
    const r = await request(app, ctx.env, "/auth/request", "POST", {
      email: "PRODUCTION@example.test",
      name: "Production Member",
      role: "worker",
      consent: true,
      turnstileToken: "challenge",
    });
    expect(r.status).toBe(200);
    expect(await r.text()).not.toContain("devToken");
    const message = JSON.parse(deliveredBody) as { to: string[]; text: string };
    expect(message.to).toEqual(["production@example.test"]);
    const token = message.text.match(
      /\/auth\/verify#token=([a-f0-9]{64})/,
    )?.[1];
    expect(token).toBeTruthy();
    const verified = await request(app, ctx.env, "/auth/verify", "POST", {
      token,
    });
    expect(verified.status).toBe(200);
    const cookie = verified.headers.get("set-cookie")!;
    expect(cookie).toContain("__Host-daywork=");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Domain=");
    expect(((await verified.json()) as { user: User }).user.email).toBe(
      "production@example.test",
    );
  });
  it("removes unusable magic links when the email provider fails", async () => {
    ctx.env.APP_ENV = "production";
    ctx.env.APP_URL = "http://localhost";
    ctx.env.EMAIL_FROM = "SaladFinder <noreply@example.test>";
    ctx.env.RESEND_API_KEY = "test-mail-secret";
    ctx.env.TURNSTILE_SITE_KEY = "test-site";
    ctx.env.TURNSTILE_SECRET_KEY = "test-turnstile-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) =>
        String(url).includes("turnstile")
          ? new Response(
              JSON.stringify({
                success: true,
                hostname: "localhost",
                action: "auth",
              }),
            )
          : new Response("Unavailable", { status: 503 }),
      ),
    );
    expect(
      (
        await request(app, ctx.env, "/auth/request", "POST", {
          email: "failure@example.test",
          consent: true,
          turnstileToken: "challenge",
        })
      ).status,
    ).toBe(503);
    expect(
      (
        await ctx.env.DB.prepare(
          "SELECT COUNT(*) AS n FROM auth_tokens",
        ).first<{ n: number }>()
      )?.n,
    ).toBe(0);
    expect(
      (
        await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{
          n: number;
        }>()
      )?.n,
    ).toBe(0);
  });
  it("rate limits repeated email requests and validates registration consent", async () => {
    const body = { email: "limit@example.test", consent: true };
    for (let i = 0; i < 3; i++)
      expect(
        (await request(app, ctx.env, "/auth/request", "POST", body)).status,
      ).toBe(200);
    expect(
      (await request(app, ctx.env, "/auth/request", "POST", body)).status,
    ).toBe(429);
    expect(
      (
        await request(app, ctx.env, "/auth/request", "POST", {
          email: "n@example.test",
          consent: false,
        })
      ).status,
    ).toBe(400);
  });
  it("allows only explicit loopback development origins through the local proxy", async () => {
    const send = (origin: string) =>
      app.fetch(
        new Request("http://127.0.0.1:8787/api/auth/request", {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({ email: "proxy@example.test", consent: true }),
        }),
        ctx.env,
      );
    expect((await send("http://127.0.0.1:5173")).status).toBe(200);
    expect((await send("http://127.0.0.1:9999")).status).toBe(403);
    expect((await send("https://evil.example:5173")).status).toBe(403);
    ctx.env.APP_ENV = "production";
    ctx.env.APP_URL = "http://127.0.0.1:8787";
    expect((await send("http://127.0.0.1:5173")).status).toBe(403);
  });
  it("creates a hashed self-service removal token once and removes only its corresponding consent", async () => {
    const body = {
      email: "privacy@example.test",
      city: "Toronto",
      role: "worker",
      consent: true,
    };
    const created = (await (
      await request(app, ctx.env, "/waitlist", "POST", body)
    ).json()) as { removalToken: string };
    expect(created.removalToken).toMatch(/^[a-f0-9]{64}$/);
    expect(
      (
        await ctx.env.DB.prepare("SELECT consent_version FROM waitlist").first<{
          consent_version: string;
        }>()
      )?.consent_version,
    ).toBe("2026-11-04");
    const stored = await ctx.env.DB.prepare(
      "SELECT deletion_token_hash FROM waitlist",
    ).first<{ deletion_token_hash: string }>();
    expect(stored?.deletion_token_hash).toBe(
      await digest(created.removalToken),
    );
    const duplicate = (await (
      await request(app, ctx.env, "/waitlist", "POST", body)
    ).json()) as { removalToken?: string };
    expect(duplicate.removalToken).toBeUndefined();
    expect(
      (
        await request(app, ctx.env, "/waitlist/remove", "POST", {
          token: "e".repeat(64),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM waitlist").first<{
          n: number;
        }>()
      )?.n,
    ).toBe(1);
    expect(
      (
        await request(app, ctx.env, "/waitlist/remove", "POST", {
          token: created.removalToken,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM waitlist").first<{
          n: number;
        }>()
      )?.n,
    ).toBe(0);
    expect(
      (
        await request(app, ctx.env, "/waitlist/remove", "POST", {
          token: created.removalToken,
        })
      ).status,
    ).toBe(200);
  });
  it("validates Turnstile hostname and action before recording a production waitlist entry", async () => {
    ctx.env.APP_ENV = "production";
    ctx.env.APP_URL = "http://localhost";
    ctx.env.TURNSTILE_SITE_KEY = "site";
    ctx.env.TURNSTILE_SECRET_KEY = "secret";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          hostname: "evil.example",
          action: "waitlist",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const body = {
      email: "wait@example.test",
      city: "Toronto",
      role: "worker",
      consent: true,
      turnstileToken: "challenge",
    };
    expect(
      (await request(app, ctx.env, "/waitlist", "POST", body)).status,
    ).toBe(400);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          hostname: "localhost",
          action: "auth",
        }),
      ),
    );
    expect(
      (await request(app, ctx.env, "/waitlist", "POST", body)).status,
    ).toBe(400);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          hostname: "localhost",
          action: "waitlist",
        }),
      ),
    );
    expect(
      (await request(app, ctx.env, "/waitlist", "POST", body)).status,
    ).toBe(201);
    expect(
      (
        await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM waitlist").first<{
          n: number;
        }>()
      )?.n,
    ).toBe(1);
  });
});

describe("marketplace authorization and lifecycle", () => {
  let ctx: Awaited<ReturnType<typeof makeTestEnv>>;
  let app: ReturnType<typeof testApp>;
  let poster: Awaited<ReturnType<typeof login>>;
  let worker: Awaited<ReturnType<typeof login>>;
  let other: Awaited<ReturnType<typeof login>>;
  beforeEach(async () => {
    ctx = await makeTestEnv();
    app = testApp();
    poster = await login(app, ctx.env, "poster@example.test", "Job Poster");
    worker = await login(app, ctx.env, "worker@example.test", "First Worker");
    other = await login(app, ctx.env, "other@example.test", "Other Worker");
  });
  afterEach(async () => {
    await ctx?.dispose();
  });
  async function create() {
    const r = await request(
      app,
      ctx.env,
      "/jobs",
      "POST",
      jobBody(),
      poster.cookie,
    );
    expect(r.status).toBe(201);
    return ((await r.json()) as { job: Job }).job;
  }
  async function apply(job: Job, cookie = worker.cookie) {
    const r = await request(
      app,
      ctx.env,
      `/jobs/${job.id}/apply`,
      "POST",
      { message: "I have experience with yard cleanup and can bring gloves." },
      cookie,
    );
    expect(r.status).toBe(201);
  }
  async function detail(job: Job, cookie = poster.cookie) {
    return (await (
      await request(app, ctx.env, `/jobs/${job.id}`, "GET", undefined, cookie)
    ).json()) as {
      job: Job;
      milestones: Milestone[];
      applications: Application[];
      messages: unknown[];
    };
  }
  async function hire(job: Job) {
    await apply(job);
    const d = await detail(job);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}/hire`,
          "POST",
          { applicationId: d.applications[0].id },
          poster.cookie,
        )
      ).status,
    ).toBe(200);
  }
  it("requires verified authentication, validates money, and gates production mutations in preview", async () => {
    expect(
      (await request(app, ctx.env, "/jobs", "POST", jobBody())).status,
    ).toBe(401);
    expect(
      (
        await request(
          app,
          ctx.env,
          "/jobs",
          "POST",
          {
            ...jobBody(),
            milestones: [{ title: "Bad amount", amount_cents: 2500.4 }],
          },
          poster.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          app,
          ctx.env,
          "/jobs",
          "POST",
          {
            ...jobBody(),
            milestones: [{ title: "Too small", amount_cents: 100 }],
          },
          poster.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          app,
          ctx.env,
          "/jobs",
          "POST",
          { ...jobBody(), start_date: "2026-02-30" },
          poster.cookie,
        )
      ).status,
    ).toBe(400);
    ctx.env.APP_ENV = "production";
    // Production sessions use a distinct Secure cookie name.
    const cookie = poster.cookie.replace("daywork_local=", "__Host-daywork=");
    expect(
      (await request(app, ctx.env, "/jobs", "POST", jobBody(), cookie)).status,
    ).toBe(503);
  });
  it("opens production listings and applications without enabling hiring or work", async () => {
    ctx.env.APP_ENV = "production";
    ctx.env.LISTINGS_ENABLED = "true";
    poster.cookie = poster.cookie.replace("daywork_local=", "__Host-daywork=");
    worker.cookie = worker.cookie.replace("daywork_local=", "__Host-daywork=");
    const job = await create();
    await apply(job);
    const d = await detail(job);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}/hire`,
          "POST",
          { applicationId: d.applications[0].id },
          poster.cookie,
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}/start`,
          "POST",
          {},
          worker.cookie,
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}/applications/withdraw`,
          "POST",
          {},
          worker.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}/cancel`,
          "POST",
          {},
          worker.cookie,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}/cancel`,
          "POST",
          {},
          poster.cookie,
        )
      ).status,
    ).toBe(200);
    expect((await detail(job)).job.status).toBe("cancelled");
  });
  it("computes budgets, supports escaped search, and does not expose email or payment identifiers publicly", async () => {
    const job = await create();
    expect(job.budget_cents).toBe(18000);
    expect(job.payment_schedule).toBe("milestones");
    const list = (await (
      await request(
        app,
        ctx.env,
        "/jobs?q=backyard&city=Toronto&category=Yard%20work",
      )
    ).json()) as { jobs: Job[]; total: number };
    expect(list.total).toBe(1);
    expect(list.jobs[0].id).toBe(job.id);
    expect(
      (
        (await (await request(app, ctx.env, "/jobs?q=%25")).json()) as {
          total: number;
        }
      ).total,
    ).toBe(0);
    const d = await request(app, ctx.env, `/jobs/${job.id}`);
    const text = await d.text();
    expect(text).not.toContain("poster@example.test");
    expect(text).not.toContain("payment_intent_id");
    expect(text).not.toContain("checkout_session_id");
  });
  it("selects one worker atomically during concurrent hires and keeps messages private", async () => {
    const job = await create();
    await apply(job);
    await apply(job, other.cookie);
    const d = await detail(job);
    const results = await Promise.all(
      d.applications.map((a) =>
        request(
          app,
          ctx.env,
          `/jobs/${job.id}/hire`,
          "POST",
          { applicationId: a.id },
          poster.cookie,
        ),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const updated = await detail(job);
    expect(
      updated.applications.filter((a) => a.status === "accepted"),
    ).toHaveLength(1);
    expect(
      updated.applications.filter((a) => a.status === "declined"),
    ).toHaveLength(1);
    const chosen = updated.job.worker_id === worker.user.id ? worker : other;
    const rejected = chosen === worker ? other : worker;
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}/messages`,
          "POST",
          { body: "Meet at the front gate." },
          chosen.cookie,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}`,
          "GET",
          undefined,
          rejected.cookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}/messages`,
          "POST",
          { body: "intrude" },
          rejected.cookie,
        )
      ).status,
    ).toBe(403);
  });
  it("enforces milestone actor and state order, and participant disputes freeze approvals", async () => {
    const job = await create();
    await hire(job);
    let d = await detail(job);
    const m = d.milestones[0];
    expect(
      (
        await request(
          app,
          ctx.env,
          `/milestones/${m.id}/submit`,
          "POST",
          {},
          worker.cookie,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}/start`,
          "POST",
          {},
          poster.cookie,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}/start`,
          "POST",
          {},
          worker.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/milestones/${m.id}/approve`,
          "POST",
          {},
          poster.cookie,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/milestones/${m.id}/submit`,
          "POST",
          {},
          worker.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/milestones/${m.id}/approve`,
          "POST",
          {},
          worker.cookie,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}/report`,
          "POST",
          {
            reason:
              "The agreed work cannot proceed safely due to hazardous waste.",
          },
          worker.cookie,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/milestones/${m.id}/approve`,
          "POST",
          {},
          poster.cookie,
        )
      ).status,
    ).toBe(409);
    d = await detail(job);
    expect(d.job.status).toBe("disputed");
    expect(d.milestones[0].status).toBe("submitted");
  });
  it("approves a milestone without claiming payment and disallows forged or duplicate reviews", async () => {
    const job = await create();
    await hire(job);
    await request(
      app,
      ctx.env,
      `/jobs/${job.id}/start`,
      "POST",
      {},
      worker.cookie,
    );
    const m = (await detail(job)).milestones[0];
    await request(
      app,
      ctx.env,
      `/milestones/${m.id}/submit`,
      "POST",
      {},
      worker.cookie,
    );
    const approval = await request(
      app,
      ctx.env,
      `/milestones/${m.id}/approve`,
      "POST",
      {},
      poster.cookie,
    );
    expect(approval.status).toBe(200);
    expect((await detail(job)).milestones[0].status).toBe("approved");
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}/reviews`,
          "POST",
          { rating: 5, body: "A good worker and a tidy job." },
          poster.cookie,
        )
      ).status,
    ).toBe(403);
    await ctx.env.DB.prepare("UPDATE jobs SET status='completed' WHERE id=?")
      .bind(job.id)
      .run();
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}/reviews`,
          "POST",
          { rating: 5, body: "A good worker and a tidy job." },
          other.cookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}/reviews`,
          "POST",
          { rating: 5, body: "A good worker and a tidy job." },
          poster.cookie,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}/reviews`,
          "POST",
          { rating: 4, body: "Duplicate second review." },
          poster.cookie,
        )
      ).status,
    ).toBe(409);
  });
  it("restricts moderation to configured verified admins, resolves reports, and revokes suspended sessions", async () => {
    const job = await create();
    await hire(job);
    const r = await request(
      app,
      ctx.env,
      `/jobs/${job.id}/report`,
      "POST",
      { reason: "We need support to resolve this booking before work starts." },
      poster.cookie,
    );
    const { reportId } = (await r.json()) as { reportId: string };
    expect(
      (
        await request(
          app,
          ctx.env,
          "/admin/overview",
          "GET",
          undefined,
          poster.cookie,
        )
      ).status,
    ).toBe(403);
    const admin = await login(
      app,
      ctx.env,
      "operator@example.test",
      "Operator",
    );
    expect(
      (
        await request(
          app,
          ctx.env,
          "/admin/overview",
          "GET",
          undefined,
          admin.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/admin/reports/${reportId}/resolve`,
          "POST",
          {
            resolution: "Both parties confirmed that work can proceed safely.",
            action: "restore_job",
          },
          admin.cookie,
        )
      ).status,
    ).toBe(200);
    expect((await detail(job)).job.status).toBe("assigned");
    expect(
      (
        await request(
          app,
          ctx.env,
          `/admin/users/${worker.user.id}/suspend`,
          "POST",
          { suspended: true },
          admin.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          app,
          ctx.env,
          "/dashboard",
          "GET",
          undefined,
          worker.cookie,
        )
      ).status,
    ).toBe(401);
  });
  it.each(["disputed", "pending_refund", "failed_refund"])(
    "does not clear a financial hold by restoring a report: %s",
    async (state) => {
      const job = await create();
      await hire(job);
      const d = await detail(job);
      const response = await request(
        app,
        ctx.env,
        `/jobs/${job.id}/report`,
        "POST",
        {
          reason: "This booking requires a review before releasing any funds.",
        },
        poster.cookie,
      );
      const { reportId } = (await response.json()) as { reportId: string };
      const paymentId = crypto.randomUUID();
      await ctx.env.DB.prepare(
        "INSERT INTO payment_attempts (id,milestone_id,attempt,poster_id,worker_id,account_id,amount_cents,fee_cents,status) VALUES (?,?,1,?,?,'acct_test_hold',9000,1180,?)",
      )
        .bind(
          paymentId,
          d.milestones[0].id,
          poster.user.id,
          worker.user.id,
          state === "disputed" ? "disputed" : "paid",
        )
        .run();
      const admin = await login(
        app,
        ctx.env,
        "operator@example.test",
        "Operator",
      );
      if (state !== "disputed")
        await ctx.env.DB.prepare(
          "INSERT INTO refund_intents (payment_attempt_id,operation_id,requested_by,reason,status,amount_cents) VALUES (?,?,?,'Test refund',?,9000)",
        )
          .bind(
            paymentId,
            crypto.randomUUID(),
            admin.user.id,
            state === "failed_refund" ? "failed" : "pending",
          )
          .run();
      const restored = await request(
        app,
        ctx.env,
        `/admin/reports/${reportId}/resolve`,
        "POST",
        {
          resolution: "The local complaint has been reviewed by support.",
          action: "restore_job",
        },
        admin.cookie,
      );
      expect(restored.status).toBe(409);
      expect((await detail(job)).job.status).toBe("disputed");
      expect(
        await ctx.env.DB.prepare("SELECT status FROM reports WHERE id=?")
          .bind(reportId)
          .first(),
      ).toMatchObject({ status: "open" });
    },
  );
  it("hides a suspended poster's open listing from direct public and applicant URLs", async () => {
    const job = await create();
    const admin = await login(
      app,
      ctx.env,
      "operator@example.test",
      "Operator",
    );
    await ctx.env.DB.prepare("UPDATE users SET suspended_at=? WHERE id=?")
      .bind(new Date().toISOString(), poster.user.id)
      .run();
    expect((await request(app, ctx.env, `/jobs/${job.id}`)).status).toBe(404);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}`,
          "GET",
          undefined,
          worker.cookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}`,
          "GET",
          undefined,
          admin.cookie,
        )
      ).status,
    ).toBe(200);
  });
  it("grants audited moderation reads to active verified administrators only", async () => {
    const job = await create();
    await hire(job);
    await request(
      app,
      ctx.env,
      `/jobs/${job.id}/messages`,
      "POST",
      { body: "Private arrival details for this booking." },
      worker.cookie,
    );
    const admin = await login(
      app,
      ctx.env,
      "operator@example.test",
      "Operator",
    );
    const view = await detail(job, admin.cookie);
    expect(view.applications).toHaveLength(1);
    expect(view.messages).toHaveLength(1);
    expect(
      (
        await ctx.env.DB.prepare(
          "SELECT COUNT(*) AS n FROM audit_log WHERE actor_id=? AND entity_id=? AND action='job.moderation_viewed'",
        )
          .bind(admin.user.id, job.id)
          .first<{ n: number }>()
      )?.n,
    ).toBe(1);
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}`,
          "GET",
          undefined,
          other.cookie,
        )
      ).status,
    ).toBe(404);
    await ctx.env.DB.prepare("UPDATE users SET suspended_at=? WHERE id=?")
      .bind(new Date().toISOString(), admin.user.id)
      .run();
    expect(
      (
        await request(
          app,
          ctx.env,
          `/jobs/${job.id}`,
          "GET",
          undefined,
          admin.cookie,
        )
      ).status,
    ).toBe(403);
  });
  it("lets an administrator remove a reported open listing without giving outsiders a freeze capability", async () => {
    const job = await create();
    const r = await request(
      app,
      ctx.env,
      `/jobs/${job.id}/report`,
      "POST",
      { reason: "This public job listing appears to ask for prohibited work." },
      other.cookie,
    );
    expect(r.status).toBe(201);
    const { reportId } = (await r.json()) as { reportId: string };
    expect((await detail(job)).job.status).toBe("open");
    const admin = await login(
      app,
      ctx.env,
      "operator@example.test",
      "Operator",
    );
    expect(
      (
        await request(
          app,
          ctx.env,
          `/admin/reports/${reportId}/resolve`,
          "POST",
          {
            resolution:
              "Reviewed the listing and confirmed it violates posting standards.",
            action: "cancel_job",
          },
          admin.cookie,
        )
      ).status,
    ).toBe(200);
    expect((await detail(job)).job.status).toBe("cancelled");
    expect((await request(app, ctx.env, `/jobs/${job.id}`, "GET")).status).toBe(
      404,
    );
  });
  it("stores early-access consent once without exposing membership, and exports only the signed-in users data", async () => {
    const body = {
      email: "early@example.test",
      city: "Toronto",
      role: "worker",
      consent: true,
    };
    expect(
      (await request(app, ctx.env, "/waitlist", "POST", body)).status,
    ).toBe(201);
    expect(
      (await request(app, ctx.env, "/waitlist", "POST", body)).status,
    ).toBe(201);
    const row = await ctx.env.DB.prepare(
      "SELECT count(*) AS n,consent_at FROM waitlist",
    ).first<{ n: number; consent_at: string }>();
    expect(row?.n).toBe(1);
    expect(row?.consent_at).toBeTruthy();
    await create();
    const exported = await request(
      app,
      ctx.env,
      "/me/export",
      "GET",
      undefined,
      worker.cookie,
    );
    const text = await exported.text();
    expect(text).toContain("worker@example.test");
    expect(text).not.toContain("poster@example.test");
    expect(text).not.toContain("token_hash");
  });
});
