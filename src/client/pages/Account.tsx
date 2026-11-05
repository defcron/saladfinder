import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import {
  api,
  post,
  money,
  dateLabel,
  stripeRedirect,
  type Job,
  type Application,
} from "../api";
import { useApp } from "../context";
import { PayoutForm, type PaymentStatus } from "../payouts";
import {
  ActionFeedback,
  Alert,
  Empty,
  JobRow,
  Loading,
  PageHeading,
  Status,
  useAction,
} from "../components";

type DashboardData = {
  posted: Job[];
  assigned: Job[];
  applications: Application[];
};
export function Dashboard() {
  const { user } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"assigned" | "posted" | "applications">(
    user?.role === "poster" ? "posted" : "assigned",
  );
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    setRefreshing(true);
    api<DashboardData>("/dashboard")
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  return (
    <section className="page-wrap">
      <div className="heading-with-action">
        <PageHeading title="Your work, all together.">
          <p>Keep up with applications, conversations, and what’s due next.</p>
        </PageHeading>
        <button
          className="button button-outline"
          disabled={refreshing}
          onClick={() => setRevision((v) => v + 1)}
        >
          <RefreshCw size={17} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div className="tabs" role="tablist" aria-label="Work overview">
        {(
          [
            ["assigned", "My jobs"],
            ["posted", "Jobs I posted"],
            ["applications", "Applications"],
          ] as const
        ).map(([key, label]) => (
          <button
            role="tab"
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            aria-controls={`panel-${key}`}
            id={`tab-${key}`}
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
            onKeyDown={(event) => {
              const tabs = ["assigned", "posted", "applications"] as const;
              const index = tabs.indexOf(key);
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setTab(tabs[next]);
              document.getElementById(`tab-${tabs[next]}`)?.focus();
            }}
          >
            {label}
            {data && <span>{data[key].length}</span>}
          </button>
        ))}
      </div>
      {error ? (
        <Alert>{error}</Alert>
      ) : !data ? (
        <Loading />
      ) : (
        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === "applications" ? (
            data.applications.length ? (
              <div className="application-list">
                {data.applications.map((a) => (
                  <Link
                    className="application-row"
                    to={`/jobs/${a.job_id}`}
                    key={a.id}
                  >
                    <div>
                      <h3>{a.job_title || "View job"}</h3>
                      <p>{a.message}</p>
                    </div>
                    <Status value={a.status} />
                    <ArrowRight size={22} />
                  </Link>
                ))}
              </div>
            ) : (
              <Empty title="A good application is the first step.">
                <p>
                  Find a job that fits, share your experience, and let the
                  client know when you’re free.
                </p>
                <Link className="button" to="/">
                  Find work <ArrowRight size={17} />
                </Link>
              </Empty>
            )
          ) : data[tab].length ? (
            <div className="job-list">
              {data[tab].map((job) => (
                <div className="dashboard-job" key={job.id}>
                  <Status value={job.status} />
                  <JobRow job={job} />
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title={
                tab === "posted"
                  ? "What could you use a hand with?"
                  : "Your next job belongs here."
              }
            >
              <p>
                {tab === "posted"
                  ? "Create a clear listing with a fair price and agreed milestones."
                  : "Jobs you’re hired for will appear here, with messages and payment progress."}
              </p>
              <Link className="button" to={tab === "posted" ? "/post" : "/"}>
                {tab === "posted" ? "Post a job" : "Find work"}
                <ArrowRight size={17} />
              </Link>
            </Empty>
          )}
        </div>
      )}
    </section>
  );
}

export function Account() {
  const { user, config, refreshUser } = useApp();
  const [params] = useSearchParams();
  const [name, setName] = useState(user?.name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [city, setCity] = useState(user?.city || "");
  const [skills, setSkills] = useState(
    Array.isArray(user?.skills) ? user.skills.join(", ") : user?.skills || "",
  );
  const action = useAction();
  const paymentsAction = useAction();
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [statusLoading, setStatusLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setStatusError("");
    setStatusLoading(true);
    api<PaymentStatus>("/payments/status")
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((e: Error) => {
        if (active) setStatusError(e.message);
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const profileSubmit = (e: FormEvent) => {
    e.preventDefault();
    const selectedSkills = skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
    if (
      selectedSkills.length > 15 ||
      selectedSkills.some((skill) => skill.length > 40)
    ) {
      action.setError(
        "Use up to 15 skills, with no more than 40 characters per skill.",
      );
      return;
    }
    void action.run(async () => {
      await api("/me", {
        method: "PATCH",
        body: JSON.stringify({
          name,
          bio,
          city,
          skills: selectedSkills,
        }),
      });
      await refreshUser();
    }, "Your profile is saved.");
  };
  const external = (path: string) =>
    void paymentsAction.run(async () => {
      const response = await post<{ url: string }>(path);
      stripeRedirect(response.url);
    });
  return (
    <section className="page-wrap">
      <PageHeading title="Make yourself at home.">
        <p>Your profile, payment setup, and payout history.</p>
      </PageHeading>
      <div className="account-layout">
        <section className="content-section">
          <h2>Your profile</h2>
          <form className="form-stack" onSubmit={profileSubmit}>
            <label>
              Name
              <input
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label>
              Email address
              <input value={user?.email || ""} disabled type="email" />
              <span className="field-hint">Your verified account address.</span>
            </label>
            <label>
              Ontario city
              <input
                maxLength={80}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </label>
            <label>
              A little about you
              <textarea
                maxLength={1500}
                rows={5}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Relevant experience, the kind of work you do, and how you like to work."
              />
            </label>
            <label>
              Skills
              <input
                maxLength={500}
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="Assembly, gardening, cleaning"
              />
              <span className="field-hint">
                Separate skills with commas. Keep private contact details out of
                your profile. Up to 15 skills, 40 characters each.
              </span>
            </label>
            <ActionFeedback {...action} />
            <button className="button button-outline" disabled={action.busy}>
              {action.busy ? "Saving…" : "Save profile"}
            </button>
          </form>
          <div className="content-section">
            <h3>Your account data</h3>
            <p>Download your records or sign out every active session.</p>
            <div className="action-row">
              <a
                className="button button-outline"
                href="/api/me/export"
                download="saladfinder-data.json"
              >
                Download my data
              </a>
              <button
                className="button button-outline"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await post("/me/sessions/revoke");
                    await refreshUser();
                  })
                }
              >
                Sign out all sessions
              </button>
            </div>
          </div>
        </section>
        <section className="content-section">
          <div className="section-title">
            <h2>Payments &amp; payouts</h2>
            <button
              className="button-quiet icon-button"
              aria-label="Refresh payment status"
              disabled={statusLoading || paymentsAction.busy}
              onClick={() => setRevision((v) => v + 1)}
            >
              <RefreshCw size={18} />
            </button>
          </div>
          {params.get("onboarding") && (
            <Alert kind="info">
              {params.get("onboarding") === "refresh"
                ? "Your Stripe setup link expired. Continue with Stripe to get a fresh link."
                : "You’re back from Stripe. We’re checking your setup; Stripe may still need more information. Returning here does not itself confirm verification."}
            </Alert>
          )}
          {!config?.instantPayoutsEnabled && (
            <Alert kind="info">
              Instant Payouts: Coming later. Standard bank payouts are available
              after Stripe setup and funds become eligible.
            </Alert>
          )}
          <ActionFeedback {...paymentsAction} />
          {statusError ? (
            <Alert>{statusError}</Alert>
          ) : !status ? (
            <Loading label="Checking payment setup…" />
          ) : (
            <>
              {!status.configured ? (
                <Alert kind="info">
                  Payments aren’t open yet. You can complete your profile now;
                  we’ll make payment setup available before paid jobs launch.
                </Alert>
              ) : (
                <>
                  <div className="payment-setup">
                    <ShieldCheck size={28} strokeWidth={1.5} />
                    <div>
                      <h3>
                        {status.accountReady && !status.payoutSetupRequired
                          ? "Your Stripe account is ready."
                          : "Set up secure payments."}
                      </h3>
                      <p>
                        {status.message ||
                          "Stripe collects and verifies your payment details. SaladFinder never stores your bank or card credentials."}
                      </p>
                    </div>
                  </div>
                  {status.testMode && (
                    <Alert kind="info">
                      Stripe test mode is active. No real money moves.
                    </Alert>
                  )}
                  {status.frozen && (
                    <Alert>
                      New in-app payout requests are paused while a report is
                      reviewed. Funds and payouts already with Stripe are
                      separate.
                    </Alert>
                  )}
                  {status.payoutSetupRequired && (
                    <Alert kind="info">
                      Complete Stripe setup to request payouts here. This
                      switches your Stripe account from scheduled payouts to
                      payouts you request yourself. No payout is sent by this
                      setup step.
                    </Alert>
                  )}
                  {status.payoutSchedule === "manual" && (
                    <p className="small-text">
                      Your payouts are set to manual. Request{" "}
                      {status.instantPayoutsEnabled
                        ? "an instant or standard payout"
                        : "a standard bank payout"}{" "}
                      below when funds are eligible; SaladFinder does not
                      automatically send your balance.
                    </p>
                  )}
                  <div className="action-row">
                    <button
                      className="button"
                      disabled={paymentsAction.busy || !config?.paymentsReady}
                      onClick={() => external("/payments/onboard")}
                    >
                      {status.payoutSetupRequired
                        ? "Set up requested payouts"
                        : status.accountReady
                          ? "Update payment details"
                          : "Continue with Stripe"}
                      <ExternalLink size={16} />
                    </button>
                    {status.onboardingComplete && (
                      <button
                        className="button button-outline"
                        disabled={paymentsAction.busy}
                        onClick={() => external("/payments/dashboard")}
                      >
                        Stripe dashboard
                        <ExternalLink size={16} />
                      </button>
                    )}
                  </div>
                  {status.balance && (
                    <>
                      <div className="balance-summary">
                        <div>
                          <span>Available for standard payout</span>
                          <strong>
                            {money(status.balance.available_cents)} CAD
                          </strong>
                        </div>
                        <div>
                          <span>Pending settlement</span>
                          <strong>
                            {money(status.balance.pending_cents)} CAD
                          </strong>
                        </div>
                      </div>
                      {status.instantPayoutsEnabled ? (
                        <p className="small-text">
                          Instant-eligible balance:{" "}
                          {money(status.balance.instant_available_cents)} CAD.
                          An eligible balance does not guarantee an instant
                          payout will be approved.
                        </p>
                      ) : (
                        <p className="small-text">
                          Instant Payouts: Coming later. They are currently
                          disabled; standard bank payouts remain available when
                          eligible.
                        </p>
                      )}
                      {(status.payoutsEnabled || status.pendingPayout) && (
                        <PayoutForm
                          key={`${user!.id}:${status.accountId || user?.stripe_account_id || "unconnected"}`}
                          status={status}
                          userId={user!.id}
                          accountId={
                            status.accountId ||
                            user?.stripe_account_id ||
                            "unconnected"
                          }
                          supportEmail={config?.supportEmail || ""}
                          refresh={() => setRevision((value) => value + 1)}
                        />
                      )}
                    </>
                  )}
                  {!!status.payouts?.length && (
                    <div className="payout-history">
                      <h3>Payout history</h3>
                      {status.payouts.map((p) => (
                        <article className="payout-row" key={p.id}>
                          <div>
                            <strong>{money(p.amount_cents)} CAD</strong>
                            <p>
                              {p.method === "instant" ? "Instant" : "Standard"}{" "}
                              ·{" "}
                              {dateLabel(
                                new Date(p.created * 1000).toISOString(),
                              )}
                            </p>
                            {p.arrival_date && (
                              <p className="small-text">
                                Expected arrival{" "}
                                {dateLabel(
                                  new Date(p.arrival_date * 1000).toISOString(),
                                )}
                              </p>
                            )}
                          </div>
                          <Status value={p.status} />
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
          <div className="small-text payout-explainer">
            <h3>Four separate steps</h3>
            <ol>
              <li>Your client pays an approved milestone.</li>
              <li>Stripe makes funds available.</li>
              <li>A payout is sent to your linked account.</li>
              <li>Your bank makes the money available.</li>
            </ol>
            <p>
              Only the last step means money has arrived.{" "}
              <Link to="/how-it-works#payments">See payment details.</Link>
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}

type AdminReport = {
  id: string;
  job_id: string;
  job_title: string;
  reporter_id: string;
  reporter_name: string;
  reason: string;
  status: string;
  created_at: string;
};
type AdminUser = {
  id: string;
  name: string;
  email: string;
  suspended_at: string | null;
  created_at: string;
};
type AdminData = {
  stats: { users: number; jobs: number; openReports: number; waitlist: number };
  reports: AdminReport[];
  users: AdminUser[];
};
function ReportEditor({
  report,
  refresh,
}: {
  report: AdminReport;
  refresh: () => void;
}) {
  const action = useAction();
  const [resolution, setResolution] = useState("");
  const [decision, setDecision] = useState("none");
  return (
    <article className="admin-report">
      <div className="section-title">
        <h3>
          <Link to={`/jobs/${report.job_id}`}>{report.job_title}</Link>
        </h3>
        <Status value={report.status} />
      </div>
      <p className="small-text">
        Reported by {report.reporter_name} · {dateLabel(report.created_at)}
      </p>
      <p className="preserve-lines">{report.reason}</p>
      {report.status === "open" && (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await post(`/admin/reports/${report.id}/resolve`, {
                resolution,
                action: decision,
              });
              refresh();
            }, "Report resolved.");
          }}
        >
          <label>
            Resolution note
            <textarea
              required
              minLength={10}
              maxLength={2000}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
          </label>
          <label>
            Job action
            <select
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
            >
              <option value="none">Resolve report, keep job state</option>
              <option value="restore_job">Restore job</option>
              <option value="cancel_job">Cancel job</option>
            </select>
          </label>
          <ActionFeedback {...action} />
          <button className="button button-outline" disabled={action.busy}>
            Resolve report
          </button>
        </form>
      )}
    </article>
  );
}
export function Admin() {
  const { user } = useApp();
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const action = useAction();
  const [milestone, setMilestone] = useState("");
  const [reason, setReason] = useState("");
  const refresh = () => setRevision((v) => v + 1);
  useEffect(() => {
    if (!user?.is_admin) return;
    let active = true;
    api<AdminData>("/admin/overview")
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user?.is_admin, revision]);
  if (!user?.is_admin)
    return (
      <div className="page-wrap narrow">
        <PageHeading title="This area is for the operator." />
        <Link className="button" to="/dashboard">
          Back to my work
        </Link>
      </div>
    );
  return (
    <section className="page-wrap">
      <div className="heading-with-action">
        <PageHeading title="The operator’s desk.">
          <p>Review reports, protect participants, and reconcile payments.</p>
        </PageHeading>
        <button className="button button-outline" onClick={refresh}>
          Refresh
        </button>
      </div>
      <ActionFeedback {...action} />
      {error ? (
        <Alert>{error}</Alert>
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="admin-stats">
            {Object.entries(data.stats).map(([key, value]) => (
              <div key={key}>
                <strong>{value}</strong>
                <span>
                  {key === "openReports"
                    ? "Open reports"
                    : key.charAt(0).toUpperCase() + key.slice(1)}
                </span>
              </div>
            ))}
          </div>
          <section className="content-section">
            <h2>Reports</h2>
            {data.reports.length ? (
              data.reports.map((report) => (
                <ReportEditor
                  key={report.id}
                  report={report}
                  refresh={refresh}
                />
              ))
            ) : (
              <Empty title="No reports to review." />
            )}
          </section>
          <section className="content-section">
            <h2>Accounts</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td>{u.suspended_at ? "Suspended" : "Active"}</td>
                      <td>
                        {u.id !== user.id && (
                          <button
                            className="button button-outline button-small"
                            disabled={action.busy}
                            onClick={() =>
                              void action.run(async () => {
                                await post(`/admin/users/${u.id}/suspend`, {
                                  suspended: !u.suspended_at,
                                });
                                refresh();
                              }, "Account updated.")
                            }
                          >
                            {u.suspended_at
                              ? "Restore account"
                              : "Suspend account"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <PaymentReconciliation revision={revision} />
          <section className="content-section narrow-section">
            <h2>Refund a milestone</h2>
            <p>
              Refunds return the full customer charge, reverse the worker
              transfer, and refund the platform fee. Confirm the evidence and
              the milestone identifier before proceeding.
            </p>
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(async () => {
                  await post(
                    `/admin/milestones/${encodeURIComponent(milestone.trim())}/refund`,
                    { reason },
                  );
                  refresh();
                }, "Refund request recorded. Reconcile the final refund status in Stripe.");
              }}
            >
              <label>
                Milestone ID
                <input
                  required
                  value={milestone}
                  onChange={(e) => setMilestone(e.target.value)}
                />
              </label>
              <label>
                Reason
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label className="choice consent">
                <input type="checkbox" required />
                <span>
                  I reviewed this case and intend to issue a full refund.
                </span>
              </label>
              <button className="button button-outline" disabled={action.busy}>
                Issue full refund
              </button>
            </form>
          </section>
        </>
      )}
    </section>
  );
}

type MoneyIncident = {
  id: string;
  event_id: string;
  payment_attempt_id: string | null;
  milestone_id: string | null;
  job_id: string | null;
  reason: string;
  created_at: string;
};
type UnresolvedPayment = {
  id: string;
  milestone_id: string;
  job_id: string;
  status: string;
  amount_cents: number;
  fee_cents: number;
  checkout_session_id: string | null;
  payment_intent_id: string | null;
  created_at: string;
};
type AdminPayout = {
  request_id: string;
  user_id: string;
  method: string;
  amount_cents: number;
  payout_id: string | null;
  status: string;
  arrival_date: number | null;
  created_at: string;
};
type AdminRefund = {
  payment_attempt_id: string;
  operation_id: string;
  reason: string;
  refund_id: string | null;
  status: string;
  amount_cents: number;
  created_at: string;
};
type Reconciliation = {
  incidents: MoneyIncident[];
  unresolvedPayments: UnresolvedPayment[];
  payouts: AdminPayout[];
  refunds: AdminRefund[];
};
function PaymentReconciliation({ revision }: { revision: number }) {
  const [data, setData] = useState<Reconciliation | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    api<Reconciliation>("/admin/payments")
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  return (
    <section className="content-section">
      <h2>Payment reconciliation</h2>
      <p>
        Review uncertain operations against Stripe before taking further action.
        These lists show the latest 100 records in each category. An unresolved
        request must not be treated as a failed payment.
      </p>
      {error ? (
        <Alert>{error}</Alert>
      ) : !data ? (
        <Loading label="Loading payment records…" />
      ) : (
        <>
          <h3>Payment incidents</h3>
          {data.incidents.length ? (
            <div className="incident-list">
              {data.incidents.map((i) => (
                <article className="admin-report" key={i.id}>
                  <div className="section-title">
                    <strong>{i.reason}</strong>
                    <time className="small-text">
                      {dateLabel(i.created_at)}
                    </time>
                  </div>
                  {i.job_id && (
                    <p>
                      <Link to={`/jobs/${i.job_id}`}>Open affected job</Link>
                    </p>
                  )}
                  <dl className="record-details">
                    <dt>Event</dt>
                    <dd>{i.event_id}</dd>
                    <dt>Payment attempt</dt>
                    <dd>{i.payment_attempt_id || "Not linked"}</dd>
                    <dt>Milestone</dt>
                    <dd>{i.milestone_id || "Not linked"}</dd>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <p className="small-text">No payment incidents recorded.</p>
          )}
          <h3>Unresolved customer payments</h3>
          {data.unresolvedPayments.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Job / milestone</th>
                    <th>Customer amount</th>
                    <th>Status</th>
                    <th>Stripe reference</th>
                  </tr>
                </thead>
                <tbody>
                  {data.unresolvedPayments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/jobs/${p.job_id}`}>Open job</Link>
                        <br />
                        <code>{p.milestone_id}</code>
                      </td>
                      <td>{money(p.amount_cents + p.fee_cents)} CAD</td>
                      <td>
                        <Status value={p.status} />
                      </td>
                      <td>
                        <code>
                          {p.payment_intent_id ||
                            p.checkout_session_id ||
                            "Awaiting provider reference"}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="small-text">No unresolved customer payments.</p>
          )}
          <details className="details-box">
            <summary>Payout records ({data.payouts.length})</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Worker</th>
                    <th>Amount</th>
                    <th>Method / status</th>
                    <th>Stripe reference</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payouts.map((p) => (
                    <tr key={p.request_id}>
                      <td>
                        <code>{p.request_id}</code>
                      </td>
                      <td>
                        <code>{p.user_id}</code>
                      </td>
                      <td>{money(p.amount_cents)} CAD</td>
                      <td>
                        {p.method} · {p.status}
                      </td>
                      <td>
                        <code>
                          {p.payout_id || "Awaiting provider reference"}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details className="details-box">
            <summary>Refund records ({data.refunds.length})</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Operation</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Stripe reference</th>
                  </tr>
                </thead>
                <tbody>
                  {data.refunds.map((r) => (
                    <tr key={r.operation_id}>
                      <td>
                        <code>{r.operation_id}</code>
                      </td>
                      <td>{money(r.amount_cents)} CAD</td>
                      <td>
                        <Status value={r.status} />
                      </td>
                      <td>{r.reason}</td>
                      <td>
                        <code>
                          {r.refund_id || "Awaiting provider reference"}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="small-text">
            Provider references are for reconciliation only. Do not publish
            customer or worker payment records.
          </p>
        </>
      )}
    </section>
  );
}
