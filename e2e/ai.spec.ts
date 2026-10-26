import { test, expect } from "@playwright/test";
import { adminHeaders } from "./admin";

test("admin: AI writer keyring + guides engine + game AI card", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/admin/ai");
  await expect(page.getByRole("heading", { name: /AI Writer/ })).toBeVisible();
  await expect(page.getByText(/Free-tier Google Gemini only/)).toBeVisible();

  // Remove any leftovers from previous runs so we only ever act on our own row.
  const headers = await adminHeaders(page);
  const before = await (await page.request.get("/api/admin/ai/status")).json();
  for (const k of before.keys || []) {
    if (k.label === "e2e temp key") await page.request.delete(`/api/admin/ai/keys/${k.id}`, { headers });
  }

  const fakeKey = "AIzaSyTESTONLY_" + "a".repeat(24);
  await page.getByLabel("Label").fill("e2e temp key");
  await page.getByLabel("API key").fill(fakeKey);
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText(/never shown again/)).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain(fakeKey); // secret is never echoed back to the browser
  expect(html).toContain(`…${fakeKey.slice(-4)}`); // only the masked hint is shown
  expect(html).not.toContain(fakeKey.slice(0, 6)); // never reveal the key prefix either

  page.on("dialog", (d) => d.accept());
  const row = page.locator("li", { hasText: "e2e temp key" });
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(row).toHaveCount(0);

  await page.goto("/admin/blog");
  await expect(page.getByRole("heading", { name: /Long-Tail Guides Engine/ })).toBeVisible();
  await expect(page.getByLabel(/Target keyword/)).toBeVisible();
  await page.getByPlaceholder(/Section body/).first().fill("Brake early before the second bend and coast into the ramp so the sled stays level. ".repeat(6));
  await expect(page.getByText(/Words:/)).toBeVisible();

  await page.goto("/admin/games/new");
  await expect(page.getByRole("heading", { name: /Generate game copy/ })).toBeVisible();
  await expect(page.getByLabel(/first-hand notes/)).toBeVisible();
});
