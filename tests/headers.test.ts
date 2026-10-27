import { describe, it, expect } from "vitest";
import { cacheControlFor, isAdminPath, isAssetPassthrough, securityHeaders } from "../src/lib/security";

const SITE = new URL("https://slopecurve.com/games/snow-road");

describe("security headers", () => {
  it("uses strict production script and frame policies", () => {
    const h = securityHeaders(SITE, ["azgames.io", "example.com"]);
    expect(h["Content-Security-Policy"]).toContain("script-src 'self'");
    expect(h["Content-Security-Policy"]).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(h["Content-Security-Policy"]).toContain("base-uri 'self'");
    expect(h["Content-Security-Policy"]).toContain("form-action 'self'");
    expect(h["Content-Security-Policy"]).toContain("https://azgames.io");
    expect(h["Content-Security-Policy"]).toContain("https://*.azgames.io");
    expect(h["Content-Security-Policy"]).toContain("https://example.com");
    expect(h["Content-Security-Policy"]).not.toContain("frame-src https:;");
    expect(h["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
    expect(h["X-Frame-Options"]).toBe("DENY");
  });

  it("relaxes only scripts for local Vite and never sends HSTS over http", () => {
    const local = securityHeaders(new URL("http://localhost:5173/"), [], true);
    expect(local["Content-Security-Policy"]).toMatch(/script-src[^;]*unsafe-inline/);
    expect(local["Strict-Transport-Security"]).toBeUndefined();
  });

  it("adds the Supabase origin to connect-src so admin sign-in is not blocked by CSP", () => {
    const h = securityHeaders(SITE, ["azgames.io"], false, ["https://abcdefgh.supabase.co"]);
    const csp = h["Content-Security-Policy"];
    expect(csp).toContain("connect-src 'self' https://abcdefgh.supabase.co;");
    // Still strict: scripts stay same-origin only.
    expect(csp).toMatch(/script-src 'self'(;| )/);
  });

  it("keeps connect-src self-only when no extra origin is configured", () => {
    const csp = securityHeaders(SITE, [], false)["Content-Security-Policy"];
    expect(csp).toContain("connect-src 'self';");
  });
});

describe("cache policy", () => {
  it("never caches admin, auth, API, or search responses", () => {
    expect(cacheControlFor("/admin")).toContain("no-store");
    expect(cacheControlFor("/admin/games")).toContain("no-store");
    expect(cacheControlFor("/api/admin/me")).toContain("no-store");
    expect(cacheControlFor("/api/comments")).toContain("no-store");
    expect(cacheControlFor("/games?q=snow")).toContain("no-store");
  });

  it("uses immutable caching for hashed assets and revalidation for HTML", () => {
    expect(cacheControlFor("/assets/index-abc123.js")).toContain("immutable");
    expect(cacheControlFor("/games/snow-road")).toContain("must-revalidate");
  });
});

describe("path classification", () => {
  it("treats admin and admin API routes as privileged", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/games")).toBe(true);
    expect(isAdminPath("/api/admin/me")).toBe(true);
    expect(isAdminPath("/games")).toBe(false);
  });

  it("only passes known static assets through and blocks sensitive files", () => {
    expect(isAssetPassthrough("/assets/index-abc.js")).toBe(true);
    expect(isAssetPassthrough("/favicon.svg")).toBe(true);
    expect(isAssetPassthrough("/thumb.webp")).toBe(true);
    expect(isAssetPassthrough("/index.html")).toBe(false);
    expect(isAssetPassthrough("/.dev.vars")).toBe(false);
    expect(isAssetPassthrough("/.env")).toBe(false);
    expect(isAssetPassthrough("/source.js.map")).toBe(false);
    expect(isAssetPassthrough("/random.html")).toBe(false);
  });
});
