# SlopeCurve — Play Free Online Games

Lightweight browser gaming portal: React + Vite + Cloudflare Workers Static Assets + D1.

## Live deployment
| Item | Value |
|---|---|
| Public URL | https://slopecurve.hamdi708090.workers.dev |
| Worker | `slopecurve` (account `a2cf8c46059a89fb2534486b47b6e05e`) |
| D1 database | `slopecurve-db` → `3aa5cb41-323e-4399-bb02-cad56f322964` (WEUR) |
| Secrets set | `CSRF_SECRET`, `AI_KEYS_SECRET` |
| Admin auth | Supabase Auth (email + password). Worker has `SUPABASE_URL` + `SUPABASE_ANON_KEY`; build has `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. Tokens are verified against the project's JWKS (ES256), so no shared JWT secret is needed |
| Custom domain | `slopecurve.com` still uses Namecheap nameservers; not attached |

`.env.production` (committed, public values only) sets `VITE_SITE_URL`, and `vars.SITE_URL`
in `wrangler.jsonc` holds the same origin. When `slopecurve.com` is attached to the Worker,
change **both** to `https://slopecurve.com` and redeploy.


## Features
- Public: home, games, game detail with safe iframe embed, categories, new/hot, blog/guides, search, comments (moderated).
- Admin `/admin`: Supabase Auth (email + password) protected, overview counts, games CRUD (draft/published/featured/new/hot/archived), categories, comments moderation, blog/guides, AI Writer, settings.
- SEO: unique titles/descriptions, canonical, OG/Twitter, breadcrumbs, JSON-LD (VideoGame/Article/BreadcrumbList), sitemap.xml, robots.txt. No fake ratings/stats.
- Security: Supabase session token on every admin API, admin-role check on the server, same-origin + CSRF checks on admin mutations, allowlisted game hosts, HTTPS, sandboxed iframes (`allow-same-origin`, never our own origin), sanitized rich text, bounded comment rate limits.

## Admin CMS (new)
- Sidebar: Overview, Games, Categories, Blog, AI Writer, Comments, Branding, General, SEO, Webmaster, AdSense, Account, Security.
- Games: create/edit/preview/publish/unpublish/delete, full SEO fields (focus/related/OG/canonical/noindex), image preview + fallback.
- Accounts: sign-in is Supabase Auth (email + password); administrator status is decided server-side. The app stores no admin password and no session cookie — the Supabase session token lives in the browser and is sent as a Bearer token.
- Settings in D1 `site_settings`; public-safe subset at `GET /api/settings`. Branding updates Header/Footer live.
- AdSense: units in D1, disabled by default, `ca-pub-…` validated, placeholders only, `ads.txt` served at `/ads.txt`.
- Webmaster: token-only fields, escaped meta tags in crawler HTML, setup instructions (saving ≠ verification).
- SEO: Worker injects crawler HTML for `/,/games*,/categories*,/blog*` (title/desc/canonical/OG/H1/content/JSON-LD/verification). Sitemap published-only.

## AI Writer (free-tier Google Gemini only)
- Admin → **AI Writer** (`/admin/ai`): add/rotate/disable/delete/test Gemini keys, pick the model, set the daily cap, toggle the publish gate, classify keyword intent, and generate long-tail keywords.
- Keys are **AES-GCM encrypted** with a dedicated `AI_KEYS_SECRET` and never returned to the browser — the UI only ever sees a masked hint. An env secret `GEMINI_API_KEY` takes priority if set.
- **Verified free-tier models only.** A server-side allowlist (`src/lib/aiModels.ts`) accepts only models confirmed *free of charge* on Google's Gemini free tier — currently `gemini-3.8-flash` (default), `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` — and rejects every paid/Pro/image/audio model plus deprecated auto-routing ids (`gemini-3.7-flash`, `gemini-3.5-flash`) and preview/access-limited ids. The fallback chain only ever contains verified-free ids, so an unverified model is never attempted.
- **Generate game copy** appears in Add/Edit Game: uses the real game details, search intent, gameplay/controls/instructions facts and your required first-hand notes to fill description / How to Play / Controls / Tips / FAQ / SEO fields. It never auto-publishes (output is a draft).
- **Blog & Long-Tail Guides Engine** (`/admin/blog`): slug, target keyword, language, intent (with **AI intent classification**), related tool, title, H1, meta, excerpt, and an **AI outline planner** plus repeatable sections (+Generate, per-section Regenerate) with a live uniqueness meter. Drafts may be saved freely; publishing is gated. Generated drafts also get a deterministic **Related** block linking only to real published pages.
- **Publish gate (strict):** publishing is blocked (`422`) when content is below the word minimum or too similar (default >35% 5-gram Jaccard) to an already-published page, or when the focus keyword is already targeted by another published page. Drafts are always allowed. Configure thresholds in AI Writer. Similarity is a word-overlap heuristic — it reduces near-duplicates but **cannot guarantee rankings or indexing**.
- Keyword suggestions are **estimates** derived from your seed wording only. The app never fabricates search volume, keyword difficulty, CPC, backlinks, citations, or ranking data; failing Gemini calls surface normalized error codes (never raw provider responses).
- Get a free key at Google AI Studio and **restrict it to the Generative Language API** — Google rejects unrestricted keys since June 2026. Free-tier RPM/RPD are not published by Google; the app's daily cap is a safety net, not Google's quota.
- API: `GET /api/admin/ai/status`, `POST /api/admin/ai/keys`, `PUT|DELETE /api/admin/ai/keys/:id`, `POST /api/admin/ai/test|check|game|post|section|keywords|outline|intent`.

## SEO rendering (same HTML for visitors + crawlers)
- Worker runs first for page routes (`assets.binding ASSETS` + `run_worker_first`, dev paths excluded).
- For every public route the Worker fetches the built `index.html` from ASSETS and injects
  title/meta/canonical/OG/Twitter/verification/JSON-LD + server-rendered content (`#ssr-content`);
  React removes `#ssr-content` on mount (no duplication, no hydration mismatch).
- Missing/draft content and unknown URLs return genuine HTTP 404 (noindex). Static assets pass through.
- Verify locally: `npm run dev -- --port 5199` (E2E) and `npx wrangler dev --port 5198 --assets dist/client`
  (prod-like: `curl -H "Accept: text/html" localhost:5198/games/snow-road`).

## Stack
| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 6, TypeScript (strict), React Router, plain CSS |
| API + SSR | Single Cloudflare Worker (`src/worker.ts`) with Static Assets |
| Database | Cloudflare D1 (`migrations/0001…0006`) |
| Auth | Supabase Auth (email + password) — `@supabase/supabase-js` in the browser, JWT verified in the Worker |
| Tests | Vitest (unit) + Playwright (e2e) |

## Local development
```bash
git clone https://github.com/simoadam44/slopecurve-.git
cd slopecurve
npm ci

# Local secrets/vars (never committed):
cp .env.example .dev.vars   # then edit it (Windows: copy .env.example .dev.vars)

npx wrangler d1 migrations apply slopecurve-db --local
npm run dev                 # http://localhost:5173
```

Verification before every push:
```bash
npm run typecheck && npm run test && npm run build
```

Local admin (`/admin`) works only when **all three** hold: `ENVIRONMENT` is not `production`,
`LOCAL_DEV_AUTH=true` in `.dev.vars`, and the site is opened on `localhost` / `127.0.0.1`.
`.dev.vars` is git-ignored; the Worker build also strips it from `dist/`.

## Configuration
Runtime vars live in `wrangler.jsonc` (`vars`), secrets are set once on the Worker.

| Name | Type | Purpose |
|---|---|---|
| `SITE_URL` | var — `wrangler.jsonc` | Public origin used by the Worker for canonical / OG / sitemap URLs |
| `VITE_SITE_URL` | build env | **Same origin**, baked into the client bundle at build time |
| `TRUSTED_GAME_HOSTS` | var | Comma list of hosts allowed in the player iframe (`azgames.io`, `github.io`, …) |
| `SUPABASE_URL` | **secret, required** | Supabase project origin, e.g. `https://abcdefgh.supabase.co` (also added to `connect-src` in CSP) |
| `SUPABASE_ANON_KEY` | secret, recommended | Public key; used for the `GET /auth/v1/user` fallback. Asymmetric (ES256) tokens are verified locally through JWKS with no key at all |
| `SUPABASE_JWT_SECRET` | optional secret | Only for legacy **HS256** projects (Settings → API → JWT Settings). Supabase's current default is ES256, which needs no shared secret |
| `SUPABASE_SERVICE_ROLE_KEY` | optional secret | Enables the authoritative `profiles.role = 'admin'` lookup. Never sent to the browser |
| `SUPABASE_ADMIN_EMAILS` | optional secret | Comma-separated bootstrap allowlist of administrator emails |
| `SUPABASE_TRUST_USER_METADATA` | optional var | Leave unset. `true` also accepts `user_metadata.role` — **user-writable in Supabase**, so only for a throwaway setup |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | build env | Public values baked into the client bundle; needed for the sign-in form |
| `CSRF_SECRET` | secret, 32+ chars | Signs admin CSRF tokens in addition to the Bearer session token |
| `AI_KEYS_SECRET` | secret, 32+ chars | AES-GCM key for the encrypted Gemini keyring (changing it requires re-entering keys) |
| `GEMINI_API_KEY` | optional secret | Server-side Gemini key; takes priority over keys stored in D1 |
| `ADS_ENABLED`, `ANALYTICS_ENABLED` | var | `false` by default |

> `SITE_URL` and `VITE_SITE_URL` must point at the **same** public origin, otherwise the
> server-rendered and client-side canonical tags disagree. They currently both hold
> `https://slopecurve.hamdi708090.workers.dev` (in `wrangler.jsonc` and `.env.production`).

## Create the production database
Already done for this deployment (`slopecurve-db` → `3aa5cb41-323e-4399-bb02-cad56f322964`, all 6
migrations applied). To repeat it from scratch:
```bash
npx wrangler login
npx wrangler d1 create slopecurve-db
# → prints database_id; paste it into wrangler.jsonc → d1_databases[0].database_id

npm run db:apply          # local schema (all migrations)
npm run db:apply:remote   # production schema — run once, then after new migrations
```

## Deploy from GitHub (Workers Builds, recommended)
1. Push the repo to GitHub (see below).
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Workers** → **Connect to Git** → pick the repo.
3. Build settings:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Root directory: `/`
   - Optional build variable: `NODE_VERSION=22`, `VITE_SITE_URL=https://<public-origin>`
4. Set runtime secrets **once** (Dashboard → Worker → Settings → Variables and Secrets, or CLI):
   ```bash
   npx wrangler secret put CSRF_SECRET
   npx wrangler secret put AI_KEYS_SECRET
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_ANON_KEY
   # optional:
   npx wrangler secret put SUPABASE_ADMIN_EMAILS
   # optional: npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   # optional (HS256 projects only): npx wrangler secret put SUPABASE_JWT_SECRET
   # optional: npx wrangler secret put GEMINI_API_KEY
   ```
   The two public build values must also exist for the browser bundle:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (add them as build variables or in `.env.production`).
5. Apply migrations: `npm run db:apply:remote`.
6. First deploy URL: `https://slopecurve.hamdi708090.workers.dev` (`workers_dev` is enabled in `wrangler.jsonc`).

Every push to `main` then rebuilds and deploys. Pull requests are verified by
`.github/workflows/ci.yml` (typecheck + unit tests + build).

## Deploy from the CLI
```bash
npx wrangler login
npm run build
npx wrangler deploy
```

## Custom domain (`slopecurve.com`)
Workers → **slopecurve** → Settings → **Domains & Routes** → **Add custom domain** → `slopecurve.com`
(add `www` too). Cloudflare issues the certificate automatically. The zone's DNS must be on Cloudflare.

Alternatively uncomment the `routes` entry in `wrangler.jsonc`:
```jsonc
"routes": [{ "pattern": "slopecurve.com", "custom_domain": true }]
```
Then set `SITE_URL` and `VITE_SITE_URL` to `https://slopecurve.com`, rebuild and redeploy.

## Push to GitHub
Already pushed: `https://github.com/simoadam44/slopecurve-` (branch `main`, CI green).
For a fresh clone:
```bash
git clone https://github.com/simoadam44/slopecurve-.git
```
To re-point an existing checkout:
```bash
git remote set-url origin https://github.com/simoadam44/slopecurve-.git
git push -u origin main
```
Never commit `.dev.vars`, `.env*`, `node_modules/`, `dist/` or `.wrangler/` — they are git-ignored.
`.env.production` is committed on purpose: it only holds the public site origin.

## Admin access (Supabase Auth)
Admin routes are **fail-closed**: `/api/admin/*` returns `401` until `SUPABASE_URL` exists, so the
CMS cannot be reached without a real Supabase session. Session tokens are verified locally: an
asymmetric token (Supabase's default **ES256**) against the project's JWKS — no secret needed — or
an **HS256** token against `SUPABASE_JWT_SECRET`. Only an HS256 token on a keyless project is sent
to `GET /auth/v1/user`, and only when `SUPABASE_ANON_KEY` is set.

1. Create a project at <https://supabase.com/dashboard>. From **Settings -> API** copy the
   **Project URL** and the public **publishable / anon** key. Older HS256 projects also have a
   **JWT Secret** under JWT Settings; projects on the new asymmetric keys do not need it.
2. Create the administrator: **Authentication -> Users -> Add user** (email + password,
   confirm the email if confirmations are on).
3. Grant the administrator role - any one of these works:
   - **Recommended:** in the SQL editor, set the server-only claim:
     ```sql
     update auth.users
        set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
      where email = 'you@example.com';
     ```
   - Put the address in `SUPABASE_ADMIN_EMAILS`.
   - Or keep a `profiles` table (`id uuid primary key references auth.users`, `role text`)
     with `role = 'admin'` and set `SUPABASE_SERVICE_ROLE_KEY` so the Worker can read it.
   - `user_metadata` is **not** trusted by default because a signed-in user can write it.
     `SUPABASE_TRUST_USER_METADATA=true` re-enables it; do not use that in production.
   After editing `app_metadata`, sign out and back in (or wait for the token refresh) so the
   new claim appears in the session token.
4. Set the Worker secrets:
   ```bash
   npx wrangler secret put SUPABASE_URL              # https://<project-ref>.supabase.co
   npx wrangler secret put SUPABASE_ANON_KEY         # public key; enables the remote verify fallback
   npx wrangler secret put SUPABASE_ADMIN_EMAILS     # optional bootstrap allowlist
   # optional: npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   # optional, HS256 projects only: npx wrangler secret put SUPABASE_JWT_SECRET
   ```
5. Give the browser build the same public project values, then rebuild and deploy:
   ```bash
   # .env.production (or Workers Builds build variables)
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon public key>
   npm run deploy
   ```
6. Remove the old Cloudflare Access secrets if the Worker still lists them
   (`npx wrangler secret list`):
   ```bash
   npx wrangler secret delete ACCESS_TEAM_DOMAIN
   npx wrangler secret delete ACCESS_AUD
   npx wrangler secret delete ADMIN_EMAILS
   ```
7. Open `/admin` (or `/admin/login`): the email + password form appears, and the session
   survives a reload. A valid login without the admin role is signed out again with a clear
   message instead of landing in a redirect loop.

`GET /api/admin/me` is the single source of truth the dashboard asks on load:
`200` = signed-in administrator, `401` = no/invalid session, `403 not_admin` = a valid
Supabase session without the administrator role.

## Post-deploy checklist
```bash
curl -sI https://<origin>/ | head -n 1          # 200
curl -s   https://<origin>/sitemap.xml | head    # published URLs with <lastmod>
curl -s   https://<origin>/robots.txt            # sitemap line
curl -sI https://<origin>/does-not-exist | head -n 1   # 404 + noindex
```
- `/`, `/games`, `/games/snow-road`, `/categories`, `/blog` render with correct titles.
- `/admin` asks for the Supabase email + password, then shows the dashboard.
- Create a draft game, publish it, confirm it appears in the listing and the sitemap.
- Add one Gemini key in Admin → AI Writer (optional) and confirm `GEMINI_API_KEY`/keyring works.

## Limits
- External games may block embedding (X-Frame-Options/CSP) — fallback link shown.
- Thumbnails depend on provider hotlink permission.
- Verify Cloudflare free-tier D1/Workers quotas before scaling.
