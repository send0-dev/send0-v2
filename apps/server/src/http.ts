import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "@send0/api/app";
import { createWebApp, type Gateway } from "@send0/web/worker";
import { Hono, type Context } from "hono";
import path from "node:path";
import { clientIp, TrustedProxies } from "./client-ip";
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
 * The request as the apps should see it. They read the client address from `cf-connecting-ip`
 * (what Cloudflare sets when hosted), so any incoming copy is dropped, along with `cf-ray`, and the
 * header is set from the socket peer, or from X-Forwarded-For when the peer is a trusted proxy.
 */
function withClientIp(c: Context, trusted: TrustedProxies): Request {
  const headers = new Headers(c.req.raw.headers);
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ray");
  let peer: string | undefined;
  try {
    peer = getConnInfo(c).remote.address;
  } catch {
    // No Node socket (an in-process request): nothing to vouch for.
  }
  const ip = clientIp(peer, c.req.header("x-forwarded-for"), trusted);
  if (ip) headers.set("cf-connecting-ip", ip);
  else headers.delete("x-forwarded-for"); // the dashboard would otherwise fall back to it
  return new Request(c.req.raw, { headers });
}

/**
 * The whole HTTP surface on one hostname: the public API, the dashboard's routes (with the API
 * in-process behind its gateway, as the hosted DashboardGateway does), and the built SPA.
 */
export function createHttpApp(
  services: Pick<Services, "apiDeps" | "auth" | "ping">,
  config: Pick<ServerConfig, "publicUrl" | "mailDomains" | "webDir" | "trustedProxies">,
) {
  const { apiDeps, auth } = services;
  const trusted = new TrustedProxies(config.trustedProxies);
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
  app.all("/auth/*", (c) => web.fetch(withClientIp(c, trusted)));
  app.all("/api/*", (c) => web.fetch(withClientIp(c, trusted)));
  for (const p of API_PATHS) app.all(p, (c) => api.fetch(withClientIp(c, trusted)));

  // Vite fingerprints everything under /assets: a file that exists can be cached for good, and a
  // missing one is a 404 (never the app shell, which a browser would then cache as that asset).
  const webDir = path.resolve(config.webDir);
  app.use("/assets/*", async (c, next) => {
    await next();
    if (c.res.status === 200 || c.res.status === 206) c.res.headers.set("cache-control", "public, max-age=31536000, immutable");
  });
  app.get("/assets/*", serveStatic({ root: webDir }));
  app.all("/assets/*", (c) => c.text("Not found", 404));

  // Everything else is the SPA, whose shell is never cached.
  app.use("/*", async (c, next) => {
    await next();
    if (c.res.ok && c.req.method === "GET") c.res.headers.set("cache-control", "no-cache");
  });
  app.use("/*", serveStatic({ root: webDir }));
  // SPA fallback: client-side routes like /inboxes load the app shell.
  app.get("*", serveStatic({ path: path.join(webDir, "index.html") }));
  return app;
}
