import { pool } from "../../shared/db.js";
import type { BusinessRecord } from "./dataTypes.js";

interface TotalsRow {
    records: number;
    active: number;
    archived: number;
    categories: number;
    amount: string;
}

interface CategoryRow {
    category: string;
    count: number;
    amount: string;
}

interface StatusRow {
    status: string;
    count: number;
}

interface MonthlyRow {
    month: string;
    count: number;
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

interface CategoryStat {
    category: string;
    count: number;
    amount: number;
}

interface StatusStat {
    status: string;
    count: number;
}

interface MonthlyStat {
    month: string;
    count: number;
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
    byCategory: CategoryStat[];
    byStatus: StatusStat[];
    monthly: MonthlyStat[];
    byDataset: DatasetStat[];
    recent: BusinessRecord[];
}

const TOTALS_SQL = `SELECT
    COUNT(*)::int AS records,
    COUNT(*) FILTER (WHERE archived)::int AS archived,
    COUNT(*) FILTER (WHERE NOT archived)::int AS active,
    COUNT(DISTINCT category)::int AS categories,
    COALESCE(SUM(amount), 0) AS amount
   FROM records
   WHERE user_id = $1
     AND ($2::uuid IS NULL OR dataset_id = $2)`;

const BY_CATEGORY_SQL = `SELECT category, COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS amount
   FROM records
   WHERE user_id = $1
     AND ($2::uuid IS NULL OR dataset_id = $2)
   GROUP BY category
   ORDER BY COUNT(*) DESC, category ASC`;

const BY_STATUS_SQL = `SELECT status, COUNT(*)::int AS count
   FROM records
   WHERE user_id = $1
     AND ($2::uuid IS NULL OR dataset_id = $2)
   GROUP BY status
   ORDER BY COUNT(*) DESC, status ASC`;

const BY_DATASET_SQL = `SELECT records.dataset_id AS "datasetId", datasets.name, COUNT(*)::int AS count, COALESCE(SUM(records.amount), 0) AS amount
   FROM records
   JOIN datasets ON datasets.id = records.dataset_id
   WHERE records.user_id = $1
   GROUP BY records.dataset_id, datasets.name
   ORDER BY COUNT(*) DESC, datasets.name ASC`;

// AI HERE: months bucket on the first 7 chars of the text date, so unparsable dates drop out instead of erroring; move bucketing to a real date column if free-form dates ever ship.
const MONTHLY_SQL = `WITH months AS (
    SELECT generate_series(
        date_trunc('month', CURRENT_DATE) - interval '11 months',
        date_trunc('month', CURRENT_DATE),
        interval '1 month'
    ) AS month_start
)
   SELECT to_char(months.month_start, 'YYYY-MM') AS month,
          COUNT(records.id)::int AS count,
          COALESCE(SUM(records.amount), 0) AS amount
   FROM months
   LEFT JOIN records
     ON records.user_id = $1
    AND ($2::uuid IS NULL OR records.dataset_id = $2)
    AND left(records.date, 7) = to_char(months.month_start, 'YYYY-MM')
   GROUP BY months.month_start
   ORDER BY months.month_start`;

const RECENT_SQL = `SELECT id, dataset_id AS "datasetId", record_id AS "recordId", name, category, status, amount, date, archived, data
   FROM records
   WHERE user_id = $1
     AND ($2::uuid IS NULL OR dataset_id = $2)
   ORDER BY created_at DESC, id DESC
   LIMIT 5`;

export async function fetchRecordStats(userId: string, datasetId: string | null = null): Promise<RecordStats> {
    const scope = [userId, datasetId];
    const [totals, byCategory, byStatus, monthly, byDataset, recent] = await Promise.all([
        pool.query<TotalsRow>(TOTALS_SQL, scope),
        pool.query<CategoryRow>(BY_CATEGORY_SQL, scope),
        pool.query<StatusRow>(BY_STATUS_SQL, scope),
        pool.query<MonthlyRow>(MONTHLY_SQL, scope),
        pool.query<DatasetRow>(BY_DATASET_SQL, [userId]),
        pool.query<BusinessRecord>(RECENT_SQL, scope),
    ]);

    const sum = totals.rows[0];

    return {
        totals: {
            records: sum.records,
            active: sum.active,
            archived: sum.archived,
            categories: sum.categories,
            amount: Number(sum.amount),
        },
        byCategory: byCategory.rows.map((row) => ({ category: row.category, count: row.count, amount: Number(row.amount) })),
        byStatus: byStatus.rows.map((row) => ({ status: row.status, count: row.count })),
        monthly: monthly.rows.map((row) => ({ month: row.month, count: row.count, amount: Number(row.amount) })),
        byDataset: byDataset.rows.map((row) => ({ datasetId: row.datasetId, name: row.name, count: row.count, amount: Number(row.amount) })),
        recent: recent.rows.map((row) => ({ ...row, amount: Number(row.amount) })),
    };
}
