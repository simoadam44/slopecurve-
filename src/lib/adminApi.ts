let csrfToken = "";

export function setAdminCsrfToken(token: string): void {
  csrfToken = token;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = String(init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!SAFE_METHODS.has(method) && csrfToken) headers.set("x-csrf-token", csrfToken);
  return fetch(input, { ...init, headers, credentials: "same-origin" });
}
