import { Hono } from "hono";
import { health } from "./features/health/routes.js";

export const app = new Hono().basePath("/api");

app.route("/", health);

export default app;
