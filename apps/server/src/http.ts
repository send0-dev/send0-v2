import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "@send0/api/app";
import { createWebApp, type Gateway } from "@send0/web/worker";
import { Hono } from "hono";
import path from "node:path";
import type { ServerConfig } from "./config";
import type { Services } from "./services";

/** Paths the public API answers; everything else is the dashboard. */
const API_PATHS = ["/v1/*", "/mcp", "/mcp/*", "/openapi.json", "/internal/*", "/health"];

/** How long `/healthz` waits for Postgres before reporting unhealthy. */
const HEALTH_TIMEOUT_MS = 3_000;

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then(resolve, reject).finally(() => clearTimeout(timer));
  });

/**
 * The whole HTTP surface on one hostname: the public API, the dashboard's routes (with the API
 * in-process behind its gateway, as the hosted DashboardGateway does), and the built SPA.
 */
export function createHttpApp(
  services: Pick<Services, "apiDeps" | "auth" | "ping">,
  config: Pick<ServerConfig, "publicUrl" | "mailDomains" | "webDir">,
) {
  const { apiDeps, auth } = services;
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
    appUrl: config.publicUrl,
    secureCookies: new URL(config.publicUrl).protocol === "https:",
    instance: { mailDomains: config.mailDomains },
  });

  const app = new Hono();
  app.get("/healthz", async (c) => {
    try {
      await withTimeout(services.ping(), HEALTH_TIMEOUT_MS);
      return c.json({ ok: true });
    } catch (err) {
      console.error(JSON.stringify({ event: "healthz.failed", error: String(err) }));
      return c.json({ ok: false, error: "database_unreachable" }, 503);
    }
  });
  app.all("/auth/*", (c) => web.fetch(c.req.raw));
  app.all("/api/*", (c) => web.fetch(c.req.raw));
  for (const p of API_PATHS) app.all(p, (c) => api.fetch(c.req.raw));

  // Vite fingerprints everything under /assets, so those can be cached for good; the app shell never is.
  const webDir = path.resolve(config.webDir);
  app.use("/*", async (c, next) => {
    await next();
    if (c.res.ok && c.req.method === "GET") {
      c.res.headers.set("cache-control", c.req.path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
    }
  });
  app.use("/*", serveStatic({ root: webDir }));
  // SPA fallback: client-side routes like /inboxes load the app shell.
  app.get("*", serveStatic({ path: path.join(webDir, "index.html") }));
  return app;
}
