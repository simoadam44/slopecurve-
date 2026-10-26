import { adminFetch } from "../../lib/adminApi";

export async function api<T>(url: string, method = "GET", body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const r = await adminFetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await r.json().catch(() => ({}))) as T;
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: {} as T };
  }
}

export function errOf(data: unknown, fallback: string): string {
  return (data as { error?: string })?.error || fallback;
}
