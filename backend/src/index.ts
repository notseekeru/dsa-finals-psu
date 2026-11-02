import { Hono } from "hono";

export const app = new Hono().basePath("/api");

app.get("/healthz", (c) => c.json({ status: "ok" }));

export default app;
