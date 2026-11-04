import { afterEach, beforeEach, describe, expect, it } from "vitest";
import worker, { app } from "../src/server/index";
import { makeTestEnv } from "./helpers";

describe("assembled Worker", () => {
  let fixture: Awaited<ReturnType<typeof makeTestEnv>>;
  beforeEach(async () => {
    fixture = await makeTestEnv();
  });
  afterEach(async () => {
    await fixture.dispose();
  });

  it("checks database health and applies no-store and browser security headers", async () => {
    const response = await app.fetch(
      new Request("http://localhost/api/health"),
      fixture.env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      service: "saladfinder",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
  });

  it("returns accurate production readiness without exposing secrets or local sign-in", async () => {
    fixture.env.APP_ENV = "production";
    fixture.env.APP_URL = "https://daywork.example";
    fixture.env.STRIPE_SECRET_KEY = "sk_test_never_return_this";
    fixture.env.RESEND_API_KEY = "re_never_return_this";
    const response = await app.fetch(
      new Request("https://daywork.example/api/config"),
      fixture.env,
    );
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({
      launchMode: "preview",
      authReady: false,
      paymentsReady: false,
      currency: "CAD",
    });
    expect(text).not.toContain("never_return_this");
  });

  it("rejects unknown API routes, unsafe cross-origin requests and unsigned webhooks", async () => {
    const missing = await app.fetch(
      new Request("http://localhost/api/missing"),
      fixture.env,
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get("content-type")).toContain("application/json");
    const forged = await app.fetch(
      new Request("http://localhost/api/jobs", {
        method: "POST",
        headers: {
          Origin: "https://attacker.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      fixture.env,
    );
    expect(forged.status).toBe(403);
    fixture.env.STRIPE_SECRET_KEY = "sk_test_fake";
    fixture.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";
    const unsigned = await app.fetch(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
      }),
      fixture.env,
    );
    expect(unsigned.status).toBe(400);
    expect(await unsigned.json()).toMatchObject({
      error: "Invalid webhook signature.",
    });
  });

  it("bounds body sizes before business handlers", async () => {
    const oversized = await app.fetch(
      new Request("http://localhost/api/waitlist", {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: "x".repeat(1024 * 1024 + 1),
      }),
      fixture.env,
    );
    expect(oversized.status).toBe(413);
  });

  it("cleans expired credentials and throttles without erasing active records", async () => {
    const now = Math.floor(Date.now() / 1000);
    await fixture.env.DB.batch([
      fixture.env.DB.prepare(
        "INSERT INTO auth_tokens VALUES (?,?,?,?,?,?)",
      ).bind("expired", "a@example.test", "A", "worker", now - 1, now - 1000),
      fixture.env.DB.prepare(
        "INSERT INTO auth_tokens VALUES (?,?,?,?,?,?)",
      ).bind("active", "b@example.test", "B", "worker", now + 900, now),
      fixture.env.DB.prepare("INSERT INTO rate_limits VALUES (?,?,?)").bind(
        "expired",
        1,
        now - 1,
      ),
      fixture.env.DB.prepare("INSERT INTO rate_limits VALUES (?,?,?)").bind(
        "active",
        1,
        now + 900,
      ),
    ]);
    await worker.scheduled(
      { cron: "17 4 * * *", scheduledTime: Date.now(), noRetry() {} },
      fixture.env,
    );
    expect(
      (await fixture.env.DB.prepare("SELECT token_hash FROM auth_tokens").all())
        .results,
    ).toEqual([{ token_hash: "active" }]);
    expect(
      (await fixture.env.DB.prepare("SELECT key FROM rate_limits").all())
        .results,
    ).toEqual([{ key: "active" }]);
  });
});
