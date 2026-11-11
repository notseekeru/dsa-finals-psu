import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";

export const handleError: ErrorHandler = (error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    console.error("[error]", error);
    return c.json({ error: "internal" }, 500);
};
