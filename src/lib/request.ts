export class PayloadTooLargeError extends Error {
  constructor() {
    super("payload_too_large");
    this.name = "PayloadTooLargeError";
  }
}

export const DEFAULT_JSON_LIMIT = 256 * 1024;

/** Cross-site forms cannot send this media type without a CORS preflight. */
export function isJsonRequest(req: Request): boolean {
  return (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() === "application/json";
}

export async function readJson<T = Record<string, unknown>>(
  req: Request,
  maxBytes = DEFAULT_JSON_LIMIT,
): Promise<T> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new PayloadTooLargeError();

  const body = await req.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes) throw new PayloadTooLargeError();

  const parsed: unknown = JSON.parse(body);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_json_object");
  }
  return parsed as T;
}
