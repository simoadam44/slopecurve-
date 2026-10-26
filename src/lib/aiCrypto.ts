// Pure AES-GCM helpers for encrypting Gemini API keys at rest.
//
// The encryption secret is passed in explicitly so it can be a dedicated secret
// (AI_KEYS_SECRET) that is separate from the session-signing secret. Keys are never
// returned to the browser: only a masked hint is ever exposed.
//
// Uses WebCrypto only (available in Cloudflare Workers and Node >= 16), so this module is
// runtime-agnostic and unit-testable.

const SALT = "slopecurve-ai-keys-v1";
const ITERATIONS = 100000;
const enc = new TextEncoder();

function b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

// Sanity-checks the shape of a Google AI Studio key before storing it. Google issues both the
// legacy `AIza...` format and the newer `AQ....` format (which contains a dot), so we accept any
// safe token of the right length rather than pinning a prefix that may change. Actual validity is
// proven only when the key is used against the Gemini API.
export function validApiKeyFormat(k: string): boolean {
  return /^[A-Za-z0-9_.-]{20,200}$/.test(String(k || "").trim());
}

// Masked hint shown in the admin UI. Never contains the full key.
export function keyHint(k: string): string {
  const s = String(k || "").trim();
  return s.length <= 8 ? "••••••" : `…${s.slice(-4)}`;
}

export async function deriveAiKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(SALT), iterations: ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// Returns "iv:ciphertext" (both base64). A fresh random IV per call.
export async function encryptSecret(secret: string, plain: string): Promise<string> {
  const key = await deriveAiKey(secret);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
  return `${b64(iv.buffer as ArrayBuffer)}:${b64(ct)}`;
}

// Returns the plaintext, or null on any failure (wrong secret, tampering, bad format).
export async function decryptSecret(secret: string, stored: string): Promise<string | null> {
  try {
    const [ivb, ctb] = String(stored).split(":");
    if (!ivb || !ctb) return null;
    const key = await deriveAiKey(secret);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivb) }, key, unb64(ctb));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}
