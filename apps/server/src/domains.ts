import { newId } from "@send0/core";
import { schema, type Db } from "@send0/db";

/**
 * Makes sure every configured mail domain exists as a verified shared domain, so inboxes can be
 * created on it. Existing rows (matched case-insensitively by the unique index) are left alone.
 */
export async function seedMailDomains(db: Db, mailDomains: string[], now: Date): Promise<void> {
  if (!mailDomains.length) return;
  await db
    .insert(schema.domains)
    .values(mailDomains.map((name) => ({ id: newId("dom"), name, kind: "shared" as const, status: "verified" as const, verifiedAt: now })))
    .onConflictDoNothing();
}
