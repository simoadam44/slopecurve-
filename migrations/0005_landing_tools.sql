-- SlopeCurve D1 schema v5: Keywords & Landing Tools Engine
-- Additive. Each landing page targets one long-tail keyword and renders a linked game.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS landing_pages (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  badge TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL UNIQUE,
  focus_keyword TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'English',
  intent TEXT NOT NULL DEFAULT 'play/transactional',
  title TEXT NOT NULL,
  h1 TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  sections TEXT NOT NULL DEFAULT '',
  faqs TEXT NOT NULL DEFAULT '',
  related_keywords TEXT,
  canonical_url TEXT,
  og_title TEXT,
  og_description TEXT,
  social_image TEXT,
  noindex INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_landing_slug ON landing_pages(slug);
CREATE INDEX IF NOT EXISTS idx_landing_status ON landing_pages(status);
CREATE INDEX IF NOT EXISTS idx_landing_game ON landing_pages(game_id);
