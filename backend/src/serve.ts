import { serve } from "@hono/node-server";
import app from "./index.js";
import { runMigrations } from "./migrate.js";
import { pool } from "./shared/db.js";

const port = Number(process.env.PORT ?? 4100);

try {
    await runMigrations();
} catch (error) {
    console.error("[migrate] failed, refusing to serve", error);
    process.exit(1);
}

const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`backend listening on ${info.port}`);
});

const shutdown = async () => {
    server.close();
    await pool.end();
};

process.once("SIGTERM", () => shutdown().catch(console.error));
process.once("SIGINT", () => shutdown().catch(console.error));
