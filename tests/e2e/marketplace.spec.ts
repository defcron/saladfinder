import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const origin = "http://127.0.0.1:8788";
async function signInByApi(
  context: BrowserContext,
  email: string,
  name: string,
) {
  const issued = await context.request.post(`${origin}/api/auth/request`, {
    headers: { Origin: origin },
    data: { email, name, role: "both", country:"CA", consent: true },
  });
  expect(issued.ok()).toBeTruthy();
  const { devToken } = await issued.json();
  const verified = await context.request.post(`${origin}/api/auth/verify`, {
    headers: { Origin: origin },
    data: { token: devToken },
  });
  expect(verified.ok()).toBeTruthy();
  return (await verified.json()).user;
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
}

test("public navigation, fee calculator, accessibility and responsive layout", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Good work.",
  );
  await noOverflow(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.goto("/pricing");
  await page.getByLabel("Worker pay per milestone (CAD)").fill("100");
  await page.getByLabel("Number of milestones").selectOption("2");
  await expect(page.locator(".calculator")).toContainText("$226");
  await expect(page.locator(".calculator")).toContainText("$26");
  await noOverflow(page);
  await page.goto("/how-it-works");
  await expect(
    page.getByRole("heading", { name: "From completed work to your bank." }),
  ).toBeVisible();
  await expect(
    page.getByText("SaladFinder does not guarantee same-day bank arrival", {
      exact: false,
    }),
  ).toBeVisible();
});

test("early access stores consent and private removal link deletes the signup", async ({
  page,
}) => {
  await page.goto("/early-access");
  await page
    .getByLabel("Your email")
    .fill(`waitlist-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("City or locality", { exact: true }).fill("Toronto");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Join early access", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "You’re on the list." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Manage signup", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove my early-access signup" })
    .click();
  await expect(
    page.getByText("Your early-access signup has been removed.", {
      exact: false,
    }),
  ).toBeVisible();
  await noOverflow(page);
});

test("two users complete posting, application, hire, private messages and milestone approval", async ({
  page,
  browser,
}) => {
  const suffix = crypto.randomUUID();
  await page.goto("/sign-in");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`customer-${suffix}@example.test`);
  await page.getByLabel("Your name", { exact: false }).fill("Pilot Customer");
  await page.getByRole("radio", { name: "Hire help", exact: true }).check();
  await page.getByRole("checkbox").check();
  await page.getByLabel("Country or territory").selectOption("CA");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByRole("link", { name: "Open your sign-in link" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/post");
  await page
    .getByLabel("Give your job a clear title")
    .fill(`Assemble a reading desk ${suffix.slice(0, 8)}`);
  await page
    .getByLabel("What needs doing?")
    .fill(
      "Assemble one flat-pack reading desk using the supplied instructions. All parts and hand tools are provided. No power tools or lifting required.",
    );
  await page
    .getByRole("combobox", { name: /^Category/ })
    .selectOption("Assembly");
  await page.getByLabel("Country or territory").selectOption("CA");
  await page.getByLabel("City or locality", { exact: true }).fill("Ottawa");
  await page.getByLabel("Neighbourhood", { exact: false }).fill("Centretown");
  await page
    .getByLabel("Preferred date")
    .fill(new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10));
  await page.getByLabel("Estimated hours").fill("2");
  await page.getByLabel("Worker pay (CAD)").fill("100");
  await expect(page.locator(".quote-panel")).toContainText("$113");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Publish job" }).click();
  await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+$/);
  const jobUrl = page.url();
  await expect(
    page.getByRole("heading", { name: "No applications yet." }),
  ).toBeVisible();
  const workerContext = await browser.newContext({ baseURL: origin });
  try {
    await signInByApi(
      workerContext,
      `worker-${suffix}@example.test`,
      "Pilot Worker",
    );
    const worker = await workerContext.newPage();
    await worker.goto(
      `/?category=Assembly&city=Ottawa&q=${suffix.slice(0, 8)}`,
    );
    await expect(worker.locator(".job-list")).toContainText(
      `Assemble a reading desk ${suffix.slice(0, 8)}`,
    );
    await worker.locator(".job-list a").first().click();
    await worker
      .getByLabel("Introduce yourself")
      .fill(
        "I have assembled similar desks and am available on the requested date. I agree with the stated scope and price.",
      );
    await worker.getByRole("checkbox").check();
    await worker.getByRole("button", { name: "Apply for this job" }).click();
    await expect(
      worker.getByText("Your application has been sent.", { exact: false }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Hire this worker" }).click();
    await expect(
      page.getByText("Worker hired.", { exact: false }),
    ).toBeVisible();
    await page
      .getByLabel("Your message")
      .fill("The desk and tools will be ready for our agreed start time.");
    await page.getByRole("button", { name: "Send message" }).click();
    await worker.reload();
    await worker
      .getByRole("button", { name: "Start job", exact: true })
      .click();
    await expect(
      worker.getByText(
        "The desk and tools will be ready for our agreed start time.",
      ),
    ).toBeVisible();
    await worker.getByRole("button", { name: "Submit completed work" }).click();
    await page.reload();
    await page.getByRole("button", { name: "Approve milestone" }).click();
    await expect(
      page.getByRole("button", { name: /Pay \$113(?:\.00)? CAD/ }),
    ).toBeDisabled();
    await expect(page.locator(".milestone-list")).toContainText("Approved");
    const anonymous = await browser.newContext({ baseURL: origin });
    try {
      const response = await anonymous.request.get(
        jobUrl.replace("/jobs/", "/api/jobs/"),
      );
      const text = await response.text();
      expect(text).not.toContain("The desk and tools");
      expect(text).not.toContain(`customer-${suffix}`);
    } finally {
      await anonymous.close();
    }
    await worker.goto("/account");
    await expect(
      worker.getByText("Payments aren’t open yet.", { exact: false }),
    ).toBeVisible();
    await worker
      .getByLabel("A little about you")
      .fill("Experienced furniture assembler in Ottawa.");
    await worker.getByRole("button", { name: "Save profile" }).click();
    await expect(worker.getByText("Your profile is saved.")).toBeVisible();
    await noOverflow(page);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  } finally {
    await workerContext.close();
  }
});

test("invalid sign-in links and unknown routes have useful recovery", async ({
  page,
}) => {
  await page.goto("/auth/verify#token=invalid");
  await expect(
    page.getByRole("heading", { name: "Let’s try that again." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Request a new sign-in link" }),
  ).toBeVisible();
  expect(page.url()).not.toContain("token=");
  await page.goto("/does-not-exist");
  await expect(
    page.getByRole("heading", { name: "This page has moved on." }),
  ).toBeVisible();
  await noOverflow(page);
});
