import type { Page } from "@playwright/test";

export async function adminHeaders(page: Page): Promise<Record<string, string>> {
  const me = (await (await page.request.get("/api/admin/me")).json()) as { csrf?: string };
  return {
    origin: new URL(page.url()).origin,
    "x-csrf-token": String(me.csrf || ""),
  };
}
