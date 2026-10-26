import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../src/lib/rateLimit";

describe("rate limiter", () => {
  it("blocks beyond the window allowance", () => {
    let now = 0;
    const limit = createRateLimiter(10, () => now);
    expect(limit.check("ip", 2, 1000)).toBe(true);
    expect(limit.check("ip", 2, 1000)).toBe(true);
    expect(limit.check("ip", 2, 1000)).toBe(false);
    now = 1001;
    expect(limit.check("ip", 2, 1000)).toBe(true);
  });

  it("bounds tracked keys by evicting the oldest", () => {
    const limit = createRateLimiter(2, () => 0);
    limit.check("a", 5, 1000);
    limit.check("b", 5, 1000);
    limit.check("c", 5, 1000);
    expect(limit.size()).toBeLessThanOrEqual(2);
    expect(limit.check("a", 1, 1000)).toBe(true);
  });
});
