-- Up Migration

CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  record_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_records_user_created ON records (user_id, created_at);

-- Down Migration

DROP TABLE records;
