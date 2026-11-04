import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/server/index";
import { digest } from "../src/server/middleware";
import type { AppBindings } from "../src/server/types";
import { makeTestEnv, request } from "./helpers";

describe("transactional email provider selection", () => {
  let fixture: Awaited<ReturnType<typeof makeTestEnv>>;
  const send =
    vi.fn<
      (message: EmailMessage | EmailMessageBuilder) => Promise<EmailSendResult>
    >();
  const fetchMock = vi.fn<typeof fetch>();
  const signInBody = {
    email: "MEMBER@example.test",
    consent: true,
    turnstileToken: "challenge",
  };

  beforeEach(async () => {
    send.mockReset().mockResolvedValue({ messageId: "cloudflare-message" });
    fetchMock.mockReset().mockImplementation(async (input) => {
      if (!String(input).includes("/turnstile/"))
        throw new Error("Unexpected external request");
      return Response.json({
        success: true,
        hostname: "localhost",
        action: "auth",
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    fixture = await makeTestEnv({
      APP_ENV: "production",
      EMAIL_PROVIDER: "cloudflare",
      EMAIL_FROM: "SaladFinder <sign-in@mail.example.test>",
      EMAIL: { send },
      TURNSTILE_SITE_KEY: "test-site",
      TURNSTILE_SECRET_KEY: "test-turnstile-secret",
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await fixture.dispose();
  });

  async function authReady() {
    const response = await request(app, fixture.env, "/config");
    expect(response.status).toBe(200);
    return ((await response.json()) as { authReady: boolean }).authReady;
  }

  async function storedTokenCount() {
    return (
      await fixture.env.DB.prepare(
        "SELECT COUNT(*) AS n FROM auth_tokens",
      ).first<{ n: number }>()
    )?.n;
  }

  it.each([
    "SaladFinder <sign-in@mail.example.test>",
    "sign-in@mail.example.test",
  ])(
    "sends a usable single-use link through Cloudflare from %s",
    async (from) => {
      fixture.env.EMAIL_FROM = from;
      expect(await authReady()).toBe(true);
      const response = await request(
        app,
        fixture.env,
        "/auth/request",
        "POST",
        signInBody,
      );
      expect(response.status).toBe(200);
      const responseText = await response.text();
      expect(responseText).not.toContain("devToken");
      expect(send).toHaveBeenCalledOnce();
      const message = send.mock.calls[0][0] as EmailMessageBuilder;
      expect(message).toMatchObject({
        from: { email: "sign-in@mail.example.test", name: "SaladFinder" },
        to: "member@example.test",
        subject: "Your SaladFinder sign-in link",
      });
      expect(message.html).toContain("Your sign-in link");
      expect(message.html).toContain("/brand/logo-email.png");
      const token = message.text?.match(
        /http:\/\/localhost\/auth\/verify#token=([a-f0-9]{64})/,
      )?.[1];
      expect(token).toMatch(/^[a-f0-9]{64}$/);
      expect(responseText).not.toContain(token!);
      expect(
        await fixture.env.DB.prepare(
          "SELECT token_hash FROM auth_tokens",
        ).first(),
      ).toEqual({ token_hash: await digest(token!) });
      const verify = () =>
        request(app, fixture.env, "/auth/verify", "POST", { token });
      expect((await verify()).status).toBe(200);
      expect((await verify()).status).toBe(400);
      // The only HTTP fetch is Turnstile: Cloudflare sends through its binding.
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it("invalidates a link after a binding failure without leaking provider details or falling back", async () => {
    fixture.env.RESEND_API_KEY = "unused-fallback-key";
    send.mockRejectedValue(
      new Error("Provider failure containing private recipient details"),
    );
    const response = await request(
      app,
      fixture.env,
      "/auth/request",
      "POST",
      signInBody,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "We could not send a sign-in email. Please try again later.",
    });
    const message = send.mock.calls[0][0] as EmailMessageBuilder;
    const token = message.text?.match(/#token=([a-f0-9]{64})/)?.[1];
    expect(token).toBeTruthy();
    expect(await storedTokenCount()).toBe(0);
    expect(
      (await request(app, fixture.env, "/auth/verify", "POST", { token }))
        .status,
    ).toBe(400);
    expect(send).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  const unavailableCases: [string, Partial<AppBindings>][] = [
    [
      "disabled despite credentials",
      { EMAIL_PROVIDER: "disabled", RESEND_API_KEY: "configured-key" },
    ],
    [
      "unknown provider",
      {
        EMAIL_PROVIDER: "misspelled-provider",
        RESEND_API_KEY: "configured-key",
      },
    ],
    [
      "empty provider",
      { EMAIL_PROVIDER: "", RESEND_API_KEY: "configured-key" },
    ],
    ["missing Cloudflare binding", { EMAIL: undefined }],
    ["invalid sender", { EMAIL_FROM: "SaladFinder <invalid>" }],
    [
      "sender with header injection",
      { EMAIL_FROM: "sign-in@mail.example.test\r\nBcc: another@example.test" },
    ],
    ["missing Turnstile site key", { TURNSTILE_SITE_KEY: "" }],
    ["missing Turnstile secret", { TURNSTILE_SECRET_KEY: undefined }],
    ["Resend selected without its key", { EMAIL_PROVIDER: "resend" }],
  ];
  it.each(unavailableCases)(
    "reports unavailable and rejects sign-in for %s",
    async (_label, overrides) => {
      Object.assign(fixture.env, overrides);
      expect(await authReady()).toBe(false);
      const response = await request(
        app,
        fixture.env,
        "/auth/request",
        "POST",
        signInBody,
      );
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("devToken");
      expect(await storedTokenCount()).toBe(0);
      expect(send).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(["resend", "omitted"])(
    "uses Resend when provider is %s without calling the Cloudflare binding",
    async (provider) => {
      fixture.env.EMAIL_PROVIDER = provider;
      if (provider === "omitted")
        Reflect.deleteProperty(fixture.env, "EMAIL_PROVIDER");
      fixture.env.RESEND_API_KEY = "resend-secret";
      fetchMock.mockImplementation(async (input) => {
        if (String(input).includes("/turnstile/"))
          return Response.json({
            success: true,
            hostname: "localhost",
            action: "auth",
          });
        if (String(input) === "https://api.resend.com/emails")
          return Response.json({ id: "resend-message" });
        throw new Error("Unexpected external request");
      });
      expect(await authReady()).toBe(true);
      const response = await request(
        app,
        fixture.env,
        "/auth/request",
        "POST",
        signInBody,
      );
      expect(response.status).toBe(200);
      expect(send).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe("https://api.resend.com/emails");
      const init = fetchMock.mock.calls[1][1];
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer resend-secret",
      });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        from: fixture.env.EMAIL_FROM,
        to: ["member@example.test"],
        subject: "Your SaladFinder sign-in link",
      });
      expect(await storedTokenCount()).toBe(1);
    },
  );

  it("preserves loopback-only development sign-in even when mail is disabled", async () => {
    fixture.env.APP_ENV = "local";
    fixture.env.EMAIL_PROVIDER = "disabled";
    fixture.env.TURNSTILE_SITE_KEY = "";
    fixture.env.TURNSTILE_SECRET_KEY = undefined;
    expect(await authReady()).toBe(true);
    const response = await request(
      app,
      fixture.env,
      "/auth/request",
      "POST",
      signInBody,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      devToken: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(send).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    fixture.env.APP_URL = "https://public.example.test";
    const remoteConfig = await app.fetch(
      new Request(`${fixture.env.APP_URL}/api/config`),
      fixture.env,
    );
    expect(await remoteConfig.json()).toMatchObject({ authReady: false });
  });
});

describe("branded sign-in email", () => {
  it("provides an image-independent sign-in action and escapes HTML attributes", async () => {
    const { signInEmailHtml } = await import("../src/server/email");
    const html = signInEmailHtml(
      "https://saladfinder.com/auth/verify?x=\"<&'#token=example",
    );
    expect(html).toContain("https://saladfinder.com/brand/logo-email.png");
    expect(html).toContain('alt="SaladFinder"');
    expect(html).toContain("Sign in to SaladFinder</a>");
    expect(html).toContain("&quot;&lt;&amp;&#39;#token=example");
    expect(html).toContain("15 minutes");
    expect(html).not.toContain("<script");
  });
});
