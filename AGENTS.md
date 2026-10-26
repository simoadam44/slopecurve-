# AGENTS.md — SlopeCurve

## Architecture
- `src/`: React 18 + Vite 6 + TS strict + React Router. Pure black `#000` background, no patterns/shapes, cyan `#22d3ee`/blue accents.
- Layout: `.container` max-width 1440px. Game detail = `.game-layout` (`minmax(0,1fr) 400px`, rail collapses under 1200px) with player first, a `.player-meta` title+badge bar, `.game-panel` slate card (`--panel #141c2e`), and a sticky `.rail` of `.rail-grid` 3-col `.rail-tile`s. Speed rules: no extra network calls, rail images `loading="lazy" decoding="async"` with explicit width/height, `content-visibility: auto` + `contain-intrinsic-size` on below-fold/tile content, player stays `loading="eager"`.
- `src/worker.ts`: Cloudflare Worker API + sitemap/robots. D1 binding `DB`.
- `migrations/0002_admin_cms.sql`: games og_*, blog focus/related/canonical/social/og/tags/category, admin_users.salt, ad_units.
- `migrations/0003_ai.sql` / `0004_ai_guides.sql`: `ai_api_keys` (encrypted keyring), `ai_generation_log`, blog `h1/language/intent/related_tool`.
- `migrations/0005_landing_tools.sql`: `landing_pages` (game-linked keyword landing pages rendered at the site root).
- `migrations/0006_landing_tool_fields.sql`: landing `subtitle` (short deck under the H1) + `tool_type` (`game|video|arcade|puzzle|other`).
- AI: `src/lib/aiContent.ts` (similarity/gate), `src/lib/aiModels.ts` (verified free-tier allowlist), `src/lib/aiCrypto.ts` (AES-GCM key-at-rest), `src/lib/aiErrors.ts` (normalized upstream error codes), `src/lib/aiPrompt.ts` (prompts+schemas, incl. outline/intent), `src/lib/internalLinks.ts` (deterministic real-page links), `src/pages/admin/AiWriter.tsx` (UI).
- Seed fallback `src/data/seed.ts` for preview; production reads D1 via `/api/*`.
- Homepage: `/` renders the configured homepage game in place (`site_settings.home_game_slug`, default `slope-rider-2`, editable in Admin → General; blank = show the games listing) without changing the URL. `/games/<homeSlug>` 301s to `/`; `/` is its canonical; client `HomeRoute` renders the same page; missing/unpublished game falls back to the listing; sitemap lists `/` and omits that game's `/games/<slug>`.
- Keywords & Landing Tools (Admin → Keywords & Tools): each `landing_pages` row targets one long-tail keyword and links to a game. Public URL is root-level `/<slug>`; reserved single segments (`src/lib/landingSlugs.ts`) never resolve to a landing page. SSR + client `LandingPage` render the player, subtitle, tool chip, copy, FAQ, game CTA and JSON-LD (VideoGame + BreadcrumbList + FAQPage); missing/unpublished page or game = genuine 404. Sitemap includes only published, non-noindex landing pages. Add/edit uses a centered modal (`src/components/Modal.tsx` + `src/pages/admin/LandingEditor.tsx`) over the `LandingAdmin` list; advanced content is collapsible; AI notes live in the same modal.
- Legal pages: `/privacy-policy`, `/terms-of-use`, `/contact` share pure content in `src/lib/legal.ts` (worker-safe) rendered identically by Worker SSR (`kind: "legal"`) and `LegalPage`; legacy `/privacy` and `/terms` 301 to the canonical URLs; footer has Information + Legal groups; sitemap lists all three. `contact_email` (Admin → General) drives the mailto links — until configured the pages show a clearly marked placeholder that must be replaced before publication. No contact form/email delivery exists, so none is advertised.

## Conventions
- Game add = Admin dashboard only: title, slug, game_url (allowlisted https), thumbnail_url (jpg/png/webp), long_description HTML (h2/h3/p/bold/italic/lists/links/img). Sanitize via `sanitizeRichText`. Slug is `a-z0-9` single hyphens (2–120); when left empty it is auto-derived from the title via `slugify()` (`src/lib/validate.ts`), and the admin form auto-fills it from the title until edited.
- New = by `published_at`; Hot/Featured = editorial flags. Never fake popularity/ratings.
- Landing page = Admin → Keywords & Tools only: linked game, target keyword, ASCII root slug (`a-z0-9` single hyphens; reserved routes blocked), SEO title/H1/subtitle/meta, tool classification (`game`, `video`, `arcade`, `puzzle`, `other`; unknown values fall back to `game`), intro/sections/FAQ HTML (sanitized), optional OG/canonical/noindex. Subtitle is plain text (stripped, max 160). Publishing requires the linked game to be published, a target keyword, and the strict gate (`ai_gate_min_words_landing`, default 120 words; similarity vs other landing pages; keyword collisions across games, guides and landing pages). AI output is always a draft.
- Comments pending → approved-only public. Validate + rate-limit + dedupe.
- Search `?q=` pages are `noindex`.
- `ADS_ENABLED=false`, analytics optional.
- AI Writer = verified free-tier Gemini only (server allowlist in `aiModels.ts`; only ids confirmed "free of charge" — never a paid/pro/image/audio, deprecated auto-routing, or preview/access-limited id, and the fallback chain only contains verified ids). Keys encrypted in D1 (`ai_api_keys`) with a dedicated `AI_KEYS_SECRET`, never returned to the browser (masked hint only); `GEMINI_API_KEY` env takes priority. Generated copy is a draft — never auto-published. Game copy includes search intent + gameplay/controls/instructions facts; guides support AI outline + intent classification; landing pages use `/api/admin/ai/landing` (server game facts + selected tool type + 40+ char notes; returns a `subtitle`); keyword results are labelled estimates (never invented search volume/difficulty/backlinks).
- Publish gate (strict, configurable via `site_settings` `ai_gate_*`): block `422` when content is too thin or >35% similar to a published page, or the focus keyword is already targeted. Landing pages use `ai_gate_min_words_landing` (default 120), compare against other landing pages, and check keyword collisions across games + guides + landing pages. Drafts bypass.

## Commands
`npm run dev|build|preview|test|typecheck|deploy`, `npm run db:apply`.

## Security
- Server validates game/image URLs; blocks javascript:/data:/file:/localhost/private; allowlist `TRUSTED_GAME_HOSTS` (shared default `DEFAULT_GAME_HOSTS` in `src/lib/validate.ts`, used by both worker and client player; `isHostAllowed` also matches subdomains of an entry on a dot boundary, so e.g. `github.io` covers any `*.github.io`).
- Iframe `sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock"`, no raw HTML embeds, no server proxy. `allow-same-origin` keeps the frame's real origin so game engines can use `document.cookie`/`localStorage` and fetch their own assets (without it they throw and stall on "Downloading file: 0%"); it stays safe because the frame is always cross-origin — `validateGameUrl(..., selfHost)` refuses to embed the site's own host, worker included.
- Auth: Cloudflare Access JWT only (`cf-access-jwt-assertion`, team domain + AUD + allowlisted email). Local dev bypass requires `ENVIRONMENT!=="production"`, `LOCAL_DEV_AUTH=true`, and a localhost host. Admin mutations also require same-origin + a subject-bound CSRF token.
- Never commit secrets; configure `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ADMIN_EMAILS`, `CSRF_SECRET`, and `AI_KEYS_SECRET` in the deployment environment. There is no app password/login store.
- Gemini keys: encrypt at rest (AES-GCM from dedicated `AI_KEYS_SECRET`), only expose a masked hint, allowlist verified free model ids server-side, cap daily requests, and surface normalized error codes (never log/return raw provider responses). Never trust a client-supplied model id.

## SEO
- Per-page title/desc/canonical/OG/Twitter, H1, breadcrumbs, JSON-LD matching visible content.
- Worker SSR: same injected HTML for all UAs (no bot-gating); `src/lib/seoDoc.ts` is the pure, tested core.
- Genuine 404 (noindex) for missing/draft/unknown; assets pass through via ASSETS binding.
- `SITE_URL=https://slopecurve.com`. Sitemap = published only; landing pages use root `/<slug>` canonicals.

## Testing
- `tests/validation.test.ts` (URLs, slugs, XSS, SEO, comments).
- `tests/ai.test.ts` (similarity/gate, cannibalization, free-model allowlist, key encryption/masking, error normalization, internal links, prompts).
- `e2e/portal.spec.ts` + `e2e/ai.spec.ts` + `e2e/landing.spec.ts` smoke (landing spec creates via the modal with subtitle/tool, publishes, views, edits and deletes its own row).
- Verify: `npm run typecheck && npm run test && npm run build`.

## Deployment
D1 create → migrations → secrets → build → deploy → domain → verify routes/sitemap/robots → create admin.
