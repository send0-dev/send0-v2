import type { BlobStore } from "@send0/adapters/blob";
import { newId, parseInbound, type ParsedMessage } from "@send0/core";
import { checkRecipient } from "./recipient";

/** Cloudflare Email Routing accepts up to 25 MiB per message. */
export const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;

export interface InboundConfig {
  MAIL_DOMAINS: string;
  ALLOWED_INBOXES: string;
  TRUSTED_AUTHSERV_IDS: string;
}

/** The parts of ForwardableEmailMessage we use, so tests can pass a plain object. */
export interface InboundMessage {
  readonly from: string;
  readonly to: string;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  setReject(reason: string): void;
}

export function rawKey(id: string, at: Date): string {
  const d = at.toISOString();
  return `raw/${d.slice(0, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}/${id}.eml`;
}

/** What we log for each accepted message. Bodies are truncated: logs are for debugging, not storage. */
export function summarize(id: string, key: string, inbox: string, tag: string | null, m: ParsedMessage) {
  return {
    event: "message.received",
    id,
    raw_key: key,
    inbox,
    tag,
    rfc_message_id: m.rfcMessageId,
    in_reply_to: m.inReplyTo,
    references: m.references,
    from: m.from,
    to: m.to.map((t) => t.email),
    subject: m.subject,
    subject_norm: m.subjectNorm,
    date: m.date,
    extracted_text: m.extractedText.slice(0, 500),
    extracted: m.extracted,
    auth: m.auth,
    safety: m.safety,
    attachments: m.attachments.map((a) => ({ filename: a.filename, content_type: a.contentType, size: a.size, inline: a.inline })),
    size: m.size,
  };
}

export async function handleEmail(
  message: InboundMessage,
  env: InboundConfig,
  blobs: BlobStore,
  now = new Date(),
): Promise<void> {
  const check = checkRecipient(message.to, env);
  if (!check.ok) {
    console.log(JSON.stringify({ event: "message.rejected", reason: check.reason, to: message.to, from: message.from }));
    message.setReject(check.smtp);
    return;
  }
  if (message.rawSize > MAX_MESSAGE_BYTES) {
    console.log(JSON.stringify({ event: "message.rejected", reason: "too_large", size: message.rawSize, to: message.to }));
    message.setReject("5.3.4 Message too big");
    return;
  }

  const { recipient } = check;
  const id = newId("msg");
  const key = rawKey(id, now);
  const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());

  // Store first: if parsing fails or the Worker dies, the original message is still safe.
  await blobs.put(key, raw, {
    contentType: "message/rfc822",
    metadata: { id, inbox: recipient.address, tag: recipient.tag ?? "", envelope_from: message.from, received_at: now.toISOString() },
  });

  try {
    const parsed = await parseInbound(raw, {
      trustedAuthservIds: env.TRUSTED_AUTHSERV_IDS.split(",").map((s) => s.trim()).filter(Boolean),
    });
    console.log(JSON.stringify(summarize(id, key, recipient.address, recipient.tag, parsed)));
  } catch (err) {
    // The message is accepted and stored; a parse bug must never bounce mail.
    console.error(JSON.stringify({ event: "message.parse_failed", id, raw_key: key, error: String(err) }));
  }
}
