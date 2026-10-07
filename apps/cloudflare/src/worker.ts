import { purgeDeletedOrgs } from "@send0/api/maintenance";
import { processQueueMessage, sweep } from "@send0/api/webhooks/dispatch";
import { R2BlobStore } from "@send0/adapters/blob";
import { createDb } from "@send0/db";
import { receiveMessage, type QueueMessage } from "@send0/pipeline";
import { bootDatabase, onceUntilSuccess } from "./boot";
import { configCache, configErrorResponse, type CloudflareConfig } from "./config";
import { createHttpApp } from "./http";
import { publicUrlFor } from "./public-url";
import { createMailer, requestServices, type DbFactory, type MailerFactory } from "./services";

/** Test seams. Production uses the defaults; tests pass PGlite so no Postgres or workerd is needed. */
export interface WorkerOptions {
  /** Builds the database client from Hyperdrive's connection string (default: postgres.js via `createDb`) */
  createDb?: DbFactory;
  /** Builds the outbound mailer from the SES settings (default: SES over HTTPS) */
  createMailer?: MailerFactory;
}

const logError = (event: string, err: unknown, extra: Record<string, unknown> = {}) =>
  console.error(JSON.stringify({ event, ...extra, error: String(err) }));

/** Thrown from non-HTTP handlers on a bad config, so the platform retries once it's fixed. Names only, never values. */
class MisconfiguredError extends Error {
  constructor(problems: string[]) {
    super(`send0 is misconfigured: ${problems.map((p) => p.split(":")[0]).join(", ")}`);
    this.name = "MisconfiguredError";
  }
}

/**
 * Builds the Worker's handlers. Config is validated once per isolate, and the first piece of work in
 * each isolate (request, email, queue batch or cron run) migrates the database and seeds the mail domains.
 */
export function createWorker(opts: WorkerOptions = {}) {
  const makeDb: DbFactory = opts.createDb ?? ((cs, o) => createDb(cs, o));
  const makeMailer = opts.createMailer ?? createMailer;
  const configFor = configCache();
  const boot = onceUntilSuccess();
  const ready = (env: Env, config: CloudflareConfig) => () =>
    boot(() => bootDatabase(makeDb(env.HYPERDRIVE.connectionString, { max: 1 }), config.mailDomains));

  const configOrThrow = (env: Env): CloudflareConfig => {
    const result = configFor(env);
    if (!result.ok) throw new MisconfiguredError(result.problems);
    return result.config;
  };

  return {
    async fetch(request, env, ctx) {
      const result = configFor(env);
      if (!result.ok) return configErrorResponse(result.problems);
      const { config } = result;
      const db = makeDb(env.HYPERDRIVE.connectionString, { max: 5 });
      const services = requestServices(env, ctx, config, db, publicUrlFor(config.publicUrl, request), makeMailer);
      return createHttpApp(services, config, env.ASSETS, ready(env, config)).fetch(request);
    },

    // Email Routing's catch-all. A thrown error makes the sending server retry later.
    async email(message, env) {
      const config = configOrThrow(env);
      await ready(env, config)();
      const db = makeDb(env.HYPERDRIVE.connectionString, { max: 2 });
      await receiveMessage(
        message,
        { mailDomains: config.mailDomains, trustedAuthservIds: config.trustedAuthservIds },
        { db, blobs: new R2BlobStore(env.BLOBS), hub: env.HUB as never, queue: env.EVENTS },
      );
    },

    // Webhook fan-out and delivery attempts, as the hosted API Worker does them.
    async queue(batch, env) {
      const config = configOrThrow(env);
      await ready(env, config)();
      const db = makeDb(env.HYPERDRIVE.connectionString, { max: 2 });
      for (const msg of batch.messages) {
        try {
          await processQueueMessage(db, env.EVENTS, msg.body);
          msg.ack();
        } catch (err) {
          logError("queue.error", err, { body: msg.body });
          msg.retry({ delaySeconds: 30 });
        }
      }
      // The database is awake anyway: catch anything the outbox missed.
      await sweep(db, env.EVENTS, new Date()).catch((err: unknown) => logError("sweep.error", err));
    },

    // The outbox safety net and the purge of deleted workspaces; also keeps migrations current.
    async scheduled(_controller, env) {
      const config = configOrThrow(env);
      await ready(env, config)();
      const db = makeDb(env.HYPERDRIVE.connectionString, { max: 1 });
      const now = new Date();
      const swept = await sweep(db, env.EVENTS, now);
      if (swept.events || swept.deliveries) console.log(JSON.stringify({ event: "sweep", ...swept }));
      const purged = await purgeDeletedOrgs(db, now);
      if (purged) console.log(JSON.stringify({ event: "orgs_purged", count: purged }));
    },
  } satisfies ExportedHandler<Env, QueueMessage>;
}
