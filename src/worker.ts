import { resolvePublicRoute, buildSeoDocument, fallbackShell, notFoundPage, faqJsonLd, isSearchView, resolveSocialImage } from "./lib/seoDoc";
import type { SeoPage, PageSocial } from "./lib/seoDoc";
import { checkQuality, keywordCollisions, mergeCandidates } from "./lib/aiContent";
import type { ContentCandidate } from "./lib/aiContent";
import { DEFAULT_MODEL, FREE_MODELS, fallbackChain, isFreeModel } from "./lib/aiModels";
import { decryptSecret, encryptSecret, keyHint, validApiKeyFormat } from "./lib/aiCrypto";
import { aiErrorMessage, classifyGeminiError, isRetryableCode, type AiErrorCode } from "./lib/aiErrors";
import { rankInternalLinks, relatedLinksHtml } from "./lib/internalLinks";
import type { InternalTarget } from "./lib/internalLinks";
import { articleJsonLd, breadcrumbJsonLd, organizationJsonLd, videoGameJsonLd, websiteJsonLd } from "./lib/schema";
import { sitemapLastmod, sitemapXml } from "./lib/sitemap";
import {
  GAME_SCHEMA, POST_SCHEMA, LANDING_SCHEMA, SECTION_SCHEMA, KEYWORDS_SCHEMA, OUTLINE_SCHEMA, INTENT_SCHEMA,
  buildGameCopyPrompt, buildPostPrompt, buildLandingPrompt, buildSectionPrompt, buildKeywordsPrompt, buildOutlinePrompt, buildIntentPrompt, extractJson,
} from "./lib/aiPrompt";
import type { GameCopyInput, PostInput, LandingInput, OutlineInput } from "./lib/aiPrompt";
import { slugify, isHostAllowed, DEFAULT_GAME_HOSTS, validateLandingSlug, validateCommentGameId } from "./lib/validate";
import { cleanLandingSubtitle, landingToolLabel, normalizeLandingTool, supportedSiteLanguage } from "./lib/landingTools";
import { homeGameSlug } from "./lib/home";
import { legalPage } from "./lib/legal";
import { sanitizeRichText as sanitizeHtml } from "./lib/sanitize";
import { cacheControlFor, isAdminPath, isAssetPassthrough, securityHeaders } from "./lib/security";
import { accessConfig, isSameOrigin, verifyAccessToken } from "./lib/access";
import type { AccessConfig, AccessPrincipal } from "./lib/access";
import { issueCsrfToken, verifyCsrfToken } from "./lib/csrf";
import { DEFAULT_JSON_LIMIT, isJsonRequest, readJson } from "./lib/request";
import { createRateLimiter } from "./lib/rateLimit";

// Cloudflare Worker: API + sitemap/robots + SEO HTML fallback. D1 persistent storage.
interface D1Result<T = Record<string, unknown>> { results: T[]; }
interface D1Stmt { bind(...v: unknown[]): D1Stmt; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<D1Result<T>>; run(): Promise<unknown>; }
interface D1Database { prepare(sql: string): D1Stmt; }
interface Env {
  DB: D1Database;
  ASSETS: { fetch(req: Request | string | URL): Promise<Response> };
  SITE_URL?: string;
  TRUSTED_GAME_HOSTS?: string;
  ENVIRONMENT?: string;
  LOCAL_DEV_AUTH?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
  CSRF_SECRET?: string;
  AI_KEYS_SECRET?: string;
  GEMINI_API_KEY?: string;
}

const SITE_DEFAULT = "https://slopecurve.com";

function siteUrl(env: Env): string {
  return (env.SITE_URL || SITE_DEFAULT).replace(/\/$/, "");
}
function trustedHosts(env: Env): string[] {
  return (env.TRUSTED_GAME_HOSTS || DEFAULT_GAME_HOSTS)
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// --- validation (mirrors src/lib/validate, worker-safe) ---
function validateGameUrl(url: string, hosts: string[], selfHost?: string): { ok: boolean; error?: string } {
  if (!url || url.length > 2048) return { ok: false, error: "URL required." };
  const lower = url.trim().toLowerCase();
  for (const s of ["javascript:", "data:", "file:", "vbscript:"]) if (lower.startsWith(s)) return { ok: false, error: `Blocked scheme ${s}` };
  let u: URL;
  try { u = new URL(url.trim()); } catch { return { ok: false, error: "Malformed URL." }; }
  if (u.protocol !== "https:") return { ok: false, error: "HTTPS required." };
  const host = u.hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host)) return { ok: false, error: "Loopback blocked." };
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return { ok: false, error: "Private network blocked." };
  if (!isHostAllowed(host, hosts)) return { ok: false, error: `Host not allowlisted: ${host}` };
  const self = String(selfHost || "").trim().toLowerCase();
  if (self && (host === self || host.endsWith("." + self))) return { ok: false, error: "Same-site games cannot be embedded." };
  return { ok: true };
}
/** Hostname of this site, so a game can never be stored as a same-origin embed. */
function siteHost(env: Env): string {
  try { return new URL(String(env.SITE_URL || "https://slopecurve.com")).hostname.toLowerCase(); } catch { return "slopecurve.com"; }
}
function validateImageUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    return /\.(jpg|jpeg|png|webp)(\?|#|$)/i.test(u.pathname + u.search + u.hash);
  } catch { return false; }
}
function validSlug(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length >= 2 && s.length <= 120;
}

// --- rate limiting (bounded in-memory per isolate; edge/WAF is the real limiter) ---
const commentLimiter = createRateLimiter(2000);

const PUBLIC_SETTINGS = ["site_name", "site_description", "logo_url", "favicon_url", "default_og_image", "home_title", "home_description", "home_game_slug", "contact_email", "social_x", "social_youtube", "social_twitch", "footer_text", "default_lang", "canonical_url", "google_verification", "bing_verification", "ads_enabled", "ads_txt"];
function tokenSafe(t: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(t.trim());
}
function newId(): string {
  return crypto.randomUUID();
}
// --- auth: Cloudflare Access JWT only. Local dev can opt in to a fake principal. ---
function isLocalDevAdmin(req: Request, env: Env): boolean {
  if (env.ENVIRONMENT === "production") return false;
  if (env.LOCAL_DEV_AUTH !== "true") return false;
  try {
    const host = new URL(req.url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

async function requireAdmin(req: Request, env: Env): Promise<AccessPrincipal | null> {
  if (isLocalDevAdmin(req, env)) return { sub: "local-dev", email: "local@localhost" };
  const config = accessConfig(env);
  if (!config) return null;
  const token = req.headers.get("cf-access-jwt-assertion") || "";
  return verifyAccessToken(token, config);
}

// Cached probe result so an unauthenticated caller cannot turn /api/admin/me into a
// request amplifier against the configured team domain.
let accessProbe: { at: number; ok: boolean } | null = null;

/** Best-effort check that a Cloudflare Access team actually answers at the configured domain. */
async function accessTeamReachable(config: AccessConfig): Promise<boolean> {
  const now = Date.now();
  if (accessProbe && now - accessProbe.at < 60_000) return accessProbe.ok;
  let ok = false;
  try {
    const res = await fetch(`${config.teamDomain}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(3000) });
    ok = res.ok;
  } catch {
    ok = false;
  }
  accessProbe = { at: now, ok };
  return ok;
}

function adminOriginAllowed(req: Request, env: Env): boolean {
  if (isSameOrigin(req, siteUrl(env))) return true;
  if (!isLocalDevAdmin(req, env)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

/** Public writes (comments) accept same-origin browser requests only. */
function publicOriginAllowed(req: Request): boolean {
  const fetchSite = (req.headers.get("sec-fetch-site") || "").toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}

function adminCsrfSecret(env: Env): string | null {
  if (env.CSRF_SECRET && env.CSRF_SECRET.length >= 32) return env.CSRF_SECRET;
  if (env.ENVIRONMENT !== "production" && env.LOCAL_DEV_AUTH === "true") return "local-dev-csrf-secret-not-for-production";
  return null;
}

async function adminMutationAllowed(req: Request, env: Env, principal: AccessPrincipal): Promise<boolean> {
  if (!adminOriginAllowed(req, env)) return false;
  const secret = adminCsrfSecret(env);
  if (!secret) return false;
  const token = req.headers.get("x-csrf-token") || "";
  return verifyCsrfToken(secret, token, principal.sub);
}

// --- AI writer: encrypted Gemini keyring + free-tier-only proxy ---
// Dedicated encryption secret. Missing/misconfigured secret fails closed for stored keys.
function aiKeysSecret(env: Env): string | null {
  const secret = String(env.AI_KEYS_SECRET || "").trim();
  return secret.length >= 32 ? secret : null;
}
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
interface GeminiKey { id: string | null; key: string; source: "env" | "db"; }
async function loadKeys(env: Env): Promise<GeminiKey[]> {
  const out: GeminiKey[] = [];
  if (env.GEMINI_API_KEY && validApiKeyFormat(env.GEMINI_API_KEY)) out.push({ id: null, key: env.GEMINI_API_KEY.trim(), source: "env" });
  try {
    if (!env.DB) return out;
    const secret = aiKeysSecret(env);
    if (!secret) return out;
    const rows = (await env.DB.prepare("SELECT id, key_enc FROM ai_api_keys WHERE active=1 ORDER BY created_at").all<{ id: string; key_enc: string }>()).results || [];
    for (const r of rows) {
      const k = await decryptSecret(secret, r.key_enc);
      if (k && validApiKeyFormat(k)) out.push({ id: r.id, key: k, source: "db" });
    }
  } catch { /* table not migrated yet */ }
  return out;
}
async function bumpKeyUsage(env: Env, id: string | null): Promise<void> {
  if (!id || !env.DB) return;
  const day = todayKey();
  await env.DB.prepare("UPDATE ai_api_keys SET requests_today=CASE WHEN quota_day=? THEN requests_today+1 ELSE 1 END, quota_day=?, last_used_at=datetime('now') WHERE id=?")
    .bind(day, day, id).run();
}
interface GenResult { ok: boolean; status: number; text?: string; model?: string; code?: AiErrorCode; }
async function callGemini(apiKey: string, model: string, prompt: string, schema: unknown): Promise<GenResult> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, topP: 0.95, maxOutputTokens: 4096, responseMimeType: "application/json", responseSchema: schema },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const txt = await res.text();
    // The provider body is classified in-memory then discarded: never returned or persisted.
    if (!res.ok) return { ok: false, status: res.status, code: classifyGeminiError(res.status, txt) };
    let parsed: { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    try { parsed = JSON.parse(txt); } catch { return { ok: false, status: 502, code: "bad_response" }; }
    const text = (parsed.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    if (!text.trim()) return { ok: false, status: 502, code: "bad_response" };
    return { ok: true, status: 200, text, model };
  } catch {
    return { ok: false, status: 503, code: "network" };
  }
}
// Tries each configured key against the verified-free fallback chain. An id only ever reaches
// the network if isFreeModel() allowed it, so an unverified model is never attempted.
async function generate(env: Env, prompt: string, schema: unknown, preferred?: string): Promise<GenResult> {
  const keys = await loadKeys(env);
  if (!keys.length) return { ok: false, status: 0, code: "no_key" };
  const chain = fallbackChain(preferred);
  let last: GenResult = { ok: false, status: 0, code: "no_key" };
  let attempts = 0;
  for (const k of keys) {
    for (const model of chain) {
      if (attempts >= 6) return last;
      attempts++;
      const r = await callGemini(k.key, model, prompt, schema);
      if (r.ok) {
        await bumpKeyUsage(env, k.id).catch(() => {});
        return r;
      }
      last = r;
      if (!isRetryableCode(r.code || "upstream")) return r;
    }
  }
  return last;
}
function aiFail(r: GenResult, H: Record<string, string>): Response {
  const code = r.code || "upstream";
  if (code === "no_key") return json({ error: aiErrorMessage("no_key"), code: "no_key" }, 400, H);
  if (code === "invalid_key") return json({ error: aiErrorMessage(code), code }, 400, H);
  if (code === "payment_required") return json({ error: aiErrorMessage(code), code }, 402, H);
  if (code === "rate_limited" || code === "quota_exhausted") return json({ error: aiErrorMessage(code), code }, 429, H);
  return json({ error: aiErrorMessage(code), code }, 502, H);
}
async function settingText(env: Env, key: string, dflt: string): Promise<string> {
  try {
    if (!env.DB) return dflt;
    const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key=?").bind(key).first<{ value: string }>();
    return row?.value ?? dflt;
  } catch { return dflt; }
}
async function settingNum(env: Env, key: string, dflt: number): Promise<number> {
  const raw = await settingText(env, key, String(dflt));
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}
async function withinQuota(env: Env, cap: number): Promise<boolean> {
  const day = todayKey();
  try {
    if (!env.DB) return true;
    const row = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN quota_day=? THEN requests_today ELSE 0 END),0) n FROM ai_api_keys").bind(day).first<{ n: number }>();
    return (row?.n ?? 0) < cap;
  } catch { return true; }
}
async function logGeneration(env: Env, kind: string, targetId: string | null, model: string, keyword: string, code: AiErrorCode | null): Promise<void> {
  try {
    if (!env.DB) return;
    await env.DB.prepare("INSERT INTO ai_generation_log (id,kind,target_id,model,keyword,error) VALUES (?,?,?,?,?,?)")
      .bind(newId(), kind, targetId, model, keyword, code).run();
  } catch { /* logging must never break a request */ }
}
interface PublishedCandidate extends ContentCandidate { keyword: string; }
async function publishedCandidates(env: Env, kind: "game" | "post" | "landing", excludeId: string): Promise<PublishedCandidate[]> {
  if (!env.DB) return [];
  try {
    if (kind === "game") {
      const rows = (await env.DB.prepare("SELECT id,title,short_description,long_description,how_to_play,tips,focus_keyword FROM games WHERE status='published' AND id<>?").bind(excludeId).all<{ id: string; title: string; short_description: string; long_description: string; how_to_play: string | null; tips: string | null; focus_keyword: string | null }>()).results || [];
      return rows.map((r) => ({ id: r.id, label: r.title, keyword: r.focus_keyword || "", text: [r.short_description, r.long_description, r.how_to_play, r.tips].filter(Boolean).join(" ") }));
    }
    if (kind === "landing") {
      const rows = (await env.DB.prepare("SELECT id,title,intro,sections,faqs,focus_keyword FROM landing_pages WHERE status='published' AND id<>?").bind(excludeId).all<{ id: string; title: string; intro: string; sections: string; faqs: string; focus_keyword: string | null }>()).results || [];
      return rows.map((r) => ({ id: r.id, label: r.title, keyword: r.focus_keyword || "", text: [r.intro, r.sections, r.faqs].filter(Boolean).join(" ") }));
    }
    const rows = (await env.DB.prepare("SELECT id,title,excerpt,content,focus_keyword FROM blog_posts WHERE status='published' AND id<>?").bind(excludeId).all<{ id: string; title: string; excerpt: string; content: string; focus_keyword: string | null }>()).results || [];
    return rows.map((r) => ({ id: r.id, label: r.title, keyword: r.focus_keyword || "", text: [r.excerpt, r.content].filter(Boolean).join(" ") }));
  } catch { return []; }
}
/** Keywords already targeted across every published content type (prevents cannibalization). */
async function allKeywordTargets(env: Env, excludeLandingId = ""): Promise<PublishedCandidate[]> {
  const out: PublishedCandidate[] = [];
  if (!env.DB) return out;
  try {
    const g = (await env.DB.prepare("SELECT id,title,focus_keyword FROM games WHERE status='published' AND focus_keyword IS NOT NULL AND focus_keyword<>''").all<{ id: string; title: string; focus_keyword: string | null }>()).results || [];
    for (const r of g) out.push({ id: r.id, label: r.title, keyword: r.focus_keyword || "", text: "" });
  } catch { /* tables not migrated yet */ }
  try {
    const p = (await env.DB.prepare("SELECT id,title,focus_keyword FROM blog_posts WHERE status='published' AND focus_keyword IS NOT NULL AND focus_keyword<>''").all<{ id: string; title: string; focus_keyword: string | null }>()).results || [];
    for (const r of p) out.push({ id: r.id, label: r.title, keyword: r.focus_keyword || "", text: "" });
  } catch { /* tables not migrated yet */ }
  try {
    const l = (await env.DB.prepare("SELECT id,title,focus_keyword FROM landing_pages WHERE status='published' AND focus_keyword<>'' AND id<>?").bind(excludeLandingId).all<{ id: string; title: string; focus_keyword: string | null }>()).results || [];
    for (const r of l) out.push({ id: r.id, label: r.title, keyword: r.focus_keyword || "", text: "" });
  } catch { /* landing table not migrated yet */ }
  return out;
}
async function internalTargets(env: Env): Promise<InternalTarget[]> {
  const out: InternalTarget[] = [];
  if (!env.DB) return out;
  try {
    const g = (await env.DB.prepare("SELECT slug,title,focus_keyword FROM games WHERE status='published'").all<{ slug: string; title: string; focus_keyword: string | null }>()).results || [];
    for (const r of g) out.push({ kind: "game", slug: r.slug, title: r.title, keyword: r.focus_keyword });
    const p = (await env.DB.prepare("SELECT slug,title,focus_keyword FROM blog_posts WHERE status='published'").all<{ slug: string; title: string; focus_keyword: string | null }>()).results || [];
    for (const r of p) out.push({ kind: "post", slug: r.slug, title: r.title, keyword: r.focus_keyword });
  } catch { /* tables not migrated yet */ }
  try {
    const l = (await env.DB.prepare("SELECT slug,title,focus_keyword FROM landing_pages WHERE status='published' AND (noindex IS NULL OR noindex=0)").all<{ slug: string; title: string; focus_keyword: string | null }>()).results || [];
    for (const r of l) out.push({ kind: "landing", slug: r.slug, title: r.title, keyword: r.focus_keyword });
  } catch { /* landing table not migrated yet */ }
  return out;
}
/** Every published page that has body text, across all content types (site-wide duplication check). */
async function allContentCandidates(env: Env, excludeId: string): Promise<ContentCandidate[]> {
  const [games, posts, landings] = await Promise.all([
    publishedCandidates(env, "game", ""),
    publishedCandidates(env, "post", ""),
    publishedCandidates(env, "landing", ""),
  ]);
  const tagged = [
    games.map((c) => ({ id: c.id, label: `Game: ${c.label}`, text: c.text })),
    posts.map((c) => ({ id: c.id, label: `Guide: ${c.label}`, text: c.text })),
    landings.map((c) => ({ id: c.id, label: `Landing page: ${c.label}`, text: c.text })),
  ];
  return mergeCandidates(tagged, excludeId);
}
async function runPublishGate(env: Env, kind: "game" | "post" | "landing", payload: { id?: string; text: string; keyword?: string }): Promise<{ ok: boolean; error?: string; details?: unknown }> {
  if ((await settingText(env, "ai_gate_enabled", "true")) === "false") return { ok: true };
  const minWords = kind === "post"
    ? await settingNum(env, "ai_gate_min_words_post", 300)
    : kind === "landing"
      ? await settingNum(env, "ai_gate_min_words_landing", 120)
      : await settingNum(env, "ai_gate_min_words_game", 150);
  const maxSimilarity = await settingNum(env, "ai_gate_max_similarity", 0.35);
  const cands = await publishedCandidates(env, kind, payload.id || "");
  const similar = await allContentCandidates(env, payload.id || "");
  const report = checkQuality(payload.text, similar, { minWords, maxSimilarity });
  const collisionSource = kind === "landing"
    ? (await allKeywordTargets(env, payload.id || "")).map((c) => ({ id: c.id, label: c.label, keyword: c.keyword }))
    : cands.map((c) => ({ id: c.id, label: c.label, keyword: c.keyword }));
  const collisions = keywordCollisions(payload.keyword || "", collisionSource);
  const errors = [...report.errors];
  for (const c of collisions) errors.push(`Keyword "${payload.keyword}" is already targeted by "${c.label}".`);
  if (errors.length) return { ok: false, error: errors.join(" "), details: { report, collisions } };
  return { ok: true };
}
function gameText(b: Record<string, unknown>): string {
  return [b.short_description, b.long_description, b.how_to_play, b.tips].map((v) => String(v ?? "")).filter(Boolean).join(" ");
}
function postText(b: Record<string, unknown>): string {
  return [b.excerpt, b.content].map((v) => String(v ?? "")).filter(Boolean).join(" ");
}
function landingText(b: Record<string, unknown>): string {
  return [b.title, b.h1, b.subtitle, b.intro, b.sections, b.faqs].map((v) => String(v ?? "")).filter(Boolean).join(" ");
}

function secHeaders(env: Env, url?: URL): Record<string, string> {
  return securityHeaders(url ?? new URL(SITE_DEFAULT), trustedHosts(env));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const H = secHeaders(env, url);

    const declaredBytes = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(declaredBytes) && declaredBytes > DEFAULT_JSON_LIMIT) {
      return json({ error: "Payload too large." }, 413, H);
    }

    // robots.txt
    if (path === "/robots.txt") {
      const body = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${siteUrl(env)}/sitemap.xml\n`;
      return new Response(body, { headers: { "content-type": "text/plain", "Cache-Control": "public, max-age=3600", ...H } });
    }

    // sitemap.xml â€” published only, with real content timestamps when available
    if (path === "/sitemap.xml") {
      try {
        const site = siteUrl(env);
        const games = env.DB
          ? (await env.DB.prepare("SELECT slug, published_at, updated_at FROM games WHERE status='published' AND (noindex IS NULL OR noindex=0)").all<{ slug: string; published_at: string | null; updated_at: string | null }>()).results || []
          : [];
        const cats = env.DB
          ? (await env.DB.prepare("SELECT slug, updated_at FROM categories WHERE status='published'").all<{ slug: string; updated_at: string | null }>()).results || []
          : [];
        const posts = env.DB
          ? (await env.DB.prepare("SELECT slug, published_at, updated_at FROM blog_posts WHERE status='published'").all<{ slug: string; published_at: string | null; updated_at: string | null }>()).results || []
          : [];
        let landings: { slug: string; published_at: string | null; updated_at: string | null }[] = [];
        try {
          if (env.DB) landings = (await env.DB.prepare("SELECT slug, published_at, updated_at FROM landing_pages WHERE status='published' AND (noindex IS NULL OR noindex=0)").all<{ slug: string; published_at: string | null; updated_at: string | null }>()).results || [];
        } catch { landings = []; }
        // The homepage game is served at "/" (its /games/<slug> URL 301s), so list "/" and skip that slug.
        const homeSlug = homeGameSlug(await settingsMap(env));
        const homeGame = games.find((g: { slug: string }) => g.slug === homeSlug);
        const homeIsGame = Boolean(homeSlug) && Boolean(homeGame);
        const entries = [
          { loc: `${site}/`, lastmod: homeGame ? sitemapLastmod(homeGame.updated_at, homeGame.published_at) : null },
          { loc: `${site}/games`, lastmod: null },
          { loc: `${site}/categories`, lastmod: null },
          { loc: `${site}/new-games`, lastmod: null },
          { loc: `${site}/hot-games`, lastmod: null },
          { loc: `${site}/blog`, lastmod: null },
          { loc: `${site}/privacy-policy`, lastmod: null },
          { loc: `${site}/terms-of-use`, lastmod: null },
          { loc: `${site}/contact`, lastmod: null },
          ...cats.map((c: { slug: string; updated_at: string | null }) => ({ loc: `${site}/categories/${c.slug}`, lastmod: sitemapLastmod(c.updated_at, null) })),
          ...games.filter((g: { slug: string }) => !homeIsGame || g.slug !== homeSlug).map((g: { slug: string; published_at: string | null; updated_at: string | null }) => ({ loc: `${site}/games/${g.slug}`, lastmod: sitemapLastmod(g.updated_at, g.published_at) })),
          ...posts.map((p: { slug: string; published_at: string | null; updated_at: string | null }) => ({ loc: `${site}/blog/${p.slug}`, lastmod: sitemapLastmod(p.updated_at, p.published_at) })),
          ...landings.map((l: { slug: string; published_at: string | null; updated_at: string | null }) => ({ loc: `${site}/${l.slug}`, lastmod: sitemapLastmod(l.updated_at, l.published_at) })),
        ];
        return new Response(sitemapXml(entries), { headers: { "content-type": "application/xml", "Cache-Control": "public, max-age=300", ...H } });
      } catch (e) {
        return new Response("Sitemap unavailable", { status: 500, headers: H });
      }
    }

    // --- public API (resilient: missing tables -> empty fallback, frontend uses seed) ---
    if (path === "/api/games" && req.method === "GET") {
      if (!env.DB) return json([], 200, H);
      try {
        const q = url.searchParams.get("q")?.toLowerCase() ?? "";
        const rows = (await env.DB.prepare("SELECT * FROM games WHERE status='published' ORDER BY sort_order, published_at DESC LIMIT 200").all()).results as unknown[];
        const filtered = q
          ? (rows as { title: string; short_description: string; category_slug: string }[]).filter((g) =>
              [g.title, g.short_description, g.category_slug].join(" ").toLowerCase().includes(q),
            )
          : rows;
        return json(filtered, 200, H);
      } catch {
        return json([], 200, H);
      }
    }
    const gm = path.match(/^\/api\/games\/([a-z0-9-]+)$/);
    if (gm && req.method === "GET") {
      if (!env.DB) return json({ error: "Not found" }, 404, H);
      try {
        const row = await env.DB.prepare("SELECT * FROM games WHERE slug=? AND status='published'").bind(gm[1]).first();
        if (!row) return json({ error: "Not found" }, 404, H);
        return json(row, 200, H);
      } catch {
        return json({ error: "Not found" }, 404, H);
      }
    }
    const lm = path.match(/^\/api\/landing\/([a-z0-9-]+)$/);
    if (lm && req.method === "GET") {
      if (!env.DB) return json({ error: "Not found" }, 404, H);
      try {
        const lp = await env.DB.prepare("SELECT * FROM landing_pages WHERE slug=? AND status='published' AND (noindex IS NULL OR noindex=0)").bind(lm[1]).first<Record<string, unknown>>();
        if (!lp) return json({ error: "Not found" }, 404, H);
        const game = await env.DB.prepare("SELECT * FROM games WHERE id=? AND status='published'").bind(String(lp.game_id)).first<Record<string, unknown>>();
        if (!game) return json({ error: "Not found" }, 404, H);
        return json({ ...lp, game }, 200, H);
      } catch {
        return json({ error: "Not found" }, 404, H);
      }
    }
    if (path === "/api/categories" && req.method === "GET") {
      if (!env.DB) return json([], 200, H);
      try {
        const rows = (await env.DB.prepare("SELECT * FROM categories WHERE status='published' ORDER BY name").all()).results;
        return json(rows, 200, H);
      } catch {
        return json([], 200, H);
      }
    }
    if (path === "/api/posts" && req.method === "GET") {
      if (!env.DB) return json([], 200, H);
      try {
        const rows = (await env.DB.prepare("SELECT * FROM blog_posts WHERE status='published' ORDER BY published_at DESC").all()).results;
        return json(rows, 200, H);
      } catch {
        return json([], 200, H);
      }
    }
    if (path === "/api/comments" && req.method === "GET") {
      const gameId = url.searchParams.get("gameId") || "";
      if (!env.DB) return json([], 200, H);
      try {
        const rows = (await env.DB.prepare("SELECT id, game_id, display_name, body, created_at FROM comments WHERE game_id=? AND status='approved' ORDER BY created_at DESC LIMIT 50").bind(gameId).all()).results;
        return json(rows, 200, H);
      } catch {
        return json([], 200, H);
      }
    }
    if (path === "/api/comments" && req.method === "POST") {
      if (!publicOriginAllowed(req)) return json({ error: "Cross-origin comments are not allowed." }, 403, H);
      if (!isJsonRequest(req)) return json({ error: "Content-Type must be application/json." }, 415, H);
      const ip = req.headers.get("cf-connecting-ip") || "anon";
      if (!commentLimiter.check(`c:${ip}`, 5, 60_000)) return json({ error: "Rate limited. Wait a minute." }, 429, H);
      let b: { gameId?: string; displayName?: string; body?: string };
      try { b = await readJson(req); } catch { return json({ error: "Invalid JSON." }, 400, H); }
      const gameId = String(b.gameId || "").trim();
      const name = (b.displayName || "").trim();
      const body = (b.body || "").trim();
      if (!validateCommentGameId(gameId)) return json({ error: "Invalid game." }, 400, H);
      if (name.length < 2 || name.length > 40) return json({ error: "Name 2â€“40 chars." }, 400, H);
      if (body.length < 3 || body.length > 1000) return json({ error: "Comment 3â€“1000 chars." }, 400, H);
      if (/<script|javascript:|on\w+=/i.test(name + body)) return json({ error: "HTML not allowed." }, 400, H);
      if (!env.DB) return json({ error: "DB not bound" }, 500, H);
      const game = await env.DB.prepare("SELECT id FROM games WHERE id=? AND status='published'").bind(gameId).first();
      if (!game) return json({ error: "Game not found." }, 404, H);
      const dup = await env.DB.prepare("SELECT id FROM comments WHERE game_id=? AND display_name=? AND body=? AND created_at > datetime('now','-1 minute')")
        .bind(gameId, name, body).first();
      if (dup) return json({ error: "Duplicate submission blocked." }, 409, H);
      await env.DB.prepare("INSERT INTO comments (id, game_id, display_name, body, status) VALUES (?,?,?,?, 'pending')")
        .bind(newId(), gameId, name, body).run();
      return json({ ok: true, status: "pending" }, 201, H);
    }

    // Public-safe settings + ads.txt (no secrets)
    if (path === "/api/settings" && req.method === "GET") {
      if (!env.DB) return json({}, 200, H);
      try {
        const rows = (await env.DB.prepare("SELECT key, value FROM site_settings").all<{ key: string; value: string }>()).results || [];
        const all = Object.fromEntries(rows.map((r) => [r.key, r.value]));
        const pub: Record<string, string> = {};
        for (const k of PUBLIC_SETTINGS) if (all[k]) pub[k] = all[k];
        // Empty is meaningful here (disables the homepage game), so pass it through explicitly.
        if (all.home_game_slug !== undefined) pub.home_game_slug = all.home_game_slug;
        return json(pub, 200, H);
      } catch {
        return json({}, 200, H);
      }
    }
    if (path === "/ads.txt") {
      let txt = "";
      if (env.DB) {
        try {
          const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key='ads_txt'").first<{ value: string }>();
          txt = row?.value ?? "";
        } catch { txt = ""; }
      }
      return new Response(txt || "# ads.txt not configured. Owner must supply the exact authorized record from the ad provider.\n", {
        headers: { "content-type": "text/plain", "Cache-Control": "public, max-age=300", ...H },
      });
    }
    // --- auth: Cloudflare Access only (edge handles login/logout) ---
    if (path === "/api/admin/me" && req.method === "GET") {
      const principal = await requireAdmin(req, env);
      if (!principal) {
        // Say *why* the dashboard is closed: missing secrets, a team domain that does not answer,
        // or simply not signed in. No credential or secret value is ever echoed back.
        const config = accessConfig(env);
        if (!config) {
          return json(
            { error: "Cloudflare Access is not configured yet (ACCESS_TEAM_DOMAIN, ACCESS_AUD, ADMIN_EMAILS).", code: "access_not_configured" },
            503,
            H,
          );
        }
        if (!(await accessTeamReachable(config))) {
          return json(
            { error: "No Cloudflare Access team answered at the configured team domain. Create the Zero Trust application first.", code: "access_team_unreachable" },
            503,
            H,
          );
        }
        return json({ error: "Unauthorized", code: "unauthorized" }, 401, H);
      }
      const secret = adminCsrfSecret(env);
      if (!secret) return json({ error: "CSRF secret not configured." }, 503, H);
      return json({ ok: true, email: principal.email, csrf: await issueCsrfToken(secret, principal.sub) }, 200, H);
    }

    // --- protected admin CRUD (games/categories/posts/comments/settings/overview) ---
    if (path.startsWith("/api/admin/")) {
      const principal = await requireAdmin(req, env);
      if (!principal) return json({ error: "Unauthorized" }, 401, H);
      if (req.method !== "GET" && req.method !== "HEAD" && !(await adminMutationAllowed(req, env, principal))) {
        return json({ error: "CSRF check failed." }, 403, H);
      }
      if (!env.DB) return json({ error: "DB not bound" }, 500, H);

      if (path === "/api/admin/overview") {
        const q = async (sql: string) => {
          try { return (await env.DB!.prepare(sql).first<{ n: number }>())?.n ?? 0; } catch { return 0; }
        };
        return json({
          publishedGames: await q("SELECT COUNT(*) n FROM games WHERE status='published'"),
          draftGames: await q("SELECT COUNT(*) n FROM games WHERE status='draft'"),
          categories: await q("SELECT COUNT(*) n FROM categories"),
          pendingComments: await q("SELECT COUNT(*) n FROM comments WHERE status='pending'"),
          publishedPosts: await q("SELECT COUNT(*) n FROM blog_posts WHERE status='published'"),
          landingPages: await q("SELECT COUNT(*) n FROM landing_pages"),
          publishedLandings: await q("SELECT COUNT(*) n FROM landing_pages WHERE status='published'"),
          adUnits: await q("SELECT COUNT(*) n FROM ad_units"),
        }, 200, H);
      }
      // Games: list/search/paginate, get one, create, update, delete
      if (path === "/api/admin/games" && req.method === "GET") {
        const q = (url.searchParams.get("q") || "").toLowerCase();
        const status = url.searchParams.get("status") || "";
        const page = Math.max(1, Number(url.searchParams.get("page") || 1));
        const rows = (await env.DB.prepare("SELECT * FROM games ORDER BY updated_at DESC LIMIT 200").all()).results as Record<string, unknown>[];
        let list = rows;
        if (status) list = list.filter((r) => String(r.status) === status);
        if (q) list = list.filter((r) => `${r.title} ${r.slug}`.toLowerCase().includes(q));
        return json({ rows: list.slice((page - 1) * 50, page * 50), total: list.length }, 200, H);
      }
      if (path === "/api/admin/games" && req.method === "POST") {
        let b: Record<string, unknown>;
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const title = String(b.title || "").trim();
        let slug = String(b.slug || "").trim().toLowerCase();
        const gameUrl = String(b.game_url || b.gameUrl || "").trim();
        const thumb = String(b.thumbnail_url || b.thumbnailUrl || "").trim();
        const icon = String(b.icon_url || "").trim();
        if (title.length < 2) return json({ error: "Title required." }, 400, H);
        if (!slug) slug = slugify(title);
        if (!validSlug(slug)) return json({ error: "Invalid slug. Use lowercase letters, numbers and single hyphens (e.g. wave-rider)." }, 400, H);
        const gv = validateGameUrl(gameUrl, trustedHosts(env), siteHost(env));
        if (!gv.ok) return json({ error: `Invalid game URL: ${gv.error}` }, 400, H);
        if (!validateImageUrl(thumb)) return json({ error: "Invalid thumbnail URL (jpg/png/webp)." }, 400, H);
        if (icon && !validateImageUrl(icon)) return json({ error: "Invalid icon URL." }, 400, H);
        const id = newId();
        const now = new Date().toISOString();
        const status = ["draft", "published", "archived"].includes(String(b.status)) ? String(b.status) : "draft";
        if (status === "published") {
          const gate = await runPublishGate(env, "game", { text: gameText(b), keyword: String(b.focus_keyword || "") });
          if (!gate.ok) return json({ error: `Cannot publish: ${gate.error}`, details: gate.details }, 422, H);
        }
        await env.DB.prepare(
          "INSERT INTO games (id,title,slug,game_url,thumbnail_url,icon_url,short_description,long_description,how_to_play,controls,tips,faqs,category_slug,seo_title,meta_description,focus_keyword,related_keywords,canonical_url,social_image,og_title,og_description,noindex,status,is_featured,is_new,is_hot,sort_order,allow_fullscreen,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).bind(id, title, slug, gameUrl, thumb, icon || null, String(b.short_description || ""), sanitizeHtml(String(b.long_description || "")), sanitizeHtml(String(b.how_to_play || "")) || null, sanitizeHtml(String(b.controls || "")) || null, sanitizeHtml(String(b.tips || "")) || null, sanitizeHtml(String(b.faqs || "")) || null, String(b.category_slug || "arcade-games"), String(b.seo_title || "") || null, String(b.meta_description || "") || null, String(b.focus_keyword || "") || null, String(b.related_keywords || "") || null, String(b.canonical_url || "") || null, String(b.social_image || "") || null, String(b.og_title || "") || null, String(b.og_description || "") || null, b.noindex ? 1 : 0, status, b.is_featured ? 1 : 0, b.is_new ? 1 : 0, b.is_hot ? 1 : 0, Number(b.sort_order || 0), b.allow_fullscreen === 0 || b.allow_fullscreen === false ? 0 : 1, status === "published" ? now : null, now, now).run().catch((e: unknown) => {
          throw e;
        });
        return json({ ok: true, id }, 201, H);
      }
      const gOne = path.match(/^\/api\/admin\/games\/([^/]+)$/);
      if (gOne && req.method === "GET") {
        const row = await env.DB.prepare("SELECT * FROM games WHERE id=?").bind(gOne[1]).first();
        if (!row) return json({ error: "Not found" }, 404, H);
        return json(row, 200, H);
      }
      if (gOne && (req.method === "PUT" || req.method === "PATCH")) {
        let b: Record<string, unknown>;
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const cur = await env.DB.prepare("SELECT * FROM games WHERE id=?").bind(gOne[1]).first<Record<string, unknown>>();
        if (!cur) return json({ error: "Not found" }, 404, H);
        const title = String(b.title ?? cur.title).trim();
        let slug = String(b.slug ?? cur.slug ?? "").trim().toLowerCase();
        const gameUrl = String(b.game_url ?? cur.game_url).trim();
        const thumb = String(b.thumbnail_url ?? cur.thumbnail_url).trim();
        if (!slug) slug = slugify(title);
        if (!validSlug(slug)) return json({ error: "Invalid slug. Use lowercase letters, numbers and single hyphens (e.g. wave-rider)." }, 400, H);
        const gv = validateGameUrl(gameUrl, trustedHosts(env), siteHost(env));
        if (!gv.ok) return json({ error: `Invalid game URL: ${gv.error}` }, 400, H);
        if (!validateImageUrl(thumb)) return json({ error: "Invalid thumbnail URL." }, 400, H);
        const status = ["draft", "published", "archived"].includes(String(b.status ?? cur.status)) ? String(b.status ?? cur.status) : "draft";
        if (status === "published") {
          const merged = { ...cur, ...b } as Record<string, unknown>;
          const gate = await runPublishGate(env, "game", { id: gOne[1], text: gameText(merged), keyword: String(b.focus_keyword ?? cur.focus_keyword ?? "") });
          if (!gate.ok) return json({ error: `Cannot publish: ${gate.error}`, details: gate.details }, 422, H);
        }
        await env.DB.prepare("UPDATE games SET title=?,slug=?,game_url=?,thumbnail_url=?,icon_url=?,short_description=?,long_description=?,how_to_play=?,controls=?,tips=?,faqs=?,category_slug=?,seo_title=?,meta_description=?,focus_keyword=?,related_keywords=?,canonical_url=?,social_image=?,og_title=?,og_description=?,noindex=?,status=?,is_featured=?,is_new=?,is_hot=?,sort_order=?,allow_fullscreen=?,published_at=COALESCE(published_at,?),updated_at=datetime('now') WHERE id=?")
          .bind(title, slug, gameUrl, thumb, String(b.icon_url ?? cur.icon_url ?? "") || null,           String(b.short_description ?? cur.short_description ?? ""), sanitizeHtml(String(b.long_description ?? cur.long_description ?? "")), sanitizeHtml(String(b.how_to_play ?? cur.how_to_play ?? "")) || null, sanitizeHtml(String(b.controls ?? cur.controls ?? "")) || null, sanitizeHtml(String(b.tips ?? cur.tips ?? "")) || null, sanitizeHtml(String(b.faqs ?? cur.faqs ?? "")) || null, String(b.category_slug ?? cur.category_slug ?? "arcade-games"), String(b.seo_title ?? cur.seo_title ?? "") || null, String(b.meta_description ?? cur.meta_description ?? "") || null, String(b.focus_keyword ?? cur.focus_keyword ?? "") || null, String(b.related_keywords ?? cur.related_keywords ?? "") || null, String(b.canonical_url ?? cur.canonical_url ?? "") || null, String(b.social_image ?? cur.social_image ?? "") || null, String(b.og_title ?? cur.og_title ?? "") || null, String(b.og_description ?? cur.og_description ?? "") || null, (b.noindex ?? cur.noindex) ? 1 : 0, status, (b.is_featured ?? cur.is_featured) ? 1 : 0, (b.is_new ?? cur.is_new) ? 1 : 0, (b.is_hot ?? cur.is_hot) ? 1 : 0, Number(b.sort_order ?? cur.sort_order ?? 0), (b.allow_fullscreen ?? cur.allow_fullscreen ?? 1) ? 1 : 0, status === "published" ? new Date().toISOString() : null, gOne[1]).run();
        return json({ ok: true }, 200, H);
      }
      if (gOne && req.method === "DELETE") {
        await env.DB.prepare("DELETE FROM landing_pages WHERE game_id=?").bind(gOne[1]).run().catch(() => {});
        await env.DB.prepare("DELETE FROM games WHERE id=?").bind(gOne[1]).run();
        return json({ ok: true }, 200, H);
      }
      // Keywords & Landing Tools: list/get/create/update/delete
      if (path === "/api/admin/landings" && req.method === "GET") {
        const rows = (await env.DB.prepare("SELECT lp.*, g.title AS game_title, g.slug AS game_slug FROM landing_pages lp LEFT JOIN games g ON g.id=lp.game_id ORDER BY lp.sort_order, lp.updated_at DESC LIMIT 200").all()).results as Record<string, unknown>[];
        return json({ rows, total: rows.length }, 200, H);
      }
      if (path === "/api/admin/landings" && req.method === "POST") {
        let b: Record<string, unknown>;
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const title = String(b.title || "").trim();
        if (title.length < 2) return json({ error: "Title required." }, 400, H);
        const gameId = String(b.game_id || b.gameId || "").trim();
        const game = gameId ? await env.DB.prepare("SELECT id,title,slug,short_description,status FROM games WHERE id=?").bind(gameId).first<Record<string, unknown>>() : null;
        if (!game) return json({ error: "Choose a game for this landing page." }, 400, H);
        let slug = String(b.slug || "").trim().toLowerCase();
        if (!slug) slug = slugify(String(b.focus_keyword || "") || title);
        if (!validateLandingSlug(slug)) return json({ error: "Invalid slug. Use lowercase letters, numbers and single hyphens; reserved site routes are not allowed." }, 400, H);
        const keyword = String(b.focus_keyword || "").trim();
        const subtitle = cleanLandingSubtitle(b.subtitle);
        const toolType = normalizeLandingTool(b.tool_type);
        const status = b.status === "published" ? "published" : "draft";
        if (status === "published") {
          if (String(game.status) !== "published") return json({ error: "Cannot publish: the linked game must be published first." }, 422, H);
          if (!keyword) return json({ error: "Cannot publish: a target keyword is required." }, 422, H);
          const gate = await runPublishGate(env, "landing", { text: landingText({ ...b, title, subtitle }), keyword });
          if (!gate.ok) return json({ error: `Cannot publish: ${gate.error}`, details: gate.details }, 422, H);
        }
        const id = newId();
        const now = new Date().toISOString();
        try {
          await env.DB.prepare("INSERT INTO landing_pages (id,game_id,badge,slug,focus_keyword,language,intent,title,h1,subtitle,tool_type,meta_description,intro,sections,faqs,related_keywords,canonical_url,og_title,og_description,social_image,noindex,status,sort_order,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(id, gameId, String(b.badge || "").slice(0, 40), slug, keyword, supportedSiteLanguage(b.language).slice(0, 40), String(b.intent || "play/transactional").slice(0, 40), title, String(b.h1 || "").slice(0, 200), subtitle, toolType, String(b.meta_description || "").slice(0, 160), sanitizeHtml(String(b.intro || "")), sanitizeHtml(String(b.sections || "")), sanitizeHtml(String(b.faqs || "")), String(b.related_keywords || "") || null, String(b.canonical_url || "") || null, String(b.og_title || "") || null, String(b.og_description || "") || null, String(b.social_image || "") || null, b.noindex ? 1 : 0, status, Number(b.sort_order || 0), status === "published" ? now : null, now, now).run();
        } catch (e) {
          if (/UNIQUE/i.test(String((e as Error).message || ""))) return json({ error: "That slug is already used by another landing page." }, 409, H);
          throw e;
        }
        return json({ ok: true, id, slug }, 201, H);
      }
      const lOne = path.match(/^\/api\/admin\/landings\/([^/]+)$/);
      if (lOne && req.method === "GET") {
        const row = await env.DB.prepare("SELECT * FROM landing_pages WHERE id=?").bind(lOne[1]).first();
        if (!row) return json({ error: "Not found" }, 404, H);
        return json(row, 200, H);
      }
      if (lOne && (req.method === "PUT" || req.method === "PATCH")) {
        let b: Record<string, unknown>;
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const cur = await env.DB.prepare("SELECT * FROM landing_pages WHERE id=?").bind(lOne[1]).first<Record<string, unknown>>();
        if (!cur) return json({ error: "Not found" }, 404, H);
        const title = String(b.title ?? cur.title).trim();
        if (title.length < 2) return json({ error: "Title required." }, 400, H);
        const gameId = String(b.game_id ?? b.gameId ?? cur.game_id).trim();
        const game = await env.DB.prepare("SELECT id,title,slug,short_description,status FROM games WHERE id=?").bind(gameId).first<Record<string, unknown>>();
        if (!game) return json({ error: "Choose a game for this landing page." }, 400, H);
        let slug = String(b.slug ?? cur.slug ?? "").trim().toLowerCase();
        if (!slug) slug = slugify(String(b.focus_keyword ?? cur.focus_keyword ?? "") || title);
        if (!validateLandingSlug(slug)) return json({ error: "Invalid slug. Use lowercase letters, numbers and single hyphens; reserved site routes are not allowed." }, 400, H);
        const keyword = String(b.focus_keyword ?? cur.focus_keyword ?? "").trim();
        const subtitle = cleanLandingSubtitle(b.subtitle ?? cur.subtitle);
        const toolType = normalizeLandingTool(b.tool_type ?? cur.tool_type);
        const status = String(b.status ?? cur.status) === "published" ? "published" : "draft";
        if (status === "published") {
          if (String(game.status) !== "published") return json({ error: "Cannot publish: the linked game must be published first." }, 422, H);
          if (!keyword) return json({ error: "Cannot publish: a target keyword is required." }, 422, H);
          const merged = { ...cur, ...b, title, subtitle, tool_type: toolType };
          const gate = await runPublishGate(env, "landing", { id: lOne[1], text: landingText(merged), keyword });
          if (!gate.ok) return json({ error: `Cannot publish: ${gate.error}`, details: gate.details }, 422, H);
        }
        try {
          await env.DB.prepare("UPDATE landing_pages SET game_id=?,badge=?,slug=?,focus_keyword=?,language=?,intent=?,title=?,h1=?,subtitle=?,tool_type=?,meta_description=?,intro=?,sections=?,faqs=?,related_keywords=?,canonical_url=?,og_title=?,og_description=?,social_image=?,noindex=?,status=?,sort_order=?,published_at=COALESCE(published_at,?),updated_at=datetime('now') WHERE id=?")
            .bind(gameId, String(b.badge ?? cur.badge ?? "").slice(0, 40), slug, keyword, String(b.language ?? cur.language ?? "English").slice(0, 40), String(b.intent ?? cur.intent ?? "play/transactional").slice(0, 40), title, String(b.h1 ?? cur.h1 ?? "").slice(0, 200), subtitle, toolType, String(b.meta_description ?? cur.meta_description ?? "").slice(0, 160), sanitizeHtml(String(b.intro ?? cur.intro ?? "")), sanitizeHtml(String(b.sections ?? cur.sections ?? "")), sanitizeHtml(String(b.faqs ?? cur.faqs ?? "")), String(b.related_keywords ?? cur.related_keywords ?? "") || null, String(b.canonical_url ?? cur.canonical_url ?? "") || null, String(b.og_title ?? cur.og_title ?? "") || null, String(b.og_description ?? cur.og_description ?? "") || null, String(b.social_image ?? cur.social_image ?? "") || null, (b.noindex ?? cur.noindex) ? 1 : 0, status, Number(b.sort_order ?? cur.sort_order ?? 0), status === "published" ? new Date().toISOString() : null, lOne[1]).run();
        } catch (e) {
          if (/UNIQUE/i.test(String((e as Error).message || ""))) return json({ error: "That slug is already used by another landing page." }, 409, H);
          throw e;
        }
        return json({ ok: true, slug }, 200, H);
      }
      if (lOne && req.method === "DELETE") {
        await env.DB.prepare("DELETE FROM landing_pages WHERE id=?").bind(lOne[1]).run();
        return json({ ok: true }, 200, H);
      }
      // Categories CRUD
      if (path === "/api/admin/categories" && req.method === "GET") {
        const rows = (await env.DB.prepare("SELECT * FROM categories ORDER BY name LIMIT 200").all()).results;
        return json(rows, 200, H);
      }
      if (path === "/api/admin/categories" && req.method === "POST") {
        let b: Record<string, unknown>;
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const name = String(b.name || "").trim();
        const slug = String(b.slug || "").trim().toLowerCase();
        if (name.length < 2) return json({ error: "Name required." }, 400, H);
        if (!validSlug(slug)) return json({ error: "Invalid slug." }, 400, H);
        await env.DB.prepare("INSERT INTO categories (id,name,slug,description,image_url,seo_title,meta_description,status) VALUES (?,?,?,?,?,?,?,?)")
          .bind(newId(), name, slug, String(b.description || ""), String(b.image_url || "") || null, String(b.seo_title || "") || null, String(b.meta_description || "") || null, b.status === "draft" ? "draft" : "published").run();
        return json({ ok: true }, 201, H);
      }
      const cOne = path.match(/^\/api\/admin\/categories\/([^/]+)$/);
      if (cOne && req.method === "DELETE") {
        await env.DB.prepare("DELETE FROM categories WHERE id=?").bind(cOne[1]).run();
        return json({ ok: true }, 200, H);
      }
      // Blog CRUD
      if (path === "/api/admin/posts" && req.method === "GET") {
        const q = (url.searchParams.get("q") || "").toLowerCase();
        const rows = (await env.DB.prepare("SELECT * FROM blog_posts ORDER BY updated_at DESC LIMIT 200").all()).results as Record<string, unknown>[];
        return json(q ? rows.filter((r) => `${r.title} ${r.slug}`.toLowerCase().includes(q)) : rows, 200, H);
      }
      if (path === "/api/admin/posts" && req.method === "POST") {
        let b: Record<string, unknown>;
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const title = String(b.title || "").trim();
        const slug = String(b.slug || "").trim().toLowerCase();
        if (title.length < 2) return json({ error: "Title required." }, 400, H);
        if (!validSlug(slug)) return json({ error: "Invalid slug." }, 400, H);
        const now = new Date().toISOString();
        const status = b.status === "published" ? "published" : "draft";
        if (status === "published") {
          const gate = await runPublishGate(env, "post", { text: postText(b), keyword: String(b.focus_keyword || "") });
          if (!gate.ok) return json({ error: `Cannot publish: ${gate.error}`, details: gate.details }, 422, H);
        }
        await env.DB.prepare("INSERT INTO blog_posts (id,title,slug,excerpt,content,cover_url,author,seo_title,meta_description,focus_keyword,related_keywords,canonical_url,social_image,og_title,og_description,tags,category,h1,language,intent,related_tool,status,published_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(newId(), title, slug, String(b.excerpt || ""), sanitizeHtml(String(b.content || "")), String(b.cover_url || "") || null, String(b.author || "") || null, String(b.seo_title || "") || null, String(b.meta_description || "") || null, String(b.focus_keyword || "") || null, String(b.related_keywords || "") || null, String(b.canonical_url || "") || null, String(b.social_image || "") || null, String(b.og_title || "") || null, String(b.og_description || "") || null, String(b.tags || "") || null, String(b.category || "") || null, String(b.h1 || "") || null, supportedSiteLanguage(b.language), String(b.intent || "") || null, String(b.related_tool || "") || null, status, status === "published" ? now : null, now).run();
        return json({ ok: true }, 201, H);
      }
      const pOne = path.match(/^\/api\/admin\/posts\/([^/]+)$/);
      if (pOne && req.method === "GET") {
        const row = await env.DB.prepare("SELECT * FROM blog_posts WHERE id=?").bind(pOne[1]).first();
        if (!row) return json({ error: "Not found" }, 404, H);
        return json(row, 200, H);
      }
      if (pOne && (req.method === "PUT" || req.method === "PATCH")) {
        let b: Record<string, unknown>;
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const cur = await env.DB.prepare("SELECT * FROM blog_posts WHERE id=?").bind(pOne[1]).first<Record<string, unknown>>();
        if (!cur) return json({ error: "Not found" }, 404, H);
        const title = String(b.title ?? cur.title).trim();
        const slug = String(b.slug ?? cur.slug).trim().toLowerCase();
        if (title.length < 2) return json({ error: "Title required." }, 400, H);
        if (!validSlug(slug)) return json({ error: "Invalid slug." }, 400, H);
        const status = String(b.status ?? cur.status) === "published" ? "published" : "draft";
        if (status === "published") {
          const merged = { ...cur, ...b } as Record<string, unknown>;
          const gate = await runPublishGate(env, "post", { id: pOne[1], text: postText(merged), keyword: String(b.focus_keyword ?? cur.focus_keyword ?? "") });
          if (!gate.ok) return json({ error: `Cannot publish: ${gate.error}`, details: gate.details }, 422, H);
        }
        await env.DB.prepare("UPDATE blog_posts SET title=?,slug=?,excerpt=?,content=?,cover_url=?,author=?,seo_title=?,meta_description=?,focus_keyword=?,related_keywords=?,canonical_url=?,social_image=?,og_title=?,og_description=?,tags=?,category=?,h1=?,language=?,intent=?,related_tool=?,status=?,published_at=COALESCE(published_at,?),updated_at=datetime('now') WHERE id=?")
          .bind(title, slug, String(b.excerpt ?? cur.excerpt ?? ""), sanitizeHtml(String(b.content ?? cur.content ?? "")), String(b.cover_url ?? cur.cover_url ?? "") || null, String(b.author ?? cur.author ?? "") || null, String(b.seo_title ?? cur.seo_title ?? "") || null, String(b.meta_description ?? cur.meta_description ?? "") || null, String(b.focus_keyword ?? cur.focus_keyword ?? "") || null, String(b.related_keywords ?? cur.related_keywords ?? "") || null, String(b.canonical_url ?? cur.canonical_url ?? "") || null, String(b.social_image ?? cur.social_image ?? "") || null, String(b.og_title ?? cur.og_title ?? "") || null, String(b.og_description ?? cur.og_description ?? "") || null, String(b.tags ?? cur.tags ?? "") || null, String(b.category ?? cur.category ?? "") || null, String(b.h1 ?? cur.h1 ?? "") || null, String(b.language ?? cur.language ?? "") || null, String(b.intent ?? cur.intent ?? "") || null, String(b.related_tool ?? cur.related_tool ?? "") || null, status, status === "published" ? new Date().toISOString() : null, pOne[1]).run();
        return json({ ok: true }, 200, H);
      }
      if (pOne && req.method === "DELETE") {
        await env.DB.prepare("DELETE FROM blog_posts WHERE id=?").bind(pOne[1]).run();
        return json({ ok: true }, 200, H);
      }
      // --- AI writer (free-tier Gemini only; keys never leave the server) ---
      if (path === "/api/admin/ai/status" && req.method === "GET") {
        let keys: { id: string; label: string; key_hint: string; model: string; active: number; requests_today: number; quota_day: string; last_used_at: string | null }[] = [];
        let tableReady = true;
        try {
          keys = ((await env.DB!.prepare("SELECT id,label,key_hint,model,active,requests_today,quota_day,last_used_at FROM ai_api_keys ORDER BY created_at").all()).results || []) as typeof keys;
        } catch { tableReady = false; }
        const day = todayKey();
        const envKey = Boolean(env.GEMINI_API_KEY && validApiKeyFormat(env.GEMINI_API_KEY));
        return json({
          configured: envKey || keys.some((k) => k.active),
          envKey, tableReady, defaultModel: DEFAULT_MODEL, models: FREE_MODELS,
          cap: await settingNum(env, "ai_daily_cap", 40),
          usedToday: keys.reduce((n, k) => n + (k.quota_day === day ? k.requests_today : 0), 0),
          gate: {
            enabled: (await settingText(env, "ai_gate_enabled", "true")) !== "false",
            minWordsGame: await settingNum(env, "ai_gate_min_words_game", 150),
            minWordsPost: await settingNum(env, "ai_gate_min_words_post", 300),
            minWordsLanding: await settingNum(env, "ai_gate_min_words_landing", 120),
            maxSimilarity: await settingNum(env, "ai_gate_max_similarity", 0.35),
          },
          keys: keys.map((k) => ({ id: k.id, label: k.label, hint: k.key_hint, model: k.model, active: k.active, requestsToday: k.quota_day === day ? k.requests_today : 0, lastUsedAt: k.last_used_at })),
        }, 200, H);
      }
      if (path === "/api/admin/ai/keys" && req.method === "POST") {
        const secret = aiKeysSecret(env);
        if (!secret) return json({ error: "AI_KEYS_SECRET is not configured (32+ chars required)." }, 503, H);
        let b: { label?: string; apiKey?: string; model?: string };
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const apiKey = String(b.apiKey || "").trim();
        if (!validApiKeyFormat(apiKey)) return json({ error: "That does not look like a valid Google AI (Gemini) API key. Paste the full key (it starts with 'AIza' or 'AQ.')." }, 400, H);
        const model = String(b.model || DEFAULT_MODEL);
        if (!isFreeModel(model)) return json({ error: "Only free-tier Gemini models are allowed." }, 400, H);
        const enc = await encryptSecret(secret, apiKey);
        await env.DB!.prepare("INSERT INTO ai_api_keys (id,label,key_enc,key_hint,model,active) VALUES (?,?,?,?,?,1)")
          .bind(newId(), String(b.label || "Gemini key").slice(0, 60), enc, keyHint(apiKey), model).run();
        return json({ ok: true, hint: keyHint(apiKey) }, 201, H);
      }
      const aiKeyOne = path.match(/^\/api\/admin\/ai\/keys\/([^/]+)$/);
      if (aiKeyOne && (req.method === "PUT" || req.method === "PATCH")) {
        const secret = aiKeysSecret(env);
        if (!secret) return json({ error: "AI_KEYS_SECRET is not configured (32+ chars required)." }, 503, H);
        let b: { label?: string; model?: string; active?: boolean; apiKey?: string };
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const cur = await env.DB!.prepare("SELECT * FROM ai_api_keys WHERE id=?").bind(aiKeyOne[1]).first<Record<string, unknown>>();
        if (!cur) return json({ error: "Key not found" }, 404, H);
        const model = String(b.model ?? cur.model);
        if (!isFreeModel(model)) return json({ error: "Only free-tier Gemini models are allowed." }, 400, H);
        let enc = String(cur.key_enc);
        let hint = String(cur.key_hint);
        if (b.apiKey) {
          const apiKey = String(b.apiKey).trim();
          if (!validApiKeyFormat(apiKey)) return json({ error: "Invalid API key format." }, 400, H);
          enc = await encryptSecret(secret, apiKey);
          hint = keyHint(apiKey);
        }
        const active = (b.active ?? Boolean(cur.active)) ? 1 : 0;
        await env.DB!.prepare("UPDATE ai_api_keys SET label=?,model=?,active=?,key_enc=?,key_hint=? WHERE id=?")
          .bind(String(b.label ?? cur.label).slice(0, 60), model, active, enc, hint, aiKeyOne[1]).run();
        return json({ ok: true }, 200, H);
      }
      if (aiKeyOne && req.method === "DELETE") {
        await env.DB!.prepare("DELETE FROM ai_api_keys WHERE id=?").bind(aiKeyOne[1]).run();
        return json({ ok: true }, 200, H);
      }
      if (path === "/api/admin/ai/test" && req.method === "POST") {
        const keys = await loadKeys(env);
        if (!keys.length) return json({ error: "No Gemini API key configured yet.", code: "no_key" }, 400, H);
        const schema = { type: "object", properties: { ok: { type: "boolean" }, message: { type: "string" } }, required: ["ok", "message"] };
        const r = await generate(env, 'Reply with JSON only: {"ok": true, "message": "connected"}', schema);
        if (!r.ok) return aiFail(r, H);
        return json({ ok: true, model: r.model }, 200, H);
      }
      if (path === "/api/admin/ai/check" && req.method === "POST") {
        let b: { kind?: string; id?: string; text?: string; keyword?: string };
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const kind = b.kind === "post" ? "post" : b.kind === "landing" ? "landing" : "game";
        const minWords = kind === "post"
          ? await settingNum(env, "ai_gate_min_words_post", 300)
          : kind === "landing"
            ? await settingNum(env, "ai_gate_min_words_landing", 120)
            : await settingNum(env, "ai_gate_min_words_game", 150);
        const maxSimilarity = await settingNum(env, "ai_gate_max_similarity", 0.35);
        const cands = await publishedCandidates(env, kind, String(b.id || ""));
        const similar = await allContentCandidates(env, String(b.id || ""));
        const report = checkQuality(String(b.text || ""), similar, { minWords, maxSimilarity });
        const collisionSource = kind === "landing" ? await allKeywordTargets(env, String(b.id || "")) : cands;
        const collisions = keywordCollisions(String(b.keyword || ""), collisionSource.map((c) => ({ id: c.id, label: c.label, keyword: c.keyword })));
        return json({ ok: report.ok && collisions.length === 0, report, collisions }, 200, H);
      }
      if (path === "/api/admin/ai/game" && req.method === "POST") {
        if (!(await withinQuota(env, await settingNum(env, "ai_daily_cap", 40)))) return json({ error: "Daily free-tier cap reached. Try again after midnight Pacific, or raise the cap in AI Writer.", code: "quota" }, 429, H);
        let b: Partial<GameCopyInput> & { gameId?: string; model?: string };
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const uniqueNotes = String(b.uniqueNotes || "").trim();
        if (uniqueNotes.length < 40) return json({ error: "Add at least 40 characters of your own first-hand notes so the copy is original (required)." }, 400, H);
        const focusKeyword = String(b.focusKeyword || "").trim();
        if (!focusKeyword) return json({ error: "A focus keyword is required." }, 400, H);
        const prompt = buildGameCopyPrompt({
          title: String(b.title || ""), category: String(b.category || ""), providerHost: String(b.providerHost || ""),
          focusKeyword, relatedKeywords: Array.isArray(b.relatedKeywords) ? b.relatedKeywords : [],
          uniqueNotes, language: supportedSiteLanguage(b.language), sections: Array.isArray(b.sections) ? b.sections : [],
          searchIntent: String(b.searchIntent || ""), gameplay: String(b.gameplay || ""),
          controls: String(b.controls || ""), instructions: String(b.instructions || ""),
        });
        const preferred = isFreeModel(String(b.model || "")) ? String(b.model) : DEFAULT_MODEL;
        const r = await generate(env, prompt, GAME_SCHEMA, preferred);
        if (!r.ok) { await logGeneration(env, "game", b.gameId || null, "", focusKeyword, r.code ?? "upstream"); return aiFail(r, H); }
        const data = extractJson<Record<string, unknown>>(r.text || "");
        if (!data) return json({ error: "The model returned no usable JSON. Try again." }, 502, H);
        data.long_description = sanitizeHtml(String(data.long_description || ""));
        data.faqs = sanitizeHtml(String(data.faqs || ""));
        await logGeneration(env, "game", b.gameId || null, String(r.model || ""), focusKeyword, null);
        return json({ ok: true, model: r.model, copy: data }, 200, H);
      }
      if (path === "/api/admin/ai/post" && req.method === "POST") {
        if (!(await withinQuota(env, await settingNum(env, "ai_daily_cap", 40)))) return json({ error: "Daily free-tier cap reached. Try again after midnight Pacific, or raise the cap in AI Writer.", code: "quota" }, 429, H);
        let b: Partial<PostInput> & { model?: string };
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const uniqueNotes = String(b.uniqueNotes || "").trim();
        if (uniqueNotes.length < 40) return json({ error: "Add at least 40 characters of your own notes so the guide is original (required)." }, 400, H);
        const targetKeyword = String(b.targetKeyword || "").trim();
        if (!targetKeyword) return json({ error: "A target keyword is required." }, 400, H);
        const prompt = buildPostPrompt({
          targetKeyword, language: supportedSiteLanguage(b.language), intent: String(b.intent || "informational"),
          relatedTool: String(b.relatedTool || ""), workingTitle: String(b.workingTitle || ""),
          uniqueNotes, sections: Array.isArray(b.sections) ? b.sections : [],
        });
        const preferred = isFreeModel(String(b.model || "")) ? String(b.model) : DEFAULT_MODEL;
        const r = await generate(env, prompt, POST_SCHEMA, preferred);
        if (!r.ok) { await logGeneration(env, "post", null, "", targetKeyword, r.code ?? "upstream"); return aiFail(r, H); }
        const data = extractJson<Record<string, unknown>>(r.text || "");
        if (!data) return json({ error: "The model returned no usable JSON. Try again." }, 502, H);
        const rawSections = Array.isArray(data.sections) ? (data.sections as Record<string, unknown>[]) : [];
        data.sections = rawSections.slice(0, 12).map((s) => ({ heading: String(s.heading || "").slice(0, 200), body: sanitizeHtml(String(s.body || "")) }));
        // Append a deterministic "Related" block of REAL internal pages (never model-invented URLs).
        try {
          const targets = await internalTargets(env);
          const seed = [targetKeyword, String(data.title || ""), String(data.excerpt || ""), String(data.h1 || "")].join(" ");
          const html = relatedLinksHtml(rankInternalLinks(seed, targets, 3));
          const secs = data.sections as { heading: string; body: string }[];
          if (html && !secs.some((s) => /^related$/i.test(String(s.heading || "")))) secs.push({ heading: "Related", body: html });
        } catch { /* linking must never break generation */ }
        await logGeneration(env, "post", null, String(r.model || ""), targetKeyword, null);
        return json({ ok: true, model: r.model, draft: data }, 200, H);
      }
      if (path === "/api/admin/ai/landing" && req.method === "POST") {
        if (!(await withinQuota(env, await settingNum(env, "ai_daily_cap", 40)))) return json({ error: "Daily free-tier cap reached. Try again after midnight Pacific, or raise the cap in AI Writer.", code: "quota" }, 429, H);
        let b: Partial<LandingInput> & { gameId?: string; landingId?: string; model?: string };
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const uniqueNotes = String(b.uniqueNotes || "").trim();
        if (uniqueNotes.length < 40) return json({ error: "Add at least 40 characters of your own first-hand notes so the page is original (required)." }, 400, H);
        const targetKeyword = String(b.targetKeyword || "").trim();
        if (!targetKeyword) return json({ error: "A target keyword is required." }, 400, H);
        // Ground the prompt in server-side game facts, never client-supplied claims.
        let gameTitle = String(b.gameTitle || "");
        let category = String(b.category || "");
        let gameplay = String(b.gameplay || "");
        let controls = String(b.controls || "");
        let instructions = String(b.instructions || "");
        if (b.gameId) {
          try {
            const g = await env.DB!.prepare("SELECT title,short_description,how_to_play,controls,tips,category_slug FROM games WHERE id=?").bind(b.gameId).first<Record<string, unknown>>();
            if (g) {
              gameTitle = String(g.title || gameTitle);
              category = String(g.category_slug || category);
              gameplay = [gameplay, g.short_description, g.how_to_play].filter(Boolean).join(" ");
              controls = controls || String(g.controls || "");
              instructions = instructions || String(g.tips || "");
            }
          } catch { /* keep the supplied fallbacks */ }
        }
        const prompt = buildLandingPrompt({
          targetKeyword, gameTitle, category,
          language: supportedSiteLanguage(b.language), intent: String(b.intent || "play/transactional"),
          sections: Array.isArray(b.sections) ? b.sections : [], uniqueNotes,
          gameplay, controls, instructions, toolType: String(b.toolType || "game"),
        });
        const preferred = isFreeModel(String(b.model || "")) ? String(b.model) : DEFAULT_MODEL;
        const targetId = b.landingId || b.gameId || null;
        const r = await generate(env, prompt, LANDING_SCHEMA, preferred);
        if (!r.ok) { await logGeneration(env, "landing", targetId, "", targetKeyword, r.code ?? "upstream"); return aiFail(r, H); }
        const data = extractJson<Record<string, unknown>>(r.text || "");
        if (!data) return json({ error: "The model returned no usable JSON. Try again." }, 502, H);
        const rawSections = Array.isArray(data.sections) ? (data.sections as Record<string, unknown>[]) : [];
        data.sections = rawSections.slice(0, 12).map((s) => ({ heading: String(s.heading || "").slice(0, 200), body: sanitizeHtml(String(s.body || "")) }));
        data.intro = sanitizeHtml(String(data.intro || ""));
        data.faqs = sanitizeHtml(String(data.faqs || ""));
        data.badge = String(data.badge || "").slice(0, 40);
        data.seo_title = String(data.seo_title || "").slice(0, 70);
        data.h1 = String(data.h1 || "").slice(0, 80);
        data.subtitle = cleanLandingSubtitle(data.subtitle);
        data.meta_description = String(data.meta_description || "").slice(0, 160);
        data.focus_keyword = targetKeyword;
        data.related_keywords = String(data.related_keywords || "").slice(0, 300);
        data.slug_suggestion = slugify(String(data.slug_suggestion || "") || targetKeyword);
        await logGeneration(env, "landing", targetId, String(r.model || ""), targetKeyword, null);
        return json({ ok: true, model: r.model, draft: data }, 200, H);
      }
      if (path === "/api/admin/ai/section" && req.method === "POST") {
        if (!(await withinQuota(env, await settingNum(env, "ai_daily_cap", 40)))) return json({ error: "Daily free-tier cap reached. Try again later.", code: "quota" }, 429, H);
        let b: { articleTitle?: string; heading?: string; targetKeyword?: string; language?: string; uniqueNotes?: string; avoid?: string; context?: string; model?: string };
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        if (!String(b.heading || "").trim()) return json({ error: "A section heading is required." }, 400, H);
        const prompt = buildSectionPrompt({
          articleTitle: String(b.articleTitle || ""), heading: String(b.heading || ""), targetKeyword: String(b.targetKeyword || ""),
          language: supportedSiteLanguage(b.language), uniqueNotes: String(b.uniqueNotes || ""), avoid: b.avoid, context: b.context,
        });
        const preferred = isFreeModel(String(b.model || "")) ? String(b.model) : DEFAULT_MODEL;
        const r = await generate(env, prompt, SECTION_SCHEMA, preferred);
        if (!r.ok) return aiFail(r, H);
        const data = extractJson<Record<string, unknown>>(r.text || "");
        if (!data) return json({ error: "The model returned no usable JSON." }, 502, H);
        return json({ ok: true, model: r.model, section: { heading: String(data.heading || b.heading || ""), body: sanitizeHtml(String(data.body || "")) } }, 200, H);
      }
      if (path === "/api/admin/ai/keywords" && req.method === "POST") {
        if (!(await withinQuota(env, await settingNum(env, "ai_daily_cap", 40)))) return json({ error: "Daily free-tier cap reached. Try again later.", code: "quota" }, 429, H);
        let b: { seed?: string; language?: string; model?: string };
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const seed = String(b.seed || "").trim();
        if (seed.length < 2) return json({ error: "Enter a seed keyword or topic." }, 400, H);
        const existing: string[] = [];
        try {
          const gp = (await env.DB!.prepare("SELECT focus_keyword FROM games WHERE status='published' AND focus_keyword IS NOT NULL").all<{ focus_keyword: string }>()).results || [];
          for (const r of gp) if (r.focus_keyword) existing.push(r.focus_keyword);
        } catch { /* ignore */ }
        try {
          const bp = (await env.DB!.prepare("SELECT focus_keyword FROM blog_posts WHERE status='published' AND focus_keyword IS NOT NULL").all<{ focus_keyword: string }>()).results || [];
          for (const r of bp) if (r.focus_keyword) existing.push(r.focus_keyword);
        } catch { /* ignore */ }
        try {
          const lp = (await env.DB!.prepare("SELECT focus_keyword FROM landing_pages WHERE status='published' AND focus_keyword IS NOT NULL AND focus_keyword<>''").all<{ focus_keyword: string }>()).results || [];
          for (const r of lp) if (r.focus_keyword) existing.push(r.focus_keyword);
        } catch { /* ignore */ }
        const prompt = buildKeywordsPrompt(seed, supportedSiteLanguage(b.language), existing);
        const preferred = isFreeModel(String(b.model || "")) ? String(b.model) : DEFAULT_MODEL;
        const r = await generate(env, prompt, KEYWORDS_SCHEMA, preferred);
        if (!r.ok) { await logGeneration(env, "keywords", null, "", seed, r.code ?? "upstream"); return aiFail(r, H); }
        const data = extractJson<{ keywords?: { keyword: string; intent: string; note: string }[] }>(r.text || "");
        if (!data || !Array.isArray(data.keywords)) return json({ error: "The model returned no usable keywords." }, 502, H);
        await logGeneration(env, "keywords", null, String(r.model || ""), seed, null);
        const flagged = data.keywords.slice(0, 25).map((k) => ({
          keyword: String(k.keyword || "").slice(0, 120),
          intent: String(k.intent || ""),
          note: String(k.note || "").slice(0, 200),
          coveredBy: keywordCollisions(String(k.keyword || ""), existing.map((e, i) => ({ id: String(i), label: e, keyword: e }))).length > 0,
        }));
        return json({ ok: true, model: r.model, keywords: flagged }, 200, H);
      }
      if (path === "/api/admin/ai/outline" && req.method === "POST") {
        if (!(await withinQuota(env, await settingNum(env, "ai_daily_cap", 40)))) return json({ error: "Daily free-tier cap reached. Try again later.", code: "quota" }, 429, H);
        let b: Partial<OutlineInput> & { model?: string };
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const targetKeyword = String(b.targetKeyword || "").trim();
        if (!targetKeyword) return json({ error: "A target keyword is required." }, 400, H);
        const prompt = buildOutlinePrompt({
          targetKeyword, language: supportedSiteLanguage(b.language), intent: String(b.intent || "informational"),
          relatedTool: String(b.relatedTool || ""), workingTitle: String(b.workingTitle || ""), uniqueNotes: String(b.uniqueNotes || ""),
        });
        const preferred = isFreeModel(String(b.model || "")) ? String(b.model) : DEFAULT_MODEL;
        const r = await generate(env, prompt, OUTLINE_SCHEMA, preferred);
        if (!r.ok) { await logGeneration(env, "outline", null, "", targetKeyword, r.code ?? "upstream"); return aiFail(r, H); }
        const data = extractJson<{ outline?: { heading: string; level: string }[] }>(r.text || "");
        if (!data || !Array.isArray(data.outline)) return json({ error: "The model returned no usable outline." }, 502, H);
        const outline = data.outline.slice(0, 12).map((o) => ({ heading: String(o.heading || "").slice(0, 200), level: o.level === "h3" ? "h3" : "h2" }));
        await logGeneration(env, "outline", null, String(r.model || ""), targetKeyword, null);
        return json({ ok: true, model: r.model, outline }, 200, H);
      }
      if (path === "/api/admin/ai/intent" && req.method === "POST") {
        if (!(await withinQuota(env, await settingNum(env, "ai_daily_cap", 40)))) return json({ error: "Daily free-tier cap reached. Try again later.", code: "quota" }, 429, H);
        let b: { targetKeyword?: string; language?: string; model?: string };
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const targetKeyword = String(b.targetKeyword || "").trim();
        if (!targetKeyword) return json({ error: "Enter a keyword to classify." }, 400, H);
        const prompt = buildIntentPrompt(targetKeyword, supportedSiteLanguage(b.language));
        const preferred = isFreeModel(String(b.model || "")) ? String(b.model) : DEFAULT_MODEL;
        const r = await generate(env, prompt, INTENT_SCHEMA, preferred);
        if (!r.ok) { await logGeneration(env, "intent", null, "", targetKeyword, r.code ?? "upstream"); return aiFail(r, H); }
        const data = extractJson<{ intent?: string; reason?: string }>(r.text || "");
        if (!data || !data.intent) return json({ error: "The model returned no usable intent." }, 502, H);
        const allowed = ["informational", "navigational", "play/transactional"];
        const intent = allowed.includes(String(data.intent)) ? String(data.intent) : "informational";
        await logGeneration(env, "intent", null, String(r.model || ""), targetKeyword, null);
        return json({ ok: true, model: r.model, intent, reason: String(data.reason || "").slice(0, 200) }, 200, H);
      }

      // Settings (admin full, public allowlist)
      if (path === "/api/admin/settings" && req.method === "GET") {
        const rows = (await env.DB.prepare("SELECT key, value FROM site_settings").all<{ key: string; value: string }>()).results || [];
        return json(Object.fromEntries(rows.map((r) => [r.key, r.value])), 200, H);
      }
      if (path === "/api/admin/settings" && (req.method === "PUT" || req.method === "POST")) {
        let b: Record<string, string>;
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        if (b.google_verification && !tokenSafe(b.google_verification)) return json({ error: "Invalid Google token (letters/numbers/_/- only)." }, 400, H);
        if (b.bing_verification && !tokenSafe(b.bing_verification)) return json({ error: "Invalid Bing token." }, 400, H);
        for (const [k, v] of Object.entries(b)) {
          if (!/^[a-z0-9_]{2,64}$/.test(k)) continue;
          await env.DB.prepare("INSERT INTO site_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(k, String(v ?? "").slice(0, 4000)).run();
        }
        return json({ ok: true }, 200, H);
      }
      // Ad units
      if (path === "/api/admin/ads" && req.method === "GET") {
        try {
          const rows = (await env.DB.prepare("SELECT * FROM ad_units ORDER BY placement").all()).results;
          return json(rows, 200, H);
        } catch { return json([], 200, H); }
      }
      if (path === "/api/admin/ads" && req.method === "POST") {
        let b: Record<string, unknown>;
        try { b = await readJson(req); } catch { return json({ error: "Invalid JSON" }, 400, H); }
        const pub = String(b.publisher_id || "").trim();
        if (pub && !/^ca-pub-\d{10,20}$/.test(pub)) return json({ error: "Publisher ID must look like ca-pub-XXXXXXXXXXXXXXXX." }, 400, H);
        await env.DB.prepare("INSERT INTO ad_units (id,name,publisher_id,slot_id,placement,format,active,targeting) VALUES (?,?,?,?,?,?,?,?)")
          .bind(newId(), String(b.name || ""), pub, String(b.slot_id || ""), String(b.placement || "below-game"), String(b.format || "auto"), b.active ? 1 : 0, String(b.targeting || "") || null).run();
        return json({ ok: true }, 201, H);
      }
      const adOne = path.match(/^\/api\/admin\/ads\/([^/]+)$/);
      if (adOne && req.method === "DELETE") {
        await env.DB.prepare("DELETE FROM ad_units WHERE id=?").bind(adOne[1]).run();
        return json({ ok: true }, 200, H);
      }
      if (path === "/api/admin/comments" && req.method === "GET") {
        const status = url.searchParams.get("status") || "pending";
        const rows = (await env.DB.prepare("SELECT * FROM comments WHERE status=? ORDER BY created_at DESC LIMIT 100").bind(status).all()).results;
        return json(rows, 200, H);
      }
      const cMod = path.match(/^\/api\/admin\/comments\/([^/]+)\/(approve|reject|spam)$/);
      if (cMod && req.method === "POST") {
        const map: Record<string, string> = { approve: "approved", reject: "rejected", spam: "spam" };
        await env.DB.prepare("UPDATE comments SET status=? WHERE id=?").bind(map[cMod[2]], cMod[1]).run();
        return json({ ok: true }, 200, H);
      }
      const cDel = path.match(/^\/api\/admin\/comments\/([^/]+)$/);
      if (cDel && req.method === "DELETE") {
        await env.DB.prepare("DELETE FROM comments WHERE id=?").bind(cDel[1]).run();
        return json({ ok: true }, 200, H);
      }
      return json({ error: "Unknown admin route" }, 404, H);
    }

    if (req.method === "GET" && (path === "/index.html" || path === "/index.htm")) {
      return new Response(null, { status: 301, headers: { Location: "/", "Cache-Control": "public, max-age=3600", ...H } });
    }
    // Legacy legal URLs keep working via a permanent redirect to the canonical pages.
    if (req.method === "GET" && (path === "/privacy" || path === "/terms")) {
      const location = path === "/privacy" ? "/privacy-policy" : "/terms-of-use";
      return new Response(null, { status: 301, headers: { Location: location, "Cache-Control": "public, max-age=3600", ...H } });
    }
    // Admin SPA shell: Access protects it at the edge; the Worker only serves the noindex shell.
    if (req.method === "GET" && isAdminPath(path) && !path.startsWith("/api/")) {
      return adminPage(env, req, H);
    }
    // Static assets pass through only for an explicit safe allowlist.
    if (req.method === "GET" && !path.startsWith("/api/") && isAssetPassthrough(path)) {
      return assetPage(env, req, H, path);
    }
    // The homepage game lives at "/" only. Direct /games/<homeSlug> links 301 to the root
    // so there is a single canonical URL for it (no duplicate content).
    if (req.method === "GET" && path.startsWith("/games/")) {
      try {
        const homeSlug = homeGameSlug(await settingsMap(env));
        if (homeSlug && path === `/games/${homeSlug}` && env.DB) {
          const row = await env.DB
            .prepare("SELECT slug FROM games WHERE slug=? AND status='published' AND (noindex IS NULL OR noindex=0)")
            .bind(homeSlug)
            .first();
          if (row) return new Response(null, { status: 301, headers: { Location: "/", ...H } });
        }
      } catch {
        // Fall through to the normal game page if the lookup fails.
      }
    }
    // --- public HTML pages: identical SSR HTML for visitors and crawlers (no UA branching) ---
    // Base shell comes from built assets via the ASSETS binding, so hashed /assets/* paths resolve.
    // A real page route is served as HTML to every client, because link-preview bots, uptime
    // monitors and plain HTTP clients often send `Accept: */*` — answering them with a JSON 404
    // would break sharing and monitoring on a page that plainly exists. Only unknown URLs fall
    // back to JSON, and only for callers that did not ask for HTML.
    const wantsHtml = (req.headers.get("accept") || "").includes("text/html");
    if (req.method === "GET" && !path.startsWith("/api/")) {
      const route = resolvePublicRoute(path);
      if (!route) {
        // Known static assets pass through; page-like unknowns get a genuine 404.
        if (isAssetPassthrough(path) && env.ASSETS) return assetPage(env, req, H, path);
        if (!wantsHtml) return json({ error: "Not found" }, 404, H);
        return htmlPage(env, req, H, { ...notFoundPage(siteUrl(env), "Page"), verifyTags: verifyTags(await settingsMap(env)) || undefined });
      }
      try {
        const page = await buildPublicPage(env, route);
        // Search/filter views are thin duplicates of /games: keep them out of the index in raw HTML.
        if (isSearchView(path, url.search)) page.robots = "noindex, follow";
        return await htmlPage(env, req, H, page);
      } catch {
        return new Response("Temporarily unavailable.", { status: 503, headers: { "Cache-Control": "no-store", ...H } });
      }
    }

    return json({ error: "Not found" }, 404, H);
  },
};

async function assetPage(env: Env, req: Request, H: Record<string, string>, path: string): Promise<Response> {
  if (!env.ASSETS) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", ...H } });
  const res = await env.ASSETS.fetch(req);
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(H)) headers.set(key, value);
  headers.set("Cache-Control", cacheControlFor(path));
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function adminPage(env: Env, req: Request, H: Record<string, string>): Promise<Response> {
  const base = await baseShell(env, req);
  if (!base) return new Response("Admin unavailable", { status: 503, headers: { "Cache-Control": "no-store", ...H } });
  const html = base.replace(/<head([^>]*)>/i, '<head$1>\n    <meta name="robots" content="noindex">');
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...H },
  });
}

async function baseShell(env: Env, req: Request): Promise<string | null> {
  try {
    if (!env.ASSETS) return null;
    const res = await env.ASSETS.fetch(new Request(new URL("/index.html", req.url)));
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function htmlPage(env: Env, req: Request, H: Record<string, string>, page: SeoPage): Promise<Response> {
  const base = await baseShell(env, req);
  const html = base ? buildSeoDocument(base, page) : fallbackShell(page);
  const requestUrl = new URL(req.url);
  // Include the query so search views are never cached (cacheControlFor treats any query as no-store).
  const cache = page.status === 200 ? cacheControlFor(`${requestUrl.pathname}${requestUrl.search}`) : "no-store";
  const robots = String(page.robots || "").trim();
  const headers: Record<string, string> = { "content-type": "text/html; charset=utf-8", "Cache-Control": cache, ...H };
  if (robots) headers["X-Robots-Tag"] = robots;
  return new Response(html, { status: page.status, headers });
}

function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

async function settingsMap(env: Env): Promise<Record<string, string>> {
  try {
    if (!env.DB) return {};
    const rows = (await env.DB.prepare("SELECT key, value FROM site_settings").all<{ key: string; value: string }>()).results || [];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch {
    return {};
  }
}

function verifyTags(settings: Record<string, string>): string {
  const g = (settings.google_verification || "").trim();
  const bing = (settings.bing_verification || "").trim();
  return `${g && tokenSafe(g) ? `<meta name="google-site-verification" content="${esc(g)}">` : ""}${bing && tokenSafe(bing) ? `<meta name="msvalidate.01" content="${esc(bing)}">` : ""}`;
}

async function buildPublicPage(env: Env, route: NonNullable<ReturnType<typeof resolvePublicRoute>>): Promise<SeoPage> {
  const site = siteUrl(env);
  const settings = await settingsMap(env);
  const verify = verifyTags(settings) || undefined;
  const gameLink = (slug: string, title: string) => `<li><a href="/games/${esc(slug)}">${esc(title)}</a></li>`;
  const noindexPage = (what: string): SeoPage => ({ ...notFoundPage(site, what), verifyTags: verify });

  const siteName = String(settings.site_name || "").trim();
  const defaultOgImage = String(settings.default_og_image || "").trim();
  // Publisher/organization identity only when the site name is actually configured.
  const publisher = siteName ? { name: siteName, url: `${site}/` } : null;
  /**
   * Page social metadata: stored og_title/og_description overrides, and the image fallback
   * order required by the SEO policy (page social_image â†’ default_og_image â†’ real thumbnail).
   */
  const social = (opts: {
    type: "website" | "article";
    title?: unknown;
    description?: unknown;
    image?: unknown;
    fallbackImage?: unknown;
  }): PageSocial => ({
    type: opts.type,
    title: String(opts.title ?? "").trim() || null,
    description: String(opts.description ?? "").trim() || null,
    image: resolveSocialImage([String(opts.image ?? ""), defaultOgImage, String(opts.fallbackImage ?? "")], site),
    siteName: siteName || null,
  });

  const publishedGames = async (limit: number): Promise<Record<string, string>[]> => {
    try {
      if (!env.DB) return [];
      const rows = (await env.DB.prepare(`SELECT title, slug, short_description FROM games WHERE status='published' AND (noindex IS NULL OR noindex=0) ORDER BY sort_order, published_at DESC LIMIT ${limit}`).all()).results;
      return (rows || []) as Record<string, string>[];
    } catch {
      return [];
    }
  };

  const gamePageFromRow = (row: Record<string, string | number | null>, canonical: string): SeoPage => {
    const title = String(row.seo_title || `${row.title} â€” Play Free Online | SlopeCurve`);
    const desc = String(row.meta_description || row.short_description || "").slice(0, 160);
    const gameImage = resolveSocialImage([String(row.thumbnail_url ?? ""), String(row.social_image ?? "")], site);
    const faq = faqJsonLd(String(row.faqs || ""));
    const jsonLd: unknown[] = [
      videoGameJsonLd({ name: String(row.title), url: canonical, description: String(row.short_description || ""), image: gameImage }),
      breadcrumbJsonLd([
        { name: "Home", url: `${site}/` },
        { name: "Games", url: `${site}/games` },
        { name: String(row.title), url: canonical },
      ]),
    ];
    if (faq) jsonLd.push(faq);
    const long = sanitizeHtml(String(row.long_description || "")).slice(0, 4000);
    const howToPlay = String(row.how_to_play || "").trim();
    const tips = String(row.tips || "").trim();
    const faqsHtml = sanitizeHtml(String(row.faqs || "")).slice(0, 4000);
    const bodyHtml = [
      `<p>${esc(String(row.short_description || ""))}</p>`,
      long ? `<div>${long}</div>` : "",
      howToPlay ? `<h2>How to Play</h2><p>${esc(howToPlay)}</p>` : "",
      tips ? `<h2>Tips and Strategies</h2><p>${esc(tips)}</p>` : "",
      faqsHtml ? `<h2>FAQ</h2><div>${faqsHtml}</div>` : "",
      `<p>Category: <a href="/categories/${esc(String(row.category_slug || ""))}">${esc(String(row.category_slug || ""))}</a> Â· <a href="/games">All games</a></p>`,
    ].join("");
    return {
      title, description: desc, canonical, h1: String(row.title),
      bodyHtml,
      jsonLd: safeJsonLd(jsonLd),
      jsonLdId: "game",
      og: social({ type: "website", title: row.og_title, description: row.og_description, image: row.social_image, fallbackImage: row.thumbnail_url }),
      status: 200, verifyTags: verify,
    };
  };

  switch (route.kind) {
    case "home": {
      // The homepage is the configured game itself: same SSR content, canonical URL = site root.
      const homeSlug = homeGameSlug(settings);
      if (homeSlug) {
        try {
          const row = env.DB
            ? await env.DB.prepare("SELECT * FROM games WHERE slug=? AND status='published' AND (noindex IS NULL OR noindex=0)").bind(homeSlug).first<Record<string, string | number | null>>()
            : null;
          if (row) return gamePageFromRow(row, `${site}/`);
        } catch {
          // Fall back to the games listing below.
        }
      }
      const title = settings.home_title || "SlopeCurve â€” Play Free Online Games";
      const desc = settings.home_description || settings.site_description || "Play free online games: Snow Rider, Crossy Road, skiing, racing, arcade and endless runner games. No downloads.";
      const items = (await publishedGames(12)).map((g) => gameLink(String(g.slug), String(g.title))).join("");
      const organization = organizationJsonLd({ name: siteName, url: `${site}/`, logo: resolveSocialImage([String(settings.logo_url || "")], site) });
      const jsonLd: unknown[] = [
        websiteJsonLd({
          name: siteName || "SlopeCurve",
          url: `${site}/`,
          // Real public search page used by the header form (/games?q=...).
          searchUrl: `${site}/games?q={search_term_string}`,
        }),
      ];
      if (organization) jsonLd.push(organization);
      return {
        title, description: desc, canonical: `${site}/`, h1: "Play Free Online Games",
        bodyHtml: `<p>${esc(desc)}</p>${items ? `<h2>Featured games</h2><ul>${items}</ul>` : `<p><a href="/games">Browse all games</a></p>`}<p><a href="/categories">Categories</a> Â· <a href="/blog">Blog &amp; guides</a></p>`,
        jsonLd: safeJsonLd(jsonLd),
        jsonLdId: "home",
        og: social({ type: "website", image: defaultOgImage }),
        status: 200, verifyTags: verify,
      };
    }
    case "games":
    case "new-games":
    case "hot-games": {
      const labels = { games: ["All Games", "Browse all published games on SlopeCurve."], "new-games": ["New Games", "Recently added games on SlopeCurve, by publication date."], "hot-games": ["Hot Games", "Editorial hot picks on SlopeCurve."] } as const;
      const items = (await publishedGames(48)).map((g) => gameLink(String(g.slug), String(g.title))).join("");
      return {
        title: `${labels[route.kind][0]} | SlopeCurve`, description: labels[route.kind][1],
        canonical: `${site}/${route.kind === "games" ? "games" : route.kind}`,
        h1: labels[route.kind][0],
        bodyHtml: items ? `<ul>${items}</ul>` : `<p>No published games yet.</p>`,
        og: social({ type: "website", image: defaultOgImage }),
        status: 200, verifyTags: verify,
      };
    }
    case "categories": {
      let cats: { name: string; slug: string; description: string }[] = [];
      try {
        if (env.DB) cats = ((await env.DB.prepare("SELECT name, slug, description FROM categories WHERE status='published' ORDER BY name").all()).results || []) as typeof cats;
      } catch { cats = []; }
      return {
        title: "Game Categories | SlopeCurve", description: "Browse Snow Rider, Crossy Road, skiing, racing, arcade and endless runner categories.",
        canonical: `${site}/categories`, h1: "Categories",
        bodyHtml: cats.length ? `<ul>${cats.map((c) => `<li><a href="/categories/${esc(c.slug)}">${esc(c.name)}</a> â€” ${esc(c.description || "")}</li>`).join("")}</ul>` : "<p>No categories yet.</p>",
        og: social({ type: "website", image: defaultOgImage }),
        status: 200, verifyTags: verify,
      };
    }
    case "blog": {
      let posts: { title: string; slug: string; excerpt: string }[] = [];
      try {
        if (env.DB) posts = ((await env.DB.prepare("SELECT title, slug, excerpt FROM blog_posts WHERE status='published' ORDER BY published_at DESC").all()).results || []) as typeof posts;
      } catch { posts = []; }
      return {
        title: "Blog & Guides | SlopeCurve", description: "Gaming guides: how to play Snow Rider, Crossy Road tips, skiing and racing guides.",
        canonical: `${site}/blog`, h1: "Blog & Guides",
        bodyHtml: posts.length ? `<ul>${posts.map((p) => `<li><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a> â€” ${esc(p.excerpt || "")}</li>`).join("")}</ul>` : "<p>No articles yet.</p>",
        og: social({ type: "website", image: defaultOgImage }),
        status: 200, verifyTags: verify,
      };
    }
    case "game": {
      let row: Record<string, string | number | null> | null = null;
      try {
        if (env.DB) row = await env.DB.prepare("SELECT * FROM games WHERE slug=? AND status='published' AND (noindex IS NULL OR noindex=0)").bind(route.slug).first();
      } catch { row = null; }
      if (!row) return noindexPage("Game");
      return gamePageFromRow(row, String(row.canonical_url || `${site}/games/${row.slug}`));
    }
    case "category": {
      let cat: { name: string; slug: string; description: string; image_url?: string | null } | null = null;
      try {
        if (env.DB) cat = await env.DB.prepare("SELECT name, slug, description, image_url FROM categories WHERE slug=? AND status='published'").bind(route.slug).first();
      } catch { cat = null; }
      if (!cat) return noindexPage("Category");
      let items: Record<string, string>[] = [];
      try {
        if (env.DB) items = ((await env.DB.prepare("SELECT title, slug FROM games WHERE category_slug=? AND status='published' ORDER BY sort_order LIMIT 48").bind(route.slug).all()).results || []) as typeof items;
      } catch { items = []; }
      return {
        title: `${cat.name} | SlopeCurve`, description: String(cat.description || `${cat.name} games on SlopeCurve.`).slice(0, 160),
        canonical: `${site}/categories/${cat.slug}`, h1: cat.name,
        bodyHtml: `<p>${esc(cat.description || "")}</p>${items.length ? `<ul>${items.map((g) => gameLink(String(g.slug), String(g.title))).join("")}</ul>` : "<p>No published games in this category yet.</p>"}`,
        og: social({ type: "website", image: defaultOgImage, fallbackImage: cat.image_url }),
        status: 200, verifyTags: verify,
      };
    }
    case "post": {
      let post: Record<string, string | null> | null = null;
      try {
        if (env.DB) post = await env.DB.prepare("SELECT * FROM blog_posts WHERE slug=? AND status='published'").bind(route.slug).first();
      } catch { post = null; }
      if (!post) return noindexPage("Article");
      const title = String(post.seo_title || post.title);
      const desc = String(post.meta_description || post.excerpt || "").slice(0, 160);
      const canonical = String(post.canonical_url || `${site}/blog/${post.slug}`);
      const headline = String(post.h1 || post.title);
      const articleImage = resolveSocialImage([String(post.social_image || ""), defaultOgImage, String(post.cover_url || "")], site);
      const article = articleJsonLd({
        headline,
        description: desc,
        url: canonical,
        image: articleImage,
        datePublished: post.published_at,
        dateModified: post.updated_at,
        author: post.author,
        publisher,
      });
      const crumbs = breadcrumbJsonLd([
        { name: "Home", url: `${site}/` },
        { name: "Blog", url: `${site}/blog` },
        { name: headline, url: canonical },
      ]);
      return {
        title: `${title} | SlopeCurve`, description: desc, canonical,
        h1: headline,
        bodyHtml: `<p>${esc(String(post.excerpt || ""))}</p><div>${sanitizeHtml(String(post.content || "")).slice(0, 6000)}</div>`,
        jsonLd: safeJsonLd([article, crumbs]),
        jsonLdId: "post",
        og: social({ type: "article", title: post.og_title, description: post.og_description, image: post.social_image, fallbackImage: post.cover_url }),
        status: 200, verifyTags: verify,
      };
    }
    case "landing": {
      let lp: Record<string, string | number | null> | null = null;
      let game: Record<string, string | number | null> | null = null;
      try {
        if (env.DB) {
          lp = await env.DB.prepare("SELECT * FROM landing_pages WHERE slug=? AND status='published' AND (noindex IS NULL OR noindex=0)").bind(route.slug).first();
          if (lp) game = await env.DB.prepare("SELECT * FROM games WHERE id=? AND status='published' AND (noindex IS NULL OR noindex=0)").bind(String(lp.game_id)).first();
        }
      } catch { lp = null; }
      if (!lp || !game) return noindexPage("Page");
      const canonical = String(lp.canonical_url || `${site}/${lp.slug}`);
      const title = String(lp.title);
      const subtitle = String(lp.subtitle || "").trim();
      const toolLabel = landingToolLabel(lp.tool_type);
      const desc = String(lp.meta_description || subtitle || game.short_description || "").slice(0, 160);
      const h1 = String(lp.h1 || lp.title);
      const homeSlug = homeGameSlug(settings);
      const gameUrl = homeSlug && String(game.slug) === homeSlug ? `${site}/` : `${site}/games/${game.slug}`;
      const gameHref = homeSlug && String(game.slug) === homeSlug ? "/" : `/games/${esc(String(game.slug))}`;
      const faq = faqJsonLd(String(lp.faqs || ""));
      const jsonLd: unknown[] = [
        videoGameJsonLd({
          name: String(game.title),
          url: canonical,
          description: desc,
          image: resolveSocialImage([String(game.thumbnail_url || "")], site),
        }),
        breadcrumbJsonLd([
          { name: "Home", url: `${site}/` },
          { name: "Games", url: `${site}/games` },
          { name: String(game.title), url: gameUrl },
          { name: h1, url: canonical },
        ]),
      ];
      if (faq) jsonLd.push(faq);
      return {
        title, description: desc, canonical, h1,
        bodyHtml: `${subtitle ? `<p class="game-subtitle">${esc(subtitle)}</p>` : ""}${normalizeLandingTool(lp.tool_type) !== "game" ? `<p class="tag-chip">${esc(toolLabel)}</p>` : ""}${lp.intro ? `<div>${sanitizeHtml(String(lp.intro))}</div>` : ""}<div>${sanitizeHtml(String(lp.sections || "")).slice(0, 6000)}</div>${lp.faqs ? `<div>${sanitizeHtml(String(lp.faqs)).slice(0, 4000)}</div>` : ""}<p><a href="${gameHref}">Play ${esc(String(game.title))} â€” full game page</a></p>`,
        jsonLd: safeJsonLd(jsonLd),
        jsonLdId: "landing",
        og: social({ type: "website", title: lp.og_title, description: lp.og_description, image: lp.social_image, fallbackImage: game.thumbnail_url }),
        status: 200, verifyTags: verify,
      };
    }
    case "legal": {
      const content = legalPage(route.page, settings.contact_email);
      return {
        title: content.title,
        description: content.description,
        canonical: `${site}/${route.page}`,
        h1: content.h1,
        bodyHtml: content.bodyHtml,
        og: social({ type: "website", image: defaultOgImage }),
        status: 200,
        verifyTags: verify,
      };
    }
    case "static": {
      const pages: Record<string, { t: string; d: string }> = {
        about: { t: "About SlopeCurve", d: "SlopeCurve is a lightweight portal for free browser games." },
        privacy: { t: "Privacy Policy", d: "Minimal data collection: comments and optional analytics only." },
        terms: { t: "Terms of Use", d: "External games are hosted by their providers where embedding is permitted." },
        faq: { t: "FAQ", d: "Frequently asked questions about playing games on SlopeCurve." },
      };
      const p = pages[route.page];
      return { title: `${p.t} | SlopeCurve`, description: p.d, canonical: `${site}/${route.page}`, h1: p.t, bodyHtml: `<p>${esc(p.d)}</p>`, og: social({ type: "website", image: defaultOgImage }), status: 200, verifyTags: verify };
    }
  }
}
