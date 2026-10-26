import { describe, expect, it } from "vitest";
import { ADMIN_LOGIN_PATH, adminLoginHref, currentAdminNext, safeAdminNext } from "../src/lib/adminRoute";

describe("admin sign-in redirects", () => {
  it("keeps same-site admin destinations", () => {
    expect(safeAdminNext("/admin")).toBe("/admin");
    expect(safeAdminNext("/admin/games/new")).toBe("/admin/games/new");
    expect(safeAdminNext("/admin/landing?x=1")).toBe("/admin/landing?x=1");
    expect(safeAdminNext("/admin?tab=2")).toBe("/admin?tab=2");
  });

  it("rejects external or malformed destinations (no open redirect)", () => {
    const bad = [
      "https://evil.example/admin",
      "//evil.example/admin",
      "/\\evil.example/admin",
      "/games",
      "/admin2",
      "javascript:alert(1)",
      "",
      "   ",
      undefined,
      null,
    ];
    for (const value of bad) expect(safeAdminNext(value), String(value)).toBe("/admin");
  });

  it("never bounces back to the login page itself", () => {
    expect(safeAdminNext("/admin/login")).toBe("/admin");
    expect(safeAdminNext("/admin/login?next=/admin/games")).toBe("/admin");
  });

  it("builds the login URL with an encoded target", () => {
    expect(adminLoginHref("/admin/games?sort=new")).toBe(`${ADMIN_LOGIN_PATH}?next=%2Fadmin%2Fgames%3Fsort%3Dnew`);
    expect(adminLoginHref("/admin")).toBe(ADMIN_LOGIN_PATH);
    expect(adminLoginHref("https://evil.example")).toBe(ADMIN_LOGIN_PATH);
    expect(adminLoginHref(undefined)).toBe(ADMIN_LOGIN_PATH);
  });

  it("derives the target from the current location", () => {
    expect(currentAdminNext("/admin/blog", "?page=2")).toBe("/admin/blog?page=2");
    expect(currentAdminNext("/admin", "")).toBe("/admin");
    expect(currentAdminNext("/games", "")).toBe("/admin");
  });

  it("exposes the public login path used by the routes", () => {
    expect(ADMIN_LOGIN_PATH).toBe("/admin/login");
  });
});
