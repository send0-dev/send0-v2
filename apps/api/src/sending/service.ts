import { MailerError } from "@send0/adapters/mailer";
import { buildMime, displayNameFromLocalPart, newId, normalizeSubject, rfcMessageId } from "@send0/core";
import { schema, type MailboxJson } from "@send0/db";
import { serializeMessage, toEnvelope } from "@send0/pipeline";
import { eq, sql } from "drizzle-orm";
import { ApiError } from "../errors";
import type { AppDeps, AuthContext } from "../types";
import { checkSendPolicy } from "./policy";

const { orgs, threads, messages, drafts, events, usage } = schema;

type InboxRow = typeof schema.inboxes.$inferSelect;

/** Everything needed to send, independent of whether it came from /messages, /reply, /forward or a draft. */
export interface SendPayload {
  kind: "new" | "reply" | "forward";
  to: MailboxJson[];
  cc: MailboxJson[];
  bcc: MailboxJson[];
  subject: string;
  text: string | null;
  html: string | null;
  /** Thread to append to (replies); null starts a new thread */
  threadId: string | null;
  inReplyTo: string | null;
  references: string[];
  /** The message this replies to or forwards */
  parentMessageId: string | null;
}

export type SendResult =
  | { kind: "message"; message: ReturnType<typeof serializeMessage> }
  | { kind: "draft"; draft: ReturnType<typeof serializeDraft> };

export const serializeDraft = (d: typeof drafts.$inferSelect) => ({
  object: "draft" as const,
  id: d.id,
  inbox_id: d.inboxId,
  thread_id: d.threadId,
  status: d.status,
  to: (d.payload as unknown as SendPayload).to,
  cc: (d.payload as unknown as SendPayload).cc,
  bcc: (d.payload as unknown as SendPayload).bcc,
  subject: (d.payload as unknown as SendPayload).subject,
  text: (d.payload as unknown as SendPayload).text,
  html: (d.payload as unknown as SendPayload).html,
  kind: (d.payload as unknown as SendPayload).kind,
  decided_by: d.decidedBy,
  decided_at: d.decidedAt?.toISOString() ?? null,
  created_at: d.createdAt.toISOString(),
});

const lower = (list: MailboxJson[]) => list.map((m) => m.email.toLowerCase());

async function recordEvent(
  deps: AppDeps,
  orgId: string,
  inboxId: string | null,
  type: string,
  data: Record<string, unknown>,
  at: Date
) {
  const row = {
    id: newId("evt"),
    orgId,
    inboxId,
    type,
    payload: { data },
    createdAt: at,
  };
  await deps.db.insert(events).values(row);
  const envelope = toEnvelope(row);
  const publishing = deps.publish?.(orgId, envelope);
  if (publishing)
    deps.waitUntil ? deps.waitUntil(publishing) : await publishing;
  return envelope;
}

/**
 * Sends (or, for approval inboxes, drafts) one message.
 * `approved` is set when an admin approves a draft, which skips the approval step.
 */
export async function send(
  deps: AppDeps,
  auth: AuthContext,
  inbox: InboxRow,
  domain: string,
  payload: SendPayload,
  opts: { approved?: boolean } = {}
): Promise<SendResult> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const [org] = await db.select().from(orgs).where(eq(orgs.id, auth.orgId));
  if (!org) throw new ApiError(404, "not_found", "Organization not found.");

  const recipients = [
    ...new Set([
      ...lower(payload.to),
      ...lower(payload.cc),
      ...lower(payload.bcc),
    ]),
  ];
  await checkSendPolicy(db, { org, inbox, recipients, now });

  if (inbox.sendPolicy === "approval" && !opts.approved) {
    const [draft] = await db
      .insert(drafts)
      .values({
        id: newId("drf"),
        orgId: org.id,
        inboxId: inbox.id,
        threadId: payload.threadId,
        payload: payload as unknown as Record<string, unknown>,
        createdAt: now,
      })
      .returning();
    const serialized = serializeDraft(draft!);
    await recordEvent(deps, org.id, inbox.id, "draft.created", serialized, now);
    return { kind: "draft", draft: serialized };
  }

  const address = `${inbox.localPart}@${domain}`;
  const id = newId("msg");
  const rfcId = rfcMessageId(id, domain);
  const from: MailboxJson = { name: inbox.displayName ?? displayNameFromLocalPart(inbox.localPart), email: address };
  const raw = buildMime({
    from,
    to: payload.to,
    cc: payload.cc,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    messageId: rfcId,
    inReplyTo: payload.inReplyTo,
    references: payload.references,
    date: now,
    headers: { "X-Send0-Inbox": inbox.id },
  });

  // 1. Record the message as queued, in its thread.
  const participants = recipients;
  await db.transaction(async (tx) => {
    let tid = payload.threadId;
    if (!tid) {
      tid = newId("thr");
      await tx.insert(threads).values({
        id: tid,
        orgId: org.id,
        inboxId: inbox.id,
        subject: payload.subject,
        subjectNorm: normalizeSubject(payload.subject),
        participants,
        lastMessageAt: now,
        createdAt: now,
      });
    }
    await tx.insert(messages).values({
      id,
      orgId: org.id,
      inboxId: inbox.id,
      threadId: tid,
      direction: "out",
      status: "queued",
      rfcMessageId: rfcId,
      inReplyTo: payload.inReplyTo ? [payload.inReplyTo] : [],
      references: payload.references,
      from,
      to: payload.to,
      cc: payload.cc,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      extractedText: payload.text,
      size: new TextEncoder().encode(raw).byteLength,
      createdAt: now,
    });
    await tx
      .update(threads)
      .set({
        messageCount: sql`${threads.messageCount} + 1`,
        lastMessageAt: sql`greatest(${threads.lastMessageAt}, ${now.toISOString()}::timestamptz)`,
      })
      .where(eq(threads.id, tid));
  });

  // 2. Hand it to SES. Test keys never send: the message is marked sent without leaving.
  let providerMessageId: string | null = null;
  if (auth.mode === "live") {
    if (!deps.mailer)
      throw new ApiError(
        503,
        "sending_unavailable",
        "Sending isn't configured on this server."
      );
    try {
      ({ providerMessageId } = await deps.mailer.sendRaw({
        from: address,
        recipients,
        raw,
        tags: { msg_id: id, org_id: org.id, inbox_id: inbox.id },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(messages)
        .set({ status: "failed", error: message.slice(0, 500) })
        .where(eq(messages.id, id));
      if (err instanceof MailerError) {
        throw new ApiError(
          err.retryable ? 503 : 502,
          err.retryable ? "send_temporarily_failed" : "send_failed",
          message
        );
      }
      throw err;
    }
  }

  // 3. Sent: record it, count it, tell listeners.
  const [sent] = await db
    .update(messages)
    .set({ status: "sent", providerMessageId, sentAt: now })
    .where(eq(messages.id, id))
    .returning();
  await db
    .insert(usage)
    .values({ orgId: org.id, period: now.toISOString().slice(0, 7), sent: 1 })
    .onConflictDoUpdate({
      target: [usage.orgId, usage.period],
      set: { sent: sql`${usage.sent} + 1` },
    });
  const serialized = serializeMessage(sent!, []);
  await recordEvent(deps, org.id, inbox.id, "message.sent", serialized, now);
  return { kind: "message", message: serialized };
}
