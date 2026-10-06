import { apiAction, apiScopesFor, AuthError, can } from "@send0/auth";
import { Hono } from "hono";
import type { WebEnv } from "../env";
import { requireWorkspace } from "../http";

/**
 * /api/* → the API, as the signed-in member of the current workspace. The role check happens
 * here first; the API then applies its own scope checks. Cookies and any Authorization header
 * from the browser are dropped: the session is the only credential.
 */
export const apiProxy = new Hono<WebEnv>().all("/*", async (c) => {
  const s = requireWorkspace(c);
  const url = new URL(c.req.url);
  const path = url.pathname.replace(/^\/api/, "");
  const action = apiAction(c.req.method, path);
  if (!action) throw new AuthError(404, "not_found", "No such endpoint.");
  if (!can(s.workspace.role, action)) throw new AuthError(403, "forbidden", "Your role in this workspace can't do that.");

  const headers = new Headers(c.req.raw.headers);
  headers.delete("cookie");
  headers.delete("authorization");
  const forwarded = new Request(new URL(path + url.search, "https://api.internal"), {
    method: c.req.method,
    headers,
    body: ["GET", "HEAD"].includes(c.req.method) ? undefined : await c.req.arrayBuffer(),
  });
  return c.get("deps").gateway(forwarded, { orgId: s.workspace.id, userId: s.user.id, scopes: apiScopesFor(s.workspace.role) });
});
