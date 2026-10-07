import type { BlobStore } from "@send0/adapters/blob";
import { schema, type Db } from "@send0/db";
import { and, asc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";

const { messages, attachments, inboxes, threads, events, deliveries } = schema;

/**
 * Retention runs in two stages, so stored mail stays small while sending reputation keeps its history:
 *
 * 1. **Scrub**, once a message is older than its inbox's `retention_days` (at most `maxDays`): bodies,
 *    extracted fields, attachments and the raw .eml go. Routing and status stay (direction, status,
 *    addresses, subject, Message-ID and References, timestamps), because bounce and complaint rates,
 *    daily caps, cap raises (30 days), reply-only checks and threading read them.
 * 2. **Delete**, after `deleteAfterDays`: the row itself, threads left empty, and outbox events and
 *    webhook deliveries of the same age.
 */
export const RETENTION = {
  /** The longest retention an inbox can ask for (also the API's limit) */
  maxDays: 30,
  /** Rows are deleted after this many days: past the 30-day reputation windows, with a margin */
  deleteAfterDays: 35,
  /** Rows per statement */
  batchSize: 1000,
  /** Stop starting new batches after this long; the next run carries on */
  timeBudgetMs: 20_000,
};

export interface RetentionResult {
  /** Messages whose content was removed */
  scrubbed: number;
  /** Message rows deleted */
  deleted: number;
  threadsDeleted: number;
  eventsDeleted: number;
  deliveriesDeleted: number;
  /** Raw and attachment blobs removed (only when the store can delete) */
  blobsDeleted: number;
  /** False when the time budget ran out or a blob delete failed: there is more to do next run */
  complete: boolean;
}

export interface RetentionOptions {
  /** Deletes raw mail and attachment blobs on scrub. Without `delete`, blobs are left to a bucket lifecycle rule. */
  blobs?: Pick<BlobStore, "delete">;
  batchSize?: number;
  timeBudgetMs?: number;
  /** Milliseconds, for the time budget; tests pass a fake */
  clock?: () => number;
}

const DAY_MS = 86400_000;

/**
 * Enforces retention: scrubs, then deletes, in batches of `batchSize`, oldest first, until done or the
 * time budget is spent. Safe to run concurrently or after an interruption: every step is idempotent.
 * Logs one `retention` JSON line when it changed anything.
 */
export async function enforceRetention(db: Db, now: Date, opts: RetentionOptions = {}): Promise<RetentionResult> {
  const batch = opts.batchSize ?? RETENTION.batchSize;
  const clock = opts.clock ?? Date.now;
  const deadline = clock() + (opts.timeBudgetMs ?? RETENTION.timeBudgetMs);
  const deleteBefore = new Date(now.getTime() - RETENTION.deleteAfterDays * DAY_MS);
  const result: RetentionResult = {
    scrubbed: 0,
    deleted: 0,
    threadsDeleted: 0,
    eventsDeleted: 0,
    deliveriesDeleted: 0,
    blobsDeleted: 0,
    complete: true,
  };

  /** Runs `step` until it handles less than a full batch, the budget runs out, or the step gives up (null). */
  const drain = async (step: () => Promise<number | null>): Promise<void> => {
    for (;;) {
      if (clock() >= deadline) return void (result.complete = false);
      const n = await step();
      if (n === null) return void (result.complete = false);
      if (n < batch) return;
    }
  };

  // Stage 1. Scrubbing always runs before deleting, so stage 2 only ever removes rows with no blobs left.
  await drain(async () => {
    const rows = await db
      .select({ id: messages.id, rawKey: messages.rawKey })
      .from(messages)
      .innerJoin(inboxes, eq(inboxes.id, messages.inboxId))
      .where(
        and(
          isNull(messages.scrubbedAt),
          // Nothing is kept for less than a day; bounds the index scan to messages that could qualify.
          lt(messages.createdAt, new Date(now.getTime() - DAY_MS)),
          sql`${messages.createdAt} < ${now.toISOString()}::timestamptz - make_interval(days => least(greatest(${inboxes.retentionDays}, 1), ${RETENTION.maxDays}::int))`,
        ),
      )
      .orderBy(asc(messages.createdAt))
      .limit(batch);
    if (!rows.length) return 0;
    const ids = rows.map((r) => r.id);

    // Blobs first: if deleting them fails, the rows still say where they are and the next run retries.
    if (opts.blobs?.delete) {
      const atts = await db.select({ key: attachments.blobKey }).from(attachments).where(inArray(attachments.messageId, ids));
      const keys = [...rows.flatMap((r) => (r.rawKey ? [r.rawKey] : [])), ...atts.map((a) => a.key)];
      try {
        if (keys.length) await opts.blobs.delete(keys);
      } catch (err) {
        console.error(JSON.stringify({ event: "retention.blob_delete_failed", messages: ids.length, error: String(err) }));
        return null;
      }
      result.blobsDeleted += keys.length;
    }

    await db.transaction(async (tx) => {
      await tx.delete(attachments).where(inArray(attachments.messageId, ids));
      const scrubbed = await tx
        .update(messages)
        .set({ text: null, html: null, extractedText: null, extracted: null, rawKey: null, scrubbedAt: now })
        .where(and(inArray(messages.id, ids), isNull(messages.scrubbedAt)))
        .returning({ id: messages.id });
      result.scrubbed += scrubbed.length;
    });
    return rows.length;
  });

  // Stage 2: whole rows, then the threads they leave empty.
  await drain(async () => {
    const oldest = db
      .select({ id: messages.id })
      .from(messages)
      .where(and(isNotNull(messages.scrubbedAt), lt(messages.createdAt, deleteBefore)))
      .orderBy(asc(messages.createdAt))
      .limit(batch);
    const gone = await db.delete(messages).where(inArray(messages.id, oldest)).returning({ threadId: messages.threadId });
    result.deleted += gone.length;
    const threadIds = [...new Set(gone.map((g) => g.threadId))];
    if (threadIds.length) {
      const hasMessages = sql`exists (select 1 from ${messages} where ${messages.threadId} = ${threads.id})`;
      const emptied = await db
        .delete(threads)
        .where(and(inArray(threads.id, threadIds), sql`not ${hasMessages}`))
        .returning({ id: threads.id });
      result.threadsDeleted += emptied.length;
      // Threads that still have messages: keep message_count true to what's left.
      await db
        .update(threads)
        .set({ messageCount: sql`(select count(*)::int from ${messages} where ${messages.threadId} = ${threads.id})` })
        .where(inArray(threads.id, threadIds));
    }
    return gone.length;
  });

  // The outbox and delivery log. Deliveries cascade from their event, but are pruned by their own age too.
  await drain(async () => {
    const old = db.select({ id: deliveries.id }).from(deliveries).where(lt(deliveries.createdAt, deleteBefore)).limit(batch);
    const n = (await db.delete(deliveries).where(inArray(deliveries.id, old)).returning({ id: deliveries.id })).length;
    result.deliveriesDeleted += n;
    return n;
  });
  await drain(async () => {
    const old = db.select({ id: events.id }).from(events).where(lt(events.createdAt, deleteBefore)).limit(batch);
    const n = (await db.delete(events).where(inArray(events.id, old)).returning({ id: events.id })).length;
    result.eventsDeleted += n;
    return n;
  });

  const { complete, ...counts } = result;
  if (!complete || Object.values(counts).some(Boolean)) console.log(JSON.stringify({ event: "retention", ...result }));
  return result;
}
