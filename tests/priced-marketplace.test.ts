import { beforeAll, afterAll, it, expect } from "vitest";
import { makeTestEnv, testApp, login, request, jobBody } from "./helpers";
import { PRICING_VERSION } from "../src/shared/pricing";
let h: Awaited<ReturnType<typeof makeTestEnv>>;
const app = testApp();
beforeAll(async () => {
  h = await makeTestEnv({ LAUNCH_MODE: "live", PRICING_ENABLED: "true" });
});
afterAll(async () => h.dispose());
it("requires reviewed quotes, records each party's plan, and preserves them after cancellation", async () => {
  const poster = await login(app, h.env, "priced-poster@example.test");
  const worker = await login(app, h.env, "priced-worker@example.test");
  const body = {
    ...jobBody(),
    milestones: [{ title: "Complete agreed work", amount_cents: 10000 }],
  };
  expect(
    (await request(app, h.env, "/jobs", "POST", body, poster.cookie)).status,
  ).toBe(409);
  const created = await request(
    app,
    h.env,
    "/jobs",
    "POST",
    { ...body, feePlan: "standard", pricingVersion: PRICING_VERSION },
    poster.cookie,
  );
  expect(created.status).toBe(201);
  const { job } = (await created.json()) as { job: { id: string } };
  await h.env.DB.prepare(
    "INSERT INTO billing_accounts(user_id,customer_operation,customer_started_at,plan,paid_until) VALUES(?,'worker_plan',0,'premium',?)",
  )
    .bind(worker.user.id, Math.floor(Date.now() / 1000) + 86400)
    .run();
  const detail = (await (
    await request(
      app,
      h.env,
      `/jobs/${job.id}`,
      "GET",
      undefined,
      worker.cookie,
    )
  ).json()) as any;
  expect(detail.workerFeePlan).toBe("premium");
  expect(detail.milestones[0].fee_cents).toBe(1590);
  expect(
    (
      await request(
        app,
        h.env,
        `/jobs/${job.id}/apply`,
        "POST",
        {
          message: "I have experience and can do this work.",
          feePlan: "standard",
          pricingVersion: PRICING_VERSION,
        },
        worker.cookie,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await request(
        app,
        h.env,
        `/jobs/${job.id}/apply`,
        "POST",
        {
          message: "I have experience and can do this work.",
          feePlan: "premium",
          pricingVersion: PRICING_VERSION,
        },
        worker.cookie,
      )
    ).status,
  ).toBe(201);
  await h.env.DB.prepare(
    "UPDATE billing_accounts SET paid_until=0 WHERE user_id=?",
  )
    .bind(worker.user.id)
    .run();
  const application = await h.env.DB.prepare(
    "SELECT id,fee_plan FROM applications WHERE job_id=?",
  )
    .bind(job.id)
    .first<{ id: string; fee_plan: string }>();
  expect(application?.fee_plan).toBe("premium");
  expect(
    (
      await request(
        app,
        h.env,
        `/jobs/${job.id}/hire`,
        "POST",
        { applicationId: application!.id },
        worker.cookie,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        app,
        h.env,
        `/jobs/${job.id}/hire`,
        "POST",
        { applicationId: application!.id },
        poster.cookie,
      )
    ).status,
  ).toBe(200);
  const m = await h.env.DB.prepare(
    "SELECT fee_cents,worker_fee_cents FROM milestones WHERE job_id=?",
  )
    .bind(job.id)
    .first();
  expect(m).toMatchObject({ fee_cents: 1590, worker_fee_cents: 520 });
});
it("keeps old postings and new applications to those postings at legacy prices", async () => {
  h.env.PRICING_ENABLED = "false";
  const poster = await login(app, h.env, "legacy-poster@example.test");
  const worker = await login(app, h.env, "legacy-worker@example.test");
  const created = await request(
    app,
    h.env,
    "/jobs",
    "POST",
    {
      ...jobBody(),
      milestones: [{ title: "Complete old agreement", amount_cents: 10000 }],
    },
    poster.cookie,
  );
  expect(created.status).toBe(201);
  const { job } = (await created.json()) as any;
  h.env.PRICING_ENABLED = "true";
  expect(
    (
      await request(
        app,
        h.env,
        `/jobs/${job.id}/apply`,
        "POST",
        { message: "I can complete the work as described." },
        worker.cookie,
      )
    ).status,
  ).toBe(201);
  const a = await h.env.DB.prepare("SELECT id FROM applications WHERE job_id=?")
    .bind(job.id)
    .first<{ id: string }>();
  expect(
    (
      await request(
        app,
        h.env,
        `/jobs/${job.id}/hire`,
        "POST",
        { applicationId: a!.id },
        poster.cookie,
      )
    ).status,
  ).toBe(200);
  expect(
    await h.env.DB.prepare(
      "SELECT fee_cents,worker_fee_cents FROM milestones WHERE job_id=?",
    )
      .bind(job.id)
      .first(),
  ).toMatchObject({ fee_cents: 1300, worker_fee_cents: 0 });
});
