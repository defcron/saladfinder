import { isCountry, calendarDate } from "../shared/regions";
import { currentPlan } from "./billing";
import {
  transactionFee,
  PRICING_VERSION,
  type FeePlan,
} from "../shared/pricing";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  CATEGORIES,
  POLICY_VERSION,
  type Job,
  type Milestone,
  type Application,
} from "../shared/types";
import type { AppEnv } from "./types";
import { requireRegionalHire, suspendJobPayments } from "./payments";
import {
  audit,
  digest,
  randomToken,
  jsonInput,
  isAdmin,
  rateLimit,
  requestIp,
  requireAdmin,
  requireLive,
  requireListings,
  requireUser,
  verifyTurnstile,
} from "./middleware";

export const marketplace = new Hono<AppEnv>();
function fail(status: 400 | 403 | 404 | 409, message: string): never {
  throw new HTTPException(status, { message });
}
const jobSelect =
  "SELECT j.*,u.name AS poster_name,w.name AS worker_name FROM jobs j JOIN users u ON u.id=j.poster_id LEFT JOIN users w ON w.id=j.worker_id";
async function getJob(db: D1Database, id: string): Promise<Job> {
  const job = await db
    .prepare(`${jobSelect} WHERE j.id=?`)
    .bind(id)
    .first<Job>();
  if (!job) fail(404, "Job not found.");
  return job;
}
function participant(job: Job, id: string): boolean {
  return job.poster_id === id || job.worker_id === id;
}
const milestonePublic =
  "id,job_id,title,amount_cents,position,status,submitted_at,approved_at,created_at,paid_at,fee_cents,worker_fee_cents";

marketplace.get("/jobs", async (c) => {
  const query = z
    .object({
      country: z.string().refine(isCountry).optional(),
      q: z.string().max(100).default(""),
      city: z.string().max(80).default(""),
      category: z.enum(CATEGORIES).optional(),
      schedule: z.enum(["completion", "milestones"]).optional(),
      page: z.coerce.number().int().min(1).max(500).default(1),
    })
    .safeParse(c.req.query());
  if (!query.success) fail(400, "Invalid search filters.");
  const { q, city, category, schedule, page } = query.data;
  const where = ["j.status='open'", "u.suspended_at IS NULL"];
  const values: (string | number)[] = [];
  const literal = (v: string) => v.replace(/[\\%_]/g, "\\$&");
  if (q) {
    where.push(
      "(j.title LIKE ? ESCAPE '\\' OR j.description LIKE ? ESCAPE '\\')",
    );
    values.push(`%${literal(q)}%`, `%${literal(q)}%`);
  }
  if (city) {
    where.push("j.city LIKE ? ESCAPE '\\'");
    values.push(`%${literal(city)}%`);
  }
  if (query.data.country) {
    where.push("j.country=?");
    values.push(query.data.country);
  }
  if (category) {
    where.push("j.category=?");
    values.push(category);
  }
  if (schedule) {
    where.push("j.payment_schedule=?");
    values.push(schedule);
  }
  const clauses = where.join(" AND ");
  const [list, count] = await c.env.DB.batch([
    c.env.DB.prepare(
      `${jobSelect} WHERE ${clauses} ORDER BY j.created_at DESC,j.id DESC LIMIT 20 OFFSET ?`,
    ).bind(...values, (page - 1) * 20),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total FROM jobs j JOIN users u ON u.id=j.poster_id WHERE ${clauses}`,
    ).bind(...values),
  ]);
  return c.json({
    jobs: list.results,
    total: (count.results[0] as { total: number }).total,
    page,
  });
});
marketplace.get("/jobs/:id", async (c) => {
  const job = await getJob(c.env.DB, c.req.param("id"));
  const user = c.get("user");
  if (user?.suspended_at)
    fail(403, "Your account is suspended. Contact support.");
  const admin = isAdmin(user, c.env);
  const posterSuspended = await c.env.DB.prepare(
    "SELECT id FROM users WHERE id=? AND suspended_at IS NOT NULL",
  )
    .bind(job.poster_id)
    .first();
  if (posterSuspended && !admin && user?.id !== job.poster_id)
    fail(404, "Job not found.");
  if (
    job.status !== "open" &&
    (!user || (!participant(job, user.id) && !admin))
  )
    fail(404, "Job not found.");
  const milestones = await c.env.DB.prepare(
    `SELECT ${milestonePublic} FROM milestones WHERE job_id=? ORDER BY position`,
  )
    .bind(job.id)
    .all<Milestone>();
  let applications: unknown[] | undefined;
  let myApplication: Application | null = null;
  let messages: unknown[] | undefined;
  if (user?.id === job.poster_id || admin) {
    applications = (
      await c.env.DB.prepare(
        "SELECT a.*,u.name AS worker_name,u.bio AS worker_bio,u.city AS worker_city,u.country AS worker_country,u.skills AS worker_skills FROM applications a JOIN users u ON u.id=a.worker_id WHERE a.job_id=? ORDER BY a.created_at LIMIT 200",
      )
        .bind(job.id)
        .all()
    ).results;
  }
  if (user && user.id !== job.poster_id)
    myApplication = await c.env.DB.prepare(
      "SELECT * FROM applications WHERE job_id=? AND worker_id=?",
    )
      .bind(job.id, user.id)
      .first<Application>();
  if (user && (participant(job, user.id) || admin)) {
    messages = (
      await c.env.DB.prepare(
        "SELECT m.*,u.name AS sender_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE job_id=? ORDER BY m.created_at DESC,m.id DESC LIMIT 100",
      )
        .bind(job.id)
        .all()
    ).results.reverse();
  }
  const reviews = (
    await c.env.DB.prepare(
      "SELECT r.*,u.name AS author_name FROM reviews r JOIN users u ON u.id=r.author_id WHERE r.job_id=? ORDER BY r.created_at",
    )
      .bind(job.id)
      .all()
  ).results;
  if (admin && user && !participant(job, user.id)) {
    await audit(c.env.DB, user.id, "job.moderation_viewed", job.id).run();
  }
  return c.json({
    job,
    milestones: milestones.results,
    workerFeePlan:
      job.fee_plan === "legacy"
        ? "legacy"
        : (myApplication?.fee_plan ??
          (user ? await currentPlan(c.env.DB, user.id) : "standard")),
    applications,
    myApplication,
    workerFeeQuotes: myApplication
      ? Object.fromEntries(
          JSON.parse(myApplication.worker_fee_snapshot ?? "[]").map(
            (m: { id: string; fee: number }) => [m.id, m.fee],
          ),
        )
      : {},
    messages,
    reviews,
  });
});
const jobInput = z.object({
  country: z.string().refine(isCountry).default("CA"),
  timeZone: z
    .string()
    .max(80)
    .refine((zone) => {
      try {
        calendarDate(new Date(), zone);
        return true;
      } catch {
        return false;
      }
    })
    .default("America/Toronto"),
  feePlan: z.enum(["standard", "economy", "premium", "legacy"]).optional(),
  pricingVersion: z.string().optional(),
  title: z.string().trim().min(8).max(120),
  description: z.string().trim().min(40).max(5000),
  category: z.enum(CATEGORIES),
  city: z.string().trim().min(1).max(80),
  area: z.string().trim().max(100).default(""),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  estimated_hours: z.number().min(0.5).max(80),
  milestones: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(120),
        amount_cents: z.number().int().min(2500).max(500000),
      }),
    )
    .min(1)
    .max(5),
});
marketplace.post("/jobs", requireUser, requireListings, async (c) => {
  const body = await jsonInput(c, jobInput);
  const user = c.get("user")!;
  await rateLimit(c, "post-job", user.id, 20, 86400);
  const feePlan: FeePlan =
    c.env.PRICING_ENABLED === "true"
      ? await currentPlan(c.env.DB, user.id)
      : "legacy";
  if (
    feePlan !== "legacy" &&
    (body.feePlan !== feePlan || body.pricingVersion !== PRICING_VERSION)
  )
    fail(
      409,
      "Pricing changed. Refresh the page and review your fee before posting.",
    );
  const date = new Date(`${body.start_date}T12:00:00Z`);
  const today = calendarDate(new Date(), body.timeZone);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== body.start_date ||
    body.start_date < today ||
    body.start_date >
      calendarDate(new Date(Date.now() + 365 * 86400000), body.timeZone)
  )
    fail(400, "Choose a valid date from today through the next year.");
  const budget = body.milestones.reduce((sum, m) => sum + m.amount_cents, 0);
  if (budget > 500000)
    fail(400, "The total job budget cannot exceed CA$5,000.");
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO jobs (id,poster_id,title,description,category,city,country,area,start_date,estimated_hours,budget_cents,payment_schedule,fee_plan) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      id,
      user.id,
      body.title,
      body.description,
      body.category,
      body.city,
      body.country,
      body.area,
      body.start_date,
      body.estimated_hours,
      budget,
      body.milestones.length > 1 ? "milestones" : "completion",
      feePlan,
    ),
    ...body.milestones.map((m, position) =>
      c.env.DB.prepare(
        "INSERT INTO milestones (id,job_id,title,amount_cents,position,fee_cents) VALUES (?,?,?,?,?,?)",
      ).bind(
        crypto.randomUUID(),
        id,
        m.title,
        m.amount_cents,
        position,
        transactionFee(m.amount_cents, "poster", feePlan),
      ),
    ),
    audit(c.env.DB, user.id, "job.created", id, { budget_cents: budget }),
  ]);
  return c.json({ job: await getJob(c.env.DB, id) }, 201);
});
marketplace.post("/jobs/:id/apply", requireUser, requireListings, async (c) => {
  const {
    message,
    feePlan: acceptedPlan,
    pricingVersion,
  } = await jsonInput(
    c,
    z.object({
      message: z.string().trim().min(20).max(2000),
      feePlan: z.enum(["standard", "economy", "premium", "legacy"]).optional(),
      pricingVersion: z.string().optional(),
    }),
  );
  const user = c.get("user")!;
  const job = await getJob(c.env.DB, c.req.param("id"));
  if (job.poster_id === user.id) fail(400, "You cannot apply to your own job.");
  if (job.status !== "open")
    fail(409, "This job is no longer accepting applications.");
  await rateLimit(c, "apply", user.id, 50, 86400);
  const feePlan: FeePlan =
    job.fee_plan === "legacy" ? "legacy" : await currentPlan(c.env.DB, user.id);
  if (
    feePlan !== "legacy" &&
    (acceptedPlan !== feePlan || pricingVersion !== PRICING_VERSION)
  )
    fail(
      409,
      "Pricing changed. Refresh the job and review your net pay before applying.",
    );
  const quoteMilestones = (
    await c.env.DB.prepare(
      "SELECT id,amount_cents FROM milestones WHERE job_id=? ORDER BY position",
    )
      .bind(job.id)
      .all<{ id: string; amount_cents: number }>()
  ).results;
  const snapshot = JSON.stringify(
    quoteMilestones.map((m) => ({
      id: m.id,
      fee: transactionFee(m.amount_cents, "worker", feePlan),
    })),
  );
  const result = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO applications (id,job_id,worker_id,message,fee_plan,worker_fee_snapshot) SELECT ?,id,?,?,?,? FROM jobs WHERE id=? AND status='open' AND poster_id<>? AND NOT EXISTS (SELECT 1 FROM users WHERE id=jobs.poster_id AND suspended_at IS NOT NULL)",
  )
    .bind(
      crypto.randomUUID(),
      user.id,
      message,
      feePlan,
      snapshot,
      job.id,
      user.id,
    )
    .run();
  if (!result.meta.changes)
    fail(409, "You have already applied, or this job is no longer available.");
  return c.json({ ok: true }, 201);
});
marketplace.post(
  "/jobs/:id/applications/withdraw",
  requireUser,
  requireListings,
  async (c) => {
    const result = await c.env.DB.prepare(
      "UPDATE applications SET status='withdrawn' WHERE job_id=? AND worker_id=? AND status='pending'",
    )
      .bind(c.req.param("id"), c.get("user")!.id)
      .run();
    if (!result.meta.changes) fail(409, "No pending application to withdraw.");
    return c.json({ ok: true });
  },
);
marketplace.post("/jobs/:id/hire", requireUser, requireLive, async (c) => {
  const { applicationId } = await jsonInput(
    c,
    z.object({ applicationId: z.string().uuid() }),
  );
  const user = c.get("user")!;
  const id = c.req.param("id");
  const job = await getJob(c.env.DB, id);
  if (job.poster_id !== user.id)
    fail(403, "Only the job poster can hire a worker.");
  const application = await c.env.DB.prepare(
    "SELECT a.*,u.country AS worker_country,u.stripe_account_id AS account_id FROM applications a JOIN users u ON u.id=a.worker_id WHERE a.id=? AND a.job_id=? AND a.status='pending' AND u.suspended_at IS NULL",
  )
    .bind(applicationId, id)
    .first<
      Application & { worker_country: string | null; account_id: string | null }
    >();
  if (!application) fail(409, "This application is no longer available.");
  await requireRegionalHire(
    c.env,
    application.worker_country,
    application.account_id,
  );
  const frozenWorkerFees = new Map<string, number>(
    (
      JSON.parse(application.worker_fee_snapshot ?? "[]") as {
        id: string;
        fee: number;
      }[]
    ).map((m) => [m.id, m.fee]),
  );
  const pricedMilestones = (
    await c.env.DB.prepare(
      "SELECT id,amount_cents FROM milestones WHERE job_id=?",
    )
      .bind(id)
      .all<{ id: string; amount_cents: number }>()
  ).results;
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE jobs SET worker_id=?,status='assigned',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND poster_id=? AND status='open' AND EXISTS (SELECT 1 FROM applications a JOIN users u ON u.id=a.worker_id WHERE a.id=? AND a.job_id=jobs.id AND a.status='pending' AND u.country=? AND u.stripe_account_id IS ? AND u.suspended_at IS NULL)",
    ).bind(
      application.worker_id,
      id,
      user.id,
      applicationId,
      application.worker_country,
      application.account_id,
    ),
    ...pricedMilestones.map((m) =>
      c.env.DB.prepare(
        "UPDATE milestones SET worker_fee_cents=? WHERE id=? AND EXISTS (SELECT 1 FROM jobs WHERE id=? AND worker_id=? AND status='assigned')",
      ).bind(frozenWorkerFees.get(m.id) ?? 0, m.id, id, application.worker_id),
    ),
    c.env.DB.prepare(
      "UPDATE applications SET status=CASE WHEN id=? THEN 'accepted' ELSE 'declined' END WHERE job_id=? AND status='pending' AND EXISTS (SELECT 1 FROM jobs WHERE id=? AND worker_id=? AND status='assigned')",
    ).bind(applicationId, id, id, application.worker_id),
    c.env.DB.prepare(
      "INSERT INTO audit_log (id,actor_id,action,entity_id,detail) SELECT ?,?,'job.hired',?,? WHERE EXISTS (SELECT 1 FROM jobs WHERE id=? AND worker_id=? AND status='assigned')",
    ).bind(
      crypto.randomUUID(),
      user.id,
      id,
      JSON.stringify({ worker_id: application.worker_id }),
      id,
      application.worker_id,
    ),
  ]);
  if (!results[0].meta.changes)
    fail(409, "This job was already assigned or is no longer open.");
  return c.json({ job: await getJob(c.env.DB, id) });
});
marketplace.post("/jobs/:id/start", requireUser, requireLive, async (c) => {
  const result = await c.env.DB.prepare(
    "UPDATE jobs SET status='in_progress',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND worker_id=? AND status='assigned'",
  )
    .bind(c.req.param("id"), c.get("user")!.id)
    .run();
  if (!result.meta.changes)
    fail(409, "Only the assigned worker can start an assigned job.");
  return c.json({ ok: true });
});
marketplace.post(
  "/jobs/:id/cancel",
  requireUser,
  requireListings,
  async (c) => {
    const result = await c.env.DB.prepare(
      "UPDATE jobs SET status='cancelled',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND poster_id=? AND status='open'",
    )
      .bind(c.req.param("id"), c.get("user")!.id)
      .run();
    if (!result.meta.changes)
      fail(
        409,
        "Only an open job can be cancelled here. For an assigned job, open a support report.",
      );
    return c.json({ ok: true });
  },
);
marketplace.get("/dashboard", requireUser, async (c) => {
  const user = c.get("user")!;
  const [posted, assigned, applications] = await c.env.DB.batch([
    c.env.DB.prepare(
      `${jobSelect} WHERE j.poster_id=? ORDER BY j.created_at DESC LIMIT 100`,
    ).bind(user.id),
    c.env.DB.prepare(
      `${jobSelect} WHERE j.worker_id=? ORDER BY j.created_at DESC LIMIT 100`,
    ).bind(user.id),
    c.env.DB.prepare(
      "SELECT a.*,j.title AS job_title,j.city,j.budget_cents,j.status AS job_status FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.worker_id=? ORDER BY a.created_at DESC LIMIT 100",
    ).bind(user.id),
  ]);
  return c.json({
    posted: posted.results,
    assigned: assigned.results,
    applications: applications.results,
  });
});
marketplace.post("/jobs/:id/messages", requireUser, requireLive, async (c) => {
  const { body } = await jsonInput(
    c,
    z.object({ body: z.string().trim().min(1).max(3000) }),
  );
  const user = c.get("user")!;
  const job = await getJob(c.env.DB, c.req.param("id"));
  if (!participant(job, user.id) || !job.worker_id)
    fail(403, "Messages are private to the job poster and assigned worker.");
  await rateLimit(c, "message", user.id, 60, 3600);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO messages (id,job_id,sender_id,body) VALUES (?,?,?,?)",
  )
    .bind(id, job.id, user.id, body)
    .run();
  return c.json(
    {
      message: await c.env.DB.prepare(
        "SELECT m.*,u.name AS sender_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?",
      )
        .bind(id)
        .first(),
    },
    201,
  );
});
marketplace.post(
  "/milestones/:id/submit",
  requireUser,
  requireLive,
  async (c) => {
    const result = await c.env.DB.prepare(
      "UPDATE milestones SET status='submitted',submitted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM jobs WHERE jobs.id=milestones.job_id AND jobs.worker_id=? AND jobs.status='in_progress')",
    )
      .bind(c.req.param("id"), c.get("user")!.id)
      .run();
    if (!result.meta.changes)
      fail(
        409,
        "Only the assigned worker can submit a pending milestone on work in progress.",
      );
    return c.json({ ok: true });
  },
);
marketplace.post(
  "/milestones/:id/approve",
  requireUser,
  requireLive,
  async (c) => {
    const result = await c.env.DB.prepare(
      "UPDATE milestones SET status='approved',approved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='submitted' AND EXISTS(SELECT 1 FROM jobs WHERE jobs.id=milestones.job_id AND jobs.poster_id=? AND jobs.status='in_progress')",
    )
      .bind(c.req.param("id"), c.get("user")!.id)
      .run();
    if (!result.meta.changes)
      fail(
        409,
        "Only the job poster can approve a submitted milestone on work in progress.",
      );
    return c.json({
      ok: true,
      message: "Milestone approved. Complete payment to release the funds.",
    });
  },
);
marketplace.post("/jobs/:id/reviews", requireUser, requireLive, async (c) => {
  const input = await jsonInput(
    c,
    z.object({
      rating: z.number().int().min(1).max(5),
      body: z.string().trim().min(10).max(2000),
    }),
  );
  const user = c.get("user")!;
  const job = await getJob(c.env.DB, c.req.param("id"));
  if (
    job.status !== "completed" ||
    !participant(job, user.id) ||
    !job.worker_id
  )
    fail(403, "Only participants can review a completed job.");
  const result = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO reviews (id,job_id,author_id,subject_id,rating,body) VALUES (?,?,?,?,?,?)",
  )
    .bind(
      crypto.randomUUID(),
      job.id,
      user.id,
      user.id === job.poster_id ? job.worker_id : job.poster_id,
      input.rating,
      input.body,
    )
    .run();
  if (!result.meta.changes) fail(409, "You have already reviewed this job.");
  return c.json({ ok: true }, 201);
});
marketplace.post(
  "/jobs/:id/report",
  requireUser,
  requireListings,
  async (c) => {
    const { reason } = await jsonInput(
      c,
      z.object({ reason: z.string().trim().min(20).max(3000) }),
    );
    const user = c.get("user")!;
    const job = await getJob(c.env.DB, c.req.param("id"));
    if (job.status !== "open" && !participant(job, user.id))
      fail(403, "Only participants can report this private job.");
    await rateLimit(c, "report", user.id, 10, 86400);
    const id = crypto.randomUUID();
    const freeze = participant(job, user.id) && job.status !== "cancelled";
    const results = await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT OR IGNORE INTO reports (id,job_id,reporter_id,reason,prior_status) VALUES (?,?,?,?,?)",
      ).bind(id, job.id, user.id, reason, job.status),
      c.env.DB.prepare(
        "UPDATE jobs SET status='disputed',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND ?=1 AND status<>'cancelled' AND EXISTS(SELECT 1 FROM reports WHERE id=?)",
      ).bind(job.id, freeze ? 1 : 0, id),
      c.env.DB.prepare(
        "INSERT INTO audit_log (id,actor_id,action,entity_id,detail) SELECT ?,?,'job.reported',?,? WHERE EXISTS(SELECT 1 FROM reports WHERE id=?)",
      ).bind(
        crypto.randomUUID(),
        user.id,
        job.id,
        JSON.stringify({ report_id: id, freeze }),
        id,
      ),
    ]);
    if (!results[0].meta.changes)
      fail(409, "You already have an open report for this job.");
    if (freeze) await suspendJobPayments(c.env, job.id);
    return c.json(
      {
        ok: true,
        reportId: id,
        message: freeze
          ? "Report recorded. New payments are paused while the report is reviewed."
          : "Report recorded for review.",
      },
      201,
    );
  },
);
marketplace.post("/waitlist", async (c) => {
  const input = await jsonInput(
    c,
    z.object({
      email: z
        .email()
        .max(254)
        .transform((s) => s.toLowerCase()),
      city: z.string().trim().min(1).max(80),
      role: z.enum(["worker", "poster", "both"]),
      consent: z.literal(true),
      turnstileToken: z.string().max(2048).optional(),
    }),
  );
  await rateLimit(c, "waitlist-ip", requestIp(c), 10, 3600);
  await verifyTurnstile(c, input.turnstileToken, "waitlist");
  const removalToken = randomToken();
  const inserted = await c.env.DB.prepare(
    "INSERT INTO waitlist (id,email,city,role,consent_at,deletion_token_hash,consent_version) VALUES (?,?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING",
  )
    .bind(
      crypto.randomUUID(),
      input.email,
      input.city,
      input.role,
      new Date().toISOString(),
      await digest(removalToken),
      POLICY_VERSION,
    )
    .run();
  return c.json(
    {
      ok: true,
      message:
        "You are on the early-access list. We will email you when SaladFinder opens in your area.",
      ...(inserted.meta.changes ? { removalToken } : {}),
    },
    201,
  );
});
marketplace.post("/waitlist/remove", async (c) => {
  const { token } = await jsonInput(
    c,
    z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }),
  );
  await rateLimit(c, "waitlist-remove", requestIp(c), 20, 3600);
  await c.env.DB.prepare("DELETE FROM waitlist WHERE deletion_token_hash=?")
    .bind(await digest(token))
    .run();
  return c.json({
    ok: true,
    message:
      "Any early-access signup associated with this link has been removed.",
  });
});
marketplace.get("/admin/overview", requireAdmin, async (c) => {
  const [usersCount, jobsCount, reportCount, waitlistCount, reports, users] =
    await c.env.DB.batch([
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM users"),
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM jobs"),
      c.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM reports WHERE status='open'",
      ),
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM waitlist"),
      c.env.DB.prepare(
        "SELECT r.*,j.title AS job_title,u.name AS reporter_name FROM reports r JOIN jobs j ON j.id=r.job_id JOIN users u ON u.id=r.reporter_id ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 100",
      ),
      c.env.DB.prepare(
        "SELECT id,name,email,suspended_at,created_at FROM users ORDER BY created_at DESC LIMIT 100",
      ),
    ]);
  const count = (r: D1Result) =>
    Number((r.results[0] as { count: number }).count);
  return c.json({
    stats: {
      users: count(usersCount),
      jobs: count(jobsCount),
      openReports: count(reportCount),
      waitlist: count(waitlistCount),
    },
    reports: reports.results,
    users: users.results,
  });
});
marketplace.post("/admin/reports/:id/resolve", requireAdmin, async (c) => {
  const input = await jsonInput(
    c,
    z.object({
      resolution: z.string().trim().min(10).max(3000),
      action: z.enum(["none", "restore_job", "cancel_job"]),
    }),
  );
  const report = await c.env.DB.prepare(
    "SELECT * FROM reports WHERE id=? AND status='open'",
  )
    .bind(c.req.param("id"))
    .first<{ id: string; job_id: string; prior_status: string }>();
  if (!report) fail(404, "Open report not found.");
  const pending = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM reports WHERE job_id=? AND status='open' AND id<>?",
  )
    .bind(report.job_id, report.id)
    .first<{ count: number }>();
  if (input.action !== "none" && pending?.count)
    fail(409, "Resolve the other open reports before changing the job state.");
  if (input.action === "restore_job") {
    const unresolvedMoney = await c.env.DB.prepare(
      "SELECT p.id FROM payment_attempts p JOIN milestones m ON m.id=p.milestone_id LEFT JOIN refund_intents r ON r.payment_attempt_id=p.id WHERE m.job_id=? AND (p.status='disputed' OR (r.status IS NOT NULL AND r.status NOT IN ('succeeded','canceled'))) LIMIT 1",
    )
      .bind(report.job_id)
      .first();
    if (unresolvedMoney)
      fail(
        409,
        "Reconcile the Stripe dispute or unresolved refund before restoring this job.",
      );
  }
  if (input.action === "cancel_job") {
    const money = await c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM milestones WHERE job_id=? AND status IN ('paid','checkout_pending')",
    )
      .bind(report.job_id)
      .first<{ count: number }>();
    if (money?.count)
      fail(
        409,
        "Reconcile active payments or refund paid milestones before cancelling.",
      );
  }
  const previous = await c.env.DB.prepare(
    "SELECT prior_status FROM reports WHERE job_id=? AND prior_status<>'disputed' ORDER BY created_at DESC LIMIT 1",
  )
    .bind(report.job_id)
    .first<{ prior_status: string }>();
  let restored = previous?.prior_status || "in_progress";
  if (restored === "completed") {
    const unpaid = await c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM milestones WHERE job_id=? AND status<>'paid'",
    )
      .bind(report.job_id)
      .first<{ count: number }>();
    if (unpaid?.count) restored = "in_progress";
  }
  const update = input.action === "cancel_job" ? "cancelled" : restored;
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE reports SET status='resolved',resolution=?,resolved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='open'",
    ).bind(input.resolution, report.id),
    c.env.DB.prepare(
      "UPDATE jobs SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND (status='disputed' OR (?='cancel_job' AND status='open')) AND ?<> 'none' AND NOT EXISTS(SELECT 1 FROM reports WHERE job_id=jobs.id AND status='open') AND (?<>'cancel_job' OR NOT EXISTS(SELECT 1 FROM milestones WHERE job_id=jobs.id AND status IN ('paid','checkout_pending'))) AND (?<>'restore_job' OR NOT EXISTS(SELECT 1 FROM payment_attempts p JOIN milestones m ON m.id=p.milestone_id LEFT JOIN refund_intents r ON r.payment_attempt_id=p.id WHERE m.job_id=jobs.id AND (p.status='disputed' OR (r.status IS NOT NULL AND r.status NOT IN ('succeeded','canceled')))))",
    ).bind(
      update,
      report.job_id,
      input.action,
      input.action,
      input.action,
      input.action,
    ),
    audit(c.env.DB, c.get("user")!.id, "report.resolved", report.id, {
      action: input.action,
    }),
  ]);
  return c.json({ ok: true });
});
marketplace.post("/admin/users/:id/suspend", requireAdmin, async (c) => {
  const { suspended } = await jsonInput(
    c,
    z.object({ suspended: z.boolean() }),
  );
  const actor = c.get("user")!;
  const id = c.req.param("id");
  if (actor.id === id)
    fail(400, "You cannot suspend your own administrator account.");
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE id=?")
    .bind(id)
    .first();
  if (!existing) fail(404, "User not found.");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET suspended_at=? WHERE id=?").bind(
      suspended ? new Date().toISOString() : null,
      id,
    ),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND ?=1").bind(
      id,
      suspended ? 1 : 0,
    ),
    audit(
      c.env.DB,
      actor.id,
      suspended ? "user.suspended" : "user.restored",
      id,
    ),
  ]);
  return c.json({ ok: true });
});
