import { test, expect } from "@playwright/test";
import { adminHeaders } from "./admin";

const SITE = process.env.SITE_URL || "https://slopecurve.com";

test("admin: keywords & landing tools engine (modal create, publish, view, edit, delete)", async ({ page }) => {
  const stamp = Date.now();
  const slug = `e2e-landing-${stamp}`;
  const keyword = `e2e landing keyword ${stamp}`;
  const h1 = `E2E Landing ${stamp}`;
  const updatedH1 = `${h1} Updated`;
  const subtitle = `A specific ${stamp} subtitle for the landing page.`;
  const title = `E2E Landing ${stamp} — Play Free Online`;
  let id = "";

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // Remove leftovers from an earlier interrupted run (only our own prefix).
  const headers = await adminHeaders(page);
  const list = await (await page.request.get("/api/admin/landings")).json();
  for (const row of list.rows || []) {
    if (String(row.slug).startsWith("e2e-landing-")) await page.request.delete(`/api/admin/landings/${row.id}`, { headers });
  }

  const game = await (await page.request.get("/api/games/snow-road")).json();
  expect(game.id).toBeTruthy();

  const longBody =
    "<p>" +
    Array.from({ length: 18 }, (_, i) =>
      `Attempt ${i + 1}: feather the brake before the frozen lake so the sled stays level and the shortcut through the pine tunnel opens.`,
    ).join(" ") +
    "</p>";

  try {
    // Open the new modal from the list and verify the AI originality gate opens the notes panel.
    await page.goto("/admin/landing");
    await page.getByRole("link", { name: "+ Add Tool Page" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Tool Page" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Live URL preview");
    await expect(dialog).toContainText("/your-slug");

    await expect(dialog.getByLabel("Linked game").locator(`option[value="${game.id}"]`)).toHaveCount(1);
    await dialog.getByLabel("Linked game").selectOption(game.id);
    await dialog.getByLabel("Target keyword").fill(keyword);
    await dialog.getByRole("button", { name: "Generate with AI from Target Keyword" }).click();
    await expect(dialog.getByLabel(/first-hand notes/)).toBeVisible();
    await expect(dialog.getByText(/at least 40 characters/i)).toBeVisible();

    await dialog.getByLabel("Slug (URL)").fill(slug);
    await dialog.getByLabel("Badge").fill("E2E TOOL");
    await dialog.getByLabel("Tool", { exact: true }).selectOption("video");
    await dialog.getByLabel(/Page title/).fill(title);
    await dialog.getByLabel("Meta description").fill(`A unique end-to-end landing page for ${keyword}.`);
    await dialog.getByLabel("H1 Heading").fill(h1);
    await dialog.getByLabel("Subtitle").fill(subtitle);

    await dialog.locator("summary", { hasText: "Advanced SEO & content" }).click();
    await dialog.getByLabel(/^Intro/).fill(`<p>This page answers <strong>${keyword}</strong> with details taken from the game itself.</p>`);
    await dialog.getByRole("button", { name: "+ Add section" }).click();
    await dialog.getByLabel("Section 1 heading").fill("Quick answer");
    await dialog.getByLabel("Section 1 body").fill(longBody);
    await dialog.getByLabel("FAQs").fill(`<h3>Is ${slug} free?</h3><p>Yes, it is free to play in your browser.</p><h3>Do I need to download anything?</h3><p>No download is required.</p>`);

    await dialog.getByLabel(/Publish live/).check();
    await dialog.getByRole("button", { name: "Publish Page" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/landing$/);

    // Admin list shows the new page with its tool classification and live status.
    await expect(page.getByRole("heading", { name: /Keywords & Landing Tools Engine/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Keywords & Tools" })).toBeVisible();
    const row = page.locator("tr", { hasText: slug });
    await expect(row).toBeVisible();
    await expect(row).toContainText(keyword);
    await expect(row).toContainText("Video");
    await expect(row).toContainText("published");

    const rows = await (await page.request.get("/api/admin/landings")).json();
    id = (rows.rows || []).find((r: { slug: string }) => r.slug === slug)?.id || "";
    expect(id).toBeTruthy();

    // Direct route loads the list behind an edit dialog with the saved values.
    await page.goto(`/admin/landing/${id}`);
    const edit = page.getByRole("dialog", { name: "Edit Tool Page" });
    await expect(edit).toBeVisible();
    await expect(edit.getByLabel(/Page title/)).toHaveValue(title);
    await expect(edit.getByLabel("H1 Heading")).toHaveValue(h1);
    await expect(edit.getByLabel("Subtitle")).toHaveValue(subtitle);
    await expect(edit.getByLabel("Target keyword")).toHaveValue(keyword);
    await expect(edit.getByLabel("Tool", { exact: true })).toHaveValue("video");
    await expect(edit.getByLabel(/Publish live/)).toBeChecked();

    // Edit through the modal, then verify the public page and its metadata.
    await edit.getByLabel("H1 Heading").fill(updatedH1);
    await expect(edit.getByLabel("H1 Heading")).toHaveValue(updatedH1);
    await edit.getByRole("button", { name: "Publish Page" }).click();
    await expect(edit).toBeHidden();

    await page.goto(`/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: updatedH1 })).toBeVisible();
    const meta = page.locator(".player-meta").filter({ has: page.locator(".player-title") });
    await expect(meta).toContainText(subtitle);
    await expect(meta).toContainText("Video");
    await expect(page.locator("iframe").first()).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE}/${slug}`);
    const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).join(" ");
    expect(ld).toContain('"@type":"VideoGame"');
    expect(ld).toContain('"@type":"FAQPage"');
    const cta = page.getByRole("link", { name: /full game page/i }).first();
    await expect(cta).toHaveAttribute("href", "/games/snow-road");

    // Cancel closes the modal without creating another page.
    await page.goto("/admin/landing");
    await page.getByRole("link", { name: "+ Add Tool Page" }).click();
    const fresh = page.getByRole("dialog", { name: "Add Tool Page" });
    await expect(fresh).toBeVisible();
    await fresh.getByRole("button", { name: "Cancel" }).click();
    await expect(fresh).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/landing$/);
  } finally {
    if (id) await page.request.delete(`/api/admin/landings/${id}`, { headers: await adminHeaders(page) });
  }
});
