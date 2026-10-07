import { schema } from "@send0/db";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { loadInbox } from "../access";
import { requireScope } from "../auth";
import { startOfUtcDay } from "../sending/policy";
import type { AppEnv } from "../types";
import { validate } from "../validation";

const { messages, inboxes } = schema;

export const statsQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(14),
  inbox_id: z.string().max(40).optional(),
});

const DAY_MS = 86_400_000;

/** Mounted at /v1/stats: mail per UTC day, for charts. Days with no mail are included as zeros. */
export const statsRoutes = new Hono<AppEnv>().get("/", validate("query", statsQuery), async (c) => {
  const auth = c.get("auth");
  requireScope(auth, "read");
  const { days, inbox_id } = c.req.valid("query");
  if (inbox_id) await loadInbox(c, inbox_id);
  const { db, now = () => new Date() } = c.get("deps");
  const from = new Date(startOfUtcDay(now()).getTime() - (days - 1) * DAY_MS);

  const day = sql<string>`to_char(date_trunc('day', ${messages.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      day,
      received: sql<number>`count(*) filter (where ${messages.direction} = 'in')`.mapWith(Number),
      sent: sql<number>`count(*) filter (where ${messages.direction} = 'out' and ${messages.status} <> 'failed')`.mapWith(Number),
      delivered: sql<number>`count(*) filter (where ${messages.status} = 'delivered')`.mapWith(Number),
      bounced: sql<number>`count(*) filter (where ${messages.status} in ('bounced', 'complained'))`.mapWith(Number),
      failed: sql<number>`count(*) filter (where ${messages.status} = 'failed')`.mapWith(Number),
    })
    .from(messages)
    .innerJoin(inboxes, eq(inboxes.id, messages.inboxId))
    .where(
      and(
        eq(messages.orgId, auth.orgId),
        isNull(inboxes.deletedAt),
        gte(messages.createdAt, from),
        inbox_id ? eq(messages.inboxId, inbox_id) : undefined,
        auth.inboxIds ? inArray(messages.inboxId, auth.inboxIds.length ? auth.inboxIds : [""]) : undefined,
      ),
    )
    .groupBy(day);

  const byDay = new Map(rows.map((r) => [r.day, r]));
  const series = Array.from({ length: days }, (_, i) => {
    const date = new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    const r = byDay.get(date);
    return {
      date,
      received: r?.received ?? 0,
      sent: r?.sent ?? 0,
      delivered: r?.delivered ?? 0,
      bounced: r?.bounced ?? 0,
      failed: r?.failed ?? 0,
    };
  });
  const totals = series.reduce(
    (t, d) => ({
      received: t.received + d.received,
      sent: t.sent + d.sent,
      delivered: t.delivered + d.delivered,
      bounced: t.bounced + d.bounced,
      failed: t.failed + d.failed,
    }),
    { received: 0, sent: 0, delivered: 0, bounced: 0, failed: 0 },
  );
  return c.json({ object: "stats" as const, from: from.toISOString(), days: series, totals });
});
