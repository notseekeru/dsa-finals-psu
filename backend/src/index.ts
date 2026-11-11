import { Hono } from "hono";
import { health } from "./features/health/routes.js";
import { handleError } from "./shared/errors.js";

export const app = new Hono().basePath("/api");

app.onError(handleError);
app.route("/", health);

export default app;
