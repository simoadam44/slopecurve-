import { test, expect } from "@playwright/test";

test("home -> category -> game -> comment pending", async ({ page }) => {
  // The configured homepage game renders at "/" and the URL stays at the root.
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("h1").first()).toContainText("Slope Rider 2");
  await expect(page.locator(".player-wrap iframe").first()).toBeVisible();
  // The embed keeps scripts (games are JS) but can never navigate our tab or open popups.
  const sandbox = await page.locator(".player-wrap iframe").first().getAttribute("sandbox");
  expect(sandbox).toContain("allow-scripts");
  expect(sandbox).toContain("allow-same-origin");
  expect(sandbox).not.toContain("allow-top-navigation");
  expect(sandbox).not.toContain("allow-popups");
  // No "open in a new tab" link in the player controls.
  await expect(page.getByText(/in a new tab/i)).toHaveCount(0);
  await page.getByRole("link", { name: /Categories/ }).first().click();
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();
  // Client-side navigation to "/" also renders the homepage game at the root.
  await page.getByRole("link", { name: "Home", exact: true }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("h1").first()).toContainText("Slope Rider 2");
  // The homepage game has a single canonical URL: /games/<slug> 301s to the root.
  await page.goto("/games/slope-rider-2");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/games/snow-road");
  await expect(page.locator("h1").first()).toContainText("Snow Road");
  await expect(page.locator('.player-wrap iframe[title*="Snow Road"]')).toBeVisible();
  // Client-side navigation to the homepage game's /games/<slug> URL also lands on the root.
  const homeTile = page.locator('a[href="/games/slope-rider-2"]').first();
  await expect(homeTile).toBeVisible();
  await homeTile.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("h1").first()).toContainText("Slope Rider 2");
});
