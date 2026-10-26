// Pure, environment-free content-quality helpers shared by the Worker and the admin UI.
// Goal: mechanically detect thin and near-duplicate content before it can be published,
// so AI-assisted pages cannot become low-value/scaled content.

export interface ContentCandidate {
  id: string;
  label: string;
  text: string;
}

export interface QualityConfig {
  minWords: number;
  maxSimilarity: number;
  n?: number;
}

export interface QualityReport {
  ok: boolean;
  wordCount: number;
  maxSimilarity: number;
  closest: { id: string; label: string; score: number } | null;
  errors: string[];
}

const ENTITY_RE = /&(?:nbsp|amp|lt|gt|quot|#39|mdash|ndash|hellip|rsquo|lsquo|ldquo|rdquo);/gi;

export function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(ENTITY_RE, " ");
}

export function normalizeWords(text: string): string[] {
  return stripHtml(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s'-]+/gi, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter((w) => w.length > 1);
}

export function wordCount(text: string): number {
  return normalizeWords(text).length;
}

export interface ParsedSection { heading: string; body: string; }
// Split stored article HTML back into editable sections. Guards the editor from wiping content on load.
export function parseSectionsHtml(html: string): ParsedSection[] {
  const out: ParsedSection[] = [];
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push({ heading: m[1].replace(/<[^>]*>/g, "").trim(), body: m[2].trim() });
  if (!out.length && html.trim()) out.push({ heading: "", body: html.trim() });
  return out;
}

export function shingles(words: string[], n = 5): Set<string> {
  const out = new Set<string>();
  if (words.length < n) {
    if (words.length) out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function similarity(textA: string, textB: string, n = 5): number {
  return jaccard(shingles(normalizeWords(textA), n), shingles(normalizeWords(textB), n));
}

export function closestMatch(text: string, candidates: ContentCandidate[], n = 5): { id: string; label: string; score: number } | null {
  const a = shingles(normalizeWords(text), n);
  let best: { id: string; label: string; score: number } | null = null;
  for (const c of candidates) {
    const score = jaccard(a, shingles(normalizeWords(c.text), n));
    if (!best || score > best.score) best = { id: c.id, label: c.label, score };
  }
  return best;
}

/**
 * Merge candidate sets from several content types (games, guides, landing pages) for a
 * site-wide similarity check. The page being edited is excluded by id.
 */
export function mergeCandidates(sets: ContentCandidate[][], excludeId = ""): ContentCandidate[] {
  const seen = new Set<string>();
  const out: ContentCandidate[] = [];
  for (const set of sets) {
    for (const candidate of set) {
      if (!candidate.id || candidate.id === excludeId || seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      out.push(candidate);
    }
  }
  return out;
}

export function checkQuality(text: string, candidates: ContentCandidate[], cfg: QualityConfig): QualityReport {
  const n = cfg.n ?? 5;
  const words = wordCount(text);
  const close = closestMatch(text, candidates, n);
  const maxSimilarity = close?.score ?? 0;
  const errors: string[] = [];
  if (words < cfg.minWords) errors.push(`Too thin: ${words} words (minimum ${cfg.minWords}). Add original, specific detail.`);
  if (close && maxSimilarity > cfg.maxSimilarity) {
    errors.push(`Too similar to "${close.label}" (${(maxSimilarity * 100).toFixed(0)}% match; maximum ${(cfg.maxSimilarity * 100).toFixed(0)}%). Rewrite with a distinct angle.`);
  }
  return { ok: errors.length === 0, wordCount: words, maxSimilarity, closest: close, errors };
}

export function normalizeKeyword(k: string): string {
  return String(k || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\s-]+/gi, " ").replace(/\s+/g, " ").trim();
}

// Keyword cannibalization: another published page already targets this exact keyword.
export function keywordCollisions(keyword: string, existing: { id: string; label: string; keyword: string }[]): { id: string; label: string }[] {
  const k = normalizeKeyword(keyword);
  if (!k) return [];
  return existing
    .filter((e) => e.id && normalizeKeyword(e.keyword) === k)
    .map((e) => ({ id: e.id, label: e.label }));
}
