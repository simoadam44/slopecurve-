import { useEffect, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { fetchGame, fetchGames } from "../lib/api";
import type { Game } from "../lib/types";
import { GamePlayer } from "../components/GamePlayer";
import { Comments } from "../components/Comments";
import { Breadcrumbs, AdSlot, RailGames, FlagBadges } from "../components/Bits";
import { useDocumentMeta, useJsonLd } from "../components/Layout";
import { buildGameMeta, sanitizeRichText, gameJsonLd, breadcrumbJsonLd, homeCanonical, SITE_URL } from "../lib/seo";
import { useHomeGameSlug } from "../lib/homeClient";

/**
 * `slugOverride` lets "/" render the homepage game without changing the URL.
 * "/games/<homeSlug>" redirects to "/" so the homepage game has a single canonical URL.
 */
export function GameDetail({ slugOverride }: { slugOverride?: string } = {}) {
  const params = useParams();
  const slug = slugOverride ?? params.slug;
  const homeSlug = useHomeGameSlug();
  const isHomeGame = Boolean(slug && homeSlug && slug === homeSlug);
  const [game, setGame] = useState<Game | null | undefined>(undefined);
  const [rail, setRail] = useState<Game[]>([]);
  const [theater, setTheater] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    fetchGame(slug).then((g) => {
      if (!alive) return;
      setGame(g);
      if (g) {
        fetchGames().then((all) => {
          if (!alive) return;
          // Rail order: same category first, then everything else. Editorial, not popularity.
          const others = all.filter((x) => x.slug !== g.slug);
          const sameCat = others.filter((x) => x.category_slug === g.category_slug);
          const rest = [...others.filter((x) => x.category_slug !== g.category_slug)].sort((a, b) =>
            (b.published_at ?? "").localeCompare(a.published_at ?? ""),
          );
          setRail(sameCat.concat(rest));
        });
      }
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  const meta = game ? buildGameMeta(game) : { title: "Loading… | SlopeCurve", description: "Loading game…", canonical: undefined as string | undefined };
  // Do not touch the canonical until the homepage slug is known (SSR already set the right one).
  const canonical = homeSlug === undefined ? undefined : isHomeGame ? homeCanonical() : meta.canonical;
  useDocumentMeta(meta.title, meta.description, canonical, {
    ogType: "website",
    ogTitle: game?.og_title,
    ogDescription: game?.og_description,
  });
  const ldUrl = canonical ?? meta.canonical ?? "";
  // One replaceable JSON-LD block (VideoGame + BreadcrumbList), tagged to match the SSR copy.
  useJsonLd(
    "game",
    game
      ? [
          { ...gameJsonLd(game), url: ldUrl || gameJsonLd(game).url },
          breadcrumbJsonLd([
            { name: "Home", url: homeCanonical() },
            { name: "Games", url: `${SITE_URL.replace(/\/$/, "")}/games` },
            { name: game.title, url: ldUrl },
          ]),
        ]
      : null,
  );

  // Direct SSR requests for the homepage game are 301'd to "/" by the worker; mirror that client-side.
  if (!slugOverride && isHomeGame) return <Navigate to="/" replace />;

  if (game === undefined) return <p>Loading…</p>;
  if (game === null)
    return (
      <div>
        <h1>Game not found</h1>
        <p className="muted">This game does not exist or is not published. <Link to="/games">Browse all games</Link>.</p>
      </div>
    );

  const categoryTag = game.category_name ?? game.category_slug;
  // related_keywords often repeat the category ("snow-rider"); de-duplicate so React keys stay unique.
  const seenTags = new Set<string>();
  const tags = [categoryTag, ...String(game.related_keywords ?? "").split(",").map((t) => t.trim())]
    .filter(Boolean)
    .filter((t) => {
      const key = t.toLowerCase();
      if (seenTags.has(key)) return false;
      seenTags.add(key);
      return true;
    });

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
            <h1>{game.title}</h1>
            <FlagBadges game={game} />
            {game.category_slug ? (
              <Link to={`/categories/${game.category_slug}`} className="tag-chip">
                {game.category_name ?? game.category_slug}
              </Link>
            ) : null}
          </div>

          <div className="game-panel">
            <Breadcrumbs trail={[{ name: "Home", href: "/" }, { name: "Games", href: "/games" }, { name: game.title }]} />

            <h2>About {game.title}</h2>
            <p>{game.short_description}</p>
            <div dangerouslySetInnerHTML={{ __html: sanitizeRichText(game.long_description) }} />

            {game.how_to_play ? (
              <>
                <h2>How to Play</h2>
                <p>{game.how_to_play}</p>
              </>
            ) : null}
            {game.controls ? (
              <>
                <h2>Game controls</h2>
                <p>{game.controls}</p>
              </>
            ) : null}
            {game.tips ? (
              <>
                <h2>Tips and Strategies</h2>
                <p>{game.tips}</p>
              </>
            ) : null}
            {game.faqs ? (
              <div className="defer-paint" dangerouslySetInnerHTML={{ __html: sanitizeRichText(game.faqs) }} />
            ) : null}

            {tags.length > 0 ? (
              <p style={{ marginTop: 16, marginBottom: 0 }}>
                {tags.map((t) =>
                  t === (game.category_name ?? game.category_slug) && game.category_slug ? (
                    <Link key={t} to={`/categories/${game.category_slug}`} className="tag-chip">
                      {t}
                    </Link>
                  ) : (
                    <span key={t} className="tag-chip">
                      {t}
                    </span>
                  ),
                )}
              </p>
            ) : null}
          </div>

          <AdSlot slot="game-below-player" />

          <div className="defer-paint">
            <Comments gameId={game.id} />
          </div>
        </div>

        <aside className="rail" aria-label="More games">
          <p className="muted small rail-label">ADVERTISEMENT</p>
          <AdSlot slot="game-sidebar-right" placement="sidebar" />
          <RailGames games={rail} />
        </aside>
      </div>
    </article>
  );
}