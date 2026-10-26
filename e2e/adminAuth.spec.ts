import { test, expect } from "@playwright/test";

const HTML = { Accept: "text/html" };

test("admin: /admin/login is a real server route, not a 404", async ({ request }) => {
  const res = await request.get("/admin/login", { headers: HTML });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('id="root"');
  expect(html).toMatch(/<meta name="robots" content="noindex[^"]*">/);
  expect(html).not.toContain("Page not found");
});

test("admin: signed-in visitors continue straight to the dashboard", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("admin: deep link keeps the target after sign-in", async ({ page }) => {
  await page.goto("/admin/login?next=%2Fadmin%2Fgames");
  await expect(page).toHaveURL(/\/admin\/games$/);
  await expect(page.getByRole("heading", { name: /Games/i }).first()).toBeVisible();
});

test("admin: signed-out visitors get the login page instead of a dead end", async ({ page }) => {
  await page.route("**/api/admin/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) }),
  );

  await page.goto("/admin/games");
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fgames/);
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with Cloudflare Access" })).toHaveAttribute(
    "href",
    /cdn-cgi\/access\/login\?redirect_url=%2Fadmin%2Fgames/,
  );

  // The app has no password store, so no credential form is offered.
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.locator('input[type="email"]')).toHaveCount(0);

  // Reloading the login URL must not 404 either.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
});
