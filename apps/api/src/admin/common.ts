import { schema, type Db } from "@send0/db";
import { eq } from "drizzle-orm";

/** A problem the operator must fix (unknown id, bad argument). The CLI prints the message and exits non-zero. */
export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminError";
  }
}

/** One field before and after a write command. */
export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/** What a write command did (or, on a dry run, would do). */
export interface AdminResult {
  /** "org org_…", "inbox ibx_… (bot@send0.email)", … */
  target: string;
  /** Empty when the target is already in the requested state */
  changes: FieldChange[];
  /** True only when the changes were written (`apply` and something to change) */
  applied: boolean;
  /** The outbox event written alongside the change, if any */
  eventId?: string;
}

/** Every write command takes these. Without `apply` it reads, plans and writes nothing. */
export interface WriteOptions {
  apply: boolean;
  now: Date;
}

export type OrgRow = typeof schema.orgs.$inferSelect;

export async function getOrg(db: Db, orgId: string): Promise<OrgRow> {
  const [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId));
  if (!org) throw new AdminError(`No org with id ${orgId}.`);
  return org;
}

export function requireReason(reason: string | undefined): string {
  const r = reason?.trim();
  if (!r) throw new AdminError('A reason is required: --reason "…".');
  return r;
}

/** Builds the result, keeping only fields whose value actually changes. */
export function result(target: string, changes: FieldChange[], apply: boolean, eventId?: string): AdminResult {
  const real = changes.filter((c) => c.from !== c.to);
  return { target, changes: real, applied: apply && real.length > 0, ...(eventId && apply && real.length ? { eventId } : {}) };
}
