import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertStripeMode,
  stripeConfigured,
  stripeMode,
} from "../src/server/stripe-environment";

describe("Stripe deployment mode boundary", () => {
  it.each([
    ["test", "rk_test_fixture", "test"],
    ["test", "sk_test_fixture", "test"],
    ["test", "rkcs_test_fixture", "test"],
    ["live", "rk_live_fixture", "live"],
    ["live", "sk_live_fixture", "live"],
    ["test", "rk_live_fixture", null],
    ["live", "rk_test_fixture", null],
    [undefined, "rk_live_fixture", null],
    ["unknown", "rk_test_fixture", null],
    ["test", "pk_test_fixture", null],
    ["test", "", null],
  ])(
    "requires declared mode %s to match the credential",
    (mode, key, expected) => {
      const env = {
        STRIPE_MODE: mode,
        STRIPE_SECRET_KEY: key,
        STRIPE_WEBHOOK_SECRET: "whsec_payment",
        STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_payout",
      } as Env;
      expect(stripeMode(env)).toBe(expected);
      expect(stripeConfigured(env)).toBe(expected !== null);
      if (expected) expect(assertStripeMode(env)).toBe(expected);
      else
        expect(() => assertStripeMode(env)).toThrow("configured payment mode");
    },
  );

  it("requires both signing secrets even with a valid key", () => {
    const env = {
      STRIPE_MODE: "test",
      STRIPE_SECRET_KEY: "rk_test_fixture",
    } as Env;
    expect(stripeConfigured(env)).toBe(false);
    env.STRIPE_WEBHOOK_SECRET = "whsec_payment";
    expect(stripeConfigured(env)).toBe(false);
    env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_payout";
    expect(stripeConfigured(env)).toBe(true);
  });

  it("deploys the shared entry point with isolated storage and fixed test/live modes", () => {
    // This repository's JSONC uses trailing commas, with no comments.
    const config = JSON.parse(
      readFileSync(
        new URL("../wrangler.jsonc", import.meta.url),
        "utf8",
      ).replace(/,\s*([}\]])/g, "$1"),
    );
    expect(config.main).toBe("src/server/index.ts");
    expect(config.vars.STRIPE_MODE).toBe("live");
    expect(config.env.staging.vars.STRIPE_MODE).toBe("test");
    expect(config.env.local.vars.STRIPE_MODE).toBe("test");
    expect(config.env.staging.main).toBeUndefined();
    expect(config.env.staging.d1_databases[0].database_id).not.toBe(
      config.d1_databases[0].database_id,
    );
    expect(config.env.staging.vars.APP_URL).not.toBe(config.vars.APP_URL);
    expect(config.env.staging.routes).toEqual([]);
  });
});
