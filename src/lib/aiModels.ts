// Free-tier-only Gemini model policy.
//
// The app is explicitly limited to models that Google lists as free of charge on the
// Gemini API free tier. Anything paid-only (Pro, image/Nano-Banana, Veo, Omni, TTS/Live,
// Transcribe, gemini-4-*), deprecated, or unverified is rejected server-side and is never
// used as a fallback. Verification source: ai.google.dev pricing/models pages (Oct 2026).
//
// A model id is only allowed here after its free-tier eligibility has been verified. Do not
// add ids "just in case": an unverified id must never be reached by the fallback chain.

export interface ModelMeta {
  id: string;
  tier: "free";
  status: "ga" | "preview";
  note: string;
}

// Verifiably free-of-charge text models, newest/most capable first.
export const VERIFIED_FREE_MODELS: readonly ModelMeta[] = [
  { id: "gemini-3.8-flash", tier: "free", status: "ga", note: "Current free Flash, most capable free text model." },
  { id: "gemini-3.6-flash", tier: "free", status: "ga", note: "Free Flash; replaces deprecated gemini-3.5-flash." },
  { id: "gemini-3.5-flash-lite", tier: "free", status: "ga", note: "Cheapest free 3.5 model, good for high volume." },
  { id: "gemini-3.1-flash-lite", tier: "free", status: "ga", note: "Free; scheduled for shutdown 2027-05-07." },
];

// Models Google has deprecated: the API silently auto-routes them to a replacement, so they
// must never be selected/fabricated as if they were the requested model.
export const DEPRECATED_MODELS: readonly string[] = ["gemini-3.7-flash", "gemini-3.5-flash"];

// Models known to be paid-only on the free tier (kept as an explicit denylist for tests/docs).
export const PAID_ONLY_MODELS: readonly string[] = [
  "gemini-3.1-pro-preview",
  "gemini-3-pro-image",
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-nano-banana-2.1",
  "gemini-omni-1.1-flash",
  "veo-3.1-generate-preview",
];

export const DEFAULT_MODEL = "gemini-3.8-flash";

// Ordered allowlist derived from the verified set. This is the ONLY source of usable ids.
export const FREE_MODELS: readonly string[] = VERIFIED_FREE_MODELS.map((m) => m.id);

const MODEL_ID_RE = /^[a-z0-9][a-z0-9.-]{0,63}$/;

export function isSafeModelId(model: string): boolean {
  return MODEL_ID_RE.test(String(model || "").trim());
}

export function isFreeModel(model: string): boolean {
  const m = String(model || "").trim();
  return isSafeModelId(m) && FREE_MODELS.includes(m);
}

export function modelMeta(model: string): ModelMeta | null {
  const m = String(model || "").trim();
  return VERIFIED_FREE_MODELS.find((x) => x.id === m) ?? null;
}

// Returns the requested model only when it is verified-free, otherwise the default.
// The chain is limited to verified-free ids so an unverified model is never attempted.
export function fallbackChain(preferred?: string): string[] {
  const first = preferred && isFreeModel(preferred) ? preferred : DEFAULT_MODEL;
  return [first, ...FREE_MODELS.filter((m) => m !== first)];
}

// True when an upstream error should be retried with the next model/key (model unavailable,
// not enabled for this key/project, quota, or permission for that specific model).
// A 402 (prepaid balance exhausted) is terminal: switching models will not help.
export function isRetryableModelError(status: number, body: string): boolean {
  if (status === 402) return false;
  if (status === 404 || status === 400) return true; // model not found / not enabled for this key
  if (status === 429 || status === 403) return true; // quota or permission for this model
  return /RESOURCE_EXHAUSTED|NOT_FOUND|PERMISSION_DENIED|not found|not supported/i.test(body);
}
