const SAFE_ASSET_EXT = /\.(?:css|js|mjs|webp|png|jpe?g|gif|svg|ico|woff2?|ttf|otf)$/i;
const SAFE_ROOT_ASSETS = new Set(["/favicon.svg", "/favicon.ico", "/fallback.svg", "/robots.txt"]);

export function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/admin/") || path === "/api/admin";
}

export function isAssetPassthrough(path: string): boolean {
  if (!path || path.includes("\0") || path.includes("\\") || path.includes("..")) return false;
  if (SAFE_ROOT_ASSETS.has(path)) return true;
  if (path.startsWith("/assets/")) return SAFE_ASSET_EXT.test(path);
  return /^\/[a-z0-9._/-]+$/i.test(path) && SAFE_ASSET_EXT.test(path);
}

export function cacheControlFor(path: string): string {
  const [pathname, search = ""] = path.split("?", 2);
  if (isAdminPath(pathname) || pathname.startsWith("/api/") || search) return "no-store";
  if (pathname.startsWith("/assets/") || SAFE_ASSET_EXT.test(pathname)) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=0, must-revalidate";
}

export function securityHeaders(url: URL, gameHosts: string[], forceLocal = false): Record<string, string> {
  const isLocal = forceLocal || url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const frameSrc = gameHosts.length
    ? gameHosts.flatMap((host) => {
        const h = host.trim().toLowerCase();
        if (!h) return [];
        return h.includes("*") ? [`https://${h}`] : [`https://${h}`, `https://*.${h}`];
      }).join(" ")
    : "'none'";
  const scriptSrc = isLocal ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'";
  const connectSrc = isLocal ? "connect-src 'self' https: ws: wss:" : "connect-src 'self'";
  const csp = [
    "default-src 'self'",
    "img-src 'self' https: data:",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    `frame-src ${frameSrc}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    connectSrc,
    ...(isLocal ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const headers: Record<string, string> = {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (!isLocal && url.protocol === "https:") {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}
