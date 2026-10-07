import { createApp } from "@send0/api/app";
import { createWebApp, type Gateway } from "@send0/web/worker";
import { sql } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { BootTimeoutError } from "./boot";
import type { CloudflareConfig } from "./config";
import type { RequestServices } from "./services";

/** Paths the public API answers. */
export const API_PATHS = ["/v1/*", "/mcp", "/mcp/*", "/openapi.json", "/internal/*", "/health"];
/** The dashboard's dynamic routes. */
export const WEB_PATHS = ["/auth/*", "/api/*"];
/** Everything the Worker runs for; wrangler.jsonc's `assets.run_worker_first` must list the same. Other paths are the SPA. */
export const WORKER_PATHS = ["/healthz", ...API_PATHS, ...WEB_PATHS];

/** How long `/healthz` waits for Postgres before reporting unhealthy. */
const HEALTH_TIMEOUT_MS = 3_000;

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then(resolve, reject).finally(() => clearTimeout(timer));
  });

/**
 * The whole HTTP surface on one hostname, as apps/server does it: the public API, the dashboard's
 * routes (with the API in-process behind its gateway), and the SPA from the assets binding.
 * `ready` (migrations and seeding) runs before anything that touches the database.
 */
export function createHttpApp(
  services: RequestServices,
  config: Pick<CloudflareConfig, "mailDomains">,
  assets: Pick<Fetcher, "fetch">,
  ready: () => Promise<void>,
) {
  const { apiDeps, auth, publicUrl } = services;
  const api = createApp(apiDeps);

  // The dashboard has already checked the member's role; the API runs as that workspace.
  const gateway: Gateway = async (req, as) =>
    createApp({
      ...apiDeps,
      presetAuth: { orgId: as.orgId, keyId: as.userId, mode: "live", scopes: as.scopes, inboxIds: null, actor: "user" },
    }).fetch(req);
  const web = createWebApp({
    auth,
    gateway,
    appUrl: publicUrl,
    secureCookies: new URL(publicUrl).protocol === "https:",
    instance: { mailDomains: config.mailDomains },
  });

  const booted: MiddlewareHandler = async (c, next) => {
    try {
      await ready();
    } catch (err) {
      console.error(JSON.stringify({ event: "boot.failed", error: String(err) }));
      if (err instanceof BootTimeoutError) {
        c.header("retry-after", "5");
        return c.json({ error: { code: "starting_up", message: "send0 is starting up. Retry in a few seconds." } }, 503);
      }
      return c.json({ error: { code: "unavailable", message: "send0 couldn't reach its database. Try again shortly." } }, 503);
    }
    await next();
  };

  const app = new Hono();
  app.get("/healthz", booted, async (c) => {
    try {
      await withTimeout(services.db.execute(sql`select 1`), HEALTH_TIMEOUT_MS);
      return c.json({ ok: true });
    } catch (err) {
      console.error(JSON.stringify({ event: "healthz.failed", error: String(err) }));
      return c.json({ ok: false, error: "database_unreachable" }, 503);
    }
  });
  // On Workers, cf-connecting-ip is set by Cloudflare itself, so requests pass through untouched.
  for (const p of WEB_PATHS) app.all(p, booted, (c) => web.fetch(c.req.raw));
  for (const p of API_PATHS) app.all(p, booted, (c) => api.fetch(c.req.raw));
  // Anything else is the SPA; wrangler's single-page-application mode serves the shell for client routes.
  app.all("*", (c) => assets.fetch(c.req.raw));
  return app;
}
