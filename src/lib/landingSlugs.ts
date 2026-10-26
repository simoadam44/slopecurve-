// Root-level landing pages share the `/` namespace with real routes. These single
// segments are reserved so a landing page can never shadow an app route.
export const RESERVED_LANDING_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "assets",
  "games",
  "new-games",
  "hot-games",
  "categories",
  "blog",
  "about",
  "contact",
  "privacy",
  "privacy-policy",
  "terms",
  "terms-of-use",
  "faq",
  "login",
  "logout",
  "search",
  "404",
  "sitemap",
  "sitemap.xml",
  "robots",
  "robots.txt",
  "ads",
  "ads.txt",
  "favicon",
  "favicon.svg",
  "favicon.ico",
  "fallback",
  "fallback.svg",
]);

export function isReservedLandingSlug(slug: string): boolean {
  return RESERVED_LANDING_SLUGS.has(String(slug || "").toLowerCase());
}
