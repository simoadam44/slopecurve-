import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { GameAiCard, GuidesEngine } from "./AiWriter";
import { slugify } from "../../lib/validate";
import { DEFAULT_HOME_GAME } from "../../lib/home";
import { adminFetch, setAdminCsrfToken } from "../../lib/adminApi";
import { adminLoginHref, currentAdminNext } from "../../lib/adminRoute";
import { signOutAdmin } from "../../lib/supabase";

async function me(): Promise<boolean> {
  try {
    const r = await adminFetch("/api/admin/me");
    if (!r.ok) return false;
    const data = (await r.json()) as { csrf?: string };
    if (data.csrf) setAdminCsrfToken(data.csrf);
    return true;
  } catch { return false; }
}

/** Ends the Supabase session in this browser and returns to the sign-in page. */
function AdminLogout({ label = "Log out" }: { label?: string }) {
  const navigate = useNavigate();
  return (
    <button
      className="btn-secondary btn"
      type="button"
      onClick={async () => {
        await signOutAdmin();
        setAdminCsrfToken("");
        navigate("/admin/login", { replace: true });
      }}
    >
      {label}
    </button>
  );
}

export function RequireAuth({ children }: { children: JSX.Element }) {
  const location = useLocation();
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    me().then((value) => {
      if (alive) setOk(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (ok === null) return <p>Checking access…</p>;
  // Signed out: send the visitor to the real login route, remembering where they were going.
  if (!ok) return <Navigate to={adminLoginHref(currentAdminNext(location.pathname, location.search))} replace />;
  return children;
}

const NAV = [
  ["Overview", "/admin"],
  ["Games", "/admin/games"],
  ["Add Game", "/admin/games/new"],
  ["Categories", "/admin/categories"],
  ["Blog", "/admin/blog"],
  ["Keywords & Tools", "/admin/landing"],
  ["AI Writer", "/admin/ai"],
  ["Comments", "/admin/comments"],
  ["Branding", "/admin/branding"],
  ["General", "/admin/general"],
  ["SEO", "/admin/seo"],
  ["Webmaster", "/admin/webmaster"],
  ["AdSense", "/admin/adsense"],
  ["Account", "/admin/account"],
  ["Security", "/admin/security"],
] as const;

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const linkStyle = ({ isActive }: { isActive: boolean }) => ({
    display: "block", padding: "8px 10px", borderRadius: 8,
    background: isActive ? "#0a2a33" : "transparent",
    color: isActive ? "#22d3ee" : "#F5F7FF",
  });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
      <button className="btn-secondary btn" style={{ display: "none" }} aria-hidden="true" />
      <div style={{ display: "flex", gap: 8, gridColumn: "1 / -1" }}>
        <button className="btn-secondary btn" onClick={() => setOpen(!open)} aria-label="Toggle admin menu">☰ Menu</button>
        <AdminLogout />
      </div>
      <aside aria-label="Admin sections" style={{ display: open ? "block" : undefined }} className="card admin-side">
        <nav style={{ display: "grid", gap: 2, padding: 8 }}>
          {NAV.map(([label, href]) => (
            <NavLink key={href + label} to={href} end={href === "/admin"} style={linkStyle} onClick={() => setOpen(false)}>{label}</NavLink>
          ))}
        </nav>
      </aside>
      <section style={{ minWidth: 0 }}><Outlet /></section>
      <style>{`@media (max-width: 860px){ div[style*="220px 1fr"]{grid-template-columns:1fr !important} .admin-side{display:${open ? "block" : "none"}} } @media (min-width:861px){ .admin-side{display:block !important} }`}</style>
    </div>
  );
}

export function Dashboard() {
  const [s, setS] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    adminFetch("/api/admin/overview").then((r) => (r.ok ? r.json() : null)).then(setS).catch(() => setS(null));
  }, []);
  if (!s) return <p className="muted">No data — connect D1 locally (`migrations apply --local`) and log in.</p>;
  return (
    <div>
      <h2>Overview</h2>
      <ul>
        <li>Published games: {s.publishedGames}</li>
        <li>Draft games: {s.draftGames}</li>
        <li>Categories: {s.categories}</li>
        <li>Pending comments: {s.pendingComments}</li>
        <li>Published articles: {s.publishedPosts}</li>
        <li>Landing pages: {s.publishedLandings ?? 0} published / {s.landingPages ?? 0} total</li>
        <li>Ad units: {s.adUnits ?? 0}</li>
      </ul>
    </div>
  );
}

type GameRow = { id: string; title: string; slug: string; status: string };

export function GamesAdmin() {
  const [rows, setRows] = useState<GameRow[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [msg, setMsg] = useState("");
  async function load() {
    const r = await adminFetch(`/api/admin/games?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`);
    if (!r.ok) { setRows([]); return; }
    const j = await r.json();
    setRows(Array.isArray(j) ? j : (j.rows ?? []));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line
  async function del(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    await adminFetch(`/api/admin/games/${id}`, { method: "DELETE" });
    setMsg(`Deleted ${title}.`);
    load();
  }
  async function togglePublish(row: GameRow) {
    const next = row.status === "published" ? "draft" : "published";
    if (!confirm(`${next === "published" ? "Publish" : "Unpublish"} "${row.title}"?`)) return;
    const r = await adminFetch(`/api/admin/games/${row.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: next }) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setMsg((j as { error?: string }).error ?? "Blocked by the publish gate.");
    } else {
      setMsg(next === "published" ? `Published ${row.title}.` : `Unpublished ${row.title}.`);
    }
    load();
  }
  return (
    <div>
      <h2>Games</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search games" style={{ maxWidth: 220 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter" style={{ maxWidth: 160 }}>
          <option value="">all</option><option value="draft">draft</option><option value="published">published</option><option value="archived">archived</option>
        </select>
        <button className="btn" onClick={load}>Filter</button>
        <Link className="btn" to="/admin/games/new">+ Add</Link>
      </div>
      <p className="muted small" role="status">{msg}</p>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <Link to={`/admin/games/${r.id}`}>{r.title}</Link> <span className="muted small">({r.slug} • {r.status})</span>{" "}
            <button className="btn-secondary btn" onClick={() => togglePublish(r)}>{r.status === "published" ? "Unpublish" : "Publish"}</button>{" "}
            <button className="btn-secondary btn" onClick={() => del(r.id, r.title)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const EMPTY: Record<string, string | boolean | number> = { title: "", slug: "", game_url: "", thumbnail_url: "", icon_url: "", short_description: "", long_description: "", how_to_play: "", controls: "", tips: "", faqs: "", category_slug: "arcade-games", focus_keyword: "", related_keywords: "", seo_title: "", meta_description: "", og_title: "", og_description: "", canonical_url: "", social_image: "", status: "draft", is_featured: false, is_new: false, is_hot: false, noindex: false, sort_order: 0, allow_fullscreen: true };

export function GameEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const isEdit = Boolean(id && id !== "new");
  const set = (k: string, v: string | boolean | number) =>
    setF((p) => {
      const next = { ...p, [k]: v };
      // Auto-fill slug from the title until the editor types their own (new games only).
      if (k === "title" && !slugTouched && !isEdit) next.slug = slugify(String(v));
      return next;
    });
  useEffect(() => {
    if (!id || id === "new") return;
    adminFetch(`/api/admin/games/${id}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (j && j.id) {
        const next: Record<string, string | boolean | number> = { ...EMPTY };
        for (const k of Object.keys(EMPTY)) {
          const v = (j as Record<string, unknown>)[k];
          if (typeof EMPTY[k] === "boolean") next[k] = Boolean(v);
          else if (typeof EMPTY[k] === "number") next[k] = Number(v ?? 0);
          else next[k] = String(v ?? "");
        }
        setF(next);
      }
    }).catch(() => {});
  }, [id]);
  async function save(publish?: boolean) {
    setMsg("Saving…");
    const payload = publish ? { ...f, status: "published" } : f;
    const r = await adminFetch(isEdit ? `/api/admin/games/${id}` : "/api/admin/games", {
      method: isEdit ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg((j as { error?: string }).error ?? "Save failed."); return; }
    setMsg("Saved. Published changes are live without redeploy (D1).");
    if (!isEdit && (j as { id?: string }).id) nav(`/admin/games/${(j as { id: string }).id}`);
  }
  const fields = ["title", "slug", "game_url", "thumbnail_url", "icon_url", "short_description", "category_slug", "focus_keyword", "related_keywords", "seo_title", "meta_description", "og_title", "og_description", "canonical_url", "social_image"] as const;
  return (
    <div>
      <h2>{id && id !== "new" ? "Edit Game" : "Add New Game"}</h2>
      <p className="muted small">External game URL only (HTTPS, allowlisted host). Use a real playable embed URL — placeholder/demo domains never load in the player. The provider must permit embedding (no X-Frame-Options/CSP block), otherwise visitors get an external-link fallback. Images: JPG/PNG/WebP by URL with preview + fallback.</p>
      <GameAiCard form={f} set={set} gameId={id && id !== "new" ? id : undefined} />
      <div style={{ display: "grid", gap: 8, maxWidth: 680 }}>
        {fields.map((k) => (
          <label key={k}>
            {k}
            {k === "slug" ? <span className="muted small"> — lowercase-hyphenated, auto-filled from title (required)</span> : null}
            {k === "game_url" ? <span className="muted small"> — the direct playable embed URL</span> : null}
            <input value={String(f[k] ?? "")} onChange={(e) => { if (k === "slug") setSlugTouched(true); set(k, e.target.value); }} />
          </label>
        ))}
        <label>long_description (h2/h3/p/b/i/ul/ol/li/a/img) <textarea rows={8} value={String(f.long_description)} onChange={(e) => set("long_description", e.target.value)} /></label>
        <label>how_to_play <textarea rows={2} value={String(f.how_to_play)} onChange={(e) => set("how_to_play", e.target.value)} /></label>
        <label>controls <textarea rows={2} value={String(f.controls)} onChange={(e) => set("controls", e.target.value)} /></label>
        <label>tips <textarea rows={2} value={String(f.tips)} onChange={(e) => set("tips", e.target.value)} /></label>
        <label>faqs (HTML) <textarea rows={3} value={String(f.faqs)} onChange={(e) => set("faqs", e.target.value)} /></label>
        <label>status <select value={String(f.status)} onChange={(e) => set("status", e.target.value)}><option value="draft">draft</option><option value="published">published</option><option value="archived">archived</option></select></label>
        <label>sort_order <input type="number" value={Number(f.sort_order)} onChange={(e) => set("sort_order", Number(e.target.value))} /></label>
        {(["is_featured", "is_new", "is_hot", "noindex", "allow_fullscreen"] as const).map((k) => (
          <label key={k}><input type="checkbox" checked={Boolean(f[k])} onChange={(e) => set(k, e.target.checked)} style={{ width: "auto" }} /> {k}</label>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => save(false)}>Save</button>
          <button className="btn" onClick={() => save(true)}>Save & Publish</button>
          <button className="btn-secondary btn" onClick={() => setPreview(!preview)}>{preview ? "Hide preview" : "Preview"}</button>
        </div>
        <p role="status" className="muted small">{msg}</p>
        {f.thumbnail_url ? <img src={String(f.thumbnail_url)} alt="Thumbnail preview" style={{ maxWidth: 240 }} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }} /> : null}
        {preview ? <div className="card" style={{ padding: 12 }}><h3>{String(f.title || "Preview")}</h3><p className="muted small">Keywords are metadata only — not injected into visible text.</p></div> : null}
      </div>
    </div>
  );
}

export function CategoriesAdmin() {
  const [rows, setRows] = useState<{ id: string; name: string; slug: string; status: string }[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [msg, setMsg] = useState("");
  async function load() {
    const r = await adminFetch("/api/admin/categories");
    setRows(r.ok ? await r.json() : []);
  }
  useEffect(() => { load(); }, []);
  return (
    <div>
      <h2>Categories</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 200 }} />
        <input placeholder="slug" value={slug} onChange={(e) => setSlug(e.target.value)} style={{ maxWidth: 200 }} />
        <button className="btn" onClick={async () => {
          const r = await adminFetch("/api/admin/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, slug }) });
          const j = await r.json().catch(() => ({}));
          setMsg(r.ok ? "Created." : ((j as { error?: string }).error ?? "Failed"));
          setName(""); setSlug(""); load();
        }}>Create</button>
      </div>
      <p className="muted small" role="status">{msg}</p>
      <ul>{rows.map((c) => (
        <li key={c.id}>{c.name} <span className="muted small">({c.slug} • {c.status})</span> <button className="btn-secondary btn" onClick={async () => { if (confirm(`Delete ${c.name}?`)) { await adminFetch(`/api/admin/categories/${c.id}`, { method: "DELETE" }); load(); } }}>Delete</button></li>
      ))}</ul>
    </div>
  );
}

export function CommentsAdmin() {
  const [rows, setRows] = useState<{ id: string; display_name: string; body: string; game_id: string }[]>([]);
  const [status, setStatus] = useState("pending");
  async function load(s = status) {
    const r = await adminFetch(`/api/admin/comments?status=${encodeURIComponent(s)}`);
    setRows(r.ok ? await r.json() : []);
  }
  useEffect(() => { load("pending"); }, []); // eslint-disable-line
  async function act(id: string, a: string) {
    if (a === "delete") {
      if (!confirm("Delete comment permanently?")) return;
      await adminFetch(`/api/admin/comments/${id}`, { method: "DELETE" });
    } else {
      await adminFetch(`/api/admin/comments/${id}/${a}`, { method: "POST" });
    }
    load();
  }
  return (
    <div>
      <h2>Comments</h2>
      <div style={{ display: "flex", gap: 8 }}>
        {(["pending", "approved", "rejected", "spam"] as const).map((s) => (
          <button key={s} className="btn-secondary btn" onClick={() => { setStatus(s); load(s); }} style={status === s ? { borderColor: "#22d3ee" } : undefined}>{s}</button>
        ))}
      </div>
      <ul>{rows.map((c) => (
        <li key={c.id} className="card" style={{ padding: 8, marginBottom: 8 }}>
          <strong>{c.display_name}</strong> <span className="muted small">({c.game_id})</span>: {c.body}
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => act(c.id, "approve")}>Approve</button>
            <button className="btn-secondary btn" onClick={() => act(c.id, "reject")}>Reject</button>
            <button className="btn-secondary btn" onClick={() => act(c.id, "spam")}>Spam</button>
            <button className="btn-secondary btn" onClick={() => act(c.id, "delete")}>Delete</button>
          </div>
        </li>
      ))}</ul>
      {rows.length === 0 && <p className="muted">No comments in “{status}”.</p>}
    </div>
  );
}

export function BlogAdmin() {
  return <GuidesEngine />;
}

function useSettings() {
  const [s, setS] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  useEffect(() => {
    adminFetch("/api/admin/settings").then((r) => (r.ok ? r.json() : {})).then(setS).catch(() => {});
  }, []);
  async function save(patch: Record<string, string>) {
    setMsg("Saving…");
    const r = await adminFetch("/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Saved to D1." : ((j as { error?: string }).error ?? "Failed"));
    if (r.ok) setS((p) => ({ ...p, ...patch }));
  }
  return { s, setS, msg, save };
}

export function BrandingAdmin() {
  const { s, setS, msg, save } = useSettings();
  const set = (k: string, v: string) => setS((p) => ({ ...p, [k]: v }));
  return (
    <div>
      <h2>Site Branding</h2>
      <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
        {(["site_name", "site_description", "logo_url", "favicon_url", "default_og_image"] as const).map((k) => (
          <label key={k}>{k} <input value={s[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></label>
        ))}
        <button className="btn" onClick={() => save({ site_name: s.site_name ?? "", site_description: s.site_description ?? "", logo_url: s.logo_url ?? "", favicon_url: s.favicon_url ?? "", default_og_image: s.default_og_image ?? "" })}>Save branding</button>
        <p className="muted small" role="status">{msg}</p>
        {s.logo_url ? <img src={s.logo_url} alt="Logo preview" style={{ maxWidth: 220 }} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }} /> : null}
      </div>
    </div>
  );
}

export function GeneralAdmin() {
  const { s, setS, msg, save } = useSettings();
  const set = (k: string, v: string) => setS((p) => ({ ...p, [k]: v }));
  const keys = ["home_title", "home_description", "contact_email", "social_x", "social_youtube", "social_twitch", "footer_text", "default_lang"] as const;
  const currentSettings = () => {
    const patch: Record<string, string> = { home_game_slug: s.home_game_slug ?? DEFAULT_HOME_GAME };
    for (const k of keys) patch[k] = s[k] ?? "";
    return patch;
  };
  return (
    <div>
      <h2>General Settings</h2>
      <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
        <label>
          home_game_slug
          <span className="muted small"> — the game shown on the homepage (“/”); leave blank to show the games listing</span>
          <input value={s.home_game_slug ?? DEFAULT_HOME_GAME} onChange={(e) => set("home_game_slug", e.target.value)} />
        </label>
        {keys.map((k) => (
          <label key={k}>{k} <input value={s[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></label>
        ))}
        <button className="btn" onClick={() => save(currentSettings())}>Save</button>
        <p className="muted small" role="status">{msg}</p>
      </div>
    </div>
  );
}

export function SeoAdmin() {
  const { s, setS, msg, save } = useSettings();
  const set = (k: string, v: string) => setS((p) => ({ ...p, [k]: v }));
  return (
    <div>
      <h2>SEO Settings</h2>
      <p className="muted small">Sitemap: <code>/sitemap.xml</code> (published only). Robots: <code>/robots.txt</code>. Admin/API excluded. Search <code>?q=</code> is noindex.</p>
      <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
        <label>canonical_url (SITE_URL override) <input value={s.canonical_url ?? ""} onChange={(e) => set("canonical_url", e.target.value)} placeholder="https://slopecurve.com" /></label>
        <button className="btn" onClick={() => save({ canonical_url: s.canonical_url ?? "" })}>Save</button>
        <p className="muted small" role="status">{msg}</p>
      </div>
    </div>
  );
}

export function WebmasterAdmin() {
  const { s, setS, msg, save } = useSettings();
  const set = (k: string, v: string) => setS((p) => ({ ...p, [k]: v }));
  return (
    <div>
      <h2>Webmaster Verification</h2>
      <p className="muted small">Paste only the token from Search Console / Bing. Saving stores the token — you must still click Verify in Google/Bing. Tokens allow letters, numbers, <code>_</code>, <code>-</code> only (no HTML/JS).</p>
      <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
        <label>google_verification <input value={s.google_verification ?? ""} onChange={(e) => set("google_verification", e.target.value)} /></label>
        <label>bing_verification <input value={s.bing_verification ?? ""} onChange={(e) => set("bing_verification", e.target.value)} /></label>
        <button className="btn" onClick={() => save({ google_verification: s.google_verification ?? "", bing_verification: s.bing_verification ?? "" })}>Save tokens</button>
        <p className="muted small" role="status">{msg}</p>
        <div className="card" style={{ padding: 8 }}>
          <p className="small">Preview (rendered in public HTML head):</p>
          <code className="small">&lt;meta name="google-site-verification" content="{s.google_verification ?? ""}"&gt;</code>
        </div>
      </div>
    </div>
  );
}

export function AdsenseAdmin() {
  const [rows, setRows] = useState<{ id: string; name: string; publisher_id: string; slot_id: string; placement: string; active: number }[]>([]);
  const [f, setF] = useState({ name: "", publisher_id: "", slot_id: "", placement: "below-game", format: "auto", active: false });
  const [msg, setMsg] = useState("");
  const [adsTxt, setAdsTxt] = useState("");
  async function load() {
    const r = await adminFetch("/api/admin/ads");
    setRows(r.ok ? await r.json() : []);
    const s = await adminFetch("/api/admin/settings").then((x) => (x.ok ? x.json() : {})).catch(() => ({}));
    setAdsTxt((s as Record<string, string>).ads_txt ?? "");
  }
  useEffect(() => { load(); }, []);
  return (
    <div>
      <h2>Google AdSense</h2>
      <p className="muted small">Disabled by default. No fake IDs/revenue. Script loads only when an active unit with a real <code>ca-pub-…</code> exists. Served at <code>/ads.txt</code> from the field below (paste the exact record from AdSense).</p>
      <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
        <label>Unit name <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>Publisher ID <input value={f.publisher_id} onChange={(e) => setF({ ...f, publisher_id: e.target.value })} placeholder="ca-pub-XXXXXXXXXXXXXXXX" /></label>
        <label>Slot ID <input value={f.slot_id} onChange={(e) => setF({ ...f, slot_id: e.target.value })} /></label>
        <label>Placement <select value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value })}>
          <option value="home">home</option><option value="above-game">above-game</option><option value="below-game">below-game</option><option value="article-inline">article-inline</option><option value="article-below">article-below</option><option value="sidebar">sidebar</option><option value="before-footer">before-footer</option>
        </select></label>
        <label><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} style={{ width: "auto" }} /> active</label>
        <button className="btn" onClick={async () => {
          const r = await adminFetch("/api/admin/ads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
          const j = await r.json().catch(() => ({}));
          setMsg(r.ok ? "Saved." : ((j as { error?: string }).error ?? "Failed"));
          load();
        }}>Save unit</button>
        <label>ads.txt <textarea rows={3} value={adsTxt} onChange={(e) => setAdsTxt(e.target.value)} placeholder="google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0" /></label>
        <button className="btn-secondary btn" onClick={async () => {
          await adminFetch("/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ads_txt: adsTxt }) });
          setMsg("ads.txt saved. Served at /ads.txt.");
        }}>Save ads.txt</button>
        <p className="muted small" role="status">{msg}</p>
        <div className="card" style={{ padding: 8 }}><p className="small muted">Admin preview placeholder — real ads render only on public pages with your IDs.</p><div style={{ border: "1px dashed #26334B", padding: 16, textAlign: "center" }}>Ad placeholder ({f.placement})</div></div>
      </div>
      <ul>{rows.map((a) => (
        <li key={a.id}>{a.name || a.placement} <span className="muted small">({a.publisher_id}/{a.slot_id} • {a.active ? "active" : "off"})</span> <button className="btn-secondary btn" onClick={async () => { if (confirm("Delete ad unit?")) { await adminFetch(`/api/admin/ads/${a.id}`, { method: "DELETE" }); load(); } }}>Delete</button></li>
      ))}</ul>
    </div>
  );
}

export function AccountAdmin() {
  return (
    <div>
      <h2>Account</h2>
      <p>
        Sign-in is handled by Supabase Auth with your email address and password. Accounts are created and
        managed in the Supabase dashboard (Authentication → Users); this site never stores your password.
      </p>
      <AdminLogout label="Sign out" />
    </div>
  );
}

export function SecurityAdmin() {
  return (
    <div>
      <h2>Security</h2>
      <ul>
        <li>Admin access is enforced by Supabase Auth; every <code>/api/admin/*</code> request is rejected unless it carries a valid Supabase session belonging to an administrator.</li>
        <li>Administrator status comes from a trusted server-side source only: the <code>SUPABASE_ADMIN_EMAILS</code> allowlist, <code>app_metadata.role</code>, or a <code>profiles.role</code> row. The top-level Supabase <code>role</code> claim is the Postgres role and is never treated as an admin flag.</li>
        <li>Mutating admin requests require a same-origin context plus a short-lived CSRF token bound to the signed-in subject on top of the Bearer session token.</li>
        <li>Comments are limited to 5 per minute per IP in-process; production abuse controls should also be configured at the Cloudflare edge.</li>
        <li>robots.txt is not access control — admin routes stay behind authentication, and <code>/api/admin/*</code> never trusts the client.</li>
      </ul>
      <AdminLogout label="Log out now" />
    </div>
  );
}

export function SettingsAdmin() {
  return (
    <div>
      <h2>Settings</h2>
      <p>Use the sidebar: <Link to="/admin/branding">Branding</Link>, <Link to="/admin/general">General</Link>, <Link to="/admin/seo">SEO</Link>, <Link to="/admin/webmaster">Webmaster</Link>, <Link to="/admin/adsense">AdSense</Link>.</p>
    </div>
  );
}
