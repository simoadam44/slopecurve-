import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type KeyInput } from "jose";

export interface AccessConfig {
  teamDomain: string;
  audience: string;
  emails: string[];
}

export interface AccessPrincipal {
  sub: string;
  email: string;
}

export interface AccessEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
}

export function parseAdminEmails(raw: string | undefined): string[] {
  return String(raw || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function accessConfig(env: AccessEnv): AccessConfig | null {
  const teamDomain = String(env.ACCESS_TEAM_DOMAIN || "").trim().replace(/\/+$/, "");
  const audience = String(env.ACCESS_AUD || "").trim();
  const emails = parseAdminEmails(env.ADMIN_EMAILS);
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(teamDomain) || !audience || !emails.length) return null;
  return { teamDomain, audience, emails };
}

export function accessJwksUrl(config: AccessConfig): URL {
  return new URL(`${config.teamDomain}/cdn-cgi/access/certs`);
}

export async function verifyAccessToken(
  token: string,
  config: AccessConfig,
  key?: KeyInput | JWTVerifyGetKey,
): Promise<AccessPrincipal | null> {
  if (!token || !config) return null;
  try {
    const jwks = key ?? createRemoteJWKSet(accessJwksUrl(config));
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.teamDomain,
      audience: config.audience,
      algorithms: ["RS256"],
      clockTolerance: 5,
    });
    const email = String(payload.email || "").trim().toLowerCase();
    const sub = String(payload.sub || "").trim();
    if (!email || !sub || !config.emails.includes(email)) return null;
    return { sub, email };
  } catch {
    return null;
  }
}

/** Mutating admin requests must come from the site origin, not a cross-site form/fetch. */
export function isSameOrigin(req: Request, siteUrl: string): boolean {
  const fetchSite = (req.headers.get("sec-fetch-site") || "").toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(siteUrl).origin;
  } catch {
    return false;
  }
}
