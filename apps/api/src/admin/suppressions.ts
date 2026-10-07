import { schema, type Db } from "@send0/db";
import { and, eq } from "drizzle-orm";
import { AdminError, getOrg, result, type AdminResult, type WriteOptions } from "./common";

const { suppressions } = schema;

type Reason = (typeof suppressions.$inferSelect)["reason"];
export const SUPPRESSION_REASONS: readonly Reason[] = ["bounce", "complaint", "manual"];

function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new AdminError(`${email} isn't an email address.`);
  return e;
}

async function current(db: Db, orgId: string, email: string): Promise<Reason | null> {
  const [row] = await db
    .select({ reason: suppressions.reason })
    .from(suppressions)
    .where(and(eq(suppressions.orgId, orgId), eq(suppressions.email, email)));
  return row?.reason ?? null;
}

/** Stops the org sending to `email` (the send policy refuses suppressed recipients). An existing entry keeps its reason. */
export async function suppress(db: Db, orgId: string, email: string, reason: string, opts: WriteOptions): Promise<AdminResult> {
  if (!SUPPRESSION_REASONS.includes(reason as Reason))
    throw new AdminError(`The reason must be one of: ${SUPPRESSION_REASONS.join(", ")}.`);
  const org = await getOrg(db, orgId);
  const addr = normalizeEmail(email);
  const before = await current(db, org.id, addr);
  const res = result(
    `suppression ${addr} in org ${org.id}`,
    [{ field: "suppressed", from: before ?? "no", to: before ?? reason }],
    opts.apply,
  );
  if (res.applied) {
    await db
      .insert(suppressions)
      .values({ orgId: org.id, email: addr, reason: reason as Reason, createdAt: opts.now })
      .onConflictDoNothing();
  }
  return res;
}

export async function unsuppress(db: Db, orgId: string, email: string, opts: WriteOptions): Promise<AdminResult> {
  const org = await getOrg(db, orgId);
  const addr = normalizeEmail(email);
  const before = await current(db, org.id, addr);
  const res = result(`suppression ${addr} in org ${org.id}`, [{ field: "suppressed", from: before ?? "no", to: "no" }], opts.apply);
  if (res.applied) await db.delete(suppressions).where(and(eq(suppressions.orgId, org.id), eq(suppressions.email, addr)));
  return res;
}
