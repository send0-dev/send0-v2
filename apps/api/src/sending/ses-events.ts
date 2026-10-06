import { newId } from "@send0/core";
import { schema } from "@send0/db";
import { serializeMessage, toEnvelope } from "@send0/pipeline";
import { and, count, eq, gte, inArray, isNull } from "drizzle-orm";
import type { AppDeps } from "../types";

const { messages, suppressions, orgs, events } = schema;

/** Auto-pause thresholds over the last 30 days, once there's enough volume to judge. */
export const PAUSE_RULES = { windowDays: 30, minSent: 20, maxComplaintRate: 0.003, maxBounceRate: 0.05 };

/** The parts of an SES event (via SNS) we use. */
export interface SesEvent {
  eventType: "Send" | "Delivery" | "Bounce" | "Complaint" | "Reject" | "RenderingFailure" | "DeliveryDelay" | "Subscription" | string;
  mail: { messageId: string; tags?: Record<string, string[]> };
  bounce?: { bounceType: "Permanent" | "Transient" | "Undetermined"; bounceSubType?: string; bouncedRecipients: { emailAddress: string; diagnosticCode?: string }[] };
  complaint?: { complainedRecipients: { emailAddress: string }[]; complaintFeedbackType?: string };
  delivery?: { recipients: string[]; smtpResponse?: string };
  reject?: { reason?: string };
  failure?: { errorMessage?: string };
}

type Status = typeof messages.$inferSelect.status;
// Never move a message "backwards" (a late Delivery must not hide an earlier Complaint).
const RANK: Record<Status, number> = { received: 0, queued: 1, sent: 2, failed: 3, delivered: 3, bounced: 4, complained: 5 };

export async function handleSesEvent(deps: AppDeps, evt: SesEvent): Promise<{ handled: boolean; status?: Status }> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const msgId = evt.mail.tags?.msg_id?.[0];
  const [msg] = msgId
    ? await db.select().from(messages).where(eq(messages.id, msgId))
    : await db.select().from(messages).where(eq(messages.providerMessageId, evt.mail.messageId));
  if (!msg) return { handled: false };

  let status: Status | null = null;
  let type: string | null = null;
  let detail: Record<string, unknown> = {};
  let suppress: { emails: string[]; reason: "bounce" | "complaint" } | null = null;

  switch (evt.eventType) {
    case "Delivery":
      status = "delivered";
      type = "message.delivered";
      detail = { delivery: { recipients: evt.delivery?.recipients ?? [], smtp_response: evt.delivery?.smtpResponse ?? null } };
      break;
    case "Bounce": {
      const recipients = (evt.bounce?.bouncedRecipients ?? []).map((r) => r.emailAddress.toLowerCase());
      const permanent = evt.bounce?.bounceType === "Permanent";
      type = "message.bounced";
      detail = { bounce: { type: evt.bounce?.bounceType ?? "Undetermined", sub_type: evt.bounce?.bounceSubType ?? null, recipients } };
      if (permanent) {
        status = "bounced";
        suppress = { emails: recipients, reason: "bounce" };
      }
      break;
    }
    case "Complaint": {
      const recipients = (evt.complaint?.complainedRecipients ?? []).map((r) => r.emailAddress.toLowerCase());
      status = "complained";
      type = "message.complained";
      detail = { complaint: { recipients, feedback_type: evt.complaint?.complaintFeedbackType ?? null } };
      suppress = { emails: recipients, reason: "complaint" };
      break;
    }
    case "Reject":
    case "RenderingFailure":
      status = "failed";
      detail = { error: evt.reject?.reason ?? evt.failure?.errorMessage ?? evt.eventType };
      break;
    default:
      return { handled: true }; // Send, DeliveryDelay, Subscription: nothing to record
  }

  let current = msg;
  if (status && RANK[status] > RANK[msg.status]) {
    const [updated] = await db
      .update(messages)
      .set({ status, ...(status === "failed" ? { error: String(detail.error).slice(0, 500) } : {}) })
      .where(eq(messages.id, msg.id))
      .returning();
    current = updated!;
  }

  if (suppress?.emails.length) {
    await db
      .insert(suppressions)
      .values(suppress.emails.map((email) => ({ orgId: msg.orgId, email, reason: suppress!.reason, createdAt: now })))
      .onConflictDoNothing();
  }

  if (type) {
    const row = { id: newId("evt"), orgId: msg.orgId, inboxId: msg.inboxId, type, payload: { data: { ...serializeMessage(current, []), ...detail } }, createdAt: now };
    await db.insert(events).values(row);
    await deps.publish?.(msg.orgId, toEnvelope(row));
  }

  if (suppress) await maybePauseSending(deps, msg.orgId, msg.inboxId, now);
  return { handled: true, status: current.status };
}

/** Pauses an org's sending when complaints or hard bounces cross the thresholds. */
export async function maybePauseSending(deps: AppDeps, orgId: string, inboxId: string, now: Date): Promise<boolean> {
  const { db } = deps;
  const since = new Date(now.getTime() - PAUSE_RULES.windowDays * 86400_000);
  const rows = await db
    .select({ status: messages.status, n: count() })
    .from(messages)
    .where(and(eq(messages.orgId, orgId), eq(messages.direction, "out"), gte(messages.createdAt, since), inArray(messages.status, ["sent", "delivered", "bounced", "complained"])))
    .groupBy(messages.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  const sent = Object.values(by).reduce((a, b) => a + b, 0);
  if (sent < PAUSE_RULES.minSent) return false;
  const complaintRate = (by.complained ?? 0) / sent;
  const bounceRate = (by.bounced ?? 0) / sent;

  let reason: string | null = null;
  if (complaintRate > PAUSE_RULES.maxComplaintRate) reason = `complaint rate ${(complaintRate * 100).toFixed(2)}% is over ${PAUSE_RULES.maxComplaintRate * 100}%`;
  else if (bounceRate > PAUSE_RULES.maxBounceRate) reason = `hard-bounce rate ${(bounceRate * 100).toFixed(1)}% is over ${PAUSE_RULES.maxBounceRate * 100}%`;
  if (!reason) return false;

  const paused = await db
    .update(orgs)
    .set({ sendingPausedAt: now, sendingPausedReason: reason })
    .where(and(eq(orgs.id, orgId), isNull(orgs.sendingPausedAt)))
    .returning({ id: orgs.id });
  if (!paused.length) return false; // already paused

  const row = {
    id: newId("evt"),
    orgId,
    inboxId,
    type: "inbox.suspended",
    payload: { data: { scope: "org", reason, complaint_rate: complaintRate, bounce_rate: bounceRate, sent_30d: sent } },
    createdAt: now,
  };
  await db.insert(events).values(row);
  await deps.publish?.(orgId, toEnvelope(row));
  console.log(JSON.stringify({ event: "sending.paused", org_id: orgId, reason }));
  return true;
}

