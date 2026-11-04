import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest, type GatewayEnv } from "../gateway/functions/[[path]]";
import worker from "../src/server/index";
import { digest } from "../src/server/middleware";
import { makeTestEnv } from "./helpers";

describe("Pages service-binding gateway", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "forwards the original %s request without rewriting URL, headers or body",
    async (method) => {
      const rawBody = '{"signed":"payload", "spacing": true}\n';
      const request = new Request(
        "https://www.saladfinder.com/api/jobs/a%2Fb?next=%2Fdashboard&tag=one&tag=two",
        {
          method,
          headers: {
            Origin: "https://www.saladfinder.com",
            Cookie: "__Host-daywork=session-token",
            Authorization: "Bearer request-credential",
            "Content-Type": "application/json",
            "Stripe-Signature": "signature-must-arrive-unchanged",
            "CF-Connecting-IP": "192.0.2.8",
          },
          ...(["GET", "HEAD"].includes(method) ? {} : { body: rawBody }),
        },
      );
      const upstream = new Response(
        method === "HEAD" ? null : "upstream body",
        {
          status: 201,
          headers: {
            "Cache-Control": "no-store",
            "Content-Security-Policy": "default-src 'none'",
            "Set-Cookie":
              "__Host-daywork=new-session; Secure; HttpOnly; SameSite=Lax; Path=/",
            Location: "https://www.saladfinder.com/dashboard",
          },
        },
      );
      const serviceFetch = vi.fn<NonNullable<GatewayEnv["APP"]>["fetch"]>(
        async (input) => {
          expect(input).toBe(request);
          expect(request.bodyUsed).toBe(false);
          expect(request.headers.get("cookie")).toBe(
            "__Host-daywork=session-token",
          );
          expect(request.headers.get("stripe-signature")).toBe(
            "signature-must-arrive-unchanged",
          );
          expect(request.headers.get("cf-connecting-ip")).toBe("192.0.2.8");
          expect(request.headers.get("origin")).toBe(
            "https://www.saladfinder.com",
          );
          expect(request.headers.get("authorization")).toBe(
            "Bearer request-credential",
          );
          expect(await request.text()).toBe(
            ["GET", "HEAD"].includes(method) ? "" : rawBody,
          );
          return upstream;
        },
      );
      const response = await onRequest({
        request,
        env: { APP: { fetch: serviceFetch } },
      });
      expect(response).toBe(upstream);
      expect(response.headers.get("set-cookie")).toContain(
        "__Host-daywork=new-session; Secure; HttpOnly",
      );
      expect(response.headers.get("location")).toBe(
        "https://www.saladfinder.com/dashboard",
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(serviceFetch).toHaveBeenCalledExactlyOnceWith(request);
    },
  );

  it.each([400, 401, 403, 429, 500, 503])(
    "preserves application error response %s",
    async (status) => {
      const upstream = Response.json(
        { error: "Application response" },
        {
          status,
          headers: { "Retry-After": "90", "Cache-Control": "no-store" },
        },
      );
      const response = await onRequest({
        request: new Request("https://www.saladfinder.com/api/jobs"),
        env: { APP: { fetch: async () => upstream } },
      });
      expect(response).toBe(upstream);
      expect(response.status).toBe(status);
      expect(response.headers.get("retry-after")).toBe("90");
    },
  );

  it.each([
    "https://attacker.example",
    "https://www.saladfinder.com.attacker.example",
    "https://preview-branch.saladfinder.pages.dev",
    "https://a1b2c3d4.saladfinder.pages.dev",
    "https://saladfinder.com",
    "https://kycaml.saladfinder.com",
  ])(
    "rejects unsupported hostname %s before reaching the application",
    async (origin) => {
      const serviceFetch = vi.fn<NonNullable<GatewayEnv["APP"]>["fetch"]>();
      const response = await onRequest({
        request: new Request(`${origin}/api/auth/verify`, {
          method: "POST",
          body: "private body",
          headers: { "X-Forwarded-Host": "www.saladfinder.com" },
        }),
        env: { APP: { fetch: serviceFetch } },
      });
      expect(response.status).toBe(421);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(serviceFetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    "https://saladfinder.pages.dev",
    "http://localhost:8788",
    "http://127.0.0.1:8788",
    "http://[::1]:8788",
  ])(
    "allows the configured Pages hostname and local development: %s",
    async (origin) => {
      const upstream = new Response("application");
      const response = await onRequest({
        request: new Request(`${origin}/`),
        env: { APP: { fetch: async () => upstream } },
      });
      expect(response).toBe(upstream);
    },
  );

  it("serves the new www hostname through the wrapper before APP_URL activation without redirecting away", async () => {
    const fixture = await makeTestEnv({
      APP_ENV: "production",
      APP_URL: "https://daywork.defcronyke.workers.dev",
    });
    try {
      const response = await onRequest({
        request: new Request("https://www.saladfinder.com/"),
        env: {
          APP: {
            fetch: (input, init) =>
              worker.fetch(new Request(input, init), fixture.env),
          },
        },
      });
      expect(response.status).toBe(200);
      expect(response.headers.has("location")).toBe(false);
      expect(await response.text()).toBe("test asset");
    } finally {
      await fixture.dispose();
    }
  });

  it.each(["missing", "throws"])(
    "fails closed when the service binding %s without a public-fetch fallback",
    async (failure) => {
      const publicFetch = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", publicFetch);
      const env: GatewayEnv =
        failure === "missing"
          ? {}
          : {
              APP: {
                fetch: async () => {
                  throw new Error("Sensitive upstream failure detail");
                },
              },
            };
      const response = await onRequest({
        request: new Request(
          "https://www.saladfinder.com/?url=https://elsewhere.example",
        ),
        env,
      });
      expect(response.status).toBe(503);
      expect(await response.text()).toBe(
        "SaladFinder is temporarily unavailable.",
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(publicFetch).not.toHaveBeenCalled();
    },
  );

  it("uses the existing auth, host-only session and origin checks through the service binding", async () => {
    const fixture = await makeTestEnv({
      APP_ENV: "production",
      APP_URL: "https://www.saladfinder.com",
      EMAIL_PROVIDER: "disabled",
    });
    try {
      const env: GatewayEnv = {
        APP: {
          fetch: (input, init) =>
            worker.fetch(
              input instanceof Request && !init
                ? input
                : new Request(input, init),
              fixture.env,
            ),
        },
      };
      const call = (
        path: string,
        method = "GET",
        body?: unknown,
        cookie = "",
        origin = "https://www.saladfinder.com",
      ) =>
        onRequest({
          request: new Request(`https://www.saladfinder.com/api${path}`, {
            method,
            headers: {
              Origin: origin,
              "Content-Type": "application/json",
              Cookie: cookie,
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          }),
          env,
        });
      const token = "a".repeat(64);
      const now = Math.floor(Date.now() / 1000);
      await fixture.env.DB.prepare(
        "INSERT INTO auth_tokens (token_hash,email,name,role,expires_at,created_at) VALUES (?,?,?,?,?,?)",
      )
        .bind(
          await digest(token),
          "gateway@example.test",
          "Gateway Member",
          "both",
          now + 900,
          now,
        )
        .run();
      const verified = await call("/auth/verify", "POST", { token });
      expect(verified.status).toBe(200);
      const cookieHeader = verified.headers.get("set-cookie")!;
      expect(cookieHeader).toMatch(/^__Host-daywork=/);
      expect(cookieHeader).toContain("Secure");
      expect(cookieHeader).toContain("HttpOnly");
      expect(cookieHeader).toContain("SameSite=Lax");
      expect(cookieHeader).not.toContain("Domain=");
      const cookie = cookieHeader.split(";")[0];
      const me = await call("/me", "GET", undefined, cookie);
      expect(me.status).toBe(200);
      expect(await me.json()).toMatchObject({
        user: { email: "gateway@example.test" },
      });
      const rejected = await call(
        "/auth/logout",
        "POST",
        {},
        cookie,
        "https://attacker.example",
      );
      expect(rejected.status).toBe(403);
      expect((await call("/me", "GET", undefined, cookie)).status).toBe(200);
      expect((await call("/auth/logout", "POST", {}, cookie)).status).toBe(200);
      expect(
        await (await call("/me", "GET", undefined, cookie)).json(),
      ).toMatchObject({ user: null });
    } finally {
      await fixture.dispose();
    }
  });
});
