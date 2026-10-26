import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchGames, fetchLanding } from "../lib/api";
import type { Game, LandingWithGame } from "../lib/types";
import { GamePlayer } from "../components/GamePlayer";
import { AdSlot, Breadcrumbs, RailGames } from "../components/Bits";
import { useDocumentMeta, useJsonLd } from "../components/Layout";
import { SITE_URL, sanitizeRichText } from "../lib/seo";
import { breadcrumbJsonLd, videoGameJsonLd } from "../lib/schema";
import { faqJsonLd, isAbsoluteSocialImage } from "../lib/seoDoc";
import { landingToolLabel, normalizeLandingTool } from "../lib/landingTools";
import { useHomeGameSlug } from "../lib/homeClient";

export function LandingPage() {
  const { slug } = useParams();
  const homeSlug = useHomeGameSlug();
  const [data, setData] = useState<LandingWithGame | null | undefined>(undefined);
  const [rail, setRail] = useState<Game[]>([]);
  const [theater, setTheater] = useState(false);

  useEffect(() => {
    if (!slug) {
      setData(null);
      return;
    }
    let alive = true;
    fetchLanding(slug).then((lp) => {
      if (!alive) return;
      setData(lp);
      if (lp) {
        fetchGames().then((all) => {
          if (!alive) return;
          setRail(all.filter((g) => g.slug !== lp.game.slug));
        });
      }
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  const landing = data ?? null;
  const game = landing?.game ?? null;
  const h1 = landing ? landing.h1 || landing.title : "";
  const subtitle = landing?.subtitle?.trim() || "";
  const tool = normalizeLandingTool(landing?.tool_type);
  const canonical = landing ? landing.canonical_url || `${SITE_URL}/${landing.slug}` : undefined;
  const meta = landing
    ? {
        title: landing.title,
        description: landing.meta_description || subtitle || landing.intro.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160),
      }
    : { title: "Loading… | SlopeCurve", description: "Loading page…" };
  const gameHref = landing && game ? (homeSlug && game.slug === homeSlug ? "/" : `/games/${game.slug}`) : "";
  const faq = landing ? faqJsonLd(landing.faqs || "") : null;
  const siteOrigin = SITE_URL.replace(/\/$/, "");
  const gameUrl = game && homeSlug && game.slug === homeSlug ? `${siteOrigin}/` : game ? `${siteOrigin}/games/${game.slug}` : "";
  useDocumentMeta(meta.title, meta.description, canonical, {
    ogType: "website",
    ogTitle: landing?.og_title,
    ogDescription: landing?.og_description,
  });
  // Single replaceable JSON-LD block matching the SSR copy (VideoGame + BreadcrumbList + FAQPage).
  useJsonLd(
    "landing",
    landing && game
      ? [
          videoGameJsonLd({
            name: game.title,
            url: canonical ?? "",
            description: meta.description,
            image: isAbsoluteSocialImage(String(game.thumbnail_url || "")) ? String(game.thumbnail_url) : null,
          }),
          breadcrumbJsonLd([
            { name: "Home", url: `${siteOrigin}/` },
            { name: "Games", url: `${siteOrigin}/games` },
            { name: game.title, url: gameUrl },
            { name: h1, url: canonical ?? `${siteOrigin}/${landing.slug}` },
          ]),
          ...(faq ? [faq] : []),
        ]
      : null,
  );

  if (data === undefined) return <p>Loading…</p>;
  if (!landing || !game) {
    return (
      <div>
        <h1>Page not found</h1>
        <p className="muted">This page does not exist or is not published. <Link to="/games">Browse all games</Link>.</p>
      </div>
    );
  }

  return (
    <article>
      <div className={theater ? "game-layout theater" : "game-layout"}>
        <div style={{ minWidth: 0 }}>
          <GamePlayer
            url={game.game_url}
            title={game.title}
            allowFullscreen={game.allow_fullscreen === 1}
            theater={theater}
            onToggleTheater={() => setTheater((t) => !t)}
          />

          <div className="player-meta">
            <div className="player-title">
              <h1>{h1}</h1>
              {subtitle ? <p className="game-subtitle">{subtitle}</p> : null}
            </div>
            {landing.badge ? <span className="tag-chip">{landing.badge}</span> : null}
            {tool !== "game" ? <span className="tag-chip">{landingToolLabel(tool)}</span> : null}
            <Link to={gameHref} className="tag-chip">
              Play {game.title}
            </Link>
          </div>

          <div className="game-panel">
            <Breadcrumbs
              trail={[
                { name: "Home", href: "/" },
                { name: "Games", href: "/games" },
                { name: game.title, href: gameHref },
                { name: h1 },
              ]}
            />

            {landing.intro ? <div dangerouslySetInnerHTML={{ __html: sanitizeRichText(landing.intro) }} /> : null}
            {landing.sections ? (
              <div className="defer-paint" dangerouslySetInnerHTML={{ __html: sanitizeRichText(landing.sections) }} />
            ) : null}
            {landing.faqs ? (
              <div className="defer-paint" dangerouslySetInnerHTML={{ __html: sanitizeRichText(landing.faqs) }} />
            ) : null}

            <p style={{ marginBottom: 0 }}>
              <Link to={gameHref} className="btn">
                Play {game.title} — full game page
              </Link>
            </p>
          </div>

          <AdSlot slot="landing-below-player" />
        </div>

        <aside className="rail" aria-label="More games">
          <p className="muted small rail-label">ADVERTISEMENT</p>
          <AdSlot slot="landing-sidebar-right" placement="sidebar" />
          <RailGames games={rail} />
        </aside>
      </div>
    </article>
  );
}
