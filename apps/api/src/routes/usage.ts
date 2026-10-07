import { schema } from "@send0/db";
import { and, count, eq, gte, isNull, ne } from "drizzle-orm";
import { Hono } from "hono";
import { requireScope } from "../auth";
import { startOfUtcDay } from "../sending/policy";
import type { AppEnv } from "../types";
import { PLAN_INBOX_LIMITS } from "./inboxes";

const { orgs, inboxes, messages } = schema;

/** Mounted at /v1/usage: where the org stands against its plan today. */
export const usageRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const auth = c.get("auth");
  requireScope(auth, "read");
  const { db, now = () => new Date(), limits } = c.get("deps");
  const at = now();
  const [[org], [inboxCount], [sent]] = await Promise.all([
    db.select().from(orgs).where(eq(orgs.id, auth.orgId)),
    db
      .select({ n: count() })
      .from(inboxes)
      .where(and(eq(inboxes.orgId, auth.orgId), isNull(inboxes.deletedAt))),
    db
      .select({ n: count() })
      .from(messages)
      .where(
        and(
          eq(messages.orgId, auth.orgId),
          eq(messages.direction, "out"),
          ne(messages.status, "failed"),
          gte(messages.createdAt, startOfUtcDay(at)),
        ),
      ),
  ]);
  const resetsAt = new Date(startOfUtcDay(at).getTime() + 86_400_000);
  return c.json({
    object: "usage" as const,
    plan: org!.plan,
    inboxes: { used: inboxCount!.n, limit: limits.planInboxCap ? (PLAN_INBOX_LIMITS[org!.plan] ?? PLAN_INBOX_LIMITS.free!) : null },
    sends_today: { used: sent!.n, limit: limits.dailySendCap ? org!.dailySendLimit : null, resets_at: resetsAt.toISOString() },
    sending: {
      paused: !!org!.sendingPausedAt,
      reason: org!.sendingPausedReason,
      paused_at: org!.sendingPausedAt?.toISOString() ?? null,
    },
  });
});
