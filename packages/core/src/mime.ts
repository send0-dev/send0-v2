import { htmlToText } from "./html";

export interface MimeAddress {
  name?: string | null;
  email: string;
}

export interface OutgoingMessage {
  from: MimeAddress;
  to: MimeAddress[];
  cc?: MimeAddress[];
  replyTo?: MimeAddress[];
  subject: string;
  text?: string | null;
  html?: string | null;
  /** Full Message-ID with angle brackets, e.g. <msg_…@send0.email> */
  messageId: string;
  inReplyTo?: string | null;
  references?: string[];
  date?: Date;
  /** Extra headers, e.g. X-Send0-Inbox. Never From/To/Subject/etc. */
  headers?: Record<string, string>;
}

const CRLF = "\r\n";
const enc = new TextEncoder();

const isAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** RFC 2047 encoded-word (UTF-8, base64), split so each word stays under 75 chars. */
export function encodeHeaderValue(value: string): string {
  if (isAscii(value)) return value;
  const words: string[] = [];
  let chunk = "";
  for (const ch of value) {
    if (enc.encode(chunk + ch).length > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${base64(enc.encode(w))}?=`).join(`${CRLF} `);
}

export function formatAddress(a: MimeAddress): string {
  if (!a.name) return a.email;
  const name = isAscii(a.name) ? `"${a.name.replace(/(["\\])/g, "\\$1")}"` : encodeHeaderValue(a.name);
  return `${name} <${a.email}>`;
}

/** Folds a long structured header (address lists, References) at commas/spaces. */
function fold(name: string, items: string[], sep: string): string {
  const lines: string[] = [];
  let line = `${name}: `;
  items.forEach((item, i) => {
    const piece = item + (i < items.length - 1 ? sep : "");
    if (line.length + piece.length > 76 && line.trim() !== `${name}:`) {
      lines.push(line.trimEnd());
      line = " ";
    }
    line += piece;
  });
  lines.push(line);
  return lines.join(CRLF);
}

/**
 * Quoted-printable (RFC 2045) for UTF-8 text. Readable text in base64 is a spam-filter signal
 * (e.g. SpamAssassin MIME_BASE64_TEXT); QP is what mainstream mail clients send.
 */
export function encodeQuotedPrintable(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return lines
    .map((line) => {
      let encoded = "";
      for (const byte of enc.encode(line)) {
        const ch = String.fromCharCode(byte);
        encoded += (byte >= 33 && byte <= 126 && ch !== "=") || byte === 32 || byte === 9 ? ch : `=${byte.toString(16).toUpperCase().padStart(2, "0")}`;
      }
      // Trailing whitespace must be encoded or it may be stripped in transit.
      encoded = encoded.replace(/[ \t]$/, (ws) => `=${ws.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
      // Soft line breaks: at most 76 chars per line, never splitting an =XX escape.
      const out: string[] = [];
      while (encoded.length > 76) {
        let cut = 75;
        const esc = encoded.lastIndexOf("=", cut);
        if (esc > cut - 3) cut = esc;
        out.push(`${encoded.slice(0, cut)}=`);
        encoded = encoded.slice(cut);
      }
      out.push(encoded);
      return out.join(CRLF);
    })
    .join(CRLF);
}

function part(contentType: string, body: string): string {
  return `Content-Type: ${contentType}; charset=utf-8${CRLF}Content-Transfer-Encoding: quoted-printable${CRLF}${CRLF}${encodeQuotedPrintable(body)}`;
}

/** Wraps an HTML fragment in a minimal document; complete documents are left alone. */
export function wrapHtml(html: string): string {
  if (/<html[\s>]/i.test(html)) return html;
  return `<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
}

/** "procurement-agent" → "Procurement Agent": a friendly default display name for an inbox. */
export function displayNameFromLocalPart(localPart: string): string {
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/** RFC 5322 date in UTC: "Mon, 05 Oct 2026 10:14:03 +0000" */
export function rfc5322Date(d: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${days[d.getUTCDay()]}, ${p(d.getUTCDate())} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
}

const FORBIDDEN_EXTRA = /^(from|to|cc|bcc|subject|date|message-id|in-reply-to|references|mime-version|content-type|content-transfer-encoding|reply-to|sender|return-path)$/i;

/**
 * Builds a complete RFC 5322 message. Bcc is never written to headers: pass it to the
 * transport as envelope recipients only.
 */
export function buildMime(m: OutgoingMessage): string {
  if (!m.text && !m.html) throw new Error("A message needs text, html or both.");
  const clean = (v: string) => v.replace(/[\r\n]+/g, " ");
  const headers: string[] = [
    `From: ${formatAddress(m.from)}`,
    fold("To", m.to.map(formatAddress), ", "),
    ...(m.cc?.length ? [fold("Cc", m.cc.map(formatAddress), ", ")] : []),
    ...(m.replyTo?.length ? [fold("Reply-To", m.replyTo.map(formatAddress), ", ")] : []),
    `Subject: ${encodeHeaderValue(clean(m.subject))}`,
    `Date: ${rfc5322Date(m.date ?? new Date())}`,
    `Message-ID: ${m.messageId}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`] : []),
    ...(m.references?.length ? [fold("References", m.references, " ")] : []),
    "MIME-Version: 1.0",
  ];
  for (const [k, v] of Object.entries(m.headers ?? {})) {
    if (FORBIDDEN_EXTRA.test(k) || !/^[A-Za-z0-9-]+$/.test(k)) throw new Error(`Header ${k} can't be set here.`);
    headers.push(`${k}: ${encodeHeaderValue(clean(v))}`);
  }

  // Always send a text part: HTML-only mail scores worse with spam filters.
  const html = m.html ? wrapHtml(m.html) : null;
  const text = m.text ?? (html ? htmlToText(html) : null);

  let body: string;
  if (text && html) {
    const boundary = `=_send0_${base64(crypto.getRandomValues(new Uint8Array(12))).replace(/[+/=]/g, "")}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [`--${boundary}`, part("text/plain", text), `--${boundary}`, part("text/html", html), `--${boundary}--`, ""].join(CRLF);
  } else {
    const [type, content] = ["text/plain", text!];
    const p = part(type, content);
    const split = p.indexOf(CRLF + CRLF);
    headers.push(...p.slice(0, split).split(CRLF));
    body = p.slice(split + 4);
  }
  return headers.join(CRLF) + CRLF + CRLF + body + CRLF;
}

/** "Re: " unless the subject already is a reply. */
export function replySubject(subject: string): string {
  return /^\s*re\s*:/i.test(subject) ? subject : `Re: ${subject}`;
}

/** "Fwd: " unless already forwarded. */
export function forwardSubject(subject: string): string {
  return /^\s*(fwd?|fw)\s*:/i.test(subject) ? subject : `Fwd: ${subject}`;
}

/** References for a reply: the parent's references plus the parent itself, newest last, capped. */
export function replyReferences(parentReferences: string[], parentMessageId: string | null): string[] {
  const refs = [...parentReferences, ...(parentMessageId ? [parentMessageId] : [])];
  const unique = [...new Set(refs)];
  // Keep the root and the most recent ids; mail clients only need those to thread.
  return unique.length > 20 ? [unique[0]!, ...unique.slice(-19)] : unique;
}
