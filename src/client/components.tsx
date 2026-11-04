import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Info,
  Menu,
  X,
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";
import { useApp } from "./context";
import { post, money, type Job, readable } from "./api";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo ${small ? "logo-small" : ""}`}>
      <svg viewBox="0 0 48 36" aria-hidden="true">
        <path d="M0 26h12V16h12V6h18v9H30v10H18v10H0z" fill="currentColor" />
      </svg>
      <span>Daywork</span>
    </span>
  );
}
export function Layout({ children }: { children: ReactNode }) {
  const { user, refreshUser, config } = useApp();
  const [open, setOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
    document.getElementById("main")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const logout = async () => {
    try {
      await post("/auth/logout");
      await refreshUser();
      setOpen(false);
    } catch (e) {
      setLogoutError((e as Error).message);
    }
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link className="brand-link" to="/" aria-label="Daywork home">
          <Logo />
        </Link>
        <button
          className="mobile-menu button-quiet"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="primary-navigation"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X /> : <Menu />}
        </button>
        <nav
          id="primary-navigation"
          className={open ? "primary-nav open" : "primary-nav"}
          aria-label="Main navigation"
        >
          <div className="nav-links">
            <NavLink to="/" end>
              Find work
            </NavLink>
            <NavLink to="/how-it-works">How it works</NavLink>
            <NavLink to="/pricing">Pricing</NavLink>
            {user && <NavLink to="/dashboard">My work</NavLink>}
          </div>
          <div className="nav-actions">
            {user ? (
              <>
                <Link to="/account" className="button button-outline">
                  Account
                </Link>
                <button
                  className="button button-quiet logout-button"
                  onClick={logout}
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/sign-in" className="button button-outline">
                Sign in
              </Link>
            )}
            <Link className="button" to="/post">
              Post a job
            </Link>
          </div>
        </nav>
      </header>
      {logoutError && (
        <div className="page-wrap">
          <Alert>{logoutError}</Alert>
        </div>
      )}
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <Link to="/" className="brand-link" aria-label="Daywork home">
          <Logo small />
        </Link>
        <nav aria-label="Footer navigation">
          <Link to="/trust">Trust &amp; safety</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          {config?.supportEmail && (
            <a href={`mailto:${config.supportEmail}`}>Contact</a>
          )}
          {user?.is_admin && <Link to="/admin">Admin</Link>}
        </nav>
      </footer>
    </>
  );
}
export function Alert({
  children,
  kind = "error",
}: {
  children: ReactNode;
  kind?: "error" | "success" | "info";
}) {
  const Icon =
    kind === "error" ? AlertCircle : kind === "success" ? CheckCircle2 : Info;
  return (
    <div
      className={`alert alert-${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <Icon size={20} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={20} className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}
export function PageHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <h1>{title}</h1>
      {children && <div className="lead">{children}</div>}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function PreviewNotice() {
  const { config } = useApp();
  return config?.launchMode === "preview" ? (
    <div className="preview-notice">
      <Info size={23} aria-hidden="true" />
      <span>
        Launching in Ontario. <Link to="/early-access">Join early access</Link>{" "}
        while payments are being set up.
      </span>
    </div>
  ) : null;
}
export function Status({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{readable(value)}</span>;
}
export function JobRow({ job }: { job: Job }) {
  return (
    <Link to={`/jobs/${job.id}`} className="job-row">
      <div className="job-row-main">
        <h3>{job.title}</h3>
        <p>
          {job.city}
          <span aria-hidden="true"> · </span>
          {job.category}
        </p>
      </div>
      <div className="job-row-price">
        <strong>
          {money(job.budget_cents)} <span>CAD</span>
        </strong>
        <span>
          {job.payment_schedule === "milestones"
            ? job.id === "example-yard"
              ? "2 milestones"
              : "In milestones"
            : "On completion"}
        </span>
      </div>
      <ArrowRight size={24} aria-hidden="true" />
    </Link>
  );
}
export function RequireUser({ children }: { children: ReactNode }) {
  const { user, loading } = useApp();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user)
    return (
      <section className="page-wrap narrow">
        <PageHeading title="Let’s get you signed in.">
          <p>Use your email to access your jobs, applications, and payments.</p>
        </PageHeading>
        <Link
          className="button"
          to={`/sign-in?next=${encodeURIComponent(location.pathname)}`}
        >
          Sign in to continue <ArrowRight size={18} />
        </Link>
      </section>
    );
  return <>{children}</>;
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function run(fn: () => Promise<void>, message = "") {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await fn();
      if (message) setSuccess(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, success, run, setError, setSuccess };
}
export function ActionFeedback({
  error,
  success,
}: {
  error: string;
  success: string;
}) {
  return (
    <>
      {error && <Alert>{error}</Alert>}
      {success && <Alert kind="success">{success}</Alert>}
    </>
  );
}

type TurnstileAPI = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      theme: string;
      action: string;
    },
  ) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileAPI;
  }
}
export function Turnstile({
  siteKey,
  onToken,
  resetKey = 0,
  action = "auth",
}: {
  siteKey: string;
  onToken: (token: string) => void;
  resetKey?: number;
  action?: "auth" | "waitlist";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  useEffect(() => {
    if (!siteKey) return;
    let removed = false;
    let widget: string | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const render = () => {
      if (removed) return;
      if (window.turnstile && ref.current) {
        widget = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (t) => callback.current(t),
          "expired-callback": () => callback.current(""),
          "error-callback": () => callback.current(""),
          theme: "light",
          action,
        });
      } else {
        timer = setTimeout(render, 100);
      }
    };
    if (!document.querySelector("script[data-turnstile]")) {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.dataset.turnstile = "true";
      document.head.appendChild(script);
    }
    render();
    return () => {
      removed = true;
      clearTimeout(timer);
      if (widget && window.turnstile) window.turnstile.remove(widget);
    };
  }, [siteKey, resetKey, action]);
  return siteKey ? (
    <div
      className="verification"
      ref={ref}
      aria-label="Security verification"
    />
  ) : null;
}
