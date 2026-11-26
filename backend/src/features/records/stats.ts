import { pool } from "../../shared/db.js";
import type { BusinessRecord } from "./dataTypes.js";

interface TotalsRow {
    records: number;
    active: number;
    archived: number;
    categories: number;
    amount: string;
}

interface DatasetRow {
    datasetId: string;
    name: string;
    count: number;
    amount: string;
}

interface RecordTotals {
    records: number;
    active: number;
    archived: number;
    categories: number;
    amount: number;
}

interface DatasetStat {
    datasetId: string;
    name: string;
    count: number;
    amount: number;
}

export interface RecordStats {
    totals: RecordTotals;
    byDataset: DatasetStat[];
    recent: BusinessRecord[];
}

const TOTALS_SQL = `SELECT
    COUNT(*)::int AS records,
    COUNT(*) FILTER (WHERE archived)::int AS archived,
    COUNT(*) FILTER (WHERE NOT archived)::int AS active,
    COUNT(DISTINCT NULLIF(category, ''))::int AS categories,
    COALESCE(SUM(amount), 0) AS amount
   FROM records
   WHERE user_id = $1
     AND ($2::uuid IS NULL OR dataset_id = $2)`;

const BY_DATASET_SQL = `SELECT records.dataset_id AS "datasetId", datasets.name, COUNT(*)::int AS count, COALESCE(SUM(records.amount), 0) AS amount
   FROM records
   JOIN datasets ON datasets.id = records.dataset_id
   WHERE records.user_id = $1
   GROUP BY records.dataset_id, datasets.name
   ORDER BY COUNT(*) DESC, datasets.name ASC`;

const RECENT_SQL = `SELECT id, dataset_id AS "datasetId", record_id AS "recordId", name, category, status, amount, date, archived, data
   FROM records
   WHERE user_id = $1
     AND ($2::uuid IS NULL OR dataset_id = $2)
   ORDER BY created_at DESC, id DESC
   LIMIT 5`;

export async function fetchRecordStats(userId: string, datasetId: string | null = null): Promise<RecordStats> {
    const scope = [userId, datasetId];
    const [totals, byDataset, recent] = await Promise.all([pool.query<TotalsRow>(TOTALS_SQL, scope), pool.query<DatasetRow>(BY_DATASET_SQL, [userId]), pool.query<BusinessRecord>(RECENT_SQL, scope)]);

    const sum = totals.rows[0];

    return {
        totals: {
            records: sum.records,
            active: sum.active,
            archived: sum.archived,
            categories: sum.categories,
            amount: Number(sum.amount),
        },
        byDataset: byDataset.rows.map((row) => ({ datasetId: row.datasetId, name: row.name, count: row.count, amount: Number(row.amount) })),
        recent: recent.rows.map((row) => ({ ...row, amount: Number(row.amount) })),
    };
}
