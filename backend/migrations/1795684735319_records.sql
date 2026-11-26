CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  record_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE records ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_records_category ON records (category);
CREATE INDEX IF NOT EXISTS idx_records_status ON records (status);
CREATE INDEX IF NOT EXISTS idx_records_archived ON records (archived);
CREATE INDEX IF NOT EXISTS idx_records_user_id ON records (user_id);