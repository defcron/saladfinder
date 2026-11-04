import { z } from "zod";
import { isLocal } from "./middleware";
import type { AppBindings } from "./types";

function senderAddress(value: string): EmailAddress | null {
  if (/[\r\n]/.test(value)) return null;
  const formatted = value.trim().match(/^([^<>]+)<([^<>]+)>$/);
  const email = (formatted?.[2] ?? value).trim();
  if (!z.email().max(254).safeParse(email).success) return null;
  return { email, name: formatted?.[1].trim() || "SaladFinder" };
}

function emailConfig(env: AppBindings) {
  const from = senderAddress(env.EMAIL_FROM || "");
  if (!from) return null;
  // An omitted provider preserves existing Resend deployments. Explicitly
  // disabled or unrecognized providers fail closed, even with valid credentials.
  const provider = env.EMAIL_PROVIDER ?? "resend";
  if (provider === "cloudflare" && typeof env.EMAIL?.send === "function")
    return { provider, from, binding: env.EMAIL } as const;
  if (provider === "resend" && env.RESEND_API_KEY?.trim())
    return { provider, from, apiKey: env.RESEND_API_KEY } as const;
  return null;
}

export function isSignInReady(env: AppBindings, requestUrl: string): boolean {
  return (
    isLocal(env, requestUrl) ||
    Boolean(
      emailConfig(env) && env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY,
    )
  );
}

export async function sendSignInEmail(
  env: AppBindings,
  recipient: string,
  signInUrl: string,
): Promise<void> {
  const config = emailConfig(env);
  if (!config) throw new Error("Email delivery is not configured.");
  const content = {
    subject: "Your SaladFinder sign-in link",
    text: `Sign in to SaladFinder using this link: ${signInUrl}\n\nThis link expires in 15 minutes and can be used once. If you did not request it, you can ignore this email. Never share this link.\n\nSaladFinder`,
  };
  // Provider acceptance is not proof of inbox delivery. Never retry through a
  // second provider after an ambiguous failure: auth invalidates the token.
  if (config.provider === "cloudflare") {
    await config.binding.send({ from: config.from, to: recipient, ...content });
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [recipient],
      ...content,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error("Email provider did not accept the message.");
}
