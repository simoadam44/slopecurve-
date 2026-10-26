// Pure helpers for admin sign-in redirects (shared by the login page and RequireAuth).
// Keeping this environment-free makes the open-redirect guard unit-testable.

export const ADMIN_LOGIN_PATH = "/admin/login";

/** Only same-site admin paths may be used as a post-login destination. */
export function safeAdminNext(raw: unknown): string {
  const value = String(raw ?? "").trim();
  const isAdminTarget = value === "/admin" || value.startsWith("/admin/") || value.startsWith("/admin?");
  if (!isAdminTarget) return "/admin";
  // Reject protocol-relative URLs and backslash tricks (browsers normalize "\" to "/").
  if (value.startsWith("//") || value.includes("\\")) return "/admin";
  // Never bounce back to the login page itself.
  if (value === ADMIN_LOGIN_PATH || value.startsWith(`${ADMIN_LOGIN_PATH}?`)) return "/admin";
  return value;
}

/** Current location (pathname + search) expressed as a safe post-login target. */
export function currentAdminNext(pathname: string, search = ""): string {
  return safeAdminNext(`${String(pathname || "")}${String(search || "")}`);
}

/** Login URL that returns the visitor to `next` after a successful sign-in. */
export function adminLoginHref(next: unknown): string {
  const target = safeAdminNext(next);
  return target === "/admin" ? ADMIN_LOGIN_PATH : `${ADMIN_LOGIN_PATH}?next=${encodeURIComponent(target)}`;
}
