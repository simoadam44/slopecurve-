import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export function useSiteSettings(): Record<string, string> {
  const [s, setS] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/settings").then((r) => (r.ok ? r.json() : {})).then(setS).catch(() => {});
  }, []);
  return s;
}

export function Header({ onSearch }: { onSearch?: (q: string) => void }) {
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const settings = useSiteSettings();
  const siteName = settings.site_name || "SlopeCurve";
  return (
    <header style={{ borderBottom: "1px solid #1f2937", background: "#000" }}>
      <div className="container" style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", flexWrap: "wrap" }}>
        <Link to="/" style={{ fontWeight: 800, fontSize: 20, color: "#fff" }} aria-label={`${siteName} home`}>
          {settings.logo_url ? <img src={settings.logo_url} alt={`${siteName} logo`} style={{ height: 28 }} /> : <>🎮 Slope<span style={{ color: "#22d3ee" }}>Curve</span></>}
        </Link>
        <form
          role="search"
          style={{ flex: 1, minWidth: 180, display: "flex", gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (onSearch) onSearch(q);
            else nav(`/games?q=${encodeURIComponent(q)}`);
          }}
        >
          <input aria-label="Search games" placeholder="Search games…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <nav aria-label="Primary" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link to="/">Home</Link>
          <Link to="/games">Games</Link>
          <Link to="/categories">Categories</Link>
          <Link to="/new-games">New</Link>
          <Link to="/hot-games">Hot</Link>
          <Link to="/blog">Blog</Link>
          <Link to="/about">About</Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/settings").then((r) => (r.ok ? r.json() : {})).then(setSettings).catch(() => {});
  }, []);
  return (
    <footer style={{ borderTop: "1px solid #1f2937", marginTop: 32, background: "#000" }}>
      <div className="container footer-inner">
        <div className="footer-groups">
          <div className="footer-col">
            <p className="footer-heading">Information</p>
            <nav aria-label="Information" className="footer-links">
              <Link to="/about">About Us</Link>
              <Link to="/faq">FAQ</Link>
              <Link to="/sitemap.xml">Sitemap</Link>
            </nav>
          </div>
          <div className="footer-col">
            <p className="footer-heading">Legal</p>
            <nav aria-label="Legal" className="footer-links">
              <Link to="/privacy-policy">Privacy Policy</Link>
              <Link to="/terms-of-use">Terms of Use</Link>
              <Link to="/contact">Contact</Link>
            </nav>
          </div>
        </div>
        <p className="muted small" style={{ marginLeft: "auto" }}>{settings.footer_text || "SlopeCurve — Play Free Online Games © 2026. All rights reserved."}</p>
      </div>
    </footer>
  );
}

export interface DocumentMetaOptions {
  /** Open Graph type for this page (article only for blog posts). */
  ogType?: "website" | "article";
  /** Stored og_title override, when present. */
  ogTitle?: string | null;
  /** Stored og_description override, when present. */
  ogDescription?: string | null;
}

function upsertMeta(attribute: "name" | "property", key: string, content: string) {
  const nodes = Array.from(document.head.querySelectorAll(`meta[${attribute}="${key}"]`));
  const first = nodes.shift();
  const el = (first ?? document.createElement("meta")) as HTMLMetaElement;
  if (!first) {
    el.setAttribute(attribute, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  nodes.forEach((node) => node.remove());
}

export function useDocumentMeta(title: string, description: string, canonical?: string, options: DocumentMetaOptions = {}) {
  const { ogType, ogTitle, ogDescription } = options;
  useEffect(() => {
    document.title = title;
    upsertMeta("name", "description", description);
    // Keep social text consistent on client navigation; SSR emitted exactly one set.
    // og:image is owned by the server so hydration never swaps a configured default for a thumbnail.
    upsertMeta("property", "og:title", String(ogTitle || "").trim() || title);
    upsertMeta("property", "og:description", String(ogDescription || "").trim() || description);
    if (ogType) upsertMeta("property", "og:type", ogType);
    let c = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (canonical) {
      if (!c) {
        c = document.createElement("link");
        c.rel = "canonical";
        document.head.appendChild(c);
      }
      c.href = canonical;
      upsertMeta("property", "og:url", canonical);
    }
  }, [title, description, canonical, ogType, ogTitle, ogDescription]);
}

/** Manage the robots directive on client navigation; empty removes it. */
export function useRobots(directive?: string) {
  useEffect(() => {
    const nodes = Array.from(document.head.querySelectorAll('meta[name="robots"]'));
    if (!directive) {
      nodes.forEach((node) => node.remove());
      return;
    }
    const first = nodes.shift();
    const el = (first ?? document.createElement("meta")) as HTMLMetaElement;
    if (!first) {
      el.setAttribute("name", "robots");
      document.head.appendChild(el);
    }
    el.setAttribute("content", directive);
    nodes.forEach((node) => node.remove());
  }, [directive]);
}

/**
 * Keep exactly one JSON-LD script per page entity. SSR tags its scripts with
 * `data-seo-jsonld`; hydration replaces that copy instead of appending a duplicate.
 */
export function useJsonLd(id: string, data: unknown | null) {
  const json = data == null ? "" : JSON.stringify(data);
  useEffect(() => {
    const selector = `script[type="application/ld+json"][data-seo-jsonld="${id}"]`;
    const existing = Array.from(document.head.querySelectorAll(selector));
    if (!json) {
      existing.forEach((node) => node.remove());
      return;
    }
    existing.forEach((node) => node.remove());
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-seo-jsonld", id);
    script.textContent = json;
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [id, json]);
}
