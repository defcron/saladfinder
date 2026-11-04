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

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

export function signInEmailHtml(signInUrl: string): string {
  const link = escapeHtml(signInUrl);
  return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#f6f3e9;color:#173e32;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #dce3d9;border-radius:16px"><tr><td style="padding:32px"><img src="https://saladfinder.com/brand/logo-email.png" width="240" alt="SaladFinder" style="display:block;width:240px;max-width:100%;height:auto;margin-bottom:32px"><h1 style="font-size:28px;line-height:1.2">Your sign-in link</h1><p style="font-size:16px;line-height:1.6">Good work starts here. Use the button below to securely sign in to SaladFinder.</p><p style="margin:28px 0"><a href="${link}" style="display:inline-block;background:#173e32;color:#ffffff;text-decoration:none;font-weight:bold;padding:16px 24px;border-radius:8px">Sign in to SaladFinder</a></p><p style="font-size:15px;line-height:1.6">This link expires in 15 minutes and can be used once. Never share it. If you did not request this email, you can ignore it.</p><p style="font-size:14px;line-height:1.6">Button not working? <a href="${link}" style="color:#173e32;text-decoration:underline">Open your secure sign-in link</a>.</p><hr style="border:0;border-top:1px solid #dce3d9;margin:28px 0"><p style="font-size:13px;line-height:1.6;color:#4e6256">SaladFinder · Local work. Helpful neighbours.<br><a href="mailto:support@saladfinder.com" style="color:#173e32">Contact support</a></p></td></tr></table></td></tr></table></body></html>`;
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
    html: signInEmailHtml(signInUrl),
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
