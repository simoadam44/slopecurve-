import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPair, SignJWT, type CryptoKey } from "jose";
import {
  fetchSupabaseUser,
  isAdminIdentity,
  normalizeSupabaseUrl,
  parseEmailList,
  profileRoleIsAdmin,
  supabaseAuthConfig,
  verifySupabaseToken,
  type SupabaseAuthConfig,
  type SupabaseIdentity,
} from "../src/lib/supabaseAuth";
import { bearerToken, isSameOrigin } from "../src/lib/request";
import { issueCsrfToken, verifyCsrfToken } from "../src/lib/csrf";

const URL_BASE = "https://project.supabase.co";
const ISSUER = `${URL_BASE}/auth/v1`;
const SECRET = "test-only-jwt-secret-not-a-real-key";

function config(overrides: Partial<SupabaseAuthConfig> = {}): SupabaseAuthConfig {
  return {
    url: URL_BASE,
    issuer: ISSUER,
    jwtSecret: SECRET,
    anonKey: "test-only-anon-key",
    serviceRoleKey: null,
    adminEmails: ["admin@example.com"],
    trustUserMetadata: false,
    ...overrides,
  };
}

async function hsToken(
  claims: Record<string, unknown> = {},
  options: { secret?: string; issuer?: string; audience?: string; exp?: number } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: "admin@example.com", app_metadata: { role: "admin" }, ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? "authenticated")
    .setSubject("user-1")
    .setIssuedAt(now)
    .setExpirationTime(options.exp ?? now + 300)
    .sign(new TextEncoder().encode(options.secret ?? SECRET));
}

let rsaPrivate: CryptoKey;
let rsaPublic: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  rsaPrivate = pair.privateKey;
  rsaPublic = pair.publicKey;
});

describe("Supabase configuration", () => {
  it("normalises the URL and parses the admin allowlist", () => {
    expect(normalizeSupabaseUrl("https://Project.Supabase.co/")).toBe("https://Project.Supabase.co");
    expect(normalizeSupabaseUrl("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321");
    expect(normalizeSupabaseUrl("http://project.supabase.co")).toBe("");
    expect(normalizeSupabaseUrl("project.supabase.co")).toBe("");
    expect(normalizeSupabaseUrl("")).toBe("");
    expect(parseEmailList(" Admin@Example.com, ops@example.com ")).toEqual(["admin@example.com", "ops@example.com"]);
  });

  it("requires a URL plus something to verify tokens with", () => {
    expect(supabaseAuthConfig({ SUPABASE_URL: URL_BASE, SUPABASE_JWT_SECRET: SECRET })).toMatchObject({
      url: URL_BASE,
      issuer: ISSUER,
      jwtSecret: SECRET,
      adminEmails: [],
      trustUserMetadata: false,
    });
    expect(supabaseAuthConfig({ SUPABASE_URL: URL_BASE, SUPABASE_ANON_KEY: "anon" })?.jwtSecret).toBeNull();
    expect(supabaseAuthConfig({ SUPABASE_URL: URL_BASE })).toBeNull();
    expect(supabaseAuthConfig({ SUPABASE_JWT_SECRET: SECRET })).toBeNull();
    expect(supabaseAuthConfig({ SUPABASE_URL: "http://evil.example", SUPABASE_JWT_SECRET: SECRET })).toBeNull();
  });

  it("only trusts user_metadata when explicitly enabled", () => {
    expect(supabaseAuthConfig({ SUPABASE_URL: URL_BASE, SUPABASE_JWT_SECRET: SECRET })?.trustUserMetadata).toBe(false);
    expect(
      supabaseAuthConfig({ SUPABASE_URL: URL_BASE, SUPABASE_JWT_SECRET: SECRET, SUPABASE_TRUST_USER_METADATA: "true" })
        ?.trustUserMetadata,
    ).toBe(true);
  });
});

describe("Supabase access token verification", () => {
  it("accepts a valid HS256 session and returns the identity", async () => {
    const identity = await verifySupabaseToken(await hsToken(), config());
    expect(identity).toEqual({
      sub: "user-1",
      email: "admin@example.com",
      appMetadata: { role: "admin" },
      userMetadata: {},
    });
  });

  it("accepts an asymmetric token through the supplied public key", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ email: "admin@example.com" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setSubject("user-2")
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(rsaPrivate);
    const identity = await verifySupabaseToken(token, config(), rsaPublic);
    expect(identity?.sub).toBe("user-2");
  });

  it("rejects wrong issuer, wrong audience, expiry and a forged signature", async () => {
    expect(await verifySupabaseToken(await hsToken({}, { issuer: "https://evil.supabase.co/auth/v1" }), config())).toBeNull();
    expect(await verifySupabaseToken(await hsToken({}, { audience: "anon" }), config())).toBeNull();
    expect(await verifySupabaseToken(await hsToken({}, { exp: Math.floor(Date.now() / 1000) - 10 }), config())).toBeNull();
    expect(await verifySupabaseToken(await hsToken({}, { secret: "a-different-secret-entirely" }), config())).toBeNull();
  });

  it("rejects malformed, unsigned and keyless tokens", async () => {
    expect(await verifySupabaseToken("not-a-jwt", config())).toBeNull();
    expect(await verifySupabaseToken("", config())).toBeNull();
    expect(await verifySupabaseToken("eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1c2VyLTEifQ.", config())).toBeNull();
    // No secret configured: an HS256 token can never be trusted.
    expect(await verifySupabaseToken(await hsToken(), config({ jwtSecret: null, anonKey: "anon" }))).toBeNull();
  });

  it("never treats the Postgres role claim as an admin marker", async () => {
    const token = await hsToken({
      app_metadata: {},
      user_metadata: {},
      role: "admin",
      email: "someone@example.com",
    });
    const identity = (await verifySupabaseToken(token, config())) as SupabaseIdentity;
    expect(identity).not.toBeNull();
    expect(isAdminIdentity(identity, config())).toBe(false);
  });
});

describe("admin authorization", () => {
  const identity = (overrides: Partial<SupabaseIdentity> = {}): SupabaseIdentity => ({
    sub: "user-1",
    email: "someone@example.com",
    appMetadata: {},
    userMetadata: {},
    ...overrides,
  });

  it("accepts the email allowlist and app_metadata.role", () => {
    expect(isAdminIdentity(identity({ email: "admin@example.com" }), config())).toBe(true);
    expect(isAdminIdentity(identity({ appMetadata: { role: "admin" } }), config())).toBe(true);
    expect(isAdminIdentity(identity({ appMetadata: { is_admin: true } }), config())).toBe(true);
    expect(isAdminIdentity(identity({ appMetadata: { role: "editor" } }), config())).toBe(false);
    expect(isAdminIdentity(identity(), config())).toBe(false);
  });

  it("ignores user_metadata unless the operator opts in", () => {
    const userMeta = identity({ userMetadata: { role: "admin" } });
    expect(isAdminIdentity(userMeta, config())).toBe(false);
    expect(isAdminIdentity(userMeta, config({ trustUserMetadata: true }))).toBe(true);
  });
});

describe("remote fallback without the JWT secret", () => {
  const okUser = {
    id: "user-9",
    email: "Admin@Example.com",
    app_metadata: { role: "admin" },
    user_metadata: {},
  };

  it("verifies the token against /auth/v1/user", async () => {
    let seen: { url: string; headers: Record<string, string> } | null = null;
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen = { url: String(input), headers: init?.headers as Record<string, string> };
      return new Response(JSON.stringify(okUser), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const identity = await fetchSupabaseUser("session-token", config({ jwtSecret: null, anonKey: "anon" }), fakeFetch);
    expect(identity).toEqual({ sub: "user-9", email: "admin@example.com", appMetadata: { role: "admin" }, userMetadata: {} });
    expect(seen!.url).toBe(`${URL_BASE}/auth/v1/user`);
    expect(seen!.headers.authorization).toBe("Bearer session-token");
    expect(seen!.headers.apikey).toBe("anon");
  });

  it("returns null for a rejected token or a network failure", async () => {
    const unauthorized = (async () => new Response("{}", { status: 401 })) as typeof fetch;
    expect(await fetchSupabaseUser("bad", config({ jwtSecret: null, anonKey: "anon" }), unauthorized)).toBeNull();

    const failing = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    expect(await fetchSupabaseUser("token", config({ jwtSecret: null, anonKey: "anon" }), failing)).toBeNull();
    // No key at all: fail closed without a request.
    expect(await fetchSupabaseUser("token", config({ jwtSecret: null, anonKey: null, serviceRoleKey: null }), unauthorized)).toBeNull();
  });
});

describe("profiles.role lookup", () => {
  it("grants admin only for a role=admin row", async () => {
    const row = (role: string) =>
      (async () =>
        new Response(JSON.stringify([{ role }]), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    expect(await profileRoleIsAdmin(config({ serviceRoleKey: "svc" }), "user-1", row("admin"))).toBe(true);
    expect(await profileRoleIsAdmin(config({ serviceRoleKey: "svc" }), "user-1", row("user"))).toBe(false);
  });

  it("fails closed without the service key, on errors, and on bad payloads", async () => {
    const ok = (async () => new Response("[]", { status: 200 })) as typeof fetch;
    expect(await profileRoleIsAdmin(config({ serviceRoleKey: null }), "user-1", ok)).toBe(false);

    const denied = (async () => new Response("{}", { status: 404 })) as typeof fetch;
    expect(await profileRoleIsAdmin(config({ serviceRoleKey: "svc" }), "user-1", denied)).toBe(false);

    const thrown = (async () => {
      throw new Error("boom");
    }) as typeof fetch;
    expect(await profileRoleIsAdmin(config({ serviceRoleKey: "svc" }), "user-1", thrown)).toBe(false);

    const notArray = (async () => new Response(JSON.stringify({ role: "admin" }), { status: 200 })) as typeof fetch;
    expect(await profileRoleIsAdmin(config({ serviceRoleKey: "svc" }), "user-1", notArray)).toBe(false);
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

  it("reads a Bearer token and ignores other schemes", () => {
    expect(bearerToken(new Request(site, { headers: { authorization: "Bearer abc.def" } }))).toBe("abc.def");
    expect(bearerToken(new Request(site, { headers: { authorization: "bearer  abc" } }))).toBe("abc");
    expect(bearerToken(new Request(site, { headers: { authorization: "Basic abc" } }))).toBe("");
    expect(bearerToken(new Request(site))).toBe("");
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
