import { test, expect } from "@playwright/test";

const HTML = { Accept: "text/html" };

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

test.describe("Phase 1 SEO fixes (server output)", () => {
  test("search views are noindex in raw HTML and headers", async ({ request }) => {
    const res = await request.get("/games?q=snow", { headers: HTML });
    expect(res.status()).toBe(200);
    expect(String(res.headers()["x-robots-tag"] || "")).toContain("noindex");
    const html = await res.text();
    expect(occurrences(html, '<meta name="robots"')).toBe(1);
    expect(html).toContain('<meta name="robots" content="noindex, follow">');
    expect(html).toContain('<html lang="en">');
    expect(html).not.toMatch(/hreflang/i);
    // The origin is a deployment setting (workers.dev now, slopecurve.com later), so assert the
    // shape — one absolute canonical pointing at /games — rather than a specific host.
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? "";
    expect(canonical).toMatch(/^https?:\/\/[^/]+\/games$/);
    expect(occurrences(html, 'rel="canonical"')).toBe(1);
  });

  test("page routes stay HTML for clients that do not send Accept: text/html", async ({ request }) => {
    // Link-preview bots, uptime monitors and plain HTTP clients commonly send `Accept: */*`.
    const res = await request.get("/", { headers: { Accept: "*/*" } });
    expect(res.status()).toBe(200);
    expect(String(res.headers()["content-type"])).toContain("text/html");
    expect(await res.text()).toContain('rel="canonical"');

    // A URL that is neither a page nor an asset is still a genuine 404.
    const missing = await request.get("/games/one/two", { headers: { Accept: "*/*" } });
    expect(missing.status()).toBe(404);
    expect(String(missing.headers()["content-type"])).toContain("application/json");
  });

  test("canonical listing stays indexable with exactly one social tag set", async ({ request }) => {
    const res = await request.get("/games", { headers: HTML });
    expect(res.status()).toBe(200);
    expect(res.headers()["x-robots-tag"]).toBeUndefined();
    const html = await res.text();
    expect(html).not.toContain('<meta name="robots" content="noindex');
    for (const tag of [
      'property="og:title"',
      'property="og:description"',
      'property="og:url"',
      'property="og:type"',
      'name="twitter:card"',
      'name="twitter:title"',
      'name="twitter:description"',
    ]) {
      expect(occurrences(html, tag), `${tag} must appear once`).toBe(1);
    }
    expect(html).toContain('<meta property="og:type" content="website">');
    expect(html).not.toMatch(/<meta[^>]+hreflang/i);
  });

  test("game page has VideoGame + breadcrumbs in one hydration-replaceable block", async ({ page }) => {
    await page.goto("/games/snow-road");
    await expect(page.locator("h1").first()).toContainText("Snow Road");
    const html = await page.content();
    expect(html).toContain('<meta property="og:type" content="website">');
    const state = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      return {
        total: scripts.length,
        ids: scripts.map((s) => s.getAttribute("data-seo-jsonld")),
        text: scripts.map((s) => s.textContent || "").join("\n"),
      };
    });
    expect(state.total).toBe(1);
    expect(state.ids).toEqual(["game"]);
    expect(state.text).toContain('"@type":"VideoGame"');
    expect(state.text).toContain('"@type":"BreadcrumbList"');
  });

  test("blog article uses og:type=article and one Article block after hydration", async ({ request, page }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    const postPath = sitemap.match(/<loc>https?:\/\/[^<]*?(\/blog\/[^<]+)<\/loc>/)?.[1];
    expect(postPath, "a published blog post must exist in the sitemap").toBeTruthy();

    const res = await request.get(postPath as string, { headers: HTML });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('<meta property="og:type" content="article">');
    expect(html).not.toContain('<meta property="og:type" content="website">');
    expect(html).toContain('data-seo-jsonld="post"');

    await page.goto(postPath as string);
    await expect(page.locator("h1").first()).toBeVisible();
    const state = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      return { total: scripts.length, ids: scripts.map((s) => s.getAttribute("data-seo-jsonld")), text: scripts.map((s) => s.textContent || "").join("\n") };
    });
    expect(state.total).toBe(1);
    expect(state.ids).toEqual(["post"]);
    expect(state.text).toContain('"@type":"Article"');
    expect(state.text).toContain('"@type":"BreadcrumbList"');
  });

  test("sitemap carries real lastmod values and no drafts/admin/api/query URLs", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    expect(xml).toContain("<urlset");
    expect(xml).toContain("<lastmod>");
    expect(xml).not.toMatch(/\/admin|\/api\/|\?q=|%3F/);
    expect(xml).not.toContain("undefined");
    for (const value of xml.match(/<lastmod>([^<]+)<\/lastmod>/g) || []) {
      expect(value).toMatch(/^<lastmod>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z<\/lastmod>$/);
    }
  });
});
