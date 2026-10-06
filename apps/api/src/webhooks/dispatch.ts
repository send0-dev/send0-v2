import { newId, signWebhook } from "@send0/core";
import { schema, type Db } from "@send0/db";
import { toEnvelope, type QueueLike } from "@send0/pipeline";
import { and, arrayContains, eq, isNull, lt, or, sql } from "drizzle-orm";

const { events, webhooks, deliveries } = schema;

/** Seconds to wait before attempt 2, 3, … About 24 hours in total, then the delivery fails. */
export const RETRY_SCHEDULE_S = [30, 120, 600, 1800, 3600, 7200, 14400, 28800, 28800];
export const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_ERROR_LENGTH = 500;

export type AttemptOutcome =
  | { status: "succeeded" }
  | { status: "retry"; delaySeconds: number }
  | { status: "failed"; reason: string }
  | { status: "skipped"; reason: string };

/**
 * Creates one delivery per matching enabled webhook and marks the event dispatched.
 * Idempotent: running twice for the same event creates no duplicates.
 * Returns the ids of deliveries that still need an attempt.
 */
export async function fanOut(db: Db, eventId: string, now: Date): Promise<string[]> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) return [];

  const hooks = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(
      and(
        eq(webhooks.orgId, event.orgId),
        eq(webhooks.status, "enabled"),
        or(arrayContains(webhooks.events, [event.type]), arrayContains(webhooks.events, ["*"])),
        event.inboxId ? or(isNull(webhooks.inboxIds), arrayContains(webhooks.inboxIds, [event.inboxId])) : undefined,
      ),
    );

  let ids: string[] = [];
  if (hooks.length) {
    await db
      .insert(deliveries)
      .values(hooks.map((h) => ({ id: newId("dlv"), orgId: event.orgId, webhookId: h.id, eventId: event.id, nextAttemptAt: now })))
      .onConflictDoNothing();
    ids = (
      await db
        .select({ id: deliveries.id })
        .from(deliveries)
        .where(and(eq(deliveries.eventId, event.id), eq(deliveries.status, "pending")))
    ).map((d) => d.id);
  }
  await db.update(events).set({ dispatchedAt: now }).where(and(eq(events.id, event.id), isNull(events.dispatchedAt)));
  return ids;
}

/** One HTTP attempt for one delivery, with the outcome recorded on the delivery row. */
export async function attemptDelivery(
  db: Db,
  deliveryId: string,
  opts: { fetch?: typeof fetch; now?: () => Date } = {},
): Promise<AttemptOutcome> {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? (() => new Date());

  const [row] = await db
    .select({ delivery: deliveries, webhook: webhooks, event: events })
    .from(deliveries)
    .innerJoin(webhooks, eq(webhooks.id, deliveries.webhookId))
    .innerJoin(events, eq(events.id, deliveries.eventId))
    .where(eq(deliveries.id, deliveryId));
  if (!row) return { status: "skipped", reason: "delivery not found" };
  const { delivery, webhook, event } = row;
  if (delivery.status !== "pending") return { status: "skipped", reason: `already ${delivery.status}` };
  if (webhook.status !== "enabled") {
    await db.update(deliveries).set({ status: "failed", lastError: "Webhook is disabled." }).where(eq(deliveries.id, delivery.id));
    return { status: "failed", reason: "webhook disabled" };
  }

  const body = JSON.stringify(toEnvelope(event));
  const started = now();
  const timestamp = Math.floor(started.getTime() / 1000);
  let statusCode: number | null = null;
  let error: string | null = null;
  try {
    const res = await doFetch(webhook.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "user-agent": "send0-webhooks/1.0 (+https://send0.dev)",
        "send0-signature": await signWebhook(webhook.secret, body, timestamp),
        "send0-event-id": event.id,
        "send0-event-type": event.type,
        "send0-delivery-id": delivery.id,
      },
      body,
    });
    statusCode = res.status;
    if (!res.ok) error = `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, MAX_ERROR_LENGTH)}`;
  } catch (err) {
    error = (err instanceof Error && err.name === "TimeoutError" ? `Timed out after ${DELIVERY_TIMEOUT_MS / 1000}s` : String(err)).slice(0, MAX_ERROR_LENGTH);
  }

  const attempts = delivery.attempts + 1;
  const durationMs = now().getTime() - started.getTime();
  const base = { attempts, lastStatusCode: statusCode, lastError: error, lastDurationMs: durationMs };

  if (!error) {
    await db.update(deliveries).set({ ...base, status: "succeeded", nextAttemptAt: null }).where(eq(deliveries.id, delivery.id));
    return { status: "succeeded" };
  }
  const delay = RETRY_SCHEDULE_S[attempts - 1];
  if (delay === undefined) {
    await db.update(deliveries).set({ ...base, status: "failed", nextAttemptAt: null }).where(eq(deliveries.id, delivery.id));
    return { status: "failed", reason: error };
  }
  await db
    .update(deliveries)
    .set({ ...base, nextAttemptAt: new Date(now().getTime() + delay * 1000) })
    .where(eq(deliveries.id, delivery.id));
  return { status: "retry", delaySeconds: delay };
}

/** Process one queue message end to end: fan out and/or attempt, scheduling retries on the queue. */
export async function processQueueMessage(
  db: Db,
  queue: QueueLike,
  msg: { kind: "fanout"; eventId: string } | { kind: "deliver"; deliveryId: string },
  opts: { fetch?: typeof fetch; now?: () => Date } = {},
): Promise<void> {
  const now = opts.now ?? (() => new Date());
  const ids = msg.kind === "fanout" ? await fanOut(db, msg.eventId, now()) : [msg.deliveryId];
  for (const id of ids) {
    const outcome = await attemptDelivery(db, id, opts);
    if (outcome.status === "retry") await queue.send({ kind: "deliver", deliveryId: id }, { delaySeconds: outcome.delaySeconds });
  }
}

/**
 * Safety net for the outbox: events never handed to the queue (a failed send after commit)
 * and retries whose queue message was lost. Runs on cron and after queue batches.
 */
export async function sweep(db: Db, queue: QueueLike, now: Date): Promise<{ events: number; deliveries: number }> {
  const stale = new Date(now.getTime() - 60_000);
  const lost = new Date(now.getTime() - 10 * 60_000);
  const undispatched = await db
    .select({ id: events.id })
    .from(events)
    .where(and(isNull(events.dispatchedAt), lt(events.createdAt, stale)))
    .limit(100);
  const overdue = await db
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(and(eq(deliveries.status, "pending"), lt(deliveries.nextAttemptAt, lost)))
    .limit(100);
  for (const e of undispatched) await queue.send({ kind: "fanout", eventId: e.id });
  for (const d of overdue) {
    // Push the due time forward so the next sweep doesn't enqueue it again while it's in flight.
    await db.update(deliveries).set({ nextAttemptAt: sql`now()` }).where(eq(deliveries.id, d.id));
    await queue.send({ kind: "deliver", deliveryId: d.id });
  }
  return { events: undispatched.length, deliveries: overdue.length };
}
