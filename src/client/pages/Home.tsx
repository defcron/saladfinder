import { displayLabel, locale } from "../locale";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { MapPin, Search, ArrowRight } from "lucide-react";
import { api, categories, examples, type Job } from "../api";
import { useApp } from "../context";
import { Alert, Empty, JobRow, Loading, PreviewNotice } from "../components";
import { CountrySelect } from "../region";
export function Home() {
  const { config } = useApp();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "",
    city = params.get("city") || "",
    category = params.get("category") || "",
    schedule = params.get("schedule") || "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [keyword, setKeyword] = useState(q);
  const [location, setLocation] = useState(city);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const query = params.toString();
  useEffect(() => {
    setKeyword(q);
    setLocation(city);
  }, [q, city]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<{ jobs: Job[]; total: number }>(`/jobs?${query}`)
      .then((data) => {
        if (active) {
          setJobs(data.jobs);
          setTotal(data.total);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, retry]);
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    next.delete("page");
    setParams(next);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams(params);
    keyword.trim() ? next.set("q", keyword.trim()) : next.delete("q");
    location.trim() ? next.set("city", location.trim()) : next.delete("city");
    next.delete("page");
    setParams(next);
  };
  const showExamples =
    config?.launchMode === "preview" && !config.listingsReady && total === 0;
  const visible = showExamples
    ? examples.filter(
        (j) =>
          (!q ||
            `${j.title} ${j.description}`
              .toLowerCase()
              .includes(q.toLowerCase())) &&
          (!city || j.city.toLowerCase().includes(city.toLowerCase())) &&
          (!category || j.category === category) &&
          (!schedule || j.payment_schedule === schedule),
      )
    : jobs;
  return (
    <div className="page-wrap home">
      <picture className="brand-banner">
        <source media="(max-width: 600px)" srcSet="/brand/banner-art.webp" />
        <img
          src="/brand/banner.webp"
          width="1500"
          height="500"
          fetchPriority="high"
          alt="Neighbours helping with moving, furniture assembly and garden work"
        />
      </picture>
      <section className="hero branded-hero">
        <div>
          <h1>
            Good work.
            <br />A shorter wait for payday.
          </h1>
          <p>
            Find local jobs and agree on milestones. Post and apply in supported Stripe Connect regions.
            Check payout availability for your country before arranging paid
            work.
          </p>
        </div>
        <aside className="ontario-note">
          <MapPin size={29} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <h2>Where you can work</h2>
            <Link to="/pricing#payout-regions">Check payout availability</Link>
            <p>
              {config?.pricingEnabled
                ? "CAD payments · Clear fees before you agree"
                : "CAD payments · No worker platform fee"}
            </p>
          </div>
        </aside>
      </section>
      <PreviewNotice />
      <form className="search-bar" onSubmit={submit} role="search">
        <div className="search-input">
          <Search size={23} aria-hidden="true" />
          <input
            aria-label="Search for work"
            placeholder="Search for work (e.g., cleanup, moving, assembly)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            maxLength={100}
          />
        </div>
        <div className="search-input">
          <MapPin size={23} aria-hidden="true" />
          <input
            aria-label="City or locality"
            placeholder="City or locality"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={80}
          />
        </div>
        <button className="button" type="submit">
          Find work
        </button>
      </form>
      <div className="market-layout">
        <aside className="filter-rail" aria-label="Filter jobs">
          <CountrySelect allowed={config?.workerPayoutCountries || ["CA"]}
            all
            value={params.get("country") || ""}
            onChange={(value) => change("country", value)}
          />
          <fieldset>
            <legend>Job category</legend>
            {["All work", ...categories].map((label) => (
              <label className="choice" key={label}>
                <input
                  type="checkbox"
                  checked={
                    label === "All work" ? !category : category === label
                  }
                  onChange={() =>
                    change(
                      "category",
                      label === "All work" || category === label ? "" : label,
                    )
                  }
                />
                <span>{displayLabel(label)}</span>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Payment schedule</legend>
            {[
              ["", "Any schedule"],
              ["completion", "On completion"],
              ["milestones", "In milestones"],
            ].map(([value, label]) => (
              <label className="choice" key={value}>
                <input
                  type="radio"
                  name="schedule"
                  value={value}
                  checked={schedule === value}
                  onChange={() => change("schedule", value)}
                />
                <span>{displayLabel(label)}</span>
              </label>
            ))}
          </fieldset>
          {(q || city || category || schedule || params.has("country")) && (
            <button className="text-button" onClick={() => setParams({})}>
              Clear all filters
            </button>
          )}
        </aside>
        <section className="work-list" aria-label="Job results">
          <div className="list-heading">
            <h2>Work, on your terms</h2>
            {!loading && !error && (
              <p className="results-label">
                {showExamples ? (
                  "Example listings · not available to book"
                ) : (
                  <>
                    {displayLabel("Available jobs")} ·{" "}
                    {new Intl.NumberFormat(locale).format(total)}
                  </>
                )}
              </p>
            )}
          </div>
          {loading ? (
            <Loading label="Finding work…" />
          ) : error ? (
            <>
              <Alert>{error}</Alert>
              <button
                className="button button-outline"
                onClick={() => setRetry((v) => v + 1)}
              >
                Try again
              </button>
            </>
          ) : visible.length ? (
            <div className="job-list">
              {visible.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </div>
          ) : (
            <Empty title="Nothing here just yet.">
              <p>
                {config?.listingsReady
                  ? "No open jobs match this search. Try another city or category, or post the work you need help with."
                  : "Try another city or category, or be first to hear when jobs open near you."}
              </p>
              <Link
                to={config?.listingsReady ? "/post" : "/early-access"}
                className="text-link"
              >
                {config?.listingsReady ? "Post a job" : "Join early access"}{" "}
                <ArrowRight size={18} />
              </Link>
            </Empty>
          )}
          {!showExamples && total > 20 && (
            <div className="pagination">
              <button
                className="button button-outline"
                disabled={page === 1}
                onClick={() => {
                  const n = new URLSearchParams(params);
                  n.set("page", String(page - 1));
                  setParams(n);
                }}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                className="button button-outline"
                disabled={page * 20 >= total}
                onClick={() => {
                  const n = new URLSearchParams(params);
                  n.set("page", String(page + 1));
                  setParams(n);
                }}
              >
                Next
              </button>
            </div>
          )}
          <p className="payout-note">
            {config?.instantPayoutsEnabled
              ? "Instant payouts depend on Stripe eligibility. Standard bank payouts are scheduled daily and typically arrive about 7 days after the payout is requested."
              : "Instant Payouts: Coming later. Standard bank payouts are scheduled daily and typically arrive about 7 days after the payout is requested."}{" "}
            <Link to="/how-it-works#payments">How payments work</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
