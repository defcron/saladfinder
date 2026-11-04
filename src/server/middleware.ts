import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import type { z } from "zod";
import type { AppEnv } from "./types";
import type { User } from "../shared/types";

export function isLocal(env: Env, requestUrl?: string): boolean {
  if (env.APP_ENV !== "local") return false;
  if (!requestUrl) return true;
  const host = new URL(requestUrl).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}
export function isAdmin(user: Pick<User, "email"> | null, env: Env): boolean {
  return (
    !!user &&
    env.ADMIN_EMAILS.split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .includes(user.email.toLowerCase())
  );
}
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "Sign in to continue." });
  if (user.suspended_at)
    throw new HTTPException(403, {
      message: "Your account is suspended. Contact support.",
    });
  await next();
});
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "Sign in to continue." });
  if (user.suspended_at || !isAdmin(user, c.env))
    throw new HTTPException(403, { message: "Administrator access required." });
  await next();
});
export const requireLive = createMiddleware<AppEnv>(async (c, next) => {
  if (c.env.LAUNCH_MODE !== "live" && !isLocal(c.env, c.req.url)) {
    throw new HTTPException(503, {
      message:
        "SaladFinder is in preview. Join early access to hear when bookings open.",
    });
  }
  await next();
});
export const originGuard = createMiddleware<AppEnv>(async (c, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
    !/^\/api\/webhooks\/stripe(?:-connect)?$/.test(c.req.path)
  ) {
    let origin: string;
    try {
      origin = isLocal(c.env, c.req.url)
        ? new URL(c.req.url).origin
        : new URL(c.env.APP_URL).origin;
    } catch {
      throw new HTTPException(503, {
        message: "Application origin is not configured.",
      });
    }
    let allowed = c.req.header("Origin") === origin;
    if (!allowed && isLocal(c.env, c.req.url)) {
      try {
        const provided = new URL(c.req.header("Origin") || "");
        allowed =
          provided.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(provided.hostname) &&
          ["5173", "8787", "8788"].includes(provided.port);
      } catch {
        allowed = false;
      }
    }
    if (!allowed)
      throw new HTTPException(403, {
        message: "Request origin is not allowed.",
      });
    if (
      !(c.req.header("Content-Type") || "")
        .toLowerCase()
        .startsWith("application/json")
    ) {
      throw new HTTPException(415, { message: "Send application/json." });
    }
  }
  await next();
});
export async function jsonInput<T extends z.ZodType>(
  c: Context<AppEnv>,
  schema: T,
): Promise<z.infer<T>> {
  let input: unknown;
  try {
    input = await c.req.json<unknown>();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON request." });
  }
  const result = schema.safeParse(input);
  if (!result.success)
    throw new HTTPException(400, {
      message: result.error.issues
        .map((i) => `${i.path.join(".") || "Request"}: ${i.message}`)
        .slice(0, 5)
        .join("; "),
    });
  return result.data;
}
export async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function randomToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
/** One atomic upsert, so concurrent requests cannot slip past a read/write race. */
export async function rateLimit(
  c: Context<AppEnv>,
  scope: string,
  identifier: string,
  limit: number,
  seconds: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / seconds);
  const key = `${scope}:${bucket}:${await digest(identifier)}`;
  const row = await c.env.DB.prepare(
    "INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(key, (bucket + 1) * seconds + 60)
    .first<{ count: number }>();
  if (!row || row.count > limit) {
    c.header("Retry-After", String((bucket + 1) * seconds - now));
    throw new HTTPException(429, {
      message: "Too many requests. Please try again later.",
    });
  }
}
export function requestIp(c: Context<AppEnv>): string {
  return c.req.header("CF-Connecting-IP") || "local";
}
export async function verifyTurnstile(
  c: Context<AppEnv>,
  token: string | undefined,
  action: "auth" | "waitlist",
): Promise<void> {
  if (isLocal(c.env, c.req.url)) return;
  if (!c.env.TURNSTILE_SECRET_KEY || !c.env.TURNSTILE_SITE_KEY)
    throw new HTTPException(503, {
      message:
        "Registration protection is being configured. Please check back soon.",
    });
  if (!token)
    throw new HTTPException(400, {
      message: "Complete the security check and try again.",
    });
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: new URLSearchParams({
        secret: c.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: requestIp(c),
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok)
    throw new HTTPException(503, {
      message: "Security verification is temporarily unavailable.",
    });
  const result = await response.json<{
    success: boolean;
    hostname?: string;
    action?: string;
  }>();
  if (
    !result.success ||
    result.hostname !== new URL(c.env.APP_URL).hostname ||
    result.action !== action
  ) {
    throw new HTTPException(400, {
      message: "Security verification failed. Please try again.",
    });
  }
}
export function audit(
  db: D1Database,
  actor: string | null,
  action: string,
  entity: string,
  detail: Record<string, unknown> = {},
) {
  return db
    .prepare(
      "INSERT INTO audit_log (id,actor_id,action,entity_id,detail) VALUES (?,?,?,?,?)",
    )
    .bind(crypto.randomUUID(), actor, action, entity, JSON.stringify(detail));
}
