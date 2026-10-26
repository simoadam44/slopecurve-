import { isReservedLandingSlug } from "./landingSlugs";

// Single source of truth for the built-in game-host allowlist (env overrides it).
// `github.io` matches any subdomain via suffix matching in isHostAllowed().
export const DEFAULT_GAME_HOSTS = "game-host.example.com,trusted-games.example.com,azgames.io,github.io";

const DEFAULT_HOSTS = (import.meta.env?.VITE_TRUSTED_GAME_HOSTS as string | undefined) ?? DEFAULT_GAME_HOSTS;

export function parseHosts(raw: string): string[] {
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function getTrustedHosts(): string[] {
  return parseHosts(DEFAULT_HOSTS);
}

/**
 * A host is allowed if it exactly matches an entry, or is a subdomain of one
 * (boundary-anchored on "." so `evilgithub.io` never matches `github.io`).
 */
export function isHostAllowed(host: string, hosts: string[]): boolean {
  const h = host.trim().toLowerCase();
  return hosts.some((entry) => {
    const e = entry.trim().toLowerCase();
    return e.length > 0 && (h === e || h.endsWith("." + e));
  });
}

const BLOCKED_SCHEMES = ["javascript:", "data:", "file:", "vbscript:"];
const LOOPBACK = ["localhost", "127.0.0.1", "::1", "0.0.0.0"];
const PRIVATE_RE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?fc00:|\[?fe80:)/i;

export function validateGameUrl(url: string, hosts?: string[], selfHost?: string): { ok: boolean; error?: string; host?: string } {
  if (!url || url.length > 2048) return { ok: false, error: "URL is required (max 2048 chars)." };
  const lower = url.trim().toLowerCase();
  for (const s of BLOCKED_SCHEMES) if (lower.startsWith(s)) return { ok: false, error: `Blocked scheme: ${s}` };
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return { ok: false, error: "Malformed URL." };
  }
  if (u.protocol !== "https:") {
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
      return { ok: false, error: "Localhost not allowed." };
    }
    if (u.protocol !== "https:") return { ok: false, error: "HTTPS required in production." };
  }
  const host = u.hostname.toLowerCase();
  if (LOOPBACK.includes(host)) return { ok: false, error: "Loopback host blocked." };
  if (PRIVATE_RE.test(host) || PRIVATE_RE.test(u.hostname)) return { ok: false, error: "Private network blocked." };
  const allowed = (hosts ?? getTrustedHosts()).map((h) => h.toLowerCase());
  if (!isHostAllowed(host, allowed)) return { ok: false, error: `Host not allowlisted: ${host}` };
  // The player adds sandbox="allow-same-origin" so games get real storage/CORS.
  // Same-origin frames could then reach this document, so never embed our own site.
  const self = String(selfHost || "").trim().toLowerCase();
  if (self && (host === self || host.endsWith("." + self))) return { ok: false, error: "Same-site games cannot be embedded." };
  return { ok: true, host };
}

const IMG_EXT = [".jpg", ".jpeg", ".png", ".webp"];

export function validateImageUrl(url: string): { ok: boolean; error?: string } {
  if (!url || url.length > 2048) return { ok: false, error: "Image URL required." };
  const lower = url.trim().toLowerCase();
  for (const s of BLOCKED_SCHEMES) if (lower.startsWith(s)) return { ok: false, error: "Blocked scheme." };
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return { ok: false, error: "Malformed image URL." };
  }
  if (u.protocol !== "https:") return { ok: false, error: "Image must use HTTPS." };
  if (u.username || u.password) return { ok: false, error: "Image URL cannot contain credentials." };
  const path = u.pathname.toLowerCase();
  const q = (u.search + u.hash).toLowerCase();
  const hay = path + q;
  const hasExt = IMG_EXT.some((e) => path.endsWith(e) || hay.includes(`${e}?`) || hay.includes(`${e}&`));
  if (!hasExt) return { ok: false, error: "Image must end in .jpg/.jpeg/.png/.webp (query allowed)." };
  return { ok: true };
}

export function validateSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 2 && slug.length <= 120;
}

/** Derive a URL-safe slug from arbitrary text (title). Returns "" if nothing usable remains. */
export function slugify(input: string): string {
  return String(input ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['"’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 120)
    .replace(/-+$/, "");
}

/** Landing pages live at the root: same slug rules plus the reserved app routes. */
export function validateLandingSlug(slug: string): boolean {
  return validateSlug(slug) && !isReservedLandingSlug(slug);
}

export function validateComment(displayName: string, body: string): { ok: boolean; error?: string } {
  const n = displayName.trim();
  const b = body.trim();
  if (n.length < 2 || n.length > 40) return { ok: false, error: "Name must be 2–40 chars." };
  if (b.length < 3 || b.length > 1000) return { ok: false, error: "Comment must be 3–1000 chars." };
  if (/<script|javascript:|on\w+=/i.test(b + n)) return { ok: false, error: "HTML/scripts not allowed." };
  return { ok: true };
}

/** Comment rows must reference a real game id (uuid or seed-style id), not arbitrary text. */
export function validateCommentGameId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(String(id || "").trim());
}
