-- SlopeCurve D1 schema v4: long-tail guides engine fields for blog posts
-- Additive. Preserves existing rows (NULL = not set).
PRAGMA foreign_keys = ON;

ALTER TABLE blog_posts ADD COLUMN h1 TEXT;
ALTER TABLE blog_posts ADD COLUMN language TEXT;
ALTER TABLE blog_posts ADD COLUMN intent TEXT;
ALTER TABLE blog_posts ADD COLUMN related_tool TEXT;
