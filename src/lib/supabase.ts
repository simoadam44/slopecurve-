import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client for the admin dashboard.
 *
 * Only the public anon key is used here (it is designed to be shipped to browsers);
 * every request it makes is additionally checked by RLS on the Supabase side and by
 * the Worker on our side. The service-role key never reaches the browser.
 *
 * Configure with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time.
 * When they are missing the dashboard stays closed and the login page says so
 * (fail-closed, exactly like a server that refuses every admin request).
 *
 * The library is imported lazily so public pages never pay for admin-only code.
 */

const SUPABASE_URL = String(import.meta.env?.VITE_SUPABASE_URL ?? "").trim();
const SUPABASE_ANON_KEY = String(import.meta.env?.VITE_SUPABASE_ANON_KEY ?? "").trim();

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;
let loading: Promise<SupabaseClient | null> | null = null;

/** Shared client, or null when this build has no Supabase configuration. */
export async function getSupabase(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured) return null;
  if (client) return client;
  if (!loading) {
    loading = import("@supabase/supabase-js")
      .then(({ createClient }) => {
        client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            // The session is persisted in this origin's localStorage and refreshed in the
            // background, so a reload does not sign the administrator out. The key is
            // namespaced to avoid clashing with anything else on the domain.
            storageKey: "slopecurve-admin-auth",
            persistSession: true,
            autoRefreshToken: true,
            // We never use Supabase-hosted magic links, so nothing needs parsing from the URL.
            detectSessionInUrl: false,
          },
        });
        return client;
      })
      .catch(() => null);
  }
  return loading;
}

/**
 * Current access token, refreshed when it is about to expire.
 * Returns null when there is no session (or Supabase is not configured).
 */
export async function currentAccessToken(): Promise<string | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) return null;
    const expiresAt = Number(session.expires_at ?? 0) * 1000;
    if (expiresAt && expiresAt - Date.now() < 60_000 && session.refresh_token) {
      const refreshed = await supabase.auth.refreshSession();
      const next = refreshed.data.session;
      if (next?.access_token) return next.access_token;
    }
    return session.access_token ?? null;
  } catch {
    return null;
  }
}

/** Clears the local session. Server-side revocation is not required for a Bearer JWT. */
export async function signOutAdmin(): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch {
    /* a network failure must not trap the user inside the dashboard */
  }
}

/** Human-readable, non-leaking message for a failed sign-in. */
export function signInErrorMessage(message: string): string {
  const text = String(message || "").toLowerCase();
  if (text.includes("invalid login credentials")) return "Wrong email or password.";
  if (text.includes("email not confirmed")) return "Confirm your email address first, then sign in.";
  if (text.includes("rate limit") || text.includes("too many")) return "Too many attempts. Wait a minute and try again.";
  if (text.includes("fetch") || text.includes("network")) return "Could not reach the authentication server. Check your connection and try again.";
  return "Sign-in failed. Check your email and password.";
}
