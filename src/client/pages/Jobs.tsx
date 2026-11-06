import { displayLabel } from "../locale";
import { transactionFee, PRICING_VERSION } from "../../shared/pricing";
import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPin,
  Plus,
  Trash2,
  Send,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import {
  api,
  post,
  money,
  feeFor,
  categories,
  examples,
  dateLabel,
  readable,
  stripeRedirect,
  type JobDetail,
  type Milestone,
} from "../api";
import { useApp } from "../context";
import {
  ActionFeedback,
  Alert,
  Empty,
  Loading,
  PageHeading,
  PreviewNotice,
  Status,
  useAction,
} from "../components";

import { CountrySelect, countryName } from "../region";
import { calendarDate } from "../../shared/regions";
type DraftMilestone = { key: string; title: string; amount: string };
const jobDraftKey = "saladfinder-job-draft";
type JobDraft = {
  country?: string;
  title: string;
  description: string;
  category: string;
  city: string;
  area: string;
  date: string;
  hours: string;
  milestones: DraftMilestone[];
};
function readJobDraft(): JobDraft | null {
  try {
    const draft = JSON.parse(sessionStorage.getItem(jobDraftKey) || "null");
    if (
      !draft ||
      typeof draft !== "object" ||
      ![
        "title",
        "description",
        "category",
        "city",
        "area",
        "date",
        "hours",
      ].every((key) => typeof draft[key] === "string") ||
      !Array.isArray(draft.milestones) ||
      draft.milestones.length < 1 ||
      draft.milestones.length > 5 ||
      !draft.milestones.every(
        (m: DraftMilestone) =>
          m &&
          typeof m.key === "string" &&
          typeof m.title === "string" &&
          typeof m.amount === "string",
      )
    )
      return null;
    return draft;
  } catch {
    return null;
  }
}
export function PostJob() {
  const { user, config } = useApp();
  const navigate = useNavigate();
  const action = useAction();
  const [draft] = useState(readJobDraft);
  const [draftSaved, setDraftSaved] = useState(false);
  const [title, setTitle] = useState(draft?.title || "");
  const [description, setDescription] = useState(draft?.description || "");
  const [category, setCategory] = useState<string>(
    categories.includes(draft?.category as (typeof categories)[number])
      ? draft!.category
      : categories[0],
  );
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [country, setCountry] = useState(draft?.country || user?.country || "");
  const [city, setCity] = useState(draft?.city || "");
  const [area, setArea] = useState(draft?.area || "");
  const [date, setDate] = useState(draft?.date || "");
  const [hours, setHours] = useState(draft?.hours || "");
  const [milestones, setMilestones] = useState<DraftMilestone[]>(
    draft?.milestones || [
      { key: crypto.randomUUID(), title: "Job completed", amount: "" },
    ],
  );
  useEffect(() => {
    try {
      sessionStorage.setItem(
        jobDraftKey,
        JSON.stringify({
          title,
          description,
          category,
          country,
          city,
          area,
          date,
          hours,
          milestones,
        }),
      );
      setDraftSaved(true);
    } catch {
      setDraftSaved(false);
    }
  }, [
    title,
    description,
    category,
    country,
    city,
    area,
    date,
    hours,
    milestones,
  ]);
  const amounts = milestones.map((m) =>
    Math.round(Number(m.amount || 0) * 100),
  );
  const budget = amounts.reduce((a, b) => a + b, 0);
  const fees = amounts.reduce(
    (sum, amount) =>
      sum +
      (amount > 0 && amount <= 500000
        ? transactionFee(
            amount,
            "poster",
            config?.pricingEnabled ? (config.plan ?? "standard") : "legacy",
          )
        : 0),
    0,
  );
  const listingsReady = config?.listingsReady ?? config?.launchMode === "live";
  const preview = !listingsReady;
  const update = (key: string, field: "title" | "amount", value: string) =>
    setMilestones((rows) =>
      rows.map((m) => (m.key === key ? { ...m, [field]: value } : m)),
    );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!user || !listingsReady) return;
    void action.run(async () => {
      const data = await post<{ job: { id: string } }>("/jobs", {
        feePlan: config?.pricingEnabled
          ? (config.plan ?? "standard")
          : "legacy",
        pricingVersion: PRICING_VERSION,
        title,
        description,
        category,
        city,
        area,
        country,
        timeZone,
        start_date: date,
        estimated_hours: Number(hours),
        milestones: milestones.map((m, i) => ({
          title: m.title,
          amount_cents: amounts[i],
        })),
      });
      try {
        sessionStorage.removeItem(jobDraftKey);
      } catch {
        /* Publishing does not depend on browser storage. */
      }
      navigate(`/jobs/${data.job.id}`);
    });
  };
  return (
    <section className="page-wrap">
      <PageHeading title="A little help goes a long way.">
        <p>
          Tell people what needs doing. Agree on the work, the price, and when
          each part gets paid.
        </p>
      </PageHeading>
      <PreviewNotice />
      <div className="form-layout">
        <form className="form-stack" onSubmit={submit}>
          <section className="form-section">
            <h2>The job</h2>
            <label>
              Give your job a clear title
              <input
                required
                minLength={8}
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Help tidy a small backyard"
              />
            </label>
            <label>
              What needs doing?
              <textarea
                required
                minLength={40}
                maxLength={5000}
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the tasks, what you’ll supply, access, and any physical demands. Keep private contact details out of the listing."
              />
            </label>
            <div className="form-grid">
              <label>
                Category
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {displayLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
              <CountrySelect allowed={config?.workerPayoutCountries || ["CA"]} value={country} onChange={setCountry} required />
              <label>
                City or locality
                <input
                  required
                  minLength={1}
                  maxLength={80}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g., Toronto"
                />
              </label>
            </div>
            <label>
              Neighbourhood <span className="optional">optional</span>
              <input
                maxLength={100}
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="General area only — no street address"
              />
            </label>
            <div className="form-grid">
              <label>
                Preferred date
                <input
                  type="date"
                  required
                  min={calendarDate(new Date(), timeZone)}
                  max={calendarDate(
                    new Date(Date.now() + 365 * 86400000),
                    timeZone,
                  )}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                Estimated hours
                <input
                  type="number"
                  min="0.5"
                  max="80"
                  step="0.5"
                  required
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="e.g., 3"
                />
              </label>
            </div>
          </section>
          <section className="form-section">
            <div className="section-title">
              <h2>Agree on the milestones</h2>
              <span>{milestones.length}/5</span>
            </div>
            <p>
              Pay once on completion, or split longer jobs into up to five
              agreed stages. At least $25 CAD per stage; $5,000 CAD maximum per
              job.
            </p>
            <div className="milestone-editor">
              {milestones.map((m, i) => (
                <div className="milestone-edit-row" key={m.key}>
                  <span className="step-number">{i + 1}</span>
                  <label>
                    Milestone
                    <input
                      required
                      minLength={3}
                      maxLength={120}
                      aria-label={`Milestone ${i + 1}`}
                      value={m.title}
                      onChange={(e) => update(m.key, "title", e.target.value)}
                      placeholder="What will be completed?"
                    />
                  </label>
                  <label>
                    Worker pay (CAD)
                    <input
                      type="number"
                      min="25"
                      max="5000"
                      step="0.01"
                      required
                      aria-label={`Worker pay (CAD)${milestones.length > 1 ? ` for milestone ${i + 1}` : ""}`}
                      value={m.amount}
                      onChange={(e) => update(m.key, "amount", e.target.value)}
                      placeholder="100.00"
                    />
                  </label>
                  {milestones.length > 1 && (
                    <button
                      type="button"
                      className="button-quiet icon-button"
                      onClick={() =>
                        setMilestones((rows) =>
                          rows.filter((row) => row.key !== m.key),
                        )
                      }
                      aria-label={`Remove milestone ${i + 1}`}
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="button button-outline"
              disabled={milestones.length >= 5}
              onClick={() =>
                setMilestones((rows) => [
                  ...rows,
                  { key: crypto.randomUUID(), title: "", amount: "" },
                ])
              }
            >
              <Plus size={17} />
              Add a milestone
            </button>
          </section>
          <label className="choice consent">
            <input type="checkbox" required />
            <span>
              This is lawful, safe work that does not require a regulated
              licence. I have described the scope accurately and agree to the{" "}
              <Link to="/terms">Terms</Link>.
            </span>
          </label>
          <ActionFeedback {...action} />
          {draftSaved && (
            <p className="small-text">
              Your draft is saved in this tab while you sign in or look around.
              It is removed after publishing.
            </p>
          )}
          {budget > 500000 && (
            <Alert>The job total must be $5,000 CAD or less.</Alert>
          )}
          {preview ? (
            <div className="notice-with-action">
              <p>
                You can plan your job here. Publishing opens when the
                marketplace launches.
              </p>
              <Link to="/early-access" className="button">
                Join early access <ArrowRight size={18} />
              </Link>
            </div>
          ) : !user ? (
            <Link className="button" to="/sign-in?next=%2Fpost">
              Sign in to publish <ArrowRight size={18} />
            </Link>
          ) : !(config?.workerPayoutCountries || ["CA"]).includes(user.country || "") ? (
            <p>Posting requires a profile in an enabled work region. <Link to="/account">Review your country</Link></p>
          ) : (
            <button
              className="button"
              disabled={action.busy || budget > 500000 || !(config?.workerPayoutCountries || ["CA"]).includes(country)}
            >
              {action.busy ? "Publishing…" : "Publish job"}
              <ArrowRight size={18} />
            </button>
          )}
        </form>
        <aside className="quote-panel">
          <h2>Your price, clearly.</h2>
          <dl className="price-breakdown">
            <div>
              <dt>Worker pay</dt>
              <dd>{money(budget)}</dd>
            </div>
            <div>
              <dt>SaladFinder fee</dt>
              <dd>{money(fees)}</dd>
            </div>
            <div className="total">
              <dt>Your total</dt>
              <dd>{money(budget + fees)} CAD</dd>
            </div>
          </dl>
          <p>
            {config?.pricingEnabled
              ? `Your ${config.plan ?? "standard"} poster fee is shown above. Worker fees are deducted separately from the listed gross pay. Publishing records this fee plan for the job.`
              : "12% + $1 per paid milestone, with a $3 minimum fee. Workers receive the listed amount before their own taxes."}
          </p>
          <p>No charge to publish a job.</p>
          <div className="quote-rule">
            <ShieldCheck size={23} />
            <p>
              You approve each milestone before paying through Stripe. Payments
              are not held in escrow or guaranteed in advance.
            </p>
          </div>
          <Link className="text-link" to="/pricing">
            See how pricing works <ArrowRight size={17} />
          </Link>
        </aside>
      </div>
    </section>
  );
}

export function JobPage() {
  const { id = "" } = useParams();
  const { user, config } = useApp();
  const [params] = useSearchParams();
  const example = examples.find((j) => j.id === id);
  const [data, setData] = useState<JobDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const action = useAction();
  const [application, setApplication] = useState("");
  const [message, setMessage] = useState("");
  const [report, setReport] = useState("");
  const [review, setReview] = useState("");
  const [rating, setRating] = useState("5");
  useEffect(() => {
    let active = true;
    setError("");
    if (example) {
      setData({
        job: example,
        milestones:
          example.payment_schedule === "milestones"
            ? [
                {
                  id: "demo-1",
                  job_id: id,
                  title: "Leaves cleared and debris gathered",
                  amount_cents: 9000,
                  position: 0,
                  status: "pending",
                },
                {
                  id: "demo-2",
                  job_id: id,
                  title: "Final tidy and walkthrough",
                  amount_cents: 9000,
                  position: 1,
                  status: "pending",
                },
              ]
            : [
                {
                  id: "demo-1",
                  job_id: id,
                  title: "Job completed and approved",
                  amount_cents: example.budget_cents,
                  position: 0,
                  status: "pending",
                },
              ],
      });
      setLoading(false);
      return;
    }
    setLoading(!data || data.job.id !== id);
    setRefreshing(true);
    api<JobDetail>(`/jobs/${encodeURIComponent(id)}`)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id, revision, example, user?.id]);
  if (loading) return <Loading label="Opening job…" />;
  if (!data || data.job.id !== id)
    return (
      <div className="page-wrap narrow">
        <Alert>{error || "This job could not be found."}</Alert>
        <Link className="text-link" to="/">
          Back to work
        </Link>
      </div>
    );
  const { job, milestones } = data;
  const workerFeeFor = (m: Milestone) =>
    job.worker_id
      ? (m.worker_fee_cents ?? 0)
      : (data.workerFeeQuotes?.[m.id] ??
        transactionFee(
          m.amount_cents,
          "worker",
          data.workerFeePlan ?? "legacy",
        ));
  const owner = user?.id === job.poster_id,
    worker = user?.id === job.worker_id,
    participant = owner || worker;
  const workReady = config?.launchMode === "live";
  const listingsReady = config?.listingsReady ?? workReady;
  const activeJob =
    workReady && ["assigned", "in_progress"].includes(job.status);
  const myReview = data.reviews?.find(
    (review) => review.author_id === user?.id,
  );
  const refresh = () => setRevision((v) => v + 1);
  const act = (path: string, body: unknown = {}, success = "Updated.") =>
    void action.run(async () => {
      await post(path, body);
      refresh();
    }, success);
  const checkout = (milestone: Milestone) =>
    void action.run(async () => {
      const response = await post<{ url: string }>(
        `/milestones/${milestone.id}/checkout`,
      );
      stripeRedirect(response.url);
    });
  return (
    <section className="page-wrap">
      <Link to="/" className="back-link">
        <ArrowLeft size={17} />
        Back to work
      </Link>
      <div className="job-heading">
        <div>
          <div className="job-category">
            {displayLabel(job.category)} ·{" "}
            {[job.city, countryName(job.country)].filter(Boolean).join(", ")}
          </div>
          <h1>{job.title}</h1>
          <div className="job-meta">
            <span>
              <MapPin size={17} />
              {job.area || job.city}
            </span>
            {job.start_date && (
              <span>
                <CalendarDays size={17} />
                {dateLabel(job.start_date)}
              </span>
            )}
            <span>
              <Clock3 size={17} />
              About {job.estimated_hours} hours
            </span>
          </div>
        </div>
        <div className="job-total">
          <strong>
            {money(job.budget_cents)} <span>CAD</span>
          </strong>
          <span>Worker pay</span>
          <Status value={job.status} />
        </div>
      </div>
      {example && (
        <Alert kind="info">
          This is an example listing, not a real job. It cannot be booked.{" "}
          <Link to="/early-access">Join early access</Link> to hear when jobs
          are available.
        </Alert>
      )}
      {params.get("payment") === "returned" && (
        <Alert kind="info">
          You’re back from Stripe. Payment status updates after confirmation
          from Stripe.{" "}
          <button className="text-button" onClick={refresh}>
            Refresh status
          </button>
        </Alert>
      )}
      {!example && (
        <div className="action-row job-refresh">
          <button
            type="button"
            className="button button-outline"
            disabled={refreshing || action.busy}
            onClick={refresh}
          >
            <RefreshCw size={17} />
            {refreshing ? "Refreshing…" : "Refresh job"}
          </button>
          <span className="small-text">
            Refresh for new applications, messages and payment updates.
          </span>
        </div>
      )}
      {!example && <PreviewNotice />}
      {error && (
        <Alert>
          {error} Your last loaded job is still shown. Refresh to try again.
        </Alert>
      )}
      <ActionFeedback {...action} />
      <div className="detail-layout">
        <div className="detail-main">
          <section className="content-section">
            <h2>The work</h2>
            <p className="preserve-lines">{job.description}</p>
            {job.poster_name && (
              <p className="small-text">Posted by {job.poster_name}</p>
            )}
          </section>
          <section className="content-section">
            <h2>Clear milestones. Clear pay.</h2>
            <p>
              {milestones.length > 1
                ? "The agreed amount is split into stages. Submit each stage when it’s complete."
                : "One payment when the agreed work is complete."}{" "}
              Approval comes before payment; bank arrival is a separate step.
            </p>
            <div className="milestone-list">
              {milestones.map((m, index) => (
                <div className="milestone-item" key={m.id}>
                  <span className="step-number">{index + 1}</span>
                  <div className="milestone-content">
                    <div className="section-title">
                      <h3>{m.title}</h3>
                      <strong>{money(m.amount_cents)}</strong>
                    </div>
                    <Status value={m.status} />
                    {!example && !owner && (
                      <p className="small-text">
                        Gross: {money(m.amount_cents)} · Worker fee:{" "}
                        {money(workerFeeFor(m))} · Net earnings:{" "}
                        {money(m.amount_cents - workerFeeFor(m))} CAD before
                        taxes.
                      </p>
                    )}
                    {owner &&
                      !example &&
                      ["submitted", "approved", "checkout_pending"].includes(
                        m.status,
                      ) && (
                        <p className="small-text">
                          Worker: {money(m.amount_cents)} · Fee:{" "}
                          {money(m.fee_cents ?? feeFor(m.amount_cents))} ·
                          Total:{" "}
                          {money(
                            m.amount_cents +
                              (m.fee_cents ?? feeFor(m.amount_cents)),
                          )}{" "}
                          CAD
                        </p>
                      )}
                    {!example && activeJob && (
                      <div className="action-row">
                        {worker &&
                          job.status === "in_progress" &&
                          m.status === "pending" && (
                            <button
                              className="button button-outline"
                              disabled={action.busy}
                              onClick={() =>
                                act(
                                  `/milestones/${m.id}/submit`,
                                  {},
                                  "Milestone submitted for approval.",
                                )
                              }
                            >
                              Submit completed work
                            </button>
                          )}
                        {owner && m.status === "submitted" && (
                          <button
                            className="button button-outline"
                            disabled={action.busy}
                            onClick={() =>
                              act(
                                `/milestones/${m.id}/approve`,
                                {},
                                "Milestone approved. Payment is the next step.",
                              )
                            }
                          >
                            Approve milestone
                          </button>
                        )}
                        {owner &&
                          ["approved", "checkout_pending"].includes(
                            m.status,
                          ) && (
                            <button
                              className="button"
                              disabled={action.busy || !config?.paymentsReady}
                              onClick={() => checkout(m)}
                            >
                              Pay{" "}
                              {money(
                                m.amount_cents +
                                  (m.fee_cents ?? feeFor(m.amount_cents)),
                              )}{" "}
                              CAD
                              <ArrowRight size={16} />
                            </button>
                          )}
                      </div>
                    )}
                    {m.paid_at && (
                      <p className="small-text">
                        Customer payment confirmed {dateLabel(m.paid_at)}. This
                        is not confirmation of bank arrival.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
          {(owner || user?.is_admin) &&
            !example &&
            (job.status === "open" || user?.is_admin) && (
              <section className="content-section">
                <h2>Applications</h2>
                {!workReady && (
                  <p className="small-text">
                    You can review applications now. Hiring opens after payment
                    and launch requirements are complete.
                  </p>
                )}
                {data.applications?.length ? (
                  data.applications.map((a) => (
                    <article className="application" key={a.id}>
                      <div className="section-title">
                        <h3>{a.worker_name || a.name || "Worker"}</h3>
                        <Status value={a.status} />
                      </div>
                      <p className="preserve-lines">{a.message}</p>
                      {a.worker_bio && (
                        <p className="small-text">Profile: {a.worker_bio}</p>
                      )}
                      {a.worker_city && (
                        <p className="small-text">
                          Based in{" "}
                          {[a.worker_city, countryName(a.worker_country)]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                      {owner &&
                        !(config?.workerPayoutCountries || ["CA"]).includes(
                          a.worker_country || "",
                        ) && (
                          <p>
                            Paid hiring is unavailable until this worker has a
                            supported payout country.
                          </p>
                        )}
                      {owner &&
                        job.status === "open" &&
                        a.status === "pending" && (
                          <button
                            className="button"
                            disabled={
                              action.busy ||
                              !workReady ||
                              !(
                                config?.workerPayoutCountries || ["CA"]
                              ).includes(a.worker_country || "")
                            }
                            onClick={() =>
                              act(
                                `/jobs/${id}/hire`,
                                { applicationId: a.id },
                                "Worker hired. Use messages to agree on access and timing.",
                              )
                            }
                          >
                            Hire this worker <ArrowRight size={17} />
                          </button>
                        )}
                    </article>
                  ))
                ) : (
                  <Empty title="No applications yet.">
                    <p>Workers can apply after finding your listing.</p>
                  </Empty>
                )}
              </section>
            )}
          {(participant || user?.is_admin) && !example && (
            <section className="content-section" id="messages">
              <h2>
                {participant
                  ? "Keep the conversation here"
                  : "Job conversation · moderation view"}
              </h2>
              <p>
                Use messages to confirm scope and access. Never share card
                numbers, bank credentials, or identification documents.
              </p>
              <div className="message-list" aria-live="polite">
                {data.messages?.length ? (
                  data.messages.map((m) => (
                    <div
                      className={`message ${m.sender_id === user?.id ? "own-message" : ""}`}
                      key={m.id}
                    >
                      <strong>
                        {m.sender_id === user?.id
                          ? "You"
                          : m.sender_name || "Job participant"}
                      </strong>
                      <p className="preserve-lines">{m.body}</p>
                      <time>{dateLabel(m.created_at)}</time>
                    </div>
                  ))
                ) : (
                  <p className="small-text">
                    {job.worker_id
                      ? "No messages yet. Start by confirming the practical details."
                      : "Messages open after a worker is hired."}
                  </p>
                )}
              </div>
              {participant && job.worker_id && (
                <form
                  className="form-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action.run(async () => {
                      await post(`/jobs/${id}/messages`, { body: message });
                      setMessage("");
                      refresh();
                    });
                  }}
                >
                  <label>
                    Your message
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                      maxLength={2000}
                      rows={3}
                    />
                  </label>
                  <button
                    className="button button-outline"
                    disabled={action.busy}
                  >
                    Send message <Send size={16} />
                  </button>
                </form>
              )}
            </section>
          )}
          {participant &&
            !example &&
            workReady &&
            job.status === "completed" &&
            !myReview && (
              <section className="content-section">
                <h2>How did it go?</h2>
                <form
                  className="form-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(
                      `/jobs/${id}/reviews`,
                      { rating: Number(rating), body: review },
                      "Your review has been saved.",
                    );
                  }}
                >
                  <label>
                    Rating
                    <select
                      value={rating}
                      onChange={(e) => setRating(e.target.value)}
                    >
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option value={n} key={n}>
                          {n} {n === 1 ? "star" : "stars"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Your review
                    <textarea
                      value={review}
                      onChange={(e) => setReview(e.target.value)}
                      required
                      minLength={10}
                      maxLength={2000}
                    />
                  </label>
                  <button
                    className="button button-outline"
                    disabled={action.busy}
                  >
                    Share review
                  </button>
                </form>
              </section>
            )}
          {!!data.reviews?.length && (
            <section className="content-section">
              <h2>Reviews</h2>
              {data.reviews.map((r) => (
                <article className="review" key={r.id}>
                  <strong>
                    {r.rating}/5 · {r.author_name || "Job participant"}
                  </strong>
                  <p>{r.body}</p>
                </article>
              ))}
            </section>
          )}
        </div>
        <aside className="detail-sidebar">
          <div className="quote-panel">
            <h2>
              {example
                ? "Picture your next job."
                : owner
                  ? "Your job at a glance."
                  : worker
                    ? "You’re on the job."
                    : "Sound like your kind of work?"}
            </h2>
            <p>
              Applications and paid hiring require a supported
              worker payout country. International workers must finish Stripe
              verification before hire. Agree on the scope and payment stages
              before starting. Take work only when you have the skills, tools,
              and time to do it safely.
            </p>
            {example ? (
              <Link className="button" to="/early-access">
                Join early access
                <ArrowRight size={17} />
              </Link>
            ) : owner ? (
              <>
                {job.worker_name && (
                  <p>
                    Working with <strong>{job.worker_name}</strong>
                  </p>
                )}
                {job.status === "assigned" && (
                  <p>The worker will mark the job started when work begins.</p>
                )}
                {job.status === "open" && (
                  <details className="details-box">
                    <summary>Cancel this job</summary>
                    <p>
                      Cancellation is available only when the payment state
                      allows it. Paid work needs a support review.
                    </p>
                    <button
                      className="button button-outline"
                      disabled={action.busy}
                      onClick={() =>
                        act(`/jobs/${id}/cancel`, {}, "Job cancelled.")
                      }
                    >
                      Cancel job
                    </button>
                  </details>
                )}
              </>
            ) : worker ? (
              <>
                <Status value={job.status} />
                {job.status === "assigned" && (
                  <button
                    className="button"
                    disabled={action.busy || !workReady}
                    onClick={() =>
                      act(`/jobs/${id}/start`, {}, "Job marked in progress.")
                    }
                  >
                    Start job
                  </button>
                )}
                <p>
                  <a className="text-link" href="#messages">
                    Message the client <ArrowRight size={17} />
                  </a>
                </p>
                <Link className="text-link" to="/account">
                  Manage payouts <ArrowRight size={17} />
                </Link>
              </>
            ) : job.status === "open" && listingsReady ? (
              data.myApplication ? (
                <>
                  <Status value={data.myApplication.status} />
                  <p>
                    {data.myApplication.status === "withdrawn"
                      ? "Your application has been withdrawn."
                      : "Your application has been sent. Check My work for updates."}
                  </p>
                  {data.myApplication.status === "pending" && (
                    <button
                      className="button button-outline"
                      disabled={action.busy}
                      onClick={() =>
                        act(
                          `/jobs/${id}/applications/withdraw`,
                          {},
                          "Application withdrawn.",
                        )
                      }
                    >
                      Withdraw application
                    </button>
                  )}
                  <Link className="button button-outline" to="/dashboard">
                    View my work
                  </Link>
                </>
              ) : !user ? (
                <Link
                  className="button"
                  to={`/sign-in?next=${encodeURIComponent(`/jobs/${id}`)}`}
                >
                  Sign in to apply <ArrowRight size={17} />
                </Link>
              ) : !(config?.workerPayoutCountries || ["CA"]).includes(user.country || "") || !(config?.workerPayoutCountries || ["CA"]).includes(job.country || "") ? (
                <p>Applications require an enabled worker country and job location. <Link to="/account">Review your profile country</Link></p>
              ) : (
                <form
                  className="form-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(
                      `/jobs/${id}/apply`,
                      {
                        message: application,
                        feePlan: data.workerFeePlan ?? "legacy",
                        pricingVersion: PRICING_VERSION,
                      },
                      "Application sent.",
                    );
                  }}
                >
                  <p>
                    Review the worker fee and net earnings shown for each
                    milestone above. Applying records your displayed fee plan
                    for this job; later subscription changes do not reprice this
                    application.
                  </p>
                  <label>
                    Introduce yourself
                    <textarea
                      required
                      minLength={20}
                      maxLength={2000}
                      value={application}
                      onChange={(e) => setApplication(e.target.value)}
                      rows={5}
                      placeholder="Share relevant experience and when you’re available."
                    />
                  </label>
                  <label className="choice consent">
                    <input type="checkbox" required />
                    <span>
                      I understand the work and agree to the listed price and
                      milestones.
                    </span>
                  </label>
                  <button className="button" disabled={action.busy}>
                    Apply for this job <ArrowRight size={16} />
                  </button>
                </form>
              )
            ) : (
              <Alert kind="info">
                {job.status === "open"
                  ? "Applications are not open yet. Join early access for launch updates."
                  : "This job is no longer accepting applications."}
              </Alert>
            )}
            <hr />
            <h3>When will I get paid?</h3>
            <p>
              After a client approves a milestone, they pay through Stripe.
              {config?.instantPayoutsEnabled
                ? "Eligible workers can request an instant payout to a supported Canadian debit card."
                : "Instant Payouts: Coming later."}{" "}
              Standard bank payouts use settled available funds and follow
              Stripe processing and bank timelines.
            </p>
            <Link className="text-link" to="/how-it-works#payments">
              Understand payout timing <ArrowRight size={17} />
            </Link>
          </div>
          {user && !example && (
            <details className="report-box">
              <summary>Report a problem</summary>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action.run(async () => {
                    await post(`/jobs/${id}/report`, { reason: report });
                    setReport("");
                    refresh();
                  }, "Report submitted for review.");
                }}
              >
                <p>
                  Tell us about unsafe work, payment concerns, or a misleading
                  listing. In an emergency, contact local emergency services.
                </p>
                <label>
                  What happened?
                  <textarea
                    required
                    minLength={20}
                    maxLength={2000}
                    value={report}
                    onChange={(e) => setReport(e.target.value)}
                    rows={4}
                  />
                </label>
                <button
                  className="button button-outline"
                  disabled={action.busy}
                >
                  Submit report
                </button>
              </form>
            </details>
          )}
        </aside>
      </div>
    </section>
  );
}
