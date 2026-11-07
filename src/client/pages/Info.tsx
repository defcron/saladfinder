import { countryName } from "../region";
import { displayLabel } from "../locale";
import { PlanComparison } from "../billing";
import { transactionFee, PLANS, type Plan } from "../../shared/pricing";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Wallet,
  ListChecks,
  Handshake,
  CircleCheck,
} from "lucide-react";
import { feeFor, money, post, type Role } from "../api";
import { useApp } from "../context";
import {
  ActionFeedback,
  Alert,
  PageHeading,
  PreviewNotice,
  Turnstile,
  useAction,
} from "../components";
const removalKey = "daywork-waitlist-removal";
function savedRemoval() {
  try {
    return (
      new URLSearchParams(window.location.hash.slice(1)).get("remove") ||
      localStorage.getItem(removalKey) ||
      ""
    );
  } catch {
    return "";
  }
}
export function Waitlist() {
  const { config } = useApp();
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [role, setRole] = useState<Role>("worker");
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [joined, setJoined] = useState(false);
  const [removalToken, setRemovalToken] = useState(savedRemoval);
  const [manage, setManage] = useState(() =>
    new URLSearchParams(window.location.hash.slice(1)).has("remove"),
  );
  const [copied, setCopied] = useState(false);
  const action = useAction();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void action.run(async () => {
      try {
        const result = await post<{
          ok: boolean;
          message?: string;
          removalToken?: string;
        }>("/waitlist", {
          email,
          city,
          role,
          consent: true,
          turnstileToken: token,
        });
        setJoined(true);
        setRemovalToken(result.removalToken || "");
        if (result.removalToken) {
          setRemovalToken(result.removalToken);
          try {
            localStorage.setItem(removalKey, result.removalToken);
          } catch {
            /* The saved link remains available to copy. */
          }
        }
      } finally {
        setToken("");
        setResetKey((v) => v + 1);
      }
    });
  };
  const remove = () =>
    void action.run(async () => {
      await post("/waitlist/remove", { token: removalToken });
      try {
        localStorage.removeItem(removalKey);
      } catch {
        /* Storage is optional. */
      }
      setRemovalToken("");
      setManage(false);
      setJoined(false);
      window.history.replaceState({}, "", window.location.pathname);
    }, "Your early-access signup has been removed. You can join again whenever you’re ready.");
  const link = removalToken
    ? `${window.location.origin}/early-access#remove=${encodeURIComponent(removalToken)}`
    : "";
  return (
    <section className="page-wrap narrow">
      <PageHeading
        title={
          manage
            ? "Your early-access signup."
            : joined
              ? "You’re on the list."
              : "Find work in your community."
        }
      >
        <p>
          {manage
            ? "You’re in control of your signup. Use your private link to remove it at any time."
            : joined
              ? config?.launchMode === "preview"
                ? "Thanks for your interest. We’re preparing the marketplace before opening real jobs and payments."
                : "Thanks for your interest. Jobs and payments are live now — browse listings or post work today."
              : config?.launchMode === "preview"
                ? "Be first to hear when SaladFinder opens near you. Tell us a little about what you’re looking for."
                : "Jobs and payments are live now. Join the list to hear about new work near you."}
        </p>
      </PageHeading>
      <ActionFeedback {...action} />
      {manage ? (
        <div className="form-stack">
          <p>
            Removing your signup deletes your email, city, and interest from the
            early-access list. It does not delete a separate SaladFinder
            account.
          </p>
          {removalToken ? (
            <button
              className="button button-outline"
              disabled={action.busy}
              onClick={remove}
            >
              {action.busy ? "Removing…" : "Remove my early-access signup"}
            </button>
          ) : (
            <Alert>
              Your removal link is missing. Open the full private link you saved
              when joining.
            </Alert>
          )}
          <Link to="/" className="text-link">
            Back to SaladFinder <ArrowRight size={17} />
          </Link>
        </div>
      ) : joined ? (
        <div className="confirmation">
          <CheckCircle2 size={38} strokeWidth={1.5} />
          <h2>Good work takes a little preparation.</h2>
          <p>
            Joining is free. It doesn’t reserve a job, promise earnings, or
            create a payment account.
          </p>
          {removalToken ? (
            <div className="removal-note">
              <h3>Keep your private removal link.</h3>
              <p>
                Use it to remove your signup, even before account sign-in opens.
                We also remember it in this browser. Keep it private.
              </p>
              <div className="action-row">
                <button
                  className="button button-outline"
                  onClick={() =>
                    void action.run(async () => {
                      await navigator.clipboard.writeText(link);
                      setCopied(true);
                    })
                  }
                >
                  <Copy size={16} />
                  {copied ? "Link copied" : "Copy removal link"}
                </button>
                <button className="text-button" onClick={() => setManage(true)}>
                  Manage signup
                </button>
              </div>
              <details>
                <summary>Show removal link</summary>
                <a className="break-word" href={link}>
                  {link}
                </a>
              </details>
            </div>
          ) : (
            <p className="small-text">
              For an existing signup, use the original private removal link.
            </p>
          )}
          <Link className="text-link" to="/">
            Explore example jobs <ArrowRight size={17} />
          </Link>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <label>
            Your email
            <input
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            City or locality
            <input
              required
              minLength={1}
              maxLength={80}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              autoComplete="address-level2"
              placeholder="e.g., Toronto"
            />
          </label>
          <fieldset className="form-fieldset">
            <legend>I’m interested in</legend>
            <div className="choice-row">
              {(
                [
                  ["worker", "Finding work"],
                  ["poster", "Hiring help"],
                  ["both", "Both"],
                ] as const
              ).map(([value, label]) => (
                <label className="choice" key={value}>
                  <input
                    type="radio"
                    name="waitlist-role"
                    checked={role === value}
                    onChange={() => setRole(value)}
                  />
                  {displayLabel(label)}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="choice consent">
            <input type="checkbox" required />
            <span>
              I’m 18 or older and agree to be contacted about SaladFinder’s
              marketplace launch. I’ve read the{" "}
              <Link to="/privacy">Privacy notice</Link> and can withdraw using
              my private removal link.
            </span>
          </label>
          <Turnstile
            action="waitlist"
            siteKey={config?.turnstileSiteKey || ""}
            onToken={setToken}
            resetKey={resetKey}
          />
          <button
            className="button"
            disabled={action.busy || (!!config?.turnstileSiteKey && !token)}
          >
            {action.busy ? "Saving your interest…" : "Join early access"}
            <ArrowRight size={18} />
          </button>
          <p className="small-text">
            {config?.launchMode === "preview"
              ? "No jobs or payments are available in this preview. Your signup is stored; no confirmation email is sent at this stage."
              : "Your signup is stored; no confirmation email is sent at this stage."}
          </p>
          {removalToken && (
            <button
              type="button"
              className="text-button"
              onClick={() => setManage(true)}
            >
              Manage my existing signup
            </button>
          )}
        </form>
      )}
    </section>
  );
}
export function Pricing() {
  const { config } = useApp();
  const [posterPlan, setPosterPlan] = useState<Plan>("standard");
  const [workerPlan, setWorkerPlan] = useState<Plan>("standard");
  const [pay, setPay] = useState("100");
  const [count, setCount] = useState("1");
  const dollars = Number(pay);
  const cents = Math.round(dollars * 100);
  const validPay =
    dollars >= 25 && dollars <= 5000 && Math.abs(dollars * 100 - cents) < 1e-8;
  const amount = validPay ? cents : 0;
  const milestones = Math.max(1, Math.min(5, Number(count) || 1));
  const fee =
    transactionFee(
      amount,
      "poster",
      config?.pricingEnabled ? posterPlan : "legacy",
    ) * milestones;
  const workerFees =
    transactionFee(
      amount,
      "worker",
      config?.pricingEnabled ? workerPlan : "legacy",
    ) * milestones;
  const worker = amount * milestones;
  return (
    <section className="page-wrap">
      <PageHeading title="A fair day’s work. A clear price.">
        <p>
          {config?.pricingEnabled
            ? "See the client total and worker net earnings before agreeing to work. Each participant’s own plan determines their fees."
            : "Workers keep the listed pay. Clients cover a straightforward service fee when they pay a milestone."}
        </p>
      </PageHeading>
      <section className="content-section" id="payout-regions">
        <h2>Where workers can get paid</h2>
        <p>
          Post and apply only in the enabled regions listed below. Paid hiring depends on the worker’s
          payout country and Stripe eligibility. All agreements and
          subscriptions use Canadian dollars.
        </p>
        <p>
          <strong>Available payout countries</strong>
          {" · "}
          {(config?.workerPayoutCountries || ["CA"])
            .map(countryName)
            .join(", ")}
        </p>
      </section>
      {config?.pricingEnabled && <PlanComparison />}
      <div className="pricing-layout">
        <section className="pricing-story">
          <div className="big-price">
            {config?.pricingEnabled ? "14.9%" : "12%"} <span>+ $1 CAD</span>
          </div>
          <p className="lead">per paid milestone, with a $3 CAD minimum fee.</p>
          <p>
            {config?.pricingEnabled
              ? "Standard poster pricing. Browsing, posting and applications are free. Worker fees and optional subscriptions are listed above. Both parties see their fee before agreeing to work."
              : "No fee to browse or post. No worker platform fee. No subscription to remember. The client sees the full payment total before going to Stripe."}
          </p>
          <ul className="check-list">
            <li>
              <CircleCheck size={20} />
              The job price is the worker’s gross pay.
            </li>
            <li>
              <CircleCheck size={20} />
              SaladFinder’s fee is added to the client’s total.
            </li>
            <li>
              <CircleCheck size={20} />
              Pay in agreed stages, or once on completion.
            </li>
            <li>
              <CircleCheck size={20} />
              No added worker fee for requesting a payout.
            </li>
          </ul>
          <p className="small-text">
            Workers remain responsible for their own taxes and business
            expenses.
          </p>
        </section>
        <aside className="calculator">
          <h2>Try the numbers.</h2>
          <p>This illustration uses equally sized milestones.</p>
          <div className="form-grid">
            <label>
              Worker pay per milestone (CAD)
              <input
                type="number"
                min="25"
                max="5000"
                step="0.01"
                value={pay}
                onChange={(e) => setPay(e.target.value)}
              />
            </label>
            <label>
              Number of milestones
              <select value={count} onChange={(e) => setCount(e.target.value)}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          {config?.pricingEnabled && (
            <div className="form-stack">
              <label>
                Poster plan
                <select
                  aria-label="Poster plan"
                  value={posterPlan}
                  onChange={(e) => setPosterPlan(e.target.value as Plan)}
                >
                  {Object.entries(PLANS).map(([id, p]) => (
                    <option key={id} value={id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Worker plan
                <select
                  aria-label="Worker plan"
                  value={workerPlan}
                  onChange={(e) => setWorkerPlan(e.target.value as Plan)}
                >
                  {Object.entries(PLANS).map(([id, p]) => (
                    <option key={id} value={id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {validPay ? (
            <dl className="price-breakdown">
              <div>
                <dt>Worker receives</dt>
                <dd>{money(worker - workerFees)}</dd>
              </div>
              <div>
                <dt>Poster service fee</dt>
                <dd>{money(fee)}</dd>
              </div>
              {config?.pricingEnabled && (
                <div>
                  <dt>Worker service fee (deducted)</dt>
                  <dd>{money(workerFees)}</dd>
                </div>
              )}
              <div className="total">
                <dt>Client total</dt>
                <dd>{money(worker + fee)} CAD</dd>
              </div>
            </dl>
          ) : (
            <p role="status">
              Enter a milestone amount from $25 to $5,000 CAD with up to two
              decimal places to see the estimate.
            </p>
          )}
          <p className="small-text">
            Excludes monthly subscriptions and any applicable taxes. Job
            maximum: $5,000 CAD in gross worker pay. Final amounts are
            calculated for each milestone, so rounding can differ if you split
            the total unevenly.
          </p>
          {worker > 500000 && (
            <Alert>
              The illustrated worker total exceeds the $5,000 CAD job limit.
            </Alert>
          )}
        </aside>
      </div>
      <section className="content-section info-band">
        <h2>Fast payments need honest expectations.</h2>
        <p>
          Your client’s payment and your bank payout are separate.{" "}
          {config?.instantPayoutsEnabled
            ? "Canadian Instant Payouts require a supported debit card, an eligible Stripe account and balance, and platform availability."
            : "Instant Payouts: Coming later. They are currently disabled."}{" "}
          Standard bank payouts follow settlement and banking timelines.
        </p>
        <Link className="text-link" to="/how-it-works#payments">
          See the payment journey <ArrowRight size={18} />
        </Link>
      </section>
    </section>
  );
}
export function HowItWorks() {
  const { config } = useApp();
  return (
    <section className="page-wrap">
      <PageHeading title="Good work, agreed from the start.">
        <p>
          A practical way for neighbours to find help and for workers to find
          their next job.
        </p>
      </PageHeading>
      <PreviewNotice />
      <div className="how-steps">
        {[
          {
            Icon: ListChecks,
            title: "1. Make the work clear.",
            body: "Clients describe the job, location, price, and payment stages. Workers browse by city and category, then apply with relevant experience.",
          },
          {
            Icon: Handshake,
            title: "2. Choose each other.",
            body: "The client chooses a worker. Use job messages to agree on access, timing, tools, and what a finished milestone looks like before any work starts.",
          },
          {
            Icon: Wallet,
            title: "3. Approve. Pay. Keep going.",
            body: "The worker submits a completed milestone. The client approves it and pays through Stripe. Repeat for the next stage, or finish with one completion payment.",
          },
        ].map(({ Icon, title, body }) => (
          <section key={title}>
            <Icon size={30} strokeWidth={1.4} />
            <h2>{displayLabel(title)}</h2>
            <p>{displayLabel(body)}</p>
          </section>
        ))}
      </div>
      <section id="payments" className="content-section payment-journey">
        <h2>From completed work to your bank.</h2>
        <p className="lead">
          There are four different states. We show them separately because
          “paid” shouldn’t leave you guessing.
        </p>
        <ol className="journey-list">
          <li>
            <h3>Client payment confirmed</h3>
            <p>
              After approval, the client pays the milestone. A successful Stripe
              confirmation records the payment. Returning from checkout alone
              doesn’t mark it paid.
            </p>
          </li>
          <li>
            <h3>Funds become available</h3>
            <p>
              Stripe may hold funds pending settlement or review. Your account
              shows your available and pending balances.
            </p>
          </li>
          <li>
            <h3>Payout requested</h3>
            <p>
              {config?.instantPayoutsEnabled
                ? "Instant Payout is selected when your Stripe account and balance are eligible. You can choose a standard bank payout instead. Canadian Instant Payouts use supported debit cards linked to bank accounts."
                : "Request a standard bank payout once your Stripe account and available funds are eligible. Instant Payouts: Coming later; currently disabled."}{" "}
              Canadian workers request their payouts here. Where cross-border
              payouts are available, Stripe handles local bank settlement and
              the payout schedule. SaladFinder adds no worker payout fee.
            </p>
          </li>
          <li>
            <h3>Money arrives</h3>
            <p>
              {config?.instantPayoutsEnabled &&
                "Stripe describes eligible instant payouts as typically arriving within 30 minutes. Delays, limits, and eligibility checks still apply. "}
              Standard bank payouts follow Stripe’s processing and your bank’s
              timing. Initial payouts can take longer. No particular arrival day
              is guaranteed.
            </p>
          </li>
        </ol>
        <Alert kind="info">
          SaladFinder does not guarantee same-day bank arrival, wages,
          employment, or advance funding. Work is not prepaid or held in escrow.
          A client’s approval does not itself move money.
        </Alert>
        <a
          className="text-link"
          href="https://docs.stripe.com/connect/instant-payouts"
          target="_blank"
          rel="noreferrer"
        >
          Read Stripe’s payout requirements <ExternalLink size={16} />
        </a>
      </section>
      <section className="info-band">
        <h2>Start with a small, clear job.</h2>
        <p>
          Our initial categories are cleaning, yard work, moving help, furniture
          assembly, and general help. Regulated trades, driving and delivery,
          hazardous work, and employment placement are outside this initial
          offering.
        </p>
        <div className="action-row">
          <Link className="button" to="/">
            Find work
            <ArrowRight size={17} />
          </Link>
          <Link className="button button-outline" to="/post">
            Post a job
          </Link>
        </div>
      </section>
    </section>
  );
}
function Contact() {
  const { config } = useApp();
  return config?.supportEmail ? (
    <p>
      Contact the operator at{" "}
      <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>. Do
      not send passwords, payment credentials, or identification documents.
    </p>
  ) : (
    <p>
      A staffed support contact will be published before accounts and paid jobs
      open. Early-access participants can remove their own signup using the
      private removal link provided when joining. Keep that link; do not post
      personal details in a public issue.
    </p>
  );
}
export function InfoPage({ kind }: { kind: "trust" | "terms" | "privacy" }) {
  const { config } = useApp();
  return (
    <article className="page-wrap prose">
      <PageHeading
        title={
          kind === "trust"
            ? "A little care goes a long way."
            : kind === "terms"
              ? "Terms, in plain language."
              : "Your information, thoughtfully handled."
        }
      >
        <p>
          {kind === "trust"
            ? "Practical expectations for safer local work."
            : kind === "terms"
              ? "Terms · effective November 4, 2026"
              : "Privacy notice · effective November 4, 2026"}
        </p>
      </PageHeading>
      {kind === "trust" ? (
        <>
          <h2>Meet the work before committing.</h2>
          <p>
            Read the description and ask about tools, access, physical demands,
            and hazards. Keep the scope and agreed price in job messages. If the
            work changes, pause and reach an agreement before continuing.
          </p>
          <h2>Know what verification means.</h2>
          <p>
            Stripe verifies payment-account information for its own
            requirements. That is not a background check, skills certification,
            reference check, or guarantee of safety. SaladFinder does not
            currently provide insurance or certify workers.
          </p>
          <h2>Keep payments and sensitive details where they belong.</h2>
          <p>
            Pay through the job’s Stripe checkout. Enter bank and card details
            only on Stripe’s hosted pages. Do not send identification documents,
            passwords, or card numbers in job messages. Share a street address
            only after choosing a worker and when needed to do the job.
          </p>
          <h2>Work within safe limits.</h2>
          <p>
            No regulated electrical, gas, structural, medical, childcare,
            security, or other licensed professional work. No dangerous goods,
            illegal services, sexual services, weapons, discriminatory requests,
            or work involving minors. Ride-share, delivery, courier work, and
            employment placement are outside the initial scope.
          </p>
          <h2>Raise a problem early.</h2>
          <p>
            Signed-in participants can report a job from its detail page. A
            participant’s report pauses new payments requested through
            SaladFinder while the matter is reviewed. It does not freeze funds
            already with Stripe or stop previously scheduled payouts. A report
            is not a promise of a refund. If you’re in immediate danger, stop
            work and contact local emergency services.
          </p>
          <Contact />
        </>
      ) : kind === "terms" ? (
        <>
          <Alert kind="info">
            {config?.launchMode === "preview"
              ? config.listingsReady
                ? "Posting and applications are open. Hiring, starting work and payments are not available yet. Example listings cannot be booked."
                : "SaladFinder is in prelaunch preview. Example listings cannot be booked, and real payments are disabled."
              : "Read the job agreement and payment total before accepting work or making a payment."}
          </Alert>
          <h2>Who the service is for</h2>
          <p>
            SaladFinder is operated by Jeremy Carter as a sole proprietor in
            Ontario, Canada. You must be at least 18. Workers and posters must
            be locally permitted to offer, perform or hire for the work they
            agree to. These terms cover accounts, profiles, listings,
            applications and enabled work and payment features. An application
            expresses interest; it does not hire a worker or authorize work to
            start. The poster must hire the worker through the job page before
            the worker starts the agreed work.
          </p>
          <h2>Early access</h2>
          <p>
            Joining the list is free and optional. It records your interest and
            consent to launch communications. It does not reserve work,
            guarantee access, promise income, establish employment, or create a
            Stripe account. You can withdraw and remove your signup using your
            private removal link.
          </p>
          <h2>Acceptable use</h2>
          <p>
            Use accurate information that you have the right to share. Do not
            impersonate anyone, scrape personal data, interfere with the
            service, submit abusive content, or use it for unlawful activity.
            Access may be limited to protect participants and the service.
          </p>
          <h2>Work agreements and payments</h2>
          <p>
            Clients and workers agree on the scope, worker pay, and milestones.
            Workers submit completed work; clients approve and pay. The pricing
            page lists current poster and worker fees. Poster fees are added to
            the client payment and worker fees are deducted from gross earnings.
            Fees are shown before posting or applying and retained for that
            agreement, including older jobs at their original rates. Payment and
            payout processing is provided by Stripe under its applicable terms.
          </p>
          <p>
            Standard bank payouts are scheduled daily and typically reach the
            worker’s bank about 7 days after the payout is requested. Instant
            payouts are not available yet.
          </p>
          <p>
            Approval is not payment. Payment is not confirmation that a bank has
            received a payout. Work is not held in escrow, guaranteed, or funded
            in advance. A worker’s tax obligations and expenses remain separate
            from the listed gross pay.
          </p>
          <h2>Optional monthly subscriptions</h2>
          <p>
            Economy is CA$10/month and Premium is CA$25/month, where available,
            plus applicable taxes. Both renew monthly until canceled through
            account billing management. Each subscription changes only that
            account’s fees for future postings and applications. Existing
            agreements keep their recorded rates. Cancellation at period end
            retains the paid term; failed renewals or billing risk can suspend
            discounts. Subscription refunds are reviewed by support subject to
            applicable rights. Unlimited postings and applications remain
            subject to anti-abuse rate limits. No plan guarantees savings, jobs
            or earnings.
          </p>
          <h2>Disputes and cancellations</h2>
          <p>
            Signed-in users can report a problem through the job page. A poster
            can cancel an open listing, and applicants can withdraw pending
            applications. Cancellation of booked work depends on the job and
            payment state. Paid work requires review before a refund. A refund
            is subject to the circumstances, applicable rights, and Stripe
            processing; a request does not automatically establish entitlement.
          </p>
          <h2>Availability and changes</h2>
          <p>
            The service may change or be unavailable. We do not promise job
            availability, earnings, suitability of a participant, or same-day
            bank arrival. These terms do not waive rights that cannot lawfully
            be waived.
          </p>
          <h2>Contact and privacy</h2>
          <Contact />
          <p>
            See the <Link to="/privacy">Privacy notice</Link> for what the
            service collects and how to manage your records.
          </p>
        </>
      ) : (
        <>
          <h2>Information we collect</h2>
          <p>
            If you join early access, we store your email address, city or
            locality, whether you want to find work or hire help, your consent
            timestamp, and the signup time. We also store a cryptographic hash
            of a private removal token. The private token is shown to you and
            saved in your browser so you can remove the signup later.
          </p>
          <p>
            Cloudflare’s security systems process technical information, such as
            IP address, browser information, and challenge results. The service
            uses short-lived rate-limit records and operational logs to limit
            abuse and diagnose failures. SaladFinder does not collect card
            details, bank credentials, or government identification.
          </p>
          <h2>Why we use it</h2>
          <p>
            We use early-access signup information to plan the marketplace
            launch, understand demand by city, and provide launch communications
            when that system is available. Early-access signup does not send a
            confirmation email. Account sign-in is separate and sends the
            requested sign-in link through the configured email provider. We do
            not sell your signup information.
          </p>
          <h2>Providers and storage</h2>
          <p>
            The app, database and automatic interface translations use
            Cloudflare. Your language preference is saved in your browser. Job
            descriptions, private messages and sign-in links are excluded from
            translation requests. Data may be processed outside Canada under the
            provider’s infrastructure and terms. Cloudflare Turnstile helps
            protect forms against abuse. Stripe collects payment and
            payout-account information on its own hosted pages. We store Stripe
            account and transaction references, amounts, payment and payout
            statuses, and reconciliation records to operate payments, handle
            refunds and investigate disputes. The public frontend and
            application API are hosted on Cloudflare Workers and Static Assets.
            The configured
            transactional email provider handles sign-in links and essential
            account messages. Business-mail forwarding routes support requests
            to the operator’s inbox.
          </p>
          <h2>Your choices</h2>
          <p>
            Joining is optional. The success screen provides a private removal
            link, and we remember it in this browser when browser storage is
            available. Open it or use “Manage my existing signup” on the{" "}
            <Link to="/early-access">early-access page</Link> to remove your
            email, city, and interest from the list. Keep the link private:
            anyone who has it can remove that signup. Clearing browser storage
            does not remove the server record.
          </p>
          <p>
            If you submit an email already on the list, we do not disclose its
            information or replace its removal token. Use the original removal
            link. Signup information is retained until removal or until the
            early-access list is no longer needed. Operational and backup copies
            may persist for their normal retention period.
          </p>
          <h2>Accounts, listings and applications</h2>
          <p>
            Accounts use verified email sign-in links and secure session
            cookies. We store your name, email, chosen role, profile, skills,
            consent records, listings and applications to operate enabled
            features. Public job descriptions, general locations and poster
            names are visible to visitors. Applications and applicant profile
            information are shown to the poster and authorised administration.
            Private job conversations are limited to participants and authorised
            administration, and reviews are visible with the job. Do not put
            sensitive personal information in listings or profiles.
          </p>
          <p>
            Your account page lets you download your records and revoke active
            sessions. Contact the operator about correction or removal of
            account data; operational, dispute or legal retention requirements
            may apply. Job drafts and a pending payout request reference may be
            saved in this tab’s session storage so navigation or a lost response
            does not lose your work. This browser storage does not authorize a
            payment; the server verifies the account, amount and request.
          </p>
          <h2>Contact the operator</h2>
          <Contact />
          <h2>Provider information</h2>
          <p>
            <a
              href="https://www.cloudflare.com/privacypolicy/"
              target="_blank"
              rel="noreferrer"
            >
              Cloudflare’s privacy policy
            </a>{" "}
            explains its processing.{" "}
            <a
              href="https://stripe.com/privacy"
              target="_blank"
              rel="noreferrer"
            >
              Stripe’s privacy policy
            </a>{" "}
            applies to its payment services.
          </p>
        </>
      )}
    </article>
  );
}
