import { schema, type Db } from "@send0/db";
import { and, count, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { REPUTATION_STATUSES } from "./sending/ses-events";

const { orgs, messages } = schema;

type Plan = (typeof orgs.$inferSelect)["plan"];

/**
 * When an org has earned a higher daily send cap. The rates use the same definitions as PAUSE_RULES
 * (hard bounces and complaints over messages that left), with much stricter thresholds.
 */
export const RAISE_RULES = {
  /** The org must be older than this */
  minAgeDays: 3,
  /** Recent activity is judged over this many days */
  activityWindowDays: 7,
  /** At least this many outbound, non-failed messages in the activity window */
  minSent: 20,
  /** The busiest UTC day in the activity window used at least this share of the current cap */
  minBusiestDayShare: 0.8,
  /** Bounce and complaint rates are judged over this many days */
  rateWindowDays: 30,
  /** Raise only below these rates (2% hard bounces, 0.1% complaints) */
  maxBounceRate: 0.02,
  maxComplaintRate: 0.001,
};

/** The highest daily cap the automatic raise reaches on each plan. An operator can set more by hand. */
export const PLAN_SEND_CEILINGS: Record<Plan, number> = { free: 200, pro: 2_000, scale: 10_000 };

export interface LimitRaise {
  orgId: string;
  from: number;
  to: number;
}

/**
 * Doubles `daily_send_limit` (up to the plan's ceiling, never down) for every active, unpaused org
 * with a clean record that is actually using its cap. One UPDATE … FROM over aggregated subqueries,
 * so the hourly cron costs the same however many orgs there are. Logs `org.limit_raised` per org.
 */
export async function raiseSendCaps(
  db: Db,
  now: Date,
  opts: { rules?: Partial<typeof RAISE_RULES>; ceilings?: Partial<Record<Plan, number>> } = {},
): Promise<LimitRaise[]> {
  const r = { ...RAISE_RULES, ...opts.rules };
  const c = { ...PLAN_SEND_CEILINGS, ...opts.ceilings };
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400_000);

  // Outbound, non-failed messages per org per UTC day: the same count the daily cap enforces.
  const daily = db
    .select({ orgId: messages.orgId, n: count().as("n") })
    .from(messages)
    .where(and(eq(messages.direction, "out"), ne(messages.status, "failed"), gte(messages.createdAt, daysAgo(r.activityWindowDays))))
    .groupBy(messages.orgId, sql`date_trunc('day', ${messages.createdAt} at time zone 'UTC')`)
    .as("daily");
  const week = db
    .select({
      orgId: daily.orgId,
      sent: sql<number>`sum(${daily.n})`.as("sent_recent"),
      busiest: sql<number>`max(${daily.n})`.as("busiest_day"),
    })
    .from(daily)
    .groupBy(daily.orgId)
    .as("week");

  const month = db
    .select({
      orgId: messages.orgId,
      sent: sql<number>`count(*) filter (where ${inArray(messages.status, [...REPUTATION_STATUSES])})`.as("sent_rated"),
      bounced: sql<number>`count(*) filter (where ${messages.status} = 'bounced')`.as("bounced"),
      complained: sql<number>`count(*) filter (where ${messages.status} = 'complained')`.as("complained"),
    })
    .from(messages)
    .where(and(eq(messages.direction, "out"), gte(messages.createdAt, daysAgo(r.rateWindowDays))))
    .groupBy(messages.orgId)
    .as("month");

  const ceiling = sql<number>`(case ${orgs.plan} when 'free' then ${c.free}::int when 'pro' then ${c.pro}::int when 'scale' then ${c.scale}::int end)`;
  const eligible = db
    .select({ id: orgs.id, from: orgs.dailySendLimit, to: sql<number>`least(${orgs.dailySendLimit} * 2, ${ceiling})`.as("to_limit") })
    .from(orgs)
    .innerJoin(week, eq(week.orgId, orgs.id))
    .innerJoin(month, eq(month.orgId, orgs.id))
    .where(
      and(
        eq(orgs.status, "active"),
        isNull(orgs.sendingPausedAt),
        isNull(orgs.deletedAt),
        lt(orgs.createdAt, daysAgo(r.minAgeDays)),
        gte(week.sent, r.minSent),
        sql`${week.busiest} >= ${orgs.dailySendLimit} * ${r.minBusiestDayShare}::numeric`,
        // Strict "<" with no division: a month with nothing rated (sent = 0) never qualifies.
        sql`${month.bounced} < ${month.sent} * ${r.maxBounceRate}::numeric`,
        sql`${month.complained} < ${month.sent} * ${r.maxComplaintRate}::numeric`,
        // Already at (or set by hand above) the ceiling: leave it, so the cap is never lowered.
        lt(orgs.dailySendLimit, ceiling),
      ),
    )
    .as("eligible");

  const raised = await db
    .update(orgs)
    .set({ dailySendLimit: sql`${eligible.to}` })
    .from(eligible)
    // The limit is unchanged since the subquery read it: an overlapping run or a manual edit wins.
    .where(and(eq(orgs.id, eligible.id), eq(orgs.dailySendLimit, eligible.from)))
    .returning({ orgId: orgs.id, from: eligible.from, to: orgs.dailySendLimit });

  for (const row of raised) console.log(JSON.stringify({ event: "org.limit_raised", org_id: row.orgId, from: row.from, to: row.to }));
  return raised;
}
