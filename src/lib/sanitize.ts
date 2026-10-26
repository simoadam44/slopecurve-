import { escapeAttrValue, filterXSS, type IFilterXSSOptions } from "xss";

const ALLOWED_TAGS: Record<string, string[]> = {
  h2: [],
  h3: [],
  p: [],
  b: [],
  strong: [],
  i: [],
  em: [],
  ul: [],
  ol: [],
  li: [],
  a: ["href", "title"],
  br: [],
  img: ["src", "alt", "width", "height", "loading"],
};

const BLOCKED_BODY = ["script", "style", "iframe", "object", "embed", "form", "svg", "math", "template", "noscript"];

function cleanUrl(value: string): string {
  const v = value.trim();
  if (!v || /[\u0000-\u001f\u007f\\]/.test(v)) return "";
  return v;
}

const MAILTO_HREF = /^mailto:[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/;

function safeHref(value: string): string {
  const v = cleanUrl(value);
  if (!v) return "";
  if (v.startsWith("//") || v.startsWith("/\\")) return "";
  if (MAILTO_HREF.test(v)) return v;
  if (/^https?:\/\//i.test(v)) return v;
  if (v === "/" || (v.startsWith("/") && !v.startsWith("//"))) return v;
  if (v.startsWith("#")) return v;
  return "";
}

function safeSrc(value: string): string {
  const v = cleanUrl(value);
  if (!v) return "";
  return /^https:\/\//i.test(v) ? v : "";
}

const SAFE_ATTRS: Record<string, (value: string) => string> = {
  href: safeHref,
  src: safeSrc,
  alt: (v) => v.slice(0, 300),
  title: (v) => v.slice(0, 300),
  width: (v) => (/^\d{1,4}$/.test(v) ? v : ""),
  height: (v) => (/^\d{1,4}$/.test(v) ? v : ""),
  loading: (v) => (v === "lazy" || v === "eager" ? v : "lazy"),
};

const OPTIONS: IFilterXSSOptions = {
  allowList: ALLOWED_TAGS,
  stripIgnoreTag: true,
  stripIgnoreTagBody: BLOCKED_BODY,
  allowCommentTag: false,
  safeAttrValue: (_tag, name, value) => SAFE_ATTRS[name]?.(value) ?? "",
  onTagAttr: (_tag, name, value, isWhiteAttr) => {
    if (!isWhiteAttr) return "";
    const clean = SAFE_ATTRS[name]?.(value);
    if (!clean) return "";
    const rel = name === "href" && /^https?:\/\//i.test(clean) ? ' rel="nofollow noopener noreferrer"' : "";
    return `${name}="${escapeAttrValue(clean)}"${rel}`;
  },
};

/** Server/client-safe rich text sanitizer with a single restrictive allowlist. */
export function sanitizeRichText(html: string): string {
  return filterXSS(String(html || ""), OPTIONS);
}
