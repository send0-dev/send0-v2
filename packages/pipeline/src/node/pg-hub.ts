import { schema, type Db } from "@send0/db";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { hubName, toEnvelope, type EventEnvelope } from "../events";
import type { HubClient } from "../hub-client";
import { HubState } from "../hub-state";

/** The NOTIFY channel every self-hosted process listens on. */
export const EVENTS_CHANNEL = "send0_events";

/** Keepalive and heartbeat cadence; under the usual 30-60s proxy idle timeouts. */
const DEFAULT_TICK_MS = 25_000;

/** How long shutdown waits on the listener before giving up on a clean UNLISTEN. */
const STOP_TIMEOUT_MS = 2_000;

/**
 * What travels over NOTIFY: an event ID (payloads are capped at 8KB, and the row is authoritative),
 * or a process's self-addressed heartbeat.
 */
type Notification = { event_id: string } | { ping: string };

interface Listener {
  sql: postgres.Sql;
  unlisten: () => Promise<void>;
}

const logError = (event: string, err: unknown, extra: Record<string, unknown> = {}) =>
  console.error(JSON.stringify({ event, ...extra, error: String(err) }));

/** Resolves when `p` settles or after `ms`, whichever is first; never rejects. */
const settleWithin = (p: Promise<unknown>, ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    p.catch(() => {}).finally(() => (clearTimeout(timer), resolve()));
  });

/**
 * Real-time hubs for self-hosting, the Node counterpart of the per-hub Durable Objects.
 * Each process keeps in-memory HubStates (created on demand, dropped when idle) and learns about
 * new events through Postgres LISTEN/NOTIFY, so a `wait` or SSE stream served by one container
 * sees events committed by any other.
 *
 * Connections: one dedicated LISTEN connection per process. NOTIFYs and event-row loads go
 * through the app's own Drizzle `db` pool. Node-only: import from `@send0/pipeline/node/pg-hub`.
 */
export class PgHub {
  /** The HubClient the API uses for `wait` and SSE streams. */
  readonly client: HubClient;
  private readonly hubs = new Map<string, HubState>();
  private readonly closers = new Set<() => void>();
  private readonly processId = randomUUID();
  private readonly pinger: ReturnType<typeof setInterval>;
  private listener: Listener | null = null;
  private lastSelfPing = Date.now();
  private reconnecting = false;
  private stopped = false;
  /** Notifications are handled one at a time, so SSE frames keep commit order. */
  private chain: Promise<void> = Promise.resolve();

  private constructor(
    private readonly url: string,
    private readonly db: Db,
    private readonly tickMs: number,
  ) {
    this.client = {
      wait: (inboxId, filter, sinceMs, timeoutMs) => this.withHub(hubName.inbox(inboxId), (h) => h.wait(filter, sinceMs, timeoutMs)),
      stream: (name, signal) => Promise.resolve(this.stream(name, signal)),
    };
    this.pinger = setInterval(() => this.tick(), tickMs);
    this.pinger.unref();
  }

  /**
   * Opens the LISTEN connection on `send0_events`. postgres.js reconnects a dropped connection by
   * itself, and a heartbeat replaces a listener that stays connected but deaf. Every (re)listen sends
   * open SSE streams a `: resync` comment, since notifications sent meanwhile are lost.
   * `tickMs` (keepalive and heartbeat period) is configurable for tests.
   */
  static async start(opts: { url: string; db: Db; tickMs?: number }): Promise<PgHub> {
    const hub = new PgHub(opts.url, opts.db, opts.tickMs ?? DEFAULT_TICK_MS);
    try {
      hub.listener = await hub.listen();
    } catch (err) {
      await hub.stop();
      throw err;
    }
    return hub;
  }

  /**
   * Announces a committed event to every process (this one included, via its own LISTEN).
   * Like `publish` in events.ts it never throws: live listeners are best-effort, `wait` re-checks
   * the database before timing out, and webhooks come from the outbox regardless.
   */
  async publish(_orgId: string, envelope: EventEnvelope): Promise<void> {
    try {
      await this.notify({ event_id: envelope.id });
    } catch (err) {
      logError("pg_hub.publish_failed", err, { event_id: envelope.id });
    }
  }

  /** Whether this process currently holds a hub by that name; for tests and diagnostics. */
  hasHub(name: string): boolean {
    return this.hubs.has(name);
  }

  /**
   * Stops listening and closes the LISTEN connection. Pending waits resolve with null and open SSE
   * streams end, so shutdown isn't held by long-poll timers.
   */
  async stop(): Promise<void> {
    this.stopped = true;
    clearInterval(this.pinger);
    for (const close of this.closers) close();
    for (const h of this.hubs.values()) h.close();
    this.hubs.clear();
    const listener = this.listener;
    this.listener = null;
    if (listener) await this.closeListener(listener);
    await settleWithin(this.chain, STOP_TIMEOUT_MS);
  }

  private async listen(): Promise<Listener> {
    const conn = postgres(this.url, { max: 1, onnotice: () => {} });
    try {
      const meta = await conn.listen(
        EVENTS_CHANNEL,
        (payload) => this.enqueue(payload),
        () => this.broadcast("resync"),
      );
      this.lastSelfPing = Date.now();
      return { sql: conn, unlisten: () => meta.unlisten() };
    } catch (err) {
      await conn.end({ timeout: 1 });
      throw err;
    }
  }

  private async closeListener(listener: Listener): Promise<void> {
    await settleWithin(listener.unlisten(), STOP_TIMEOUT_MS);
    await listener.sql.end({ timeout: 1 }).catch(() => {});
  }

  /** Swaps in a fresh connection and LISTEN; the new LISTEN's callback broadcasts `: resync`. */
  private async relisten(): Promise<void> {
    if (this.reconnecting || this.stopped) return;
    this.reconnecting = true;
    try {
      const old = this.listener;
      this.listener = null;
      if (old) await this.closeListener(old);
      const fresh = await this.listen();
      if (this.stopped) await this.closeListener(fresh);
      else this.listener = fresh;
    } finally {
      this.reconnecting = false;
    }
  }

  private async notify(note: Notification): Promise<void> {
    await this.db.execute(sql`select pg_notify(${EVENTS_CHANNEL}, ${JSON.stringify(note)})`);
  }

  private enqueue(payload: string): void {
    this.chain = this.chain
      .then(() => this.onNotification(payload))
      .catch((err) => logError("pg_hub.notification_failed", err, { payload }));
  }

  private async onNotification(payload: string): Promise<void> {
    const note = JSON.parse(payload) as Notification;
    if ("ping" in note) {
      if (note.ping === this.processId) this.lastSelfPing = Date.now();
      return;
    }
    const [row] = await this.db.select().from(schema.events).where(eq(schema.events.id, note.event_id)).limit(1);
    if (!row || this.stopped) return; // purged, or a NOTIFY from a rolled-back caller
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
      this.closers.delete(close);
      unsubscribe();
      this.release(name);
      writer.close().catch(() => {}); // already closed by the reader
    };
    this.closers.add(close);
    if (signal.aborted) close();
    else signal.addEventListener("abort", close, { once: true });
    return new Response(readable, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" } });
  }

  private broadcast(comment: string): void {
    for (const h of this.hubs.values()) h.comment(comment);
  }

  /**
   * One timer for the whole process: keepalive pings, dropping hubs whose recent events expired,
   * and a self-addressed NOTIFY. If our own ping hasn't come back within two ticks, the listener is
   * deaf (a half-open socket, a lost LISTEN), so it is replaced.
   */
  private tick(): void {
    for (const [name, h] of this.hubs) {
      if (h.subscriberCount > 0) h.ping();
      else this.release(name);
    }
    if (this.stopped || this.reconnecting) return;
    if (Date.now() - this.lastSelfPing > 2 * this.tickMs) {
      console.error(JSON.stringify({ event: "pg_hub.listener_stale", since: new Date(this.lastSelfPing).toISOString() }));
      void this.relisten().catch((err) => logError("pg_hub.relisten_failed", err));
      return;
    }
    void this.notify({ ping: this.processId }).catch((err) => logError("pg_hub.ping_failed", err));
  }
}
