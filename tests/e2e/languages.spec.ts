import { test, expect } from "@playwright/test";
import catalog from "../../src/shared/messages.json" with { type: "json" };
test("loads Arabic copy, preserves ISO form values and remembers an English override", async ({
  browser,
}) => {
  const context = await browser.newContext({
    locale: "ar-EG",
    baseURL: "http://127.0.0.1:8788",
  });
  try {
    const page = await context.newPage();
    const resource = catalog as Record<string, string>;
    await page.route("**/api/translations/ar?*", async (route) => {
      const ids = new URL(route.request().url()).searchParams
        .get("ids")!
        .split(",");
      await route.fulfill({
        json: Object.fromEntries(
          ids.map((id) => [
            id,
            resource[id] === "Find work" ? "ابحث عن عمل" : resource[id],
          ]),
        ),
      });
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(
      page.getByRole("button", { name: "ابحث عن عمل" }),
    ).toBeVisible();
    const country = page.getByLabel("Country or territory");
    await country.selectOption("CA");
    await expect(page).toHaveURL(/country=CA/);
    await page
      .getByRole("combobox", { name: "Language", exact: true })
      .selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("button", { name: "Find work" })).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  } finally {
    await context.close();
  }
});
