import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchCategories, fetchGames } from "../lib/api";
import type { Category, Game } from "../lib/types";
import { GameGrid, Breadcrumbs } from "../components/Bits";
import { useDocumentMeta } from "../components/Layout";

export function Categories() {
  const [cats, setCats] = useState<Category[]>([]);
  useEffect(() => {
    fetchCategories().then(setCats);
  }, []);
  useDocumentMeta("Game Categories | SlopeCurve", "Browse Snow Rider, Crossy Road, skiing, racing, arcade and endless runner categories.");
  return (
    <div>
      <h1>Categories</h1>
      <ul>
        {cats.filter((c) => c.status === "published").map((c) => (
          <li key={c.id}>
            <Link to={`/categories/${c.slug}`}>{c.name}</Link> — {c.description}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CategoryDetail() {
  const { slug } = useParams();
  const [cat, setCat] = useState<Category | null | undefined>(undefined);
  const [games, setGames] = useState<Game[]>([]);
  useEffect(() => {
    fetchCategories().then((cs) => setCat(cs.find((c) => c.slug === slug && c.status === "published") ?? null));
    fetchGames().then(setGames);
  }, [slug]);
  useDocumentMeta(
    cat ? `${cat.seo_title || cat.name} | SlopeCurve` : "Category | SlopeCurve",
    cat?.meta_description || cat?.description || "Game category.",
  );
  if (cat === undefined) return <p>Loading…</p>;
  if (cat === null) return <div><h1>Category not found</h1><p className="muted"><Link to="/categories">All categories</Link></p></div>;
  const list = games.filter((g) => g.category_slug === cat.slug);
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Home", href: "/" }, { name: "Categories", href: "/categories" }, { name: cat.name }]} />
      <h1>{cat.name}</h1>
      <p className="muted">{cat.description}</p>
      <GameGrid games={list} />
    </div>
  );
}
