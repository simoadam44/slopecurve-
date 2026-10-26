// Normalizes Gemini upstream failures into stable codes + safe, human messages.
//
// Requirement: never surface or persist raw provider response bodies (they can echo request
// data and are not useful to editors). Only a small set of codes is stored/logged and shown.

export type AiErrorCode =
  | "no_key"
  | "invalid_key"
  | "permission_denied"
  | "model_unavailable"
  | "rate_limited"
  | "quota_exhausted"
  | "payment_required"
  | "overloaded"
  | "network"
  | "bad_response"
  | "upstream";

// Map an HTTP status + upstream body to a normalized code. The body is inspected in-memory
// and then discarded; it is never returned to a client or written to the database.
export function classifyGeminiError(status: number, body: string): AiErrorCode {
  const b = String(body || "");
  if (status === 402) return "payment_required";
  if (status === 401) return "invalid_key";
  if (status === 403) {
    return /API_KEY_INVALID|API key not valid|invalid api key/i.test(b) ? "invalid_key" : "permission_denied";
  }
  if (status === 400) {
    if (/API_KEY_INVALID|API key not valid|invalid api key/i.test(b)) return "invalid_key";
    if (/\bmodel\b/i.test(b) && /(not found|not supported|does not exist|unsupported|not enabled)/i.test(b)) return "model_unavailable";
    return "upstream";
  }
  if (status === 404) return "model_unavailable";
  if (status === 429) {
    return /quota|exceeded your current quota|RESOURCE_EXHAUSTED/i.test(b) ? "quota_exhausted" : "rate_limited";
  }
  if (status === 503 || status === 500 || status === 502 || status === 504) return "overloaded";
  return "upstream";
}

// Codes that are worth retrying with the next model or key. Everything else is terminal.
const RETRYABLE: ReadonlySet<AiErrorCode> = new Set<AiErrorCode>([
  "model_unavailable",
  "permission_denied",
  "rate_limited",
  "quota_exhausted",
  "overloaded",
  "network",
]);

export function isRetryableCode(code: AiErrorCode): boolean {
  return RETRYABLE.has(code);
}

const MESSAGES: Record<AiErrorCode, string> = {
  no_key: "No Gemini API key configured yet. Add one under AI Writer.",
  invalid_key: "Google rejected the API key. Check it is a valid Gemini key restricted to the Generative Language API.",
  permission_denied: "This key/project is not permitted to use that model. Trying another free model.",
  model_unavailable: "That model is not available for this key/project. Trying another free model.",
  rate_limited: "Gemini free-tier rate limit reached. Wait about a minute, or add another free key.",
  quota_exhausted: "Gemini free-tier daily quota reached for this project. Try later, or add another free key.",
  payment_required: "This Google project has no paid balance. The app only uses the free tier and never makes a purchase.",
  overloaded: "Gemini is temporarily overloaded. Please try again shortly.",
  network: "Could not reach the Gemini API. Check connectivity and try again.",
  bad_response: "Gemini returned an unexpected response. Please try again.",
  upstream: "The Gemini request failed. Please try again.",
};

export function aiErrorMessage(code: AiErrorCode): string {
  return MESSAGES[code] ?? MESSAGES.upstream;
}
