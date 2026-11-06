import { emailCopy } from "../shared/email-copy";
import { languageFor } from "../shared/languages";
import { translatePhrase } from "./translation-cache";
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

export function signInEmailHtml(
  signInUrl: string,
  copy = emailCopy,
  language = "en",
): string {
  const link = escapeHtml(signInUrl);
  return `<!doctype html><html lang="${escapeHtml(language)}" dir="${["ar", "fa", "he", "ps", "sd", "ur", "yi"].includes(language) ? "rtl" : "ltr"}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#f6f3e9;color:#173e32;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #dce3d9;border-radius:16px"><tr><td style="padding:32px"><img src="https://saladfinder.com/brand/logo-email.png" width="240" alt="SaladFinder" style="display:block;width:240px;max-width:100%;height:auto;margin-bottom:32px"><h1 style="font-size:28px;line-height:1.2">${escapeHtml(copy.title)}</h1><p style="font-size:16px;line-height:1.6">${escapeHtml(copy.intro)}</p><p style="margin:28px 0"><a href="${link}" style="display:inline-block;background:#173e32;color:#ffffff;text-decoration:none;font-weight:bold;padding:16px 24px;border-radius:8px">${escapeHtml(copy.action)}</a></p><p style="font-size:15px;line-height:1.6">${escapeHtml(copy.expiry)}</p><p style="font-size:14px;line-height:1.6">${escapeHtml(copy.fallback)} <a href="${link}" style="color:#173e32;text-decoration:underline">${escapeHtml(copy.link)}</a>.</p><hr style="border:0;border-top:1px solid #dce3d9;margin:28px 0"><p style="font-size:13px;line-height:1.6;color:#4e6256">SaladFinder · ${escapeHtml(copy.footer)}<br><a href="mailto:support@saladfinder.com" style="color:#173e32">${escapeHtml(copy.support)}</a></p></td></tr></table></td></tr></table></body></html>`;
}

export async function sendSignInEmail(
  env: AppBindings,
  recipient: string,
  signInUrl: string,
  preferredLanguage = "en",
): Promise<void> {
  const config = emailConfig(env);
  if (!config) throw new Error("Email delivery is not configured.");
  let language = languageFor([preferredLanguage]);
  let copy = { ...emailCopy };
  if (language !== "en") {
    try {
      const rows = await env.DB.prepare(
        "SELECT message_id,translation FROM ui_translations WHERE language=? AND message_id LIKE 'mail-v1-%'",
      )
        .bind(language)
        .all<{ message_id: string; translation: string }>();
      const saved = new Map(
        rows.results.map((row) => [row.message_id, row.translation]),
      );
      const entries = await Promise.all(
        Object.entries(emailCopy).map(async ([key, source]) => {
          const id = "mail-v1-" + key;
          return [
            key,
            saved.get(id) ?? (await translatePhrase(env, language, id, source)),
          ];
        }),
      );
      copy = Object.fromEntries(entries) as typeof emailCopy;
    } catch {
      language = "en";
    }
  }
  const content = {
    subject: copy.subject.replace(/[\r\n]/g, " "),
    html: signInEmailHtml(signInUrl, copy, language),
    text: `${copy.action}: ${signInUrl}\n\n${copy.expiry}\n\nSaladFinder`,
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
