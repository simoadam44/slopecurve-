import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { accessConfig, isSameOrigin, parseAdminEmails, verifyAccessToken } from "../src/lib/access";
import { issueCsrfToken, verifyCsrfToken } from "../src/lib/csrf";

const CONFIG = {
  teamDomain: "https://slopecurve.cloudflareaccess.com",
  audience: "access-aud-tag",
  emails: ["admin@example.com"],
};

let privateKey: CryptoKey;
let publicKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
});

async function token(overrides: { email?: string; aud?: string; iss?: string; exp?: number } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: overrides.email ?? "admin@example.com" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(overrides.iss ?? CONFIG.teamDomain)
    .setAudience(overrides.aud ?? CONFIG.audience)
    .setSubject("admin-sub")
    .setIssuedAt(now)
    .setExpirationTime(overrides.exp ?? now + 300)
    .sign(privateKey);
}

describe("Access configuration", () => {
  it("normalizes the allowlist and requires all fields", () => {
    expect(parseAdminEmails(" Admin@Example.com, ops@example.com ")).toEqual(["admin@example.com", "ops@example.com"]);
    expect(accessConfig({ ACCESS_TEAM_DOMAIN: CONFIG.teamDomain, ACCESS_AUD: CONFIG.audience, ADMIN_EMAILS: "Admin@Example.com" })).toEqual(CONFIG);
    expect(accessConfig({ ACCESS_TEAM_DOMAIN: CONFIG.teamDomain })).toBeNull();
    expect(accessConfig({ ACCESS_TEAM_DOMAIN: CONFIG.teamDomain, ACCESS_AUD: CONFIG.audience, ADMIN_EMAILS: "" })).toBeNull();
  });
});

describe("Access JWT verification", () => {
  it("accepts a valid token for an allowlisted email", async () => {
    const principal = await verifyAccessToken(await token(), CONFIG, publicKey);
    expect(principal).toEqual({ sub: "admin-sub", email: "admin@example.com" });
  });

  it("rejects wrong audience, issuer, expiry, and unlisted email", async () => {
    expect(await verifyAccessToken(await token({ aud: "other" }), CONFIG, publicKey)).toBeNull();
    expect(await verifyAccessToken(await token({ iss: "https://evil.cloudflareaccess.com" }), CONFIG, publicKey)).toBeNull();
    expect(await verifyAccessToken(await token({ exp: Math.floor(Date.now() / 1000) - 10 }), CONFIG, publicKey)).toBeNull();
    expect(await verifyAccessToken(await token({ email: "other@example.com" }), CONFIG, publicKey)).toBeNull();
  });

  it("rejects malformed and missing-email tokens", async () => {
    expect(await verifyAccessToken("not-a-jwt", CONFIG, publicKey)).toBeNull();
    const noEmail = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(CONFIG.teamDomain)
      .setAudience(CONFIG.audience)
      .setSubject("admin-sub")
      .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
      .sign(privateKey);
    expect(await verifyAccessToken(noEmail, CONFIG, publicKey)).toBeNull();
  });
});

describe("request origin checks", () => {
  const site = "https://slopecurve.com";

  it("accepts same-origin mutations and rejects cross-site requests", () => {
    const same = new Request(`${site}/api/admin/games`, {
      method: "POST",
      headers: { origin: site, "sec-fetch-site": "same-origin" },
    });
    const evil = new Request(`${site}/api/admin/games`, {
      method: "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    });
    expect(isSameOrigin(same, site)).toBe(true);
    expect(isSameOrigin(evil, site)).toBe(false);
  });

  it("rejects mutations with no Origin header", () => {
    const req = new Request(`${site}/api/admin/games`, { method: "POST" });
    expect(isSameOrigin(req, site)).toBe(false);
  });
});

describe("CSRF tokens", () => {
  it("round-trips and rejects tampering, wrong subject, and expiry", async () => {
    const now = 1_700_000_000_000;
    const token = await issueCsrfToken("csrf-secret", "admin-sub", now);
    expect(await verifyCsrfToken("csrf-secret", token, "admin-sub", now + 1_000)).toBe(true);
    expect(await verifyCsrfToken("csrf-secret", `${token}x`, "admin-sub", now + 1_000)).toBe(false);
    expect(await verifyCsrfToken("csrf-secret", token, "other-sub", now + 1_000)).toBe(false);
    expect(await verifyCsrfToken("csrf-secret", token, "admin-sub", now + 16 * 60 * 1000)).toBe(false);
  });
});
