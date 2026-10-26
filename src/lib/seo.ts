import type { Game } from "./types";
import { videoGameJsonLd } from "./schema";
export { sanitizeRichText } from "./sanitize";
export { breadcrumbJsonLd } from "./schema";

export const SITE_URL = (import.meta.env?.VITE_SITE_URL as string | undefined) ?? "https://slopecurve.com";

export function canonicalForGame(game: Game, siteUrl = SITE_URL): string {
  if (game.canonical_url) return game.canonical_url;
  return `${siteUrl.replace(/\/$/, "")}/games/${game.slug}`;
}

/** Canonical URL of the homepage game: the site root itself. */
export function homeCanonical(siteUrl = SITE_URL): string {
  return `${siteUrl.replace(/\/$/, "")}/`;
}

export function buildGameMeta(game: Game, siteUrl = SITE_URL) {
  const title = game.seo_title || `${game.title} — Play Free Online | SlopeCurve`;
  const description =
    game.meta_description || game.short_description.slice(0, 155) || `Play ${game.title} free online on SlopeCurve. No downloads.`;
  return { title, description, canonical: canonicalForGame(game, siteUrl) };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function gameJsonLd(game: Game, siteUrl = SITE_URL) {
  return videoGameJsonLd({
    name: game.title,
    url: canonicalForGame(game, siteUrl),
    description: game.short_description,
    image: game.thumbnail_url,
  });
}
