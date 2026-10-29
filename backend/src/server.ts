import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { pool } from "./db.js";

const app = new Hono();

app.get("/healthz", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT ?? 4100);

const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`backend listening on ${info.port}`);
});

const shutdown = async () => {
    server.close();
    await pool.end();
};

process.once("SIGTERM", () => shutdown().catch(console.error));
process.once("SIGINT", () => shutdown().catch(console.error));
