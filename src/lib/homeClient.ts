import { useEffect, useState } from "react";
import { DEFAULT_HOME_GAME, homeGameSlug } from "./home";

let cached: Promise<string | null> | null = null;

/** Resolve the configured homepage game once per page load (empty/blank = disabled). */
export function getHomeGameSlug(): Promise<string | null> {
  if (!cached) {
    cached = fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : {}))
      .then((s) => homeGameSlug(s).trim() || null)
      .catch(() => DEFAULT_HOME_GAME);
  }
  return cached;
}

/** `undefined` while loading, `null` when the homepage game is disabled. */
export function useHomeGameSlug(): string | null | undefined {
  const [slug, setSlug] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    getHomeGameSlug().then((s) => {
      if (alive) setSlug(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return slug;
}
