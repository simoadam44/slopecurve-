import { test, expect } from "@playwright/test";

const PAGES = [
  { path: "/privacy-policy", title: "Privacy Policy | SlopeCurve", h1: "Privacy Policy", heading: "Introduction and scope" },
  { path: "/terms-of-use", title: "Terms of Use | SlopeCurve", h1: "Terms of Use", heading: "Acceptance of these Terms" },
  { path: "/contact", title: "Contact Us | SlopeCurve", h1: "Contact Us", heading: "General questions and feedback" },
];

test("legal: pages render with metadata, footer links and direct refresh", async ({ page }) => {
  for (const p of PAGES) {
    await page.goto(p.path);
    await expect(page).toHaveTitle(p.title);
    await expect(page.locator("h1")).toHaveText(p.h1);
    await expect(page.getByRole("heading", { name: p.heading })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://slopecurve.com${p.path}`);
    const robots = await page.locator('meta[name="robots"]').count();
    expect(robots).toBe(0);

    await page.reload();
    await expect(page.locator("h1")).toHaveText(p.h1);
  }

  const legalNav = page.getByRole("navigation", { name: "Legal" });
  await expect(legalNav).toBeVisible();
  await expect(legalNav.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy-policy");
  await expect(legalNav.getByRole("link", { name: "Terms of Use" })).toHaveAttribute("href", "/terms-of-use");
  await expect(legalNav.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");

  await page.goto("/");
  await page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Contact" }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.locator("h1")).toHaveText("Contact Us");
});

test("legal: legacy URLs redirect to the canonical pages", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page).toHaveURL(/\/privacy-policy$/);
  await expect(page.locator("h1")).toHaveText("Privacy Policy");

  await page.goto("/terms");
  await expect(page).toHaveURL(/\/terms-of-use$/);
  await expect(page.locator("h1")).toHaveText("Terms of Use");
});
