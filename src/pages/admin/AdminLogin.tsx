import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { adminFetch, setAdminCsrfToken } from "../../lib/adminApi";
import { safeAdminNext } from "../../lib/adminRoute";
import { getSupabase, signInErrorMessage, signOutAdmin, supabaseConfigured } from "../../lib/supabase";
import { useDocumentMeta, useRobots } from "../../components/Layout";

type AuthState = "checking" | "signed-in" | "signed-out";

/**
 * Admin entry point (/admin and /admin/login).
 *
 * Authentication is Supabase Auth (email + password). The page signs in with
 * `supabase.auth.signInWithPassword`, keeps the returned session in this origin's
 * storage, and then asks the Worker (`/api/admin/me`) whether that session belongs
 * to an administrator. A valid session without the admin role is signed out again
 * and reported here, so a non-admin account can never reach the dashboard.
 */
export function AdminLogin() {
  const [params] = useSearchParams();
  const next = safeAdminNext(params.get("next"));
  const [state, setState] = useState<AuthState>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [isLocal, setIsLocal] = useState(false);

  useDocumentMeta("Admin sign in | SlopeCurve", "Sign in to the SlopeCurve admin dashboard.");
  useRobots("noindex, nofollow");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    setIsLocal(host === "localhost" || host === "127.0.0.1" || host === "::1");
  }, []);

  /** Confirms with the Worker that the current session is a real admin session. */
  const check = useCallback(async (): Promise<boolean> => {
    setState("checking");
    setProblem("");
    try {
      const r = await adminFetch("/api/admin/me", { headers: { accept: "application/json" } });
      if (!r.ok) {
        let detail = "";
        let notAdmin = false;
        try {
          const body = (await r.json()) as { error?: string; code?: string };
          notAdmin = body.code === "not_admin";
          detail = String(body.error || "");
        } catch {
          /* non-JSON body: keep the generic message */
        }
        if (notAdmin) {
          // Signed in, but the account is not an administrator: drop the session.
          await signOutAdmin();
          setProblem(detail || "This account is signed in but is not an administrator.");
        }
        setState("signed-out");
        return false;
      }
      const data = (await r.json()) as { email?: string; csrf?: string };
      if (data.csrf) setAdminCsrfToken(data.csrf);
      setSignedInAs(String(data.email || ""));
      setState("signed-in");
      return true;
    } catch {
      setState("signed-out");
      return false;
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setProblem("");
    const supabase = await getSupabase();
    if (!supabase) {
      setProblem("Supabase is not configured for this build. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setProblem(signInErrorMessage(error.message));
        return;
      }
      setPassword("");
      // The session is valid; the Worker decides whether it may enter /admin.
      const ok = await check();
      if (!ok) {
        // check() already reported the reason (including "not an administrator").
        setProblem((current) => current || "This account cannot access the admin dashboard.");
      }
    } catch {
      setProblem("Sign-in failed. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "signed-in") return <Navigate to={next} replace />;

  const configured = supabaseConfigured;

  return (
    <div style={{ maxWidth: 620, margin: "40px auto" }}>
      <div className="card" style={{ padding: 22 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "1.6rem" }}>Admin sign in</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Sign in with your SlopeCurve administrator account. Only accounts with the
          administrator role can open the dashboard.
        </p>

        {state === "checking" ? (
          <p aria-live="polite">Checking your session…</p>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
              <label htmlFor="admin-email" style={{ display: "grid", gap: 4 }}>
                <span>Email</span>
                <input
                  id="admin-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  style={{ padding: "8px 10px", borderRadius: 8 }}
                />
              </label>
              <label htmlFor="admin-password" style={{ display: "grid", gap: 4 }}>
                <span>Password</span>
                <input
                  id="admin-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  style={{ padding: "8px 10px", borderRadius: 8 }}
                />
              </label>
            </div>

            {problem ? (
              <p className="small" role="alert" style={{ margin: "0 0 12px", color: "#fca5a5" }}>
                {problem}
              </p>
            ) : null}
            {!configured ? (
              <p className="small" role="status" style={{ margin: "0 0 12px", color: "#fcd34d" }}>
                This build has no Supabase configuration, so sign-in cannot work yet.
              </p>
            ) : null}
            {signedInAs ? (
              <p className="small muted" aria-live="polite" style={{ margin: "0 0 12px" }}>
                Signed in as {signedInAs}.
              </p>
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" type="submit" disabled={busy || !configured}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
              <button className="btn-secondary btn" type="button" onClick={() => void check()} disabled={busy}>
                Check session again
              </button>
              <Link className="btn-secondary btn" to="/">Back to site</Link>
            </div>
          </form>
        )}

        <details className="small muted" style={{ marginTop: 16 }}>
          <summary>Can’t get in?</summary>
          <ul style={{ marginBottom: 0 }}>
            <li>
              Accounts live in Supabase Auth. Create the administrator there (Authentication → Users) and
              mark it as an admin with <code>app_metadata.role = &quot;admin&quot;</code>, by adding the email to
              <code> SUPABASE_ADMIN_EMAILS</code>, or with a <code>profiles</code> row whose <code>role</code> is
              <code> admin</code>.
            </li>
            <li>
              Required Worker secrets: <code>SUPABASE_URL</code>, <code>SUPABASE_JWT_SECRET</code> (or
              <code> SUPABASE_ANON_KEY</code>), <code>CSRF_SECRET</code>.
            </li>
            <li>Passwords are managed by Supabase, not stored by this site. Ask the site owner to reset one.</li>
            <li>Use the <em>Log out</em> button in the admin header to end the session.</li>
          </ul>
        </details>

        {isLocal ? (
          <p className="small muted" style={{ marginBottom: 0 }}>
            Local development: admin access is granted automatically when <code>ENVIRONMENT</code> is not
            <code> production</code> and <code>LOCAL_DEV_AUTH=true</code> in <code>.dev.vars</code>, while the site
            is opened on localhost. Change the value, restart <code>npm run dev</code>, then use
            “Check session again”.
          </p>
        ) : null}
      </div>
    </div>
  );
}
