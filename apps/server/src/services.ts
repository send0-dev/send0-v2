import type { Mailer } from "@send0/adapters/mailer";
import { MemoryRateLimiter } from "@send0/api/rate-limit";
import type { AppDeps } from "@send0/api/types";
import { createAuth, type Auth } from "@send0/auth";
import { createDb, type Db } from "@send0/db";
import type { EventEnvelope } from "@send0/pipeline";
import { PgBossQueue } from "@send0/pipeline/node/pg-boss-queue";
import { PgHub } from "@send0/pipeline/node/pg-hub";
import { sql } from "drizzle-orm";
import { createBlobs, createMailer, type Blobs } from "./adapters";
import { BackgroundTasks } from "./background";
import type { ServerConfig } from "./config";

/** Connections per process for API requests, auth, the worker and the hub's NOTIFYs. */
const DB_POOL_SIZE = 10;

/** Everything the server's roles share, built once at boot. */
export interface Services {
  db: Db;
  blobs: Blobs;
  mailer: Mailer;
  hub: PgHub;
  queue: PgBossQueue;
  /** After an event commits: wake live listeners in every process and queue webhook fan-out. Never throws. */
  publish: (orgId: string, envelope: EventEnvelope) => Promise<void>;
  auth: Auth;
  /** What `createApp` needs; the dashboard gateway adds `presetAuth` per request. */
  apiDeps: AppDeps;
  background: BackgroundTasks;
  /** Round-trips to Postgres; throws when the database is unreachable. */
  ping: () => Promise<void>;
  /** Drains background work, stops the queue (letting running jobs finish) and the hub, then closes the pool. */
  close: () => Promise<void>;
}

/**
 * Shutdown budgets. With the HTTP and SMTP drains in front (up to 10s, in parallel) and the hub's own
 * 2s limit, a full stop stays under 25s, inside compose's 30s stop_grace_period.
 */
const SHUTDOWN = { backgroundMs: 3_000, queueMs: 8_000, dbSeconds: 2 };

const logError = (event: string, err: unknown, extra: Record<string, unknown> = {}) =>
  console.error(JSON.stringify({ event, ...extra, error: String(err) }));

/** Closes the postgres.js pool behind a Drizzle database made by `createDb`. */
async function closeDb(db: Db): Promise<void> {
  await (db as unknown as { $client: { end: (o?: { timeout?: number }) => Promise<void> } }).$client.end({ timeout: SHUTDOWN.dbSeconds });
}

/** Connects to Postgres, the hub and the queue, and wires the API and auth around them. */
export async function createServices(config: ServerConfig): Promise<Services> {
  const db = createDb(config.databaseUrl, { max: DB_POOL_SIZE });
  const blobs = createBlobs(config.blob, config);
  const mailer = createMailer(config.mailer);
  const background = new BackgroundTasks();

  let hub: PgHub | undefined;
  let queue: PgBossQueue | undefined;
  try {
    hub = await PgHub.start({ url: config.databaseUrl, db });
    queue = await PgBossQueue.start({ url: config.databaseUrl });
  } catch (err) {
    await hub?.stop().catch((e: unknown) => logError("shutdown.hub_failed", e));
    mailer.close?.();
    await closeDb(db).catch((e: unknown) => logError("shutdown.db_failed", e));
    throw err;
  }
  const liveHub = hub;
  const liveQueue = queue;

  // Same semantics as the hosted publish (packages/pipeline/src/events.ts): best-effort, and the
  // outbox sweep catches anything the queue missed.
  const publish = async (orgId: string, envelope: EventEnvelope): Promise<void> => {
    const results = await Promise.allSettled([liveHub.publish(orgId, envelope), liveQueue.send({ kind: "fanout", eventId: envelope.id })]);
    for (const r of results) {
      if (r.status === "rejected") logError("publish.failed", r.reason, { event_id: envelope.id });
    }
  };

  const auth = createAuth({
    db,
    mailer,
    from: { name: "send0", email: config.mailFrom },
    appUrl: config.publicUrl,
    allowSignup: config.allowSignup,
    ...(config.ownerEmail ? { ownerEmail: config.ownerEmail } : {}),
  });

  const apiDeps: AppDeps = {
    db,
    mailDomains: config.mailDomains,
    limits: config.limits,
    files: blobs.files,
    ...(blobs.fileServer ? { fileServer: blobs.fileServer } : {}),
    ...(config.sesEvents ? { sesEvents: config.sesEvents } : {}),
    hub: liveHub.client,
    queue: liveQueue,
    mailer,
    publish,
    // One process, so in-memory counters are exact.
    rateLimiter: new MemoryRateLimiter(),
    waitUntil: background.waitUntil,
  };

  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      // Background work first: it publishes events, which needs the queue and the hub. Anything still
      // unpublished after the budget is picked up from the outbox by the next sweep.
      if (!(await background.drain(SHUTDOWN.backgroundMs))) {
        console.error(JSON.stringify({ event: "shutdown.background_abandoned", pending: background.size }));
      }
      await liveQueue.stop({ timeoutMs: SHUTDOWN.queueMs }).catch((err: unknown) => logError("shutdown.queue_failed", err));
      await liveHub.stop().catch((err: unknown) => logError("shutdown.hub_failed", err));
      mailer.close?.();
      await closeDb(db).catch((err: unknown) => logError("shutdown.db_failed", err));
    })());

  return {
    db,
    blobs,
    mailer,
    hub: liveHub,
    queue: liveQueue,
    publish,
    auth,
    apiDeps,
    background,
    ping: async () => {
      await db.execute(sql`select 1`);
    },
    close,
  };
}
