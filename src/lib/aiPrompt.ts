// Pure prompt + schema builders for the AI writer. No environment access, fully testable.
// Design goals: (1) grounded on real facts the editor supplies, (2) no fabricated stats/claims,
// (3) output shaped so each page is materially different, (4) free-tier Gemini structured JSON.

export const WRITING_RULES = [
  "Write for this specific game/article only; never reuse generic filler that could fit any other page.",
  "Use ONLY the facts provided below. Never invent ratings, review scores, player counts, download numbers, awards, release dates, prices, or claims of being the best/#1.",
  "If a fact is missing, omit the claim entirely instead of guessing.",
  "Do not keyword-stuff. Use the focus keyword naturally 2-4 times at most, plus related keywords where they fit.",
  "Vary sentence length and structure; avoid repetitive openings like 'Get ready to' or 'In this game' more than once.",
  "Every section must contain at least one concrete, page-specific detail from the FACTS block.",
  "Plain, helpful, human tone. No hype, no promises, no invented technical specs.",
].join(" ");

export interface GameCopyInput {
  title: string;
  category: string;
  providerHost: string;
  focusKeyword: string;
  relatedKeywords: string[];
  uniqueNotes: string;
  language: string;
  sections: string[];
  searchIntent?: string;
  gameplay?: string;
  controls?: string;
  instructions?: string;
}

export interface PostInput {
  targetKeyword: string;
  language: string;
  intent: string;
  relatedTool: string;
  workingTitle: string;
  uniqueNotes: string;
  sections: string[];
}

function bullets(items: string[]): string {
  return items.filter(Boolean).map((s) => `- ${s}`).join("\n");
}

function factsBlock(rows: [string, string][]): string {
  return rows.filter(([, v]) => String(v || "").trim()).map(([k, v]) => `${k}: ${v}`).join("\n");
}

export function buildGameCopyPrompt(input: GameCopyInput): string {
  const facts = factsBlock([
    ["Game title", input.title],
    ["Category", input.category],
    ["Game host (provider)", input.providerHost],
    ["Primary focus keyword", input.focusKeyword],
    ["Search intent", input.searchIntent || "play/transactional (someone wants to play this game)"],
    ["Related keywords", input.relatedKeywords.join(", ")],
    ["Known gameplay details", input.gameplay || ""],
    ["Known controls", input.controls || ""],
    ["Instructions to highlight", input.instructions || ""],
    ["Editor's first-hand notes (use these details)", input.uniqueNotes],
  ]);
  const sections = input.sections.length ? bullets(input.sections) : bullets(["Overview", "How to play", "Tips", "FAQ"]);
  return [
    `You are an editor writing original, accurate copy for a single free browser game page on a gaming portal. Target language: ${input.language || "English"}.`,
    WRITING_RULES,
    "",
    "FACTS (the only allowed source of specifics):",
    facts,
    "",
    "Required long_description structure (HTML, use h2/h3/p/ul/ol/li/strong/em only):",
    sections,
    "",
    "Return JSON only, matching the schema. HTML fields must contain real content built from FACTS.",
  ].join("\n");
}

export function buildPostPrompt(input: PostInput): string {
  const facts = factsBlock([
    ["Working title", input.workingTitle],
    ["Primary target keyword (long-tail)", input.targetKeyword],
    ["Search intent", input.intent],
    ["Related game/tool on site", input.relatedTool],
    ["Editor's first-hand notes (use these details)", input.uniqueNotes],
  ]);
  const sections = input.sections.length ? bullets(input.sections) : bullets(["Quick answer", "Step-by-step", "Common mistakes", "FAQ"]);
  return [
    `You are an editorial writer producing one original, genuinely useful guide for a free-games portal. Target language: ${input.language || "English"}.`,
    WRITING_RULES,
    "Answer the searcher's intent directly and early; make the piece specific to this exact topic, not a generic template.",
    "",
    "FACTS (the only allowed source of specifics):",
    facts,
    "",
    "Required sections (heading + body; keep this order):",
    sections,
    "",
    "Return JSON only, matching the schema. Each body is HTML (h3/p/ul/li/strong/em) with page-specific detail; keep it readable, roughly 120-260 words per section.",
  ].join("\n");
}

import { landingToolLabel } from "./landingTools";

export interface LandingInput {
  targetKeyword: string;
  gameTitle: string;
  category: string;
  language: string;
  intent: string;
  sections: string[];
  uniqueNotes: string;
  gameplay?: string;
  controls?: string;
  instructions?: string;
  toolType?: string;
}

export function buildLandingPrompt(input: LandingInput): string {
  const facts = factsBlock([
    ["Target keyword (the page must satisfy this exact search intent)", input.targetKeyword],
    ["Game title", input.gameTitle],
    ["Category", input.category],
    ["Tool type", landingToolLabel(input.toolType)],
    ["Search intent", input.intent || "play/transactional"],
    ["Known gameplay details", input.gameplay || ""],
    ["Known controls", input.controls || ""],
    ["Instructions to highlight", input.instructions || ""],
    ["Editor's first-hand notes (use these details)", input.uniqueNotes],
  ]);
  const sections = input.sections.length ? bullets(input.sections) : bullets(["Quick answer", "How to play", "Controls", "Tips", "FAQ"]);
  return [
    `You are writing one focused landing page for a single free browser game. The page targets the search query "${input.targetKeyword}" and must lead the reader to play ${input.gameTitle}. Target language: ${input.language || "English"}.`,
    WRITING_RULES,
    "Answer the target keyword directly in the intro; do not duplicate the main game page copy or pad it with generic portal filler.",
    "Write a one-sentence subtitle that sits under the H1 and adds a concrete reason to play, without repeating the H1.",
    "The FAQ must contain 3-5 real questions a player would ask about this specific keyword, each answered in 1-3 sentences.",
    "",
    "FACTS (the only allowed source of specifics):",
    facts,
    "",
    "Required sections (heading + body; keep this order):",
    sections,
    "",
    "Return JSON only, matching the schema. HTML fields must contain real content built from FACTS.",
  ].join("\n");
}

export function buildSectionPrompt(input: { articleTitle: string; heading: string; targetKeyword: string; language: string; uniqueNotes: string; avoid?: string; context?: string }): string {
  return [
    `Rewrite ONE section for an existing article. Target language: ${input.language || "English"}.`,
    WRITING_RULES,
    `Article: ${input.articleTitle}`,
    `Target keyword: ${input.targetKeyword}`,
    `Section heading: ${input.heading}`,
    input.context ? `Existing context (do not repeat it): ${input.context}` : "",
    input.avoid ? `Previous version to replace (must read clearly differently): ${input.avoid}` : "",
    `Editor's notes: ${input.uniqueNotes}`,
    "",
    "Return JSON only: { heading, body (HTML) }.",
  ].filter(Boolean).join("\n");
}

export function buildKeywordsPrompt(seed: string, language: string, existing: string[], limit = 15): string {
  return [
    `Suggest up to ${limit} realistic LONG-TAIL search keywords a player would type for: "${seed}". Language: ${language || "English"}.`,
    "Prioritise specific, lower-competition phrases (3-6 words) with clear intent. Do not invent search-volume numbers.",
    "Give a short note for each explaining WHO is searching and WHAT they want. Never invent or estimate search volume, keyword difficulty, CPC, backlinks, or ranking data.",
    existing.length ? `Already targeted by existing pages (do NOT repeat): ${existing.join("; ")}` : "",
    "Return JSON only: { keywords: [{ keyword, intent, note }] } where intent is one of: informational, navigational, play/transactional.",
  ].filter(Boolean).join("\n");
}

export interface OutlineInput {
  targetKeyword: string;
  language: string;
  intent: string;
  relatedTool: string;
  workingTitle: string;
  uniqueNotes: string;
}

export function buildOutlinePrompt(input: OutlineInput): string {
  return [
    `Plan the OUTLINE (headings only) for one original guide targeting: "${input.targetKeyword}". Target language: ${input.language || "English"}.`,
    `Search intent: ${input.intent || "informational"}.`,
    WRITING_RULES,
    "Produce 3-7 top-level (h2) sections in a logical order that fully answers the search intent; add an h3 sub-heading only where it helps. Keep headings specific to this exact topic, not generic template labels.",
    input.relatedTool ? `The article may link to the related page: ${input.relatedTool}` : "",
    input.uniqueNotes ? `Editor's notes (only allowed source of specifics): ${input.uniqueNotes}` : "",
    "Do NOT write body content and do NOT invent facts, stats, or sources. Return JSON only: { outline: [{ heading, level }] } where level is h2 or h3.",
  ].filter(Boolean).join("\n");
}

export function buildIntentPrompt(targetKeyword: string, language: string): string {
  return [
    `Classify the likely search intent for the query: "${targetKeyword}". Language: ${language || "English"}.`,
    "Choose exactly one of: informational, navigational, play/transactional. 'play/transactional' is for someone who wants to play a specific game or use a tool now; 'informational' for learning/how-to; 'navigational' for finding a specific site/brand.",
    "Base the decision on the query wording only. Never invent search volume, difficulty, or ranking data.",
    "Return JSON only: { intent, reason } where reason is one short sentence.",
  ].join("\n");
}

type Schema = Record<string, unknown>;

export const GAME_SCHEMA: Schema = {
  type: "object",
  properties: {
    short_description: { type: "string", description: "150-320 chars, plain text, no HTML" },
    long_description: { type: "string", description: "HTML using h2/h3/p/ul/ol/li/strong/em only" },
    how_to_play: { type: "string", description: "1-3 sentences, plain text" },
    controls: { type: "string", description: "Controls as plain text lines" },
    tips: { type: "string", description: "3-5 practical tips, plain text lines starting with '- '" },
    faqs: { type: "string", description: "HTML: repeated <h3>Question</h3><p>Answer</p>" },
    seo_title: { type: "string", description: "<= 60 chars" },
    meta_description: { type: "string", description: "<= 155 chars" },
    focus_keyword: { type: "string" },
    related_keywords: { type: "string", description: "comma-separated" },
  },
  required: ["short_description", "long_description", "how_to_play", "controls", "tips", "faqs", "seo_title", "meta_description", "focus_keyword", "related_keywords"],
};

export const POST_SCHEMA: Schema = {
  type: "object",
  properties: {
    title: { type: "string", description: "<= 70 chars" },
    h1: { type: "string", description: "<= 70 chars" },
    meta_description: { type: "string", description: "<= 155 chars" },
    excerpt: { type: "string", description: "<= 200 chars" },
    slug_suggestion: { type: "string", description: "lowercase, hyphenated, 2-120 chars" },
    focus_keyword: { type: "string" },
    related_keywords: { type: "string", description: "comma-separated" },
    tags: { type: "string", description: "comma-separated" },
    sections: {
      type: "array",
      items: { type: "object", properties: { heading: { type: "string" }, body: { type: "string", description: "HTML: h3/p/ul/ol/li/strong/em" } }, required: ["heading", "body"] },
    },
  },
  required: ["title", "h1", "meta_description", "excerpt", "slug_suggestion", "focus_keyword", "related_keywords", "tags", "sections"],
};

export const LANDING_SCHEMA: Schema = {
  type: "object",
  properties: {
    badge: { type: "string", description: "Short label, <= 24 chars (e.g. Unblocked, No Download)" },
    seo_title: { type: "string", description: "<= 60 chars, includes the target keyword" },
    h1: { type: "string", description: "<= 70 chars, distinct from the SEO title" },
    subtitle: { type: "string", description: "One sentence, <= 160 chars, quick concrete reason to play" },
    meta_description: { type: "string", description: "<= 155 chars" },
    intro: { type: "string", description: "HTML: 1-2 short paragraphs (p/strong/em)" },
    sections: {
      type: "array",
      items: { type: "object", properties: { heading: { type: "string" }, body: { type: "string", description: "HTML: h3/p/ul/ol/li/strong/em" } }, required: ["heading", "body"] },
    },
    faqs: { type: "string", description: "HTML: repeated <h3>Question</h3><p>Answer</p>" },
    focus_keyword: { type: "string", description: "The target keyword exactly" },
    related_keywords: { type: "string", description: "comma-separated" },
    slug_suggestion: { type: "string", description: "lowercase, hyphenated, 2-120 chars, includes the keyword" },
  },
  required: ["badge", "seo_title", "h1", "subtitle", "meta_description", "intro", "sections", "faqs", "focus_keyword", "related_keywords", "slug_suggestion"],
};

export const SECTION_SCHEMA: Schema = {
  type: "object",
  properties: { heading: { type: "string" }, body: { type: "string" } },
  required: ["heading", "body"],
};

export const KEYWORDS_SCHEMA: Schema = {
  type: "object",
  properties: {
    keywords: {
      type: "array",
      items: {
        type: "object",
        properties: {
          keyword: { type: "string" },
          intent: { type: "string", enum: ["informational", "navigational", "play/transactional"] },
          note: { type: "string" },
        },
        required: ["keyword", "intent", "note"],
      },
    },
  },
  required: ["keywords"],
};

export const OUTLINE_SCHEMA: Schema = {
  type: "object",
  properties: {
    outline: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string", description: "Specific section heading" },
          level: { type: "string", enum: ["h2", "h3"] },
        },
        required: ["heading", "level"],
      },
    },
  },
  required: ["outline"],
};

export const INTENT_SCHEMA: Schema = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["informational", "navigational", "play/transactional"] },
    reason: { type: "string" },
  },
  required: ["intent", "reason"],
};

// Tolerant JSON extraction: models sometimes wrap JSON in prose or ```json fences.
export function extractJson<T>(text: string): T | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : raw;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.search(/[[{]/);
    const lastObj = candidate.lastIndexOf("}");
    const lastArr = candidate.lastIndexOf("]");
    const end = Math.max(lastObj, lastArr);
    if (start >= 0 && end > start) {
      try { return JSON.parse(candidate.slice(start, end + 1)) as T; } catch { return null; }
    }
    return null;
  }
}

export interface PostSections { heading: string; body: string }
// No wrapper element: the saved HTML stays within the sanitizer allowlist (h2/h3/p/lists...),
// so parseSectionsHtml can round-trip it unchanged.
export function sectionsToHtml(sections: PostSections[]): string {
  return sections.map((s) => `<h2>${String(s.heading || "").trim()}</h2>${String(s.body || "").trim()}`).join("");
}
