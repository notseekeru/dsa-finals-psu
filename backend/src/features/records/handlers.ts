import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { Hono } from "hono";
import { pool } from "../../shared/db.js";
import { findUserByToken, sessionToken } from "../auth/session.js";
import { type BusinessRecord, SEARCH_ALGORITHMS, SORT_DIRECTIONS, SORT_FIELDS } from "./dataTypes.js";
import { binarySearchExactRecord, insertionSortRecords, linearSearchRecords } from "./dsa.js";
import { fetchRecordStats } from "./stats.js";

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

function readEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T | null {
    if (raw === undefined || raw === null || raw === "") return fallback;
    return typeof raw === "string" && allowed.includes(raw as T) ? (raw as T) : null;
}

const badEnum = (c: Context, name: string, allowed: readonly string[]) => c.json({ error: `${name} must be one of: ${allowed.join(", ")}` }, 400);

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

const badDate = (raw: unknown) => raw !== undefined && raw !== null && raw !== "" && !(typeof raw === "string" && DATE_SHAPE.test(raw));

const dateError = (c: Context) => c.json({ error: "Date must be YYYY-MM-DD", field: "date" }, 400);

async function fetchAllRecords(userId: string): Promise<BusinessRecord[]> {
    const { rows } = await pool.query<RecordRow>("SELECT id, record_id, name, category, status, amount, date, archived FROM records WHERE user_id = $1 ORDER BY created_at ASC", [userId]);
    return rows.map(toRecordDto);
}

type RecordEnv = { Variables: { userId: string } };

export const records = new Hono<RecordEnv>();

records.use("*", async (c, next) => {
    const token = sessionToken(c);
    const user = token ? await findUserByToken(token) : null;
    if (!user) return c.json({ error: "Not signed in" }, 401);
    c.set("userId", user.id);
    await next();
});

records.get("/", async (c) => {
    const sortField = readEnum(c.req.query("sortField"), SORT_FIELDS, "name");
    if (!sortField) return badEnum(c, "sortField", SORT_FIELDS);
    const sortDir = readEnum(c.req.query("sortDir"), SORT_DIRECTIONS, "asc");
    if (!sortDir) return badEnum(c, "sortDir", SORT_DIRECTIONS);
    const all = await fetchAllRecords(c.get("userId"));
    const { items, metrics } = insertionSortRecords(all, sortField, sortDir);
    return c.json({ records: items, metrics });
});

records.get("/stats", async (c) => {
    return c.json(await fetchRecordStats(c.get("userId")));
});

records.post("/", async (c) => {
    const body = await c.req.json<Partial<BusinessRecord>>();
    if (badDate(body.date)) return dateError(c);
    const userId = c.get("userId");
    const id = randomUUID();

    const newRecord: BusinessRecord = {
        id,
        recordId: String(body.recordId || `REC-${id.slice(0, 8)}`).trim(),
        name: String(body.name || "Untitled Record").trim(),
        category: body.category || "Customer",
        status: body.status || "Active",
        amount: Number(body.amount) || 0,
        date: body.date || new Date().toISOString().slice(0, 10),
        archived: Boolean(body.archived),
    };

    await pool.query(
        `INSERT INTO records (id, record_id, name, category, status, amount, date, archived, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [newRecord.id, newRecord.recordId, newRecord.name, newRecord.category, newRecord.status, newRecord.amount, newRecord.date, newRecord.archived, userId],
    );

    const updatedAll = await fetchAllRecords(userId);
    const { items, metrics } = insertionSortRecords(updatedAll, "name", "asc");
    return c.json({ record: newRecord, records: items, metrics }, 201);
});

records.put("/:id", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    const patch = await c.req.json<Partial<BusinessRecord>>();
    if (badDate(patch.date)) return dateError(c);
    const client = await pool.connect();
    let merged: BusinessRecord;
    try {
        await client.query("BEGIN");
        const { rows } = await client.query<RecordRow>("SELECT id, record_id, name, category, status, amount, date, archived FROM records WHERE id = $1 AND user_id = $2 FOR UPDATE", [id, userId]);
        if (rows.length === 0) {
            await client.query("ROLLBACK");
            return c.json({ error: "Record not found" }, 404);
        }

        const current = toRecordDto(rows[0]);
        merged = {
            ...current,
            ...patch,
            id: current.id,
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
    const field = readEnum(body.field, SORT_FIELDS, "name");
    if (!field) return badEnum(c, "field", SORT_FIELDS);
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
    const field = readEnum(c.req.query("field"), SORT_FIELDS, "name");
    if (!field) return badEnum(c, "field", SORT_FIELDS);
    const direction = readEnum(c.req.query("direction"), SORT_DIRECTIONS, "asc");
    if (!direction) return badEnum(c, "direction", SORT_DIRECTIONS);
    const all = await fetchAllRecords(c.get("userId"));

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

    const result = linearSearchRecords(all, { query: q });
    return c.json({
        mode: "linear",
        matches: result.matches,
        inspected: result.inspected,
    });
});
