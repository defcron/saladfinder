import { translatePhrase } from "./translation-cache";
import { Hono } from "hono";
import type { AppEnv } from "./types";
import { languages } from "../shared/languages";
import catalog from "../shared/messages.json";
import { rateLimit, requestIp } from "./middleware";

const source: Record<string, string> = catalog;
export const translations = new Hono<AppEnv>();
translations.get("/translations/:language", async (c) => {
  const lang = c.req.param("language");
  const ids = [...new Set((c.req.query("ids") || "").split(","))];
  if (
    !languages.includes(lang) ||
    ids.length > 8 ||
    ids.some((id) => !Object.hasOwn(source, id))
  )
    return c.json({ error: "Invalid translation request." }, 400);
  const cached = await c.env.DB.prepare(
    "SELECT message_id,translation FROM ui_translations WHERE language=? AND message_id IN (" +
      ids.map(() => "?").join(",") +
      ")",
  )
    .bind(lang, ...ids)
    .all<{ message_id: string; translation: string }>();
  const result: Record<string, string> = Object.fromEntries(
    cached.results.map((row) => [row.message_id, row.translation]),
  );
  const missing = ids.filter((id) => !(id in result));
  if (missing.length) {
    await rateLimit(c, "translation-ip", requestIp(c), 180, 3600);
    await rateLimit(c, "translation-global", "catalog", 3000, 86400);
    await Promise.all(
      missing.map(async (id) => {
        result[id] = await translatePhrase(c.env, lang, id, source[id]);
      }),
    );
  }
  if (Object.keys(result).length === ids.length)
    c.header("Cache-Control", "public, max-age=86400");
  return c.json(result);
});
