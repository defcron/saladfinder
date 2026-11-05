import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, post, money, stripeRedirect } from "./api";
import { useApp } from "./context";
import { PLANS, type Plan } from "../shared/pricing";
import { Alert, ActionFeedback, useAction } from "./components";
export function PlanComparison() {
  return (
    <section className="content-section">
      <h2>Choose how you pay</h2>
      <p>
        Unlimited postings and applications on every plan. Subscriptions apply
        to your own fees when posting and working. Monthly charges are separate
        from milestone fees.
      </p>
      <div
        style={{ overflowX: "auto" }}
        tabIndex={0}
        role="region"
        aria-label="Subscription plan comparison"
      >
        <table>
          <thead>
            <tr>
              <th>Plan</th>
              <th>Monthly CAD</th>
              <th>Poster fee</th>
              <th>Worker fee</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(PLANS).map(([id, p]) => (
              <tr key={id}>
                <th>{p.name}</th>
                <td>{money(p.monthlyCents)}</td>
                <td>
                  {p.posterBps / 100}% + {money(p.fixedCents)}
                  {id === "standard"
                    ? " ($3 minimum)"
                    : id === "economy"
                      ? " ($1.50 minimum)"
                      : ""}
                </td>
                <td>
                  {p.workerBps / 100}% + {money(p.fixedCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small-text">
        Fees are per paid milestone, calculated on gross work value. The poster
        fee is added to the client payment; the worker fee is deducted from
        earnings. No additional SaladFinder fee is charged when requesting a
        payout. Monthly subscriptions renew until canceled. A paid plan may not
        save money at your volume; Premium’s fixed fee can be higher for small
        milestones. Rates use a fixed domestic-card pricing baseline, not a
        promise of exact Stripe cost reimbursement. Applicable taxes are
        separate.
      </p>
      <p className="small-text">
        Your poster plan is recorded when you publish a job; your worker plan is
        recorded when you apply. Changes apply to future postings and
        applications, not existing agreements. Older jobs keep their original
        pricing.
      </p>
      <Link className="button button-outline" to="/account">
        Manage your plan
      </Link>
    </section>
  );
}
type BillingStatus = {
  ready: boolean;
  plan: Plan;
  paidUntil: number;
  status: string;
  cancelAtPeriodEnd: boolean;
  blocked: boolean;
  canManage: boolean;
};
export function BillingPanel() {
  const { config } = useApp();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const action = useAction();
  useEffect(() => {
    let active = true;
    api<BillingStatus>("/billing/status")
      .then((s) => {
        if (active) {
          setStatus(s);
          setError("");
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  if (!config?.pricingEnabled) return null;
  const redirect = (path: string, body: object = {}) =>
    void action.run(async () => {
      const r = await post<{ url: string }>(path, body);
      stripeRedirect(r.url);
    });
  return (
    <section className="content-section">
      <h2>Your subscription</h2>
      <ActionFeedback {...action} />
      {error && <Alert>{error}</Alert>}
      {status ? (
        <>
          <p>
            Current fee plan: <strong>{PLANS[status.plan].name}</strong>.
            Billing status: {status.status}.
          </p>
          {status.paidUntil > 0 && (
            <p>
              {status.cancelAtPeriodEnd
                ? "Cancels"
                : "Current paid period ends"}{" "}
              {new Date(status.paidUntil * 1000).toLocaleDateString("en-CA")}.
              Benefits require successful renewal and apply to new
              postings/applications.
            </p>
          )}
          {status.blocked && (
            <Alert>
              Your billing account needs support review. Paid discounts are
              suspended.
            </Alert>
          )}
          {!status.ready && (
            <Alert kind="info">New subscriptions are not available yet.</Alert>
          )}
          <div className="action-row">
            {status.canManage && (
              <button
                className="button button-outline"
                disabled={action.busy}
                onClick={() => redirect("/billing/portal")}
              >
                Manage billing or cancel
              </button>
            )}
            {status.plan === "standard" &&
              ["economy", "premium"].map((p) => (
                <button
                  key={p}
                  className="button"
                  disabled={
                    action.busy ||
                    !status.ready ||
                    status.blocked ||
                    !["none", "canceled", "incomplete_expired"].includes(
                      status.status,
                    )
                  }
                  onClick={() => redirect("/billing/checkout", { plan: p })}
                >
                  Subscribe to {PLANS[p as Plan].name} ·{" "}
                  {money(PLANS[p as Plan].monthlyCents)}/month
                </button>
              ))}
            <button
              className="button button-outline"
              disabled={action.busy}
              onClick={() => setRevision((v) => v + 1)}
            >
              Refresh billing status
            </button>
          </div>
          <p>
            Checkout shows the recurring charge before you subscribe. Returning
            from Checkout does not activate a plan until payment is verified.
            Cancel through Stripe billing management; cancellation at period end
            retains the remaining paid term. New pricing applies to future
            agreements.
          </p>
        </>
      ) : (
        !error && <p>Loading billing status…</p>
      )}
      <PlanComparison />
    </section>
  );
}
