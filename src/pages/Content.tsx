import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchPosts } from "../lib/api";
import type { BlogPost } from "../lib/types";
import { SITE_URL, sanitizeRichText } from "../lib/seo";
import { articleJsonLd, breadcrumbJsonLd } from "../lib/schema";
import { isAbsoluteSocialImage } from "../lib/seoDoc";
import { legalPage, type LegalSlug } from "../lib/legal";
import { useDocumentMeta, useJsonLd, useSiteSettings } from "../components/Layout";
import { Breadcrumbs } from "../components/Bits";

export function Blog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  useEffect(() => {
    fetchPosts().then(setPosts);
  }, []);
  useDocumentMeta("Blog & Guides | SlopeCurve", "Gaming guides: how to play Snow Rider, Crossy Road tips, skiing and racing guides.");
  return (
    <div>
      <h1>Blog &amp; Guides</h1>
      <ul>
        {posts.map((p) => (
          <li key={p.id}>
            <Link to={`/blog/${p.slug}`}>{p.title}</Link>
            <p className="muted small">{p.excerpt}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BlogPostPage() {
  const { slug } = useParams();
  const settings = useSiteSettings();
  const [post, setPost] = useState<BlogPost | null | undefined>(undefined);
  useEffect(() => {
    fetchPosts().then((ps) => setPost(ps.find((p) => p.slug === slug) ?? null));
  }, [slug]);
  const seoTitle = post ? `${post.seo_title || post.title} | SlopeCurve` : "Blog | SlopeCurve";
  const description = post?.meta_description || post?.excerpt || "Guide.";
  const canonical = post ? post.canonical_url || `${SITE_URL}/blog/${post.slug}` : `${SITE_URL}/blog/${slug ?? ""}`;
  const image = post && isAbsoluteSocialImage(String(post.social_image || ""))
    ? String(post.social_image)
    : post && isAbsoluteSocialImage(String(post.cover_url || ""))
      ? String(post.cover_url)
      : null;
  const siteName = String(settings.site_name || "").trim();
  useDocumentMeta(seoTitle, description, post ? canonical : undefined, {
    ogType: "article",
    ogTitle: post?.og_title,
    ogDescription: post?.og_description,
  });
  useJsonLd(
    "post",
    post
      ? [
          articleJsonLd({
            headline: post.h1 || post.title,
            description,
            url: canonical,
            image,
            datePublished: post.published_at,
            dateModified: post.updated_at,
            author: post.author,
            publisher: siteName ? { name: siteName, url: `${SITE_URL.replace(/\/$/, "")}/` } : null,
          }),
          breadcrumbJsonLd([
            { name: "Home", url: `${SITE_URL.replace(/\/$/, "")}/` },
            { name: "Blog", url: `${SITE_URL.replace(/\/$/, "")}/blog` },
            { name: post.h1 || post.title, url: canonical },
          ]),
        ]
      : null,
  );
  if (post === undefined) return <p>Loading…</p>;
  if (post === null) return <div><h1>Article not found</h1><p><Link to="/blog">All articles</Link></p></div>;
  return (
    <article>
      <Breadcrumbs trail={[{ name: "Home", href: "/" }, { name: "Blog", href: "/blog" }, { name: post.title }]} />
      <h1>{post.title}</h1>
      <p className="muted small">{post.author ? `${post.author} • ` : ""}{post.published_at ?? ""}</p>
      <div dangerouslySetInnerHTML={{ __html: sanitizeRichText(post.content) }} />
    </article>
  );
}

const STATIC: Record<string, { title: string; body: string }> = {
  about: { title: "About SlopeCurve", body: "<p>SlopeCurve is a lightweight portal for free browser games: Snow Rider, Crossy Road, skiing, racing, arcade and endless runners.</p>" },
  faq: { title: "FAQ", body: "<h2>Do games need downloads?</h2><p>No, they run in the browser where allowed.</p><h2>Why is a game blocked?</h2><p>Providers may set X-Frame-Options/CSP. We show a safe external link instead.</p>" },
};

export function StaticPage({ key_: k }: { key_: string }) {
  const s = STATIC[k] ?? { title: "Page", body: "<p>Empty.</p>" };
  useDocumentMeta(`${s.title} | SlopeCurve`, s.title);
  return (
    <div>
      <h1>{s.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: sanitizeRichText(s.body) }} />
    </div>
  );
}

/** Privacy, Terms and Contact share one source of truth with the Worker SSR output. */
export function LegalPage({ page }: { page: LegalSlug }) {
  const settings = useSiteSettings();
  const content = legalPage(page, settings.contact_email);
  useDocumentMeta(content.title, content.description, `${SITE_URL}/${page}`);
  return (
    <article className="legal-page">
      <h1>{content.h1}</h1>
      <div dangerouslySetInnerHTML={{ __html: sanitizeRichText(content.bodyHtml) }} />
    </article>
  );
}
