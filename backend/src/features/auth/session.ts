import { createHash, randomBytes } from "node:crypto";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { pool } from "../../shared/db.js";

const COOKIE_NAME = "session";
const SESSION_DAYS = 7;

const cookieOptions = {
    httpOnly: true,
    sameSite: "Lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
};

export type SessionUser = { id: string; email: string };

const sha256 = (token: string) => createHash("sha256").update(token).digest("hex");

export const createSession = async (userId: string) => {
    const token = randomBytes(32).toString("base64url");
    await pool.query("insert into sessions (user_id, token_hash, expires_at) values ($1, $2, now() + make_interval(days => $3))", [userId, sha256(token), SESSION_DAYS]);
    return token;
};

export const findUserByToken = async (token: string) => {
    const tokenHash = sha256(token);
    const { rows } = await pool.query<SessionUser>("select users.id, users.email from sessions join users on users.id = sessions.user_id where sessions.token_hash = $1 and sessions.expires_at > now()", [tokenHash]);
    const user = rows[0];
    if (user) return user;
    await pool.query("delete from sessions where token_hash = $1", [tokenHash]);
    return null;
};

export const deleteSession = (token: string) => pool.query("delete from sessions where token_hash = $1", [sha256(token)]);

export const sessionToken = (c: Context) => getCookie(c, COOKIE_NAME) || undefined;

export type SessionEnv = { Variables: { userId: string } };

export const requireUser = createMiddleware<SessionEnv>(async (c, next) => {
    const token = sessionToken(c);
    const user = token ? await findUserByToken(token) : null;
    if (!user) return c.json({ error: "Not signed in" }, 401);
    c.set("userId", user.id);
    await next();
});

export const setSessionCookie = (c: Context, token: string) => setCookie(c, COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_DAYS * 86400 });

export const clearSessionCookie = (c: Context) => deleteCookie(c, COOKIE_NAME, cookieOptions);
