-- SlopeCurve D1 schema v6: landing tool fields
-- Additive. Subtitle is a short deck under the H1; tool_type classifies the page.
ALTER TABLE landing_pages ADD COLUMN subtitle TEXT NOT NULL DEFAULT '';
ALTER TABLE landing_pages ADD COLUMN tool_type TEXT NOT NULL DEFAULT 'game';
