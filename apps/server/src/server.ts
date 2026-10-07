import { serve, type ServerType } from "@hono/node-server";
import { migrateWithLock } from "@send0/db/migrate";
import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { ServerConfig } from "./config";
import { seedMailDomains } from "./domains";
import { createHttpApp } from "./http";
import { createServices, type Services } from "./services";
import { startWorker } from "./worker";

export type Role = "http" | "worker" | "smtp";
export const ROLES: readonly Role[] = ["http", "worker", "smtp"];

export interface RunningServer {
  /** Where the http role listens locally (null without it), e.g. http://127.0.0.1:3000 */
  url: string | null;
  services: Services;
  /** Graceful shutdown; safe to call more than once. */
  stop: () => Promise<void>;
}

/** How long shutdown waits for in-flight HTTP requests before cutting connections. */
const HTTP_DRAIN_MS = 10_000;

const log = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));
const logError = (event: string, err: unknown) => console.error(JSON.stringify({ event, error: String(err) }));

function listen(app: { fetch: (req: Request) => Response | Promise<Response> }, port: number): Promise<ServerType> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port }, () => resolve(server));
    server.once("error", reject);
  });
}

/** Stops accepting connections and resolves when open ones finish, cutting them after `ms`. */
function closeHttp(server: ServerType, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const s = server as import("node:http").Server;
    const timer = setTimeout(() => s.closeAllConnections?.(), ms);
    s.close(() => (clearTimeout(timer), resolve()));
    s.closeIdleConnections?.();
  });
}

/**
 * Boots send0: migrates the database, seeds the mail domains, then starts the requested roles.
 * `http` serves the API and dashboard; `worker` delivers webhooks and runs cron; `smtp` receives mail.
 */
export async function startServer(config: ServerConfig, opts: { roles?: readonly Role[] } = {}): Promise<RunningServer> {
  const roles = new Set(opts.roles ?? ROLES);
  await migrateWithLock(config.databaseUrl);
  const services = await createServices(config);

  let http: ServerType | null = null;
  let url: string | null = null;
  try {
    await seedMailDomains(services.db, config.mailDomains, new Date());

    if (roles.has("worker")) {
      await startWorker(services);
      log({ event: "worker.started" });
    }
    if (roles.has("smtp")) {
      log({ event: "smtp.not_implemented", level: "warn", message: "The smtp role isn't available yet; inbound mail is not received." });
    }
    if (roles.has("http")) {
      if (!existsSync(path.join(config.webDir, "index.html"))) {
        log({ event: "web.missing", level: "warn", message: "No dashboard build found; only the API is served.", dir: config.webDir });
      }
      http = await listen(createHttpApp(services, config), config.port);
      const { port } = http.address() as AddressInfo;
      url = `http://127.0.0.1:${port}`;
      log({ event: "server.listening", url, public_url: config.publicUrl });
    }
  } catch (err) {
    await services.close();
    throw err;
  }

  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      log({ event: "server.stopping" });
      if (http) {
        const closed = closeHttp(http, HTTP_DRAIN_MS);
        // Ends open SSE streams and long-polls, so the HTTP server can finish draining.
        await services.hub.stop().catch((err: unknown) => logError("shutdown.hub_failed", err));
        await closed;
      }
      await services.close();
      log({ event: "server.stopped" });
    })());

  return { url, services, stop };
}
