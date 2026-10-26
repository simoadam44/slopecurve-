-- SlopeCurve D1 schema v2: admin CMS extensions (additive, preserves data)
PRAGMA foreign_keys = ON;

-- Games: extended SEO (only columns missing in v1)
ALTER TABLE games ADD COLUMN og_title TEXT;
ALTER TABLE games ADD COLUMN og_description TEXT;

-- Blog: extended metadata
ALTER TABLE blog_posts ADD COLUMN focus_keyword TEXT;
ALTER TABLE blog_posts ADD COLUMN related_keywords TEXT;
ALTER TABLE blog_posts ADD COLUMN canonical_url TEXT;
ALTER TABLE blog_posts ADD COLUMN social_image TEXT;
ALTER TABLE blog_posts ADD COLUMN og_title TEXT;
ALTER TABLE blog_posts ADD COLUMN og_description TEXT;
ALTER TABLE blog_posts ADD COLUMN tags TEXT;
ALTER TABLE blog_posts ADD COLUMN category TEXT;

-- Admin: per-user salt for PBKDF2 (nullable for backward compat)
ALTER TABLE admin_users ADD COLUMN salt TEXT;

-- AdSense units
CREATE TABLE IF NOT EXISTS ad_units (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  publisher_id TEXT NOT NULL DEFAULT '',
  slot_id TEXT NOT NULL DEFAULT '',
  placement TEXT NOT NULL DEFAULT 'below-game',
  format TEXT NOT NULL DEFAULT 'auto',
  active INTEGER NOT NULL DEFAULT 0,
  targeting TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
