import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv, UserRow } from "./types";
import { POLICY_VERSION, type User } from "../shared/types";
import {
  audit,
  digest,
  isAdmin,
  isLocal,
  jsonInput,
  randomToken,
  rateLimit,
  requestIp,
  requireUser,
  verifyTurnstile,
} from "./middleware";

const cookieName = (env: Env, url: string) =>
  isLocal(env, url) ? "daywork_local" : "__Host-daywork";
export function serializeUser(row: UserRow, env: Env): User {
  return {
    ...row,
    skills: JSON.parse(row.skills) as string[],
    is_admin: isAdmin(row, env),
  };
}
export const loadUser = createMiddleware<AppEnv>(async (c, next) => {
  c.set("user", null);
  const token = getCookie(c, cookieName(c.env, c.req.url));
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const row = await c.env.DB.prepare(
      "SELECT u.id,u.email,u.name,u.role,u.bio,u.city,u.skills,u.created_at,u.stripe_account_id,u.suspended_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
    )
      .bind(await digest(token), Math.floor(Date.now() / 1000))
      .first<UserRow>();
    if (row) c.set("user", serializeUser(row, c.env));
  }
  await next();
});
const authRequest = z.object({
  email: z
    .email()
    .max(254)
    .transform((x) => x.trim().toLowerCase()),
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(["worker", "poster", "both"]).default("both"),
  consent: z.literal(true),
  turnstileToken: z.string().max(2048).optional(),
});
export const auth = new Hono<AppEnv>();
auth.post("/auth/request", async (c) => {
  const body = await jsonInput(c, authRequest);
  const local = isLocal(c.env, c.req.url);
  if (!local && (!c.env.RESEND_API_KEY || !c.env.EMAIL_FROM))
    throw new HTTPException(503, {
      message:
        "Email sign-in is being set up. Please join early access for launch updates.",
    });
  await rateLimit(c, "auth-ip", requestIp(c), 10, 3600);
  await rateLimit(c, "auth-email", body.email, 3, 900);
  await verifyTurnstile(c, body.turnstileToken, "auth");
  const token = randomToken();
  const tokenHash = await digest(token);
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    "INSERT INTO auth_tokens (token_hash,email,name,role,expires_at,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(
      tokenHash,
      body.email,
      body.name || "Daywork member",
      body.role,
      now + 900,
      now,
    )
    .run();
  if (local)
    return c.json({
      ok: true,
      message: "Local development sign-in link created.",
      devToken: token,
    });
  const url = `${new URL(c.env.APP_URL).origin}/auth/verify#token=${token}`;
  let delivered = false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: c.env.EMAIL_FROM,
        to: [body.email],
        subject: "Your Daywork sign-in link",
        text: `Sign in to Daywork using this link: ${url}\n\nThis link expires in 15 minutes and can be used once. If you did not request it, you can ignore this email. Never share this link.\n\nDaywork`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    delivered = response.ok;
  } catch {
    delivered = false;
  }
  if (!delivered) {
    await c.env.DB.prepare("DELETE FROM auth_tokens WHERE token_hash=?")
      .bind(tokenHash)
      .run();
    throw new HTTPException(503, {
      message: "We could not send a sign-in email. Please try again later.",
    });
  }
  return c.json({
    ok: true,
    message: "Check your email for a sign-in link. It expires in 15 minutes.",
  });
});
auth.post("/auth/verify", async (c) => {
  const { token } = await jsonInput(
    c,
    z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }),
  );
  await rateLimit(c, "verify-ip", requestIp(c), 20, 900);
  const now = Math.floor(Date.now() / 1000);
  const row = await c.env.DB.prepare(
    "DELETE FROM auth_tokens WHERE token_hash=? AND expires_at>? RETURNING email,name,role",
  )
    .bind(await digest(token), now)
    .first<{ email: string; name: string; role: string }>();
  if (!row)
    throw new HTTPException(400, {
      message:
        "This sign-in link has expired or was already used. Request a new link.",
    });
  await c.env.DB.prepare(
    "INSERT INTO users (id,email,name,role,consent_at,terms_version) VALUES (?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING",
  )
    .bind(
      crypto.randomUUID(),
      row.email,
      row.name,
      row.role,
      new Date().toISOString(),
      POLICY_VERSION,
    )
    .run();
  const user = await c.env.DB.prepare(
    "SELECT id,email,name,role,bio,city,skills,created_at,stripe_account_id,suspended_at FROM users WHERE email=?",
  )
    .bind(row.email)
    .first<UserRow>();
  if (!user)
    throw new HTTPException(500, { message: "Unable to create your session." });
  if (user.suspended_at)
    throw new HTTPException(403, {
      message: "Your account is suspended. Contact support.",
    });
  const session = randomToken();
  await c.env.DB.prepare(
    "INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)",
  )
    .bind(await digest(session), user.id, now + 604800, now)
    .run();
  setCookie(c, cookieName(c.env, c.req.url), session, {
    path: "/",
    secure: !isLocal(c.env, c.req.url),
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 604800,
  });
  c.header("Cache-Control", "no-store");
  return c.json({ user: serializeUser(user, c.env) });
});
auth.get("/me", (c) => c.json({ user: c.get("user") }));
auth.patch("/me", requireUser, async (c) => {
  const input = await jsonInput(
    c,
    z.object({
      name: z.string().trim().min(2).max(80),
      bio: z.string().trim().max(1500),
      city: z.string().trim().max(80),
      skills: z.array(z.string().trim().min(1).max(40)).max(15),
    }),
  );
  const user = c.get("user")!;
  await c.env.DB.prepare(
    "UPDATE users SET name=?,bio=?,city=?,skills=? WHERE id=?",
  )
    .bind(
      input.name,
      input.bio,
      input.city,
      JSON.stringify(input.skills),
      user.id,
    )
    .run();
  return c.json({ user: { ...user, ...input } });
});
auth.post("/auth/logout", async (c) => {
  const token = getCookie(c, cookieName(c.env, c.req.url));
  if (token)
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await digest(token))
      .run();
  deleteCookie(c, cookieName(c.env, c.req.url), {
    path: "/",
    secure: !isLocal(c.env, c.req.url),
    httpOnly: true,
    sameSite: "Lax",
  });
  return c.json({ ok: true });
});
auth.get("/me/export", requireUser, async (c) => {
  const user = c.get("user")!;
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      "SELECT * FROM jobs WHERE poster_id=? OR worker_id=?",
    ).bind(user.id, user.id),
    c.env.DB.prepare("SELECT * FROM applications WHERE worker_id=?").bind(
      user.id,
    ),
    c.env.DB.prepare("SELECT * FROM messages WHERE sender_id=?").bind(user.id),
    c.env.DB.prepare(
      "SELECT * FROM reviews WHERE author_id=? OR subject_id=?",
    ).bind(user.id, user.id),
    c.env.DB.prepare(
      "SELECT id,job_id,reason,status,resolution,created_at FROM reports WHERE reporter_id=?",
    ).bind(user.id),
  ]);
  c.header("Content-Disposition", 'attachment; filename="daywork-data.json"');
  return c.json({
    exportedAt: new Date().toISOString(),
    user,
    jobs: results[0].results,
    applications: results[1].results,
    messages: results[2].results,
    reviews: results[3].results,
    reports: results[4].results,
  });
});
auth.post("/me/sessions/revoke", requireUser, async (c) => {
  const user = c.get("user")!;
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
    audit(c.env.DB, user.id, "sessions.revoked", user.id),
  ]);
  deleteCookie(c, cookieName(c.env, c.req.url), {
    path: "/",
    secure: !isLocal(c.env, c.req.url),
    httpOnly: true,
    sameSite: "Lax",
  });
  return c.json({ ok: true });
});
