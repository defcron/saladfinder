import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth, loadUser } from "../src/server/auth";
import { marketplace } from "../src/server/marketplace";
import { originGuard } from "../src/server/middleware";
import type { AppBindings, AppEnv } from "../src/server/types";

export async function makeTestEnv(overrides: Partial<AppBindings> = {}) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "test",
          modules: true,
          script: 'export default { fetch() { return new Response("test"); } }',
          compatibilityDate: "2026-11-03",
          d1Databases: ["DB"],
          serviceBindings: { ASSETS: async () => new Response("test asset") },
          bindings: {
            APP_ENV: "local",
            STRIPE_MODE: "test",
            APP_URL: "http://localhost",
            LAUNCH_MODE: "preview",
            EMAIL_FROM: "",
            EMAIL_PROVIDER: "resend",
            SUPPORT_EMAIL: "",
            ADMIN_EMAILS: "operator@example.test",
            TURNSTILE_SITE_KEY: "",
          },
        },
      ],
    }),
  );
  const env = await mf.getBindings<AppBindings>("test");
  Object.assign(env, overrides);
  const names = (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((n) => n.endsWith(".sql"))
    .sort();
  for (const name of names) {
    const sql = await readFile(
      new URL(`../migrations/${name}`, import.meta.url),
      "utf8",
    );
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
  }
  return { env, dispose: () => mf.dispose() };
}
export function testApp() {
  const app = new Hono<AppEnv>();
  app.use("/api/*", originGuard);
  app.use("/api/*", loadUser);
  app.route("/api", auth);
  app.route("/api", marketplace);
  app.onError((error, c) => {
    if (error instanceof HTTPException)
      return c.json({ error: error.message }, error.status);
    console.error(error);
    return c.json({ error: "Unexpected test server error" }, 500);
  });
  return app;
}
export function request(
  app: Hono<AppEnv>,
  env: AppBindings,
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
) {
  return app.fetch(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
        Cookie: cookie,
        "CF-Connecting-IP": "127.0.0.1",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  );
}
export async function login(
  app: Hono<AppEnv>,
  env: AppBindings,
  email: string,
  name = "Test Member",
) {
  const res = await request(app, env, "/auth/request", "POST", {
    email,
    name,
    role: "both",
    consent: true,
  });
  const data = (await res.json()) as { devToken: string };
  if (!data.devToken)
    throw new Error(
      `Auth request failed: ${res.status} ${JSON.stringify(data)}`,
    );
  const verified = await request(app, env, "/auth/verify", "POST", {
    token: data.devToken,
  });
  const payload = (await verified.json()) as {
    user: import("../src/shared/types").User;
  };
  if (!payload.user)
    throw new Error(
      `Auth verify failed: ${verified.status} ${JSON.stringify(payload)}`,
    );
  const cookie = verified.headers.get("set-cookie")!.split(";")[0];
  return { user: payload.user, cookie, token: data.devToken };
}
export const jobBody = () => ({
  title: "Help with a backyard cleanup",
  description:
    "Collect and bag leaves in the backyard. Gloves and bags supplied. No ladders, tools, or hazardous materials.",
  category: "Yard work",
  city: "Toronto",
  area: "Leslieville",
  start_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  estimated_hours: 3,
  milestones: [
    { title: "Collect leaves", amount_cents: 9000 },
    { title: "Bag and tidy up", amount_cents: 9000 },
  ],
});
