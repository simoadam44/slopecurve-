import { describe, it, expect } from "vitest";
import { resolvePublicRoute, isAssetLikePath, buildSeoDocument, fallbackShell, notFoundPage, faqJsonLd } from "../src/lib/seoDoc";
import type { SeoPage } from "../src/lib/seoDoc";
import { DEFAULT_HOME_GAME, homeGameSlug } from "../src/lib/home";
import { homeCanonical } from "../src/lib/seo";
import { LEGAL_SLUGS, PLACEHOLDER_CONTACT_EMAIL, legalPage } from "../src/lib/legal";

const BASE = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Old</title><meta name="description" content="Old"><link rel="canonical" href="https://old.example/"><script type="module" src="/assets/index-ABC123.js"></script></head><body><div id="root"></div></body></html>`;

const gamePage: SeoPage = {
  title: "Snow Road — Play Free Online | SlopeCurve",
  description: "Snow Road is an exciting snowboarding arcade game.",
  canonical: "https://slopecurve.com/games/snow-road",
  h1: "Snow Road",
  bodyHtml: "<p>Snow Road is an exciting snowboarding arcade game.</p>",
  jsonLd: JSON.stringify({ "@context": "https://schema.org", "@type": "VideoGame", name: "Snow Road" }),
  status: 200,
};

describe("homepage game", () => {
  it("defaults to slope-rider-2 when never configured", () => {
    expect(DEFAULT_HOME_GAME).toBe("slope-rider-2");
    expect(homeGameSlug({})).toBe("slope-rider-2");
  });
  it("uses the configured slug and allows an explicit blank to disable", () => {
    expect(homeGameSlug({ home_game_slug: "  wave-rider " })).toBe("wave-rider");
    expect(homeGameSlug({ home_game_slug: "" })).toBe("");
  });
  it("canonicalizes the homepage game to the site root", () => {
    expect(homeCanonical("https://slopecurve.com")).toBe("https://slopecurve.com/");
    expect(homeCanonical("https://slopecurve.com/")).toBe("https://slopecurve.com/");
  });
});

describe("resolvePublicRoute", () => {
  it("maps known public routes", () => {
    expect(resolvePublicRoute("/")).toEqual({ kind: "home" });
    expect(resolvePublicRoute("/games/snow-road")).toEqual({ kind: "game", slug: "snow-road" });
    expect(resolvePublicRoute("/categories/skiing-games")).toEqual({ kind: "category", slug: "skiing-games" });
    expect(resolvePublicRoute("/blog/how-to-play")).toEqual({ kind: "post", slug: "how-to-play" });
    expect(resolvePublicRoute("/about")).toEqual({ kind: "static", page: "about" });
  });
  it("returns null for admin/api/assets/unknown (caller decides 404/passthrough)", () => {
    expect(resolvePublicRoute("/admin")).toBeNull();
    expect(resolvePublicRoute("/api/games")).toBeNull();
    expect(resolvePublicRoute("/assets/index-x.js")).toBeNull();
    expect(resolvePublicRoute("/games/")).toBeNull();
  });
  it("maps single root segments to landing pages but never reserves app routes", () => {
    expect(resolvePublicRoute("/snow-rider-unblocked")).toEqual({ kind: "landing", slug: "snow-rider-unblocked" });
    expect(resolvePublicRoute("/no-such-page")).toEqual({ kind: "landing", slug: "no-such-page" });
    expect(resolvePublicRoute("/games")).toEqual({ kind: "games" });
    expect(resolvePublicRoute("/blog")).toEqual({ kind: "blog" });
    for (const reserved of ["admin", "api", "assets", "search", "login", "404"]) {
      expect(resolvePublicRoute(`/${reserved}`)).toBeNull();
    }
  });
});

describe("legal pages", () => {
  it("resolves the canonical legal routes and keeps them out of the landing namespace", () => {
    expect(resolvePublicRoute("/privacy-policy")).toEqual({ kind: "legal", page: "privacy-policy" });
    expect(resolvePublicRoute("/terms-of-use")).toEqual({ kind: "legal", page: "terms-of-use" });
    expect(resolvePublicRoute("/contact")).toEqual({ kind: "legal", page: "contact" });
    expect(resolvePublicRoute("/privacy")).toEqual({ kind: "static", page: "privacy" });
    expect(resolvePublicRoute("/terms")).toEqual({ kind: "static", page: "terms" });
  });
  it("provides unique titles, descriptions and one H1 per page", () => {
    const titles = new Set<string>();
    for (const slug of LEGAL_SLUGS) {
      const p = legalPage(slug);
      expect(p.title.length).toBeGreaterThan(10);
      expect(p.description.length).toBeGreaterThan(50);
      expect(p.description.length).toBeLessThanOrEqual(200);
      expect(p.bodyHtml).not.toMatch(/<h1/i);
      titles.add(p.title);
    }
    expect(titles.size).toBe(3);
  });
  it("covers the required privacy topics without unverified analytics/ads claims", () => {
    const html = legalPage("privacy-policy").bodyHtml;
    for (const topic of ["IP address", "Comments", "Cookies", "third-party", "retention", "security", "Children", "International", "Effective date"]) {
      expect(html.toLowerCase()).toContain(topic.toLowerCase());
    }
    expect(html).toMatch(/No analytics service is enabled/i);
    expect(html).toMatch(/disabled by default/i);
  });
  it("flags unknown contact details instead of inventing an address", () => {
    const placeholder = legalPage("contact");
    expect(placeholder.bodyHtml).toContain(PLACEHOLDER_CONTACT_EMAIL);
    expect(placeholder.bodyHtml).toMatch(/Placeholder address/i);
    const configured = legalPage("contact", "team@example.com");
    expect(configured.bodyHtml).toContain('href="mailto:team@example.com"');
    expect(configured.bodyHtml).not.toContain(PLACEHOLDER_CONTACT_EMAIL);
    expect(legalPage("contact", "not-an-email").bodyHtml).toContain(PLACEHOLDER_CONTACT_EMAIL);
  });
  it("renders server-side HTML with the page H1 and canonical", () => {
    const html = buildSeoDocument(BASE, {
      ...legalPage("terms-of-use"),
      canonical: "https://slopecurve.com/terms-of-use",
      status: 200,
    });
    expect(html).toContain("<title>Terms of Use | SlopeCurve</title>");
    expect(html).toContain('rel="canonical" href="https://slopecurve.com/terms-of-use"');
    expect(html).toContain("<h1>Terms of Use</h1>");
    expect(html).not.toContain('name="robots" content="noindex"');
  });
});

describe("FAQ JSON-LD", () => {
  it("extracts visible h3/p pairs", () => {
    const ld = faqJsonLd("<h3>Is it free?</h3><p>Yes &amp; no downloads.</p>");
    expect(ld?.["@type"]).toBe("FAQPage");
    const items = (ld as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }).mainEntity;
    expect(items[0].name).toBe("Is it free?");
    expect(items[0].acceptedAnswer.text).toBe("Yes & no downloads.");
  });
  it("returns null when no question/answer pairs exist", () => {
    expect(faqJsonLd("<p>No questions here.</p>")).toBeNull();
    expect(faqJsonLd("")).toBeNull();
  });
});

describe("buildSeoDocument", () => {
  it("injects title/desc/canonical/H1/content/JSON-LD and keeps hashed assets", () => {
    const html = buildSeoDocument(BASE, gamePage);
    expect(html).toContain("<title>Snow Road — Play Free Online | SlopeCurve</title>");
    expect(html).toContain('name="description" content="Snow Road is an exciting snowboarding arcade game."');
    expect(html).toContain('rel="canonical" href="https://slopecurve.com/games/snow-road"');
    expect(html).toContain("<h1>Snow Road</h1>");
    expect(html).toContain('"@type":"VideoGame"');
    expect(html).toContain('src="/assets/index-ABC123.js"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
  });
  it("never references dev-only paths", () => {
    expect(buildSeoDocument(BASE, gamePage)).not.toContain("/src/main.tsx");
    expect(fallbackShell(gamePage)).not.toContain("/src/main.tsx");
  });
  it("is UA-independent by construction (no UA parameter exists)", () => {
    const a = buildSeoDocument(BASE, gamePage);
    const b = buildSeoDocument(BASE, gamePage);
    expect(a).toBe(b);
    expect("userAgent" in gamePage).toBe(false);
  });
  it("escapes hostile titles", () => {
    const html = buildSeoDocument(BASE, { ...gamePage, title: '"><script>alert(1)</script>' });
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});

describe("isAssetLikePath", () => {
  it("passes dev/vite/client/static file paths through to assets", () => {
    expect(isAssetLikePath("/assets/index-ABC.js")).toBe(true);
    expect(isAssetLikePath("/src/main.tsx")).toBe(true);
    expect(isAssetLikePath("/@vite/client")).toBe(true);
    expect(isAssetLikePath("/@react-refresh")).toBe(true);
    expect(isAssetLikePath("/favicon.svg")).toBe(true);
    expect(isAssetLikePath("/logo.png")).toBe(true);
  });
  it("treats page-like paths as routable (SSR or 404)", () => {
    expect(isAssetLikePath("/games/snow-road")).toBe(false);
    expect(isAssetLikePath("/no-such-page")).toBe(false);
    expect(isAssetLikePath("/admin")).toBe(false);
  });
});

describe("404 pages", () => {
  it("missing content maps to status 404 + noindex + home link, no DB details", () => {
    const p = notFoundPage("https://slopecurve.com", "Game");
    expect(p.status).toBe(404);
    expect(p.noindex).toBe(true);
    expect(p.bodyHtml).toContain('href="/"');
    expect(p.bodyHtml).not.toContain("slopecurve.com");
    expect(JSON.stringify(p)).not.toMatch(/SQLITE|D1_|stack|Error/);
    const html = buildSeoDocument(BASE, p);
    expect(html).toContain('name="robots" content="noindex"');
  });
});
