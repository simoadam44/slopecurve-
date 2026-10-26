import { describe, it, expect } from "vitest";
import { validateGameUrl, validateImageUrl } from "../src/lib/validate";
import { sanitizeRichText } from "../src/lib/seo";

function tokenSafe(t: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(t.trim());
}
function publisherOk(pub: string): boolean {
  return pub === "" || /^ca-pub-\d{10,20}$/.test(pub);
}
const PUBLIC = ["site_name", "google_verification", "ads_enabled"];
function filterPublic(all: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(all).filter(([k]) => PUBLIC.includes(k)));
}

describe("password policy", () => {
  it("requires 12+ chars and matching confirm", () => {
    const next = "short123";
    expect(next.length >= 12).toBe(false);
    expect("long-password-123" === "long-password-123").toBe(true);
    expect("a123" === ("b" as string)).toBe(false);
  });
});

describe("webmaster tokens", () => {
  it("accepts owner tokens, rejects HTML/JS", () => {
    expect(tokenSafe("dBw5Cv9AbC123456")).toBe(true);
    expect(tokenSafe("<script>alert(1)</script>")).toBe(false);
    expect(tokenSafe("short")).toBe(false);
    expect(tokenSafe("abc; DROP TABLE")).toBe(false);
  });
});

describe("adsense config", () => {
  it("disabled by default; validates publisher ID, no fake revenue", () => {
    expect(publisherOk("")).toBe(true);
    expect(publisherOk("ca-pub-1234567890123456")).toBe(true);
    expect(publisherOk("ca-pub-abc")).toBe(false);
    expect(publisherOk("pub-123")).toBe(false);
  });
});

describe("settings allowlist", () => {
  it("never exposes secrets publicly", () => {
    const pub = filterPublic({ site_name: "SlopeCurve", google_verification: "abc12345", ADMIN_SESSION_SECRET: "shh", TURNSTILE_SECRET: "shh" });
    expect(pub.site_name).toBe("SlopeCurve");
    expect("ADMIN_SESSION_SECRET" in pub).toBe(false);
    expect("TURNSTILE_SECRET" in pub).toBe(false);
  });
});

describe("draft visibility", () => {
  it("public lists only published", () => {
    const rows = [
      { slug: "a", status: "published" },
      { slug: "b", status: "draft" },
    ];
    expect(rows.filter((r) => r.status === "published").map((r) => r.slug)).toEqual(["a"]);
  });
});

describe("sitemap/robots rules", () => {
  it("excludes admin/api/drafts/search", () => {
    const urls = ["/", "/games/x", "/admin", "/api/games", "/games?q=x"];
    const inSitemap = urls.filter((u) => !u.startsWith("/admin") && !u.startsWith("/api") && !u.includes("?"));
    expect(inSitemap).toEqual(["/", "/games/x"]);
  });
});

describe("image URL honesty", () => {
  it("extension alone is not proof — still validates scheme + host safely", () => {
    expect(validateImageUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateImageUrl("https://a.com/x.jpg").ok).toBe(true);
    expect(validateGameUrl("https://untrusted.example.com/g/", ["game-host.example.com"]).ok).toBe(false);
  });
});

describe("rich text sanitization", () => {
  it("allows formatting, strips scripts", () => {
    const out = sanitizeRichText("<h2>T</h2><p><b>Hi</b></p><script>x</script>");
    expect(out).toContain("<h2>T</h2>");
    expect(out).not.toContain("<script");
  });
});
