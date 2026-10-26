import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { adminFetch, setAdminCsrfToken } from "../../lib/adminApi";
import { safeAdminNext } from "../../lib/adminRoute";
import { useDocumentMeta, useRobots } from "../../components/Layout";

type AuthState = "checking" | "signed-in" | "signed-out";

/**
 * Admin entry point (/admin/login).
 *
 * Authentication is Cloudflare Access (Zero Trust) in production and an explicit
 * local-only bypass in development. There is no site password store, so this page
 * never collects credentials: it verifies the current session and either continues
 * to the dashboard or explains how to sign in.
 */
export function AdminLogin() {
  const [params] = useSearchParams();
  const next = safeAdminNext(params.get("next"));
  const [state, setState] = useState<AuthState>("checking");
  const [email, setEmail] = useState("");
  const [isLocal, setIsLocal] = useState(false);
  const [problem, setProblem] = useState("");

  useDocumentMeta("Admin sign in | SlopeCurve", "Sign in to the SlopeCurve admin dashboard.");
  useRobots("noindex, nofollow");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    setIsLocal(host === "localhost" || host === "127.0.0.1" || host === "::1");
  }, []);

  const check = useCallback(async () => {
    setState("checking");
    setProblem("");
    try {
      const r = await adminFetch("/api/admin/me", { headers: { accept: "application/json" } });
      if (!r.ok) {
        // The server explains configuration problems (503) instead of a bare 401.
        let detail = "";
        try {
          const body = (await r.json()) as { error?: string; code?: string };
          if (body.code === "access_not_configured" || body.code === "access_team_unreachable") detail = String(body.error || "");
        } catch {
          /* non-JSON body: keep the generic message */
        }
        setProblem(detail);
        setState("signed-out");
        return;
      }
      const data = (await r.json()) as { email?: string; csrf?: string };
      if (data.csrf) setAdminCsrfToken(data.csrf);
      setEmail(String(data.email || ""));
      setState("signed-in");
    } catch {
      setState("signed-out");
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  if (state === "signed-in") return <Navigate to={next} replace />;

  const accessHref = `/cdn-cgi/access/login?redirect_url=${encodeURIComponent(next)}`;

  return (
    <div style={{ maxWidth: 620, margin: "40px auto" }}>
      <div className="card" style={{ padding: 22 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "1.6rem" }}>Admin sign in</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          SlopeCurve admin access is protected by <strong>Cloudflare Access</strong> (Zero Trust).
          There is no separate site password or account store.
        </p>

        {state === "checking" ? (
          <p aria-live="polite">Checking access…</p>
        ) : (
          <>
            <p aria-live="polite" style={{ margin: "0 0 12px" }}>
              {email ? `Signed in as ${email}.` : "You are not signed in yet."}
            </p>
            {problem ? (
              <p className="small" role="alert" style={{ margin: "0 0 12px", color: "#fca5a5" }}>
                {problem}
              </p>
            ) : null}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a className="btn" href={accessHref}>Continue with Cloudflare Access</a>
              <button className="btn-secondary btn" type="button" onClick={check}>Check access again</button>
              <Link className="btn-secondary btn" to="/">Back to site</Link>
            </div>

            {isLocal ? (
              <p className="small muted" style={{ marginBottom: 0 }}>
                Local development: access is granted automatically when <code>ENVIRONMENT</code> is not
                <code> production</code> and <code>LOCAL_DEV_AUTH=true</code> in <code>.dev.vars</code>, while the site
                is opened on localhost. Change the value, restart <code>npm run dev</code>, then use
                “Check access again”.
              </p>
            ) : null}
          </>
        )}

        <details className="small muted" style={{ marginTop: 16 }}>
          <summary>Can’t get in?</summary>
          <ul style={{ marginBottom: 0 }}>
            <li>Production: the browser must complete Cloudflare Access with an email listed in <code>ADMIN_EMAILS</code>.</li>
            <li>Required secrets: <code>ACCESS_TEAM_DOMAIN</code>, <code>ACCESS_AUD</code>, <code>ADMIN_EMAILS</code>, <code>CSRF_SECRET</code>.</li>
            <li>No password is stored by the app, so a forgotten password is reset in your identity provider, not here.</li>
            <li>To end the session, use the <em>Logout</em> button in the admin header.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
