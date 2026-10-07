import type { Limits } from "@send0/config";
import { isReservedLocalPart } from "@send0/core";
import { schema, type Db } from "@send0/db";
import { and, count, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { ApiError, forbidden } from "../errors";

const { messages, suppressions } = schema;

export const MAX_RECIPIENTS = 50;

export interface SendContext {
  org: typeof schema.orgs.$inferSelect;
  inbox: typeof schema.inboxes.$inferSelect;
  /** Lowercased envelope recipients (to + cc + bcc) */
  recipients: string[];
  now: Date;
  /** Our receiving domains: reserved local parts on them can't be sent to */
  mailDomains: string[];
  limits: Limits;
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Every rule that decides whether a message may leave. Throws the first problem as an ApiError.
 * Order: account state, inbox state, recipients, reply-only, suppression, daily cap.
 * Plan-based rules apply only when ctx.limits enables them.
 */
export async function checkSendPolicy(db: Db, ctx: SendContext): Promise<void> {
  const { org, inbox, recipients, now, mailDomains, limits } = ctx;

  if (org.sendingPausedAt) {
    throw new ApiError(
      403,
      "sending_paused",
      `Sending is paused for this account: ${org.sendingPausedReason ?? "contact support@send0.dev"}. Receiving still works.`,
    );
  }
  if (inbox.status !== "active") throw forbidden(`This inbox is ${inbox.status} and can't send.`);
  if (inbox.mode === "sandbox") throw forbidden("Sandbox inboxes only receive.");
  if (recipients.length === 0) throw new ApiError(400, "invalid_request", "Add at least one recipient.", "to");
  if (recipients.length > MAX_RECIPIENTS)
    throw new ApiError(400, "invalid_request", `At most ${MAX_RECIPIENTS} recipients per message.`, "to");
  const reserved = recipients.find((r) => {
    const [local, domain] = r.split("@") as [string, string];
    return mailDomains.includes(domain) && isReservedLocalPart(local);
  });
  if (reserved) throw new ApiError(400, "invalid_request", `${reserved} can't receive mail.`, "to");

  // Free accounts are always reply-only, whatever the inbox says.
  const freePlanReplyOnly = limits.freePlanReplyOnly && org.plan === "free";
  if (inbox.sendPolicy === "reply_only" || freePlanReplyOnly) {
    const known = await db
      .selectDistinct({ email: sql<string>`lower(${messages.from}->>'email')` })
      .from(messages)
      .where(
        and(eq(messages.inboxId, inbox.id), eq(messages.direction, "in"), inArray(sql`lower(${messages.from}->>'email')`, recipients)),
      );
    const allowed = new Set(known.map((k) => k.email));
    const blocked = recipients.filter((r) => !allowed.has(r));
    if (blocked.length) {
      throw new ApiError(
        403,
        "recipient_not_allowed",
        `This inbox can only reply to people who emailed it first${freePlanReplyOnly ? " (free plan)" : ""}. Not allowed: ${blocked.join(", ")}`,
        "to",
      );
    }
  }

  const suppressed = await db
    .select({ email: suppressions.email, reason: suppressions.reason })
    .from(suppressions)
    .where(and(eq(suppressions.orgId, org.id), inArray(suppressions.email, recipients)));
  if (suppressed.length) {
    throw new ApiError(
      422,
      "recipient_suppressed",
      `Won't send to addresses that bounced or complained: ${suppressed.map((s) => `${s.email} (${s.reason})`).join(", ")}`,
      "to",
    );
  }

  if (limits.dailySendCap) {
    const [{ sentToday }] = (await db
      .select({ sentToday: count() })
      .from(messages)
      .where(
        and(
          eq(messages.orgId, org.id),
          eq(messages.direction, "out"),
          ne(messages.status, "failed"),
          gte(messages.createdAt, startOfUtcDay(now)),
        ),
      )) as [{ sentToday: number }];
    if (sentToday >= org.dailySendLimit) {
      throw new ApiError(
        429,
        "daily_limit_reached",
        `This account can send ${org.dailySendLimit} messages per day (UTC). The limit rises as your sending record builds.`,
      );
    }
  }
}
