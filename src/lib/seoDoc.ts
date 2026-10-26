// Pure SEO document helpers — worker-safe (no DOM, no import.meta, no D1, no UA input).
// Same input always yields the same HTML, so crawlers and visitors get identical content.

import { isReservedLandingSlug } from "./landingSlugs";
import { isLegalSlug, type LegalSlug } from "./legal";

/** English is the only supported public site language (Phase 1 SEO policy). */
export const SITE_LANG = "en";

export type PublicRoute =
  | { kind: "home" }
  | { kind: "games" }
  | { kind: "new-games" }
  | { kind: "hot-games" }
  | { kind: "categories" }
  | { kind: "blog" }
  | { kind: "game"; slug: string }
  | { kind: "category"; slug: string }
  | { kind: "post"; slug: string }
  | { kind: "landing"; slug: string }
  | { kind: "legal"; page: LegalSlug }
  | { kind: "static"; page: "about" | "privacy" | "terms" | "faq" };

const SLUG = "[a-z0-9-]+";

export function resolvePublicRoute(path: string): PublicRoute | null {
  if (path === "/") return { kind: "home" };
  if (path === "/games") return { kind: "games" };
  if (path === "/new-games") return { kind: "new-games" };
  if (path === "/hot-games") return { kind: "hot-games" };
  if (path === "/categories") return { kind: "categories" };
  if (path === "/blog") return { kind: "blog" };
  let m: RegExpMatchArray | null;
  m = path.match(new RegExp(`^/games/(${SLUG})$`));
  if (m) return { kind: "game", slug: m[1] };
  m = path.match(new RegExp(`^/categories/(${SLUG})$`));
  if (m) return { kind: "category", slug: m[1] };
  m = path.match(new RegExp(`^/blog/(${SLUG})$`));
  if (m) return { kind: "post", slug: m[1] };
  const legal = path.match(/^\/(privacy-policy|terms-of-use|contact)$/);
  if (legal && isLegalSlug(legal[1])) return { kind: "legal", page: legal[1] };
  m = path.match(/^\/(about|privacy|terms|faq)$/);
  if (m) return { kind: "static", page: m[1] as "about" | "privacy" | "terms" | "faq" };
  m = path.match(new RegExp(`^/(${SLUG})$`));
  if (m && !isReservedLandingSlug(m[1])) return { kind: "landing", slug: m[1] };
  return null;
}

/**
 * True when a URL is a search/filter view rather than the canonical listing page.
 * `/games?q=snow` must stay out of the index; `/games` itself stays indexable.
 * No pagination exists on /games today, so any non-empty query is a filtered view.
 */
export function isSearchView(path: string, search: string): boolean {
  if (path !== "/games") return false;
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  for (const [key, value] of params) if (key && value.trim()) return true;
  return false;
}

/** True for asset/dev-file paths that must pass through to static assets, never SSR/404. */
export function isAssetLikePath(path: string): boolean {
  if (path.startsWith("/assets/")) return true;
  if (path === "/favicon.svg" || path === "/favicon.ico" || path === "/fallback.svg" || path === "/robots.txt") return true;
  if (path.startsWith("/@vite/") || path.startsWith("/@react-refresh") || path.startsWith("/@fs/") || path.startsWith("/src/") || path.startsWith("/node_modules/") || path.startsWith("/__")) return true;
  const last = path.split("/").pop() ?? "";
  return /\.[a-z0-9]{1,8}([?#]|$)/i.test(last);
}

export interface PageSocial {
  /** `article` for blog posts, `website` everywhere else. */
  type?: "website" | "article";
  /** Stored og_title override; falls back to the page title. */
  title?: string | null;
  /** Stored og_description override; falls back to the page description. */
  description?: string | null;
  /** Absolute social image URL (already resolved/validated by the caller). */
  image?: string | null;
  imageAlt?: string | null;
  siteName?: string | null;
}

export interface SeoPage {
  title: string;
  description: string;
  canonical: string;
  h1: string;
  /** Sanitized/escaped inner HTML for the SSR content block. */
  bodyHtml: string;
  jsonLd?: string;
  /** `data-seo-jsonld` key used by the client hook to replace (never duplicate) this entity. */
  jsonLdId?: string;
  noindex?: boolean;
  /** Explicit robots directive, e.g. "noindex, follow" for search views. */
  robots?: string;
  status: 200 | 404;
  verifyTags?: string;
  og?: PageSocial;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function escapeHtml(s: string): string {
  return esc(s);
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

const IMAGE_EXT_RE = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/** Absolute image URLs must be https (http only for local development) and credential-free. */
export function isAbsoluteSocialImage(value: string): boolean {
  const raw = text(value);
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && isLocalHost(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Safe social-image fallback: page-specific image, then configured default, then a real
 * page thumbnail. Invalid/relative non-file values are skipped; null means "omit the tags".
 */
export function resolveSocialImage(candidates: Array<string | null | undefined>, site: string): string | null {
  const origin = text(site).replace(/\/+$/, "");
  for (const candidate of candidates) {
    const raw = text(candidate);
    if (!raw || raw.startsWith("//")) continue;

    if (raw.startsWith("/")) {
      if (!origin) continue;
      try {
        const url = new URL(raw, `${origin}/`);
        if (url.origin !== origin) continue;
        if (!IMAGE_EXT_RE.test(`${url.pathname}${url.search}${url.hash}`)) continue;
        return `${origin}${url.pathname}${url.search}${url.hash}`;
      } catch {
        continue;
      }
    }

    if (!isAbsoluteSocialImage(raw)) continue;
    try {
      const url = new URL(raw);
      if (!IMAGE_EXT_RE.test(`${url.pathname}${url.search}${url.hash}`)) continue;
      return url.toString();
    } catch {
      continue;
    }
  }
  return null;
}

function socialTags(page: SeoPage): string[] {
  const og = page.og ?? {};
  const type = og.type === "article" ? "article" : "website";
  const ogTitle = text(og.title) || page.title;
  const ogDescription = text(og.description) || page.description;
  const image = og.image && isAbsoluteSocialImage(og.image) ? og.image : null;
  const imageAlt = text(og.imageAlt) || page.title;
  const siteName = text(og.siteName);

  const tags = [`<meta property="og:type" content="${type}">`];
  if (siteName) tags.push(`<meta property="og:site_name" content="${esc(siteName)}">`);
  tags.push(
    `<meta property="og:title" content="${esc(ogTitle)}">`,
    `<meta property="og:description" content="${esc(ogDescription)}">`,
    `<meta property="og:url" content="${esc(page.canonical)}">`,
  );
  if (image) {
    tags.push(`<meta property="og:image" content="${esc(image)}">`, `<meta property="og:image:alt" content="${esc(imageAlt)}">`);
  }
  tags.push(`<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`);
  tags.push(
    `<meta name="twitter:title" content="${esc(ogTitle)}">`,
    `<meta name="twitter:description" content="${esc(ogDescription)}">`,
  );
  if (image) {
    tags.push(`<meta name="twitter:image" content="${esc(image)}">`, `<meta name="twitter:image:alt" content="${esc(imageAlt)}">`);
  }
  return tags;
}

/** All head tags this builder owns. Emitted exactly once per document. */
function headTags(page: SeoPage): string[] {
  const tags = socialTags(page);
  const robots = text(page.robots) || (page.noindex ? "noindex" : "");
  if (robots) tags.push(`<meta name="robots" content="${esc(robots)}">`);
  if (page.verifyTags) tags.push(page.verifyTags);
  if (page.jsonLd) {
    const id = page.jsonLdId ? ` data-seo-jsonld="${esc(page.jsonLdId)}"` : "";
    tags.push(`<script type="application/ld+json"${id}>${page.jsonLd}</script>`);
  }
  return tags;
}

/** Force the document language to English (never advertise unsupported locales). */
function ensureLang(html: string): string {
  if (/<html[^>]*\slang\s*=\s*"[^"]*"/i.test(html)) {
    return html.replace(/(<html[^>]*\slang\s*=\s*")[^"]*(")/i, `$1${SITE_LANG}$2`);
  }
  return html.replace(/<html([^>]*)>/i, `<html$1 lang="${SITE_LANG}">`);
}

/** Inject SEO head tags + SSR content into a built index.html shell. Never references dev paths. */
export function buildSeoDocument(baseHtml: string, page: SeoPage): string {
  let html = ensureLang(baseHtml);
  html = html.replace(/<title>.*?<\/title>/is, `<title>${esc(page.title)}</title>`);
  // Remove shell defaults we now own so each document emits exactly one correct set.
  html = html.replace(/[ \t]*<meta\s+name="description"[^>]*>\s*/gi, "");
  html = html.replace(/[ \t]*<link\s+rel="canonical"[^>]*>\s*/gi, "");
  html = html.replace(/[ \t]*<meta\s+(?:property|name)="(?:og|twitter):[^"]*"[^>]*>\s*/gi, "");
  html = html.replace(/[ \t]*<meta\s+name="robots"[^>]*>\s*/gi, "");

  const owned = `\n    <meta name="description" content="${esc(page.description)}">\n    <link rel="canonical" href="${esc(page.canonical)}">`;
  if (/<\/title>/i.test(html)) {
    html = html.replace(/<\/title>/i, `</title>${owned}`);
  } else {
    html = html.replace(/<\/head>/i, `${owned}\n  </head>`);
  }
  html = html.replace(/<\/head>/i, `    ${headTags(page).join("\n    ")}\n  </head>`);

  const ssr = `<div id="ssr-content"><main><h1>${esc(page.h1)}</h1>${page.bodyHtml}</main></div><div id="root"></div>`;
  if (/<div\s+id="root"\s*><\/div>/i.test(html)) {
    html = html.replace(/<div\s+id="root"\s*><\/div>/i, ssr);
  } else {
    html = html.replace(/<body[^>]*>/i, (m) => `${m}\n    ${ssr}`);
  }
  return html;
}

/** Minimal no-asset fallback shell (used only when the ASSETS binding is unavailable). */
export function fallbackShell(page: SeoPage): string {
  return `<!doctype html><html lang="${SITE_LANG}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(page.title)}</title><meta name="description" content="${esc(page.description)}"><link rel="canonical" href="${esc(page.canonical)}">${headTags(page).join("")}</head><body style="background:#000;color:#fff;font-family:sans-serif"><div id="ssr-content"><main><h1>${esc(page.h1)}</h1>${page.bodyHtml}</main></div><div id="root"></div></body></html>`;
}

export function notFoundPage(site: string, what = "Page"): SeoPage {
  return {
    title: `${what} not found | SlopeCurve`,
    description: `The requested ${what.toLowerCase()} does not exist on SlopeCurve.`,
    canonical: `${site}/404`,
    h1: `${what} not found`,
    bodyHtml: `<p>This page does not exist or is not published. <a href="/">Back to homepage</a> · <a href="/games">Browse games</a></p>`,
    noindex: true,
    status: 404,
  };
}

function faqPlainText(html: string): string {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract h3+p FAQ pairs into schema.org FAQPage JSON. Returns null when none exist. */
export function faqJsonLd(html: string): Record<string, unknown> | null {
  const items: Array<{ q: string; a: string }> = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(html || "")))) {
    const q = faqPlainText(m[1]);
    const a = faqPlainText(m[2]);
    if (q && a) items.push({ q, a });
  }
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}
