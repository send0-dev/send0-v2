import { schema, type Db } from "@send0/db";
import { and, eq, isNull, sql } from "drizzle-orm";

const { inboxes, domains } = schema;

export interface InboxRecord {
  id: string;
  orgId: string;
  status: "active" | "suspended" | "deleted";
  address: string;
  sendPolicy: "open" | "reply_only" | "approval";
}

/** The inbox behind an address, or null. Deleted inboxes are treated as unknown. */
export async function findInboxByAddress(db: Db, localPart: string, domain: string): Promise<InboxRecord | null> {
  const [row] = await db
    .select({
      id: inboxes.id,
      orgId: inboxes.orgId,
      status: inboxes.status,
      localPart: inboxes.localPart,
      domain: domains.name,
      sendPolicy: inboxes.sendPolicy,
    })
    .from(inboxes)
    .innerJoin(domains, eq(domains.id, inboxes.domainId))
    .where(
      and(
        sql`lower(${domains.name}) = ${domain.toLowerCase()}`,
        sql`lower(${inboxes.localPart}) = ${localPart.toLowerCase()}`,
        isNull(inboxes.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    status: row.status,
    address: `${row.localPart}@${row.domain}`,
    sendPolicy: row.sendPolicy,
  };
}
