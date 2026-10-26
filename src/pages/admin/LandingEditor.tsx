import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { parseSectionsHtml } from "../../lib/aiContent";
import { sectionsToHtml } from "../../lib/aiPrompt";
import { DEFAULT_MODEL, FREE_MODELS } from "../../lib/aiModels";
import { slugify } from "../../lib/validate";
import { LANDING_LANGUAGES, LANDING_TOOL_LABELS, LANDING_TOOLS, LANDING_SUBTITLE_MAX, normalizeLandingTool } from "../../lib/landingTools";
import { Modal } from "../../components/Modal";
import { QualityMeter } from "./AiWriter";
import type { QualityReport } from "./AiWriter";
import { api, errOf } from "./landingApi";

type GameOption = { id: string; title: string; status: string };
type Section = { heading: string; body: string };
type LandForm = {
  game_id: string;
  badge: string;
  slug: string;
  focus_keyword: string;
  language: string;
  tool_type: string;
  intent: string;
  title: string;
  h1: string;
  subtitle: string;
  meta_description: string;
  intro: string;
  faqs: string;
  related_keywords: string;
  canonical_url: string;
  og_title: string;
  og_description: string;
  social_image: string;
  noindex: boolean;
  status: string;
  sort_order: number;
};
type SetField = <K extends keyof LandForm>(k: K, v: LandForm[K]) => void;

const EMPTY: LandForm = {
  game_id: "",
  badge: "",
  slug: "",
  focus_keyword: "",
  language: "English",
  tool_type: "game",
  intent: "play/transactional",
  title: "",
  h1: "",
  subtitle: "",
  meta_description: "",
  intro: "",
  faqs: "",
  related_keywords: "",
  canonical_url: "",
  og_title: "",
  og_description: "",
  social_image: "",
  noindex: false,
  status: "published",
  sort_order: 0,
};

function Sparkle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" style={{ verticalAlign: "-3px", marginRight: 6 }}>
      <path d="M5 12l4 4L19 6" />
    </svg>
  );
}

export function LandingEditor() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const nav = useNavigate();
  const [form, setForm] = useState<LandForm>(EMPTY);
  const [games, setGames] = useState<GameOption[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [loaded, setLoaded] = useState(!isEdit);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [report, setReport] = useState<QualityReport | null>(null);
  const [collisions, setCollisions] = useState<{ label: string }[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const notesRef = useRef<HTMLTextAreaElement>(null);

  function setField<K extends keyof LandForm>(k: K, v: LandForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function close() {
    nav("/admin/landing");
  }

  useEffect(() => {
    api<{ rows?: GameOption[]; error?: string }>("/api/admin/games").then((r) => {
      if (r.ok) setGames((r.data.rows || []).map((g) => ({ id: g.id, title: g.title, status: g.status })));
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    api<Record<string, unknown>>(`/api/admin/landings/${id}`).then((r) => {
      if (!alive) return;
      if (!r.ok) { setMsg("Landing page not found."); setLoaded(true); return; }
      const d = r.data;
      setForm({
        game_id: String(d.game_id || ""),
        badge: String(d.badge || ""),
        slug: String(d.slug || ""),
        focus_keyword: String(d.focus_keyword || ""),
        language: String(d.language || "English"),
        tool_type: normalizeLandingTool(d.tool_type),
        intent: String(d.intent || "play/transactional"),
        title: String(d.title || ""),
        h1: String(d.h1 || ""),
        subtitle: String(d.subtitle || ""),
        meta_description: String(d.meta_description || ""),
        intro: String(d.intro || ""),
        faqs: String(d.faqs || ""),
        related_keywords: String(d.related_keywords || ""),
        canonical_url: String(d.canonical_url || ""),
        og_title: String(d.og_title || ""),
        og_description: String(d.og_description || ""),
        social_image: String(d.social_image || ""),
        noindex: Boolean(d.noindex),
        status: String(d.status || "draft"),
        sort_order: Number(d.sort_order || 0),
      });
      setSections(parseSectionsHtml(String(d.sections || "")));
      setSlugTouched(true);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (slugTouched) return;
    setForm((f) => ({ ...f, slug: slugify(f.focus_keyword) }));
  }, [form.focus_keyword, slugTouched]);

  const qualityText = useMemo(
    () => [form.title, form.h1, form.subtitle, form.intro, sectionsToHtml(sections), form.faqs].filter(Boolean).join(" "),
    [form.title, form.h1, form.subtitle, form.intro, form.faqs, sections],
  );

  useEffect(() => {
    if (qualityText.trim().length < 40) { setReport(null); setCollisions([]); return; }
    const t = setTimeout(() => {
      api<{ report?: QualityReport; collisions?: { label: string }[] }>("/api/admin/ai/check", "POST", {
        kind: "landing", id, text: qualityText, keyword: form.focus_keyword,
      }).then((r) => {
        if (r.ok) { setReport(r.data.report ?? null); setCollisions(r.data.collisions || []); }
      }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [qualityText, form.focus_keyword, id]);

  function openBrief(message: string) {
    setAiOpen(true);
    setAiMsg(message);
    window.setTimeout(() => notesRef.current?.focus(), 0);
  }

  async function generate() {
    if (!form.focus_keyword.trim()) { openBrief("Enter the target keyword first."); return; }
    if (!form.game_id) { openBrief("Choose a linked game first so the draft is grounded in real game facts."); return; }
    if (notes.trim().length < 40) {
      openBrief("Write at least 40 characters of your own first-hand notes (required for originality).");
      return;
    }
    if (sections.some((s) => s.body.trim()) && !confirm("This replaces the current sections and copy. Continue?")) return;
    setAiBusy(true); setAiMsg("Generating…");
    const gameTitle = games.find((g) => g.id === form.game_id)?.title || "";
    const r = await api<{ error?: string; model?: string; draft?: Record<string, unknown> }>("/api/admin/ai/landing", "POST", {
      targetKeyword: form.focus_keyword,
      gameTitle,
      category: "",
      language: form.language,
      intent: form.intent,
      toolType: form.tool_type,
      sections: sections.map((s) => s.heading).filter(Boolean),
      uniqueNotes: notes,
      model,
      landingId: id,
      gameId: form.game_id,
    });
    if (!r.ok) { setAiMsg(errOf(r.data, "Generation failed. Check AI Writer keys and quota.")); setAiBusy(false); return; }
    const d = r.data.draft || {};
    const map: [string, keyof LandForm][] = [
      ["badge", "badge"], ["seo_title", "title"], ["h1", "h1"], ["subtitle", "subtitle"], ["meta_description", "meta_description"],
      ["intro", "intro"], ["faqs", "faqs"], ["focus_keyword", "focus_keyword"], ["related_keywords", "related_keywords"],
    ];
    for (const [src, field] of map) if (d[src] != null) setField(field, String(d[src]));
    if (typeof d.slug_suggestion === "string" && !form.slug) setField("slug", d.slug_suggestion);
    const ds = Array.isArray(d.sections) ? (d.sections as { heading?: string; body?: string }[]) : [];
    if (ds.length) setSections(ds.map((s) => ({ heading: String(s.heading || ""), body: String(s.body || "") })));
    setAiMsg(`Draft generated with ${r.data.model}. Review, then save. Nothing is published automatically.`);
    setAiBusy(false);
  }

  async function save() {
    if (!form.game_id) { setMsg("Choose a linked game first."); return; }
    if (form.title.trim().length < 2) { setMsg("Page title is required."); return; }
    if (!form.slug.trim() && !form.focus_keyword.trim()) { setMsg("Add a target keyword or a slug."); return; }
    const status = form.status === "published" ? "published" : "draft";
    setBusy(true); setMsg(status === "published" ? "Publishing…" : "Saving…");
    const payload = {
      game_id: form.game_id,
      badge: form.badge,
      slug: form.slug,
      focus_keyword: form.focus_keyword,
      language: form.language,
      tool_type: form.tool_type,
      intent: form.intent,
      title: form.title,
      h1: form.h1,
      subtitle: form.subtitle,
      meta_description: form.meta_description,
      intro: form.intro,
      sections: sectionsToHtml(sections),
      faqs: form.faqs,
      related_keywords: form.related_keywords,
      canonical_url: form.canonical_url,
      og_title: form.og_title,
      og_description: form.og_description,
      social_image: form.social_image,
      noindex: form.noindex,
      status,
      sort_order: form.sort_order,
    };
    const r = isEdit
      ? await api<{ error?: string; slug?: string }>(`/api/admin/landings/${id}`, "PUT", payload)
      : await api<{ error?: string; id?: string; slug?: string }>("/api/admin/landings", "POST", payload);
    if (!r.ok) { setMsg(errOf(r.data, "Save failed.")); setBusy(false); return; }
    setBusy(false);
    nav("/admin/landing");
  }

  const languages = LANDING_LANGUAGES.includes(form.language) ? LANDING_LANGUAGES : [form.language, ...LANDING_LANGUAGES];
  return (
    <Modal
      title={isEdit ? "Edit Tool Page" : "Add Tool Page"}
      subtitle={<>Live URL preview: <code>/{form.slug || "your-slug"}</code></>}
      onClose={close}
      footer={
        <>
          <button className="btn-secondary btn" type="button" onClick={close} disabled={busy}>Cancel</button>
          <button className="btn" type="button" onClick={save} disabled={busy || !loaded}>
            {form.status === "published" ? <><Check />Publish Page</> : "Save Draft"}
          </button>
        </>
      }
    >
      {!loaded ? <p>Loading…</p> : (
        <div className="landing-form">
          <button className="ai-strip" type="button" onClick={generate} disabled={aiBusy}>
            <Sparkle /> Generate with AI from Target Keyword
          </button>

          {aiOpen ? (
            <div className="ai-brief">
              <label>Model
                <select aria-label="Model" value={model} onChange={(e) => setModel(e.target.value)}>
                  {[...FREE_MODELS].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label>Your first-hand notes (40+ characters, required)
                <textarea
                  ref={notesRef}
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What players actually ask about this game or keyword…"
                />
              </label>
              <p className="muted small" style={{ margin: 0 }}>
                Free-tier Gemini only. The result is a draft you must review and save; nothing is published automatically.
              </p>
              <p className="small" role="status" style={{ margin: 0 }}>{aiMsg}</p>
            </div>
          ) : null}

          <div className="form-grid">
            <label>Slug (URL)
              <input value={form.slug} onChange={(e) => { setSlugTouched(true); setField("slug", e.target.value); }} placeholder="snow-rider-unblocked" />
            </label>
            <label>Badge
              <input value={form.badge} onChange={(e) => setField("badge", e.target.value)} placeholder="NEW TOOL" maxLength={40} />
            </label>
          </div>

          <div className="form-grid form-grid-3">
            <label>Target keyword
              <input value={form.focus_keyword} onChange={(e) => setField("focus_keyword", e.target.value)} placeholder="snow rider unblocked" />
            </label>
            <label>Language
              <select aria-label="Language" value={form.language} onChange={(e) => setField("language", e.target.value)}>
                {languages.map((l) => <option key={l} value={l}>{LANDING_LANGUAGES.includes(l) ? l : `${l} (legacy — not a public locale)`}</option>)}
              </select>
              {!LANDING_LANGUAGES.includes(form.language) ? (
                <span className="muted small">English is the only supported public language. This legacy value is kept for the existing record.</span>
              ) : null}
            </label>
            <label>Tool
              <select aria-label="Tool" value={form.tool_type} onChange={(e) => setField("tool_type", e.target.value)}>
                {LANDING_TOOLS.map((t) => <option key={t} value={t}>{LANDING_TOOL_LABELS[t]}</option>)}
              </select>
            </label>
          </div>

          <label>Linked game (required)
            <select aria-label="Linked game" value={form.game_id} onChange={(e) => setField("game_id", e.target.value)}>
              <option value="">Choose a game…</option>
              {games.map((g) => <option key={g.id} value={g.id}>{g.title}{g.status === "published" ? "" : ` (${g.status})`}</option>)}
            </select>
          </label>

          <label>
            <span>Page title (<code>&lt;title&gt;</code>)</span>
            <input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="Snow Rider Unblocked — Play Free Online" />
          </label>

          <label>Meta description
            <textarea rows={2} maxLength={160} value={form.meta_description} onChange={(e) => setField("meta_description", e.target.value)} />
          </label>

          <div className="form-grid">
            <label>H1 Heading
              <input value={form.h1} onChange={(e) => setField("h1", e.target.value)} placeholder="Snow Rider Unblocked" />
            </label>
            <label>Subtitle
              <input maxLength={LANDING_SUBTITLE_MAX} value={form.subtitle} onChange={(e) => setField("subtitle", e.target.value)} placeholder="A short reason to play, under the H1" />
            </label>
          </div>

          <label className="check-row">
            <input type="checkbox" checked={form.status === "published"} onChange={(e) => setField("status", e.target.checked ? "published" : "draft")} />
            Publish live (visible to visitors &amp; search engines)
          </label>

          <details className="landing-advanced">
            <summary>Advanced SEO &amp; content</summary>

            <div className="form-grid">
              <label className="span-2">Intro (HTML: p, strong, em)
                <textarea rows={4} value={form.intro} onChange={(e) => setField("intro", e.target.value)} />
              </label>
              <label>Search intent
                <select aria-label="Search intent" value={form.intent} onChange={(e) => setField("intent", e.target.value)}>
                  <option value="play/transactional">play/transactional</option>
                  <option value="informational">informational</option>
                  <option value="navigational">navigational</option>
                </select>
              </label>
              <label>Sort order
                <input type="number" value={form.sort_order} onChange={(e) => setField("sort_order", Number(e.target.value))} />
              </label>
              <label className="span-2">Related keywords (comma-separated)
                <input value={form.related_keywords} onChange={(e) => setField("related_keywords", e.target.value)} />
              </label>
              <label className="span-2">Canonical URL (optional)
                <input value={form.canonical_url} onChange={(e) => setField("canonical_url", e.target.value)} placeholder="https://slopecurve.com/snow-rider-unblocked" />
              </label>
              <label>OG title
                <input value={form.og_title} onChange={(e) => setField("og_title", e.target.value)} />
              </label>
              <label>OG description
                <input value={form.og_description} onChange={(e) => setField("og_description", e.target.value)} />
              </label>
              <label className="span-2">Social image URL
                <input value={form.social_image} onChange={(e) => setField("social_image", e.target.value)} placeholder="https://…/image.jpg" />
              </label>
              <label className="check-row span-2">
                <input type="checkbox" checked={form.noindex} onChange={(e) => setField("noindex", e.target.checked)} />
                noindex (hide the page: public 404 and removed from the sitemap)
              </label>
            </div>

            <h4 style={{ margin: "14px 0 6px" }}>Sections</h4>
            {sections.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No sections yet. Add one or generate with AI.</p> : null}
            {sections.map((s, i) => (
              <div key={i} style={{ display: "grid", gap: 6, borderTop: i === 0 ? "none" : "1px solid #1b2436", paddingTop: i === 0 ? 0 : 8, marginTop: 8 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    aria-label={`Section ${i + 1} heading`}
                    value={s.heading}
                    placeholder={`Section ${i + 1} heading`}
                    onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)))}
                  />
                  <button className="btn-secondary btn" type="button" onClick={() => setSections(sections.map((x, j) => (j === i - 1 ? sections[i] : j === i ? sections[i - 1] : x)))} disabled={i === 0} aria-label="Move section up">↑</button>
                  <button className="btn-secondary btn" type="button" onClick={() => setSections(sections.map((x, j) => (j === i ? sections[i + 1] : j === i + 1 ? sections[i] : x)))} disabled={i === sections.length - 1} aria-label="Move section down">↓</button>
                  <button className="btn-secondary btn" type="button" onClick={() => setSections(sections.filter((_, j) => j !== i))}>Remove</button>
                </div>
                <textarea
                  aria-label={`Section ${i + 1} body`}
                  rows={4}
                  value={s.body}
                  placeholder="Section body (HTML: p, ul, li, strong…)"
                  onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
                />
              </div>
            ))}
            <button className="btn-secondary btn" type="button" onClick={() => setSections([...sections, { heading: "", body: "" }])} style={{ marginTop: 8 }}>+ Add section</button>

            <h4 style={{ margin: "14px 0 6px" }}>FAQs</h4>
            <p className="muted small" style={{ margin: "0 0 6px" }}>
              Use repeated <code>&lt;h3&gt;Question&lt;/h3&gt;&lt;p&gt;Answer&lt;/p&gt;</code> pairs. They render visibly and as FAQPage JSON-LD.
            </p>
            <label>FAQs
              <textarea rows={5} value={form.faqs} onChange={(e) => setField("faqs", e.target.value)} />
            </label>

            <div style={{ marginTop: 12 }}>
              <QualityMeter report={report} collisions={collisions} />
            </div>
          </details>

          <p className="small" role="status" style={{ margin: 0 }}>{msg}</p>
        </div>
      )}
    </Modal>
  );
}
