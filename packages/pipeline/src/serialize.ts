import { schema } from "@send0/db";

type MessageRow = typeof schema.messages.$inferSelect;
type AttachmentRow = typeof schema.attachments.$inferSelect;
type ThreadRow = typeof schema.threads.$inferSelect;

export const serializeAttachment = (a: AttachmentRow) => ({
  id: a.id,
  filename: a.filename,
  content_type: a.contentType,
  size: a.size,
  inline: a.inline,
  content_id: a.contentId,
});

/**
 * The public shape of a message, used by the API and in webhook payloads.
 * `html` is left out of events by default to keep webhook bodies small; fetch the message for it.
 */
export function serializeMessage(m: MessageRow, attachments: AttachmentRow[], opts: { includeHtml?: boolean } = {}) {
  return {
    object: "message" as const,
    id: m.id,
    inbox_id: m.inboxId,
    thread_id: m.threadId,
    direction: m.direction,
    status: m.status,
    rfc_message_id: m.rfcMessageId,
    in_reply_to: m.inReplyTo,
    references: m.references,
    from: m.from,
    to: m.to,
    cc: m.cc,
    reply_to: m.replyTo,
    subject: m.subject,
    text: m.text,
    ...(opts.includeHtml ? { html: m.html } : {}),
    extracted_text: m.extractedText,
    extracted: m.extracted
      ? { otp: m.extracted.otp, links: m.extracted.links, action_link: m.extracted.actionLink }
      : null,
    auth: m.auth ? { spf: m.auth.spf, dkim: m.auth.dkim, dmarc: m.auth.dmarc } : null,
    safety: m.safety ? { prompt_injection: m.safety.promptInjection, reasons: m.safety.reasons } : null,
    tag: m.tag,
    attachments: attachments.map(serializeAttachment),
    size: m.size,
    sent_at: m.sentAt?.toISOString() ?? null,
    received_at: m.receivedAt?.toISOString() ?? null,
    created_at: m.createdAt.toISOString(),
  };
}

export const serializeThread = (t: ThreadRow) => ({
  object: "thread" as const,
  id: t.id,
  inbox_id: t.inboxId,
  subject: t.subject,
  participants: t.participants,
  message_count: t.messageCount,
  labels: t.labels,
  last_message_at: t.lastMessageAt.toISOString(),
  created_at: t.createdAt.toISOString(),
});
