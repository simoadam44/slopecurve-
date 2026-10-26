// Deterministic internal-link suggestions. These use ONLY real, already-published pages on
// this site (never model output), so a generated draft can link to related content without
// inventing URLs or claims. Pure + testable.

export interface InternalTarget {
  kind: "game" | "post" | "landing";
  slug: string;
  title: string;
  keyword?: string | null;
}

const STOP = new Set(["the", "and", "for", "with", "how", "you", "your", "to", "of", "in", "on", "a", "an", "is", "it", "this", "that", "game", "games"]);

function tokens(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

function escapeHtml(s: string): string {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function internalPath(t: InternalTarget): string {
  const safeSlug = String(t.slug || "").trim();
  if (t.kind === "landing") return `/${safeSlug}`;
  return `/${t.kind === "game" ? "games" : "blog"}/${safeSlug}`;
}

// Rank published targets by word overlap with the (real) seed text. Only positive matches are
// returned; ties break on title for stability. Deterministic for identical inputs.
export function rankInternalLinks(seedText: string, targets: InternalTarget[], limit = 3, excludeSlug?: string): InternalTarget[] {
  const seed = new Set(tokens(seedText));
  if (!seed.size) return [];
  const scored = targets
    .filter((t) => String(t.slug || "").trim() && t.slug !== excludeSlug)
    .map((t) => {
      const words = new Set([...tokens(t.title), ...tokens(t.keyword || "")]);
      let score = 0;
      for (const w of words) if (seed.has(w)) score++;
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.t.title.localeCompare(b.t.title));
  const seen = new Set<string>();
  const out: InternalTarget[] = [];
  for (const { t } of scored) {
    const key = internalPath(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

// Renders a "Related" block of real internal links as allowlisted HTML (h2/ul/li/a).
export function relatedLinksHtml(links: InternalTarget[]): string {
  const valid = links.filter((l) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(l.slug || "")));
  if (!valid.length) return "";
  const items = valid.map((l) => `<li><a href="${escapeHtml(internalPath(l))}">${escapeHtml(l.title)}</a></li>`).join("");
  return `<h2>Related</h2><ul>${items}</ul>`;
}
