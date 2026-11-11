-- Contract Review Wise: clients (access codes) and per-review usage log.
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,      -- SHA-256 of the access code; the code itself is never stored
  code_hint TEXT,                      -- last 4 characters, to recognise a code
  monthly_reviews INTEGER,             -- NULL = unlimited
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,                    -- ISO 8601 UTC
  client_id INTEGER NOT NULL REFERENCES clients(id),
  model TEXT,
  side TEXT,
  playbook_id TEXT,
  doc_name TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL,                       -- estimated from list prices in src/pricing.js
  status TEXT NOT NULL,                -- ok | error
  error TEXT,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS usage_client_ts ON usage (client_id, ts);
CREATE INDEX IF NOT EXISTS usage_ts ON usage (ts);
