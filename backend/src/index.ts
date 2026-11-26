import { Hono } from "hono";
import { auth } from "./features/auth/routes.js";
import { health } from "./features/health/routes.js";
import { records } from "./features/records/handlers.js";

export const app = new Hono().basePath("/api");

app.route("/", health);

app.route("/", auth);

app.route("/records", records);

export default app;
