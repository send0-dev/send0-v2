import { schema } from "@send0/db";

/** The public event envelope, identical over webhooks, SSE and the events table. */
export interface EventEnvelope {
  id: string;
  object: "event";
  type: string;
  created_at: string;
  inbox_id: string | null;
  data: Record<string, unknown>;
}

export function toEnvelope(e: Pick<typeof schema.events.$inferSelect, "id" | "type" | "inboxId" | "payload" | "createdAt">): EventEnvelope {
  return {
    id: e.id,
    object: "event",
    type: e.type,
    created_at: e.createdAt.toISOString(),
    inbox_id: e.inboxId,
    data: ((e.payload as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>,
  };
}

/** What the queue carries. */
export type QueueMessage = { kind: "fanout"; eventId: string } | { kind: "deliver"; deliveryId: string };

/** The bits of the Cloudflare bindings we use, so this stays testable outside Workers. */
export interface HubLike {
  notify(envelope: EventEnvelope): Promise<void>;
}
export interface HubNamespaceLike {
  idFromName(name: string): unknown;
  get(id: never): HubLike;
}
export interface QueueLike {
  send(message: QueueMessage, opts?: { delaySeconds?: number }): Promise<unknown>;
}

export const hubName = { inbox: (id: string) => `inbox:${id}`, org: (id: string) => `org:${id}` };

/**
 * After the event's transaction commits: push it to live listeners and queue webhook fan-out.
 * Never throws. If the queue send fails, the cron sweeper picks the event up from the outbox.
 */
export async function publish(
  bindings: { hub?: HubNamespaceLike; queue?: QueueLike },
  orgId: string,
  envelope: EventEnvelope,
): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (bindings.hub) {
    const hub = bindings.hub;
    const names = [hubName.org(orgId), ...(envelope.inbox_id ? [hubName.inbox(envelope.inbox_id)] : [])];
    for (const name of names) tasks.push(hub.get(hub.idFromName(name) as never).notify(envelope));
  }
  if (bindings.queue) tasks.push(bindings.queue.send({ kind: "fanout", eventId: envelope.id }));
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "rejected") console.error(JSON.stringify({ event: "publish.failed", event_id: envelope.id, error: String(r.reason) }));
  }
}
