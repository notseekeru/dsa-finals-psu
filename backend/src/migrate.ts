import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import { Client } from "pg";

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

// AI HERE: the lock id is per-project; a second app migrating the same database needs its own constant.
const LOCK_ID = 7245091331000001;

const LOCK_SQL = `select pg_advisory_lock(${LOCK_ID})`;
const UNLOCK_SQL = `select pg_advisory_unlock(${LOCK_ID})`;

export async function runMigrations(): Promise<void> {
    if (process.env.AUTO_MIGRATE === "false") {
        console.log("[migrate] AUTO_MIGRATE=false, skipping migrations");
        return;
    }

    const databaseUrl = process.env.DATABASE_URL ?? "";
    if (!databaseUrl) throw new Error("DATABASE_URL is required");

    const lock = new Client({ connectionString: databaseUrl });
    await lock.connect();
    try {
        await lock.query(LOCK_SQL);
        const applied = await runner({
            databaseUrl,
            dir: MIGRATIONS_DIR,
            direction: "up",
            migrationsTable: "pgmigrations",
            logger: { info: () => {}, warn: console.warn, error: console.error },
        });
        console.log(applied.length === 0 ? "[migrate] no pending migrations" : `[migrate] applied ${applied.length} migrations`);
    } finally {
        await lock.query(UNLOCK_SQL).catch(() => {});
        await lock.end();
    }
}
