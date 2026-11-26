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

export interface RecordStats {
    totals: RecordTotals;
    byCategory: CategoryStat[];
    byStatus: StatusStat[];
    monthly: MonthlyStat[];
    recent: BusinessRecord[];
}

const TOTALS_SQL = `SELECT
    COUNT(*)::int AS records,
    COUNT(*) FILTER (WHERE archived)::int AS archived,
    COUNT(*) FILTER (WHERE NOT archived)::int AS active,
    COUNT(DISTINCT category)::int AS categories,
    COALESCE(SUM(amount), 0) AS amount
   FROM records
   WHERE user_id = $1`;

const BY_CATEGORY_SQL = `SELECT category, COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS amount
   FROM records
   WHERE user_id = $1
   GROUP BY category
   ORDER BY COUNT(*) DESC, category ASC`;

const BY_STATUS_SQL = `SELECT status, COUNT(*)::int AS count
   FROM records
   WHERE user_id = $1
   GROUP BY status
   ORDER BY COUNT(*) DESC, status ASC`;

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
    AND left(records.date, 7) = to_char(months.month_start, 'YYYY-MM')
   GROUP BY months.month_start
   ORDER BY months.month_start`;

const RECENT_SQL = `SELECT id, record_id AS "recordId", name, category, status, amount, date, archived
   FROM records
   WHERE user_id = $1
   ORDER BY created_at DESC, id DESC
   LIMIT 5`;

export async function fetchRecordStats(userId: string): Promise<RecordStats> {
    const [totals, byCategory, byStatus, monthly, recent] = await Promise.all([
        pool.query<TotalsRow>(TOTALS_SQL, [userId]),
        pool.query<CategoryRow>(BY_CATEGORY_SQL, [userId]),
        pool.query<StatusRow>(BY_STATUS_SQL, [userId]),
        pool.query<MonthlyRow>(MONTHLY_SQL, [userId]),
        pool.query<BusinessRecord>(RECENT_SQL, [userId]),
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
        recent: recent.rows.map((row) => ({ ...row, amount: Number(row.amount) })),
    };
}
