import { DEFAULT_GAME_HOSTS, parseHosts } from "./validate";

export function getTrustedHostsClient(): string[] {
  const raw = (import.meta.env?.VITE_TRUSTED_GAME_HOSTS as string | undefined) ?? DEFAULT_GAME_HOSTS;
  return parseHosts(raw);
}
