const TTL_MS = 15 * 60 * 1000;

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", text(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, text(payload));
  return b64url(new Uint8Array(signature));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueCsrfToken(secret: string, subject: string, now = Date.now()): Promise<string> {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = b64url(text(JSON.stringify({ sub: subject, exp: now + TTL_MS, nonce })));
  return `${payload}.${await sign(secret, payload)}`;
}

export async function verifyCsrfToken(
  secret: string,
  token: string,
  subject: string,
  now = Date.now(),
): Promise<boolean> {
  const [payload, signature, extra] = String(token || "").split(".");
  if (!payload || !signature || extra) return false;
  try {
    const expected = await sign(secret, payload);
    if (!constantTimeEqual(signature, expected)) return false;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { sub?: string; exp?: number; nonce?: string };
    return data.sub === subject && typeof data.exp === "number" && data.exp > now && Boolean(data.nonce);
  } catch {
    return false;
  }
}
