interface RateLimiter {
  check(key: string, max: number, windowMs: number): boolean;
  size(): number;
}

/**
 * Per-isolate rate limiter with a hard cap on tracked keys so hostile traffic
 * cannot grow the map without bound. Production abuse control still belongs at
 * the Cloudflare edge; this is a cheap in-process backstop.
 */
export function createRateLimiter(maxKeys = 2000, clock: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    check(key, max, windowMs) {
      const now = clock();
      const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
      arr.push(now);
      hits.set(key, arr);
      while (hits.size > maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest === undefined || oldest === key) break;
        hits.delete(oldest);
      }
      return arr.length <= max;
    },
    size() {
      return hits.size;
    },
  };
}
