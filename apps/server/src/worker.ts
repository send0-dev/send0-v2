import { purgeDeletedOrgs, raiseSendCaps } from "@send0/api/maintenance";
import { processQueueMessage, sweep } from "@send0/api/webhooks/dispatch";
import type { Services } from "./services";

const log = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));
const logError = (event: string, err: unknown, extra: Record<string, unknown> = {}) =>
  console.error(JSON.stringify({ event, ...extra, error: String(err) }));

/**
 * The worker role: webhook fan-out and delivery from the queue, plus the cron jobs the hosted
 * Worker runs in `scheduled()`. pg-boss keeps schedules in Postgres, so each tick runs once even
 * with several worker processes.
 */
export async function startWorker({ db, queue, apiDeps }: Pick<Services, "db" | "queue" | "apiDeps">): Promise<void> {
  await queue.consume(async (msg) => {
    try {
      await processQueueMessage(db, queue, msg);
    } catch (err) {
      logError("queue.error", err, { body: msg });
      throw err; // pg-boss retries with backoff
    }
  });

  // The outbox safety net. Self-hosted Postgres doesn't scale to zero, so this runs more often than hosted.
  await queue.schedule(
    "send0-sweep",
    "*/5 * * * *",
    logged("sweep.error", async () => {
      const swept = await sweep(db, queue, new Date());
      if (swept.events || swept.deliveries) log({ event: "sweep", ...swept });
    }),
  );

  await queue.schedule(
    "send0-purge",
    "0 3 * * *",
    logged("purge.error", async () => {
      const purged = await purgeDeletedOrgs(db, new Date());
      if (purged) log({ event: "orgs_purged", count: purged });
    }),
  );

  // Reputation-based daily cap raises. A no-op unless this install enforces daily caps (LIMITS=hosted);
  // always scheduled, because pg-boss keeps schedules in Postgres and a conditional one would outlive the setting.
  await queue.schedule(
    "send0-send-caps",
    "15 * * * *",
    logged("send_caps.error", async () => {
      if (apiDeps.limits?.dailySendCap) await raiseSendCaps(db, new Date());
    }),
  );
}

/** Logs a failed cron run as JSON, then rethrows so pg-boss records the failure. */
function logged(event: string, run: () => Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await run();
    } catch (err) {
      logError(event, err);
      throw err;
    }
  };
}
