import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { api, errOf } from "./landingApi";
import { landingToolLabel } from "../../lib/landingTools";

type LandingRow = {
  id: string;
  game_id: string;
  badge: string;
  slug: string;
  subtitle?: string | null;
  tool_type?: string | null;
  focus_keyword: string;
  title: string;
  status: string;
  game_title?: string | null;
  updated_at?: string | null;
};
type KeywordIdea = { keyword: string; intent: string; note: string; coveredBy: boolean };

export function LandingAdmin() {
  const location = useLocation();
  const [rows, setRows] = useState<LandingRow[]>([]);
  const [msg, setMsg] = useState("");
  const [seed, setSeed] = useState("");
  const lang = "English";
  const [kws, setKws] = useState<KeywordIdea[]>([]);
  const [busy, setBusy] = useState(false);
  const didMount = useRef(false);

  async function load() {
    const r = await api<{ rows?: LandingRow[]; error?: string }>("/api/admin/landings");
    if (r.ok) setRows(r.data.rows || []);
    else setMsg(errOf(r.data, "Could not load landing pages."));
  }
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      load();
      return;
    }
    if (location.pathname === "/admin/landing") load();
  }, [location.pathname]);

  async function remove(row: LandingRow) {
    if (!confirm(`Delete “${row.title}”?`)) return;
    const r = await api<{ error?: string }>(`/api/admin/landings/${row.id}`, "DELETE");
    if (r.ok) { setRows((prev) => prev.filter((x) => x.id !== row.id)); setMsg("Landing page deleted."); }
    else setMsg(errOf(r.data, "Delete failed."));
  }

  async function findKeywords() {
    setBusy(true); setMsg("Finding keyword ideas…"); setKws([]);
    const r = await api<{ error?: string; keywords?: KeywordIdea[] }>("/api/admin/ai/keywords", "POST", { seed, language: lang });
    if (r.ok) { setKws(r.data.keywords || []); setMsg("Ideas ready — these are wording-based estimates, not real search-volume data."); }
    else setMsg(errOf(r.data, "Keyword generation failed. Check AI Writer keys and quota."));
    setBusy(false);
  }

  return (
    <div>
      <h2>Keywords &amp; Landing Tools Engine</h2>
      <p className="muted small">
        One page per long-tail keyword, each tied to a published game. Pages live at the site root (<code>/your-keyword</code>) and are
        included in the sitemap only when published and not noindex.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Link className="btn" to="/admin/landing/new">+ Add Tool Page</Link>
        <Link className="btn-secondary btn" to="/admin/ai">AI keys, quota &amp; gate</Link>
      </div>

      {rows.length === 0 ? <p className="muted">No landing pages yet.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Badge</th>
                <th>Slug</th>
                <th>Target keyword</th>
                <th>Title</th>
                <th>Tool</th>
                <th>Game</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.badge ? <span className="tag-chip">{row.badge}</span> : <span className="muted small">—</span>}</td>
                  <td><code>/{row.slug}</code></td>
                  <td>{row.focus_keyword || <span className="muted small">—</span>}</td>
                  <td>
                    {row.title}
                    {row.subtitle ? <div className="muted small">{row.subtitle}</div> : null}
                  </td>
                  <td>{landingToolLabel(row.tool_type)}</td>
                  <td>{row.game_title || <span className="muted small">—</span>}</td>
                  <td><span className={row.status === "published" ? "admin-badge" : "admin-badge draft"}>{row.status}</span></td>
                  <td>
                    <div className="admin-actions">
                      {row.status === "published" ? (
                        <a className="tag-chip" href={`/${row.slug}`} target="_blank" rel="noopener noreferrer">View</a>
                      ) : null}
                      <Link className="tag-chip" to={`/admin/landing/${row.id}`}>Edit</Link>
                      <button className="btn-secondary btn" onClick={() => remove(row)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ padding: 12, display: "grid", gap: 8, marginTop: 12, maxWidth: 760 }}>
        <h3 style={{ margin: 0 }}>Long-tail keyword finder</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Suggestions are derived from your seed wording only. No real search volume, difficulty, CPC, or ranking data is fetched or invented.
          Keywords already targeted by a published game, guide, or landing page are flagged.
        </p>
        <label>Seed keyword / topic <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="snow rider game" /></label>
        <p className="muted small" style={{ margin: 0 }}>Language: English (the only supported site language).</p>
        <button className="btn" onClick={findKeywords} disabled={busy || seed.trim().length < 2}>Suggest long-tail keywords</button>
        {kws.length > 0 && (
          <ul style={{ margin: 0 }}>
            {kws.map((k) => (
              <li key={k.keyword}>
                {k.coveredBy ? <span style={{ color: "#f87171" }}>●</span> : <span style={{ color: "#34d399" }}>●</span>}{" "}
                <strong>{k.keyword}</strong>{" "}
                <span className="muted small">({k.intent}) {k.note}{k.coveredBy ? " — already targeted by a published page" : ""}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="small" role="status">{msg}</p>
      </div>

      <Outlet />
    </div>
  );
}
