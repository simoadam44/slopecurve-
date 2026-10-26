import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchGames, searchGames } from "../lib/api";
import type { Game } from "../lib/types";
import { GameGrid } from "../components/Bits";
import { useDocumentMeta, useRobots } from "../components/Layout";

export function Games() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const [games, setGames] = useState<Game[]>([]);
  useEffect(() => {
    fetchGames().then(setGames);
  }, []);
  const list = q ? searchGames(q, games) : games;
  useDocumentMeta(
    q ? `Search: ${q} | SlopeCurve` : "All Games | SlopeCurve",
    q ? `Search results for ${q} on SlopeCurve.` : "Browse all published games on SlopeCurve.",
  );
  // Server HTML already carries this on direct loads; keep SPA navigation consistent.
  useRobots(q ? "noindex, follow" : "");
  return (
    <div>
      <h1>{q ? `Search results for “${q}”` : "All Games"}</h1>
      <GameGrid games={list} />
    </div>
  );
}

export function NewGames() {
  const [games, setGames] = useState<Game[]>([]);
  useEffect(() => {
    fetchGames().then(setGames);
  }, []);
  useDocumentMeta("New Games | SlopeCurve", "Recently added games on SlopeCurve, by publication date.");
  const list = [...games].sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? "")).slice(0, 48);
  return (
    <div>
      <h1>New Games</h1>
      <p className="muted">Sorted by publication date. Editorial list, not a popularity ranking.</p>
      <GameGrid games={list} />
    </div>
  );
}

export function HotGames() {
  const [games, setGames] = useState<Game[]>([]);
  useEffect(() => {
    fetchGames().then(setGames);
  }, []);
  useDocumentMeta("Hot Games | SlopeCurve", "Editorial hot picks on SlopeCurve. Manually flagged by editors.");
  return (
    <div>
      <h1>Hot Games</h1>
      <p className="muted">Editorial “Hot” flag set in Admin. Not a measured popularity claim.</p>
      <GameGrid games={games.filter((g) => g.is_hot)} />
    </div>
  );
}
