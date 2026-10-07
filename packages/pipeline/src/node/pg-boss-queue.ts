import { PgBoss, type Job } from "pg-boss";
import type { QueueLike, QueueMessage } from "../events";

/** The queue carrying webhook fan-out and delivery jobs, named like the hosted Cloudflare queue. */
export const EVENTS_QUEUE = "send0-events";

const logError = (event: string, err: unknown, extra: Record<string, unknown> = {}) =>
  console.error(JSON.stringify({ event, ...extra, error: String(err) }));

export class PgBossQueue implements QueueLike {
  private constructor(
    private readonly boss: PgBoss,
    private readonly retry: { retryLimit: number; retryDelay: number; retryBackoff: boolean; retryDelayMax: number },
    private readonly pollingIntervalSeconds: number,
  ) {}

  /**
   * Starts pg-boss in the `pgboss` schema (installing or migrating it on first run) and makes sure
   * the events queue exists. `retryDelaySeconds` and `pollingIntervalSeconds` exist so tests run fast.
   */
  static async start(opts: { url: string; retryDelaySeconds?: number; pollingIntervalSeconds?: number }): Promise<PgBossQueue> {
    const boss = new PgBoss({ connectionString: opts.url, schema: "pgboss", max: 4 });
    boss.on("error", (err) => logError("pg_boss.error", err)); // an unhandled 'error' event would crash the process
    await boss.start();
    // Backoff is capped at an hour, so the 10th retry still lands within a day.
    const retry = { retryLimit: 10, retryDelay: opts.retryDelaySeconds ?? 30, retryBackoff: true, retryDelayMax: 3600 };
    await boss.createQueue(EVENTS_QUEUE, retry); // ON CONFLICT DO NOTHING, so safe on every boot
    return new PgBossQueue(boss, retry, opts.pollingIntervalSeconds ?? 2);
  }

  async send(message: QueueMessage, opts: { delaySeconds?: number } = {}): Promise<string | null> {
    return this.boss.send(EVENTS_QUEUE, message, { ...this.retry, ...(opts.delaySeconds ? { startAfter: opts.delaySeconds } : {}) });
  }

  /** Runs `handler` for each queued message. A throw fails the job and pg-boss retries it with backoff. */
  async consume(handler: (msg: QueueMessage) => Promise<void>, opts: { concurrency?: number } = {}): Promise<void> {
    await this.boss.work<QueueMessage>(
      EVENTS_QUEUE,
      { batchSize: 1, localConcurrency: opts.concurrency ?? 5, pollingIntervalSeconds: this.pollingIntervalSeconds },
      async (jobs: Job<QueueMessage>[]) => {
        for (const job of jobs) await handler(job.data);
      },
    );
  }

  /**
   * Runs `handler` on a cron schedule (UTC), for the outbox sweep and retention purge. pg-boss
   * stores the schedule in Postgres, so with many processes each tick still runs once.
   */
  async schedule(name: string, cron: string, handler: () => Promise<void>): Promise<void> {
    await this.boss.createQueue(name);
    await this.boss.schedule(name, cron, null, { tz: "UTC" });
    await this.boss.work(name, { pollingIntervalSeconds: this.pollingIntervalSeconds }, async () => {
      await handler();
    });
  }

  /** Stops fetching, lets in-flight jobs finish (up to `timeoutMs`, default 30s), then closes the pool. */
  async stop(opts: { timeoutMs?: number } = {}): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: opts.timeoutMs ?? 30_000 });
  }
}
