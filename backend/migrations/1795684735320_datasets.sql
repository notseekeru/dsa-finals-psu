-- Up Migration

CREATE TABLE IF NOT EXISTS datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_datasets_user_created ON datasets (user_id, created_at);

ALTER TABLE records ADD COLUMN IF NOT EXISTS dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE;

ALTER TABLE records ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;

WITH owners AS (
  SELECT DISTINCT user_id FROM records
), created AS (
  INSERT INTO datasets (user_id, name, columns)
  SELECT user_id, 'Earlier records', '["recordId", "name", "category", "status", "amount", "date"]'::jsonb FROM owners
  RETURNING id, user_id
)
UPDATE records SET dataset_id = created.id
FROM created
WHERE records.user_id = created.user_id;

ALTER TABLE records ALTER COLUMN dataset_id SET NOT NULL;

-- Down Migration

ALTER TABLE records DROP COLUMN IF EXISTS data;

ALTER TABLE records DROP COLUMN IF EXISTS dataset_id;

DROP TABLE IF EXISTS datasets;
