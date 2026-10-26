// Worker-safe schema.org builders. Only emit fields backed by stored/configured data.
import { toIsoDate } from "./dates";

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export interface VideoGameInput {
  name: string;
  url: string;
  description?: string | null;
  image?: string | null;
}

export function videoGameJsonLd(input: VideoGameInput): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: input.name,
    url: input.url,
    applicationCategory: "Game",
    operatingSystem: "Web Browser",
  };
  if (input.description && String(input.description).trim()) ld.description = String(input.description).trim();
  if (input.image && String(input.image).trim()) ld.image = String(input.image).trim();
  return ld;
}

export interface ArticleInput {
  headline: string;
  description?: string | null;
  url: string;
  image?: string | null;
  datePublished?: unknown;
  dateModified?: unknown;
  author?: string | null;
  publisher?: { name: string; url: string } | null;
}

/** Article JSON-LD using only real timestamps/identity; unusable values are omitted. */
export function articleJsonLd(input: ArticleInput): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.headline,
    url: input.url,
    mainEntityOfPage: input.url,
  };
  const description = String(input.description ?? "").trim();
  if (description) ld.description = description;
  const image = String(input.image ?? "").trim();
  if (image) ld.image = [image];
  const published = toIsoDate(input.datePublished);
  if (published) ld.datePublished = published;
  const modified = toIsoDate(input.dateModified);
  if (modified) ld.dateModified = modified;
  const author = String(input.author ?? "").trim();
  if (author) ld.author = { "@type": "Person", name: author };
  if (input.publisher?.name && input.publisher.url) {
    ld.publisher = { "@type": "Organization", name: input.publisher.name, url: input.publisher.url };
  }
  return ld;
}

export interface WebsiteInput {
  name: string;
  url: string;
  /** Only pass a URL template when a real, working search page exists. */
  searchUrl?: string | null;
}

export function websiteJsonLd(input: WebsiteInput): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: input.name,
    url: input.url,
  };
  if (input.searchUrl) {
    ld.potentialAction = {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: input.searchUrl },
      "query-input": "required name=search_term_string",
    };
  }
  return ld;
}

/** Organization node for configured site identity (name + URL); null when unconfigured. */
export function organizationJsonLd(input: { name?: string | null; url?: string | null; logo?: string | null }): Record<string, unknown> | null {
  const name = String(input.name ?? "").trim();
  const url = String(input.url ?? "").trim();
  if (!name || !url) return null;
  const ld: Record<string, unknown> = { "@context": "https://schema.org", "@type": "Organization", name, url };
  const logo = String(input.logo ?? "").trim();
  if (logo) ld.logo = logo;
  return ld;
}
