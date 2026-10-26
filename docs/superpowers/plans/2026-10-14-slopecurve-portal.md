# SlopeCurve Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build production-ready SlopeCurve.com gaming portal (React+Vite+Workers+D1).

**Architecture:** SPA + Worker API + prerendered SEO HTML. Static Assets serve React; Worker `/api/*` handles CRUD/auth/comments; Worker renders SEO HTML + sitemap/robots from D1.

**Tech Stack:** React 18, Vite 6, TypeScript strict, React Router 6, Tailwind 3, @cloudflare/vite-plugin, Wrangler 4, D1, Zod, Vitest, Playwright.

**Spec:** User prompt §§1-32 + screenshot layout (dark portal, game player, SEO sections, comments, trending grid).

## Global Constraints

- Domain https://slopecurve.com, tagline Play Free Online Games.
- No fake stats/ratings/counts; Hot/New are editorial flags.
- HTTPS required in prod; block javascript:,data:,file:,localhost/loopback/private.
- No server proxy fetching arbitrary URLs; no raw admin HTML execution.
- Comments pending by default, approved-only public.
- ADS_ENABLED=false default; analytics optional.
- Empty DB + labeled demo records; trusted hosts configurable.

---

### Task 1: Base scaffold + configs

**Files:**
- Create: `package.json`, `vite.config.ts`, `wrangler.jsonc`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `.gitignore`, `.env.example`, `index.html`
- Test: `tests/validation.test.ts` (placeholder run)

**Interfaces:**
- Consumes: none
- Produces: `npm run dev|build|preview|test|typecheck|deploy`

- [ ] **Step 1: Write package.json + configs** (see implementation: react, vite, cloudflare plugin, zod, dompurify, hono not needed — plain worker fetch)
- [ ] **Step 2: Run npm install and typecheck**
- [ ] **Step 3: Commit**

### Task 2: Design system + public shell

**Files:**
- Create: `src/styles.css`, `src/App.tsx`, `src/main.tsx`, `src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/GameCard.tsx`, `src/components/AdSlot.tsx`, `src/components/GameGrid.tsx`
- Modify: `index.html`

**Interfaces:**
- Consumes: Task 1 build
- Produces: `<Header/>`, `<Footer/>`, `<GameCard game/>`, `<AdSlot slot/>`

- [ ] **Step 1: CSS vars dark/light, focus, reduced-motion, responsive grids**
- [ ] **Step 2: Header (logo/search/nav) + Footer (internal+legal links)**
- [ ] **Step 3: Verify `npm run build` passes**

### Task 3: Validation + SEO + data libs (TDD)

**Files:**
- Create: `src/lib/validate.ts`, `src/lib/seo.ts`, `src/lib/sanitize.ts`, `src/lib/trustedHosts.ts`, `src/data/seed.ts`
- Test: `tests/validation.test.ts`, `tests/seo.test.ts`, `tests/sitemap.test.ts`

**Interfaces:**
- Consumes: Zod
- Produces: `validateGameUrl(url,hosts)`, `validateImageUrl(url)`, `buildGameMeta(game,siteUrl)`, `sanitizeRichText(html)`, `isSlugUnique`

- [ ] **Step 1: Write failing tests for game URL (allow https trusted, block js/data/localhost/private) + image ext + slug + XSS strip + canonical**
- [ ] **Step 2: Run vitest (fail)**
- [ ] **Step 3: Implement validators + seo + sanitize (DOMPurify/isomorphic)**
- [ ] **Step 4: Run vitest (pass)**

### Task 4: D1 migrations + Worker API

**Files:**
- Create: `migrations/0001_init.sql`, `src/worker.ts`, `src/lib/db.ts`, `src/lib/auth.ts`, `src/lib/rateLimit.ts`
- Test: `tests/api.test.ts`, `tests/auth.test.ts`, `tests/comments.test.ts`

**Interfaces:**
- Consumes: Task 3 validators
- Produces: `GET /api/games, /api/games/:slug, /api/categories, POST /api/comments, /api/admin/* (auth), GET /sitemap.xml, /robots.txt`

- [ ] **Step 1: SQL tables games/categories/game_categories/comments/admin_users/admin_sessions/blog_posts/site_settings + indexes**
- [ ] **Step 2: Worker fetch router + D1 binding + session cookie (SHA-256+salt, HttpOnly/Secure/SameSite, expiry, rate-limit login/comments)**
- [ ] **Step 3: Sitemap (published only) + robots + 404 JSON/HTML codes**
- [ ] **Step 4: Tests pass**

### Task 5: Public routes (home/games/category/search)

**Files:**
- Create: `src/pages/Home.tsx`, `src/pages/Games.tsx`, `src/pages/GameDetail.tsx`, `src/pages/Categories.tsx`, `src/pages/CategoryDetail.tsx`, `src/pages/NewGames.tsx`, `src/pages/HotGames.tsx`, `src/components/GamePlayer.tsx`, `src/components/Comments.tsx`, `src/components/Breadcrumbs.tsx`
- Test: `e2e/portal.spec.ts` (partial)

**Interfaces:**
- Consumes: seed data + Worker API client `src/lib/api.ts`
- Produces: routes `/, /games, /games/:slug, /categories/:slug, /new-games, /hot-games, search?q= (noindex)`

- [ ] **Step 1: Home sections (Featured/New/Hot/Snow/Crossy/Racing/Recent) + SEO content + FAQ**
- [ ] **Step 2: GameDetail (player lazy, loading/error/fallback, fullscreen if allowed, desc/HowTo/Controls/Tips/FAQs/related/comments/JSON-LD)**
- [ ] **Step 3: Search + category filtering published-only + pagination**
- [ ] **Step 4: Playwright smoke passes**

### Task 6: Admin dashboard + editor

**Files:**
- Create: `src/pages/admin/Login.tsx`, `src/pages/admin/Dashboard.tsx`, `src/pages/admin/GamesAdmin.tsx`, `src/pages/admin/GameEditor.tsx`, `src/pages/admin/CategoriesAdmin.tsx`, `src/pages/admin/CommentsAdmin.tsx`, `src/pages/admin/BlogAdmin.tsx`, `src/pages/admin/SettingsAdmin.tsx`, `scripts/create-admin.mjs`

**Interfaces:**
- Consumes: Worker admin API + auth cookie
- Produces: `/admin` guarded routes, CRUD draft/published/featured/new/hot/archived + ordering + confirm deletes

- [ ] **Step 1: Auth guard + login + logout + session expiry UX**
- [ ] **Step 2: Overview counts (real DB) + games table search/paginate**
- [ ] **Step 3: GameEditor fields (§11) + rich-text toolbar (H2/H3/lists/bold/italic/link) + preview + image preview + SEO fields**
- [ ] **Step 4: Moderation queue approve/reject/delete + blog/settings**

### Task 7: Blog + legal + SEO HTML prerender

**Files:**
- Create: `src/pages/Blog.tsx`, `src/pages/BlogPost.tsx`, `src/pages/Static.tsx`, `scripts/prerender.mjs`
- Modify: `src/worker.ts` (SEO HTML injection), `index.html`

**Interfaces:**
- Consumes: Tasks 4-5
- Produces: `/blog, /blog/:slug, /about,/contact,/privacy,/terms,/faq` + view-source meta/canonical/OG/Twitter/BreadcrumbList/Article/VideoGame

- [ ] **Step 1: Blog list/post + related games + Article JSON-LD**
- [ ] **Step 2: Legal/static pages + sitemap/robots verify**
- [ ] **Step 3: Build + preview: curl view-source contains title/desc**

### Task 8: Verification + docs

**Files:**
- Create: `README.md`, `AGENTS.md`, `playwright.config.ts`, `vitest.config.ts`
- Test: full `npm run test && npm run typecheck && npm run build`

- [ ] **Step 1: Write docs (arch, commands, env, D1, first-admin, trusted hosts, SEO, deploy, troubleshooting)**
- [ ] **Step 2: Run all checks, record pass/fail**
- [ ] **Step 3: Final report (files, DB steps, commands, tests, limits, deploy steps)**
