import { games, categories, posts } from "../data/seed";
import type { Game, LandingWithGame } from "./types";

async function tryApi<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(path, { headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Seed data is a preview-only fallback. In a production build the API is the
 * single source of truth, so unpublishing/deleting content cannot be undone by
 * stale demo rows bundled into the client.
 */
export function seedFallbackEnabled(dev: boolean | undefined = Boolean(import.meta.env?.DEV)): boolean {
  return Boolean(dev);
}

export async function fetchGames(allowSeed = seedFallbackEnabled()): Promise<Game[]> {
  const api = await tryApi<Game[]>("/api/games");
  if (api && api.length) return api;
  return allowSeed ? games.filter((g) => g.status === "published") : [];
}

export async function fetchGame(slug: string, allowSeed = seedFallbackEnabled()): Promise<Game | null> {
  const api = await tryApi<Game>(`/api/games/${encodeURIComponent(slug)}`);
  if (api) return api;
  return allowSeed ? games.find((g) => g.slug === slug && g.status === "published") ?? null : null;
}

export async function fetchCategories(allowSeed = seedFallbackEnabled()) {
  const api = await tryApi<typeof categories>("/api/categories");
  if (api && api.length) return api;
  return allowSeed ? categories : [];
}

export async function fetchPosts(allowSeed = seedFallbackEnabled()) {
  const api = await tryApi<typeof posts>("/api/posts");
  if (api && api.length) return api;
  return allowSeed ? posts.filter((p) => p.status === "published") : [];
}

export async function fetchLanding(slug: string): Promise<LandingWithGame | null> {
  return tryApi<LandingWithGame>(`/api/landing/${encodeURIComponent(slug)}`);
}

export function searchGames(q: string, list: Game[]): Game[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return list
    .filter((g) => g.status === "published")
    .filter((g) =>
      [g.title, g.short_description, g.category_name ?? "", g.category_slug]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    )
    .slice(0, 24);
}
