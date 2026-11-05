import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { stripeReadiness } from "../src/server/stripe-readiness";

const env = {
  APP_URL: "https://saladfinder.example",
  STRIPE_SECRET_KEY: "rk_live_fixture",
  LAUNCH_MODE: "preview",
  STRIPE_MODE: "live",
} as Env;
function fixture() {
  const endpoints = ["stripe", "stripe-connect"].map((path) => ({
    url: `${env.APP_URL}/api/webhooks/${path}`,
    status: "enabled",
    livemode: true,
    api_version: "2026-10-28.endive",
    enabled_events: ["*"],
    secret: "whsec_must_not_escape",
  }));
  const client = {
    accounts: {
      retrieve: vi.fn(async () => ({
        country: "CA",
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        email: "private@example.test",
      })),
    },
    v2: { core: { accounts: { list: vi.fn(async () => ({ data: [] })) } } },
    balance: {
      retrieve: vi.fn(async () => ({
        livemode: true,
        available: [{ amount: 98765 }],
      })),
    },
    webhookEndpoints: {
      list: vi.fn(async () => ({ data: endpoints, has_more: false })),
    },
  };
  return { client, stripe: client as unknown as Stripe, endpoints };
}
describe("bounded read-only Stripe connection diagnostics", () => {
  it("checks the deployed credential in preview without returning financial or secret payloads", async () => {
    const f = fixture();
    const report = await stripeReadiness(f.stripe, env);
    expect(report).toMatchObject({
      connectionChecksPassed: true,
      launchMode: "preview",
      liveMode: true,
    });
    expect(f.client.accounts.retrieve).toHaveBeenCalledWith(null);
    expect(f.client.v2.core.accounts.list).toHaveBeenCalledWith({ limit: 1 });
    expect(f.client.webhookEndpoints.list).toHaveBeenCalledWith({ limit: 100 });
    expect(JSON.stringify(report)).not.toMatch(
      /whsec_|rk_live_|98765|private@example/,
    );
    expect(report.limitation).toContain("does not verify webhook delivery");
  });
  it("isolates access failures and suppresses Stripe error bodies", async () => {
    const f = fixture();
    f.client.v2.core.accounts.list.mockRejectedValue({
      statusCode: 403,
      message: "rk_live_secret",
      raw: { personal: "private" },
    });
    f.client.balance.retrieve.mockRejectedValue(new Error("secret"));
    const report = await stripeReadiness(f.stripe, env);
    expect(report.connectionChecksPassed).toBe(false);
    expect(report.checks.accountsV2).toEqual({ ok: false, status: 403 });
    expect(report.checks.balance).toEqual({ ok: false, status: null });
    expect(report.checks.webhooks.ok).toBe(true);
    expect(JSON.stringify(report)).not.toContain("secret");
  });
  it.each([
    "disabled",
    "wrong-url",
    "wrong-mode",
    "wrong-version",
    "missing-events",
  ])("rejects %s endpoint configuration", async (fault) => {
    const f = fixture();
    const endpoint = f.endpoints[1]!;
    if (fault === "disabled") endpoint.status = "disabled";
    if (fault === "wrong-url") endpoint.url += "-other";
    if (fault === "wrong-mode") endpoint.livemode = false;
    if (fault === "wrong-version") endpoint.api_version = "2020-08-27";
    if (fault === "missing-events")
      endpoint.enabled_events = ["payout.created"];
    expect(
      (await stripeReadiness(f.stripe, env)).checks.webhooks,
    ).toMatchObject({ ok: false, payments: true, payouts: false });
  });
  it("fails closed on truncated inventory and wrong platform country or mode", async () => {
    const f = fixture();
    f.client.webhookEndpoints.list.mockResolvedValue({
      data: f.endpoints,
      has_more: true,
    });
    f.client.accounts.retrieve.mockResolvedValue({
      country: "US",
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      email: "private@example.test",
    });
    f.client.balance.retrieve.mockResolvedValue({
      livemode: false,
      available: [],
    });
    const report = await stripeReadiness(f.stripe, env);
    expect(report.connectionChecksPassed).toBe(false);
    expect(report.checks.webhooks.ok).toBe(false);
    expect(report.checks.platform.ok).toBe(false);
    expect(report.checks.balance.ok).toBe(false);
  });
});
