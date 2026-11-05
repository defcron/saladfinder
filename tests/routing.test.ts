import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/server/index";
import type { AppBindings } from "../src/server/types";
import { makeTestEnv } from "./helpers";

describe("canonical public routing", () => {
  let fixture: Awaited<ReturnType<typeof makeTestEnv>>;
  const assets = vi.fn<Fetcher["fetch"]>();

  beforeEach(async () => {
    assets.mockReset().mockImplementation(async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      return new Response(request.method === "HEAD" ? null : "asset content", {
        headers: {
          "Content-Type": "text/html",
          "Content-Security-Policy": "default-src 'self'",
          "Cache-Control": "public, max-age=3600",
        },
      });
    });
    fixture = await makeTestEnv({
      APP_ENV: "production",
      APP_URL: "https://saladfinder.com",
      ASSETS: {
        fetch: assets,
        connect() {
          throw new Error("Assets must not open a socket.");
        },
      },
    });
  });

  afterEach(async () => {
    await fixture.dispose();
  });

  it.each([
    ["GET", "https://daywork.defcronyke.workers.dev"],
    ["HEAD", "https://daywork.defcronyke.workers.dev"],
    ["GET", "https://saladfinder.pages.dev"],
    ["HEAD", "https://saladfinder.pages.dev"],
    ["GET", "https://www.saladfinder.com"],
    ["GET", "http://saladfinder.com"],
    ["GET", "http://www.saladfinder.com"],
    ["HEAD", "http://www.saladfinder.com"],
  ])(
    "redirects %s on %s while preserving encoded paths and queries",
    async (method, origin) => {
      const path =
        "/jobs/a%2Fb?city=Kitchener%20Waterloo&next=https%3A%2F%2Fother.example%2F";
      const response = await worker.fetch(
        new Request(`${origin}${path}`, { method }),
        fixture.env,
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        `https://saladfinder.com${path}`,
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.has("set-cookie")).toBe(false);
      expect(await response.text()).toBe("");
      expect(assets).not.toHaveBeenCalled();
    },
  );

  it("cannot turn a double-slash path or forged headers into an open redirect", async () => {
    const response = await worker.fetch(
      new Request(
        "https://saladfinder.pages.dev//attacker.example/auth/verify?next=//attacker.example",
        {
          headers: {
            Host: "attacker.example",
            "X-Forwarded-Host": "attacker.example",
            "X-Forwarded-Proto": "http",
          },
        },
      ),
      fixture.env,
    );
    expect(response.status).toBe(308);
    const target = new URL(response.headers.get("location")!);
    expect(target.origin).toBe("https://saladfinder.com");
    expect(target.pathname).toBe("//attacker.example/auth/verify");
    expect(target.search).toBe("?next=//attacker.example");
  });

  it.each(["GET", "HEAD"])(
    "passes canonical %s pages to ASSETS with their existing headers",
    async (method) => {
      const request = new Request(
        "https://saladfinder.com/jobs/local?city=Toronto",
        {
          method,
          headers: { "X-Forwarded-Host": "www.saladfinder.com" },
        },
      );
      const response = await worker.fetch(request, fixture.env);
      expect(response.status).toBe(200);
      expect(response.headers.has("location")).toBe(false);
      expect(response.headers.get("content-security-policy")).toBe(
        "default-src 'self'",
      );
      expect(response.headers.get("cache-control")).toBe(
        "public, max-age=3600",
      );
      expect(await response.text()).toBe(
        method === "HEAD" ? "" : "asset content",
      );
      expect(assets).toHaveBeenCalledExactlyOnceWith(request);
    },
  );

  const inactiveCases: [string, Partial<AppBindings>][] = [
    [
      "the pre-migration production URL",
      { APP_URL: "https://daywork.defcronyke.workers.dev" },
    ],
    ["local development", { APP_ENV: "local" }],
    ["staging", { APP_ENV: "staging" }],
    ["an invalid APP_URL", { APP_URL: "invalid" }],
    ["an arbitrary configured origin", { APP_URL: "https://attacker.example" }],
    [
      "a configured URL with credentials",
      { APP_URL: "https://user:pass@www.saladfinder.com" },
    ],
  ];
  it.each(inactiveCases)(
    "does not activate redirects for %s",
    async (_label, overrides) => {
      Object.assign(fixture.env, overrides);
      const response = await worker.fetch(
        new Request("https://saladfinder.pages.dev/"),
        fixture.env,
      );
      expect(response.status).toBe(200);
      expect(response.headers.has("location")).toBe(false);
      expect(assets).toHaveBeenCalledOnce();
    },
  );

  it.each([
    "http://localhost:8787",
    "http://127.0.0.1:8787",
    "http://[::1]:8787",
    "https://saladfinder-staging.defcronyke.workers.dev",
    "https://kycaml.saladfinder.com",
    "https://saladfinder.pages.dev.attacker.example",
    "https://saladfinder.pages.dev:8443",
  ])(
    "leaves unrelated hosts and development endpoints alone: %s",
    async (origin) => {
      const response = await worker.fetch(
        new Request(`${origin}/`),
        fixture.env,
      );
      expect(response.status).toBe(200);
      expect(response.headers.has("location")).toBe(false);
    },
  );

  it("routes canonical APIs through Hono rather than the SPA fallback", async () => {
    const health = await worker.fetch(
      new Request("https://saladfinder.com/api/health"),
      fixture.env,
    );
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      service: "saladfinder",
      status: "ok",
    });
    expect(health.headers.get("cache-control")).toBe("no-store");
    for (const path of ["/api/missing", "/api"]) {
      const missing = await worker.fetch(
        new Request(`https://saladfinder.com${path}`),
        fixture.env,
      );
      expect(missing.status).toBe(404);
      expect(missing.headers.get("content-type")).toContain("application/json");
    }
    const alias = await worker.fetch(
      new Request("https://saladfinder.pages.dev/api/health"),
      fixture.env,
    );
    expect(alias.status).toBe(308);
    expect(alias.headers.get("location")).toBe(
      "https://saladfinder.com/api/health",
    );
    expect(assets).not.toHaveBeenCalled();
  });

  it("does not redirect API mutations or relax their origin protection", async () => {
    for (const origin of [
      "https://saladfinder.pages.dev",
      "https://daywork.defcronyke.workers.dev",
    ]) {
      const response = await worker.fetch(
        new Request(`${origin}/api/auth/request`, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({ email: "member@example.test", consent: true }),
        }),
        fixture.env,
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: "Request origin is not allowed.",
      });
      expect(response.headers.has("location")).toBe(false);
    }
    const canonical = await worker.fetch(
      new Request("https://saladfinder.com/api/auth/request", {
        method: "POST",
        headers: {
          Origin: "https://saladfinder.com",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "member@example.test", consent: true }),
      }),
      fixture.env,
    );
    expect(canonical.status).toBe(503); // Email is still disabled, but the origin passes.
    expect(await canonical.json()).toMatchObject({
      error: expect.stringContaining("Email sign-in"),
    });
    expect(assets).not.toHaveBeenCalled();
  });

  it("keeps both legacy Stripe webhook paths with the signature-verifying handlers", async () => {
    fixture.env.STRIPE_SECRET_KEY = "sk_test_fake";
    fixture.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";
    fixture.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_fake";
    for (const path of ["stripe", "stripe-connect"]) {
      const response = await worker.fetch(
        new Request(
          `https://daywork.defcronyke.workers.dev/api/webhooks/${path}`,
          {
            method: "POST",
            body: "{}",
          },
        ),
        fixture.env,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: "Invalid webhook signature.",
      });
      expect(response.headers.has("location")).toBe(false);
    }
    expect(assets).not.toHaveBeenCalled();
  });

  it("rejects unsupported static-page methods without redirecting request bodies", async () => {
    const response = await worker.fetch(
      new Request("https://saladfinder.pages.dev/", {
        method: "POST",
        body: "private request body",
      }),
      fixture.env,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    expect(response.headers.has("location")).toBe(false);
    expect(assets).not.toHaveBeenCalled();
  });
});
