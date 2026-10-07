import { schema, type Db } from "@send0/db";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { hubName, toEnvelope, type EventEnvelope } from "../events";
import type { HubClient } from "../hub-client";
import { HubState } from "../hub-state";

/** The NOTIFY channel every self-hosted process listens on. */
export const EVENTS_CHANNEL = "send0_events";

/** Keepalive cadence for open SSE streams; under the usual 30-60s proxy idle timeouts. */
const PING_INTERVAL_MS = 25_000;

/** What travels over NOTIFY. IDs only: payloads are capped at 8KB, so receivers load the row. */
interface Notification {
  event_id: string;
  org_id: string;
  inbox_id: string | null;
}

const logError = (event: string, err: unknown, extra: Record<string, unknown> = {}) =>
  console.error(JSON.stringify({ event, ...extra, error: String(err) }));

/**
 * Real-time hubs for self-hosting, the Node counterpart of the per-hub Durable Objects.
 * Each process keeps in-memory HubStates (created on demand, dropped when idle) and learns about
 * new events through Postgres LISTEN/NOTIFY, so a `wait` or SSE stream served by one container
 * sees events committed by any other. Node-only: import from `@send0/pipeline/node/pg-hub`.
 */
export class PgHub {
  /** The HubClient the API uses for `wait` and SSE streams. */
  readonly client: HubClient;
  private readonly hubs = new Map<string, HubState>();
  private unlisten: (() => Promise<void>) | null = null;
  private readonly pinger: ReturnType<typeof setInterval>;

  private constructor(
    private readonly sql: postgres.Sql,
    private readonly db: Db,
  ) {
    this.client = {
      wait: (inboxId, filter, sinceMs, timeoutMs) => this.withHub(hubName.inbox(inboxId), (h) => h.wait(filter, sinceMs, timeoutMs)),
      stream: (name, signal) => Promise.resolve(this.stream(name, signal)),
    };
    this.pinger = setInterval(() => this.tick(), PING_INTERVAL_MS);
    this.pinger.unref();
  }

  /**
   * Opens a dedicated connection and LISTENs on `send0_events`. postgres.js reconnects the listener
   * by itself; every (re)connect sends open SSE streams a `: resync` comment, since notifications
   * sent while disconnected are lost and clients should refetch.
   */
  static async start(opts: { url: string; db: Db }): Promise<PgHub> {
    const sql = postgres(opts.url, { max: 1, onnotice: () => {} });
    const hub = new PgHub(sql, opts.db);
    try {
      const meta = await sql.listen(
        EVENTS_CHANNEL,
        (payload) => void hub.onNotification(payload).catch((err) => logError("pg_hub.notification_failed", err, { payload })),
        () => hub.broadcast("resync"),
      );
      hub.unlisten = () => meta.unlisten();
    } catch (err) {
      await hub.stop();
      throw err;
    }
    return hub;
  }

  /**
   * Announces a committed event to every process (this one included, via its own LISTEN).
   * Like `publish` in events.ts it never throws: live listeners are best-effort, and webhooks
   * come from the outbox regardless.
   */
  async publish(orgId: string, envelope: EventEnvelope): Promise<void> {
    const note: Notification = { event_id: envelope.id, org_id: orgId, inbox_id: envelope.inbox_id };
    try {
      await this.sql`SELECT pg_notify(${EVENTS_CHANNEL}, ${JSON.stringify(note)})`;
    } catch (err) {
      logError("pg_hub.publish_failed", err, { event_id: envelope.id });
    }
  }

  /** Whether this process currently holds a hub by that name; for tests and diagnostics. */
  hasHub(name: string): boolean {
    return this.hubs.has(name);
  }

  /** Stops listening and closes the connection. Open SSE streams stay open until their clients leave. */
  async stop(): Promise<void> {
    clearInterval(this.pinger);
    const unlisten = this.unlisten;
    this.unlisten = null;
    try {
      if (unlisten) await unlisten();
    } finally {
      await this.sql.end({ timeout: 5 });
    }
  }

  private async onNotification(payload: string): Promise<void> {
    const note = JSON.parse(payload) as Notification;
    const [row] = await this.db.select().from(schema.events).where(eq(schema.events.id, note.event_id)).limit(1);
    if (!row) return; // purged, or a NOTIFY from a rolled-back caller
    const envelope = toEnvelope(row);
    this.hub(hubName.org(row.orgId)).notify(envelope);
    if (row.inboxId) this.hub(hubName.inbox(row.inboxId)).notify(envelope);
  }

  private hub(name: string): HubState {
    let h = this.hubs.get(name);
    if (!h) this.hubs.set(name, (h = new HubState()));
    return h;
  }

  /** Drops the hub if nothing in it is worth keeping, so memory follows live use. */
  private release(name: string): void {
    if (this.hubs.get(name)?.isIdle()) this.hubs.delete(name);
  }

  private async withHub<T>(name: string, run: (h: HubState) => Promise<T>): Promise<T> {
    try {
      return await run(this.hub(name));
    } finally {
      this.release(name);
    }
  }

  private stream(name: string, signal: AbortSignal): Response {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    const unsubscribe = this.hub(name).subscribe((chunk) => writer.write(enc.encode(chunk)));
    const close = () => {
      unsubscribe();
      this.release(name);
      writer.close().catch(() => {}); // already closed by the reader
    };
    if (signal.aborted) close();
    else signal.addEventListener("abort", close, { once: true });
    return new Response(readable, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
  }

  private broadcast(comment: string): void {
    for (const h of this.hubs.values()) h.comment(comment);
  }

  /** One timer for the whole process: keepalive pings, and dropping hubs whose recent events expired. */
  private tick(): void {
    for (const [name, h] of this.hubs) {
      if (h.subscriberCount > 0) h.ping();
      else this.release(name);
    }
  }
}
