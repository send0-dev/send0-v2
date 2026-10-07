import { schema, type Db } from "@send0/db";
import { and, isNotNull, lt } from "drizzle-orm";

/** Deleted workspaces are kept this long (in case of a mistake), then purged with everything in them. */
export const DELETED_ORG_RETENTION_MS = 30 * 24 * 3600_000;

/** Purges workspaces deleted more than 30 days ago. Every org-owned table cascades. Returns how many. */
export async function purgeDeletedOrgs(db: Db, now: Date): Promise<number> {
  const rows = await db
    .delete(schema.orgs)
    .where(and(isNotNull(schema.orgs.deletedAt), lt(schema.orgs.deletedAt, new Date(now.getTime() - DELETED_ORG_RETENTION_MS))))
    .returning({ id: schema.orgs.id });
  return rows.length;
}

export { raiseSendCaps, RAISE_RULES, PLAN_SEND_CEILINGS, type LimitRaise } from "./send-caps";
