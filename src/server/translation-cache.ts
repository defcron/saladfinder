import type { AppBindings } from "./types";

// The caller must supply application-authored source text. Never pass job data or credentials.
export async function translatePhrase(
  env: AppBindings,
  language: string,
  id: string,
  input: string,
) {
  if (language === "en" || !env.AI) return input;
  const output = await env.AI.run("@cf/meta/m2m100-1.2b", {
    text: input.trim(),
    source_lang: "en",
    target_lang: language === "nso" ? "ns" : language,
  });
  const value =
    "translated_text" in output ? output.translated_text?.trim() : "";
  const numbers = (s: string) => s.match(/\d+(?:[.,]\d+)*/g)?.join("|") || "";
  if (!value || numbers(value) !== numbers(input)) return input;
  const translation = input.replace(input.trim(), () => value);
  await env.DB.prepare("INSERT OR IGNORE INTO ui_translations VALUES (?,?,?)")
    .bind(language, id, translation)
    .run();
  return translation;
}
