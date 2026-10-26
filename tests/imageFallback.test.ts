import { describe, expect, it } from "vitest";
import { IMAGE_RETRY_PARAM, retryImageUrl } from "../src/lib/imageFallback";

describe("hotlinked artwork retry", () => {
  it("adds a cache-busting retry parameter", () => {
    expect(retryImageUrl("https://azgames.io/upload/imgs/snowroad4-m180x180.png", "abc")).toBe(
      "https://azgames.io/upload/imgs/snowroad4-m180x180.png?retry=abc",
    );
  });

  it("keeps existing query parameters", () => {
    const out = retryImageUrl("https://cdn.example.com/a.png?size=180", "7");
    expect(out).toBe("https://cdn.example.com/a.png?size=180&retry=7");
  });

  it("retries only once per image", () => {
    const once = retryImageUrl("https://cdn.example.com/a.png", "1")!;
    expect(new URL(once).searchParams.has(IMAGE_RETRY_PARAM)).toBe(true);
    expect(retryImageUrl(once, "2")).toBeNull();
  });

  it("ignores values that are not remote HTTPS/HTTP URLs", () => {
    for (const value of ["", "   ", "/fallback.svg", "data:image/png;base64,AAA", "not a url", "javascript:alert(1)"]) {
      expect(retryImageUrl(value, "1"), value).toBeNull();
    }
  });

  it("uses a stable fallback token when none is supplied", () => {
    expect(retryImageUrl("https://cdn.example.com/a.webp", "")).toBe("https://cdn.example.com/a.webp?retry=1");
  });
});
