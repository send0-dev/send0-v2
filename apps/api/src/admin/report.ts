import { schema, type Db } from "@send0/db";
import { and, asc, count, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { PAUSE_RULES, REPUTATION_STATUSES } from "../sending/ses-events";
import { startOfUtcDay } from "../sending/policy";
import { AdminError, getOrg, type OrgRow } from "./common";

const { orgs, users, members, inboxes, domains, messages } = schema;

export interface OrgReport {
  org: OrgRow;
  sends: { today: number; last7Days: number };
  /** Over PAUSE_RULES.windowDays, with the auto-pause definitions */
  rates: { windowDays: number; rated: number; bounced: number; complained: number; bounceRate: number; complaintRate: number };
  inboxes: { id: string; address: string; status: string; sendPolicy: string; mode: string }[];
  members: { email: string; role: string }[];
}

/**
 * The orgs an operator means by `query`: an org id, an inbox id, a member's email (every workspace
 * they belong to) or an inbox address. Throws AdminError when nothing matches.
 */
export async function findOrgIds(db: Db, query: string): Promise<string[]> {
  const q = query.trim();
  const ids = new Set<string>();
  if (q.startsWith("org_")) {
    const rows = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.id, q));
    rows.forEach((r) => ids.add(r.id));
  } else if (q.startsWith("ibx_")) {
    const rows = await db.select({ id: inboxes.orgId }).from(inboxes).where(eq(inboxes.id, q));
    rows.forEach((r) => ids.add(r.id));
  } else if (q.includes("@")) {
    const email = q.toLowerCase();
    const viaMember = await db
      .select({ id: members.orgId })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(sql`lower(${users.email}) = ${email}`);
    const [local, domain] = email.split("@") as [string, string];
    const viaInbox = await db
      .select({ id: inboxes.orgId })
      .from(inboxes)
      .innerJoin(domains, eq(domains.id, inboxes.domainId))
      .where(and(sql`lower(${inboxes.localPart}) = ${local}`, sql`lower(${domains.name}) = ${domain}`));
    [...viaMember, ...viaInbox].forEach((r) => ids.add(r.id));
  }
  if (!ids.size) throw new AdminError(`No org matches ${query} (try an org_ or ibx_ id, a member's email or an inbox address).`);
  return [...ids].sort();
}

/** Everything an operator needs to judge an org's standing, read in a handful of queries. */
export async function orgReport(db: Db, orgId: string, now: Date): Promise<OrgReport> {
  const org = await getOrg(db, orgId);
  const outbound = and(eq(messages.orgId, org.id), eq(messages.direction, "out"));
  const since = (days: number) => new Date(now.getTime() - days * 86400_000);

  // Sends counted as the daily cap counts them: outbound, not failed.
  const [sends] = await db
    .select({
      today: sql<number>`count(*) filter (where ${messages.createdAt} >= ${startOfUtcDay(now).toISOString()}::timestamptz)`.mapWith(Number),
      last7Days: count(),
    })
    .from(messages)
    .where(and(outbound, ne(messages.status, "failed"), gte(messages.createdAt, since(7))));

  const byStatus = await db
    .select({ status: messages.status, n: count() })
    .from(messages)
    .where(and(outbound, gte(messages.createdAt, since(PAUSE_RULES.windowDays)), inArray(messages.status, [...REPUTATION_STATUSES])))
    .groupBy(messages.status);
  const by = Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)]));
  const rated = Object.values(by).reduce((a, b) => a + b, 0);
  const bounced = by.bounced ?? 0;
  const complained = by.complained ?? 0;

  const inboxRows = await db
    .select({
      id: inboxes.id,
      localPart: inboxes.localPart,
      domain: domains.name,
      status: inboxes.status,
      sendPolicy: inboxes.sendPolicy,
      mode: inboxes.mode,
    })
    .from(inboxes)
    .innerJoin(domains, eq(domains.id, inboxes.domainId))
    .where(eq(inboxes.orgId, org.id))
    .orderBy(asc(inboxes.createdAt));

  const memberRows = await db
    .select({ email: users.email, role: members.role })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.orgId, org.id))
    .orderBy(asc(members.createdAt));

  return {
    org,
    sends: { today: Number(sends?.today ?? 0), last7Days: Number(sends?.last7Days ?? 0) },
    rates: {
      windowDays: PAUSE_RULES.windowDays,
      rated,
      bounced,
      complained,
      bounceRate: rated ? bounced / rated : 0,
      complaintRate: rated ? complained / rated : 0,
    },
    inboxes: inboxRows.map((i) => ({
      id: i.id,
      address: `${i.localPart}@${i.domain}`,
      status: i.status,
      sendPolicy: i.sendPolicy,
      mode: i.mode,
    })),
    members: memberRows,
  };
}

const pct = (r: number) => `${(r * 100).toFixed(2)}%`;
const iso = (d: Date | null) => d?.toISOString() ?? "-";

/** The report as plain text lines for the terminal. */
export function formatOrgReport(r: OrgReport): string[] {
  const { org, sends, rates } = r;
  const active = r.inboxes.filter((i) => i.status !== "deleted").length;
  return [
    `${org.id}  ${org.name}`,
    `  plan ${org.plan} · status ${org.status} · created ${iso(org.createdAt)}${org.deletedAt ? ` · DELETED ${iso(org.deletedAt)}` : ""}`,
    `  daily_send_limit ${org.dailySendLimit} · sent today ${sends.today} · last 7 days ${sends.last7Days}`,
    org.sendingPausedAt
      ? `  sending PAUSED since ${iso(org.sendingPausedAt)}: ${org.sendingPausedReason ?? "(no reason)"}`
      : "  sending not paused",
    `  last ${rates.windowDays} days: ${rates.rated} rated · bounces ${rates.bounced} (${pct(rates.bounceRate)}) · complaints ${rates.complained} (${pct(rates.complaintRate)})`,
    `  inboxes: ${active} (${r.inboxes.length} including deleted)`,
    ...r.inboxes.map((i) => `    ${i.id}  ${i.address}  ${i.status}  ${i.sendPolicy}${i.mode === "sandbox" ? "  sandbox" : ""}`),
    `  members: ${r.members.length}`,
    ...r.members.map((m) => `    ${m.email}  ${m.role}`),
  ];
}
