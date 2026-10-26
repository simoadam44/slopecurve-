-- SlopeCurve D1 schema v3: AI writer (Gemini free tier) keyring + audit log
-- Additive and data-preserving. Keys are stored AES-GCM encrypted (never plaintext).
PRAGMA foreign_keys = ON;

-- Gemini API keys. key_enc = base64(iv) + ':' + base64(ciphertext). key_hint is a masked label for the UI.
CREATE TABLE IF NOT EXISTS ai_api_keys (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  key_enc TEXT NOT NULL,
  key_hint TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  active INTEGER NOT NULL DEFAULT 1,
  requests_today INTEGER NOT NULL DEFAULT 0,
  quota_day TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_keys_active ON ai_api_keys(active);

-- Audit + usage log for every generation (also powers the "already targeted" cannibalization checks).
CREATE TABLE IF NOT EXISTS ai_generation_log (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'game',
  target_id TEXT,
  model TEXT NOT NULL DEFAULT '',
  keyword TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_log_kind ON ai_generation_log(kind, created_at);
