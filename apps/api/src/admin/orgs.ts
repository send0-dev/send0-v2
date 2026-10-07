import { newId } from "@send0/core";
import { schema, type Db } from "@send0/db";
import { eq } from "drizzle-orm";
import { AdminError, getOrg, requireReason, result, type AdminResult, type WriteOptions } from "./common";

const { orgs, events } = schema;

/** The most a hand-set daily cap may be. Far above any plan, but stops a typo of extra zeros. */
export const MAX_DAILY_SEND_LIMIT = 1_000_000;

/**
 * Suspends an org: every API key and dashboard request for it is refused (auth.ts), so it can't
 * send or read. Inbound mail is still accepted. The reason goes in the operator's output only:
 * orgs have no column for it.
 */
export async function suspendOrg(db: Db, orgId: string, reason: string | undefined, opts: WriteOptions): Promise<AdminResult> {
  requireReason(reason);
  return setOrgStatus(db, orgId, "suspended", opts);
}

export async function unsuspendOrg(db: Db, orgId: string, opts: WriteOptions): Promise<AdminResult> {
  return setOrgStatus(db, orgId, "active", opts);
}

async function setOrgStatus(db: Db, orgId: string, status: "active" | "suspended", opts: WriteOptions): Promise<AdminResult> {
  const org = await getOrg(db, orgId);
  const res = result(`org ${org.id} (${org.name})`, [{ field: "status", from: org.status, to: status }], opts.apply);
  if (res.applied) await db.update(orgs).set({ status }).where(eq(orgs.id, org.id));
  return res;
}

/**
 * Pauses an org's sending by hand, the same state the bounce/complaint auto-pause sets, and
 * writes an org-wide `inbox.suspended` event (as the auto-pause does) for the outbox to deliver.
 */
export async function pauseSending(db: Db, orgId: string, reason: string | undefined, opts: WriteOptions): Promise<AdminResult> {
  const why = requireReason(reason);
  const org = await getOrg(db, orgId);
  const target = `org ${org.id} (${org.name})`;
  if (org.sendingPausedAt) return result(target, [], opts.apply); // already paused: keep the original time and reason

  const eventId = newId("evt");
  const res = result(
    target,
    [
      { field: "sending_paused_at", from: null, to: opts.now },
      { field: "sending_paused_reason", from: org.sendingPausedReason, to: why },
    ],
    opts.apply,
    eventId,
  );
  if (res.applied) {
    await db.transaction(async (tx) => {
      await tx.update(orgs).set({ sendingPausedAt: opts.now, sendingPausedReason: why }).where(eq(orgs.id, org.id));
      await tx.insert(events).values({
        id: eventId,
        orgId: org.id,
        inboxId: null,
        type: "inbox.suspended",
        payload: { data: { scope: "org", reason: why } },
        createdAt: opts.now,
      });
    });
  }
  return res;
}

export async function resumeSending(db: Db, orgId: string, opts: WriteOptions): Promise<AdminResult> {
  const org = await getOrg(db, orgId);
  const res = result(
    `org ${org.id} (${org.name})`,
    [
      { field: "sending_paused_at", from: org.sendingPausedAt, to: null },
      { field: "sending_paused_reason", from: org.sendingPausedReason, to: null },
    ],
    opts.apply,
  );
  if (res.applied) await db.update(orgs).set({ sendingPausedAt: null, sendingPausedReason: null }).where(eq(orgs.id, org.id));
  return res;
}

/** Sets `daily_send_limit` by hand. The hourly raise never lowers it, and skips caps above the plan ceiling. */
export async function setLimit(db: Db, orgId: string, limit: number, opts: WriteOptions): Promise<AdminResult> {
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_DAILY_SEND_LIMIT) {
    throw new AdminError(`The limit must be a whole number from 0 to ${MAX_DAILY_SEND_LIMIT}.`);
  }
  const org = await getOrg(db, orgId);
  const res = result(`org ${org.id} (${org.name})`, [{ field: "daily_send_limit", from: org.dailySendLimit, to: limit }], opts.apply);
  if (res.applied) await db.update(orgs).set({ dailySendLimit: limit }).where(eq(orgs.id, org.id));
  return res;
}
