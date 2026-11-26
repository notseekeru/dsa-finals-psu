import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { pool } from '../../shared/db.js';
import { findUserByToken, sessionToken } from '../auth/session.js';
import type {
  BusinessRecord,
  SearchAlgorithm,
  SortDirection,
  SortField,
} from './dataTypes.js';
import {
  binarySearchExactRecord,
  insertionSortRecords,
  linearSearchRecords,
} from './dsa.js';

interface RecordRow {
  id: string;
  record_id: string;
  name: string;
  category: string;
  status: string;
  amount: string | number;
  date: string;
  archived: boolean;
}

function toRecordDto(row: RecordRow): BusinessRecord {
  return {
    id: String(row.id),
    recordId: row.record_id,
    name: row.name,
    category: row.category,
    status: row.status,
    amount: Number(row.amount) || 0,
    date: row.date,
    archived: Boolean(row.archived),
  };
}

let schemaReady: Promise<void> | undefined;

function ensureSchema() {
  if (!schemaReady) {
    schemaReady = pool
      .query(`
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
        CREATE INDEX IF NOT EXISTS idx_records_user_id ON records (user_id);
        CREATE INDEX IF NOT EXISTS idx_records_category ON records (category);
        CREATE INDEX IF NOT EXISTS idx_records_status ON records (status);
        CREATE INDEX IF NOT EXISTS idx_records_archived ON records (archived);
      `)
      .then(() => undefined)
      .catch((error) => {
        schemaReady = undefined;
        throw error;
      });
  }
  return schemaReady;
}

async function fetchAllRecords(userId: string): Promise<BusinessRecord[]> {
  await ensureSchema();
  const { rows } = await pool.query<RecordRow>(
    'SELECT id, record_id, name, category, status, amount, date, archived FROM records WHERE user_id = $1 ORDER BY created_at ASC',
    [userId]
  );
  return rows.map(toRecordDto);
}

type RecordEnv = { Variables: { userId: string } };

export const records = new Hono<RecordEnv>();

records.use('*', async (c, next) => {
  const token = sessionToken(c);
  const user = token ? await findUserByToken(token) : null;
  if (!user) return c.json({ error: 'Not signed in' }, 401);
  c.set('userId', user.id);
  await ensureSchema();
  await next();
});

records.get('/', async (c) => {
  const sortField = (c.req.query('sortField') as SortField) || 'name';
  const sortDir = (c.req.query('sortDir') as SortDirection) || 'asc';
  const all = await fetchAllRecords(c.get('userId'));
  const { items, metrics } = insertionSortRecords(all, sortField, sortDir);
  return c.json({ records: items, metrics });
});

records.post('/', async (c) => {
  const body = await c.req.json<Partial<BusinessRecord>>();
  const userId = c.get('userId');
  const existing = await fetchAllRecords(userId);

  const newRecord: BusinessRecord = {
    id: body.id || randomUUID(),
    recordId: String(body.recordId || `REC-${existing.length + 101}`).trim(),
    name: String(body.name || 'Untitled Record').trim(),
    category: body.category || 'Customer',
    status: body.status || 'Active',
    amount: Number(body.amount) || 0,
    date: body.date || new Date().toISOString().slice(0, 10),
    archived: Boolean(body.archived),
  };

  const inserted = await pool.query(
    `INSERT INTO records (id, record_id, name, category, status, amount, date, archived, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      newRecord.id,
      newRecord.recordId,
      newRecord.name,
      newRecord.category,
      newRecord.status,
      newRecord.amount,
      newRecord.date,
      newRecord.archived,
      userId,
    ]
  );

  if (inserted.rowCount === 0) {
    return c.json({ error: 'Record ID already exists' }, 409);
  }

  const updatedAll = await fetchAllRecords(userId);
  const { items, metrics } = insertionSortRecords(updatedAll, 'name', 'asc');
  return c.json({ record: newRecord, records: items, metrics }, 201);
});

records.put('/:id', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const { rows: existingRows } = await pool.query<RecordRow>(
    'SELECT id, record_id, name, category, status, amount, date, archived FROM records WHERE id = $1 AND user_id = $2',
    [id, userId]
  );

  if (existingRows.length === 0) {
    return c.json({ error: 'Record not found' }, 404);
  }

  const current = toRecordDto(existingRows[0]);
  const patch = await c.req.json<Partial<BusinessRecord>>();
  const merged: BusinessRecord = {
    ...current,
    ...patch,
    id: current.id,
    amount: patch.amount !== undefined ? Number(patch.amount) || 0 : current.amount,
  };

  const updated = await pool.query(
    `UPDATE records
     SET record_id = $2,
         name = $3,
         category = $4,
         status = $5,
         amount = $6,
         date = $7,
         archived = $8
     WHERE id = $1 AND user_id = $9`,
    [
      id,
      merged.recordId,
      merged.name,
      merged.category,
      merged.status,
      merged.amount,
      merged.date,
      merged.archived,
      userId,
    ]
  );

  if (updated.rowCount === 0) {
    return c.json({ error: 'Record not found' }, 404);
  }

  const updatedAll = await fetchAllRecords(userId);
  return c.json({ record: merged, records: updatedAll });
});

records.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const deleted = await pool.query('DELETE FROM records WHERE id = $1 AND user_id = $2', [id, userId]);
  if (deleted.rowCount === 0) {
    return c.json({ error: 'Record not found' }, 404);
  }
  const updatedAll = await fetchAllRecords(userId);
  return c.json({ deleted: true, id, records: updatedAll });
});

records.post('/sort', async (c) => {
  const body = await c.req.json<{ field?: SortField; direction?: SortDirection }>();
  const field = body.field || 'name';
  const direction = body.direction || 'asc';
  const all = await fetchAllRecords(c.get('userId'));
  const { items, metrics } = insertionSortRecords(all, field, direction);
  return c.json({ records: items, metrics });
});

records.get('/search', async (c) => {
  const mode = (c.req.query('mode') as SearchAlgorithm) || 'linear';
  const q = c.req.query('q') || '';
  const field = (c.req.query('field') as SortField) || 'name';
  const direction = (c.req.query('direction') as SortDirection) || 'asc';
  const all = await fetchAllRecords(c.get('userId'));

  if (mode === 'binary') {
    const { items } = insertionSortRecords(all, field, direction);
    const result = binarySearchExactRecord(items, q, field, direction);
    return c.json({
      mode: 'binary',
      matches: result.match ? [result.match] : [],
      steps: result.steps,
      found: result.found,
    });
  }

  const result = linearSearchRecords(all, { query: q });
  return c.json({
    mode: 'linear',
    matches: result.matches,
    inspected: result.inspected,
  });
});
