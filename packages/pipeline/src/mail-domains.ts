import { newId } from "@send0/core";
import { schema, type Db } from "@send0/db";
import { inArray, sql } from "drizzle-orm";

/**
 * Makes sure every configured mail domain exists as a verified shared domain, so inboxes can be
 * created on it. Existing rows (matched case-insensitively by the unique index) are left alone, but
 * one that isn't shared and verified gets a JSON warning, since inboxes there may not work.
 */
export async function seedMailDomains(db: Db, mailDomains: string[], now: Date): Promise<void> {
  if (!mailDomains.length) return;
  await db
    .insert(schema.domains)
    .values(mailDomains.map((name) => ({ id: newId("dom"), name, kind: "shared" as const, status: "verified" as const, verifiedAt: now })))
    .onConflictDoNothing();
  const rows = await db
    .select({ id: schema.domains.id, name: schema.domains.name, kind: schema.domains.kind, status: schema.domains.status })
    .from(schema.domains)
    .where(
      inArray(
        sql`lower(${schema.domains.name})`,
        mailDomains.map((d) => d.toLowerCase()),
      ),
    );
  for (const r of rows) {
    if (r.kind === "shared" && r.status === "verified") continue;
    console.warn(
      JSON.stringify({
        event: "mail_domain.unexpected_row",
        level: "warn",
        domain: r.name,
        domain_id: r.id,
        kind: r.kind,
        status: r.status,
        message: "A configured mail domain exists but isn't a verified shared domain; it was left unchanged.",
      }),
    );
  }
}
