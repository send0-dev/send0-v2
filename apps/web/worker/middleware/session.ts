import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { WebEnv } from "../env";

export const SESSION_COOKIE = "send0_session";

const secure = (c: Context<WebEnv>) => c.get("deps").secureCookies ?? true;

export function setSessionCookie(c: Context<WebEnv>, token: string, expires: Date) {
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: secure(c), sameSite: "Lax", path: "/", expires });
}

export function clearSessionCookie(c: Context<WebEnv>) {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: secure(c) });
}

export const sessionToken = (c: Context) => getCookie(c, SESSION_COOKIE);

/** Resolves the session cookie on every request and slides its expiry when due. */
export const session = createMiddleware<WebEnv>(async (c, next) => {
  const token = sessionToken(c);
  const s = await c.get("deps").auth.sessions.resolve(token);
  c.set("session", s);
  if (s?.refreshedUntil && token) setSessionCookie(c, token, s.refreshedUntil);
  await next();
  c.header("cache-control", "no-store");
});
