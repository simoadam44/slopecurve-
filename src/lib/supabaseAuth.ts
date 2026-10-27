import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload, type KeyInput } from "jose";

/**
 * Worker-side Supabase Auth verification.
 *
 * Replaces the previous Cloudflare Access integration. The browser signs in with
 * `supabase.auth.signInWithPassword` and sends `Authorization: Bearer <access_token>`
 * with every admin request; this module decides whether that token is a valid
 * Supabase session that belongs to an administrator.
 *
 * Two verification modes are supported:
 *  1. Local signature check (preferred, no network round-trip): HS256 with
 *     `SUPABASE_JWT_SECRET`, or the project's asymmetric keys via JWKS
 *     (`/auth/v1/.well-known/jwks.json`) for RS256/ES256.
 *  2. Remote check against `GET /auth/v1/user` with the anon (or service) key.
 *     Only used when no JWT secret is configured.
 *
 * Being *signed in* is not enough: the identity must also be an administrator.
 * Authorization is taken from data a signed-in user cannot edit themselves:
 * the optional `SUPABASE_ADMIN_EMAILS` allowlist, `app_metadata` (writable only
 * with the service-role key), or the server-side `profiles.role` column. The
 * top-level `role` claim is the Postgres role ("authenticated") and is never
 * treated as an admin flag. `user_metadata` is user-writable in Supabase, so it
 * is only honoured when `SUPABASE_TRUST_USER_METADATA=true` is set explicitly.
 */

export interface SupabaseEnv {
  SUPABASE_URL?: string;
  SUPABASE_JWT_SECRET?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ADMIN_EMAILS?: string;
  SUPABASE_TRUST_USER_METADATA?: string;
}

export interface SupabaseAuthConfig {
  /** Normalised project origin, e.g. https://abcdefgh.supabase.co */
  url: string;
  /** Expected `iss` claim: <url>/auth/v1 */
  issuer: string;
  jwtSecret: string | null;
  anonKey: string | null;
  serviceRoleKey: string | null;
  adminEmails: string[];
  trustUserMetadata: boolean;
}

export interface SupabaseIdentity {
  sub: string;
  email: string;
  appMetadata: Record<string, unknown>;
  userMetadata: Record<string, unknown>;
}

export function parseEmailList(raw: string | undefined): string[] {
  return String(raw || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Accepts https origins, plus http on localhost so `supabase start` works locally. */
export function normalizeSupabaseUrl(raw: string | undefined): string {
  const value = String(raw || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  if (/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value)) return value;
  if (/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(value)) return value;
  return "";
}

export function supabaseAuthConfig(env: SupabaseEnv): SupabaseAuthConfig | null {
  const url = normalizeSupabaseUrl(env.SUPABASE_URL);
  if (!url) return null;
  const jwtSecret = String(env.SUPABASE_JWT_SECRET || "").trim() || null;
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim() || null;
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim() || null;
  // Without a JWT secret or a public key there is nothing to verify a token with.
  if (!jwtSecret && !anonKey && !serviceRoleKey) return null;
  return {
    url,
    issuer: `${url}/auth/v1`,
    jwtSecret,
    anonKey,
    serviceRoleKey,
    adminEmails: parseEmailList(env.SUPABASE_ADMIN_EMAILS),
    trustUserMetadata: String(env.SUPABASE_TRUST_USER_METADATA || "").toLowerCase() === "true",
  };
}

// One remote JWKS client per project origin (jose caches the fetched keys itself).
const jwksByOrigin = new Map<string, JWTVerifyGetKey>();

function remoteJwks(url: string): JWTVerifyGetKey {
  let set = jwksByOrigin.get(url);
  if (!set) {
    set = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`), { timeoutDuration: 5000 });
    jwksByOrigin.set(url, set);
  }
  return set;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
}

/**
 * Reads `alg` from a JWT header without trusting anything else. Used to decide whether a
 * token could ever be verified locally, so an unverifiable token is not forwarded to
 * Supabase on every request. Returns "" for anything that is not a readable JWS.
 */
export function tokenAlgorithm(token: string): string {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return "";
  try {
    const header = JSON.parse(decodeBase64Url(parts[0])) as { alg?: unknown };
    return typeof header?.alg === "string" ? header.alg : "";
  } catch {
    return "";
  }
}

function supportedAlgorithms(config: SupabaseAuthConfig): string[] {
  return [...(config.jwtSecret ? ["HS256"] : []), "RS256", "ES256"];
}

/**
 * Verifies signature, issuer, audience and expiry of a Supabase access token and
 * returns the identity it proves. Returns null for anything invalid.
 */
export async function verifySupabaseToken(
  token: string,
  config: SupabaseAuthConfig,
  key?: KeyInput | JWTVerifyGetKey,
): Promise<SupabaseIdentity | null> {
  const raw = String(token || "").trim();
  if (!raw || !config) return null;
  const resolver: KeyInput | JWTVerifyGetKey =
    key ??
    ((header, jws) => {
      if (header.alg === "HS256") {
        if (!config.jwtSecret) throw new Error("no_hs256_secret");
        return Promise.resolve(new TextEncoder().encode(config.jwtSecret));
      }
      return remoteJwks(config.url)(header, jws);
    });
  try {
    const { payload } = await jwtVerify(raw, resolver, {
      issuer: config.issuer,
      audience: "authenticated",
      algorithms: supportedAlgorithms(config),
      clockTolerance: 5,
    });
    return identityFromPayload(payload);
  } catch {
    return null;
  }
}

function identityFromPayload(payload: JWTPayload): SupabaseIdentity | null {
  const sub = String(payload.sub || "").trim();
  if (!sub) return null;
  return {
    sub,
    email: String(payload.email || "").trim().toLowerCase(),
    appMetadata: asRecord(payload.app_metadata),
    userMetadata: asRecord(payload.user_metadata),
  };
}

/**
 * Fallback verification without the JWT secret: ask Supabase who the token belongs to.
 * One round-trip per admin request; only used when `SUPABASE_JWT_SECRET` is unset.
 */
export async function fetchSupabaseUser(
  token: string,
  config: SupabaseAuthConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<SupabaseIdentity | null> {
  const apiKey = config.anonKey || config.serviceRoleKey;
  if (!apiKey || !token) return null;
  try {
    const res = await fetchImpl(`${config.url}/auth/v1/user`, {
      headers: { apikey: apiKey, authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const user = (await res.json()) as Record<string, unknown>;
    const sub = String(user.id || "").trim();
    if (!sub) return null;
    return {
      sub,
      email: String(user.email || "").trim().toLowerCase(),
      appMetadata: asRecord(user.app_metadata),
      userMetadata: asRecord(user.user_metadata),
    };
  } catch {
    return null;
  }
}

function hasAdminFlag(meta: Record<string, unknown>): boolean {
  const role = String(meta.role || "").trim().toLowerCase();
  return role === "admin" || meta.is_admin === true || meta.admin === true;
}

/** True when the identity carries a trusted admin marker in the token itself. */
export function isAdminIdentity(identity: SupabaseIdentity, config: SupabaseAuthConfig): boolean {
  if (identity.email && config.adminEmails.includes(identity.email)) return true;
  if (hasAdminFlag(identity.appMetadata)) return true;
  if (config.trustUserMetadata && hasAdminFlag(identity.userMetadata)) return true;
  return false;
}

/**
 * Authoritative role lookup in a public `profiles` table (id = auth.users.id).
 * Needs the service-role key; failures are treated as "not an admin".
 */
export async function profileRoleIsAdmin(
  config: SupabaseAuthConfig,
  sub: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!config.serviceRoleKey || !sub) return false;
  try {
    const res = await fetchImpl(
      `${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(sub)}&select=role&limit=1`,
      {
        headers: {
          apikey: config.serviceRoleKey,
          authorization: `Bearer ${config.serviceRoleKey}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows)) return false;
    return rows.some((row) => String((row as { role?: unknown })?.role || "").trim().toLowerCase() === "admin");
  } catch {
    return false;
  }
}
