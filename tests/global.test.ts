import { expect, it, vi } from "vitest";
import { app } from "../src/server";
import { countries, calendarDate } from "../src/shared/regions";
import { languageFor } from "../src/shared/languages";
import catalog from "../src/shared/messages.json";
import { makeTestEnv, testApp, login, request, jobBody } from "./helpers";
it("handles international dates and locale fallbacks", () => {
  expect(new Set(countries).size).toBe(250);
  expect(languageFor(["xx", "ar-EG"])).toBe("ar");
  expect(languageFor(["fr-CA"])).toBe("fr");
  expect(languageFor(["invalid_tag"])).toBe("en");
  expect(
    calendarDate(new Date("2026-11-06T11:30:00Z"), "Pacific/Kiritimati"),
  ).toBe("2026-11-07");
});
it("stores international jobs separately and filters by ISO country", async () => {
  const fixture = await makeTestEnv();
  try {
    const api = testApp();
    const { env } = fixture;
    env.LAUNCH_MODE = "live";
    const poster = await login(api, env, "jp@example.test");
    const post = await request(
      api,
      env,
      "/jobs",
      "POST",
      { ...jobBody(), country: "JP", city: "津", timeZone: "Asia/Tokyo" },
      poster.cookie,
    );
    expect(post.status, await post.clone().text()).toBe(201);
    expect(
      await (await request(api, env, "/jobs?country=JP")).json(),
    ).toMatchObject({ total: 1 });
    expect(
      await (await request(api, env, "/jobs?country=CA")).json(),
    ).toMatchObject({ total: 0 });
    expect((await request(api, env, "/jobs?country=XX")).status).toBe(400);
  } finally {
    await fixture.dispose();
  }
});
it("translates only authored messages and reuses translations", async () => {
  const fixture = await makeTestEnv();
  try {
    const run = vi
      .fn()
      .mockResolvedValue({ translated_text: "Trouver du travail" });
    const env = Object.assign(fixture.env, { AI: { run } as unknown as Ai });
    const id = Object.entries(catalog).find(
      ([, value]) => value === "Find work",
    )![0];
    const get = (ids: string) =>
      app.fetch(
        new Request("http://localhost/api/translations/fr?ids=" + ids),
        env,
      );
    expect((await get("private-message")).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
    expect(await (await get(id)).json()).toEqual({
      [id]: "Trouver du travail",
    });
    await get(id);
    expect(run).toHaveBeenCalledTimes(1);
  } finally {
    await fixture.dispose();
  }
});
