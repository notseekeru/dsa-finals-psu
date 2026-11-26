import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { Hono } from "hono";
import { pool } from "../../shared/db.js";
import { isId } from "../../shared/ids.js";
import { requireUser, type SessionEnv } from "../auth/session.js";

interface DatasetRow {
    id: string;
    name: string;
    columns: string[];
    row_count: number;
    created_at: Date;
}

interface Dataset {
    id: string;
    name: string;
    columns: string[];
    rowCount: number;
    createdAt: string;
}

const LIST_SQL = `SELECT datasets.id, datasets.name, datasets.columns, datasets.created_at, COUNT(records.id)::int AS row_count
   FROM datasets
   LEFT JOIN records ON records.dataset_id = datasets.id
   WHERE datasets.user_id = $1
   GROUP BY datasets.id
   ORDER BY datasets.created_at DESC, datasets.id DESC`;

const INSERT_SQL = `INSERT INTO datasets (id, user_id, name, columns)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id, name, columns, created_at, 0::int AS row_count`;

const MAX_NAME = 80;
const MAX_COLUMNS = 64;

const toDataset = (row: DatasetRow): Dataset => ({ id: String(row.id), name: row.name, columns: row.columns, rowCount: row.row_count, createdAt: row.created_at.toISOString() });

const nameError = (c: Context) => c.json({ error: `Name must be 1 to ${MAX_NAME} characters`, field: "name" }, 400);
const columnsError = (c: Context) => c.json({ error: `Columns must be up to ${MAX_COLUMNS} unique names of 1 to 64 characters`, field: "columns" }, 400);

function readName(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const name = raw.trim();
    return name.length >= 1 && name.length <= MAX_NAME ? name : null;
}

function readColumns(raw: unknown): string[] | null {
    if (!Array.isArray(raw) || raw.length > MAX_COLUMNS) return null;
    const columns = raw.map((value) => (typeof value === "string" ? value.trim() : ""));
    if (columns.some((name) => name === "" || name.length > 64)) return null;
    return new Set(columns).size === columns.length ? columns : null;
}

export const datasets = new Hono<SessionEnv>();

datasets.use("*", requireUser);

datasets.get("/", async (c) => {
    const { rows } = await pool.query<DatasetRow>(LIST_SQL, [c.get("userId")]);
    return c.json({ datasets: rows.map(toDataset) });
});

datasets.post("/", async (c) => {
    const body = await c.req.json<{ name?: unknown; columns?: unknown }>();
    const name = readName(body.name);
    if (!name) return nameError(c);
    const columns = readColumns(body.columns);
    if (!columns) return columnsError(c);

    const { rows } = await pool.query<DatasetRow>(INSERT_SQL, [randomUUID(), c.get("userId"), name, JSON.stringify(columns)]);
    return c.json({ dataset: toDataset(rows[0]) }, 201);
});

datasets.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    if (!isId(id)) return c.json({ error: "Dataset not found" }, 404);

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const owned = await client.query("SELECT id FROM datasets WHERE id = $1 AND user_id = $2 FOR UPDATE", [id, userId]);
        if (owned.rowCount === 0) {
            await client.query("ROLLBACK");
            return c.json({ error: "Dataset not found" }, 404);
        }
        const removed = await client.query("DELETE FROM records WHERE dataset_id = $1", [id]);
        await client.query("DELETE FROM datasets WHERE id = $1", [id]);
        await client.query("COMMIT");
        return c.json({ deleted: true, rowsDeleted: removed.rowCount });
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
});
