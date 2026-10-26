/**
 * Extra guard for hotlinked game artwork (thumbnail_url / icon_url).
 *
 * Providers such as azgames.io serve these images with long-lived caching
 * (`Cache-Control: public, max-age=86400`, up to a month on other hosts), and
 * they occasionally answer with a transient error. A browser then keeps the
 * failed response and the tile is stuck on the placeholder for the whole TTL.
 *
 * Retrying once with a distinct query string asks for the same picture with a
 * different cache key, so one bad response can no longer win for a day.
 */

export const IMAGE_RETRY_PARAM = "retry";

/** URL for the single retry attempt, or null when a retry makes no sense. */
export function retryImageUrl(src: string, token: string): string | null {
  const raw = String(src || "").trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.searchParams.has(IMAGE_RETRY_PARAM)) return null;
  url.searchParams.set(IMAGE_RETRY_PARAM, String(token || "1"));
  return url.toString();
}
