import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const origin = "http://127.0.0.1:8788";
async function signIn(context: BrowserContext, role = "both") {
  const response = await context.request.post(`${origin}/api/auth/request`, {
    headers: { Origin: origin },
    data: {
      email: `readiness-${crypto.randomUUID()}@example.test`,
      name: "Readiness Worker",
      role,
      consent: true,
    },
  });
  expect(response.ok()).toBeTruthy();
  const { devToken } = await response.json();
  const verified = await context.request.post(`${origin}/api/auth/verify`, {
    headers: { Origin: origin },
    data: { token: devToken },
  });
  expect(verified.ok()).toBeTruthy();
  return (await verified.json()).user;
}
const payoutStatus = () => ({
  configured: true,
  testMode: true,
  accountId: "acct_ui_fixture",
  accountReady: true,
  onboardingComplete: true,
  chargesEnabled: true,
  payoutsEnabled: true,
  instantPayoutsEnabled: true,
  instantEligible: true,
  standardEligible: true,
  defaultPayoutMethod: "instant",
  payoutSchedule: "manual",
  payoutSetupRequired: false,
  pendingPayout: null as null | {
    requestId: string;
    method: string;
    amount_cents: number;
    retryable: boolean;
  },
  payoutLimits: {
    instant: { minimum_cents: 60, maximum_cents: 999900 },
    standard: { minimum_cents: 100, maximum_cents: 999900 },
  },
  frozen: false,
  message: "Stripe test mode: no real money moves and no bank payout occurs.",
  balance: {
    available_cents: 12000,
    pending_cents: 2500,
    instant_available_cents: 8000,
    currency: "CAD",
  },
  payouts: [] as {
    id: string;
    amount_cents: number;
    status: string;
    method: string;
    arrival_date: number | null;
    created: number;
  }[],
});
async function payoutFixture(
  page: Page,
  status: ReturnType<typeof payoutStatus>,
) {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "ui-payout-worker",
          email: "payout-fixture@example.test",
          name: "Payout Fixture",
          role: "worker",
          bio: "",
          city: "Ottawa",
          skills: [],
          created_at: "2026-11-04T12:00:00Z",
          stripe_account_id: status.accountId,
        },
      },
    }),
  );
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: {
        ...(await response.json()),
        paymentsReady: true,
        instantPayoutsEnabled: status.instantPayoutsEnabled,
      },
    });
  });
  await page.route("**/api/payments/status", (route) =>
    route.fulfill({ json: status }),
  );
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
}

test("instant defaults when eligible, standard stays available, and safe rejection unlocks editing", async ({
  page,
}) => {
  const status = payoutStatus();
  await payoutFixture(page, status);
  let calls = 0;
  await page.route("**/api/payments/payout", async (route) => {
    const request = route.request().postDataJSON();
    expect(request.method).toBe("standard");
    calls++;
    await route.fulfill({
      status: 409,
      json: {
        error: "The payout exceeds your available CAD balance.",
        payoutRequest: {
          state: "not_created",
          requestId: request.requestId,
          safeToRetryNew: true,
          retryable: false,
          reconciliationRequired: false,
        },
      },
    });
  });
  await page.goto("/account");
  await expect(page.getByLabel("Payout method")).toHaveValue("instant");
  await expect(
    page.getByText("Your payouts are set to manual.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".payout-quote")).toContainText("$0 CAD");
  await page.getByRole("button", { name: "Use available balance" }).click();
  await expect(page.getByLabel("Amount (CAD)", { exact: true })).toHaveValue(
    "80.00",
  );
  await page.getByLabel("Payout method").selectOption("standard");
  await page.getByRole("button", { name: "Refresh payment status" }).click();
  await expect(page.getByLabel("Payout method")).toHaveValue("standard");
  await page.getByLabel("Amount (CAD)", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Request standard payout" }).click();
  await expect(page.getByRole("alert")).toContainText("exceeds your available");
  await expect(page.getByLabel("Payout method")).toBeEnabled();
  await expect(page.getByLabel("Amount (CAD)", { exact: true })).toBeEnabled();
  await page.getByLabel("Amount (CAD)", { exact: true }).fill("50");
  expect(calls).toBe(1);
  await noOverflow(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("an uncertain payout survives reload and retries the exact server operation", async ({
  page,
}) => {
  const status = payoutStatus();
  await payoutFixture(page, status);
  const requests: {
    requestId: string;
    amount_cents: number;
    method: string;
  }[] = [];
  await page.route("**/api/payments/payout", async (route) => {
    const request = route.request().postDataJSON();
    requests.push(request);
    if (requests.length === 1) {
      status.pendingPayout = { ...request, retryable: true };
      await route.abort("failed");
    } else {
      status.pendingPayout = null;
      const payout = {
        id: "po_ui_confirmed",
        amount_cents: request.amount_cents,
        status: "pending",
        method: request.method,
        arrival_date: null,
        created: Math.floor(Date.now() / 1000),
      };
      status.payouts = [payout];
      await route.fulfill({ json: { payout } });
    }
  });
  await page.goto("/account");
  await page.getByLabel("Amount (CAD)", { exact: true }).fill("25");
  await page.getByRole("button", { name: "Request instant payout" }).click();
  await expect(
    page.getByRole("button", { name: "Check previous payout request" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Amount (CAD)", { exact: true })).toHaveValue(
    "25.00",
  );
  await expect(page.getByLabel("Payout method")).toBeDisabled();
  await page
    .getByRole("button", { name: "Check previous payout request" })
    .click();
  await expect(
    page.getByText("Payout request confirmed by Stripe.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".payout-history")).toContainText("$25");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject(requests[0]);
  await expect(page.getByLabel("Payout method")).toBeEnabled();
  await noOverflow(page);
});

test("server pending payout restores without browser storage and blocks unsafe retries", async ({
  page,
}) => {
  const status = payoutStatus();
  status.pendingPayout = {
    requestId: crypto.randomUUID(),
    amount_cents: 3400,
    method: "standard",
    retryable: false,
  };
  await payoutFixture(page, status);
  await page.goto("/account");
  await expect(page.getByLabel("Payout method")).toHaveValue("standard");
  await expect(page.getByLabel("Amount (CAD)", { exact: true })).toHaveValue(
    "34.00",
  );
  await expect(
    page.getByText("This payout needs support review", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Check previous payout request" }),
  ).toBeDisabled();
  await noOverflow(page);
});

test("job draft and requested destination survive email sign-in", async ({
  page,
}) => {
  await page.goto("/post");
  await page
    .getByLabel("Give your job a clear title")
    .fill("Help assemble a writing table");
  await page
    .getByLabel("What needs doing?")
    .fill(
      "Assemble one flat-pack writing table using the instructions and hand tools supplied. No electrical work or heavy lifting is needed.",
    );
  await page.getByLabel("Country or territory").selectOption("CA");
  await page.getByLabel("City or locality", { exact: true }).fill("Ottawa");
  await page.getByRole("link", { name: "Sign in to publish" }).click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`draft-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Your name", { exact: false }).fill("Draft Poster");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByRole("link", { name: "Open your sign-in link" }).click();
  await expect(page).toHaveURL(/\/post$/);
  await expect(page.getByLabel("Give your job a clear title")).toHaveValue(
    "Help assemble a writing table",
  );
  await expect(page.getByLabel("City or locality", { exact: true })).toHaveValue(
    "Ottawa",
  );
  await page
    .getByLabel("Preferred date")
    .fill(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
  await page.getByLabel("Estimated hours").fill("2");
  await page.getByLabel("Worker pay (CAD)", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Add a milestone" }).click();
  await page
    .getByLabel("Milestone 2", { exact: true })
    .fill("Final assembly and check");
  await page.getByLabel("Worker pay (CAD) for milestone 2").fill("60");
  await expect(page.locator(".quote-panel")).toContainText("$181.20");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Publish job" }).click();
  await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+$/);
  expect(
    await page.evaluate(() => sessionStorage.getItem("saladfinder-job-draft")),
  ).toBeNull();
  await page.goto("/dashboard");
  await page.getByRole("tab", { name: /^My jobs/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /^Jobs I posted/ })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Help assemble a writing table",
  );
  await noOverflow(page);
});

test("listing preview shows real applications but prevents hiring and preserves failed reports", async ({
  page,
  browser,
}) => {
  await signIn(page.context(), "poster");
  const created = await page.request.post(`${origin}/api/jobs`, {
    headers: { Origin: origin },
    data: {
      title: "Listing preview garden cleanup",
      description:
        "Rake leaves and gather small garden debris. Hand tools and bags are provided. No ladders, power tools or heavy lifting are involved.",
      category: "Yard work",
      city: "Toronto",
      area: "",
      start_date: new Date(Date.now() + 3 * 86400000)
        .toISOString()
        .slice(0, 10),
      estimated_hours: 2,
      milestones: [{ title: "Garden cleanup complete", amount_cents: 10000 }],
    },
  });
  expect(created.ok()).toBeTruthy();
  const { job } = await created.json();
  const worker = await browser.newContext({ baseURL: origin });
  try {
    await signIn(worker);
    const applied = await worker.request.post(
      `${origin}/api/jobs/${job.id}/apply`,
      {
        headers: { Origin: origin },
        data: {
          message:
            "I have garden cleanup experience and would be interested once hiring opens.",
        },
      },
    );
    expect(applied.ok()).toBeTruthy();
  } finally {
    await worker.close();
  }
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: {
        ...(await response.json()),
        launchMode: "preview",
        listingsReady: true,
        paymentsReady: false,
      },
    });
  });
  await page.route(`**/api/jobs/${job.id}/report`, (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Report service temporarily unavailable. Try again." },
    }),
  );
  await page.goto(`/jobs/${job.id}`);
  await expect(
    page.getByText("Posting and applications are open.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hire this worker" }),
  ).toBeDisabled();
  await page.getByText("Report a problem", { exact: true }).click();
  await page
    .getByLabel("What happened?")
    .fill("The listing needs a correction before any work can begin.");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(page.getByLabel("What happened?")).toHaveValue(
    "The listing needs a correction before any work can begin.",
  );
  await page.getByRole("button", { name: "Refresh job" }).click();
  await expect(
    page.getByRole("heading", { name: "Listing preview garden cleanup" }),
  ).toBeVisible();
  await noOverflow(page);
});

test("disabled instant payouts show coming later and submit only a standard payout", async ({
  page,
}) => {
  const status = payoutStatus();
  status.instantPayoutsEnabled = false;
  // Even stale eligibility/default hints must not enable a new instant request.
  await payoutFixture(page, status);
  let calls = 0;
  await page.route("**/api/payments/payout", async (route) => {
    expect(route.request().postDataJSON().method).toBe("standard");
    calls++;
    await route.fulfill({
      status: 409,
      json: { error: "Test request stopped before money moves." },
    });
  });
  await page.goto("/account");
  await expect(page.getByLabel("Payout method")).toHaveValue("standard");
  await expect(page.locator('option[value="instant"]')).toHaveJSProperty(
    "disabled",
    true,
  );
  await expect(page.locator('option[value="instant"]')).toHaveText(
    "Instant Payouts · Coming later",
  );
  await expect(
    page.getByText("Instant-eligible balance:", { exact: false }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Use available balance" }).click();
  await expect(page.getByLabel("Amount (CAD)", { exact: true })).toHaveValue(
    "120.00",
  );
  await page.getByRole("button", { name: "Request standard payout" }).click();
  await expect.poll(() => calls).toBe(1);
  await page.goto("/how-it-works#payments");
  await expect(
    page.getByText("Instant Payouts: Coming later; currently disabled.", {
      exact: false,
    }),
  ).toBeVisible();
});
