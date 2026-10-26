// Pure XML sitemap builder. Published-only filtering happens in the Worker query;
// this module only formats entries and never invents a timestamp.
import { toIsoDate } from "./dates";

export interface SitemapEntry {
  loc: string;
  /** ISO-8601 UTC string. Missing/invalid values are omitted from the XML. */
  lastmod?: string | null;
}

/** Prefer a real updated_at, then published_at; null when neither parses. */
export function sitemapLastmod(updatedAt: unknown, publishedAt: unknown): string | null {
  return toIsoDate(updatedAt) ?? toIsoDate(publishedAt);
}

function escXml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function sitemapXml(entries: SitemapEntry[]): string {
  const rows = entries.map((entry) => {
    const loc = escXml(entry.loc);
    const lastmod = toIsoDate(entry.lastmod);
    return `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>`;
}
