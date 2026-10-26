import { test, expect } from "@playwright/test";

test("player: placeholder, start hint and reload control are present", async ({ page }) => {
  await page.goto("/games/snow-road");

  const frame = page.locator(".player-wrap iframe").first();
  await expect(frame).toBeVisible();
  // The placeholder must never sit on top of the game. It is cleared on the iframe load event,
  // which depends on the external game host, so allow a realistic network window.
  await expect(page.locator(".player-loading")).toHaveCount(0, { timeout: 30_000 });

  // Providers such as azgames show their own Play button first; the page says so.
  await expect(page.locator(".player-hint")).toContainText(/Play/);
  await expect(page.locator(".player-hint")).toContainText(/content blocker/);

  const before = await frame.getAttribute("src");
  await page.getByRole("button", { name: "Reload player" }).click();
  await expect(page.locator(".player-wrap iframe")).toHaveCount(1);
  await expect(page.locator(".player-wrap iframe").first()).toHaveAttribute("src", String(before));
});

test("artwork: a failed thumbnail is retried once, then a local fallback renders", async ({ page }) => {
  const retried: string[] = [];
  await page.route("**/upload/cache/**", (route) => route.abort("failed"));
  await page.route("**/cache/data/image/**", (route) => route.abort("failed"));
  page.on("request", (r) => {
    if (r.url().includes("retry=")) retried.push(r.url());
  });

  await page.goto("/games/snow-road");

  const tiles = page.locator(".rail-tile img");
  await expect(tiles.first()).toBeVisible();
  // Every tile still paints something real (the local placeholder), never a blank box.
  await expect
    .poll(async () => await tiles.evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0)))
    .toBe(true);
  await expect
    .poll(async () => await tiles.evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).src.includes("/fallback.svg"))))
    .toBe(true);

  // The retry attempt happened, which is what defeats a cached provider error.
  await expect.poll(() => retried.length).toBeGreaterThan(0);
});
