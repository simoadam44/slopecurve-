import { useCallback, useEffect, useMemo, useState } from "react";
import { sectionsToHtml } from "../../lib/aiPrompt";
import { parseSectionsHtml } from "../../lib/aiContent";
import { DEFAULT_MODEL, FREE_MODELS } from "../../lib/aiModels";
import { adminFetch } from "../../lib/adminApi";

type KeyRow = { id: string; label: string; hint: string; model: string; active: number; requestsToday: number; lastUsedAt: string | null };
type AiGate = { enabled: boolean; minWordsGame: number; minWordsPost: number; minWordsLanding: number; maxSimilarity: number };
type AiStatus = { configured: boolean; envKey: boolean; tableReady: boolean; defaultModel: string; models: string[]; cap: number; usedToday: number; gate: AiGate; keys: KeyRow[] };
export type QualityReport = { ok: boolean; wordCount: number; maxSimilarity: number; closest: { id: string; label: string; score: number } | null; errors: string[] };

async function jpost<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const r = await adminFetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await r.json().catch(() => ({}))) as T;
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: {} as T };
  }
}
function errOf(data: unknown, fallback: string): string {
  return (data as { error?: string })?.error || fallback;
}

export function QualityMeter({ report, collisions }: { report: QualityReport | null; collisions: { label: string }[] }) {
  if (!report) return <p className="muted small">Checking uniqueness…</p>;
  const pct = Math.round(report.maxSimilarity * 100);
  const dup = report.maxSimilarity > 0.35;
  return (
    <div className="card" style={{ padding: 10, display: "grid", gap: 4 }}>
      <div className="small">
        Words: <strong>{report.wordCount}</strong> · Highest similarity: <strong style={{ color: dup ? "#f87171" : "#22d3ee" }}>{pct}%</strong>
        {report.closest ? <span className="muted"> (vs “{report.closest.label}”)</span> : null}
      </div>
      <div style={{ height: 6, background: "#0e1524", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: dup ? "#f87171" : "#22d3ee" }} />
      </div>
      {report.errors.map((e, i) => <p key={i} className="small" style={{ color: "#f87171", margin: 0 }}>• {e}</p>)}
      {collisions.map((c, i) => <p key={`c${i}`} className="small" style={{ color: "#f87171", margin: 0 }}>• Keyword already targeted by “{c.label}”.</p>)}
      {report.ok && collisions.length === 0 ? <p className="small" style={{ color: "#34d399", margin: 0 }}>Passes the publish gate (heuristic only — it does not guarantee rankings or indexing).</p> : null}
    </div>
  );
}

export function AiAdmin() {
  const [s, setS] = useState<AiStatus | null>(null);
  const [msg, setMsg] = useState("");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [cap, setCap] = useState("40");
  const [gate, setGate] = useState<AiGate>({ enabled: true, minWordsGame: 150, minWordsPost: 300, minWordsLanding: 120, maxSimilarity: 0.35 });
  const [seed, setSeed] = useState("");
  const lang = "English";
  const [busy, setBusy] = useState(false);
  const [kws, setKws] = useState<{ keyword: string; intent: string; note: string; coveredBy: boolean }[]>([]);

  const load = useCallback(async () => {
    const r = await adminFetch("/api/admin/ai/status");
    if (!r.ok) { setS(null); return; }
    const d = (await r.json()) as AiStatus;
    setS(d); setCap(String(d.cap)); setGate(d.gate);
  }, []);
  useEffect(() => { load(); }, [load]);

  const models = useMemo(() => (s?.models?.length ? s.models : [...FREE_MODELS]), [s]);

  async function addKey() {
    setBusy(true); setMsg("Saving key…");
    const r = await jpost<{ error?: string; hint?: string }>("/api/admin/ai/keys", { label, apiKey, model });
    setMsg(r.ok ? `Key saved (${r.data.hint}). It is encrypted and never shown again.` : errOf(r.data, "Could not save key."));
    if (r.ok) { setLabel(""); setApiKey(""); load(); }
    setBusy(false);
  }
  async function testKey() {
    setBusy(true); setMsg("Testing…");
    const r = await jpost<{ error?: string; model?: string }>("/api/admin/ai/test", {});
    setMsg(r.ok ? `Connected. Responding model: ${r.data.model}` : errOf(r.data, "Connection failed."));
    setBusy(false);
  }
  async function saveGate() {
    setMsg("Saving…");
    const r = await adminFetch("/api/admin/settings", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ai_daily_cap: String(cap),
        ai_gate_enabled: gate.enabled ? "true" : "false",
        ai_gate_min_words_game: String(gate.minWordsGame),
        ai_gate_min_words_post: String(gate.minWordsPost),
        ai_gate_min_words_landing: String(gate.minWordsLanding),
        ai_gate_max_similarity: String(gate.maxSimilarity),
      }),
    });
    setMsg(r.ok ? "AI settings saved." : "Failed to save AI settings.");
    if (r.ok) load();
  }
  async function genKeywords() {
    setBusy(true); setMsg("Generating keywords…"); setKws([]);
    const r = await jpost<{ error?: string; keywords?: typeof kws }>("/api/admin/ai/keywords", { seed, language: lang, model });
    setMsg(r.ok ? "Keywords ready." : errOf(r.data, "Keyword generation failed."));
    if (r.ok) setKws(r.data.keywords || []);
    setBusy(false);
  }

  if (!s) return <p className="muted">AI Writer needs D1 (run migrations locally) and an admin session.</p>;

  return (
    <div>
      <h2>✨ AI Writer</h2>
      <p className="muted small">
        Free-tier Google Gemini only. Keys are AES-GCM encrypted and stay server-side (the browser only ever sees a masked hint).
        Objectively limited to free-tier models — Pro/paid/image/audio models are rejected. Daily cap protects the free quota
        (Google does not publish free RPD; treat this cap as a safety net).
      </p>

      <div className="card" style={{ padding: 12, display: "grid", gap: 8, maxWidth: 680 }}>
        <h3 style={{ margin: 0 }}>Status</h3>
        <p className="small" style={{ margin: 0 }}>
          {s.envKey ? "Environment key GEMINI_API_KEY is set (takes priority). " : ""}
          {s.configured ? "AI ready." : "No key configured yet."} Used today: {s.usedToday}/{s.cap}. Table: {s.tableReady ? "ready" : "missing — run migrations"}.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-secondary btn" onClick={testKey} disabled={busy}>Test connection</button>
          <button className="btn-secondary btn" onClick={load} disabled={busy}>Refresh</button>
        </div>

        <h3 style={{ margin: "8px 0 0" }}>Add a key</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Get a free key at Google AI Studio. Since June 2026 Google rejects <em>unrestricted</em> keys — restrict the key to the
          Gemini API (generativelanguage.googleapis.com). Add more than one key to survive rotation/quota.
        </p>
        <label>Label <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Personal key 1" /></label>
        <label>API key <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIza… or AQ.…" autoComplete="off" /></label>
        <label>Model <select value={model} onChange={(e) => setModel(e.target.value)}>{models.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
        <button className="btn" onClick={addKey} disabled={busy || !apiKey}>Save key</button>

        {s.keys.length > 0 && (
          <>
            <h3 style={{ margin: "8px 0 0" }}>Keys</h3>
            <ul style={{ margin: 0 }}>
              {s.keys.map((k) => (
                <li key={k.id}>
                  <strong>{k.label || "(key)"}</strong> <span className="muted small">{k.hint} · {k.model} · used today {k.requestsToday}</span>{" "}
                  <button className="btn-secondary btn" onClick={async () => {
                    await adminFetch(`/api/admin/ai/keys/${k.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: !k.active }) });
                    load();
                  }}>{k.active ? "Disable" : "Enable"}</button>{" "}
                  <button className="btn-secondary btn" onClick={async () => {
                    const nk = prompt("Paste a new API key to rotate in (leave empty to cancel):") || "";
                    if (!nk) return;
                    const r = await adminFetch(`/api/admin/ai/keys/${k.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiKey: nk }) });
                    setMsg(r.ok ? "Key rotated." : "Rotation failed.");
                    load();
                  }}>Rotate</button>{" "}
                  <button className="btn-secondary btn" onClick={async () => {
                    if (!confirm("Delete this key?")) return;
                    await adminFetch(`/api/admin/ai/keys/${k.id}`, { method: "DELETE" });
                    load();
                  }}>Delete</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="card" style={{ padding: 12, display: "grid", gap: 8, maxWidth: 680, marginTop: 12 }}>
        <h3 style={{ margin: 0 }}>Publish gate &amp; quota</h3>
        <p className="muted small" style={{ margin: 0 }}>Strict mode blocks publishing content that is too thin or too similar to an existing page (the safeguard against duplicate/low-value pages). Similarity is a word-overlap heuristic — tune the threshold to taste; it reduces near-duplicates but cannot guarantee rankings.</p>
        <label><input type="checkbox" checked={gate.enabled} onChange={(e) => setGate({ ...gate, enabled: e.target.checked })} style={{ width: "auto" }} /> Enforce gate on publish</label>
        <label>Daily request cap <input type="number" value={cap} onChange={(e) => setCap(e.target.value)} min={1} max={1000} /></label>
        <label>Min words — game page <input type="number" value={gate.minWordsGame} onChange={(e) => setGate({ ...gate, minWordsGame: Number(e.target.value) })} min={0} /></label>
        <label>Min words — guide/article <input type="number" value={gate.minWordsPost} onChange={(e) => setGate({ ...gate, minWordsPost: Number(e.target.value) })} min={0} /></label>
        <label>Min words — landing page <input type="number" value={gate.minWordsLanding} onChange={(e) => setGate({ ...gate, minWordsLanding: Number(e.target.value) })} min={0} /></label>
        <label>Max similarity (0–1) <input type="number" step="0.05" value={gate.maxSimilarity} onChange={(e) => setGate({ ...gate, maxSimilarity: Number(e.target.value) })} min={0} max={1} /></label>
        <button className="btn" onClick={saveGate}>Save AI settings</button>

        <h3 style={{ margin: "8px 0 0" }}>Long-tail keyword finder</h3>
        <p className="muted small" style={{ margin: 0 }}>Suggestions are estimates derived from your seed wording only. No real search volume, difficulty, CPC, or ranking data is fetched or invented — verify demand before committing.</p>
        <label>Seed keyword / topic <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="snow rider game" /></label>
        <p className="muted small" style={{ margin: 0 }}>Language: English (the only supported site language).</p>
        <button className="btn" onClick={genKeywords} disabled={busy || seed.trim().length < 2}>Suggest long-tail keywords</button>
        {kws.length > 0 && (
          <ul style={{ margin: 0 }}>
            {kws.map((k) => (
              <li key={k.keyword}>
                {k.coveredBy ? <span style={{ color: "#f87171" }}>●</span> : <span style={{ color: "#34d399" }}>●</span>} <strong>{k.keyword}</strong>{" "}
                <span className="muted small">({k.intent}) {k.note}{k.coveredBy ? " — already targeted by a published page" : ""}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small" role="status">{msg}</p>
      </div>
    </div>
  );
}

const GAME_SECTIONS = ["Overview", "How to play", "Controls explained", "Tips & strategy", "FAQ"];

export function GameAiCard({ form, set, gameId }: {
  form: Record<string, string | boolean | number>;
  set: (k: string, v: string | boolean | number) => void;
  gameId?: string;
}) {
  const [sections, setSections] = useState<string[]>(GAME_SECTIONS);
  const [notes, setNotes] = useState("");
  const [keyword, setKeyword] = useState(String(form.focus_keyword || ""));
  const language = "English";
  const [intent, setIntent] = useState("play/transactional");
  const [gameplay, setGameplay] = useState("");
  const [controls, setControls] = useState("");
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [report, setReport] = useState<QualityReport | null>(null);

  const host = useMemo(() => {
    try { return new URL(String(form.game_url || "")).hostname; } catch { return ""; }
  }, [form.game_url]);

  useEffect(() => { setKeyword(String(form.focus_keyword || "")); }, [form.focus_keyword]);

  useEffect(() => {
    const text = [form.short_description, form.long_description, form.how_to_play, form.tips].map((v) => String(v ?? "")).join(" ");
    if (text.trim().length < 40) { setReport(null); return; }
    const t = setTimeout(() => {
      jpost<{ report?: QualityReport }>("/api/admin/ai/check", { kind: "game", id: gameId, text, keyword: String(form.focus_keyword || "") })
        .then((r) => setReport(r.data.report ?? null)).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [form.short_description, form.long_description, form.how_to_play, form.tips, form.focus_keyword, gameId]);

  async function gen() {
    if (!keyword.trim()) { setMsg("Enter a focus keyword first."); return; }
    if (notes.trim().length < 40) { setMsg("Write at least 40 characters of your own first-hand notes (required for originality)."); return; }
    if (String(form.long_description || "").trim() && !confirm("This will replace the current description/How-to-play/Controls/Tips/FAQ. Continue?")) return;
    setBusy(true); setMsg("Generating…");
    const r = await jpost<{ error?: string; model?: string; copy?: Record<string, unknown> }>("/api/admin/ai/game", {
      title: String(form.title || ""), category: String(form.category_slug || ""), providerHost: host,
      focusKeyword: keyword, relatedKeywords: String(form.related_keywords || "").split(",").map((x) => x.trim()).filter(Boolean),
      uniqueNotes: notes, language, sections, model, gameId,
      searchIntent: intent, gameplay, controls, instructions,
    });
    if (!r.ok) { setMsg(errOf(r.data, "Generation failed.")); setBusy(false); return; }
    const c = r.data.copy || {};
    for (const k of ["short_description", "long_description", "how_to_play", "controls", "tips", "faqs", "seo_title", "meta_description", "focus_keyword", "related_keywords"]) {
      if (c[k] != null) set(k, String(c[k]));
    }
    setMsg(`Generated with ${r.data.model}. Review, then Save. Nothing is published automatically.`);
    setBusy(false);
  }

  return (
    <div className="card" style={{ padding: 12, display: "grid", gap: 8, maxWidth: 680 }}>
      <h3 style={{ margin: 0 }}>✨ Generate game copy (AI)</h3>
      <p className="muted small" style={{ margin: 0 }}>
        Fills description, How to Play, Controls, Tips, FAQ and SEO fields from the game's real details plus your notes.
        Output is sanitized and saved as a draft only — you publish it manually.
      </p>
      <label>Focus keyword <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. snow rider game" /></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label>Language <input value="English" readOnly aria-label="Language (English only)" /><span className="muted small">English only.</span></label>
        <label>Search intent <select value={intent} onChange={(e) => setIntent(e.target.value)}><option value="play/transactional">play/transactional</option><option value="informational">informational</option><option value="navigational">navigational</option></select></label>
      </div>
      <fieldset style={{ border: "1px solid #26334B", borderRadius: 8, padding: 8 }}>
        <legend className="small">Sections</legend>
        {GAME_SECTIONS.map((sec) => (
          <label key={sec} style={{ display: "block" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={sections.includes(sec)}
              onChange={(e) => setSections((p) => e.target.checked ? [...p, sec] : p.filter((x) => x !== sec))} /> {sec}
          </label>
        ))}
      </fieldset>
      <label>Gameplay details (optional facts) <textarea rows={2} value={gameplay} onChange={(e) => setGameplay(e.target.value)} placeholder="Goal of the game, how a round works, what ends it." /></label>
      <label>Controls (optional facts) <textarea rows={2} value={controls} onChange={(e) => setControls(e.target.value)} placeholder="Arrow keys / WASD to steer, space to jump…" /></label>
      <label>Instructions to highlight (optional facts) <textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Anything a new player must know first." /></label>
      <label>Your first-hand notes (required, 40+ chars) <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What actually happens when you play? Controls? What players get wrong? Anything unique." /></label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={gen} disabled={busy}>{busy ? "Working…" : "Generate game copy"}</button>
      </div>
      <p className="muted small" role="status">{msg}</p>
      {report ? <QualityMeter report={report} collisions={[]} /> : null}
    </div>
  );
}

type GuideSection = { heading: string; body: string };
type PostRow = { id: string; title: string; slug: string; status: string; focus_keyword?: string | null };
const EMPTY_GUIDE = { slug: "", focus_keyword: "", language: "English", intent: "informational", related_tool: "", title: "", h1: "", meta_description: "", excerpt: "" };


export function GuidesEngine() {
  const [rows, setRows] = useState<PostRow[]>([]);
  const [id, setId] = useState<string>("");
  const [f, setF] = useState<Record<string, string>>({ ...EMPTY_GUIDE });
  const [sections, setSections] = useState<GuideSection[]>([{ heading: "Quick answer", body: "" }]);
  const [raw, setRaw] = useState("");
  const [notes, setNotes] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [report, setReport] = useState<QualityReport | null>(null);
  const [collisions, setCollisions] = useState<{ label: string }[]>([]);

  const load = useCallback(async () => {
    const r = await adminFetch("/api/admin/posts");
    setRows(r.ok ? await r.json() : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const content = useMemo(() => {
    const secs = sections.filter((s) => s.heading.trim() || s.body.trim());
    if (!secs.length) return raw;
    if (secs.some((s) => s.heading.trim())) return sectionsToHtml(secs);
    return secs.map((s) => s.body).join("");
  }, [sections, raw]);

  useEffect(() => {
    if (content.trim().length < 40) { setReport(null); setCollisions([]); return; }
    const t = setTimeout(() => {
      jpost<{ report?: QualityReport; collisions?: { label: string }[] }>("/api/admin/ai/check", { kind: "post", id, text: `${f.excerpt} ${content}`, keyword: f.focus_keyword })
        .then((r) => { setReport(r.data.report ?? null); setCollisions(r.data.collisions ?? []); }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [content, f.excerpt, f.focus_keyword, id]);

  function reset() { setId(""); setF({ ...EMPTY_GUIDE }); setSections([{ heading: "Quick answer", body: "" }]); setRaw(""); setNotes(""); setReport(null); setCollisions([]); setMsg(""); }

  async function open(postId: string) {
    const r = await adminFetch(`/api/admin/posts/${postId}`);
    if (!r.ok) { setMsg("Could not load that guide."); return; }
    const p = (await r.json()) as Record<string, unknown>;
    setId(postId);
    setF({
      slug: String(p.slug || ""), focus_keyword: String(p.focus_keyword || ""), language: String(p.language || "English"),
      intent: String(p.intent || "informational"), related_tool: String(p.related_tool || ""), title: String(p.title || ""),
      h1: String(p.h1 || ""), meta_description: String(p.meta_description || ""), excerpt: String(p.excerpt || ""),
    });
    const stored = String(p.content || "");
    setRaw(stored);
    setSections(parseSectionsHtml(stored));
    setNotes("");
    setMsg("Loaded. Regenerate or edit, then Save.");
  }

  async function generate() {
    if (!f.focus_keyword.trim()) { setMsg("Enter the target (long-tail) keyword first."); return; }
    if (notes.trim().length < 40) { setMsg("Add at least 40 characters of your own notes (required for originality)."); return; }
    setBusy(true); setMsg("Generating guide…");
    const r = await jpost<{ error?: string; model?: string; draft?: Record<string, unknown> }>("/api/admin/ai/post", {
      targetKeyword: f.focus_keyword, language: f.language, intent: f.intent, relatedTool: f.related_tool,
      workingTitle: f.title, uniqueNotes: notes, model,
      sections: sections.map((s) => s.heading).filter(Boolean),
    });
    if (!r.ok) { setMsg(errOf(r.data, "Generation failed.")); setBusy(false); return; }
    const d = r.data.draft || {};
    const next: Record<string, string> = { ...f };
    for (const k of ["title", "h1", "meta_description", "excerpt", "focus_keyword", "related_keywords", "tags"]) if (d[k] != null) next[k] = String(d[k]);
    if (!next.slug && d.slug_suggestion) next.slug = String(d.slug_suggestion);
    const secs = Array.isArray(d.sections) ? (d.sections as { heading?: string; body?: string }[]) : [];
    if (secs.length) setSections(secs.map((s) => ({ heading: String(s.heading || ""), body: String(s.body || "") })));
    if (secs.length) setRaw("");
    setF(next);
    setMsg(`Generated with ${r.data.model}. Review, then Save draft or Publish.`);
    setBusy(false);
  }

  async function genOutline() {
    if (!f.focus_keyword.trim()) { setMsg("Enter the target keyword first."); return; }
    setBusy(true); setMsg("Planning outline…");
    const r = await jpost<{ error?: string; outline?: { heading: string; level: string }[] }>("/api/admin/ai/outline", {
      targetKeyword: f.focus_keyword, language: f.language, intent: f.intent, relatedTool: f.related_tool,
      workingTitle: f.title, uniqueNotes: notes, model,
    });
    if (!r.ok) { setMsg(errOf(r.data, "Outline generation failed.")); setBusy(false); return; }
    const o = r.data.outline || [];
    if (o.length) setSections(o.map((x) => ({ heading: x.heading, body: "" })));
    setMsg(`Outline ready (${o.length} sections). Now generate the guide to fill them in.`);
    setBusy(false);
  }

  async function classifyIntent() {
    if (!f.focus_keyword.trim()) { setMsg("Enter the target keyword first."); return; }
    setBusy(true); setMsg("Classifying intent…");
    const r = await jpost<{ error?: string; intent?: string; reason?: string }>("/api/admin/ai/intent", {
      targetKeyword: f.focus_keyword, language: f.language, model,
    });
    if (!r.ok) { setMsg(errOf(r.data, "Intent classification failed.")); setBusy(false); return; }
    if (r.data.intent) set("intent", r.data.intent);
    setMsg(`Classified as "${r.data.intent}". ${r.data.reason || ""}`.trim());
    setBusy(false);
  }

  async function regenSection(i: number) {
    const s = sections[i];
    if (!s?.heading) { setMsg("Give the section a heading before regenerating."); return; }
    setBusy(true); setMsg(`Regenerating “${s.heading}”…`);
    const r = await jpost<{ error?: string; section?: GuideSection }>("/api/admin/ai/section", {
      articleTitle: f.title, heading: s.heading, targetKeyword: f.focus_keyword, language: f.language,
      uniqueNotes: notes, avoid: s.body, context: sections.filter((_, j) => j !== i).map((x) => x.heading).join(", "), model,
    });
    if (!r.ok) { setMsg(errOf(r.data, "Section regeneration failed.")); setBusy(false); return; }
    const body = r.data.section?.body ?? "";
    setSections((p) => p.map((x, j) => (j === i ? { ...x, body } : x)));
    setMsg("Section regenerated.");
    setBusy(false);
  }

  async function save(publish: boolean) {
    if (!f.title.trim()) { setMsg("A page title is required."); return; }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.slug)) { setMsg("Slug must be lowercase-hyphenated."); return; }
    setBusy(true); setMsg(publish ? "Publishing…" : "Saving draft…");
    const payload = { ...f, content, status: publish ? "published" : "draft" };
    const r = await adminFetch(id ? `/api/admin/posts/${id}` : "/api/admin/posts", {
      method: id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) { setMsg(errOf(data, "Save failed.")); setBusy(false); return; }
    setMsg(publish ? "Published." : "Draft saved.");
    if (!id) reset();
    load();
    setBusy(false);
  }

  return (
    <div>
      <h2>Blog &amp; Long-Tail Guides Engine</h2>
      <p className="muted small">Write one original guide per long-tail keyword. A strict gate blocks thin or duplicate pages on publish — drafts are always allowed.</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <button className="btn" onClick={reset}>{id ? "+ New guide" : "• New guide"}</button>
        <span className="muted small" role="status">{id ? `Editing: ${f.title || id}` : "New guide"}</span>
      </div>

      <ul style={{ maxWidth: 680 }}>
        {rows.map((p) => (
          <li key={p.id}>
            {p.title} <span className="muted small">({p.slug} • {p.status})</span>{" "}
            <button className="btn-secondary btn" onClick={() => open(p.id)}>Edit</button>{" "}
            <button className="btn-secondary btn" onClick={async () => { if (confirm(`Delete ${p.title}?`)) { await adminFetch(`/api/admin/posts/${p.id}`, { method: "DELETE" }); load(); } }}>Delete</button>
          </li>
        ))}
      </ul>

      <div style={{ display: "grid", gap: 8, maxWidth: 680 }}>
        <label>Slug <input value={f.slug} onChange={(e) => set("slug", e.target.value)} placeholder="how-to-play-snow-rider" /></label>
        <label>Target keyword (long-tail) <input value={f.focus_keyword} onChange={(e) => set("focus_keyword", e.target.value)} placeholder="how to play snow rider without crashing" /></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <label>Language <input value="English" readOnly aria-label="Language (English only)" /><span className="muted small">English only.</span></label>
          <label>Intent <select value={f.intent} onChange={(e) => set("intent", e.target.value)}><option value="informational">informational</option><option value="navigational">navigational</option><option value="play/transactional">play/transactional</option></select></label>
          <label>Related game/tool <input value={f.related_tool} onChange={(e) => set("related_tool", e.target.value)} placeholder="Snow Rider" /></label>
        </div>
        <div>
          <button className="btn-secondary btn" onClick={classifyIntent} disabled={busy} type="button">Classify intent with AI</button>
          <span className="muted small"> Suggests the intent from the keyword wording (no stats fetched).</span>
        </div>
        <label>Page title <input value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
        <label>H1 <input value={f.h1} onChange={(e) => set("h1", e.target.value)} /></label>
        <label>Meta description (≤155) <input value={f.meta_description} onChange={(e) => set("meta_description", e.target.value)} /></label>
        <label>Excerpt <textarea rows={2} value={f.excerpt} onChange={(e) => set("excerpt", e.target.value)} /></label>

        <fieldset style={{ border: "1px solid #26334B", borderRadius: 8, padding: 8, display: "grid", gap: 8 }}>
          <legend className="small">Sections</legend>
          <button className="btn-secondary btn" onClick={genOutline} disabled={busy} type="button">✨ Plan outline from keyword</button>
          {sections.map((s, i) => (
            <div key={i} style={{ display: "grid", gap: 4, borderBottom: "1px solid #1b2436", paddingBottom: 8 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input value={s.heading} onChange={(e) => setSections((p) => p.map((x, j) => j === i ? { ...x, heading: e.target.value } : x))} placeholder="Heading" style={{ flex: 1 }} />
                <button className="btn-secondary btn" onClick={() => setSections((p) => { const c = [...p]; if (i > 0) { [c[i - 1], c[i]] = [c[i], c[i - 1]]; } return c; })} aria-label="Move up">↑</button>
                <button className="btn-secondary btn" onClick={() => setSections((p) => { const c = [...p]; if (i < c.length - 1) { [c[i + 1], c[i]] = [c[i], c[i + 1]]; } return c; })} aria-label="Move down">↓</button>
                <button className="btn-secondary btn" onClick={() => regenSection(i)} disabled={busy}>Regenerate</button>
                <button className="btn-secondary btn" onClick={() => setSections((p) => p.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
              </div>
              <textarea rows={4} value={s.body} onChange={(e) => setSections((p) => p.map((x, j) => j === i ? { ...x, body: e.target.value } : x))} placeholder="Section body (HTML allowed: h3/p/ul/li/strong/em)" />
            </div>
          ))}
          <button className="btn-secondary btn" onClick={() => setSections((p) => [...p, { heading: "", body: "" }])}>+ Add section</button>
        </fieldset>

        <label>Your first-hand notes (required for AI, 40+ chars) <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What do you actually know about this? Real steps, mistakes, examples." /></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={generate} disabled={busy}>{busy ? "Working…" : "✨ Generate with AI from keyword"}</button>
          <button className="btn-secondary btn" onClick={() => save(false)} disabled={busy}>Save draft</button>
          <button className="btn" onClick={() => save(true)} disabled={busy}>Publish</button>
        </div>
        <p className="muted small" role="status">{msg}</p>
        <QualityMeter report={report} collisions={collisions} />
      </div>
    </div>
  );
}
