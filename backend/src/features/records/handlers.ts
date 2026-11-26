import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { Hono } from "hono";
import { pool } from "../../shared/db.js";
import { isId } from "../../shared/ids.js";
import { requireUser, type SessionEnv } from "../auth/session.js";
import { type BusinessRecord, CORE_COLUMNS, type RecordData, SEARCH_ALGORITHMS, SORT_DIRECTIONS } from "./dataTypes.js";
import { binarySearchExactRecord, insertionSortRecords, linearSearchRecords } from "./dsa.js";
import { fetchRecordStats } from "./stats.js";

interface RecordRow {
    id: string;
    dataset_id: string;
    record_id: string;
    name: string;
    category: string;
    status: string;
    amount: string | number;
    date: string;
    archived: boolean;
    data: RecordData | null;
}

type RecordBody = Partial<Omit<BusinessRecord, "datasetId" | "data">> & { datasetId?: unknown; data?: unknown };

const RECORD_COLUMNS = "id, dataset_id, record_id, name, category, status, amount, date, archived, data";

const INSERT_SQL = `INSERT INTO records (id, dataset_id, record_id, name, category, status, amount, date, archived, user_id, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`;

const MANUAL_DATASET = "Manual entries";
const MAX_BULK_ROWS = 5000;

function toRecordDto(row: RecordRow): BusinessRecord {
    return {
        id: String(row.id),
        datasetId: String(row.dataset_id),
        recordId: row.record_id,
        name: row.name,
        category: row.category,
        status: row.status,
        amount: Number(row.amount) || 0,
        date: row.date,
        archived: Boolean(row.archived),
        data: row.data ?? {},
    };
}

function readEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T | null {
    if (raw === undefined || raw === null || raw === "") return fallback;
    return typeof raw === "string" && allowed.includes(raw as T) ? (raw as T) : null;
}

const badEnum = (c: Context, name: string, allowed: readonly string[]) => c.json({ error: `${name} must be one of: ${allowed.join(", ")}` }, 400);

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

const badDate = (raw: unknown) => raw !== undefined && raw !== null && raw !== "" && !(typeof raw === "string" && DATE_SHAPE.test(raw));

const dateError = (c: Context) => c.json({ error: "Date must be YYYY-MM-DD", field: "date" }, 400);

const FIELD_SHAPE = /^[\p{L}\p{N} _-]+$/u;

function readField(raw: unknown): string | null {
    if (raw === undefined || raw === null) return "name";
    if (typeof raw !== "string") return null;
    const field = raw.trim();
    if (field === "") return "name";
    return field.length <= 64 && FIELD_SHAPE.test(field) ? field : null;
}

const fieldError = (c: Context, name: string) => c.json({ error: `${name} may only contain letters, digits, spaces, underscores and hyphens`, field: name }, 400);

function readData(raw: unknown): RecordData | null {
    if (raw === undefined || raw === null) return {};
    if (typeof raw !== "object" || Array.isArray(raw)) return null;
    const data: RecordData = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const kind = typeof value;
        if (kind !== "string" && kind !== "number" && kind !== "boolean") return null;
        data[key] = value as string | number | boolean;
    }
    return data;
}

const dataError = (c: Context) => c.json({ error: "data must be a flat object of strings, numbers or booleans", field: "data" }, 400);

function readDatasetFilter(raw: string | undefined): string | null | undefined {
    if (raw === undefined || raw === "") return null;
    return isId(raw) ? raw : undefined;
}

const datasetNotFound = (c: Context) => c.json({ error: "Dataset not found" }, 404);

async function fetchAllRecords(userId: string, datasetId: string | null = null): Promise<BusinessRecord[]> {
    const { rows } = await pool.query<RecordRow>(`SELECT ${RECORD_COLUMNS} FROM records WHERE user_id = $1 AND ($2::uuid IS NULL OR dataset_id = $2) ORDER BY created_at ASC`, [userId, datasetId]);
    return rows.map(toRecordDto);
}

async function manualDatasetId(userId: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO datasets (id, user_id, name, columns)
     SELECT $1, $2, $3, $4::jsonb
     WHERE NOT EXISTS (SELECT 1 FROM datasets WHERE user_id = $2 AND name = $3)
     RETURNING id`,
        [randomUUID(), userId, MANUAL_DATASET, JSON.stringify(CORE_COLUMNS)],
    );
    if (rows[0]) return rows[0].id;
    const existing = await pool.query<{ id: string }>("SELECT id FROM datasets WHERE user_id = $1 AND name = $2 ORDER BY created_at ASC LIMIT 1", [userId, MANUAL_DATASET]);
    return existing.rows[0].id;
}

async function resolveDatasetId(userId: string, raw: unknown): Promise<string | null> {
    if (raw === undefined || raw === null || raw === "") return manualDatasetId(userId);
    if (typeof raw !== "string" || !isId(raw)) return null;
    const { rows } = await pool.query<{ id: string }>("SELECT id FROM datasets WHERE id = $1 AND user_id = $2", [raw, userId]);
    return rows[0]?.id ?? null;
}

const insertValues = (record: BusinessRecord, userId: string) => [record.id, record.datasetId, record.recordId, record.name, record.category, record.status, record.amount, record.date, record.archived, userId, JSON.stringify(record.data)];

function newRecord(body: RecordBody, datasetId: string, data: RecordData): BusinessRecord {
    const id = randomUUID();
    return {
        id,
        datasetId,
        recordId: String(body.recordId || `REC-${id.slice(0, 8)}`).trim(),
        name: String(body.name ?? "").trim(),
        category: String(body.category ?? "").trim(),
        status: String(body.status ?? "").trim(),
        amount: Number(body.amount) || 0,
        date: String(body.date ?? "").trim(),
        archived: Boolean(body.archived),
        data,
    };
}

async function sortedAllRecords(userId: string) {
    const all = await fetchAllRecords(userId);
    return insertionSortRecords(all, "name", "asc");
}

export const records = new Hono<SessionEnv>();

records.use("*", requireUser);

// AI HERE: every sort loads the user's whole record set into memory; past a few thousand rows this needs paging, not a move into SQL.
records.get("/", async (c) => {
    const datasetId = readDatasetFilter(c.req.query("dataset"));
    if (datasetId === undefined) return datasetNotFound(c);
    const sortField = readField(c.req.query("sortField"));
    if (!sortField) return fieldError(c, "sortField");
    const sortDir = readEnum(c.req.query("sortDir"), SORT_DIRECTIONS, "asc");
    if (!sortDir) return badEnum(c, "sortDir", SORT_DIRECTIONS);
    const all = await fetchAllRecords(c.get("userId"), datasetId);
    const { items, metrics } = insertionSortRecords(all, sortField, sortDir);
    return c.json({ records: items, metrics });
});

records.get("/stats", async (c) => {
    const datasetId = readDatasetFilter(c.req.query("dataset"));
    if (datasetId === undefined) return datasetNotFound(c);
    return c.json(await fetchRecordStats(c.get("userId"), datasetId));
});

records.post("/bulk", async (c) => {
    const body = await c.req.json<{ datasetId?: unknown; records?: unknown }>();
    const userId = c.get("userId");
    const datasetId = await resolveDatasetId(userId, body.datasetId);
    if (!datasetId) return c.json({ error: "Dataset not found", field: "datasetId" }, 400);
    if (!Array.isArray(body.records)) return c.json({ error: "records must be an array", field: "records" }, 400);
    if (body.records.length > MAX_BULK_ROWS) return c.json({ error: `records must be ${MAX_BULK_ROWS} rows or fewer, received ${body.records.length}`, field: "records" }, 400);

    const pending: BusinessRecord[] = [];
    for (const entry of body.records) {
        const row = entry as RecordBody;
        if (badDate(row?.date)) return dateError(c);
        const data = readData(row?.data);
        if (!data) return dataError(c);
        pending.push(newRecord(row, datasetId, data));
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        for (const record of pending) await client.query(INSERT_SQL, insertValues(record, userId));
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    const { items, metrics } = await sortedAllRecords(userId);
    return c.json({ inserted: pending.length, records: items, metrics }, 201);
});

records.post("/", async (c) => {
    const body = await c.req.json<RecordBody>();
    if (badDate(body.date)) return dateError(c);
    const data = readData(body.data);
    if (!data) return dataError(c);
    const userId = c.get("userId");
    const datasetId = await resolveDatasetId(userId, body.datasetId);
    if (!datasetId) return c.json({ error: "Dataset not found", field: "datasetId" }, 400);

    const newRecordDto = newRecord(body, datasetId, data);
    await pool.query(INSERT_SQL, insertValues(newRecordDto, userId));

    const { items, metrics } = await sortedAllRecords(userId);
    return c.json({ record: newRecordDto, records: items, metrics }, 201);
});

records.put("/:id", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    const patch = await c.req.json<RecordBody>();
    if (badDate(patch.date)) return dateError(c);
    const client = await pool.connect();
    let merged: BusinessRecord;
    try {
        await client.query("BEGIN");
        const { rows } = await client.query<RecordRow>(`SELECT ${RECORD_COLUMNS} FROM records WHERE id = $1 AND user_id = $2 FOR UPDATE`, [id, userId]);
        if (rows.length === 0) {
            await client.query("ROLLBACK");
            return c.json({ error: "Record not found" }, 404);
        }

        const current = toRecordDto(rows[0]);
        merged = {
            ...current,
            ...patch,
            id: current.id,
            datasetId: current.datasetId,
            data: current.data,
            amount: patch.amount !== undefined ? Number(patch.amount) || 0 : current.amount,
        };

        await client.query(
            `UPDATE records
     SET record_id = $2,
         name = $3,
         category = $4,
         status = $5,
         amount = $6,
         date = $7,
         archived = $8
     WHERE id = $1 AND user_id = $9`,
            [id, merged.recordId, merged.name, merged.category, merged.status, merged.amount, merged.date, merged.archived, userId],
        );

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    const updatedAll = await fetchAllRecords(userId);
    return c.json({ record: merged, records: updatedAll });
});

records.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    const deleted = await pool.query("DELETE FROM records WHERE id = $1 AND user_id = $2", [id, userId]);
    if (deleted.rowCount === 0) {
        return c.json({ error: "Record not found" }, 404);
    }
    const updatedAll = await fetchAllRecords(userId);
    return c.json({ deleted: true, id, records: updatedAll });
});

records.post("/sort", async (c) => {
    const body = await c.req.json<{ field?: unknown; direction?: unknown }>();
    const field = readField(body.field);
    if (!field) return fieldError(c, "field");
    const direction = readEnum(body.direction, SORT_DIRECTIONS, "asc");
    if (!direction) return badEnum(c, "direction", SORT_DIRECTIONS);
    const all = await fetchAllRecords(c.get("userId"));
    const { items, metrics } = insertionSortRecords(all, field, direction);
    return c.json({ records: items, metrics });
});

records.get("/search", async (c) => {
    const mode = readEnum(c.req.query("mode"), SEARCH_ALGORITHMS, "linear");
    if (!mode) return badEnum(c, "mode", SEARCH_ALGORITHMS);
    const q = c.req.query("q") || "";
    const field = readField(c.req.query("field"));
    if (!field) return fieldError(c, "field");
    const direction = readEnum(c.req.query("direction"), SORT_DIRECTIONS, "asc");
    if (!direction) return badEnum(c, "direction", SORT_DIRECTIONS);
    const datasetId = readDatasetFilter(c.req.query("dataset"));
    if (datasetId === undefined) return datasetNotFound(c);
    const all = await fetchAllRecords(c.get("userId"), datasetId);

    if (mode === "binary") {
        const { items } = insertionSortRecords(all, field, direction);
        const result = binarySearchExactRecord(items, q, field, direction);
        return c.json({
            mode: "binary",
            matches: result.match ? [result.match] : [],
            steps: result.steps,
            found: result.found,
        });
    }

    const result = linearSearchRecords(all, { query: q, field });
    return c.json({
        mode: "linear",
        matches: result.matches,
        inspected: result.inspected,
    });
});
