import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchGames, fetchCategories } from "../lib/api";
import type { Game, Category } from "../lib/types";
import { GameGrid, AdSlot } from "../components/Bits";
import { useDocumentMeta } from "../components/Layout";
import { getHomeGameSlug } from "../lib/homeClient";
import { GameDetail } from "./GameDetail";

/**
 * "/" — render the configured homepage game at the root URL (Admin → General → home_game_slug).
 * Falls back to the games listing when no game is configured or the game is not published.
 */
export function HomeRoute() {
  const [slug, setSlug] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const target = await getHomeGameSlug();
        if (!target) { if (alive) setSlug(null); return; }
        const g = await fetch(`/api/games/${encodeURIComponent(target)}`);
        if (alive) setSlug(g.ok ? target : null);
      } catch {
        if (alive) setSlug(null);
      }
    })();
    return () => { alive = false; };
  }, []);
  if (slug === undefined) return <p className="muted">Loading…</p>;
  return slug ? <GameDetail slugOverride={slug} /> : <Home />;
}

export function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  useDocumentMeta(
    "SlopeCurve — Play Free Online Games",
    "Play free online games: Snow Rider, Crossy Road, skiing, racing, arcade and endless runner games. No downloads.",
    "https://slopecurve.com/",
  );
  useEffect(() => {
    fetchGames().then(setGames);
    fetchCategories().then(setCats);
  }, []);

  const featured = games.filter((g) => g.is_featured).slice(0, 12);
  const fresh = [...games].sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? "")).slice(0, 12);
  const hot = games.filter((g) => g.is_hot).slice(0, 12);
  const snow = games.filter((g) => ["snow-rider", "skiing-games"].includes(g.category_slug)).slice(0, 12);
  const crossy = games.filter((g) => g.category_slug === "crossy-road").slice(0, 12);
  const racing = games.filter((g) => g.category_slug === "racing-games").slice(0, 12);

  return (
    <div>
      <h1>Play Free Online Games</h1>
      <p className="muted">Snow Rider, Crossy Road, skiing, racing, arcade and endless runner games. No downloads — play in your browser.</p>

      <h2>Featured Games</h2>
      <GameGrid games={featured} />
      <AdSlot slot="home-1" />

      <h2>New Games</h2>
      <GameGrid games={fresh} />
      <p><Link to="/new-games">View all new games →</Link></p>

      <h2>Hot Games (Editorial picks)</h2>
      <GameGrid games={hot} />
      <p><Link to="/hot-games">View hot games →</Link></p>

      <h2>Snow Rider &amp; Skiing</h2>
      <GameGrid games={snow} />

      <h2>Crossy Road</h2>
      <GameGrid games={crossy} />

      <h2>Racing Games</h2>
      <GameGrid games={racing} />

      <h2>Categories</h2>
      <ul>
        {cats.map((c) => (
          <li key={c.id}><Link to={`/categories/${c.slug}`}>{c.name}</Link> — {c.description}</li>
        ))}
      </ul>

      <h2>About SlopeCurve</h2>
      <p>SlopeCurve is a lightweight browser gaming portal. Games are added by administrators through the dashboard using an external game URL and image URL — no source edits or redeploys needed. Labels like New and Hot are editorial, not measured popularity.</p>

      <h2>Frequently Asked Questions</h2>
      <h3>Do I need to download anything?</h3>
      <p>No. Games run in your browser where the provider allows embedding.</p>
      <h3>Why does a game show an external link instead of a player?</h3>
      <p>Some providers block embedding via X-Frame-Options or CSP. We show an honest fallback with a safe external link.</p>
    </div>
  );
}
