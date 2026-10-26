import type { SyntheticEvent } from "react";
import { Link } from "react-router-dom";
import type { Game } from "../lib/types";
import { FALLBACK_IMG } from "../data/seed";
import { retryImageUrl } from "../lib/imageFallback";

/**
 * Hotlinked artwork can fail transiently. Retry once with a fresh cache key
 * before giving up, then show the local placeholder so a tile is never empty.
 */
export function onGameImageError(e: SyntheticEvent<HTMLImageElement>): void {
  const img = e.currentTarget;
  if (img.dataset.retried !== "1") {
    const retried = retryImageUrl(img.getAttribute("src") || "", Date.now().toString(36));
    if (retried) {
      img.dataset.retried = "1";
      img.src = retried;
      return;
    }
  }
  if (img.src !== location.origin + FALLBACK_IMG) img.src = FALLBACK_IMG;
}

export function GameCard({ game }: { game: Game }) {
  return (
    <Link to={`/games/${game.slug}`} className="card game-card" style={{ padding: 8, display: "block", position: "relative" }} aria-label={`Play ${game.title}`}>
      {game.is_hot === 1 ? <span className="badge badge-hot" style={{ position: "absolute", top: 12, right: 12, zIndex: 1 }}>Hot</span> : null}
      <img
        src={game.thumbnail_url}
        alt={`${game.title} thumbnail`}
        loading="lazy"
        decoding="async"
        width={300}
        height={300}
        onError={onGameImageError}
      />
      <p style={{ margin: "8px 2px 2px", color: "#fff", fontSize: 14, fontWeight: 600 }}>{game.title}</p>
      <p className="muted small" style={{ margin: "0 2px 4px" }}>{game.category_name ?? game.category_slug}</p>
    </Link>
  );
}

export function GameGrid({ games }: { games: Game[] }) {
  if (!games.length) return <p className="muted">No games found. Try another search or category.</p>;
  return (
    <div className="grid-games">
      {games.map((g) => (
        <GameCard key={g.id} game={g} />
      ))}
    </div>
  );
}

export function AdSlot({ slot, placement }: { slot: string; placement?: string }) {
  // Disabled by default. Renders nothing unless env enabled AND admin configured active units.
  // Public pages only — never render inside /admin (Admin layout does not include AdSlot).
  if (import.meta.env?.VITE_ADS_ENABLED !== "true") return null;
  return <div className="card" data-ad-slot={slot} data-placement={placement ?? slot} style={{ padding: 12, margin: "16px 0" }} aria-hidden="true"><p className="muted small">Advertisement placeholder — real ad loads only with owner AdSense IDs.</p></div>;
}

/** A game counts as "New" if flagged or published in the last 30 days (real data only). */
function isRecent(game: Game): boolean {
  if (game.is_new === 1) return true;
  const ts = game.published_at ? Date.parse(game.published_at) : NaN;
  return Number.isFinite(ts) && Date.now() - ts < 30 * 24 * 60 * 60 * 1000;
}

/**
 * Editorial status badges driven only by real data (hot/new/featured flags and publish date).
 * Deliberately shows no ratings, likes or play counts — those would be invented numbers.
 */
export function FlagBadges({ game }: { game: Game }) {
  const badges: { label: string; className: string }[] = [];
  if (game.is_hot === 1) badges.push({ label: "Hot", className: "badge badge-hot" });
  if (isRecent(game)) badges.push({ label: "New", className: "badge badge-new" });
  if (game.is_featured === 1) badges.push({ label: "Featured", className: "badge badge-featured" });
  if (!badges.length) return null;
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {badges.map((b) => (
        <span key={b.label} className={b.className}>{b.label}</span>
      ))}
    </span>
  );
}

/** Dense 3-column thumbnail rail. No ratings/counts; the yellow tag is the real Hot flag. */
export function RailGames({ games, limit = 30, label = "More games" }: { games: Game[]; limit?: number; label?: string }) {
  const list = games.slice(0, limit);
  if (!list.length) return null;
  return (
    <section aria-label={label} style={{ marginTop: 12 }}>
      <div className="rail-grid">
        {list.map((g) => (
          <Link
            key={g.id}
            to={`/games/${g.slug}`}
            className="card rail-tile"
            style={{ padding: 4, display: "block", position: "relative" }}
            aria-label={`Play ${g.title}`}
          >
            {g.is_hot === 1 ? <span className="badge badge-hot" style={{ position: "absolute", top: 8, right: 8, zIndex: 1 }}>Hot</span> : null}
            <img
              src={g.thumbnail_url}
              alt={`${g.title} thumbnail`}
              loading="lazy"
              decoding="async"
              width={120}
              height={120}
              style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 8, background: "#111", display: "block" }}
              onError={onGameImageError}
            />
            <p style={{ margin: "4px 2px", color: "#fff", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.title}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function Breadcrumbs({ trail }: { trail: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="small muted" style={{ margin: "12px 0" }}>
      {trail.map((t, i) => (
        <span key={i}>
          {i > 0 && " › "}
          {t.href ? <Link to={t.href}>{t.name}</Link> : <span>{t.name}</span>}
        </span>
      ))}
    </nav>
  );
}
