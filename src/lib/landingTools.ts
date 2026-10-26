export const LANDING_TOOLS = ["game", "video", "arcade", "puzzle", "other"] as const;
export type LandingTool = (typeof LANDING_TOOLS)[number];

export const LANDING_TOOL_LABELS: Record<LandingTool, string> = {
  game: "Game",
  video: "Video",
  arcade: "Arcade",
  puzzle: "Puzzle",
  other: "Other",
};

/**
 * English is the only supported public site language (Phase 1 SEO policy).
 * Legacy rows may still store another value; those are preserved but never advertised
 * as localized routes until a separately approved multilingual task exists.
 */
export const SITE_LANGUAGES = ["English"] as const;
export const DEFAULT_SITE_LANGUAGE = "English";

/** New content and AI prompts always resolve to English. */
export function supportedSiteLanguage(value: unknown): string {
  const v = String(value ?? "").trim();
  return (SITE_LANGUAGES as readonly string[]).includes(v) ? v : DEFAULT_SITE_LANGUAGE;
}

/** True when a stored record carries a legacy non-English value (report, do not delete). */
export function isLegacyLanguage(value: unknown): boolean {
  const v = String(value ?? "").trim();
  return Boolean(v) && !(SITE_LANGUAGES as readonly string[]).includes(v);
}

export const LANDING_LANGUAGES: string[] = [...SITE_LANGUAGES];

export const LANDING_SUBTITLE_MAX = 160;

export function normalizeLandingTool(value: unknown): LandingTool {
  const v = String(value ?? "").trim().toLowerCase();
  return (LANDING_TOOLS as readonly string[]).includes(v) ? (v as LandingTool) : "game";
}

export function landingToolLabel(value: unknown): string {
  return LANDING_TOOL_LABELS[normalizeLandingTool(value)];
}

export function cleanLandingSubtitle(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LANDING_SUBTITLE_MAX);
}
