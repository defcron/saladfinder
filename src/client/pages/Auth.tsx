import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Mail } from "lucide-react";
import { post, type Role } from "../api";
import { useApp } from "../context";
import {
  ActionFeedback,
  Alert,
  Loading,
  PageHeading,
  Turnstile,
  useAction,
} from "../components";
export function SignIn() {
  const { config, user } = useApp();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("worker");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const action = useAction();
  const [params] = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
      ? next
      : "/dashboard";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      try {
        const response = await post<{ devToken?: string }>("/auth/request", {
          email,
          name: name.trim() || undefined,
          role,
          consent: true,
          turnstileToken: token,
        });
        setSent(true);
        setDevToken(response.devToken || "");
      } finally {
        setToken("");
        setResetKey((v) => v + 1);
      }
    });
  };
  return (
    <section className="page-wrap narrow">
      <PageHeading
        title={user ? "You’re signed in." : "Good work starts here."}
      >
        <p>
          {user
            ? "Your jobs, applications, and payments are in one place."
            : "Sign in or create an account with a secure link sent to your email. No password to remember."}
        </p>
      </PageHeading>
      {user ? (
        <Link to={safeNext} className="button">
          Continue <ArrowRight size={18} />
        </Link>
      ) : !config?.authReady ? (
        <>
          <Alert kind="info">
            We’re welcoming early-access signups. Account access will open
            before jobs go live.
          </Alert>
          <Link className="button" to="/early-access">
            Join early access <ArrowRight size={18} />
          </Link>
        </>
      ) : sent ? (
        <div className="confirmation">
          <Mail size={36} strokeWidth={1.4} />
          <h2>Check your inbox.</h2>
          <p>
            If a link could be sent to <strong>{email}</strong>, it will arrive
            shortly. Check your spam folder, too. The link expires after a short
            time and can be used once.
          </p>
          {devToken && (
            <Alert kind="info">
              Local development only:{" "}
              <Link to={`/auth/verify#token=${encodeURIComponent(devToken)}`}>
                Open your sign-in link
              </Link>
              . This link is never shown in production.
            </Alert>
          )}
          <button
            className="button button-outline"
            onClick={() => setSent(false)}
          >
            Use another email
          </button>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Your name <span className="optional">for new accounts</span>
            <input
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="What should we call you?"
            />
          </label>
          <fieldset className="form-fieldset">
            <legend>I’m here to</legend>
            <div className="choice-row">
              {(
                [
                  ["worker", "Find work"],
                  ["poster", "Hire help"],
                  ["both", "Both"],
                ] as const
              ).map(([value, label]) => (
                <label className="choice" key={value}>
                  <input
                    type="radio"
                    name="role"
                    value={value}
                    checked={role === value}
                    onChange={() => setRole(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="choice consent">
            <input type="checkbox" required />
            <span>
              I’m at least 18, and I agree to the <Link to="/terms">Terms</Link>{" "}
              and acknowledge the <Link to="/privacy">Privacy notice</Link>.
            </span>
          </label>
          <Turnstile
            siteKey={config.turnstileSiteKey}
            onToken={setToken}
            resetKey={resetKey}
          />
          <ActionFeedback {...action} />
          <button
            className="button"
            disabled={action.busy || (!!config.turnstileSiteKey && !token)}
          >
            {action.busy ? "Sending…" : "Email me a sign-in link"}
            <ArrowRight size={18} />
          </button>
          <p className="small-text">
            We use this email for your account and essential service messages.
            Early-access updates require separate consent.
          </p>
        </form>
      )}
    </section>
  );
}
export function Verify() {
  const { refreshUser } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    window.history.replaceState({}, "", window.location.pathname);
    if (!token) {
      setError("This sign-in link is incomplete. Please request a new one.");
      return;
    }
    void post("/auth/verify", { token })
      .then(refreshUser)
      .then(() => navigate("/dashboard", { replace: true }))
      .catch((e: Error) => setError(e.message));
  }, [navigate, refreshUser]);
  return (
    <div className="page-wrap narrow">
      <PageHeading
        title={error ? "Let’s try that again." : "Signing you in…"}
      />
      {error ? (
        <>
          <Alert>{error}</Alert>
          <Link className="button" to="/sign-in">
            Request a new sign-in link
          </Link>
        </>
      ) : (
        <Loading label="Verifying your secure link…" />
      )}
    </div>
  );
}
