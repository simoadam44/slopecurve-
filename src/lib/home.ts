// Homepage game: the game shown when visitors open "/". Editable in Admin → General.
export const DEFAULT_HOME_GAME = "slope-rider-2";

/** Resolve the configured homepage slug. Undefined = never configured (use default); "" = disabled. */
export function homeGameSlug(settings: Record<string, string | undefined>): string {
  const raw = settings.home_game_slug;
  if (raw === undefined) return DEFAULT_HOME_GAME;
  return raw.trim();
}
