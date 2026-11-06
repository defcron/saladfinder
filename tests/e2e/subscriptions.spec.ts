import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function pricing(page: import("@playwright/test").Page) {
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: {
        ...(await response.json()),
        pricingEnabled: true,
        subscriptionsReady: true,
        plan: "standard",
      },
    });
  });
}
test("plan comparison and calculator show each participant fee without promising universal savings", async ({
  page,
}) => {
  await pricing(page);
  await page.goto("/pricing");
  await expect(
    page.getByRole("heading", { name: "Choose how you pay" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Economy" }),
  ).toContainText("8.9%");
  await expect(
    page.getByRole("row").filter({ hasText: "Premium" }),
  ).toContainText("3.9%");
  await expect(page.locator(".calculator")).toContainText("$115.90");
  await expect(page.locator(".calculator")).toContainText("$91.10");
  await page.getByLabel("Poster plan", { exact: true }).selectOption("economy");
  await page.getByLabel("Worker plan", { exact: true }).selectOption("premium");
  await expect(page.locator(".calculator")).toContainText("$109.40");
  await expect(page.locator(".calculator")).toContainText("$94.80");
  const amount = page.getByLabel("Worker pay per milestone (CAD)");
  for (const invalid of ["", "0", "24.99", "5000.01", "25.005"]) {
    await amount.fill(invalid);
    await expect(page.locator(".price-breakdown")).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("Enter a milestone amount");
  }
  await amount.fill("25");
  await expect(page.locator(".price-breakdown")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
});
test("subscription purchase uses a server plan choice and never grants benefits from return URL", async ({
  page,
}) => {
  await pricing(page);
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "billing_worker",
          name: "Billing Worker",
          email: "billing@example.test",
          role: "both",
          bio: "",
          city: "Ottawa",
          skills: [],
          created_at: "now",
        },
      },
    }),
  );
  await page.route("**/api/billing/status", (route) =>
    route.fulfill({
      json: {
        ready: true,
        plan: "standard",
        paidUntil: 0,
        status: "none",
        cancelAtPeriodEnd: false,
        blocked: false,
        canManage: false,
      },
    }),
  );
  let calls = 0;
  await page.route("**/api/billing/checkout", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ plan: "economy" });
    calls++;
    await route.fulfill({
      status: 503,
      json: {
        error: "Provider unavailable. No subscription has been activated.",
      },
    });
  });
  await page.goto("/account?billing=returned");
  await expect(
    page.getByText("Current fee plan:", { exact: false }),
  ).toContainText("Standard");
  await page
    .getByRole("button", { name: "Subscribe to Economy", exact: false })
    .click();
  await expect(
    page.getByText("Provider unavailable.", { exact: false }),
  ).toBeVisible();
  expect(calls).toBe(1);
  await expect(
    page.getByText("Current fee plan:", { exact: false }),
  ).toContainText("Standard");
});
