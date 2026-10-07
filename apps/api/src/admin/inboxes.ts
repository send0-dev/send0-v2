import { newId } from "@send0/core";
import { schema, type Db } from "@send0/db";
import { eq } from "drizzle-orm";
import { AdminError, requireReason, result, type AdminResult, type WriteOptions } from "./common";

const { inboxes, domains, events } = schema;

async function getInbox(db: Db, inboxId: string) {
  const [row] = await db
    .select({ inbox: inboxes, domain: domains.name })
    .from(inboxes)
    .innerJoin(domains, eq(domains.id, inboxes.domainId))
    .where(eq(inboxes.id, inboxId));
  if (!row) throw new AdminError(`No inbox with id ${inboxId}.`);
  if (row.inbox.status === "deleted") throw new AdminError(`Inbox ${inboxId} is deleted.`);
  return { ...row.inbox, address: `${row.inbox.localPart}@${row.domain}` };
}

/**
 * Suspends one inbox: inbound mail to it is refused (5.2.1) and it can't send. Writes an
 * `inbox.suspended` event in the same transaction; the outbox sweep delivers it to webhooks.
 */
export async function suspendInbox(db: Db, inboxId: string, reason: string | undefined, opts: WriteOptions): Promise<AdminResult> {
  const why = requireReason(reason);
  const inbox = await getInbox(db, inboxId);
  const eventId = newId("evt");
  const res = result(
    `inbox ${inbox.id} (${inbox.address})`,
    [{ field: "status", from: inbox.status, to: "suspended" }],
    opts.apply,
    eventId,
  );
  if (res.applied) {
    await db.transaction(async (tx) => {
      await tx.update(inboxes).set({ status: "suspended" }).where(eq(inboxes.id, inbox.id));
      await tx.insert(events).values({
        id: eventId,
        orgId: inbox.orgId,
        inboxId: inbox.id,
        type: "inbox.suspended",
        payload: { data: { scope: "inbox", reason: why, address: inbox.address } },
        createdAt: opts.now,
      });
    });
  }
  return res;
}

export async function unsuspendInbox(db: Db, inboxId: string, opts: WriteOptions): Promise<AdminResult> {
  const inbox = await getInbox(db, inboxId);
  const res = result(`inbox ${inbox.id} (${inbox.address})`, [{ field: "status", from: inbox.status, to: "active" }], opts.apply);
  if (res.applied) await db.update(inboxes).set({ status: "active" }).where(eq(inboxes.id, inbox.id));
  return res;
}
