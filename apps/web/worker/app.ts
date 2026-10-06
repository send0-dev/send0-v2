import { AuthError } from "@send0/auth";
import { Hono } from "hono";
import type { WebDeps, WebEnv } from "./env";
import { csrf } from "./middleware/csrf";
import { session } from "./middleware/session";
import { accountRoutes } from "./routes/account";
import { apiProxy } from "./routes/api-proxy";
import { inviteRoutes } from "./routes/invites";
import { memberRoutes } from "./routes/members";
import { workspaceRoutes } from "./routes/workspaces";

export { SESSION_COOKIE } from "./middleware/session";
export type { Gateway, WebDeps } from "./env";

/** The dashboard Worker's dynamic routes: /auth/* (accounts, workspaces, team) and /api/* (the API). */
export function createWebApp(deps: WebDeps) {
  const app = new Hono<WebEnv>();
  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });
  app.use("*", csrf, session);

  app.onError((err, c) => {
    if (err instanceof AuthError) return c.json({ error: { code: err.code, message: err.message, field: err.field } }, err.status);
    console.error(JSON.stringify({ event: "web.error", error: String(err), stack: (err as Error).stack }));
    return c.json({ error: { code: "internal_error", message: "Something went wrong. Try again." } }, 500);
  });

  app.route("/auth", accountRoutes);
  app.route("/auth", workspaceRoutes);
  app.route("/auth/members", memberRoutes);
  app.route("/auth/invites", inviteRoutes);
  app.route("/api", apiProxy);
  return app;
}
