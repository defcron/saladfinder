import { subscribeLocale, localeVersion } from "./locale";
import { useSyncExternalStore, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "./context";
import { Layout, Loading, Alert, RequireUser, PageHeading } from "./components";
import { Home } from "./pages/Home";
import { SignIn, Verify } from "./pages/Auth";
import { PostJob, JobPage } from "./pages/Jobs";
import { Dashboard, Account, Admin } from "./pages/Account";
import { Waitlist, Pricing, HowItWorks, InfoPage } from "./pages/Info";
import "./styles.css";
function App() {
  useSyncExternalStore(subscribeLocale, localeVersion);
  const { loading, error, reload } = useApp();
  return (
    <Layout>
      {loading ? (
        <Loading label="Getting SaladFinder ready…" />
      ) : error ? (
        <div className="page-wrap narrow">
          <Alert>{error}</Alert>
          <button className="button" onClick={reload}>
            Try again
          </button>
        </div>
      ) : (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/auth/verify" element={<Verify />} />
          <Route path="/post" element={<PostJob />} />
          <Route path="/post-a-job" element={<Navigate to="/post" replace />} />
          <Route path="/jobs/:id" element={<JobPage />} />
          <Route
            path="/dashboard"
            element={
              <RequireUser>
                <Dashboard />
              </RequireUser>
            }
          />
          <Route
            path="/account"
            element={
              <RequireUser>
                <Account />
              </RequireUser>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireUser>
                <Admin />
              </RequireUser>
            }
          />
          <Route path="/early-access" element={<Waitlist />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/trust" element={<InfoPage kind="trust" />} />
          <Route path="/trust-safety" element={<Navigate to="/trust" replace />} />
          <Route path="/terms" element={<InfoPage kind="terms" />} />
          <Route path="/privacy" element={<InfoPage kind="privacy" />} />
          <Route
            path="*"
            element={
              <div className="page-wrap narrow">
                <PageHeading title="This page has moved on.">
                  <p>There’s more good work to find.</p>
                </PageHeading>
                <Link className="button" to="/">
                  Find work
                </Link>
              </div>
            }
          />
        </Routes>
      )}
    </Layout>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
