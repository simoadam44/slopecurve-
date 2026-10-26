import { describe, it, expect } from "vitest";
import { validateGameUrl, validateImageUrl, validateSlug, validateLandingSlug, slugify, validateComment, validateCommentGameId, isHostAllowed, getTrustedHosts, DEFAULT_GAME_HOSTS } from "../src/lib/validate";
import { LANDING_TOOLS, LANDING_LANGUAGES, LANDING_SUBTITLE_MAX, normalizeLandingTool, landingToolLabel, cleanLandingSubtitle, supportedSiteLanguage, isLegacyLanguage } from "../src/lib/landingTools";
import { sanitizeRichText, buildGameMeta, canonicalForGame } from "../src/lib/seo";

const HOSTS = ["game-host.example.com", "trusted-games.example.com"];

describe("game URL validation", () => {
  it("allows trusted https host", () => {
    expect(validateGameUrl("https://game-host.example.com/play/", HOSTS).ok).toBe(true);
  });
  it("blocks javascript/data/file/localhost/private", () => {
    expect(validateGameUrl("javascript:alert(1)", HOSTS).ok).toBe(false);
    expect(validateGameUrl("data:text/html,hi", HOSTS).ok).toBe(false);
    expect(validateGameUrl("http://localhost:8000/x", HOSTS).ok).toBe(false);
    expect(validateGameUrl("https://192.168.1.5/x", HOSTS).ok).toBe(false);
    expect(validateGameUrl("https://evil.com/x", HOSTS).ok).toBe(false);
  });
  it("requires https", () => {
    expect(validateGameUrl("http://game-host.example.com/x", HOSTS).ok).toBe(false);
  });
});

describe("trusted host suffix matching", () => {
  it("allows a subdomain of an allowlisted host", () => {
    expect(validateGameUrl("https://especially43.github.io/snow-rider/", ["github.io"]).ok).toBe(true);
    expect(validateGameUrl("https://a.b.github.io/x", ["github.io"]).ok).toBe(true);
    expect(validateGameUrl("https://cdn.game-host.example.com/x", ["game-host.example.com"]).ok).toBe(true);
  });
  it("allows the exact host and is case-insensitive", () => {
    expect(isHostAllowed("github.io", ["github.io"])).toBe(true);
    expect(isHostAllowed("GITHUB.IO", ["github.io"])).toBe(true);
    expect(isHostAllowed("A.GitHub.io", ["GITHUB.IO"])).toBe(true);
  });
  it("does not match on a partial label boundary", () => {
    expect(validateGameUrl("https://evilgithub.io/x", ["github.io"]).ok).toBe(false);
    expect(validateGameUrl("https://github.io.evil.com/x", ["github.io"]).ok).toBe(false);
    expect(isHostAllowed("xgithub.io", ["github.io"])).toBe(false);
    expect(isHostAllowed("notgithub.io", ["github.io"])).toBe(false);
  });
  it("ships github.io in the built-in allowlist", () => {
    expect(DEFAULT_GAME_HOSTS).toContain("github.io");
    expect(getTrustedHosts()).toContain("github.io");
  });
});

describe("same-site embeds are refused", () => {
  it("rejects the site's own host and its subdomains", () => {
    expect(validateGameUrl("https://slopecurve.com/embed", ["slopecurve.com"], "slopecurve.com").ok).toBe(false);
    expect(validateGameUrl("https://www.slopecurve.com/embed", ["slopecurve.com"], "slopecurve.com").ok).toBe(false);
    expect(validateGameUrl("https://SLOPECURVE.com/embed", ["slopecurve.com"], "SLOPECURVE.COM").ok).toBe(false);
  });
  it("still allows a different allowlisted host", () => {
    expect(validateGameUrl("https://azgames.io/snow-road-3d.embed", ["azgames.io"], "slopecurve.com").ok).toBe(true);
  });
  it("ignores the guard when no site host is supplied", () => {
    expect(validateGameUrl("https://azgames.io/x.embed", ["azgames.io"]).ok).toBe(true);
  });
});

describe("image validation", () => {
  it("supports jpg/png/webp", () => {
    expect(validateImageUrl("https://a.com/x.jpg").ok).toBe(true);
    expect(validateImageUrl("https://a.com/x.PNG?w=1").ok).toBe(true);
    expect(validateImageUrl("https://a.com/x.webp").ok).toBe(true);
  });
  it("rejects svg/gif/bmp", () => {
    expect(validateImageUrl("https://a.com/x.svg").ok).toBe(false);
    expect(validateImageUrl("not-a-url").ok).toBe(false);
  });
  it("requires https and rejects embedded credentials", () => {
    expect(validateImageUrl("http://a.com/x.jpg").ok).toBe(false);
    expect(validateImageUrl("https://user:pass@a.com/x.jpg").ok).toBe(false);
    expect(validateImageUrl("https://a.com/x.jpg").ok).toBe(true);
  });
});

describe("slugs", () => {
  it("validates uniqueness shape", () => {
    expect(validateSlug("snow-road")).toBe(true);
    expect(validateSlug("Bad Slug!")).toBe(false);
    expect(validateSlug("wave-rider.embed")).toBe(false);
  });
  it("slugify produces a valid slug from a title", () => {
    expect(slugify("Wave Rider")).toBe("wave-rider");
    expect(slugify("  Hello, World!!  ")).toBe("hello-world");
    expect(slugify("Café Déjà Vu")).toBe("cafe-deja-vu");
    expect(slugify("Snow Rider 3D: The Best!")).toBe("snow-rider-3d-the-best");
    expect(validateSlug(slugify("Wave Rider"))).toBe(true);
  });
  it("slugify returns empty when no usable characters remain", () => {
    expect(slugify("!!!")).toBe("");
    expect(validateSlug(slugify("!!!"))).toBe(false);
  });
  it("landing slugs use the same shape but block reserved app routes", () => {
    expect(validateLandingSlug("snow-rider-unblocked")).toBe(true);
    expect(validateLandingSlug("admin")).toBe(false);
    expect(validateLandingSlug("games")).toBe(false);
    expect(validateLandingSlug("api")).toBe(false);
    expect(validateLandingSlug("sitemap.xml")).toBe(false);
    expect(validateLandingSlug("About")).toBe(false);
    expect(validateLandingSlug("x")).toBe(false);
  });
});

describe("landing tool metadata", () => {
  it("normalizes known tools and falls back to game", () => {
    expect(normalizeLandingTool("Video")).toBe("video");
    expect(normalizeLandingTool(" puzzle ")).toBe("puzzle");
    expect(normalizeLandingTool("unknown")).toBe("game");
    expect(normalizeLandingTool(null)).toBe("game");
    expect(LANDING_TOOLS).toContain("game");
    expect(landingToolLabel("video")).toBe("Video");
  });
  it("cleans subtitles: strips tags, collapses whitespace, caps length", () => {
    expect(cleanLandingSubtitle("  <b>Snow</b>   Rider  ")).toBe("Snow Rider");
    expect(cleanLandingSubtitle("x".repeat(200))).toHaveLength(LANDING_SUBTITLE_MAX);
    expect(cleanLandingSubtitle(undefined)).toBe("");
  });
  it("offers English only (single supported public language)", () => {
    expect(LANDING_LANGUAGES[0]).toBe("English");
    expect(LANDING_LANGUAGES).toEqual(["English"]);
    expect(LANDING_LANGUAGES).not.toContain("Arabic");
    expect(supportedSiteLanguage("Arabic")).toBe("English");
    expect(isLegacyLanguage("Arabic")).toBe(true);
  });
});

describe("sanitize + seo", () => {
  it("strips scripts and handlers", () => {
    const out = sanitizeRichText('<p onclick="x()">hi</p><script>alert(1)</script><h2>T</h2><a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("<h2>T</h2>");
  });
  it("keeps internal links followable but blocks protocol-relative and unsafe URLs", () => {
    const internal = sanitizeRichText('<p><a href="/blog/snow-guide">Snow guide</a> <a href="/games/snow-road">Snow Road</a></p>');
    expect(internal).toContain('<a href="/blog/snow-guide">');
    expect(internal).toContain('<a href="/games/snow-road">');
    const external = sanitizeRichText('<a href="https://example.com/x">ext</a>');
    expect(external).toMatch(/rel="[^"]*noopener/);
    expect(external).toMatch(/rel="[^"]*noreferrer/);
    const proto = sanitizeRichText('<a href="//evil.com/x">evil</a>');
    expect(proto).not.toContain("evil.com");
    const backslash = sanitizeRichText('<a href="/\\evil.com">evil</a>');
    expect(backslash).not.toContain('href="/\\');
  });
  it("allows plain mailto links but blocks script-bearing hrefs", () => {
    const mail = sanitizeRichText('<a href="mailto:team@example.com">email us</a>');
    expect(mail).toContain('href="mailto:team@example.com"');
    const bad = sanitizeRichText('<a href="mailto:a@b.com?body=<script>">x</a>');
    expect(bad).not.toContain("script");
    expect(sanitizeRichText('<a href="java\nscript:alert(1)">x</a>')).not.toContain("javascript:");
  });
  it("builds canonical + meta", () => {
    const g = { slug: "snow-road", title: "Snow Road", short_description: "Fun snow game. ".repeat(20) } as Parameters<typeof buildGameMeta>[0];
    const m = buildGameMeta(g, "https://slopecurve.com");
    expect(m.canonical).toBe("https://slopecurve.com/games/snow-road");
    expect(canonicalForGame(g, "https://slopecurve.com")).toContain("/games/snow-road");
    expect(m.title).toContain("Snow Road");
  });
});

describe("comments", () => {
  it("validates length and blocks html", () => {
    expect(validateComment("A", "hi").ok).toBe(false);
    expect(validateComment("Ahmed", "<script>x</script>").ok).toBe(false);
    expect(validateComment("Ahmed", "Great game, smooth controls!").ok).toBe(true);
  });
  it("accepts only bounded, safe game ids", () => {
    expect(validateCommentGameId("g-snow-road")).toBe(true);
    expect(validateCommentGameId("3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6a7b")).toBe(true);
    expect(validateCommentGameId("")).toBe(false);
    expect(validateCommentGameId("../games")).toBe(false);
    expect(validateCommentGameId("<script>")).toBe(false);
    expect(validateCommentGameId("a".repeat(65))).toBe(false);
  });
});
