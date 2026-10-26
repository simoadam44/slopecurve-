import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGame, fetchGames, seedFallbackEnabled } from "../src/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function notFound() {
  return Promise.resolve(new Response("{}", { status: 404 }));
}

describe("seed fallback", () => {
  it("is disabled outside the dev build", () => {
    expect(seedFallbackEnabled(false)).toBe(false);
    expect(seedFallbackEnabled(true)).toBe(true);
  });

  it("does not resurrect seed games when the API is missing them", async () => {
    vi.stubGlobal("fetch", vi.fn(notFound));
    await expect(fetchGame("snow-road", false)).resolves.toBeNull();
    await expect(fetchGames(false)).resolves.toEqual([]);
  });
});
