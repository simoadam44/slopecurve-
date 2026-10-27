import { currentAccessToken } from "./supabase";

let csrfToken = "";

export function setAdminCsrfToken(token: string): void {
  csrfToken = token;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Every admin API call goes through here:
 *  - `Authorization: Bearer <supabase access token>` proves the session to the Worker,
 *  - `x-csrf-token` (subject-bound, short-lived) is kept as defence in depth for mutations.
 * No cookies are involved, so there is no ambient credential for a cross-site request to reuse.
 */
export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = String(init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers);
  const token = await currentAccessToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (!SAFE_METHODS.has(method) && csrfToken) headers.set("x-csrf-token", csrfToken);
  return fetch(input, { ...init, headers, credentials: "same-origin" });
}
