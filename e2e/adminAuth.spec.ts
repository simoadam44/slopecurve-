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

test("admin: signed-out visitors get the email + password form, not a dead end", async ({ page }) => {
  await page.route("**/api/admin/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized", code: "unauthorized" }) }),
  );

  await page.goto("/admin/games");
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fgames/);
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();

  // Supabase Auth is an ordinary email + password form; no hosted identity provider redirect.
  const email = page.getByLabel("Email", { exact: true });
  const password = page.getByLabel("Password", { exact: true });
  await expect(email).toHaveAttribute("type", "email");
  await expect(email).toHaveAttribute("autocomplete", "username");
  await expect(password).toHaveAttribute("type", "password");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

  // The old Cloudflare Access redirect must be gone entirely.
  await expect(page.locator('a[href*="cdn-cgi/access"]')).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Cloudflare Access");

  // Reloading the login URL must not 404 either.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
});

test("admin: a rejected sign-in shows a friendly error and stays on the page", async ({ page }) => {
  await page.route("**/api/admin/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) }),
  );

  await page.goto("/admin/login");
  const email = page.getByLabel("Email", { exact: true });
  const password = page.getByLabel("Password", { exact: true });
  const submit = page.getByRole("button", { name: /sign in/i });

  // Without Supabase build config the form refuses to pretend: the button is disabled and
  // the page says why. With config, an invalid pair must produce a readable message.
  if (await submit.isDisabled()) {
    await expect(page.getByText(/no Supabase configuration/i)).toBeVisible();
    return;
  }

  await email.fill("nobody@example.com");
  await password.fill("definitely-not-the-password");
  await submit.click();
  await expect(page.getByRole("alert")).toContainText(/wrong email or password|sign-in failed|not an administrator/i);
  await expect(page).toHaveURL(/\/admin\/login/);
});
