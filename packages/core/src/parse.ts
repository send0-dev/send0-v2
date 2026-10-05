import PostalMime from "postal-mime";
import type { Address, Email } from "postal-mime";
import { parseAuthResults, type AuthResults } from "./auth";
import { extract, type Extracted } from "./extract";
import { hiddenHtmlText, htmlToText, repairCp1252 } from "./html";
import { extractReplyText } from "./reply";
import { detectPromptInjection, type Safety } from "./safety";
import { normalizeSubject } from "./subject";
import { parseMessageIds } from "./threading";

export interface Mailbox {
  name: string | null;
  email: string;
}

export interface AttachmentMeta {
  filename: string | null;
  contentType: string;
  size: number;
  contentId: string | null;
  inline: boolean;
  /** Decoded bytes, for the caller to store. Not serialised into events. */
  content: Uint8Array;
}

export interface ParsedMessage {
  rfcMessageId: string | null;
  inReplyTo: string[];
  references: string[];
  from: Mailbox | null;
  replyTo: Mailbox[];
  to: Mailbox[];
  cc: Mailbox[];
  subject: string;
  subjectNorm: string;
  /** Date header as ISO string, or null if missing/unparseable */
  date: string | null;
  text: string;
  html: string | null;
  /** New text only: quoted history, forwards and signatures removed */
  extractedText: string;
  extracted: Extracted;
  auth: AuthResults;
  safety: Safety;
  attachments: AttachmentMeta[];
  /** Raw size in bytes */
  size: number;
}

export interface ParseOptions {
  /** authserv-ids of the MTAs that receive our mail, e.g. ["mx.cloudflare.net", "amazonses.com"] */
  trustedAuthservIds: string[];
}

function mailboxes(list: Address[] | Address | undefined): Mailbox[] {
  const arr = Array.isArray(list) ? list : list ? [list] : [];
  const out: Mailbox[] = [];
  for (const a of arr) {
    if (a.group) for (const m of a.group) out.push({ name: m.name || null, email: m.address.toLowerCase() });
    else if (a.address) out.push({ name: a.name || null, email: a.address.toLowerCase() });
  }
  return out;
}

function toBytes(content: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof content === "string") return new TextEncoder().encode(content);
  return content instanceof Uint8Array ? content : new Uint8Array(content);
}

function isoDate(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function parseInbound(raw: ArrayBuffer | Uint8Array | string, opts: ParseOptions): Promise<ParsedMessage> {
  const size = typeof raw === "string" ? new TextEncoder().encode(raw).byteLength : raw.byteLength;
  const email: Email = await PostalMime.parse(raw, { attachmentEncoding: "arraybuffer" });

  const html = email.html ? repairCp1252(email.html) : null;
  const text = email.text?.trim() ? repairCp1252(email.text) : html ? htmlToText(html) : "";
  const subject = repairCp1252(email.subject ?? "");
  const extractedText = extractReplyText(text);

  return {
    rfcMessageId: parseMessageIds(email.messageId)[0] ?? null,
    inReplyTo: parseMessageIds(email.inReplyTo),
    references: parseMessageIds(email.references),
    from: mailboxes(email.from)[0] ?? null,
    replyTo: mailboxes(email.replyTo),
    to: mailboxes(email.to),
    cc: mailboxes(email.cc),
    subject,
    subjectNorm: normalizeSubject(subject),
    date: isoDate(email.date),
    text,
    html,
    extractedText,
    // Extract from the new text first so a code in quoted history doesn't win; fall back to the full body.
    extracted: (() => {
      const fromReply = extract(extractedText, html, subject);
      return fromReply.otp ? fromReply : { ...fromReply, otp: extract(text, null, subject).otp };
    })(),
    auth: parseAuthResults(email.headers, opts.trustedAuthservIds),
    safety: detectPromptInjection(`${subject}\n${text}`, html ? hiddenHtmlText(html) : ""),
    attachments: email.attachments.map((a) => {
      const content = toBytes(a.content);
      return {
        filename: a.filename,
        contentType: a.mimeType,
        size: content.byteLength,
        contentId: a.contentId ?? null,
        inline: a.disposition === "inline" || !!a.related,
        content,
      };
    }),
    size,
  };
}
