import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSeoDocument, fallbackShell, isSearchView, notFoundPage, resolveSocialImage, SITE_LANG } from "../src/lib/seoDoc";
import type { SeoPage } from "../src/lib/seoDoc";
import { sitemapLastmod, sitemapXml } from "../src/lib/sitemap";
import { articleJsonLd, breadcrumbJsonLd, organizationJsonLd, videoGameJsonLd, websiteJsonLd } from "../src/lib/schema";
import { checkQuality, mergeCandidates } from "../src/lib/aiContent";
import { LANDING_LANGUAGES, isLegacyLanguage, supportedSiteLanguage } from "../src/lib/landingTools";

const SITE = "https://slopecurve.com";
const SHELL = readFileSync("index.html", "utf8");

const page: SeoPage = {
  title: "Snow Road — Play Free Online | SlopeCurve",
  description: "Snow Road is a snowboarding arcade game you can play in the browser.",
  canonical: `${SITE}/games/snow-road`,
  h1: "Snow Road",
  bodyHtml: "<p>Snow Road is a snowboarding arcade game.</p>",
  status: 200,
};

function occurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("Phase 1 — English-only policy", () => {
  it("forces lang=en in the real shell and never emits hreflang", () => {
    const html = buildSeoDocument(SHELL, page);
    expect(SITE_LANG).toBe("en");
    expect(html).toContain('<html lang="en">');
    expect(html).not.toMatch(/hreflang/i);
    expect(html).not.toMatch(/rel="alternate"/i);
  });

  it("rewrites a wrong shell language instead of trusting it", () => {
    const shell = '<!doctype html><html lang="ar"><head><title>Old</title></head><body><div id="root"></div></body></html>';
    expect(buildSeoDocument(shell, page)).toContain('<html lang="en">');
  });

  it("uses lang=en in the no-assets fallback shell", () => {
    const html = fallbackShell(page);
    expect(html).toContain('<html lang="en">');
    expect(html).not.toMatch(/hreflang/i);
  });

  it("clamps new/admin language values to English while preserving legacy detection", () => {
    expect([...LANDING_LANGUAGES]).toEqual(["English"]);
    expect(supportedSiteLanguage("Arabic")).toBe("English");
    expect(supportedSiteLanguage("English")).toBe("English");
    expect(supportedSiteLanguage(undefined)).toBe("English");
    expect(isLegacyLanguage("Arabic")).toBe(true);
    expect(isLegacyLanguage("English")).toBe(false);
    expect(isLegacyLanguage("")).toBe(false);
  });
});

describe("Phase 2 — search views are noindex", () => {
  it("identifies search/filter views only on /games", () => {
    expect(isSearchView("/games", "?q=snow")).toBe(true);
    expect(isSearchView("/games", "?q=snow&sort=new")).toBe(true);
    expect(isSearchView("/games", "")).toBe(false);
    expect(isSearchView("/games", "?q=")).toBe(false);
    expect(isSearchView("/games/snow-road", "?q=snow")).toBe(false);
    expect(isSearchView("/blog", "?q=snow")).toBe(false);
  });

  it("emits exactly one noindex,follow directive in raw HTML", () => {
    const html = buildSeoDocument(SHELL, { ...page, robots: "noindex, follow" });
    expect(occurrences(html, '<meta name="robots"')).toBe(1);
    expect(html).toContain('<meta name="robots" content="noindex, follow">');
  });

  it("keeps canonical listings indexable and 404s noindex", () => {
    expect(buildSeoDocument(SHELL, page)).not.toContain('<meta name="robots"');
    const missing = buildSeoDocument(SHELL, notFoundPage(SITE, "Game"));
    expect(occurrences(missing, '<meta name="robots"')).toBe(1);
    expect(missing).toContain('<meta name="robots" content="noindex">');
  });
});

describe("Phase 3 — Open Graph / Twitter metadata", () => {
  const legacyShell = `<!doctype html><html lang="en"><head><title>Old</title><meta name="description" content="Old">
    <meta property="og:type" content="website"><meta property="og:title" content="Old">
    <meta property="og:description" content="Old"><meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="Old"><link rel="canonical" href="https://old.example/"></head>
    <body><div id="root"></div></body></html>`;

  it("strips legacy shell tags so each page emits one correct set", () => {
    const html = buildSeoDocument(legacyShell, page);
    expect(occurrences(html, 'property="og:title"')).toBe(1);
    expect(occurrences(html, 'property="og:description"')).toBe(1);
    expect(occurrences(html, 'property="og:type"')).toBe(1);
    expect(occurrences(html, 'property="og:url"')).toBe(1);
    expect(occurrences(html, 'name="twitter:card"')).toBe(1);
    expect(occurrences(html, 'name="twitter:title"')).toBe(1);
    expect(html).toContain('<meta property="og:title" content="Snow Road — Play Free Online | SlopeCurve">');
    expect(html).toContain(`<meta property="og:url" content="${SITE}/games/snow-road">`);
    expect(html).toContain('<meta property="og:type" content="website">');
    expect(html).not.toContain("Old</");
  });

  it("uses og:type=article only for articles", () => {
    const article = buildSeoDocument(SHELL, { ...page, canonical: `${SITE}/blog/guide`, og: { type: "article" } });
    expect(article).toContain('<meta property="og:type" content="article">');
    expect(buildSeoDocument(SHELL, page)).toContain('<meta property="og:type" content="website">');
  });

  it("honours stored og_title/og_description overrides", () => {
    const html = buildSeoDocument(SHELL, {
      ...page,
      og: { type: "website", title: "Custom social title", description: "Custom social description" },
    });
    expect(html).toContain('<meta property="og:title" content="Custom social title">');
    expect(html).toContain('<meta name="twitter:title" content="Custom social title">');
    expect(html).toContain('<meta property="og:description" content="Custom social description">');
  });

  it("resolves images with the required fallback order and rejects unsafe values", () => {
    const social = "https://cdn.example.com/social.jpg";
    const fallback = "/default-og.png";
    const thumb = "https://cdn.example.com/thumb.webp";

    expect(resolveSocialImage([social, fallback, thumb], SITE)).toBe(social);
    expect(resolveSocialImage(["javascript:alert(1)", fallback, thumb], SITE)).toBe(`${SITE}/default-og.png`);
    expect(resolveSocialImage(["data:image/png;base64,AAA", "not a url", thumb], SITE)).toBe(thumb);
    expect(resolveSocialImage([], SITE)).toBeNull();
    expect(resolveSocialImage(["http://insecure.example.com/a.jpg"], SITE)).toBeNull();
    expect(resolveSocialImage(["https://cdn.example.com/no-extension"], SITE)).toBeNull();
    expect(resolveSocialImage(["/local.png"], SITE)).toBe(`${SITE}/local.png`);
    expect(resolveSocialImage(["//cdn.example.com/a.jpg"], SITE)).toBeNull();
  });

  it("emits og:image/twitter:image only when a valid image exists", () => {
    const withImage = buildSeoDocument(SHELL, { ...page, og: { type: "website", image: "https://cdn.example.com/a.jpg" } });
    expect(withImage).toContain('<meta property="og:image" content="https://cdn.example.com/a.jpg">');
    expect(withImage).toContain('<meta name="twitter:image" content="https://cdn.example.com/a.jpg">');
    expect(withImage).toContain('<meta name="twitter:card" content="summary_large_image">');

    const withoutImage = buildSeoDocument(SHELL, page);
    expect(withoutImage).not.toContain('property="og:image"');
    expect(withoutImage).not.toContain('name="twitter:image"');
    expect(withoutImage).toContain('<meta name="twitter:card" content="summary">');
  });
});

describe("Phase 4 — sitemap lastmod", () => {
  it("prefers updated_at, falls back to published_at, and omits invalid values", () => {
    expect(sitemapLastmod("2026-02-03T04:05:06Z", "2026-01-01T00:00:00Z")).toBe("2026-02-03T04:05:06.000Z");
    expect(sitemapLastmod("not-a-date", "2026-01-01T00:00:00Z")).toBe("2026-01-01T00:00:00.000Z");
    expect(sitemapLastmod("", null)).toBeNull();
    expect(sitemapLastmod("2026-13-45 99:99:99", "2026-02-30")).toBeNull();
    expect(sitemapLastmod("2026-10-14 08:09:10", null)).toBe("2026-10-14T08:09:10.000Z");
  });

  it("writes valid XML with escaped locs and no invented lastmod", () => {
    const xml = sitemapXml([
      { loc: `${SITE}/games/a&b`, lastmod: "2026-02-03T04:05:06Z" },
      { loc: `${SITE}/blog/post`, lastmod: "nonsense" },
    ]);
    expect(xml).toContain("<loc>https://slopecurve.com/games/a&amp;b</loc>");
    expect(xml).toContain("<lastmod>2026-02-03T04:05:06.000Z</lastmod>");
    expect(occurrences(xml, "<lastmod>")).toBe(1);
    expect(xml).toContain("<loc>https://slopecurve.com/blog/post</loc></url>");
    expect(xml).not.toContain("undefined");
    expect(xml).not.toMatch(/\/admin|\/api\/|\?q=/);
  });
});

describe("Phase 5 — structured data", () => {
  it("tags the SSR JSON-LD block so hydration can replace it", () => {
    const html = buildSeoDocument(SHELL, { ...page, jsonLd: '{"@type":"VideoGame"}', jsonLdId: "game" });
    expect(occurrences(html, 'type="application/ld+json"')).toBe(1);
    expect(html).toContain('data-seo-jsonld="game"');
  });

  it("builds breadcrumbs with real positions and URLs", () => {
    const ld = breadcrumbJsonLd([
      { name: "Home", url: `${SITE}/` },
      { name: "Games", url: `${SITE}/games` },
      { name: "Snow Road", url: `${SITE}/games/snow-road` },
    ]);
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement.map((item) => item.position)).toEqual([1, 2, 3]);
    expect(ld.itemListElement[1].item).toBe(`${SITE}/games`);
  });

  it("includes only trustworthy Article fields", () => {
    const ld = articleJsonLd({
      headline: "How to play Snow Road",
      description: "A practical guide.",
      url: `${SITE}/blog/how-to-play-snow-road`,
      image: `${SITE}/cover.jpg`,
      datePublished: "2026-01-02 03:04:05",
      dateModified: "bogus",
      author: "  ",
      publisher: { name: "SlopeCurve", url: `${SITE}/` },
    });
    expect(ld["@type"]).toBe("Article");
    expect(ld.headline).toBe("How to play Snow Road");
    expect(ld.url).toBe(`${SITE}/blog/how-to-play-snow-road`);
    expect(ld.mainEntityOfPage).toBe(`${SITE}/blog/how-to-play-snow-road`);
    expect(ld.image).toEqual([`${SITE}/cover.jpg`]);
    expect(ld.datePublished).toBe("2026-01-02T03:04:05.000Z");
    expect("dateModified" in ld).toBe(false);
    expect("author" in ld).toBe(false);
    expect(ld.publisher).toEqual({ "@type": "Organization", name: "SlopeCurve", url: `${SITE}/` });

    const noDates = articleJsonLd({ headline: "X", url: `${SITE}/blog/x` });
    expect("datePublished" in noDates).toBe(false);
    expect("dateModified" in noDates).toBe(false);
    expect("publisher" in noDates).toBe(false);
  });

  it("keeps VideoGame facts limited to stored data", () => {
    const ld = videoGameJsonLd({ name: "Snow Road", url: `${SITE}/games/snow-road`, description: "", image: null });
    expect(ld.name).toBe("Snow Road");
    expect("description" in ld).toBe(false);
    expect("image" in ld).toBe(false);
    expect(ld.applicationCategory).toBe("Game");
  });

  it("declares SearchAction only when a URL template is supplied, and no invented organization", () => {
    const withSearch = websiteJsonLd({ name: "SlopeCurve", url: `${SITE}/`, searchUrl: `${SITE}/games?q={search_term_string}` });
    expect(withSearch.potentialAction).toMatchObject({ "@type": "SearchAction" });
    const withoutSearch = websiteJsonLd({ name: "SlopeCurve", url: `${SITE}/` });
    expect("potentialAction" in withoutSearch).toBe(false);
    expect(organizationJsonLd({ name: "", url: `${SITE}/` })).toBeNull();
    expect(organizationJsonLd({ name: "SlopeCurve", url: `${SITE}/` })).toMatchObject({ "@type": "Organization", name: "SlopeCurve" });
  });
});

describe("Phase 6 — cross-content-type uniqueness", () => {
  const body = Array.from({ length: 80 }, (_, i) => `unique${i} detail about snowboarding controls and timing`).join(" ");

  it("merges games, guides and landing pages for a site-wide similar check", () => {
    const merged = mergeCandidates(
      [
        [{ id: "g1", label: "Game: Snow Road", text: "game text" }],
        [{ id: "p1", label: "Guide: Snow tips", text: body }],
        [{ id: "l1", label: "Landing page: snow unblocked", text: "landing text" }],
      ],
      "g1",
    );
    expect(merged.map((c) => c.id)).toEqual(["p1", "l1"]);

    const report = checkQuality(body, merged, { minWords: 20, maxSimilarity: 0.35 });
    expect(report.ok).toBe(false);
    expect(report.errors.join(" ")).toContain("Guide: Snow tips");
    expect(report.errors.join(" ")).toContain("Too similar");
  });

  it("does not block unrelated pages that only share generic words", () => {
    const generic = "play free online games in your browser with no downloads and simple controls";
    const report = checkQuality(generic, [{ id: "p1", label: "Guide", text: body }], { minWords: 5, maxSimilarity: 0.35 });
    expect(report.errors).toEqual([]);
  });
});
